// Enemy entity + AI state machine (data-driven via config).
import Phaser from "phaser";
import { BOSS, COMBAT, ELITE, type EnemyDef } from "./config";
import { resolveAnim } from "./assets";

export type EnemyState = "IDLE" | "PATROL" | "DETECT_PLAYER" | "CHASE" | "ATTACK" | "HURT" | "STUN" | "KNOCKBACK" | "DEAD";

export interface EnemyHost extends Phaser.Scene {
  player: Phaser.Physics.Arcade.Sprite;
  playerDead(): boolean;
  enemyAttackHit(e: Enemy, dmg: number): void;
  bossPhaseChanged(e: Enemy, phase: number): void;
  bossSummon(e: Enemy): void;
  bossShockwave(e: Enemy): void;
  playAudio(name: "bossAttack"): void;
}

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  def: EnemyDef;
  kind: string;
  elite: boolean;
  hp: number;
  maxHp: number;
  damage: number;
  speed: number;
  override state: EnemyState = "IDLE";
  stateUntil = 0;
  attackReadyAt = 0;
  hitDone = false;
  home: number;
  patrolDir = 1;
  stopDist: number;
  bar: Phaser.GameObjects.Graphics;
  aura?: Phaser.GameObjects.Particles.ParticleEmitter;
  phase = 1;
  lungeAt = 0;
  lunging = 0;
  summonAt = 0;
  waveId: number;
  host: EnemyHost;
  t0 = Math.random() * 1000;
  rewarded = false;
  detect: number;

  constructor(host: EnemyHost, x: number, y: number, kind: string, def: EnemyDef, opts: { elite: boolean; hpMul: number; dmgMul: number; spdMul: number; waveId: number; aggro?: boolean }) {
    super(host, x, y, def.sheet.key === "nightborne" ? "nightborne" : (resolveAnim(host, def, "idle") ?? "__MISSING"), 0);
    this.host = host;
    this.def = def;
    this.kind = kind;
    this.elite = opts.elite;
    this.waveId = opts.waveId;
    const em = opts.elite ? ELITE : { HP_MULT: 1, DMG_MULT: 1, SPEED_MULT: 1 };
    this.maxHp = this.hp = Math.round(def.health * opts.hpMul * em.HP_MULT);
    this.damage = Math.round(def.damage * opts.dmgMul * em.DMG_MULT);
    this.speed = def.speed * opts.spdMul * em.SPEED_MULT;
    this.home = x;
    this.detect = opts.aggro ? Math.max(def.detect, 1400) : def.detect;
    this.stopDist = def.range * Phaser.Math.FloatBetween(0.55, 0.8);
    host.add.existing(this);
    host.physics.add.existing(this);
    this.setScale(def.scale * (opts.elite ? ELITE.SCALE : 1)).setDepth(5);
    this.body!.setSize(def.body[0], def.body[1]).setOffset(def.body[2], def.body[3]);
    if (def.fly) (this.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    this.bar = host.add.graphics().setDepth(10);
    if (opts.elite) {
      this.setTint(0xffc46b);
      this.aura = host.add.particles(0, 0, "dot", { follow: this, followOffset: { x: 0, y: 6 }, lifespan: 600, speedY: { min: -40, max: -15 }, x: { min: -12, max: 12 }, scale: { start: 0.5, end: 0 }, tint: [0xffb13b, 0xff5a2a], blendMode: "ADD", frequency: 50 }).setDepth(4);
    }
    this.playRole("idle");
    this.on("animationupdate", (_a: unknown, f: Phaser.Animations.AnimationFrame) => {
      if (this.state === "ATTACK" && !this.hitDone && f.index >= def.hitFrame) {
        this.hitDone = true;
        this.resolveAttack();
      }
    });
    this.on("animationcomplete", (a: Phaser.Animations.Animation) => {
      if (a.key === def.anims.death) return;
      if (this.state === "ATTACK" && a.key === def.anims.attack) this.setState2("CHASE");
    });
  }

  playRole(role: keyof EnemyDef["anims"], ignoreIfPlaying = true) {
    const k = resolveAnim(this.host, this.def, role);
    if (k) this.play(k, ignoreIfPlaying);
  }

  setState2(s: EnemyState, dur = 0) {
    this.state = s;
    this.stateUntil = this.host.time.now + dur;
  }

  get isBoss() {
    return this.def.tier === "boss";
  }
  get alive() {
    return this.state !== "DEAD";
  }

  resolveAttack() {
    const p = this.host.player;
    const dx = p.x - this.x;
    const reach = this.def.range * (this.isBoss ? 1.6 : 1.3) * (this.elite ? 1.15 : 1);
    if (this.isBoss) {
      this.host.cameras.main.shake(140, 0.006);
      this.host.playAudio("bossAttack");
      if (this.phase >= 3) this.host.bossShockwave(this);
    }
    if (Math.abs(dx) < reach && Math.sign(dx || 1) === (this.flipX ? -1 : 1) && Math.abs(p.y - this.y) < 50 * this.def.scale) this.host.enemyAttackHit(this, this.damage);
  }

  /** Called by combat when the player lands a hit. */
  takeHit(dmg: number, dir: number, heavy: boolean, kbResist = 0) {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - dmg);
    this.setTintFill(0xffffff);
    this.host.time.delayedCall(70, () => {
      if (!this.active) return;
      this.clearTint();
      if (this.elite) this.setTint(0xffc46b);
      if (this.isBoss && this.phase >= 3) this.setTint(0xff7a7a);
    });
    if (this.hp <= 0) return;
    const kb = this.isBoss ? 30 : (heavy ? COMBAT.HEAVY_KNOCKBACK : COMBAT.KNOCKBACK) * (this.elite ? 0.5 : 1) * (1 - kbResist);
    this.setVelocityX(dir * kb);
    if (!this.def.fly && !this.isBoss) this.setVelocityY(heavy ? -170 : -60);
    // bosses and attacking elites have super armor
    if (this.isBoss || (this.elite && this.state === "ATTACK")) {
      this.checkPhase();
      return;
    }
    this.setState2(heavy ? "KNOCKBACK" : "HURT", COMBAT.ENEMY_HITSTUN);
    this.playRole("hurt", false);
  }

  stun(ms: number) {
    if (!this.alive) return;
    this.setState2("STUN", ms);
    this.setVelocityX(0);
    this.playRole("hurt", false);
    this.anims.pause();
    this.host.time.delayedCall(Math.min(ms, 400), () => this.active && this.anims.resume());
  }

  checkPhase() {
    const r = this.hp / this.maxHp;
    const want = r <= BOSS.PHASES[1]! ? 3 : r <= BOSS.PHASES[0]! ? 2 : 1;
    if (want > this.phase) {
      this.phase = want;
      if (want === 3) this.setTint(0xff7a7a);
      this.host.bossPhaseChanged(this, want);
      this.setState2("STUN", 700);
      this.setVelocityX(0);
      this.playRole("idle");
    }
  }

  die() {
    this.state = "DEAD";
    this.bar.clear();
    this.aura?.stop();
    this.setVelocity(0, -80);
    (this.body as Phaser.Physics.Arcade.Body).setAllowGravity(true);
    const k = resolveAnim(this.host, this.def, "death");
    if (k && k === this.def.anims.death) this.play(k, true);
    this.once("animationcomplete", () => this.fadeOut());
    this.host.time.delayedCall(2500, () => this.fadeOut());
  }

  private fading = false;
  fadeOut() {
    if (this.fading || !this.active) return;
    this.fading = true;
    this.host.tweens.add({ targets: this, alpha: 0, duration: 500, delay: 300, onComplete: () => this.cleanup() });
  }

  cleanup() {
    this.bar.destroy();
    this.aura?.destroy();
    this.destroy();
  }

  ai(time: number) {
    if (!this.alive) return;
    const body = this.body as Phaser.Physics.Arcade.Body;
    const p = this.host.player;
    const dx = p.x - this.x;
    const dy = p.y - this.y;
    const dist = Math.abs(dx);
    const playerDead = this.host.playerDead();

    // HP bar
    this.bar.clear();
    if (this.hp < this.maxHp && !this.isBoss) {
      const w = this.elite ? 36 : 28;
      this.bar.fillStyle(0x140808, 0.85).fillRect(this.x - w / 2, body.y - 8, w, 4);
      this.bar.fillStyle(this.elite ? 0xffb13b : 0xd8323c, 1).fillRect(this.x - w / 2 + 1, body.y - 7, (w - 2) * (this.hp / this.maxHp), 2);
    }

    if (this.def.fly) {
      const ty = p.y - 18 + Math.sin((time + this.t0) / 300) * 10;
      body.setVelocityY(this.state === "HURT" || this.state === "KNOCKBACK" ? body.velocity.y * 0.9 : (ty - this.y) * 1.6);
    }

    const enrage = this.isBoss && this.phase >= 3;
    const spd = this.speed * (enrage ? BOSS.ENRAGE_SPEED_MULT : 1);

    switch (this.state) {
      case "HURT":
      case "KNOCKBACK":
      case "STUN":
        body.setVelocityX(body.velocity.x * 0.86);
        if (time >= this.stateUntil) this.setState2("CHASE");
        return;
      case "ATTACK":
        body.setVelocityX(this.isBoss && !this.hitDone ? (this.flipX ? -1 : 1) * 60 : body.velocity.x * 0.8);
        return;
    }

    // boss lunge (phase 2+)
    if (this.isBoss && this.lunging) {
      if (time > this.lunging) {
        this.lunging = 0;
        this.clearTint();
        if (enrage) this.setTint(0xff7a7a);
      } else {
        body.setVelocityX((this.flipX ? -1 : 1) * BOSS.LUNGE_SPEED);
        if (dist < 26 && Math.abs(dy) < 50) this.host.enemyAttackHit(this, Math.round(this.damage * 0.8));
        return;
      }
    }

    if (playerDead) {
      body.setVelocityX(0);
      this.playRole("idle");
      return;
    }

    // boss summons (enrage)
    if (enrage && time > this.summonAt) {
      this.summonAt = time + BOSS.SUMMON_INTERVAL;
      this.host.bossSummon(this);
    }

    const canSee = dist < this.detect && Math.abs(dy) < 130;
    if (!canSee) {
      // PATROL
      this.state = "PATROL";
      if (Math.abs(this.x - this.home) > 60 || body.blocked.left || body.blocked.right) this.patrolDir = this.x > this.home ? -1 : 1;
      body.setVelocityX(this.patrolDir * spd * 0.35);
      this.setFlipX(this.patrolDir < 0);
      this.playRole("move");
      return;
    }
    if (this.state === "PATROL" || this.state === "IDLE") {
      this.setState2("DETECT_PLAYER", 220);
      this.setFlipX(dx < 0);
      body.setVelocityX(0);
      this.playRole("idle");
      return;
    }
    if (this.state === "DETECT_PLAYER" && time < this.stateUntil) return;
    this.state = "CHASE";
    this.setFlipX(dx < 0);

    // boss / elite dash attack
    const lungeCd = this.isBoss ? BOSS.LUNGE_COOLDOWN : ELITE.DASH_COOLDOWN;
    if ((this.isBoss ? this.phase >= 2 : this.elite && !this.def.fly) && dist > 90 && dist < 260 && time > this.lungeAt) {
      this.lungeAt = time + lungeCd;
      body.setVelocityX(0);
      this.setTintFill(0xffffff);
      this.setState2("STUN", 380); // telegraph
      this.host.time.delayedCall(380, () => {
        if (!this.alive) return;
        this.clearTint();
        this.lunging = this.host.time.now + (this.isBoss ? 380 : 260);
        this.state = "CHASE";
        this.playRole("move", false);
      });
      return;
    }

    const cdMul = enrage ? BOSS.ENRAGE_COOLDOWN_MULT : 1;
    if (dist < this.def.range && Math.abs(dy) < 40 * this.def.scale && time >= this.attackReadyAt) {
      this.setState2("ATTACK");
      this.hitDone = false;
      this.attackReadyAt = time + this.def.attackCooldown * cdMul * (this.elite ? 0.8 : 1);
      body.setVelocityX(0);
      if (!this.host.anims.exists(this.def.anims.attack)) {
        this.hitDone = true;
        this.resolveAttack();
        this.setState2("CHASE");
      } else this.play(this.def.anims.attack, false);
      return;
    }
    if (dist < this.stopDist) {
      body.setVelocityX(0);
      this.playRole("idle");
    } else {
      body.setVelocityX(Math.sign(dx) * spd);
      this.playRole("move");
    }
    if (!this.def.fly && body.blocked.down && (body.blocked.left || body.blocked.right)) body.setVelocityY(-320);
  }
}

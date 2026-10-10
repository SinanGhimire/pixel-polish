import { heroById } from "./heroes";
import { SaveManager } from "./save";
// PlayerController — movement, combo attacks, dash, block/parry, special.
import Phaser from "phaser";
import { COMBAT, PLAYER, SPECIAL } from "./config";
import type { AudioEvent } from "./audio";
import type { Stats } from "./rules";

export type PInput = {
  left: boolean;
  right: boolean;
  jumpPressed: boolean;
  jumpHeld: boolean;
  attack: boolean;
  dash: boolean;
  block: boolean;
  special: boolean;
};
export type PState = "FREE" | "ATTACK" | "DASH" | "HURT" | "BLOCK" | "SPECIAL" | "DEAD";

export interface PlayerHost extends Phaser.Scene {
  stats: Stats;
  special: number;
  heroHitFrame(key: string): void;
  doSpecial(): void;
  playAudio(e: AudioEvent): void;
  dustAt(x: number, y: number, n: number): void;
  onPlayerDied(): void;
}

export class Player {
  s: Phaser.Physics.Arcade.Sprite;
  state: PState = "FREE";
  step = 0; // current combo step 1..3
  queued = false;
  comboWindowUntil = 0;
  attackCdUntil = 0;
  facing = 1;
  lastGround = 0;
  jumpBuf = -9999;
  jumps = 0;
  invulnUntil = 0;
  dashCdUntil = 0;
  wasGround = true;
  blockStart = 0;
  hitFrameDone = false;
  shield: Phaser.GameObjects.Graphics;

  constructor(private host: PlayerHost, x: number, y: number) {
    this.s = host.physics.add.sprite(x, y, "hero", 0).setDepth(6);
    const b = heroById(SaveManager.loadMeta().hero).body;
    this.s.body!.setSize(b[0], b[1]).setOffset(b[2], b[3]);
    (this.s.body as Phaser.Physics.Arcade.Body).setMaxVelocity(600, 700);
    this.s.play("h_idle");
    this.shield = host.add.graphics().setDepth(7).setBlendMode(Phaser.BlendModes.ADD);
    this.s.on("animationupdate", (a: Phaser.Animations.Animation, f: Phaser.Animations.AnimationFrame) => {
      const atk = a.key.startsWith("h_attack") || a.key === "h_air-attack1";
      if (atk && f.index >= Math.max(3, Math.round(a.frames.length * 0.4)) && !this.hitFrameDone) {
        this.hitFrameDone = true;
        host.heroHitFrame(a.key);
      }
    });
    this.s.on("animationcomplete", (a: Phaser.Animations.Animation) => this.onAnimDone(a.key));
  }

  get isAttacking() {
    return this.state === "ATTACK";
  }
  get blocking() {
    return this.state === "BLOCK";
  }
  get invulnerable() {
    return this.state === "DASH" || this.state === "SPECIAL" || this.host.time.now < this.invulnUntil;
  }
  isParry(time: number) {
    return this.state === "BLOCK" && time - this.blockStart <= COMBAT.PARRY_WINDOW;
  }

  private startSwing(step: number, air: boolean) {
    this.state = "ATTACK";
    this.step = step;
    this.hitFrameDone = false;
    this.queued = false;
    this.s.anims.timeScale = this.host.stats.atkSpeed;
    this.s.play(air ? "h_air-attack1" : "h_attack" + step, true);
    if (!air && step > 1) this.s.setVelocityX(this.facing * 90);
    this.host.playAudio("playerAttack");
  }

  tryAttack(time: number) {
    if (this.state === "DEAD" || this.state === "HURT" || this.state === "DASH" || this.state === "SPECIAL") return;
    if (this.state === "ATTACK") {
      // only buffer the next swing once the current hit has come out
      if (this.hitFrameDone) this.queued = true;
      return;
    }
    if (time < this.attackCdUntil) return;
    const ground = this.s.body!.blocked.down;
    const next = ground && time < this.comboWindowUntil && this.step < 3 ? this.step + 1 : 1;
    this.startSwing(next, !ground);
  }

  private onAnimDone(key: string) {
    if (key.startsWith("h_attack") || key === "h_air-attack1") {
      const t = this.host.time.now;
      this.s.anims.timeScale = 1;
      if (this.queued && this.step < 3 && key !== "h_air-attack1" && this.s.body!.blocked.down) {
        this.startSwing(this.step + 1, false);
        return;
      }
      this.state = "FREE";
      this.queued = false;
      if (this.step >= 3 || key === "h_air-attack1") {
        this.step = 0;
        this.attackCdUntil = t + COMBAT.ATTACK_COOLDOWN;
      } else this.comboWindowUntil = t + COMBAT.COMBO_WINDOW;
    }
    if (key === "h_hurt" && this.state === "HURT") this.state = "FREE";
    if (key === "h_die") this.host.onPlayerDied();
  }

  hurt(fromX: number, died: boolean) {
    this.invulnUntil = this.host.time.now + PLAYER.IFRAMES;
    const dir = Math.sign(this.s.x - fromX) || 1;
    const kb = COMBAT.PLAYER_KNOCKBACK * (1 - this.host.stats.kbResist);
    this.s.setVelocity(dir * kb, -kb);
    this.s.setTintFill(0xff4040);
    this.host.time.delayedCall(90, () => this.s.active && this.s.clearTint());
    this.step = 0;
    this.s.anims.timeScale = 1;
    if (died) {
      this.state = "DEAD";
      this.s.play("h_die", true);
    } else {
      this.state = "HURT";
      this.s.play("h_hurt", true);
    }
  }

  blockFeedback(fromX: number) {
    const dir = Math.sign(this.s.x - fromX) || 1;
    this.s.setVelocityX(dir * 120);
  }

  update(time: number, inp: PInput) {
    const p = this.s;
    const body = p.body as Phaser.Physics.Arcade.Body;
    const st = this.host.stats;
    this.shield.clear();
    if (this.state === "DEAD") {
      body.setVelocityX(body.velocity.x * 0.9);
      p.setAlpha(1);
      return;
    }
    const onGround = body.blocked.down;
    if (onGround) {
      this.lastGround = time;
      this.jumps = 0;
      if (!this.wasGround) {
        this.host.dustAt(p.x, p.y + 18, 6);
        this.host.playAudio("land");
      }
    }
    this.wasGround = onGround;
    p.setAlpha(time < this.invulnUntil && this.state !== "SPECIAL" ? (Math.floor(time / 60) % 2 ? 0.45 : 1) : 1);

    if (inp.jumpPressed) this.jumpBuf = time;
    if (inp.attack) this.tryAttack(time);

    // SPECIAL
    if (inp.special && this.host.special >= SPECIAL.MAX && (this.state === "FREE" || this.state === "ATTACK" || this.state === "BLOCK")) {
      this.state = "SPECIAL";
      p.anims.timeScale = 1;
      p.play("h_smrslt", true);
      body.setVelocity(0, -260);
      this.host.time.delayedCall(320, () => {
        this.host.doSpecial();
        this.host.time.delayedCall(180, () => this.state === "SPECIAL" && (this.state = "FREE"));
      });
      return;
    }
    if (this.state === "SPECIAL") return;

    // DASH (cancels attack recovery once the hit is out)
    if (inp.dash && time > this.dashCdUntil && (this.state === "FREE" || this.state === "BLOCK" || (this.state === "ATTACK" && this.hitFrameDone))) {
      const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      if (dir) this.facing = dir;
      p.setFlipX(this.facing < 0);
      this.state = "DASH";
      this.dashCdUntil = time + PLAYER.DASH_COOLDOWN;
      p.anims.timeScale = 1;
      p.play("h_slide", true);
      body.setAllowGravity(false);
      p.setVelocity(this.facing * PLAYER.DASH_SPEED, 0);
      this.host.playAudio("dash");
      const ghosts = this.host.time.addEvent({
        delay: 30,
        repeat: 5,
        callback: () => {
          const gh = this.host.add.image(p.x, p.y, "hero", p.frame.name).setFlipX(p.flipX).setTint(0x9fe6ff).setAlpha(0.5).setBlendMode("ADD").setDepth(5);
          this.host.tweens.add({ targets: gh, alpha: 0, duration: 260, onComplete: () => gh.destroy() });
        },
      });
      this.host.time.delayedCall(PLAYER.DASH_TIME, () => {
        ghosts.remove();
        body.setAllowGravity(true);
        if (this.state === "DASH") {
          this.state = "FREE";
          p.setVelocityX(this.facing * st.speed);
        }
      });
    }
    if (this.state === "DASH" || this.state === "HURT") return;

    // BLOCK
    if (inp.block && onGround && (this.state === "FREE" || this.state === "BLOCK")) {
      if (this.state !== "BLOCK") {
        this.state = "BLOCK";
        this.blockStart = time;
        p.play("h_crouch", true);
      }
      body.setVelocityX(body.velocity.x * 0.6);
      const parry = this.isParry(time);
      this.shield.lineStyle(parry ? 3 : 2, parry ? 0xffffff : 0x8fd8ff, parry ? 0.9 : 0.55);
      this.shield.beginPath();
      this.shield.arc(p.x + this.facing * 4, p.y + 4, 18, this.facing > 0 ? -1.1 : Math.PI - 1.1 + 0.0, this.facing > 0 ? 1.1 : Math.PI + 1.1);
      this.shield.strokePath();
      const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      if (dir) {
        this.facing = dir;
        p.setFlipX(dir < 0);
      }
      return;
    }
    if (this.state === "BLOCK") this.state = "FREE";

    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (this.state === "ATTACK") {
      body.setVelocityX(onGround ? body.velocity.x * 0.82 : dir * st.speed * 0.7);
    } else {
      const target = dir * st.speed;
      const k = onGround ? (dir ? PLAYER.ACCELERATION : PLAYER.DECELERATION) : PLAYER.AIR_CONTROL;
      body.setVelocityX(Phaser.Math.Linear(body.velocity.x, target, k));
      if (dir) {
        this.facing = dir;
        p.setFlipX(dir < 0);
      }
    }

    // JUMP: coyote + buffer + double jump
    if (time - this.jumpBuf < PLAYER.JUMP_BUFFER_TIME && this.state !== "ATTACK") {
      if (time - this.lastGround < PLAYER.COYOTE_TIME && this.jumps === 0) {
        body.setVelocityY(-PLAYER.JUMP_FORCE);
        this.jumps = 1;
        this.jumpBuf = -9999;
        this.lastGround = -9999;
        this.host.dustAt(p.x, p.y + 18, 5);
        this.host.playAudio("jump");
      } else if (this.jumps < 2 && !onGround) {
        body.setVelocityY(-PLAYER.DOUBLE_JUMP_FORCE);
        this.jumps = 2;
        this.jumpBuf = -9999;
        p.play("h_smrslt", true);
        this.host.playAudio("jump");
      }
    }
    if (!inp.jumpHeld && body.velocity.y < -120) body.setVelocityY(body.velocity.y * 0.85);

    if (this.state === "FREE") {
      const cur = p.anims.currentAnim?.key;
      if (!onGround) {
        if (!(cur === "h_smrslt" && body.velocity.y < 60)) p.play(body.velocity.y < 0 ? "h_jump" : "h_fall", true);
      } else if (Math.abs(body.velocity.x) > 20) {
        p.play("h_run", true);
        if (Math.random() < 0.08) this.host.dustAt(p.x - this.facing * 6, p.y + 18, 1);
      } else p.play("h_idle", true);
    }
  }
}

// ArenaScene — game state machine, combat, rewards, waves and boss orchestration.
import Phaser from "phaser";
import { BOSS, COMBAT, COMBO, DROPS, ECHO, ELITE, ENEMIES, MAPS, PERKS, PORTAL, SHOP_ITEMS, SPECIAL, VIEW, WAVES } from "./config";
import { Echo, type EchoHost } from "./Echo";
import { EchoRecorder } from "./echoTimeline";
import { AudioManager, type AudioEvent } from "./audio";
import { loadMap, makeProceduralTextures, preloadAssets, registerAnimations } from "./assets";
import { Enemy, type EnemyHost } from "./Enemy";
import { Player, type PInput, type PlayerHost } from "./Player";
import { WaveManager } from "./WaveManager";
import { soulsForRun, addXp, applyUpgrade, comboMultiplier, freshStats, heal, pickUpgrades, resolveIncoming, waveScaling, xpForLevel, type Stats } from "./rules";
import { SaveManager, type Settings } from "./save";
import { heroById } from "./heroes";
import { parallaxLayout } from "./parallax";

export type GameState = "PLAYING" | "PAUSED" | "WAVE_TRANSITION" | "LEVEL_UP" | "SHOP" | "BOSS_INTRO" | "BOSS_FIGHT" | "PORTAL" | "GAME_OVER";
export type TouchInput = { left: boolean; right: boolean; jump: boolean; attack: boolean; dash: boolean; block: boolean; special: boolean };

const T = VIEW.TILE;
const ROWS = VIEW.ROWS;
const COLS = 90;

export class ArenaScene extends Phaser.Scene implements EnemyHost, EchoHost {
  echoes: Echo[] = [];
  echoRec!: EchoRecorder;
  echoCount = 0;
  portal: Phaser.GameObjects.Container | undefined;
  portalNext = 0;
  transitioning = false;
  clickAttack = false;
  bus!: Phaser.Events.EventEmitter;
  audio!: AudioManager;
  settings!: Settings;
  stats!: Stats;
  hero!: Player;
  player!: Phaser.Physics.Arcade.Sprite;
  enemies!: Phaser.GameObjects.Group;
  coins!: Phaser.Physics.Arcade.Group;
  potions!: Phaser.Physics.Arcade.Group;
  hazards!: Phaser.Physics.Arcade.Group;
  layer!: Phaser.Tilemaps.TilemapLayer;
  heights: number[] = [];
  waves!: WaveManager;
  mode: GameState = "WAVE_TRANSITION";
  prevMode: GameState = "PLAYING";
  special = 0;
  coinCount = 0;
  runCoins = 0;
  kills = 0;
  score = 0;
  comboHits = 0;
  bestCombo = 0;
  lastHitAt = 0;
  pendingLevels = 0;
  rageWave = -1;
  boss: Enemy | undefined;
  bossSpawned = new Set<number>();
  hitstopUntil = 0;
  bgs: Phaser.GameObjects.TileSprite[] = [];
  mapObjects: Phaser.GameObjects.GameObject[] = [];
  mapColliders: Phaser.Physics.Arcade.Collider[] = [];
  mapIndex = 0;
  dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  ambient!: Phaser.GameObjects.Particles.ParticleEmitter;
  darken!: Phaser.GameObjects.Rectangle;
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  prevTouch: TouchInput = { left: false, right: false, jump: false, attack: false, dash: false, block: false, special: false };
  debugText?: Phaser.GameObjects.Text;
  hitThisSwing = new Set<Enemy>();
  hudDirty = true;

  constructor() {
    super("arena");
  }

  init() {
    this.bus = this.game.registry.get("bus");
    this.settings = SaveManager.loadSettings();
    this.stats = freshStats();
    {
      // permanent perks + chosen hero
      const meta = SaveManager.loadMeta();
      const hero = heroById(meta.hero);
      this.stats.maxHp += meta.perks.vitality * PERKS.vitality.per + hero.hp;
      this.stats.hp = this.stats.maxHp;
      this.stats.damage += meta.perks.might * PERKS.might.per + hero.damage;
      this.stats.speed += meta.perks.swiftness * PERKS.swiftness.per;
    }
    Object.assign(this, { special: 0, coinCount: 0, runCoins: 0, kills: 0, score: 0, comboHits: 0, bestCombo: 0, pendingLevels: 0, rageWave: -1, boss: undefined, hitstopUntil: 0, bgs: [], mapObjects: [], mapColliders: [], mapIndex: 0, mode: "WAVE_TRANSITION", echoes: [], echoCount: 0, portal: undefined, transitioning: false, clickAttack: false });
    this.echoRec = new EchoRecorder(ECHO.INTERVAL, ECHO.CHECKPOINT_MS);
    Object.assign(this, { layer: undefined });
    this.bossSpawned = new Set();
    this.hitThisSwing = new Set();
  }

  preload() {
    preloadAssets(this);
  }

  create() {
    makeProceduralTextures(this);
    registerAnimations(this);
    this.audio = new AudioManager(this);
    this.audio.setVolumes(this.settings.music, this.settings.sfx);
    this.waves = new WaveManager();

    for (let i = 0; i < 4; i++) {
      const ray = this.add.image(120 + i * 150, 0, "pillar").setOrigin(0.5, 0).setScrollFactor(0.15, 0).setDepth(-6).setScale(1.6, 3.2).setAngle(-18).setAlpha(0.18).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: ray, alpha: 0.05, duration: 2500 + i * 400, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    }
    this.buildArena(this.game.registry.get("initialMap") ?? 0);

    this.dust = this.add.particles(0, 0, "dot", { lifespan: 400, speed: { min: 10, max: 40 }, angle: { min: 200, max: 340 }, scale: { start: 0.5, end: 0 }, alpha: { start: 0.6, end: 0 }, tint: 0xcfc4a8, emitting: false }).setDepth(6);
    this.sparks = this.add.particles(0, 0, "px", { lifespan: 350, speed: { min: 80, max: 220 }, scale: { start: 1.4, end: 0 }, tint: [0xffffff, 0xffe08a, 0xff9e4a], blendMode: "ADD", emitting: false }).setDepth(9);
    this.ambient = this.add.particles(0, 0, "dot", { x: { min: 0, max: this.scale.width }, y: { min: 0, max: VIEW.HEIGHT }, lifespan: 6000, speedX: { min: -8, max: 8 }, speedY: { min: -10, max: -2 }, scale: { min: 0.15, max: 0.4 }, alpha: { start: 0, end: 0.9, ease: "Sine.inOut" }, tint: 0xffe9a8, blendMode: "ADD", frequency: 220 }).setScrollFactor(0.4).setDepth(7);

    this.hero = new Player(this, (COLS / 2) * T, this.topY(COLS / 2) - 30);
    this.player = this.hero.s;
    this.mapColliders.push(this.physics.add.collider(this.player, this.layer));

    this.enemies = this.add.group({ runChildUpdate: false });
    this.coins = this.physics.add.group({ defaultKey: "coin", maxSize: 140 });
    this.potions = this.physics.add.group();
    this.hazards = this.physics.add.group({ allowGravity: false });
    this.mapColliders.push(this.physics.add.collider(this.coins, this.layer), this.physics.add.collider(this.potions, this.layer));
    this.physics.add.overlap(this.player, this.coins, (_p, c) => this.collectCoin(c as Phaser.Physics.Arcade.Image));
    this.physics.add.overlap(this.player, this.potions, (_p, c) => this.collectPotion(c as Phaser.Physics.Arcade.Image));
    this.physics.add.overlap(this.player, this.hazards, (_p, h) => {
      const hz = h as Phaser.Physics.Arcade.Image;
      if (hz.getData("spent")) return;
      if (this.hurtPlayer(BOSS.SHOCKWAVE_DAMAGE * waveScaling(this.waves.wave).dmg, hz.x, null)) hz.setData("spent", true);
    });

    this.darken = this.add.rectangle(-200, -200, this.scale.width + 400, VIEW.HEIGHT + 400, 0x05030a, 0).setOrigin(0).setScrollFactor(0).setDepth(30);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, COLS * T, ROWS * T);
    cam.startFollow(this.player, true, 0.09, 0.09, 0, 30);
    cam.setDeadzone(40, 0);
    cam.setZoom(VIEW.ZOOM);
    cam.fadeIn(600, 0, 0, 0);
    this.physics.world.setBounds(0, -300, COLS * T, ROWS * T + 400);
    this.player.setCollideWorldBounds(true);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys("A,D,W,S,LEFT,RIGHT,UP,SPACE,J,K,L,E,I,SHIFT,ESC,P,F3") as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.mouse?.disableContextMenu();
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.wasTouch) return;
      if (p.leftButtonDown()) this.clickAttack = true;
    });

    this.audio.startMusic();
    this.bindBus();
    this.applySettings(this.settings);

    if (import.meta.env.DEV && typeof location !== "undefined" && location.search.includes("debug"))
    {
      (window as any).__arena = this;
      this.debugText = this.add.text(4, 120, "", { fontFamily: "monospace", fontSize: "8px", color: "#9fffb0", backgroundColor: "#000a" }).setScrollFactor(0).setDepth(100).setResolution(3);
    }

    this.time.delayedCall(700, () => this.countdownTo(1));
    this.pushHud();
  }

  // ---------------- bus / UI bridge ----------------
  bindBus() {
    const on = (ev: string, fn: (...a: any[]) => void) => {
      this.bus.on(ev, fn);
      this.events.once("shutdown", () => this.bus.off(ev, fn));
    };
    on("choose", (id: string) => {
      if (this.mode !== "LEVEL_UP") return;
      this.stats = applyUpgrade(this.stats, id);
      this.audio.play("upgrade");
      this.pendingLevels = Math.max(0, this.pendingLevels - 1);
      this.mode = this.prevMode;
      this.scene.resume();
      this.pushHud();
      if (this.pendingLevels > 0) this.openLevelUp();
    });
    on("shopBuy", (id: string) => {
      if (this.mode !== "SHOP") return;
      const it = SHOP_ITEMS.find((s) => s.id === id);
      if (!it || this.coinCount < it.cost) return;
      this.coinCount -= it.cost;
      if (id === "heal") this.stats.hp = heal(this.stats.hp, this.stats.maxHp, this.stats.maxHp * 0.5, this.stats.healMult);
      if (id === "maxhp") {
        this.stats.maxHp += 100;
        this.stats.hp += 100;
      }
      if (id === "rage") this.rageWave = this.waves.wave + 1;
      if (id === "special") this.special = SPECIAL.MAX;
      this.audio.play("coin");
      this.pushHud();
      this.bus.emit("shop", { items: SHOP_ITEMS, coins: this.coinCount, rage: this.rageWave > this.waves.wave });
    });
    on("shopClose", () => {
      if (this.mode !== "SHOP") return;
      this.scene.resume();
      this.openPortal(this.waves.wave + 1);
    });
    on("pause", () => {
      if (this.mode === "GAME_OVER" || this.mode === "LEVEL_UP" || this.mode === "SHOP" || this.mode === "PAUSED") return;
      this.prevMode = this.mode;
      this.mode = "PAUSED";
      this.scene.pause();
      this.bus.emit("paused", true);
    });
    on("resume", () => {
      if (this.mode !== "PAUSED") return;
      this.mode = this.prevMode;
      this.scene.resume();
      this.bus.emit("paused", false);
    });
    on("settings", (s: Settings) => this.applySettings(s));
  }

  applySettings(s: Settings) {
    this.settings = s;
    this.audio.setVolumes(s.music, s.sfx);
    this.ambient.setVisible(s.particles);
    this.dust.setVisible(s.particles);
  }

  shake(d: number, i: number) {
    if (this.settings.shake) this.cameras.main.shake(d, i);
  }
  playAudio(e: AudioEvent) {
    this.audio.play(e);
  }
  dustAt(x: number, y: number, n: number) {
    if (this.settings.particles) this.dust.explode(n, x, y);
  }
  playerDead() {
    return this.hero.state === "DEAD";
  }

  // ---------------- arena ----------------
  topY(c: number) {
    return (ROWS - (this.heights[Math.max(0, Math.min(COLS - 1, Math.floor(c)))] ?? 6)) * T;
  }

  buildArena(index: number) {
    const def = MAPS[index % MAPS.length];
    if (!def) return;
    this.mapIndex = index % MAPS.length;
    if (index > 0) this.audio?.playTrack(index);
    this.mapObjects.forEach((o) => o.destroy());
    this.mapObjects = [];
    this.bgs = [];
    const H = VIEW.GROUND_HEIGHT;
    this.heights = new Array(COLS).fill(H);
    const cam = this.cameras.main;
    const z = VIEW.ZOOM;
    const sw = this.scale.width / z;
    const sh = this.scale.height / z;
    const ox = (this.scale.width - sw) / 2;
    const oy = (this.scale.height - sh) / 2;
    const layouts = parallaxLayout(def.layers, sw, sh, def.floor ? H * T : 0);
    // Shared artboard scale; shorter exports are anchored to the same floor.
    def.layers.forEach((l, i) => {
      const layout = layouts[i];
      if (!layout) return;
      const ts = this.add.tileSprite(ox, oy + layout.y, sw, layout.height, `bg_${def.id}_${i}`).setOrigin(0).setScrollFactor(0).setDepth(-20 + i);
      ts.setTileScale(layout.scale);
      this.bgs.push(ts);
      this.mapObjects.push(ts);
    });
    // flat floor from the map's tileset (row 0 = surface, rows 1-2 = fill)
    const data: number[][] = [];
    for (let y = 0; y < ROWS; y++) data.push(new Array(COLS).fill(-1));
    const top = ROWS - H;
    for (let x = 0; x < COLS; x++) for (let y = top; y < ROWS; y++) data[y]![x] = (y === top ? 0 : y === top + 1 ? 3 : 6) + (x % 3);
    const map = this.make.tilemap({ data, tileWidth: T, tileHeight: T });
    const tileset = map.addTilesetImage(`ground_${def.id}`, `ground_${def.id}`, T, T, 0, 0)!;
    // Phaser keeps class fields across restarts, but the previous scene objects are destroyed.
    const old = this.layer;
    this.layer = map.createLayer(0, tileset, 0, 0)!.setDepth(4).setVisible((def as { floor?: boolean }).floor === true);
    this.layer.setCollisionByExclusion([-1]);
    this.mapObjects.push(this.layer);
    if (old) {
      this.mapColliders.forEach((c) => c.destroy());
      // sweep any collider still pointing at the old floor
      for (const c of [...this.physics.world.colliders.getActive()]) if (c.object1 === old || c.object2 === old) c.destroy();
      this.mapColliders = [
        this.physics.add.collider(this.player, this.layer),
        this.physics.add.collider(this.coins, this.layer),
        this.physics.add.collider(this.potions, this.layer),
      ];
      for (const o of this.enemies.getChildren()) this.mapColliders.push(this.physics.add.collider(o, this.layer));
      for (const e of this.echoes) this.mapColliders.push(this.physics.add.collider(e.sprite, this.layer));
    }
    // set dressing from the pack's props, standing on the floor
    const floorY = top * T + 2;
    const rnd = new Phaser.Math.RandomDataGenerator([def.id]);
    const n = def.props.length;
    if (n) {
      // each prop at most twice, never overlapping: advance past its full width plus a gap
      const order = Phaser.Utils.Array.Shuffle([...Array(n).keys(), ...Array(n).keys()]);
      let x = rnd.between(24, 60);
      for (const i of order) {
        const [w, h] = def.props[i]!;
        if (h! < 14 || w! < 10) continue;
        const sc = h! > 150 ? 150 / h! : 1;
        const half = (w! * sc) / 2;
        if (x + half * 2 > COLS * T - 16) break;
        this.mapObjects.push(this.add.image(x + half, floorY, `prop_${def.id}_${i}`).setOrigin(0.5, 1).setScale(sc).setDepth(-3).setTint(def.outdoor ? 0xe2e2e2 : 0xd0ccd8));
        x += half * 2 + rnd.between(70, 150);
      }
    }
    cam.setBackgroundColor(def.outdoor ? 0x1b2a30 : 0x0d0b12);
  }

  /** Open a portal ahead of the player; walking into it travels to the next map. */
  openPortal(nextWave: number) {
    this.mode = "PORTAL";
    this.portalNext = nextWave;
    this.portal?.destroy();
    const dir = this.player.x < (COLS * T) / 2 ? 1 : -1;
    const x = Phaser.Math.Clamp(this.player.x + dir * PORTAL.DISTANCE, 40, COLS * T - 40);
    const y = this.topY(x / T);
    const glow = this.add.image(0, -34, "pillar").setScale(1.4, 2.2).setTint(0x9ff3ff).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.85);
    const core = this.add.image(0, -34, "pillar").setScale(0.6, 2).setTint(0xffffff).setBlendMode(Phaser.BlendModes.ADD);
    const base = this.add.ellipse(0, 0, 44, 8, 0x9ff3ff, 0.5).setBlendMode(Phaser.BlendModes.ADD);
    const motes = this.add.particles(0, 0, "dot", { x: { min: -12, max: 12 }, y: { min: -4, max: 0 }, lifespan: 1100, speedY: { min: -60, max: -20 }, scale: { start: 0.5, end: 0 }, tint: [0x9ff3ff, 0xffffff], blendMode: "ADD", frequency: 45 });
    const arrow = this.add.text(0, -84, dir > 0 ? "▶" : "◀", { fontFamily: "serif", fontSize: "12px", color: "#9ff3ff" }).setOrigin(0.5).setResolution(4);
    this.portal = this.add.container(x, y, [base, glow, core, motes, arrow]).setDepth(5).setScale(0, 1);
    this.tweens.add({ targets: this.portal, scaleX: 1, duration: 420, ease: "Back.out" });
    this.tweens.add({ targets: glow, alpha: 0.45, duration: 700, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    this.tweens.add({ targets: arrow, y: -90, duration: 500, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    this.audio.play("upgrade");
    loadMap(this, (this.game.registry.get("initialMap") ?? 0) + nextWave - 1, () => {});
    this.bus.emit("notify", { text: "A PORTAL OPENS", kind: "map" });
    this.pushHud();
  }

  enterPortal() {
    if (this.transitioning) return;
    this.transitioning = true;
    this.mode = "WAVE_TRANSITION";
    this.audio.play("dash");
    this.bus.emit("wipe", "in");
    const nextMap = (this.game.registry.get("initialMap") ?? 0) + this.portalNext - 1;
    this.time.delayedCall(PORTAL.WIPE_MS, () => loadMap(this, nextMap, () => {
      this.portal?.destroy();
      this.portal = undefined;
      for (const o of [...this.enemies.getChildren()]) (o as Enemy).cleanup();
      this.hazards.clear(true, true);
      this.buildArena(nextMap);
      const sx = 4 * T;
      this.player.setPosition(sx, this.topY(4) - 24).setVelocity(0, 0);
      this.hero.facing = 1;
      this.player.setFlipX(false);
      this.cameras.main.centerOn(sx, 0);
      this.time.delayedCall(PORTAL.HOLD_MS, () => {
        this.bus.emit("wipe", "out");
        this.bus.emit("notify", { text: MAPS[this.mapIndex]!.name.toUpperCase(), kind: "map" });
        this.transitioning = false;
        this.countdownTo(this.portalNext);
      });
    }));
  }

  // ---------------- echo ----------------
  echoHitFrame(echo: Echo, key: string) {
    const s = echo.sprite;
    const step = key === "h_attack3" ? 2 : key === "h_attack2" ? 1 : 0;
    const reach = COMBAT.COMBO_REACH[step]!;
    const hb = new Phaser.Geom.Rectangle(echo.p.facing > 0 ? s.x - 4 : s.x - reach + 4, s.y - 22, reach, 38);
    const mul = (key === "h_air-attack1" ? COMBAT.AIR_DAMAGE : COMBAT.COMBO_DAMAGE[step]!) * ECHO.DAMAGE_MULT;
    let any = false;
    for (const o of this.enemies.getChildren()) {
      const e = o as Enemy;
      if (!e.alive) continue;
      const b = e.body as Phaser.Physics.Arcade.Body;
      if (!Phaser.Geom.Rectangle.Overlaps(hb, new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height))) continue;
      this.damageEnemy(e, Math.max(1, Math.round(this.stats.damage * mul)), false, step === 2, echo.p.facing);
      any = true;
    }
    if (any) {
      this.audio.play("enemyHit");
      this.shake(60, 0.002);
    }
  }

  spawnEcho(seg: import("./echoTimeline").EchoSegment) {
    this.echoes = this.echoes.filter((e) => !e.dead);
    while (this.echoes.length >= ECHO.MAX) this.echoes.shift()!.fade();
    const e = new Echo(this, seg, ++this.echoCount);
    this.mapColliders.push(this.physics.add.collider(e.sprite, this.layer));
    this.echoes.push(e);
    this.audio.play("upgrade");
    this.bus.emit("notify", { text: `ECHO ${this.echoCount} AWAKENS`, kind: "echo" });
  }

  // ---------------- waves ----------------
  countdownTo(n: number) {
    this.mode = "WAVE_TRANSITION";
    const def = { boss: n % WAVES.BOSS_EVERY === 0 };
    this.bus.emit("notify", { text: def.boss ? "BOSS WAVE" : `WAVE ${n}`, kind: def.boss ? "boss" : "wave" });
    const steps = ["3", "2", "1", "FIGHT!"];
    steps.forEach((s, i) =>
      this.time.delayedCall(900 + i * 650, () => {
        this.bus.emit("countdown", s);
        this.audio.play(s === "FIGHT!" ? "go" : "tick");
        if (s === "FIGHT!") this.startWave(n);
      }),
    );
  }

  startWave(n: number) {
    const def = this.waves.start(n, this.time.now);
    this.audio.play("waveStart");
    if (def.boss) this.bossIntro(n);
    else this.mode = "PLAYING";
    this.pushHud();
  }

  bossIntro(n: number) {
    if (this.bossSpawned.has(n)) return;
    this.bossSpawned.add(n);
    this.mode = "BOSS_INTRO";
    this.tweens.add({ targets: this.darken, alpha: 0.45, duration: 600 });
    this.audio.play("bossEntrance");
    this.shake(1200, 0.004);
    this.bus.emit("bossIntro", BOSS.name);
    this.time.delayedCall(1600, () => {
      const col = this.player.x < (COLS * T) / 2 ? COLS - 14 : 14;
      const sc = waveScaling(n);
      const tierMul = 1 + (n / WAVES.BOSS_EVERY - 1) * 0.5;
      const b = new Enemy(this, col * T, this.topY(col) - 120, "boss", BOSS.def, { elite: false, hpMul: sc.hp * 0.6 * tierMul, dmgMul: sc.dmg * 0.8, spdMul: 1, waveId: n });
      this.enemies.add(b);
      this.mapColliders.push(this.physics.add.collider(b, this.layer));
      this.waves.addExtra();
      this.boss = b;
      this.cameras.main.flash(300, 120, 60, 200);
      this.tweens.add({ targets: this.darken, alpha: 0.12, duration: 900 });
      this.mode = "BOSS_FIGHT";
      this.pushHud();
    });
  }

  pickSpawnPoint(fly: boolean) {
    const cols = [3, 12, 24, 36, 54, 66, 78, 87];
    const px = this.player.x;
    const valid = cols.filter((c) => Math.abs(c * T - px) > WAVES.MIN_SPAWN_DIST);
    const c = valid.length ? Phaser.Utils.Array.GetRandom(valid) : cols.reduce((a, b) => (Math.abs(b * T - px) > Math.abs(a * T - px) ? b : a));
    return { x: c * T, y: this.topY(c) - (fly ? 80 : 40) };
  }

  spawnEnemy(kind: string, elite: boolean, at?: { x: number; y: number }) {
    const def = ENEMIES[kind];
    if (!def) return;
    const pt = at ?? this.pickSpawnPoint(!!def.fly);
    const sc = waveScaling(this.waves.wave);
    const e = new Enemy(this, pt.x, pt.y, kind, def, { elite, hpMul: sc.hp, dmgMul: sc.dmg, spdMul: sc.speed, waveId: this.waves.wave, aggro: true });
    this.enemies.add(e);
    this.mapColliders.push(this.physics.add.collider(e, this.layer));
    e.setAlpha(0);
    this.tweens.add({ targets: e, alpha: 1, duration: 350 });
    if (this.settings.particles) {
      const puff = this.add.particles(pt.x, pt.y + 10, "dot", { lifespan: 500, speed: { min: 20, max: 70 }, scale: { start: 0.7, end: 0 }, tint: elite ? 0xffb13b : 0x8d7bd6, blendMode: "ADD", emitting: false }).setDepth(6);
      puff.explode(16);
      this.time.delayedCall(600, () => puff.destroy());
    }
    if (elite) this.bus.emit("notify", { text: "ELITE INCOMING", kind: "elite" });
    return e;
  }

  aliveCount() {
    let n = 0;
    for (const o of this.enemies.getChildren()) if ((o as Enemy).alive) n++;
    return n;
  }

  onWaveCleared() {
    this.mode = "WAVE_TRANSITION";
    const def = this.waves.def;
    const xp = Math.round(def.rewardXp * this.stats.xpMult);
    this.coinCount += def.rewardCoins;
    this.runCoins += def.rewardCoins;
    const summary = { wave: def.number, kills: this.waves.killed, xp: this.waves.waveXp + xp, coins: this.waves.waveCoins + def.rewardCoins, boss: def.boss };
    this.audio.play("waveClear");
    this.bus.emit("waveCleared", summary);
    this.gainXp(xp);
    this.boss = undefined;
    this.pushHud();
    this.time.delayedCall(WAVES.SUMMARY_TIME, () => {
      if (def.number % WAVES.SHOP_EVERY === 0) {
        this.mode = "SHOP";
        this.scene.pause();
        this.bus.emit("shop", { items: SHOP_ITEMS, coins: this.coinCount, rage: this.rageWave > def.number });
      } else this.openPortal(def.number + 1);
    });
  }

  // ---------------- progression ----------------
  gainXp(amount: number) {
    const r = addXp(this.stats.lvl, this.stats.xp, amount);
    this.stats.lvl = r.lvl;
    this.stats.xp = r.xp;
    if (r.ups) {
      this.pendingLevels += r.ups;
      this.audio.play("levelUp");
      this.bus.emit("notify", { text: "LEVEL UP!", kind: "level" });
      this.cameras.main.flash(220, 255, 230, 160);
      if (this.mode !== "LEVEL_UP") this.time.delayedCall(350, () => this.openLevelUp());
    }
    this.hudDirty = true;
  }

  openLevelUp() {
    if (this.mode === "LEVEL_UP" || this.mode === "GAME_OVER" || this.pendingLevels <= 0) return;
    const choices = pickUpgrades(this.stats.stacks);
    if (!choices.length) {
      this.pendingLevels = 0;
      return;
    }
    if (this.mode === "PAUSED" || this.mode === "SHOP") return;
    this.prevMode = this.mode;
    this.mode = "LEVEL_UP";
    this.scene.pause();
    this.bus.emit("levelup", choices);
  }

  addSpecial(n: number) {
    this.special = Math.min(SPECIAL.MAX, this.special + n * this.stats.specialMult);
    this.hudDirty = true;
  }

  registerHit() {
    const now = this.time.now;
    const before = comboMultiplier(this.comboHits);
    this.comboHits = now - this.lastHitAt > COMBO.TIMEOUT ? 1 : this.comboHits + 1;
    this.lastHitAt = now;
    this.bestCombo = Math.max(this.bestCombo, this.comboHits);
    if (comboMultiplier(this.comboHits) > before) this.addSpecial(SPECIAL.ON_COMBO_TIER);
  }

  // ---------------- combat ----------------
  heroHitFrame(key: string) {
    const h = this.hero;
    const step = key === "h_attack3" ? 2 : key === "h_attack2" ? 1 : 0;
    const air = key === "h_air-attack1";
    const reach = COMBAT.COMBO_REACH[step]!;
    const hb = new Phaser.Geom.Rectangle(h.facing > 0 ? this.player.x - 4 : this.player.x - reach + 4, this.player.y - 22, reach, 38);
    const mul = (air ? COMBAT.AIR_DAMAGE : COMBAT.COMBO_DAMAGE[step]!) * (this.rageWave === this.waves.wave ? 1.5 : 1);
    const heavy = step === 2;
    let any = false;
    this.hitThisSwing.clear();
    for (const o of this.enemies.getChildren()) {
      const e = o as Enemy;
      if (!e.alive || this.hitThisSwing.has(e)) continue;
      const b = e.body as Phaser.Physics.Arcade.Body;
      if (!Phaser.Geom.Rectangle.Overlaps(hb, new Phaser.Geom.Rectangle(b.x, b.y, b.width, b.height))) continue;
      this.hitThisSwing.add(e);
      const crit = Math.random() < this.stats.crit;
      const dmg = Math.max(1, Math.round(this.stats.damage * mul * (crit ? COMBAT.CRIT_MULT : 1) * Phaser.Math.FloatBetween(0.92, 1.08)));
      this.damageEnemy(e, dmg, crit, heavy, h.facing);
      any = true;
    }
    if (any) {
      this.audio.play("enemyHit");
      this.hitstop(heavy ? COMBAT.HITSTOP_HEAVY : COMBAT.HITSTOP);
      this.shake(90, heavy ? 0.006 : 0.003);
    }
  }

  damageEnemy(e: Enemy, dmg: number, crit: boolean, heavy: boolean, dir: number) {
    if (!e.alive) return;
    e.takeHit(dmg, dir, heavy);
    this.registerHit();
    this.addSpecial(SPECIAL.ON_HIT);
    this.score += dmg;
    this.floatText(e.x, e.y - 30 * e.def.scale, String(dmg), crit ? "#ffd84a" : "#ffffff", crit);
    if (this.settings.particles) this.sparks.explode(crit ? 22 : 12, e.x - dir * 6, e.y - 6);
    if (e.hp <= 0) this.killEnemy(e);
    this.hudDirty = true;
  }

  killEnemy(e: Enemy) {
    if (e.rewarded) return;
    e.rewarded = true;
    e.die();
    this.kills++;
    this.waves.onKill(e.waveId);
    this.audio.play(e.isBoss ? "bossDeath" : "enemyDeath");
    const cm = comboMultiplier(this.comboHits);
    const baseXp = e.isBoss ? e.def.xp * (this.waves.wave / WAVES.BOSS_EVERY) : e.elite ? ELITE.XP : e.def.xp;
    const xp = Math.round(baseXp * this.stats.xpMult * cm);
    const coins = Math.round(e.def.coins * (e.elite ? ELITE.COIN_MULT : 1) * cm);
    this.waves.waveXp += xp;
    this.waves.waveCoins += coins;
    this.score += xp * 10;
    this.addSpecial(SPECIAL.ON_KILL);
    this.floatText(e.x, e.y - 44 * e.def.scale, `+${xp} XP`, "#ffe08a");
    this.dropCoins(e.x, e.y - 10, coins);
    if (Math.random() < DROPS.POTION_CHANCE || e.elite) this.dropPotion(e.x, e.y - 10);
    this.gainXp(xp);
    if (e.isBoss) {
      this.shake(800, 0.012);
      this.cameras.main.flash(500, 255, 240, 200);
      this.bus.emit("notify", { text: "BOSS DEFEATED", kind: "boss" });
      for (const o of this.enemies.getChildren()) {
        const m = o as Enemy;
        if (m !== e && m.alive) this.killEnemy(m);
      }
      this.tweens.add({ targets: this.darken, alpha: 0, duration: 800 });
      this.boss = undefined;
    }
    this.hudDirty = true;
  }

  dropCoins(x: number, y: number, n: number) {
    const count = Math.min(n, 30);
    const per = n / count;
    for (let i = 0; i < count; i++) {
      const c = this.coins.get(x, y, "coin") as Phaser.Physics.Arcade.Image | null;
      if (!c) {
        this.coinCount += Math.round(per);
        this.runCoins += Math.round(per);
        continue;
      }
      c.enableBody(true, x, y, true, true);
      c.setData("value", per).setData("born", this.time.now).setDepth(6).setBounce(0.5).setDragX(120);
      (c.body as Phaser.Physics.Arcade.Body).setAllowGravity(true);
      c.setVelocity(Phaser.Math.Between(-110, 110), Phaser.Math.Between(-260, -140));
    }
  }

  collectCoin(c: Phaser.Physics.Arcade.Image) {
    if (!c.active || this.time.now - (c.getData("born") ?? 0) < 250) return;
    const v = c.getData("value") ?? 1;
    this.coins.killAndHide(c);
    c.disableBody(true, true);
    this.coinCount += v;
    this.runCoins += v;
    this.audio.play("coin");
    this.hudDirty = true;
  }

  dropPotion(x: number, y: number) {
    const p = this.potions.create(x, y, "potion") as Phaser.Physics.Arcade.Image;
    p.setBounce(0.4).setDragX(200).setDepth(6).setVelocity(Phaser.Math.Between(-60, 60), -200);
    this.time.delayedCall(14000, () => p.active && p.destroy());
  }

  collectPotion(p: Phaser.Physics.Arcade.Image) {
    if (!p.active) return;
    p.destroy();
    const amt = this.stats.maxHp * DROPS.POTION_HEAL;
    this.stats.hp = heal(this.stats.hp, this.stats.maxHp, amt, this.stats.healMult);
    this.floatText(this.player.x, this.player.y - 26, `+${Math.round(amt * this.stats.healMult)}`, "#7dffa0");
    this.audio.play("coin");
    this.hudDirty = true;
  }

  enemyAttackHit(e: Enemy, dmg: number) {
    if (!e.alive) return;
    this.hurtPlayer(dmg, e.x, e);
  }

  /** Returns true if the hit connected (even if blocked). */
  hurtPlayer(raw: number, fromX: number, src: Enemy | null): boolean {
    const h = this.hero;
    if (h.state === "DEAD" || h.invulnerable || this.mode === "GAME_OVER") return false;
    const facingSrc = Math.sign(fromX - this.player.x) === h.facing || Math.abs(fromX - this.player.x) < 4;
    if (h.blocking && facingSrc) {
      if (h.isParry(this.time.now)) {
        this.audio.play("parry");
        this.floatText(this.player.x, this.player.y - 28, "PARRY!", "#bff3ff", true);
        this.cameras.main.flash(120, 200, 240, 255);
        this.hitstop(120);
        if (src && !src.isBoss) src.stun(COMBAT.PARRY_STUN);
        else if (src) src.stun(COMBAT.PARRY_STUN / 2);
        this.addSpecial(SPECIAL.ON_HIT * 3);
        h.invulnUntil = this.time.now + 250;
        return true;
      }
      const r = resolveIncoming(this.stats.hp, raw, this.stats.defense, COMBAT.BLOCK_REDUCTION);
      this.stats.hp = r.hp;
      this.audio.play("block");
      h.blockFeedback(fromX);
      h.invulnUntil = this.time.now + 300;
      this.floatText(this.player.x, this.player.y - 24, `-${r.taken}`, "#9fc9ff");
      if (this.settings.particles) this.sparks.explode(8, this.player.x + h.facing * 10, this.player.y);
      if (r.hp <= 0) h.hurt(fromX, true);
      this.hudDirty = true;
      return true;
    }
    const r = resolveIncoming(this.stats.hp, raw, this.stats.defense, 0);
    this.stats.hp = r.hp;
    this.comboHits = 0;
    this.floatText(this.player.x, this.player.y - 24, `-${r.taken}`, "#ff5a5a");
    this.shake(160, 0.008);
    this.audio.play("hurt");
    h.hurt(fromX, r.hp <= 0);
    if (r.hp > 0) this.hitstop(70);
    this.hudDirty = true;
    return true;
  }

  doSpecial() {
    this.special = 0;
    this.audio.play("special");
    this.cameras.main.flash(250, 255, 220, 150);
    this.shake(350, 0.012);
    const ring = this.add.image(this.player.x, this.player.y, "ring").setDepth(12).setBlendMode("ADD").setTint(0xffd36b).setScale(0.2);
    this.tweens.add({ targets: ring, scale: (SPECIAL.RADIUS * 2) / 64, alpha: 0, duration: 450, ease: "Cubic.out", onComplete: () => ring.destroy() });
    if (this.settings.particles) {
      const burst = this.add.particles(this.player.x, this.player.y, "px", { lifespan: 600, speed: { min: 150, max: 380 }, scale: { start: 2, end: 0 }, tint: [0xffffff, 0xffd36b, 0xff7a3a], blendMode: "ADD", emitting: false }).setDepth(12);
      burst.explode(60);
      this.time.delayedCall(700, () => burst.destroy());
    }
    for (const o of this.enemies.getChildren()) {
      const e = o as Enemy;
      if (!e.alive) continue;
      const d = Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y);
      if (d > SPECIAL.RADIUS) continue;
      const dmg = Math.round(this.stats.damage * SPECIAL.DAMAGE_MULT);
      this.damageEnemy(e, dmg, true, true, Math.sign(e.x - this.player.x) || 1);
    }
    this.hitstop(120);
    this.hudDirty = true;
  }

  bossPhaseChanged(e: Enemy, phase: number) {
    this.bus.emit("notify", { text: phase === 3 ? "THE NIGHTBORNE IS ENRAGED" : "PHASE 2", kind: "boss" });
    this.audio.play("bossEntrance");
    this.shake(600, 0.008);
    this.cameras.main.flash(250, 255, 60, 60);
    if (this.settings.particles) this.sparks.explode(40, e.x, e.y);
    e.summonAt = this.time.now + 1500;
    this.hudDirty = true;
  }

  bossSummon(e: Enemy) {
    let minions = 0;
    for (const o of this.enemies.getChildren()) if ((o as Enemy).alive && !(o as Enemy).isBoss) minions++;
    if (minions >= BOSS.SUMMON_MAX) return;
    for (let i = 0; i < 2 && minions + i < BOSS.SUMMON_MAX; i++) {
      const pt = this.pickSpawnPoint(false);
      this.spawnEnemy(Phaser.Utils.Array.GetRandom(["goblin", "mushroom"]), false, pt);
      this.waves.addExtra();
    }
    this.floatText(e.x, e.y - 70, "Rise, my servants!", "#ff9a9a");
  }

  bossShockwave(e: Enemy) {
    for (const dir of [-1, 1]) {
      const w = this.hazards.create(e.x + dir * 20, this.topY(e.x / T) - 8, "wave") as Phaser.Physics.Arcade.Image;
      w.setTint(0xff4a6a).setBlendMode("ADD").setDepth(8).setScale(1, 1.2);
      (w.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
      w.setVelocityX(dir * BOSS.SHOCKWAVE_SPEED);
      this.tweens.add({ targets: w, alpha: 0.4, yoyo: true, repeat: -1, duration: 120 });
      this.time.delayedCall(2200, () => w.active && w.destroy());
    }
  }

  onPlayerDied() {
    if (this.mode === "GAME_OVER") return;
    this.mode = "GAME_OVER";
    const rec = SaveManager.submitRun({ wave: this.waves.wave, level: this.stats.lvl, score: this.score, coins: Math.round(this.runCoins) });
    const meta = SaveManager.loadMeta();
    const souls = soulsForRun(this.waves.wave, Math.round(this.runCoins), meta.perks.fortune);
    SaveManager.saveMeta({ ...meta, souls: meta.souls + souls });
    this.time.delayedCall(500, () =>
      this.bus.emit("gameover", { wave: this.waves.wave, level: this.stats.lvl, kills: this.kills, coins: Math.round(this.runCoins), bestCombo: this.bestCombo, score: this.score, records: rec, souls }),
    );
  }

  hitstop(ms: number) {
    this.physics.pause();
    this.anims.pauseAll();
    this.hitstopUntil = performance.now() + ms;
  }

  floatText(x: number, y: number, s: string, color: string, big = false) {
    const t = this.add.text(x, y, s, { fontFamily: "Cinzel, serif", fontSize: big ? "16px" : "11px", fontStyle: "bold", color, stroke: "#120a0a", strokeThickness: 3 }).setOrigin(0.5).setDepth(20).setResolution(4);
    this.tweens.add({ targets: t, y: y - 26, alpha: 0, duration: 750, ease: "Cubic.out", onComplete: () => t.destroy() });
    if (big) this.tweens.add({ targets: t, scale: { from: 1.6, to: 1 }, duration: 160 });
  }

  pushHud() {
    this.hudDirty = false;
    const now = this.time.now;
    const comboLive = now - this.lastHitAt < COMBO.TIMEOUT ? this.comboHits : 0;
    this.bus.emit("hud", {
      hp: Math.max(0, Math.ceil(this.stats.hp)),
      maxHp: Math.round(this.stats.maxHp),
      lvl: this.stats.lvl,
      xp: Math.floor(this.stats.xp),
      xpNext: xpForLevel(this.stats.lvl),
      special: Math.floor(this.special),
      specialMax: SPECIAL.MAX,
      coins: Math.floor(this.coinCount),
      wave: this.waves.wave,
      remaining: this.waves.phase === "SPAWNING" ? this.waves.remaining : 0,
      combo: comboLive,
      comboMult: comboMultiplier(comboLive),
      rage: this.rageWave === this.waves.wave,
      echoIn: Math.max(0, Math.ceil((ECHO.INTERVAL - this.echoRec.elapsed) / 1000)),
      echoProgress: this.echoRec.progress,
      echoes: this.echoes.filter((e) => !e.dead).length,
      portal: this.mode === "PORTAL",
      map: MAPS[this.mapIndex]!.name,
      boss: this.boss && this.boss.alive ? { name: BOSS.name, hp: this.boss.hp, max: this.boss.maxHp, phase: this.boss.phase } : null,
    });
  }

  // ---------------- main loop ----------------
  readInput(): PInput {
    const k = this.keys;
    const t = (this.game.registry.get("touch") as TouchInput | undefined) ?? this.prevTouch;
    const jd = Phaser.Input.Keyboard.JustDown;
    const ptr = this.input.activePointer;
    const inp: PInput = {
      left: k["A"]!.isDown || k["LEFT"]!.isDown || t.left,
      right: k["D"]!.isDown || k["RIGHT"]!.isDown || t.right,
      jumpPressed: jd(k["SPACE"]!) || jd(k["W"]!) || jd(k["UP"]!) || (t.jump && !this.prevTouch.jump),
      jumpHeld: k["SPACE"]!.isDown || k["W"]!.isDown || k["UP"]!.isDown || t.jump,
      attack: jd(k["J"]!) || (t.attack && !this.prevTouch.attack) || this.clickAttack,
      dash: jd(k["SHIFT"]!) || jd(k["K"]!) || (t.dash && !this.prevTouch.dash),
      block: k["L"]!.isDown || k["S"]!.isDown || (!ptr.wasTouch && ptr.rightButtonDown()) || t.block,
      special: jd(k["E"]!) || jd(k["I"]!) || (t.special && !this.prevTouch.special),
    };
    this.prevTouch = { ...t };
    this.clickAttack = false;
    return inp;
  }

  override update(time: number) {
    const cam = this.cameras.main;
    // Camera-driven depth only: architectural layers must not drift apart while idle.
    if (this.bgs.length > 1) this.bgs.forEach((b, i) => (b.tilePositionX = cam.scrollX * (0.03 + (i / Math.max(1, this.bgs.length - 1)) * 0.45) / b.tileScaleX));

    if (Phaser.Input.Keyboard.JustDown(this.keys["ESC"]!) || Phaser.Input.Keyboard.JustDown(this.keys["P"]!)) this.bus.emit("pause");

    if (this.hitstopUntil) {
      if (performance.now() < this.hitstopUntil) return;
      this.hitstopUntil = 0;
      this.physics.resume();
      this.anims.resumeAll();
    }

    const inp = this.readInput();
    this.hero.update(time, inp);
    const dt = this.game.loop.delta;
    if ((this.mode === "PLAYING" || this.mode === "BOSS_FIGHT" || this.mode === "PORTAL") && this.hero.state !== "DEAD") {
      const seg = this.echoRec.push(dt, inp, this.player.x, this.player.y);
      if (seg) this.spawnEcho(seg);
    }
    for (const e of this.echoes) e.update(time, dt);
    if (this.mode === "PORTAL" && this.portal && Math.abs(this.player.x - this.portal.x) < 14 && Math.abs(this.player.y - this.portal.y) < 50) this.enterPortal();
    if (this.player.y > ROWS * T + 40) this.player.setPosition((COLS / 2) * T, this.topY(COLS / 2) - 40);

    for (const o of [...this.enemies.getChildren()]) {
      const e = o as Enemy;
      if (!e.active) {
        this.enemies.remove(e);
        continue;
      }
      e.ai(time);
      if (e.y > ROWS * T + 60 && e.alive) this.killEnemy(e);
    }

    // coins magnet
    for (const o of this.coins.getChildren()) {
      const c = o as Phaser.Physics.Arcade.Image;
      if (!c.active) continue;
      const age = time - (c.getData("born") ?? 0);
      if (age > 600 && (Phaser.Math.Distance.Between(c.x, c.y, this.player.x, this.player.y) < 90 || age > 1800)) {
        (c.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
        this.physics.moveToObject(c, this.player, 320);
      }
    }

    if (this.mode === "PLAYING" || this.mode === "BOSS_FIGHT") {
      const alive = this.aliveCount();
      const next = this.waves.poll(time, alive);
      if (next) this.spawnEnemy(next.kind, next.elite);
      if (this.waves.checkComplete(this.aliveCount())) this.onWaveCleared();
    }

    if (this.comboHits && time - this.lastHitAt > COMBO.TIMEOUT) {
      this.comboHits = 0;
      this.hudDirty = true;
    }
    if (this.hudDirty || time % 250 < 17) this.pushHud();

    if (this.debugText) {
      this.debugText.setText(
        [
          `FPS ${this.game.loop.actualFps.toFixed(0)}  state ${this.mode}`,
          `wave ${this.waves.wave} phase ${this.waves.phase} queue ${this.waves.queue.length}`,
          `spawned ${this.waves.spawned} killed ${this.waves.killed} alive ${this.aliveCount()}`,
          `hp ${this.stats.hp.toFixed(0)} player ${this.hero.state}`,
          ...this.enemies.getChildren().slice(0, 8).map((o) => `${(o as Enemy).kind}${(o as Enemy).elite ? "*" : ""}: ${(o as Enemy).state} ${(o as Enemy).hp}`),
        ].join("\n"),
      );
    }
  }
}

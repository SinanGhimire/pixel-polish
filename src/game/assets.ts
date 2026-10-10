// Asset registry: loads sheets from /game/<folder>/ and registers animations with fallbacks.
import type Phaser from "phaser";
import { heroById } from "./heroes";
import { SaveManager } from "./save";
import { BOSS, ENEMIES, MAPS, type EnemyDef } from "./config";
import { mediaUrl } from "./media";

const ENEMY_FILES: Record<string, string[]> = {
  goblin: ["IDLE", "RUN", "ATTACK", "HIT", "DIE"],
  mushroom: ["IDLE", "RUN", "ATTACK", "HIT", "DIE"],
  skeleton: ["IDLE", "WALK", "ATTACK", "HIT", "DIE", "BLOCK"],
  flyingeye: ["FLY", "ATTACK", "HIT", "DIE"],
  bringer: ["IDLE", "WALK", "ATTACK", "HIT", "DIE"],
  golem: ["IDLE", "WALK", "ATTACK", "HIT", "DIE"],
  rat: ["IDLE",  "RUN",  "ATTACK",  "HIT",  "DIE"],
  slime: ["IDLE",  "WALK",  "ATTACK",  "HIT",  "DIE"],
  bat: ["FLY",  "ATTACK",  "HIT",  "DIE"],
  boar: ["IDLE",  "RUN",  "ATTACK",  "DIE"],
  boarwarrior: ["IDLE",  "WALK",  "ATTACK",  "DIE"],
  mimic: ["IDLE",  "WALK",  "ATTACK",  "HIT",  "DIE"],
  necro: ["IDLE",  "WALK",  "ATTACK",  "HIT",  "DIE"],
};
const FRAME: Record<string, [number, number]> = { bringer: [140, 93], golem: [160, 160], rat: [70, 70], slime: [156, 156], bat: [87, 87], boar: [96, 64], boarwarrior: [160, 112], mimic: [146, 146], necro: [128, 128] };
// NightBorne ships as one sheet with rows: [row, frames, fps, loop]
const NB_ROWS: Record<string, [number, number, number, boolean]> = {
  IDLE: [0, 9, 10, true], RUN: [1, 6, 12, true], ATTACK: [2, 12, 14, false], HIT: [3, 5, 12, false], DIE: [4, 23, 14, false],
};
const LOOPING = ["IDLE", "WALK", "RUN", "FLY"];

export function preloadAssets(scene: Phaser.Scene) {
  scene.load.on("loaderror", (f: { key: string }) => console.warn("[assets] missing", f.key));
  const hero = heroById(SaveManager.loadMeta().hero);
  if (scene.textures.exists("hero")) scene.textures.remove("hero");
  scene.load.spritesheet("hero", mediaUrl(hero.sheet), { frameWidth: hero.frame[0], frameHeight: hero.frame[1] });
  for (const [name, files] of Object.entries(ENEMY_FILES)) {
    const [fw, fh] = FRAME[name] ?? [150, 150];
    for (const f of files) scene.load.spritesheet(`${name}/${f}`, mediaUrl(`enemies/${name}/${f}.png`), { frameWidth: fw, frameHeight: fh });
  }
  scene.load.spritesheet("nightborne", mediaUrl("enemies/nightborne/SHEET.png"), { frameWidth: 80, frameHeight: 80 });
  queueMap(scene, scene.game.registry.get("initialMap") ?? 0);
  if (!scene.cache.audio.exists("music")) {
    scene.load.audio("music", mediaUrl("cyber-rooftops.mp3"));
  }
}

export function registerAnimations(scene: Phaser.Scene) {
  const A = scene.anims;
  const hero = heroById(SaveManager.loadMeta().hero);
  const rates: Record<string, number> = { idle: 6, run: 12, jump: 12, fall: 10, attack1: 16, attack2: 16, attack3: 16, "air-attack1": 16, hurt: 10, die: 9, slide: 14, smrslt: 18, crouch: 10, "cast-loop": 10 };
  const loops = ["idle", "run", "fall", "slide", "smrslt", "cast-loop"];
  const base = heroById("adventurer").anims;
  for (const [k, [s, e]] of Object.entries(hero.anims)) {
    if (A.exists("h_" + k)) A.remove("h_" + k);
    // match the Wanderer's timing so combos feel the same whichever hero is picked
    const [bs, be] = base[k] ?? [s, e];
    const dur = (be - bs + 1) / (rates[k] ?? 10);
    A.create({ key: "h_" + k, frames: A.generateFrameNumbers("hero", { start: s, end: e }), frameRate: (e - s + 1) / dur, repeat: loops.includes(k) ? -1 : 0 });
  }
  if (A.exists("goblin/IDLE")) return;
  for (const [name, files] of Object.entries(ENEMY_FILES))
    for (const f of files) {
      const key = `${name}/${f}`;
      if (!scene.textures.exists(key) || scene.textures.get(key).key === "__MISSING") continue;
      const frames = A.generateFrameNumbers(key, {});
      // long strips (e.g. the Necromancer) play faster so every animation lasts a sensible time
      const maxDur = f === "ATTACK" ? 1.0 : f === "DIE" ? 1.4 : f === "HIT" ? 0.35 : 1.6;
      A.create({ key, frames, frameRate: Math.max(f === "ATTACK" ? 13 : 11, frames.length / maxDur), repeat: LOOPING.includes(f) ? -1 : 0 });
    }
  if (scene.textures.exists("nightborne"))
    for (const [f, [row, n, fps, loop]] of Object.entries(NB_ROWS))
      A.create({ key: `nightborne/${f}`, frames: A.generateFrameNumbers("nightborne", { start: row * 23, end: row * 23 + n - 1 }), frameRate: fps, repeat: loop ? -1 : 0 });
}

/** Returns an existing animation key for the requested role, falling back gracefully. */
export function resolveAnim(scene: Phaser.Scene, def: EnemyDef, role: keyof EnemyDef["anims"]): string | null {
  const order: (keyof EnemyDef["anims"])[] = [role, "idle", "move"];
  for (const r of order) if (scene.anims.exists(def.anims[r])) return def.anims[r];
  return null;
}

export function allEnemyDefs(): EnemyDef[] {
  return [...Object.values(ENEMIES), BOSS.def];
}

export function makeProceduralTextures(scene: Phaser.Scene) {
  if (scene.textures.exists("dot")) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1).fillCircle(4, 4, 4).generateTexture("dot", 8, 8).clear();
  g.fillStyle(0xffffff, 1).fillRect(0, 0, 2, 2).generateTexture("px", 2, 2).clear();
  g.fillStyle(0x3a1b1b, 1).fillRoundedRect(3, 5, 10, 11, 4);
  g.fillStyle(0xd8323c, 1).fillRoundedRect(4, 7, 8, 8, 3);
  g.fillStyle(0xff8f8f, 1).fillRect(6, 8, 2, 3);
  g.fillStyle(0xc9a26b, 1).fillRect(6, 2, 4, 3);
  g.generateTexture("potion", 16, 17).clear();
  g.fillStyle(0x7a4a10, 1).fillCircle(4, 4, 4);
  g.fillStyle(0xf6c445, 1).fillCircle(4, 4, 3.2);
  g.fillStyle(0xfff1a8, 1).fillRect(3, 2, 1, 4);
  g.generateTexture("coin", 8, 8).clear();
  for (let i = 0; i < 40; i++) g.fillStyle(0xe8fbff, (1 - Math.abs(i - 20) / 20) * 0.5).fillRect(i, 0, 1, 120);
  g.generateTexture("pillar", 40, 120).clear();
  g.lineStyle(2, 0xffffff, 1).strokeCircle(32, 32, 30).generateTexture("ring", 64, 64).clear();
  g.fillStyle(0xffffff, 1).fillEllipse(16, 8, 32, 16).generateTexture("wave", 32, 16).destroy();
}

/** Queue one area's art; areas load one at a time so phones start fast. */
export function queueMap(scene: Phaser.Scene, index: number) {
  const m = MAPS[index % MAPS.length];
  if (!m) return false;
  if (!scene.textures.exists(`ground_${m.id}`)) scene.load.image(`ground_${m.id}`, mediaUrl(`maps/${m.id}/ground.png`));
  m.layers.forEach((_l, i) => { if (!scene.textures.exists(`bg_${m.id}_${i}`)) scene.load.image(`bg_${m.id}_${i}`, mediaUrl(`maps/${m.id}/bg${i}.png`)); });
  m.props.forEach((_p, i) => { if (!scene.textures.exists(`prop_${m.id}_${i}`)) scene.load.image(`prop_${m.id}_${i}`, mediaUrl(`maps/${m.id}/props/${i}.png`)); });
  return true;
}

/** Make sure an area's art is loaded, then run cb. */
export function loadMap(scene: Phaser.Scene, index: number, cb: () => void) {
  const m = MAPS[index % MAPS.length];
  if (!m) return;
  const ready = () => scene.textures.exists(`ground_${m.id}`) && m.layers.every((_l, i) => scene.textures.exists(`bg_${m.id}_${i}`)) && m.props.every((_p, i) => scene.textures.exists(`prop_${m.id}_${i}`));
  if (ready()) return cb();
  if (scene.load.isLoading()) return void scene.load.once("complete", () => loadMap(scene, index, cb));
  queueMap(scene, index);
  scene.load.once("complete", () => cb());
  scene.load.start();
}

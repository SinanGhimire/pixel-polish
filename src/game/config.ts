// ============================================================
// CENTRAL GAME CONFIGURATION — rebalance everything from here.
// ============================================================

import mapsJson from "./maps.json";

export const VIEW = { WIDTH: 640, HEIGHT: 360, TILE: 16, ROWS: 14, ZOOM: 1.6, GROUND_HEIGHT: 2 };

// Arena maps (Anokolisa Legacy packs). The map changes every wave, cycling through this list.
// Every map is built from its pack's own tileset: ground.png (3x3 tiles), bgN.png backdrops, props/N.png set dressing.
export type MapDef = { id: string; name: string; outdoor: boolean; floor?: boolean; music?: string; layers: number[][]; props: number[][] };
export const MAPS: MapDef[] = mapsJson as MapDef[];

// Portal + map transition (after each wave a portal opens; walking in wipes to the next map).
export const PORTAL = { DISTANCE: 150, WIPE_MS: 480, HOLD_MS: 220 };

// Echo — every INTERVAL ms of play, your recorded past self returns as a ghost fighter.
export const ECHO = { INTERVAL: 30000, MAX: 4, LOOPS: 2, DAMAGE_MULT: 0.6, CHECKPOINT_MS: 200, SNAP_DIST: 6, ALPHA: 0.72, TINT: 0x8fe3ff };

export const PLAYER = {
  SPEED: 150,
  ACCELERATION: 0.35, // lerp factor toward target speed on ground
  DECELERATION: 0.45,
  AIR_CONTROL: 0.2,
  JUMP_FORCE: 400,
  DOUBLE_JUMP_FORCE: 360,
  GRAVITY: 1150,
  COYOTE_TIME: 100,
  JUMP_BUFFER_TIME: 120,
  MAX_HP: 600,
  BASE_DAMAGE: 34,
  CRIT_CHANCE: 0.08,
  IFRAMES: 800,
  DASH_SPEED: 380,
  DASH_TIME: 190,
  DASH_COOLDOWN: 650,
};

export const COMBAT = {
  COMBO_WINDOW: 380, // ms after a swing ends where the next swing chains
  ATTACK_COOLDOWN: 140, // ms after a full combo ends
  COMBO_DAMAGE: [1, 1.2, 1.7],
  COMBO_REACH: [34, 36, 44],
  AIR_DAMAGE: 1.1,
  CRIT_MULT: 2,
  HITSTOP: 55,
  HITSTOP_HEAVY: 95,
  KNOCKBACK: 150,
  HEAVY_KNOCKBACK: 270,
  ENEMY_HITSTUN: 320,
  BLOCK_REDUCTION: 0.8,
  PARRY_WINDOW: 170,
  PARRY_STUN: 1100,
  PLAYER_KNOCKBACK: 220,
};

export const SPECIAL = {
  MAX: 100,
  ON_HIT: 4,
  ON_KILL: 10,
  ON_COMBO_TIER: 6,
  DAMAGE_MULT: 3.2,
  RADIUS: 120,
};

export const PROGRESSION = {
  XP_BASE: 100,
  XP_PER_LEVEL: 50, // required = XP_BASE + level * XP_PER_LEVEL
};

export const SCALING = {
  HP_PER_WAVE: 0.12,
  DMG_PER_WAVE: 0.08,
  SPEED_PER_WAVE: 0.025,
  SPEED_CAP: 0.25,
};

export const WAVES = {
  BOSS_EVERY: 10,
  SHOP_EVERY: 5,
  MAX_COUNT: 16,
  SPAWN_INTERVAL: 1400,
  MIN_SPAWN_INTERVAL: 650,
  MAX_ALIVE_BASE: 3,
  MAX_ALIVE_CAP: 7,
  MIN_SPAWN_DIST: 200,
  CLEAR_COINS_BASE: 10,
  CLEAR_COINS_PER_WAVE: 4,
  CLEAR_XP_PER_WAVE: 12,
  SUMMARY_TIME: 2400,
};

export const COMBO = {
  TIMEOUT: 2600,
  TIERS: [
    { hits: 5, mult: 1.1 },
    { hits: 10, mult: 1.25 },
    { hits: 20, mult: 1.5 },
    { hits: 30, mult: 2 },
  ],
};

export type EnemyTier = "basic" | "strong" | "boss";
export type EnemyAnimSet = { idle: string; move: string; attack: string; hurt: string; death: string };
export type EnemyDef = {
  tier: EnemyTier;
  health: number;
  damage: number;
  speed: number;
  xp: number;
  coins: number;
  range: number;
  detect: number;
  attackCooldown: number;
  hitFrame: number;
  fly?: boolean;
  scale: number;
  body: [number, number, number, number];
  sheet: { key: string; frameWidth: number; frameHeight: number };
  anims: EnemyAnimSet;
};

// Sprite sheets live in /public/game/enemies/<name>/<ANIM>.png
const mcf = (name: string, move: string, extra: Partial<EnemyDef>): Omit<EnemyDef, "tier" | "health" | "damage" | "speed" | "xp" | "coins"> => ({
  range: 38,
  detect: 190,
  attackCooldown: 1300,
  hitFrame: 7,
  scale: 1,
  body: [26, 36, 62, 65],
  sheet: { key: name, frameWidth: 150, frameHeight: 150 },
  anims: { idle: `${name}/IDLE`, move: `${name}/${move}`, attack: `${name}/ATTACK`, hurt: `${name}/HIT`, death: `${name}/DIE` },
  ...extra,
});

export const ENEMIES: Record<string, EnemyDef> = {
  goblin: { tier: "basic", health: 90, damage: 34, speed: 95, xp: 10, coins: 3, ...mcf("goblin", "RUN", { body: [26, 34, 62, 67] }) },
  mushroom: { tier: "basic", health: 110, damage: 38, speed: 55, xp: 12, coins: 3, ...mcf("mushroom", "RUN", { body: [24, 36, 63, 65], range: 36 }) },
  flyingeye: { tier: "basic", health: 70, damage: 30, speed: 75, xp: 12, coins: 3, ...mcf("flyingeye", "FLY", { fly: true, body: [30, 26, 60, 63], range: 40, detect: 230 }) },
  skeleton: { tier: "strong", health: 200, damage: 60, speed: 45, xp: 25, coins: 7, ...mcf("skeleton", "WALK", { body: [28, 44, 61, 57], range: 46, attackCooldown: 1500 }) },
  bringer: { tier: "strong", health: 240, damage: 66, speed: 50, xp: 30, coins: 8, ...mcf("bringer", "WALK", { body: [26, 50, 22, 42], range: 70, attackCooldown: 1700, hitFrame: 5, sheet: { key: "bringer", frameWidth: 140, frameHeight: 93 } }) },
  golem: { tier: "strong", health: 320, damage: 72, speed: 38, xp: 34, coins: 9, ...mcf("golem", "WALK", { body: [40, 80, 60, 45], range: 52, attackCooldown: 1900, hitFrame: 4, sheet: { key: "golem", frameWidth: 160, frameHeight: 160 } }) },
  rat: { tier: "basic", health: 60, damage: 26, speed: 110, xp: 8, coins: 2, ...mcf("rat", "RUN", { body: [24, 20, 23, 25], hitFrame: 6, sheet: {key: "rat", frameWidth: 70, frameHeight: 70}, range: 40 }) },
  slime: { tier: "basic", health: 100, damage: 30, speed: 45, xp: 10, coins: 3, ...mcf("slime", "WALK", { body: [26, 18, 65, 69], hitFrame: 10, sheet: {key: "slime", frameWidth: 156, frameHeight: 156}, range: 42 }) },
  bat: { tier: "basic", health: 55, damage: 26, speed: 90, xp: 10, coins: 3, ...mcf("bat", "FLY", { body: [32, 33, 31, 29], hitFrame: 6, sheet: {key: "bat", frameWidth: 87, frameHeight: 87}, fly: true, detect: 240, range: 48, scale: 0.7 }) },
  boar: { tier: "basic", health: 120, damage: 40, speed: 120, xp: 13, coins: 4, ...mcf("boar", "RUN", { body: [31, 39, 31, 25], hitFrame: 3, sheet: {key: "boar", frameWidth: 96, frameHeight: 64}, range: 47 }) },
  boarwarrior: { tier: "strong", health: 280, damage: 70, speed: 48, xp: 32, coins: 9, ...mcf("boarwarrior", "WALK", { body: [47, 63, 51, 49], hitFrame: 4, sheet: {key: "boarwarrior", frameWidth: 160, frameHeight: 112}, range: 56, scale: 0.85 }) },
  mimic: { tier: "strong", health: 230, damage: 64, speed: 60, xp: 30, coins: 10, ...mcf("mimic", "WALK", { body: [25, 30, 64, 53], hitFrame: 7, sheet: {key: "mimic", frameWidth: 146, frameHeight: 146}, range: 48 }) },
  necro: { tier: "strong", health: 210, damage: 62, speed: 40, xp: 30, coins: 9, ...mcf("necro", "WALK", { body: [16, 49, 60, 47], hitFrame: 25, sheet: {key: "necro", frameWidth: 128, frameHeight: 128}, range: 64, attackCooldown: 2000 }) },
};

export const ELITE = {
  START_WAVE: 4,
  BASE_CHANCE: 0.08,
  CHANCE_PER_WAVE: 0.025,
  MAX_CHANCE: 0.35,
  HP_MULT: 2.6,
  DMG_MULT: 1.5,
  SPEED_MULT: 1.2,
  XP: 60,
  COIN_MULT: 4,
  SCALE: 1.25,
  DASH_COOLDOWN: 3200,
};

export const BOSS = {
  name: "The Nightborne",
  def: {
    tier: "boss",
    health: 2600,
    damage: 85,
    speed: 85,
    xp: 250,
    coins: 150,
    range: 70,
    detect: 2000,
    attackCooldown: 1100,
    hitFrame: 10,
    scale: 2,
    body: [26, 28, 23, 36],
    sheet: { key: "nightborne", frameWidth: 80, frameHeight: 80 },
    anims: { idle: "nightborne/IDLE", move: "nightborne/RUN", attack: "nightborne/ATTACK", hurt: "nightborne/HIT", death: "nightborne/DIE" },
  } as EnemyDef,
  PHASES: [0.7, 0.4], // hp ratios where phase 2 and 3 begin
  LUNGE_SPEED: 430,
  LUNGE_COOLDOWN: 3400,
  ENRAGE_SPEED_MULT: 1.45,
  ENRAGE_COOLDOWN_MULT: 0.6,
  SUMMON_INTERVAL: 7000,
  SUMMON_MAX: 3,
  SHOCKWAVE_DAMAGE: 55,
  SHOCKWAVE_SPEED: 220,
};

export const SHOP_ITEMS = [
  { id: "heal", name: "Healing Draught", desc: "Restore 50% of your health", cost: 30, icon: "❤" },
  { id: "rage", name: "Berserker Brew", desc: "+50% damage for the next wave", cost: 45, icon: "⚔" },
  { id: "maxhp", name: "Oaken Heart", desc: "+100 max health", cost: 60, icon: "✚" },
  { id: "special", name: "Soul Ember", desc: "Fill your special meter", cost: 35, icon: "✦" },
];

export const DROPS = { POTION_CHANCE: 0.06, POTION_HEAL: 0.25 };

// Permanent perks bought with souls on the title screen (work-towards progression).
export const PERKS = {
  vitality: { name: "Vitality", desc: "+60 max health", per: 60, max: 10, cost: 80, growth: 1.45 },
  might: { name: "Might", desc: "+4 damage", per: 4, max: 10, cost: 100, growth: 1.5 },
  swiftness: { name: "Swiftness", desc: "+5 move speed", per: 5, max: 6, cost: 90, growth: 1.5 },
  fortune: { name: "Fortune", desc: "+10% souls per run", per: 0.1, max: 5, cost: 150, growth: 1.6 },
} as const;

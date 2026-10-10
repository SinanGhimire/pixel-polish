// Pure gameplay rules (no Phaser) — unit tested.
import { COMBO, ELITE, ENEMIES, PLAYER, PROGRESSION, SCALING, WAVES } from "./config";

export function xpForLevel(lvl: number): number {
  return PROGRESSION.XP_BASE + lvl * PROGRESSION.XP_PER_LEVEL;
}

export function addXp(lvl: number, xp: number, gain: number) {
  const g = Number.isFinite(gain) && gain > 0 ? Math.round(gain) : 0;
  let l = lvl;
  let x = xp + g;
  let ups = 0;
  while (x >= xpForLevel(l) && ups < 20) {
    x -= xpForLevel(l);
    l++;
    ups++;
  }
  return { lvl: l, xp: x, ups };
}

export function waveScaling(wave: number) {
  const w = Math.max(0, wave - 1);
  return {
    hp: 1 + w * SCALING.HP_PER_WAVE,
    dmg: 1 + w * SCALING.DMG_PER_WAVE,
    speed: 1 + Math.min(w * SCALING.SPEED_PER_WAVE, SCALING.SPEED_CAP),
  };
}

export type WaveDef = {
  number: number;
  boss: boolean;
  count: number;
  types: string[];
  spawnInterval: number;
  maxAlive: number;
  eliteChance: number;
  rewardCoins: number;
  rewardXp: number;
};

export function enemyCount(wave: number): number {
  if (wave <= 4) return 2 + wave; // 3,4,5,6
  return Math.min(WAVES.MAX_COUNT, 6 + Math.floor((wave - 4) * 0.6));
}

export function waveDef(wave: number): WaveDef {
  const boss = wave % WAVES.BOSS_EVERY === 0;
  const basics = Object.keys(ENEMIES).filter((k) => ENEMIES[k]!.tier === "basic");
  const strongs = Object.keys(ENEMIES).filter((k) => ENEMIES[k]!.tier === "strong");
  let types: string[];
  if (wave <= 3) types = basics.filter((k) => !ENEMIES[k]!.fly);
  else if (wave <= 7) types = [...basics, ...strongs];
  else types = [...basics, ...strongs, ...strongs];
  return {
    number: wave,
    boss,
    count: boss ? 0 : enemyCount(wave),
    types,
    spawnInterval: Math.max(WAVES.MIN_SPAWN_INTERVAL, WAVES.SPAWN_INTERVAL - wave * 45),
    maxAlive: Math.min(WAVES.MAX_ALIVE_CAP, WAVES.MAX_ALIVE_BASE + Math.floor(wave / 3)),
    eliteChance: wave < ELITE.START_WAVE ? 0 : Math.min(ELITE.MAX_CHANCE, ELITE.BASE_CHANCE + (wave - ELITE.START_WAVE) * ELITE.CHANCE_PER_WAVE),
    rewardCoins: WAVES.CLEAR_COINS_BASE + wave * WAVES.CLEAR_COINS_PER_WAVE,
    rewardXp: wave * WAVES.CLEAR_XP_PER_WAVE,
  };
}

export function comboMultiplier(hits: number): number {
  let m = 1;
  for (const t of COMBO.TIERS) if (hits >= t.hits) m = t.mult;
  return m;
}

export type Upgrade = { id: string; name: string; desc: string; icon: string; maxStacks: number };
export const UPGRADES: Upgrade[] = [
  { id: "damage", name: "Power", desc: "+8% attack damage", icon: "⚔", maxStacks: 5 },
  { id: "vitality", name: "Vitality", desc: "+10% max HP (and heal that amount)", icon: "❤", maxStacks: 5 },
  { id: "speed", name: "Wind Step", desc: "+10% movement speed", icon: "➶", maxStacks: 3 },
  { id: "atkspeed", name: "Blade Dance", desc: "+8% attack speed", icon: "✶", maxStacks: 5 },
  { id: "wisdom", name: "Wisdom", desc: "+10% XP gain", icon: "✧", maxStacks: 5 },
  { id: "defense", name: "Iron Skin", desc: "+5% defense", icon: "⛨", maxStacks: 5 },
  { id: "crit", name: "Keen Edge", desc: "+5% critical chance", icon: "✦", maxStacks: 5 },
  { id: "focus", name: "Focus", desc: "+10% special meter gain", icon: "◈", maxStacks: 5 },
  { id: "stone", name: "Stoneroot", desc: "+10% knockback resistance", icon: "▣", maxStacks: 3 },
  { id: "mend", name: "Mending", desc: "+5% healing effectiveness", icon: "✚", maxStacks: 5 },
];

export type Stats = {
  hp: number;
  maxHp: number;
  lvl: number;
  xp: number;
  damage: number;
  speed: number;
  atkSpeed: number;
  xpMult: number;
  defense: number;
  crit: number;
  specialMult: number;
  kbResist: number;
  healMult: number;
  stacks: Record<string, number>;
};

export function freshStats(): Stats {
  return {
    hp: PLAYER.MAX_HP,
    maxHp: PLAYER.MAX_HP,
    lvl: 1,
    xp: 0,
    damage: PLAYER.BASE_DAMAGE,
    speed: PLAYER.SPEED,
    atkSpeed: 1,
    xpMult: 1,
    defense: 0,
    crit: PLAYER.CRIT_CHANCE,
    specialMult: 1,
    kbResist: 0,
    healMult: 1,
    stacks: {},
  };
}

export function availableUpgrades(stacks: Record<string, number>): Upgrade[] {
  return UPGRADES.filter((u) => (stacks[u.id] ?? 0) < u.maxStacks);
}

export function pickUpgrades(stacks: Record<string, number>, rand: () => number = Math.random): Upgrade[] {
  const pool = availableUpgrades(stacks);
  const out: Upgrade[] = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]!);
  return out;
}

export function applyUpgrade(s: Stats, id: string): Stats {
  const u = UPGRADES.find((x) => x.id === id);
  const cur = s.stacks[id] ?? 0;
  if (!u || cur >= u.maxStacks) return s;
  const n: Stats = { ...s, stacks: { ...s.stacks, [id]: cur + 1 } };
  if (id === "damage") n.damage = s.damage * 1.08;
  if (id === "vitality") {
    const add = Math.round(s.maxHp * 0.1);
    n.maxHp = s.maxHp + add;
    n.hp = Math.min(n.maxHp, s.hp + add);
  }
  if (id === "speed") n.speed = s.speed * 1.1;
  if (id === "atkspeed") n.atkSpeed = s.atkSpeed * 1.08;
  if (id === "wisdom") n.xpMult = s.xpMult + 0.1;
  if (id === "defense") n.defense = Math.min(0.6, s.defense + 0.05);
  if (id === "crit") n.crit = s.crit + 0.05;
  if (id === "focus") n.specialMult = s.specialMult + 0.1;
  if (id === "stone") n.kbResist = Math.min(0.6, s.kbResist + 0.1);
  if (id === "mend") n.healMult = s.healMult + 0.05;
  return n;
}

/** Incoming damage after defense / block. Never NaN, never negative HP. */
export function resolveIncoming(hp: number, raw: number, defense: number, blockReduction: number) {
  const r = Number.isFinite(raw) && raw > 0 ? raw : 0;
  const taken = Math.max(1, Math.round(r * (1 - defense) * (1 - blockReduction)));
  const safeHp = Number.isFinite(hp) ? hp : 0;
  return { hp: Math.max(0, safeHp - taken), taken };
}

export function heal(hp: number, maxHp: number, amount: number, healMult: number) {
  return Math.min(maxHp, Math.max(0, hp + Math.max(0, amount) * healMult));
}

// ---------- Meta progression (souls earned per run, spent on permanent perks / heroes) ----------
import { PERKS } from "./config";
import type { PerkId } from "./save";

/** Souls a finished run is worth. */
export function soulsForRun(wave: number, coins: number, fortuneLvl = 0): number {
  return Math.round((wave * 12 + coins) * (1 + fortuneLvl * PERKS.fortune.per));
}

/** Price of the next level of a perk, or null when maxed. */
export function perkCost(id: PerkId, lvl: number): number | null {
  const p = PERKS[id];
  return lvl >= p.max ? null : Math.round(p.cost * Math.pow(p.growth, lvl));
}

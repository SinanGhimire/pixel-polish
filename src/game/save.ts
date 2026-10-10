// SaveManager — persistent records + settings in localStorage (browser only).
export type Settings = { music: number; sfx: number; shake: boolean; particles: boolean };
export type Records = { bestWave: number; bestLevel: number; bestScore: number; totalCoins: number };

export type PerkId = "vitality" | "might" | "swiftness" | "fortune";
export type Meta = { souls: number; hero: string; unlocked: string[]; perks: Record<PerkId, number> };
const MKEY = "duskhollow.meta";
const DEFAULT_META: Meta = { souls: 0, hero: "adventurer", unlocked: ["adventurer"], perks: { vitality: 0, might: 0, swiftness: 0, fortune: 0 } };

const SKEY = "duskhollow.settings";
const RKEY = "duskhollow.records";
export const DEFAULT_SETTINGS: Settings = { music: 0.5, sfx: 0.8, shake: true, particles: true };
const DEFAULT_RECORDS: Records = { bestWave: 0, bestLevel: 1, bestScore: 0, totalCoins: 0 };

function read<T>(k: string, d: T): T {
  try {
    const raw = localStorage.getItem(k);
    return raw ? { ...d, ...JSON.parse(raw) } : d;
  } catch {
    return d;
  }
}

export const SaveManager = {
  loadSettings: () => read(SKEY, DEFAULT_SETTINGS),
  saveSettings: (s: Settings) => localStorage.setItem(SKEY, JSON.stringify(s)),
  loadRecords: () => read(RKEY, DEFAULT_RECORDS),
  loadMeta: (): Meta => {
    const m = read(MKEY, DEFAULT_META);
    return { ...m, perks: { ...DEFAULT_META.perks, ...m.perks } };
  },
  saveMeta: (m: Meta) => localStorage.setItem(MKEY, JSON.stringify(m)),
  submitRun(run: { wave: number; level: number; score: number; coins: number }) {
    const r = read(RKEY, DEFAULT_RECORDS);
    const n: Records = {
      bestWave: Math.max(r.bestWave, run.wave),
      bestLevel: Math.max(r.bestLevel, run.level),
      bestScore: Math.max(r.bestScore, run.score),
      totalCoins: r.totalCoins + run.coins,
    };
    localStorage.setItem(RKEY, JSON.stringify(n));
    return n;
  },
};

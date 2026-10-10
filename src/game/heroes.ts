// Playable heroes. Each hero maps its own sheet onto the shared h_* animation names the Player controller uses.
import adventurerAnims from "./heroAnims.json";
import paladinAnims from "./paladinAnims.json";

export type HeroDef = {
  id: string;
  name: string;
  blurb: string;
  sheet: string;
  frame: [number, number];
  body: [number, number, number, number];
  anims: Record<string, [number, number]>;
  /** how long one play of each animation lasts (seconds) — keeps combat timing identical across heroes */
  speed: number;
  /** souls needed to unlock (0 = free) */
  cost: number;
  hp: number;
  damage: number;
};

export const HEROES: HeroDef[] = [
  { id: "adventurer", name: "The Wanderer", blurb: "Swift blade, balanced", sheet: "player/hero.png", frame: [50, 37], body: [14, 28, 18, 8], anims: adventurerAnims as unknown as Record<string, [number, number]>, speed: 1, cost: 0, hp: 0, damage: 0 },
  { id: "paladin", name: "The Paladin", blurb: "Holy hammer, +150 health", sheet: "player/paladin.png", frame: [128, 80], body: [14, 28, 57, 36], anims: paladinAnims as unknown as Record<string, [number, number]>, speed: 1, cost: 400, hp: 150, damage: 6 },
];

export const heroById = (id: string) => HEROES.find((h) => h.id === id) ?? HEROES[0]!;

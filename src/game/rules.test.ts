import { describe, expect, it } from "vitest";
import { addXp, applyUpgrade, enemyCount, freshStats, pickUpgrades, resolveIncoming, waveDef, waveScaling, xpForLevel } from "./rules";

describe("progression", () => {
  it("required xp is 100 + level × 50", () => {
    expect(xpForLevel(1)).toBe(150);
    expect(xpForLevel(2)).toBe(200);
  });
  it("overflow xp carries into next level", () => {
    expect(addXp(1, 140, 20)).toEqual({ lvl: 2, xp: 10, ups: 1 });
  });
  it("hero starts with 600 health", () => {
    expect(freshStats().maxHp).toBe(600);
  });
});

describe("waves", () => {
  it("waves 1-4 have 3,4,5,6 enemies", () => {
    expect([1, 2, 3, 4].map(enemyCount)).toEqual([3, 4, 5, 6]);
  });
  it("every 10th wave is a boss wave", () => {
    expect(waveDef(10).boss).toBe(true);
    expect(waveDef(20).boss).toBe(true);
    expect(waveDef(9).boss).toBe(false);
  });
  it("wave scaling follows the formulas", () => {
    const s = waveScaling(11);
    expect(s.hp).toBeCloseTo(2.2);
    expect(s.dmg).toBeCloseTo(1.8);
    expect(s.speed).toBeCloseTo(1.25);
    expect(waveScaling(50).speed).toBeCloseTo(1.25);
  });
});

describe("upgrades", () => {
  it("cannot stack beyond max and maxed upgrades are not offered", () => {
    let s = freshStats();
    for (let i = 0; i < 8; i++) s = applyUpgrade(s, "speed");
    expect(s.stacks["speed"]).toBe(3);
    expect(pickUpgrades(s.stacks).some((u) => u.id === "speed")).toBe(false);
  });
});

describe("damage", () => {
  it("block reduces damage by 80%", () => {
    expect(resolveIncoming(600, 100, 0, 0.8).taken).toBe(20);
  });
  it("health never goes negative or NaN", () => {
    expect(resolveIncoming(10, 500, 0, 0).hp).toBe(0);
    expect(resolveIncoming(100, Number.NaN, 0, 0).hp).toBe(99);
  });
});

import { describe, expect, it } from "vitest";
import { perkCost, soulsForRun } from "./rules";

describe("meta progression", () => {
  it("a run is worth 12 souls per wave plus coins", () => expect(soulsForRun(5, 40)).toBe(100));
  it("fortune adds 10% per level", () => expect(soulsForRun(5, 40, 2)).toBe(120));
  it("perk price grows per level and stops at max", () => {
    expect(perkCost("vitality", 0)).toBe(80);
    expect(perkCost("vitality", 1)).toBe(116);
    expect(perkCost("vitality", 10)).toBeNull();
  });
});

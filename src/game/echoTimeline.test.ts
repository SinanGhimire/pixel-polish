import { describe, expect, it } from "vitest";
import { EchoRecorder, advanceCursor } from "./echoTimeline";
import type { PInput } from "./Player";

const idle: PInput = { left: false, right: false, jumpPressed: false, jumpHeld: false, attack: false, dash: false, block: false, special: false };

describe("Echo timeline", () => {
  it("creates an Echo segment after 30 seconds of play, not before", () => {
    const r = new EchoRecorder(30000, 200);
    let seg = null;
    for (let i = 0; i < 1799; i++) seg = r.push(16.67, idle, 0, 0) ?? seg;
    expect(seg).toBeNull();
    for (let i = 0; i < 2; i++) seg = r.push(16.67, idle, 0, 0) ?? seg;
    expect(seg).not.toBeNull();
    expect(seg!.duration).toBeGreaterThanOrEqual(30000);
  });

  it("replays a skipped attack press instead of dropping it", () => {
    const r = new EchoRecorder(100, 200);
    r.push(10, idle, 0, 0);
    r.push(10, { ...idle, attack: true }, 0, 0);
    r.push(10, idle, 0, 0);
    let seg = null;
    for (let i = 0; i < 10 && !seg; i++) seg = r.push(10, idle, 0, 0);
    const { input } = advanceCursor(seg!, 0, 25);
    expect(input!.attack).toBe(true);
  });
});

// Pure Echo timeline: records per-frame inputs + position checkpoints and cuts them
// into fixed-length segments. No Phaser here so it can be unit tested.
import type { PInput } from "./Player";

export type EchoFrame = { t: number; i: PInput };
export type EchoCheckpoint = { t: number; x: number; y: number };
export type EchoSegment = { duration: number; frames: EchoFrame[]; checkpoints: EchoCheckpoint[]; startX: number; startY: number };

export class EchoRecorder {
  elapsed = 0;
  private frames: EchoFrame[] = [];
  private checkpoints: EchoCheckpoint[] = [];
  private lastCp = -Infinity;
  private startX = 0;
  private startY = 0;

  constructor(
    private interval: number,
    private checkpointMs: number,
  ) {}

  /** Record one frame. Returns a finished segment once `interval` ms have been recorded. */
  push(dt: number, inp: PInput, x: number, y: number): EchoSegment | null {
    if (this.frames.length === 0) {
      this.startX = x;
      this.startY = y;
    }
    this.frames.push({ t: this.elapsed, i: { ...inp } });
    if (this.elapsed - this.lastCp >= this.checkpointMs) {
      this.checkpoints.push({ t: this.elapsed, x, y });
      this.lastCp = this.elapsed;
    }
    this.elapsed += dt;
    if (this.elapsed < this.interval) return null;
    const seg: EchoSegment = { duration: this.elapsed, frames: this.frames, checkpoints: this.checkpoints, startX: this.startX, startY: this.startY };
    this.frames = [];
    this.checkpoints = [];
    this.elapsed = 0;
    this.lastCp = -Infinity;
    return seg;
  }

  get progress() {
    return this.elapsed / this.interval;
  }
}

const PRESS: (keyof PInput)[] = ["jumpPressed", "attack", "dash", "special"];

/** Advances a playback cursor to time t, merging one-shot presses that were skipped over. */
export function advanceCursor(seg: EchoSegment, cursor: number, t: number): { cursor: number; input: PInput | null } {
  let input: PInput | null = null;
  while (cursor < seg.frames.length && seg.frames[cursor]!.t <= t) {
    const f = seg.frames[cursor]!.i;
    if (!input) input = { ...f };
    else {
      const merged: PInput = { ...f };
      for (const k of PRESS) merged[k] = (input[k] || f[k]) as never;
      input = merged;
    }
    cursor++;
  }
  return { cursor, input };
}

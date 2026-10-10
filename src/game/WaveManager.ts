// WaveManager — schedules spawns, tracks completion (spawned all AND all dead), exactly once.
import { waveDef, type WaveDef } from "./rules";

export type WavePhase = "IDLE" | "SPAWNING" | "CLEARED";

export class WaveManager {
  wave = 0;
  def!: WaveDef;
  phase: WavePhase = "IDLE";
  queue: { kind: string; elite: boolean }[] = [];
  spawned = 0;
  killed = 0;
  nextSpawnAt = 0;
  waveXp = 0;
  waveCoins = 0;
  private completed = new Set<number>();

  constructor(private rand: () => number = Math.random) {}

  start(wave: number, now: number) {
    this.wave = wave;
    this.def = waveDef(wave);
    this.phase = "SPAWNING";
    this.spawned = 0;
    this.killed = 0;
    this.waveXp = 0;
    this.waveCoins = 0;
    this.nextSpawnAt = now + 400;
    this.queue = [];
    for (let i = 0; i < this.def.count; i++) {
      const kind = this.def.types[Math.floor(this.rand() * this.def.types.length)]!;
      this.queue.push({ kind, elite: this.rand() < this.def.eliteChance });
    }
    // guarantee an elite on hard waves
    if (wave >= 8 && !this.queue.some((q) => q.elite) && this.queue.length) this.queue[this.queue.length - 1]!.elite = true;
    return this.def;
  }

  /** Returns the next enemy to spawn now, or null. */
  poll(now: number, alive: number) {
    if (this.phase !== "SPAWNING" || !this.queue.length) return null;
    if (now < this.nextSpawnAt || alive >= this.def.maxAlive) return null;
    this.nextSpawnAt = now + this.def.spawnInterval;
    this.spawned++;
    return this.queue.shift()!;
  }

  /** Register an extra (summoned / boss) enemy that belongs to this wave. */
  addExtra() {
    this.spawned++;
  }

  onKill(waveId: number) {
    if (waveId === this.wave) this.killed++;
  }

  /** True exactly once per wave when queue empty AND every spawned enemy is dead. */
  checkComplete(alive: number): boolean {
    if (this.phase !== "SPAWNING") return false;
    if (this.queue.length || alive > 0 || this.killed < this.spawned) return false;
    if (this.completed.has(this.wave)) return false;
    this.completed.add(this.wave);
    this.phase = "CLEARED";
    return true;
  }

  get remaining() {
    return this.queue.length + (this.spawned - this.killed);
  }
}

// Echo — a ghost of your past self that replays a recorded segment with the real PlayerController.
import Phaser from "phaser";
import { ECHO } from "./config";
import { Player, type PlayerHost } from "./Player";
import { advanceCursor, type EchoSegment } from "./echoTimeline";

export interface EchoHost extends PlayerHost {
  echoHitFrame(echo: Echo, key: string): void;
}

export class Echo {
  p: Player;
  t = 0;
  cursor = 0;
  cp = 0;
  loops = 0;
  dead = false;
  label: Phaser.GameObjects.Text;
  private trail = 0;

  constructor(
    private host: EchoHost,
    private seg: EchoSegment,
    public id: number,
  ) {
    // Proxy host: same scene, but hits route to the echo and it never spends special / dies.
    const proxy = Object.create(host) as PlayerHost;
    Object.defineProperty(proxy, "special", { get: () => 0, set: () => {} });
    proxy.heroHitFrame = (key: string) => host.echoHitFrame(this, key);
    proxy.doSpecial = () => {};
    proxy.onPlayerDied = () => {};
    proxy.playAudio = () => {};
    this.p = new Player(proxy, seg.startX, seg.startY);
    this.p.s.setTint(ECHO.TINT).setAlpha(ECHO.ALPHA).setDepth(5.5);
    this.label = host.add.text(seg.startX, seg.startY - 30, `ECHO ${id}`, { fontFamily: "Cinzel, serif", fontSize: "7px", color: "#bff0ff", stroke: "#0a2030", strokeThickness: 2 }).setOrigin(0.5).setDepth(7).setResolution(4);
    this.p.s.setAlpha(0);
    host.tweens.add({ targets: this.p.s, alpha: ECHO.ALPHA, duration: 400 });
  }

  get sprite() {
    return this.p.s;
  }

  update(time: number, dt: number) {
    if (this.dead) return;
    this.t += dt;
    if (this.t >= this.seg.duration) {
      this.loops++;
      if (this.loops >= ECHO.LOOPS) return this.fade();
      this.t = 0;
      this.cursor = 0;
      this.cp = 0;
      this.p.s.setPosition(this.seg.startX, this.seg.startY).setVelocity(0, 0);
    }
    const r = advanceCursor(this.seg, this.cursor, this.t);
    this.cursor = r.cursor;
    if (r.input) this.p.update(time, r.input);
    // Drift correction against recorded checkpoints
    while (this.cp < this.seg.checkpoints.length - 1 && this.seg.checkpoints[this.cp + 1]!.t <= this.t) this.cp++;
    const c = this.seg.checkpoints[this.cp];
    const s = this.p.s;
    if (c && Math.abs(c.t - this.t) < 60) {
      const d = Phaser.Math.Distance.Between(s.x, s.y, c.x, c.y);
      if (d > ECHO.SNAP_DIST) s.setPosition(Phaser.Math.Linear(s.x, c.x, 0.35), Phaser.Math.Linear(s.y, c.y, 0.35));
    }
    this.label.setPosition(s.x, s.y - 28);
    // soft after-image trail
    if ((this.trail += dt) > 90 && Math.abs((s.body as Phaser.Physics.Arcade.Body).velocity.x) > 40) {
      this.trail = 0;
      const gh = this.host.add.image(s.x, s.y, "hero", s.frame.name).setFlipX(s.flipX).setTint(ECHO.TINT).setAlpha(0.28).setBlendMode(Phaser.BlendModes.ADD).setDepth(5);
      this.host.tweens.add({ targets: gh, alpha: 0, duration: 380, onComplete: () => gh.destroy() });
    }
  }

  fade() {
    if (this.dead) return;
    this.dead = true;
    this.host.tweens.add({
      targets: [this.p.s, this.label],
      alpha: 0,
      duration: 500,
      onComplete: () => this.destroy(),
    });
  }

  destroy() {
    this.dead = true;
    this.p.shield.destroy();
    this.p.s.destroy();
    this.label.destroy();
  }
}

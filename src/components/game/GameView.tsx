import { useEffect, useRef, useState } from "react";
import type { Upgrade } from "@/game/rules";
import { SaveManager, type Settings } from "@/game/save";
import { SettingsPanel } from "./SettingsPanel";
import { loadBrowserEngine } from "@/game/browserEngine";

type Hud = {
  hp: number; maxHp: number; lvl: number; xp: number; xpNext: number; special: number; specialMax: number;
  coins: number; wave: number; remaining: number; combo: number; comboMult: number; rage: boolean;
  echoIn: number; echoProgress: number; echoes: number; portal: boolean; map: string;
  boss: { name: string; hp: number; max: number; phase: number } | null;
};
type Summary = { wave: number; kills: number; xp: number; coins: number; boss: boolean };
type Over = { wave: number; level: number; kills: number; coins: number; bestCombo: number; score: number; souls?: number; records: { bestWave: number; bestScore: number } };
type ShopState = { items: { id: string; name: string; desc: string; cost: number; icon: string }[]; coins: number; rage: boolean };
type TouchKey = "left" | "right" | "jump" | "attack" | "dash" | "block" | "special";

export function GameView({ onHome, initialMap = 0 }: { onHome: () => void; initialMap?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const gameRef = useRef<any>(null);
  const busRef = useRef<any>(null);
  const touchRef = useRef<Record<TouchKey, boolean>>({ left: false, right: false, jump: false, attack: false, dash: false, block: false, special: false });
  const [hud, setHud] = useState<Hud | null>(null);
  const [notes, setNotes] = useState<{ id: number; text: string; kind: string }[]>([]);
  const [count, setCount] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [choices, setChoices] = useState<Upgrade[] | null>(null);
  const [shop, setShop] = useState<ShopState | null>(null);
  const [paused, setPaused] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [over, setOver] = useState<Over | null>(null);
  const [bossIntro, setBossIntro] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [touch, setTouch] = useState(false);
  const [wipe, setWipe] = useState<"idle" | "in" | "out">("idle");

  useEffect(() => {
    setSettings(SaveManager.loadSettings());
    setTouch(window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window);
    let destroyed = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms));
    let nid = 0;
    (async () => {
      const { Phaser, ArenaScene } = await loadBrowserEngine();
      if (destroyed || !ref.current) return;
      const bus = new Phaser.Events.EventEmitter();
      busRef.current = bus;
      bus.on("hud", (h: Hud) => setHud(h));
      bus.on("notify", (n: { text: string; kind: string }) => {
        const id = ++nid;
        setNotes((a) => [...a.slice(-2), { id, ...n }]);
        later(() => setNotes((a) => a.filter((x) => x.id !== id)), 2200);
      });
      bus.on("countdown", (s: string) => {
        setSummary(null);
        setCount(s);
        if (s === "FIGHT!") later(() => setCount(null), 700);
      });
      bus.on("waveCleared", (s: Summary) => setSummary(s));
      bus.on("levelup", (c: Upgrade[]) => setChoices(c));
      bus.on("shop", (s: ShopState) => {
        setSummary(null);
        setShop(s);
      });
      bus.on("paused", (p: boolean) => setPaused(p));
      bus.on("bossIntro", (n: string) => {
        setBossIntro(n);
        later(() => setBossIntro(null), 2400);
      });
      bus.on("gameover", (o: Over) => setOver(o));
      bus.on("wipe", (w: "in" | "out") => {
        setWipe(w);
        if (w === "out") later(() => setWipe("idle"), 560);
      });
      // match the phone's aspect so the whole screen is used (landscape)
      const aspect = Math.max(1.33, Math.min(2.4, window.innerWidth / Math.max(1, window.innerHeight)));
      const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: ref.current,
        width: Math.round(360 * aspect),
        height: 360,
        pixelArt: true,
        backgroundColor: "#141c22",
        physics: { default: "arcade", arcade: { gravity: { x: 0, y: 1150 } } },
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        input: { activePointers: 4 },
        callbacks: {
          preBoot: (g) => {
            g.registry.set("bus", bus);
            g.registry.set("touch", touchRef.current);
            g.registry.set("initialMap", initialMap);
          },
        },
        scene: [ArenaScene],
      });
      gameRef.current = game;
    })();
    return () => {
      destroyed = true;
      timers.forEach(clearTimeout);
      gameRef.current?.destroy(true);
    };
  }, []);

  const emit = (ev: string, arg?: unknown) => busRef.current?.emit(ev, arg);
  const retry = () => {
    setOver(null);
    setChoices(null);
    setShop(null);
    setSummary(null);
    setPaused(false);
    setCount(null);
    const sc = gameRef.current?.scene.getScene("arena");
    sc?.scene.restart();
  };
  const updateSettings = (s: Settings) => {
    setSettings(s);
    SaveManager.saveSettings(s);
    emit("settings", s);
  };
  const press = (k: TouchKey, v: boolean) => (touchRef.current[k] = v);
  const tbtn = (k: TouchKey, label: string, cls = "") => (
    <button
      className={`touch-btn ${cls}`}
      onPointerDown={(e) => {
        e.preventDefault();
        press(k, true);
      }}
      onPointerUp={() => press(k, false)}
      onPointerLeave={() => press(k, false)}
      onPointerCancel={() => press(k, false)}
    >
      {label}
    </button>
  );

  const pct = (a: number, b: number) => `${Math.max(0, Math.min(100, (a / Math.max(1, b)) * 100))}%`;
  const specialReady = hud && hud.special >= hud.specialMax;

  return (
    <div className="relative h-[100dvh] w-screen touch-none select-none overflow-hidden bg-background">
      <div ref={ref} className="absolute inset-0" onContextMenu={(e) => e.preventDefault()} />
      <div className="vignette pointer-events-none absolute inset-0" />

      {hud && (
        <>
          {/* top-left: level / hp / xp / special */}
          <div className="hud-safe-l pointer-events-none absolute left-2 top-2 flex items-start gap-1.5 md:left-5 md:top-5">
            <div className="hud-heart">
              <svg viewBox="0 0 32 30" className="h-7 w-7 md:h-10 md:w-10">
                <path d="M16 29 3 16C-2 11 1 2 8 2c4 0 6 3 8 5 2-2 4-5 8-5 7 0 10 9 5 14Z" className="fill-hp stroke-hud-edge" strokeWidth="2" />
                <path d="M8 6c-2 0-4 2-4 4" className="stroke-hp-glow" strokeWidth="2" fill="none" strokeLinecap="round" />
              </svg>
            </div>
            <div className="flex flex-col gap-0.5 md:gap-1">
              <div className={`hud-bar hp-bar w-32 md:w-48 lg:w-64 ${hud.hp / hud.maxHp <= 0.3 ? "hp-low" : ""}`}>
                <div className="hud-fill bg-hp-ghost" style={{ width: pct(hud.hp, hud.maxHp), transition: "width 900ms ease 250ms" }} />
                <div className="hud-fill hp-fill" style={{ width: pct(hud.hp, hud.maxHp) }} />
                <div className="hp-ticks" />
                <div className="bar-shine" />
                <span className="hud-text">{hud.hp}/{hud.maxHp}</span>
              </div>
              <div className="hud-bar h-3 w-32 md:h-4 md:w-48 lg:w-64">
                <div className="hud-fill xp-fill" style={{ width: pct(hud.xp, hud.xpNext) }} />
                <div className="bar-shine" />
                <span className="hud-text flex w-full justify-between px-2 text-[9px] md:px-4 md:text-xs">
                  <span>LVL {hud.lvl}</span>
                  <span>{hud.xp}/{hud.xpNext}</span>
                </span>
              </div>
              <div className={`hud-bar h-1.5 w-24 md:h-2 md:w-40 ${specialReady ? "special-ready" : ""}`}>
                <div className="hud-fill special-fill" style={{ width: pct(hud.special, hud.specialMax) }} />
              </div>
              
              <div className="echo-meter">
                <span>ECHO{hud.echoes > 0 ? ` ×${hud.echoes}` : ""}</span>
                <div className="echo-track"><div className="echo-fill" style={{ width: pct(hud.echoProgress, 1) }} /></div>
                <span className="text-muted-foreground">{hud.echoIn}s</span>
              </div>
            </div>
          </div>

          {/* top-center: wave */}
          <div className="hud-safe-r pointer-events-none absolute right-2 top-12 text-right md:right-5 md:top-16">
            <div className="font-display text-base text-parchment drop-shadow-md md:text-2xl">{hud.wave ? `WAVE ${hud.wave}` : ""}</div>
            <div className="font-display hidden text-[10px] tracking-[0.35em] text-special md:block">{hud.map.toUpperCase()}</div>
            {hud.remaining > 0 && <div className="font-display text-[10px] tracking-widest text-muted-foreground md:text-xs">{hud.remaining} LEFT</div>}
            {hud.rage && <div className="font-display text-xs tracking-widest text-hp-glow">BERSERK</div>}
          </div>

          {/* top-right: coins + buttons */}
          <div className="hud-safe-r absolute right-2 top-2 flex items-center gap-2 md:right-5 md:top-5">
            <div className="coin-pill">
              <span className="coin-icon" />
              <span>{hud.coins}</span>
            </div>
            <button className="hud-btn" onClick={() => emit("pause")} aria-label="Pause">
              ❚❚
            </button>
          </div>

          {/* combo */}
          {hud.combo >= 2 && (
            <div key={hud.combo} className="combo pointer-events-none absolute left-1/2 top-[14%] -translate-x-1/2 text-center">
              <div className="font-display text-2xl text-parchment md:text-4xl">x{hud.combo}</div>
              <div className="font-display text-xs tracking-[0.3em] text-xp">COMBO{hud.comboMult > 1 ? ` · ${hud.comboMult}× REWARDS` : ""}</div>
            </div>
          )}

          {/* boss bar */}
          {hud.boss && (
            <div className="pointer-events-none absolute left-1/2 top-2 w-[min(520px,40vw)] -translate-x-1/2 text-center md:top-5 md:w-[min(640px,84vw)]">
              <div className="mb-0.5 font-display text-[10px] tracking-[0.3em] md:mb-1 md:text-lg text-parchment drop-shadow md:text-xl">
                {hud.boss.name.toUpperCase()} {hud.boss.phase >= 3 ? "· ENRAGED" : hud.boss.phase === 2 ? "· II" : ""}
              </div>
              <div className="hud-bar h-2.5 w-full md:h-4">
                <div className="hud-fill bg-hp-ghost" style={{ width: pct(hud.boss.hp, hud.boss.max), transition: "width 1s ease 300ms" }} />
                <div className="hud-fill boss-fill" style={{ width: pct(hud.boss.hp, hud.boss.max) }} />
              </div>
            </div>
          )}
        </>
      )}

      <div className={`wipe ${wipe === "in" ? "wipe-in" : wipe === "out" ? "wipe-out" : ""}`} />
      <div className="rotate-hint">
        <div className="text-5xl text-parchment">⟳</div>
        <div className="font-display text-2xl text-parchment">Turn your phone sideways</div>
        <div className="text-sm text-muted-foreground">Dusk Hollow plays in landscape.</div>
      </div>
      {hud?.portal && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[30%] text-center font-display text-sm tracking-[0.3em] text-special drop-shadow">
          WALK INTO THE PORTAL
        </div>
      )}

      {/* notifications */}
      <div className="pointer-events-none absolute inset-x-0 top-[22%] flex flex-col items-center gap-2">
        {notes.map((n) => (
          <div key={n.id} className={`notify notify-${n.kind}`}>{n.text}</div>
        ))}
      </div>
      {count && (
        <div key={count} className="countdown pointer-events-none absolute inset-0 flex items-center justify-center font-display">
          {count}
        </div>
      )}
      {bossIntro && (
        <div className="boss-intro pointer-events-none absolute inset-x-0 top-[38%] text-center">
          <div className="font-display text-sm tracking-[0.6em] text-hp-glow">BOSS</div>
          <div className="font-display text-5xl text-parchment md:text-7xl">{bossIntro}</div>
        </div>
      )}
      {summary && (
        <div className="summary-card pointer-events-none absolute left-1/2 top-[30%] -translate-x-1/2">
          <div className="font-display text-3xl text-parchment">{summary.boss ? "BOSS SLAIN" : "WAVE CLEARED"}</div>
          <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1 text-left text-sm">
            <span className="text-muted-foreground">Enemies Defeated</span><span className="text-right text-foreground">{summary.kills}</span>
            <span className="text-muted-foreground">XP Earned</span><span className="text-right text-xp">{summary.xp}</span>
            <span className="text-muted-foreground">Coins Earned</span><span className="text-right text-xp">{summary.coins}</span>
          </div>
        </div>
      )}

      {/* mobile controls */}
      {touch && !over && (
        <>
          <div className="absolute bottom-5 left-5 flex gap-3">
            {tbtn("left", "◀")}
            {tbtn("right", "▶")}
          </div>
          <div className="absolute bottom-5 right-5 grid grid-cols-3 gap-2">
            {tbtn("block", "⛨", "touch-sm")}
            {tbtn("special", "✦", `touch-sm ${specialReady ? "touch-glow" : ""}`)}
            {tbtn("dash", "»", "touch-sm")}
            <span />
            {tbtn("attack", "⚔")}
            {tbtn("jump", "▲")}
          </div>
        </>
      )}

      {choices && (
        <div className="overlay">
          <div className="font-display text-sm tracking-[0.4em] text-xp">LEVEL UP!</div>
          <h2 className="mb-8 mt-2 font-display text-3xl text-parchment md:text-4xl">Choose one blessing</h2>
          <div className="flex flex-wrap justify-center gap-4">
            {choices.map((c) => (
              <button key={c.id} className="upgrade-card" onClick={() => { setChoices(null); emit("choose", c.id); }}>
                <div className="text-3xl text-xp">{c.icon}</div>
                <div className="mt-2 font-display text-xl text-parchment">{c.name}</div>
                <div className="mt-2 text-sm text-muted-foreground">{c.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {shop && (
        <div className="overlay">
          <div className="font-display text-sm tracking-[0.4em] text-xp">THE WANDERING MERCHANT</div>
          <h2 className="mt-2 font-display text-3xl text-parchment md:text-4xl">Spend your coin</h2>
          <div className="coin-pill mb-6 mt-3"><span className="coin-icon" /><span>{Math.floor(shop.coins)}</span></div>
          <div className="flex flex-wrap justify-center gap-4">
            {shop.items.map((it) => {
              const off = shop.coins < it.cost || (it.id === "rage" && shop.rage);
              return (
                <button key={it.id} disabled={off} className="upgrade-card disabled:opacity-40" onClick={() => emit("shopBuy", it.id)}>
                  <div className="text-3xl text-xp">{it.icon}</div>
                  <div className="mt-2 font-display text-lg text-parchment">{it.name}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{it.desc}</div>
                  <div className="mt-3 font-display text-xp">{it.cost} coins</div>
                </button>
              );
            })}
          </div>
          <button className="menu-btn mt-8" onClick={() => { setShop(null); emit("shopClose"); }}>Continue</button>
        </div>
      )}

      {paused && !over && (
        <div className="overlay">
          {showSettings && settings ? (
            <>
              <h2 className="mb-6 font-display text-4xl text-parchment">Settings</h2>
              <SettingsPanel value={settings} onChange={updateSettings} />
              <button className="menu-btn mt-8" onClick={() => setShowSettings(false)}>Back</button>
            </>
          ) : (
            <>
              <h2 className="mb-8 font-display text-6xl text-parchment">Paused</h2>
              <div className="flex w-64 flex-col gap-3">
                <button className="menu-btn" onClick={() => emit("resume")}>Resume</button>
                <button className="menu-btn menu-btn-ghost" onClick={() => setShowSettings(true)}>Settings</button>
                <button className="menu-btn menu-btn-ghost" onClick={retry}>Restart</button>
                <button className="menu-btn menu-btn-ghost" onClick={onHome}>Main Menu</button>
              </div>
            </>
          )}
        </div>
      )}

      {over && (
        <div className="overlay">
          <h2 className="font-display text-6xl text-hp-glow md:text-7xl">Game Over</h2>
          <div className="mt-6 grid grid-cols-2 gap-x-10 gap-y-1.5 text-left">
            <span className="text-muted-foreground">Wave Reached</span><span className="text-right font-display text-parchment">{over.wave}</span>
            <span className="text-muted-foreground">Level</span><span className="text-right font-display text-parchment">{over.level}</span>
            <span className="text-muted-foreground">Enemies Defeated</span><span className="text-right font-display text-parchment">{over.kills}</span>
            <span className="text-muted-foreground">Coins Earned</span><span className="text-right font-display text-parchment">{over.coins}</span>
            <span className="text-muted-foreground">Best Combo</span><span className="text-right font-display text-parchment">{over.bestCombo}</span>
            <span className="text-muted-foreground">Score</span><span className="text-right font-display text-xp">{over.score}</span>
            <span className="text-muted-foreground">Souls Gained</span><span className="text-right font-display text-special">+{over.souls ?? 0}</span>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Best wave {over.records.bestWave} · Best score {over.records.bestScore}</p>
          <div className="mt-8 flex gap-4">
            <button className="menu-btn" onClick={retry}>Retry</button>
            <button className="menu-btn menu-btn-ghost" onClick={onHome}>Main Menu</button>
          </div>
        </div>
      )}
    </div>
  );
}

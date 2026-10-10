import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { SaveManager, type Records, type Settings } from "@/game/save";
import { SettingsPanel } from "@/components/game/SettingsPanel";
import { Armory } from "@/components/game/Armory";
import { MAPS } from "@/game/config";
import { mediaUrl } from "@/game/media";
import { Button } from "@/components/ui/button";

const GameView = lazy(() => import("@/components/game/GameView").then((m) => ({ default: m.GameView })));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dusk Hollow — wave survival action platformer" },
      { name: "description", content: "Survive endless waves in the Dusk Woods: combo attacks, parries, elites, upgrades and the Nightborne boss." },
      { property: "og:title", content: "Dusk Hollow — wave survival action platformer" },
      { property: "og:description", content: "Survive endless waves in the Dusk Woods: combo attacks, parries, elites, upgrades and the Nightborne boss." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const [playing, setPlaying] = useState(false);
  const [records, setRecords] = useState<Records | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showArmory, setShowArmory] = useState(false);
  const [initialMap, setInitialMap] = useState(0);
  useEffect(() => {
    if (playing) return;
    setRecords(SaveManager.loadRecords());
    setSettings(SaveManager.loadSettings());
  }, [playing]);

  if (playing)
    return (
      <Suspense fallback={<div className="title-screen" />}>
        <GameView initialMap={initialMap} onHome={() => setPlaying(false)} />
      </Suspense>
    );
  return (
    <main className="title-screen w-full">
      <div className="absolute inset-0">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="title-par" style={{ backgroundImage: `url(${mediaUrl(`maps/p00/bg${i}.png`)})`, animationDuration: `${[160, 90, 55, 32][i]}s` }} />
        ))}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
      </div>
      <div className="relative z-10 flex w-full flex-col items-center justify-center px-4 text-center">
        {showArmory ? (
          <Armory onBack={() => setShowArmory(false)} />
        ) : showSettings && settings ? (
          <>
            <h2 className="mb-6 font-display text-4xl text-parchment">Settings</h2>
            <SettingsPanel value={settings} onChange={(s) => { setSettings(s); SaveManager.saveSettings(s); }} />
            <Button variant="game" size="game" className="mt-8" onClick={() => setShowSettings(false)}>Back</Button>
          </>
        ) : (
          <>
            <h1 className="title-logo font-display">Dusk Hollow</h1>
            <div className="area-picker mt-7">
              <label htmlFor="starting-area">Starting area</label>
              <select id="starting-area" value={initialMap} onChange={(e) => setInitialMap(Number(e.target.value))}>
                {MAPS.map((map, index) => <option key={map.id} value={index}>{map.name}</option>)}
              </select>
            </div>
            <div className="mt-6 flex w-72 flex-col items-stretch gap-3">
              <Button variant="game" size="game" onClick={() => {
                  setPlaying(true);
                  // phones: go fullscreen and lock to landscape (ignored where unsupported)
                  const el = document.documentElement as HTMLElement & { requestFullscreen?: (o?: object) => Promise<void> };
                  if (window.matchMedia("(pointer: coarse)").matches && !document.fullscreenElement && el.requestFullscreen) {
                    el.requestFullscreen({ navigationUI: "hide" })
                      .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.("landscape"))
                      .catch(() => {});
                  }
                }}>Enter the Arena</Button>
              <Button variant="gameGhost" size="game" onClick={() => setShowArmory(true)}>Armory</Button>
              <Button variant="gameGhost" size="game" onClick={() => setShowSettings(true)}>Settings</Button>
            </div>
            {records && records.bestWave > 0 && (
              <p className="mt-6 font-display text-sm text-parchment">Best wave {records.bestWave}</p>
            )}
          </>
        )}
      </div>
    </main>
  );
}

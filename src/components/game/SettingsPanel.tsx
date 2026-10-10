import type { Settings } from "@/game/save";

export function SettingsPanel({ value, onChange }: { value: Settings; onChange: (s: Settings) => void }) {
  const row = "flex items-center justify-between gap-6 font-display text-parchment";
  return (
    <div className="flex w-[min(340px,86vw)] flex-col gap-4">
      <label className={row}>
        Music
        <input type="range" min={0} max={1} step={0.05} value={value.music} onChange={(e) => onChange({ ...value, music: +e.target.value })} className="w-40 accent-primary" />
      </label>
      <label className={row}>
        Sound FX
        <input type="range" min={0} max={1} step={0.05} value={value.sfx} onChange={(e) => onChange({ ...value, sfx: +e.target.value })} className="w-40 accent-primary" />
      </label>
      <label className={row}>
        Screen shake
        <input type="checkbox" checked={value.shake} onChange={(e) => onChange({ ...value, shake: e.target.checked })} className="h-5 w-5 accent-primary" />
      </label>
      <label className={row}>
        Particles
        <input type="checkbox" checked={value.particles} onChange={(e) => onChange({ ...value, particles: e.target.checked })} className="h-5 w-5 accent-primary" />
      </label>
    </div>
  );
}

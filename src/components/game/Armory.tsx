import { useState } from "react";
import { PERKS } from "@/game/config";
import { HEROES } from "@/game/heroes";
import { perkCost } from "@/game/rules";
import { SaveManager, type Meta, type PerkId } from "@/game/save";
import { mediaUrl } from "@/game/media";

/** Title-screen progression: pick a hero, spend souls on permanent perks. */
export function Armory({ onBack }: { onBack: () => void }) {
  const [meta, setMeta] = useState<Meta>(() => SaveManager.loadMeta());
  const save = (m: Meta) => { setMeta(m); SaveManager.saveMeta(m); };
  return (
    <div className="armory mx-auto">
      <div className="flex items-center justify-center gap-3">
        <h2 className="font-display text-2xl text-parchment">Armory</h2>
        <span className="soul-pill">✦ {meta.souls}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {HEROES.map((h) => {
          const owned = meta.unlocked.includes(h.id);
          const active = meta.hero === h.id;
          return (
            <button key={h.id} className={`armory-card ${active ? "armory-active" : ""}`} disabled={!owned && meta.souls < h.cost}
              onClick={() => owned ? save({ ...meta, hero: h.id }) : save({ ...meta, souls: meta.souls - h.cost, unlocked: [...meta.unlocked, h.id], hero: h.id })}>
              <span className="hero-portrait" style={{ backgroundImage: `url(${mediaUrl(h.sheet)})`, ...(h.id === "paladin" ? { backgroundSize: "2367px auto", backgroundPosition: "-55px -32px" } : { backgroundSize: "693px auto", backgroundPosition: "-19px -10px" }) }} />
              <span className="min-w-0 text-center">
                <span className="block truncate font-display text-sm text-parchment">{h.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{active ? "Selected" : owned ? h.blurb : `Unlock ✦ ${h.cost}`}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {(Object.keys(PERKS) as PerkId[]).map((id) => {
          const lvl = meta.perks[id];
          const cost = perkCost(id, lvl);
          return (
            <button key={id} className="armory-card" disabled={cost === null || meta.souls < cost}
              onClick={() => cost !== null && save({ ...meta, souls: meta.souls - cost, perks: { ...meta.perks, [id]: lvl + 1 } })}>
              <span className="min-w-0 flex-1 text-center">
                <span className="block font-display text-sm text-parchment">{PERKS[id].name} <span className="text-xp">{lvl}/{PERKS[id].max}</span></span>
                <span className="block truncate text-[11px] text-muted-foreground">{PERKS[id].desc}</span>
              </span>
              <span className="shrink-0 font-display text-xs text-special">{cost === null ? "MAX" : `✦ ${cost}`}</span>
            </button>
          );
        })}
      </div>
      <button className="menu-btn mx-auto mt-4 block" onClick={onBack}>Back</button>
    </div>
  );
}

<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep the imported Phaser game browser-loaded through GameView; Phaser requires browser APIs and cannot run during SSR.
- Store game media as Lovable asset pointers and resolve it through the media registry; repository-relative binary paths are not portable.
- Define scenery in maps.json and derive all parallax layers from a shared scale and floor baseline; independent layer stretching breaks alignment.
- Render scenery as mirrored image strips and floors as complete surface strips over an invisible collision layer; this avoids NPOT texture corruption, tileset-index assumptions, and mismatched visual/collision baselines.
- Load Phaser and ArenaScene through a createClientOnlyFn boundary; server bundles must not include the browser engine.
- Preserve the original local-device progression system during this repository import; no hosted account or shared persistence was requested.

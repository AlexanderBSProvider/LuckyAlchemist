# Third-party asset credits

Attribution for bundled art. Licenses live next to each pack under `src/assets/`;
craftpix freebies allow unlimited commercial game use but forbid redistributing the
packs themselves as assets ([craftpix.net/file-licenses](https://craftpix.net/file-licenses/)).

| Pack | Source | Used for |
|---|---|---|
| Free Slash Sprite Cartoon Effects (#501088) | [craftpix.net](https://craftpix.net/freebies/free-slash-sprite-cartoon-effects/) | Battle clash FX (`src/render/fx-textures.ts`) |
| Free Vegetables Vector Icon Pack for RPG (#717437) | [craftpix.net](https://craftpix.net/freebies/) | Retired — replaced by game-icons for the reagent icons; pack kept in-repo but unused |
| Free Animated Magic Book Pixel Art (#809047) | [craftpix.net](https://craftpix.net/freebies/) | Reserved for the Alchemist's Journal (Stage 2) — not yet used |

## Engraved icons — game-icons.net (CC-BY 3.0)

The whole engraved-gravure icon language (element symbols, deck tabs, reagents, HUD coin/ash,
potion-flask silhouettes, arena decor, favicon) comes from **[game-icons.net](https://game-icons.net/)**,
delivered via the [`@iconify-json/game-icons`](https://www.npmjs.com/package/@iconify-json/game-icons)
npm package. Licensed **CC-BY 3.0** — attribution is required.

Authors: **Lorc, Delapouite, and contributors** (per-icon authorship at
[game-icons.net](https://game-icons.net/)). Only the handful of SVG paths actually used are
inlined into `src/data/icon-paths.ts` (a few KB) — the full ~6 MB set never enters the bundle.
The paths are rendered as inline `<svg>` in the DOM (`src/ui/icons.ts`) and baked into Pixi
textures in the renderer (`src/render/icon-textures.ts`).

Fonts (self-hosted via `@fontsource`, SIL Open Font License):
[IM Fell English SC](https://fonts.google.com/specimen/IM+Fell+English+SC),
[EB Garamond](https://fonts.google.com/specimen/EB+Garamond).

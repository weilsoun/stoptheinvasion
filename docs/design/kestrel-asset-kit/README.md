# Kestrel cutout asset kit

This handoff is integrated into the active1920×1440 Kestrel combat screen. Exactly ten selected production PNGs are byte-copied under `src/assets/ship/` and imported/decoded by `src/ship/assets.ts` before scene composition. The Canvas compositor and native HUD use the kit while combat and PWA update behavior stay unchanged. Live placement follows shared renderer/input geometry. Source images, review derivatives and this contact sheet remain here rather than in the production payload.

## Contents

- `assets/source/`: unmodified built-in image-generation outputs.
- `assets/production/backgrounds/`: the 1480×660 viewscreen plate.
- `assets/production/ships/`: transparent700×460 enemy cutouts, originally authored at2× the former350×230 pose and now displayed at420×276.
- `assets/production/cards/`: runtime-ready 672×472 action plates matching the existing art window exactly.
- `assets/production/cards-2x/`: 1344×944 review/source derivatives for future higher-resolution compositing.
- `templates/card-frame.svg`: editable760×1080 source-frame reference; `drawShipCardFace` owns the live rarity colors and department footer.
- `templates/ui-chips.svg`: cut-corner chip, target-bracket, and meter primitives.
- `kestrel-cutout.css`: scoped palette, chip, meter, target, and native card-template styles.
- `asset-manifest.json`: exact paths, dimensions, roles, and focal points.
- `index.html`: contact sheet for review; open directly from this directory.
- `PROMPTS.md`: the final normalized prompt set used for the raster assets.
- `IMPLEMENTATION-PROMPT.md`: copy-paste task prompt for the game-engine agent.

## Recommended integration boundary

Keep combat state unchanged and use the current shared `SHIP_*` geometry for rendering and native hit regions. The scene contract includes `setAimTarget` for presentation-only proximity feedback; `setState` receives the displayed battle snapshot. Load raster files once, convert them to PlayCanvas textures, and retain the ownership sets so teardown destroys every texture and material. Generated ship cutouts replace only the image source used by `drawEnemyShipArt`; their transparent hit regions remain native `.enemy-target` buttons.

For cards, retain `drawShipCardFace` as the authoritative compositor. The matching manifest plate fills only its `44,176,672,472` action-art window. Typeset title, cost, effective `previewCard` rules, flavor, rarity, department and dimming at runtime. This preserves Coils previews, research cards, affordability, texture-cache semantics and flight snapshots; classification never changes the generated action plate.

The background replaces only the clipped interior of `SHIP_SCREEN`. Bridge armor, the unlabeled action-bay recess and physical piles remain hand-authored. The live glass has no player miniature or decorative lower bezel: enemy telemetry docks along its bottom edge, while player shots originate from the lower corners and incoming hits affect the pane. Telemetry and the cyan aim reticle remain scene-owned beneath held cards; native accessible descriptions and controls remain. Do not put the source/review kit under `public/`: Workbox would otherwise precache those unused files.

## Palette

| Token | Hex | Use |
| --- | --- | --- |
| Space 900 | `#070D18` | stage and viewscreen void |
| Panel 800 | `#0D1826` | chips and deep panels |
| Warm stock | `#EADBB6` | card stock and modal paper |
| Stock light | `#FFF4D3` | readable light text and highlights |
| Copper | `#C8753F` | structural keylines |
| Copper bright | `#F3AC63` | legal targets and primary action |
| Teal | `#62AAA4` | systems and self actions |
| Shield blue | `#6FB9D0` | shields |
| Hull red | `#D44F49` | hull and damage |
| Energy gold | `#F0C35B` | costs and energy |
| Exhaust rose | `#C84B68` | exhausted pile/state |

## Acceptance notes

- All generated art is text-free. Runtime copy remains native and accessible.
- Ship sources and production derivatives are RGBA with real alpha channels.
- The background is opaque RGB by design.
- The six card plates should be judged at the live 247×351 card size, not only full-screen.
- The kit intentionally does not include expedition, mission, reward, module, repair, or persistence art.
- These assets are model-generated. The integrated spacefield, three ships and six base-card action plates retain that provenance. Bridge structure, card frames/backs, runtime text and deterministic research-card artwork remain original hand-authored Canvas work.

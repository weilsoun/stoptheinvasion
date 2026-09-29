# Visual direction — Kestrel and retained MOREMART art

## Active direction: Kestrel bridge combat

The current playable surface is a scrappy, illustrated space adventure: a framed bridge viewscreen with recognizable hostile spacecraft, a ship-status console and physical illustrated cards beneath it. Use bold silhouettes, inked panel construction, cockpit glazing, engines, distinct weapon silhouettes and restrained flat shading. It is not the former pixel-art store, a photoreal cockpit or workplace parody.

The interface uses deep space `#070D18`, warm stock `#EADBB6`, copper `#C8753F`, teal `#62AAA4` and shield blue `#6FB9D0`. Preserve legible hull/shield/intent readouts, Barlow Condensed body typography and Bebas Neue headings. Keep decorative bridge detail behind the tactical information. Card art shows the actual weapon/system action; six differently labelled generic icons are not sufficient.

`src/ship/art.ts` composes original hand-authored bridge structure, card frames/backs, runtime typography and deterministic research-card recipes with the supplied model-generated Kestrel cutout kit. The live spacefield, three enemy ships and six base-card action plates are model-generated; their source records, exact prompts and production derivatives remain in `docs/design/kestrel-asset-kit/`. Do not describe those promoted images as hand-authored. Card subjects remain a pulse cannon firing, layered shield projection, rail discharge, an amber reserve power cell, a broad tactical scan and exactly two primary cannon bolts.

Use the shared scene/hit-region geometry, including selected-card lift and scale. Native target buttons must not paint over ship artwork on hover. Enlarged physical cards need a scene-owned scrim and unobscured rules; native background HUD is hidden during detail inspection. The active iPad composition uses1920×1440 design coordinates with4:3 containment, not the former16:9 stage.

Live card frame/header colors encode rarity, not department or mechanical kind: Common steel/ivory `#c9cfca`, Uncommon blue `#326b9f`, Rare gold `#d9b45e`. Pulse Cannon and Shield Cycle are Common; Twin Burst, Reserve Cell and Tactical Sweep are Uncommon; Rail Lance is Rare. Footer departments use monochrome crosshair (Weapons: Pulse Cannon, Twin Burst, Rail Lance), gear (Engineering: Shield Cycle, Reserve Cell) and radar (Command: Tactical Sweep) emblems. Print the department and rarity names as well. Keep the action plate unchanged; rarity is presentation metadata, not a damage bonus or acquisition-odds change. Unclassified research recipes display Unrated and use their authored kind for the department.

The agreed deliverable is one complete combat experience, not a full expedition. The following MOREMART sections are retained provenance and historical art direction for the inactive world assets; they are not instructions to restore those subjects or temporal signatures to Kestrel.

### Integrated cutout kit

Only the ten manifest-selected production PNGs are promoted to `src/assets/ship/`: the1480×660 spacefield, three transparent700×460 ships and six672×472 card plates. `src/ship/assets.ts` imports their hashed Vite URLs and decodes all images before scene composition. Source images and `cards-2x` review derivatives remain in the handoff and are not shipped.

The spacefield clips to the existing viewscreen; ships use420×276 regions centered at y410 in three equal columns, shared with native target geometry. Card plates replace only the44/176/672×472 action window. Titles, costs, effective rules, flavor, classification and fading remain runtime-rendered physical-card content. Flat warm stock and restrained inset keylines frame the plates; solid blue-teal technical backs distinguish draw/discard/exhaust with small unlabeled symbols. Unlit unit-emission print materials avoid both glare and unintended darkening. Living ships do not darken with low hull or lost shields.

The bridge shell uses quiet navy/teal armor rather than duplicated painted consoles, instructional labels or scanline haze. The viewscreen has an open lower edge: three440×160 enemy readouts dock flush to its bottom at y820, with names, gauges and intents together instead of floating above/below each ship. Kestrel's own readout stays left. No player miniature appears in the glass. Actual player hits alternate between inset lower corners; incoming fire approaches the viewer and produces restrained whole-pane shield/hull feedback, not an impact on a small player craft. Telemetry remains inside the scene below physical cards, with complete native accessible descriptions and target controls. A single cyan proximity reticle acquires the nearest legal enemy during attack drag without expanding the legal drop area. Preserve native buttons, focus, menus and selected-card controls.


### Requested next direction: first-person cockpit reference

`public/design/kestrel-cockpit-reference.svg` is the self-contained1920×1440 master; the matching PNG is its inspected browser render. This is a designed, data-driven reference, not model-generated artwork or a live UI cutover. It embeds five original card faces and local fonts from an actual turn-one battle, with Rail Lance/Corsair chosen as an illustrative legal selection.

The requested direction is a first-person captain's-chair view: perspective-framed2D cockpit, hull/shield/power on the left console, selection and commands on the right, cards on the foredesk, and3D line-art ships beyond the central window. Intentions occupy a dedicated strip below the window rather than overlapping ships or hand cards. Retain exact damage and recharge information, native accessible controls, safe touch targets and valid-drop feedback when implementing. Department-coloured energy remains a separate unresolved gameplay direction; the image uses current real energy values.

Three.js is the requested future space renderer; the reference contains only static projected silhouettes/structural edges. Prefer dark solid ship surfaces with selected edge lines over a noisy triangle wireframe. A renderer cutover must preserve the existing deterministic combat, physical-card behavior, playback and target alignment; do not claim the reference implements those changes.


## The visual identity

An employee-made safety comic printed on the back of a badly registered store evacuation plan. Cheap paper, expensive mistakes. The store's official graphics are rigid and practical; Bob's interventions are crooked, impatient and useful. Alien time distortion repeats an existing line or mark instead of adding a science-fiction glow.

This is the production art direction for MOREMART. The card/print grammar below preserves thick-ink horror-comedy; the world has a separate pixel-art treatment described below. “Non-AI-looking” means authored visual decisions and consistency, not a claim about which tools were used.

## Three recognizable signatures

1. **The interrupted outline.** A heavy contour has one deliberately placed break at the brightest edge. Interior construction uses fewer, thinner lines. No all-over wobble filter.
2. **The late second impression.** One short orange or teal duplicate contour trails a moving object by 3–7 pixels at a 1024px master. It occupies less than a quarter of the silhouette. It means time slipped, not chromatic aberration.
3. **The repair strip.** Two torn paper corners or a short diagonal tape patch frame important human interventions. Institutional signage stays rectangular. Never put tape on every element.

These signatures must survive reduction. A thumbnail should read as a particular action, not merely as distressed paper.

## Ink and stock

| Swatch | Hex | Use |
| --- | --- | --- |
| Carbon | `#172324` | Contours, headlines, strongest shadows |
| Warm stock | `#F1E6C8` | Paper and empty illustration ground |
| Chalk | `#FFF5DA` | Small clean highlights |
| Builder orange | `#D86532` | Bob, useful tools, selected routes |
| Safety yellow | `#E8BA45` | Warnings and available choices |
| Store teal | `#477B78` | Architecture, official print, Block |
| Possession plum | `#70516F` | Time interference and Exposed |
| Receipt red | `#AC443E` | Enemy labels, damage, closed routes |

Maximum four visible inks plus stock in a single illustration. Carbon occupies approximately 15–30% of the subject. Keep stock warm but not muddy. Rarity remains a card-frame system, not an excuse to recolor the drawing. Lighting may shade the physical card; illustration albedo stays flat.

## Drawing grammar

- Use blunt, slightly bowed silhouettes, not smooth sticker icons. Most contours are 10–16px at a 1024px master; interior marks 4–7px. Tapers and corners are placed, not randomized.
- Construct a scene around one dominant action diagonal and one counter-shape. Leave at least 20% negative space. Use two or three shadow masses, never continuous airbrush shading.
- Hands have a legible thumb, knuckle mass and gripping direction. Tools have working edges, plausible joints and consistent handles. A hammer and a sledgehammer must remain distinguishable at 96px.
- Faces are job caricatures: recognizable ordinary employees, not zombies or grotesque infection victims. Reuse `src/assets/characters/bob-reference.png` for Bob's proportions, orange workwear and silhouette. Alien influence is a mismatched gaze or one delayed contour.
- Recipients on card art are neutral schematic dummies, blank silhouettes or diagrams. Never depict a recognizable opponent as the victim. Depict the action independently of this encounter.
- Halftone is a single aligned screen inside selected shadow regions: roughly 8–12px pitch at 1024px. No full-image noise, random scratches, faux parchment overlays or indiscriminate grunge.
- Use limited physical scuffs with a reason: folded corners on a map, rubbed handle ends, a torn receipt edge. No decorative damage on skin.

## Composition and delivery

### Card action illustrations

- Master: 1200×960, matching the centered 1.25:1 art crop. SVGs must declare `width="1200" height="960"` as well as their viewBox; intrinsic dimensions are required for the scaled canvas texture crop. Keep all critical action and anatomy inside a 7% inset. No embedded title, rules, cost, rarity badge or lettering.
- One standalone action or effect, neutral stock/transparent background, no cinematic environment. The readable rules remain separately typeset by the card renderer.
- Delivery: editable SVG for deliberately vector-authored artwork; lossless PNG for painted/model-generated artwork. Use stable semantic filenames. Do not trace a generated image and call the result hand-drawn.
- Author a thumbnail first. At 150px card width, the subject's direction and effect must remain understandable without tiny details.

### Characters

- Keep reusable transparent 640×720 or larger comic character references with full silhouettes and props. Live world actors use original directional pixel sprites; Bob's circular pixel portrait is in the upper-left framed HUD, with his name above and health to the right. Do not restore the former bottom-right portrait or diagonal mesh stage.
- Give each job a different large prop and shoulder/head silhouette, not merely a new shirt color. Keep safe space around the contour for actor reactions.

### The expedition map

- The live map is a walkable top-down pixel-art MOREMART on the authoritative 33×35 tile grid in `src/game/map.ts`, not a printed route-selection diagram. It occupies the upper half of the 1920×1080 stage; physical cards occupy the lower half.
- Use deliberate pixel clusters, readable employee silhouettes, restrained flat shadows and nearest-neighbour texture sampling. Distinguish floor from walls, shelving, tables and closed doors. Visual obstacles must match traversability; decorative detail must not imply an open shortcut or hide an interactive object.
- Preserve the warm-stock, carbon, teal and builder-orange identity without copying another game's characters, tiles or insignia. Department identity comes from familiar retail props and readable signage, not fantasy terrain or science-fiction glow.
- Current world tiles, objects, directional actors and Bob's portrait are original hand-authored canvas pixel art in `src/view/pixel-art.ts`. Existing comic card illustrations remain separate; do not replace their action artwork with pixel symbols.
- Requested model-generated environment art remains blocked because no image-generation provider is connected. `src/assets/map/store-plan.prompt.txt` now describes that world-art request. The older printed `store-plan.svg` remains an archived style study, not the live background or evidence of model generation.

### Interface and motion

- Retain the existing display face for short headings and a readable face for rules. Card titles/rules and interface labels are typeset, not generated lettering; the requested map's environmental department signage is the explicit exception. Keep number emphasis and keyboard focus visible.
- Default screens show labels, choices and current status—not tutorials or explanations of obvious controls. Put definitions and control guidance behind explicit help. Tell the story through places, artwork and short character copy.
- Keep the 50/50 map/card split, fixed centered NOW marker and past-left/future-right ordering. Simultaneous cards share a tick and stack; overflow opens a full native inspector. HUD, hand and pile controls stay readable without a tutorial overlay.
- Motion has an anticipation, decisive contact and short settle. Damage uses one impact wedge; Block a solid enclosing stroke; healing a paper-patch lift; Exposed an offset registration ring. Reduced motion retains the state change and omits moving decoration.
- Never add screenshake, bloom, particles or distressed borders merely because an area is empty. Empty stock is part of the style.

## Generation brief template

> MOREMART / Misprinted Tomorrow. [Specific action, with physical cause and clear direction]. [Actor-owned hand or prop if needed], neutral schematic recipient. Blunt organic carbon contours with one deliberate highlight break; flat [choose at most three additional palette colors] on warm stock; two hard shadow masses; one localized aligned halftone patch. One late offset contour on the moving object. Strong thumbnail silhouette, 20% empty ground, critical subject within centered 1.25:1 crop. No text or card frame. Follow the supplied Bob/prop reference exactly where relevant.

Negative constraints: glossy 3D, photorealism, digital concept-art rendering, soft airbrush, volumetric lighting, lens effects, rainbow accents, floating runes, fake text, ornamental borders, many tiny props, generic vector sticker symmetry, melted fingers, impossible tool grips, matchup-specific victims, full-frame grunge.

Specify the requested asset and the concrete composition; do not just paste style adjectives. Produce variants to resolve a drawing problem, not dozens of unrelated aesthetics. For deterministic vector assets, hand-author the silhouette and construction paths and use code only for repeatable export.

## Acceptance sheet

Before integrating an asset, review: full-size on stock; transparent edge over dark teal; 150px card thumbnail; centered 1.25:1 crop; grayscale silhouette; side-by-side with Bob and one accepted asset. Reject unclear grips, inconsistent contour weights, off-palette highlights, noisy empty space and details that disappear at play size. Inspect it on the actual lit physical card too.

Keep source assets and meaningful filenames in the repository. State whether an asset was vector-authored, painted or model-generated; retain the prompt/reference when a model is used. Do not claim a model was used when it was not. No unlicensed artist-name imitation, copied characters or third-party marks.

## First production batch

A coherent temporal-tools set: a doubled hammer impression (Echo), a saved coat-check receipt (retention), the matching physical tool pulled back with its receipt (Reclaim), a delivery carton arriving ahead of its future shadow (Borrow), and a shield-like paint second coat (defensive Echo). Each is an authored illustration with its own action, not the same icon recolored. A reusable store-floor print supports the map; labels and route state remain native UI.

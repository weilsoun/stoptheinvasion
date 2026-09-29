# Copy-paste prompt for the game-engine agent

You are implementing the approved Kestrel cutout-art pass in the existing `stoptheinvasion` repository. Read the repository `AGENTS.md` first and treat its active Kestrel combat contract as authoritative.

## Objective

Integrate the prepared Kestrel asset kit into the current playable bridge battle while preserving the deterministic combat, physical-card behavior, accessibility, touch geometry, playback, PWA lifecycle, and 1920×1440 composition.

The handoff is located at:

`docs/design/kestrel-asset-kit/`

Start by reading:

1. `docs/design/kestrel-asset-kit/README.md`
2. `docs/design/kestrel-asset-kit/asset-manifest.json`
3. `docs/design/kestrel-asset-kit/kestrel-cutout.css`
4. `docs/design/kestrel-asset-kit/templates/card-frame.svg`
5. `docs/design/kestrel-asset-kit/templates/ui-chips.svg`
6. `docs/design/kestrel-asset-kit/index.html`

The generated-image provenance and exact prompts are recorded in `PROMPTS.md`. Preserve that documentation.

## Implement this visual cutover

- Use `assets/production/backgrounds/viewscreen-spacefield.png` as the clipped interior of `SHIP_SCREEN` at x360/y160/1480×660. Keep the illustrated bridge structure, screen frame, scan treatment, action bay, piles, and native HUD separate and above it.
- Replace the three hand-authored enemy illustrations with the matching transparent production cutouts:
  - `corsair` → `assets/production/ships/sable-corsair.png`
  - `needle` → `assets/production/ships/needle-drone.png`
  - `bulwark` → `assets/production/ships/bulwark-tug.png`
- Preserve `enemyShipPose`, the three 350×230 live presentation regions, stable enemy ordering, target centers, transparent native hit buttons, selection brackets, damage playback, destruction behavior, and teardown ownership.
- Replace only the artwork inside the `drawShipCardFace` action window at x44/y176/672×472 with the six runtime-ready plates listed in `asset-manifest.json`.
- Continue drawing card title, cost, effective rules, flavor, type, borders, dimming, and all dynamic values at runtime. `previewCard` must remain authoritative for both hand cards and staged flights, including Adaptive Coils.
- Keep research-card rendering deterministic and recipe-driven. The six fixed image plates apply only to the six shipped base card IDs; do not assign a generic generated image to `research:*` cards.
- Use the CSS and SVG files as implementation references for cut-corner chips, inset keylines, meter treatments, target brackets, palette, and card-frame proportions. Port the useful visual rules into the active HUD and Canvas compositor instead of mounting a second DOM card system.
- Retain Barlow Condensed for body copy and Bebas Neue for display headings. Keep all labels, numbers, rules, intentions, buttons, and accessible names native; generated imagery must remain text-free.

## Asset loading and packaging

- Copy only the selected runtime production assets into an appropriate `src/assets/ship/` location and import them through Vite so they receive content hashes and are included in the production bundle.
- Do not put the full handoff, source images, or `cards-2x` review set under `public/`.
- Preload and decode the required images before the first scene composition that consumes them. Do not allow a race where a Canvas texture permanently captures an unloaded image.
- Prefer keeping the existing `ShipScene` contract stable. If asynchronous bootstrapping is required, contain it at the application/bootstrap boundary rather than making combat commands or presentation asynchronous.
- Continue registering every created PlayCanvas texture and material with the scene's existing ownership collections so `destroy()` remains complete.
- Preserve alpha on enemy cutouts. Avoid dark rectangles, matte fringes, or duplicated painted backgrounds around ships.
- Use the 672×472 card files for current card compositing. The `cards-2x` files are review/future-resolution derivatives and should not be shipped unless a measured renderer change requires them.
- Confirm that each emitted asset remains below Workbox's current 6 MB per-file limit and is present in the production precache after it becomes a real import.

## Interaction and layout invariants

Do not change combat rules, state shapes, RNG, deck composition, intents, targeting legality, or command dispatch.

Do not change `SHIP_DESIGN`, `SHIP_SCREEN`, `SHIP_SELF_DROP`, `SHIP_PILES`, `shipHandPoses`, `enemyShipPose`, card lift/scale constants, or the canonical hit geometry merely to fit artwork. Crop and position the artwork within those existing contracts.

Keep these behaviors intact:

- explicit target choice when multiple enemies live;
- self cards accepting the action bay, actual Play button, and full shared viewscreen rectangle;
- attack cards requiring an actual living legal enemy surface;
- affordable drag threshold, direct held-card tracking, sway direction, cancellation, and accepted-flight starting pose;
- bright → dimmed → bright physical-card transitions without dimming the Inspect affordance;
- opening/refill/explicit-draw deal animations and anonymous recycling;
- visible hull, shield, recharge, and next-intent information during drag and playback;
- detail-card scrim, HUD inertness, nested focus restoration, and outside dismissal;
- reduced-motion behavior;
- same-seed replay, genuine victory, and genuine defeat;
- Safari pagehide/back-forward preservation and complete actual teardown.

At 1366×1024 and 1194×834, verify that the new chip treatment and cutout art do not cover the first card, draw pile, enemy gauges, intent text, or End Turn. Portrait letterboxing must remain usable.

## Visual acceptance

- The spacefield fills only the viewscreen and leaves the center readable for three ships.
- Each enemy has a distinct silhouette at the live 350×230 size: red swept Corsair, narrow white/cyan Needle, and blocky yellow Bulwark.
- Ship transparency is visibly clean over the new background.
- Card art reads at the actual 247×351 physical-card size, not just in detail view.
- Pulse Cannon shows one cyan pulse; Shield Cycle shows layered teal protection; Rail Lance shows a gold-white rail discharge; Reserve Cell shows stored amber power and teal transfer; Tactical Sweep shows a broad scan; Twin Burst shows exactly two primary bolts.
- Native cutout chips and meters look like part of the illustrated bridge without sacrificing contrast or 44 CSS-pixel touch targets.
- Selected targets, legal drops, damage, shields, and outcome overlays remain unmistakable.
- Do not claim the generated assets are hand-authored. Preserve the existing provenance distinction in the visual-style documentation.

## Verification required before completion

1. Run `npm run build` and `bun test`.
2. Run `npm run balance:ship` only if combat code or data changed; ideally this art pass should not require such changes.
3. Inspect the actual rendered scene, not only source canvases, at 1366×1024, 1194×834, and one portrait viewport.
4. Exercise one real attack drag, one self-card viewscreen drop, card inspection, an unaffordable card, End Turn, pile inspection, reduced motion, and same-seed replay.
5. Confirm the physical card's runtime pixels visibly change bright → dimmed → bright when energy availability changes.
6. Confirm all three actual Engine ship roots display the intended cutouts and that target centers still match the visible ships.
7. Build and run the production preview, confirm the selected files appear in Workbox precache, then prove one offline load after an online warm-up. Do not force `skipWaiting`, claim clients, or reload an active battle.
8. Check browser console errors and verify teardown leaves no owned textures, materials, listeners, waiters, or transient transforms behind.

Report exactly which files changed, which handoff assets were promoted, production bundle/precache impact, commands run, and what was verified in Chromium. Keep physical iPad/Safari claims explicitly unverified unless they were actually performed.

Preserve unrelated dirty work and do not commit, deploy, restart services, or modify retained MOREMART modules unless separately authorized.

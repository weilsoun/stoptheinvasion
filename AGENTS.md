# Stop the Invasion

## Product agreement
Single-player party deckbuilder, initially Bob versus infected store security in a replayable 1v1 combat laboratory. Future party of three and later two-player co-op are not this milestone. Campaign, map/shop/boss, items (potions), collectible statuses (relics), art generation, environmental rules, and menus follow combat validation.

1920x1080 design coordinates; locked 16:9 with letterboxing. Enemy left facing right; Bob right facing left. Comic-book horror comedy in MOREMART, a parody big-box store. Physical, lit PlayCanvas card meshes, depth layers/parallax, readable hover, pointer drag-to-target arrow. Mouse first; Pointer Events support touch. No physics-driven combat.

## Rules
Six fixed slots, enemy intents anchored and exact. Empty slots advance. Drag to target auto-places earliest open slot. Before Resolve: remove, reorder/swap player slots, retarget freely; never move enemy actions. Self-target cards point to Bob. Costs reserve current energy, not forecast gains. Hands-off resolution; immediate lethal stops battle and dead actors never act. Block expires at resolution end. Exposed is a flat bonus to the next incoming damage hit, consumed on that hit; stacks add. Base draw five, start energy two, gain two on subsequent turns, cap four; values live on actors and can be modified. Energy resets each fight. Unplayed cards discard unless retained. Cards drawn during resolution survive to next planning, in addition to its normal draw. No full outcome preview. Seeded reshuffle; same seed replay is deterministic.

## Architecture and ownership
- `src/game/types.ts`: shared types, Main owns contract changes.
- `src/game/content.ts`: data and encounter tuning, Main owns during parallel build.
- `src/game/combat.ts`: combat agent owns deterministic rules, zero DOM/PlayCanvas imports.
- `src/view/types.ts`: Main owns scene/UI interface.
- `src/view/scene.ts`: scene agent owns PlayCanvas renderer and procedural original artwork.
- `src/ui.ts`, `src/style.css`: interaction agent owns HUD, hand hit targets, drag targeting, queue editing, resolution animation orchestration.
- `src/main.ts`, `index.html`, package/config files: Main owns integration.

Combat API: `createCombat(seed?: number): CombatState`; `availableEnergy(state, actor?: ActorId): number`; `queueCard(state, uid, target, slot?): CommandResult`; `removeCard(state, slot): CommandResult`; `moveCard(state, from, to): CommandResult`; `retargetCard(state, slot, target): CommandResult`; `resolveTurn(state): ResolutionStep[]`. Planning commands mutate only on success; failed commands leave state unchanged. Queued cards leave hand; removal returns them. `resolveTurn` DOES NOT mutate its input: returns independent snapshots for each of six slots (including empties) plus next planning or terminal state. Spend reserved costs at resolution start, so generating energy is slot-independent of reservation/cap. Final snapshot clears Block and activeSlot, discards played/unplayed appropriately, refills energy/draw, installs new intent. No resource generation can finance the committed queue. Snapshots include readable bounded log. Retain/newly drawn cards survive turn cleanup. Reject commands outside planning and invalid/noninteger indices.

Renderer API: `createScene(canvas: HTMLCanvasElement): ScenePort` from `src/view/scene.ts`. ScenePort in view/types.ts. CardVisual rectangles use top-left x/y in design pixels, rotation degrees. Renderer draws textured, lit mesh cards, including all their text. DOM hand buttons are transparent hit targets, not a second visible card renderer. Renderer sizes the backbuffer with graphicsDevice.resizeCanvas using displayed bounds, without changing the fixed design-space CSS; DPR is capped at 1.5. Arena composition: header y=0–130; actors centered at (410,400) and (1500,400), with labels above their faces; timeline y=570–700; hand y=812–1063, enlarged hover y=742–1050. Keep these bounds synchronized with the UI. Scene owns background signage/art; UI owns names, HP, intents, and HUD text.

UI API: `mountGame(root: HTMLElement, scene: ScenePort): { destroy(): void }` from src/ui.ts. Root is fixed 1920x1080 overlay; Main scales entire stage. UI imports combat/content, owns state, and sends visual hand/queued card rectangles to scene. Show explicit valid/invalid drop cues, costs, Block, Exposed, energy pot, draw/discard counts with inspectable pile contents, enemy intent tooltip, current slot, combat log, restart, resolve, and victory/defeat result. Click card then target and click queued card then empty slot are keyboard/touch-friendly alternatives; removal must be available. Preserve exact target on move. Queue may use compact DOM summaries rather than physical mesh cards; full physical cards required in hand. Hovered cards lift/enlarge without leaving screen. No full predicted outcome. Respect reduced motion and prevent gameplay input during resolution. Main creates app, canvas, fixed stage and lifecycle.

## Agent workflow
Main (Astra): planning, interface/content decisions, integration and final verification. Project implementation agents explicitly use openai-codex/gpt-5.6-sol. Work only assigned files. Ask Main before changing shared contracts. Escalate material product choices through Main's interactive Grill Me; use conservative defaults for implementation details. Skip builds/tests/formatters during concurrent edits; Main validates once integrated. No nested delegation without real independent ownership. Keep handoff concise: changed files, contract issues, verification not run.

## Skills and references
Read .agents/skills/build-app/SKILL.md and its direct-engine reference for PlayCanvas bootstrap; apply-conventions for engine code; scene/light/HUD/state skills as appropriate. These are official PlayCanvas skills from https://github.com/playcanvas/skills (MIT, adjacent license). Consult installed PlayCanvas declarations for exact API signatures. Interview skills from https://github.com/mattpocock/skills; use interactive ask questions when new material decisions arise. No MCP server is needed for the standalone engine; installed engine types, official docs, and browser verification are the primary tools.

## Commands
`npm install`, `npm run dev`, `npm run build`, `bun test` (behavioral regression cases only). Browser-smoke real drag/drop, locked slots, empty-slot placement, resolve, victory/defeat/replay, and responsive letterboxing. No screenshot/source-text assertions. Keep runtime state authoritative and animation-only presentation separate.

## Current playable and verification
Run `npm run dev` and open http://localhost:5173. Drag a hand card onto the guard or Bob; alternatively click the card then target. Drag queued cards to open/player slots or click one then its destination. Remove releases reserved energy. Resolve plays the timeline without intervention. Restart/replay restores the same seed. Pile inspectors support Escape; intent details support hover/focus.

The initial deck contains 12 cards across 7 definitions in content.ts. Measure Once applies 8 Exposed so setup + a 6-damage hit rewards correct ordering (14 total) relative to a 13-damage heavy attack for the same 2 energy. Balance values are experimental, not a finished balance pass.

Local proof: strict TypeScript/Vite build, seven behavioral combat regressions, complete browser victory and defeat/replay, real mouse drag/click/keyboard interactions, emulated touch drag, and fully visible 16:9 letterboxing at 1920x1080, 1280x800, and 900x1200. No multiplayer, campaign progression, environmental rule, or mobile usability claim follows from those checks. GitHub PR verification runs build + Bun tests; browser smoke is currently manual.

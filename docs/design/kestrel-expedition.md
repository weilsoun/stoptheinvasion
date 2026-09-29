# Kestrel expedition

Implementation contract for the approved map / ship combat / away-team expansion, tracked in [goal #12](https://github.com/weilsoun/stoptheinvasion/issues/12). This supersedes the former combat-only limit. It does not authorize the optional module/consumable idea bank as production mechanics.

## Product boundary

- One run crosses a twelve-node, seven-leg branching solar-system graph. Choices include battles, two planets, a depot, a trading freighter and a science array. Travel follows authored outgoing edges; there is no backtracking or reward farming.
- Start with Captain Vale and a fifteen-card deck: replace the first starter Pulse Cannon with Vale's unique crew card. Ship hull persists; shields, energy, draw/discard/exhaust and per-battle triggers reset for each genuinely new battle. There is no free hull repair on victory.
- The first encounter has one drone. A later branch introduces two independently identified copies of the same role. Other routes introduce paired Corsairs, a mixed patrol and the three-role final blockade. Clearing the blockade does not finish the expedition: travel to the Far Relay and explicitly transmit the survey.
- Battles award scrap and one salvage choice: take an offered card, upgrade one exact card, recruit an offered crew member, or decline. No duplicate crew and no duplicate reward grants. Deck size is bounded; an exhausted card returns next battle, not as an extra copy.
- Four recruitable crew members each own exactly one persistent ability-card UID. Their levels improve that exact ship card and their away stats. Upgrading an ordinary card changes only that copy. Grades are authored per effect, not a universal bonus. Grades do not change rarity or department.
- Depots/freighters offer finite repair, refit, recruitment and card purchases with one scrap currency. Each category can be purchased once per visited service node. Ineligible or unaffordable actions fail without payment. Departing permanently gives up remaining stock.
- The science array offers a science-gated exact-card refit, diplomacy-gated navigation-data exchange, or ordinary salvage. These are mutually exclusive, one-use opportunities.
- Modules, card imbuements and emergency-supply items remain a separate proposal. Numeric card refinement and finite service repair are implemented here; there is no new inventory of relics or potion-like items.

## Away missions

Choose one to three collected crew, in a visible order. The first living member takes enemy fire. An eligible party can negotiate access instead of fighting, paying the displayed scrap cost; diplomacy is deterministic and depends on that selected party, not hidden dice.

A deployed party fights an authored local encounter automatically. Units act by descending speed, crew before enemies on ties, then stable formation order. Dead units never act. Basic attacks target the opposing front living unit. Every third personal action uses the crew member's authored skill instead of a basic attack:

- Vale: Guard for all living allies.
- Iona: a larger Guard grant to the front living ally.
- Rex: two ordered hits against the same target; lethal suppresses the second hit, with no retargeting.
- Sen: heal the most injured living ally, never revive a knocked-out unit.

Guard absorbs damage before HP and respects its cap. Healing respects maximum HP. Terminal outcomes interrupt later effects and actions. The finite signal window ends an unresolved encounter after the authored round limit as a mission failure, never a fabricated victory. Crew recover between missions; failed evacuation costs ship hull and may end the expedition. There is no permanent crew death or staffing simulator.

Autobattles advance through canonical `away-step` commands, one unit action at a time. Presentation determines when the next command is requested, not damage or initiative. Pausing stops further requests and freezes current presentation. Leaving for Title cancels presentation; Continue adopts the committed state without repeating an action or payment.

## Pure domain contracts

`src/ship/types.ts` remains the ship/card contract. `src/ship/expedition-types.ts` owns run, crew, away, settings and extended scene contracts. `src/ship/expedition-content.ts` owns the graph, encounter rosters, crew, authored scaling and new balance constants. Main owns these shared files.

### Ship combat

The existing reducer remains the only ship-combat engine. Extend its factory to:

`createBattle(seed?, loadout?, setup?: ShipBattleSetup): ShipBattleState`

An authored setup supplies persistent exact cards, current hull and one to three uniquely identified enemies. It is mutually exclusive with a research loadout. Keep the existing fifteen-card research-loadout contract and baseline three-enemy study meaningful; they are laboratory inputs, not a second gameplay mode. Setups permit the expedition deck bounds and authored grades. No resequencing enemies by role, no UID regeneration for supplied cards, no mutation of the supplied setup.

Add `definitionForCard(state, card)` for the exact card's upgraded catalog recipe without Adaptive Coils. `previewCard` adds current Coils once; action events contain the already effective recipe. Payment, execution, hand previews, visible piles, details and flights must agree. Existing `cardDefinition` returns an ungraded catalog definition, including authored crew cards.

### Away engine

`src/ship/away.ts` exports:

- `createAwayBattle(crew: readonly CrewMember[], mission: AwayMission): AwayBattleState`
- `stepAway(state: AwayBattleState): AwayStepResult`

The selected crew array is formation order. Reject empty, duplicate, unknown, over-capacity or invalid-level teams before creation. Each successful step resolves exactly one living unit's action plus any round/outcome bookkeeping; mutate only after success and emit ordered event snapshots. Terminal steps reject atomically. No DOM or Engine dependency.

### Run engine

`src/ship/expedition.ts` exports:

- `createExpedition(seed: number): ExpeditionState`
- `dispatchExpedition(state, command): ExpeditionResult`
- `availableNodes(state): ExpeditionNode[]` — legal travel destinations only while in map phase.
- `expeditionServices(state): ExpeditionService[]` — authored prices plus current eligibility/reasons.
- `upgradeableCards(state): ShipCard[]`
- `recruitableCrew(state): CrewId[]`
- `expeditionCardDefinition(state, card): ShipCardDefinition` — persistent grade, no battle-local Coils.
- `serializeExpedition(state): string`
- `deserializeExpedition(text): {ok:true,state:ExpeditionState} | {ok:false,error:string}`

Commands and state fields are defined in `expedition-types.ts`. Every invalid phase, node, target, purchase, party, salvage choice or command shape is an atomic failure. The reducer owns all randomness and choices. Stable card UIDs use the run's monotonic identity counter. Crew `level - 1` always equals that crew card's upgrade grade.

Ship battle commands are nested `battle` commands; UI never bypasses the run reducer. Terminal battles remain in battle phase until `finish-battle` after presentation. Likewise, completed autobattles wait for `finish-away`. These commands grant salvage or charge failed evacuation exactly once. Skipping salvage is legal. Explicit `complete` is legal only at the reached exit. All accepted commands are journaled as independent records.

Saves use a versioned seed/accepted-command journal envelope with a checksum of the reconstructed canonical state. Loading replays commands through these same reducers, rejects invalid/extra fields, unsupported versions, exceeded bounds or mismatching reconstructed results, and never executes saved code. This checksum detects incompatible content/results; it is not authentication. Storage errors remain visible. Invalid saved data is retained/downloadable until the user confirms replacement. Preferences use a separate key and survive new expeditions.

## Presentation contracts

Keep one direct PlayCanvas Application, the current 1920×1440 design stage, physical card meshes, card artwork, and native input/accessibility layer. Do not introduce Three.js, DOM card-face replicas, a second Engine app or the archived MOREMART world UI. Preserve the user's separate cockpit reference assets.

`ExpeditionScene` extends the small combat `ShipScene` port with screen selection, presentation preferences, pause, away-state adoption and ordered away-event presentation. Scene methods never dispatch gameplay. Full screen changes cancel stale effects/cards and adopt the appropriate snapshot. Hide ship rigs/HUD in map/title/away views. Enemy poses use the roster's total count, retaining stable slots when an enemy dies.

`mountShipCombat(root, scene, options: ShipCombatOptions): ShipCombatPort` becomes a controlled battle component. Read state through `options.state()` again after dispatch; do not retain an obsolete object after a run transition. Route commands through `options.dispatch`, menus through `onMenu`, terminal completion through `onComplete` only after playback. External overlays guard inputs through `blocked()`. `refresh()` updates preferences/current state; `cancelInteraction()` clears drags/selection gestures safely. Remove battle-only restart, local random battle ownership and local motion settings from this component.

`mountKestrel(root, scene: ExpeditionScene): ShipGamePort` in `src/ship/shell.ts` owns the title, run, map, away flow, salvage/services, settings, saves, modal focus and component lifetime. Main integrates this single mount in `src/main.ts`.

### Menus and settings

- Main menu: Continue when available, Start Game, Settings, Rules. Starting over protects an existing or invalid save with a confirmation focused on Cancel.
- In-game menu: Resume, Settings, Rules, route inspection, restart expedition with the same seed, and Title. Restart/new expedition are whole-run replacements, not battle farming.
- Settings: motion System/Reduced/Full, effects Full/Subtle/Off, native fullscreen and reset presentation defaults. No nonfunctional sound/volume controls. Follow live system reduced-motion changes when System is selected.
- Keep invalid-save/storage/fullscreen errors actionable and visible. Confirmations and overlays own focus; Escape cancels active card gestures before opening a menu. Native controls remain at least 44 CSS pixels after scaling. No global touch-scroll suppression or zoom blocking.
- Planning, route inspection, settings and crew selection do not advance gameplay. Maps inspected during an unresolved encounter cannot travel. Return clearly to the active ship or away encounter.

### Cards, effects and away artwork

An editable `src/ship/card-template.ts` defines the one card-face layout, typography, neutral chrome and regions. Every hand, detail, flight, salvage, crew and upgrade preview goes through the same compositor. Rarity and department identity remain separate metadata. Preserve six generated action plates; author meaningful original crew portraits/action illustrations and away scenery in Canvas, explicitly not model-generated artwork.

Design distinct Pulse, Burst, Lance, Shield, Cell and Sweep effects, plus effect-driven crew/research treatment. Effects follow real event amounts/targets/order: no invented extra hits or damage, no negative-energy gain flashes, no future draws. Preserve alternating physical port/starboard muzzle origins, transparent full-pane viewer feedback, the single proximity reticle, actual legal drop geometry, docked enemy readouts, and card-over-HUD depth ordering. Reduced motion keeps results without motion/flashes. Effects Off removes decorative effects, not cards or readable state feedback.

Away units are rendered actors, with clear native stats/log/accessibility. Crew selection/inspection uses their actual physical ability-card faces, not HTML card replicas. Show formation, current skills, diplomacy eligibility and actual outcome/evacuation cost.

## Review and verification

Jev recommended specialist gameplay, interaction and rendering owners, Sonic for fixed mechanical work, and Main for contracts/integration. Its recommendations are advisory. Work is isolated on feature branches; implementation agents skip builds/tests/formatters during concurrent edits. Main reviews, integrates, runs build/regressions and exercises the actual browser surface.

Preserve the existing full world and ship studies. Add complete real-command expedition/crew/away coverage and fresh source fingerprints; do not shrink seeds or candidate families. Exercise native first launch, confirmation, preferences, touch/keyboard/focus, save/resume, one/duplicate/three-enemy battles, exact-card salvage/upgrades, recruitment, finite services, both diplomacy and autobattle, defeat and explicit relay completion. Screenshots judge readability; canonical states and native actions prove behavior. No synthetic victories or saved QA fixtures left as user progress.

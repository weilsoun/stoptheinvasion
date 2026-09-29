# Stop the Invasion — Research and Design-Team Appendix

13 September 2026. Nine agents plus Main.

**Historical appendix:** this preserves research, competing proposals and reviews as delivered. They intentionally disagree and do not authorize implementation or establish balanced values or human fun. The integrated historical recommendation is in [time-travel-design.md](time-travel-design.md). The active Kestrel spaceship-combat agreement and the retained, inactive MOREMART contracts are distinguished in `AGENTS.md`. Time manipulation is currently parked. Turn arithmetic, route diagrams and Rewrite proposals below are historical research, not the active battle rules. Original source ledgers and the director draft remain intact so the critique is traceable.

## Team and traceability

Five fast read-only scouts researched comparable systems; two designers generated original mechanics/world content; a sixth scout audited implementation feasibility; an independent design critic challenged the combined proposal. Main verified key primary claims, checked current timing arithmetic and integrated the outcome. No comparative gameplay sessions, new-mechanic playtests or implementation validation were performed.

Main also read the Dawncaster developer storefront and historical status-design notes:
- https://play.google.com/store/apps/details?id=games.WanderlostInteractive.Dawncaster&hl=en_US
- https://wanderlost.games/test-message/

The current-rule arithmetic check compared a24-position horizon: six normal four-position turns versus24 hypothetical one-position turns; opening-plus-refresh energy12 versus48 and five-card hand opportunities30 versus120, before caps/costs/card supply. A normal four-position window contains at most one cadence-six enemy action. These are structural checks, not an achievable-loop claim or a balance study.

## Appendix 1: Shared assignment brief

# Goal
Produce an extensive, researched game-mechanics brainstorm and a cohesive recommended direction for Stop the Invasion. The user wants a real writing/design/development-team treatment: time travel, cards, draw, energy, statuses, revealing/borrowing future cards, changing history, taking power from the past and applying it to the future. This is DESIGN ONLY, not authorization to implement mechanics or expand the shipped milestone.

# Current game — checked against current AGENTS.md on disk
Single-player comic horror-comedy deckbuilder in MOREMART, a parody big-box store. Time-manipulating aliens possess ordinary people; they are not zombies. Bob is a builder fighting Possessed Security in a playable 1v1 laboratory. Hosts retain jobs and personalities. Artwork uses standalone actions, recognizable acting-owner gear, neutral recipients. Rules remain recipient-generic.
One persistent, absolute-index, SINGLE encounter timeline. Current on-disk rules advance LEFT TO RIGHT, toward increasing indices. Bob currently consumes FOUR positions per turn, not the older seven-position contract. Empty positions consume time. Enemy actions occupy positions 2, 8, 14, 20, etc.; a seeded independent permutation of four authored actions per 24-position block. Revealed intent is reliable absent an explicit modifying mechanic. Placement cannot casually move enemy anchors. Timeline continues indefinitely until combat ends.
Planning is paused and unlimited; only current-turn positions accept placement/grades. Scouting reveals positions beyond the current turn, not extra playable slots. Readable past spans one current movement budget; older history is stored but concealed. Extension/shortening changes both past lookback and future playable endpoint. Scouting changes only future inspectability.
Surge and timeline utilities are immediate, nonrefundable planning activations. Surge is temporary energy; extension/shortening/scouting is paid now and expires at cleanup. A turn always consumes at least one position. Short turns deliberately refresh resources faster per absolute position, an important exploit surface.
Draw five; stored energy starts two, gains two per moving turn, cap four; separate temporary Surge can exceed that. Energy commitments reserve funds; Surge spent first; ordinary resolution energy cannot retroactively fund commitments. Cleanup clears unused Surge and temporary effects, discards/draws, refreshes resources. Unplayed cards normally discard; retained/resolution-drawn cards have existing exceptions.
Ordinary cards auto-target sole living valid targets. Current core effects: damage, Block (turn boundary expiry), Exposed (flat bonus consumed by next hit), healing, stored energy, draw, Ringing (next turn only first chronological action; attachments not actions). A hit against pre-hit Exposed is critical. Signed authored upgrades/downgrades bind exact card UID or absolute position, are uncapped, cost energy and expire this turn. Sources cannot recursively grade each other. Base costs/identities do not change.
History has independent snapshots of consumed positions, including empties and canceled actions. It is READ-ONLY today and not an extra inventory. Reclaim (recover actual card), Echo (replay a past action), Rewind (restore a state) and Rewrite (edit a historical action and reapply later recorded actions) are unimplemented directions. Immediate Surge/timeline activations are logged planning events, NOT ordinary historical positions. RNG/draw/discard identities matter. Immediate lethal stops consumption; cleanup ends the encounter.
Touch-first iPad plus mouse/keyboard. Physical card art/text remain PlayCanvas meshes. Touch pickup enlarges/straightens, movement drags, hold opens centered card with upper-left terms, release closes held view. Need manageable timeline reading and low symbolic/UI burden.
Campaign, map/shop/boss, persistent items/relic-like statuses, party members and co-op are outside CURRENT milestone. They may be proposed as future product features, clearly separated from core prerequisites. No requirement to retain old scope for brainstorming; no implementation authorization implied.

# Constraints
Do not edit repository code, run builds/tests/formatters, or perform project-wide validation. No nested delegation. Research uses primary sources where possible (developer/publisher pages, Steam descriptions written by developer, official manuals/design talks). Read known URLs directly; search for discovery. Distinguish sourced facts, personal recommendations and hypotheses. Do not invent source details, market numbers, optimality claims or mechanics supposedly present in another game. Current seeded balance heuristics are NOT human fun or difficulty evidence.
Write your assignment's deliverable to the exact local:// artifact requested, then return a concise handoff with that URI. Source findings must include clickable full URLs, specific supported claims and limitations. No copy-pasted large excerpts.

# Contract
Main is creative director/integration owner. Research scouts collect facts, concrete transfer lessons and risks; designers propose original systems. No slice decides a new global currency, inventory identity rule or gameplay truth for other slices. Present competing options where appropriate. Keep these concepts separate: absolute encounter position, next player turn, draw-pile order, and run-level persistence.
For promising original mechanics state: player verb, target/time domain, effect, meaningful tradeoff/cost, possible combo, abuse risk and complexity (low/medium/high). Numbers are illustrative unbalanced examples unless explicitly supported by measured data. Favor a small composable rules vocabulary over many synonymous statuses. An idea bank can be wide; the final recommended game must be narrow and coherent.


---

## Appendix 2: Timeline combat research — TimelineResearch (scout)

# Visible scheduling and timing combat: research for Stop the Invasion

## Recommendation and scope

**Original recommendation:** Make time manipulation feel like editing a threatening appointment book: **see the attack, change one decisive before/after relationship, watch the promised result happen.** The strongest comparative lesson is not to add more clocks. It is to give a small, trustworthy schedule enough interactions that a one-position difference matters.

This study covers Phantom Brigade, Star Renegades, Othercide, Into the Breach, and Wildfrost. Sourced mechanics are distinguished below from original analysis and proposals. Risks are design deductions, not claims of measured player dissatisfaction. Sources were read during this investigation; launch-era articles and historical patches are labeled rather than presented as current exhaustive rules. No gameplay sessions, builds, or tests were run.

The shared brief is authoritative: a single persistent timeline advances left to right; Bob normally consumes four positions; empty positions consume time; enemy anchors occur at 2, 8, 14, 20, and onward. Only the current turn accepts placement. Scouting changes inspectability, not placement permission. Existing energy, Surge, cleanup, UID, and read-only history rules remain intact. All new mechanics below are proposals, not shipped features or balance conclusions.

## Five operations that must never share an ambiguous label

- **Delay an action:** move that particular unresolved action to a greater absolute index. It still happens unless subsequently prevented. This requires an explicit exception to fixed enemy anchors; ordinary placement cannot do it.
- **Change action order:** alter the relative sequence of actions. Swapping two player cards can do this without moving any enemy action or changing the turn endpoint. Delay can change order, but not every delay does.
- **Shorten a turn:** move the current playable/consumed endpoint closer while retaining at least one consumed position. Enemy anchors do not move. Cleanup happens sooner in absolute time, refreshing the hand/resources and expiring turn-bound effects sooner.
- **Reveal information:** expose a previously concealed future intent. Neither execution position nor playability changes. A revealed attack is not a newly available card.
- **Cancel an action:** prevent that action from resolving rather than reschedule it. Its position still consumes time and its canceled record remains meaningful. Cancellation does not automatically cancel the actor's later actions.

A sixth useful distinction is **mitigation**: Block reducing an attack's damage is neither delay nor cancellation. Do not report a blocked attack as an erased event.

## Comparable games

### 1. Phantom Brigade — forecast first, choreography second

**Evidence.** Brace Yourself Games' current product page describes a timeline command system in which players predict enemy movement, orchestrate timed countermeasures, then execute physics-based action in real time [1]. This is genuine forecast-and-schedule combat, not just an initiative display. The page now promotes the 2.0 identity and lists later updates; this report deliberately does not assume that old launch guides describe every current rule.

**Why the decision is interesting — analysis.** Information becomes valuable because the player can act at an appropriate moment. The question becomes “when is this response effective?” rather than merely “which weapon deals most damage?” Planning and payoff are visibly connected.

**Failure/complexity risk — analysis.** Continuous movement and physics introduce explanatory burdens: timing, trajectories, cover, and simulation divergence can compete for attention. Importing the spectacle literally would create a different game and an unsuitable touch interface.

**Single-timeline translation — original proposal.** Retain the forecast-to-countermeasure relationship, discard seconds, paths, and continuous execution. Show the enemy's action at its absolute position and preview a player's card before or after it. The crucial representation is a changed outcome attached to an unchanged, inspectable schedule. Animation should explain discrete resolution, never introduce timing skill or override the preview. Unlimited paused planning is an advantage, not a missing feature.

### 2. Star Renegades — interruption needs a horizon

**Evidence.** Its developer-authored Steam description emphasizes interrupts, counters, and combos in the Reactive Time Battle System [2]. Raw Fury's Switch 1.2.1.2 patch explicitly states that enemies can no longer be Staggered beyond the end of the next round [3]. It also fixes inconsistent combo damage predictions and removes displayed damage predictions for random-target flurry attacks. These are specific documented rules and corrections, not an inferred account of all current combat mathematics.

**Why the decision is interesting — analysis.** Delaying an enemy can buy a sequencing opportunity for other attacks or defenses. A bounded delay horizon makes timing control a tactical intervention rather than permanent removal. Prediction corrections also show why forecast fidelity is part of the combat contract.

**Failure/complexity risk — analysis.** If every good attack also delays, control and damage reinforce each other until defense is unnecessary. If delay eligibility is hidden, players cannot understand why an apparently sufficient sequence failed. Avoid asserting an exact current Break threshold or stagger-count formula: the primary pages read do not establish one.

**Single-timeline translation — original proposal.** Offer a small explicit **Delay** affecting one visible, unresolved enemy action, with a visible displacement limit. Do not move every later enemy anchor. A first candidate could move the action one position only when that destination is empty, avoiding implicit collision cascades. This is a candidate contract for integration, not a unilateral decision. Crucially, passing Bob's current endpoint must not delete the attack: it remains on the same continuing timeline.

### 3. Othercide — acting more now can mean acting later afterward

**Evidence.** Lightbulb Crew's creative director describes speeding allies, slowing enemies, and timing reactions and interruptions [4]. Using 50 or fewer action points lets a unit act again sooner; spending all AP in a burst reduces how often it can act and can leave enemies several actions before its return. The article also distinguishes Soulslinger attack-stopping/reactions from Shieldbearer enemy delay. Focus's overview separately describes interrupting attacks before they occur [5].

**Why the decision is interesting — analysis.** Immediate output competes with recovery timing. That makes restraint active play: taking fewer actions can preserve the next opportunity rather than merely waste resources. A small timing change can let a sequence finish before retaliation.

**Failure/complexity risk — analysis.** Recovery, AP thresholds, reaction chains, and spatial triggers can become several overlapping rule systems. An apparent tempo bargain can also be misleading if it silently changes resource refresh rates.

**Single-timeline translation — original proposal.** Use the existing four-position movement budget rather than add an initiative/AP system. Extension buys room to complete a setup and payoff before cleanup; shortening gives up room and brings cleanup sooner. This is analogous strategic tension, **not the same mechanic** as Othercide recovery. In our game shortening also accelerates draw and energy refresh per absolute position and expires Block; those consequences must be previewed. A future reaction should name one triggering event, not open an unbounded interrupt stack.

### 4. Into the Breach — perfect intent does not remove decisions

**Evidence.** Subset Games states that all enemy attacks are telegraphed in its minimalistic turn-based combat and that civilian buildings power the player's mechs and need protection [6]. The developer page supports those claims; it does not provide an exhaustive targeting, push, or resolution-order manual.

**Why the decision is interesting — analysis.** Knowing the threat shifts uncertainty from “what will happen?” to “which consequence can I afford?” Reliable information supports ownership of mistakes. Protecting something besides damage output makes the best counter contextual.

**Failure/complexity risk — analysis.** Transplanting spatial redirection without the board loses its reason to exist. Conversely, merely displaying exact damage can leave a routine arithmetic exercise if the available responses are interchangeable.

**Single-timeline translation — original proposal.** Use temporal objectives instead of a grid: preserve Block through an incoming hit, land Exposed before the intended next hit, or finish a dangerous enemy before its appointment. Keep revealed intent reliable except where an explicit mechanic modifies it. A future enemy could threaten an already-declared status or scheduled opportunity, but the threat must not casually invalidate reserved energy or current commitment rules. The first laboratory encounter needs timing dilemmas, not extra hostages or lanes.

### 5. Wildfrost — visible countdowns make acceleration and stalling legible

**Evidence.** The current Steam description explains that cards do not attack every turn: counters count down turns until automatic action. It explicitly suggests buffing companions, stalling enemy attacks, or counting down one's own timer [7]. In a dated pre-release change, Chucklefish replaced boss/miniboss snow immunity with resistance so snow could still affect them while stronger accumulation was constrained [8]. That historical decision is evidence for a design principle, not a guarantee of every current boss rule.

**Why the decision is interesting — analysis.** The countdown turns tempo into a visible deadline. Preparing an attacker competes with making it act sooner; slowing an enemy creates preparation time. Partial resistance lets a control-oriented tool retain some relevance against important opponents.

**Failure/complexity risk — analysis.** Several counters can obscure the actual resolution sequence, especially when many actions mature together. Broad immunity can make a timing identity disappear exactly when the encounter matters most.

**Single-timeline translation — original proposal.** Derive “positions away” from the one absolute timeline instead of introducing independent unit clocks. Present a clear destination marker when an action moves. If bosses need protection, prefer visible limits on displacement or action-specific resistance to an unexplained “time magic does not work” rule. Do not copy Wildfrost turn counters literally: our shortened turns must not speed enemy anchors simply because another cleanup occurred.

## Ten transferable patterns — original synthesis

1. **Intent as a promise.** Display action, target, position, and effect; name any condition that can change the result. Borrow the trust, not the whole comparator interface.
2. **Before/after previews.** When arranging a card, highlight the first meaningful consequence changed by its placement. This lowers arithmetic burden without choosing the move for the player.
3. **Threshold value.** Make a one-position intervention occasionally decisive because it crosses a relevant attack or cleanup boundary, not because every delay has a huge magnitude.
4. **One clock, multiple labels.** Absolute index is authoritative; “in two positions” is a derived reading aid. Never create an independently ticking enemy countdown.
5. **Preparation versus acceleration.** Earlier damage may miss Exposed or a setup effect. Later damage may be stronger but arrive after retaliation. Timing should not mean universally moving left.
6. **Bounded enemy control.** Expose a displacement limit or narrowly defined resistant action. Keep the remaining threat readable instead of inventing accumulating hidden resistance.
7. **Boundary as a decision.** Show which cards and enemy actions lie inside an extended/shortened turn, together with Block expiry and cleanup implications.
8. **Action-scoped reactions.** A future counter names the one action or event it answers and visibly consumes its opportunity. Avoid a general-purpose reaction language initially.
9. **Retain displaced threats.** Moving an attack beyond the playable window changes the planning problem, not its existence. Show its destination even when it cannot yet be answered with placement.
10. **Small vocabulary, expressive situations.** Compose Reveal, Delay, turn-length changes, and ordinary sequencing with existing damage/Block/Exposed before authoring numerous synonymous temporal statuses.

## Ranked timing verbs for our game

Ranking weighs identity, readable decisions, and compatibility—not measured fun. Proposed costs use existing resources only; values require balancing.

| Rank / verb | Domain and effect | Tradeoff and combo | Abuse risk / complexity |
|---|---|---|---|
| 1. **Scout** | Future inspectability; reveal beyond this turn, without enabling placement. | Existing immediate paid activation; helps decide whether to conserve or extend. | Paying for information that cannot affect a choice; low. |
| 2. **Delay** | One visible unresolved enemy action moves right under an explicit anchor exception. | Spend an action/energy instead of damage; create space for Exposed then a hit. | Lockout and collision cascades; medium with narrow targeting. |
| 3. **Extend** | Current turn endpoint and associated lookback move outward. | Pay now for extra placements; finish setup/payoff before Block expires. | Can expose another enemy action and delays refresh; low–medium. |
| 4. **Shorten** | Current endpoint moves inward, never below one consumed position. | Abandon placements for earlier cleanup; seek a new hand before a fixed threat. | Refresh farming and premature Block expiry; medium. |
| 5. **Reorder** | Current player placements change relative order, enemy anchors unchanged. | Existing placement flexibility should stay free; trade an early hit for later synergy. | Selling a card that merely duplicates free dragging; low. |
| 6. **Accelerate** | A genuinely constrained future player action moves earlier into legal current space. | For a future delayed-action design only; sacrifice preparation for urgent payoff. | Redundant with placement unless an actual constraint exists; medium. |
| 7. **Interrupt / Cancel** | One specified unresolved action loses resolution, not its consumed position. | High opportunity cost or narrow condition; rescue a plan when delay is insufficient. | Dominates Block and Delay if routine; medium. |
| 8. **Counter** | A declared trigger answers one incoming event. | Commit before the event; combine mitigation with retaliation. | Reaction recursion and ambiguous order; high. |

**Recommended narrow core:** reliable intent plus Scout, existing turn-length choices, and one carefully bounded Delay candidate. Keep ordinary reordering as planning literacy, not a paid temporal superpower. Reserve cancellation and reactions for later evaluation.

## Five traps

1. **Treating the viewport edge as the end of time.** Star Renegades has round terminology; our timeline is continuous. An offscreen or next-turn action is not canceled.
2. **Short-turn resource arbitrage.** One-position turns can produce many refreshes before a fixed enemy anchor. Costs and limits must be evaluated against absolute positions, not just “per turn”; this report does not impose an economy fix.
3. **Unlimited delay, blanket immunity as repair.** This first removes enemy participation, then removes the player's deck identity. Prefer bounded, visible control from the outset.
4. **Changing the forecast behind the player's back.** Hidden retargeting, collision shoves, or automatic anchor regeneration makes scouting and sequencing untrustworthy. Every schedule change needs an explicit cause and visible destination.
5. **Importing the comparator's machinery.** Real-time physics, grids, party initiative, independent counters, and layered reaction stacks are not prerequisites. They would bury our strongest distinction: one readable timeline of card actions.

## Source ledger: exact support and limitations

1. https://braceyourselfgames.com/phantom-brigade/ — Developer product page: predicts enemy movements, plans timed countermeasures, executes physics-based action in real time. **High confidence for feature description.** Current page uses 2.0 branding and lists subsequent news; no exact forecast duration asserted here.
2. https://store.steampowered.com/app/651670/Star_Renegades/ — Developer/publisher description: tactical combat emphasizes interrupts, counters, combos and Reactive Time Battle System. **High for broad identity; insufficient for exact stagger/Break formulas.**
3. https://rawfury.com/star-renegades-switch-patch-1-2-1-2-out-now/ — Publisher patch: Stagger capped at end of next round; combo prediction inconsistency fixed; random-target flurry damage prediction removed. **High for this historical Switch patch, not certified current cross-platform parity.**
4. https://blog.playstation.com/2020/07/27/put-an-end-to-suffering-with-these-essential-othercide-tips/ — Authored by Lightbulb Crew CEO/creative director: timeline acceleration/delay, reactions/interruptions, 50-or-less AP faster return, burst's slower return, class examples. **High for launch design; no claim of exhaustive current tuning.**
5. https://www.focus-entmt.com/en/news/a-new-gameplay-overview-trailer-to-discover-its-nightmarish-universe-and-spectacular-tactical-combat — Publisher overview: Dynamic Timeline manipulates when actions happen, including interrupting an enemy before its attack and creating combos. **High, launch-era broad corroboration.**
6. https://subsetgames.com/itb.html — Developer page: all enemy attacks telegraphed; minimalistic turn-based combat; civilian buildings power mechs and require defense. **High for those claims; not a detailed combat manual.**
7. https://store.steampowered.com/app/1811990/Wildfrost/ — Current developer/publisher description: countdown counters determine automatic action; stalling foes and accelerating one's own timer are available strategic choices. **High for baseline design; individual status edge cases not established.**
8. https://chucklefish.org/blog/wildfrost-dev-update-2023-release-with-cool-new-features/ — Publisher's November 2022 update: boss/miniboss snow immunity changed to resistance, allowing snow while limiting stronger accumulation. **High for announced historical change; not asserted as a complete present-day resistance specification.**

All comparative recommendations, risk assessments, pattern names, and proposed Stop the Invasion verbs are original synthesis. None is presented as a proven balance result or a mechanic already implemented in our game.

---

## Appendix 3: Causality research — CausalityResearch (scout)

# Causality research: making the past playable without making it incomprehensible

## Recommendation and boundaries

**Original recommendation:** make **Echo—bring a recognizable past action into the present—the practical signature**, supported by a clear visual connection to its historical source. If historical editing becomes the product’s defining ambition, pursue **one bounded Rewrite**, not arbitrary rewinds plus checkpoint travel plus branching realities. Echo and Rewrite are alternatives at different scope levels, not a requirement to ship both.

This research follows the shared brief: one persistent timeline moving left to right; normally four positions per turn; enemy anchors at 2, 8, 14, 20, and onward; empty positions consume time. History is presently read-only and is not inventory. All proposed changes below are **original design hypotheses**, not implemented rules or mechanics attributed to another game. Costs use existing energy, cards, positions, or explicitly conditional usage limits; no new global currency is proposed.

## What the primary sources actually establish

**Iron Danger: rewind as the normal way to solve combat.** Its developer/publisher store description explicitly offers rewinding up to five seconds whenever desired, trying different strategies, and synchronizing a two-character party. It describes this as making combat puzzle-like. [S1] The transferable principle is a **small, intelligible correction horizon**, not simply a rewind button. **Inference:** unlimited experimentation encourages search for a satisfactory sequence rather than commitment under uncertainty. The source does not document exact RNG restoration, equipment persistence, or every death-edge rule; do not borrow imagined guarantees.

**Lemnis Gate: recorded behavior becomes a tactical object.** Its official store description places alternating turns inside a repeated 25-second interval and describes cooperating with previous selves. [S2] More importantly, Ratloop’s developer article states that a killed operative continues its turn as a ghost: movement and attacks can still be recorded, but cannot damage enemies or take objectives. Preventing that operative’s death on a later loop makes those ghost actions real. The developers explicitly identify communicating this state as a challenge requiring dedicated UI and effects. [S3] This is strong evidence for the distinction between **an action recording existing** and **its effects being causally active**. It does not establish a suitable card-payment contract for our game.

**Into the Breach: reliable information can carry the time-travel fantasy.** Subset’s official overview says all enemy attacks are telegraphed and that defeat allows sending help back to another timeline; individual attempts present randomly generated challenges. [S4] Therefore, local tactical certainty and run-level uncertainty can coexist. Its strongest transfer is readable consequences, not an imperative to maintain multiple playable histories. The retrieved primary material does not substantiate detailed Reset Turn limits, undo exceptions, or RNG reroll behavior; those details are deliberately not used as design precedent here.

**Super Time Force Ultra: intervention is more interesting than merely restarting.** Capy’s official page says Time Out stops and rewinds recent play, then allows a new character to act alongside a past self. It explicitly presents death as part of strategy. [S5] Capy co-founder Nathan Vella reports that an earlier design rewound to the level beginning only after death; this frustrated players and constrained level, enemy, and boss design. Adding player-controlled Time Out defined the game. [S6] This directly supports offering proactive temporal decisions rather than making time travel only a consolation prize after failure.

**Braid: time rules can be the puzzle vocabulary.** Thekla’s description identifies rewind, pause, and different time properties across worlds as puzzle-solving tools. [S7] The narrow transferable principle is to teach one causal distinction at a time through authored situations. It is not evidence that our deckbuilder needs Braid’s full puzzle structure, multiple realities, or time-immune resources.

## Five operations that must not share one vague “rewind” label

| Operation | What changes | What the player must understand |
|---|---|---|
| Undo a mistake | Reverse an uncommitted planning choice | Usually no new world information; not a combat power |
| Restore a checkpoint | Return the complete encounter state to a selected snapshot | Which resources and knowledge survive; subsequent play is newly chosen |
| Replay a recording | Execute recorded actions in a current or recomputed state | Same intended action does not necessarily produce the same result |
| Edit a past event | Change an earlier cause, then recompute its consequences | Later actions may survive, change effect, become invalid, or never occur |
| Select a branch | Choose one alternative state/history to become authoritative | Alternatives are previews or archives, not inventories to combine |

**Original recommendation:** terminology should make the difference operational. “Restore” promises state replacement; “Echo” promises another action; “Rewrite” promises consequences propagating forward. A rewind animation cannot substitute for that contract. Planning undo must not refund the brief’s immediate, nonrefundable Surge or timeline activations.

## Ten original patterns, with scope and risk

### 1. Planning undo: accessibility, not the headline

**Verb/domain:** undo a reversible placement or grade before movement. **Effect:** return that planning choice to its previous state without resolving combat. **Tradeoff:** none mechanically; preserve all already-paid immediate activations. **Combo:** safely explore ordering around reliable intent. **Abuse risk:** information leakage if undo also reverses scouting or resolution draws. **Complexity:** low if restricted to reversible planning operations. This improves touch usability but does not make time travel distinctive.

### 2. Echo: summon a past action now — recommended signature

**Verb/domain:** select an eligible visible historical action as the source for an Echo played into a current-turn position. **Effect:** execute the supported action again now; do not reclaim or duplicate the physical card. **Tradeoff:** current energy and a scarce playable position. **Combo:** a recognizable past strike can exploit Exposed established now. **Abuse risk:** recursive Echo chains, inherited grades, and replayed resource-generation effects. **Complexity:** medium. Main must select the eligibility and recorded-versus-base-value contract; a narrow authored combat-effect vocabulary is the lowest-risk option. The important fantasy is “past Bob helps present Bob,” without resimulating history.

### 3. Reclaim: recover the actual tool

**Verb/domain:** select a visible historical card reference and recover its actual UID from an allowed current inventory zone. **Effect:** move that card, not a historical copy, into usable inventory. **Tradeoff:** activation/card opportunity and ordinary future play cost. **Combo:** recover a situational defense ahead of the next known anchor. **Abuse risk:** repeatedly farming one strong UID; confusing a historical record with possession of a second card. **Complexity:** medium, with inventory rules owned by the integrated design. Strong supporting mechanic, weaker signature: card recovery already has familiar deckbuilder equivalents.

### 4. Receipt adjustment: reverse one consequence, not all history

**Verb/domain:** cite a recent damage event. **Effect:** grant a present-day recovery capped by that event’s recorded health loss, clearly described as recovery rather than prevention. **Tradeoff:** current cost and timing. **Combo:** survive another scheduled attack without changing enemy anchors. **Abuse risk:** intentional damage farming; repeated claims against one event. **Complexity:** low–medium. This offers comic retail fiction—“I have the receipt”—without reopening draw order, expired Block, or intervening actions. It cannot revive an already ended encounter under current lethal rules.

### 5. Past setup, present payoff

**Verb/domain:** reference a qualifying action in visible history. **Effect:** strengthen a present card if the condition occurred; history remains unchanged. **Tradeoff:** prepare the right sequence instead of taking the immediate best move. **Combo:** a defensive action earlier makes a current counterattack stronger. **Abuse risk:** trivial repeated eligibility; excessive condition text. **Complexity:** low. This delivers continuity and foresight with no replay, but should complement Echo rather than be marketed as literal historical editing.

### 6. Whole-turn Restore

**Verb/domain:** restore the beginning of a previously consumed turn. **Effect:** replace the whole state, including inventory and random state, then allow new planning. **Tradeoff:** requires an approved nonrefundable usage/payment rule outside the restored state; otherwise it is free retry. **Combo:** revise defenses after seeing a sequence. **Abuse risk:** drawing, scouting, shortening, and refreshing repeatedly while retaining knowledge. **Complexity:** high. Useful as an explicitly separate accessibility or training option; likely an expensive distraction as a second core economy mechanic.

### 7. Bounded Rewrite — ambitious signature candidate

**Verb/domain:** modify one eligible event within the currently readable past, then reapply recorded later actions to the present. **Effect:** consequences change; absolute positions and enemy anchors remain fixed. **Tradeoff:** current payment plus a deliberately bounded eligibility rule. **Combo:** improve an earlier defense so the present Bob has more health, or alter an earlier hit so a later Exposed interaction changes. **Abuse risk:** deleted draws, missing cards, self-invalidating payment, recursive edits, and earlier lethal outcomes. **Complexity:** high even for four positions. Prefer one authored edit type over arbitrary card replacement. This best earns “I changed history,” but only if players can explain the causal difference.

### 8. Preview one counterfactual, commit one history

**Verb/domain:** preview a candidate Rewrite. **Effect:** temporarily show original versus candidate outcomes; commit replaces the sole authoritative history. **Tradeoff:** comparison time and screen space, not a second resource system. **Combo:** identify why one earlier change prevents damage downstream. **Abuse risk:** previews reveal concealed future information or become unlimited free scouting. **Complexity:** medium–high, dependent on Rewrite. Show only the allowed history interval and justified consequences. This is a usability layer, not multiverse gameplay.

### 9. Precommitted fatal insurance

**Verb/domain:** prepare a specifically authored rescue before an otherwise lethal event. **Effect:** substitute a stated prevention/recovery effect during resolution, before ordinary encounter termination. **Tradeoff:** spend a position and resources on insurance that may be unnecessary. **Combo:** deliberately accept a risky sequence while covering its fatal endpoint. **Abuse risk:** indefinite rescue loops and uncertainty about whether death occurred. **Complexity:** medium. This is an explicit future rules change, not permission to reopen today’s defeat screen. It offers a second-chance fantasy without recording ghost actions beyond death.

### 10. Ghost continuation — defer

**Verb/domain:** after death, record otherwise unrealized actions so an earlier rescue can activate them later. **Effect:** conditional post-death recordings, analogous in broad inspiration to Lemnis Gate, not borrowed implementation. **Tradeoff:** whole-system teaching and replay burden; would require an approved rescue economy. **Combo:** save earlier Bob to unlock a devastating later recording. **Abuse risk:** actions with no valid payer, draws after encounter termination, rewards on nonauthoritative histories. **Complexity:** very high. Our current lethal-stop contract means those consumed positions do not exist. This is a different game architecture, not an inexpensive extension.

## Causality contracts to settle before choosing Rewrite

**Original recommendations, not external-game facts:**

**Resources:** distinguish state restoration from an operation’s nonrefundable payment. Do not let restoring a snapshot restore the charge that bought the restoration. Do not introduce a hidden bank of resources outside time: any permanence exception must be visible and approved by the economy owner. Immediate Surge/scouting/length activations are planning events, not historical positions; editing four consumed positions does not automatically capture their causes. A candidate rewrite crossing cleanup must account for draw, discard, refresh, expiry, and shortened-turn acceleration, or be explicitly ineligible.

**RNG:** “same seed” is insufficient as a player promise: removing a random operation can shift later consumption of the stream. Preserve authored enemy schedules at their absolute positions. Decide whether changed draws follow recomputed pile order or preserved event identities; those are different contracts. The player-facing goal should be **unchanged causes retain unchanged randomness**, not “rewind until a better result appears.” Exact card UIDs and pile order cannot be replaced with equivalent-looking cards.

**Replay:** record actions and their provenance, not only final deltas. Reapplying a recorded damage delta would incorrectly ignore changed Block or Exposed. Conversely, replaying every live choice from scratch could silently select different cards or targets. Main must own one explicit action/target/payment contract. Recommended default for investigation: no invisible substitute actions; show the first point at which prerequisites fail.

**Invalidation:** three honest options exist: reject the candidate with an explanation; preserve the position as canceled; or ask the player to repair the sequence. Rejection is most restrictive, cancellation best preserves chronology, repair turns Rewrite into a broader replanning mechanic. Do not silently mix these. Existing canceled snapshots offer a useful representational precedent, not proof that replay cancellation is already supported.

**Fatal branches:** immediate lethal stops consumption. If a candidate kills earlier, later events are unconsumed, not merely ineffective. If it prevents an original death, no actions beyond that old endpoint should be invented. A preview may show the new terminal boundary; it must not manufacture victory rewards or post-death inventory.

## Making the causal change readable

**Original presentation direction:** retain one horizontal timeline. Highlight the edited source, the affected interval, and a concise before/after result. Explain at most the important chain: “More Block here → less health lost here → Bob survives here.” Label canceled actions with a cause. Never animate a complete history when a short difference explains it. Touch inspection should reveal the source record without making it look draggable as inventory.

A useful design review scenario is to ask someone to predict three things before confirming an edit: which enemy intent remains unchanged, which card still exists, and where consumption stops. Failure to answer is evidence the contract or presentation needs work—not evidence the player needs more paradox terminology.

**Final priority:** prototype the *decision* of history-linked Echo in paper examples first; treat a bounded Rewrite as the premium alternative requiring a causal-difference demonstration. Defer branch archives, generalized rollback, and ghost continuation. The strongest identity is not the greatest quantity of time machinery: it is repeatedly making the player think, “I arranged that earlier so I could do this now.”

## Primary-source register and limitations

- **S1:** https://store.steampowered.com/app/899310/Iron_Danger/ — authored product description: five-second rewind, experimentation, two-character synchronization; not a complete restoration specification.
- **S2:** https://store.steampowered.com/app/950180/Lemnis_Gate/ — authored description: repeated 25-second interval, alternating turns, cooperation with earlier selves; not evidence about card economies.
- **S3:** https://ratloopgamescanada.com/dev-blog/ghost-mode — developer explanation: ghost continuation, ineffective ghost actions, later causal activation, communication challenges.
- **S4:** https://subsetgames.com/itb.html — developer overview: telegraphed attacks, randomized attempts, help sent to another timeline after defeat; no detailed undo/RNG guarantees.
- **S5:** https://www.capybaragames.com/games/super-time-force-ultra — developer description: Time Out, selected reentry, playing alongside past selves, strategic death.
- **S6:** https://blog.playstation.com/2015/08/27/14-totally-true-facts-about-super-time-force-ultra/ — Capy co-founder’s retrospective, particularly item 3: death-only level restart constrained design; proactive Time Out changed the game.
- **S7:** https://store.steampowered.com/app/499180/Braid_Anniversary_Edition/ — developer/publisher description: rewind, pause, differing time properties as puzzle tools. Only that narrow transferable principle is used.

Research was document-based. No gameplay experiments, repository edits, builds, tests, linters, or formatters were performed.

---

## Appendix 4: Card economy research — EconomyResearch (scout)

# Stop the Invasion: Card Economies Across Time

## Direction and evidence boundary

**Recommendation:** time travel should primarily change *when Bob can use something*, with an intelligible price elsewhere. The distinctive fantasy is not another mana colour: it is pulling yesterday’s actual tool back into hand, checking tomorrow’s delivery, and committing tomorrow’s purchasing power before today is over.

This is research and original design, not an amendment to current rules. Bob still advances four positions left to right by default; enemy anchors remain fixed; history is currently read-only. Proposed mechanics below require explicit approval and inventory/replay contracts. None implies campaign currencies, mutable history, or placement outside the current playable window. No numerical proposals are balanced values.

## What the reference games actually establish

### Primary-source findings

**[1] Vault of the Void — official store description.** Purging discards unnecessary hand cards for energy. Its Threat system also delays enemy damage until the end of the player’s next turn, allowing reactive Block. These support two distinct lessons: turn unwanted options into purchasing power, and make a delayed obligation inspectable. The page does not establish a complete retention contract or precise purge-trigger ordering.
https://store.steampowered.com/app/1135810/Vault_of_the_Void/

**[2] StarVaders — official store description.** Chrono Tokens rewind time to undo mistakes or improve combinations; different mechs have distinct mechanics. This supports a deliberately exposed retry resource, but the page does not specify token counts, exact restoration scope, or every mech’s economy.
https://store.steampowered.com/app/2097570/StarVaders/

**[3] Monster Train — official store description.** Special map locations duplicate cards, and cards can receive upgrades. Duplication here is a deckbuilding decision in run space, not evidence of free tactical action replay. Transfer the distinction between increasing inventory and repeating execution; do not import the campaign prerequisite into the laboratory.
https://store.steampowered.com/app/1102190/Monster_Train/

**[4] Cobalt Core — official store description.** Cards compete between shields, dodging, and preemptive attacks; combat uses a single spatial axis, while time loops frame narrative progression. This supports readable competing uses, not an assumption that its narrative loop includes unrestricted combat rewind.
https://store.steampowered.com/app/2179850/Cobalt_Core/

### Secondary-source specifics, explicitly lower-confidence

**[5] Cobalt Core community trait reference.** Retain keeps cards through ordinary end-turn discard; Exhaust normally removes them from circulation for the fight. Temporary lasts one fight, whereas Single Use permanently removes a played card. Buoyant begins atop the draw pile; Recycle returns a played card to its top; Infinite stays in hand when played. These distinguish retention, recurrence, and identity lifetime. This is community documentation, not an exhaustive official interaction specification.
https://cobaltcore.wiki.gg/wiki/Card_Traits

**[6] Slay the Spire community Scry reference.** Scry inspects the top draw-pile cards and permits discarding selected ones; it does not itself reshuffle to fill a short inspection. Its filtering is therefore not the same as drawing. The page also distinguishes draw-pile discards from hand-discard conditions. Do not infer every discard trigger shares one meaning.
https://slay-the-spire.fandom.com/wiki/Scry

**[7] Slay the Spire community Echo Form reference.** Echo Form repeats the first played card each turn. The reference distinguishes copied execution from actual exhaust-pile movement and describes limits on interaction with other doubling effects. Transfer the need for explicit provenance and trigger rules, not every edge-case behaviour.
https://slay-the-spire.fandom.com/wiki/Echo_Form

**[8] Slay the Spire community Doppelganger reference.** Doppelganger spends remaining energy to increase next-turn draw and energy. This is an example of paid delayed payoff, not a loan from an identified future card. Exact upgrade quantities are unnecessary to the transferable lesson.
https://slay-the-spire.fandom.com/wiki/Doppelganger

**[9] GamingOnLinux’s StarVaders review.** Its account describes the Gunner exceeding the heat limit by burning the played card out of availability for the remaining battle. It also describes limited Chrono Tokens returning play to the start of the turn, and junk generated by being hit. This corroborates the official retry claim and supplies overheat specifics, but remains a reviewer’s account rather than a complete rules manual. Do not generalize Gunner heat to all mechs.
https://www.gamingonlinux.com/2025/05/starvaders-is-deck-building-meets-grid-based-tactics-and-its-basically-perfect/

**Synthesis, not sourced fact:** these games separate several kinds of scarcity remarkably usefully: usable hand, circulating deck, immediate purchasing power, future purchasing power, and retries. Stop the Invasion already adds scarce chronological placement. It need not add another wallet to obtain depth.

## Four verbs that must never collapse into “get a card”

**Reclaim: recover the actual historical card.** A visible historical action identifies a UID; the operation locates that UID in an eligible current inventory zone and moves it to hand. The old snapshot stays unchanged. A missing, already-held, or committed UID is not permission to fabricate a replacement. Returning a card does not restore its old turn-only grades. Start with discard eligibility rather than declaring exhausted cards recoverable.

**Echo: copy an action.** A past event supplies an execution recipe, not ownership of its source card. Echo creates another execution event without adding a permanent card to the deck. Integration must decide whether it reuses a recorded payload or reevaluates an effect; neither should silently mean “apply the already-modified result, then modify it again.” Payment, target validity, trigger participation, and recursion require visible rules.

**Borrow: accelerate a future draw.** Select an actual UID from the currently ordered draw pile and move it now. That establishes identity conservation, but not economic repayment: simply removing it from the pile still grants extra present throughput if the next refresh draws its usual amount. A genuine loan additionally debits a specified future draw allowance. The tooltip must name that allowance, not imply the card occupies a known encounter position.

**Steal: transfer an enemy effect.** Taking a portion of a revealed enemy payload should remove that portion from the enemy action and grant the corresponding player payload. If the enemy keeps everything, call it copying, not stealing. Preserve the enemy’s absolute anchor and visibly update modified intent. Recipient-generic effect semantics must determine compatibility; possessing an enemy animation is not a valid player card contract.

## Conservation and the short-turn pressure point

A useful proposed inventory invariant is: each live physical UID occupies exactly one inventory location; commitments reference that same object rather than create another. History contains evidence, not stock. Explicit creation introduces a new UID and lifetime; copying an execution need not create physical inventory at all. Exhaust, temporary creation, and future-return holding zones are optional extensions, not assumed current systems.

Energy is not literally conserved: refresh and authored gain generate it. The design requirement is **accountable creation and payment**. At planning, reserved commitments and paid utilities must fit available stored energy plus Surge under the existing Surge-first policy. Ordinary resolution gains remain unavailable to retroactively finance commitments. Reclaim must not refund the original play; Echo must not refund its historical payment; cancellation must not convert expired Surge into stored energy.

Loans need durable liabilities. If future rewind is introduced, restoring ordinary state must not accidentally restore the retry charge or erase the price of information already learned. That decision belongs to the replay owner. Reject “restore everything except an undocumented list” as a player-facing model.

**Derived from current rules:** over four consumed positions, one normal turn grants one cleanup refresh; four one-position turns grant four. Before costs, caps, and exceptions, that means four refresh increments rather than one and four batches of five cards rather than one. These are gross resource opportunities, not proof of an infinite or a guaranteed strategy. Stored cap four limits hoarding, not repeated earning-and-spending throughput.

Enemy actions at 2, 8, 14, 20 remain tied to positions, not cleanup count. Shortening can therefore manufacture more decision and refresh opportunities between attacks without moving an anchor. It also changes Block expiry, next-turn Ringing exposure, and visible past range. Paying a small shortening fee cannot be evaluated only against extra stored energy: improved hand selection, defensive timing, and repeated trigger access also have value.

Preserve that intended tempo choice, but make proposed delayed investments mature after consumed absolute distance rather than “next turn” unless accelerated maturity is specifically their attraction. Extension may bring a maturity marker into range; it should not pay a reward merely for enlarging inspectability. Scouting reveals more future timeline, not future cards, unless a card explicitly inspects the draw pile.

## Fifteen original transferable mechanics

All entries below are **original hypotheses**. Their guards are proposed eligibility rules, not hidden exceptions to existing content. Choose a small subset, not fifteen simultaneous subsystems.

1. **Receipt Return — Reclaim a visible past card.** Target its current discard UID; pay to move it to hand. Benefit: retrieve a known answer, combining with Exposed preparation. Liability: spend energy and a card opportunity on access rather than impact. Guard: only actual eligible UIDs; the retrieval source cannot retrieve itself. Ordinary replay still needs placement and payment. **Complexity: medium.**

2. **Rain Check — hold a tool for later.** Pay during planning to retain a selected hand UID through cleanup. Benefit: preserve the right defence for the next enemy anchor. Liability: energy spent now without immediate protection. Guard: the grant covers one cleanup rather than secretly becoming permanent, and changing selection never refunds paid utility costs. Combo: forecast plus a retained answer. **Complexity: low.**

3. **Delivery Manifest — inspect the next draw.** Pay to reveal a bounded prefix of the draw pile without moving cards. Benefit: choose whether to shorten for refresh or keep acting. Liability: fewer funds for this turn’s commitments. Guard: no reshuffle, search expansion, or new cards; invalidate affected knowledge after actual order changes. Combo: borrowing. **Complexity: low.**

4. **Early Delivery — borrow the revealed tool.** Move a revealed draw-pile UID into hand and debit the next normal refresh’s draw allowance. Benefit: access a specific answer before danger. Liability: a visibly thinner next hand. Guard: stop borrowing at the prepaid allowance limit; no second loan on the same UID. Combo: Manifest. **Complexity: medium.**

5. **Shift Swap — exchange now for next draw.** Put an unwanted hand UID atop the draw pile to take the currently revealed top UID. Benefit: improve the present without increasing hand count. Liability: deliberately worsen or constrain the next draw. Guard: atomic exchange, not a discard-plus-draw reward fountain. Combo: returning a tool useful after the next anchor. **Complexity: medium.**

6. **Layaway — move energy across distance.** Pay stored energy now for a single payout after a displayed absolute-position interval, credited at the first eligible planning boundary thereafter. Benefit: prepare a burst. Liability: illiquidity and possible cap waste. Guard: settle each deposit once, preserve cap rules, and never fund already-reserved actions. Combo: extension to cross maturity. **Complexity: medium.**

7. **Payday Advance — borrow refresh energy.** Gain planning Surge while encumbering a named future stored-energy refresh. Benefit: cover an urgent commitment. Liability: reduced later purchasing power plus unused-Surge expiry. Guard: one unresolved advance and a preview of its actual net repayment; no funding an advance with another advance. Combo: early finishing attempt. **Complexity: medium.**

8. **Burn the Warranty — overdraw through sacrifice.** Pay an otherwise unaffordable ordinary action by removing its actual UID from circulation for this encounter after use. Benefit: emergency reach. Liability: lose repeat access to a valuable card. Guard: commit removal with payment, including cancellation treatment; temporary copies cannot serve as collateral. Requires an explicit exhaust-like extension. **Complexity: medium.**

9. **Trade-In Counter — sacrifice options for Surge.** Discard a chosen hand card in an immediate, nonrefundable conversion. Benefit: turn poor fit into present purchasing power. Liability: less hand flexibility and lost energy at cleanup. Guard: each paid conversion consumes a real hand UID; any conversion limit resets by absolute progress, not cheap turn boundaries. Combo: an expensive retained card. **Complexity: medium.**

10. **Stamped Echo — repeat a recorded effect once.** Pay to place an echo of an eligible visible ordinary event in the current window. Benefit: another use without recovering inventory. Liability: energy and a chronological position. Guard: the licence marks its source event used and forbids descendant echoes; an initial eligible set excludes resource generation. Combo: Exposed then damage. **Complexity: high.**

11. **Lost-and-Found Exchange — recover through substitution.** Exchange a hand UID for a historical UID currently in discard. Benefit: precision without hand growth. Liability: surrender a currently available option and pay access cost. Guard: both objects change locations atomically; no duplicated inventory or implied historical rollback. Combo: swap surplus attack for the defence previously demonstrated. **Complexity: medium.**

12. **Time Capsule — store a physical card.** Remove a hand UID from circulation until a chosen eligible distance has been consumed, then return it at a planning boundary. Benefit: guaranteed future access without relying on reshuffle. Liability: immediate hand loss and delayed availability. Guard: no repeated maturity rewards; extension cannot duplicate the return. Requires an explicit holding-zone contract. **Complexity: medium.**

13. **Shoplifted Tomorrow — steal revealed enemy power.** Pay to transfer an authored-compatible portion of a revealed ordinary enemy effect into a current-window action. Benefit: strengthen Bob while reducing a threat. Liability: substantial access cost and lost flexibility if the stolen effect is poorly timed. Guard: debit the enemy payload once, keep its anchor, update intent visibly. **Complexity: high.**

14. **Hold for Collection — bind payoff to reaching danger.** Invest now for a reward after a displayed enemy anchor is consumed. Benefit: a strong post-threat recovery plan. Liability: survive the preceding interval with fewer resources. Guard: maturity follows consumption, not revealing or repeatedly crossing planning boundaries; reward settles once. Combo: retained Block protects the investment. **Complexity: medium.**

15. **Last Receipt — retry with a visible fee.** If future replay supports it, consume an encounter-limited permission to restore the beginning of the current turn with the same draw order and RNG state. Benefit: learn and revise execution. Liability: lose a nonrenewable permission. Guard: retry expenditure survives restoration and cannot be Echoed or reclaimed. Keep ordinary paused planning free. **Complexity: high.**

## Anti-patterns and the narrow recommendation

Avoid **history as an infinite second deck**, **Echo as free physical duplication**, **borrowing that leaves every future entitlement intact**, and **stealing that does not debit the enemy**. Avoid paid snapshots that restore their own payment, overheat whose collateral is a disposable generated copy, or purge loops that recover and resell the same card without meaningful progress.

Avoid making “next turn” the universal clock: shortening then accelerates interest, clears penalties, refreshes limits, and draws repayment money all at once. Conversely, do not silently normalize refresh per position; that would replace the current tempo contract. Assess strategies against both consumed positions and turn boundaries.

Also avoid a universal Paradox meter merely to price mechanics that already have clear liabilities. Energy, unavailable cards, missing future draws, and occupied action positions communicate different sacrifices directly. Hidden proc exclusions and escalating stacks of temporal synonyms would destroy that advantage.

**Minimal recommended resource model:** retain stored energy, temporary Surge, five-card refresh, and current commitments unchanged. Add no global currency. The first exploratory package should be Manifest, narrowly defined Receipt Return, and Rain Check: knowledge, recovery, and preservation are distinct, visible verbs. Add Early Delivery only when its future draw debit is equally visible. Evaluate Stamped Echo separately after provenance is settled; defer enemy theft, overheat, and retries rather than making them prerequisites.

The desired identity is **borrow, remember, and prepare—not print resources**. A player should be able to point to the receipt: where the card came from, what was spent, when the bill arrives, and why the timeline still contains only one history.

---

## Appendix 5: Run structure research — RunStructureResearch (scout)

# MOREMART: turning the laboratory into a complete game

## Direction and boundaries

**Recommendation:** build a complete, single-character shopping expedition before adding a party. Bob enters MOREMART, improvises a temporal fighting style, confronts a sequence of possessed employees, and shuts down an invasion device. Completion must mean an ending, not merely another unlock screen. Repeat play supplies alternative builds, encounter combinations and optional revelations.

This is future-product design, not implementation authorization. All proposals preserve the current **single encounter timeline advancing left to right, normally four positions per player turn**. Scouting reveals future positions; it does not grant placement there. Revealed enemy intent remains reliable, and anchors do not move without an explicit mechanic. Run-level changes never silently revise consumed encounter history. Reclaim, Echo, Rewind and Rewrite remain distinct, unimplemented capabilities; none is smuggled into a reward or event.

**Evidence labels:** “Verified” means supported by the linked developer/publisher material below. “Inference” means a design interpretation, not a measured result. All MOREMART designs are original proposals. Durations and quantities are unbalanced playtest hypotheses.

## What the comparison set actually establishes

### Cobalt Core: multiple personalities without multiple independent battlefields

**Verified [1, 6]:** three selected crew members contribute distinct card playstyles; their decks mix. Combat revolves around shielding, dodging and attacking with a ship on one spatial axis. Cards have split upgrade paths. Characters have personal stories, and progression untangles the time-loop narrative while unlocking playstyles.

**Inference:** a party can be a deck-composition device and dramatic ensemble without demanding a separate tactical board for every member. This is attractive for MOREMART eventually, but Bob already supplies a readable acting owner. Importing three card pools now would compete with learning chronology.

**Verified [7]:** an official update added ordinary enemies, an elite and alternate early-zone bosses, delaying their appearance until players had completed some runs. It also promoted a frequently lethal ordinary enemy to elite status. **Transfer:** encounter variety can be added behind a learning gate; enemy labels should describe experienced danger rather than authorial intention. The source does not establish universal difficulty thresholds.

### Chrono Ark: party identity is the product, not garnish

**Verified [2]:** this is explicitly single-player, party-based deckbuilding with up to four investigators. Skills and perks appear as cards; elimination resets acquired progress while further play reveals options. Its description advertises events, items, relics and bosses with individual patterns. Lucy’s amnesia and the Clock Tower provide the story premise.

**Inference:** recruiting a healer or specialist is compelling when protecting and developing several people is central. It also creates roster coverage, owner availability, targeting and survivability obligations. Its storefront does not document the exact shared-deck or reward algorithm, nor enough narrative detail to verify particular loop-ending requirements. Do not borrow those details from memory as established evidence.

### Wildfrost: the clock is an encounter language

**Verified [3]:** players select a leader with randomized skills/stats, recruit companions, collect items, attach charms and choose routes with travelling merchants. Combatants automatically act when turn counters expire. Snowdwell develops between runs, unlocking cards, tribes, events and cosmetics; a named Frost Guardian provides an advertised victory target.

**Inference:** enemies can become readable through a small timing vocabulary rather than many bespoke statuses. However, Wildfrost’s individual turn countdowns are not MOREMART’s absolute positions. Transfer the anticipation, not the clock implementation. Randomized leaders offer immediate variation but would weaken Bob’s dependable introductory identity.

### Slay the Spire: one character can carry a complete drafting journey

**Verified [4]:** four characters have distinct card sets; each attempt builds a deck through card selection. Routes vary in risk, enemies, relics and bosses. Events can help or harm the player; relics interact with decks.

**Inference:** single-character identity leaves room for several emergent strategies within one pool. Route selection is valuable when it expresses a current need, not because a branching map is mandatory. The consulted official page does not specify exact reward hand sizes, skip behavior or merchant stock rules; recommendations below are ours, not attributed rules.

**Verified [8]:** the developer’s GDC abstract describes combining metrics and community feedback while maintaining feel and difficulty. This supports measuring outcomes alongside human reactions, not treating a simulator’s winning policy as evidence of fun.

### Monster Train: a run can advertise its build opportunities

**Verified [5]:** primary and supporting clans supply access to both card pools. Route locations offer champion improvement, recruitment, card upgrades, passive bonuses and duplication. The game advertises events, clan-level card unlocks and boss previews introduced in an update. Its Hell Rush multiplayer is an eight-player competitive contest with equivalent resources/opponents—not cooperative party combat.

**Inference:** destinations can advertise the kind of deck problem they solve. Copying its floor system, duplication or upgrade economy would introduce unrelated commitments. “Has multiplayer” is particularly poor evidence that shared-timeline co-op is a small extension.

### Cross-game conclusion

The useful spectrum is **one character’s adaptable pool → combined specialist pools → individually vulnerable party members**. These are different products, not inevitable maturity stages. Likewise, unlockable options are verified in several sources, but “strictly horizontal, never power-increasing” is not established for every game. MOREMART should deliberately choose horizontal progression rather than assuming the comparison set proves it.

## Archetypes and encounter variety before party combat

Favor build tendencies, not class locks. Bob’s builder identity can support three overlapping approaches using the existing vocabulary:

- **The Scheduler:** scout upcoming anchors and place damage/Block at useful current-turn positions. Target: future information/current placement. Tradeoff: planning energy versus immediate protection. Combo: scout, then order Exposed before a hit. Abuse risk: information becomes mandatory tax. Complexity: low–medium.
- **The Closer:** assemble Exposed followed by decisive damage, using paid grades to improve the payoff. Target: exact current-turn cards/positions. Tradeoff: setup versus surviving the next anchor. Combo: Surge funds the committed sequence. Abuse risk: one dominant burst line erases encounter differences. Complexity: low.
- **The Shift Worker:** alter the movement window to choose which anchored actions are crossed before cleanup. Target: current-turn endpoint, not enemy anchors. Tradeoff: utility spending and immediate exposure. Combo: extension lets a setup/payoff resolve together. Abuse risk: shortening farms draw and energy per absolute position. Complexity: medium; do not make this a supported archetype until that incentive is understood.

These are tendencies, not three disjoint reward pools. A future history-oriented archetype should require one validated temporal verb, not all four history systems together.

For encounters, vary the **question**, not just damage totals. Possessed Security teaches Block before an anchored hit. A possessed demonstrator tests interrupting setup with decisive damage. A stockroom worker alternates defensive and offensive actions, testing when to commit resources. A customer-service host uses existing healing, testing whether the player can construct a burst window. An elite combines two previously taught demands. A boss recombines familiar actions around one clearly advertised special rule.

Employees retain recognizable work habits and personality: the threat is alien possession, not anonymous zombie attrition. A boss can remain one living target; several dangerous actions on the timeline already create competing priorities. Sequential duels also allow different personalities without summon rules, ally death or manual target selection.

Avoid punishments that retroactively invalidate reliable intent. If a later boss edits an upcoming action, announce the editing action and visibly update its consequence. That is additional temporal design, not an excuse for surprise damage.

## Three materially different complete run structures

### A. LAST CUSTOMER — the minimal complete Bob game

**Promise:** “Get the thing you came for. Stop the invasion on the way out.” A compact expedition with a recognizable beginning, build arc and ending.

**Structure:** entrance duel → department duel → service stop → department supervisor → department duel → optional harder duel or safer supply encounter → preparation stop → final duel at the checkout invasion device. Thus a run contains six mandatory fights, optionally seven. Department choices are simple paired doors; both reconnect to the next story beat. No sprawling map is necessary.

After ordinary wins, offer a small card choice plus a clear skip option. A proposed choice of three is only a starting hypothesis. Early offers should contain immediately useful cards; later offers can provide stronger synergy commitments. A service stop lets the player choose recovery or deck refinement under the economy team’s eventual contract. It need not be a full shop or introduce a currency. Permanent run-level refinement must not be confused with this-turn signed grades.

The final boss tests ordering, protection and one validated temporal signature. Existing scouting/window control can establish timing literacy, but a stronger literal time-travel promise may require adding one bounded history verb before marketing this as a history-changing game. That dependency belongs to combat design, not the route system.

Defeat resets the expedition’s combat build. Victory frees the final host and closes the immediate invasion story. Optional employee memories, alternative starting packages and encounter variants encourage replay without requiring permanent stat gains. Knowledge persists as narrative records, not recoverable card inventory.

**Tradeoff:** strongest scope-to-completeness ratio, clearest tutorial and easiest ending to deliver; fewer strategic route permutations. Replayability must come from good fights and drafts, not pretending a shallow map is deep. **Complexity:** low relative to the alternatives, although campaign persistence and rewards remain new systems.

### B. THE SAME SATURDAY — a knowledge-led store mystery

**Promise:** “You know what happens at closing. Change what causes it.” Keep Bob and 1v1 combat, but make each expedition a deliberate investigation rather than a random climb.

**Structure:** choose two departments to investigate → face their encounters and obtain testimony → choose one intervention → face its security response → enter the closing confrontation. The store layout stays recognizable. Earlier expeditions teach which employee, announcement or delivery matters. Different investigation orders expose different context and later encounter variants.

An intervention uses a run-level fact: for example, recovering a loading-bay record reveals who authorized the alien shipment, allowing a different approach to the final confrontation. It does not replay old absolute positions or copy a previous run’s cards. “Change the past” here initially means acting differently on the next visit to a repeated day; literal mid-encounter history editing remains separate.

Offer a small opening draft informed by the chosen objective, then fewer but more thematic encounter rewards. A predictable service location supports planning around a known need. Narrative receipts summarize what changed in the store; they are a presentation motif, not an invented currency. The standard closing battle can be won immediately, providing a complete local ending. Optional accumulated knowledge unlocks an explanatory finale, avoiding a mandatory failure quota.

**Tradeoff:** strongest integration of repeated runs and time-loop fiction; less procedural novelty and much greater writing/state-combination burden. Risks include walkthrough dependence, repetitious opening fights and players mistaking story persistence for inventory persistence. Mitigate with a readable evidence journal, explicit consequences and short familiar openings—not unexplained timeline resets. **Complexity:** medium–high.

### C. NIGHT-SHIFT RESCUE — the later party expedition

**Promise:** “Build the crew that can get everyone through closing.” This is a longer rescue-and-composition campaign, not simply A with more portraits.

**Structure:** choose Bob and one unlocked coworker → complete two department operations, each containing an opening encounter, rescue/service choice and supervisor → choose a final preparation destination → confront the regional-manager host. Rescues reveal future roster options and stories; avoid forced mid-run roster churn in the initial party version.

Proposed identity: Bob supplies construction/protection, while a coworker supplies a complementary card family. One player controls the party. Start with two members, not four. Retain one encounter timeline and propose retaining the baseline four-position team window rather than granting four positions per member; whether this feels expressive enough is a gating prototype question. Shared versus separate health, energy and deck ownership require explicit contracts before approval. No implicit migration is assumed here.

Drafting now asks both “does this improve the deck?” and “whose contribution do I strengthen?” Routes advertise services relevant to the composition. Story comes through employee disagreements, rescue outcomes and the final escape. Run defeat resets the expedition build; recruits persist as options only if the final progression design adopts that rule.

**Tradeoff:** strongest ensemble identity and combinatorial roster appeal; materially higher art, targeting, death-state, hand-composition and tutorial costs. A support character who cannot function when their partner falls is a product-level design problem. **Complexity:** high. Defer until 1v1 has demonstrated several enjoyable builds.

## Pacing, progression and explicit deferrals

**Playtest hypotheses, not benchmarks:** for A, target approximately 30–45 minutes after familiarity, ordinary duels around 2–4 minutes, and supervisors/finale around 5–7. Allow longer first runs. Introduce at most one unfamiliar encounter demand at a time; seek a meaningful draft or route decision every one or two fights. Test B around 35–50 minutes and C around 50–75, with suspend/resume essential to the longer option. These estimates include reward reading and transitions, not just animation time.

Measure whether players can explain why a fight differed, whether they anticipate the next boss’s demand, whether skipping a reward feels legitimate, and whether losses prompt another build idea rather than “I need permanent stats.” Watch absolute positions consumed as well as turns: short-turn refresh advantages can distort apparent pacing. Unlimited planning remains intact; duration targets never justify a timer.

**Defer:** co-op/networking; four-member parties; separate actor timelines; summon-heavy multi-target fights; procedural world generation; daily leaderboards; permanent power-grind trees; large relic libraries; shops with several new currencies; compulsory relationship meters; unrestricted Rewind/Rewrite; cross-run card recovery; and a branching true-ending maze.

Co-op separately requires authority over shared positions, simultaneous reservations, conflict resolution, commit/undo consent, disconnect recovery and anti-quarterbacking design. More characters under one mind solve none of those problems. Shared seeds or comparing run summaries could eventually supply social value without changing paused solo planning.

**Decision:** choose A unless the team explicitly prioritizes mystery authorship over repeatable tactical drafting; then choose B. Treat C as a later product decision, not a prerequisite for making Bob’s laboratory a game.

## Primary-source evidence ledger

1. https://store.steampowered.com/app/2179850/Cobalt_Core/ — developer-authored feature description: crew mixing, upgrades, tactical axis and loop framing; not a complete reward specification.
2. https://store.steampowered.com/app/1188930/Chrono_Ark/ — party size, reset/options model, events/bosses and story premise; insufficient for detailed loop chronology.
3. https://store.steampowered.com/app/1811990/Wildfrost/ — leader variation, counters, merchants/routes, companions and hub unlocks; not evidence for MOREMART pacing.
4. https://store.steampowered.com/app/646570/Slay_the_Spire/ — character pools, drafting, risky/safe routes, relics, events and bosses; no precise reward algorithm established here.
5. https://store.steampowered.com/app/1102190/Monster_Train/ — clan combination, destination services, unlocks, boss previews and competitive multiplayer distinction.
6. https://braceyourselfgames.com/cobalt-core/ — publisher corroboration of crew/story/playstyle framing; substantially overlaps [1], not independent experimental evidence.
7. https://braceyourselfgames.com/2024/06/17/cobalt-core-update-1-1-more-enemies/ — concrete encounter expansion, learning gates and danger reclassification.
8. https://www.gdcvault.com/play/1025731/-Slay-the-Spire-Metrics — developer talk abstract on metrics and community feedback; abstract consulted, full talk not claimed as reviewed.

Research only. No repository edits, builds, tests, linters or formatters were performed.

---

## Appendix 6: Readability research — ReadabilityResearch (scout)

# Readability research: trustworthy time travel

## Direction and evidence boundary

**Recommendation:** Make Stop the Invasion a game about confidently changing *when things happen*, not deciphering what the interface secretly means. Bob can be confused by MOREMART’s possessed staff; the player should not be confused by whether position 8 still means position 8.

The current foundation is one absolute-index encounter timeline, advancing left to right, normally four positions per turn. Empty positions consume time. Revealed enemy intent is reliable unless an explicit mechanic modifies it. History is currently read-only, not another inventory. Reclaim, Echo, Borrow and Rewrite below are future teaching proposals, not implementation claims or decisions about unresolved identity, payment or replay contracts.

The research supports accessible presentation and concrete precedent, not a scientifically optimal number of choices. All budgets, teaching order and playtest thresholds below are **original, testable design hypotheses**. No claim about working-memory capacity, universal attention spans or an inevitable relationship between choice count and enjoyment is being made.

## Seven source findings and transferable limits

1. **Subset Games, Into the Breach:** The developer explicitly describes all enemy attacks as telegraphed in minimalistic turn-based combat. **Transfer:** reliable intent can be the premise of interesting counterplay rather than something enemies must routinely conceal. **Limit:** this description does not establish that complete information prevents paralysis, or document every preview/undo rule. https://subsetgames.com/itb.html

2. **Justin Ma and Matthew Davis, developer interview reported by Game Developer:** They describe constant playtesting and checking whether small playable chunks were interesting; macro-strategy took longer to judge. **Transfer:** test one temporal interaction in a complete encounter before interpreting a large system diagram as proof of fun. **Limit:** this is the interviewer’s account of developer explanations, not controlled evidence or a full transcript. https://www.gamedeveloper.com/design/-i-into-the-breach-s-i-designers-explain-how-to-follow-up-from-a-hit-game

3. **Xbox Accessibility Guideline 109:** Recommends reviewable objectives, optional guidance, interactive or demonstrated tutorials, and tutorials available on demand; static control screens are insufficient. **Transfer:** teach each time verb through an action and make that lesson revisitable. **Limit:** broad accessibility guidance, not a validated curriculum for this game. https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/109

4. **Xbox Accessibility Guideline 107:** Recommends alternatives to path-based gestures and sustained holds, single non-simultaneous inputs, cancellation before completion, and suitable touch-target sizing and spacing. **Transfer:** dragging and holding may be expressive defaults, but cannot be the only ways to plan or inspect. **Limit:** its platform-specific recommendations are not interchangeable with CSS sizing. https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/107

5. **Xbox Accessibility Guideline 101:** Recommends configurable text, scaling to 200% of the stated minimum sizes without losing meaning/functionality, and applying readability settings to important notifications too. **Transfer:** an enlarged card cannot excuse unreadable costs, timeline labels or consequence warnings elsewhere. **Limit:** physical mesh text still needs device/viewing-distance evaluation; a texture resolution is not a readability measurement. https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/101

6. **Game Accessibility Guidelines, colour independence:** Recommends using text, symbols, patterns or shapes alongside colour, and reducing colour reliance before relying on palette filters. **Transfer:** distinguish history, playable present, revealed future and uncertainty without hue. **Limit:** a grayscale check catches some dependence; it does not validate every visual-accessibility need. https://gameaccessibilityguidelines.com/ensure-no-essential-information-is-conveyed-by-a-fixed-colour-alone/

7. **W3C WCAG 2.2 target-size guidance:** Sets a 24-by-24 CSS-pixel minimum with defined exceptions and explains why larger, sufficiently separated targets help avoid accidental activation. **Transfer:** audit actual interactive hit areas, including tiny node controls, not just their illustrations. **Limit:** this is web guidance and a minimum, not a recommended final iPad target size or proof of accessible gameplay. https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html

## Three clocks, one schedule

Use three explicit phrases everywhere:

- **“At position 8”** means the absolute encounter location. Keep its number stable when the viewport pans or the turn endpoint changes. Use a fixed-position marker, not a generic clock alone.
- **“Next turn”** means the next player-turn boundary. Show the boundary as a labelled divider. A changing movement budget changes which positions belong to turns; it does not renumber the encounter.
- **“Next draw”** means the next draw event; **“top card of draw pile”** means pile order. Neither promises a particular position or turn. A draw during resolution can occur before cleanup.

Do not print “in 2” without the unit. Prefer “2 positions ahead,” “next turn,” or “second in draw pile.” Place draw-order information in a separately labelled detail strip, not a second timeline. Run-level persistence, if proposed later, gets an explicit “this encounter” or “this run” label rather than another ambiguous duration badge.

Keep the current playable endpoint conspicuous. Reveal/scouting extends *inspectability*, not the placement area. Extension/shortening affects both the playable endpoint and readable-past span; show both boundary changes together. Demonstrate that an empty position still advances the cursor. Never visually compress empties into no elapsed time.

## Stable intent and honest differences

Use four plain states: **Unknown, Revealed, Changed, Resolved**. Cancellation needs its own explicit result label, not disappearance. Unknown means information unavailable; Changed means an identified rule altered previously reliable information.

For a proposed schedule-changing enemy, show actor, trigger and modification: “Supervisor reschedules [action]: position 8 → 9.” This is an illustrative future mechanic, not permission to move today’s fixed anchors. Keep a marked trace at the old location and the action at the new one. Inspection must reveal the causal rule and when it applies. If the destination is intentionally hidden, state the bounded uncertainty before commitment; do not display an exact destination as reliable and then secretly reroll it.

Planning previews should compare the existing plan against the selected change: damage taken, damage dealt, Block consumed/expired, energy committed, timing boundaries, and any affected inventory/draw consequences allowed by the final contract. Lead with changed outcomes, then permit chronological inspection. Show “unchanged” where a player plausibly expects movement, such as an enemy anchor after ordinary placement.

Preview exact deterministic consequences only where supported. Mark unknown draws and dependent downstream outcomes rather than inventing an exact total. A preview must neither reveal a hidden card for free nor consume randomness. Show an early-lethal cutoff so effects after combat ends are not advertised as earned benefits.

## What belongs where

| Surface | Required information | Keep elsewhere |
|---|---|---|
| Card face | Name, readable cost, primary effect/value, timing phrase, temporal verb when relevant, critical target restriction, nonrefundable/immediate warning | Full derivation, historical provenance, flavour explanations |
| Timeline node | Absolute position, action owner, compact action/value, current/past/future eligibility, intent state, cancellation/change marker | Complete rules paragraphs and modifier arithmetic |
| Detail view | Full rules, terms, target/identity binding, source position, exact cost/expiry, ordered modifier explanation, before/after diff, why a target is invalid | Exhaustive unrelated encounter history |
| Logs only | Older concealed history as permitted by the history contract, verbose event sequencing, technical IDs/debug provenance in an appropriate diagnostic view | Anything necessary to understand a current legal decision |

Logs must not circumvent the current restriction on inspecting older concealed history. The fact that records exist does not make them freely actionable or revealable. Paid immediate planning activations belong in a labelled planning-event record, not fake historical positions.

Signed grades should show their net result on the card/node and their sources in detail. Identify whether the attachment follows **this card** or stays **at this position**. Do not expose raw UIDs as ordinary player vocabulary. Distinguish “free stored energy,” “committed,” and “temporary Surge”; never imply that later resolution energy can pay an already invalid commitment.

## Teaching sequence: act, predict, transfer

**0. Read the present.** One small encounter teaches four positions, left-to-right resolution, one empty position, reliable enemy intent and a turn boundary. Ask the player to predict whether Block exists when the hit lands. Do not simultaneously introduce grades, draw-order tricks and timeline resizing.

**1. Reveal — inspect the future.** Reveal an authored future threat beyond the playable endpoint, then ask the player to prepare without placing there. The verb targets hidden future information; its benefit is knowledge, not extra time. Its existing planning cost is paid now and nonrefundable. A possible combo is preparing defense before the later threat. Risk: free information through previews/cancellation. Complexity: low when restricted to timeline scouting; teach revealing draw-pile identities separately if adopted.

**2. Reclaim — recover the card.** Show a past action and its associated actual card under the inventory owner’s eventual eligibility rules. Ask which object returns and where it was removed from. Benefit: another opportunity to use that card; tradeoff: the approved reclaim payment/opportunity cost, visibly stated. Combo: recover a useful defensive card. Risk: treating the snapshot as a duplicate inventory. Complexity: medium. Never imply every visible action contains a recoverable card.

**3. Echo — repeat the action.** Contrast directly with Reclaim: “You are replaying an action, not receiving its card.” Present one simple prior hit before statuses or draws. Show which values are recorded versus recalculated according to the adopted replay contract. Combo: repeat an earlier attack into a new setup. Risk: recursive echoes or replaying resource gains. Complexity: medium/high; the lesson must not silently choose snapshot semantics.

**4. Borrow — take from the future.** Only teach after next-draw and next-turn are distinguishable. Identify the precise source domain on the card; if borrowing a future draw, preview its actual approved inventory movement and later consequence. Benefit: earlier access; tradeoff: the adopted future cost or displacement, not an invented generic debt currency. Combo: access defense before the threat. Risk: duplication, skipped repayment, or shuffle ambiguity. Complexity: high. If the player cannot explain what later changes, the mechanic is not ready.

**5. Possible Rewrite — change history and propagate.** Gate behind mastery, not a mandatory opening tutorial. Start with a deterministic historical hit and a short consequence chain. Show old event → changed event → affected later outcomes → resulting present. Cost and replay semantics remain the system owner’s decision. Combo: alter an earlier setup to improve a later result. Risks: card/RNG divergence, resurrection and resource multiplication. Complexity: very high. Never market it as simple undo; defer if the diff cannot explain it honestly.

## Recovery, touch and paralysis

Offer cancellation while selecting targets and revising uncommitted placements. Clearly separate this from a paid activation: Surge and timeline utilities spend immediately and do not become refundable through a generic Undo button. Show cost, expiry and “activate now” before that boundary. No confirmation is needed merely to inspect a card.

Retain pickup enlargement and hold inspection, but propose tap-to-pin inspection and select-card/then-select-node alternatives. Releasing a held detail should not accidentally commit the card underneath. Put consequence text above or beside the finger, and allow inspection without maintaining pressure. Use persistent text plus shape/pattern cues; audio and motion may reinforce but never uniquely convey a reschedule.

Do not cure planning paralysis with a timer: unlimited paused planning is part of the contract. Keep the immediate question visible—“Threat at position 8; your plan currently takes damage”—with optional explanation, not an unsolicited optimal move. Show a short consequence summary before a long causal tree. Permit a player to stop analyzing a safe-enough plan without awarding an implied “perfect” score.

**Complexity budget, proposed:** one new temporal verb per teaching encounter; initially one temporal verb plus one familiar combat status in a puzzle; one timing domain per introductory card; at most three headline changes before expandable detail. Preserve all four baseline positions. These are authoring/display budgets, not caps on existing signed grades, permanent rules, or claims about human memory.

## Playtest tasks and acceptance criteria

Run moderated paper/clickthrough sessions first, including deckbuilder newcomers and participants with relevant access needs. Proposed gates are design targets, not population-level validation:

- **Clock sorting:** classify six effects across position/turn/draw timing, then predict one shortened-turn example. Gate: at least five correct, including the shortened-turn case. Failure: “next draw is always next turn.”
- **Reveal transfer:** scout and attempt a legal plan. Gate: player explains that visibility did not create slots without prompting. Failure: repeated drops beyond the endpoint.
- **Reclaim/Echo contrast:** predict card location and action result in matched examples. Gate: both distinctions correct; no duplicate-card expectation.
- **Schedule trust:** inspect one explicit enemy modification. Gate: identify actor, trigger, old/new position. Failure: attribute it to unreliable UI or randomness when neither applies.
- **Recovery:** inspect, cancel a placement, and decline a paid activation. Gate: no unintended spend; player identifies the nonrefundable boundary before accepting.
- **Access:** perform the same plan without dragging/holding, then without colour information and at enlarged text. Gate: all essential tasks possible without clipped rules or hidden confirmation consequences.
- **Planning observation:** record repeated inspections, unchanged-plan cycling, abandoned turns and requests for definitions. Long thinking alone is not failure; inability to explain what information is missing is a redesign signal.
- **Rewrite gate:** predict changed versus unchanged outcomes and explain the diff. Any unexplained card identity or randomness change blocks promotion of Rewrite into the core direction.

These tasks are proposed research, not tests performed during this design-only assignment.

---

## Appendix 7: Temporal mechanics bank — TemporalSystemsDesigner (design writer)

# Stop the Invasion: temporal mechanics direction and idea bank

## Status and recommendation

This is original design, not an implementation specification or a claim about other games. Current-game facts come only from the supplied design brief. Every new rule below is a **proposal**. Every gameplay quantity in an example is **provisional, unbalanced, and untested**; the current four-position turn is a constraint, not a new balance recommendation. The library is intentionally wider than the recommended game.

**Recommended identity: Bob fights the invasion by exploiting MOREMART’s receipt policy.** He reads what is coming, borrows against it, and redeems evidence of what already happened. Aliens manipulate time; Bob treats causality as a badly managed returns counter. Possessed employees remain recognizable people doing recognizable jobs, with alien compulsions making their ordinary work terrifyingly literal.

Ranked recommendation:

1. **Anchor on Foresee + Borrow + Echo.** Information enables decisions; borrowing creates an obligation; echoing makes recorded history useful. Together they deliver time travel without requiring arbitrary resimulation.
2. **Add Reclaim as a scarce inventory operation.** Retrieving the actual used card is materially different from replaying its recorded action. Teach that distinction explicitly.
3. **Use Queue sparingly.** A few visible future instructions make the right side of the timeline feel consequential without turning it into a second hand.
4. **Trial active status transfers before historical status extraction.** The former has an understandable donor and conservation rule; the latter easily becomes an invisible mint.
5. **Reserve causal Rewrite for a separate prototype.** Do not make a full-state replay engine the prerequisite for discovering whether the receipt fantasy is fun.

For an initial feature experiment, choose a handful of mechanics from this bank, not one from every category. These are candidates beyond the shipped milestone; none authorizes changing current read-only history.

**Cadence warning.** Under the supplied baseline, a normal four-position turn contains at most one enemy anchor because anchors are six positions apart. Ringing allows the first chronological action, so it does not suppress that ordinary enemy pattern; do not sell it as a useful enemy stun without an explicit multi-action interaction. Likewise, shorter turns structurally buy more refreshes and new-hand opportunities per absolute distance. That is an incentive hazard, not proof of an achievable infinite loop: activation costs, caps, availability, and supply still matter. Favor deadlines and interest based on actual positions crossed. Keep energy advances payable at the next refresh so shortening brings repayment forward too. Evaluate new benefits against both normal and shortest legal turns before interpreting an apparently generous debt cost as meaningful.

## Proposed safe defaults: one world, one chronology

**Identity.** A physical card keeps one immutable UID as it moves among hand, draw pile, commitments, discard, and other explicitly defined zones. Reclaim moves that object; it never manufactures another. An action occurrence has a separate event ID. Echo creates a fresh occurrence referring to an old occurrence, not a fresh physical card. A history snapshot is evidence, not ownership. Status instances retain their own source and remaining-lifetime metadata.

**Timeline.** Absolute position increases left to right. Turn boundaries, draw-pile order, and absolute positions are different clocks. Ordinary placement remains restricted to the current playable window. Scouting reveals; it does not grant placement. Enemy anchors do not move unless a named future mechanic explicitly permits it. No recommendation here requires that permission.

**Immediate events.** Surge and timeline utilities remain nonrefundable planning activations, recorded in an ordered planning-event journal rather than consuming historical positions. They are ineligible for ordinary Echo, Reclaim-by-position, and empty-position effects. Reclaim may target their physical card only if a later design explicitly makes that zone eligible; default is no.

**Chronological triggers.** Proposed phase order at a consumed position: resolve explicitly queued start-of-position effects, then its scheduled ordinary action, then after-position effects; within a phase use creation order. Preview this order. Check lethal after each atomic effect and stop immediately. Cleanup is a separate boundary event. No activation can create an earlier-phase trigger at the position currently resolving. Canceled actions remain recorded but do not count as successful actions.

**Replay eligibility.** Default Echo copies only an eligible ordinary action’s printed payload plus recorded signed grade; it does not copy paid cost, past output totals, historical critical classification, or external statuses. Current target state determines outcomes. Exclude draw, energy, retrieval, scheduling, Echo, and Rewrite payloads initially. Echo is not an ordinary card play and cannot itself be echoed. Its provenance remains inspectable. This narrow default can later expand deliberately.

**Costs and obligations.** Proposed debt uses an obligation marker, not a new spendable currency. It cannot retroactively fund reservations. Resource repayment occurs before new planning commitments become possible. Absolute-position deadlines must be crossed, not merely approached by a planning activation. Shortening cannot repeatedly refresh a temporal benefit while freezing its bill. Exact penalties are card-specific and visible before commitment.

**Conservation.** Active transfer removes actual live status units from a donor. Historical copying removes nothing from the present and must be priced and labeled as creation. Transferred benefits keep their original expiry; transferring cannot refresh them. For turn-relative effects, preserve the original due boundary rather than silently rebinding to the new owner’s next turn. Non-stackable or recipient-specific effects are ineligible unless explicitly supported.

## Broad mechanics library

Each entry names a player verb, domain, concrete operation, limitation, combo, exploit risk, and complexity. Similar fiction does not mean interchangeable rules.

### A. Future information

**1. Read ahead — Receipt Preview.** Domain: unrevealed future absolute positions. Reveal the next enemy anchor beyond the playable window; do not extend placement. Tradeoff: spend a card or immediate scouting cost now for no direct protection. Combo: shorten to prepare before the attack. Risk: free repeated peeking makes hidden information meaningless; reveal is persistent knowledge, not a refundable purchase. **Complexity: low.**

**2. Inspect supply — Stockroom Camera.** Domain: draw-pile order. Inspect the next few actual card UIDs without moving them. Tradeoff: this does not reveal enemy time or guarantee those cards survive a later shuffle. Combo: choose whether a draw effect is worth scheduling before an attack. Risk: misleading certainty after pile mutation; visibly invalidate the forecast on shuffle. **Complexity: low.**

**3. Mark a condition — Price Prediction.** Domain: one revealed future enemy event ID. Predict a public outcome such as “this attack deals no health damage”; reward successful prevention after resolution. Tradeoff: the marked event must occur, and canceling it pays nothing. Combo: plan Block precisely. Risk: trivial conditions generate automatic income; use authored predicates and one claim per event. **Complexity: medium.**

**4. Leave instructions — Manager’s Contingency.** Domain: one future trigger, not a future card slot. Queue “if the revealed attack still has Exposed on its target, remove a unit before it hits.” Tradeoff: escrow the effect now; a false condition wastes it. Combo: combine scouting with selective protection. Risk: hidden condition scripting; permit only printed predicates and show a single readable branch. **Complexity: medium.**

**5. Check the alternative — Dry Run.** Domain: the current proposed schedule. Preview exact deterministic results through a chosen visible anchor, with no state mutation. Tradeoff: reveals no concealed draws or intentions and supplies no combat power itself. Combo: compare grading a shield versus an attack. Risk: mandatory paid arithmetic assistance; preferably make basic preview free UI and reserve the card for genuinely additional information. **Complexity: medium.**

**6. Fix a forecast — Hold That Thought.** Domain: a revealed draw-pile UID. Keep that card at the top through the next shuffle, then release the protection when drawn. Tradeoff: cannot search unseen cards or protect multiple cards by repeatedly casting. Combo: guarantee a Borrow target or a crucial draw. Risk: shuffle avoidance becomes permanent deck thinning; use one expiring protected identity. **Complexity: medium.**

### B. Drawing and borrowing

**7. Pull forward — Advance Delivery.** Domain: the top draw-pile card. Move the actual card into hand now, marking a future normal draw opportunity as already used. Tradeoff: the later hand is smaller; extra draws cannot silently pay the bill. Combo: inspect supply before borrowing. Risk: lethal makes deferred cost irrelevant; price immediate access as well as the debt. **Complexity: low.**

**8. Borrow selectively — Reserve Collection.** Domain: the revealed top portion of the draw pile. Retrieve a chosen UID, preserving the relative order of all remaining cards. Tradeoff: defer an equivalent future draw and pay more than blind borrowing. Combo: Stockroom Camera finds the right tool. Risk: becomes universal tutoring; constrain visible depth and never permit searching the entire deck. **Complexity: medium.**

**9. Park for later — Hold Behind Counter.** Domain: a card already in hand. Move it into a visible escrow packet released after a specified future absolute position. Tradeoff: lose present access and a scarce packet capacity; release is not a draw. Combo: preserve a defense through cleanup. Risk: escaping every discard rule; make escrow a distinct, tightly limited zone. **Complexity: medium.**

**10. Skip ahead — Clearance Skip.** Domain: inspected draw-pile order. Put a chosen revealed top card at the bottom, exposing the next card without drawing it. Tradeoff: the rejected card is delayed, not converted to resources. Combo: improve an upcoming resolution draw. Risk: cycling an entire deck for free; one bounded movement per activation, with ordering preview. **Complexity: low.**

**11. Mortgage a card — Tool on Credit.** Domain: a hand card’s actual UID. Gain immediate Surge by locking that card in escrow until a future absolute deadline. Tradeoff: it cannot be played, discarded for value, or reclaimed while pledged. Combo: pledge an irrelevant attack to afford emergency defense. Risk: short-turn energy farming; each UID cannot secure overlapping loans. **Complexity: medium.**

**12. Return the advance — Cooling-Off Period.** Domain: an outstanding borrowed-card UID still in hand. Return that exact uncommitted card to its recorded insertion boundary and cancel its attached draw debt. Tradeoff: reclaim no activation cost; invalid if the card moved or pile order was shuffled. Combo: abandon an advance after new information. Risk: free peek loops; information and costs remain spent. **Complexity: high.**

### C. Historical reclaim and echo

**13. Retrieve the object — Valid Receipt.** Domain: an eligible past card UID currently in discard. Move the actual card into hand. Tradeoff: costs a resource and still requires paying and scheduling the card normally; failed eligibility gives no substitute. Combo: recover a situational shield. Risk: treating history as duplicate inventory; show its current zone before selection. **Complexity: low.**

**14. Repeat the action — Do That Again.** Domain: a readable eligible past action occurrence. Resolve its echo-eligible payload at the Echo card’s present position. Tradeoff: exclude recursive and economy payloads; no physical card retrieval. Combo: repeat a previously graded defense against a fresh attack. Risk: replaying recorded damage ignores current mitigation; recompute from the payload against current state. **Complexity: medium.**

**15. Prepare a callback — Rain Check.** Domain: an eligible past action and a future after-position trigger. Queue its Echo for later, at a visible deadline. Tradeoff: pay now and accept that target state may change before payoff. Combo: queue Block immediately before a known anchor using explicit phase timing. Risk: disguised out-of-window placement; display it as a queued instruction, never a future card slot. **Complexity: medium.**

**16. Redeem a blank — Paid Break.** Domain: a genuinely empty consumed position. Exhaust that historical blank as a claim to retain a hand card through cleanup. Tradeoff: requires having spent real encounter time doing nothing and supports one claim per position. Combo: leave a safe gap before an enemy anchor. Risk: canceled actions masquerading as blanks; distinct snapshot types prevent it. **Complexity: medium.**

**17. Recover a failure — Missed Connection.** Domain: a canceled ordinary action whose card is now eligible in discard. Reclaim that UID at reduced cost, without resolving its old action. Tradeoff: cannot target a successful action or undo its cancellation consequences. Combo: rebuild after enemy disruption. Risk: intentionally canceling cheap actions as a draw engine; no resource refunds or extra on-play triggers. **Complexity: medium.**

**18. Preserve a reference — Keep the Receipt.** Domain: one historical occurrence. Bookmark it so it stays inspectable and selectable after it leaves normal lookback. Tradeoff: a limited bookmark capacity, with no extra action or card gained. Combo: preserve a strong Echo target. Risk: tiny unreadable archives; one compact pinned receipt is preferable to an expanding second timeline. **Complexity: low.**

### D. Energy debt and temporal finance

**19. Advance wages — Tomorrow’s Overtime.** Domain: stored-energy refresh. Gain Surge now in exchange for withholding part of the next moving-turn refresh. Tradeoff: repayment precedes planning, even when it leaves no new energy. Combo: fund a longer current plan. Risk: repayment from otherwise-overcap energy becomes free; calculate withholding before cap application and price the advance independently. **Complexity: low.**

**20. Choose maturity — Payment Terms.** Domain: an existing unpaid energy obligation. Move its collection from the next refresh to the first refresh after a chosen absolute deadline, increasing the amount owed. Tradeoff: flexibility costs more and does not erase principal. Combo: bridge a known dangerous anchor. Risk: perpetual refinancing; permit only one deferral per obligation. **Complexity: medium.**

**21. Deposit for yield — Layaway Power.** Domain: presently available stored energy. Remove energy now; return it with a modest bonus after the timeline crosses a declared absolute position. Tradeoff: no early withdrawal, no reservation funding before maturity, ordinary energy cap still applies. Combo: finance an extended future turn. Risk: shortened-turn interest farming; passage of absolute time, not cleanup count, earns yield. **Complexity: medium.**

**22. Offer collateral — Security Deposit.** Domain: current live Block and a new Surge advance. Remove Block now to obtain temporary energy; repayment later restores only the pledged amount under a printed expiry rule. Tradeoff: surrender immediate protection; this is conversion, not duplicated shielding. Combo: after surviving one anchor, fund a counterattack. Risk: borrowing against already-spent Block; remove collateral atomically. **Complexity: medium.**

**23. Accept a penalty — Late Fee.** Domain: a payable obligation at collection. Choose before resolution whether to pay available stored energy or take a printed harmful status. Tradeoff: the alternative is an explicit combat liability, not indefinite postponement. Combo: accept Exposed when a queued cleanse is ready. Risk: harmless penalties becoming dominant free credit; one conversion ends the obligation and remains visibly priced. **Complexity: medium.**

### E. Stealing and transferring status power

**24. Take live protection — Repossess.** Domain: an opponent’s active Block. Remove eligible live units and grant the same amount to Bob, preserving the donor’s original expiry boundary. Tradeoff: nothing transfers from an empty donor; expires soon. Combo: strike after stripping protection. Risk: duration refresh and on-gain loops; one atomic transfer event, not independent gain-and-loss card plays. **Complexity: medium.**

**25. Hand over trouble — Customer Complaint.** Domain: Bob’s active Exposed. Remove a unit from Bob and attach it to the sole valid opponent with its normal next-hit semantics. Tradeoff: requires actually carrying the liability and consumes an action before the enemy hits. Combo: attack afterward. Risk: transferring arbitrary incompatible statuses; explicitly whitelist Exposed rather than promising generic status theft. **Complexity: low.**

**26. Change the beneficiary — Misaddressed Package.** Domain: a pending, visible, transferable status grant. Redirect its eventual recipient without changing magnitude or due position. Tradeoff: pay before arrival; forbidden for intrinsic enemy actions or unmarked grants. Combo: intercept an alien’s queued shield. Risk: retroactively changing reliable intent without notice; preview the altered recipient and preserve the original anchor. **Complexity: high.**

**27. Take a reading — Old Uniform.** Domain: a historical snapshot containing positive Block. Create a capped present copy, leaving every current actor untouched. Tradeoff: spend a fresh cost and exhaust that snapshot’s claim; use a short printed expiry. Combo: redeem a past defensive peak. Risk: presenting creation as theft; call this an imprint and visually distinguish it from Repossess. **Complexity: medium.**

**28. Recover the remainder — Unused Coverage.** Domain: a recorded boundary where Block expired unused. Convert a capped portion of that documented waste into current Block, consuming its claim. Tradeoff: only unused expired protection qualifies, not Block absorbed by hits. Combo: intentionally overdefend before a later danger. Risk: history multiplying the same protection repeatedly; claim the expiry event, not each snapshot showing it. **Complexity: medium.**

**29. Rent the remainder — Borrowed Badge.** Domain: active transferable Block. Temporarily transfer units to Bob until a fixed absolute deadline; return only units still unspent at expiry. Tradeoff: preservation benefits the donor later; consumed protection never returns. Combo: survive one attack while planning to spend the remainder. Risk: maintaining two copies or resurrecting absorbed Block; track the transferred parcel separately. **Complexity: high.**

### F. Scheduling and tempo

**30. Exchange appointments — Shift Swap.** Domain: two unresolved player commitments in the current playable window. Swap their positions while preserving their UID-bound grades. Tradeoff: cannot move enemy anchors or evade position-bound modifiers. Combo: put defense before a newly revealed attack. Risk: accidental grade laundering; preview both card-bound and position-bound consequences before confirming. **Complexity: low.**

**31. Carry an appointment — Closed for Lunch.** Domain: one unresolved player card and a later explicit release deadline. Remove the commitment into escrow and return the card to hand after that deadline, without resolving it automatically. Tradeoff: reservation treatment is printed; default no refund of utility cost, release consumes time. Combo: save a now-misplaced tool. Risk: pretending delay grants future placement. **Complexity: medium.**

**32. Defend a gap — Safety Cone.** Domain: one empty future position inside the current window. Attach a before-position protection grant that triggers only if it remains empty. Tradeoff: filling the gap cancels the benefit; no ordinary action is created there. Combo: bridge a gap before an enemy anchor. Risk: empty positions becoming strictly better than actions; spend a real card and energy. **Complexity: medium.**

**33. Interrupt preparation — Break Their Routine.** Domain: a printed interruptible component of a revealed enemy action. Suppress that component at resolution if a condition was met earlier, leaving the anchor and remaining action intact. Tradeoff: prevents a buff rather than deleting enemy time. Combo: hit the possessed supervisor before its rally. Risk: generic cancellation dominating defense; use authored interruption windows. **Complexity: medium.**

**34. Bundle deliveries — Assembly Window.** Domain: two player actions resolved at distinct positions before a deadline. Attach a single payoff for completing a printed order, such as shield then strike. Tradeoff: broken order or cancellation loses the payoff. Combo: Shift Swap repairs sequencing. Risk: rewarding every ordinary attack cycle automatically; require a genuinely constraining order and no self-triggering Echo chains. **Complexity: medium.**

**35. Hold the gate — Clock Out Late.** Domain: the current turn’s playable endpoint. Extend the turn under the existing paid immediate utility model, but attach a printed obligation to finish an action in the new region. Tradeoff: consumes more encounter positions and delays cleanup. Combo: reach a queue maturity before refreshing. Risk: hidden free turns; preserve every intervening empty position and enemy anchor. **Complexity: low.**

### G. Limited historical changes and expensive experiments

**36. Amend the reward — Receipt Correction.** Domain: a past qualifying action’s unclaimed reward entitlement, not its combat outcome. Exchange that entitlement for a different printed present benefit. Tradeoff: no old damage, draws, or energy are recalculated. Combo: convert a prevention claim into retention instead of Block. Risk: “rewrite” language promising causality; label it settlement, an accounting operation. **Complexity: medium.**

**37. Excise the record — Shred Receipt.** Domain: an eligible historical action’s future-use rights. Seal it against Echo and other redemption to remove a current harmful status. Tradeoff: lose that history resource permanently; its actual past effects remain true. Combo: cash out an exhausted strategy. Risk: implying history vanished; keep the snapshot visible with a shredded-claim overlay. **Complexity: medium.**

**38. Amend one payload — Corrected Work Order.** Domain: a bounded past ordinary action. Replace its payload with an authored alternative, then recompute all subsequent recorded events up to the present. Tradeoff: no new decisions during replay; invalid chronology rejects the whole change. Combo: turn an earlier strike into protection. Risk: resource, draw, and death cascades; requires genuine causal simulation. **Complexity: high.**

**39. Restore a checkpoint — Back to Opening Time.** Domain: a complete encounter checkpoint before a recent position. Restore combat state, inventory, RNG, obligations, and consumed-event cursor, then resume play from there. Tradeoff: pay a non-restored use token outside the checkpoint; retained player knowledge is unavoidable. Combo: act differently using remembered intent. Risk: infinite retries or selective restoration; this is Rewind, not Echo or Rewrite. **Complexity: high.**

**40. Replace a decision — Different Purchase.** Domain: a bounded historical ordinary-card commitment. Substitute another card that genuinely existed in the legal hand at that time, then replay later decisions without alteration. Tradeoff: original costs and all downstream legality must be recomputed. Combo: replace the wrong defensive choice. Risk: impossible inventory branches and best-of-many fishing; explicit sandbox preview, scarce use, and atomic acceptance required. **Complexity: high.**

## Ten illustrative thematic cards

These deliberately use the vocabulary above rather than inventing ten extra subsystems. Suggested amounts and costs are all provisional.

- **Bob: Measure Twice.** Inspect the top two draw-pile cards. A tape measure stretches into tomorrow; no cards move. A low-power teaching card for distinguishing deck order from timeline order.
- **Bob: Borrow Tomorrow’s Hammer.** Advance Delivery for one card; miss one card of the next normal draw. The hammer has a future-dated MOREMART pickup label.
- **Customer Service: Valid Receipt.** Reclaim one eligible card from discard by selecting its past action. The receipt identifies the actual product, not a magical duplicate.
- **Bob: That Bit Worked.** Echo an eligible recent ordinary action. Bob consults a crumpled job sheet while an alien shadow repeats his movement a beat late.
- **Checkout: Keep Your Receipt.** Bookmark one eligible past occurrence. A possessed cashier obsessively laminates proof of a transaction that has not technically finished existing.
- **Payroll: Tomorrow’s Overtime.** Gain two Surge; withhold two from the next refresh. Bob’s wage slip prints a negative shift duration.
- **Security: Repossess.** Transfer up to three live Block with its existing expiry. The possessed guard demands Bob return a protective high-visibility vest that Bob is already wearing tomorrow.
- **Returns: Old Uniform.** Imprint up to two Block from a claimable snapshot; expire at cleanup. A faded security vest is visibly a receipt-shaped projection, not the donor’s current vest.
- **Maintenance: Safety Cone.** Protect an explicitly empty current-window position with a small Block grant. An ordinary wet-floor cone warns of a spill scheduled several seconds from now.
- **Management: Corrected Work Order.** Experimental Rewrite card with two authored alternative payloads. A possessed supervisor insists the paperwork has always said something different. Never ship as a superficial refund button pretending to resimulate history.

## Three small core vocabularies

### A. Receipt economy — recommended

**Foresee / Borrow / Reclaim / Echo.** Foresee examines future intent or supply with explicitly different targets. Borrow moves access earlier and leaves a bill. Reclaim retrieves the physical card. Echo repeats an eligible action. Four verbs cover a substantial game while the receipt fiction explains information, inventory, and evidence. Use ordinary energy, Block, and existing statuses; obligation and claim markers are accounting, not currencies. Add Queue only after these distinctions are readable.

### B. Appointment combat — strongest alternative

**Reveal / Queue / Delay / Interrupt.** The main skill is making effects occur at useful moments while fixed enemy anchors remain a dependable rhythm. Delay should initially mean escrow and later release, not moving an enemy anchor. This direction is mechanically cleaner than causal rewriting and less dependent on inventory recall, but can feel like ordinary scheduling unless future commitments and alien interruptions have strong presentation. History becomes supporting evidence rather than the central resource.

### C. Revision combat — separate high-risk prototype

**Record / Rewrite / Seal.** Record selects a bounded checkpoint; Rewrite changes one allowed historical decision; Seal commits the new canonical result and spends a non-restored use. The player sees only one accepted timeline, not a battlefield full of parallel branches. This produces the strongest literal change-the-past fantasy, but every economic and inventory rule becomes part of causal replay. Do not combine it immediately with unrestricted Borrow, arbitrary status theft, and deep deck manipulation.

## History as resource versus full causal rewrite

**History as resource** keeps recorded outcomes true. The player redeems a blank, retrieves the card linked to a receipt, or produces a new echo now. Its essential questions are “what qualifies?”, “where is the object?”, and “has this claim been spent?” It tolerates reliable enemy intent, immediate planning utilities, and straightforward lethal termination. Its weakness is thematic: without clear provenance and payoff timing it can look like discard recursion wearing a clock costume. Borrowed future access and absolute deadlines supply the missing temporal tension.

**Full causal rewrite** changes what happened and computes what would now be true. Its essential questions include every event’s inputs, RNG consumption, inventory membership, payment validity, target eligibility, and terminal cutoff. It can produce memorable rescues, but also expensive previews that are hard to explain on touch. A rewrite of one defense might alter Exposed consumption, later critical hits, death, draws, hand legality, and whether cleanup ever occurred. That is the mechanic, not an edge case to hide.

**Proposed causal safety contract:** restore the complete checkpoint before the edited event; apply the one authorized change; replay the chronological journal, including immediate planning events as journal entries rather than timeline positions. Preserve recorded decisions, not recorded output amounts. Restore RNG state and deterministically consume it; do not reroll previews. If an unchanged later decision becomes illegal, reject the proposed rewrite rather than silently picking a new card or target. A newly earlier lethal outcome ends the new history and truncates its suffix; do not replay dead actors through cleanup. Later survival may reveal that there are no recorded decisions beyond the old terminal point, so stop at that frontier and return control. Commit the entire resulting state atomically, replacing—not displaying alongside—the canonical timeline. Charge the rewrite authorization outside the restored checkpoint so the rewrite cannot refund itself.

Those defaults intentionally limit cinematic possibility in exchange for explainable behavior. If rejection happens often, simplify the eligible historical window or authored substitutions rather than adding a tangle of fallback rules. The recommended release direction is **history as evidence and spendable opportunity**, with full causal rewriting kept as a genuinely separate experiment. The long-range bank is successful when it helps choose what to exclude, not when all forty entries become mandatory systems.


---

## Appendix 8: World and encounters — WorldEncounterDesigner (design writer)

# MOREMART: You Are Still On The Clock

## Direction and boundaries

**Original design proposals, not claims about other games.** All values below are unbalanced examples. Nothing here retunes existing cards or authorizes implementation. Campaign encounters, items and characters are future product proposals beyond the current Bob-versus-Security laboratory.

MOREMART's invaders do not want a ruined shopping centre. They want an ordinary Tuesday that never ends: perfect attendance, customers who never leave, returns processed before purchases, and a workforce that has already completed tomorrow's shift. Possessed people retain their jobs, habits and grievances. The cashier apologizes while charging Bob for injuries he has not received yet. Security still insists that running is against policy. Possession is occupation by a temporal intelligence, not infection, contagion or zombie behaviour.

Bob's fantasy is practical sabotage: brace the door, inspect the schedule, retrieve the right tool, make one good swing count twice. Time travel should feel like using a workshop, not understanding seven magical schools.

**Recommended coherent set:** lead with First Shift, Overnight Crew and Quality Control; introduce Second Coat only after a single shared Echo contract exists. These are four Bob packages, not four character classes. Quiet Hours supplies a few shared support cards rather than a full launch archetype. Rain Check and Buy Now, Pay Later are optional later experiments, gated on card-identity and obligation rules. Do not ship all seven equally supported: their contrasts make a useful design bank, not a demand for seven parallel progression systems.

Use the current four-position, left-to-right timeline throughout. Position means an absolute encounter index; turn means Bob's current movement window. Neither means draw-pile order. Ordinary example actions occupy one playable position. Explicit planning utilities activate immediately, are paid immediately and are nonrefundable. An empty position still advances time. No ordinary card moves an enemy anchor, reopens the past, or makes a visible enemy action secretly change.

Use only existing energy, health, Block, Exposed and signed grades unless an example explicitly depends on a proposed shared mechanic. **Borrow, Reclaim, Echo and debt below are integration points, not competing definitions:** exact ownership, eligible snapshots, replay effects and repayment must come from the temporal-systems design. No debt tokens become a second spendable currency. Candidate cards with those dependencies stay out until their full cost and legal targets are readable before commitment.

## Seven distinct Bob-compatible packages

Each package lists five new concept cards; energy prices are illustrative. A package's first three listed cards are its small Bob-compatible starter addition. These are not replacements or upgrades for existing cards.

### 1. First Shift — win before the bad appointment

**Pattern:** inspect the next hostile anchor and put concentrated damage before it. This is ordering-based aggression, not an extra-turn engine. It gives new players a reason to care about left versus right immediately.

- **Clock In — 1 energy:** deal 4 damage; deal 2 more if this is Bob's first chronological action this turn.
- **Before Opening — 1:** deal 6 if placed before the next revealed hostile action; otherwise deal 3. Preview the relevant anchor.
- **Hard Hat — 1:** gain 5 Block. Plain protection keeps the package playable when a kill is unavailable.
- **Get A Move On — 1, planning utility:** scout four additional future positions this turn; creates no playable positions.
- **Last Customer — 2:** deal 9; Bob's remaining playable positions this turn must be empty. Show this commitment before payment.

**Weakness/cost:** overcommitting can leave an attack unanswered. Last Customer sacrifices later actions without shortening the turn or earning an early refresh. The deck struggles against high health and enemies whose dangerous anchor comes before Bob can assemble a kill.

**Links:** Quality Control improves one urgent hit; Overnight Crew covers failed races. **Abuse risk:** boundary conditions on “first,” cancellation, and a moving “next” target must not grant repeat bonuses; bind the inspected anchor when committing. **Complexity:** low, with Last Customer medium. Bob's line: “I'm not staying late for this.”

### 2. Overnight Crew — prepare a large, safe working window

**Pattern:** defend at the correct instant, preserve stored energy, then spend heavily on a later turn. This package rewards patience rather than unused-Block hoarding; Block still expires at the normal turn boundary.

- **Brace The Door — 1:** gain 7 Block; cannot be Bob's first action this turn.
- **Battery Pack — 1:** gain 2 stored energy on resolution, respecting the existing cap. It cannot fund commitments already made this turn.
- **Heavy Lifting — 3:** deal 13 damage.
- **Proper Footing — 1:** gain 4 Block and deal 3 damage, in that stated order.
- **Closing Procedure — 2:** gain 10 Block; later Bob actions in this same turn receive a signed damage downgrade of 2, where applicable.

**Weakness/cost:** the cap limits preparation, and damage done while waiting is real. Brace The Door needs an earlier action or vacancy; late Block cannot undo an early hit. Closing Procedure creates a genuine defence-versus-offence choice, not free armour.

**Links:** First Shift spends banked resources on a lethal race. Second Coat can use a useful defensive history entry, subject to shared Echo eligibility. **Abuse risk:** gaining energy repeatedly through replay; cap and shared replay costs must remain binding. Do not add a benefit per cleanup or per short turn. **Complexity:** low to medium. Bob's line: “Hold that. No, hold it properly.”

### 3. Quality Control — build one excellent action

**Pattern:** arrange Exposed and limited paid improvements around one valuable hit. The reward is precision: choose which physical card deserves investment, not simply play every modifier available.

- **Mark The Fault — 1:** apply 3 Exposed.
- **Clean Strike — 2:** deal 8 damage; nothing extra is needed for its ordinary interaction with Exposed.
- **Measure Twice — 1, planning grade:** attach a +3 damage grade to one eligible card UID this turn.
- **Soft Landing — 1:** gain 6 Block; deal no damage, so it leaves Exposed for the intended hitter.
- **Cut Once — 1, planning grade:** apply +5 damage to an eligible card UID and −3 damage to a different eligible card UID this turn. Both targets are required.

**Weakness/cost:** grades cost energy and cannot recursively improve their own sources. A small earlier hit can consume Exposed. Cut Once needs two legal cards, can make the wrong hand worse, and cannot use an ineligible or already absent card as a fake sacrifice.

**Links:** First Shift provides urgency; Second Coat provides tempting but contract-dependent questions about graded historical actions. Do not assume an Echo inherits grades until its preview proves that rule. **Abuse risk:** UID/position confusion and an abandoned downgrade target; require both bindings and reserve their consequences under the shared grading rules. **Complexity:** medium. Bob's line: “That's your problem. Right there.”

### 4. Second Coat — make a good past action useful again

**Pattern:** create a useful visible history entry, then pay to Echo it at an appropriate later position. History is evidence, not another hand. This is the signature time-travel package, but it requires a real shared replay specification first.

- **First Coat — 1:** deal 5 damage; deliberately uncomplicated Echo material.
- **Do That Again — 2:** Echo an eligible damaging action in the readable past, using the shared Echo contract.
- **Still Standing — 2:** Echo an eligible Block action in the readable past; the resulting Block expires normally.
- **Leave A Mark — 1:** apply 2 Exposed and gain 2 Block; offers a setup-oriented history target if the contract permits its full action.
- **Touch Up — 1, planning grade:** give one scheduled Echo +2 damage, only if Echo grading is a supported shared operation; otherwise omit this card rather than inventing special inheritance.

**Weakness/cost:** a bad opening provides bad history, and the ordinary lookback window makes targets transient. It pays for both the original and the replay. Extending lookback may be worth buying, but does not provide another card copy.

**Links:** Quality Control supplies setup; Overnight Crew supplies defensive alternatives. **Abuse risk:** recursive Echo, repeated energy/draw effects, and copying expired grades. Let the shared contract exclude unsupported targets and show the exact replay result; never solve ambiguity with flavour text. **Complexity:** high in implementation, medium in play only with strong previews. Bob's line: “Second coat always goes quicker.”

### 5. Rain Check — have the actual right tool early

**Pattern:** inspect future draws, then pay to access a specific future card or recover a specific spent card. Unlike Echo, the player manipulates real card inventory. Unlike aggression, its advantage is selection, not inherently greater damage.

- **Check The Manifest — 1:** inspect the next two draw-pile cards without changing order. This is draw information, not timeline scouting.
- **Off The Truck — 2:** Borrow one inspected eligible future-draw card under the shared Borrow contract; its future availability consequence must be shown.
- **Found It — 2:** Reclaim one eligible actual card associated with readable history under the shared Reclaim contract.
- **Spare Hammer — 1:** deal 5 damage; a useful ordinary card prevents an all-manipulation hand.
- **Wrong Delivery — 1:** place one eligible hand card at the bottom of the draw pile, then draw one; use normal inventory movement and preview any known-order consequence.

**Weakness/cost:** manipulation consumes energy and action positions while enemies still act. Retrieving an expensive tool does not pay for using it. Borrowing must impose the shared real future cost, not create a free duplicate; the card is withheld from this package until that cost is settled.

**Links:** every package has situational tools worth finding; Quality Control makes exact UID handling especially valuable. **Abuse risk:** duplicated identities, repeatedly recovering the retrieval card, and claiming order knowledge after reshuffles. **Complexity:** high. Bob's line: “It's in here somewhere. It will have been.”

### 6. Buy Now, Pay Later — spend the future deliberately

**Pattern:** accept a visible future obligation to achieve an immediate advantage, then survive the weaker resource refresh. This is not stored-energy preparation: the current gain creates a liability instead of consuming a saved reserve. Following the temporal-systems proposal, repayment is withheld from the next moving-turn stored-energy refresh, before the cap and before planning reservations—not at an invented absolute due position.

- **Advance Pay — planning utility:** gain 2 temporary Surge now; withhold 2 energy from the next moving-turn refresh. This uses the sibling design's provisional energy-advance model.
- **On The House — 0:** gain 6 Block; withhold 1 energy from the next moving-turn refresh.
- **Rush Job — 1:** deal 10 damage; withhold 2 energy from the next moving-turn refresh. These two printed repayments are individual unbalanced card hypotheses, not a universal damage/Block-to-energy exchange.
- **Pay In Full — 1:** settle one eligible obligation using its displayed full settlement cost. This card never replaces that cost with its printed price.
- **No More Credit — 1:** deal 5 damage, or 8 when no obligation is outstanding.

**Weakness/cost:** borrowed power must impose a real future opportunity cost. Settlement competes with ordinary protection. No card may silently move a due date, forgive an obligation on a short turn, or presume killing an enemy erases run-persistent debt. Stacking beyond one refresh's available income needs the shared debt contract's overflow and encounter-exit rules before inclusion.

**Links:** First Shift turns the advance into urgency; Overnight Crew prepares repayment; Quiet Hours helps see a crowded due window. **Abuse risk:** terminal-combat debt evasion, infinite refinancing and profitable prepayment loops. Resolve those globally before this package exists. **Complexity:** high. Bob's line: “I know what 'interest-free' means in this place.” This is an optional dark-comedy expansion, not the first tutorial's hook.

### 7. Quiet Hours — make waiting an intentional action

**Pattern:** inspect a wider schedule and use vacancies to place ordinary actions on the favourable side of an enemy anchor. It should be a sparse support package initially, not a promise that skipping turns is optimal.

- **Check The Rota — 1, planning utility:** scout six additional future positions this turn.
- **Let It Pass — 1:** gain 7 Block if the immediately preceding absolute position was empty; otherwise gain 3. Preview that historical or committed vacancy.
- **After You — 1:** deal 7 if the immediately preceding position contained a hostile action; otherwise deal 4.
- **Wait For It — 2:** deal 11 if at least two earlier positions in this current turn were empty; otherwise deal 6.
- **One More Minute — 1, planning utility:** extend the current turn by one position under existing extension rules; it is paid now and expires at cleanup.

**Weakness/cost:** time passes during vacancies; enemies are not paused and no energy is refunded. The best placement may be unavailable this turn. Extension delays refresh and can expose another anchor.

**Links:** Overnight Crew needs precise protection, Second Coat needs lookback, and debt needs advance warning. **Abuse risk:** granting rewards for voluntarily short turns or counting the same empty history repeatedly. Bonuses are action-local and do not generate resources. **Complexity:** medium. Bob's line: “Wait for the trolley. Now.”

## Twelve possessed workers: ordinary jobs, legible tests

These are enemy identities with teachable action signatures, not twelve new status systems. Retain the current anchor schedule unless a separately approved encounter system explicitly changes it. Baseline-compatible variants use the existing seeded four-action permutation; a guaranteed ordered sequence requires future authored-pattern support. Listed conditional behaviour appears in intent with its threshold and current predicted result.

1. **Security, Still Security.** Announces a baton strike and a separate brace. Tests putting Block before the strike and damage before protection. Introduction: one ordinary strike, no twist. “For your safety, remain where you were.”
2. **Checkout Clerk.** Scans, then later performs a larger announced hit. The scan is a non-damaging action, not hidden damage. Tests saving protection for the actual charge. Receipt art displays exact timing, not fake intent.
3. **Shelf Stacker.** Announces Block; another action attacks. Tests attacking before their brace or accepting a slower fight. Their goods arrive from tomorrow, but their numbers remain inspectable.
4. **Cleaner.** A specific announced action removes their own Exposed. Tests setup-hit proximity without making Exposed randomly fail. Cleaning does not erase grades, historical entries or the player's inventory.
5. **Greeter.** The first authored hit is mild; a later announced hit is much larger. Tests scouting beyond a comfortable current window. They say “Welcome back” before meeting Bob, but never manufacture a surprise turn.
6. **Returns Clerk.** Announces a normal hit plus a fully described surcharge conditional on a Reclaim since their previous action. Tests whether actual recovery is worth provoking. Baseline hits still matter; Echo is not Reclaim.
7. **Stock Auditor.** Announces a surcharge if Bob has Borrowed since their previous action. Does not seize or duplicate cards. Tests future access against immediate survivability; the preview updates when the player plans qualifying access.
8. **Paint-Mixing Clerk.** A visible action grants Block; it is stronger if Bob used Echo since their previous action. Tests varying the deck rather than making echoes illegal. The first such action teaches with a modest bonus.
9. **Payroll Assistant.** Announces a hit with a small capped bonus per outstanding standard obligation, if debt is supported. Tests settlement timing. They cannot create debt through an invisible penalty or silently accelerate due dates.
10. **Queue Marshal.** Announces a strong hit reduced when Bob's immediately preceding position is empty. Tests a paid-in-time vacancy. The condition is printed on the intent; no anchor moves when Bob obeys.
11. **Demonstrator.** Announces a strong hit reduced if Bob's immediately preceding action dealt damage. Tests staying active rather than waiting. This contrasts directly with Queue Marshal using familiar placement, not another status.
12. **Shift Supervisor.** Announces a normal attack and separately a weaker application of Ringing. Tests planning for the next turn's first-chronological-action restriction. Attachments remain attachments; the enemy does not rewrite which cards count as actions.

Introduce Returns, Auditor, Paint and Payroll only when their referenced player mechanic is available. Their conditions are decisions, not hard counters: surcharge caps should allow a justified use, and unconditioned attacks prevent an irrelevant-mechanic encounter becoming free. Never hide an identity test behind two identically named card copies.

**Scheduling limitation and proposed encounter expansion.** With four normal positions and enemy anchors six apart, a normal turn contains at most one hostile action. Most baseline “before/after” tests therefore span turn boundaries, and Block timing must respect its expiry. Applying Ringing to that enemy usually does not suppress its sole normal-turn action; the Supervisor above instead applies it to Bob. Do not sell enemy Ringing as a dependable counter to a nonexistent two-hit turn.

As a separately scoped experiment, author sparse **paired appointments**: for example, a visible brace at absolute position 8 and a visible hit at 10, replacing—not adding to—the budgeted sequence. Commit both before either enters the playable window; leave a clear intervening position and compensate with lower damage or a longer later gap. This changes current schedule generation and requires future balance work. Start with Security or Checkout, not a finale-only exception. It gives ordering, Echo defence and vacancies a richer test without moving anchors after disclosure. Density should vary deliberately; constant double attacks would make the exception another monotonous baseline.

## Four boss encounters

**1. Floor Manager: “We've Always Been Open.” Recommended first boss.** A large-health single opponent alternates ordinary attacks, Block, self-cleaning and Ringing through an authored, reliably revealed schedule. Each was taught separately. The choice is whether to race before Block, preserve Exposed across a cleaning appointment, or prepare protection under Ringing. At half health the art becomes impossibly overstaffed; do not silently reroll already revealed actions. Any new future pattern begins beyond committed revealed intent and gets explicit notice. Weakness: patient, legible scheduling; failure cost: trying to execute a memorized damage combo without looking.

**2. Customer Service: “We Can Reverse The Charge.” Optional identity boss.** Uses ordinary pressure plus alternating, announced Reclaim and Borrow surcharges. Bob can accept the surcharge for the needed tool or use naturally drawn cards. It never confiscates the whole deck or declares time mechanics useless. The boss's returns hatch repeatedly receives its own arm before it reaches inside. A plain damage/Block deck remains viable. The encounter tests card identity only after both visual distinction and inventory semantics are settled.

**3. Regional Director: “Tomorrow's Targets, Today.” Optional debt boss.** Shows a long-horizon damaging appointment while its ordinary actions pressure Bob. The design challenge is whether to borrow enough power to finish beforehand or preserve enough resources to settle and defend. The appointment must occupy a valid authored anchor, not an extra surprise action. Outstanding obligations add a capped, displayed bonus to a designated attack; no due-date theft. If debt is absent, this is simply an advanced scheduling boss rather than fake debt bestowed for one fight.

**4. Night Manager: “Please Remain For Closing.” Recommended campaign finale.** One possessed manager seems to answer from several moments of the same body; it is not a surprise party battle. Combine an announced vacancy-sensitive strike, ordinary pressure, a defensive action and a modest Echo-conditioned defence. Distinct acting poses make each readable. The final test is choosing when to repeat a good action and when today's schedule makes that repetition wrong. No compulsory memory quiz, erasure of history, or secret intent reversal. Winning shuts the repeating announcement off mid-sentence: ordinary dawn becomes the reward.

## Ten future run events and persistent-item concepts

None adds a new currency. Shop purchases use the eventual shared run economy; listed exchanges use existing resources or a clearly stated deck decision instead. Permanent effects require campaign ownership and do not leak into encounter timing.

1. **The Break Room, Yesterday — event.** Heal a meaningful fraction of health, or remove one deck card by giving it to yesterday's Bob. One choice only; display the exact card UID and permanent removal before acceptance. A familiar kindness with a deck-shaping cost.
2. **The Unopened Toolbox — event.** Choose one of two fully shown cards, then permanently give up one chosen deck card; or leave unchanged. The gain must justify losing a real tool. No mystery penalty after selection.
3. **Self-Checkout — event.** Take modest healing now, or receive a stronger fully shown combat card while losing a displayed amount of current health. Disable lethal payment. This asks whether a new plan can compensate for entering the next fight injured.
4. **Clock Repair — event.** Choose a shorter safe route with a modest reward or one additional, previewed elite encounter with a stronger reward category. No fabricated duration in encounter positions: this is run routing, not combat extension.
5. **Employee Of The Previous Month — event.** Pick one eligible deck card and choose a permanent authored upgrade with a displayed downside, or decline. Do not turn ephemeral combat grades into undeclared permanent grades; this needs the campaign's upgrade contract.
6. **Dented Thermos — item.** Once per encounter, choose during planning to lose 2 current health for 1 temporary Surge; cannot be lethal. The charge is spent immediately. A small push with a real cost, not a heal-on-short-turn engine.
7. **Inspection Mirror — item.** At encounter opening, choose either four extra scouted positions for the first turn or 3 Block for that turn. Information competes with safety, and neither alters movement budget.
8. **Steel-Toe Boots — item.** Once per encounter, an ordinary damaging action may receive +3 damage if Bob commits the following playable position to remain empty. Show and lock the required vacancy before activation. Do not permit activation on the final playable position.
9. **Duplicate Receipt — optional Echo item.** Once per encounter, reduce a supported Echo's energy price by 1, minimum 1, but apply a −2 damage grade to that Echo. Use only if shared Echo grading permits this exact preview; otherwise omit. Cheaper replay is not automatically better replay.
10. **Manager's Override — event.** Preview the next two encounter identities and choose one; the avoided encounter's reward is unavailable. No payment buys false certainty. This makes a limited deck weakness actionable without permanently removing that enemy from the game.

## Run spine: one store, one increasingly wrong shift

**Beginning — Get Your Tools Back.** Bob enters for a routine purchase and encounters Security at an impossible timestamp. First fights teach damage/Block order, then Exposed, then a visibly different later anchor. Give the player a choice between a First Shift or Overnight package addition, not a character screen. Introduce scouting only after the player has a reason to ask what happens after their four positions. The first boss recombines familiar behaviour. No Borrow, debt, permanent items or history editing tutorial here.

**Middle — Find Who Keeps Resetting Closing Time.** Departments become competing examples of the same temporal occupation: Paint repeats work, Receiving unloads future stock, Payroll bills hours not worked. Introduce a simple damaging Echo after showing readable history and distinguishing it from getting the physical card back. Offer Quality Control and Second Coat additions with ordinary tools beside them. Teach one conditional enemy, then provide a low-pressure event choice before combining conditions. Avoid mandatory hard-counter routes; department previews tell the player what their deck will be tested on.

**End — Make Tomorrow Happen.** Routes converge through staff-only corridors to the Night Manager. Encounters combine two known demands rather than adding new subsystems. The last preparation choice trades immediate safety against one specific deck improvement, not a compulsory last-minute build conversion. The finale uses the same increasing timeline and trustworthy intent. The absurdity escalates in acting and dialogue; rule uncertainty should not escalate with it.

For a first campaign proposal, roughly three acts with three ordinary fights, one optional fight/event branch and a boss each is a pacing hypothesis, not a measured target. The initial shipped laboratory needs none of this routing. Test the four recommended Bob packages in that laboratory before building campaign infrastructure around them. Expansion routes may later teach Rain Check or debt separately; never introduce both with Echo in the same run segment.

## Future party vision, explicitly outside initial scope

Bob remains the first complete character. Later companions should change whose ordinary work is being weaponized: a nurse protecting a future patient, a courier managing actual deliveries, a cleaner deciding which mess must remain as evidence. Keep one shared encounter timeline and distinguish each acting owner visually. Recipient-generic effects should remain usable without card-text copies for every pairing.

Do not commit yet to simultaneous hands, shared energy, separate turns or co-op. Those are unresolved ownership and readability decisions, not flavour unlocks. A future party should add interpersonal stakes—whose unfinished shift Bob refuses to abandon—rather than multiply four-position scheduling into several hidden calendars. The current recommendation is one builder, four composable packages, one reliable timeline, and one very ordinary store trying to prevent tomorrow.

---

## Appendix 9: Director proposal as reviewed — superseded draft

# Director's working proposal — not approved rules

## Thesis
Make the timeline a resource, not just a place to arrange attacks. The recurring fantasy is: see a problem coming, use a past action or tomorrow's resources to prepare, then occasionally change the sequence that caused the present. Preserve MOREMART's ordinary-job possession comedy. Time manipulation should create visible commitments and opportunity costs, not a blanket license to erase mistakes indefinitely.

## Recommended structure
A single-character, 1v1-first run through a store over three escalating departments. Cards and encounter patterns create variety before extra party members, grids, equipment slots or co-op. Frequent tactical verbs: Reveal, Reclaim and Echo; add one tightly scoped Borrow utility; prototype a bounded true historical Rewrite in parallel before promising it as the main selling point. Delayed payloads and temporal status transfer expand these verbs later. No separate mandatory mana/paradox/heat/focus stack. Keep energy/Surge, HP, visible per-source history uses and explicit future liabilities; a Rewrite charge is a limited hero ability, not another general-purpose currency.

## Important baseline problems before adding features
Current normal turns consume four positions, while enemy actions occur every six positions. Thus at most one enemy action occurs in a normal turn. Ringing permits that first action and therefore normally does nothing to the enemy unless timing changes allow multiple actions. This is a structural observation, not a proposed automatic Ringing buff. More meaningful telegraphed action sequences and timing tradeoffs may matter more than more player cards.
At a 24-position horizon, six ordinary four-position turns versus twenty-four hypothetical one-position turns create gross opening-plus-refresh budgets12 vs48 and five-card hand opportunities30 vs120, BEFORE caps, shortening costs, card supply and Ringing. This is not an achievable infinite-loop claim. Any cheap recursive Reclaim/Borrow/Echo/shortening design must be stress-tested against refresh-per-distance incentives.

## Minimal identity and time rules
Keep four clocks distinct: absolute position, next own turn/cleanup, next scheduled draw entitlement, and run persistence. Card text must name the right one.
History is evidence; a separate spend marker records whether its usable imprint was harvested. Never delete or rewrite stored history merely to pay for an Echo. Each eligible ordinary action's imprint may fund ONE Reclaim, Echo or Harvest, not all three. A replayed action's identity is not a new farmable imprint just because history was recomputed.
One real card UID occupies one inventory location. A historical picture is never a second copy. Initial Reclaim only recovers that exact UID from discard; it is unavailable if the UID is in hand, queue, draw or exhaust. It returns at its current/base permanent definition without expired temporary grades. The historical receipt stays visible, marked spent. Replaying the actual recovered card costs its normal cost and a normal position.
Initial Echo creates a temporary playable copy of an eligible damage/Block/Exposed action at its recorded effective grade. It copies authored action semantics, NOT actual past damage dealt: current Block/Exposed/targets/critical conditions apply. It pays normal energy and consumes a normal position. It cannot be graded, reclaimed, echoed again or create a reusable imprint; it vanishes rather than entering real piles. Resource-generating, immediate timeline/Surge, resurrection and other time-manipulation cards are excluded from this first eligibility set. Echo of a critical hammer does not guarantee another critical hit.
Initial Borrow advances the actual top card UID into hand and writes a visible liability against a future draw entitlement. It does not clone the card or provide its play energy. A liability survives current-turn cleanup and cannot be wiped by a rewrite. Do not call any preview of draw-pile order 'Scouting'—that currently reveals timeline positions. A larger card-catalog tutor is a different optional mechanic.
Delay is an explicit action-changing exception: ordinary placement still cannot move enemy anchors. First version can only move a current visible action into an unoccupied later position in the same current turn, with a per-action resistance/limit. No pushing hidden cards, cascading shifts or hidden occupancy checks. Show the changed intent immediately and keep it reliable thereafter.

## Past power transfer
Keep four mechanics semantically separate:
1. Reclaim: recover an actual card.
2. Echo: create a constrained temporary action copy.
3. Harvest: spend a historical imprint to grant a bounded new present/future benefit; the past outcome does NOT change.
4. Rewrite: change a past cause and recompute later consequences.
A 'steal' from a current enemy removes the same quantity there that it grants to the player; a copy of an upcoming enemy effect does not also cancel it unless explicitly stated. 'Take the Block I wasted last turn' can be a Harvest; 'remove the shield they had before my old attack, so my old attack now hurt them' is a true Rewrite. These are different systems, not interchangeable flavor labels.

## Bounded Rewrite experiment
Test this as a once-per-encounter hero ability, initially NOT a drawn card. Available only at the start of a new planning phase, before current-turn commitments or immediate activations. Select one ordinary friendly action from the last completed turn and move it to an empty non-enemy position within that same turn. No additions/removals, changed costs/grades, enemy movement, turn-length changes, draw edits or replacement from the current hand in the first prototype. This is real causality recomputation, not a heal with a time animation.
Checkpoint before the last turn's resolution, after that turn's planning/paid utilities are fixed. Reapply that recorded plan with the single position edit through cleanup to the current planning boundary. Keep enemy identity/order and initial deck/RNG state fixed. Recompute outcomes rather than re-add logged HP deltas. One authoritative branch plus one candidate; no branch tree. Show previous/new results and the cause of each difference, restricted to already known information. Charge paid on COMMIT, outside the replayed state. Canceling the candidate spends nothing and reveals no new future.
Stable event/action IDs keep imprint claims and borrowed obligations outside branch resets. Recomputed histories replace the accepted branch's affected snapshots but do not create extra draw/loot/achievement/activation rewards. Earliest lethal is authoritative. Do not resurrect defeated hosts into later recorded actions or silently retarget. If a larger future edit makes recorded commands illegal, reject that candidate in the first implementation rather than skipping/replacing them silently; eventually causal cancellation can be a deliberate advanced rule.
Example, provisional: start turn at20HP. Hammer at0 hits for6,1 empty, Receipt Check at2 hits for8, Vest at3 gives7Block too late, then Block expires. Present HP12. Rewrite Vest from3 to1: it blocks7 of the8 damage, so present HP19. Same real cards, same committed energy, same enemy intent; charge spent. This demonstrates a legible cause-and-effect change without redrafting a whole turn.
This first scope does NOT solve unrestricted historical substitution. Replacing a past card with a present card, editing resource generation, changing cleanup boundaries and stealing earlier defensive statuses need a broader command ledger, inventory reconciliation and explicit replay policy. They remain ambitious design options, not 'easy because we have snapshots'. Existing TimelineEntry stores action/events, not a complete undo/checkpoint implementation; immediate activations are outside ordinary history positions.

## Core versus expansions
Core candidates: reliable reveal with actionable responses; Reclaim/Echo with source-use constraints; bounded Borrow; varied enemy sequences; a narrow Rewrite experiment; earned deck rewards with skip and removal options; one persistent build modifier category and clear run win/loss.
Later candidates: delayed payloads at explicit future positions; current-to-future status transfer; intercepting enemy buffs; wider history archive; persistent branches; additional party characters sharing a single budget/timeline; challenge modifiers and separate draft mode.
High-risk parking lot: unrestricted history edits, arbitrary rollback after death, recursively echoable generators, debt erased by time travel, permanent farmable power from rewinds, multiple mandatory energy currencies, extra spatial boards, multiplayer causal editing.

## Review questions
Which proposed 'simple' mechanic actually needs a second ownership or timing system? Does an archetype have meaningful downsides other than random bad draws? Can a player explain why a Rewrite changed HP without watching every old action? Does future reveal change what they do, rather than just what they worry about? Can any engine generate resources or new harvestable history without paying/consuming time or a finite source? Which liabilities are intentionally forgiven at combat victory, and why? How much content and difficulty variety can one character support before a party helps rather than obscures learning?


---

## Appendix 10: Engineering feasibility review — TemporalFeasibility (scout)

# Temporal engineering feasibility review

Read-only source review of the design brief and director proposal. No code changes, builds, tests, or validation commands were performed. Findings below distinguish observed implementation from proposed contract repairs; scenario outcomes are static deductions, not executed proof.

## Overall assessment

Keep the time-travel ambition. The narrow Rewrite experiment has a credible foundation because `resolveTurn` already computes a turn from a cloned planning state and returns intermediate states. However, historical receipts cannot restore that input, and moving one ordinary action can change more than damage timing. Cleanup, grading, critical-triggered statuses, and shuffle inputs remain causal systems even under the proposed restrictions.

The smallest honest experiment is one retained pre-resolution planning checkpoint, one position edit, and recomputation using the normal resolver through cleanup. It needs explicit policies for the divergences below before it can promise “same resources,” “no new information,” or “same grade.” No general branch tree or unrestricted command-replay engine is required for this experiment.

## Five highest-impact issues

### 1. Historical snapshots are not checkpoints; planning activations are not a durable command record

`TimelineEntry` in `src/game/types.ts:64–73` stores position, turn, action, base definition, grade, attachments and events. It contains no pre-action actors, energy, ordered piles, turn modifiers, or random context. `cloneHistory` deep-copies that evidence; deep-copying does not add missing state (`combat.ts:79–104`).

`resolveTurn` captures complete `ResolutionStep.state` values only after each consumed position and after cleanup (`combat.ts:1163–1342`). Those can describe intermediate results, but the first already includes upfront energy spending and the first position's consequences. The UI receives the array locally in `playResolution` (`ui.ts:1613–1638`); it is not a retained checkpoint archive.

Immediate Surge/timeline activations consume their source and attached modifiers, spend energy, and update current state (`consumeImmediate`, `playSurge`, `playTimeline`, `combat.ts:883–979`). Their returned structured events are consumed by UI animation; persistent `log` contains strings capped at 80. `turnModifiers` retains aggregate changes, not activation order or effective-source receipts.

**Required contract:** capture the planning state after fixed activations but before `resolveTurn` spends ordinary commitments. Replay from that boundary spends those commitments once; replaying activations again would double-pay and double-grant. This boundary deliberately avoids needing historical activation replay, but does not provide it for broader edits. Retain an explicit eligibility boundary: “before current commitments” cannot be inferred merely from an empty queue after the player has activated, reclaimed, or undone placements.

### 2. A position-only edit can change cleanup inventory order and reveal new cards

`cleanupHand` first appends non-retained/non-protected hand cards, then queued player cards in queue order, then attachments (`combat.ts:1141–1152`). Played cards remain in the queue until cleanup, despite presentation animating their discard earlier. Moving a card therefore changes discard order whenever it crosses another friendly card.

`reshuffle` hashes turn plus the ordered discard UID sequence, then shuffles with `randomStep` (`combat.ts:982–993`). Consequently, identical seed, identical starting piles and identical card membership do **not** guarantee identical post-cleanup draw after a position edit. If cleanup needs a reshuffle, candidate hand identities can change without any authored draw edit. This is a contract gap in the proposal, not a nondeterminism bug in the engine.

**Required decision:** either permit causally changed draws while suppressing previously unknown candidate card identities, or define a stronger inventory invariant. For the first experiment, reject candidates whose complete post-cleanup hand/draw/discard ordering differs from the accepted boundary. This avoids silently changing existing shuffle rules. Alternatively constrain fixtures to avoid reshuffling and all draw effects, but acknowledge that this is narrower than general availability. Never expose candidate draw event messages: they contain card names (`drawCards`, `combat.ts:1014–1021`). Canceling a preview cannot undo knowledge.

### 3. “No changed grades” conflicts with position-bound attachments

`upgradeLevel` combines exact-card bindings and absolute-slot bindings (`combat.ts:514–529`). `historyAttachments` records either binding at its historical position. An empty destination may still hold a position attachment; leaving a graded slot or entering one changes effective grade under current rules. Other friendly actions retain their own slot grades, while the moved action can lose or gain them.

**Required correction:** reject edits that change any recorded effective grade, rather than assume “same card” means “same grade.” A first fixture can avoid slot attachments entirely. Moving attachments with the card would contradict their existing position-bound identity and is not a neutral shortcut.

History freezes the base player definition plus grade; `applyUpgrade` in `upgrades.ts` reconstructs the effective effects. The resolver itself looks up current `CARDS` definitions and recomputes grades; it does not execute `TimelineEntry.definition`. Echo therefore needs an explicit authoritative effective definition, not merely a historical UID handed to today's normal lookup. Preserve `onCritical` semantics: the present resolver triggers base-defined critical effects only after a qualifying hit and only while combat remains nonterminal.

### 4. Earliest lethal and actor statuses can eliminate the promised replay endpoint

`applyEffect` applies terminal detection after damage; `resolveTurn` stops remaining effects and positions immediately at lethal (`combat.ts:1050–1138, 1223–1293`). Terminal cleanup discards even protected/retained hand cards, clears future queue contents, suppresses draw/refresh, and does not advance to another planning turn. Nonterminal cleanup instead advances Ringing, clears Block/Surge/modifiers, refreshes energy and draws.

A previously surviving turn can become a defeat or victory after moving protection or damage. There is then no “current planning boundary” to replay to. **Required policy:** allow terminal candidates with their true shorter cursor and terminal cleanup, or reject them explicitly. Forcing them through nonterminal cleanup would violate both existing behavior and earliest-lethal rules. The proposal's start-of-planning gate also means Rewrite cannot rescue an already completed defeat; that is a scope consequence, not an implementation omission.

Actor state is more than HP. Changing which hit consumes Exposed can change Hammer's critical Ringing and therefore next-turn action legality. `firstRingingAction` is recomputed chronologically; queued commands and actual executions are distinct. Current history even preserves canceled actions with an `empty` event. Require a real executed-action receipt for imprint eligibility, and do not mistake the presence of `entry.action` for proof of execution. The initial experiment should permit status recomputation but surface changed next-turn Ringing/Exposed, not show only HP differences.

### 5. Source-use and Borrow obligations need identity independent of inventory and branch position

`CardInstance` has only UID, definition ID and owner. `CombatEvent` has no event/action ID. Enemy intent UIDs are stable position-based identities; player UIDs identify physical cards, not repeated uses (`types.ts`; `content.ts:33–39`). UI history visual keys include position (`ui.ts:687–696`), so moving an action changes its visual identity.

**Required ownership:** combat rules own stable action-occurrence identities and the shared Reclaim/Echo/Harvest claim ledger. A physical card UID cannot alone distinguish its first and later plays; a position key cannot survive moving the occurrence. Candidate recomputation must not mint another claimable occurrence. Decide whether a later genuine replay of a reclaimed real card earns a new imprint; the proposal currently excludes recomputed and Echo actions but leaves this recursion policy implicit.

Borrow adds a second timing system: scheduled draw entitlements. Merely keeping unpaid debt outside snapshots is insufficient. Suppose the replayed cleanup already paid that debt in the accepted branch: replay must reproduce that settlement without forgiving the debt retrospectively or collecting it twice. Stable obligation **and settlement/entitlement** identities are needed. Branch evaluation must be read-only against authoritative claims, charges and obligations until commit. Successful acquisition and source spending must also be atomic, particularly when Reclaim's UID has left discard.

## Feasibility and staging matrix

Relative complexity includes trustworthy rules integration, not just the happy-path effect.

| Stage / mechanic | Complexity | Main reusable foundation | Boundary needed |
|---|---|---|---|
| Reclaim, exact discard UID | Low locally; medium with shared claims | Ordered real piles and `validateInventory` | One atomic move; current permanent/base definition; no historical-grade restoration |
| Historical Harvest, fixed present Block | Low locally; medium with shared claims | Historical action evidence and normal Block effect | Authored capped benefit; no mutation of past outcome |
| Echo, temporary graded action | Medium | Frozen historical definition/grade and normal effect resolution | Separate temporary identity, authoritative copied semantics, expiry and no-grade/no-imprint eligibility |
| Borrow, top UID against next scheduled draw | Medium | `drawPile.pop`, exact-card draw events | Named draw entitlement, empty-pile policy, settlement across cleanup and rewrite |
| Bounded one-turn Rewrite | High | Full state cloning and deterministic whole-turn resolver | Retained input checkpoint, stable occurrences, grade/inventory/lethal/information policies |
| “Wasted Block” provenance Harvest or broader Rewrite | High | Partial action evidence only | New accounting for attribution or broader command/inventory causality |

Reclaim fits existing zone uniqueness: `validateInventory` checks hand, draw, discard, queued cards and attachments, excluding historical pictures (`combat.ts:532–547`). There is no exhaust pile today. Future permanent upgrades also lack a per-instance representation; do not promise retrieval behavior for systems not present.

Echo is not just another ordinary `CardInstance`: normal lookup, grading, retain handling, cleanup and reshuffle assume real catalog-backed cards. It must disappear even when unplayed, canceled, retained by accident, or present during terminal cleanup. `CardVisual.echo` already means anonymous visual afterimage (`view/types.ts`), not this mechanic's ownership state.

Historical Harvest can cheaply grant “gain 3 Block from this receipt.” “Recover exactly the Block wasted by this source” is different: actors store aggregate Block, damage events carry HP damage and human-readable blocked text, and cleanup zeroes Block without source attribution. Exact wasted-source accounting is absent.

## Recommended experiment boundaries and evidence requirements

First evaluate the director's Vest-before-Receipt example with no draw effects, no slot-grade changes, no prior temporal claims, and a surviving endpoint. Compare complete resulting state, not logged HP deltas. Then deliberately cover: cleanup reshuffle after crossing another card; moving across a slot grade; changed critical/Ringing outcome; candidate lethal; a canceled historical action; and a Borrow settlement spanning replay. These are proposed experiments, not tests run for this review.

Use one checkpoint and one isolated candidate. `cloneState` supplies independent current nested structures; `clonePlanningState` does **not**—it shares `drawPile` and history, and its commit helper does not assign a replacement draw pile (`combat.ts:461–486`). Borrow must not mutate a shared array while evaluating a failed transaction.

Finally, candidate evaluation must bypass live `ScenePort.playEvent` and normal UI state installation until acceptance. Show bounded, known-information differences; reset presentation-only completed/discarded-card caches on branch adoption. Full-history cloning occurs at every resolution step, so retain only the checkpoint and accepted history needed for this bounded feature rather than expanding into a permanent branch archive. The acceptance criterion is faithful causality with conserved identity—not that seeded code happens to reproduce one damage example.

---

## Appendix 11: Independent design critique — GameDesignCritic (design reviewer)

# Critical review: make changing history worth doing

## Verdict and evidence boundary

The director has a defensible rules skeleton but not yet a decisive game identity. Its weakest compromise is to make three acquisition-like verbs frequent while treating actual historical change as an optional experiment. That risks delivering a complicated retrieval deckbuilder with a spectacular undo button. The user's ambition deserves the inverse experiment: **make revising a meaningful past decision the signature, and remove competing machinery until that decision works.**

This is a design review, not an implementation assessment. I reviewed the brief, director proposal, and economy, causality, and readability research; I did not inspect source or run gameplay. References below identify those artifacts and their numbered lines. Numerical examples are illustrative, not balance findings. I assume paused planning, fixed ordinary enemy anchors, four-position default turns, cleanup-based refresh, single-target combat, and immediate lethal termination remain the baseline unless explicitly changed.

The research establishes useful precedents, not proof of this game's fun. Its [Into the Breach source](https://subsetgames.com/itb.html) supports reliable telegraphs; its [Iron Danger source](https://store.steampowered.com/app/899310/Iron_Danger/) supports a bounded correction horizon; its [Super Time Force developer retrospective](https://blog.playstation.com/2015/08/27/14-totally-true-facts-about-super-time-force-ultra/) supports investigating proactive intervention rather than death-only recovery. Those are claims reported in the supplied research, not independently verified here. None establishes optimal verb count or commercial demand.

## Must-fix decisions before approving the direction

### 1. Acquisition vocabulary is consuming the decision budget

The proposal's frequent Reveal/Reclaim/Echo plus Borrow sounds compact (director lines 6–7), but each asks a different eligibility question: which future information, which real card location, which historical recipe, which future entitlement? Harvest adds another claimant to the same history. Correct terminology does not make the combined interaction cheap.

**Counterexample:** Bob needs another Vest. Reclaim retrieves the real Vest without old grades, Echo produces its graded temporary recipe, Borrow might find another Vest, and Harvest might recover its expired Block. These are mechanically distinct, but four interfaces compete to answer “can I defend again?” The resulting choice may be rules lookup rather than strategy.

**Fix:** do not teach all four as the everyday toolset. Recommend Rewrite plus one history-power verb, Echo, with Reveal as information support. Reclaim becomes an optional deck specialty; Harvest and draw borrowing are separate expansion candidates. If Reclaim returns, make it a genuine inventory strategy with a visible downside, not a weaker Echo whose main distinction is knowing which pile contains a UID. Preserve the wide idea bank without imposing it on the opening deck.

### 2. History-use bookkeeping is not yet a clean resource

The shared imprint rule prevents one event paying three claims (director lines 15–17), but makes each historical action carry a spend state independent of card location and visible history. Reclaim then additionally depends on discard eligibility. A reshuffle can make an unchanged receipt unusable; shortening can hide a receipt that was available a moment ago. These are explainable, but together they turn the past into a conditional second hand.

**Counterexample:** the player spends Hammer's imprint on Reclaim, plays the recovered Hammer, then Echoes its new event. Is this intentionally legal? “Replayed action” in line 15 must distinguish a new ordinary play from recomputation of the same historical event. Otherwise players cannot tell whether repeating their best tool is the build or an exploit.

**Fix:** define an imprint as belonging to one ordinary resolved event, not permanently to its card. A later genuinely paid ordinary play earns a new event; recalculation and Echo do not. Display eligibility and its specific failure reason directly on candidate receipts. For the recommended narrower package, there is only an Echo-use stamp, not a universal harvested-history wallet. Explicitly choose whether Rewrite reads the whole last completed turn even when shortening makes ordinary history less visible; its target must never be legally selectable but unreadable. I recommend that labelled exception, without exposing older history generally.

### 3. Shortening can dominate without an infinite loop

The gross refresh comparison is appropriately qualified (director lines 9–11; economy lines 62–66). Nevertheless, “not infinite” is too weak an acceptance bar. More hands per enemy anchor can trivialize scarcity while every transaction remains finite and fully paid.

**Counterexample:** at positions with no enemy action, repeatedly buy cheap short turns to cycle toward the best attack and defensive answer. The energy cap does not prevent earning and spending repeatedly. Reclaim increases access to shortening; Echo can double the payoff of a highly graded action found through cycling. Even excluding temporal cards from Echo does not remove that indirect interaction.

**Fix:** approve the tempo economy only after comparing equal absolute distances, including HP lost, useful cards found, energy actually spent, and encounter duration. Test a paid, nonrecursive shortening option against ordinary turns—not just degenerate zero-cost cards. Do not add another anti-abuse meter. If ordinary lengths become a trap, choose openly between repricing/restricting shortening and changing refresh to fixed-distance entitlements. The latter is a competing rules contract, not a silent correction. No general future-payout or usage-limit system should mature on cheap turn boundaries by accident.

### 4. Victory debt needs a rule, not an unanswered question

Borrow's liability survives cleanup and Rewrite, but encounter victory remains unspecified (director lines 18, 41–42). This determines whether Borrow is a loan, a finisher, or a run-level hazard.

**Counterexample:** Borrow the lethal card, win, and never receive the reduced hand. If the only cost was a later draw, borrowing dominates not borrowing whenever the finish is certain. That is not necessarily a bug: many battle-local sacrifices become attractive near victory. Calling the cost unavoidable would be the bug.

**Fix:** for an encounter-local loan, explicitly forgive outstanding draw debt at victory and advertise the finishing opportunity. Give access an immediate opportunity cost and a finite outstanding allowance so “borrow everything” is not automatic. Display the next normal-refresh entitlement being reduced, not “next draw,” which could mean a resolution draw. Do not unexpectedly deduct HP or import debt into the next encounter. A persistent MOREMART credit contract is a bold later build modifier requiring its own run-level teaching. My recommended core avoids this whole subsystem; if future access is urgently needed, a hand-for-top-card exchange offers selection without pretending to be a loan.

### 5. Echo's copying boundary is mechanically important, not tooltip trivia

Copying effective grade but recalculating current conditions is a good foundation (director line 17). “Eligible damage/Block/Exposed action” still leaves mixed effects, conditional payloads, and attachments unresolved.

**Counterexample:** a hammer printed with 6 damage dealt 9 against Exposed. Its Echo should start from the approved graded recipe, not 9, and then inspect the new target. But a card that says “deal damage; on critical, draw” appears eligible by its damage while smuggling a resource generator into the exclusion policy. A position-bound grade also raises whether the recorded grade or the old position is being copied.

**Fix:** eligibility applies to the whole authored action, not a convenient component. Initially admit only pure supported combat recipes; mixed resource/time effects are ineligible as a whole. Freeze the recorded numeric grade into the Echo recipe, detach original upgrade sources, and reevaluate target conditions now. Show the resulting recipe before commitment. Do not copy historical critical outcomes or double-apply Exposed. Enforce no new reusable imprint and no Echo descendants. “Cannot be graded” is a reasonable first boundary, but optional rather than sacred: if it makes Echo feel excluded from Bob's main customization system, test base-grade Echoes that accept current grades as a separate coherent contract.

### 6. Reveal needs an action the player can take now

Reveal beyond the playable endpoint is trustworthy but can still be economically pointless (brief lines 7–9; readability lines 64–72). Block expires at cleanup and normal hands discard. Seeing an attack next turn does not itself preserve a defense.

**Counterexample:** scout an attack beyond this turn, hold Vest mentally, lose Vest at cleanup, then take the attack. The player paid for worry. If they would make the identical present plan whether the future card were an attack or defense, Reveal bought no tactical choice.

**Fix:** pair introductory Reveal with an actual lever: retain one chosen card for a stated cleanup, spend versus save stored energy, extend to reach an anchor, or choose a persistent setup. A small retention card is support, not a new universal holding zone. Author paired forecasts that lead to different good plans. Do not assume information has value merely because it is unavailable. If most useful forecasts concern only the immediately next threat, reveal that threat by default and reserve paid scouting for additional depth; this is an explicit alternative to the current paid-information contract.

## The strongest competing coherent direction: “Edit the last shift”

**Recommendation:** keep one timeline and one Bob, but make historical intervention the centerpiece rather than an emergency accessory. Echo supplies frequent past-to-present continuity; Rewrite supplies the genuinely changed past. Other temporal verbs earn admission only by serving those decisions.

The director's Vest example is causally real but strategically weak (lines 29–34). With unlimited planning and reliable visible intent, putting Vest after the hit was avoidable. Correcting it demonstrates usability, not why a competent player wants to alter history. Additionally, moving only into empty positions can make the hero power unavailable after an efficiently filled turn.

A better flagship scenario uses new present knowledge to reconsider an old tradeoff. Last turn Bob placed Exposed before a small attack, consuming it for immediate damage. Now a stronger critical-dependent attack is drawn. Rewrite Exposed after the old attack: surrender the old bonus, carry the setup forward, and improve the new attack. This assumes Exposed survives until consumed, as the brief describes, and that no intervening hit consumes it. The past choice was sensible then; the new hand makes another history attractive now. That is more than correcting bad Block placement.

Prototype two explicit historical edit scopes against each other: the director's move-to-empty rule, and **one relocation or one exchange of two friendly ordinary actions within the last completed turn**. The exchange is an intentional expansion, not equivalent implementation scope. Keep enemy anchors, real card identities, payments, turn boundaries, and random causes fixed; reject illegal candidates visibly. Position-bound grades need a declared policy: preserve attachment binding and recompute its effect, or visibly exclude affected candidates. Do not claim both unchanged effective grades and unrestricted movement across differently graded positions.

Begin with the proposed once-per-encounter charge, but treat its frequency as unproven. If players only save it for rescue, the signature is underused; if every encounter becomes exhaustive counterfactual search, frequency is not the only problem. Better authored tradeoffs and a concise outcome comparison come before adding charges.

**Signature:** Echo with one visible source-use rule; true bounded Rewrite with opportunity-cost decisions. **Support:** trustworthy forecasts, one retention option, ordinary damage/Block/Exposed, earned deck specialization and removal. **Parking lot:** Harvest, broad Reclaim access, actual draw debt, theft of old enemy shields, delayed payload chains, branch archives, parties, and multiverse editing. These remain exciting directions, especially removing an earlier shield so a later recorded hit changes, but should not camouflage an unproven core loop.

## Can 1v1 carry this?

Yes as a hypothesis, not because one target automatically means enough tactics. Fixed single attacks six positions apart risk repeated “Block before hit, attack elsewhere” solutions. Ringing's weak baseline interaction is a warning about action topology, not just its numbers.

Keep 1v1 for the first discriminating encounters. Vary the opponent's sequence grammar, not merely damage: setup then payoff, vulnerable recovery after aggression, a shield window that rewards waiting. Clustered multi-action sequences would explicitly change encounter scheduling and require separate approval. Give one host at a time a readable job-shaped rule—security inspects then restrains; a cashier charges then refunds—rather than inventing extra targets as pseudo-party members. If diverse sequences still produce the same winning ordering, test a second enemy before writing three departments of content. More targets are optional; meaningful incompatible priorities are mandatory.

## Discriminating playtests and player promises

These are proposed experiments, not performed validation:

1. **Signature comparison:** matched complete encounters with Echo-only, empty-slot Rewrite, and exchange-enabled Rewrite. Include both a mistake repair and a new-hand tradeoff. Ask players what changed and which mechanic they would build around. Prefer the version producing understandable, intentional sacrifices—not just the largest HP refund.
2. **Equal-distance economy duel:** paper or digital play at equal encounter positions using normal turns versus accessible shortening, including one depleted draw pile and one graded Echo source. Record useful output and losses. Reject a contract where repeated shortening wins across contrasting threats without giving anything meaningful up.
3. **Forecast counterfactual:** show the same hand with two different future intents, first without and then with retention. Observe whether plans diverge and why. Unchanged plans or impossible preparation challenge paid Reveal, not player competence.
4. **Boundary encounter:** combine a reshuffle, a used Echo receipt, full historical slots, and a potential borrowed lethal finish. Have players predict eligibility and the bill before acting. Follow with three differently patterned 1v1 fights. Separate rule misunderstanding from strategically repetitive correct play.

Player promises should be plain: **“What you reveal stays true unless a named action changes it.” “An Echo repeats the move, not its old luck or its physical card.” “Rewrite changes one recent arrangement; the consequences catch up to now.” “You can inspect the change before paying.” “Every loan shows what gets smaller later—and whether winning ends the bill.”** Do not promise unrestricted replacement of past cards, escape from any death, or unlimited branches.

Final recommendation: choose the ambitious historical-decision game, not the maximal temporal vocabulary. Prove proactive Rewrite and genuinely distinct 1v1 sequences early. If Rewrite only repairs mistakes, decide explicitly whether to redesign it or adopt an Echo-led game; do not quietly sell the latter as the former.

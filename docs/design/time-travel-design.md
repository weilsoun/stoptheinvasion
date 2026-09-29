# Stop the Invasion — Making Time the Game

Historical design proposal and research synthesis · 13 September 2026

**Current implementation:** time manipulation is parked. The active entry now presents Kestrel: an illustrated spaceship viewscreen and physical cards, with immediate card play, End Turn, fresh hands, regenerating shields and up to three enemy ships. The user approved one complete replayable battle before expedition progression. The top-down MOREMART implementation remains preserved but inactive. Current contracts and verification are in `AGENTS.md`; this document and [its research appendix](time-travel-research.md) remain historical records, not the active build specification.

The remaining sections are an archived proposal, not an additional implementation backlog. References to “current” fixed-turn rules and their arithmetic describe the earlier research snapshot; neither those rules nor the later MOREMART world model override the active Kestrel contract. The user did not approve all 56 incompatible candidates.

## 1. The game I recommend

> You are not merely choosing which card to play. You are choosing when it happens, what you can take from another moment, and occasionally what should have happened instead.

Make **a temporal deckbuilder about preparing, repeating and revising**, not a conventional deckbuilder with an emergency Undo button.

The recurring loop is:

1. Read a trustworthy approaching threat.
2. Arrange ordinary tools and decide what to preserve for later.
3. Create a useful past: a strong strike, a defense, a setup, even a deliberately empty moment.
4. Use that past through an Echo or a specialized recovery card.
5. Occasionally revise a recent decision, surrendering one benefit to obtain a more useful present.
6. Draft a deck that makes one of these relationships especially powerful.

**Signature:** Echo plus a bounded, genuine Rewrite. **Support:** reliable intent, scouting that enables an actual response, retention, damage/Block/Exposed and authored grades. **Next-wave specialists:** Reclaim and a tightly defined future-card Borrow. **Expansion bank:** transferring power across time, scheduled future effects, larger historical edits and richer run systems.

Borrow is important to the user's vision, but should be taught after players understand ordinary draw and Echo—not introduced alongside five other retrieval verbs in the opening hand. Prove Rewrite early rather than permanently deferring the distinctive ambition. If it only repairs obvious mistakes, redesign it or explicitly choose an Echo-led game; do not market that fallback as unrestricted history editing.

Keep Bob and 1v1 combat for the first complete game. A richer enemy action sequence can create several competing priorities without immediately adding multiple targets, actor hands, party deaths or another board. Party play remains an attractive later product choice, not a prerequisite for depth.

### The fiction makes the rules memorable

The aliens do not want MOREMART destroyed. They want a perfectly productive Tuesday that never ends: tomorrow's shipment already unloaded, injuries charged before they happen, employees who can never finish their shift.

Bob treats their impossible causality like faulty equipment and a hostile returns policy. Receipts explain historical evidence; layaway explains deferred access; payroll explains borrowing; work orders explain revisions. Use those metaphors to clarify distinct rules, not replace rules with jokes.

The dramatic objective is simple: **make tomorrow happen**. Defeating a possessed employee can expel the invader and free the recognizable person; another health/status system is not required merely to convey that fiction.

## 2. What the research actually contributes

Nine agents contributed: five fast research scouts, two original-design writers, one source-code feasibility scout and one independent game-design critic. Main integrated the conflicting recommendations. Research was document-based; this is not a claim that the team played all comparison games during this session.

| Reference | Supported observation | What to borrow—not copy wholesale |
|---|---|---|
| [Dawncaster](https://play.google.com/store/apps/details?id=games.WanderlostInteractive.Dawncaster&hl=en_US) | Developer description emphasizes distinct classes, permanent enchantments, encounters/events and run variation. | Strong build identities and a mobile-readable complete journey; not its total content volume. |
| [Dawncaster developer status-design notes](https://wanderlost.games/test-message/) | A historical update explains why blanket cleansing became too universally effective as statuses expanded. | Specific temporal counters beat a single universal “steal/erase everything” card. This is a 2023 design lesson, not current balance documentation. |
| [Into the Breach](https://subsetgames.com/itb.html) | All enemy attacks are telegraphed. | Reliable information can create agency; uncertainty can live in the run and available tools instead of dishonest intent. |
| [Phantom Brigade](https://braceyourselfgames.com/phantom-brigade/) | Forecasting and timed countermeasures are central to its command timeline. | The before/after decision. Do not import physics, trajectories or real-time execution. |
| [Othercide developer tips](https://blog.playstation.com/2020/07/27/put-an-end-to-suffering-with-these-essential-othercide-tips/) | Spending fewer AP enables a faster return; burst output delays the next opportunity. | Acting more now can sacrifice later tempo. Our turn shortening is analogous, not the same mechanic. |
| [Star Renegades publisher patch](https://rawfury.com/star-renegades-switch-patch-1-2-1-2-out-now/) | This historical Switch patch bounds stagger to the end of the next round. | Control needs an explicit horizon; infinite delay followed by blanket boss immunity is a poor combination. |
| [Wildfrost](https://store.steampowered.com/app/1811990/Wildfrost/) and [developer update](https://chucklefish.org/blog/wildfrost-dev-update-2023-release-with-cool-new-features/) | Counters communicate action timing; a pre-release change replaced snow immunity with limited resistance. | Readable deadlines and partial, visible resistance. Do not add independently ticking unit clocks. |
| [Vault of the Void](https://store.steampowered.com/app/1135810/Vault_of_the_Void/) | Purging turns unwanted cards into energy; Threat makes incoming damage a later obligation. | Visible liabilities and useful sacrifices—not another mandatory resource meter. |
| [StarVaders](https://store.steampowered.com/app/2097570/StarVaders/) | Its developer description explicitly offers Chrono Tokens for rewinding mistakes or improving combos. | A clearly limited retry permission. Exact restoration/token rules are not established by this source. |
| [Iron Danger](https://store.steampowered.com/app/899310/Iron_Danger/) | Its description offers up to five seconds of rewind and repeated tactical experimentation. | A small correction horizon can support real time manipulation. Unrestricted retry also changes the game toward puzzle solving. |
| [Lemnis Gate developer Ghost Mode article](https://ratloopgamescanada.com/dev-blog/ghost-mode) | Recorded ghost actions become effective if an earlier death is prevented; the developers discuss the communication challenge. | Recordings and their causal effects are different objects. This is historical design precedent, not a recommendation to adopt its multiplayer architecture. |
| [Super Time Force developer retrospective](https://blog.playstation.com/2015/08/27/14-totally-true-facts-about-super-time-force-ultra/) | The developer explains why proactive Time Out improved on death-only restart. | Time powers should help make plans, not only apologize for failure. |
| [Cobalt Core](https://store.steampowered.com/app/2179850/Cobalt_Core/) | Crew decks mix, while a single spatial axis supports tactical decisions and time-loop narrative. | A narrow tactical surface can carry varied identities. Narrative time loops do not imply arbitrary combat rollback. |
| [Slay the Spire](https://store.steampowered.com/app/646570/Slay_the_Spire/) / [Monster Train](https://store.steampowered.com/app/1102190/Monster_Train/) | Character/clan pools, drafting, routes and build-altering rewards create run development. | Reward destinations should solve deck problems. A large map, duplicate economy or several floors are not mandatory. |

The appendix labels community-wiki details separately. Those are useful leads, not equally authoritative specifications. No market-success or human-optimal-play claims follow from this research.

## 3. Two current-rule issues to address first

### Enemy sequence density

**Current on-disk rules:** Bob normally consumes four positions; enemy actions occupy positions 2, 8, 14, 20 and so on. Therefore any ordinary four-position turn contains at most one enemy action.

Ringing allows an actor's first chronological action. It consequently does not suppress an enemy's lone action in a normal turn. It can matter when an extended window contains multiple actions or when applied to Bob; this is not a claim that Ringing is universally useless.

**Design implication:** we need threats with timing relationships. Test a preparation action followed by a strike, a vulnerable recovery after an attack, and a protection window worth attacking around. A proposed paired appointment at positions 8 and 10 would be an explicit schedule-generation change, replacing part of the threat budget rather than simply doubling damage. Reveal both reliably; compensate elsewhere and rerun balance when implemented.

### Refresh per distance

Across 24 consumed positions, six four-position turns versus twenty-four hypothetical one-position turns create:

| Gross opportunity, before caps/costs/card supply | Normal turns | Hypothetical shortest turns |
|---|---:|---:|
| Opening plus subsequent two-energy refresh budgets | 12 | 48 |
| Five-card hand opportunities | 30 | 120 |

This arithmetic does **not** prove a currently achievable infinite loop. It identifies the unit that matters: output per absolute distance, not only per turn. The stored cap limits hoarding, not repeated earning and spending.

Any card that retrieves shortening, accelerates “next turn” rewards or refreshes a per-turn power needs this comparison. If shortening becomes the dominant ordinary strategy, explicitly choose between repricing/restricting it and changing the refresh model. Do not silently replace the approved tempo rules with fixed-distance refresh.

Also compare new tools against existing tools: **a loan granting two Surge now and withholding two later is worse than the current zero-cost Second Wind granting two Surge without that bill**, unless it has another advantage. Borrowing must buy additional immediacy or access—not merely add debt to something already free.

## 4. Keep the objects and clocks distinct

| Concept | Player promise |
|---|---|
| Actual card | One physical identity in one inventory location. |
| Historical action | Evidence of one occurrence; not another copy of its card. |
| Echo | A new execution of a supported old move. |
| Reclaim | Move the actual eligible card back to hand. |
| Borrow | Move future access earlier and name exactly what becomes unavailable later. |
| Harvest / imprint | Create a newly paid benefit from past evidence; old outcomes remain true. |
| Steal / transfer | Remove the benefit from its donor as well as granting it elsewhere. |
| Rewrite | Change a past cause and recompute its later consequences. |
| Rewind / Restore | Return the world to an earlier state and make new decisions from there. |

Use **position**, **next normal hand refresh**, **draw-pile order**, and **this encounter/this run** explicitly. “In two” and “from the future” are not complete timing rules.

A useful card question is: **where does the power come from, what leaves, and when does the bill arrive?** If those answers are unclear, the mechanic is not ready.

## 5. Recommended contracts for the first temporal systems

These are proposed contracts to test, not new facts about the current implementation.

### Echo — the frequent signature

Play an Echo card into a legal current-turn position and bind it to an eligible, executed ordinary action in readable history. The Echo card pays its own printed cost and consumes its own position; it does not also charge the historical card again. Its price must account for the strongest eligible payload.

The action uses the recorded base recipe plus recorded signed grade. Reevaluate present target defenses and critical conditions. Do not repeat the old damage total, old critical outcome, energy payment or original attachment instances. Original position-bound grades contribute to the recorded recipe, not a new attachment that occupies today's position.

Start with whole-action eligibility for supported combat effects: damage, Block, Exposed and the existing Ringing critical rider. Mixed draw/energy/time/retrieval actions are ineligible as a whole. A future attack with an on-critical draw cannot sneak in merely because its main line says damage. Later expansion of eligibility is explicit.

One ordinary action occurrence can be Echoed once. A genuinely new, paid ordinary play earns a new occurrence. Echoes and historical recomputation do not. The source-use mark survives a Rewrite. An Echo cannot itself be Echoed or graded in the first contract. This is an Echo-use mark, not a new general-purpose currency.

**Integration decision:** prefer a source-bound Echo action over producing a temporary copy in the hand. That avoids an unnecessary second acquisition step and temporary-card inventory system. The research bank includes temporary-copy variants, but they are not this recommended contract.

### Reclaim — actual inventory specialization

Select a recent ordinary action whose real card is currently in discard. Move that exact card to hand. No substitute appears if it is already held, queued or in the draw pile. It returns without expired temporary grades; playing it again still costs energy and a position. Reclaim does not refund its old play.

Reclaim is a support card family, not a second required tutorial. Its advantages over Echo are a real card that can be held and graded anew; its limitations are availability, loss of historical grades and the need to play it normally. A later paid replay may produce a new Echo source—an intended engine if its total costs remain meaningful.

### Borrow — a visible advance, not a duplicate

Initial card borrowing advances actual top-of-draw-pile cards. It does not tutor the entire catalog or grant their play energy. Printed information must identify the reduced **next normal hand refresh**, not an ambiguous “next draw.” Resolution draws do not secretly repay that bill.

Prototype one outstanding advance, no more than two borrowed cards, with visible remaining draw debt. Withhold from the next normal hand allowance; if another explicit rule leaves insufficient allowance, carry the remainder rather than silently forgive it. No second advance until settlement. Exhausting the source is a candidate price, requiring an explicitly new encounter-exhaust zone.

**Victory policy:** forgive encounter-local draw/energy debt when the encounter ends. Finishing on borrowed resources is deliberately attractive. Price the immediate advantage and limit issuance; do not surprise the player with lost HP or next-encounter debt. A run-persistent credit contract is a separate optional modifier. Settlement and obligation identities must survive replay without collecting the same bill twice.

Start with an actual hand-for-top-card exchange if full borrowing is too hard to explain. That is an honest alternative, not a loan with its liability quietly removed.

### Future preparation — give scouting something to enable

Initially use one paid retention effect, stored-energy conservation and existing extension. Seeing danger then losing the necessary defense to ordinary cleanup is not meaningful preparation.

Later, allow explicit scheduled effects such as a ward at a revealed future position. This is a special utility exception, not permission to place all ordinary cards outside the current window. The effect fires when the position is consumed, not when it is revealed. Its timing relative to the ordinary action is printed. Player-owned scheduled effects remain inspectable without revealing hidden enemy occupancy.

Energy that matures during resolution still cannot fund already-made commitments. Defer generic future energy triggers until their next-planning availability is equally clear.

### Taking power from past and future

- **Live theft:** take four actual enemy Block and give those same four to Bob, with the original expiry. No donor Block means nothing to steal.
- **Historical imprint:** spend a past defense's use opportunity to create a bounded new Block grant now. The earlier protection still happened.
- **Waste recovery:** recover genuinely unused expired Block. More distinctive, but needs attribution the current aggregate Block state does not record.
- **Future interception:** redirect a marked upcoming defensive grant; the enemy no longer receives that same grant.
- **True retroactive theft:** remove the shield an enemy had before an old strike, then recompute that strike. This is Rewrite, not ordinary status transfer.

Do not begin with “steal any status.” Block, Exposed, Ringing, grades and delayed grants have different semantics. Narrow compatibility makes both counterplay and card text better.

## 6. Extensive bank: 56 mechanics and feature candidates

This bank includes extensions of current features and incompatible alternatives. **It is not a 56-feature production backlog.** L/M/H are relative rule-and-presentation complexity, not development-time estimates. “Prototype” identifies a discriminating experiment; it does not mean every such row enters the same build.

### A. Information and foresight

| ID / candidate | What the player can do | Cost, decision or guard | Scope |
|---|---|---|---|
| 01 Scouting with preparation | Reveal future positions, then retain a defense, bank energy or extend toward the threat. | Information must change a present choice; reveal is not extra placement. | L / core support |
| 02 Delivery Manifest | Inspect a bounded prefix of the draw pile. | No movement or reshuffle; distinguish deck knowledge from timeline scouting. | L / next wave |
| 03 Reserved Stock | Protect one revealed top card through one shuffle. | Occupies a single reservation; expires on draw, preventing permanent thinning. | M / later |
| 04 Price Prediction | Mark a public condition such as an attack dealing no HP damage. | Pay now; reward only if that event actually resolves and qualifies, once. | M / later |
| 05 Contingency Order | Prepay one printed if/otherwise response to a known future event. | A wrong prediction wastes the payment; no programmable reaction language. | H / later |
| 06 Department Intel | See the enemy/reward categories behind two run routes. | Avoided opportunities are lost; narrative knowledge is not combat inventory. | L / run layer |
| 07 Causal Difference View | Compare the known consequences of one proposed history edit. | A UI aid, not a paid card that sells basic arithmetic. No concealed future draws leak. | H / Rewrite support |

### B. Real cards and draw timing

| ID / candidate | What the player can do | Cost, decision or guard | Scope |
|---|---|---|---|
| 08 Reclaim | Recover the real discarded card linked to recent history. | Current zone matters; normal replay cost remains; no old grade refund. | M / specialist prototype |
| 09 Advance Delivery | Borrow actual upcoming cards into the present hand. | The next normal hand is smaller; one outstanding, visible advance. | M / specialist prototype |
| 10 Rain Check | Retain one chosen hand card through cleanup. | Pay for keeping the answer rather than using all resources now. | L / core support |
| 11 Equal Exchange | Swap an unwanted hand card with the revealed top draw card. | Hand count does not grow; the unwanted card becomes the next known draw. | M / Borrow alternative |
| 12 Time Capsule | Remove a card now and receive that same UID after a fixed distance. | Lost present access; one holding packet; return is not an extra draw trigger. | M / later |
| 13 Tool Mortgage | Lock a real hand card as collateral for Surge. | It cannot be played or recovered while pledged; no overlapping loans on one UID. | M / later |
| 14 Burn the Warranty | Play beyond normal affordability by exhausting the actual card after use. | Lose future access; disposable echoes cannot be collateral. | M / alternative economy |

### C. History as a resource

| ID / candidate | What the player can do | Cost, decision or guard | Scope |
|---|---|---|---|
| 15 Echo | Repeat an eligible recorded move at today's target state. | Pay a real card/position; one use per source occurrence; no descendant Echo. | M / signature prototype |
| 16 Scheduled Callback | Reserve a past action's Echo for a later explicit position. | Pay before knowing the eventual target state; cannot casually retarget for free. | H / later |
| 17 Keep the Receipt | Bookmark one action beyond normal lookback. | A limited reference, not a growing second hand; bookmarking gives no action itself. | M / later |
| 18 Old Uniform | Create bounded new Block from a past defense. | Spend an eligible historical claim; do not imply the original shield vanished. | M / later |
| 19 Unused Coverage | Recover protection that expired unused. | Only documented waste qualifies; one claim against an expiry event, not every snapshot. | H / provenance experiment |
| 20 Receipt Insurance | Heal an amount capped by a recent actual HP-loss event. | Current payment and one claim; no revival after terminal defeat. This is recovery, not Rewrite. | M / later |
| 21 Paid Break | Redeem a genuinely empty consumed position for retention or another modest benefit. | Real time was sacrificed; canceled attacks are not empty breaks; no energy-farming payout. | M / later |

### D. Power ownership and transformation

| ID / candidate | What the player can do | Cost, decision or guard | Scope |
|---|---|---|---|
| 22 Repossess | Transfer current enemy Block to Bob. | Remove the donor's units atomically and preserve expiry; no generic status theft. | M / next wave |
| 23 Customer Complaint | Move an actual Exposed liability from Bob to the opponent. | Must act while carrying the risk; no transfer from an empty source. | M / next wave |
| 24 Misaddressed Package | Redirect a marked, pending beneficial grant. | The original recipient loses it; eligibility and changed intent are visible. | H / later |
| 25 Protection Forwarded | Surrender live Block to schedule protection after a future position. | No simultaneous copies; delayed grant can arrive too late. A new expiry is an explicitly priced effect. | H / later |
| 26 Seasoned Tool | Let a retained card improve after actual positions pass. | It occupies a hand/retention opportunity; authored growth limit prevents safe stalling from becoming mandatory. | M / later |
| 27 Peak Performance | A current move references a recent high-water action value. | Bounded new benefit; counts authored input, not already-amplified output twice. | M / later |
| 28 Steal the Promotion | Remove a transferable grade from a revealed enemy action and attach a compatible grade to a current friendly card. | Grade is spent once, authorship/scaling differ, source intent visibly weakens. | H / later |

### E. Scheduling and action relationships

| ID / candidate | What the player can do | Cost, decision or guard | Scope |
|---|---|---|---|
| 29 Delay One Appointment | Push a revealed current enemy action into a later empty current position. | Explicit anchor exception, limited displacement; no hidden collisions or automatic cascading. | M / prototype |
| 30 Bring It Forward | Pull a revealed attack earlier while current protection is ready. | Earlier danger is sometimes useful; same explicit movement/empty-space restrictions. | M / later |
| 31 Break the Routine | Prevent an interruptible component of a telegraphed setup. | Conditional, component-specific prevention rather than routine total cancellation. | M / next wave |
| 32 Safety Cone | Pay for a protection trigger at a position that must remain empty. | Occupying the gap loses its benefit; time and energy are genuinely spent. | M / later |
| 33 Two-Beat Action | Split an authored attack into two specified moments. | The second hit can be blocked or arrive after lethal; separate Exposed consumption is explicit. | H / later |
| 34 Wind-Up | Commit a preparation and later payoff with a vulnerable gap. | Immediate damage is sacrificed; interruption is visible rather than surprise failure. | M / enemy-first prototype |
| 35 Break the Pattern | Reward changing the kind of action used compared with the previous real action. | An alternative to repeating the best attack; Echo participation must be specified. | M / later |

### F. Energy, liabilities and sacrifice

| ID / candidate | What the player can do | Cost, decision or guard | Scope |
|---|---|---|---|
| 36 Payday Advance | Gain more immediate Surge than an ordinary funding card, reducing later refresh. | Must beat Second Wind on immediacy; next grant is visibly withheld, with a finite issuance rule. | M / Borrow-family prototype |
| 37 Layaway Power | Deposit energy now for a payout after fixed absolute distance. | Illiquidity and cap waste; no interest merely for taking short turns. | M / later |
| 38 Future Discount | Reduce one chosen card's present price in exchange for a named future resource loss. | Not a global free turn; the concession and liability bind to one transaction. | M / later |
| 39 Trade-In Counter | Discard a real hand option to obtain Surge. | Smaller hand now; recovery-plus-conversion loops need genuine costs or finite use. | M / alternative economy |
| 40 Refinance | Delay one unpaid obligation once, increasing its cost. | No perpetual rollover; neither principal nor prior information is refunded. | H / debt expansion |
| 41 Pay It Off | Spend now to clear a displayed future bill. | Pay its actual settlement amount, not merely the card's printed activation fee. | M / debt support |
| 42 Emergency Scar | Obtain an immediate exceptional action by accepting a visible encounter-long handicap. | No harmless removable penalty masquerading as cost; cannot be copied by Echo. | H / rare experiment |

### G. Changing actual history

| ID / candidate | What the player can do | Cost, decision or guard | Scope |
|---|---|---|---|
| 43 Reschedule the Past | Move one previous ordinary action into an empty position, then recompute. | One recent turn and one limited charge; no new card or extra time. | H / signature prototype |
| 44 Exchange Past Actions | Swap two friendly actions in the last completed turn. | Works when history is full; compare against relocation for comprehension and search burden. | H / paired prototype |
| 45 Different Purchase | Replace an old played card with another card genuinely available at that historical decision. | Inventory/payment/downstream legality must all reconcile; not a present-hand substitution shortcut. | H / ambitious later |
| 46 Backdated Upgrade | Change an old action's grade and propagate its consequences. | Grade source/payment must be legitimate; no unpriced permanent output increase. | H / ambitious later |
| 47 Remove Their Old Shield | Remove a past defense so later recorded hits recompute against it. | This changes causality, not just current status; possible earlier lethal truncates everything later. | H / ambitious later |
| 48 Whole-State Rewind | Restore a checkpoint and choose a new sequence. | A non-restored use permission; no reroll fishing or selective free resource retention. | H / competing direction |
| 49 Save the Other You | Make previously ineffective post-death recordings real by preventing that death. | Requires recording a world beyond the current lethal endpoint; fundamentally broader architecture. | H / parking lot |

### H. Making complete runs rather than a laboratory

| ID / candidate | What the player can do | Cost, decision or guard | Scope |
|---|---|---|---|
| 50 Starting Toolkits | Select horizontal Bob packages that bias play without deciding the whole deck. | Keep a common readable foundation; avoid permanent stat grind as the answer to losing. | M / run core |
| 51 Split Permanent Upgrades | Refine a card toward power, timing or reliability. | Distinct from this-turn signed grades; preserve tradeoffs rather than universal cost reduction. | M / run layer |
| 52 Receipt Modifiers | Acquire one category of passive build-changing objects. | A few strong rules, not separate relic/gear/enchantment trees; bounded once-per-event effects. | M / run layer |
| 53 Store Credit Contract | Opt into liabilities that persist between encounters. | Terms and settlement on victory/defeat are explicit; not silently applied to ordinary Borrow. | H / later |
| 54 Remember the Store | Carry narrative knowledge into another run to choose different departments/interventions. | Knowledge unlocks options, not farmable combat inventory; an ordinary win remains complete. | H / narrative expansion |
| 55 Prepared Loadout | Choose a small legal preparation adjustment after previewing the next opponent. | Limited swaps preserve drafting consequences; not free rebuilding before every fight by accident. | M / alternative run model |
| 56 Separate Draft Challenge | Start from a draft and confront a compact known challenge ladder. | Reuses combat after the main run works; does not require a second campaign. | M / later mode |

**Things deliberately not sold as new mechanics:** free dragging already reorders ordinary commitments. Panning is not time travel. A larger reveal radius is content tuning, not a new system. A heal animation is not historical recomputation. More damage/status names do not automatically create another archetype.

## 7. Illustrative cards that make the vision concrete

These are prototype text, not tuned additions or renamed changes to the existing deck. Costs must be evaluated against current cards and equal-distance outcomes.

| Card concept | Illustrative operation | Why it exists |
|---|---|---|
| Keep Your Receipt | Retain one chosen hand card through the next cleanup. | Makes a forecast actionable. |
| Delivery Manifest | Inspect the next two cards in the draw pile without moving them. | Distinguishes supply information from enemy scouting. |
| Advance Delivery | Borrow the next two real cards; draw two fewer at the next normal refresh. Encounter-exhaust is a candidate source cost. | A bigger hand now versus a smaller hand later. |
| Valid Receipt | Reclaim an eligible recent card from discard. | Recover the actual useful tool, not a ghost copy. |
| That Bit Worked | Echo one eligible recent combat action at a current position. | Turn a good past decision into a future plan. |
| Second Coat | Echo a recent defense. | Demonstrate that history is useful for more than damage. |
| Repossess | Transfer up to four live Block, preserving its expiry. | Stealing has an identifiable donor and an immediate timing problem. |
| Protection Forwarded | Remove four current Block; schedule four Block immediately before a chosen revealed future position. | Sacrifice current safety for future safety. This is a new scheduled-effect system. |
| Tomorrow's Overtime | Gain four Surge; withhold two from the next stored-energy refresh. Candidate encounter-exhaust source. | More immediate power than Second Wind, paid for later. Amounts are illustrative, not a balance recommendation. |
| Safety Cone | Gain protection at a selected current position only if it remains empty. | A vacant position becomes a deliberate paid commitment. |
| After You | A strike improves if it follows an actual enemy action. | Gives waiting an offensive use; not every strong plan acts as early as possible. |
| Corrected Work Order | Hero-power prototype: revise one previous ordinary action's position. | Actual causality, without first creating a drawn-card payment paradox. |

The same source can support different choices: replay a highly graded strike through Echo, retrieve its actual card through Reclaim to grade it differently, or preserve it in the past while using a rare Harvest alternative. Do not teach all those choices simultaneously.

## 8. Rewrite: the exciting version and its hard boundaries

### Two examples worth distinguishing

**Mistake-repair teaching example:** at 20 HP, take an eight-damage hit before a seven-Block Vest, then lose the unused Block at cleanup. Present HP is 12. Move the Vest before that hit; the recomputed present is 19 HP. This is a real causal difference, but merely correcting an avoidable mistake is not enough to carry the game.

**Proactive decision example:** last turn, apply four Exposed before a six-damage ordinary attack. It deals ten and consumes Exposed—a sensible immediate choice. This turn, draw an illustrative finisher whose critical hit also heals. Rewrite the old setup to occur after that old attack instead. The old attack now deals only six; the opponent has four more HP, but Exposed remains for the new critical-dependent finisher. You trade an old advantage for a different present opportunity. The flat Exposed bonus was not duplicated, and the earlier choice need not have been foolish.

This second example is what we should build around: **new information changes which past sacrifice you want to have made**.

### Recommended first experimental contract

- One encounter-limited hero permission, not a drawn Rewrite card initially.
- Available at the start of new planning, before any new commitments or irreversible utilities. Newly drawn hand information can motivate the edit.
- Edit the last completed turn only. Compare relocation into an empty non-enemy position with exchanging two friendly ordinary actions. The two scopes need matched playtests.
- Show that whole turn in a specifically labelled Rewrite view even if ordinary current lookback would conceal some of it. This is a narrow visibility exception, not unrestricted history access.
- Preserve original card identities and paid utilities. Do not add actions, replace cards, alter enemy anchors or change the consumed turn's boundaries.
- Card-bound grades follow their cards; position-bound grades stay at their absolute positions. Recompute resulting effective grades and show the difference. The first teaching fixture can omit position grades, but production rules must not silently move them.
- Recompute the normal combat effects, including Block, Exposed, critical conditions, next-turn Ringing and earliest lethal. Do not replay old HP deltas.
- One accepted history and one candidate view. Commit atomically; charge once outside the replayed checkpoint. No branch inventory merging.
- Recomputed occurrences do not refresh Echo rights. Candidate evaluation cannot spend live rights or settle live debt; only adoption can do so.
- A new lethal candidate ends at its genuine lethal position with terminal cleanup. It does not receive ordinary subsequent draws/refresh. Already completed defeat is not rewindable under this initial contract.

### The shuffle decision must be explicit

Engineering review found that current cleanup appends played cards in queue order, and reshuffling depends on the ordered discard UID sequence. **Moving a past card can therefore change the next hand even when the seed is unchanged.** Existing history snapshots are not a magic undo solution.

**Recommended rule change to investigate:** cards discarded together by ordinary cleanup use a stable identity order, independent of timeline placement. Deliberate ordered-discard effects remain explicit separate operations. Combined with unchanged turn boundaries and a restricted non-resource edit scope, position-only revisions can preserve normal next-hand acquisition without silently substituting remembered cards.

This is an explicit foundational proposal affecting existing draw trajectories and requiring a fresh canonical balance run when implemented. It is not already true and must not be patched around only in the preview.

For the first bounded experiment, exclude turns whose relevant executed effects or conditional riders alter card acquisition or other unsupported resource causes. Then validate full nonterminal inventory outcomes, not just HP. If identities/order still diverge, reject the candidate with a visible cause rather than reveal new cards for free or invent replacements. Test whether these restrictions leave enough interesting legal edits; do not ship a supposedly central ability that is unavailable most turns.

A broader, equally honest alternative is fully causal changed draws, with new identities hidden until commitment and explicit uncertainty. That is a different, harder-to-read product promise. Choose it deliberately if fixed-acquisition Rewrite proves too restrictive.

### What exists technically—and what does not

`src/game/combat.ts` already provides a cloned-input `resolveTurn` and intermediate full resolution states. This supports retaining one real pre-resolution checkpoint and evaluating a candidate through the ordinary resolver.

`TimelineEntry` in `src/game/types.ts` stores actions, grades, attachments and events, not the complete pre-action actor/pile/energy state. Immediate activations return transient events; aggregate modifiers and bounded human-readable logs are not an ordered replay journal. A wider Rewrite needs durable commands, provenance and settlement identities.

Other explicit engineering work includes stable action-occurrence IDs distinct from card UIDs; pure candidate state; exact ownership of Echo recipes; branch-safe source-use and debt settlement; presentation cache reset on adoption; and bounded checkpoint storage. `CardVisual.echo` currently means anonymous decorative afterimages, not the proposed combat Echo system. Do not overload those meanings.

## 9. Deck identities: four primary packages, four optional branches

These are overlapping Bob packages, not eight new character classes.

| Package | How it wins | Genuine weakness | Cross-links / status |
|---|---|---|---|
| First Shift | Exposed and well-placed burst finish threats before their appointments. | A failed lethal race leaves poor defense; earlier is not always stronger. | Core; grades and borrowed resources can support it. |
| Second Coat | Invest in a useful ordinary action, then Echo its recorded recipe later. | Needs worthwhile history and pays for replay; a poor opening produces poor sources. | Core signature; high-water grades create valuable receipts. |
| Overnight Crew | Retain answers, conserve stored energy and defend at the exact relevant moment. | Waiting costs real HP/opportunities; Block still expires at cleanup. | Core support; forecasts matter without a second timeline. |
| Quality Control | Place authored grades and setup so one action does the right job. | Energy and setup costs; incidental hits can consume Exposed too early. | Core; keep signed levels, not a competing raw-damage “grade” system. |
| On Credit | Borrow a bigger present, then survive or end the fight before reduced refresh matters. | Smaller future hands/energy; cannot refinance forever. | Next-wave specialist, not the opening tutorial. |
| Lost and Found | Recover actual situational cards rather than wait for reshuffle. | Pile eligibility and replay costs; temporary grades are gone. | Reclaim specialty; requires ordinary tools, not an all-retrieval deck. |
| Quiet Hours | Use gaps and post-enemy timing for better effects. | Enemies keep acting; empty positions do not grant free refresh. | A few support cards first; audit shortening carefully. |
| Counterfeit Coverage | Steal present protection, imprint past protection or redirect future benefits. | Requires compatible donors/evidence and distinct expiry rules. | Later power-transfer branch; avoid one universal counter. |

A good run mixes packages: Grade → strong ordinary hit → Echo; Scout → retain defense → survive → bank for burst; Borrow → lethal attempt → manage the bill if it fails. Rewrite changes which earlier setup best serves the newly emerging deck plan.

## 10. Twelve enemy concepts and four bosses

Enemy variety should change the question, not merely add HP. Every conditional surcharge appears in intent and remains bounded; no opponent simply switches off the player's entire archetype.

1. **Possessed Security:** inspect, brace, strike. Teaches protection before impact and attacks before enemy defense.
2. **Checkout Clerk:** a non-damaging scan precedes a larger charge. Teaches which appointment actually requires protection.
3. **Shelf Stacker:** builds protection before a later attack. Teaches attacking around defensive windows.
4. **Cleaner:** visibly removes their own Exposed at a scheduled moment. Teaches setup/payoff proximity without universal cleansing.
5. **Greeter:** a mild opening hides no lie, but a revealed later attack is serious. Teaches why longer-range information matters.
6. **Returns Clerk:** a capped, printed surcharge after Reclaim. Tests whether recovering the exact tool is worth the price.
7. **Stock Auditor:** a public surcharge after Borrow. Tests current access versus future and present pressure.
8. **Paint-Mixing Clerk:** an announced defense becomes somewhat stronger after an Echo. Encourages varied lines without banning repetition.
9. **Payroll Assistant:** one announced attack scales modestly with outstanding debt. Bill timing becomes part of defense.
10. **Queue Marshal:** a strong strike weakens if the immediately preceding position is empty. Tests deliberate waiting.
11. **Demonstrator:** a strike weakens if Bob acted aggressively just beforehand. Contrasts with the Marshal using familiar actions.
12. **Shift Supervisor:** an announced application of Ringing to Bob changes next turn's action plan. Do not pretend the same status always cancels a lone enemy action.

Introduce a mechanic-testing enemy only after the corresponding player mechanic is available. Early authored order must not be described as already supported by the current independently permuted schedule.

### Boss bank

- **Floor Manager — “We've Always Been Open.”** Recombines ordinary attacks, defense, self-cleaning and Ringing. First major exam of familiar sequencing.
- **Customer Service — “We Can Reverse the Charge.”** Alternates recover/borrow temptations with capped conditional surcharges. Tests actual identity, not inventory theft by surprise.
- **Regional Director — “Tomorrow's Targets, Today.”** A distant, clearly advertised deadline and ordinary intervening pressure make borrowing or preparing a meaningful choice. Later debt-specific variant optional.
- **Night Manager — “Please Remain for Closing.”** One possessed host combines familiar demands while the store tries to keep the shift repeating. A later variant may have one explicitly revealed rescheduling action. Never silently reroll previously promised intent.

A boss may resist one timing intervention per action or limit its magnitude. Prefer this to “immune to all time powers.” The spectacle belongs in character animation, impossible announcements and escalating consequences, not a proliferation of hidden timing rules.

## 11. Complete run structure and progression

### Recommended first complete product: Last Customer

A compact beginning-to-ending expedition, not an endless combat test:

**Entrance duel → department duel → service choice → supervisor → department duel → optional elite/supply branch → staff-corridor duel → preparation choice → final confrontation.**

That is six mandatory fights and an optional seventh. Use three store zones—front end, sales floor, staff-only—without requiring three full maps or three mandatory bosses. Department choices reconnect; the player chooses the next useful challenge rather than navigates a sprawling graph.

After ordinary wins, offer a small card choice with a clear skip. Early offers should work immediately; later offers can ask for a stronger specialization. Service stops trade healing against card removal or a clearly defined run upgrade. A full shop and a new currency are not required for the first complete run.

Victory frees the final host and ends this invasion. Defeat resets the combat build. Remembered employee stories and alternate starting tools can unlock horizontally. Do not require a permanent-stat grind or a quota of failed runs before an ordinary ending counts.

**Pacing hypothesis:** roughly 30–45 minutes after familiarity, with suspend/resume at planning and reward boundaries. This is a target to test, not a market benchmark. Do not enforce it with a planning timer.

### Ten event and passive-modifier ideas

1. **Yesterday's Break Room:** heal, or permanently remove one selected card for this run.
2. **Unopened Toolbox:** exchange an existing card for one of two fully shown alternatives, or leave.
3. **Self-Checkout:** take modest healing, or accept a stronger card at a displayed, nonlethal HP cost.
4. **Clock Repair:** take a safe short route or one extra known elite opportunity; route length is not encounter-position length.
5. **Employee of the Previous Month:** choose a permanent authored upgrade with a downside. Keep it distinct from temporary grades.
6. **Dented Thermos:** once per encounter exchange a small nonlethal HP amount for Surge.
7. **Inspection Mirror:** choose opening information or opening protection, not both automatically.
8. **Steel-Toe Boots:** improve one attack if the following playable position is committed to remain empty.
9. **Duplicate Receipt:** a limited Echo discount with a meaningful payload downside, only under a supported copying contract.
10. **Manager's Override:** preview two encounter identities and choose one; lose the avoided reward opportunity.

Use one passive-object category. Calling similar bonuses relics, gear, enchantments and permanent statuses creates four management surfaces without necessarily creating four worthwhile decisions.

### Two different expansion visions

**The Same Saturday:** a knowledge-driven store mystery. Familiar routes and employee testimony unlock different interventions on later runs. Narrative facts persist, not cards or live combat timelines. Stronger writing identity, greater state-combination burden; an initial victory still has a real ending.

**Night-Shift Rescue:** two party members contribute different tools to one shared timeline. A courier could manipulate deliveries, a cleaner could handle evidence/status removal, a nurse could prepare future protection. Decide shared versus individual health, energy, hands and action limits before authoring their cards. This is not automatically co-op.

A separate Sunforge-like draft challenge is another later reuse of proven combat; [Dawncaster's developer notes](https://wanderlost.games/test-message/) explicitly describe Sunforge as a draft mode. It need not dictate the main campaign structure or reuse historical entry costs.

## 12. What the development plan should prove

### Gate A — the timeline is interesting before new time powers

Author three contrasting encounters: isolated strike, preparation/payoff, and a bounded denser sequence. Keep damage/Block/Exposed readable. Observe whether correct plans genuinely differ. If the same ordering solves all three, fix encounter decisions before producing a large card catalog.

### Gate B — history has an understandable use

Compare Echo plus retention against a Reclaim variant using matched hands and threats. Verify card identity, grades, critical conditions, canceled actions, no-recursion and source-use behavior. A player should explain “repeat the move” versus “get the card” without reading a long exception list.

### Gate C — genuine Rewrite deserves the headline

Compare Echo-only, empty-slot historical relocation and friendly-action exchange. Include both mistake repair and the proactive new-hand scenario. Test a depleted deck/reshuffle, position grades, changed Exposed/Ringing, earlier lethal, a full previous turn and concealed ordinary lookback.

Resolve the cleanup-order/randomness contract explicitly. Existing snapshots and a matching seed are insufficient. If legal revisions are usually unavailable or only repair blunders, revise the scope or choose the Echo-led alternative openly.

### Gate D — the future can be borrowed responsibly

Add one draw advance or one energy advance, not every debt type. Compare it with Second Wind and normal cycling. Test repayment under shortening, zero available entitlement, shuffle, victory and Rewrite settlement. The player must predict both the immediate gain and the later smaller resource.

### Gate E — a whole game is worth replaying

Build the six-fight expedition with reward skip, refinement/healing choices, horizontal starting variety and an actual ending. Use a focused content envelope—roughly 30–40 total card definitions including existing ones, four overlapping packages, a small ordinary-enemy set and two bosses—as a planning hypothesis, not a quantity target that substitutes for good decisions.

After proving that game, choose whether the next investment is more encounter variety, power-transfer cards, a narrative knowledge layer or party composition. Do not add them all as inevitable maturity steps.

## 13. Playtest questions and failure signals

These are proposed experiments; no human playtests of the new mechanics were performed in this research pass.

- **Forecast value:** with the same hand but two different future intents, do players choose different present plans? If not, information may be an expensive worry generator.
- **Causal understanding:** before committing Rewrite, can players identify what changes, what stays fixed, and why? Do not treat inability to explain a changed hand as a player failure.
- **Proactive revision:** do competent players revise sensible past choices after new information, or only repair accidents?
- **Identity:** can players distinguish a real recovered card, an Echo source and the original historical record?
- **Equal-distance economy:** compare HP lost, useful cards accessed, damage dealt and resources spent over the same absolute positions, not merely the same turn count.
- **Choice quality:** does borrowing buy a meaningful earlier opportunity and sometimes create a real later problem? Does victory forgiveness feel like a satisfying finisher rather than the only sensible play?
- **Build diversity:** do several packages succeed across contrasting enemies through different decisions, not just slightly different arithmetic?
- **Decision load:** watch repeated inspections and unchanged-plan cycling. Long thought is not itself failure; confusion about what information is missing is.
- **Availability:** how often does the signature power have an understandable, legal, interesting target? A technically correct ability that usually says no is not a successful centerpiece.
- **Access:** can a player complete the same decisions without sustained hold/drag, without color cues, and with enlarged text? Preserve the satisfying default touch behavior while adding an optional accessible interaction mode.

Accessibility recommendations are grounded in [Xbox input guidance](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/107), [tutorial guidance](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/109), [text guidance](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/101) and [color-independent information guidance](https://gameaccessibilityguidelines.com/ensure-no-essential-information-is-conveyed-by-a-fixed-colour-alone/). Do not force a return of buttons to the preferred hold view; an optional tap-to-pin/select-target mode can coexist. Only the Rewrite candidate gets its special causal diff; a free complete outcome oracle would be a separate change to the current no-full-preview agreement.

## 14. Red lines and open product choices

**Do not build by default:** unrestricted branch trees; permanent power farmed by rewinds; Echoable generators or Echo descendants; loans that hide their forgiveness; automatic enemy rescheduling caused by ordinary drops; paid cards duplicating existing free reordering; generic erase-all/steal-all status tools; a second tactical grid; four simultaneous party hands; co-op causal editing; a large keyword glossary that substitutes for teaching.

**Decisions to approve before implementation:** Echo-led versus Rewrite-centered identity after the prototype comparison; exact Rewrite scope and visibility exception; canonical cleanup ordering versus fully causal unknown draws; debt forgiveness and issuance limits; authored enemy density; the first complete run structure; eventual party ownership. The recommendations above provide defaults, not permission to mutate the current combat model silently.

### Final creative direction

The best version is not the one with the most time-related terminology. It is the one where a player repeatedly thinks:

**“I can use what I did.”**

**“I can borrow what I will need.”**

**“And this time, I want the past to have gone differently.”**

That is a coherent game identity. The broad bank exists to strengthen it—not to bury it.

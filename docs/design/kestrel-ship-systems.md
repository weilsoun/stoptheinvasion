# Kestrel: optional modules / modifications / supplies

**Proposal only. All numbers, limits, prices and roster choices below are illustrative and unbalanced. These optional modules, modifications and supplies are not implemented by the separately approved expedition and change no gameplay.**

## Grounding: observed contract versus new proposals

Read against `AGENTS.md:3–31,33–61`, `src/ship/combat.ts:18–75,330–340,368–505` and `docs/design/visual-style-guide.md:3–32`. The historical `docs/design/time-travel-design.md:1–7,38–57` explicitly parks its old temporal mechanics; its comparative research is context, not an active specification. No new external research or playtesting was performed for this proposal.

**At proposal time:** the playable product was one standalone battle, not an expedition. Cards resolve immediately. Kestrel starts with 70 hull, shield capacity 12, recharge 3, three energy and five cards. Energy refills to three rather than being capped at three. Shield damage precedes hull damage; separate hits and enemy actions stop on lethal damage. End Turn discards the hand; living enemies recharge and act in stable order; surviving Kestrel then refills energy, recharges, resets Adaptive Coils and draws five. Coils currently boosts the first shield card by two. Reserve Cell is a zero-cost, two-energy card that exhausts for the battle; Tactical Sweep costs one and draws two. The seven Pulse Cannon copies are separate physical cards, not seven settings on one shared object.

**Subsequent approval:** the user subsequently approved map/ship/away progression, crew cards, numeric refinements and finite service repairs per `kestrel-expedition.md`; the module/modification/supply inventories below remain optional proposals.

**Design hypothesis:** three visibly different ownership scopes give the desired relic/enchantment/potion texture without three competing upgrade systems: the ship owns modules, one physical card owns a modification, and the captain spends a supply item.

## Three coherent vocabulary/mechanics families

| Family | Relic equivalent / exact-card enchantment / consumable | Mechanical character | Tradeoff |
| --- | --- | --- | --- |
| **Working ship — recommended** | **Installed Modules / Card Modifications / Emergency Supplies** | Small equipment rack; one modification per card; a few single-use items. Plain triggers such as first attack, shield break and battle start. | Least glamorous, but easily read and explained. “Modification” must always name the affected card copy. |
| Salvage runner | Salvaged Rigs / Jury-Rigs / Emergency Canisters | Stronger conditional equipment, punchier card changes with costs, disposable crisis tools. Same three scopes, more explicit tradeoffs. | Excellent scrappy identity; too many failure penalties could turn reward selection into accounting. Avoid durability, random malfunctions and salvage subcurrencies. |
| Naval systems | Ship Systems / Calibrations / Reserve Stores | Reliable once-per-turn passives, precise card tuning, predictable stocked charges. | Very legible and compatible with departments, but risks sterile “+2 everywhere” rewards. Do not turn this into reactor allocation or a crew station simulator. |

These are alternatives, **not three additional item categories**. Use the first family's labels with salvaged hardware flavor. “Refit” is a service that installs a modification, not a fourth inventory object. Avoid calling every item an “upgrade,” and reserve “repair” for hull restoration rather than shields.

## Recommended ownership and limits

- **Installed module:** automatic ship-wide rule, installed until replaced or the future run ends. Start exploration with **three acquired-module slots**, plus the existing built-in Adaptive Coils. Coils is a useful teaching example, not a newly invented bonus or an extra copy to buy. Installation/replacement only between battles; replaced modules are relinquished, not stashed for per-fight swapping. No equipment weight or power-budget subsystem.
- **Card modification:** one persistent change on **one exact card instance** until replaced, that card is removed, or the run ends. One socket per card. “Pulse Cannon · Focused” changes that copy only; the other six remain unchanged. The card's base illustration, department and rarity remain intact. A shared *visual card template* remains global styling and must never accidentally become a global mechanical modification.
- **Emergency supply:** one item, one activation, consumed permanently within the future run. **Three supply slots; each slot holds one unit, no hidden stack.** Duplicate supplies may occupy separate slots. One supply activation per player turn, with no use during enemy resolution, playback or a terminal state. No automatic rescue on defeat. Supplies are not cards: they do not draw, discard, exhaust or activate “play a card” effects.

The slots and one-use-per-turn rule are proposed tuning levers, not claims about existing controls. A module's scarce slot and acquisition cost can be its entire drawback; every reward need not carry a punishment.

## Module idea bank — ten candidates

All occupy one acquired-module slot, are unique by identity, and have no manual activation unless explicitly stated. “First” is a consumed ready/spent trigger, not a repeatable check while a condition remains true. A bonus to an attack applies to **one hit**, never automatically to every hit of Twin Burst.

| Module | Concise rule and trigger | Cost, limitation or tension | Readable status |
| --- | --- | --- | --- |
| **Salvo Director** | First paid attack card each player turn: its first hit deals +2 damage. | Actually spend at least one energy; zero-cost effects do not qualify. One hit only. | `Salvo +2 · Ready/Spent` |
| **Breach Scope** | First attack card each player turn committed against a ship with zero shields: +3 to its first hit. | Check shields before the card's first hit; Twin Burst cannot create its own eligibility with hit one. | `Breach +3 · Ready/Spent` |
| **Ablative Baffles** | First incoming hit each enemy phase that would damage hull: reduce that hit's hull loss by 2, minimum zero. | Shields absorb normally first. Triggers once even if the entire hull portion is prevented; later hits are not protected. | `Baffles −2 hull · Ready/Spent` |
| **Reserve Capacitor** | At End Turn, if at least one energy remains, spend one to store one charge. After the next normal energy refill, gain one energy and clear it. | Only one charge; excess energy still expires normally. Cannot carry charges between battles. No prompt or infinite accumulation. | `Stored 0/1 · Next turn +1` |
| **Emergency Crossfeed** | Once per battle, after a surviving incoming hit takes shields from above zero to zero, gain 2 shield. | Does not absorb overflow from that hit or undo hull loss; can protect against the next hit. No activation from paying a shield cost. | `Crossfeed 1/1` |
| **Cold-Start Projector** | On the first surviving turn transition that begins with zero shield, gain +3 shield after normal recharge. | Once per battle, not every turn; capacity still applies. Opening setup does not trigger it. | `Cold start 1/1 · Requires 0 shield` |
| **Launch Battery** | After opening setup, gain one energy. | Opening turn only; not an increased refill or capacity. Competes with sustained engines. | `Launch +1 · Spent` after opening |
| **Survey Antenna** | After the opening five-card hand is dealt, draw one more card. | Opening turn only; no preview of hidden draw order. Better selection, not energy. | `Survey +1 card · Spent` |
| **Field Repair Rack** | First hull-repair supply used each battle restores +2 hull. | Needs an actual scarce repair supply; no repair on victory, shield repair or passive trigger. Still capped at maximum hull. | `Patch boost +2 · Ready/Spent` |
| **Reclamation Filter** | First card played from hand that finishes resolving and enters exhaust each battle: draw one card. | Once per battle. No trigger for discarded cards or consumed supplies; no returning exhausted cards. | `Reclaim 1/1` |

Adaptive Coils remains the built-in example: first shield card each turn gets its existing +2 within capacity. Acquiring Field Repair Rack does not make Coils a hull-repair effect. Launch Battery and Reserve Capacitor deliberately offer different burst-versus-saving identities; do not assume they are equally strong.

## Exact-card modification bank — eight candidates

A modification is installed by choosing a visible, individually identified card. Eligibility is intentionally narrow. Prices below are not needed to understand the card: the effective cost and complete effective rule must be printed directly.

| Modification | Eligible card and exact illustrative change | Cost/drawback and identity preserved |
| --- | --- | --- |
| **Overcharged Breech** | Pulse Cannon or Rail Lance: +4 damage to its single hit; energy cost +1. | Bigger committed shot, not free universal damage. No multihit multiplication. |
| **Shield-Tuned Lens** | Pulse Cannon: +2 damage if the chosen target has shield when the card is committed. | No bonus against exposed hull. Install cost and occupied socket are the drawback. Still one ordinary shot. |
| **Staggered Fuses** | Twin Burst: first hit 4, second hit 7 instead of 5 and 5. | Weaker immediate hit, stronger follow-through; second hit is suppressed if the first kills. Keeps the two-hit identity. |
| **Extended Windings** | Shield Cycle: restore 9 shield instead of 6; cost 2 instead of 1. | More restoration per card, worse energy efficiency and more likely to overflow capacity. Coils still adds its one existing bonus. |
| **Flash Capacitor** | Shield Cycle: restore 10 instead of 6, same cost; exhaust this copy for the battle. | Strong immediate protection, fewer recurring defenses. Exhaust is not deletion from the future run. |
| **Deep-Spectrum Scan** | Tactical Sweep: draw 3 instead of 2; cost 2 instead of 1. | More selection at a substantial energy cost. Does not reveal hidden cards without drawing them. |
| **Sealed Reserve** | Reserve Cell: gain 3 energy instead of 2; retains cost 0 and exhaust. | One-use battery improvement; no repeat generation and no removal of exhaust. Install cost/socket are the drawback. |
| **Quick Sweep** | Tactical Sweep: cost 0, draw 1, exhaust for the battle. | Trades repeated two-card selection for a single free cycle. Cannot coexist with Deep-Spectrum Scan on this copy. |

Not every card needs access to every modification. Specifically avoid a universal “cost −1,” “draw one on play,” “repeat this card,” or “remove Exhaust” sticker. Those tend to homogenize the deck and create energy/draw loops. Do not add hull repair to an indefinitely recyclable card. The rewarding decision should be *which role to specialize*, not how to put the same best enchantment on all fifteen cards.

## Emergency supply bank — eight candidates

All consume one inventory unit and the turn's one supply activation. “No energy cost” still spends a scarce supply and that activation. Except for the explicitly costly tools, activation is free in energy. Prevent activation that has no possible effect; canceling target/choice selection spends nothing.

| Supply | Effect and timing | Additional cost/drawback |
| --- | --- | --- |
| **Hull Patch Kit** | Restore 6 hull now, at most maximum hull. | Costs one energy; taking time to repair competes with attacks and shields. |
| **Sealant Foam** | Restore 3 hull now. | No energy cost, but less restoration per scarce slot. Not a passive damage shield or revival. |
| **Shield Ampoule** | Restore 6 shield now, within capacity. | No hull repair, no temporary capacity, no Coils trigger. Wasted overflow is shown before use. |
| **Reserve Battery** | Gain one energy now. | Extra energy expires at the normal refill; cannot use a second supply this turn. Deliberately distinct from the stronger exhaustible Reserve Cell card. |
| **Redline Injector** | Pay 3 hull, ignoring shields, then gain 2 energy now. | Legal only above 3 hull; no lethal payment, no damage-reaction triggers, no automatic shield break benefit. High attrition price. |
| **Emergency Requisition** | Draw two cards, then choose one card from the resulting hand to discard. | No energy gain; completes the choice before another action. Does not search the deck or retrieve exhaust. |
| **Decoy Chaff** | Mark one living enemy: reduce its next incoming damage hit this enemy phase by 4, minimum zero. | Only one hit, not its whole intent. Expires after that enemy phase even if unused; no carryover when the enemy dies. Printed intent shows base and reduced first hit. |
| **Shield-to-Power Coupler** | Pay 4 current shield, then gain one energy. | Requires at least 4 shield; leaves the ship exposed. Paying shield is not incoming damage and cannot trigger Crossfeed. |

Chaff and Requisition are deliberately outside the initial roster because they introduce targeted temporary mitigation and an extra choice step. Redline/Coupler are alternatives to the safe Battery, not evidence that each is worth shipping. No generic “remove all debuffs” item before concrete statuses exist.

## Predictable interaction rules

### Stacking and exact scope

1. One installed copy of each module; no quality levels or duplicate merging. A duplicate reward should offer an alternative, not create a second invisible stack. One modification per physical card; a refit replaces rather than layers it. Multiple differently modified copies of a base card are legal and visibly distinguishable.
2. Flat bonuses on the same eligible hit add once: an Overcharged single-hit card can receive Salvo and Breach, but neither applies to every future hit. No percentages, multipliers or repeated “on bonus” triggers in the first set. Shield/hull restoration never exceeds capacity; unused restoration does not become energy.
3. Compute changed base card cost/effects from that card's modification, then eligible ship bonuses, then target defenses. Conditions such as shielded/unshielded target are snapshotted at card commitment unless their rule explicitly says “after a hit.” Show effective cost before affordability checking and pay it before effects. There are no refunds from these candidates.
4. A first-card trigger is spent on that qualifying committed card even if capacity or mitigation nullifies its bonus. A rejected play never spends it. Per-battle readiness resets only for a genuinely new battle, not when opening a menu or reshuffling.

### Trigger order and lethal suppression

- Preserve current enemy order and each intent's written effect order. Do not insert input windows between enemy hits.
- For a card: validate the entire command and cost; capture its effective recipe and qualifying ready bonuses; pay and consume those triggers; resolve the recipe in order; finalize its discard/exhaust destination. Generated module effects are not additional card plays.
- For incoming damage: apply explicit hit mitigation (Chaff), absorb with shields, apply hull-only mitigation (Baffles), commit actual damage, then check lethal. Only if alive may post-hit effects such as Crossfeed run. A hit reduced to zero causes neither hull-loss nor shield-break reactions. Crossfeed between Twin-style hits can block the second hit but never retroactively block the first.
- At hull zero, defeat suppresses all remaining hits, repairs, draws, energy, recharge and enemy actions. No supply can be used after lethal. A slain enemy receives no remaining hits, and this set contains no auto-retargeting. If the final enemy dies, finish only mandatory card-zone bookkeeping and terminal presentation; suppress optional post-play rewards such as Filter's draw. Non-final kills may still complete legal self-directed post-play triggers while the battle continues.
- At End Turn, Capacitor banks its eligible energy before the ordinary hand discard. On survival, preserve normal refill/recharge/reset/draw order; apply Capacitor after refill, Projector after recharge using the pre-recharge zero-shield snapshot, and any expressly additional opening draw after the ordinary opening hand. Once-per-turn enemy mitigation resets at that enemy phase's start, not on every attack.
- If two same-timing triggers remain, use a fixed documented module priority/identity order, independent of install order. Presentation follows that resolved order; animation speed does not change outcomes. The UI must explain any priority with actual consequences rather than requiring players to guess slot ordering.

### No infinite energy or draw

Finite copies alone do **not** guarantee safety because discard recycles. The proposed set therefore has no repeat/copy/return-from-exhaust effect, no repeatable energy refund, no permanent cost-reduction engine and no rewards for module-generated draws. Energy-generating cards retain exhaust. Energy/draw modules are opening-only or once per battle, except Capacitor, which transfers an already unspent energy rather than generating it inside the turn. Free Quick Sweep also exhausts. Supplies are consumed and once per turn. Reclamation Filter cannot activate itself or another exhaust trigger through its own draw.

Damage/shield passives may trigger each turn but cannot produce energy or draw. Every future content addition would still need a bounded-combination check; these restrictions are a content policy, not a claim of formal balance proof. Avoid repairing an infinite combo with an arbitrary silent turn-action cap.

## Future persistence, rewards and service economy

**Proposed future run boundary, not an implementation request:** carry hull damage, installed modules, exact-card modifications and remaining supplies between encounters. Clear temporary shields/energy, charged Capacitor state, mitigation marks and battle counters. Restore exhausted cards to the next battle's deck; reset once-per-battle readiness. Do not refill consumed supplies. Initialize the next battle's shields under an explicit encounter-start rule—recommended ordinary starting shields bounded by current capacity, not banked battle-end surplus. At run end all acquired power disappears. Horizontal unlocks may add available starting choices or reward options, never permanent +hull/+damage account statistics.

Use **one future salvage currency**, not separate module scrap, enchantment dust, repair parts and charges. Rewards and service choices should compete:

- Ordinary victories offer a small card-or-supply choice rather than automatic hull repair and a full equipment refill. A supplied repair is itself a reward opportunity cost.
- Scarcer hardware rewards offer a module choice; optional service stops offer a hull patch, an exact-card refit, supply purchase or a limited module replacement. Do not require ship-interior navigation or a crafting tree to perform them.
- A useful exploratory price ratio is one basic supply = 1 unit, one fixed 8-hull service patch = 2, one card refit = 3, one installed module = 4. These are relative **unbalanced proposals**, not currency quantities to ship. Service repair's better total yield compensates for lack of emergency access.
- Keep stock and service visits finite per run. No buy/sell arbitrage, replenishing service on reopen, or repeat victory income from replaying the same cleared encounter. Same-seed combat replay remains a standalone replay, not a farming action attached to future progress.
- At full supply inventory, allow explicit replace or decline; no surprise deletion. A replaced module or modification has no automatic resale credit in the simplest model. Show before/after effective rules and the exact affected card before committing a service.

**Protect hull attrition:** repair must consume a finite reward, money or carried unit. No “heal after each kill,” renewable “repair per turn,” or guaranteed free full heal at every battle boundary. Field Repair Rack increases yield only from a genuinely spent supply. Chaff/shields prevent future harm but do not erase accumulated damage. Holding the last enemy alive cannot create supplies or hull. Track future damage received, repair availability, purchases and ending hull before tuning generosity; surviving the current forgiving introductory fight is not proof of a viable attrition economy.

**Protect deck identity:** scarce sockets and narrow eligibility support tradeoffs; avoid letting every attack draw, every shield make energy and every utility card become damage. Keep Rail Lance's expensive single hit, Twin Burst's ordered double hit, Shield Cycle's restoration, Cell's finite power and Sweep's selection distinct. Modifications do not recolor rarity or turn department metadata into an unapproved restriction.

## Readable placement in the expedition

- **Modules:** a compact installed-systems row adjoining Kestrel's left ship-status console, not across enemy art or the physical hand. Show a distinctive hardware icon, short name and ready/spent/charge state. Tap for the full rule and current reason it will/won't trigger. Built-in Coils is explicitly labeled built-in. Detailed inventory may live in an existing menu later; no mock hangar screen now.
- **Card modifications:** one small labeled hardware stamp beside the card's rules area, not another rarity frame or an icon hidden in the art. The face prints the actual modified cost and effect; inspection shows `Base → Modified → Current ship bonus`. Visible piles and accessible card names identify the particular modified copy. Anonymous draw-pile information remains anonymous.
- **Supplies:** three clearly separated pockets near player commands, visually distinct from hand cards and End Turn. Show name and `1 use`, not an ambiguous potion stack number. Tap opens a concise effect/cost preview and explicit Use; targeted Chaff uses the existing explicit-target model. Cancellation is safe. Show `Supply used this turn` on remaining pockets and exact reasons for insufficient hull/shield/energy.
- Preserve actual 44-CSS-pixel targets after stage scaling, text labels in addition to color, keyboard/focus access, reduced-motion equivalence and uncluttered intent numbers. Ship/target readouts must remain visible during selection; detail dialogs may use the existing modal approach. A brief source label on resolved feedback should distinguish card/mod/module/supply without a permanent combat-log wall.

This specifies intended readability only; no screenshot validation or interface implementation was performed.

## Small recommended first roster and review decisions

For a **separate gameplay proposal, not an implemented item system**:

- Keep existing Adaptive Coils built-in; try **Salvo Director, Ablative Baffles, Launch Battery and Survey Antenna** as the first four acquired modules. They cover offense, defense, opening power and opening selection with few counters and no economy-dependent healing engine.
- Try **Overcharged Breech, Staggered Fuses, Flash Capacitor and Sealed Reserve** as four narrowly scoped modifications. They expose cost versus output, multi-hit identity, exhaust versus recurrence and a finite energy specialization.
- Try **Hull Patch Kit, Shield Ampoule and Reserve Battery** as three supplies. They teach hull versus shield versus energy without extra targeting or post-draw choice flows. Leave the more complicated bank items unimplemented unless later selection supports them.

Recommended decisions to review when awake, rather than blockers requiring an answer tonight:

1. Adopt plain **Modules / Modifications / Emergency Supplies**, with scrappy hardware flavor.
2. Keep three acquired-module slots plus built-in Coils, one modification per exact card, and three one-unit supply pockets; treat those limits as provisional.
3. Keep supplies player-turn-only and once per turn; no panic reaction window or death rescue.
4. Make ordinary hull repair finite and economically competitive with deck improvement; never automatic after victory.
5. Favor narrow, identity-preserving card changes over generic enchantments. Keep future department-energy design separate.
6. Keep only these optional item mechanics unimplemented until chosen; approved expedition/crew/refinement/service work proceeds separately.

**Deliverable boundary:** this proposal is not balance evidence and itself changes no gameplay.

import {
  cardDefinition,
  createBattle,
  dispatchBattle,
  legalTargets,
  nextIntent,
  previewCard,
} from './combat';
import { cardIdentity, DEPARTMENT_LABELS, rarityStyle } from './card-identity';
import {
  SHIP_DESIGN,
  SHIP_PILES,
  SHIP_SCREEN,
  SHIP_SELF_DROP,
  enemyShipPose,
  SHIP_CARD_DETAIL_SCALE,
  SHIP_CARD_LIFT,
  SHIP_CARD_SELECTED_SCALE,
  shipHandPoses,
  type ShipBattleEvent,
  type ShipBattleState,
  type ShipCommandResult,
  type ShipCard,
  type ShipCardVisual,
  type ShipCardDefinition,
  type ShipEffect,
  type ShipGamePort,
  type ShipScene,
} from './types';

type PileName = 'draw' | 'discard' | 'exhaust';
type Modal =
  | { type: 'detail'; card: ShipCard; origin: string; parentPile?: PileName }
  | { type: 'pile'; pile: PileName; origin: string }
  | { type: 'help'; origin: string; parentMenu?: boolean }
  | { type: 'menu'; origin: string }
  | { type: 'confirm'; action: 'restart' | 'replay'; origin: string }
  | null;

type DebugWindow = Window & { __SHIP__?: unknown };
interface CardDrag {
  pointerId: number;
  uid: string;
  startClientX: number;
  startClientY: number;
  grabOffsetX: number;
  grabOffsetY: number;
  started: boolean;
  heldX: number;
  heldY: number;
}

const DRAG_THRESHOLD_CSS_PX = 9;
const AIM_PREVIEW_RADIUS = 320;

const clone = <T>(value: T): T => structuredClone(value);
const escapeHtml = (value: string): string => value.replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
})[character]!);
const DETAIL_POSE = { x: 850, y: 492, width: 300, height: 426, rotation: -1 } as const;

function effectText(effect: ShipEffect): string {
  switch (effect.kind) {
    case 'damage': return `Deal ${effect.amount} damage`;
    case 'shield': return `Restore ${effect.amount} shield`;
    case 'draw': return `Draw ${effect.amount} ${effect.amount === 1 ? 'card' : 'cards'}`;
    case 'energy': return `Gain ${effect.amount} energy`;
  }
}

function effectsText(definition: Pick<ShipCardDefinition, 'effects'>): string {
  return definition.effects.map(effectText).join(' → ');
}
function cardClassification(definition: Pick<ShipCardDefinition, 'id' | 'kind'>): {
  text: string;
  ariaText: string;
  accent: string;
} {
  const identity = cardIdentity(definition);
  const rarity = rarityStyle(identity.rarity);
  const department = DEPARTMENT_LABELS[identity.department];
  const kind = definition.kind[0]!.toUpperCase() + definition.kind.slice(1);
  return {
    text: `${rarity.label} · ${department} · ${kind}`,
    ariaText: `${rarity.label}, ${department} department, ${kind} card`,
    accent: rarity.accent,
  };
}

function classificationMarkup(definition: Pick<ShipCardDefinition, 'id' | 'kind'>): string {
  const classification = cardClassification(definition);
  return `<span class="card-classification" style="--card-class-accent:${classification.accent}">${escapeHtml(classification.text)}</span>`;
}
function intentEffectsDescription(effects: readonly ShipEffect[]): string {
  const descriptions: string[] = [];
  for (let index = 0; index < effects.length; index += 1) {
    const effect = effects[index]!;
    let count = 1;
    if (effect.kind === 'damage') {
      while (effects[index + count]?.kind === 'damage' && effects[index + count]?.amount === effect.amount) count += 1;
    }
    descriptions.push(effect.kind === 'shield'
      ? `restore up to ${effect.amount} shield`
      : effect.kind === 'damage' && count > 1 ? `deal ${effect.amount} damage per hit, ${count} hits` : effectText(effect));
    index += count - 1;
  }
  return descriptions.join(', then ');
}

function actorMeter(label: string, value: number, maximum: number, className: string): string {
  return `<p class="ship-meter ${className}">${label} <output>${value}/${maximum}</output></p>`;
}

function freshSeed(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0]!;
}

export function mountShipCombat(root: HTMLElement, scene: ShipScene): ShipGamePort {
  const seed = freshSeed();
  let state = createBattle(seed);
  let displayed = clone(state);
  let selectedUid: string | null = null;
  let selectedTargetId: string | null = null;
  let modal: Modal = null;
  let busy = false;
  let destroyed = false;
  let sequence = 0;
  let reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let message = 'Awaiting orders.';
  let restoreFocusKey: string | null = null;
  let drag: CardDrag | null = null;
  let suppressClickThrough = false;
  let acceptedDrag: CardDrag | null = null;
  let aimTargetId: string | null = null;

  root.className = 'ship-hud';
  root.innerHTML = '<main aria-label="Kestrel combat"></main>';
  const main = root.querySelector('main')!;

  function currentCard(): ShipCard | undefined {
    return selectedUid ? state.hand.find((card) => card.uid === selectedUid) : undefined;
  }

  function selectedDefinition(): ShipCardDefinition | undefined {
    return selectedUid ? previewCard(state, selectedUid) : undefined;
  }

  function rememberFocus(): string | null {
    const active = document.activeElement as HTMLElement | null;
    return active?.dataset.focusKey ?? null;
  }

  function focusKey(key: string | null): void {
    if (!key) return;
    requestAnimationFrame(() => {
      if (destroyed) return;
      const target = Array.from(main.querySelectorAll<HTMLElement>('[data-focus-key]'))
        .find((element) => element.dataset.focusKey === key);
      target?.focus();
    });
  }

  function canPlayHandCard(view: ShipBattleState, uid: string, definition: ShipCardDefinition): boolean {
    return !busy && !modal && view.phase === 'player'
      && definition.cost <= view.energy && legalTargets(view, uid).length > 0;
  }

  function cardVisuals(view: ShipBattleState): ShipCardVisual[] {
    const poses = shipHandPoses(view.hand.length);
    const visuals: ShipCardVisual[] = view.hand.map((card, index) => {
      const pose = poses[index]!;
      const definition = previewCard(view, card.uid) ?? cardDefinition(card.id, view.catalog);
      return {
        ...pose,
        uid: card.uid,
        definition,
        selected: card.uid === selectedUid,
        dimmed: !canPlayHandCard(view, card.uid, definition),
      };
    });
    if (modal?.type === 'detail') {
      const detailCard = modal.card;
      const definition = state.hand.some((card) => card.uid === detailCard.uid)
        ? (previewCard(state, modal.card.uid) ?? cardDefinition(modal.card.id, state.catalog))
        : cardDefinition(modal.card.id, state.catalog);
      visuals.push({
        ...DETAIL_POSE,
        uid: `detail:${modal.card.uid}`,
        definition,
        selected: false,
        dimmed: false,
        detail: true,
      });
    }
    return visuals;
  }

  function heldCardVisuals(view: ShipBattleState, active: CardDrag): ShipCardVisual[] {
    const visuals = cardVisuals(view);
    const index = visuals.findIndex((visual) => visual.uid === active.uid);
    if (index < 0) return visuals;
    const [held] = visuals.splice(index, 1);
    if (!held) return visuals;
    visuals.push({
      ...held,
      x: active.heldX,
      y: active.heldY,
      rotation: 0,
      selected: false,
      dimmed: false,
      held: true,
    });
    return visuals;
  }

  function handMarkup(view: ShipBattleState): string {
    const poses = shipHandPoses(view.hand.length);
    return view.hand.map((card, index) => {
      const pose = poses[index]!;
      const definition = previewCard(view, card.uid) ?? cardDefinition(card.id, view.catalog);
      const classification = cardClassification(definition);
      const selected = card.uid === selectedUid;
      const affordable = definition.cost <= view.energy;
      const playable = canPlayHandCard(view, card.uid, definition);
      const scale = selected ? SHIP_CARD_SELECTED_SCALE : 1;
      const width = pose.width * scale;
      const height = pose.height * scale;
      const y = pose.y - (selected ? SHIP_CARD_LIFT : 0);
      const style = `left:${pose.x - width / 2}px;top:${y - height / 2}px;width:${width}px;height:${height}px;transform:rotate(${pose.rotation}deg)`;
      const unavailable = !affordable ? ', unaffordable' : !playable ? ', currently unplayable' : '';
      return `<button class="ship-card-hit${selected ? ' selected' : ''}${playable ? ' draggable' : ''}" style="${style}" data-card="${escapeHtml(card.uid)}" data-focus-key="card:${escapeHtml(card.uid)}" aria-pressed="${selected}" aria-disabled="${busy}" ${busy ? 'disabled' : ''} aria-label="${escapeHtml(definition.title)}, ${escapeHtml(classification.ariaText)}, ${definition.cost} energy${unavailable}. ${escapeHtml(effectsText(definition))}"></button>`;
    }).join('');
  }

  function enemyMarkup(view: ShipBattleState): string {
    return view.enemies.map((enemy, index) => {
      const pose = enemyShipPose(index);
      const intent = nextIntent(enemy);
      const alive = enemy.hull > 0;
      const legal = selectedUid ? legalTargets(state, selectedUid).includes(enemy.id) : false;
      const selected = enemy.id === selectedTargetId;
      const forecast = intentEffectsDescription(intent.effects);
      const statusId = `enemy-status-${enemy.id}`;
      const status = alive
        ? `Recharge restores up to ${enemy.recharge} shield first. Next action, ${intent.title}: ${forecast}. Shield restoration is limited to ${enemy.maxShield} capacity.`
        : 'Destroyed. No further actions.';
      return `<section class="enemy-accessible sr-only" id="${escapeHtml(statusId)}" data-enemy-status="${escapeHtml(enemy.id)}" aria-label="${escapeHtml(enemy.name)} status">
        <h2>${escapeHtml(enemy.name)}</h2>
        <p>${escapeHtml(enemy.role)}. Hull <output data-enemy-hull>${enemy.hull}</output> of ${enemy.maxHull}. Shield <output data-enemy-shield>${enemy.shield}</output> of ${enemy.maxShield}.</p>
        <p>${escapeHtml(status)}</p>
      </section>
      <button class="enemy-target${legal ? ' legal' : ''}${selected ? ' selected' : ''}" style="left:${pose.x - pose.width / 2}px;top:${pose.y - pose.height / 2}px;width:${pose.width}px;height:${pose.height}px" data-target="${escapeHtml(enemy.id)}" data-focus-key="target:${escapeHtml(enemy.id)}" aria-describedby="${escapeHtml(statusId)}" aria-pressed="${selected}" ${(!alive || busy || !legal) ? 'disabled' : ''} aria-label="${selected ? 'Selected target: ' : 'Target '}${escapeHtml(enemy.name)}, ${enemy.hull} hull, ${enemy.shield} shield"></button>`;
    }).join('');
  }

  function selectionMarkup(view: ShipBattleState): string {
    const card = currentCard();
    if (!card) return `<section class="selection-console ink-plate"><div><b>Card console</b><span>Hand ${view.hand.length}</span></div><p>Selection —</p><p class="selection-target">Target —</p></section>`;
    const definition = selectedDefinition() ?? cardDefinition(card.id, state.catalog);
    const targets = legalTargets(state, card.uid);
    const affordable = definition.cost <= state.energy;
    const requiresEnemyChoice = definition.kind === 'attack' && targets.length > 1;
    const automaticTarget = targets.length === 1 ? targets[0]! : null;
    const targetId = selectedTargetId ?? automaticTarget;
    const canPlay = canPlayHandCard(view, card.uid, definition) && Boolean(targetId && targets.includes(targetId));
    const targetName = targetId === state.player.id ? state.player.name : state.enemies.find((enemy) => enemy.id === targetId)?.name;
    return `<section class="selection-console ink-plate" aria-label="Selected card">
      <div><b>${escapeHtml(definition.title)}</b><span>${definition.cost} energy</span></div>
      ${classificationMarkup(definition)}
      <p>${escapeHtml(effectsText(definition))}${definition.exhaust ? ' · Exhaust' : ''}</p>
      <p class="selection-target">${requiresEnemyChoice && !selectedTargetId ? 'Choose an enemy target.' : `Target: ${escapeHtml(targetName ?? 'none')}`}</p>
      ${!affordable ? '<p class="warning">Not enough energy. Inspection is still available.</p>' : ''}
      <div class="selection-actions"><button data-action="inspect" data-focus-key="inspect">Inspect</button><button class="primary" data-action="play" data-focus-key="play" ${canPlay ? '' : 'disabled'}>Play</button></div>
    </section>`;
  }

  function pileButton(name: PileName, count: number, x: number, y: number): string {
    const label = name[0]!.toUpperCase() + name.slice(1);
    return `<button class="pile-control pile-${name}" style="left:${x - 72}px;top:${y - 96}px" data-pile="${name}" data-focus-key="pile:${name}" aria-label="${label} pile, ${count} cards" ${busy ? 'disabled' : ''}><b aria-hidden="true">${count}</b></button>`;
  }

  function modalMarkup(): string {
    if (!modal) return '';
    if (modal.type === 'detail') {
      const detailCard = modal.card;
      const definition = state.hand.some((card) => card.uid === detailCard.uid)
        ? (previewCard(state, modal.card.uid) ?? cardDefinition(modal.card.id, state.catalog))
        : cardDefinition(modal.card.id, state.catalog);
      const detailWidth = DETAIL_POSE.width * SHIP_CARD_DETAIL_SCALE;
      const detailHeight = DETAIL_POSE.height * SHIP_CARD_DETAIL_SCALE;
      const guardStyle = `left:${DETAIL_POSE.x - detailWidth / 2}px;top:${DETAIL_POSE.y - detailHeight / 2}px;width:${detailWidth}px;height:${detailHeight}px;transform:rotate(${DETAIL_POSE.rotation}deg)`;
      return `<div class="ship-modal detail-modal" data-modal-backdrop="true"><div class="detail-card-guard" style="${guardStyle}" aria-hidden="true"></div><section role="dialog" aria-modal="true" aria-labelledby="detail-title" class="detail-copy ink-plate"><p class="eyebrow">Physical card detail</p><h2 id="detail-title">${escapeHtml(definition.title)}</h2><p class="detail-cost">${definition.cost} energy${definition.exhaust ? ' · Exhausts' : ''}</p>${classificationMarkup(definition)}<ol>${definition.effects.map((effect) => `<li>${escapeHtml(effectText(effect))}</li>`).join('')}</ol><blockquote>${escapeHtml(definition.flavor)}</blockquote><button data-action="close-modal" data-focus-key="modal-close">Close</button></section></div>`;
    }
    if (modal.type === 'pile') {
      const cards = state[modal.pile];
      const title = modal.pile[0]!.toUpperCase() + modal.pile.slice(1);
      const groups = new Map<string, { card: ShipCard; count: number }>();
      for (const card of cards) {
        const group = groups.get(card.id);
        if (group) group.count += 1;
        else groups.set(card.id, { card, count: 1 });
      }
      const body = modal.pile === 'draw'
        ? `<p class="hidden-pile">${cards.length} cards remain. Draw order and identities are hidden.</p>`
        : cards.length === 0
          ? '<p>This pile is empty.</p>'
          : `<ul class="pile-list">${Array.from(groups.values()).map(({ card, count }) => {
            const definition = cardDefinition(card.id, state.catalog);
            return `<li><button data-pile-card="${escapeHtml(card.uid)}" data-focus-key="pile-card:${escapeHtml(card.uid)}"><b>${escapeHtml(definition.title)}${classificationMarkup(definition)}</b><span class="pile-card-action">×${count} · Inspect</span></button></li>`;
          }).join('')}</ul>`;
      return `<div class="ship-modal" data-modal-backdrop="true"><section role="dialog" aria-modal="true" aria-labelledby="pile-title" class="ship-dialog ink-plate"><p class="eyebrow">Card bay</p><h2 id="pile-title">${escapeHtml(title)} pile</h2>${body}<button data-action="close-modal" data-focus-key="modal-close">Close</button></section></div>`;
    }
    if (modal.type === 'help') {
      const intentLegend = '<li>Each enemy’s bottom readout shows its next action: RCH is shield recharge before the action; DMG is damage per hit (× is hit count); SHD is shield restoration. Shield gains are capped by capacity.</li>';
      const cardLegend = '<li>Frame colour shows rarity: Common steel/ivory, Uncommon blue, Rare gold; Unrated research uses a neutral frame. The footer emblem and short label show department: Weapons crosshair, Engineering gear, Command radar. These classifications do not change energy costs or draw odds.</li>';
      return `<div class="ship-modal" data-modal-backdrop="true"><section role="dialog" aria-modal="true" aria-labelledby="help-title" class="ship-dialog ink-plate"><p class="eyebrow">Bridge manual</p><h2 id="help-title">Combat rules</h2><ul class="rules"><li>Tap a card to select it, then choose a target and Play. Affordable cards can also be dragged: attacks go onto a living enemy; systems and crew go into the teal self zone or onto Play.</li><li>The cyan reticle previews the nearest legal enemy while dragging; release over that ship’s actual target area to fire.</li><li>Cards resolve immediately. Attacks need a living target; with several enemies, choose one explicitly.</li>${cardLegend}<li>End Turn discards your hand. Living enemies recharge, then act left to right. If Kestrel survives, draw five cards and reset energy to 3.</li>${intentLegend}<li>Damage drains shield before hull. Shields recharge only up to their printed maximum.</li><li>Adaptive Coils adds 2 shield to the first shield card you play each turn.</li><li>Destroyed ships stop acting. Reduce every enemy hull to zero to win.</li><li>On iPad, use Share → Add to Home Screen to install. Offline play is available after the first online production load; reloading starts a fresh battle.</li></ul><button data-action="close-modal" data-focus-key="modal-close">Return</button></section></div>`;
    }
    if (modal.type === 'menu') {
      return `<div class="ship-modal" data-modal-backdrop="true"><section role="dialog" aria-modal="true" aria-labelledby="menu-title" class="ship-dialog menu-dialog ink-plate"><p class="eyebrow">Command menu</p><h2 id="menu-title">Battle paused</h2><button class="primary" data-action="close-modal" data-focus-key="menu-resume">Resume</button><button data-action="help" data-focus-key="menu-help">Combat rules</button><label class="motion-toggle"><span>Reduced motion</span><input type="checkbox" data-action="motion" ${reducedMotion ? 'checked' : ''}></label><button data-action="confirm-restart" data-focus-key="menu-restart">Restart battle</button></section></div>`;
    }
    const verb = modal.action === 'replay' ? 'Replay' : 'Restart';
    return `<div class="ship-modal" data-modal-backdrop="true"><section role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-copy" class="ship-dialog confirm-dialog ink-plate"><p class="eyebrow">Confirm command</p><h2 id="confirm-title">${verb} battle?</h2><p id="confirm-copy">The current battle state will be lost. The same combat seed will be used.</p><div><button class="primary" data-action="cancel-confirm" data-focus-key="confirm-cancel">Cancel</button><button data-action="restart" data-focus-key="confirm-accept">${verb}</button></div></section></div>`;
  }

  function outcomeMarkup(view: ShipBattleState): string {
    if (view.phase === 'player') return '';
    const victory = view.phase === 'victory';
    return `<section class="battle-outcome ${view.phase}" aria-labelledby="outcome-title"><p class="eyebrow">Battle report</p><h1 id="outcome-title">${victory ? 'Sector secured' : 'Kestrel lost'}</h1><p>${victory ? 'All hostile ships have been disabled.' : 'The Kestrel’s hull has failed.'}</p><button class="primary" data-action="confirm-replay" data-focus-key="replay">Replay battle</button></section>`;
  }

  function render(requestedFocus?: string | null): void {
    if (destroyed) return;
    const priorFocus = requestedFocus === undefined ? rememberFocus() : requestedFocus;
    const view = busy ? displayed : state;
    const player = view.player;
    main.setAttribute('aria-busy', String(busy));
    main.classList.toggle('detail-open', modal?.type === 'detail');
    main.innerHTML = `<header class="bridge-heading"><span>KESTREL // CONTACT</span><b>TURN <output data-turn>${view.turn}</output></b><button data-action="help" data-focus-key="help" ${busy ? 'disabled' : ''}>Rules</button><button data-action="menu" data-focus-key="menu" ${busy ? 'disabled' : ''}>Menu</button></header>
      <section class="player-console sr-only" aria-label="Kestrel status"><p>Player vessel</p><h1>${escapeHtml(player.name)}</h1>${actorMeter('Hull', player.hull, player.maxHull, 'hull')}${actorMeter('Shield', player.shield, player.maxShield, 'shield')}<div class="console-facts"><span>Recharge <b>${player.recharge}</b></span><span>Energy <b data-energy>${view.energy} · ${view.maxEnergy} each turn</b></span></div><p class="trait"><b>Adaptive Coils</b><span data-coils>${view.coilsAvailable ? 'Ready · first shield card +2' : 'Spent this turn'}</span></p></section>
      <div class="enemy-layer">${enemyMarkup(view)}</div>
      <div class="viewscreen-drop-zone" style="left:${SHIP_SCREEN.x}px;top:${SHIP_SCREEN.y}px;width:${SHIP_SCREEN.width}px;height:${SHIP_SCREEN.height}px" aria-hidden="true"></div>
      <div class="self-drop-zone" style="left:${SHIP_SELF_DROP.x}px;top:${SHIP_SELF_DROP.y}px;width:${SHIP_SELF_DROP.width}px;height:${SHIP_SELF_DROP.height}px" aria-hidden="true"><b>KESTREL SYSTEMS</b><span>Drop system or crew card</span></div>
      <div class="hand-layer" aria-label="Hand">${handMarkup(view)}</div>
      ${selectionMarkup(view)}
      <div class="pile-layer">${pileButton('draw', view.draw.length, SHIP_PILES.draw.x, SHIP_PILES.draw.y)}${pileButton('discard', view.discard.length, SHIP_PILES.discard.x, SHIP_PILES.discard.y)}${pileButton('exhaust', view.exhaust.length, SHIP_PILES.exhaust.x, SHIP_PILES.exhaust.y)}</div>
      <button class="end-turn" data-action="end-turn" data-focus-key="end-turn" ${(busy || view.phase !== 'player') ? 'disabled' : ''}>End Turn <kbd>E</kbd></button>
      <p class="combat-message" role="status" aria-live="polite">${escapeHtml(message)}</p>
      ${outcomeMarkup(view)}${modalMarkup()}`;
    if (modal?.type === 'detail') {
      for (const child of main.children) {
        if (!(child instanceof HTMLElement) || child.classList.contains('detail-modal')) continue;
        child.inert = true;
        child.setAttribute('aria-hidden', 'true');
      }
    }
    scene.setState(view);
    aimTargetId = null;
    scene.setCards(acceptedDrag ? heldCardVisuals(view, acceptedDrag) : cardVisuals(view), { reducedMotion });
    focusKey(priorFocus);
  }

  function designPoint(clientX: number, clientY: number): { x: number; y: number } {
    const bounds = root.getBoundingClientRect();
    return {
      x: (clientX - bounds.left) * SHIP_DESIGN.width / Math.max(1, bounds.width),
      y: (clientY - bounds.top) * SHIP_DESIGN.height / Math.max(1, bounds.height),
    };
  }
  function setAimTarget(targetId: string | null): void {
    if (aimTargetId === targetId) return;
    aimTargetId = targetId;
    scene.setAimTarget(targetId);
  }

  function nearestAimTarget(uid: string, point: { x: number; y: number }): string | null {
    const legal = legalTargets(state, uid);
    let nearestId: string | null = null;
    let nearestDistanceSquared = Number.POSITIVE_INFINITY;
    const maximumDistanceSquared = AIM_PREVIEW_RADIUS * AIM_PREVIEW_RADIUS;
    for (let index = 0; index < state.enemies.length; index += 1) {
      const enemy = state.enemies[index]!;
      if (enemy.hull <= 0 || !legal.includes(enemy.id)) continue;
      const pose = enemyShipPose(index);
      const distanceSquared = (point.x - pose.x) ** 2 + (point.y - pose.y) ** 2;
      if (distanceSquared <= maximumDistanceSquared && distanceSquared < nearestDistanceSquared) {
        nearestDistanceSquared = distanceSquared;
        nearestId = enemy.id;
      }
    }
    return nearestId;
  }

  function syncEnemyDropSurfaces(uid: string | null): void {
    const legal = uid ? legalTargets(state, uid) : [];
    for (const target of main.querySelectorAll<HTMLButtonElement>('.enemy-target[data-target]')) {
      const enemy = state.enemies.find((candidate) => candidate.id === target.dataset.target);
      const isLegal = Boolean(enemy && enemy.hull > 0 && legal.includes(enemy.id));
      target.classList.toggle('legal', isLegal);
      target.disabled = busy || !isLegal;
    }
  }

  function restoreDraggedCard(releaseCapture = true): void {
    setAimTarget(null);
    const active = drag;
    if (!active) return;
    drag = null;
    main.classList.remove('card-dragging', 'dragging-self', 'dragging-attack');
    if (releaseCapture && main.hasPointerCapture(active.pointerId)) main.releasePointerCapture(active.pointerId);
    syncEnemyDropSurfaces(selectedUid);
    if (!destroyed) scene.setCards(cardVisuals(busy ? displayed : state), { reducedMotion });
  }

  function retainDraggedCardForPlayback(active: CardDrag): void {
    setAimTarget(null);
    drag = null;
    acceptedDrag = active;
    main.classList.remove('card-dragging', 'dragging-self', 'dragging-attack');
    main.classList.add('card-drop-accepted');
    if (main.hasPointerCapture(active.pointerId)) main.releasePointerCapture(active.pointerId);
    syncEnemyDropSurfaces(selectedUid);
  }

  function clearAcceptedDrag(): void {
    setAimTarget(null);
    acceptedDrag = null;
    main.classList.remove('card-drop-accepted');
  }

  function dragDropTarget(active: CardDrag, clientX: number, clientY: number): string | null {
    const targets = legalTargets(state, active.uid);
    const hit = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-target], [data-action="play"]');
    if (targets.includes(state.player.id)) {
      const point = designPoint(clientX, clientY);
      const inSelfZone = point.x >= SHIP_SELF_DROP.x
        && point.x <= SHIP_SELF_DROP.x + SHIP_SELF_DROP.width
        && point.y >= SHIP_SELF_DROP.y
        && point.y <= SHIP_SELF_DROP.y + SHIP_SELF_DROP.height;
      const inViewscreen = point.x >= SHIP_SCREEN.x
        && point.x <= SHIP_SCREEN.x + SHIP_SCREEN.width
        && point.y >= SHIP_SCREEN.y
        && point.y <= SHIP_SCREEN.y + SHIP_SCREEN.height;
      return inSelfZone || inViewscreen || hit?.dataset.action === 'play' ? state.player.id : null;
    }
    const hitTargetId = hit?.dataset.target;
    const enemy = state.enemies.find((candidate) => candidate.id === hitTargetId);
    return enemy && enemy.hull > 0 && targets.includes(enemy.id) ? enemy.id : null;
  }

  function pointerdown(event: PointerEvent): void {
    if (drag) {
      if (event.pointerId !== drag.pointerId) restoreDraggedCard();
      return;
    }
    if (!event.isPrimary || event.button !== 0 || destroyed || busy || modal || state.phase !== 'player') return;
    setAimTarget(null);
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('.ship-card-hit.draggable[data-card]');
    if (!target || !main.contains(target) || !target.dataset.card) return;
    const card = state.hand.find((candidate) => candidate.uid === target.dataset.card);
    if (!card) return;
    const definition = previewCard(state, card.uid) ?? cardDefinition(card.id, state.catalog);
    if (!canPlayHandCard(state, card.uid, definition)) return;
    const point = designPoint(event.clientX, event.clientY);
    const bounds = target.getBoundingClientRect();
    const center = designPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    drag = {
      pointerId: event.pointerId,
      uid: card.uid,
      startClientX: event.clientX,
      startClientY: event.clientY,
      grabOffsetX: point.x - center.x,
      grabOffsetY: point.y - center.y,
      started: false,
      heldX: center.x,
      heldY: center.y,
    };
    main.setPointerCapture(event.pointerId);
  }

  function pointermove(event: PointerEvent): void {
    const active = drag;
    if (!active || event.pointerId !== active.pointerId) return;
    const distance = Math.hypot(event.clientX - active.startClientX, event.clientY - active.startClientY);
    if (!active.started && distance < DRAG_THRESHOLD_CSS_PX) return;
    const definition = previewCard(state, active.uid);
    if (!active.started) {
      active.started = true;
      main.classList.add('card-dragging', definition?.kind === 'attack' ? 'dragging-attack' : 'dragging-self');
      syncEnemyDropSurfaces(active.uid);
    }
    const point = designPoint(event.clientX, event.clientY);
    active.heldX = point.x - active.grabOffsetX;
    active.heldY = point.y - active.grabOffsetY;
    setAimTarget(definition?.kind === 'attack' ? nearestAimTarget(active.uid, point) : null);
    scene.setCards(heldCardVisuals(state, active), { reducedMotion });
    event.preventDefault();
  }

  function pointerup(event: PointerEvent): void {
    const active = drag;
    if (!active || event.pointerId !== active.pointerId) return;
    const targetId = active.started ? dragDropTarget(active, event.clientX, event.clientY) : null;
    const wasDragged = active.started;
    suppressClickThrough = true;
    setTimeout(() => { suppressClickThrough = false; }, 0);
    if (!wasDragged) {
      restoreDraggedCard();
      selectCard(active.uid);
      return;
    }
    event.preventDefault();
    if (!targetId) {
      restoreDraggedCard();
      message = 'Card returned to hand. Drop it on a highlighted legal destination.';
      const status = main.querySelector<HTMLElement>('.combat-message');
      if (status) status.textContent = message;
      return;
    }
    retainDraggedCardForPlayback(active);
    selectedUid = active.uid;
    selectedTargetId = targetId;
    void command('play');
  }

  function pointercancel(event: PointerEvent): void {
    if (drag?.pointerId === event.pointerId) restoreDraggedCard();
  }

  function lostpointercapture(event: PointerEvent): void {
    if (drag?.pointerId === event.pointerId) restoreDraggedCard(false);
  }

  function secondaryPointerdown(event: PointerEvent): void {
    if (!drag || event.pointerId === drag.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    restoreDraggedCard();
  }

  function cancelDragForViewportChange(): void {
    restoreDraggedCard();
  }

  function visibilitychange(): void {
    if (document.visibilityState !== 'visible') restoreDraggedCard();
  }

  function updateDisplayedActor(event: ShipBattleEvent): void {
    const recipientId = event.targetId ?? event.actorId;
    const actor = displayed.player.id === recipientId
      ? displayed.player
      : displayed.enemies.find((enemy) => enemy.id === recipientId);
    const adoptsActorSnapshot = event.type === 'damage' || event.type === 'shield'
      || event.type === 'turn' || event.type === 'victory' || event.type === 'defeat';
    if (actor && adoptsActorSnapshot) {
      if (event.hull !== undefined) actor.hull = event.hull;
      if (event.shield !== undefined) actor.shield = event.shield;
    }
    if (event.type === 'card' && event.card) {
      displayed.hand = displayed.hand.filter((card) => card.uid !== event.card!.uid);
      if (event.definition?.effects.some((effect) => effect.kind === 'shield')) displayed.coilsAvailable = false;
    } else if ((event.type === 'discard' || event.type === 'exhaust') && event.card) {
      const movedUid = event.card.uid;
      displayed.hand = displayed.hand.filter((card) => card.uid !== movedUid);
      const destination = event.type === 'discard' ? displayed.discard : displayed.exhaust;
      if (!destination.some((card) => card.uid === movedUid)) destination.push({ ...event.card });
    } else if (event.type === 'recycle') {
      displayed.draw.push(...displayed.discard.splice(0));
    } else if (event.type === 'draw' && event.card) {
      const drawnUid = event.card.uid;
      const index = displayed.draw.findIndex((card) => card.uid === drawnUid);
      const [drawn] = index >= 0 ? displayed.draw.splice(index, 1) : [];
      if (drawn && !displayed.hand.some((card) => card.uid === drawn.uid)) displayed.hand.push(drawn);
    }
    if (event.energy !== undefined) displayed.energy = event.energy;
    if (event.turn !== undefined) displayed.turn = event.turn;
    if (event.type === 'turn') displayed.coilsAvailable = true;
    if (event.type === 'victory') displayed.phase = 'victory';
    if (event.type === 'defeat') displayed.phase = 'defeat';
    message = event.text;
    scene.setState(displayed);
    aimTargetId = null;
    for (const pile of ['draw', 'discard', 'exhaust'] as const) {
      const button = main.querySelector<HTMLButtonElement>(`.pile-${pile}`);
      const count = button?.querySelector<HTMLElement>('b');
      if (count) count.textContent = String(displayed[pile].length);
      button?.setAttribute('aria-label', `${pile[0]!.toUpperCase() + pile.slice(1)} pile, ${displayed[pile].length} cards`);
    }
    if (event.type === 'card' || event.type === 'draw' || event.type === 'discard' || event.type === 'exhaust') {
      const hand = main.querySelector<HTMLElement>('.hand-layer');
      if (hand) hand.innerHTML = handMarkup(displayed);
      const console = main.querySelector<HTMLElement>('.selection-console');
      if (console) console.outerHTML = selectionMarkup(displayed);
    }
    const status = main.querySelector<HTMLElement>('.combat-message');
    if (status) status.textContent = message;
    const turn = main.querySelector<HTMLOutputElement>('[data-turn]');
    if (turn) turn.value = String(displayed.turn);
    const energy = main.querySelector<HTMLElement>('[data-energy]');
    if (energy) energy.textContent = `${displayed.energy} · ${displayed.maxEnergy} each turn`;
    const coils = main.querySelector<HTMLElement>('[data-coils]');
    if (coils) coils.textContent = displayed.coilsAvailable ? 'Ready · first shield card +2' : 'Spent this turn';
    const playerSection = main.querySelector<HTMLElement>('.player-console');
    if (playerSection) {
      const meters = playerSection.querySelectorAll<HTMLElement>('.ship-meter');
      for (const meter of meters) {
        const isHull = meter.classList.contains('hull');
        const value = isHull ? displayed.player.hull : displayed.player.shield;
        const maximum = isHull ? displayed.player.maxHull : displayed.player.maxShield;
        const output = meter.querySelector('output');
        if (output) output.textContent = `${value}/${maximum}`;
      }
    }
    for (const enemy of displayed.enemies) {
      const section = main.querySelector<HTMLElement>(`[data-enemy-status="${CSS.escape(enemy.id)}"]`);
      const hull = section?.querySelector<HTMLOutputElement>('[data-enemy-hull]');
      const shield = section?.querySelector<HTMLOutputElement>('[data-enemy-shield]');
      if (hull) hull.value = String(enemy.hull);
      if (shield) shield.value = String(enemy.shield);
    }
  }

  async function command(type: 'play' | 'end-turn'): Promise<void> {
    setAimTarget(null);
    if (destroyed || busy || modal || state.phase !== 'player') return;
    const card = currentCard();
    const definition = selectedDefinition();
    let result: ShipCommandResult;
    if (type === 'play') {
      if (!card || !definition) {
        clearAcceptedDrag();
        render();
        return;
      }
      const targets = legalTargets(state, card.uid);
      const targetId = selectedTargetId ?? (targets.length === 1 ? targets[0] : undefined);
      if (!targetId) {
        clearAcceptedDrag();
        message = 'Choose a target before playing this card.';
        render('play');
        return;
      }
      result = dispatchBattle(state, { type: 'play', uid: card.uid, targetId });
    } else {
      result = dispatchBattle(state, { type: 'end-turn' });
    }
    if (!result.ok) {
      clearAcceptedDrag();
      message = result.error;
      render();
      return;
    }
    const token = ++sequence;
    busy = true;
    selectedUid = null;
    selectedTargetId = null;
    message = result.events[0]?.text ?? 'Resolving action…';
    render(null);
    try {
      await scene.present(result.events, state, {
        reducedMotion,
        onEvent: (event) => {
          if (!destroyed && token === sequence) updateDisplayedActor(event);
        },
      });
    } finally {
      if (destroyed || token !== sequence) return;
      clearAcceptedDrag();
      displayed = clone(state);
      busy = false;
      message = state.phase === 'player'
        ? (type === 'end-turn' ? `Turn ${state.turn}. Energy and hand refreshed.` : 'Action resolved.')
        : (state.phase === 'victory' ? 'Victory. All hostile ships are disabled.' : 'Defeat. The Kestrel has been destroyed.');
      render(state.phase === 'player' ? 'end-turn' : 'replay');
    }
  }

  async function dealOpeningHand(): Promise<void> {
    const token = ++sequence;
    // createBattle already owns this deal. Rewind only the displayed snapshot,
    // never the canonical deck, and replay its known opening UIDs in order.
    displayed = clone(state);
    const opening = displayed.hand.splice(0);
    displayed.draw.unshift(...opening);
    const events: ShipBattleEvent[] = opening.map((card) => ({
      type: 'draw',
      actorId: displayed.player.id,
      targetId: displayed.player.id,
      card: { ...card },
      amount: 1,
      text: `${cardDefinition(card.id, displayed.catalog).title} was drawn.`,
    }));
    busy = true;
    message = 'Dealing opening hand…';
    render(null);
    try {
      await scene.present(events, state, {
        reducedMotion,
        onEvent: (event) => {
          if (!destroyed && token === sequence) updateDisplayedActor(event);
        },
      });
    } finally {
      if (destroyed || token !== sequence) return;
      displayed = clone(state);
      busy = false;
      message = 'Awaiting orders.';
      render('end-turn');
    }
  }

  function selectCard(uid: string): void {
    if (busy || modal || state.phase !== 'player') return;
    const card = state.hand.find((candidate) => candidate.uid === uid);
    if (!card) return;
    selectedUid = selectedUid === uid ? null : uid;
    selectedTargetId = null;
    if (selectedUid) {
      const targets = legalTargets(state, selectedUid);
      if (targets.length === 1) selectedTargetId = targets[0]!;
      const definition = previewCard(state, selectedUid) ?? cardDefinition(card.id, state.catalog);
      message = definition.cost > state.energy
        ? `${definition.title} costs ${definition.cost}; it can be inspected but not played.`
        : `${definition.title} selected.`;
    } else {
      message = 'Card selection cleared.';
    }
    render(`card:${uid}`);
  }

  function openModal(next: Exclude<Modal, null>, focus: string): void {
    if (busy) return;
    restoreDraggedCard();
    if (!(next.type === 'help' && next.parentMenu)) restoreFocusKey = next.origin;
    modal = next;
    render(focus);
  }

  function closeModal(): void {
    if (!modal) return;
    if (modal.type === 'detail' && modal.parentPile) {
      const { card, parentPile } = modal;
      modal = { type: 'pile', pile: parentPile, origin: `pile:${parentPile}` };
      render(`pile-card:${card.uid}`);
      return;
    }
    if (modal.type === 'help' && modal.parentMenu) {
      modal = { type: 'menu', origin: 'menu' };
      render('menu-help');
      return;
    }
    if (modal.type === 'confirm' && modal.action === 'restart') {
      modal = { type: 'menu', origin: 'menu' };
      render('menu-restart');
      return;
    }
    const origin = restoreFocusKey ?? modal.origin;
    modal = null;
    restoreFocusKey = null;
    render(origin);
  }

  function restartBattle(): void {
    restoreDraggedCard();
    clearAcceptedDrag();
    sequence += 1;
    scene.cancel();
    state = createBattle(seed);
    busy = true;
    selectedUid = null;
    selectedTargetId = null;
    modal = null;
    restoreFocusKey = null;
    void dealOpeningHand();
  }

  function click(event: MouseEvent): void {
    if (drag) {
      event.preventDefault();
      event.stopPropagation();
      restoreDraggedCard();
      return;
    }
    if (suppressClickThrough) {
      suppressClickThrough = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const target = (event.target as HTMLElement).closest<HTMLElement>('button, input, [data-modal-backdrop]');
    if (!target || !main.contains(target)) return;
    if (target.dataset.modalBackdrop === 'true' && event.target === target) {
      closeModal();
      return;
    }
    if (target instanceof HTMLButtonElement && target.disabled) return;
    const action = target.dataset.action;
    if (target.dataset.card) selectCard(target.dataset.card);
    else if (target.dataset.target && selectedUid && !busy && !modal) {
      if (legalTargets(state, selectedUid).includes(target.dataset.target)) {
        selectedTargetId = target.dataset.target;
        message = `${state.enemies.find((enemy) => enemy.id === selectedTargetId)?.name ?? 'Enemy'} targeted.`;
        render(`target:${selectedTargetId}`);
      }
    } else if (target.dataset.pile) {
      const pile = target.dataset.pile as PileName;
      openModal({ type: 'pile', pile, origin: `pile:${pile}` }, 'modal-close');
    } else if (target.dataset.pileCard && modal?.type === 'pile') {
      const card = state[modal.pile].find((candidate) => candidate.uid === target.dataset.pileCard);
      if (card) {
        const origin = `pile:${modal.pile}`;
        modal = { type: 'detail', card, origin, parentPile: modal.pile };
        restoreFocusKey = origin;
        render('modal-close');
      }
    } else if (action === 'play') void command('play');
    else if (action === 'end-turn') void command('end-turn');
    else if (action === 'inspect') {
      const card = currentCard();
      if (card) openModal({ type: 'detail', card, origin: 'inspect' }, 'modal-close');
    } else if (action === 'help') openModal({ type: 'help', origin: target.dataset.focusKey ?? 'help', parentMenu: modal?.type === 'menu' }, 'modal-close');
    else if (action === 'menu') openModal({ type: 'menu', origin: 'menu' }, 'menu-resume');
    else if (action === 'close-modal' || action === 'cancel-confirm') closeModal();
    else if (action === 'confirm-restart') {
      modal = { type: 'confirm', action: 'restart', origin: 'menu-restart' };
      render('confirm-cancel');
    } else if (action === 'confirm-replay') openModal({ type: 'confirm', action: 'replay', origin: 'replay' }, 'confirm-cancel');
    else if (action === 'restart') restartBattle();
  }

  function change(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.dataset.action !== 'motion') return;
    reducedMotion = input.checked;
    root.classList.toggle('reduced-motion', reducedMotion);
    scene.setCards(cardVisuals(busy ? displayed : state), { reducedMotion });
  }

  function keydown(event: KeyboardEvent): void {
    if (destroyed) return;
    if (drag) {
      event.preventDefault();
      if (event.key === 'Escape') restoreDraggedCard();
      return;
    }
    const modified = event.ctrlKey || event.metaKey || event.altKey;
    if (modified) {
      if (event.key === 'Enter' || event.key === ' ') event.preventDefault();
      return;
    }
    if (event.repeat && (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape')) {
      event.preventDefault();
      return;
    }
    const eventTarget = event.target;
    const editable = eventTarget instanceof HTMLInputElement
      || eventTarget instanceof HTMLTextAreaElement
      || eventTarget instanceof HTMLSelectElement
      || (eventTarget instanceof HTMLElement && eventTarget.isContentEditable);
    if (modal) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeModal();
        return;
      }
      if (event.key === 'Tab') {
        const focusable = Array.from(main.querySelectorAll<HTMLElement>('.ship-modal button:not(:disabled), .ship-modal input:not(:disabled)'));
        if (!focusable.length) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        const active = document.activeElement as HTMLElement | null;
        if (!active || !focusable.includes(active)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
          return;
        }
        if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
      return;
    }
    if (busy || editable) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      openModal({ type: 'menu', origin: rememberFocus() ?? 'menu' }, 'menu-resume');
    } else if (!event.repeat && event.key.toLowerCase() === 'e') {
      event.preventDefault();
      void command('end-turn');
    } else if (!event.repeat && event.key.toLowerCase() === 'i' && currentCard()) {
      event.preventDefault();
      const card = currentCard()!;
      openModal({ type: 'detail', card, origin: rememberFocus() ?? `card:${card.uid}` }, 'modal-close');
    }
  }

  main.addEventListener('click', click);
  main.addEventListener('change', change);
  main.addEventListener('pointerdown', pointerdown);
  main.addEventListener('pointermove', pointermove);
  main.addEventListener('pointerup', pointerup);
  main.addEventListener('pointercancel', pointercancel);
  main.addEventListener('lostpointercapture', lostpointercapture);
  document.addEventListener('keydown', keydown);
  document.addEventListener('pointerdown', secondaryPointerdown, true);
  document.addEventListener('visibilitychange', visibilitychange);
  window.addEventListener('blur', cancelDragForViewportChange);
  window.addEventListener('resize', cancelDragForViewportChange);
  window.visualViewport?.addEventListener('resize', cancelDragForViewportChange);
  root.classList.toggle('reduced-motion', reducedMotion);

  const debugGetter = () => ({
    seed,
    state: clone(state),
    busy,
    selected: { cardUid: selectedUid, targetId: selectedTargetId },
    modal: modal ? clone(modal) : null,
  });

  Object.defineProperty(window, '__SHIP__', {
    configurable: true,
    enumerable: false,
    get: debugGetter,
  });

  void dealOpeningHand();

  return {
    destroy(): void {
      if (destroyed) return;
      restoreDraggedCard();
      clearAcceptedDrag();
      destroyed = true;
      sequence += 1;
      scene.cancel();
      main.removeEventListener('click', click);
      main.removeEventListener('change', change);
      main.removeEventListener('pointerdown', pointerdown);
      main.removeEventListener('pointermove', pointermove);
      main.removeEventListener('pointerup', pointerup);
      main.removeEventListener('pointercancel', pointercancel);
      main.removeEventListener('lostpointercapture', lostpointercapture);
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('pointerdown', secondaryPointerdown, true);
      document.removeEventListener('visibilitychange', visibilitychange);
      window.removeEventListener('blur', cancelDragForViewportChange);
      window.removeEventListener('resize', cancelDragForViewportChange);
      window.visualViewport?.removeEventListener('resize', cancelDragForViewportChange);
      const debugWindow = window as DebugWindow;
      const descriptor = Object.getOwnPropertyDescriptor(debugWindow, '__SHIP__');
      if (descriptor?.configurable && descriptor.get === debugGetter) delete debugWindow.__SHIP__;
      root.replaceChildren();
      root.className = '';
    },
  };
}

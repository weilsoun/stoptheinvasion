import { availableEnergy, createCombat, moveCard, queueCard, removeCard, resolveTurn, retargetCard } from './game/combat';
import { CARDS } from './game/content';
import type { ActorId, CardInstance, PlayerAction } from './game/types';
import { CARD_TARGET_GAP, CARD_TARGET_Y, type CardVisual, type ScenePort } from './view/types';

type Selection = { kind: 'hand'; uid: string } | { kind: 'queue'; slot: number } | null;
type PendingPlacement = { uid: string; target: ActorId; x: number; y: number };
type Drag =
  | { kind: 'hand'; uid: string; pointerId: number; startX: number; startY: number; x: number; y: number; moved: boolean; capture: HTMLElement }
  | { kind: 'queue'; slot: number; pointerId: number; startX: number; startY: number; x: number; y: number; moved: boolean; capture: HTMLElement };
type Mode = 'planning' | 'resolving' | 'ended';

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 1080;
const LOG_LIMIT = 7;
const TIMELINE_LEFT = 365;
const TIMELINE_WIDTH = 1190;
const TIMELINE_GAP = 9;
const SLOT_COUNT = 6;
const SLOT_WIDTH = (TIMELINE_WIDTH - TIMELINE_GAP * (SLOT_COUNT - 1)) / SLOT_COUNT;
const QUEUE_CARD_WIDTH = 82;
const QUEUE_CARD_HEIGHT = 115;
const QUEUE_CARD_Y = 578;
const PREVIEW = { x: 1600, y: 755, width: 220, height: 308 };
const ACTOR_CENTERS: Record<ActorId, { x: number; y: number }> = { guard: { x: 410, y: 400 }, bob: { x: 1500, y: 400 } };
const escapeHtml = (value: string | number) => String(value).replace(/[&<>'"]/g, (character) => HTML_ESCAPES[character]);

function effectText(effects: { kind: string; amount: number }[]): string {
  return effects.map(({ kind, amount }) => `${amount} ${kind}`).join(' / ');
}

function cardLayout(hand: CardInstance[]): Map<string, CardVisual> {
  const count = hand.length;
  const width = count > 6 ? 148 : 172;
  const height = Math.round(width * 1.4);
  const gap = count < 2 ? 0 : Math.min(width - 18, 1040 / (count - 1));
  const span = gap * Math.max(0, count - 1);
  const left = 960 - span / 2 - width / 2;
  const middle = (count - 1) / 2;
  return new Map(hand.map((card, index) => {
    const offset = index - middle;
    return [card.uid, {
      uid: card.uid,
      definition: CARDS[card.definitionId],
      x: Math.round(left + index * gap),
      y: Math.round(812 + Math.abs(offset) * 5),
      width,
      height,
      rotation: offset * 2.3,
      hovered: false,
      dimmed: false,
      queued: false,
      target: null,
      targets: [],
    }];
  }));
}

export function mountGame(root: HTMLElement, scene: ScenePort): { destroy(): void } {
  let state = createCombat();
  let mode: Mode = 'planning';
  let selection: Selection = null;
  let pending: PendingPlacement | null = null;
  let drag: Drag | null = null;
  let hoveredUid: string | null = null;
  let hoveredQueueSlot: number | null = null;
  let inspector: 'draw' | 'discard' | null = null;
  let notice = 'Place a card in an open slot, then choose its target — or target first.';
  let destroyed = false;
  let sequence = 0;
  let suppressClick = false;
  const timers = new Set<number>();
  const listeners = new AbortController();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  root.className = 'game-hud';
  root.setAttribute('aria-label', 'Stop the Invasion combat controls');

  const playerAction = (slot: number): PlayerAction | null => {
    const action = state.queue[slot];
    return action?.kind === 'player' ? action : null;
  };

  const candidates = (card: CardInstance): ActorId[] => {
    const definition = CARDS[card.definitionId];
    return (Object.keys(state.actors) as ActorId[]).filter((actorId) => {
      const actor = state.actors[actorId];
      return actor.hp > 0 && (definition.target === 'self' ? actorId === card.owner : actorId !== card.owner);
    });
  };

  const handCard = (uid: string) => state.hand.find((card) => card.uid === uid) ?? null;
  const queueCardX = (slot: number) => TIMELINE_LEFT + slot * (SLOT_WIDTH + TIMELINE_GAP) + (SLOT_WIDTH - QUEUE_CARD_WIDTH) / 2;

  const visualCards = (): CardVisual[] => {
    const hand = cardLayout(state.hand);
    for (const visual of hand.values()) {
      const card = handCard(visual.uid)!;
      visual.targets = candidates(card);
      visual.target = pending?.uid === visual.uid ? pending.target : null;
      visual.hovered = visual.uid === hoveredUid || selection?.kind === 'hand' && selection.uid === visual.uid || pending?.uid === visual.uid;
      visual.dimmed = mode !== 'planning' || Boolean(pending && pending.uid !== visual.uid);
      if (drag?.kind === 'hand' && drag.uid === visual.uid) {
        visual.width = 220;
        visual.height = 308;
        visual.x = Math.round(drag.x - visual.width / 2);
        visual.y = Math.round(drag.y + 24);
        visual.rotation = 0;
        visual.hovered = true;
      } else if (visual.hovered) {
        const center = visual.x + visual.width / 2;
        visual.width = 220;
        visual.height = 308;
        visual.x = Math.round(center - visual.width / 2);
        visual.y = 742;
        visual.rotation = 0;
      }
    }

    const queued: CardVisual[] = [];
    state.queue.forEach((slot, index) => {
      if (slot?.kind !== 'player') return;
      const visual: CardVisual = {
        uid: slot.card.uid,
        definition: CARDS[slot.card.definitionId],
        x: queueCardX(index),
        y: QUEUE_CARD_Y,
        width: QUEUE_CARD_WIDTH,
        height: QUEUE_CARD_HEIGHT,
        rotation: 0,
        hovered: hoveredQueueSlot === index,
        dimmed: mode !== 'planning',
        queued: true,
        target: slot.target,
        targets: candidates(slot.card),
      };
      queued.push(visual);
      if (hoveredQueueSlot === index && !drag) {
        queued.push({ ...visual, uid: `${visual.uid}:preview`, ...PREVIEW, rotation: 0, hovered: true });
      }
    });
    return [...queued, ...hand.values()].sort((a, b) => Number(a.hovered) - Number(b.hovered));
  };

  const dotMarkup = (card: CardInstance, target: ActorId | null, scope: 'hand' | 'queue', identity: string | number) => {
    const actorIds = candidates(card);
    return actorIds.map((actorId, index) => {
      const x = 50 + (index - (actorIds.length - 1) / 2) * CARD_TARGET_GAP * 100;
      return `<button class="target-dot" data-action="target-dot" data-scope="${scope}" data-${scope === 'hand' ? 'card' : 'slot'}="${escapeHtml(identity)}" data-target="${actorId}"
        style="--dot-x:${x}%;--dot-y:${CARD_TARGET_Y * 100}%" aria-label="${target === actorId ? 'Selected target' : 'Target'} ${escapeHtml(state.actors[actorId].name)}" aria-pressed="${target === actorId}" ${mode !== 'planning' ? 'disabled' : ''}></button>`;
    }).join('');
  };

  const selectedTargets = (): ActorId[] => {
    if (drag?.kind === 'hand') return handCard(drag.uid) ? candidates(handCard(drag.uid)!) : [];
    if (pending) return [pending.target];
    if (selection?.kind === 'hand') return handCard(selection.uid) ? candidates(handCard(selection.uid)!) : [];
    return [];
  };

  const pileMarkup = (kind: 'draw' | 'discard', cards: CardInstance[]) => {
    const label = kind === 'draw' ? 'Draw pile' : 'Discard pile';
    return `<button class="pile-button" data-action="inspect" data-pile="${kind}" aria-label="Inspect ${label}, ${cards.length} cards"><b>${cards.length}</b><span>${label}</span></button>`;
  };

  const actorMarkup = (actorId: ActorId) => {
    const actor = state.actors[actorId];
    const targets = selectedTargets();
    const classes = ['actor-target', actorId === 'bob' ? 'actor-bob' : 'actor-guard'];
    if (targets.length) classes.push(targets.includes(actorId) ? 'target-valid' : 'target-invalid');
    return `<button class="${classes.join(' ')}" data-actor="${actorId}" ${mode !== 'planning' ? 'disabled' : ''}
      aria-label="Target ${escapeHtml(actor.name)}. ${actor.hp} of ${actor.maxHp} health, ${actor.block} block, ${actor.exposed} exposed">
      <span class="actor-name">${escapeHtml(actor.name)}</span>
      <span class="hp-line"><span class="hp-fill" style="--hp:${Math.max(0, actor.hp / actor.maxHp)}"></span><b>${actor.hp}</b> / ${actor.maxHp} HP</span>
      <span class="actor-status"><span>BLOCK <b>${actor.block}</b></span><span>EXPOSED <b>${actor.exposed}</b></span></span>
    </button>`;
  };

  const intentMarkup = () => {
    const entry = state.queue.find((slot) => slot?.kind === 'enemy');
    if (!entry || entry.kind !== 'enemy') return '<span class="intent-chip muted">Intent cleared</span>';
    return `<span class="intent-wrap"><button class="intent-chip" aria-describedby="intent-tooltip">ENEMY INTENT: ${escapeHtml(entry.name)}</button>
      <span class="intent-tooltip" id="intent-tooltip" role="tooltip"><b>${escapeHtml(entry.name)}</b><span>${escapeHtml(entry.description)}</span><small>${escapeHtml(effectText(entry.effects))} to ${escapeHtml(state.actors[entry.target].name)}</small></span></span>`;
  };

  const queueMarkup = () => state.queue.map((slot, index) => {
    const active = state.activeSlot === index ? ' active' : '';
    const selected = selection?.kind === 'queue' && selection.slot === index ? ' selected' : '';
    if (!slot) {
      const pendingClass = pending ? ' pending-destination' : '';
      return `<div class="queue-slot empty${active}${selected}${pendingClass}" data-slot="${index}" role="button" tabindex="${mode === 'planning' ? 0 : -1}" aria-label="Timeline slot ${index + 1}, empty${pending ? ', place selected card here' : ''}">
        <span class="slot-number">${index + 1}</span><b>OPEN</b><small>${pending ? 'Click to place' : 'Drop or move here'}</small></div>`;
    }
    if (slot.kind === 'enemy') {
      return `<div class="queue-slot enemy locked${active}" data-slot="${index}" aria-label="Timeline slot ${index + 1}, locked enemy action ${escapeHtml(slot.name)}">
        <span class="slot-number">${index + 1}</span><span class="owner">GUARD / LOCKED</span><b>${escapeHtml(slot.name)}</b><small>${escapeHtml(slot.description)}</small></div>`;
    }
    const definition = CARDS[slot.card.definitionId];
    const targetName = slot.target === null ? 'missing' : state.actors[slot.target].name;
    return `<div class="queue-slot player queue-card${active}${selected}${slot.target === null ? ' missing' : ''}" data-slot="${index}" role="button" tabindex="${mode === 'planning' ? 0 : -1}"
      aria-label="Timeline slot ${index + 1}, Bob card ${escapeHtml(definition.name)}, cost ${definition.cost}, target ${escapeHtml(targetName)}">
      <span class="slot-number">${index + 1}</span><span class="owner">${definition.cost} ENERGY</span>
      ${slot.target === null ? '<span class="missing-target">NEEDS TARGET</span>' : ''}
      <button class="remove-card" data-action="remove" data-slot="${index}" ${mode !== 'planning' ? 'disabled' : ''}>Remove</button>
      <span class="queue-dot-layer" aria-label="Card targets">${dotMarkup(slot.card, slot.target, 'queue', index)}</span>
    </div>`;
  }).join('');

  const handMarkup = () => {
    const layout = cardLayout(state.hand);
    return state.hand.map((card) => {
      const visual = layout.get(card.uid)!;
      const definition = CARDS[card.definitionId];
      const target = pending?.uid === card.uid ? pending.target : null;
      const selected = selection?.kind === 'hand' && selection.uid === card.uid || pending?.uid === card.uid;
      return `<div class="hand-hit${selected ? ' selected' : ''}" data-hand-card="${escapeHtml(card.uid)}" role="button" tabindex="${mode === 'planning' ? 0 : -1}"
        style="--x:${visual.x}px;--y:${visual.y}px;--w:${visual.width}px;--h:${visual.height}px;--r:${visual.rotation}deg;--raised-x:${Math.round(visual.x + visual.width / 2 - 110)}px" aria-label="${escapeHtml(definition.name)}, ${definition.cost} energy, ${escapeHtml(definition.description)}. Select a slot or target.">
        ${dotMarkup(card, target, 'hand', card.uid)}
      </div>`;
    }).join('');
  };

  const inspectorMarkup = () => {
    if (!inspector) return '';
    const cards = inspector === 'draw' ? state.drawPile : state.discardPile;
    const title = inspector === 'draw' ? 'Draw pile' : 'Discard pile';
    const rows = cards.length
      ? cards.map((card, index) => `<li><span>${String(index + 1).padStart(2, '0')}</span><b>${escapeHtml(CARDS[card.definitionId].name)}</b><small>${CARDS[card.definitionId].cost} energy</small></li>`).join('')
      : '<li class="pile-empty">No cards here.</li>';
    return `<div class="inspector-shade"><section class="pile-inspector" role="dialog" aria-modal="true" aria-labelledby="pile-title"><header><h2 id="pile-title">${title}</h2><button data-action="close-inspector" aria-label="Close pile inspector">Close</button></header><ol>${rows}</ol></section></div>`;
  };

  const outcomeMarkup = () => {
    if (state.phase !== 'victory' && state.phase !== 'defeat') return '';
    const victory = state.phase === 'victory';
    return `<div class="outcome-shade"><section class="outcome ${victory ? 'victory' : 'defeat'}" role="dialog" aria-modal="true" aria-labelledby="outcome-title"><span class="stamp">${victory ? 'AISLE SECURED' : 'SHIFT ENDED'}</span><h2 id="outcome-title">${victory ? 'Victory!' : 'Defeat'}</h2><p>${victory ? 'Bob survives another unreasonable customer interaction.' : 'The infected guard wins this round. Reset the aisle and try a new plan.'}</p><button class="primary" data-action="restart">Replay encounter</button></section></div>`;
  };

  const missingTargets = () => state.queue.filter((slot) => slot?.kind === 'player' && slot.target === null).length;
  const resolveReason = () => {
    if (pending) return 'Choose an empty slot; Escape cancels.';
    const missing = missingTargets();
    return missing ? `${missing} queued card${missing === 1 ? ' needs' : 's need'} a target.` : '';
  };

  const render = () => {
    if (destroyed) return;
    const bob = state.actors.bob;
    const energy = availableEnergy(state, 'bob');
    const log = state.log.slice(-LOG_LIMIT);
    const blocked = resolveReason();
    root.innerHTML = `<header class="topbar ink-panel"><div><span class="eyebrow">CHAPTER 01 / NIGHT SHIFT</span><h1>STOP THE INVASION</h1></div><div class="turn-badge"><small>TURN</small><b>${state.turn}</b></div>${intentMarkup()}<button class="restart" data-action="restart" ${mode === 'resolving' ? 'disabled' : ''}>Restart</button></header>
      <main>${actorMarkup('guard')}${actorMarkup('bob')}
        <section class="energy-pot ink-panel" aria-label="Bob has ${energy} available energy out of ${bob.energy}"><span>STORED ENERGY</span><b>${energy}</b><small>${energy === bob.energy ? `OF ${bob.energyMax} CAP` : `${bob.energy - energy} RESERVED / ${bob.energy} STORED`}</small></section>
        <section class="timeline" aria-label="Six slot action timeline"><div class="timeline-title"><b>ACTION TIMELINE</b><span>${state.activeSlot === null ? (pending ? 'CHOOSE AN OPEN SLOT' : 'PLAN LEFT TO RIGHT') : `RESOLVING SLOT ${state.activeSlot + 1}`}</span></div>${queueMarkup()}</section>
        <section class="piles" aria-label="Card piles">${pileMarkup('draw', state.drawPile)}${pileMarkup('discard', state.discardPile)}</section>
        <section class="combat-log ink-panel" aria-label="Combat log"><h2>FIELD NOTES</h2><ol>${log.length ? log.map((line) => `<li>${escapeHtml(line)}</li>`).join('') : '<li>The aisle is quiet. For now.</li>'}</ol></section>
        <button class="resolve primary" data-action="resolve" aria-describedby="resolve-reason" ${mode !== 'planning' || state.phase !== 'planning' || blocked ? 'disabled' : ''}>Resolve Turn <span>${blocked || 'Execute six slots'}</span></button>
        <div id="resolve-reason" class="notice ${blocked || /cannot|need|invalid|occupied|locked/i.test(notice) ? 'warning' : ''}" role="status" aria-live="polite">${escapeHtml(notice)}</div>
        <div class="hand-zone" aria-label="Bob's hand">${handMarkup()}</div>
        <svg class="target-arrow" viewBox="0 0 ${DESIGN_WIDTH} ${DESIGN_HEIGHT}" aria-hidden="true" hidden><defs><marker id="arrowhead" markerWidth="12" markerHeight="12" refX="9" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 Z" /></marker></defs><path /></svg>
      </main>${inspectorMarkup()}${outcomeMarkup()}`;
    scene.setState(state);
    scene.setCards(visualCards());
    if (pending) updatePendingArrow();
    root.querySelector<HTMLButtonElement>('.pile-inspector button, .outcome button')?.focus({ preventScroll: true });
  };

  const feedback = (ok: boolean, success: string, reason?: string) => {
    notice = ok ? success : (reason || 'That interaction is not valid right now.');
    if (ok) { selection = null; pending = null; }
    render();
  };

  const clearCapture = () => {
    if (!drag) return;
    if (drag.capture.hasPointerCapture?.(drag.pointerId)) drag.capture.releasePointerCapture(drag.pointerId);
    drag = null;
  };

  const clearInteraction = (message?: string) => {
    clearCapture();
    selection = null;
    pending = null;
    hoveredUid = null;
    hoveredQueueSlot = null;
    scene.setTarget(null);
    root.querySelector<SVGSVGElement>('.target-arrow')?.setAttribute('hidden', '');
    root.querySelectorAll('.drop-hover,.drop-valid,.drop-invalid,.drag-valid,.drag-invalid').forEach((element) => element.classList.remove('drop-hover', 'drop-valid', 'drop-invalid', 'drag-valid', 'drag-invalid'));
    if (message) notice = message;
  };

  const beginPending = (uid: string, target: ActorId, x?: number, y?: number) => {
    const card = handCard(uid);
    if (!card || !candidates(card).includes(target)) {
      notice = 'That actor is not a valid target for this card.';
      render();
      return;
    }
    selection = { kind: 'hand', uid };
    pending = { uid, target, x: x ?? ACTOR_CENTERS[target].x, y: y ?? ACTOR_CENTERS[target].y };
    notice = `${state.actors[target].name} selected. Click an empty timeline slot to place the card.`;
    scene.setTarget(target);
    render();
  };

  const placeHandCard = (uid: string, target: ActorId | null, slot: number) => {
    const card = handCard(uid);
    if (!card) return;
    if (state.queue[slot] !== null) {
      notice = state.queue[slot]?.kind === 'enemy' ? 'That slot is locked by an enemy action.' : 'That slot is occupied. Choose an empty slot.';
      render();
      return;
    }
    const result = queueCard(state, uid, target, slot);
    const targetHint = target === null && CARDS[card.definitionId].target === 'enemy' ? ' Click its target dot before resolving.' : '';
    feedback(result.ok, `${CARDS[card.definitionId].name} queued in slot ${slot + 1}.${targetHint}`, result.reason);
  };

  const wait = (milliseconds: number) => new Promise<void>((resolve) => {
    const timer = window.setTimeout(() => { timers.delete(timer); resolve(); }, milliseconds);
    timers.add(timer);
  });

  const playResolution = async () => {
    if (mode !== 'planning' || state.phase !== 'planning') return;
    const blocked = resolveReason();
    if (blocked) { notice = blocked; render(); return; }
    const run = ++sequence;
    const steps = resolveTurn(state);
    mode = 'resolving';
    clearInteraction();
    notice = 'Hands off — resolving the timeline in order.';
    render();
    for (const step of steps) {
      if (destroyed || run !== sequence) return;
      state = step.state;
      notice = step.events.length ? step.events.map((event) => event.message).join(' ') : 'Advancing the timeline.';
      render();
      for (const event of step.events) {
        scene.playEvent(event);
        const canceled = event.kind === 'empty' && event.message.includes('canceled: combat is over');
        if (!canceled) await wait(reduceMotion ? 45 : 180);
        if (destroyed || run !== sequence) return;
      }
      const canceledStep = step.events.every((event) => event.kind === 'empty' && event.message.includes('canceled: combat is over'));
      if (!canceledStep) await wait(reduceMotion ? 80 : 430);
    }
    mode = state.phase === 'planning' ? 'planning' : 'ended';
    notice = state.phase === 'planning' ? `Turn ${state.turn}: plan the next six slots.` : (state.phase === 'victory' ? 'Aisle secured. Victory.' : 'Bob is down. Defeat.');
    render();
  };

  const restart = () => {
    sequence++;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    clearInteraction();
    state = createCombat(state.seed);
    mode = 'planning';
    inspector = null;
    notice = 'Encounter reset. Place a card in an open slot, or choose its target first.';
    render();
  };

  const designPoint = (event: PointerEvent) => {
    const rect = root.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * DESIGN_WIDTH / rect.width, y: (event.clientY - rect.top) * DESIGN_HEIGHT / rect.height };
  };
  const hitAt = (event: PointerEvent) => document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;

  const drawArrow = (startX: number, startY: number, endX: number, endY: number, validity: 'valid' | 'invalid' | '') => {
    const svg = root.querySelector<SVGSVGElement>('.target-arrow');
    const path = svg?.querySelector<SVGPathElement>(':scope > path');
    if (!svg || !path) return;
    const bend = Math.min(startY, endY) - Math.max(70, Math.abs(endX - startX) * 0.12);
    path.setAttribute('d', `M ${startX} ${startY} C ${startX} ${bend}, ${endX} ${bend}, ${endX} ${endY}`);
    svg.removeAttribute('hidden');
    svg.classList.toggle('valid', validity === 'valid');
    svg.classList.toggle('invalid', validity === 'invalid');
  };

  function updatePendingArrow(): void {
    if (!pending) return;
    const start = ACTOR_CENTERS[pending.target];
    drawArrow(start.x, start.y, pending.x, pending.y, 'valid');
    scene.setPointer(pending.x, pending.y);
    scene.setTarget(pending.target);
  }

  const updateHandDrag = (event: PointerEvent) => {
    if (!drag || drag.kind !== 'hand') return;
    const point = designPoint(event);
    drag.x = point.x;
    drag.y = point.y;
    scene.setPointer(point.x, point.y);
    const hit = hitAt(event);
    const actorElement = hit?.closest<HTMLElement>('[data-actor]');
    const slotElement = hit?.closest<HTMLElement>('[data-slot]');
    const actor = actorElement?.dataset.actor as ActorId | undefined;
    const card = handCard(drag.uid);
    const validActor = Boolean(actor && card && candidates(card).includes(actor));
    const validSlot = Boolean(slotElement && state.queue[Number(slotElement.dataset.slot)] === null);
    scene.setTarget(validActor ? actor! : null);
    const validActors = card ? candidates(card) : [];
    root.querySelectorAll<HTMLElement>('.actor-target').forEach((element) => {
      const valid = validActors.includes(element.dataset.actor as ActorId);
      element.classList.toggle('drag-valid', valid);
      element.classList.toggle('drag-invalid', !valid);
      element.classList.toggle('drop-hover', element === actorElement);
    });
    root.querySelectorAll<HTMLElement>('.queue-slot').forEach((element) => {
      const slot = Number(element.dataset.slot);
      element.classList.toggle('drop-valid', element === slotElement && state.queue[slot] === null);
      element.classList.toggle('drop-invalid', element === slotElement && state.queue[slot] !== null);
    });
    drawArrow(point.x, point.y + 80, point.x, point.y, validActor || validSlot ? 'valid' : actorElement || slotElement ? 'invalid' : '');
    scene.setCards(visualCards());
  };

  const onClick = (event: MouseEvent) => {
    if (suppressClick) { event.preventDefault(); event.stopPropagation(); return; }
    const target = event.target as HTMLElement;
    const actionElement = target.closest<HTMLElement>('[data-action]');
    if (actionElement) {
      const action = actionElement.dataset.action;
      if (action === 'restart') restart();
      else if (action === 'resolve') void playResolution();
      else if (action === 'inspect') { inspector = actionElement.dataset.pile as 'draw' | 'discard'; render(); }
      else if (action === 'close-inspector') { inspector = null; render(); }
      else if (action === 'remove' && mode === 'planning') {
        const slot = Number(actionElement.dataset.slot);
        const result = removeCard(state, slot);
        feedback(result.ok, `Removed card from slot ${slot + 1}.`, result.reason);
      } else if (action === 'target-dot' && mode === 'planning') {
        const actor = actionElement.dataset.target as ActorId;
        if (actionElement.dataset.scope === 'hand') beginPending(actionElement.dataset.card!, actor);
        else {
          const slot = Number(actionElement.dataset.slot);
          const result = retargetCard(state, slot, actor);
          feedback(result.ok, `Target set to ${state.actors[actor].name}.`, result.reason);
        }
      }
      return;
    }
    if (mode !== 'planning') return;
    const actorElement = target.closest<HTMLElement>('[data-actor]');
    if (actorElement && selection?.kind === 'hand') {
      beginPending(selection.uid, actorElement.dataset.actor as ActorId);
      return;
    }
    const handElement = target.closest<HTMLElement>('[data-hand-card]');
    if (handElement) {
      pending = null;
      selection = { kind: 'hand', uid: handElement.dataset.handCard! };
      notice = 'Card selected. Click an empty slot to place it untargeted, or choose an actor first.';
      scene.setTarget(null);
      render();
      return;
    }
    const slotElement = target.closest<HTMLElement>('[data-slot]');
    if (!slotElement) return;
    const to = Number(slotElement.dataset.slot);
    if (pending) {
      placeHandCard(pending.uid, pending.target, to);
    } else if (selection?.kind === 'hand') {
      placeHandCard(selection.uid, null, to);
    } else if (state.queue[to]?.kind === 'enemy') {
      notice = 'Enemy actions are locked and cannot be moved.';
      render();
    } else if (selection?.kind === 'queue') {
      const result = moveCard(state, selection.slot, to);
      feedback(result.ok, `Moved card to slot ${to + 1}.`, result.reason);
    } else if (playerAction(to)) {
      selection = { kind: 'queue', slot: to };
      notice = 'Queued card selected. Choose an open or player slot to move or swap it.';
      render();
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Tab' && (inspector || mode === 'ended')) {
      event.preventDefault();
      root.querySelector<HTMLButtonElement>('.pile-inspector button, .outcome button')?.focus();
      return;
    }
    if (event.key === 'Escape') {
      clearInteraction('Placement canceled. No energy was spent.');
      inspector = null;
      render();
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const element = (event.target as HTMLElement).closest<HTMLElement>('[role="button"]');
    if (!element || element instanceof HTMLButtonElement) return;
    event.preventDefault();
    element.click();
  };

  const onPointerDown = (event: PointerEvent) => {
    if (mode !== 'planning' || event.button > 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('[data-action], .target-dot')) return;
    const hand = target.closest<HTMLElement>('[data-hand-card]');
    const queue = target.closest<HTMLElement>('.queue-card[data-slot]');
    if (pending && queue) return;
    if (!hand && !queue) return;
    event.preventDefault();
    pending = null;
    const point = designPoint(event);
    const capture = hand ?? queue!;
    drag = hand
      ? { kind: 'hand', uid: hand.dataset.handCard!, pointerId: event.pointerId, startX: point.x, startY: point.y, x: point.x, y: point.y, moved: false, capture }
      : { kind: 'queue', slot: Number(queue!.dataset.slot), pointerId: event.pointerId, startX: point.x, startY: point.y, x: point.x, y: point.y, moved: false, capture };
    capture.setPointerCapture?.(event.pointerId);
    if (drag.kind === 'hand') updateHandDrag(event);
  };

  const onPointerMove = (event: PointerEvent) => {
    const point = designPoint(event);
    scene.setPointer(point.x, point.y);
    if (pending) {
      pending.x = point.x;
      pending.y = point.y;
      updatePendingArrow();
    }
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.x = point.x;
    drag.y = point.y;
    if (Math.hypot(point.x - drag.startX, point.y - drag.startY) > 7) drag.moved = true;
    if (drag.kind === 'hand') updateHandDrag(event);
    else {
      const over = hitAt(event)?.closest<HTMLElement>('[data-slot]');
      root.querySelectorAll<HTMLElement>('.queue-slot').forEach((element) => {
        const slot = Number(element.dataset.slot);
        const invalid = state.queue[slot]?.kind === 'enemy';
        element.classList.toggle('drop-valid', element === over && !invalid);
        element.classList.toggle('drop-invalid', element === over && invalid);
      });
    }
  };

  const finishPointer = (event: PointerEvent, cancelled = false) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const finished = drag;
    if (finished.capture.hasPointerCapture?.(finished.pointerId)) finished.capture.releasePointerCapture(finished.pointerId);
    drag = null;
    scene.setTarget(null);
    root.querySelector<SVGSVGElement>('.target-arrow')?.setAttribute('hidden', '');
    root.querySelectorAll('.drop-hover,.drop-valid,.drop-invalid,.drag-valid,.drag-invalid').forEach((element) => element.classList.remove('drop-hover', 'drop-valid', 'drop-invalid', 'drag-valid', 'drag-invalid'));
    scene.setCards(visualCards());
    if (cancelled) {
      selection = null;
      pending = null;
      notice = 'Placement canceled. No energy was spent.';
      render();
      return;
    }
    if (!finished.moved) return;
    event.preventDefault();
    suppressClick = true;
    const timer = window.setTimeout(() => { suppressClick = false; timers.delete(timer); }, 0);
    timers.add(timer);
    const hit = hitAt(event);
    if (finished.kind === 'hand') {
      const actorElement = hit?.closest<HTMLElement>('[data-actor]');
      const actor = actorElement?.dataset.actor as ActorId | undefined;
      const slotElement = hit?.closest<HTMLElement>('[data-slot]');
      if (actor && handCard(finished.uid) && candidates(handCard(finished.uid)!).includes(actor)) {
        beginPending(finished.uid, actor, finished.x, finished.y);
      } else if (slotElement && state.queue[Number(slotElement.dataset.slot)] === null) {
        placeHandCard(finished.uid, null, Number(slotElement.dataset.slot));
      } else {
        selection = { kind: 'hand', uid: finished.uid };
        pending = null;
        notice = actorElement || slotElement ? 'Invalid or occupied drop. No energy was spent.' : 'Drop canceled. Choose an empty slot or valid actor.';
        render();
      }
    } else {
      const slotElement = hit?.closest<HTMLElement>('[data-slot]');
      if (!slotElement) {
        selection = { kind: 'queue', slot: finished.slot };
        notice = 'Drop a queued card on an open or player slot.';
        render();
        return;
      }
      const to = Number(slotElement.dataset.slot);
      if (state.queue[to]?.kind === 'enemy') {
        selection = { kind: 'queue', slot: finished.slot };
        notice = 'Enemy actions are locked and cannot be moved.';
        render();
        return;
      }
      const result = moveCard(state, finished.slot, to);
      feedback(result.ok, `Moved card to slot ${to + 1}.`, result.reason);
    }
  };

  const onPointerOver = (event: PointerEvent) => {
    const target = event.target as HTMLElement;
    const hand = target.closest<HTMLElement>('[data-hand-card]');
    const queue = target.closest<HTMLElement>('.queue-card[data-slot]');
    const dot = target.closest<HTMLElement>('.target-dot');
    if (event.pointerType !== 'touch') {
      const nextUid = hand?.dataset.handCard ?? null;
      const nextSlot = queue ? Number(queue.dataset.slot) : null;
      if (nextUid !== hoveredUid || nextSlot !== hoveredQueueSlot) {
        hoveredUid = nextUid;
        hoveredQueueSlot = nextSlot;
        scene.setCards(visualCards());
      }
    }
    if (dot) scene.setTarget(dot.dataset.target as ActorId);
  };

  const onPointerOut = (event: PointerEvent) => {
    const target = event.target as HTMLElement;
    const related = event.relatedTarget as Node | null;
    const dot = target.closest<HTMLElement>('.target-dot');
    const hand = target.closest<HTMLElement>('[data-hand-card]');
    const queue = target.closest<HTMLElement>('.queue-card[data-slot]');
    if (dot && !dot.contains(related)) scene.setTarget(pending?.target ?? null);
    let changed = false;
    if (hand && !hand.contains(related)) { hoveredUid = null; changed = true; }
    if (queue && !queue.contains(related)) { hoveredQueueSlot = null; changed = true; }
    if (changed) scene.setCards(visualCards());
  };

  const onFocusIn = (event: FocusEvent) => {
    const dot = (event.target as HTMLElement).closest<HTMLElement>('.target-dot');
    if (dot) scene.setTarget(dot.dataset.target as ActorId);
  };
  const onFocusOut = (event: FocusEvent) => {
    if ((event.target as HTMLElement).closest('.target-dot')) scene.setTarget(pending?.target ?? null);
  };

  const listenerOptions = { signal: listeners.signal };
  root.addEventListener('click', onClick, listenerOptions);
  document.addEventListener('keydown', onKeyDown, listenerOptions);
  root.addEventListener('pointerdown', onPointerDown, listenerOptions);
  root.parentElement!.addEventListener('pointermove', onPointerMove, listenerOptions);
  root.addEventListener('pointerup', finishPointer, listenerOptions);
  root.addEventListener('pointercancel', (event) => finishPointer(event, true), listenerOptions);
  root.addEventListener('pointerover', onPointerOver, listenerOptions);
  root.addEventListener('pointerout', onPointerOut, listenerOptions);
  root.addEventListener('focusin', onFocusIn, listenerOptions);
  root.addEventListener('focusout', onFocusOut, listenerOptions);
  render();

  return {
    destroy() {
      destroyed = true;
      sequence++;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      clearInteraction();
      listeners.abort();
      root.replaceChildren();
      scene.setTarget(null);
      scene.setCards([]);
    },
  };
}

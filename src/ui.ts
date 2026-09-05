import { availableEnergy, createCombat, moveCard, queueCard, removeCard, resolveTurn, retargetCard } from './game/combat';
import { CARDS } from './game/content';
import type { ActorId, CardInstance, CombatState, PlayerAction } from './game/types';
import type { CardVisual, ScenePort } from './view/types';

type Selection =
  | { kind: 'hand'; uid: string }
  | { kind: 'queue'; slot: number; action: 'move' | 'retarget' }
  | null;
type Drag =
  | { kind: 'hand'; uid: string; pointerId: number; x: number; y: number; moved: boolean }
  | { kind: 'queue'; slot: number; pointerId: number; x: number; y: number; moved: boolean };
type Mode = 'planning' | 'resolving' | 'ended';

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#39;',
  '"': '&quot;',
};
const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 1080;
const LOG_LIMIT = 7;
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
    }];
  }));
}

export function mountGame(root: HTMLElement, scene: ScenePort): { destroy(): void } {
  let state = createCombat();
  let mode: Mode = 'planning';
  let selection: Selection = null;
  let drag: Drag | null = null;
  let hoveredUid: string | null = null;
  let inspector: 'draw' | 'discard' | null = null;
  let notice = 'Choose a card, then choose its highlighted target — or drag it there.';
  let destroyed = false;
  let sequence = 0;
  const timers = new Set<number>();
  const listeners = new AbortController();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  root.className = 'game-hud';
  root.setAttribute('aria-label', 'Stop the Invasion combat controls');

  const playerAction = (slot: number): PlayerAction | null => {
    const action = state.queue[slot];
    return action?.kind === 'player' ? action : null;
  };

  const visualCards = (): CardVisual[] => {
    const hand = cardLayout(state.hand);
    const selectedUid = selection?.kind === 'hand' ? selection.uid : null;
    for (const visual of hand.values()) {
      const raised = visual.uid === hoveredUid || visual.uid === selectedUid || (drag?.kind === 'hand' && drag.uid === visual.uid);
      visual.dimmed = mode !== 'planning';
      if (raised) {
        const center = visual.x + visual.width / 2;
        visual.width = 220;
        visual.height = 308;
        visual.x = Math.round(center - visual.width / 2);
        visual.y = 742;
        visual.rotation = 0;
        visual.hovered = true;
      }
    }
    return [...hand.values()].sort((a, b) => Number(a.hovered) - Number(b.hovered));
  };

  const cardTargets = (uid: string): ActorId[] => {
    const card = state.hand.find((candidate) => candidate.uid === uid);
    if (!card) return [];
    return [CARDS[card.definitionId].target === 'self' ? 'bob' : 'guard'];
  };

  const selectedTargets = (): ActorId[] => {
    if (selection?.kind === 'hand') return cardTargets(selection.uid);
    if (selection?.kind === 'queue' && selection.action === 'retarget') {
      const action = playerAction(selection.slot);
      if (!action) return [];
      return [CARDS[action.card.definitionId].target === 'self' ? 'bob' : 'guard'];
    }
    return [];
  };

  const pileMarkup = (kind: 'draw' | 'discard', cards: CardInstance[]) => {
    const label = kind === 'draw' ? 'Draw pile' : 'Discard pile';
    return `<button class="pile-button" data-action="inspect" data-pile="${kind}" aria-label="Inspect ${label}, ${cards.length} cards">
      <b>${cards.length}</b><span>${label}</span>
    </button>`;
  };

  const actorMarkup = (actorId: ActorId) => {
    const actor = state.actors[actorId];
    const isBob = actorId === 'bob';
    const targets = selectedTargets();
    const targeting = targets.length > 0;
    const classes = ['actor-target', isBob ? 'actor-bob' : 'actor-guard'];
    if (targeting) classes.push(targets.includes(actorId) ? 'target-valid' : 'target-invalid');
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
    return `<span class="intent-wrap">
      <button class="intent-chip" aria-describedby="intent-tooltip">ENEMY INTENT: ${escapeHtml(entry.name)}</button>
      <span class="intent-tooltip" id="intent-tooltip" role="tooltip"><b>${escapeHtml(entry.name)}</b><span>${escapeHtml(entry.description)}</span><small>${escapeHtml(effectText(entry.effects))} to ${escapeHtml(state.actors[entry.target].name)}</small></span>
    </span>`;
  };

  const queueMarkup = () => state.queue.map((slot, index) => {
    const active = state.activeSlot === index ? ' active' : '';
    const selected = selection?.kind === 'queue' && selection.slot === index ? ' selected' : '';
    if (!slot) {
      return `<div class="queue-slot empty${active}${selected}" data-slot="${index}" role="button" tabindex="${mode === 'planning' ? 0 : -1}" aria-label="Timeline slot ${index + 1}, empty">
        <span class="slot-number">${index + 1}</span><b>OPEN</b><small>Drop or move here</small>
      </div>`;
    }
    if (slot.kind === 'enemy') {
      return `<div class="queue-slot enemy locked${active}" data-slot="${index}" aria-label="Timeline slot ${index + 1}, locked enemy action ${escapeHtml(slot.name)}">
        <span class="slot-number">${index + 1}</span><span class="owner">GUARD / LOCKED</span><b>${escapeHtml(slot.name)}</b><small>${escapeHtml(slot.description)}</small>
      </div>`;
    }
    const definition = CARDS[slot.card.definitionId];
    return `<div class="queue-slot player queue-card${active}${selected}" data-slot="${index}" role="button" tabindex="${mode === 'planning' ? 0 : -1}" aria-label="Timeline slot ${index + 1}, Bob card ${escapeHtml(definition.name)}, cost ${definition.cost}, target ${escapeHtml(state.actors[slot.target].name)}">
      <span class="slot-number">${index + 1}</span><span class="owner">BOB / ${definition.cost} ENERGY</span><b>${escapeHtml(definition.name)}</b><small>TARGET: ${escapeHtml(state.actors[slot.target].name)}</small>
      <span class="queue-actions">
        <button data-action="retarget" data-slot="${index}" ${mode !== 'planning' ? 'disabled' : ''}>Retarget</button>
        <button data-action="remove" data-slot="${index}" ${mode !== 'planning' ? 'disabled' : ''}>Remove</button>
      </span>
    </div>`;
  }).join('');

  const handMarkup = () => {
    const layout = cardLayout(state.hand);
    return state.hand.map((card) => {
      const visual = layout.get(card.uid)!;
      const definition = CARDS[card.definitionId];
      const selected = selection?.kind === 'hand' && selection.uid === card.uid;
      return `<button class="hand-hit${selected ? ' selected' : ''}" data-card="${escapeHtml(card.uid)}"
        style="--x:${visual.x}px;--y:${visual.y}px;--w:${visual.width}px;--h:${visual.height}px;--r:${visual.rotation}deg"
        ${mode !== 'planning' ? 'disabled' : ''}
        aria-label="${escapeHtml(definition.name)}, ${definition.cost} energy, ${escapeHtml(definition.description)}. Select then choose ${definition.target === 'self' ? 'Bob' : 'the guard'}."></button>`;
    }).join('');
  };

  const inspectorMarkup = () => {
    if (!inspector) return '';
    const cards = inspector === 'draw' ? state.drawPile : state.discardPile;
    const title = inspector === 'draw' ? 'Draw pile' : 'Discard pile';
    const rows = cards.length
      ? cards.map((card, index) => `<li><span>${String(index + 1).padStart(2, '0')}</span><b>${escapeHtml(CARDS[card.definitionId].name)}</b><small>${CARDS[card.definitionId].cost} energy</small></li>`).join('')
      : '<li class="pile-empty">No cards here.</li>';
    return `<div class="inspector-shade"><section class="pile-inspector" role="dialog" aria-modal="true" aria-labelledby="pile-title">
      <header><h2 id="pile-title">${title}</h2><button data-action="close-inspector" aria-label="Close pile inspector">Close</button></header>
      <ol>${rows}</ol>
    </section></div>`;
  };

  const outcomeMarkup = () => {
    if (state.phase !== 'victory' && state.phase !== 'defeat') return '';
    const victory = state.phase === 'victory';
    return `<div class="outcome-shade"><section class="outcome ${victory ? 'victory' : 'defeat'}" role="dialog" aria-modal="true" aria-labelledby="outcome-title">
      <span class="stamp">${victory ? 'AISLE SECURED' : 'SHIFT ENDED'}</span>
      <h2 id="outcome-title">${victory ? 'Victory!' : 'Defeat'}</h2>
      <p>${victory ? 'Bob survives another unreasonable customer interaction.' : 'The infected guard wins this round. Reset the aisle and try a new plan.'}</p>
      <button class="primary" data-action="restart">Replay encounter</button>
    </section></div>`;
  };

  const render = () => {
    if (destroyed) return;
    const bob = state.actors.bob;
    const energy = availableEnergy(state, 'bob');
    const log = state.log.slice(-LOG_LIMIT);
    root.innerHTML = `
      <header class="topbar ink-panel">
        <div><span class="eyebrow">CHAPTER 01 / NIGHT SHIFT</span><h1>STOP THE INVASION</h1></div>
        <div class="turn-badge"><small>TURN</small><b>${state.turn}</b></div>
        ${intentMarkup()}
        <button class="restart" data-action="restart" ${mode === 'resolving' ? 'disabled' : ''}>Restart</button>
      </header>
      <main>
        ${actorMarkup('guard')}${actorMarkup('bob')}
        <section class="energy-pot ink-panel" aria-label="Bob has ${energy} available energy out of ${bob.energy}">
          <span>STORED ENERGY</span><b>${energy}</b><small>${energy === bob.energy ? `OF ${bob.energyMax} CAP` : `${bob.energy - energy} RESERVED / ${bob.energy} STORED`}</small>
        </section>
        <section class="timeline" aria-label="Six slot action timeline"><div class="timeline-title"><b>ACTION TIMELINE</b><span>${state.activeSlot === null ? 'PLAN LEFT TO RIGHT' : `RESOLVING SLOT ${state.activeSlot + 1}`}</span></div>${queueMarkup()}</section>
        <section class="piles" aria-label="Card piles">${pileMarkup('draw', state.drawPile)}${pileMarkup('discard', state.discardPile)}</section>
        <section class="combat-log ink-panel" aria-label="Combat log"><h2>FIELD NOTES</h2><ol>${log.length ? log.map((line) => `<li>${escapeHtml(line)}</li>`).join('') : '<li>The aisle is quiet. For now.</li>'}</ol></section>
        <button class="resolve primary" data-action="resolve" ${mode !== 'planning' || state.phase !== 'planning' ? 'disabled' : ''}>Resolve Turn <span>Execute six slots</span></button>
        <div class="notice ${notice.toLowerCase().includes('cannot') || notice.toLowerCase().includes('need') || notice.toLowerCase().includes('invalid') ? 'warning' : ''}" role="status" aria-live="polite">${escapeHtml(notice)}</div>
        <div class="hand-zone" aria-label="Bob's hand">${handMarkup()}</div>
        <svg class="target-arrow" viewBox="0 0 ${DESIGN_WIDTH} ${DESIGN_HEIGHT}" aria-hidden="true" hidden><defs><marker id="arrowhead" markerWidth="12" markerHeight="12" refX="9" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 Z" /></marker></defs><path /></svg>
      </main>
      ${inspectorMarkup()}${outcomeMarkup()}`;
    scene.setState(state);
    scene.setCards(visualCards());
    root.querySelector<HTMLButtonElement>('.pile-inspector button, .outcome button')?.focus({ preventScroll: true });
  };

  const feedback = (ok: boolean, success: string, reason?: string) => {
    notice = ok ? success : (reason || 'That interaction is not valid right now.');
    if (ok) selection = null;
    render();
  };

  const chooseTarget = (actor: ActorId) => {
    if (selection?.kind === 'hand') {
      const uid = selection.uid;
      const definition = state.hand.find((card) => card.uid === uid);
      if (!definition || !cardTargets(definition.uid).includes(actor)) {
        notice = `That card needs ${definition && CARDS[definition.definitionId].target === 'self' ? 'Bob' : 'the guard'} as its target.`;
        render();
        return;
      }
      const result = queueCard(state, definition.uid, actor);
      feedback(result.ok, `${CARDS[definition.definitionId].name} queued in the earliest open slot.`, result.reason);
      return;
    }
    if (selection?.kind === 'queue' && selection.action === 'retarget') {
      const action = playerAction(selection.slot);
      const valid = action && (CARDS[action.card.definitionId].target === 'self' ? actor === 'bob' : actor === 'guard');
      if (!valid) {
        notice = 'That queued card cannot use that target.';
        render();
        return;
      }
      const result = retargetCard(state, selection.slot, actor);
      feedback(result.ok, `Target set to ${state.actors[actor].name}.`, result.reason);
    }
  };

  const wait = (milliseconds: number) => new Promise<void>((resolve) => {
    const timer = setTimeout(() => { timers.delete(timer); resolve(); }, milliseconds);
    timers.add(timer);
  });

  const playResolution = async () => {
    if (mode !== 'planning' || state.phase !== 'planning') return;
    const run = ++sequence;
    const steps = resolveTurn(state);
    mode = 'resolving';
    selection = null;
    hoveredUid = null;
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
    state = createCombat(state.seed);
    mode = 'planning';
    selection = null;
    drag = null;
    hoveredUid = null;
    inspector = null;
    notice = 'Encounter reset. Choose a card, then choose its highlighted target.';
    scene.setTarget(null);
    render();
  };

  const designPoint = (event: PointerEvent) => {
    const rect = root.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * DESIGN_WIDTH / rect.width,
      y: (event.clientY - rect.top) * DESIGN_HEIGHT / rect.height,
    };
  };

  const hitAt = (event: PointerEvent) => document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;

  const updateArrow = (event: PointerEvent) => {
    if (!drag || drag.kind !== 'hand') return;
    const point = designPoint(event);
    scene.setPointer(point.x, point.y);
    const targetElement = hitAt(event)?.closest<HTMLElement>('[data-actor]');
    const actor = targetElement?.dataset.actor as ActorId | undefined;
    const valid = actor !== undefined && cardTargets(drag.uid).includes(actor);
    scene.setTarget(valid ? actor! : null);
    const validActors = cardTargets(drag.uid);
    root.querySelectorAll<HTMLElement>('.actor-target').forEach((element) => {
      const isValid = validActors.includes(element.dataset.actor as ActorId);
      element.classList.toggle('drag-valid', isValid);
      element.classList.toggle('drag-invalid', !isValid);
      element.classList.toggle('drop-hover', element === targetElement);
    });
    const visual = cardLayout(state.hand).get(drag.uid);
    const svg = root.querySelector<SVGSVGElement>('.target-arrow');
    const path = svg?.querySelector<SVGPathElement>(':scope > path');
    if (!visual || !svg || !path) return;
    const startX = visual.x + visual.width / 2;
    const startY = visual.y + 20;
    const bend = Math.min(startY, point.y) - Math.max(90, Math.abs(point.x - startX) * 0.12);
    path.setAttribute('d', `M ${startX} ${startY} C ${startX} ${bend}, ${point.x} ${bend}, ${point.x} ${point.y}`);
    svg.removeAttribute('hidden');
    svg.classList.toggle('valid', valid);
    svg.classList.toggle('invalid', Boolean(actor) && !valid);
  };

  const onClick = (event: MouseEvent) => {
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
      } else if (action === 'retarget' && mode === 'planning') {
        selection = { kind: 'queue', slot: Number(actionElement.dataset.slot), action: 'retarget' };
        notice = 'Choose the highlighted actor to retarget this card.';
        render();
      }
      return;
    }
    if (mode !== 'planning') return;
    const actorElement = target.closest<HTMLElement>('[data-actor]');
    if (actorElement && selection) {
      chooseTarget(actorElement.dataset.actor as ActorId);
      return;
    }
    const cardElement = target.closest<HTMLElement>('[data-card]');
    if (cardElement) {
      selection = { kind: 'hand', uid: cardElement.dataset.card! };
      notice = 'Card selected. Choose the highlighted target.';
      render();
      return;
    }
    const slotElement = target.closest<HTMLElement>('[data-slot]');
    if (slotElement) {
      const to = Number(slotElement.dataset.slot);
      if (state.queue[to]?.kind === 'enemy') {
        notice = 'Enemy actions are locked and cannot be moved.';
        render();
      } else if (selection?.kind === 'queue') {
        const result = moveCard(state, selection.slot, to);
        feedback(result.ok, `Moved card to slot ${to + 1}.`, result.reason);
      } else if (playerAction(to)) {
        selection = { kind: 'queue', slot: to, action: 'move' };
        notice = 'Queued card selected. Choose an open or player slot to move or swap it.';
        render();
      }
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Tab' && (inspector || mode === 'ended')) {
      event.preventDefault();
      root.querySelector<HTMLButtonElement>('.pile-inspector button, .outcome button')?.focus();
      return;
    }
    if (event.key === 'Escape') {
      selection = null;
      inspector = null;
      notice = 'Selection cleared.';
      render();
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const element = (event.target as HTMLElement).closest<HTMLElement>('[role="button"][data-slot]');
    if (!element) return;
    event.preventDefault();
    element.click();
  };

  const onPointerDown = (event: PointerEvent) => {
    if (mode !== 'planning' || event.button > 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('[data-action]')) return;
    const card = target.closest<HTMLElement>('[data-card]');
    const queue = target.closest<HTMLElement>('.queue-card[data-slot]');
    if (!card && !queue) return;
    event.preventDefault();
    const point = designPoint(event);
    drag = card
      ? { kind: 'hand', uid: card.dataset.card!, pointerId: event.pointerId, x: point.x, y: point.y, moved: false }
      : { kind: 'queue', slot: Number(queue!.dataset.slot), pointerId: event.pointerId, x: point.x, y: point.y, moved: false };
    target.setPointerCapture?.(event.pointerId);
    if (drag.kind === 'hand') updateArrow(event);
  };

  const onPointerMove = (event: PointerEvent) => {
    const point = designPoint(event);
    scene.setPointer(point.x, point.y);
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.hypot(point.x - drag.x, point.y - drag.y) > 7) drag.moved = true;
    if (drag.kind === 'hand') updateArrow(event);
    else {
      const over = hitAt(event)?.closest<HTMLElement>('[data-slot]');
      root.querySelectorAll('.queue-slot').forEach((element) => {
        const slot = Number((element as HTMLElement).dataset.slot);
        const invalid = state.queue[slot]?.kind === 'enemy';
        element.classList.toggle('drop-valid', element === over && !invalid);
        element.classList.toggle('drop-invalid', element === over && invalid);
      });
    }
  };

  const finishPointer = (event: PointerEvent, cancelled = false) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const finished = drag;
    drag = null;
    scene.setTarget(null);
    root.querySelector<SVGSVGElement>('.target-arrow')?.setAttribute('hidden', '');
    root.querySelectorAll('.drop-hover,.drop-valid,.drop-invalid,.drag-valid,.drag-invalid').forEach((element) => element.classList.remove('drop-hover', 'drop-valid', 'drop-invalid', 'drag-valid', 'drag-invalid'));
    if (cancelled || !finished.moved) return;
    event.preventDefault();
    if (finished.kind === 'hand') {
      const actorElement = hitAt(event)?.closest<HTMLElement>('[data-actor]');
      const actor = actorElement?.dataset.actor as ActorId | undefined;
      if (!actor || !cardTargets(finished.uid).includes(actor)) {
        selection = { kind: 'hand', uid: finished.uid };
        notice = actor ? 'Invalid target. Use the highlighted actor.' : 'Drop the card on a highlighted actor, or click the actor after selecting it.';
        render();
        return;
      }
      const card = state.hand.find((candidate) => candidate.uid === finished.uid)!;
      const result = queueCard(state, finished.uid, actor);
      feedback(result.ok, `${CARDS[card.definitionId].name} queued in the earliest open slot.`, result.reason);
    } else {
      const slotElement = hitAt(event)?.closest<HTMLElement>('[data-slot]');
      if (!slotElement) {
        selection = { kind: 'queue', slot: finished.slot, action: 'move' };
        notice = 'Drop a queued card on an open or player slot.';
        render();
        return;
      }
      const to = Number(slotElement.dataset.slot);
      if (state.queue[to]?.kind === 'enemy') {
        notice = 'Enemy actions are locked and cannot be moved.';
        render();
        return;
      }
      const result = moveCard(state, finished.slot, to);
      feedback(result.ok, `Moved card to slot ${to + 1}.`, result.reason);
    }
  };

  const onPointerOver = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    const card = (event.target as HTMLElement).closest<HTMLElement>('[data-card]');
    if (!card || card.dataset.card === hoveredUid) return;
    hoveredUid = card.dataset.card!;
    scene.setCards(visualCards());
  };

  const onPointerOut = (event: PointerEvent) => {
    const card = (event.target as HTMLElement).closest<HTMLElement>('[data-card]');
    if (!card || card.contains(event.relatedTarget as Node)) return;
    hoveredUid = null;
    scene.setCards(visualCards());
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
  render();

  return {
    destroy() {
      destroyed = true;
      sequence++;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      listeners.abort();
      root.replaceChildren();
      scene.setTarget(null);
      scene.setCards([]);
    },
  };
}

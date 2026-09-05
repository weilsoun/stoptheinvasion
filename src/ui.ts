import { attachModifier, availableEnergy, canAttachModifier, createCombat, damageModifier, moveCard, previewPlacement, queueCard, removeCard, removeModifier, resolveTurn, retargetCard } from './game/combat';
import { CARDS } from './game/content';
import type { ActorId, CardDefinition, CardInstance, EnemyAction, ModifierTarget, PlayerAction, QueueSlot } from './game/types';
import { CARD_TARGET_GAP, CARD_TARGET_Y, type CardVisual, type ScenePort } from './view/types';

type Selection = { kind: 'hand'; uid: string } | { kind: 'queue'; slot: number } | null;
type PendingPlacement = { uid: string; target: ActorId };
type Drag = {
  kind: 'hand' | 'queue';
  uid: string;
  slot?: number;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
  capture: HTMLElement;
  pose: Pick<CardVisual, 'x' | 'y' | 'width' | 'height' | 'rotation'>;
  destination: number | null;
  preview: QueueSlot[] | null;
  attachmentTarget: ModifierTarget | null;
};
type Mode = 'planning' | 'resolving' | 'ended';

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 1080;
const LOG_LIMIT = 7;
const SLOT_COUNT = 6;
const QUEUE_CARD_WIDTH = 172;
const QUEUE_CARD_HEIGHT = 241;
const QUEUE_CARD_Y = 500;
const QUEUE_CARD_STRIDE = 132;
const QUEUE_FIRST_X = 960 - QUEUE_CARD_STRIDE * (SLOT_COUNT - 1) / 2 - QUEUE_CARD_WIDTH / 2;
const QUEUE_HIT_TOP = 460;
const QUEUE_HIT_BOTTOM = 790;
const HAND_BOTTOM = 1008;
const HOVER_WIDTH = 280;
const HOVER_HEIGHT = 392;
const HOVER_Y = HAND_BOTTOM - HOVER_HEIGHT;
const PREVIEW = { x: 1540, y: 600, width: 320, height: 448 };
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
      y: Math.round(HAND_BOTTOM - height - 12 - middle * 5 + Math.abs(offset) * 5),
      width,
      height,
      rotation: offset * 2.3,
      hovered: false,
      dimmed: false,
      damageModifier: 0,
      queued: false,
      target: null,
      dragged: false,
      locked: false,
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
  let notice = 'Place actions directly. Attachments can target a card or a position.';
  let destroyed = false;
  let sequence = 0;
  let firingCard: CardVisual | null = null;
  let firingSlot: number | null = null;
  const completedCards = new Set<string>();
  let suppressClick = false;
  const timers = new Map<number, () => void>();
  const listeners = new AbortController();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  root.className = 'game-hud';
  root.setAttribute('aria-label', 'Stop the Invasion combat controls');
  root.style.setProperty('--hover-width', `${HOVER_WIDTH}px`);
  root.style.setProperty('--hover-height', `${HOVER_HEIGHT}px`);
  root.style.setProperty('--hover-y', `${HOVER_Y}px`);

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

  const targetChoices = (card: CardInstance): ActorId[] => {
    const actors = candidates(card);
    return CARDS[card.definitionId].modifier || actors.length > 1 ? actors : [];
  };

  const handCard = (uid: string) => state.hand.find((card) => card.uid === uid) ?? null;
  const canAfford = (card: CardInstance) => CARDS[card.definitionId].cost <= availableEnergy(state, card.owner);
  const queuedCard = (uid: string) => state.queue.find((slot): slot is PlayerAction => slot?.kind === 'player' && slot.card.uid === uid)?.card ?? null;
  const queueCardX = (slot: number) => QUEUE_FIRST_X + slot * QUEUE_CARD_STRIDE;
  const presentedQueue = () => {
    const queue = drag?.preview ?? state.queue;
    if (!firingCard && completedCards.size === 0) return queue;
    return queue.map((slot) => {
      if (!slot) return null;
      const uid = slot.kind === 'enemy' ? slot.uid : slot.card.uid;
      return completedCards.has(uid) || firingCard?.uid === uid ? null : slot;
    });
  };
  const queueCardPose = (index: number, queue = state.queue) => {
    let inFront = 0;
    for (let next = index + 1; next < queue.length; next++) {
      if (queue[next]) inFront++;
    }
    const scale = 1 - inFront * .02;
    const width = QUEUE_CARD_WIDTH * scale;
    const height = QUEUE_CARD_HEIGHT * scale;
    return {
      x: queueCardX(index) + (QUEUE_CARD_WIDTH - width) / 2,
      y: QUEUE_CARD_Y + QUEUE_CARD_HEIGHT - height - inFront * 7,
      width,
      height,
      rotation: 0,
    };
  };
  const enemyDefinition = (action: EnemyAction): CardDefinition => ({
    id: `intent:${action.actor}:${action.name}:${action.effects.map(({ kind, amount, recipient }) => `${kind}-${amount}-${recipient}`).join(':')}`,
    name: action.name,
    cost: 0,
    type: 'attack',
    target: 'enemy',
    description: action.description,
    flavor: `Targets ${state.actors[action.target].name}.`,
    icon: 'boot',
    effects: action.effects,
  });

  const modifierSource = (): CardInstance | null => {
    const uid = drag?.kind === 'hand' ? drag.uid : pending?.uid ?? (selection?.kind === 'hand' ? selection.uid : null);
    const card = uid ? handCard(uid) : null;
    return card && CARDS[card.definitionId].modifier ? card : null;
  };
  const attachmentAllowed = (target: ModifierTarget): boolean => {
    const source = modifierSource();
    return Boolean(source && canAttachModifier(state, source.uid, target));
  };
  const handDisabled = (card: CardInstance): boolean => {
    const modifier = modifierSource();
    return mode !== 'planning' || (modifier && modifier.uid !== card.uid
      ? !attachmentAllowed({ kind: 'card', uid: card.uid })
      : !canAfford(card));
  };
  const attachmentClass = (target: ModifierTarget): string =>
    modifierSource() ? (attachmentAllowed(target) ? ' attachment-valid' : ' attachment-invalid') : '';
  const cardAttachments = (uid: string) => state.attachments.filter(({ target }) => target.kind === 'card' && target.uid === uid);
  const attachmentMarkup = (attachments: typeof state.attachments) => attachments.map(({ card, target }, index) => {
    const amount = CARDS[card.definitionId].modifier!.damage;
    const binding = target.kind === 'card' ? 'card' : 'position';
    return `<button class="attachment-chip ${binding}" style="--chip:${index}" data-action="remove-attachment" data-card="${escapeHtml(card.uid)}"
      aria-disabled="${mode !== 'planning'}" ${mode !== 'planning' ? 'disabled' : ''} aria-label="Remove ${escapeHtml(CARDS[card.definitionId].name)}, ${amount >= 0 ? 'plus' : 'minus'} ${Math.abs(amount)} damage, bound to ${binding}, expires this turn">${amount >= 0 ? '+' : ''}${amount} ${binding} · this turn ×</button>`;
  }).join('');

  const draggedPosition = (held: Drag) => ({
    x: held.x - held.pose.width / 2,
    y: held.y - held.pose.height / 2,
  });

  const visualCards = (): CardVisual[] => {
    const hand = cardLayout(state.hand);
    const heldUid = drag?.uid ?? null;
    const modifier = modifierSource();
    for (const [uid, visual] of hand) {
      if (uid === heldUid) {
        hand.delete(uid);
        continue;
      }
      const card = handCard(uid)!;
      const isSource = modifier?.uid === uid;
      visual.targets = targetChoices(card);
      visual.target = pending?.uid === uid ? pending.target : null;
      visual.damageModifier = damageModifier(state, uid, null);
      visual.hovered = uid === hoveredUid && (!modifier || !isSource && attachmentAllowed({ kind: 'card', uid })) || (!modifier && (selection?.kind === 'hand' && selection.uid === uid || pending?.uid === uid));
      visual.dimmed = handDisabled(card) || Boolean(pending && !modifier && pending.uid !== uid);
      if (visual.hovered) {
        const center = visual.x + visual.width / 2;
        visual.width = HOVER_WIDTH;
        visual.height = HOVER_HEIGHT;
        visual.x = Math.round(center - visual.width / 2);
        visual.y = HOVER_Y;
        visual.rotation = 0;
      }
    }

    const queued: CardVisual[] = [];
    const plan = presentedQueue();
    plan.forEach((slot, index) => {
      if (!slot) return;
      const isEnemy = slot.kind === 'enemy';
      const uid = isEnemy ? slot.uid : slot.card.uid;
      if (uid === heldUid) return;
      const pose = queueCardPose(index, plan);
      const visual: CardVisual = {
        uid,
        definition: isEnemy ? enemyDefinition(slot) : CARDS[slot.card.definitionId],
        ...pose,
        hovered: mode === 'planning' && !modifier && hoveredQueueSlot === index,
        dimmed: mode !== 'planning' || Boolean(modifier && !attachmentAllowed({ kind: 'card', uid })),
        damageModifier: damageModifier(state, uid, index),
        queued: true,
        dragged: false,
        locked: isEnemy,
        target: slot.target,
        targets: isEnemy ? [] : targetChoices(slot.card),
      };
      queued.push(visual);
      if (mode === 'planning' && hoveredQueueSlot === index && !drag) {
        queued.push({ ...visual, uid: `${uid}:preview`, ...PREVIEW, rotation: 0, hovered: true });
      }
    });
    if (firingCard) queued.push(firingCard);

    if (drag) {
      const card = handCard(drag.uid) ?? queuedCard(drag.uid);
      if (card) {
        const action = state.queue.find((slot): slot is PlayerAction => slot?.kind === 'player' && slot.card.uid === heldUid);
        const proposedSlot = drag.destination ?? (drag.kind === 'queue' ? drag.slot! : null);
        queued.push({
          uid: drag.uid,
          definition: CARDS[card.definitionId],
          ...draggedPosition(drag),
          width: drag.pose.width,
          height: drag.pose.height,
          rotation: 0,
          hovered: true,
          dimmed: false,
          damageModifier: damageModifier(state, drag.uid, proposedSlot),
          queued: drag.kind === 'queue',
          dragged: true,
          locked: false,
          target: action?.target ?? null,
          targets: targetChoices(card),
        });
      }
    }
    return [...queued, ...hand.values()].sort((a, b) => Number(a.hovered || a.dragged) - Number(b.hovered || b.dragged));
  };

  const dotMarkup = (card: CardInstance, target: ActorId | null, scope: 'hand' | 'queue', identity: string | number) => {
    const actorIds = targetChoices(card);
    return actorIds.map((actorId, index) => {
      const x = 50 + (index - (actorIds.length - 1) / 2) * CARD_TARGET_GAP * 100;
      const selectedModifier = modifierSource();
      const disabled = mode !== 'planning' || scope === 'hand' && !canAfford(card) || scope === 'queue' && Boolean(pending) || Boolean(selectedModifier && selectedModifier.uid !== card.uid);
      return `<button class="target-dot" data-action="target-dot" data-scope="${scope}" data-${scope === 'hand' ? 'card' : 'slot'}="${escapeHtml(identity)}" data-target="${actorId}"
        style="--dot-x:${x}%;--dot-y:${CARD_TARGET_Y * 100}%" aria-label="${target === actorId ? 'Selected target' : 'Target'} ${escapeHtml(state.actors[actorId].name)}" aria-pressed="${target === actorId}" ${disabled ? 'disabled' : ''}></button>`;
    }).join('');
  };

  const selectedTargets = (): ActorId[] => {
    if (drag?.kind === 'hand') return handCard(drag.uid) ? targetChoices(handCard(drag.uid)!) : [];
    if (pending) return [pending.target];
    if (selection?.kind === 'hand') return handCard(selection.uid) ? targetChoices(handCard(selection.uid)!) : [];
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


  const queueMarkup = () => presentedQueue().map((slot, index, queue) => {
    const active = state.activeSlot === index ? ' active' : '';
    const selected = selection?.kind === 'queue' && selection.slot === index ? ' selected' : '';
    const pose = queueCardPose(index, queue);
    const position = `style="--slot-x:${queueCardX(index)}px;--slot-z:${index};--card-x:${pose.x - queueCardX(index)}px;--card-y:${pose.y - (QUEUE_CARD_Y - 6)}px;--card-w:${pose.width}px;--card-h:${pose.height}px"`;
    const marker = `<span class="empty-position-marker" aria-hidden="true"${slot ? ' hidden' : ''}></span>`;
    const slotTarget = { kind: 'slot', slot: index } as const;
    const frame = `<button class="slot-outline${attachmentClass(slotTarget)}" data-attachment-slot="${index}" aria-label="Bind to timing position ${index + 1}${slot ? ', independently of its current card' : ', currently empty'}" ${mode !== 'planning' || !selection && !pending && !drag || modifierSource() && !attachmentAllowed(slotTarget) ? 'disabled' : ''}></button>`;
    const fixedChips = attachmentMarkup(state.attachments.filter(({ target }) => target.kind === 'slot' && target.slot === index));
    if (!slot) {
      return `<div class="queue-slot empty${active}${selected}${pending ? ' pending-destination' : ''}${attachmentClass(slotTarget)}" data-slot="${index}" ${position}>
        ${marker}${frame}${fixedChips}</div>`;
    }
    const uid = slot.kind === 'enemy' ? slot.uid : slot.card.uid;
    const cardTarget = { kind: 'card', uid } as const;
    const cardChips = attachmentMarkup(cardAttachments(uid));
    if (slot.kind === 'enemy') {
      const delta = damageModifier(state, uid, index);
      const baseDamage = slot.effects.filter(({ kind, recipient }) => kind === 'damage' && recipient === 'target').reduce((total, { amount }) => total + amount, 0);
      const modifiedDamage = Math.max(0, baseDamage + delta);
      return `<div class="queue-slot enemy locked${active}" data-slot="${index}" ${position}>
        ${marker}${frame}<div class="queue-card-body${attachmentClass(cardTarget)}" data-card-uid="${escapeHtml(uid)}" role="button" tabindex="${mode === 'planning' && (!modifierSource() || attachmentAllowed(cardTarget)) ? 0 : -1}"
          aria-label="Timing position ${index + 1}, locked enemy action ${escapeHtml(slot.name)}. ${escapeHtml(slot.description)} ${escapeHtml(effectText(slot.effects))} to ${escapeHtml(state.actors[slot.target].name)}${delta ? `. Modified damage ${baseDamage} to ${modifiedDamage}` : ''}">${cardChips}</div>${fixedChips}</div>`;
    }
    const definition = CARDS[slot.card.definitionId];
    const targetName = slot.target === null ? 'missing' : state.actors[slot.target].name;
    const delta = damageModifier(state, uid, index);
    return `<div class="queue-slot player queue-card${active}${selected}${slot.target === null ? ' missing' : ''}" data-slot="${index}" ${position}>
      ${marker}${frame}<div class="queue-card-body${attachmentClass(cardTarget)}" data-card-uid="${escapeHtml(uid)}" role="button" tabindex="${mode === 'planning' && (!modifierSource() || attachmentAllowed(cardTarget)) ? 0 : -1}"
        aria-label="Timing position ${index + 1}, Bob card ${escapeHtml(definition.name)}, cost ${definition.cost}, target ${escapeHtml(targetName)}${delta ? `, damage modifier ${delta}` : ''}">
        ${cardChips}<button class="remove-card" data-action="remove" data-slot="${index}" ${mode !== 'planning' || pending ? 'disabled' : ''}>Remove</button>
        <span class="queue-dot-layer" aria-label="Card targets">${dotMarkup(slot.card, slot.target, 'queue', index)}</span>
      </div>${fixedChips}</div>`;
  }).join('');

  const handMarkup = () => {
    const layout = cardLayout(state.hand);
    const modifier = modifierSource();
    return state.hand.map((card) => {
      const visual = layout.get(card.uid)!;
      const definition = CARDS[card.definitionId];
      const target = pending?.uid === card.uid ? pending.target : null;
      const selected = selection?.kind === 'hand' && selection.uid === card.uid || pending?.uid === card.uid;
      const cardTarget = { kind: 'card', uid: card.uid } as const;
      const classes = `hand-hit${selected ? ' selected' : ''}${modifier?.uid === card.uid ? ' modifier-source' : attachmentClass(cardTarget)}`;
      return `<div class="${classes}" data-hand-card="${escapeHtml(card.uid)}" data-card-uid="${escapeHtml(card.uid)}" role="button" aria-disabled="${handDisabled(card)}" tabindex="${mode === 'planning' && (!modifier || modifier.uid === card.uid || attachmentAllowed(cardTarget)) ? 0 : -1}"
        style="--x:${visual.x}px;--y:${visual.y}px;--w:${visual.width}px;--h:${visual.height}px;--r:${visual.rotation}deg;--raised-x:${Math.round(visual.x + visual.width / 2 - HOVER_WIDTH / 2)}px" aria-label="${escapeHtml(definition.name)}, ${definition.cost} energy, ${escapeHtml(definition.description)}. ${definition.modifier ? 'Attachment: choose a compatible card or timing position.' : 'Drop near a timing point; obvious targets are automatic.'}">
        ${attachmentMarkup(cardAttachments(card.uid))}${dotMarkup(card, target, 'hand', card.uid)}
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
    if (mode !== 'ended' || state.phase !== 'victory' && state.phase !== 'defeat') return '';
    const victory = state.phase === 'victory';
    return `<div class="outcome-shade"><section class="outcome ${victory ? 'victory' : 'defeat'}" role="dialog" aria-modal="true" aria-labelledby="outcome-title"><span class="stamp">${victory ? 'AISLE SECURED' : 'SHIFT ENDED'}</span><h2 id="outcome-title">${victory ? 'Victory!' : 'Defeat'}</h2><p>${victory ? 'Bob survives another unreasonable customer interaction.' : 'The infected guard wins this round. Reset the aisle and try a new plan.'}</p><button class="primary" data-action="restart">Replay encounter</button></section></div>`;
  };

  const missingTargets = () => state.queue.filter((slot) => slot?.kind === 'player' && slot.target === null).length;
  const resolveReason = () => {
    if (pending) return CARDS[handCard(pending.uid)?.definitionId ?? '']?.modifier
      ? 'Choose a compatible card body or timing position. Escape cancels.'
      : 'Choose a timing position; insertion shifts player cards. Escape cancels.';
    const missing = missingTargets();
    return missing ? `${missing} queued card${missing === 1 ? ' needs' : 's need'} a target.` : '';
  };

  const render = () => {
    if (destroyed) return;
    const bob = state.actors.bob;
    const energy = availableEnergy(state, 'bob');
    const log = state.log.slice(-LOG_LIMIT);
    const blocked = resolveReason();
    const modifier = modifierSource();
    const showGuides = Boolean(selection || pending || drag);
    const activeSlot = firingSlot ?? state.activeSlot;
    root.classList.toggle('resolving', mode === 'resolving');
    root.innerHTML = `<header class="topbar ink-panel"><div><span class="eyebrow">CHAPTER 01 / NIGHT SHIFT</span><h1>STOP THE INVASION</h1></div><div class="turn-badge"><small>TURN</small><b>${state.turn}</b></div><button class="restart" data-action="restart" ${mode === 'resolving' ? 'disabled' : ''}>Restart</button></header>
      <main>${actorMarkup('bob')}${actorMarkup('guard')}
        <section class="timeline${pending ? ' pending-placement' : ''}${showGuides ? ' show-guides' : ''}${modifier ? ' attachment-targeting' : ''}" aria-label="Six timing positions, resolving right to left"><div class="timeline-title"><b>ACTION TIMELINE</b><span>${activeSlot === null ? (modifier ? 'CARD BODY = CARD · BELOW CARD = POSITION' : pending ? 'CHOOSE A TIMING POSITION' : 'RIGHTMOST FIRES FIRST · DROP NEAR A POINT') : `RESOLVING POSITION ${activeSlot + 1} · RIGHT TO LEFT`}</span></div>${queueMarkup()}</section>
        <section class="piles" aria-label="Card piles">${pileMarkup('draw', state.drawPile)}${pileMarkup('discard', state.discardPile)}</section>
        <section class="combat-log ink-panel" aria-label="Combat log"><h2>FIELD NOTES</h2><ol>${log.length ? log.map((line) => `<li>${escapeHtml(line)}</li>`).join('') : '<li>The aisle is quiet. For now.</li>'}</ol></section>
        <button class="resolve primary" data-action="resolve" aria-describedby="resolve-reason" ${mode !== 'planning' || state.phase !== 'planning' || blocked ? 'disabled' : ''}>Resolve Turn <span>${blocked || 'Execute right to left'}</span></button>
        <div id="resolve-reason" class="notice ${blocked || /cannot|need|invalid|occupied|locked/i.test(notice) ? 'warning' : ''}" role="status" aria-live="polite">${escapeHtml(notice)}</div>
        <div class="hand-zone${modifier ? ' attachment-targeting' : ''}" aria-label="Bob's hand">${handMarkup()}</div>
        <section class="energy-bar ink-panel" role="meter" aria-label="Bob's energy" aria-valuemin="0" aria-valuemax="${bob.energyMax}" aria-valuenow="${energy}" aria-valuetext="${energy} available, ${bob.energy - energy} reserved, capacity ${bob.energyMax}">
          <b>ENERGY</b><span class="energy-bubbles" aria-hidden="true">${Array.from({ length: bob.energyMax }, (_, index) => `<span class="energy-bubble ${index < energy ? 'available' : index < bob.energy ? 'reserved' : 'empty'}"></span>`).join('')}</span>
          <span class="energy-summary"><strong>${energy}</strong> available <small>${bob.energy - energy} reserved</small></span>
        </section>
      </main>${inspectorMarkup()}${outcomeMarkup()}`;
    scene.setState(state);
    scene.setCards(visualCards());
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
    root.classList.remove('physical-drag');
    drag = null;
  };

  const clearInteraction = (message?: string) => {
    clearCapture();
    selection = null;
    pending = null;
    hoveredUid = null;
    hoveredQueueSlot = null;
    scene.setTarget(null);
    root.querySelectorAll('.drop-hover,.drop-valid,.drop-invalid').forEach((element) => element.classList.remove('drop-hover', 'drop-valid', 'drop-invalid'));
    if (message) notice = message;
  };

  const beginPending = (uid: string, target: ActorId) => {
    const card = handCard(uid);
    if (!card || !canAfford(card)) return;
    if (!candidates(card).includes(target)) {
      notice = 'That actor is not a valid target for this card.';
      render();
      return;
    }
    selection = { kind: 'hand', uid };
    pending = { uid, target };
    notice = CARDS[card.definitionId].modifier
      ? `${state.actors[target].name} selected. Choose a bright card body or a timing position.`
      : `${state.actors[target].name} selected. Click any player timing position to insert the card.`;
    scene.setTarget(target);
    render();
  };

  const placeHandCard = (uid: string, target: ActorId | null, slot: number) => {
    const card = handCard(uid);
    if (!card) return;
    if (CARDS[card.definitionId].modifier) {
      notice = 'Attachments do not take a timeline slot. Choose a card body or timing position.';
      render();
      return;
    }
    const result = queueCard(state, uid, target, slot);
    const targetHint = result.ok && playerAction(slot)?.target === null ? ' Choose a target before resolving.' : '';
    feedback(result.ok, `${CARDS[card.definitionId].name} inserted at timing ${slot + 1}.${targetHint}`, result.reason);
  };

  const attachTo = (target: ModifierTarget, uid?: string) => {
    const source = uid ? handCard(uid) : modifierSource();
    if (!source) return;
    const definition = CARDS[source.definitionId];
    const result = attachModifier(state, source.uid, target);
    const binding = target.kind === 'card' ? 'card' : `timing position ${target.slot + 1}`;
    feedback(result.ok, `${definition.name} attached to ${binding}; it expires at turn end.`, result.reason);
  };

  const wait = (milliseconds: number) => new Promise<void>((resolve) => {
    const timer = window.setTimeout(() => { timers.delete(timer); resolve(); }, milliseconds);
    timers.set(timer, resolve);
  });

  const clearPlayback = () => {
    for (const [timer, finish] of timers) {
      clearTimeout(timer);
      finish();
    }
    timers.clear();
    firingCard = null;
    firingSlot = null;
    completedCards.clear();
  };

  const playResolution = async () => {
    if (mode !== 'planning' || state.phase !== 'planning') return;
    const blocked = resolveReason();
    if (blocked) { notice = blocked; render(); return; }
    const run = ++sequence;
    const steps = resolveTurn(state);
    mode = 'resolving';
    clearInteraction();
    notice = 'Hands off — the rightmost card fires first.';
    render();
    for (const step of steps) {
      if (destroyed || run !== sequence) return;
      const action = step.events.find((event) => event.kind === 'action');
      if (action && action.slot !== undefined && action.target) {
        const slot = step.state.queue[action.slot]!;
        const uid = slot.kind === 'enemy' ? slot.uid : slot.card.uid;
        const card = visualCards().find((visual) => visual.uid === uid)!;
        firingSlot = action.slot;
        firingCard = {
          ...card,
          x: card.x - card.width * .175,
          y: card.y - card.height * .175 - 80,
          width: card.width * 1.35,
          height: card.height * 1.35,
          rotation: 0,
          hovered: true,
          dimmed: false,
          queued: false,
          dragged: false,
        };
        notice = `Firing position ${action.slot + 1} at ${state.actors[action.target].name}.`;
        render();
        await wait(reduceMotion ? 0 : 150);
        if (destroyed || run !== sequence) return;
        firingCard = {
          ...firingCard,
          x: (action.target === 'bob' ? 410 : 1500) - firingCard.width / 2,
          y: 400 - firingCard.height / 2,
        };
        scene.setCards(visualCards());
        await wait(reduceMotion ? 0 : 360);
        if (destroyed || run !== sequence) return;
      }
      if (step.state.activeSlot === null) completedCards.clear();
      state = step.state;
      notice = step.events.length ? step.events.map((event) => event.message).join(' ') : 'Advancing the timeline.';
      render();
      for (const event of step.events) scene.playEvent(event);
      if (firingCard) {
        await wait(reduceMotion ? 60 : 130);
        if (destroyed || run !== sequence) return;
        firingCard = { ...firingCard, x: DESIGN_WIDTH + firingCard.width };
        scene.setCards(visualCards());
        await wait(reduceMotion ? 0 : 380);
        if (destroyed || run !== sequence) return;
        completedCards.add(firingCard.uid);
        firingCard = null;
        firingSlot = null;
        render();
      }
    }
    mode = state.phase === 'planning' ? 'planning' : 'ended';
    notice = state.phase === 'planning' ? `Turn ${state.turn}: arrange the next six timings.` : (state.phase === 'victory' ? 'Aisle secured. Victory.' : 'Bob is down. Defeat.');
    render();
  };

  const restart = () => {
    sequence++;
    clearPlayback();
    clearInteraction();
    state = createCombat(state.seed);
    mode = 'planning';
    inspector = null;
    notice = 'Encounter reset. Insert a card at any player timing, or choose its target first.';
    render();
  };

  const designPoint = (event: PointerEvent) => {
    const rect = root.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * DESIGN_WIDTH / rect.width, y: (event.clientY - rect.top) * DESIGN_HEIGHT / rect.height };
  };
  const hitAt = (event: PointerEvent) => document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
  const queueSlotAt = ({ x, y }: { x: number; y: number }): number | null => {
    if (y < QUEUE_HIT_TOP || y > QUEUE_HIT_BOTTOM || x < QUEUE_FIRST_X || x > queueCardX(SLOT_COUNT - 1) + QUEUE_CARD_WIDTH) return null;
    let nearest: number | null = null;
    let distance = Infinity;
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      if (state.queue[slot]?.kind === 'enemy') continue;
      const nextDistance = Math.abs(x - (queueCardX(slot) + QUEUE_CARD_WIDTH / 2));
      if (nextDistance <= distance) {
        nearest = slot;
        distance = nextDistance;
      }
    }
    return nearest;
  };
  const attachmentTargetAt = (element: HTMLElement | null): ModifierTarget | null => {
    const outline = element?.closest<HTMLElement>('[data-attachment-slot]');
    if (outline) return { kind: 'slot', slot: Number(outline.dataset.attachmentSlot) };
    const card = element?.closest<HTMLElement>('[data-card-uid]');
    if (card) return { kind: 'card', uid: card.dataset.cardUid! };
    const empty = element?.closest<HTMLElement>('.queue-slot.empty[data-slot]');
    return empty ? { kind: 'slot', slot: Number(empty.dataset.slot) } : null;
  };

  const setDragDestination = (destination: number | null) => {
    if (!drag || drag.destination === destination) return;
    drag.destination = destination;
    drag.preview = destination === null ? null : previewPlacement(state, drag.uid, null, destination);
  };


  const updateDrag = (event: PointerEvent) => {
    if (!drag) return;
    const point = designPoint(event);
    drag.x = point.x;
    drag.y = point.y;
    scene.setPointer(point.x, point.y);
    const hit = hitAt(event);
    const card = handCard(drag.uid);
    const draggingModifier = Boolean(card && CARDS[card.definitionId].modifier);
    if (draggingModifier) {
      drag.destination = null;
      drag.preview = null;
      drag.attachmentTarget = attachmentTargetAt(hit);
    } else {
      drag.attachmentTarget = null;
      setDragDestination(queueSlotAt(point));
    }
    root.querySelectorAll<HTMLElement>('.queue-slot').forEach((element) => {
      const slot = Number(element.dataset.slot);
      const marker = element.querySelector<HTMLElement>('.empty-position-marker');
      if (marker) marker.hidden = Boolean((drag?.preview ?? state.queue)[slot]) && !(drag?.preview && slot === drag.destination);
      const over = !draggingModifier && slot === drag?.destination;
      element.classList.toggle('drop-valid', over && drag?.preview !== null);
      element.classList.toggle('drop-invalid', over && drag?.preview === null);
    });
    root.querySelectorAll<HTMLElement>('[data-card-uid],[data-attachment-slot]').forEach((element) => {
      const candidate = attachmentTargetAt(element);
      const activeTarget = drag?.attachmentTarget;
      const hovered = Boolean(draggingModifier && candidate && activeTarget && candidate.kind === activeTarget.kind &&
        (candidate.kind === 'card' && activeTarget.kind === 'card' ? candidate.uid === activeTarget.uid :
          candidate.kind === 'slot' && activeTarget.kind === 'slot' && candidate.slot === activeTarget.slot));
      element.classList.toggle('drop-hover', hovered);
    });
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
      } else if (action === 'remove-attachment' && mode === 'planning') {
        const card = actionElement.dataset.card!;
        const result = removeModifier(state, card);
        feedback(result.ok, 'Attachment returned to hand and its reserved energy was refunded.', result.reason);
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
    const modifier = modifierSource();
    if (modifier) {
      const attachmentTarget = attachmentTargetAt(target);
      if (attachmentTarget) {
        attachTo(attachmentTarget);
        return;
      }
    }
    const handElement = target.closest<HTMLElement>('[data-hand-card]');
    if (handElement) {
      const selectedCard = handCard(handElement.dataset.handCard!);
      if (!selectedCard || !canAfford(selectedCard)) return;
      pending = null;
      selection = { kind: 'hand', uid: selectedCard.uid };
      const definition = CARDS[selectedCard.definitionId];
      notice = definition.modifier
        ? 'Attachment selected. Choose a compatible card body or timing position.'
        : 'Card selected. Choose any player timing position.';
      scene.setTarget(null);
      render();
      return;
    }
    const slotElement = target.closest<HTMLElement>('[data-slot]');
    if (!slotElement) {
      if (selection || pending) {
        clearInteraction('Selection canceled. No energy was spent.');
        render();
      }
      return;
    }
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
      feedback(result.ok, `Inserted card at timing ${to + 1}.`, result.reason);
    } else if (playerAction(to)) {
      selection = { kind: 'queue', slot: to };
      notice = 'Queued card selected. Choose another player timing to insert it and shift neighboring cards.';
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
    if ((event.key !== 'Enter' && event.key !== ' ') || event.target instanceof HTMLButtonElement) return;
    const element = (event.target as HTMLElement).closest<HTMLElement>('[role="button"]');
    if (!element || element instanceof HTMLButtonElement) return;
    event.preventDefault();
    element.click();
  };

  const onPointerDown = (event: PointerEvent) => {
    if (mode !== 'planning' || event.button > 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('[data-action], .target-dot, [data-attachment-slot]')) return;
    const hand = target.closest<HTMLElement>('[data-hand-card]');
    const queue = target.closest<HTMLElement>('.queue-card[data-slot]');
    if (pending) return;
    const activeModifier = modifierSource();
    if (activeModifier && (queue || hand?.dataset.handCard !== activeModifier.uid)) return;
    if (!hand && !queue) return;
    const slot = queue ? Number(queue.dataset.slot) : undefined;
    const action = slot === undefined ? null : playerAction(slot);
    const uid = hand?.dataset.handCard ?? action?.card.uid;
    if (!uid) return;
    const source = handCard(uid);
    if (hand && (!source || !canAfford(source))) return;
    event.preventDefault();
    pending = null;
    const point = designPoint(event);
    const capture = hand ?? queue!;
    const fallback = hand
      ? cardLayout(state.hand).get(uid)!
      : queueCardPose(slot!);
    const pose = scene.getCardPose(uid) ?? fallback;
    drag = {
      kind: hand ? 'hand' : 'queue',
      uid,
      slot,
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      x: point.x,
      y: point.y,
      moved: false,
      capture,
      pose,
      destination: null,
      preview: null,
      attachmentTarget: null,
    };
    hoveredUid = null;
    hoveredQueueSlot = null;
    root.classList.add('physical-drag');
    const draggingModifier = Boolean(source && CARDS[source.definitionId].modifier);
    root.querySelector('.timeline')?.classList.add('show-guides');
    if (draggingModifier) {
      root.querySelector('.timeline')?.classList.add('attachment-targeting');
      root.querySelector('.hand-zone')?.classList.add('attachment-targeting');
    }
    root.querySelectorAll<HTMLElement>('[data-card-uid],[data-attachment-slot]').forEach((element) => {
      const candidate = attachmentTargetAt(element);
      if (!candidate) return;
      const valid = draggingModifier && canAttachModifier(state, uid, candidate);
      element.classList.toggle('attachment-valid', valid);
      element.classList.toggle('attachment-invalid', draggingModifier && !valid);
      if (element instanceof HTMLButtonElement) element.disabled = draggingModifier && !valid;
    });
    capture.setPointerCapture?.(event.pointerId);
    scene.setCards(visualCards());
  };

  const onPointerMove = (event: PointerEvent) => {
    const point = designPoint(event);
    scene.setPointer(point.x, point.y);
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.hypot(point.x - drag.startX, point.y - drag.startY) > 7) drag.moved = true;
    updateDrag(event);
  };

  const finishPointer = (event: PointerEvent, cancelled = false) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const finished = drag;
    if (finished.capture.hasPointerCapture?.(finished.pointerId)) finished.capture.releasePointerCapture(finished.pointerId);
    root.classList.remove('physical-drag');
    drag = null;
    scene.setTarget(null);
    root.querySelectorAll('.drop-hover,.drop-valid,.drop-invalid').forEach((element) => element.classList.remove('drop-hover', 'drop-valid', 'drop-invalid'));
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
    timers.set(timer, () => { suppressClick = false; });
    const source = handCard(finished.uid);
    if (source && CARDS[source.definitionId].modifier) {
      if (finished.attachmentTarget) {
        attachTo(finished.attachmentTarget, finished.uid);
      } else {
        selection = null;
        pending = null;
        notice = 'Drop canceled. Choose a compatible card body or timing position.';
        render();
      }
      return;
    }
    if (finished.destination === null || finished.preview === null) {
      selection = null;
      pending = null;
      notice = finished.destination === null ? 'Drop canceled. Drop near a timing position.' : 'That timing cannot accept this card.';
      render();
      return;
    }
    if (finished.kind === 'hand') {
      placeHandCard(finished.uid, null, finished.destination);
    } else {
      const result = moveCard(state, finished.slot!, finished.destination);
      feedback(result.ok, `Inserted card at timing ${finished.destination + 1}.`, result.reason);
    }
  };

  const onPointerOver = (event: PointerEvent) => {
    if (drag) return;
    const target = event.target as HTMLElement;
    const hand = target.closest<HTMLElement>('[data-hand-card]');
    const queue = target.closest<HTMLElement>('.queue-slot[data-slot]');
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
    if (drag) return;
    const target = event.target as HTMLElement;
    const related = event.relatedTarget as Node | null;
    const dot = target.closest<HTMLElement>('.target-dot');
    const hand = target.closest<HTMLElement>('[data-hand-card]');
    const queue = target.closest<HTMLElement>('.queue-slot[data-slot]');
    if (dot && !dot.contains(related)) scene.setTarget(pending?.target ?? null);
    let changed = false;
    if (hand && !hand.contains(related)) { hoveredUid = null; changed = true; }
    if (queue && !queue.contains(related)) { hoveredQueueSlot = null; changed = true; }
    if (changed) scene.setCards(visualCards());
  };

  const onFocusIn = (event: FocusEvent) => {
    const target = event.target as HTMLElement;
    const dot = target.closest<HTMLElement>('.target-dot');
    const queue = target.closest<HTMLElement>('.queue-slot[data-slot]');
    if (dot) scene.setTarget(dot.dataset.target as ActorId);
    if (queue) {
      hoveredQueueSlot = Number(queue.dataset.slot);
      scene.setCards(visualCards());
    }
  };
  const onFocusOut = (event: FocusEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest('.target-dot')) scene.setTarget(pending?.target ?? null);
    const queue = target.closest<HTMLElement>('.queue-slot[data-slot]');
    if (queue && !queue.contains(event.relatedTarget as Node | null)) {
      hoveredQueueSlot = null;
      scene.setCards(visualCards());
    }
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
      clearPlayback();
      clearInteraction();
      listeners.abort();
      root.replaceChildren();
      scene.setTarget(null);
      scene.setCards([]);
    },
  };
}

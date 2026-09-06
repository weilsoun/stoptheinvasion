import { attachModifier, availableEnergy, canAttachModifier, createCombat, damageModifier, moveCard, previewPlacement, queueCard, removeCard, removeModifier, resolveTurn } from './game/combat';
import { CARDS } from './game/content';
import type { ActorId, CardDefinition, CardInstance, EnemyAction, ModifierTarget, PlayerAction, QueueSlot } from './game/types';
import type { CardVisual, ScenePort } from './view/types';

type Selection = { kind: 'hand'; uid: string } | { kind: 'queue'; slot: number } | null;
type PendingPlacement = { uid: string; target: ActorId };
type PileKind = 'draw' | 'discard';
type CardDetail = {
  uid: string;
  cardUid: string;
  definition: CardDefinition;
  source: 'hand' | 'queue' | 'enemy' | 'attachment';
  slot: number | null;
  target: ActorId | null;
  returnFocus: string;
};
type Drag = {
  kind: 'hand' | 'queue' | 'attachment';
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
type Mode = 'dealing' | 'planning' | 'resolving' | 'ended';
export interface GamePort {
  destroy(): void;
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 1080;
const LOG_LIMIT = 7;
const SLOT_COUNT = 6;
const QUEUE_CARD_WIDTH = 172;
const QUEUE_CARD_HEIGHT = 241;
const QUEUE_CARD_Y = 350;
const QUEUE_CARD_STRIDE = 132;
const QUEUE_FIRST_X = 960 - QUEUE_CARD_STRIDE * (SLOT_COUNT - 1) / 2 - QUEUE_CARD_WIDTH / 2;
const QUEUE_HIT_TOP = QUEUE_CARD_Y - 40;
const QUEUE_HIT_BOTTOM = QUEUE_CARD_Y + 290;
const HAND_BOTTOM = 1008;
const HOVER_WIDTH = 280;
const HOVER_HEIGHT = 392;
const HOVER_Y = HAND_BOTTOM - HOVER_HEIGHT;
const DETAIL = { x: 720, y: 180, width: 480, height: 672 };
const DRAW_PILE = { x: 300, y: 840, width: 96, height: 134, rotation: 0, flip: 180 };
const DISCARD_PILE = { x: 1524, y: 840, width: 96, height: 134, rotation: 0, flip: 0 };
const PILE_PAGE_SIZE = 15;
const PILE_COLUMNS = 5;
const PILE_CARD_WIDTH = 180;
const PILE_CARD_HEIGHT = 252;
const PILE_COLUMN_GAP = 24;
const PILE_ROW_GAP = 18;
const PILE_GRID_TOP = 190;
const PILE_GRID_LEFT = (DESIGN_WIDTH - PILE_COLUMNS * PILE_CARD_WIDTH - (PILE_COLUMNS - 1) * PILE_COLUMN_GAP) / 2;
const escapeHtml = (value: string | number) => String(value).replace(/[&<>'"]/g, (character) => HTML_ESCAPES[character]);

function effectText(effects: { kind: string; amount: number }[]): string {
  return effects.map(({ kind, amount }) => `${amount} ${kind}`).join(' / ');
}

function cardLayout(hand: CardInstance[]): Map<string, CardVisual> {
  const count = hand.length;
  const width = count > 6 ? 148 : 172;
  const height = Math.round(width * 1.4);
  const gap = count < 2 ? 0 : Math.min(width - 18, 800 / (count - 1));
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

function pileCardPosition(index: number): { x: number; y: number } {
  return {
    x: PILE_GRID_LEFT + index % PILE_COLUMNS * (PILE_CARD_WIDTH + PILE_COLUMN_GAP),
    y: PILE_GRID_TOP + Math.floor(index / PILE_COLUMNS) * (PILE_CARD_HEIGHT + PILE_ROW_GAP),
  };
}

export function mountGame(root: HTMLElement, scene: ScenePort): GamePort {
  let state = createCombat();
  let mode: Mode = 'dealing';
  let selection: Selection = null;
  let pending: PendingPlacement | null = null;
  let drag: Drag | null = null;
  let hoveredUid: string | null = null;
  let hoveredQueueSlot: number | null = null;
  let inspector: PileKind | null = null;
  let inspectorPage = 0;
  let inspectorSerial = 0;
  let detail: CardDetail | null = null;
  let menuOpen = false;
  let focusAfterRender: string | null = null;
  let menuReturnFocus = '.menu-trigger';
  let notice = 'Place actions directly. Attachments target a compatible card or timing position.';
  let destroyed = false;
  let sequence = 0;
  let firingCard: CardVisual | null = null;
  let firingSlot: number | null = null;
  const completedCards = new Set<string>();
  let detailSerial = 0;
  const discardedCards = new Set<string>();
  const inFlight = new Map<string, CardVisual>();
  const attachmentExitOrigins = new Map<string, Pick<CardVisual, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'flip'>>();
  const lingeringAttachments = new Map<string, CardVisual>();
  let suppressClick = false;
  const timers = new Map<number, () => void>();
  const listeners = new AbortController();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  root.className = 'game-hud';
  root.setAttribute('aria-label', 'MOREMART combat controls');
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

  const targetChoices = (card: CardInstance): ActorId[] =>
    CARDS[card.definitionId].modifier ? [] : candidates(card).length > 1 ? candidates(card) : [];

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
  const enemyDefinition = (action: EnemyAction): CardDefinition => {
    const kind = action.effects[0]?.kind;
    return {
      id: `intent:${action.actor}:${action.name}:${action.effects.map(({ kind: effectKind, amount, recipient }) => `${effectKind}-${amount}-${recipient}`).join(':')}`,
      name: action.name,
      cost: 0,
      type: kind === 'damage' ? 'attack' : 'skill',
      target: action.target === action.actor ? 'self' : 'enemy',
      description: action.description,
      flavor: `${kind === 'heal' ? 'Restores' : 'Targets'} ${state.actors[action.target].name}.`,
      icon: kind === 'heal' ? 'shield' : kind === 'exposed' ? 'tape' : 'boot',
      effects: action.effects,
    };
  };

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
  const attachedCard = (uid: string) => state.attachments.find(({ card }) => card.uid === uid)?.card ?? null;
  const attachmentMarkup = (attachments: typeof state.attachments) => attachments.map(({ card, target }, index) => {
    const amount = CARDS[card.definitionId].modifier!.damage;
    const binding = target.kind === 'card' ? 'card' : 'position';
    return `<button class="attachment-chip ${binding}" style="--chip:${index}" data-action="remove-attachment" data-card="${escapeHtml(card.uid)}"
      aria-disabled="${mode !== 'planning'}" ${mode !== 'planning' ? 'disabled' : ''} aria-label="Remove ${escapeHtml(CARDS[card.definitionId].name)}, ${amount >= 0 ? 'plus' : 'minus'} ${Math.abs(amount)} damage, bound to ${binding}, expires this turn">${amount >= 0 ? '+' : ''}${amount} ${binding} · this turn ×</button>`;
  }).join('');
  const attachmentTabsMarkup = (hostUid: string, hostName: string, pose: Pick<CardVisual, 'x' | 'y' | 'width' | 'height'>, slotX: number) => cardAttachments(hostUid).map(({ card }, index) => {
    const definition = CARDS[card.definitionId];
    const amount = definition.modifier!.damage;
    const header = 52 * pose.width / QUEUE_CARD_WIDTH;
    return `<button class="attachment-tab" style="--tab-x:${pose.x - slotX}px;--tab-y:${pose.y - (QUEUE_CARD_Y - 6) - header * (index + 1)}px;--tab-w:${pose.width}px;--tab-h:${header}px" data-card="${escapeHtml(card.uid)}" data-card-uid="${escapeHtml(card.uid)}"
      aria-label="Inspect ${escapeHtml(definition.name)}, ${amount >= 0 ? 'plus' : 'minus'} ${Math.abs(amount)} damage, attached to ${escapeHtml(hostName)}. Drag to return it to hand and refund its energy."></button>`;
  }).join('');

  const draggedPosition = (held: Drag) => ({
    x: held.x - held.pose.width / 2,
    y: held.y - held.pose.height / 2,
  });

  const pileInspectorState = () => {
    if (!inspector) return null;
    const cards = inspector === 'draw' ? state.drawPile : state.discardPile;
    const pageCount = Math.max(1, Math.ceil(cards.length / PILE_PAGE_SIZE));
    inspectorPage = Math.max(0, Math.min(inspectorPage, pageCount - 1));
    const start = inspectorPage * PILE_PAGE_SIZE;
    return {
      cards,
      pageCount,
      start,
      visibleCards: cards.slice(start, start + PILE_PAGE_SIZE),
      title: inspector === 'draw' ? 'Draw pile' : 'Discard pile',
    };
  };

  const visualCards = (): CardVisual[] => {
    const hand = cardLayout(state.hand);
    const heldUid = drag?.uid ?? null;
    const modifier = modifierSource();
    for (const [uid, visual] of hand) {
      if (uid === heldUid || inFlight.has(uid)) {
        hand.delete(uid);
        continue;
      }
      const card = handCard(uid)!;
      const isSource = modifier?.uid === uid;
      visual.targets = targetChoices(card);
      visual.target = pending?.uid === uid ? pending.target : null;
      visual.damageModifier = damageModifier(state, uid, null);
      visual.hovered = uid === hoveredUid && (!modifier || !isSource && attachmentAllowed({ kind: 'card', uid }));
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
    const pushHost = (host: CardVisual) => {
      const attachments = cardAttachments(host.uid)
        .filter(({ card }) => (drag?.kind !== 'attachment' || card.uid !== drag.uid) && !lingeringAttachments.has(card.uid))
        .map(({ card }, index) => ({
          uid: card.uid,
          definition: CARDS[card.definitionId],
          x: host.x,
          y: host.y - 52 * host.width / QUEUE_CARD_WIDTH * (index + 1),
          width: host.width,
          height: host.height,
          rotation: host.rotation,
          hovered: host.hovered,
          dimmed: false,
          damageModifier: 0,
          queued: true,
          dragged: false,
          locked: false,
          target: null,
          targets: [],
          underCard: host.uid,
          flip: host.flip ?? 0,
        } satisfies CardVisual));
      queued.push(...attachments.reverse(), host);
    };
    const plan = presentedQueue();
    plan.forEach((slot, index) => {
      if (!slot) return;
      const isEnemy = slot.kind === 'enemy';
      const uid = isEnemy ? slot.uid : slot.card.uid;
      if (uid === heldUid || inFlight.has(uid)) return;
      const pose = queueCardPose(index, plan);
      pushHost({
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
        flip: 0,
      });
    });
    if (firingCard) pushHost(firingCard);

    if (drag) {
      const card = handCard(drag.uid) ?? queuedCard(drag.uid) ?? attachedCard(drag.uid);
      if (card) {
        const action = state.queue.find((slot): slot is PlayerAction => slot?.kind === 'player' && slot.card.uid === heldUid);
        const proposedSlot = drag.destination ?? (drag.kind === 'queue' ? drag.slot! : null);
        const visual: CardVisual = {
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
          targets: drag.kind === 'attachment' ? [] : targetChoices(card),
          flip: 0,
        };
        if (drag.kind === 'queue') pushHost(visual);
        else queued.push(visual);
      }
    }

    const pileCards = (cards: CardInstance[], pose: typeof DRAW_PILE, faceDown: boolean) =>
      cards.slice(-3).map((card, index, visible): CardVisual => ({
        uid: card.uid,
        definition: CARDS[card.definitionId],
        x: pose.x + index * 3,
        y: pose.y - index * 3,
        width: pose.width,
        height: pose.height,
        rotation: index - (visible.length - 1) / 2,
        hovered: false,
        dimmed: false,
        damageModifier: 0,
        queued: false,
        dragged: false,
        locked: false,
        target: null,
        targets: [],
        flip: faceDown ? 180 : 0,
      })).filter((visual) => !inFlight.has(visual.uid));
    const physical = [
      ...pileCards(state.drawPile, DRAW_PILE, true),
      ...pileCards(state.discardPile, DISCARD_PILE, true),
      ...queued,
      ...hand.values(),
      ...lingeringAttachments.values(),
      ...inFlight.values(),
    ];
    const inspected = pileInspectorState();
    if (inspected) physical.push(...inspected.visibleCards.map((card, index): CardVisual => ({
      uid: `pile-inspector:${inspectorSerial}:${inspected.start + index}:${card.uid}`,
      definition: CARDS[card.definitionId],
      ...pileCardPosition(index),
      width: PILE_CARD_WIDTH,
      height: PILE_CARD_HEIGHT,
      rotation: 0,
      hovered: false,
      dimmed: false,
      damageModifier: 0,
      queued: false,
      dragged: false,
      locked: false,
      target: null,
      targets: [],
      detail: true,
      flip: 0,
    })));
    else if (detail) physical.push({
      uid: detail.uid,
      definition: detail.definition,
      ...DETAIL,
      rotation: 0,
      hovered: true,
      dimmed: false,
      damageModifier: detail.slot === null ? damageModifier(state, detail.cardUid, null) : damageModifier(state, detail.cardUid, detail.slot),
      queued: false,
      dragged: false,
      locked: detail.source === 'enemy',
      target: detail.target,
      targets: [],
      detail: true,
      flip: 0,
    });
    return physical.sort((a, b) => Number(a.hovered || a.dragged || a.detail) - Number(b.hovered || b.dragged || b.detail));
  };

  const pileMarkup = (kind: 'draw' | 'discard', cards: CardInstance[]) => {
    const label = kind === 'draw' ? 'Draw pile' : 'Discard pile';
    return `<button class="pile-button pile-${kind}" data-action="inspect" data-pile="${kind}" aria-label="Inspect ${label}, ${cards.length} cards"><b>${cards.length}</b><span>${label}</span></button>`;
  };

  const actorMarkup = (actorId: ActorId) => {
    const actor = state.actors[actorId];
    return `<section class="actor-target ${actorId === 'bob' ? 'actor-bob' : 'actor-guard'}"
      aria-label="${escapeHtml(actor.name)}. ${actor.hp} of ${actor.maxHp} health, ${actor.block} block, ${actor.exposed} exposed">
      <span class="actor-name">${escapeHtml(actor.name)}</span>
      <span class="hp-line"><span class="hp-fill" style="--hp:${Math.max(0, actor.hp / actor.maxHp)}"></span><b>${actor.hp}</b> / ${actor.maxHp} HP</span>
      <span class="actor-status"><span>BLOCK <b>${actor.block}</b></span><span>EXPOSED <b>${actor.exposed}</b></span></span>
    </section>`;
  };

  const returnFocusSelector = (element: Element | null): string => {
    const hand = element?.closest<HTMLElement>('[data-hand-card]');
    if (hand?.dataset.handCard) return `[data-hand-card="${CSS.escape(hand.dataset.handCard)}"]`;
    const card = element?.closest<HTMLElement>('[data-card-uid]');
    if (card?.dataset.cardUid) return `[data-card-uid="${CSS.escape(card.dataset.cardUid)}"]`;
    const pile = element?.closest<HTMLElement>('.pile-button[data-pile]');
    if (pile?.dataset.pile) return `.pile-button[data-pile="${CSS.escape(pile.dataset.pile)}"]`;
    if (element?.closest('.resolve')) return '.resolve';
    if (element?.closest('.actor-bob, .actor-guard')) return '.menu-trigger';
    return '.menu-trigger';
  };


  const queueMarkup = () => presentedQueue().map((slot, index, queue) => {
    const active = state.activeSlot === index ? ' active' : '';
    const selected = '';
    const pose = queueCardPose(index, queue);
    const position = `style="--slot-x:${queueCardX(index)}px;--slot-y:${QUEUE_CARD_Y - 6}px;--slot-z:${index};--card-x:${pose.x - queueCardX(index)}px;--card-y:${pose.y - (QUEUE_CARD_Y - 6)}px;--card-w:${pose.width}px;--card-h:${pose.height}px"`;
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
    const cardTabs = attachmentTabsMarkup(uid, slot.kind === 'enemy' ? slot.name : CARDS[slot.card.definitionId].name, pose, queueCardX(index));
    if (slot.kind === 'enemy') {
      const delta = damageModifier(state, uid, index);
      const baseDamage = slot.effects.filter(({ kind, recipient }) => kind === 'damage' && recipient === 'target').reduce((total, { amount }) => total + amount, 0);
      const modifiedDamage = Math.max(0, baseDamage + delta);
      return `<div class="queue-slot enemy locked${active}" data-slot="${index}" ${position}>
        ${marker}${frame}${cardTabs}<div class="queue-card-body${attachmentClass(cardTarget)}" data-card-uid="${escapeHtml(uid)}" role="button" tabindex="${mode === 'planning' && (!modifierSource() || attachmentAllowed(cardTarget)) ? 0 : -1}"
          aria-label="Timing position ${index + 1}, locked enemy action ${escapeHtml(slot.name)}. ${escapeHtml(slot.description)} ${escapeHtml(effectText(slot.effects))} to ${escapeHtml(state.actors[slot.target].name)}${delta ? `. Modified damage ${baseDamage} to ${modifiedDamage}` : ''}"></div>${fixedChips}</div>`;
    }
    const definition = CARDS[slot.card.definitionId];
    const targetName = slot.target === null ? 'missing' : state.actors[slot.target].name;
    const delta = damageModifier(state, uid, index);
    return `<div class="queue-slot player queue-card${active}${selected}${slot.target === null ? ' missing' : ''}" data-slot="${index}" ${position}>
      ${marker}${frame}${cardTabs}<div class="queue-card-body${attachmentClass(cardTarget)}" data-card-uid="${escapeHtml(uid)}" role="button" tabindex="${mode === 'planning' && (!modifierSource() || attachmentAllowed(cardTarget)) ? 0 : -1}"
        aria-label="Inspect timing position ${index + 1}, Bob card ${escapeHtml(definition.name)}, cost ${definition.cost}, target ${escapeHtml(targetName)}${delta ? `, damage modifier ${delta}` : ''}">
      </div>${fixedChips}</div>`;
  }).join('');

  const handMarkup = () => {
    const layout = cardLayout(state.hand);
    const modifier = modifierSource();
    return state.hand.filter((card) => !inFlight.has(card.uid)).map((card) => {
      const visual = layout.get(card.uid)!;
      const definition = CARDS[card.definitionId];
      const selected = selection?.kind === 'hand' && selection.uid === card.uid || pending?.uid === card.uid;
      const cardTarget = { kind: 'card', uid: card.uid } as const;
      const classes = `hand-hit${selected ? ' selected' : ''}${modifier?.uid === card.uid ? ' modifier-source' : attachmentClass(cardTarget)}`;
      return `<div class="${classes}" data-hand-card="${escapeHtml(card.uid)}" data-card-uid="${escapeHtml(card.uid)}" role="button" aria-disabled="${mode !== 'planning' || Boolean(modifier && modifier.uid !== card.uid && !attachmentAllowed(cardTarget))}" tabindex="${mode === 'planning' && (!modifier || modifier.uid === card.uid || attachmentAllowed(cardTarget)) ? 0 : -1}"
        style="--x:${visual.x}px;--y:${visual.y}px;--w:${visual.width}px;--h:${visual.height}px;--r:${visual.rotation}deg;--raised-x:${Math.round(visual.x + visual.width / 2 - HOVER_WIDTH / 2)}px" aria-label="Inspect ${escapeHtml(definition.name)}, ${definition.cost} energy, ${escapeHtml(definition.description)}">
        ${attachmentMarkup(cardAttachments(card.uid))}
      </div>`;
    }).join('');
  };

  const inspectorMarkup = () => {
    const visible = pileInspectorState();
    if (!visible) return '';
    const items = visible.visibleCards.length
      ? visible.visibleCards.map((card, index) => {
        const definition = CARDS[card.definitionId];
        const position = pileCardPosition(index);
        const label = `${definition.name}, ${definition.cost} energy, ${definition.description}`;
        return `<li style="--pile-x:${position.x}px;--pile-y:${position.y}px;--pile-w:${PILE_CARD_WIDTH}px;--pile-h:${PILE_CARD_HEIGHT}px" aria-label="${escapeHtml(label)}"></li>`;
      }).join('')
      : '<li class="pile-empty">No cards here.</li>';
    const pagination = visible.pageCount > 1
      ? `<nav class="pile-pagination" aria-label="Pile pages"><button data-action="pile-prev"${inspectorPage === 0 ? ' disabled' : ''}>Previous</button><span>Page ${inspectorPage + 1} of ${visible.pageCount}</span><button data-action="pile-next"${inspectorPage === visible.pageCount - 1 ? ' disabled' : ''}>Next</button></nav>`
      : '';
    return `<div class="inspector-shade pile-inspector-shade"><section class="pile-inspector" role="dialog" aria-modal="true" aria-labelledby="pile-inspector-title" aria-describedby="pile-inspector-summary"><header><div><h2 id="pile-inspector-title">${visible.title}</h2><p id="pile-inspector-summary">${visible.cards.length} card${visible.cards.length === 1 ? '' : 's'}</p></div><button data-action="close-inspector" aria-label="Close ${visible.title}">Close</button></header><ol aria-label="${visible.title} cards">${items}</ol>${pagination}</section></div>`;
  };

  const detailMarkup = () => {
    if (!detail) return '';
    const sourceCard = detail.source === 'hand' ? handCard(detail.cardUid) : null;
    const delta = damageModifier(state, detail.cardUid, detail.slot);
    let actions = '';
    if (sourceCard) {
      actions = `<button data-action="detail-play" ${canAfford(sourceCard) ? '' : 'disabled'}>${detail.definition.modifier ? 'Attach' : 'Queue card'}</button>`;
    } else if (detail.source === 'queue') {
      actions = '<button data-action="detail-move">Move card</button>';
    } else if (detail.source === 'attachment') {
      actions = '<button class="detail-refund" data-action="detail-refund">Refund attachment</button>';
    }
    return `<div class="card-detail-shade"><section class="card-detail-controls" role="dialog" aria-modal="true" aria-labelledby="card-detail-title" aria-describedby="card-detail-description">
      <h2 id="card-detail-title" class="sr-only">${escapeHtml(detail.definition.name)}</h2>
      <p id="card-detail-description" class="sr-only">${detail.definition.cost} energy. ${escapeHtml(detail.definition.description)}${delta ? ` Damage changes by ${delta > 0 ? '+' : ''}${delta} this turn.` : ''}${detail.source === 'queue' ? ' Press Delete to return this card to hand.' : ''}</p>
      ${actions}<button class="detail-close" data-action="close-card-detail">Close</button>
    </section></div>`;
  };

  const menuMarkup = () => menuOpen ? `<div class="menu-shade"><section class="game-menu" role="dialog" aria-modal="true" aria-labelledby="menu-title" aria-describedby="menu-note">
    <span class="eyebrow">GAME MENU</span><h2 id="menu-title">Take a breather</h2><p id="menu-note">Combat does not pause while this menu is open.</p>
    <div class="menu-actions"><button class="primary" data-action="close-menu">Return to game</button><button class="menu-restart" data-action="restart">Restart encounter</button></div>
  </section></div>` : '';

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
    const focusedMenuAction = menuOpen ? root.querySelector<HTMLElement>('.game-menu button:focus')?.dataset.action : null;
    const bob = state.actors.bob;
    const energy = availableEnergy(state, 'bob');
    const log = state.log.slice(-LOG_LIMIT);
    const blocked = resolveReason();
    const modifier = modifierSource();
    const showGuides = Boolean(selection || pending || drag);
    const hasCardTabs = presentedQueue().some((slot) => {
      const uid = slot?.kind === 'enemy' ? slot.uid : slot?.kind === 'player' ? slot.card.uid : null;
      return Boolean(uid && cardAttachments(uid).length);
    });
    const activeSlot = firingSlot ?? state.activeSlot;
    root.classList.toggle('resolving', mode === 'resolving');
    root.classList.toggle('detail-open', Boolean(detail));
    root.classList.toggle('inspector-open', Boolean(inspector));
    root.innerHTML = `<div class="hud-controls" aria-label="Turn and menu"><div class="turn-badge"><small>TURN</small><b>${state.turn}</b></div><button class="menu-trigger" data-action="open-menu" aria-haspopup="dialog">Menu</button></div>
      <main>${actorMarkup('bob')}${actorMarkup('guard')}
        <section class="timeline${pending ? ' pending-placement' : ''}${showGuides ? ' show-guides' : ''}${modifier ? ' attachment-targeting' : ''}${hasCardTabs ? ' has-card-tabs' : ''}" aria-label="Six timing positions, resolving right to left"><div class="timeline-title"><b>ACTION TIMELINE</b><span>${activeSlot === null ? (modifier ? 'CARD BODY = CARD · BELOW CARD = POSITION' : pending ? 'CHOOSE A TIMING POSITION' : 'RIGHTMOST FIRES FIRST · DROP NEAR A POINT') : `RESOLVING POSITION ${activeSlot + 1} · RIGHT TO LEFT`}</span></div>${queueMarkup()}</section>
        <section class="piles" aria-label="Card piles">${pileMarkup('draw', state.drawPile)}${pileMarkup('discard', state.discardPile)}</section>
        <section class="combat-log ink-panel" aria-label="Combat log"><h2>FIELD NOTES</h2><ol>${log.length ? log.map((line) => `<li>${escapeHtml(line)}</li>`).join('') : '<li>The aisle is quiet. For now.</li>'}</ol></section>
        <button class="resolve primary" data-action="resolve" aria-describedby="resolve-reason" ${mode !== 'planning' || state.phase !== 'planning' || blocked ? 'disabled' : ''}>Resolve Turn <span>${mode === 'dealing' ? 'Dealing cards' : blocked || 'Execute right to left'}</span></button>
        <div id="resolve-reason" class="notice ${blocked || /cannot|need|invalid|occupied|locked/i.test(notice) ? 'warning' : ''}" role="status" aria-live="polite">${escapeHtml(notice)}</div>
        <div class="hand-zone${modifier ? ' attachment-targeting' : ''}" aria-label="Bob's hand">${handMarkup()}</div>
        <section class="energy-bar ink-panel" role="meter" aria-label="Bob's energy" aria-valuemin="0" aria-valuemax="${bob.energyMax}" aria-valuenow="${energy}" aria-valuetext="${energy} available, ${bob.energy - energy} reserved, capacity ${bob.energyMax}">
          <b>ENERGY</b><span class="energy-bubbles" aria-hidden="true">${Array.from({ length: bob.energyMax }, (_, index) => `<span class="energy-bubble ${index < energy ? 'available' : index < bob.energy ? 'reserved' : 'empty'}"></span>`).join('')}</span>
          <span class="energy-summary"><strong>${energy}</strong> available <small>${bob.energy - energy} reserved</small></span>
        </section>
      </main>${detailMarkup()}${inspectorMarkup()}${outcomeMarkup()}${menuMarkup()}`;
    scene.setState(state);
    scene.setCards(visualCards(), Boolean(inspector));
    const focusTarget = focusAfterRender ?? (detail ? '.card-detail-controls [data-action="close-card-detail"]' : menuOpen ? `.game-menu [data-action="${focusedMenuAction ?? 'close-menu'}"]` : inspector ? '.pile-inspector button' : mode === 'ended' ? '.outcome button' : null);
    focusAfterRender = null;
    if (focusTarget) root.querySelector<HTMLElement>(focusTarget)?.focus({ preventScroll: true });
  };

  const feedback = (ok: boolean, success: string, reason?: string) => {
    notice = ok ? success : (reason || 'That interaction is not valid right now.');
    if (ok) { selection = null; pending = null; }
    detail = null;
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


  const placeHandCard = (uid: string, target: ActorId | null, slot: number) => {
    const card = handCard(uid);
    if (!card) return;
    if (CARDS[card.definitionId].modifier) {
      notice = 'Attachments do not take a timeline slot. Choose a card body or timing position.';
      render();
      return;
    }
    const resolvedTarget = target ?? candidates(card)[0] ?? null;
    const result = queueCard(state, uid, resolvedTarget, slot);
    feedback(result.ok, `${CARDS[card.definitionId].name} inserted at timing ${slot + 1}.`, result.reason);
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
    discardedCards.clear();
    inFlight.clear();
    attachmentExitOrigins.clear();
    lingeringAttachments.clear();
  };

  const animateDraws = async (cards: CardInstance[], run: number) => {
    if (!cards.length) return;
    for (const card of cards) {
      inFlight.set(card.uid, {
        uid: card.uid, definition: CARDS[card.definitionId], ...DRAW_PILE, rotation: 0,
        hovered: false, dimmed: false, damageModifier: 0, queued: false, dragged: false,
        locked: false, target: null, targets: [], flip: 180, snap: true,
      });
    }
    render();
    const layout = cardLayout(state.hand);
    for (const card of cards) {
      if (destroyed || run !== sequence) return;
      const destination = layout.get(card.uid);
      if (!destination) continue;
      inFlight.set(card.uid, { ...destination, flip: 0, locked: false });
      scene.setCards(visualCards(), Boolean(inspector));
      await wait(reduceMotion ? 0 : 55);
      if (destroyed || run !== sequence) return;
    }
    await wait(reduceMotion ? 0 : 320);
    if (destroyed || run !== sequence) return;
    for (const card of cards) inFlight.delete(card.uid);
    render();
  };

  const animateDiscards = async (
    cards: CardInstance[],
    origins: Map<string, Pick<CardVisual, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'flip'>>,
    run: number,
  ) => {
    if (!cards.length) return;
    for (const card of cards) {
      const origin = origins.get(card.uid) ?? DRAW_PILE;
      inFlight.set(card.uid, {
        uid: card.uid, definition: CARDS[card.definitionId], ...origin,
        hovered: false, dimmed: false, damageModifier: 0, queued: false, dragged: false,
        locked: false, target: null, targets: [], flip: origin.flip ?? 0,
      });
    }
    render();
    for (const card of cards) {
      if (destroyed || run !== sequence) return;
      const flight = inFlight.get(card.uid)!;
      inFlight.set(card.uid, { ...flight, ...DISCARD_PILE, rotation: 0, flip: 180 });
      scene.setCards(visualCards(), Boolean(inspector));
      await wait(reduceMotion ? 0 : 45);
      if (destroyed || run !== sequence) return;
    }
    await wait(reduceMotion ? 0 : 335);
    if (destroyed || run !== sequence) return;
    for (const card of cards) {
      inFlight.delete(card.uid);
      discardedCards.add(card.uid);
    }
    render();
  };

  const dealOpeningHand = async () => {
    const run = ++sequence;
    mode = 'dealing';
    notice = 'Dealing opening hand…';
    await animateDraws([...state.hand], run);
    if (destroyed || run !== sequence) return;
    mode = 'planning';
    notice = 'Opening hand ready. Inspect a card or drag it to the timeline.';
    render();
  };

  const playResolution = async () => {
    if (mode !== 'planning' || state.phase !== 'planning') return;
    const blocked = resolveReason();
    if (blocked) { notice = blocked; render(); return; }
    const run = ++sequence;
    const steps = resolveTurn(state);
    mode = 'resolving';
    clearInteraction();
    detail = null;
    notice = 'Hands off — the rightmost card fires first.';
    render();
    for (const step of steps) {
      if (destroyed || run !== sequence) return;
      const before = state;
      const action = step.events.find((event) => event.kind === 'action');
      let firedUid: string | null = null;
      let firedPlayer = false;
      let firedAttachments: CardInstance[] = [];
      if (action && action.slot !== undefined && action.target) {
        const slot = step.state.queue[action.slot]!;
        firedUid = slot.kind === 'enemy' ? slot.uid : slot.card.uid;
        firedPlayer = slot.kind === 'player';
        firedAttachments = state.attachments.filter(({ target }) => target.kind === 'card' && target.uid === firedUid).map(({ card }) => card);
        const card = visualCards().find((visual) => visual.uid === firedUid)!;
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
          flip: 0,
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
        scene.setCards(visualCards(), Boolean(inspector));
        await wait(reduceMotion ? 0 : 360);
        if (destroyed || run !== sequence) return;
        if (!firedPlayer) {
          for (const card of firedAttachments) {
            const pose = scene.getCardPose(card.uid);
            if (pose) attachmentExitOrigins.set(card.uid, pose);
          }
        }
      }

      const drawn = step.events.flatMap((event) => event.kind === 'draw' ? event.cards ?? [] : []);
      const newlyDiscarded = step.events.flatMap((event) => event.kind === 'discard' ? event.cards ?? [] : [])
        .filter((card) => !discardedCards.has(card.uid));
      const discardOrigins = new Map<string, Pick<CardVisual, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'flip'>>();
      if (newlyDiscarded.length) {
        const previousHand = cardLayout(before.hand);
        for (const card of newlyDiscarded) {
          const attachment = before.attachments.find((entry) => entry.card.uid === card.uid);
          const boundPose = attachment?.target.kind === 'card'
            ? scene.getCardPose(attachment.target.uid) ?? previousHand.get(attachment.target.uid)
            : attachment?.target.kind === 'slot' ? queueCardPose(attachment.target.slot, before.queue) : null;
          discardOrigins.set(card.uid, attachmentExitOrigins.get(card.uid) ?? scene.getCardPose(card.uid)
            ?? boundPose ?? previousHand.get(card.uid) ?? DRAW_PILE);
        }
      }
      for (const card of drawn) {
        inFlight.set(card.uid, {
          uid: card.uid, definition: CARDS[card.definitionId], ...DRAW_PILE, rotation: 0,
          hovered: false, dimmed: false, damageModifier: 0, queued: false, dragged: false,
          locked: false, target: null, targets: [], flip: 180, snap: true,
        });
      }
      for (const card of newlyDiscarded) {
        const origin = discardOrigins.get(card.uid) ?? DRAW_PILE;
        lingeringAttachments.delete(card.uid);
        inFlight.set(card.uid, {
          uid: card.uid, definition: CARDS[card.definitionId], ...origin,
          hovered: false, dimmed: false, damageModifier: 0, queued: false, dragged: false,
          locked: false, target: null, targets: [], flip: origin.flip ?? 0,
        });
      }
      state = step.state;
      notice = step.events.length ? step.events.map((event) => event.message).join(' ') : 'Advancing the timeline.';
      render();
      for (const event of step.events) scene.playEvent(event);
      if (firingCard && firedUid) {
        await wait(reduceMotion ? 0 : 130);
        if (destroyed || run !== sequence) return;
        if (!firedPlayer) {
          for (const card of firedAttachments) {
            const pose = attachmentExitOrigins.get(card.uid);
            if (!pose) continue;
            lingeringAttachments.set(card.uid, {
              uid: card.uid, definition: CARDS[card.definitionId], ...pose,
              hovered: false, dimmed: false, damageModifier: 0, queued: false, dragged: false,
              locked: false, target: null, targets: [], flip: pose.flip ?? 0,
            });
          }
        }
        firingCard = firedPlayer
          ? { ...firingCard, ...DISCARD_PILE, rotation: 0, flip: 180 }
          : { ...firingCard, x: DESIGN_WIDTH + firingCard.width, flip: 180 };
        scene.setCards(visualCards(), Boolean(inspector));
        await wait(reduceMotion ? 0 : 380);
        if (destroyed || run !== sequence) return;
        completedCards.add(firedUid);
        if (firedPlayer) {
          discardedCards.add(firedUid);
          for (const card of firedAttachments) discardedCards.add(card.uid);
        }
        firingCard = null;
        firingSlot = null;
        render();
      }
      if (newlyDiscarded.length) {
        await animateDiscards(newlyDiscarded, discardOrigins, run);
        if (destroyed || run !== sequence) return;
      }
      if (drawn.length) {
        await animateDraws(drawn, run);
        if (destroyed || run !== sequence) return;
      }
      if (step.state.activeSlot === null) completedCards.clear();
    }
    mode = state.phase === 'planning' ? 'planning' : 'ended';
    discardedCards.clear();
    if (mode === 'ended') menuOpen = false;
    notice = state.phase === 'planning' ? `Turn ${state.turn}: arrange the next six timings.` : (state.phase === 'victory' ? 'Aisle secured. Victory.' : 'Bob is down. Defeat.');
    render();
  };

  const restart = () => {
    sequence++;
    clearPlayback();
    clearInteraction();
    state = createCombat(state.seed);
    mode = 'dealing';
    inspector = null;
    detail = null;
    menuOpen = false;
    focusAfterRender = '.menu-trigger';
    render();
    void dealOpeningHand();
  };

  const designPoint = (event: MouseEvent) => {
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
    const source = handCard(drag.uid);
    const target = source ? candidates(source)[0] ?? null : null;
    drag.preview = destination === null ? null : previewPlacement(state, drag.uid, target, destination);
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
    if (drag.kind === 'attachment') {
      drag.destination = null;
      drag.preview = null;
      drag.attachmentTarget = null;
    } else if (draggingModifier) {
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
      const over = drag?.kind !== 'attachment' && !draggingModifier && slot === drag?.destination;
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
    scene.setCards(visualCards(), Boolean(inspector));
  };

  const closeDetail = () => {
    if (!detail) return;
    focusAfterRender = detail.returnFocus;
    detail = null;
    render();
  };

  const closeInspector = () => {
    if (!inspector) return;
    const pile = inspector;
    inspector = null;
    inspectorPage = 0;
    focusAfterRender = `.pile-button[data-pile="${pile}"]`;
    render();
  };

  const openDetail = (element: HTMLElement) => {
    const hand = element.closest<HTMLElement>('[data-hand-card]');
    const queueElement = element.closest<HTMLElement>('.queue-slot[data-slot]');
    const attachmentElement = element.closest<HTMLElement>('.attachment-tab[data-card]');
    if (attachmentElement) {
      const card = attachedCard(attachmentElement.dataset.card!);
      if (!card) return;
      detail = {
        uid: `${card.uid}:detail:${++detailSerial}`,
        cardUid: card.uid,
        definition: CARDS[card.definitionId],
        source: 'attachment',
        slot: queueElement ? Number(queueElement.dataset.slot) : null,
        target: null,
        returnFocus: returnFocusSelector(element),
      };
    } else if (hand) {
      const card = handCard(hand.dataset.handCard!);
      if (!card) return;
      detail = {
        uid: `${card.uid}:detail:${++detailSerial}`,
        cardUid: card.uid,
        definition: CARDS[card.definitionId],
        source: 'hand',
        slot: null,
        target: null,
        returnFocus: returnFocusSelector(element),
      };
    } else if (queueElement) {
      const slotIndex = Number(queueElement.dataset.slot);
      const action = state.queue[slotIndex];
      if (!action) return;
      detail = {
        uid: `${action.kind === 'enemy' ? action.uid : action.card.uid}:detail:${++detailSerial}`,
        cardUid: action.kind === 'enemy' ? action.uid : action.card.uid,
        definition: action.kind === 'enemy' ? enemyDefinition(action) : CARDS[action.card.definitionId],
        source: action.kind === 'enemy' ? 'enemy' : 'queue',
        slot: slotIndex,
        target: action.target,
        returnFocus: returnFocusSelector(element),
      };
    } else return;
    clearCapture();
    selection = null;
    pending = null;
    hoveredUid = null;
    hoveredQueueSlot = null;
    render();
  };
  const onClick = (event: MouseEvent) => {
    if (suppressClick) { event.preventDefault(); event.stopPropagation(); return; }
    const target = event.target as HTMLElement;
    const actionElement = target.closest<HTMLElement>('[data-action]');
    if (actionElement) {
      const action = actionElement.dataset.action;
      if (action === 'restart') restart();
      else if (action === 'resolve') void playResolution();
      else if (action === 'open-menu') {
        menuReturnFocus = '.menu-trigger';
        clearInteraction();
        detail = null;
        inspector = null;
        menuOpen = true;
        render();
      } else if (action === 'close-menu') {
        menuOpen = false;
        focusAfterRender = menuReturnFocus;
        render();
      } else if (action === 'inspect') {
        clearInteraction();
        detail = null;
        inspector = actionElement.dataset.pile as PileKind;
        inspectorPage = 0;
        inspectorSerial++;
        render();
      } else if ((action === 'pile-prev' || action === 'pile-next') && inspector) {
        inspectorPage += action === 'pile-prev' ? -1 : 1;
        const visible = pileInspectorState()!;
        const reachedEnd = action === 'pile-prev' ? inspectorPage === 0 : inspectorPage === visible.pageCount - 1;
        focusAfterRender = `[data-action="${reachedEnd ? action === 'pile-prev' ? 'pile-next' : 'pile-prev' : action}"]`;
        render();
      } else if (action === 'close-inspector') {
        closeInspector();
      } else if (action === 'close-card-detail' && detail) {
        closeDetail();
      } else if (action === 'detail-play' && detail?.source === 'hand' && mode === 'planning') {
        const card = handCard(detail.cardUid);
        if (!card || !canAfford(card)) {
          notice = 'Not enough available energy.';
          render();
          return;
        }
        selection = { kind: 'hand', uid: card.uid };
        detail = null;
        notice = CARDS[card.definitionId].modifier
          ? 'Attachment selected. Choose a compatible card body or timing position.'
          : 'Choose a timing point for this card.';
        focusAfterRender = '[data-attachment-slot="0"]';
        render();
      } else if (action === 'detail-move' && detail?.source === 'queue' && detail.slot !== null && mode === 'planning') {
        selection = { kind: 'queue', slot: detail.slot };
        detail = null;
        notice = 'Choose a timing point to move this card.';
        focusAfterRender = '[data-attachment-slot="0"]';
        render();
      } else if (action === 'detail-refund' && detail && mode === 'planning') {
        const result = detail.source === 'queue' && detail.slot !== null
          ? removeCard(state, detail.slot)
          : removeModifier(state, detail.cardUid);
        feedback(result.ok, 'Card returned to hand and its reserved energy was refunded.', result.reason);
      } else if (action === 'remove-attachment' && mode === 'planning') {
        const result = removeModifier(state, actionElement.dataset.card!);
        feedback(result.ok, 'Attachment returned to hand and its reserved energy was refunded.', result.reason);
      }
      return;
    }
    if (inspector) {
      if (target.classList.contains('inspector-shade')) closeInspector();
      return;
    }
    if (detail) {
      const point = designPoint(event);
      const pose = scene.getCardPose(detail.uid) ?? DETAIL;
      if (point.x < pose.x || point.x > pose.x + pose.width
        || point.y < pose.y || point.y > pose.y + pose.height) closeDetail();
      return;
    }
    if (mode !== 'planning' || inspector || menuOpen) return;
    const modifier = modifierSource();
    if (modifier) {
      const attachmentTarget = attachmentTargetAt(target);
      if (attachmentTarget && !(attachmentTarget.kind === 'card' && attachmentTarget.uid === modifier.uid)) {
        attachTo(attachmentTarget);
        return;
      }
    }
    if (target.closest('[data-hand-card], .queue-card-body, .attachment-tab') && !(selection && target.closest('[data-slot]'))) {
      openDetail(target);
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
      const source = handCard(selection.uid);
      if (source && CARDS[source.definitionId].modifier) attachTo({ kind: 'slot', slot: to });
      else placeHandCard(selection.uid, null, to);
    } else if (selection?.kind === 'queue') {
      const result = moveCard(state, selection.slot, to);
      feedback(result.ok, 'Card moved to the chosen timing point.', result.reason);
    } else if (state.queue[to]?.kind === 'enemy') {
      openDetail(slotElement);
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const modal = root.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
    if (event.key === 'Tab' && modal) {
      const focusable = [...modal.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) { event.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!modal.contains(document.activeElement) || event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
      return;
    }
    if (event.key === 'Escape') {
      if (detail) {
        closeDetail();
      } else if (drag || selection || pending) {
        const pullingAttachment = drag?.kind === 'attachment';
        clearInteraction(pullingAttachment ? 'Attachment kept; its reserved energy is unchanged.' : 'Placement canceled. No energy was spent.');
        render();
      } else if (inspector) {
        closeInspector();
      } else if (menuOpen) {
        menuOpen = false;
        focusAfterRender = menuReturnFocus;
        render();
      } else if (mode !== 'ended') {
        menuReturnFocus = returnFocusSelector(document.activeElement);
        menuOpen = true;
        render();
      }
      return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && mode === 'planning') {
      const focusedSlot = (event.target as HTMLElement).closest<HTMLElement>('.queue-card[data-slot]');
      const slot = detail?.source === 'queue' ? detail.slot : focusedSlot ? Number(focusedSlot.dataset.slot) : null;
      if (slot !== null) {
        event.preventDefault();
        const result = removeCard(state, slot);
        feedback(result.ok, 'Card returned to hand and its reserved energy was refunded.', result.reason);
        return;
      }
    }
    if ((event.key !== 'Enter' && event.key !== ' ') || event.target instanceof HTMLButtonElement) return;
    const element = (event.target as HTMLElement).closest<HTMLElement>('[role="button"]');
    if (!element || element instanceof HTMLButtonElement) return;
    event.preventDefault();
    element.click();
  };

  const onPointerDown = (event: PointerEvent) => {
    if (mode !== 'planning' || event.button > 0 || detail || inspector || menuOpen) return;
    const target = event.target as HTMLElement;
    const attachmentTab = target.closest<HTMLElement>('.attachment-tab[data-card]');
    if (!attachmentTab && target.closest('[data-action], [data-attachment-slot]')) return;
    const hand = attachmentTab ? null : target.closest<HTMLElement>('[data-hand-card]');
    const queue = attachmentTab
      ? attachmentTab.closest<HTMLElement>('.queue-slot[data-slot]')
      : target.closest<HTMLElement>('.queue-card[data-slot]');
    if (pending && !attachmentTab) return;
    const activeModifier = modifierSource();
    if (!attachmentTab && activeModifier && (queue || hand?.dataset.handCard !== activeModifier.uid)) return;
    if (!hand && !queue) return;
    const slot = queue ? Number(queue.dataset.slot) : undefined;
    const action = slot === undefined ? null : playerAction(slot);
    const uid = attachmentTab?.dataset.card ?? hand?.dataset.handCard ?? action?.card.uid;
    if (!uid) return;
    const source = handCard(uid);
    if (hand && (!source || !canAfford(source))) return;
    event.preventDefault();
    pending = null;
    selection = null;
    const point = designPoint(event);
    const capture = attachmentTab ?? hand ?? queue!;
    let fallback = hand
      ? cardLayout(state.hand).get(uid)!
      : queueCardPose(slot!);
    if (attachmentTab) {
      const attachment = state.attachments.find(({ card }) => card.uid === uid);
      if (attachment?.target.kind === 'card') {
        const hostUid = attachment.target.uid;
        const hostSlot = state.queue.findIndex((candidate) => candidate?.kind === 'enemy'
          ? candidate.uid === hostUid
          : candidate?.kind === 'player' && candidate.card.uid === hostUid);
        if (hostSlot >= 0) {
          const hostPose = queueCardPose(hostSlot);
          const attachmentIndex = cardAttachments(hostUid).findIndex(({ card }) => card.uid === uid);
          fallback = { ...hostPose, y: hostPose.y - 52 * hostPose.width / QUEUE_CARD_WIDTH * (attachmentIndex + 1) };
        }
      }
    }
    const pose = scene.getCardPose(uid) ?? fallback;
    drag = {
      kind: attachmentTab ? 'attachment' : hand ? 'hand' : 'queue',
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
    scene.setCards(visualCards(), Boolean(inspector));
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
    if (cancelled) {
      selection = null;
      pending = null;
      notice = finished.kind === 'attachment' ? 'Attachment kept; its reserved energy is unchanged.' : 'Placement canceled. No energy was spent.';
      render();
      return;
    }
    if (!finished.moved) {
      scene.setCards(visualCards(), Boolean(inspector));
      return;
    }
    event.preventDefault();
    suppressClick = true;
    const timer = window.setTimeout(() => { suppressClick = false; timers.delete(timer); }, 0);
    timers.set(timer, () => { suppressClick = false; });
    if (finished.kind === 'attachment') {
      const result = removeModifier(state, finished.uid);
      feedback(result.ok, 'Attachment returned to hand and its reserved energy was refunded.', result.reason);
      return;
    }
    if (finished.kind === 'queue' && finished.y >= 800) {
      const result = removeCard(state, finished.slot!);
      feedback(result.ok, 'Card returned to hand and its reserved energy was refunded.', result.reason);
      return;
    }
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
    if (drag || detail) return;
    const target = event.target as HTMLElement;
    const hand = target.closest<HTMLElement>('[data-hand-card]');
    const queue = target.closest<HTMLElement>('.queue-slot[data-slot]');
    if (event.pointerType !== 'touch') {
      const nextUid = hand?.dataset.handCard ?? null;
      const nextSlot = queue ? Number(queue.dataset.slot) : null;
      if (nextUid !== hoveredUid || nextSlot !== hoveredQueueSlot) {
        hoveredUid = nextUid;
        hoveredQueueSlot = nextSlot;
        scene.setCards(visualCards(), Boolean(inspector));
      }
    }
  };

  const onPointerOut = (event: PointerEvent) => {
    if (drag || detail) return;
    const target = event.target as HTMLElement;
    const related = event.relatedTarget as Node | null;
    const hand = target.closest<HTMLElement>('[data-hand-card]');
    const queue = target.closest<HTMLElement>('.queue-slot[data-slot]');
    let changed = false;
    if (hand && !hand.contains(related)) { hoveredUid = null; changed = true; }
    if (queue && !queue.contains(related)) { hoveredQueueSlot = null; changed = true; }
    if (changed) scene.setCards(visualCards(), Boolean(inspector));
  };

  const onFocusIn = (event: FocusEvent) => {
    const queue = (event.target as HTMLElement).closest<HTMLElement>('.queue-slot[data-slot]');
    if (queue) {
      hoveredQueueSlot = Number(queue.dataset.slot);
      scene.setCards(visualCards(), Boolean(inspector));
    }
  };
  const onFocusOut = (event: FocusEvent) => {
    const target = event.target as HTMLElement;
    const queue = target.closest<HTMLElement>('.queue-slot[data-slot]');
    if (queue && !queue.contains(event.relatedTarget as Node | null)) {
      hoveredQueueSlot = null;
      scene.setCards(visualCards(), Boolean(inspector));
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
  void dealOpeningHand();

  return {
    destroy() {
      destroyed = true;
      sequence++;
      clearPlayback();
      clearInteraction();
      listeners.abort();
      root.replaceChildren();
      scene.setTarget(null);
      scene.setCards([], false);
    },
  };
}

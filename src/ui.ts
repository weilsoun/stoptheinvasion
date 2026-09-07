import { attachModifier, availableEnergy, canAttachModifier, createCombat, damageModifier, moveCard, previewPlacement, queueCard, removeCard, removeModifier, resolveTurn, turnEnd, turnLength, visibleEnd } from './game/combat';
import { CARDS } from './game/content';
import type { ActorId, Attachment, CardDefinition, CardInstance, EnemyAction, ModifierTarget, PlayerAction, QueueSlot } from './game/types';
import { ACTOR_CENTERS, type CardVisual, type ScenePort } from './view/types';

type Selection = { kind: 'hand'; uid: string } | { kind: 'queue'; slot: number } | null;
type PendingPlacement = { uid: string; target: ActorId };
type CardDetail = {
  uid: string;
  cardUid: string;
  definition: CardDefinition;
  source: 'hand' | 'queue' | 'enemy' | 'attachment' | 'history' | 'future';
  slot: number | null;
  target: ActorId | null;
  damageModifier?: number;
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
const QUEUE_CARD_WIDTH = 150;
const QUEUE_CARD_HEIGHT = 210;
const QUEUE_CARD_Y = 356;
const QUEUE_CARD_GAP = 16;
const QUEUE_HIT_TOP = QUEUE_CARD_Y - 76;
const QUEUE_HIT_BOTTOM = QUEUE_CARD_Y + QUEUE_CARD_HEIGHT + 42;
const TRACK_CENTER_X = DESIGN_WIDTH / 2;
const ZOOM_LEVELS = [.65, 1, 1.25];
const ZOOM_STEP = .35;
const HAND_BOTTOM = 1008;
const HOVER_WIDTH = 280;
const HOVER_HEIGHT = 392;
const HOVER_Y = HAND_BOTTOM - HOVER_HEIGHT;
const ATTACHMENT_SCALE = .9;
const ATTACHMENT_GAP = 8;
const CARD_ATTACHMENT_PEEK = 28;
const DETAIL = { x: 720, y: 180, width: 480, height: 672 };
const DRAW_PILE = { x: 300, y: 840, width: 96, height: 134, rotation: 0, flip: 180 };
const DISCARD_PILE = { x: 1524, y: 840, width: 96, height: 134, rotation: 0, flip: 0 };
const escapeHtml = (value: string | number) => String(value).replace(/[&<>'"]/g, (character) => HTML_ESCAPES[character]);
const STATUS_ICONS = {
  block: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 20 5v6c0 5-3.4 8.7-8 11-4.6-2.3-8-6-8-11V5z"/></svg>',
  exposed: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7"/><path d="M12 1v5m0 12v5M1 12h5m12 0h5"/><circle cx="12" cy="12" r="2"/></svg>',
  ringing: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 17h12l-1.5-2v-5a4.5 4.5 0 0 0-9 0v5z"/><path d="M10 20h4"/></svg>',
};

function effectText(effects: { kind: string; amount: number }[]): string {
  return effects.map(({ kind, amount }) => `${amount} ${kind}`).join(' / ');
}
const attachmentCardPose = (
  host: Pick<CardVisual, 'x' | 'y' | 'width' | 'height' | 'rotation'>,
  index: number,
  count: number,
  behindHost = false,
) => {
  const width = host.width * ATTACHMENT_SCALE;
  const height = host.height * ATTACHMENT_SCALE;
  const peek = CARD_ATTACHMENT_PEEK * host.height / QUEUE_CARD_HEIGHT;
  return {
    x: behindHost
      ? host.x + (host.width - width) / 2
      : host.x + host.width / 2 + (index - (count - 1) / 2) * (width + ATTACHMENT_GAP) - width / 2,
    y: behindHost ? host.y - peek * (index + 1) : host.y + host.height + ATTACHMENT_GAP,
    width,
    height,
    rotation: host.rotation,
  };
};


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

export function mountGame(root: HTMLElement, scene: ScenePort): GamePort {
  let state = createCombat();
  let mode: Mode = 'dealing';
  let selection: Selection = null;
  let pending: PendingPlacement | null = null;
  let drag: Drag | null = null;
  let hoveredUid: string | null = null;
  let hoveredQueueSlot: number | null = null;
  let inspector: 'draw' | 'discard' | null = null;
  let detail: CardDetail | null = null;
  let menuOpen = false;
  let focusAfterRender: string | null = null;
  let menuReturnFocus = '.menu-trigger';
  let notice = 'Place actions directly. Attachments target a compatible card or timing position.';
  let destroyed = false;
  let sequence = 0;
  let firingCard: CardVisual | null = null;
  let hiddenHistoryPosition: number | null = null;
  const completedCards = new Set<string>();
  let detailSerial = 0;
  const discardedCards = new Set<string>();
  const inFlight = new Map<string, CardVisual>();
  const attachmentExitOrigins = new Map<string, Pick<CardVisual, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'flip'>>();
  const lingeringAttachments = new Map<string, CardVisual>();
  const timers = new Map<number, () => void>();
  const listeners = new AbortController();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const healthFeedback = new Map<ActorId, { value: number; from: number; changedAt: number; hitAt: number }>();
  let zoom = 1;
  let cameraPosition = state.position + (turnLength(state) - 1) / 2;
  let cameraFollowing = true;
  let pan: { pointerId: number; x: number; camera: number; capture: HTMLElement } | null = null;

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

  const isAttachment = (definition: CardDefinition) => Boolean(definition.modifier || definition.bracket);
  const targetChoices = (card: CardInstance): ActorId[] =>
    isAttachment(CARDS[card.definitionId]) ? [] : candidates(card).length > 1 ? candidates(card) : [];

  const handCard = (uid: string) => state.hand.find((card) => card.uid === uid) ?? null;
  const canAfford = (card: CardInstance) => CARDS[card.definitionId].cost <= availableEnergy(state, card.owner);
  const queuedCard = (uid: string) => state.queue.find((slot): slot is PlayerAction => slot?.kind === 'player' && slot.card.uid === uid)?.card ?? null;
  const stride = () => (QUEUE_CARD_WIDTH + QUEUE_CARD_GAP) * zoom;
  const queueCardX = (position: number) => TRACK_CENTER_X + (cameraPosition - position) * stride() - QUEUE_CARD_WIDTH * zoom / 2;
  const queueSlotX = (position: number) => queueCardX(position) - QUEUE_CARD_GAP * zoom / 2;
  const queueCardPose = (position: number) => ({
    x: queueCardX(position),
    y: QUEUE_CARD_Y + QUEUE_CARD_HEIGHT * (1 - zoom) / 2,
    width: QUEUE_CARD_WIDTH * zoom,
    height: QUEUE_CARD_HEIGHT * zoom,
    rotation: 0,
  });
  const bracketCenterX = () => (queueCardX(state.position) + queueCardX(turnEnd(state) - 1) + QUEUE_CARD_WIDTH * zoom) / 2;
  const onscreen = (position: number) => {
    const x = queueCardX(position);
    return x + QUEUE_CARD_WIDTH * zoom > -40 && x < DESIGN_WIDTH + 40;
  };
  const currentQueue = () => drag?.preview ?? state.queue;
  const presentedSlot = (position: number): QueueSlot => {
    const slot = currentQueue()[position] ?? null;
    if (!slot) return null;
    const uid = slot.kind === 'enemy' ? slot.uid : slot.card.uid;
    return completedCards.has(uid) || firingCard?.uid === uid ? null : slot;
  };
  const visiblePositions = () => {
    const positions = new Set<number>();
    for (const entry of state.history) {
      if (entry.position !== hiddenHistoryPosition && onscreen(entry.position)) positions.add(entry.position);
    }
    for (let position = state.position; position < visibleEnd(state); position++) {
      if (onscreen(position)) positions.add(position);
    }
    return [...positions].sort((a, b) => a - b);
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
    return card && isAttachment(CARDS[card.definitionId]) ? card : null;
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
  const positionAttachments = (slot: number) => state.attachments.filter(({ target }) => target.kind === 'slot' && target.slot === slot);
  const bracketAttachments = () => state.attachments.filter(({ target }) => target.kind === 'bracket');
  const attachedCard = (uid: string) => state.attachments.find(({ card }) => card.uid === uid)?.card ?? null;
  const attachmentDescription = (definition: CardDefinition) => definition.modifier
    ? `${definition.modifier.damage >= 0 ? 'plus' : 'minus'} ${Math.abs(definition.modifier.damage)} damage`
    : `${definition.bracket?.positions ?? 0} positions, ${definition.bracket?.scouting ?? 0} scouting`;
  const attachmentTabsMarkup = (attachments: Attachment[], hostName: string, pose: Pick<CardVisual, 'x' | 'y' | 'width' | 'height' | 'rotation'>, slotX: number, behindHost = false) => attachments.map(({ card, target }, index, all) => {
    const definition = CARDS[card.definitionId];
    const mini = attachmentCardPose(pose, index, all.length, behindHost);
    const binding = target.kind === 'card' ? `card ${hostName}` : target.kind === 'slot' ? `position ${target.slot}` : 'current turn bracket';
    const hitHeight = behindHost ? CARD_ATTACHMENT_PEEK * pose.height / QUEUE_CARD_HEIGHT : mini.height;
    return `<button class="attachment-tab ${target.kind}" style="--tab-x:${mini.x - slotX}px;--tab-y:${mini.y - (QUEUE_CARD_Y - 6)}px;--tab-w:${mini.width}px;--tab-h:${hitHeight}px" data-card="${escapeHtml(card.uid)}" data-card-uid="${escapeHtml(card.uid)}"
      aria-label="Inspect ${escapeHtml(definition.name)}, ${escapeHtml(attachmentDescription(definition))}, bound to ${escapeHtml(binding)}. Drag to return it to hand and refund its energy." title="${escapeHtml(definition.name)}, bound to ${escapeHtml(binding)}"></button>`;
  }).join('');
  const handAttachmentTabsMarkup = (hostUid: string, hostName: string) => cardAttachments(hostUid).map(({ card }, index) => {
    const definition = CARDS[card.definitionId];
    const top = -CARD_ATTACHMENT_PEEK / QUEUE_CARD_HEIGHT * 100 * (index + 1);
    return `<button class="attachment-tab card hand-attachment" style="--mini-top:${top}%" data-card="${escapeHtml(card.uid)}" data-card-uid="${escapeHtml(card.uid)}"
      aria-label="Inspect ${escapeHtml(definition.name)}, ${escapeHtml(attachmentDescription(definition))}, bound to card ${escapeHtml(hostName)}. Drag to return it to hand and refund its energy." title="${escapeHtml(definition.name)}, bound to card ${escapeHtml(hostName)}"></button>`;
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
      }
    }

    const queued: CardVisual[] = [];
    const attachmentVisuals = (
      host: Pick<CardVisual, 'x' | 'y' | 'width' | 'height' | 'rotation'>,
      attachments: Attachment[],
      hostUid?: string,
      behindHost = false,
      uidPrefix = '',
    ) => attachments
      .filter(({ card }) => (drag?.kind !== 'attachment' || card.uid !== drag.uid) && !lingeringAttachments.has(card.uid))
      .map(({ card, target }, index, all) => ({
        uid: `${uidPrefix}${card.uid}`,
        definition: CARDS[card.definitionId],
        ...attachmentCardPose(host, index, all.length, behindHost),
        hovered: false,
        dimmed: Boolean(uidPrefix),
        damageModifier: 0,
        queued: true,
        dragged: false,
        locked: false,
        target: null,
        targets: [],
        underCard: target.kind === 'card' ? hostUid : undefined,
        flip: 0,
      } satisfies CardVisual));
    const pushHost = (host: CardVisual, slot?: number) => {
      const bound = cardAttachments(host.uid);
      const fixed = slot === undefined ? [] : positionAttachments(slot);
      queued.push(...attachmentVisuals(host, bound, host.uid, true).reverse(), ...attachmentVisuals(host, fixed).reverse(), host);
    };
    for (const entry of state.history) {
      if (!entry.action || entry.position === hiddenHistoryPosition || !onscreen(entry.position)) continue;
      const action = entry.action;
      const sourceUid = action.kind === 'enemy' ? action.uid : action.card.uid;
      const uid = `history:${entry.position}:${sourceUid}`;
      const definition = action.kind === 'enemy' ? enemyDefinition(action) : entry.definition ?? CARDS[action.card.definitionId];
      const pose = queueCardPose(entry.position);
      queued.push(
        ...attachmentVisuals(pose, entry.attachments, uid, true, `history:${entry.position}:`).reverse(),
        {
          uid,
          definition,
          ...pose,
          hovered: mode === 'planning' && !modifier && hoveredQueueSlot === entry.position,
          dimmed: false,
          damageModifier: entry.damageModifier,
          queued: true,
          dragged: false,
          locked: true,
          target: action.target,
          targets: [],
          flip: 0,
        },
      );
    }
    for (const position of visiblePositions()) {
      if (position < state.position || historyAt(position)) continue;
      const slot = presentedSlot(position);
      if (!slot) {
        if (position < turnEnd(state)) queued.push(...attachmentVisuals(queueCardPose(position), positionAttachments(position)));
        continue;
      }
      const isEnemy = slot.kind === 'enemy';
      const uid = isEnemy ? slot.uid : slot.card.uid;
      const pose = queueCardPose(position);
      if (uid === heldUid || inFlight.has(uid)) {
        queued.push(...attachmentVisuals(pose, positionAttachments(position)));
        continue;
      }
      pushHost({
        uid,
        definition: isEnemy ? enemyDefinition(slot) : CARDS[slot.card.definitionId],
        ...pose,
        hovered: mode === 'planning' && !modifier && hoveredQueueSlot === position,
        dimmed: mode !== 'planning' || position >= turnEnd(state) || Boolean(modifier && !attachmentAllowed({ kind: 'card', uid })),
        damageModifier: damageModifier(state, uid, position),
        queued: true,
        dragged: false,
        locked: isEnemy || position >= turnEnd(state),
        target: slot.target,
        targets: isEnemy ? [] : targetChoices(slot.card),
        flip: 0,
      }, position);
    }
    const bracketPose = { x: bracketCenterX() - 52, y: -43, width: 105, height: 147, rotation: 0 };
    queued.push(...attachmentVisuals(bracketPose, bracketAttachments(), undefined, false));
    if (firingCard) pushHost(firingCard);
    const hands: CardVisual[] = [];
    for (const visual of hand.values()) {
      hands.push(...attachmentVisuals(visual, cardAttachments(visual.uid), visual.uid, true).reverse(), visual);
    }


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
        else if (drag.kind === 'hand') queued.push(...attachmentVisuals(visual, cardAttachments(visual.uid), visual.uid, true).reverse(), visual);
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
      ...hands,
      ...lingeringAttachments.values(),
      ...inFlight.values(),
    ];
    if (detail) physical.push({
      uid: detail.uid,
      definition: detail.definition,
      ...DETAIL,
      rotation: 0,
      hovered: true,
      dimmed: false,
      damageModifier: detail.damageModifier ?? (detail.slot === null ? damageModifier(state, detail.cardUid, null) : damageModifier(state, detail.cardUid, detail.slot)),
      queued: false,
      dragged: false,
      locked: detail.source === 'enemy' || detail.source === 'future'
        || detail.source === 'history' && state.history.find((entry) => entry.position === detail?.slot)?.action?.kind === 'enemy',
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
    const now = performance.now();
    const value = Math.max(0, Math.min(1, actor.hp / actor.maxHp));
    const health = healthFeedback.get(actorId) ?? { value, from: value, changedAt: now - 1000, hitAt: now - 1000 };
    if (health.value !== value) {
      health.from = health.value;
      health.value = value;
      health.changedAt = now;
    }
    healthFeedback.set(actorId, health);
    // Resume the same impact across HUD replacements instead of restarting its animations.
    const age = now - health.changedAt;
    const changing = !reduceMotion && health.from !== value && age < 700;
    const hit = !reduceMotion && now - health.hitAt < 280;
    const healthClass = `${changing ? ' hp-changing' : ''}${changing && health.from > value ? ' hp-damaged' : ''}${hit ? ' hp-hit' : ''}`;
    const healthStyle = `--hp:${value};--hp-from:${health.from};--health-age:-${age}ms;--hit-age:-${now - health.hitAt}ms`;
    const ringingStatus = actor.ringing && actor.ringingNextTurn
      ? 'Ringing: limited to one action this turn and next turn.'
      : actor.ringing
        ? 'Ringing: limited to one action this turn.'
        : actor.ringingNextTurn
          ? 'Ringing pending: will be limited to one action next turn.'
          : '';
    const ringing = ringingStatus
      ? `<span class="actor-stat ringing-stat${actor.ringing ? '' : ' pending'}" role="img" aria-label="${ringingStatus}" title="${ringingStatus}">${STATUS_ICONS.ringing}</span>`
      : '';
    return `<section class="actor-target ${actorId === 'bob' ? 'actor-bob' : 'actor-guard'}"
      aria-label="${escapeHtml(actor.name)}. ${actor.hp} of ${actor.maxHp} health, ${actor.block} block, ${actor.exposed} exposed${ringingStatus ? `, ${ringingStatus}` : ''}">
      <span class="actor-name">${escapeHtml(actor.name)}</span>
      <span class="hp-line${healthClass}" style="${healthStyle}"><span class="hp-trail" aria-hidden="true"></span><span class="hp-fill" aria-hidden="true"></span><b>${actor.hp}</b> / ${actor.maxHp} HP</span>
      <span class="actor-status"><span class="actor-stat block-stat" role="img" aria-label="Block: ${actor.block}" title="Block: ${actor.block}">${STATUS_ICONS.block}<b>${actor.block}</b></span><span class="actor-stat exposed-stat" role="img" aria-label="Exposed: ${actor.exposed}" title="Exposed: ${actor.exposed}">${STATUS_ICONS.exposed}<b>${actor.exposed}</b></span>${ringing}</span>
    </section>`;
  };

  const returnFocusSelector = (element: Element | null): string => {
    const hand = element?.closest<HTMLElement>('[data-hand-card]');
    if (hand?.dataset.handCard) return `[data-hand-card="${CSS.escape(hand.dataset.handCard)}"]`;
    const card = element?.closest<HTMLElement>('[data-card-uid]');
    if (card?.dataset.cardUid) return `[data-card-uid="${CSS.escape(card.dataset.cardUid)}"]`;
    const action = element?.closest<HTMLElement>('[data-action]')?.dataset.action;
    if (action) return `[data-action="${CSS.escape(action)}"]`;
    const pile = element?.closest<HTMLElement>('.pile-button[data-pile]');
    if (pile?.dataset.pile) return `.pile-button[data-pile="${CSS.escape(pile.dataset.pile)}"]`;
    if (element?.closest('.resolve')) return '.resolve';
    if (element?.closest('.actor-bob, .actor-guard')) return '.menu-trigger';
    return '.menu-trigger';
  };

  const historyAt = (position: number) => position === hiddenHistoryPosition ? null : state.history.find((entry) => entry.position === position) ?? null;
  const slotMarkup = (position: number) => {
    const history = historyAt(position);
    const future = !history && position >= turnEnd(state);
    const slot = history?.action ?? presentedSlot(position);
    const active = state.activeSlot === position ? ' active' : '';
    const region = history ? ' history' : future ? ' future' : ' current';
    const pose = queueCardPose(position);
    const slotX = queueSlotX(position);
    const style = `style="--slot-x:${slotX}px;--slot-y:${QUEUE_CARD_Y - 6}px;--slot-z:${Math.max(1, position)};--slot-w:${stride()}px;--card-x:${pose.x - slotX}px;--card-y:${pose.y - (QUEUE_CARD_Y - 6)}px;--card-w:${pose.width}px;--card-h:${pose.height}px"`;
    const target = { kind: 'slot', slot: position } as const;
    const editable = !history && !future && mode === 'planning';
    const fixedAttachments = editable ? positionAttachments(position) : [];
    const regionLabel = history ? `Past turn ${history.turn}` : future ? 'Scouted future' : 'Current turn';
    if (!slot) {
      const fixedCards = editable ? attachmentTabsMarkup(fixedAttachments, '', pose, slotX) : '';
      return `<div class="queue-slot empty${region}${active}${pending && editable ? ' pending-destination' : ''}${editable ? attachmentClass(target) : ''}" data-slot="${position}" data-region="${history ? 'history' : future ? 'future' : 'current'}" role="button" tabindex="${editable && Boolean(selection || pending) ? 0 : -1}" aria-label="${regionLabel}, position ${position}, ${history ? 'empty history' : future ? 'no scouted action' : 'open position'}" ${style}>
        ${fixedCards}</div>`;
    }
    const sourceUid = slot.kind === 'enemy' ? slot.uid : slot.card.uid;
    const renderUid = history ? `history:${position}:${sourceUid}` : sourceUid;
    const cardTarget = { kind: 'card', uid: sourceUid } as const;
    const canTarget = editable && attachmentAllowed(cardTarget);
    const definition = slot.kind === 'enemy' ? enemyDefinition(slot) : history?.definition ?? CARDS[slot.card.definitionId];
    const cardTabs = editable
      ? attachmentTabsMarkup(cardAttachments(sourceUid), definition.name, pose, slotX, true) + attachmentTabsMarkup(fixedAttachments, '', pose, slotX)
      : '';
    const delta = history?.damageModifier ?? damageModifier(state, sourceUid, position);
    const targetName = slot.target === null ? 'missing target' : state.actors[slot.target].name;
    const cardLabel = slot.kind === 'enemy'
      ? `${definition.name}. ${slot.description} ${effectText(slot.effects)} to ${targetName}`
      : `Bob card ${definition.name}, cost ${definition.cost}, target ${targetName}`;
    return `<div class="queue-slot ${slot.kind}${editable && slot.kind === 'player' ? ' queue-card' : slot.kind === 'enemy' ? ' locked' : ''}${region}${active}" data-slot="${position}" data-region="${history ? 'history' : future ? 'future' : 'current'}" ${style}>
      ${cardTabs}<div class="queue-card-body${editable ? attachmentClass(cardTarget) : ''}" data-card-uid="${escapeHtml(renderUid)}" role="button" tabindex="${mode === 'planning' && (!modifierSource() || canTarget) ? 0 : -1}"
        aria-label="Inspect position ${position}, ${regionLabel}, ${escapeHtml(cardLabel)}${delta ? `, damage modifier ${delta}` : ''}"></div>
      </div>`;
  };
  const bracketMarkup = () => {
    const startX = queueSlotX(state.position);
    const endX = queueSlotX(turnEnd(state) - 1);
    const left = Math.min(startX, endX);
    const width = Math.abs(startX - endX) + stride();
    const attachments = bracketAttachments();
    const chips = attachments.map(({ card }, index) => {
      const definition = CARDS[card.definitionId];
      const mini = attachmentCardPose({ x: bracketCenterX() - 52, y: -43, width: 105, height: 147, rotation: 0 }, index, attachments.length);
      return `<button class="bracket-attachment attachment-tab bracket" style="--tab-x:${mini.x}px;--tab-y:${mini.y}px;--tab-w:${mini.width}px;--tab-h:${mini.height}px" data-card="${escapeHtml(card.uid)}" data-card-uid="${escapeHtml(card.uid)}" aria-label="Inspect ${escapeHtml(definition.name)}, ${escapeHtml(attachmentDescription(definition))}, attached to current turn bracket. Drag to refund."></button>`;
    }).join('');
    return `<div class="turn-bracket${attachmentClass({ kind: 'bracket' })}" data-bracket-target role="button" tabindex="${modifierSource() && attachmentAllowed({ kind: 'bracket' }) ? 0 : -1}" aria-label="Current turn bracket, positions ${state.position} through ${turnEnd(state) - 1}. Attach selected bracket card." style="--bracket-left:${left}px;--bracket-width:${width}px">
      <span>TURN ${state.turn} · ${turnLength(state)} POSITIONS</span></div>${chips}`;
  };
  const queueMarkup = () => {
    const positions = visiblePositions();
    const fogEdge = queueSlotX(visibleEnd(state)) + stride();
    return `<div class="timeline-track" data-pan-surface aria-hidden="true"></div>
      ${state.history.length ? `<div class="history-region" style="--history-left:${queueSlotX(state.position - 1)}px"></div>` : ''}
      <div class="future-fog" style="--fog-edge:${fogEdge}px"><span>UNSCOUTED</span></div>
      ${bracketMarkup()}${positions.map(slotMarkup).join('')}`;
  };

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
        ${handAttachmentTabsMarkup(card.uid, definition.name)}
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

  const detailMarkup = () => {
    if (!detail) return '';
    const sourceCard = detail.source === 'hand' ? handCard(detail.cardUid) : null;
    const delta = detail.damageModifier ?? damageModifier(state, detail.cardUid, detail.slot);
    let actions = '';
    if (sourceCard) {
      actions = `<button data-action="detail-play" ${canAfford(sourceCard) ? '' : 'disabled'}>${isAttachment(detail.definition) ? 'Attach' : 'Queue card'}</button>`;
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

  const menuMarkup = () => menuOpen ? `<div class="menu-shade"><section class="game-menu" role="dialog" aria-modal="true" aria-labelledby="menu-title" aria-describedby="menu-lore menu-note">
    <span class="eyebrow">GAME MENU</span><h2 id="menu-title">Take a breather</h2>
    <p id="menu-lore">Time-bending aliens are possessing ordinary people. This guard still wants your receipt.</p>
    <p id="menu-note">Combat does not pause while this menu is open.</p>
    <div class="menu-actions"><button class="primary" data-action="close-menu">Return to game</button><button class="menu-restart" data-action="restart">Restart encounter</button></div>
  </section></div>` : '';

  const outcomeMarkup = () => {
    if (mode !== 'ended' || state.phase !== 'victory' && state.phase !== 'defeat') return '';
    const victory = state.phase === 'victory';
    return `<div class="outcome-shade"><section class="outcome ${victory ? 'victory' : 'defeat'}" role="dialog" aria-modal="true" aria-labelledby="outcome-title"><span class="stamp">${victory ? 'AISLE SECURED' : 'SHIFT ENDED'}</span><h2 id="outcome-title">${victory ? 'Victory!' : 'Defeat'}</h2><p>${victory ? 'Bob survives another unreasonable customer interaction.' : 'The alien-possessed guard wins this round. Reset the aisle and try a new plan.'}</p><button class="primary" data-action="restart">Replay encounter</button></section></div>`;
  };

  const missingTargets = () => state.queue.slice(state.position, turnEnd(state)).filter((slot) => slot?.kind === 'player' && slot.target === null).length;
  const resolveReason = () => {
    if (pending) return isAttachment(CARDS[handCard(pending.uid)?.definitionId ?? ''])
      ? 'Choose a compatible card, current position, or turn bracket. Escape cancels.'
      : 'Choose a current-turn position; insertion shifts player cards. Escape cancels.';
    const missing = missingTargets();
    return missing ? `${missing} queued card${missing === 1 ? ' needs' : 's need'} a target.` : '';
  };
  const returnToTurn = () => {
    cameraPosition = state.position + (turnLength(state) - 1) / 2;
    cameraFollowing = true;
  };
  const changeZoom = (next: number) => {
    if (root.contains(document.activeElement)) focusAfterRender = returnFocusSelector(document.activeElement);
    zoom = ZOOM_LEVELS.reduce((nearest, level) => Math.abs(level - next) < Math.abs(nearest - next) ? level : nearest);
    render();
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
    root.classList.toggle('resolving', mode === 'resolving');
    root.classList.toggle('detail-open', Boolean(detail));
    root.innerHTML = `<div class="hud-controls" aria-label="Turn and menu"><div class="turn-badge"><small>TURN</small><b>${state.turn}</b></div><button class="menu-trigger" data-action="open-menu" aria-haspopup="dialog">Menu</button></div>
      <main>${actorMarkup('bob')}${actorMarkup('guard')}
        <section class="timeline${pending ? ' pending-placement' : ''}${showGuides ? ' show-guides' : ''}${modifier ? ' attachment-targeting' : ''}" aria-label="Persistent encounter timeline. History is right, future is left, resolving right to left">${queueMarkup()}</section>
        <nav class="timeline-controls ink-panel" aria-label="Timeline view controls">
          <button data-action="zoom-out" aria-label="Zoom timeline out" title="Zoom out (minus)">−</button>
          <button data-action="zoom-reset" aria-label="Reset timeline zoom" title="Reset zoom (zero)">${Math.round(zoom * 100)}%</button>
          <button data-action="zoom-in" aria-label="Zoom timeline in" title="Zoom in (plus)">+</button>
          <button class="return-turn" data-action="return-turn">Return to turn</button>
        </nav>
        <section class="piles" aria-label="Card piles">${pileMarkup('draw', state.drawPile)}${pileMarkup('discard', state.discardPile)}</section>
        <section class="combat-log ink-panel" aria-label="Combat log"><h2>FIELD NOTES</h2><ol>${log.length ? log.map((line) => `<li>${escapeHtml(line)}</li>`).join('') : '<li>The aisle is quiet. For now.</li>'}</ol></section>
        <button class="resolve primary" data-action="resolve" aria-describedby="resolve-reason" ${mode !== 'planning' || state.phase !== 'planning' || blocked ? 'disabled' : ''}>Resolve Turn${mode === 'dealing' ? '<span>Dealing cards</span>' : blocked ? `<span>${escapeHtml(blocked)}</span>` : ''}</button>
        <div id="resolve-reason" class="notice ${blocked || /cannot|need|invalid|occupied|locked/i.test(notice) ? 'warning' : ''}" role="status" aria-live="polite">${escapeHtml(notice)}</div>
        <div class="hand-zone${modifier ? ' attachment-targeting' : ''}" aria-label="Bob's hand">${handMarkup()}</div>
        <section class="energy-bar ink-panel" role="meter" aria-label="Bob's energy" aria-valuemin="0" aria-valuemax="${bob.energyMax}" aria-valuenow="${energy}" aria-valuetext="${energy} energy">
          <span class="energy-bubbles" aria-hidden="true">${Array.from({ length: bob.energyMax }, (_, index) => `<span class="energy-bubble ${index < energy ? 'available' : 'empty'}"></span>`).join('')}</span>
        </section>
      </main>${detailMarkup()}${inspectorMarkup()}${outcomeMarkup()}${menuMarkup()}`;
    scene.setState(state);
    scene.setCards(visualCards());
    const focusTarget = focusAfterRender ?? (detail ? '.card-detail-controls [data-action="close-card-detail"]' : menuOpen ? `.game-menu [data-action="${focusedMenuAction ?? 'close-menu'}"]` : inspector ? '.pile-inspector button' : mode === 'ended' ? '.outcome button' : null);
    focusAfterRender = null;
    if (focusTarget) root.querySelector<HTMLElement>(focusTarget)?.focus({ preventScroll: true });
  };

  const feedback = (ok: boolean, success: string, reason?: string) => {
    notice = ok ? success : (reason || 'That interaction is not valid right now.');
    if (ok) {
      selection = null;
      pending = null;
      if (cameraFollowing) returnToTurn();
    }
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
    if (pan) {
      if (pan.capture.hasPointerCapture?.(pan.pointerId)) pan.capture.releasePointerCapture(pan.pointerId);
      pan = null;
      root.classList.remove('timeline-panning');
    }
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
    if (isAttachment(CARDS[card.definitionId])) {
      notice = 'Attachments do not take a timeline position. Choose a compatible card, position, or bracket.';
      render();
      return;
    }
    const resolvedTarget = target ?? candidates(card)[0] ?? null;
    const result = queueCard(state, uid, resolvedTarget, slot);
    feedback(result.ok, `${CARDS[card.definitionId].name} inserted at position ${slot}.`, result.reason);
  };

  const attachTo = (target: ModifierTarget, uid?: string) => {
    const source = uid ? handCard(uid) : modifierSource();
    if (!source) return;
    const definition = CARDS[source.definitionId];
    const result = attachModifier(state, source.uid, target);
    const binding = target.kind === 'card' ? 'card' : target.kind === 'slot' ? `position ${target.slot}` : 'current turn bracket';
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
    hiddenHistoryPosition = null;
    completedCards.clear();
    discardedCards.clear();
    inFlight.clear();
    attachmentExitOrigins.clear();
    lingeringAttachments.clear();
    healthFeedback.clear();
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
      scene.setCards(visualCards());
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
      scene.setCards(visualCards());
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
    notice = 'Resolving turn…';
    cameraFollowing = true;
    cameraPosition = state.position;
    render();
    const advanceTrack = async (destination: number) => {
      const origin = cameraPosition;
      const started = performance.now();
      while (!destroyed && run === sequence) {
        const progress = reduceMotion ? 1 : Math.min(1, (performance.now() - started) / 180);
        cameraPosition = origin + (destination - origin) * progress;
        render();
        if (progress === 1) return;
        await wait(16);
      }
    };
    for (const step of steps) {
      if (destroyed || run !== sequence) return;
      const before = state;
      const action = step.events.find((event) => event.kind === 'action');
      const consumed = step.events.find((event) => event.slot !== undefined)?.slot;
      if (consumed !== undefined) cameraPosition = consumed;
      let firedUid: string | null = null;
      let firedPlayer = false;
      let firedAttachments: CardInstance[] = [];
      if (action && action.slot !== undefined && action.target) {
        const slot = step.state.queue[action.slot]!;
        firedUid = slot.kind === 'enemy' ? slot.uid : slot.card.uid;
        firedPlayer = slot.kind === 'player';
        firedAttachments = state.attachments.filter(({ target }) => target.kind === 'card' && target.uid === firedUid).map(({ card }) => card);
        const card = visualCards().find((visual) => visual.uid === firedUid)!;
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
        notice = `Firing position ${action.slot} at ${state.actors[action.target].name}.`;
        render();
        await wait(reduceMotion ? 0 : 150);
        if (destroyed || run !== sequence) return;
        const targetCenter = ACTOR_CENTERS[action.target];
        firingCard = {
          ...firingCard,
          x: targetCenter.x - firingCard.width / 2,
          y: targetCenter.y - firingCard.height / 2,
        };
        scene.setCards(visualCards());
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
            : attachment?.target.kind === 'slot' ? queueCardPose(attachment.target.slot) : null;
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
      hiddenHistoryPosition = firingCard && action?.slot !== undefined ? action.slot : null;
      state = step.state;
      for (const event of step.events) {
        if (event.target && (event.kind === 'damage' || event.kind === 'ringing' || event.kind === 'exposed' && (event.amount ?? 0) > 0)) {
          const health = healthFeedback.get(event.target);
          if (health) health.hitAt = performance.now();
        }
      }
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
        scene.setCards(visualCards());
        await wait(reduceMotion ? 0 : 380);
        if (destroyed || run !== sequence) return;
        completedCards.add(firedUid);
        if (firedPlayer) {
          discardedCards.add(firedUid);
          for (const card of firedAttachments) discardedCards.add(card.uid);
        }
        firingCard = null;
        hiddenHistoryPosition = null;
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
      if (consumed !== undefined) {
        await advanceTrack(consumed + 1);
        if (destroyed || run !== sequence) return;
      }
      if (step.state.activeSlot === null) completedCards.clear();
    }
    if (state.phase === 'planning') returnToTurn();
    mode = state.phase === 'planning' ? 'planning' : 'ended';
    discardedCards.clear();
    if (mode === 'ended') menuOpen = false;
    notice = state.phase === 'planning' ? `Turn ${state.turn}: arrange positions ${state.position}–${turnEnd(state) - 1}.` : (state.phase === 'victory' ? 'Aisle secured. Victory.' : 'Bob is down. Defeat.');
    render();
  };

  const restart = () => {
    sequence++;
    clearPlayback();
    clearInteraction();
    state = createCombat(state.seed);
    returnToTurn();
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
    if (y < QUEUE_HIT_TOP || y > QUEUE_HIT_BOTTOM) return null;
    let nearest: number | null = null;
    let distance = Infinity;
    for (let position = state.position; position < turnEnd(state); position++) {
      if (state.queue[position]?.kind === 'enemy') continue;
      const nextDistance = Math.abs(x - (queueCardX(position) + QUEUE_CARD_WIDTH * zoom / 2));
      if (nextDistance <= distance && nextDistance <= stride() * .7) {
        nearest = position;
        distance = nextDistance;
      }
    }
    return nearest;
  };
  const attachmentTargetAt = (element: HTMLElement | null): ModifierTarget | null => {
    if (element?.closest('[data-bracket-target]')) return { kind: 'bracket' };
    const card = element?.closest<HTMLElement>('.queue-slot.current [data-card-uid], .hand-hit[data-card-uid]');
    if (card) return { kind: 'card', uid: card.dataset.cardUid! };
    const empty = element?.closest<HTMLElement>('.queue-slot.current.empty[data-slot]');
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
    const draggingModifier = Boolean(card && isAttachment(CARDS[card.definitionId]));
    if (drag.kind === 'attachment') {
      drag.destination = null;
      drag.preview = null;
      drag.attachmentTarget = null;
    } else if (draggingModifier) {
      drag.destination = null;
      drag.preview = null;
      const target = attachmentTargetAt(hit);
      const slot = queueSlotAt(point);
      drag.attachmentTarget = target ?? (slot === null ? null : { kind: 'slot', slot });
    } else {
      drag.attachmentTarget = null;
      setDragDestination(queueSlotAt(point));
    }
    root.querySelectorAll<HTMLElement>('.queue-slot').forEach((element) => {
      const slot = Number(element.dataset.slot);
      const over = drag?.kind !== 'attachment' && !draggingModifier && slot === drag?.destination;
      element.classList.toggle('drop-valid', over && drag?.preview !== null);
      element.classList.toggle('drop-invalid', over && drag?.preview === null);
    });
    root.querySelectorAll<HTMLElement>('[data-card-uid], [data-bracket-target]').forEach((element) => {
      const candidate = attachmentTargetAt(element);
      const activeTarget = drag?.attachmentTarget;
      const hovered = Boolean(draggingModifier && candidate && activeTarget && candidate.kind === activeTarget.kind &&
        (candidate.kind === 'card' && activeTarget.kind === 'card' ? candidate.uid === activeTarget.uid :
          candidate.kind === 'slot' && activeTarget.kind === 'slot' ? candidate.slot === activeTarget.slot :
            candidate.kind === 'bracket' && activeTarget.kind === 'bracket'));
      element.classList.toggle('drop-hover', hovered);
    });
    scene.setCards(visualCards());
  };

  const closeDetail = (restoreFocus = true) => {
    if (!detail) return;
    if (restoreFocus) focusAfterRender = detail.returnFocus;
    selection = null;
    pending = null;
    detail = null;
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
      const position = Number(queueElement.dataset.slot);
      const history = historyAt(position);
      const action = history?.action ?? state.queue[position];
      if (!action) return;
      const sourceUid = action.kind === 'enemy' ? action.uid : action.card.uid;
      detail = {
        uid: `${history ? `history:${position}:` : ''}${sourceUid}:detail:${++detailSerial}`,
        cardUid: sourceUid,
        definition: action.kind === 'enemy' ? enemyDefinition(action) : history?.definition ?? CARDS[action.card.definitionId],
        source: history ? 'history' : position >= turnEnd(state) ? 'future' : action.kind === 'enemy' ? 'enemy' : 'queue',
        slot: position,
        target: action.target,
        damageModifier: history?.damageModifier,
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
    const target = event.target as HTMLElement;
    const actionElement = target.closest<HTMLElement>('[data-action]');
    if (actionElement) {
      const action = actionElement.dataset.action;
      if (action === 'restart') restart();
      else if (action === 'zoom-out') changeZoom(zoom - ZOOM_STEP);
      else if (action === 'zoom-reset') changeZoom(1);
      else if (action === 'zoom-in') changeZoom(zoom + ZOOM_STEP);
      else if (action === 'return-turn') {
        focusAfterRender = '.return-turn';
        returnToTurn();
        render();
      }
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
        detail = null;
        inspector = actionElement.dataset.pile as 'draw' | 'discard';
        render();
      } else if (action === 'close-inspector') {
        const pile = inspector;
        inspector = null;
        focusAfterRender = `.pile-button[data-pile="${pile}"]`;
        render();
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
        notice = isAttachment(CARDS[card.definitionId])
          ? 'Attachment selected. Choose a compatible card, current position, or turn bracket.'
          : 'Choose a current-turn position for this card.';
        focusAfterRender = null;
        render();
      } else if (action === 'detail-move' && detail?.source === 'queue' && detail.slot !== null && mode === 'planning') {
        selection = { kind: 'queue', slot: detail.slot };
        detail = null;
        notice = 'Choose a timing point to move this card.';
        focusAfterRender = null;
        render();
      } else if (action === 'detail-refund' && detail && mode === 'planning') {
        const result = detail.source === 'queue' && detail.slot !== null
          ? removeCard(state, detail.slot)
          : removeModifier(state, detail.cardUid);
        feedback(result.ok, 'Card returned to hand and its reserved energy was refunded.', result.reason);
      }
      return;
    }
    if (detail) {
      const point = designPoint(event);
      const pose = scene.getCardPose(detail.uid) ?? DETAIL;
      if (point.x < pose.x || point.x > pose.x + pose.width
        || point.y < pose.y || point.y > pose.y + pose.height) closeDetail(false);
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
      if (source && isAttachment(CARDS[source.definitionId])) attachTo({ kind: 'slot', slot: to });
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
    if (!modal && !drag && !pan && !event.metaKey && !event.ctrlKey && !event.altKey) {
      if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        changeZoom(zoom - ZOOM_STEP);
        return;
      }
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        changeZoom(zoom + ZOOM_STEP);
        return;
      }
      if (event.key === '0') {
        event.preventDefault();
        changeZoom(1);
        return;
      }
      if (event.key === 'Home') {
        event.preventDefault();
        returnToTurn();
        render();
        return;
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        cameraPosition += event.key === 'ArrowLeft' ? 1 : -1;
        cameraFollowing = false;
        render();
        return;
      }
    }
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
        const pile = inspector;
        inspector = null;
        focusAfterRender = `.pile-button[data-pile="${pile}"]`;
        render();
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
    if (!drag && !selection && !pending && !modifierSource() && (target.closest('[data-pan-surface]') || target.matches('.queue-slot, .position-label, .region-label'))) {
      event.preventDefault();
      pan = { pointerId: event.pointerId, x: designPoint(event).x, camera: cameraPosition, capture: root };
      cameraFollowing = false;
      root.setPointerCapture?.(event.pointerId);
      root.classList.add('timeline-panning');
      render();
      return;
    }
    const attachmentTab = target.closest<HTMLElement>('.attachment-tab[data-card]');
    if (!attachmentTab && target.closest('[data-action]')) return;
    const attachmentHand = attachmentTab?.closest<HTMLElement>('[data-hand-card]') ?? null;
    const hand = attachmentTab ? null : target.closest<HTMLElement>('[data-hand-card]');
    const queue = attachmentTab
      ? attachmentTab.closest<HTMLElement>('.queue-slot[data-slot]')
      : target.closest<HTMLElement>('.queue-card[data-slot]');
    if (pending && !attachmentTab) return;
    const activeModifier = modifierSource();
    if (!attachmentTab && activeModifier && (queue || hand?.dataset.handCard !== activeModifier.uid)) return;
    if (!hand && !queue && !attachmentHand && !attachmentTab) return;
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
      : queue ? queueCardPose(slot!) : attachmentHand ? cardLayout(state.hand).get(attachmentHand.dataset.handCard!)!
        : attachmentCardPose({ x: bracketCenterX() - 52, y: 155, width: 105, height: 147, rotation: 0 }, bracketAttachments().findIndex(({ card }) => card.uid === uid), bracketAttachments().length);
    if (attachmentTab && slot !== undefined) {
      const attachment = state.attachments.find(({ card }) => card.uid === uid);
      const attachments = attachment?.target.kind === 'card'
        ? cardAttachments(attachment.target.uid)
        : positionAttachments(slot);
      const attachmentIndex = attachments.findIndex(({ card }) => card.uid === uid);
      if (attachmentIndex >= 0) fallback = attachmentCardPose(queueCardPose(slot), attachmentIndex, attachments.length, attachment?.target.kind === 'card');
    }
    if (attachmentTab && attachmentHand) {
      const hostUid = attachmentHand.dataset.handCard!;
      const attachments = cardAttachments(hostUid);
      const attachmentIndex = attachments.findIndex(({ card }) => card.uid === uid);
      if (attachmentIndex >= 0) fallback = attachmentCardPose(cardLayout(state.hand).get(hostUid)!, attachmentIndex, attachments.length, true);
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
    const draggingModifier = Boolean(source && isAttachment(CARDS[source.definitionId]));
    root.querySelector('.timeline')?.classList.add('show-guides');
    if (draggingModifier) {
      root.querySelector('.timeline')?.classList.add('attachment-targeting');
      root.querySelector('.hand-zone')?.classList.add('attachment-targeting');
    }
    root.querySelectorAll<HTMLElement>('[data-card-uid], [data-bracket-target]').forEach((element) => {
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
    if (pan && pan.pointerId === event.pointerId) {
      cameraPosition = pan.camera + (point.x - pan.x) / stride();
      cameraFollowing = false;
      render();
      return;
    }
    scene.setPointer(point.x, point.y);
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.hypot(point.x - drag.startX, point.y - drag.startY) > 7) drag.moved = true;
    updateDrag(event);
  };

  const finishPointer = (event: PointerEvent, cancelled = false) => {
    if (pan && pan.pointerId === event.pointerId) {
      if (pan.capture.hasPointerCapture?.(pan.pointerId)) pan.capture.releasePointerCapture(pan.pointerId);
      pan = null;
      root.classList.remove('timeline-panning');
      render();
      return;
    }
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
      scene.setCards(visualCards());
      return;
    }
    event.preventDefault();
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
    if (source && isAttachment(CARDS[source.definitionId])) {
      if (finished.attachmentTarget) {
        attachTo(finished.attachmentTarget, finished.uid);
      } else {
        selection = null;
        pending = null;
        notice = 'Drop canceled. Choose a compatible card, current position, or turn bracket.';
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
      feedback(result.ok, `Inserted card at position ${finished.destination}.`, result.reason);
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
        scene.setCards(visualCards());
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
    if (changed) scene.setCards(visualCards());
  };

  const onFocusIn = (event: FocusEvent) => {
    const queue = (event.target as HTMLElement).closest<HTMLElement>('.queue-slot[data-slot]');
    if (queue) {
      hoveredQueueSlot = Number(queue.dataset.slot);
      scene.setCards(visualCards());
    }
  };
  const onFocusOut = (event: FocusEvent) => {
    const target = event.target as HTMLElement;
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
      scene.setCards([]);
    },
  };
}

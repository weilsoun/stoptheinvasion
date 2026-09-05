import { CARDS, ENCOUNTER, STARTER_DECK, enemyIntent } from './content';
import type {
  Actor,
  ActorId,
  Attachment,
  CardInstance,
  CombatEvent,
  CombatState,
  CommandResult,
  Effect,
  EnemyAction,
  ModifierTarget,
  PlayerAction,
  QueueSlot,
  ResolutionStep,
} from './types';

const LOG_LIMIT = 80;
const DEFAULT_SEED = 1;

function failure(reason: string): CommandResult {
  return { ok: false, reason };
}

function definition(card: CardInstance) {
  const value = CARDS[card.definitionId];
  if (!value) throw new Error(`Unknown card definition: ${card.definitionId}`);
  return value;
}

function cloneCard(card: CardInstance): CardInstance {
  return { ...card };
}
function cloneAttachment(attachment: Attachment): Attachment {
  return { card: cloneCard(attachment.card), target: { ...attachment.target } };
}


function cloneSlot(slot: QueueSlot): QueueSlot {
  if (!slot) return null;
  if (slot.kind === 'player') return { ...slot, card: cloneCard(slot.card) };
  return { ...slot, effects: slot.effects.map((effect) => ({ ...effect })) };
}

function cloneState(state: CombatState): CombatState {
  return {
    ...state,
    actors: {
      bob: { ...state.actors.bob },
      guard: { ...state.actors.guard },
    },
    hand: state.hand.map(cloneCard),
    drawPile: state.drawPile.map(cloneCard),
    discardPile: state.discardPile.map(cloneCard),
    queue: state.queue.map(cloneSlot),
    attachments: state.attachments.map(cloneAttachment),
    log: [...state.log],
  };
}


function appendLog(state: CombatState, message: string): void {
  state.log.push(message);
  if (state.log.length > LOG_LIMIT) state.log.splice(0, state.log.length - LOG_LIMIT);
}

function record(state: CombatState, events: CombatEvent[], event: CombatEvent): void {
  events.push(event);
  appendLog(state, event.message);
}

function validIndex(state: CombatState, slot: number): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot < state.queue.length;
}

function planningFailure(state: CombatState): CommandResult | undefined {
  if (state.phase !== 'planning') return failure('Actions can only be changed during planning.');
  if (state.queue.length !== ENCOUNTER.slotCount) return failure('Combat queue is corrupt.');
  return undefined;
}

function validateTarget(state: CombatState, card: CardInstance, target: ActorId | null): string | undefined {
  if (target === null) return `${definition(card).name} needs a target.`;
  if (target !== 'bob' && target !== 'guard') return 'That target does not exist.';
  const cardDefinition = definition(card);
  const expected = cardDefinition.target === 'self' ? card.owner : card.owner === 'bob' ? 'guard' : 'bob';
  if (target !== expected) return `${cardDefinition.name} cannot target ${target}.`;
  if (!state.actors[target] || state.actors[target].hp <= 0) return `${state.actors[target]?.name ?? target} is not a living target.`;
}

function validateAmount(amount: number, label: string): void {
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`Invalid ${label}: ${amount}`);
}

function validateAction(state: CombatState, action: QueueSlot): void {
  if (!action) return;
  if (action.kind === 'player') {
    if (!action.card || (action.card.owner !== 'bob' && action.card.owner !== 'guard')) {
      throw new Error('Invalid queued player action.');
    }
    if (definition(action.card).modifier) throw new Error('Modifier cards cannot occupy queue slots.');
    const targetFailure = validateTarget(state, action.card, action.target);
    if (targetFailure) throw new Error(targetFailure);
    validateAmount(definition(action.card).cost, 'card cost');
    return;
  }
  if (!action.effects || !action.effects.length) throw new Error('Enemy action has no effects.');
  if (!action.name || !action.description) throw new Error('Enemy action is missing display text.');
  if (action.actor !== 'bob' && action.actor !== 'guard') throw new Error('Enemy action has an invalid actor.');
  if (!action.uid) throw new Error('Enemy action is missing a uid.');
  if (action.target !== 'bob' && action.target !== 'guard') throw new Error('Enemy action has an invalid target.');
  if (!state.actors[action.target] || state.actors[action.target].hp <= 0) {
    throw new Error(`${state.actors[action.target]?.name ?? action.target} is not a living target.`);
  }
}

function installIntent(state: CombatState, turn: number): void {
  for (const intent of enemyIntent(turn)) {
    if (!Number.isInteger(intent.slot) || intent.slot < 0 || intent.slot >= ENCOUNTER.slotCount) {
      throw new Error(`Enemy intent has invalid slot ${intent.slot}.`);
    }
    if (state.queue[intent.slot]) throw new Error(`Enemy intents collide in slot ${intent.slot}.`);
    validateAction(state, intent.action);
    state.queue[intent.slot] = cloneSlot(intent.action);
  }
}

function makeActor(
  id: ActorId,
  name: string,
  hp: number,
  energy: number,
  energyMax: number,
  energyGain: number,
  drawCount: number,
): Actor {
  return { id, name, hp, maxHp: hp, block: 0, exposed: 0, energy, energyMax, energyGain, drawCount };
}

export function createCombat(seed = DEFAULT_SEED): CombatState {
  if (!Number.isSafeInteger(seed)) throw new TypeError('Combat seed must be a safe integer.');
  if (!Number.isInteger(ENCOUNTER.slotCount) || ENCOUNTER.slotCount <= 0) {
    throw new Error('Encounter slot count must be a positive integer.');
  }

  const deck = STARTER_DECK.map((definitionId, index): CardInstance => {
    if (!CARDS[definitionId]) throw new Error(`Starter deck contains unknown card: ${definitionId}`);
    return { uid: `bob-${index}-${definitionId}`, definitionId, owner: 'bob' };
  });
  const bob = makeActor(
    'bob',
    'Bob',
    ENCOUNTER.playerHp,
    ENCOUNTER.startingEnergy,
    ENCOUNTER.energyMax,
    ENCOUNTER.energyGain,
    ENCOUNTER.drawCount,
  );
  const guard = makeActor('guard', 'Infected Security', ENCOUNTER.enemyHp, 0, 0, 0, 0);
  validateAmount(bob.hp, 'player health');
  validateAmount(guard.hp, 'enemy health');
  validateAmount(bob.energy, 'starting energy');
  validateAmount(bob.energyMax, 'energy cap');
  validateAmount(bob.energyGain, 'energy gain');
  validateAmount(bob.drawCount, 'draw count');
  if (!Number.isInteger(bob.drawCount) || bob.drawCount > deck.length) {
    throw new Error('Opening draw exceeds the starter deck.');
  }

  const state: CombatState = {
    seed,
    turn: 1,
    phase: 'planning',
    actors: { bob, guard },
    hand: deck.slice(0, bob.drawCount),
    drawPile: deck.slice(bob.drawCount).reverse(),
    discardPile: [],
    queue: Array<QueueSlot>(ENCOUNTER.slotCount).fill(null),
    attachments: [],
    activeSlot: null,
    log: ['Turn 1: plan Bob’s actions.'],
  };
  installIntent(state, state.turn);
  return state;
}

export function availableEnergy(state: CombatState, actor: ActorId = 'bob'): number {
  const source = state.actors[actor];
  if (!source) throw new Error(`Unknown actor: ${actor}`);
  if (state.phase !== 'planning') return source.energy;
  let reserved = 0;
  for (const slot of state.queue) {
    if (slot?.kind === 'player' && slot.card.owner === actor) reserved += definition(slot.card).cost;
  }
  for (const attachment of state.attachments) {
    if (attachment.card.owner === actor) reserved += definition(attachment.card).cost;
  }
  return source.energy - reserved;
}
interface DamageCandidate {
  uid: string;
  owner: ActorId;
  effects: Effect[];
  modifier: boolean;
}

function cardCandidate(card: CardInstance): DamageCandidate {
  const cardDefinition = definition(card);
  return {
    uid: card.uid,
    owner: card.owner,
    effects: cardDefinition.effects,
    modifier: cardDefinition.modifier !== undefined,
  };
}

function slotCandidate(action: Exclude<QueueSlot, null>): DamageCandidate {
  return action.kind === 'player'
    ? cardCandidate(action.card)
    : { uid: action.uid, owner: action.actor, effects: action.effects, modifier: false };
}

function damageCandidate(state: CombatState, uid: string): DamageCandidate | undefined {
  const handCard = state.hand.find((card) => card.uid === uid);
  if (handCard) return cardCandidate(handCard);
  for (const action of state.queue) {
    if (action && (action.kind === 'player' ? action.card.uid : action.uid) === uid) {
      return slotCandidate(action);
    }
  }
}

function compatibleModifierTarget(
  state: CombatState,
  modifierCard: CardInstance,
  candidate: DamageCandidate,
): boolean {
  const modifierDefinition = definition(modifierCard);
  if (
    !modifierDefinition.modifier
    || candidate.uid === modifierCard.uid
    || candidate.modifier
    || !candidate.effects.some((effect) => effect.kind === 'damage')
    || state.actors[candidate.owner].hp <= 0
  ) return false;
  const expectedOwner = modifierDefinition.target === 'self'
    ? modifierCard.owner
    : modifierCard.owner === 'bob' ? 'guard' : 'bob';
  return candidate.owner === expectedOwner;
}

function modifierAttachmentFailure(
  state: CombatState,
  uid: string,
  target: ModifierTarget,
): string | undefined {
  const phaseFailure = planningFailure(state);
  if (phaseFailure) return phaseFailure.reason;
  const modifierCard = state.hand.find((card) => card.uid === uid);
  if (!modifierCard) return 'That modifier card is not in hand.';
  const modifierDefinition = definition(modifierCard);
  if (!modifierDefinition.modifier) return 'That card is not an attachment.';
  if (availableEnergy(state, modifierCard.owner) < modifierDefinition.cost) {
    return 'Not enough available energy.';
  }
  if (target?.kind === 'card') {
    const candidate = damageCandidate(state, target.uid);
    if (!candidate || !compatibleModifierTarget(state, modifierCard, candidate)) {
      return 'That card cannot receive this attachment.';
    }
    return;
  }
  if (target?.kind === 'slot') {
    if (!validIndex(state, target.slot)) return 'Attachment slot must be a valid integer index.';
    const action = state.queue[target.slot];
    if (action && !compatibleModifierTarget(state, modifierCard, slotCandidate(action))) {
      return 'That slot cannot receive this attachment.';
    }
    return;
  }
  return 'That attachment target does not exist.';
}

export function canAttachModifier(state: CombatState, uid: string, target: ModifierTarget): boolean {
  return modifierAttachmentFailure(state, uid, target) === undefined;
}

export function attachModifier(state: CombatState, uid: string, target: ModifierTarget): CommandResult {
  const reason = modifierAttachmentFailure(state, uid, target);
  if (reason) return failure(reason);
  const handIndex = state.hand.findIndex((card) => card.uid === uid);
  const [card] = state.hand.splice(handIndex, 1);
  state.attachments.push({ card, target: { ...target } });
  appendLog(state, `Attached ${definition(card).name}.`);
  return { ok: true };
}

export function removeModifier(state: CombatState, uid: string): CommandResult {
  const phaseFailure = planningFailure(state);
  if (phaseFailure) return phaseFailure;
  const attachmentIndex = state.attachments.findIndex((attachment) => attachment.card.uid === uid);
  if (attachmentIndex < 0) return failure('That attachment is not active.');
  const [attachment] = state.attachments.splice(attachmentIndex, 1);
  state.hand.push(attachment.card);
  appendLog(state, `Returned ${definition(attachment.card).name} to hand.`);
  return { ok: true };
}

export function damageModifier(state: CombatState, uid: string, slot: number | null): number {
  const candidate = damageCandidate(state, uid);
  if (!candidate) return 0;
  let damage = 0;
  for (const attachment of state.attachments) {
    const applies = attachment.target.kind === 'card'
      ? attachment.target.uid === uid
      : slot !== null && attachment.target.slot === slot;
    if (applies && compatibleModifierTarget(state, attachment.card, candidate)) {
      damage += definition(attachment.card).modifier!.damage;
    }
  }
  return damage;
}

function validateAttachments(state: CombatState): void {
  const seen = new Set<string>();
  for (const attachment of state.attachments) {
    const cardDefinition = definition(attachment.card);
    if (attachment.card.owner !== 'bob' && attachment.card.owner !== 'guard') {
      throw new Error('Attachment card has an invalid owner.');
    }
    const sourceIsElsewhere = state.hand.some((card) => card.uid === attachment.card.uid)
      || state.drawPile.some((card) => card.uid === attachment.card.uid)
      || state.discardPile.some((card) => card.uid === attachment.card.uid)
      || state.queue.some((action) => action?.kind === 'player' && action.card.uid === attachment.card.uid);
    if (sourceIsElsewhere) throw new Error('Attachment card exists in another combat zone.');
    if (!cardDefinition.modifier) throw new Error('Active attachment is not a modifier card.');
    if (seen.has(attachment.card.uid)) throw new Error('Attachment card is active more than once.');
    seen.add(attachment.card.uid);
    validateAmount(cardDefinition.cost, 'attachment cost');
    if (!Number.isFinite(cardDefinition.modifier.damage)) throw new Error('Attachment has invalid damage.');
    if (attachment.target.kind === 'card') {
      const candidate = damageCandidate(state, attachment.target.uid);
      if (!candidate || !compatibleModifierTarget(state, attachment.card, candidate)) {
        throw new Error('Attachment has an invalid card target.');
      }
    } else if (attachment.target.kind === 'slot') {
      if (!validIndex(state, attachment.target.slot)) throw new Error('Attachment has an invalid slot target.');
    } else {
      throw new Error('Attachment target does not exist.');
    }
  }
}

interface PlacementPlan {
  queue: QueueSlot[];
  card: CardInstance;
  handIndex: number | null;
}

type PlacementResult = { ok: true; plan: PlacementPlan } | { ok: false; reason: string };

function planPlacement(
  state: CombatState,
  uid: string,
  target: ActorId | null,
  to: number,
  expectedFrom?: number | null,
): PlacementResult {
  const phaseFailure = planningFailure(state);
  if (phaseFailure) return { ok: false, reason: phaseFailure.reason ?? 'Planning is unavailable.' };
  if (!validIndex(state, to)) return { ok: false, reason: 'Queue slot must be a valid integer index.' };
  if (state.queue[to]?.kind === 'enemy') return { ok: false, reason: 'Enemy action slots are locked.' };

  const queuedIndex = expectedFrom === null
    ? -1
    : expectedFrom ?? state.queue.findIndex((slot) => slot?.kind === 'player' && slot.card.uid === uid);
  const queued = queuedIndex >= 0 ? state.queue[queuedIndex] : null;
  if (queuedIndex >= 0 && (!validIndex(state, queuedIndex) || queued?.kind !== 'player' || queued.card.uid !== uid)) {
    return { ok: false, reason: 'That queued card cannot be moved.' };
  }

  const handIndex = queuedIndex < 0 ? state.hand.findIndex((card) => card.uid === uid) : -1;
  if (expectedFrom === null && handIndex < 0) return { ok: false, reason: 'That card is not in hand.' };
  if (expectedFrom !== undefined && expectedFrom !== null && queuedIndex < 0) {
    return { ok: false, reason: 'The source queue slot does not contain that card.' };
  }
  if (queuedIndex < 0 && handIndex < 0) return { ok: false, reason: 'That card is not available.' };

  const card = queued?.kind === 'player' ? queued.card : state.hand[handIndex];
  const cardDefinition = definition(card);
  if (cardDefinition.modifier) return { ok: false, reason: 'Attachments do not occupy queue slots.' };
  let action: PlayerAction;
  if (queued?.kind === 'player') {
    action = queued;
  } else {
    const normalizedTarget = cardDefinition.target === 'self' && target === null ? card.owner : target;
    if (normalizedTarget !== null) {
      const targetFailure = validateTarget(state, card, normalizedTarget);
      if (targetFailure) return { ok: false, reason: targetFailure };
    }
    if (availableEnergy(state, card.owner) < cardDefinition.cost) {
      return { ok: false, reason: 'Not enough available energy.' };
    }
    action = { kind: 'player', card, target: normalizedTarget };
  }

  const queue = state.queue.slice();
  if (queuedIndex === to) return { ok: true, plan: { queue, card, handIndex: null } };

  if (queuedIndex >= 0) {
    if (!queue[to]) {
      queue[queuedIndex] = null;
      queue[to] = action;
    } else {
      const occupied: number[] = [];
      for (let index = Math.min(queuedIndex, to); index <= Math.max(queuedIndex, to); index += 1) {
        if (queue[index]?.kind === 'player') occupied.push(index);
      }
      if (queuedIndex < to) {
        for (let index = 0; index < occupied.length - 1; index += 1) {
          queue[occupied[index]] = queue[occupied[index + 1]];
        }
      } else {
        for (let index = occupied.length - 1; index > 0; index -= 1) {
          queue[occupied[index]] = queue[occupied[index - 1]];
        }
      }
      queue[to] = action;
    }
    return { ok: true, plan: { queue, card, handIndex: null } };
  }

  if (queue[to]) {
    const playerPositions: number[] = [];
    for (let index = 0; index < queue.length; index += 1) {
      if (queue[index]?.kind !== 'enemy') playerPositions.push(index);
    }
    const destination = playerPositions.indexOf(to);
    let hole = -1;
    let distance = Number.POSITIVE_INFINITY;
    for (let rank = 0; rank < playerPositions.length; rank += 1) {
      if (queue[playerPositions[rank]] !== null) continue;
      const candidateDistance = Math.abs(rank - destination);
      if (candidateDistance <= distance) {
        hole = rank;
        distance = candidateDistance;
      }
    }
    if (hole < 0) return { ok: false, reason: 'The queue has no room for another card.' };
    if (hole < destination) {
      for (let rank = hole; rank < destination; rank += 1) {
        queue[playerPositions[rank]] = queue[playerPositions[rank + 1]];
      }
    } else {
      for (let rank = hole; rank > destination; rank -= 1) {
        queue[playerPositions[rank]] = queue[playerPositions[rank - 1]];
      }
    }
  }
  queue[to] = action;
  return { ok: true, plan: { queue, card, handIndex } };
}

export function previewPlacement(
  state: CombatState,
  uid: string,
  target: ActorId | null,
  to: number,
): QueueSlot[] | null {
  const result = planPlacement(state, uid, target, to);
  return result.ok ? result.plan.queue : null;
}

export function queueCard(state: CombatState, uid: string, target: ActorId | null, slot: number): CommandResult {
  const result = planPlacement(state, uid, target, slot, null);
  if (!result.ok) return failure(result.reason);
  const cardDefinition = definition(result.plan.card);
  state.hand.splice(result.plan.handIndex!, 1);
  state.queue = result.plan.queue;
  appendLog(state, `Queued ${cardDefinition.name} in slot ${slot + 1}.`);
  return { ok: true };
}

export function removeCard(state: CombatState, slot: number): CommandResult {
  const phaseFailure = planningFailure(state);
  if (phaseFailure) return phaseFailure;
  if (!validIndex(state, slot)) return failure('Queue slot must be a valid integer index.');
  const action = state.queue[slot];
  if (!action) return failure('That queue slot is empty.');
  if (action.kind !== 'player') return failure('Enemy actions cannot be removed.');
  const cardName = definition(action.card).name;
  state.queue[slot] = null;
  state.hand.push(action.card);
  appendLog(state, `Returned ${cardName} to hand.`);
  return { ok: true };
}

export function moveCard(state: CombatState, from: number, to: number): CommandResult {
  if (!validIndex(state, from)) return failure('The source queue slot must be a valid integer index.');
  const source = state.queue[from];
  if (!source) return failure('The source queue slot is empty.');
  if (source.kind !== 'player') return failure('Enemy actions cannot be moved.');
  const result = planPlacement(state, source.card.uid, source.target, to, from);
  if (!result.ok) return failure(result.reason);
  state.queue = result.plan.queue;
  appendLog(state, `Moved ${definition(source.card).name} to slot ${to + 1}.`);
  return { ok: true };
}

export function retargetCard(state: CombatState, slot: number, target: ActorId): CommandResult {
  const phaseFailure = planningFailure(state);
  if (phaseFailure) return phaseFailure;
  if (!validIndex(state, slot)) return failure('Queue slot must be a valid integer index.');
  const action = state.queue[slot];
  if (!action) return failure('That queue slot is empty.');
  if (action.kind !== 'player') return failure('Enemy actions cannot be retargeted.');
  const targetFailure = validateTarget(state, action.card, target);
  if (targetFailure) return failure(targetFailure);
  const cardName = definition(action.card).name;
  const targetName = state.actors[target].name;
  action.target = target;
  appendLog(state, `Targeted ${cardName} at ${targetName}.`);
  return { ok: true };
}

function hashText(value: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomStep(seed: number): [number, number] {
  let next = (seed + 0x6d2b79f5) >>> 0;
  let value = next;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return [next, ((value ^ (value >>> 14)) >>> 0) / 4294967296];
}

function reshuffle(state: CombatState): void {
  if (!state.discardPile.length) return;
  const pile = state.discardPile.splice(0);
  let randomSeed = hashText(`${state.turn}:${pile.map((card) => card.uid).join('|')}`, state.seed);
  for (let index = pile.length - 1; index > 0; index -= 1) {
    let random: number;
    [randomSeed, random] = randomStep(randomSeed);
    const other = Math.floor(random * (index + 1));
    [pile[index], pile[other]] = [pile[other], pile[index]];
  }
  state.drawPile.push(...pile);
}

function drawCards(
  state: CombatState,
  actor: ActorId,
  count: number,
  events: CombatEvent[],
  protectedCards?: Set<string>,
): void {
  validateAmount(count, 'draw amount');
  if (!Number.isInteger(count)) throw new Error(`Draw amount must be an integer: ${count}`);
  if (actor !== 'bob') throw new Error(`${actor} has no combat deck.`);

  const drawn: CardInstance[] = [];
  for (let index = 0; index < count; index += 1) {
    if (!state.drawPile.length) reshuffle(state);
    const card = state.drawPile.pop();
    if (!card) break;
    state.hand.push(card);
    protectedCards?.add(card.uid);
    drawn.push(card);
  }
  const names = drawn.map((card) => definition(card).name).join(', ');
  record(state, events, {
    kind: 'draw',
    actor,
    amount: drawn.length,
    message: drawn.length ? `${state.actors[actor].name} drew ${drawn.length}: ${names}.` : 'No cards left to draw.',
  });
}

function terminalPhase(state: CombatState): 'victory' | 'defeat' | undefined {
  if (state.actors.bob.hp <= 0) return 'defeat';
  if (state.actors.guard.hp <= 0) return 'victory';
  return undefined;
}

function applyTerminal(state: CombatState, events: CombatEvent[]): void {
  const phase = terminalPhase(state);
  if (!phase || state.phase === phase) return;
  state.phase = phase;
  record(state, events, {
    kind: phase,
    actor: phase === 'victory' ? 'bob' : 'guard',
    target: phase === 'victory' ? 'guard' : 'bob',
    message: phase === 'victory' ? 'The infected guard is down. Victory!' : 'Bob is down. Defeat.',
  });
}

function effectRecipient(action: PlayerAction | EnemyAction, effect: Effect): ActorId {
  const actor = action.kind === 'player' ? action.card.owner : action.actor;
  if (effect.recipient === 'self') return actor;
  if (action.target === null) throw new Error('Targeted effect has no recipient.');
  return action.target;
}

function applyEffect(
  state: CombatState,
  action: PlayerAction | EnemyAction,
  effect: Effect,
  events: CombatEvent[],
  protectedCards: Set<string>,
  damageBonus = 0,
): void {
  validateAmount(effect.amount, `${effect.kind} effect`);
  const actorId = action.kind === 'player' ? action.card.owner : action.actor;
  const recipientId = effectRecipient(action, effect);
  const recipient = state.actors[recipientId];
  if (!recipient) throw new Error(`Effect recipient does not exist: ${recipientId}`);

  if (effect.kind === 'damage') {
    const baseDamage = Math.max(0, effect.amount + damageBonus);
    const exposed = recipient.exposed;
    const incoming = baseDamage + exposed;
    if (exposed > 0) recipient.exposed = 0;
    const blocked = Math.min(recipient.block, incoming);
    recipient.block -= blocked;
    const damage = Math.min(recipient.hp, incoming - blocked);
    recipient.hp -= damage;
    record(state, events, {
      kind: 'damage',
      actor: actorId,
      target: recipientId,
      amount: damage,
      message: `${recipient.name} took ${damage} damage${blocked ? ` (${blocked} blocked)` : ''}${exposed ? `, including ${exposed} Exposed` : ''}.`,
    });
    applyTerminal(state, events);
    return;
  }

  if (effect.kind === 'block') {
    recipient.block += effect.amount;
    record(state, events, {
      kind: 'block', actor: recipientId, target: recipientId, amount: effect.amount,
      message: `${recipient.name} gained ${effect.amount} Block.`,
    });
    return;
  }

  if (effect.kind === 'exposed') {
    recipient.exposed += effect.amount;
    record(state, events, {
      kind: 'exposed', actor: actorId, target: recipientId, amount: effect.amount,
      message: `${recipient.name} gained ${effect.amount} Exposed.`,
    });
    return;
  }

  if (effect.kind === 'energy') {
    const before = recipient.energy;
    recipient.energy = Math.min(recipient.energyMax, recipient.energy + effect.amount);
    const gained = recipient.energy - before;
    record(state, events, {
      kind: 'energy', actor: recipientId, target: recipientId, amount: gained,
      message: `${recipient.name} banked ${gained} energy.`,
    });
    return;
  }

  drawCards(state, recipientId, effect.amount, events, protectedCards);
}


function cleanupHand(state: CombatState, protectedCards: Set<string>): void {
  const kept: CardInstance[] = [];
  for (const card of state.hand) {
    if (protectedCards.has(card.uid) || definition(card).retain) kept.push(card);
    else state.discardPile.push(card);
  }
  state.hand = kept;
  for (const action of state.queue) {
    if (action?.kind === 'player') state.discardPile.push(action.card);
  }
  for (const attachment of state.attachments) state.discardPile.push(attachment.card);
}

export function resolveTurn(state: CombatState): ResolutionStep[] {
  if (state.phase !== 'planning') throw new Error('Only a planning state can be resolved.');
  if (state.queue.length !== ENCOUNTER.slotCount) throw new Error('Combat queue has the wrong number of slots.');
  state.queue.forEach((action) => validateAction(state, action));
  validateAttachments(state);

  const working = cloneState(state);
  const reservedByActor: Record<ActorId, number> = { bob: 0, guard: 0 };
  for (const action of working.queue) {
    if (action?.kind === 'player') reservedByActor[action.card.owner] += definition(action.card).cost;
  }
  for (const attachment of working.attachments) {
    reservedByActor[attachment.card.owner] += definition(attachment.card).cost;
  }
  for (const actorId of ['bob', 'guard'] as const) {
    if (reservedByActor[actorId] > working.actors[actorId].energy) {
      throw new Error(`${actorId} queued more energy than available.`);
    }
    working.actors[actorId].energy -= reservedByActor[actorId];
  }
  working.phase = 'resolving';
  appendLog(working, `Resolution began; ${reservedByActor.bob} energy committed.`);

  const steps: ResolutionStep[] = [];
  const protectedCards = new Set<string>();
  for (let slot = 0; slot < ENCOUNTER.slotCount; slot += 1) {
    working.activeSlot = slot;
    const events: CombatEvent[] = [];
    const action = working.queue[slot];
    const terminal = terminalPhase(working);

    if (terminal) {
      record(working, events, { kind: 'empty', slot, message: `Slot ${slot + 1} canceled: combat is over.` });
    } else if (!action) {
      record(working, events, { kind: 'empty', slot, message: `Slot ${slot + 1} is empty.` });
    } else {
      const actorId = action.kind === 'player' ? action.card.owner : action.actor;
      if (working.actors[actorId].hp <= 0) {
        record(working, events, { kind: 'empty', actor: actorId, slot, message: `${working.actors[actorId].name} cannot act.` });
      } else {
        const actionTarget = action.target;
        if (actionTarget === null) throw new Error('Queued action has no target.');
        record(working, events, {
          kind: 'action',
          actor: actorId,
          target: actionTarget,
          slot,
          message: `${working.actors[actorId].name} used ${
            action.kind === 'player' ? definition(action.card).name : action.name
          }.`,
        });
        const actionUid = action.kind === 'player' ? action.card.uid : action.uid;
        const damageBonus = damageModifier(working, actionUid, slot);
        for (const effect of action.kind === 'player' ? definition(action.card).effects : action.effects) {
          applyEffect(working, action, effect, events, protectedCards, damageBonus);
          if (terminalPhase(working)) break;
        }
      }
    }
    steps.push({ state: cloneState(working), events: events.map((event) => ({ ...event })) });
  }

  cleanupHand(working, protectedCards);
  working.queue = Array<QueueSlot>(ENCOUNTER.slotCount).fill(null);
  working.activeSlot = null;
  working.attachments = [];
  working.actors.bob.block = 0;
  working.actors.guard.block = 0;
  const finalEvents: CombatEvent[] = [];
  const terminal = terminalPhase(working);
  if (terminal) {
    working.phase = terminal;
    record(working, finalEvents, {
      kind: 'turn',
      message: terminal === 'victory' ? 'Combat ended in victory.' : 'Combat ended in defeat.',
    });
  } else {
    working.turn += 1;
    for (const actor of Object.values(working.actors)) {
      actor.energy = Math.min(actor.energyMax, actor.energy + actor.energyGain);
    }
    drawCards(working, 'bob', working.actors.bob.drawCount, finalEvents);
    installIntent(working, working.turn);
    working.phase = 'planning';
    record(working, finalEvents, { kind: 'turn', actor: 'bob', message: `Turn ${working.turn}: plan Bob’s actions.` });
  }
  steps.push({ state: cloneState(working), events: finalEvents.map((event) => ({ ...event })) });
  return steps;
}

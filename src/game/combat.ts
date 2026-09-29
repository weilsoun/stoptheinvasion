import { CARDS, ENCOUNTER, ENCOUNTERS, STARTER_DECK, WORLD_RULES } from './content';
import { canEnter, createStoreMap, findPath, hasLineOfSight } from './map';
import type { MapObject, TilePosition } from './map';
import { randomStep } from './random';
import { applyUpgrade } from './upgrades';
import type {
  CardDefinition,
  CardInstance,
  Direction,
  Effect,
  TimelineCard,
  WorldActor,
  WorldCommand,
  WorldCommandResult,
  WorldEnemy,
  WorldEvent,
  WorldHistoryEntry,
  WorldSnapshot,
  WorldState,
} from './types';

const DEFAULT_SEED = 1;
const LOG_LIMIT = 80;
const PLAYER_ID = 'bob';
const DIRECTIONS: Record<Direction, TilePosition> = {
  up: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

function copyPosition(position: TilePosition): TilePosition {
  return { x: position.x, y: position.y };
}

function copyCard(card: CardInstance): CardInstance {
  return { ...card };
}

function copyDefinition(definition: CardDefinition): CardDefinition {
  return {
    ...definition,
    effects: definition.effects.map((effect) => ({ ...effect })),
    onCritical: definition.onCritical?.map((effect) => ({ ...effect })),
    modifier: definition.modifier && { ...definition.modifier },
    time: definition.time && { ...definition.time },
    temporal: definition.temporal && { ...definition.temporal },
    scaling: definition.scaling && {
      ...definition.scaling,
      effects: definition.scaling.effects && [...definition.scaling.effects],
      time: definition.scaling.time && { ...definition.scaling.time },
    },
  };
}

function copyActor<T extends WorldActor>(actor: T): T {
  return { ...actor, position: copyPosition(actor.position) };
}

function copyEvent(event: WorldEvent): WorldEvent {
  return {
    ...event,
    cards: event.cards?.map(copyCard),
    definition: event.definition && copyDefinition(event.definition),
    from: event.from && copyPosition(event.from),
    to: event.to && copyPosition(event.to),
  };
}

function copyTimelineCard(card: TimelineCard): TimelineCard {
  return {
    ...card,
    definition: card.definition && copyDefinition(card.definition),
    events: card.events.map(copyEvent),
  };
}

function copyHistory(entry: WorldHistoryEntry): WorldHistoryEntry {
  return {
    tick: entry.tick,
    command: { ...entry.command },
    events: entry.events.map(copyEvent),
    cards: entry.cards.map(copyTimelineCard),
  };
}

function snapshot(state: WorldState): WorldSnapshot {
  return {
    seed: state.seed,
    rng: state.rng,
    tick: state.tick,
    phase: state.phase,
    player: copyActor(state.player),
    enemies: state.enemies.map(copyActor),
    deck: state.deck.map(copyCard),
    hand: state.hand.map(copyCard),
    drawPile: state.drawPile.map(copyCard),
    discardPile: state.discardPile.map(copyCard),
    exhaustPile: state.exhaustPile.map(copyCard),
    grades: { ...state.grades },
    retainedUids: [...state.retainedUids],
    drawDebt: state.drawDebt,
    echoUsed: [...state.echoUsed],
    potions: state.potions,
    usedObjectIds: [...state.usedObjectIds],
    completedEncounters: [...state.completedEncounters],
    pendingRewards: [...state.pendingRewards],
    rewardIds: [...state.rewardIds],
    serviceObjectId: state.serviceObjectId,
    timeMode: state.timeMode,
    timeExpires: state.timeExpires,
    scouting: state.scouting,
    scoutingExpires: state.scoutingExpires,
    log: [...state.log],
  };
}

function copySnapshot(value: WorldSnapshot): WorldSnapshot {
  return {
    ...value,
    player: copyActor(value.player),
    enemies: value.enemies.map(copyActor),
    deck: value.deck.map(copyCard),
    hand: value.hand.map(copyCard),
    drawPile: value.drawPile.map(copyCard),
    discardPile: value.discardPile.map(copyCard),
    exhaustPile: value.exhaustPile.map(copyCard),
    grades: { ...value.grades },
    retainedUids: [...value.retainedUids],
    echoUsed: [...value.echoUsed],
    usedObjectIds: [...value.usedObjectIds],
    completedEncounters: [...value.completedEncounters],
    pendingRewards: [...value.pendingRewards],
    rewardIds: [...value.rewardIds],
    log: [...value.log],
  };
}

function cloneState(state: WorldState): WorldState {
  return {
    ...snapshot(state),
    version: 2,
    map: state.map,
    rewindCharges: state.rewindCharges,
    exhaustedByRewind: [...state.exhaustedByRewind],
    history: [...state.history],
    checkpoints: [...state.checkpoints],
  };
}

function restoreSnapshot(state: WorldState, value: WorldSnapshot): void {
  const restored = copySnapshot(value);
  Object.assign(state, restored);
}


function fail(reason: string): WorldCommandResult {
  return { ok: false, reason, events: [] };
}

function addLog(state: WorldState, message: string): void {
  state.log.push(message);
  if (state.log.length > LOG_LIMIT) state.log.splice(0, state.log.length - LOG_LIMIT);
}

function emit(events: WorldEvent[], event: WorldEvent): void {
  events.push(event);
}

function samePosition(a: TilePosition, b: TilePosition): boolean {
  return a.x === b.x && a.y === b.y;
}

function distance(a: TilePosition, b: TilePosition): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function cardByUid(state: WorldState, uid: string): CardInstance | undefined {
  return state.hand.find((card) => card.uid === uid);
}

function baseDefinition(card: CardInstance): CardDefinition {
  const result = CARDS[card.definitionId];
  if (!result) throw new Error(`Unknown card definition: ${card.definitionId}`);
  return result;
}

function shuffle(state: WorldState, cards: CardInstance[]): void {
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const [rng, value] = randomStep(state.rng);
    state.rng = rng;
    const other = Math.floor(value * (index + 1));
    [cards[index], cards[other]] = [cards[other], cards[index]];
  }
}

function refillDrawPile(state: WorldState): void {
  if (state.drawPile.length || !state.discardPile.length) return;
  state.drawPile = state.discardPile.splice(0).sort((a, b) => a.uid.localeCompare(b.uid));
  shuffle(state, state.drawPile);
}

function draw(state: WorldState, count: number, events?: WorldEvent[], eventTick = state.tick, repayDebt = false): CardInstance[] {
  let allowance = Math.max(0, Math.floor(count));
  if (repayDebt && state.drawDebt > 0) {
    const repaid = Math.min(allowance, state.drawDebt);
    state.drawDebt -= repaid;
    allowance -= repaid;
  }
  const drawn: CardInstance[] = [];
  while (drawn.length < allowance) {
    refillDrawPile(state);
    const card = state.drawPile.shift();
    if (!card) break;
    state.hand.push(card);
    drawn.push(card);
  }
  if (drawn.length && events) {
    emit(events, { kind: 'draw', tick: eventTick, actor: PLAYER_ID, amount: drawn.length, cards: drawn.map(copyCard), message: `Bob drew ${drawn.length} card${drawn.length === 1 ? '' : 's'}.` });
  }
  return drawn;
}

function startingDeck(deck?: CardInstance[]): CardInstance[] {
  if (deck) return deck.map(copyCard);
  return STARTER_DECK.map((definitionId, index) => ({ uid: `bob:${index}:${definitionId}`, definitionId, owner: PLAYER_ID }));
}

export function createWorld(seed = DEFAULT_SEED, deck?: CardInstance[]): WorldState {
  if (!Number.isSafeInteger(seed)) throw new TypeError('World seed must be a safe integer.');
  const map = createStoreMap();
  const cards = startingDeck(deck);
  const state: WorldState = {
    version: 2,
    seed,
    rng: seed >>> 0,
    tick: 0,
    phase: 'playing',
    map,
    player: {
      id: PLAYER_ID,
      name: 'Bob',
      position: copyPosition(map.start),
      facing: 'up',
      hp: ENCOUNTER.playerHp,
      maxHp: ENCOUNTER.playerHp,
      block: 0,
      exposed: 0,
      ringing: false,
      energy: WORLD_RULES.initialEnergy,
      energyMax: WORLD_RULES.energyMax,
      surgeEnergy: 0,
      surgeExpires: 0,
    },
    enemies: map.enemies.map((spawn) => {
      const encounter = ENCOUNTERS[spawn.encounterId];
      if (!encounter) throw new Error(`Unknown encounter: ${spawn.encounterId}`);
      return {
        id: spawn.id,
        encounterId: spawn.encounterId,
        name: encounter.name,
        position: copyPosition(spawn.position),
        facing: 'down' as Direction,
        hp: encounter.hp,
        maxHp: encounter.hp,
        block: 0,
        exposed: 0,
        ringing: false,
        aware: false,
        actionProgress: 0,
        actionIndex: 0,
        upgradeLevel: 0,
      };
    }),
    deck: cards.map(copyCard),
    hand: [],
    drawPile: cards.map(copyCard),
    discardPile: [],
    exhaustPile: [],
    grades: {},
    retainedUids: [],
    drawDebt: 0,
    echoUsed: [],
    potions: 0,
    usedObjectIds: [],
    completedEncounters: [],
    pendingRewards: [],
    rewardIds: [],
    serviceObjectId: null,
    timeMode: 'normal',
    timeExpires: 0,
    scouting: 0,
    scoutingExpires: 0,
    rewindCharges: 1,
    exhaustedByRewind: [],
    history: [],
    checkpoints: [],
    log: [],
  };
  shuffle(state, state.drawPile);
  draw(state, WORLD_RULES.initialHand);
  state.checkpoints.push({ tick: 0, snapshot: snapshot(state) });
  return state;
}

export function availableEnergy(state: WorldState): number {
  return Math.max(0, state.player.energy + state.player.surgeEnergy);
}

export function effectiveCard(state: WorldState, uid: string): CardDefinition {
  const card = cardByUid(state, uid);
  if (!card) throw new Error(`Card is not in hand: ${uid}`);
  return copyDefinition(applyUpgrade(baseDefinition(card), state.grades[uid] ?? 0));
}

function canSee(state: WorldState, position: TilePosition): boolean {
  return distance(state.player.position, position) <= WORLD_RULES.sight
    && hasLineOfSight(state.map, state.player.position, position, state.completedEncounters);
}

export function visibleEnemies(state: WorldState): WorldEnemy[] {
  return state.enemies.filter((enemy) => enemy.hp > 0 && canSee(state, enemy.position)).map(copyActor);
}

export function nearbyObjects(state: WorldState): MapObject[] {
  return state.map.objects.filter((object) => !state.usedObjectIds.includes(object.id) && distance(state.player.position, object.position) <= 1).map((object) => ({ ...object, position: copyPosition(object.position) }));
}

export function visibleObjects(state: WorldState): MapObject[] {
  return state.map.objects.filter((object) => {
    if (state.usedObjectIds.includes(object.id)) return false;
    if (canSee(state, object.position)) return true;
    for (const delta of Object.values(DIRECTIONS)) {
      const neighbor = { x: object.position.x + delta.x, y: object.position.y + delta.y };
      if (canEnter(state.map, neighbor, state.completedEncounters) && canSee(state, neighbor)) return true;
    }
    return false;
  }).map((object) => ({ ...object, position: copyPosition(object.position) }));
}

function playerHistorySources(state: WorldState): TimelineCard[] {
  return state.history.flatMap((entry) => entry.cards).filter((card) => card.kind === 'player' && card.definition !== null && !card.canceled);
}

function echoSupported(definition: CardDefinition, defenseOnly: boolean): boolean {
  if (definition.temporal?.kind === 'echo' || definition.time?.kind === 'rewind') return false;
  const effects = definition.effects.filter((effect) => ['damage', 'block', 'exposed'].includes(effect.kind));
  if (!effects.length || effects.length !== definition.effects.length) return false;
  if (definition.onCritical?.some((effect) => effect.kind !== 'ringing')) return false;
  return !defenseOnly || effects.every((effect) => effect.kind === 'block');
}

export function legalTargets(state: WorldState, uid: string): string[] {
  const card = cardByUid(state, uid);
  if (!card) return [];
  const definition = effectiveCard(state, uid);
  if (definition.modifier) {
    if (definition.modifier.levels > 0) {
      return state.hand.filter((candidate) => candidate.uid !== uid && baseDefinition(candidate).scaling !== undefined && baseDefinition(candidate).modifier === undefined).map((candidate) => candidate.uid);
    }
    return visibleEnemies(state).filter((visible) => {
      const enemy = state.enemies.find((candidate) => candidate.id === visible.id)!;
      return definitionForEnemy(state, enemy).scaling !== undefined;
    }).map((enemy) => enemy.id);
  }
  if (definition.temporal?.kind === 'retain') return state.hand.filter((candidate) => candidate.uid !== uid).map((candidate) => candidate.uid);
  if (definition.temporal?.kind === 'echo') {
    return playerHistorySources(state).filter((source) => !state.echoUsed.includes(source.id) && source.definition && echoSupported(source.definition, definition.temporal?.defenseOnly === true)).map((source) => source.id);
  }
  if (definition.time?.kind === 'rewind') return rewindTargets(state).map(String);
  if (definition.target === 'self') return [PLAYER_ID];
  const enemies = visibleEnemies(state);
  return enemies.filter((enemy) => definition.type !== 'attack' || distance(state.player.position, enemy.position) === 1).map((enemy) => enemy.id);
}

function spendEnergy(state: WorldState, amount: number): void {
  const surge = Math.min(state.player.surgeEnergy, amount);
  state.player.surgeEnergy -= surge;
  state.player.energy -= amount - surge;
}

function actorFacing(from: TilePosition, to: TilePosition): Direction {
  if (to.x > from.x) return 'right';
  if (to.x < from.x) return 'left';
  if (to.y > from.y) return 'down';
  return 'up';
}

function beginActorAction(actor: WorldActor): boolean {
  actor.block = 0;
  if (!actor.ringing) return true;
  actor.ringing = false;
  return false;
}

function definitionForEnemy(state: WorldState, enemy: WorldEnemy): CardDefinition {
  const encounter = ENCOUNTERS[enemy.encounterId];
  if (!encounter?.actions.length) throw new Error(`Encounter has no actions: ${enemy.encounterId}`);
  const action = encounter.actions[enemy.actionIndex % encounter.actions.length];
  const targetSelf = !action.effects.some((effect) => effect.recipient === 'target');
  const base: CardDefinition = {
    id: `${enemy.encounterId}:${enemy.actionIndex % encounter.actions.length}`,
    name: action.name,
    cost: 0,
    type: action.effects.some((effect) => effect.kind === 'damage') ? 'attack' : 'skill',
    target: targetSelf ? 'self' : 'enemy',
    description: action.description,
    flavor: encounter.description,
    icon: action.effects.some((effect) => effect.kind === 'damage') ? 'hammer' : 'shield',
    effects: action.effects.map((effect) => ({ ...effect })),
    scaling: action.scaling && { ...action.scaling, effects: action.scaling.effects && [...action.scaling.effects], time: action.scaling.time && { ...action.scaling.time } },
  };
  return copyDefinition(base);
}

export function enemyCard(state: WorldState, enemyId: string): CardDefinition {
  const enemy = state.enemies.find((candidate) => candidate.id === enemyId && candidate.hp > 0);
  if (!enemy) throw new Error(`Unknown living enemy: ${enemyId}`);
  return definitionForEnemy(state, enemy);
}

function applyEffect(state: WorldState, actor: WorldActor, target: WorldActor, effect: Effect, tick: number, events: WorldEvent[]): boolean {
  const recipient = effect.recipient === 'self' ? actor : target;
  const amount = Math.max(0, Math.floor(effect.amount));
  if (effect.kind === 'damage') {
    if (recipient.hp <= 0) return false;
    const exposed = recipient.exposed;
    recipient.exposed = 0;
    const incoming = amount + exposed;
    const blocked = Math.min(recipient.block, incoming);
    recipient.block -= blocked;
    const dealt = Math.min(recipient.hp, incoming - blocked);
    recipient.hp -= dealt;
    emit(events, { kind: 'damage', tick, actor: actor.id, target: recipient.id, amount: dealt, critical: exposed > 0, message: `${actor.name} dealt ${dealt} damage to ${recipient.name}${exposed > 0 ? ' with a critical hit' : ''}.` });
    return exposed > 0;
  }
  if (effect.kind === 'block') {
    recipient.block += amount;
    emit(events, { kind: 'block', tick, actor: actor.id, target: recipient.id, amount, message: `${recipient.name} gained ${amount} Block.` });
  } else if (effect.kind === 'exposed') {
    recipient.exposed += amount;
    emit(events, { kind: 'exposed', tick, actor: actor.id, target: recipient.id, amount, message: `${recipient.name} gained ${amount} Exposed.` });
  } else if (effect.kind === 'heal') {
    const healed = Math.min(amount, recipient.maxHp - recipient.hp);
    recipient.hp += healed;
    emit(events, { kind: 'heal', tick, actor: actor.id, target: recipient.id, amount: healed, message: `${recipient.name} restored ${healed} health.` });
  } else if (effect.kind === 'ringing') {
    recipient.ringing = true;
    emit(events, { kind: 'ringing', tick, actor: actor.id, target: recipient.id, amount, message: `${recipient.name} is Ringing.` });
  } else if (effect.kind === 'energy' && recipient.id === PLAYER_ID) {
    const player = state.player;
    const gained = Math.min(amount, player.energyMax - player.energy);
    player.energy += gained;
    emit(events, { kind: 'energy', tick, actor: actor.id, target: PLAYER_ID, amount: gained, message: `Bob stored ${gained} energy.` });
  } else if (effect.kind === 'draw' && recipient.id === PLAYER_ID) {
    draw(state, amount, events, tick);
  }
  return false;
}

function resolveDefinition(state: WorldState, actor: WorldActor, target: WorldActor, definition: CardDefinition, tick: number, events: WorldEvent[]): void {
  let critical = false;
  for (const effect of definition.effects) {
    critical = applyEffect(state, actor, target, effect, tick, events) || critical;
    if (target.hp <= 0 || actor.hp <= 0) break;
  }
  if (critical && actor.hp > 0 && target.hp > 0) {
    for (const rider of definition.onCritical ?? []) {
      applyEffect(state, actor, target, rider, tick, events);
      if (target.hp <= 0 || actor.hp <= 0) break;
    }
  }
}

function livingEnemyAt(state: WorldState, position: TilePosition, except?: string): WorldEnemy | undefined {
  return state.enemies.find((enemy) => enemy.hp > 0 && enemy.id !== except && samePosition(enemy.position, position));
}

function updateAwareness(state: WorldState, enemy: WorldEnemy): void {
  if (enemy.aware || enemy.hp <= 0) return;
  if (distance(enemy.position, state.player.position) <= WORLD_RULES.sight
    && hasLineOfSight(state.map, enemy.position, state.player.position, state.completedEncounters)) enemy.aware = true;
}

function enemyTimeline(id: string, tick: number, enemy: WorldEnemy, definition: CardDefinition | null, events: WorldEvent[], canceled = false): TimelineCard {
  return { id, tick, kind: 'enemy', definition, upgradeLevel: enemy.upgradeLevel, entityId: enemy.id, events: events.map(copyEvent), canceled };
}

function recordEnemyTimeline(
  state: WorldState,
  cards: TimelineCard[],
  card: TimelineCard,
  cardEvents: WorldEvent[],
  visibleBefore: boolean,
  concealUnseen: boolean,
): void {
  const hidden = concealUnseen && !visibleBefore && !canSee(state, state.enemies.find((enemy) => enemy.id === card.entityId)!.position);
  if (hidden) {
    for (const event of cardEvents) event.visible = false;
  } else {
    cards.push(card);
  }
}

function performEnemyBasicAction(state: WorldState, enemy: WorldEnemy, tick: number, sequence: number, events: WorldEvent[], cards: TimelineCard[], concealUnseen: boolean): void {
  updateAwareness(state, enemy);
  if (!enemy.aware || enemy.hp <= 0 || state.player.hp <= 0) return;
  const visibleBefore = canSee(state, enemy.position);
  const cardEvents: WorldEvent[] = [];
  const base = definitionForEnemy(state, enemy);
  const definition = copyDefinition(applyUpgrade(base, enemy.upgradeLevel));
  const requiresRange = definition.effects.some((effect) => effect.recipient === 'target');
  if (requiresRange && distance(enemy.position, state.player.position) > 1) {
    if (!beginActorAction(enemy)) {
      const event: WorldEvent = { kind: 'action', tick, actor: enemy.id, message: `${enemy.name} lost an action to Ringing.` };
      emit(events, event);
      cardEvents.push(event);
      recordEnemyTimeline(state, cards, enemyTimeline(`timeline:${tick}:enemy:${enemy.id}:${sequence}`, tick, enemy, base, cardEvents, true), cardEvents, visibleBefore, concealUnseen);
      return;
    }
    const occupied = state.enemies.filter((other) => other.hp > 0 && other.id !== enemy.id).map((other) => other.position);
    const path = findPath(state.map, enemy.position, state.player.position, state.completedEncounters, occupied);
    const destination = path?.[0];
    if (destination && !samePosition(destination, state.player.position) && !livingEnemyAt(state, destination, enemy.id)) {
      const from = copyPosition(enemy.position);
      enemy.facing = actorFacing(from, destination);
      enemy.position = copyPosition(destination);
      const event: WorldEvent = { kind: 'move', tick, actor: enemy.id, from, to: copyPosition(destination), message: `${enemy.name} moved closer to Bob.` };
      emit(events, event);
      cardEvents.push(event);
    } else {
      const event: WorldEvent = { kind: 'empty', tick, actor: enemy.id, message: `${enemy.name} could not find a path.` };
      emit(events, event);
      cardEvents.push(event);
    }
    recordEnemyTimeline(state, cards, enemyTimeline(`timeline:${tick}:enemy:${enemy.id}:${sequence}`, tick, enemy, null, cardEvents), cardEvents, visibleBefore, concealUnseen);
    return;
  }
  if (!beginActorAction(enemy)) {
    const event: WorldEvent = { kind: 'action', tick, actor: enemy.id, message: `${enemy.name} lost an action to Ringing.` };
    emit(events, event);
    cardEvents.push(event);
    recordEnemyTimeline(state, cards, enemyTimeline(`timeline:${tick}:enemy:${enemy.id}:${sequence}`, tick, enemy, base, cardEvents, true), cardEvents, visibleBefore, concealUnseen);
    enemy.actionIndex = (enemy.actionIndex + 1) % ENCOUNTERS[enemy.encounterId].actions.length;
    if (enemy.upgradeLevel !== 0) {
      enemy.upgradeLevel = 0;
      delete state.grades[enemy.id];
    }
    return;
  }
  const actionEvent: WorldEvent = { kind: 'action', tick, actor: enemy.id, target: requiresRange ? PLAYER_ID : enemy.id, definition: copyDefinition(definition), message: `${enemy.name} used ${definition.name}.` };
  emit(events, actionEvent);
  cardEvents.push(actionEvent);
  const effectEvents: WorldEvent[] = [];
  resolveDefinition(state, enemy, requiresRange ? state.player : enemy, definition, tick, effectEvents);
  for (const event of effectEvents) {
    emit(events, event);
    cardEvents.push(event);
  }
  recordEnemyTimeline(state, cards, enemyTimeline(`timeline:${tick}:enemy:${enemy.id}:${sequence}`, tick, enemy, base, cardEvents), cardEvents, visibleBefore, concealUnseen);
  enemy.actionIndex = (enemy.actionIndex + 1) % ENCOUNTERS[enemy.encounterId].actions.length;
  if (enemy.upgradeLevel !== 0) {
    enemy.upgradeLevel = 0;
    delete state.grades[enemy.id];
  }
}

function canonicalEnemyTick(state: WorldState, tick: number, events: WorldEvent[], cards: TimelineCard[], allowedIds?: ReadonlySet<string>, concealUnseen = false): void {
  const actionsPerTick = state.timeMode === 'compress' ? 2 : 1;
  const duration = state.timeMode === 'stretch' ? 2 : 1;
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0 || state.player.hp <= 0 || (allowedIds && !allowedIds.has(enemy.id))) continue;
    updateAwareness(state, enemy);
    if (!enemy.aware) continue;
    for (let sequence = 0; sequence < actionsPerTick && enemy.hp > 0 && state.player.hp > 0; sequence += 1) {
      enemy.actionProgress += 1;
      if (enemy.actionProgress < duration) continue;
      enemy.actionProgress = 0;
      performEnemyBasicAction(state, enemy, tick, sequence, events, cards, concealUnseen);
    }
  }
}

function defeatEnemies(state: WorldState, events: WorldEvent[]): void {
  for (const enemy of state.enemies) {
    if (enemy.hp > 0 || state.completedEncounters.includes(enemy.encounterId)) continue;
    state.completedEncounters.push(enemy.encounterId);
    delete state.grades[enemy.id];
    state.pendingRewards.push(enemy.encounterId);
    emit(events, { kind: 'defeat', tick: state.tick, actor: enemy.id, message: `${enemy.name} was defeated.` });
  }
}

function finishTick(state: WorldState, tick: number, events: WorldEvent[], cards: TimelineCard[], replacement: boolean): void {
  const exiting = state.phase === 'victory';
  state.tick = tick;
  canonicalEnemyTick(state, tick, events, cards, undefined, true);
  defeatEnemies(state, events);
  if (state.player.hp <= 0) {
    state.phase = 'defeat';
    state.drawDebt = 0;
    emit(events, { kind: 'defeat', tick, actor: PLAYER_ID, message: 'Bob was defeated.' });
    return;
  }
  if (state.timeExpires > 0 && tick >= state.timeExpires) {
    state.timeMode = 'normal';
    state.timeExpires = 0;
  }
  if (state.scoutingExpires > 0 && tick >= state.scoutingExpires) {
    state.scouting = 0;
    state.scoutingExpires = 0;
  }
  if (state.player.surgeExpires > 0 && tick >= state.player.surgeExpires) {
    state.player.surgeEnergy = 0;
    state.player.surgeExpires = 0;
  }
  const gained = Math.min(WORLD_RULES.energyPerTick, state.player.energyMax - state.player.energy);
  state.player.energy += gained;
  if (gained) emit(events, { kind: 'energy', tick, actor: PLAYER_ID, target: PLAYER_ID, amount: gained, message: `Bob regained ${gained} energy.` });
  if (replacement) draw(state, 1, events, tick, true);
  if (exiting) {
    state.phase = 'victory';
    state.drawDebt = 0;
  } else if (state.pendingRewards.length) state.phase = 'reward';
  emit(events, { kind: 'tick', tick, message: `Tick ${tick} completed.` });
}

function removeHandCard(state: WorldState, uid: string): CardInstance {
  const index = state.hand.findIndex((card) => card.uid === uid);
  if (index < 0) throw new Error(`Card is not in hand: ${uid}`);
  const [card] = state.hand.splice(index, 1);
  return card;
}

function discardPlayed(state: WorldState, card: CardInstance, events: WorldEvent[], exhaust = false): void {
  delete state.grades[card.uid];
  const pile = exhaust ? state.exhaustPile : state.discardPile;
  pile.push(card);
  emit(events, { kind: 'discard', tick: state.tick + 1, actor: PLAYER_ID, cards: [copyCard(card)], sourceUid: card.uid, message: `${card.definitionId} was ${exhaust ? 'exhausted' : 'discarded'}.` });
}

function applyPlayerCard(state: WorldState, card: CardInstance, command: Extract<WorldCommand, { kind: 'play' }>, tick: number, events: WorldEvent[], cards: TimelineCard[]): string | undefined {
  const level = state.grades[card.uid] ?? 0;
  const definition = effectiveCard(state, card.uid);
  if (availableEnergy(state) < definition.cost) return 'Not enough energy.';
  if (definition.temporal?.kind === 'borrow' && state.drawDebt > 0) return 'Borrowed draws must be repaid first.';
  const targets = legalTargets(state, card.uid);
  const selected = definition.temporal?.kind === 'echo'
    ? command.targetId
    : command.targetId ?? (targets.length === 1 ? targets[0] : undefined);
  let echoSource: TimelineCard | undefined;
  let echoTarget: WorldActor | undefined;
  if ((definition.modifier || definition.temporal?.kind === 'retain') && !selected) return 'Choose a target.';
  if (!definition.time && !definition.temporal?.kind && definition.target === 'enemy' && !selected) return targets.length ? 'Choose a target.' : 'No legal target.';
  if (selected && !targets.includes(selected) && !definition.time && definition.temporal?.kind !== 'echo') return 'Invalid target.';
  if (definition.temporal?.kind === 'echo') {
    if (!command.sourceId || !targets.includes(command.sourceId)) return 'Invalid Echo source.';
    echoSource = playerHistorySources(state).find((candidate) => candidate.id === command.sourceId && candidate.definition);
    if (!echoSource?.definition) return 'Invalid Echo source.';
    if (echoSource.definition.target === 'self') {
      if (command.targetId && command.targetId !== PLAYER_ID) return 'Invalid Echo target.';
      echoTarget = state.player;
    } else {
      const candidates = state.enemies.filter((enemy) => enemy.hp > 0 && canSee(state, enemy.position)
        && (echoSource!.definition!.type !== 'attack' || distance(state.player.position, enemy.position) === 1));
      if (command.targetId) echoTarget = candidates.find((enemy) => enemy.id === command.targetId);
      else if (candidates.length === 1) [echoTarget] = candidates;
      else if (candidates.length > 1) return 'Choose an Echo target.';
      if (!echoTarget) return 'No legal Echo target.';
    }
  }
  if (definition.time?.kind === 'rewind') return 'rewind';

  spendEnergy(state, definition.cost);
  const source = removeHandCard(state, card.uid);
  const retained = definition.retain === true || state.retainedUids.includes(card.uid);
  state.retainedUids = state.retainedUids.filter((uid) => uid !== card.uid);
  if (retained) {
    delete state.grades[source.uid];
    state.hand.push(source);
  } else {
    discardPlayed(state, source, events, definition.temporal?.kind === 'borrow');
  }
  const actionEvents: WorldEvent[] = [];
  const actionEvent: WorldEvent = { kind: 'action', tick, actor: PLAYER_ID, target: echoTarget?.id ?? selected, sourceUid: card.uid, definition: copyDefinition(definition), message: `Bob used ${definition.name}.` };
  emit(events, actionEvent);
  actionEvents.push(actionEvent);

  if (!beginActorAction(state.player)) {
    const canceled: WorldEvent = { kind: 'ringing', tick, actor: PLAYER_ID, message: 'Bob lost the action to Ringing.' };
    emit(events, canceled);
    actionEvents.push(canceled);
    cards.push({ id: `timeline:${tick}:player:${card.uid}`, tick, kind: 'player', definition: copyDefinition(baseDefinition(card)), upgradeLevel: level, entityId: PLAYER_ID, sourceUid: card.uid, events: actionEvents.map(copyEvent), canceled: true });
    return undefined;
  }

  if (definition.modifier) {
    if (definition.modifier.levels > 0 && selected) state.grades[selected] = (state.grades[selected] ?? 0) + definition.modifier.levels;
    else if (selected) {
      const enemy = state.enemies.find((candidate) => candidate.id === selected && candidate.hp > 0);
      if (!enemy) return 'Invalid enemy target.';
      enemy.upgradeLevel += definition.modifier.levels;
      state.grades[enemy.id] = enemy.upgradeLevel;
    }
  } else if (definition.temporal?.kind === 'retain' && selected) {
    if (!state.retainedUids.includes(selected)) state.retainedUids.push(selected);
  } else if (definition.temporal?.kind === 'borrow') {
    const amount = definition.temporal.amount ?? 0;
    draw(state, amount, events, tick);
    state.drawDebt += amount;
  } else if (definition.temporal?.kind === 'echo') {
    state.echoUsed.push(echoSource!.id);
    const echoed = copyDefinition(applyUpgrade(echoSource!.definition!, echoSource!.upgradeLevel));
    resolveDefinition(state, state.player, echoTarget!, echoed, tick, actionEvents);
    for (const event of actionEvents.slice(1)) if (!events.includes(event)) emit(events, event);
  } else if (definition.surge) {
    const amount = definition.effects.filter((effect) => effect.kind === 'energy').reduce((total, effect) => total + effect.amount, 0);
    state.player.surgeEnergy += amount;
    state.player.surgeExpires = state.tick + WORLD_RULES.temporalDuration;
    const energyEvent: WorldEvent = { kind: 'energy', tick, actor: PLAYER_ID, target: PLAYER_ID, amount, message: `Bob gained ${amount} Surge energy.` };
    emit(events, energyEvent);
    actionEvents.push(energyEvent);
  } else if (definition.time) {
    if (definition.time.kind === 'scout') {
      state.scouting = definition.time.amount;
      state.scoutingExpires = state.tick + WORLD_RULES.temporalDuration;
    } else {
      if (state.timeMode !== definition.time.kind) {
        for (const enemy of state.enemies) enemy.actionProgress = 0;
      }
      state.timeMode = definition.time.kind;
      state.timeExpires = state.tick + definition.time.amount;
    }
    const timeEvent: WorldEvent = { kind: 'time', tick, actor: PLAYER_ID, amount: definition.time.amount, message: `${definition.name} changed the timeline.` };
    emit(events, timeEvent);
    actionEvents.push(timeEvent);
  } else {
    const target = definition.target === 'self' ? state.player : state.enemies.find((enemy) => enemy.id === selected && enemy.hp > 0);
    if (!target) return 'Invalid target.';
    const effectEvents: WorldEvent[] = [];
    resolveDefinition(state, state.player, target, definition, tick, effectEvents);
    for (const event of effectEvents) {
      emit(events, event);
      actionEvents.push(event);
    }
  }
  cards.push({ id: `timeline:${tick}:player:${card.uid}`, tick, kind: 'player', definition: copyDefinition(baseDefinition(card)), upgradeLevel: level, entityId: PLAYER_ID, sourceUid: card.uid, events: actionEvents.map(copyEvent) });
  return undefined;
}

function validateRewind(state: WorldState, tick: number): { snapshot: WorldSnapshot } | { reason: string } {
  if (state.phase !== 'playing' && state.phase !== 'defeat') return { reason: 'Rewind is unavailable in this phase.' };
  if (!Number.isSafeInteger(tick)) return { reason: 'Rewind tick must be an integer.' };
  if (state.rewindCharges < 1) return { reason: 'No rewind charge remains.' };
  if (tick >= state.tick || tick < Math.max(0, state.tick - WORLD_RULES.rewindWindow)) return { reason: 'That tick is outside the rewind window.' };
  const checkpoint = [...state.checkpoints].reverse().find((candidate) => candidate.tick === tick);
  return checkpoint ? { snapshot: checkpoint.snapshot } : { reason: 'No snapshot exists for that tick.' };
}

export function rewindTargets(state: WorldState): number[] {
  if (state.rewindCharges < 1 || (state.phase !== 'playing' && state.phase !== 'defeat')) return [];
  const minimum = Math.max(0, state.tick - WORLD_RULES.rewindWindow);
  return state.checkpoints.map((checkpoint) => checkpoint.tick).filter((tick) => tick >= minimum && tick < state.tick).sort((a, b) => b - a);
}

function removeEverywhere(state: WorldState, uid: string): CardInstance | undefined {
  for (const zone of [state.hand, state.drawPile, state.discardPile, state.exhaustPile]) {
    const index = zone.findIndex((card) => card.uid === uid);
    if (index >= 0) return zone.splice(index, 1)[0];
  }
  return state.deck.find((card) => card.uid === uid);
}

function performRewind(state: WorldState, tick: number, sourceUids: string[], events: WorldEvent[]): string | undefined {
  const validation = validateRewind(state, tick);
  if ('reason' in validation) return validation.reason;
  const charges = state.rewindCharges - 1;
  const provenance = [...new Set([...state.exhaustedByRewind, ...sourceUids])];
  const history = state.history.filter((entry) => entry.tick <= tick).map(copyHistory);
  const checkpoints = state.checkpoints.filter((checkpoint) => checkpoint.tick <= tick).map((checkpoint) => ({ tick: checkpoint.tick, snapshot: copySnapshot(checkpoint.snapshot) }));
  restoreSnapshot(state, validation.snapshot);
  state.rewindCharges = charges;
  state.exhaustedByRewind = provenance;
  state.history = history;
  state.checkpoints = checkpoints;
  const exhausted: CardInstance[] = [];
  for (const uid of provenance) {
    const card = removeEverywhere(state, uid);
    if (card && !state.exhaustPile.some((candidate) => candidate.uid === uid)) {
      state.exhaustPile.push(card);
      exhausted.push(copyCard(card));
    }
    delete state.grades[uid];
  }
  if (exhausted.length) {
    events.push({ kind: 'discard', tick, actor: PLAYER_ID, cards: exhausted, sourceUid: sourceUids[0], message: `${exhausted.length} rewind source card${exhausted.length === 1 ? ' was' : 's were'} exhausted.` });
  }
  state.retainedUids = state.retainedUids.filter((uid) => !provenance.includes(uid));
  const event: WorldEvent = { kind: 'rewind', tick, actor: PLAYER_ID, amount: tick, sourceUid: sourceUids[0], message: `Bob rewound to tick ${tick}.` };
  events.push(event);
  addLog(state, event.message);
  return undefined;
}

function addSnapshot(state: WorldState): void {
  state.checkpoints = state.checkpoints.filter((checkpoint) => checkpoint.tick !== state.tick);
  state.checkpoints.push({ tick: state.tick, snapshot: snapshot(state) });
  state.checkpoints.sort((left, right) => left.tick - right.tick);
  if (state.checkpoints.length > WORLD_RULES.rewindWindow) {
    state.checkpoints.splice(0, state.checkpoints.length - WORLD_RULES.rewindWindow);
  }
}

export function establishCheckpoint(state: WorldState): void {
  state.rewindCharges = 1;
  state.exhaustedByRewind = [];
  state.checkpoints = [{ tick: state.tick, snapshot: snapshot(state) }];
}
function executeCommand(next: WorldState, command: WorldCommand): WorldCommandResult {
  if (command.kind === 'rewind') {
    const events: WorldEvent[] = [];
    const reason = performRewind(next, command.tick, [], events);
    if (reason) return fail(reason);
    next.history.push({ tick: command.tick, command: { ...command }, events: events.map(copyEvent), cards: [] });
    return { ok: true, events };
  }
  if (next.phase !== 'playing') return fail('The world is not accepting actions now.');
  const tick = next.tick + 1;
  const events: WorldEvent[] = [];
  const cards: TimelineCard[] = [];
  let replacement = false;

  if (command.kind === 'move') {
    const delta = DIRECTIONS[command.direction];
    const destination = { x: next.player.position.x + delta.x, y: next.player.position.y + delta.y };
    if (!canEnter(next.map, destination, next.completedEncounters)) return fail('That tile is blocked.');
    if (livingEnemyAt(next, destination)) return fail('An enemy occupies that tile.');
    const acted = beginActorAction(next.player);
    if (!acted) {
      emit(events, { kind: 'ringing', tick, actor: PLAYER_ID, message: 'Bob lost the move to Ringing.' });
    } else {
      const from = copyPosition(next.player.position);
      next.player.position = destination;
      next.player.facing = command.direction;
      emit(events, { kind: 'move', tick, actor: PLAYER_ID, from, to: copyPosition(destination), message: 'Bob moved.' });
    }
    cards.push({ id: `timeline:${tick}:player:move`, tick, kind: 'empty', definition: null, upgradeLevel: 0, entityId: PLAYER_ID, events: events.map(copyEvent), canceled: !acted });
  } else if (command.kind === 'wait') {
    const acted = beginActorAction(next.player);
    emit(events, { kind: acted ? 'empty' : 'ringing', tick, actor: PLAYER_ID, message: acted ? 'Bob waited.' : 'Bob lost the wait to Ringing.' });
    cards.push({ id: `timeline:${tick}:player:wait`, tick, kind: 'empty', definition: null, upgradeLevel: 0, entityId: PLAYER_ID, events: events.map(copyEvent), canceled: !acted });
  } else if (command.kind === 'potion') {
    if (next.potions < 1) return fail('No potion is available.');
    if (next.player.hp >= next.player.maxHp) return fail('Bob is already at full health.');
    next.potions -= 1;
    const acted = beginActorAction(next.player);
    const amount = acted ? Math.min(WORLD_RULES.potionHeal, next.player.maxHp - next.player.hp) : 0;
    next.player.hp += amount;
    emit(events, { kind: acted ? 'heal' : 'ringing', tick, actor: PLAYER_ID, target: PLAYER_ID, amount, message: acted ? `Bob restored ${amount} health.` : 'Bob lost the potion action to Ringing.' });
    cards.push({ id: `timeline:${tick}:item:potion`, tick, kind: 'item', definition: null, upgradeLevel: 0, entityId: PLAYER_ID, events: events.map(copyEvent), canceled: !acted });
  } else if (command.kind === 'interact') {
    const object = next.map.objects.find((candidate) => candidate.id === command.objectId);
    if (!object || next.usedObjectIds.includes(object.id)) return fail('That object is unavailable.');
    if (distance(next.player.position, object.position) > 1) return fail('That object is out of reach.');
    const acted = beginActorAction(next.player);
    if (!acted) {
      emit(events, { kind: 'ringing', tick, actor: PLAYER_ID, message: 'Bob lost the interaction to Ringing.' });
    } else if (object.kind === 'potion') {
      next.potions += 1;
      next.usedObjectIds.push(object.id);
    } else if (object.kind === 'supply') {
      const amount = Math.min(8, next.player.maxHp - next.player.hp);
      next.player.hp += amount;
      next.usedObjectIds.push(object.id);
      emit(events, { kind: 'heal', tick, actor: PLAYER_ID, target: PLAYER_ID, amount, message: `Bob restored ${amount} health.` });
    } else if (object.kind === 'service') {
      next.serviceObjectId = object.id;
      next.phase = 'service';
    } else {
      if (!next.completedEncounters.includes('night-manager')) return fail('The loading bay is still locked.');
      next.usedObjectIds.push(object.id);
      next.phase = 'victory';
      emit(events, { kind: 'victory', tick, actor: PLAYER_ID, message: 'Bob escaped MOREMART.' });
    }
    emit(events, { kind: 'interact', tick, actor: PLAYER_ID, target: object.id, message: `${acted ? 'Bob used' : 'Bob missed'} ${object.name}.` });
    cards.push({ id: `timeline:${tick}:item:${object.id}`, tick, kind: 'item', definition: null, upgradeLevel: 0, entityId: object.id, events: events.map(copyEvent), canceled: !acted });
  } else {
    const card = cardByUid(next, command.uid);
    if (!card) return fail('Card is not in hand.');
    const definition = effectiveCard(next, card.uid);
    if (definition.time?.kind === 'rewind') {
      const rewindTick = Number(command.sourceId);
      if (!Number.isSafeInteger(rewindTick)) return fail('Choose a rewind tick.');
      if (availableEnergy(next) < definition.cost) return fail('Not enough energy.');
      const level = next.grades[card.uid] ?? 0;
      const boundSources = next.history.flatMap((entry) => entry.events)
        .filter((event) => event.kind === 'action' && event.target === card.uid && event.definition?.modifier)
        .map((event) => event.sourceUid)
        .filter((uid): uid is string => uid !== undefined);
      const reason = performRewind(next, rewindTick, [card.uid, ...boundSources], events);
      if (reason) return fail(reason);
      const timeline: TimelineCard = { id: `timeline:${rewindTick}:rewind:${card.uid}`, tick: rewindTick, kind: 'player', definition: copyDefinition(baseDefinition(card)), upgradeLevel: level, entityId: PLAYER_ID, sourceUid: card.uid, events: events.map(copyEvent) };
      next.history.push({ tick: rewindTick, command: { ...command }, events: events.map(copyEvent), cards: [timeline] });
      return { ok: true, events };
    }
    const reason = applyPlayerCard(next, card, command, tick, events, cards);
    if (reason) return fail(reason);
    replacement = !next.hand.some((candidate) => candidate.uid === card.uid);
  }

  finishTick(next, tick, events, cards, replacement);
  for (const event of events) if (event.visible !== false) addLog(next, event.message);
  const entry: WorldHistoryEntry = { tick, command: { ...command }, events: events.map(copyEvent), cards: cards.map(copyTimelineCard) };
  next.history.push(entry);
  return { ok: true, events };
}

export function stepWorld(state: WorldState, command: WorldCommand): WorldCommandResult {
  const next = cloneState(state);
  if (command.kind !== 'rewind') addSnapshot(next);
  const result = executeCommand(next, command);
  if (!result.ok) return result;
  Object.assign(state, next);
  return { ok: true, events: result.events.map(copyEvent) };
}

export function projectEnemyTicks(state: WorldState, horizon: number): TimelineCard[] {
  if (!Number.isSafeInteger(horizon) || horizon < 0) throw new TypeError('Forecast horizon must be a non-negative integer.');
  const projected = cloneState(state);
  const allowed = new Set(visibleEnemies(state).map((enemy) => enemy.id));
  const cards: TimelineCard[] = [];
  for (let offset = 1; offset <= horizon && projected.player.hp > 0; offset += 1) {
    const tick = projected.tick + offset;
    const events: WorldEvent[] = [];
    beginActorAction(projected.player);
    canonicalEnemyTick(projected, tick, events, cards, allowed);
    if (projected.timeExpires > 0 && tick >= projected.timeExpires) {
      projected.timeMode = 'normal';
      projected.timeExpires = 0;
    }
  }
  return cards.map(copyTimelineCard);
}

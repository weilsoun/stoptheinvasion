import { createWorld, enemyCard, establishCheckpoint, stepWorld } from './combat';
import { CARDS, ENCOUNTER, ENCOUNTERS, REFINEMENTS, WORLD_RULES } from './content';
import { canEnter, createStoreMap } from './map';
import { hashText } from './random';
import { applyUpgrade } from './upgrades';
import type { CardDefinition, CardInstance, CommandResult, WorldActor, WorldCommand, WorldCommandResult, WorldSnapshot, WorldState } from './types';

export type ToolkitId = 'first-shift' | 'second-coat' | 'overnight' | 'quality-control';
export interface Toolkit { id: ToolkitId; name: string; description: string; deck: string[] }
export const TOOLKITS: Toolkit[] = [
  {
    id: 'first-shift', name: 'First Shift',
    description: 'Expose weak points and finish threats before they act.',
    deck: ['hammer', 'hammer', 'hammer', 'vest', 'vest', 'tape', 'heavy', 'brace', 'precision', 'crowbar', 'finisher', 'overtime', 'lookout', 'surge', 'surge'],
  },
  {
    id: 'second-coat', name: 'Second Coat',
    description: 'Build useful history, then Echo an action or rewind your position.',
    deck: ['hammer', 'hammer', 'vest', 'vest', 'tape', 'brace', 'heavy', 'echo', 'secondcoat', 'reclaim', 'reinforce', 'overtime', 'lookout', 'surge', 'surge'],
  },
  {
    id: 'overnight', name: 'Overnight Crew',
    description: 'Retain answers, store energy, and defend at the moment that matters.',
    deck: ['hammer', 'hammer', 'quickfix', 'vest', 'vest', 'hardhat', 'barricade', 'holdfast', 'receipt', 'coffee', 'toolbox', 'overtime', 'lookout', 'surge', 'surge'],
  },
  {
    id: 'quality-control', name: 'Quality Control',
    description: 'Grade precise setup and payoff cards for deliberate combinations.',
    deck: ['hammer', 'hammer', 'vest', 'vest', 'tape', 'tape', 'reinforce', 'reinforce', 'weaken', 'doubletap', 'precision', 'finisher', 'brace', 'lookout', 'surge'],
  },
];

export interface RunState { version: 2; seed: number; toolkit: ToolkitId; world: WorldState }
export interface RunOption { id: string; title: string; description: string; cardId?: string; uid?: string }
const MAX_SAVE_LENGTH = 2_000_000;
const MAX_DECK = 64;
const MIN_DECK = 8;
const MAX_TICK = 1_000_000;
const MAX_AMOUNT = 1_000_000;
const HEAL_AMOUNT = 12;
const ZONES = ['hand', 'drawPile', 'discardPile', 'exhaustPile'] as const;
const MAP = createStoreMap();
const DEFINITIONS: Record<string, CardDefinition> = { ...CARDS };
{
  const world = createWorld();
  for (const enemy of world.enemies) {
    for (let index = 0; index < ENCOUNTERS[enemy.encounterId].actions.length; index++) {
      enemy.actionIndex = index;
      const definition = enemyCard(world, enemy.id);
      DEFINITIONS[definition.id] = definition;
    }
  }
}

export function createRun(seed: number, toolkitId: ToolkitId): RunState {
  if (!integer(seed, 0, 0xffff_ffff)) throw new TypeError('Run seed must be an unsigned 32-bit integer.');
  const toolkit = TOOLKITS.find(({ id }) => id === toolkitId);
  if (!toolkit) throw new TypeError(`Unknown toolkit: ${toolkitId}`);
  const deck: CardInstance[] = toolkit.deck.map((definitionId, index) => ({
    uid: `run:${seed}:start:${index}:${definitionId}`, definitionId, owner: 'bob',
  }));
  return { version: 2, seed, toolkit: toolkitId, world: createWorld(seed, deck) };
}

function rewardOffers(seed: number, world: Pick<WorldState, 'completedEncounters' | 'pendingRewards'>): string[] {
  const encounterId = world.pendingRewards[0];
  if (!encounterId) return [];
  const stage = world.completedEncounters.indexOf(encounterId) + 1;
  const pool = Object.keys(CARDS).filter((id) => stage >= 4 || !id.endsWith('-refined'));
  const attacks = pool.filter((id) => CARDS[id].type === 'attack');
  const defenses = pool.filter((id) => CARDS[id].type !== 'attack' && CARDS[id].effects.some((effect) => effect.kind === 'block' || effect.kind === 'heal'));
  const utility = pool.filter((id) => !attacks.includes(id) && !defenses.includes(id));
  return [attacks, defenses, utility].map((choices, index) => choices[hashText(`reward:${encounterId}:${stage}:${index}`, seed) % choices.length]);
}

export function dispatchRun(run: RunState, command: WorldCommand): WorldCommandResult {
  if (!validCommand(command)) return { ok: false, reason: 'Invalid world command.', events: [] };
  const result = stepWorld(run.world, command);
  if (result.ok) run.world.rewardIds = run.world.phase === 'reward' ? rewardOffers(run.seed, run.world) : [];
  return result;
}

export function runOptions(run: RunState): RunOption[] {
  const world = run.world;
  if (world.phase === 'reward') {
    return [
      ...(world.deck.length < MAX_DECK ? world.rewardIds.map((cardId) => ({
        id: `reward:${cardId}`, title: CARDS[cardId].name, description: CARDS[cardId].description, cardId,
      })) : []),
      { id: 'reward:skip', title: 'Skip', description: 'Keep the deck focused and continue.' },
    ];
  }
  if (world.phase !== 'service') return [];
  const options: RunOption[] = [];
  if (world.player.hp < world.player.maxHp) options.push({ id: 'service:heal', title: 'Patch Up', description: `Restore up to ${HEAL_AMOUNT} health.` });
  for (const card of world.deck) {
    if (world.deck.length > MIN_DECK) options.push({
      id: `service:remove:${card.uid}`, title: `Remove ${CARDS[card.definitionId].name}`,
      description: 'Permanently remove this exact card from the expedition deck.', cardId: card.definitionId, uid: card.uid,
    });
    const refinedId = REFINEMENTS[card.definitionId];
    if (refinedId) options.push({
      id: `service:refine:${card.uid}`, title: `Refine ${CARDS[card.definitionId].name}`,
      description: `Convert this exact card to ${CARDS[refinedId].name} (${CARDS[refinedId].cost} energy): ${CARDS[refinedId].description}`,
      cardId: refinedId, uid: card.uid,
    });
  }
  options.push({ id: 'service:continue', title: 'Keep Moving', description: 'Leave this repair station without making a change.' });
  return options;
}

function updateCard(world: WorldState, uid: string, definitionId?: string): void {
  for (const zone of [world.deck, ...ZONES.map((key) => world[key])]) {
    const index = zone.findIndex((card) => card.uid === uid);
    if (index < 0) continue;
    if (definitionId) zone[index].definitionId = definitionId;
    else zone.splice(index, 1);
  }
  if (!definitionId) {
    delete world.grades[uid];
    world.retainedUids = world.retainedUids.filter((id) => id !== uid);
    world.exhaustedByRewind = world.exhaustedByRewind.filter((id) => id !== uid);
  }
}

export function chooseRunOption(run: RunState, optionId: string): CommandResult {
  const world = run.world;
  if (world.phase === 'reward' && (!world.pendingRewards.length || !same(world.rewardIds, rewardOffers(run.seed, world)))) {
    return { ok: false, reason: 'Invalid reward offers.' };
  }
  if (world.phase === 'service' && (!world.serviceObjectId || world.usedObjectIds.includes(world.serviceObjectId)
    || !world.map.objects.some((object) => object.id === world.serviceObjectId && object.kind === 'service'))) {
    return { ok: false, reason: 'That repair station is unavailable.' };
  }
  const option = runOptions(run).find(({ id }) => id === optionId);
  if (!option) return { ok: false, reason: 'That option is not available now.' };
  if (world.phase === 'reward') {
    if (option.cardId) {
      const card: CardInstance = { uid: `run:${run.seed}:reward:${world.pendingRewards[0]}:${option.cardId}`, definitionId: option.cardId, owner: 'bob' };
      if (world.deck.some(({ uid }) => uid === card.uid)) return { ok: false, reason: 'This reward has already been collected.' };
      world.deck.push(card);
      world.discardPile.push({ ...card });
    }
    world.pendingRewards.shift();
    world.rewardIds = rewardOffers(run.seed, world);
    if (world.pendingRewards.length) return { ok: true };
    world.phase = world.serviceObjectId ? 'service' : 'playing';
  } else {
    if (option.id === 'service:heal') world.player.hp = Math.min(world.player.maxHp, world.player.hp + HEAL_AMOUNT);
    else if (option.uid) updateCard(world, option.uid, option.id.startsWith('service:refine:') ? option.cardId : undefined);
    if (!world.usedObjectIds.includes(world.serviceObjectId!)) world.usedObjectIds.push(world.serviceObjectId!);
    world.serviceObjectId = null;
    world.phase = 'playing';
  }
  // A new independent baseline closes every route back to pre-reward inventory.
  establishCheckpoint(world);
  return { ok: true };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function integer(value: unknown, min = 0, max = MAX_AMOUNT): value is number {
  return Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
}
function text(value: unknown, max = 2_000): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}
function keys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  return required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
}
function same(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left)) return Array.isArray(right) && left.length === right.length && left.every((value, index) => same(value, right[index]));
  if (!record(left) || !record(right)) return false;
  const leftKeys = Object.keys(left).filter((key) => left[key] !== undefined);
  const rightKeys = Object.keys(right).filter((key) => right[key] !== undefined);
  return leftKeys.length === rightKeys.length && rightKeys.every((key) => same(left[key], right[key]));
}
function strings(value: unknown, max: number): value is string[] {
  return Array.isArray(value) && value.length <= max && value.every((item) => text(item, 200)) && new Set(value).size === value.length;
}
function validCard(value: unknown): value is CardInstance {
  return record(value) && keys(value, ['uid', 'definitionId', 'owner']) && text(value.uid, 200)
    && text(value.definitionId, 80) && Object.hasOwn(CARDS, value.definitionId) && value.owner === 'bob';
}
function validCommand(value: unknown): value is WorldCommand {
  if (!record(value)) return false;
  switch (value.kind) {
    case 'move': return keys(value, ['kind', 'direction']) && member(value.direction, ['up', 'right', 'down', 'left']);
    case 'wait': case 'potion': return keys(value, ['kind']);
    case 'interact': return keys(value, ['kind', 'objectId']) && MAP.objects.some(({ id }) => id === value.objectId);
    case 'rewind': return keys(value, ['kind', 'tick']) && integer(value.tick, 0, MAX_TICK);
    case 'play': return keys(value, ['kind', 'uid'], ['targetId', 'sourceId']) && text(value.uid, 200)
      && (value.targetId === undefined || text(value.targetId, 200)) && (value.sourceId === undefined || text(value.sourceId, 200));
    default: return false;
  }
}

function member<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === 'string' && choices.some((choice) => choice === value);
}

const MUTABLE_KEYS = [
  'seed', 'rng', 'tick', 'phase', 'player', 'enemies', 'deck', ...ZONES, 'grades', 'retainedUids',
  'drawDebt', 'echoUsed', 'potions', 'usedObjectIds', 'completedEncounters', 'pendingRewards',
  'rewardIds', 'serviceObjectId', 'timeMode', 'timeExpires', 'scouting', 'scoutingExpires', 'log',
] as const;
const ACTOR_KEYS = ['id', 'name', 'position', 'facing', 'hp', 'maxHp', 'block', 'exposed', 'ringing'];
const EVENT_KINDS = ['move', 'action', 'damage', 'block', 'exposed', 'heal', 'energy', 'draw', 'ringing', 'discard', 'empty', 'victory', 'defeat', 'tick', 'interact', 'time', 'rewind'];

function position(value: unknown): value is { x: number; y: number } {
  return record(value) && keys(value, ['x', 'y']) && integer(value.x, 0, MAP.width - 1) && integer(value.y, 0, MAP.height - 1);
}

function validActor(value: unknown, completed: string[]): value is WorldActor {
  return record(value) && text(value.id, 100) && text(value.name, 100) && position(value.position)
    && canEnter(MAP, value.position, completed) && member(value.facing, ['up', 'right', 'down', 'left'])
    && integer(value.hp) && integer(value.maxHp, 1) && value.hp <= value.maxHp
    && integer(value.block) && integer(value.exposed) && typeof value.ringing === 'boolean';
}

function validInventory(value: Record<string, unknown>, seed: number, toolkit: Toolkit, completedEncounters: string[], pendingRewards: string[]): boolean {
  if (!Array.isArray(value.deck) || value.deck.length < MIN_DECK || value.deck.length > MAX_DECK || !value.deck.every(validCard)) return false;
  const identities = new Map<string, string>();
  const rewarded = new Set<string>();
  let refinements = 0;
  for (const card of value.deck) {
    if (identities.has(card.uid)) return false;
    identities.set(card.uid, card.definitionId);
    const starter = toolkit.deck.findIndex((id, index) => card.uid === `run:${seed}:start:${index}:${id}`);
    if (starter >= 0) {
      const id = toolkit.deck[starter];
      if (card.definitionId !== id && REFINEMENTS[id] !== card.definitionId) return false;
      if (card.definitionId !== id) refinements++;
      continue;
    }
    const encounter = MAP.enemies.find(({ encounterId }) => card.uid.startsWith(`run:${seed}:reward:${encounterId}:`))?.encounterId;
    if (!encounter || rewarded.has(encounter) || !completedEncounters.includes(encounter) || pendingRewards.includes(encounter)) return false;
    const id = card.uid.slice(`run:${seed}:reward:${encounter}:`.length);
    if (!rewardOffers(seed, { completedEncounters, pendingRewards: [encounter] }).includes(id)
      || (card.definitionId !== id && REFINEMENTS[id] !== card.definitionId)) return false;
    if (card.definitionId !== id) refinements++;
    rewarded.add(encounter);
  }
  const missingStarters = toolkit.deck.filter((id, index) => !identities.has(`run:${seed}:start:${index}:${id}`)).length;
  if (!strings(value.usedObjectIds, MAP.objects.length)) return false;
  const services = value.usedObjectIds.filter((id) => MAP.objects.some((object) => object.id === id && object.kind === 'service')).length;
  if (missingStarters + refinements > services) return false;
  const seen = new Set<string>();
  for (const key of ZONES) {
    const zone = value[key];
    if (!Array.isArray(zone) || zone.length > MAX_DECK) return false;
    for (const card of zone) {
      if (!validCard(card) || seen.has(card.uid) || identities.get(card.uid) !== card.definitionId) return false;
      seen.add(card.uid);
    }
  }
  if (seen.size !== identities.size || !record(value.grades)) return false;
  if (!Object.entries(value.grades).every(([uid, level]) => (identities.has(uid) || MAP.enemies.some((enemy) => enemy.id === uid))
    && integer(level, -MAX_AMOUNT, MAX_AMOUNT))) return false;
  const hand = value.hand;
  return Array.isArray(hand) && strings(value.retainedUids, MAX_DECK)
    && value.retainedUids.every((uid) => hand.some((card: CardInstance) => card.uid === uid));
}

function validMutable(value: unknown, seed: number, toolkit: Toolkit): value is WorldSnapshot {
  if (!record(value) || value.seed !== seed || !integer(value.rng, 0, 0xffff_ffff) || !integer(value.tick, 0, MAX_TICK)
    || !member(value.phase, ['playing', 'reward', 'service', 'victory', 'defeat'])) return false;
  const completedEncounters = value.completedEncounters;
  const pendingRewards = value.pendingRewards;
  if (!strings(completedEncounters, MAP.enemies.length)
    || !completedEncounters.every((id) => MAP.enemies.some((enemy) => enemy.encounterId === id))
    || !strings(pendingRewards, MAP.enemies.length)
    || !pendingRewards.every((id) => completedEncounters.includes(id))) return false;
  const rewardIndices = pendingRewards.map((id) => completedEncounters.indexOf(id));
  if (rewardIndices.some((index: number, offset: number) => offset > 0 && index <= rewardIndices[offset - 1])) return false;
  if (!strings(value.usedObjectIds, MAP.objects.length) || !value.usedObjectIds.every((id) => MAP.objects.some((object) => object.id === id))) return false;
  if (value.serviceObjectId !== null && (!text(value.serviceObjectId, 200)
    || !MAP.objects.some((object) => object.id === value.serviceObjectId && object.kind === 'service'))) return false;
  if (!record(value.player) || !keys(value.player, [...ACTOR_KEYS, 'energy', 'energyMax', 'surgeEnergy', 'surgeExpires'])
    || value.player.id !== 'bob' || value.player.maxHp !== ENCOUNTER.playerHp || !validActor(value.player, completedEncounters)
    || value.player.energyMax !== WORLD_RULES.energyMax || !integer(value.player.energy, 0, value.player.energyMax)
    || !integer(value.player.surgeEnergy) || !integer(value.player.surgeExpires, 0, MAX_TICK + MAX_AMOUNT)) return false;
  const expiryFloor = value.tick + (value.phase === 'defeat' ? 0 : 1);
  if (value.player.surgeEnergy > 0 && value.player.surgeExpires < expiryFloor) return false;
  if (!Array.isArray(value.enemies) || value.enemies.length !== MAP.enemies.length) return false;
  const occupied = new Set<string>([`${value.player.position.x},${value.player.position.y}`]);
  for (let index = 0; index < MAP.enemies.length; index++) {
    const enemy = value.enemies[index];
    const spawn = MAP.enemies[index];
    if (!record(enemy) || !keys(enemy, [...ACTOR_KEYS, 'encounterId', 'aware', 'actionProgress', 'actionIndex', 'upgradeLevel'])
      || enemy.id !== spawn.id || enemy.encounterId !== spawn.encounterId || enemy.maxHp !== ENCOUNTERS[spawn.encounterId].hp
      || !validActor(enemy, completedEncounters) || typeof enemy.aware !== 'boolean'
      || !integer(enemy.actionProgress, 0, 1) || !integer(enemy.actionIndex, 0, ENCOUNTERS[spawn.encounterId].actions.length - 1)
      || !integer(enemy.upgradeLevel, -MAX_AMOUNT, MAX_AMOUNT)
      || (enemy.hp === 0) !== completedEncounters.includes(enemy.encounterId)) return false;
    if (enemy.hp > 0) {
      const tile = `${enemy.position.x},${enemy.position.y}`;
      if (occupied.has(tile)) return false;
      occupied.add(tile);
    }
  }
  if (!validInventory(value, seed, toolkit, completedEncounters, pendingRewards) || !integer(value.drawDebt, 0, MAX_DECK)
    || !strings(value.echoUsed, 10_000) || !integer(value.potions, 0, MAP.objects.filter(({ kind }) => kind === 'potion').length)) return false;
  if (!member(value.timeMode, ['normal', 'stretch', 'compress']) || !integer(value.timeExpires, 0, MAX_TICK + MAX_AMOUNT)
    || !integer(value.scouting) || !integer(value.scoutingExpires, 0, MAX_TICK + MAX_AMOUNT)) return false;
  if ((value.timeMode !== 'normal' && value.timeExpires < expiryFloor) || (value.scouting > 0 && value.scoutingExpires < expiryFloor)) return false;
  if (value.timeMode === 'normal' && value.timeExpires !== 0 || value.scouting === 0 && value.scoutingExpires !== 0) return false;
  if (value.player.surgeExpires > value.tick + WORLD_RULES.temporalDuration || value.scoutingExpires > value.tick + WORLD_RULES.temporalDuration) return false;
  const grades = value.grades;
  if (!record(grades) || value.enemies.some((enemy) => (grades[enemy.id] ?? 0) !== enemy.upgradeLevel)) return false;
  if (value.potions > value.usedObjectIds.filter((id) => MAP.objects.some((object) => object.id === id && object.kind === 'potion')).length) return false;
  if (!Array.isArray(value.log) || value.log.length > 100 || !value.log.every((line: unknown) => text(line))) return false;
  if ((value.phase === 'defeat') !== (value.player.hp === 0)) return false;
  if (value.phase === 'service' && value.serviceObjectId === null) return false;
  const playerPosition = value.player.position;
  if (value.serviceObjectId !== null && (value.usedObjectIds.includes(value.serviceObjectId)
    || !MAP.objects.some((object) => object.id === value.serviceObjectId
      && Math.abs(object.position.x - playerPosition.x) + Math.abs(object.position.y - playerPosition.y) <= 1))) return false;
  if (value.phase === 'playing' && (value.serviceObjectId !== null || pendingRewards.length)) return false;
  if (value.phase === 'reward' && !pendingRewards.length) return false;
  if (!strings(value.rewardIds, 3) || !same(value.rewardIds, value.phase === 'reward' ? rewardOffers(seed, { completedEncounters, pendingRewards }) : [])) return false;
  if (value.phase === 'victory' && (!completedEncounters.includes('night-manager') || !value.usedObjectIds.includes('loading-exit'))) return false;
  return true;
}

function validEvent(value: unknown, tick: number): boolean {
  if (!record(value) || !keys(value, ['kind', 'tick', 'message'], ['actor', 'target', 'amount', 'critical', 'visible', 'cards', 'definition', 'sourceUid', 'from', 'to'])
    || !member(value.kind, EVENT_KINDS) || !integer(value.tick, 0, tick) || !text(value.message)) return false;
  for (const key of ['actor', 'target', 'sourceUid']) if (value[key] !== undefined && !text(value[key], 200)) return false;
  if (value.amount !== undefined && !integer(value.amount, -MAX_AMOUNT, MAX_AMOUNT)) return false;
  if (value.critical !== undefined && typeof value.critical !== 'boolean') return false;
  if (value.visible !== undefined && typeof value.visible !== 'boolean') return false;
  if (value.cards !== undefined && (!Array.isArray(value.cards) || value.cards.length > MAX_DECK || !value.cards.every(validCard))) return false;
  if (value.from !== undefined && !position(value.from) || value.to !== undefined && !position(value.to)) return false;
  return value.definition === undefined || validDefinition(value.definition);
}

function validDefinition(value: unknown, level?: number): boolean {
  if (!record(value) || !text(value.id, 200) || !Object.hasOwn(DEFINITIONS, value.id)) return false;
  const base = DEFINITIONS[value.id];
  if (level !== undefined) return (level === 0 || Boolean(base.scaling)) && same(value, applyUpgrade(base, level));
  if (same(value, base)) return true;
  if (!base.scaling || !Array.isArray(value.effects) || value.effects.length !== base.effects.length) return false;
  // Recover a possible authored grade; clamped zero effects may straddle an integer boundary.
  const candidates = new Set<number>();
  for (let index = 0; index < base.effects.length; index++) {
    const effect = value.effects[index];
    if (!record(effect) || !integer(effect.amount)) return false;
    const step = base.scaling.effects?.[index];
    if (!step) continue;
    const grade = (effect.amount - base.effects[index].amount) / step;
    candidates.add(Math.floor(grade));
    candidates.add(Math.ceil(grade));
  }
  if (base.time && base.scaling.time?.amount && record(value.time) && integer(value.time.amount)) {
    const grade = (value.time.amount - base.time.amount) / base.scaling.time.amount;
    candidates.add(Math.floor(grade));
    candidates.add(Math.ceil(grade));
  }
  return [...candidates].some((grade) => integer(grade, -MAX_AMOUNT, MAX_AMOUNT) && same(value, applyUpgrade(base, grade)));
}

function independent(value: unknown, seen: Set<object>): boolean {
  if (typeof value !== 'object' || value === null) return true;
  if (seen.has(value)) return false;
  seen.add(value);
  return Object.values(value).every((child) => independent(child, seen));
}

function validRun(value: unknown): value is RunState {
  if (!record(value) || !keys(value, ['version', 'seed', 'toolkit', 'world']) || value.version !== 2 || !integer(value.seed, 0, 0xffff_ffff)) return false;
  const toolkit = TOOLKITS.find(({ id }) => id === value.toolkit);
  const world = value.world;
  if (!toolkit || !record(world) || !keys(world, [...MUTABLE_KEYS, 'version', 'map', 'rewindCharges', 'exhaustedByRewind', 'history', 'checkpoints'])
    || world.version !== 2 || !same(world.map, MAP) || !validMutable(world, value.seed, toolkit)
    || !integer(world.rewindCharges, 0, 1) || !strings(world.exhaustedByRewind, MAX_DECK)
    || !world.exhaustedByRewind.every((uid) => world.exhaustPile.some((card: CardInstance) => card.uid === uid))) return false;
  if (!Array.isArray(world.history) || world.history.length > 10_000 || !Array.isArray(world.checkpoints)
    || world.checkpoints.length > WORLD_RULES.rewindWindow) return false;
  let previous = -1;
  const occurrenceIds = new Set<string>();
  const playerOccurrenceIds = new Set<string>();
  for (const entry of world.history) {
    if (!record(entry) || !keys(entry, ['tick', 'command', 'events', 'cards']) || !integer(entry.tick, 0, world.tick)
      || entry.tick < previous || !validCommand(entry.command) || !Array.isArray(entry.events) || entry.events.length > 256
      || !Array.isArray(entry.cards) || entry.cards.length > 32) return false;
    const tick = entry.tick;
    if (!entry.events.every((event: unknown) => validEvent(event, tick))) return false;
    previous = tick;
    for (const card of entry.cards) {
      if (!record(card) || !keys(card, ['id', 'tick', 'kind', 'definition', 'upgradeLevel', 'events'], ['entityId', 'sourceUid', 'canceled'])
        || !text(card.id, 200) || occurrenceIds.has(card.id) || card.tick !== entry.tick
        || !member(card.kind, ['player', 'enemy', 'item', 'empty']) || !integer(card.upgradeLevel, -MAX_AMOUNT, MAX_AMOUNT)
        || !Array.isArray(card.events) || card.events.length > 256 || !card.events.every((event: unknown) => validEvent(event, tick))) return false;
      if (card.canceled !== undefined && typeof card.canceled !== 'boolean') return false;
      for (const key of ['entityId', 'sourceUid']) if (card[key] !== undefined && !text(card[key], 200)) return false;
      if (card.definition !== null && !validDefinition(card.definition, 0)) return false;
      if (card.kind === 'player') {
        if (!record(card.definition) || !text(card.definition.id, 200) || !text(card.sourceUid, 200)
          || card.entityId !== 'bob' || !Object.hasOwn(CARDS, card.definition.id)) return false;
        const uid = card.sourceUid;
        const starter = toolkit.deck.find((id, index) => uid === `run:${value.seed}:start:${index}:${id}`);
        const encounter = world.completedEncounters.find((id) => uid.startsWith(`run:${value.seed}:reward:${id}:`));
        const original = starter ?? (encounter ? uid.slice(`run:${value.seed}:reward:${encounter}:`.length) : undefined);
        if (!original || (card.definition.id !== original && card.definition.id !== REFINEMENTS[original])) return false;
        if (encounter && !rewardOffers(value.seed, { completedEncounters: world.completedEncounters, pendingRewards: [encounter] }).includes(original)) return false;
        if (!card.canceled) playerOccurrenceIds.add(card.id);
      }
      if (card.kind === 'enemy' && (!MAP.enemies.some((enemy) => enemy.id === card.entityId)
        || (record(card.definition) && !String(card.definition.id).startsWith(`${card.entityId}:`)))) return false;
      occurrenceIds.add(card.id);
    }
  }
  if (!world.echoUsed.every((id: string) => playerOccurrenceIds.has(id))) return false;
  const references = new Set<object>();
  if (!MUTABLE_KEYS.every((key) => independent(world[key], references))) return false;
  previous = -1;
  for (const checkpoint of world.checkpoints) {
    if (!record(checkpoint) || !keys(checkpoint, ['tick', 'snapshot']) || !integer(checkpoint.tick, Math.max(0, world.tick - WORLD_RULES.rewindWindow), world.tick)
      || checkpoint.tick <= previous || !record(checkpoint.snapshot) || !keys(checkpoint.snapshot, MUTABLE_KEYS)
      || checkpoint.snapshot.tick !== checkpoint.tick || !validMutable(checkpoint.snapshot, value.seed, toolkit)) return false;
    const snapshot = checkpoint.snapshot;
    if (!independent(snapshot, references)
      || !snapshot.completedEncounters.every((id, index) => id === world.completedEncounters[index])
      || !snapshot.echoUsed.every((id) => playerOccurrenceIds.has(id))
      || !snapshot.deck.every((card) => world.deck.some((current) => current.uid === card.uid && current.definitionId === card.definitionId))) return false;
    const completedServices = world.usedObjectIds.filter((id) => MAP.objects.some((object) => object.id === id && object.kind === 'service'));
    if (!same(snapshot.usedObjectIds.filter((id) => completedServices.includes(id)), completedServices)) return false;
    if (world.phase !== 'reward') {
      const resolved = world.completedEncounters.filter((id) => !world.pendingRewards.includes(id));
      if (!same(snapshot.completedEncounters.filter((id) => !snapshot.pendingRewards.includes(id)), resolved)) return false;
    }
    previous = checkpoint.tick;
  }
  return true;
}

export function serializeRun(run: RunState): string {
  if (!validRun(run)) throw new Error('Run state is not safe to serialize.');
  const result = JSON.stringify(run);
  if (result.length > MAX_SAVE_LENGTH) throw new Error('Run save exceeds the supported size.');
  return result;
}
export function deserializeRun(textValue: string): RunState | null {
  if (typeof textValue !== 'string' || !textValue.length || textValue.length > MAX_SAVE_LENGTH) return null;
  try {
    const value: unknown = JSON.parse(textValue);
    return validRun(value) ? value : null;
  } catch { return null; }
}

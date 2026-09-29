import { randomStep } from '../game/random';
import { CREW_CARDS, EXPEDITION_RULES, upgradeShipCard } from './expedition-content';
import type {
  EnemyShip,
  ShipActor,
  ShipBaseCardId,
  ShipBattleEvent,
  ShipBattleState,
  ShipBattleSetup,
  ShipCard,
  ShipCardDefinition,
  ShipCardId,
  ShipCommand,
  ShipCommandResult,
  ShipEffect,
  ShipIntent,
  ShipLoadout,
} from './types';

export const SHIP_RULES = Object.freeze({
  deckSize: 15,
  handSize: 5,
  maxEnergy: 3,
  playerHull: 70,
  playerShield: 12,
  playerRecharge: 3,
  adaptiveCoilsShield: 2,
} as const);

function definition(
  id: ShipCardId,
  title: string,
  cost: number,
  kind: ShipCardDefinition['kind'],
  effects: readonly ShipEffect[],
  flavor: string,
  exhaust = false,
): ShipCardDefinition {
  return Object.freeze({
    id,
    title,
    cost,
    kind,
    effects: Object.freeze(effects.map((effect) => Object.freeze({ ...effect }))),
    ...(exhaust ? { exhaust: true } : {}),
    flavor,
  });
}

export const SHIP_CARDS: Readonly<Record<ShipBaseCardId, ShipCardDefinition>> = Object.freeze({
  pulse: definition('pulse', 'Pulse Cannon', 1, 'attack', [{ kind: 'damage', amount: 8 }], 'A clean burst across the dark.'),
  shield: definition('shield', 'Shield Cycle', 1, 'system', [{ kind: 'shield', amount: 6 }], 'Route everything through the forward lattice.'),
  lance: definition('lance', 'Rail Lance', 2, 'attack', [{ kind: 'damage', amount: 15 }], 'One line. No second warning.'),
  cell: definition('cell', 'Reserve Cell', 0, 'system', [{ kind: 'energy', amount: 2 }], 'Break seal only when the bridge lights dim.', true),
  sweep: definition('sweep', 'Tactical Sweep', 1, 'crew', [{ kind: 'draw', amount: 2 }], 'Every station reports in.'),
  burst: definition('burst', 'Twin Burst', 1, 'attack', [{ kind: 'damage', amount: 5 }, { kind: 'damage', amount: 5 }], 'Two impacts, one firing solution.'),
});

export const SHIP_CARD_CATALOG: Readonly<Record<string, ShipCardDefinition>> = Object.freeze({
  ...SHIP_CARDS,
  ...CREW_CARDS,
});

const CORSAIR_INTENTS: readonly ShipIntent[] = Object.freeze([
  Object.freeze({ title: 'Raking Fire', effects: Object.freeze([{ kind: 'damage' as const, amount: 6 }]) }),
  Object.freeze({ title: 'Cutthroat Volley', effects: Object.freeze([{ kind: 'damage' as const, amount: 9 }]) }),
]);
const NEEDLE_INTENTS: readonly ShipIntent[] = Object.freeze([
  Object.freeze({ title: 'Needle Pair', effects: Object.freeze([{ kind: 'damage' as const, amount: 4 }, { kind: 'damage' as const, amount: 4 }]) }),
  Object.freeze({ title: 'Deflection Weave', effects: Object.freeze([{ kind: 'shield' as const, amount: 4 }]) }),
]);
const BULWARK_INTENTS: readonly ShipIntent[] = Object.freeze([
  Object.freeze({ title: 'Tug Ram', effects: Object.freeze([{ kind: 'damage' as const, amount: 8 }]) }),
  Object.freeze({ title: 'Brace Plating', effects: Object.freeze([{ kind: 'shield' as const, amount: 6 }]) }),
  Object.freeze({ title: 'Mass Driver', effects: Object.freeze([{ kind: 'damage' as const, amount: 12 }]) }),
]);

export const SHIP_DECK: readonly ShipCardId[] = Object.freeze([
  'pulse', 'pulse', 'pulse', 'pulse', 'pulse', 'pulse', 'pulse',
  'shield', 'shield', 'shield',
  'lance', 'lance',
  'cell', 'sweep', 'burst',
]);

function copyEffect(effect: ShipEffect): ShipEffect {
  return { ...effect };
}

function copyDefinition(source: ShipCardDefinition): ShipCardDefinition {
  return { ...source, effects: source.effects.map(copyEffect) };
}

const RESEARCH_ID = /^research:[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;
const CARD_KEYS: Readonly<Record<string, true>> = Object.freeze({
  id: true,
  title: true,
  cost: true,
  kind: true,
  effects: true,
  exhaust: true,
  flavor: true,
});
const EFFECT_KEYS: Readonly<Record<string, true>> = Object.freeze({ kind: true, amount: true });
const LOADOUT_KEYS: Readonly<Record<string, true>> = Object.freeze({ deck: true, cards: true });
const SETUP_KEYS: Readonly<Record<string, true>> = Object.freeze({ hull: true, deck: true, enemies: true });
const PERSISTENT_CARD_KEYS: Readonly<Record<string, true>> = Object.freeze({ uid: true, id: true, upgradeLevel: true });
const ENEMY_SPEC_KEYS: Readonly<Record<string, true>> = Object.freeze({
  id: true,
  name: true,
  role: true,
  hull: true,
  shield: true,
  recharge: true,
});
const INSTANCE_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/;
const EFFECT_LIMITS: Readonly<Record<ShipEffect['kind'], number>> = Object.freeze({
  damage: 24,
  shield: 12,
  draw: 3,
  energy: 3,
});

function failLoadout(message: string): never {
  throw new TypeError(`Invalid ship loadout: ${message}`);
}

function hasOwn(source: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function hasOnlyKeys(source: object, allowed: Readonly<Record<string, true>>): boolean {
  return Reflect.ownKeys(source).every((key) => typeof key === 'string' && allowed[key] === true);
}

function immutableResearchDefinition(value: unknown): ShipCardDefinition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) failLoadout('card definitions must be objects.');
  const card = value as Record<PropertyKey, unknown>;
  if (!hasOnlyKeys(card, CARD_KEYS)) failLoadout('card definition has unexpected fields.');
  for (const key of ['id', 'title', 'cost', 'kind', 'effects', 'flavor']) {
    if (!hasOwn(card, key)) failLoadout(`card definition is missing ${key}.`);
  }
  if (typeof card.id !== 'string' || !RESEARCH_ID.test(card.id)) {
    failLoadout('research card ids must be safe lowercase identifiers no longer than 57 characters.');
  }
  if (hasOwn(SHIP_CARD_CATALOG, card.id)) failLoadout('shipped card definitions cannot be overridden.');
  if (typeof card.title !== 'string' || card.title.trim().length === 0) failLoadout('card title must be nonempty.');
  if (typeof card.flavor !== 'string' || card.flavor.trim().length === 0) failLoadout('card flavor must be nonempty.');
  if (typeof card.cost !== 'number' || !Number.isFinite(card.cost) || !Number.isInteger(card.cost) || card.cost < 0 || card.cost > 3) {
    failLoadout('card cost must be an integer from 0 through 3.');
  }
  if (card.kind !== 'attack' && card.kind !== 'system' && card.kind !== 'crew') failLoadout('card kind is unsupported.');
  if (!Array.isArray(card.effects) || card.effects.length < 1 || card.effects.length > 2) {
    failLoadout('cards must have one or two effects.');
  }
  if (hasOwn(card, 'exhaust') && typeof card.exhaust !== 'boolean') failLoadout('exhaust must be boolean.');

  const effects = Array.from(card.effects, (value): ShipEffect => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) failLoadout('effects must be objects.');
    const effect = value as Record<PropertyKey, unknown>;
    if (!hasOnlyKeys(effect, EFFECT_KEYS) || !hasOwn(effect, 'kind') || !hasOwn(effect, 'amount')) {
      failLoadout('effects must contain only kind and amount.');
    }
    if (effect.kind !== 'damage' && effect.kind !== 'shield' && effect.kind !== 'draw' && effect.kind !== 'energy') {
      failLoadout('effect kind is unsupported.');
    }
    if (typeof effect.amount !== 'number' || !Number.isFinite(effect.amount) || !Number.isInteger(effect.amount) || effect.amount < 1
      || effect.amount > EFFECT_LIMITS[effect.kind]) {
      failLoadout(`${effect.kind} amount is outside the supported study bounds.`);
    }
    return Object.freeze({ kind: effect.kind, amount: effect.amount as number });
  });

  if (card.kind === 'attack') {
    if (effects.some((effect) => effect.kind !== 'damage')) failLoadout('attack cards may contain only damage effects.');
  } else if (effects.some((effect) => effect.kind === 'damage')) {
    failLoadout('self-targeted cards cannot contain damage effects.');
  }
  if ((card.cost === 0 || effects.some((effect) => effect.kind === 'energy')) && card.exhaust !== true) {
    failLoadout('zero-cost and energy-granting research cards must exhaust.');
  }

  return Object.freeze({
    id: card.id as ShipCardId,
    title: card.title,
    cost: card.cost,
    kind: card.kind,
    effects: Object.freeze(effects),
    ...(hasOwn(card, 'exhaust') ? { exhaust: card.exhaust as boolean } : {}),
    flavor: card.flavor,
  });
}

function prepareLoadout(loadout: ShipLoadout | undefined): {
  deck: readonly ShipCardId[];
  catalog: Readonly<Record<string, ShipCardDefinition>>;
} {
  if (loadout === undefined) return { deck: SHIP_DECK, catalog: SHIP_CARD_CATALOG };
  if (!loadout || typeof loadout !== 'object' || Array.isArray(loadout)) failLoadout('loadout must be an object.');
  if (!hasOnlyKeys(loadout, LOADOUT_KEYS) || !hasOwn(loadout, 'deck')) {
    failLoadout('loadout must contain only deck and optional cards.');
  }
  if (!Array.isArray(loadout.deck) || loadout.deck.length !== SHIP_RULES.deckSize) {
    failLoadout(`deck must contain exactly ${SHIP_RULES.deckSize} cards.`);
  }
  const suppliedCards = hasOwn(loadout, 'cards') ? loadout.cards : undefined;
  if (suppliedCards !== undefined && !Array.isArray(suppliedCards)) failLoadout('cards must be an array.');
  if (suppliedCards && suppliedCards.length > SHIP_RULES.deckSize) failLoadout('too many research card definitions.');

  const additions: Record<string, ShipCardDefinition> = Object.create(null);
  for (const source of suppliedCards ?? []) {
    const card = immutableResearchDefinition(source);
    if (hasOwn(additions, card.id)) failLoadout(`duplicate definition for ${card.id}.`);
    additions[card.id] = card;
  }
  const catalog: Readonly<Record<string, ShipCardDefinition>> = Object.freeze({ ...SHIP_CARD_CATALOG, ...additions });
  const deck = Array.from(loadout.deck, (id) => {
    if (typeof id !== 'string' || !hasOwn(catalog, id)) failLoadout(`deck contains unknown card ${String(id)}.`);
    return id as ShipCardId;
  });
  return { deck: Object.freeze(deck), catalog };
}

function failSetup(message: string): never {
  throw new TypeError(`Invalid ship battle setup: ${message}`);
}

function prepareSetup(setup: ShipBattleSetup | undefined): {
  hull: number;
  deck: readonly ShipCard[];
  enemies: readonly {
    id: string;
    name: string;
    role: EnemyShip['role'];
    hull: number;
    shield: number;
    recharge: number;
  }[];
} | undefined {
  if (setup === undefined) return undefined;
  if (!setup || typeof setup !== 'object' || Array.isArray(setup)) failSetup('setup must be an object.');
  if (!hasOnlyKeys(setup, SETUP_KEYS) || !hasOwn(setup, 'hull') || !hasOwn(setup, 'deck') || !hasOwn(setup, 'enemies')) {
    failSetup('setup must contain only hull, deck, and enemies.');
  }
  if (!Number.isInteger(setup.hull) || setup.hull < 1 || setup.hull > SHIP_RULES.playerHull) {
    failSetup(`hull must be a living integer from 1 through ${SHIP_RULES.playerHull}.`);
  }
  if (!Array.isArray(setup.deck) || setup.deck.length < EXPEDITION_RULES.minDeck || setup.deck.length > EXPEDITION_RULES.maxDeck) {
    failSetup(`deck must contain ${EXPEDITION_RULES.minDeck} through ${EXPEDITION_RULES.maxDeck} cards.`);
  }

  const cardIds = new Set<string>();
  const deck = Array.from(setup.deck, (value): ShipCard => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) failSetup('deck cards must be objects.');
    const card = value as Record<PropertyKey, unknown>;
    if (!hasOnlyKeys(card, PERSISTENT_CARD_KEYS) || !hasOwn(card, 'uid') || !hasOwn(card, 'id')) {
      failSetup('deck cards must contain only uid, id, and optional upgradeLevel.');
    }
    if (typeof card.uid !== 'string' || !INSTANCE_ID.test(card.uid)) failSetup('card uid is invalid.');
    if (cardIds.has(card.uid)) failSetup(`duplicate card uid ${card.uid}.`);
    if (typeof card.id !== 'string' || !hasOwn(SHIP_CARD_CATALOG, card.id)) failSetup(`deck contains unknown card ${String(card.id)}.`);
    const upgradeLevel = hasOwn(card, 'upgradeLevel') ? card.upgradeLevel : 0;
    if (!Number.isInteger(upgradeLevel) || (upgradeLevel as number) < 0 || (upgradeLevel as number) > EXPEDITION_RULES.maxUpgrade) {
      failSetup(`card ${card.uid} has an invalid upgrade level.`);
    }
    cardIds.add(card.uid);
    return {
      uid: card.uid,
      id: card.id as ShipCardId,
      ...(hasOwn(card, 'upgradeLevel') ? { upgradeLevel: upgradeLevel as number } : {}),
    };
  });

  if (!Array.isArray(setup.enemies) || setup.enemies.length < 1 || setup.enemies.length > 3) {
    failSetup('setup must contain one through three enemies.');
  }
  const enemyIds = new Set<string>();
  const enemies = Array.from(setup.enemies, (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) failSetup('enemy instances must be objects.');
    const enemy = value as Record<PropertyKey, unknown>;
    if (!hasOnlyKeys(enemy, ENEMY_SPEC_KEYS)
      || !['id', 'name', 'role', 'hull', 'shield', 'recharge'].every((key) => hasOwn(enemy, key))) {
      failSetup('enemy instances must contain exactly id, name, role, hull, shield, and recharge.');
    }
    if (typeof enemy.id !== 'string' || !INSTANCE_ID.test(enemy.id) || enemy.id === 'player') failSetup('enemy id is invalid.');
    if (enemyIds.has(enemy.id)) failSetup(`duplicate enemy id ${enemy.id}.`);
    if (typeof enemy.name !== 'string' || enemy.name.trim().length === 0) failSetup('enemy name is invalid.');
    if (enemy.role !== 'corsair' && enemy.role !== 'needle' && enemy.role !== 'bulwark') failSetup('enemy role is invalid.');
    for (const [key, minimum] of [['hull', 1], ['shield', 0], ['recharge', 0]] as const) {
      if (!Number.isSafeInteger(enemy[key]) || (enemy[key] as number) < minimum) {
        failSetup(`enemy ${key} is invalid.`);
      }
    }
    enemyIds.add(enemy.id);
    return {
      id: enemy.id,
      name: enemy.name,
      role: enemy.role,
      hull: enemy.hull as number,
      shield: enemy.shield as number,
      recharge: enemy.recharge as number,
    };
  });

  return { hull: setup.hull, deck, enemies };
}

function copyIntent(source: ShipIntent): ShipIntent {
  return { ...source, effects: source.effects.map(copyEffect) };
}


function copyCard(card: ShipCard): ShipCard {
  return { ...card };
}

function cloneState(state: ShipBattleState): ShipBattleState {
  return {
    ...state,
    player: { ...state.player },
    enemies: state.enemies.map((enemy) => ({ ...enemy })),
    hand: state.hand.map(copyCard),
    draw: state.draw.map(copyCard),
    discard: state.discard.map(copyCard),
    exhaust: state.exhaust.map(copyCard),
  };
}

function shuffle(state: ShipBattleState, cards: ShipCard[]): void {
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const [rng, value] = randomStep(state.rng);
    state.rng = rng;
    const other = Math.floor(value * (index + 1));
    [cards[index], cards[other]] = [cards[other], cards[index]];
  }
}

function recycle(state: ShipBattleState, events?: ShipBattleEvent[]): void {
  if (state.draw.length || !state.discard.length) return;
  const cards = state.discard.splice(0);
  shuffle(state, cards);
  state.draw.push(...cards);
  if (events) {
    events.push({ type: 'recycle', actorId: state.player.id, amount: cards.length, text: `${cards.length} discarded cards returned to the draw pile.` });
  }
}

function drawCards(state: ShipBattleState, count: number, events?: ShipBattleEvent[]): void {
  for (let index = 0; index < count; index += 1) {
    recycle(state, events);
    const card = state.draw.shift();
    if (!card) return;
    state.hand.push(card);
    events?.push({ type: 'draw', actorId: state.player.id, targetId: state.player.id, card: copyCard(card), amount: 1, text: `${definitionForCard(state, card).title} was drawn.` });
  }
}

function makeEnemy(
  id: string,
  name: string,
  role: EnemyShip['role'],
  hull: number,
  shield: number,
  recharge: number,
  sequence: readonly ShipIntent[],
): EnemyShip {
  return { id, name, role, hull, maxHull: hull, shield, maxShield: shield, recharge, actionIndex: 0, sequence: sequence.map(copyIntent) };
}

const ROLE_INTENTS: Readonly<Record<EnemyShip['role'], readonly ShipIntent[]>> = Object.freeze({
  corsair: CORSAIR_INTENTS,
  needle: NEEDLE_INTENTS,
  bulwark: BULWARK_INTENTS,
});

export function createBattle(seed = 1, loadout?: ShipLoadout, setup?: ShipBattleSetup): ShipBattleState {
  if (!Number.isFinite(seed) || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new TypeError('Battle seed must be a finite uint32 integer.');
  }
  if (loadout !== undefined && setup !== undefined) {
    throw new TypeError('A ship battle setup and research loadout are mutually exclusive.');
  }
  const preparedSetup = prepareSetup(setup);
  const prepared = prepareLoadout(loadout);
  const cards = preparedSetup
    ? preparedSetup.deck.map(copyCard)
    : prepared.deck.map((id, index) => ({ uid: `ship-${String(index + 1).padStart(2, '0')}-${id}`, id }));
  const enemies = preparedSetup
    ? preparedSetup.enemies.map((enemy) => makeEnemy(
      enemy.id,
      enemy.name,
      enemy.role,
      enemy.hull,
      enemy.shield,
      enemy.recharge,
      ROLE_INTENTS[enemy.role],
    ))
    : [
      makeEnemy('corsair', 'Sable Corsair', 'corsair', 28, 6, 1, CORSAIR_INTENTS),
      makeEnemy('needle', 'Needle Drone', 'needle', 18, 3, 1, NEEDLE_INTENTS),
      makeEnemy('bulwark', 'Bulwark Tug', 'bulwark', 38, 10, 2, BULWARK_INTENTS),
    ];
  const state: ShipBattleState = {
    seed,
    rng: seed,
    turn: 1,
    phase: 'player',
    catalog: prepared.catalog,
    player: {
      id: 'player',
      name: 'Kestrel',
      hull: preparedSetup?.hull ?? SHIP_RULES.playerHull,
      maxHull: SHIP_RULES.playerHull,
      shield: SHIP_RULES.playerShield,
      maxShield: SHIP_RULES.playerShield,
      recharge: SHIP_RULES.playerRecharge,
    },
    enemies,
    energy: SHIP_RULES.maxEnergy,
    maxEnergy: SHIP_RULES.maxEnergy,
    coilsAvailable: true,
    hand: [],
    draw: cards,
    discard: [],
    exhaust: [],
  };
  shuffle(state, state.draw);
  drawCards(state, SHIP_RULES.handSize);
  return state;
}

export function cardDefinition(
  id: ShipCardId,
  catalog: Readonly<Record<string, ShipCardDefinition>> = SHIP_CARD_CATALOG,
): ShipCardDefinition {
  if (!hasOwn(catalog, id)) throw new TypeError(`Unknown ship card: ${id}`);
  return catalog[id]!;
}

export function definitionForCard(state: ShipBattleState, card: ShipCard): ShipCardDefinition {
  return upgradeShipCard(cardDefinition(card.id, state.catalog), card.upgradeLevel ?? 0);
}

export function livingEnemies(state: ShipBattleState): EnemyShip[] {
  return state.enemies.filter((enemy) => enemy.hull > 0);
}

export function nextIntent(enemy: EnemyShip): ShipIntent {
  return enemy.sequence[enemy.actionIndex % enemy.sequence.length];
}

function handCard(state: ShipBattleState, uid: string): ShipCard | undefined {
  return state.hand.find((card) => card.uid === uid);
}

function hasShieldEffect(card: ShipCardDefinition): boolean {
  return card.effects.some((effect) => effect.kind === 'shield');
}

export function previewCard(state: ShipBattleState, uid: string): ShipCardDefinition | undefined {
  const card = handCard(state, uid);
  if (!card) return undefined;
  const preview = copyDefinition(definitionForCard(state, card));
  if (state.coilsAvailable && hasShieldEffect(preview)) {
    const index = preview.effects.findIndex((effect) => effect.kind === 'shield');
    const effects = preview.effects.map(copyEffect);
    effects[index] = { ...effects[index], amount: effects[index].amount + SHIP_RULES.adaptiveCoilsShield };
    return { ...preview, effects };
  }
  return preview;
}

export function legalTargets(state: ShipBattleState, uid: string): string[] {
  const card = handCard(state, uid);
  if (!card || state.phase !== 'player') return [];
  const definition = definitionForCard(state, card);
  return definition.kind === 'attack' ? livingEnemies(state).map((enemy) => enemy.id) : [state.player.id];
}

function failure(error: string): ShipCommandResult {
  return { ok: false, error, events: [] };
}

function commandError(command: unknown): string | undefined {
  if (!command || typeof command !== 'object' || Array.isArray(command)) return 'Invalid command.';
  const record = command as Record<string, unknown>;
  const keys = Reflect.ownKeys(record);
  if (record.type === 'end-turn') {
    return keys.length === 1 && keys[0] === 'type' ? undefined : 'Invalid command.';
  }
  if (record.type !== 'play') return 'Invalid command.';
  if (typeof record.uid !== 'string' || record.uid.length === 0) return 'Invalid command.';
  if (record.targetId !== undefined && (typeof record.targetId !== 'string' || record.targetId.length === 0)) return 'Invalid command.';
  if (!keys.includes('type') || !keys.includes('uid')) return 'Invalid command.';
  return keys.every((key) => key === 'type' || key === 'uid' || key === 'targetId') ? undefined : 'Invalid command.';
}

function applyShield(target: ShipActor, amount: number, actorId: string, events: ShipBattleEvent[], text: string): void {
  const gained = Math.min(amount, target.maxShield - target.shield);
  target.shield += gained;
  if (gained > 0) {
    events.push({ type: 'shield', actorId, targetId: target.id, amount: gained, hull: target.hull, shield: target.shield, text });
  }
}

function applyDamage(target: ShipActor, amount: number, actorId: string, events: ShipBattleEvent[], text: string): void {
  const before = target.hull + target.shield;
  const shieldDamage = Math.min(target.shield, amount);
  target.shield -= shieldDamage;
  target.hull = Math.max(0, target.hull - (amount - shieldDamage));
  events.push({
    type: 'damage',
    actorId,
    targetId: target.id,
    amount: before - target.hull - target.shield,
    hull: target.hull,
    shield: target.shield,
    text,
  });
}

function resolveEffects(
  state: ShipBattleState,
  effects: readonly ShipEffect[],
  source: ShipActor,
  target: ShipActor,
  events: ShipBattleEvent[],
): void {
  for (const effect of effects) {
    if (target.hull <= 0 || state.player.hull <= 0) return;
    if (effect.kind === 'damage') {
      applyDamage(target, effect.amount, source.id, events, `${source.name} dealt ${effect.amount} damage to ${target.name}.`);
    } else if (effect.kind === 'shield') {
      applyShield(target, effect.amount, source.id, events, `${target.name} restored shields.`);
    } else if (effect.kind === 'energy') {
      const gained = effect.amount;
      state.energy += gained;
      events.push({ type: 'energy', actorId: source.id, targetId: state.player.id, amount: gained, energy: state.energy, text: `${state.player.name} restored ${gained} energy.` });
    } else {
      drawCards(state, effect.amount, events);
    }
  }
}

function movePlayedCard(state: ShipBattleState, card: ShipCard, definition: ShipCardDefinition, events: ShipBattleEvent[]): void {
  if (definition.exhaust) {
    state.exhaust.push(card);
    events.push({ type: 'exhaust', actorId: state.player.id, card: copyCard(card), text: `${definition.title} was exhausted.` });
  } else {
    state.discard.push(card);
    events.push({ type: 'discard', actorId: state.player.id, card: copyCard(card), text: `${definition.title} was discarded.` });
  }
}

function playCard(state: ShipBattleState, command: Extract<ShipCommand, { type: 'play' }>, events: ShipBattleEvent[]): string | undefined {
  const index = state.hand.findIndex((card) => card.uid === command.uid);
  if (index < 0) return 'That card is not in hand.';
  const card = state.hand[index];
  const base = definitionForCard(state, card);
  if (state.energy < base.cost) return 'Not enough energy.';

  let target: ShipActor;
  if (base.kind === 'attack') {
    const candidates = livingEnemies(state);
    if (command.targetId !== undefined) {
      const selected = candidates.find((enemy) => enemy.id === command.targetId);
      if (!selected) return 'Invalid target.';
      target = selected;
    } else {
      if (candidates.length !== 1) return candidates.length ? 'Choose a target.' : 'No legal target.';
      target = candidates[0];
    }
  } else {
    if (command.targetId !== undefined && command.targetId !== state.player.id) return 'Invalid target.';
    target = state.player;
  }

  const effective = previewCard(state, card.uid)!;
  state.hand.splice(index, 1);
  events.push({ type: 'card', actorId: state.player.id, targetId: target.id, card: copyCard(card), definition: copyDefinition(effective), energy: state.energy, text: `${state.player.name} played ${effective.title}.` });
  state.energy -= effective.cost;
  if (effective.cost > 0) {
    events.push({ type: 'energy', actorId: state.player.id, targetId: state.player.id, amount: -effective.cost, energy: state.energy, text: `${effective.title} cost ${effective.cost} energy.` });
  }
  if (hasShieldEffect(base)) state.coilsAvailable = false;
  resolveEffects(state, effective.effects, state.player, target, events);
  movePlayedCard(state, card, effective, events);

  if (livingEnemies(state).length === 0) {
    state.phase = 'victory';
    events.push({ type: 'victory', actorId: state.player.id, hull: state.player.hull, shield: state.player.shield, energy: state.energy, text: 'The hostile formation has been destroyed.' });
  }
  return undefined;
}

function discardHand(state: ShipBattleState, events: ShipBattleEvent[]): void {
  for (const card of state.hand.splice(0)) {
    state.discard.push(card);
    events.push({ type: 'discard', actorId: state.player.id, card: copyCard(card), text: `${definitionForCard(state, card).title} was discarded at end of turn.` });
  }
}

function runEnemyTurn(state: ShipBattleState, events: ShipBattleEvent[]): boolean {
  for (const enemy of state.enemies) {
    if (enemy.hull <= 0) continue;
    if (enemy.recharge > 0) {
      applyShield(enemy, enemy.recharge, enemy.id, events, `${enemy.name} recharged shields.`);
    }
    const intent = nextIntent(enemy);
    events.push({ type: 'intent', actorId: enemy.id, targetId: intent.effects.some((effect) => effect.kind === 'damage') ? state.player.id : enemy.id, intent: copyIntent(intent), text: `${enemy.name} executed ${intent.title}.` });
    const target = intent.effects.some((effect) => effect.kind === 'damage') ? state.player : enemy;
    resolveEffects(state, intent.effects, enemy, target, events);
    enemy.actionIndex = (enemy.actionIndex + 1) % enemy.sequence.length;
    if (state.player.hull <= 0) {
      state.phase = 'defeat';
      events.push({ type: 'defeat', actorId: state.player.id, hull: 0, shield: state.player.shield, energy: state.energy, text: `${state.player.name} was destroyed.` });
      return false;
    }
  }
  return true;
}

function endTurn(state: ShipBattleState, events: ShipBattleEvent[]): void {
  discardHand(state, events);
  if (!runEnemyTurn(state, events)) return;
  state.turn += 1;
  events.push({ type: 'turn', actorId: state.player.id, turn: state.turn, hull: state.player.hull, shield: state.player.shield, energy: state.energy, text: `Turn ${state.turn} began.` });
  const gained = state.maxEnergy - state.energy;
  state.energy = state.maxEnergy;
  if (gained !== 0) {
    events.push({ type: 'energy', actorId: state.player.id, targetId: state.player.id, amount: gained, energy: state.energy, text: `${state.player.name} began the turn with ${state.energy} energy.` });
  }
  applyShield(state.player, state.player.recharge, state.player.id, events, `${state.player.name} recharged shields.`);
  state.coilsAvailable = true;
  drawCards(state, SHIP_RULES.handSize, events);
}

export function dispatchBattle(state: ShipBattleState, command: ShipCommand): ShipCommandResult {
  const invalid = commandError(command);
  if (invalid) return failure(invalid);
  if (state.phase !== 'player') return failure('Battle is already over.');

  const next = cloneState(state);
  const events: ShipBattleEvent[] = [];
  if (command.type === 'play') {
    const error = playCard(next, command, events);
    if (error) return failure(error);
  } else {
    endTurn(next, events);
  }
  Object.assign(state, next);
  return { ok: true, events };
}

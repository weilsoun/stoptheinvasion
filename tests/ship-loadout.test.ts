import { describe, expect, test } from 'bun:test';
import {
  SHIP_CARDS,
  SHIP_DECK,
  cardDefinition,
  createBattle,
  dispatchBattle,
  legalTargets,
  previewCard,
} from '../src/ship/combat';
import type { ShipBattleState, ShipCardDefinition, ShipCardId, ShipLoadout } from '../src/ship/types';

function definition(
  id: `research:${string}`,
  kind: ShipCardDefinition['kind'],
  cost: number,
  effects: ShipCardDefinition['effects'],
  exhaust?: boolean,
): ShipCardDefinition {
  return {
    id,
    title: `Test ${id}`,
    kind,
    cost,
    effects,
    ...(exhaust === undefined ? {} : { exhaust }),
    flavor: 'A bounded research prototype.',
  };
}

function loadout(card: ShipCardDefinition): ShipLoadout {
  return { deck: Array<ShipCardId>(15).fill(card.id), cards: [card] };
}

function cardCount(state: ShipBattleState): number {
  return state.hand.length + state.draw.length + state.discard.length + state.exhaust.length;
}

describe('research loadout execution', () => {
  test('keeps the shipped catalog and original fifteen-card deck unchanged and immutable', () => {
    expect(Object.keys(SHIP_CARDS)).toEqual(['pulse', 'shield', 'lance', 'cell', 'sweep', 'burst']);
    expect(SHIP_DECK).toEqual([
      'pulse', 'pulse', 'pulse', 'pulse', 'pulse', 'pulse', 'pulse',
      'shield', 'shield', 'shield', 'lance', 'lance', 'cell', 'sweep', 'burst',
    ]);
    expect(Object.isFrozen(SHIP_DECK)).toBe(true);
    expect(createBattle(41).catalog).toBe(SHIP_CARDS);
  });

  test('executes a candidate attack through canonical targeting, cost, and ordered hits', () => {
    const salvo = definition('research:paired-salvo', 'attack', 2, [
      { kind: 'damage', amount: 4 },
      { kind: 'damage', amount: 7 },
    ], false);
    const state = createBattle(42, loadout(salvo));
    const card = state.hand[0]!;

    expect(cardDefinition(salvo.id, state.catalog)).toMatchObject(salvo);
    expect(legalTargets(state, card.uid)).toEqual(['corsair', 'needle', 'bulwark']);
    const result = dispatchBattle(state, { type: 'play', uid: card.uid, targetId: 'corsair' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(state.energy).toBe(1);
    expect(state.enemies[0]).toMatchObject({ shield: 0, hull: 23 });
    expect(result.events.filter((event) => event.type === 'damage').map((event) => event.amount)).toEqual([4, 7]);
    expect(state.discard.map((entry) => entry.uid)).toContain(card.uid);
    expect(cardDefinition(salvo.id, state.catalog).exhaust).toBe(false);
    expect(cardCount(state)).toBe(15);
  });

  test('executes a candidate shield-and-draw recipe with Adaptive Coils and conserves its deck', () => {
    const reroute = definition('research:shield-reroute', 'system', 1, [
      { kind: 'shield', amount: 4 },
      { kind: 'draw', amount: 2 },
    ]);
    const state = createBattle(43, loadout(reroute));
    const card = state.hand[0]!;
    state.player.shield = 0;

    expect(previewCard(state, card.uid)?.effects).toEqual([
      { kind: 'shield', amount: 6 },
      { kind: 'draw', amount: 2 },
    ]);
    expect(dispatchBattle(state, { type: 'play', uid: card.uid, targetId: state.player.id }).ok).toBe(true);
    expect(state.player.shield).toBe(6);
    expect(state.energy).toBe(2);
    expect(state.hand).toHaveLength(6);
    expect(state.draw).toHaveLength(8);
    expect(state.discard.map((entry) => entry.uid)).toEqual([card.uid]);
    expect(cardCount(state)).toBe(15);
  });

  test('executes a free energy candidate once and exhausts its physical card', () => {
    const battery = definition('research:flash-battery', 'crew', 0, [{ kind: 'energy', amount: 3 }], true);
    const state = createBattle(44, loadout(battery));
    const card = state.hand[0]!;
    state.energy = 0;

    expect(dispatchBattle(state, { type: 'play', uid: card.uid }).ok).toBe(true);
    expect(state.energy).toBe(3);
    expect(state.exhaust.map((entry) => entry.uid)).toEqual([card.uid]);
    expect(state.discard).toEqual([]);
    expect(cardCount(state)).toBe(15);
  });
});

describe('research loadout validation and isolation', () => {
  const valid = definition('research:valid-card', 'attack', 1, [{ kind: 'damage', amount: 8 }]);

  test('rejects malformed decks and definitions before exposing a battle', () => {
    const invalid: unknown[] = [
      { deck: Array(14).fill('pulse') },
      { deck: new Array(15) },
      { deck: [...Array(14).fill('pulse'), 'research:missing'] },
      { deck: [...Array(14).fill('pulse'), 'toString'] },
      { deck: Array(15).fill('pulse'), cards: [{ ...valid, id: 'pulse' }] },
      { deck: Array(15).fill('pulse'), cards: [{ ...valid, id: 'research:Upper' }] },
      { deck: Array(15).fill('pulse'), cards: [{ ...valid, id: `research:${'a'.repeat(49)}` }] },
      { deck: Array(15).fill('pulse'), cards: [{ ...valid, cost: 1.5 }] },
      { deck: Array(15).fill('pulse'), cards: [{ ...valid, cost: 4 }] },
      { deck: Array(15).fill('pulse'), cards: [{ ...valid, effects: [] }] },
      { deck: Array(15).fill(valid.id), cards: [{ ...valid, effects: new Array(1) }] },
      { deck: Array(15).fill('pulse'), cards: [{ ...valid, effects: [{ kind: 'damage', amount: 25 }] }] },
      { deck: Array(15).fill('pulse'), cards: [{ ...valid, effects: [{ kind: 'shield', amount: 4 }] }] },
      { deck: Array(15).fill('pulse'), cards: [{ ...valid, kind: 'system', effects: [{ kind: 'damage', amount: 4 }] }] },
      { deck: Array(15).fill('pulse'), cards: [{ ...valid, cost: 0 }] },
      { deck: Array(15).fill('pulse'), cards: [{ ...valid, kind: 'crew', effects: [{ kind: 'energy', amount: 1 }] }] },
      { deck: Array(15).fill('pulse'), cards: [valid, { ...valid }] },
      { deck: Array(15).fill('pulse'), cards: [{ ...valid, extra: true }] },
    ];

    for (const candidate of invalid) {
      expect(() => createBattle(45, candidate as ShipLoadout)).toThrow(TypeError);
    }
  });

  test('does not mutate bad input or contaminate later default battles', () => {
    const bad = {
      deck: [...Array<ShipCardId>(14).fill('pulse'), 'research:bad'],
      cards: [definition('research:bad', 'attack', 1, [{ kind: 'damage', amount: 0 }])],
    };
    const inputBefore = structuredClone(bad);
    const defaultBefore = createBattle(46);

    expect(() => createBattle(46, bad)).toThrow(TypeError);
    expect(bad).toEqual(inputBefore);
    expect(createBattle(46)).toEqual(defaultBefore);
    expect(Object.keys(SHIP_CARDS)).toEqual(['pulse', 'shield', 'lance', 'cell', 'sweep', 'burst']);
  });

  test('clones and freezes caller definitions for independent sibling battles', () => {
    const effect = { kind: 'damage' as const, amount: 9 };
    const prototype = definition('research:isolated-shot', 'attack', 1, [effect]);
    const deck = Array<ShipCardId>(15).fill(prototype.id);
    const supplied: ShipLoadout = { deck, cards: [prototype] };
    const first = createBattle(47, supplied);
    const second = createBattle(47, supplied);

    effect.amount = 24;
    prototype.title = 'Caller mutation';
    deck[0] = 'pulse';

    const firstDefinition = cardDefinition('research:isolated-shot', first.catalog);
    const secondDefinition = cardDefinition('research:isolated-shot', second.catalog);
    expect(firstDefinition).toMatchObject({ title: 'Test research:isolated-shot', effects: [{ kind: 'damage', amount: 9 }] });
    expect(secondDefinition).toEqual(firstDefinition);
    expect(firstDefinition).not.toBe(secondDefinition);
    expect(firstDefinition.effects).not.toBe(secondDefinition.effects);
    const mutablePreview = previewCard(first, first.hand[0]!.uid)!;
    mutablePreview.effects[0]!.amount = 1;
    expect(cardDefinition('research:isolated-shot', first.catalog).effects[0]!.amount).toBe(9);
    expect(cardDefinition('research:isolated-shot', second.catalog).effects[0]!.amount).toBe(9);
    expect(Object.isFrozen(first.catalog)).toBe(true);
    expect(Object.isFrozen(firstDefinition)).toBe(true);
    expect(Object.isFrozen(firstDefinition.effects)).toBe(true);
    expect(Object.isFrozen(firstDefinition.effects[0])).toBe(true);
    expect(first.hand.every((card) => card.id === 'research:isolated-shot')).toBe(true);
  });

  test('replays the same custom battle and accepted canonical command deterministically', () => {
    const shot = definition('research:replay-shot', 'attack', 1, [{ kind: 'damage', amount: 6 }]);
    const custom = loadout(shot);
    const first = createBattle(0xdecafbad, custom);
    const second = createBattle(0xdecafbad, custom);

    expect(first).toEqual(second);
    const firstResult = dispatchBattle(first, { type: 'play', uid: first.hand[0]!.uid, targetId: 'needle' });
    const secondResult = dispatchBattle(second, { type: 'play', uid: second.hand[0]!.uid, targetId: 'needle' });
    expect(firstResult).toEqual(secondResult);
    expect(first).toEqual(second);
  });
});

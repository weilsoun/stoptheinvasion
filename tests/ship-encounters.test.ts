import { describe, expect, test } from 'bun:test';
import {
  SHIP_CARDS,
  cardDefinition,
  createBattle,
  definitionForCard,
  dispatchBattle,
  legalTargets,
  previewCard,
} from '../src/ship/combat';
import type { ShipBattleSetup, ShipBattleState, ShipCard, ShipCardId } from '../src/ship/types';

function cards(ids: readonly ShipCardId[]): ShipCard[] {
  return ids.map((id, index) => ({ uid: `persistent-${index + 1}`, id }));
}

function setup(deck = cards(['pulse', 'shield', 'burst', 'crew:vale', 'crew:iona', 'crew:rex', 'crew:sen', 'cell'])): ShipBattleSetup {
  return {
    hull: 43,
    deck,
    enemies: [
      { id: 'needle-port', name: 'Needle Port', role: 'needle', hull: 18, shield: 3, recharge: 1 },
      { id: 'needle-starboard', name: 'Needle Starboard', role: 'needle', hull: 21, shield: 4, recharge: 2 },
    ],
  };
}

function putInHand(state: ShipBattleState, uid: string): ShipCard {
  const inHand = state.hand.find((card) => card.uid === uid);
  if (inHand) return inHand;
  for (const zone of [state.draw, state.discard, state.exhaust]) {
    const index = zone.findIndex((card) => card.uid === uid);
    if (index >= 0) {
      const [card] = zone.splice(index, 1);
      state.hand.push(card);
      return card;
    }
  }
  throw new Error(`Missing persistent card ${uid}`);
}

function allCards(state: ShipBattleState): ShipCard[] {
  return [...state.hand, ...state.draw, ...state.discard, ...state.exhaust];
}

describe('authored expedition ship encounters', () => {
  test('keeps duplicate-role actors independent, targetable, and in authored roster order', () => {
    const source = setup();
    const state = createBattle(101, undefined, source);
    const pulse = putInHand(state, 'persistent-1');

    expect(state.player.hull).toBe(43);
    expect(state.enemies.map(({ id, name, role, hull, shield, recharge }) => ({ id, name, role, hull, shield, recharge }))).toEqual(source.enemies);
    expect(legalTargets(state, pulse.uid)).toEqual(['needle-port', 'needle-starboard']);
    const result = dispatchBattle(state, { type: 'play', uid: pulse.uid, targetId: 'needle-starboard' });
    expect(result.ok).toBe(true);
    expect(state.enemies[0]).toMatchObject({ id: 'needle-port', hull: 18, shield: 3 });
    expect(state.enemies[1]).toMatchObject({ id: 'needle-starboard', hull: 17, shield: 0 });

    source.deck[0]!.uid = 'caller-change';
    source.enemies[0]!.name = 'Caller change';
    expect(allCards(state).some((card) => card.uid === 'persistent-1')).toBe(true);
    expect(state.enemies[0]!.name).toBe('Needle Port');

    const sibling = createBattle(101, undefined, setup());
    state.enemies[0]!.sequence[0]!.effects[0]!.amount = 99;
    expect(state.enemies[1]!.sequence[0]!.effects[0]!.amount).toBe(4);
    expect(sibling.enemies[0]!.sequence[0]!.effects[0]!.amount).toBe(4);
  });

  test('automatically uses the sole authored enemy instance as an attack target', () => {
    const source = setup();
    source.enemies = [{ id: 'only-tug', name: 'Only Tug', role: 'bulwark', hull: 30, shield: 5, recharge: 2 }];
    const state = createBattle(102, undefined, source);
    const pulse = putInHand(state, 'persistent-1');

    expect(legalTargets(state, pulse.uid)).toEqual(['only-tug']);
    const result = dispatchBattle(state, { type: 'play', uid: pulse.uid });
    expect(result.ok).toBe(true);
    expect(state.enemies[0]).toMatchObject({ id: 'only-tug', hull: 27, shield: 0 });
    if (!result.ok) return;
    expect(result.events.find((event) => event.type === 'card')?.targetId).toBe('only-tug');
  });

  test('retains exact UIDs and grades, and applies each grade to only its exact copy', () => {
    const deck = cards(['pulse', 'pulse', 'shield', 'burst', 'crew:vale', 'crew:iona', 'crew:rex', 'crew:sen']);
    deck[0]!.upgradeLevel = 2;
    deck[2]!.upgradeLevel = 1;
    const state = createBattle(103, undefined, setup(deck));

    expect(new Set(allCards(state).map((card) => card.uid))).toEqual(new Set(deck.map((card) => card.uid)));
    expect(allCards(state).find((card) => card.uid === 'persistent-1')).toEqual({ uid: 'persistent-1', id: 'pulse', upgradeLevel: 2 });
    expect(definitionForCard(state, allCards(state).find((card) => card.uid === 'persistent-1')!).effects).toEqual([{ kind: 'damage', amount: 12 }]);
    expect(definitionForCard(state, allCards(state).find((card) => card.uid === 'persistent-2')!).effects).toEqual([{ kind: 'damage', amount: 8 }]);
  });

  test('grades multi-hit and shield recipes before adding Adaptive Coils exactly once', () => {
    const deck = cards(['burst', 'shield', 'pulse', 'pulse', 'pulse', 'pulse', 'pulse', 'pulse']);
    deck[0]!.upgradeLevel = 2;
    deck[1]!.upgradeLevel = 2;
    const state = createBattle(104, undefined, setup(deck));
    const burst = putInHand(state, 'persistent-1');
    const shield = putInHand(state, 'persistent-2');
    state.player.shield = 0;

    expect(previewCard(state, burst.uid)?.effects).toEqual([
      { kind: 'damage', amount: 7 },
      { kind: 'damage', amount: 7 },
    ]);
    const burstResult = dispatchBattle(state, { type: 'play', uid: burst.uid, targetId: 'needle-port' });
    expect(burstResult.ok).toBe(true);
    if (!burstResult.ok) return;
    expect(burstResult.events.find((event) => event.type === 'card')?.definition?.effects).toEqual([
      { kind: 'damage', amount: 7 },
      { kind: 'damage', amount: 7 },
    ]);
    expect(burstResult.events.filter((event) => event.type === 'damage').map((event) => event.amount)).toEqual([7, 7]);

    expect(previewCard(state, shield.uid)?.effects).toEqual([{ kind: 'shield', amount: 12 }]);
    const shieldResult = dispatchBattle(state, { type: 'play', uid: shield.uid });
    expect(shieldResult.ok).toBe(true);
    if (!shieldResult.ok) return;
    expect(shieldResult.events.find((event) => event.type === 'card')?.definition?.effects).toEqual([{ kind: 'shield', amount: 12 }]);
    expect(state.player.shield).toBe(12);
    expect(state.coilsAvailable).toBe(false);
  });

  test('registers and executes all four authored crew recipes', () => {
    expect(SHIP_CARDS).not.toHaveProperty('crew:vale');
    expect(cardDefinition('crew:vale')).toMatchObject({ kind: 'crew', effects: [{ kind: 'shield', amount: 3 }, { kind: 'draw', amount: 1 }], exhaust: true });
    expect(cardDefinition('crew:iona')).toMatchObject({ kind: 'crew', effects: [{ kind: 'shield', amount: 5 }, { kind: 'energy', amount: 1 }], exhaust: true });
    expect(cardDefinition('crew:rex')).toMatchObject({ kind: 'attack', effects: [{ kind: 'damage', amount: 10 }], exhaust: true });
    expect(cardDefinition('crew:sen')).toMatchObject({ kind: 'crew', effects: [{ kind: 'draw', amount: 2 }, { kind: 'shield', amount: 2 }], exhaust: true });

    const source = setup(cards(['crew:vale', 'crew:iona', 'crew:rex', 'crew:sen', 'pulse', 'pulse', 'pulse', 'pulse']));
    source.enemies = [{ id: 'crew-target', name: 'Crew Target', role: 'corsair', hull: 30, shield: 0, recharge: 0 }];
    const state = createBattle(105, undefined, source);
    state.player.shield = 0;
    for (const uid of ['persistent-2', 'persistent-1', 'persistent-4', 'persistent-3']) {
      putInHand(state, uid);
      expect(dispatchBattle(state, { type: 'play', uid }).ok).toBe(true);
    }
    expect(state.exhaust.map((card) => card.uid)).toEqual(['persistent-2', 'persistent-1', 'persistent-4', 'persistent-3']);
    expect(state.player.shield).toBe(12);
    expect(state.enemies[0]!.hull).toBe(20);
    expect(state.energy).toBe(0);
  });

  test('rejects malformed setups and mixed laboratory inputs without mutating input', () => {
    const valid = setup();
    const invalid: unknown[] = [
      { ...valid, extra: true },
      { ...valid, hull: 0 },
      { ...valid, deck: valid.deck.slice(0, 7) },
      { ...valid, deck: valid.deck.map((card, index) => index === 0 ? { ...card, uid: '' } : card) },
      { ...valid, deck: valid.deck.map((card, index) => index === 0 ? { ...card, upgradeLevel: 3 } : card) },
      { ...valid, deck: valid.deck.map((card, index) => index === 1 ? { ...card, uid: valid.deck[0]!.uid } : card) },
      { ...valid, deck: valid.deck.map((card, index) => index === 0 ? { ...card, id: 'research:missing' } : card) },
      { ...valid, enemies: valid.enemies.map((enemy, index) => index === 0 ? { ...enemy, role: 'frigate' } : enemy) },
      { ...valid, enemies: valid.enemies.map((enemy, index) => index === 0 ? { ...enemy, shield: -1 } : enemy) },
      { ...valid, enemies: valid.enemies.map((enemy, index) => index === 1 ? { ...enemy, id: valid.enemies[0]!.id } : enemy) },
      { ...valid, enemies: [{ ...valid.enemies[0], unexpected: true }] },
    ];

    for (const candidate of invalid) {
      const before = structuredClone(candidate);
      expect(() => createBattle(106, undefined, candidate as ShipBattleSetup)).toThrow(TypeError);
      expect(candidate).toEqual(before);
    }
    const loadout = { deck: Array<ShipCardId>(15).fill('pulse') };
    const beforeSetup = structuredClone(valid);
    const beforeLoadout = structuredClone(loadout);
    expect(() => createBattle(106, loadout, valid)).toThrow(TypeError);
    expect(valid).toEqual(beforeSetup);
    expect(loadout).toEqual(beforeLoadout);
  });

  test('conserves every persistent card identity through play, exhaust, discard, and recycle', () => {
    const source = setup();
    source.enemies = [{ id: 'durable-tug', name: 'Durable Tug', role: 'bulwark', hull: 90, shield: 10, recharge: 0 }];
    const state = createBattle(107, undefined, source);
    const expected = new Set(source.deck.map((card) => card.uid));
    const cell = putInHand(state, 'persistent-8');
    const pulse = putInHand(state, 'persistent-1');

    expect(dispatchBattle(state, { type: 'play', uid: cell.uid }).ok).toBe(true);
    expect(dispatchBattle(state, { type: 'play', uid: pulse.uid }).ok).toBe(true);
    expect(dispatchBattle(state, { type: 'end-turn' }).ok).toBe(true);

    const actual = allCards(state).map((card) => card.uid);
    expect(actual).toHaveLength(source.deck.length);
    expect(new Set(actual)).toEqual(expected);
    expect(state.exhaust.map((card) => card.uid)).toContain('persistent-8');
    expect(state.exhaust).toHaveLength(1);
  });
});

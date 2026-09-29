import { describe, expect, test } from 'bun:test';
import {
  SHIP_RULES,
  cardDefinition,
  createBattle,
  dispatchBattle,
  legalTargets,
  livingEnemies,
  previewCard,
} from '../src/ship/combat';
import type { ShipBattleState, ShipCard, ShipCardId } from '../src/ship/types';

function takeCard(state: ShipBattleState, id: ShipCardId, excludeUid?: string): ShipCard {
  for (const zone of [state.hand, state.draw, state.discard, state.exhaust]) {
    const index = zone.findIndex((card) => card.id === id && card.uid !== excludeUid);
    if (index >= 0) return zone.splice(index, 1)[0];
  }
  throw new Error(`Missing card ${id}`);
}

function putInHand(state: ShipBattleState, id: ShipCardId): ShipCard {
  const existing = state.hand.find((card) => card.id === id);
  if (existing) return existing;
  const card = takeCard(state, id);
  state.hand.push(card);
  return card;
}

function countCards(state: ShipBattleState): number {
  return state.hand.length + state.draw.length + state.discard.length + state.exhaust.length;
}

describe('authored ship battle', () => {
  test('creates independent deterministic battles with unique card identities', () => {
    const first = createBattle(91);
    const second = createBattle(91);
    const all = [...first.hand, ...first.draw];

    expect(first.hand).toEqual(second.hand);
    expect(first.draw).toEqual(second.draw);
    expect(new Set(all.map((card) => card.uid)).size).toBe(SHIP_RULES.deckSize);
    first.player.hull -= 1;
    const originalId = second.hand[0].id;
    first.hand[0].id = originalId === 'cell' ? 'pulse' : 'cell';
    expect(second.player.hull).toBe(second.player.maxHull);
    expect(second.hand[0].id).toBe(originalId);
    const originalDamage = second.enemies[0].sequence[0].effects[0].amount;
    first.enemies[0].sequence[0].effects[0].amount = 99;
    expect(second.enemies[0].sequence[0].effects[0].amount).toBe(originalDamage);
  });

  test('rejects non-uint32 seeds', () => {
    for (const seed of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 0x1_0000_0000]) {
      expect(() => createBattle(seed)).toThrow();
    }
    expect(createBattle(0).seed).toBe(0);
    expect(createBattle(0xffffffff).seed).toBe(0xffffffff);
  });

});

describe('atomic player commands', () => {
  test('invalid target, cost, phase, and runtime shape leave all state unchanged', () => {
    const targetState = createBattle(2);
    const pulse = putInHand(targetState, 'pulse');
    const beforeTarget = structuredClone(targetState);
    expect(dispatchBattle(targetState, { type: 'play', uid: pulse.uid, targetId: 'missing' })).toMatchObject({ ok: false, events: [] });
    expect(targetState).toEqual(beforeTarget);

    const costState = createBattle(3);
    const lance = putInHand(costState, 'lance');
    costState.energy = 1;
    const beforeCost = structuredClone(costState);
    expect(dispatchBattle(costState, { type: 'play', uid: lance.uid, targetId: 'corsair' })).toMatchObject({ ok: false, events: [] });
    expect(costState).toEqual(beforeCost);

    const phaseState = createBattle(4);
    phaseState.phase = 'victory';
    const beforePhase = structuredClone(phaseState);
    expect(dispatchBattle(phaseState, { type: 'end-turn' })).toMatchObject({ ok: false, events: [] });
    expect(phaseState).toEqual(beforePhase);

    const shapeState = createBattle(5);
    const beforeShape = structuredClone(shapeState);
    expect(dispatchBattle(shapeState, { type: 'end-turn', uid: 'extra' } as never)).toMatchObject({ ok: false, events: [] });
    expect(shapeState).toEqual(beforeShape);
    for (const inheritedName of ['toString', 'constructor']) {
      const inheritedState = createBattle(5);
      const shield = putInHand(inheritedState, 'shield');
      const beforeInherited = structuredClone(inheritedState);
      const command = { type: 'play', uid: shield.uid, [inheritedName]: 'unexpected' } as never;
      expect(dispatchBattle(inheritedState, command)).toMatchObject({ ok: false, events: [] });
      expect(inheritedState).toEqual(beforeInherited);
    }
  });

  test('attacks require an explicit living enemy except for a sole survivor', () => {
    const state = createBattle(6);
    const pulse = putInHand(state, 'pulse');
    expect(legalTargets(state, pulse.uid)).toEqual(['corsair', 'needle', 'bulwark']);
    const before = structuredClone(state);
    expect(dispatchBattle(state, { type: 'play', uid: pulse.uid })).toMatchObject({ ok: false, events: [] });
    expect(state).toEqual(before);

    state.enemies[0].hull = 0;
    state.enemies[1].hull = 0;
    const hull = state.enemies[2].hull;
    expect(dispatchBattle(state, { type: 'play', uid: pulse.uid }).ok).toBe(true);
    expect(state.enemies[2].hull + state.enemies[2].shield).toBe(hull + state.enemies[2].maxShield - 8);
  });

  test('pays before utility, does not ordinarily replace, and preserves all physical cards', () => {
    const state = createBattle(7);
    const sweep = putInHand(state, 'sweep');
    state.energy = 1;
    const handBefore = state.hand.length;
    const result = dispatchBattle(state, { type: 'play', uid: sweep.uid, targetId: state.player.id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const energyIndex = result.events.findIndex((event) => event.type === 'energy');
    const drawIndex = result.events.findIndex((event) => event.type === 'draw');
    expect(energyIndex).toBeGreaterThan(-1);
    expect(drawIndex).toBeGreaterThan(energyIndex);
    expect(result.events[energyIndex].energy).toBe(0);
    expect(state.hand.length).toBe(handBefore + 1);
    expect(state.discard.at(-1)?.uid).toBe(sweep.uid);
    expect(countCards(state)).toBe(SHIP_RULES.deckSize);
  });

  test('exhausts the reserve cell and permits temporary energy above the turn refill', () => {
    const state = createBattle(8);
    const cell = putInHand(state, 'cell');
    state.energy = state.maxEnergy;
    const result = dispatchBattle(state, { type: 'play', uid: cell.uid });
    expect(result.ok).toBe(true);
    expect(state.energy).toBe(state.maxEnergy + 2);
    expect(state.exhaust.map((card) => card.uid)).toContain(cell.uid);
    expect(state.discard.map((card) => card.uid)).not.toContain(cell.uid);
    expect(countCards(state)).toBe(SHIP_RULES.deckSize);
  });
});

describe('effects, turns, and terminal outcomes', () => {
  test('Adaptive Coils changes preview and only the first shield execution each turn', () => {
    const state = createBattle(9);
    const first = putInHand(state, 'shield');
    const second = takeCard(state, 'shield', first.uid);
    state.hand.push(second);
    state.player.shield = 0;

    expect(previewCard(state, first.uid)?.effects).toEqual([{ kind: 'shield', amount: 8 }]);
    expect(dispatchBattle(state, { type: 'play', uid: first.uid }).ok).toBe(true);
    expect(state.player.shield).toBe(8);
    expect(state.coilsAvailable).toBe(false);
    expect(previewCard(state, second.uid)?.effects).toEqual([{ kind: 'shield', amount: 6 }]);
    expect(dispatchBattle(state, { type: 'play', uid: second.uid }).ok).toBe(true);
    expect(state.player.shield).toBe(state.player.maxShield);
  });

  test('resolves multi-hit damage in order with exact resulting snapshots', () => {
    const state = createBattle(10);
    const burst = putInHand(state, 'burst');
    const corsair = state.enemies[0];
    corsair.shield = 7;
    const result = dispatchBattle(state, { type: 'play', uid: burst.uid, targetId: corsair.id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events.filter((event) => event.type === 'damage').map((event) => ({ hull: event.hull, shield: event.shield }))).toEqual([
      { hull: 28, shield: 2 },
      { hull: 25, shield: 0 },
    ]);
  });

  test('discards the old hand, recharges within bounds, recycles, and draws a fresh five', () => {
    const state = createBattle(11);
    state.discard.push(...state.draw.splice(0));
    state.player.shield = state.player.maxShield - 1;
    state.energy = 0;
    state.coilsAvailable = false;
    state.enemies[0].shield = state.enemies[0].maxShield - 1;
    state.enemies[2].shield = state.enemies[2].maxShield - 1;
    const result = dispatchBattle(state, { type: 'end-turn' });
    expect(result.ok).toBe(true);
    expect(state.turn).toBe(2);
    expect(state.energy).toBe(state.maxEnergy);
    expect(state.player.shield).toBeLessThanOrEqual(state.player.maxShield);
    expect(state.hand).toHaveLength(SHIP_RULES.handSize);
    expect(state.coilsAvailable).toBe(true);
    expect(state.enemies[0].shield).toBe(state.enemies[0].maxShield);
    expect(state.enemies[2].shield).toBe(state.enemies[2].maxShield);
    expect(new Set([...state.hand, ...state.draw, ...state.discard, ...state.exhaust].map((card) => card.uid)).size).toBe(SHIP_RULES.deckSize);
    if (!result.ok) return;
    const recycleEvents = result.events.filter((event) => event.type === 'recycle');
    expect(recycleEvents).toEqual([expect.objectContaining({ amount: SHIP_RULES.deckSize })]);
    expect(recycleEvents[0].card).toBeUndefined();
  });

  test('dead enemies never recharge or act', () => {
    const state = createBattle(12);
    state.enemies[0].hull = 0;
    const result = dispatchBattle(state, { type: 'end-turn' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events.some((event) => event.actorId === 'corsair' && (event.type === 'intent' || event.type === 'shield'))).toBe(false);
    expect(result.events.filter((event) => event.type === 'intent').map((event) => event.actorId)).toEqual(['needle', 'bulwark']);
  });

  test('lethal damage suppresses later hits and produces a real victory', () => {
    const state = createBattle(13);
    state.enemies[0].hull = 0;
    state.enemies[1].hull = 0;
    const bulwark = state.enemies[2];
    bulwark.hull = 3;
    bulwark.shield = 0;
    const burst = putInHand(state, 'burst');
    const result = dispatchBattle(state, { type: 'play', uid: burst.uid, targetId: bulwark.id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events.filter((event) => event.type === 'damage')).toHaveLength(1);
    expect(result.events.at(-1)?.type).toBe('victory');
    expect(state.phase).toBe('victory');
    expect(livingEnemies(state)).toEqual([]);
    expect(dispatchBattle(state, { type: 'end-turn' })).toMatchObject({ ok: false, events: [] });
  });

  test('defeat stops later enemies and prevents turn refill and draw', () => {
    const state = createBattle(14);
    state.player.hull = 1;
    state.player.shield = 0;
    state.energy = 1;
    const result = dispatchBattle(state, { type: 'end-turn' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(state.phase).toBe('defeat');
    expect(state.turn).toBe(1);
    expect(state.energy).toBe(1);
    expect(state.hand).toHaveLength(0);
    expect(result.events.filter((event) => event.type === 'intent').map((event) => event.actorId)).toEqual(['corsair']);
    expect(result.events.at(-1)?.type).toBe('defeat');
    expect(result.events.some((event) => event.type === 'draw' || event.type === 'turn')).toBe(false);
  });

  test('card definitions remain base authored values after previews', () => {
    const state = createBattle(15);
    const shield = putInHand(state, 'shield');
    expect(previewCard(state, shield.uid)?.effects[0].amount).toBe(8);
    expect(cardDefinition('shield').effects[0].amount).toBe(6);
  });
});

import { describe, expect, test } from 'bun:test';
import { availableEnergy, createCombat, moveCard, queueCard, removeCard, resolveTurn, retargetCard } from '../src/game/combat';
import type { CardInstance, CombatState } from '../src/game/types';

function card(state: CombatState, definitionId: string): CardInstance {
  const found = state.hand.find(candidate => candidate.definitionId === definitionId);
  if (!found) throw new Error(`Missing ${definitionId} in opening hand`);
  return found;
}
function finish(state: CombatState): CombatState {
  const steps = resolveTurn(state);
  return steps[steps.length - 1].state;
}

describe('battle planning boundaries', () => {
  test('locked enemy slots reject insertion and movement without spending or losing a card', () => {
    const state = createCombat(12);
    const hammer = card(state, 'hammer');
    const before = structuredClone(state);
    expect(queueCard(state, hammer.uid, 'guard', 3).ok).toBe(false);
    expect(state).toEqual(before);
    const queueWithoutSlot = queueCard as (state: CombatState, uid: string, target: 'guard') => { ok: boolean };
    expect(queueWithoutSlot(state, hammer.uid, 'guard').ok).toBe(false);
    expect(state).toEqual(before);
    expect(queueCard(state, hammer.uid, 'guard', 0).ok).toBe(true);
    const planned = structuredClone(state);
    expect(moveCard(state, 0, 3).ok).toBe(false);
    expect(state).toEqual(planned);
    expect(moveCard(state, 0, 4).ok).toBe(true);
    expect(state.queue[0]).toBeNull();
    expect(state.queue[4]?.kind).toBe('player');
  });

  test('banked future energy cannot fund the current plan and removing a card frees its reservation', () => {
    const state = createCombat(12);
    expect(queueCard(state, card(state, 'coffee').uid, 'bob', 0).ok).toBe(true);
    expect(queueCard(state, card(state, 'heavy').uid, 'guard', 1).ok).toBe(true);
    expect(availableEnergy(state)).toBe(0);
    const hammer = card(state, 'hammer');
    const before = structuredClone(state);
    expect(queueCard(state, hammer.uid, 'guard', 2).ok).toBe(false);
    expect(state).toEqual(before);
    expect(removeCard(state, 1).ok).toBe(true);
    expect(availableEnergy(state)).toBe(2);
    expect(queueCard(state, hammer.uid, 'guard', 1).ok).toBe(true);
  });

  test('an unresolved attack reserves energy but blocks resolution until assigned', () => {
    const state = createCombat(12);
    expect(queueCard(state, card(state, 'hammer').uid, null, 0).ok).toBe(true);
    expect(availableEnergy(state)).toBe(1);
    const unresolved = structuredClone(state);
    expect(() => resolveTurn(state)).toThrow();
    expect(state).toEqual(unresolved);
    expect(retargetCard(state, 0, 'guard').ok).toBe(true);
    expect(finish(state).actors.guard.hp).toBe(42);
  });

  test('moving and swapping preserve targets, and removing an unresolved card refunds its reservation', () => {
    const state = createCombat(12);
    expect(queueCard(state, card(state, 'hammer').uid, null, 0).ok).toBe(true);
    expect(queueCard(state, card(state, 'coffee').uid, null, 1).ok).toBe(true);
    expect(state.queue[1]).toMatchObject({ kind: 'player', target: 'bob' });
    expect(moveCard(state, 0, 1).ok).toBe(true);
    expect(state.queue[1]).toMatchObject({ kind: 'player', target: null });
    expect(state.queue[0]).toMatchObject({ kind: 'player', target: 'bob' });
    expect(removeCard(state, 1).ok).toBe(true);
    expect(availableEnergy(state)).toBe(2);
  });

  test('dead and wrong targets are rejected without changing the plan', () => {
    const state = createCombat(12);
    expect(queueCard(state, card(state, 'hammer').uid, null, 0).ok).toBe(true);
    const beforeWrongTarget = structuredClone(state);
    expect(retargetCard(state, 0, 'bob').ok).toBe(false);
    expect(state).toEqual(beforeWrongTarget);
    expect(retargetCard(state, 0, 'guard').ok).toBe(true);
    state.actors.guard.hp = 0;
    const beforeDeadTarget = structuredClone(state);
    expect(retargetCard(state, 0, 'guard').ok).toBe(false);
    expect(state).toEqual(beforeDeadTarget);
    expect(() => resolveTurn(state)).toThrow();
    expect(state).toEqual(beforeDeadTarget);
  });

  test('resolution does not subtract committed energy twice', () => {
    const state = createCombat(12);
    queueCard(state, card(state, 'heavy').uid, 'guard', 0);
    const first = resolveTurn(state)[0].state;
    expect(availableEnergy(first)).toBe(0);
  });
});

describe('ordered resolution', () => {
  test('Block before an anchored attack protects; Block after it does not carry over', () => {
    const early = createCombat(12);
    const late = createCombat(12);
    queueCard(early, card(early, 'vest').uid, 'bob', 0);
    queueCard(late, card(late, 'vest').uid, 'bob', 4);
    const earlyResult = finish(early);
    const lateResult = finish(late);
    expect(earlyResult.actors.bob.hp).toBe(41);
    expect(lateResult.actors.bob.hp).toBe(34);
    expect(earlyResult.actors.bob.block).toBe(0);
    expect(lateResult.actors.bob.block).toBe(0);
  });

  test('setup amplifies the next hit, and early lethal cancels a committed enemy attack', () => {
    const state = createCombat(12);
    state.actors.guard.hp = 11;
    queueCard(state, card(state, 'tape').uid, 'guard', 0);
    queueCard(state, card(state, 'hammer').uid, 'guard', 1);
    const result = finish(state);
    expect(result.phase).toBe('victory');
    expect(result.actors.guard.hp).toBe(0);
    expect(result.actors.bob.hp).toBe(42);
    expect(result.actors.guard.exposed).toBe(0);
  });

  test('cards drawn during resolution survive cleanup even when normal draw is debuffed to zero', () => {
    const state = createCombat(12);
    state.actors.bob.drawCount = 0;
    state.hand = [{ uid: 'toolbox-test', definitionId: 'toolbox', owner: 'bob' }];
    state.drawPile = [
      { uid: 'future-hammer', definitionId: 'hammer', owner: 'bob' },
      { uid: 'future-vest', definitionId: 'vest', owner: 'bob' },
    ];
    state.discardPile = [];
    queueCard(state, 'toolbox-test', 'bob', 0);
    const result = finish(state);
    expect(result.hand.map(value => value.uid).sort()).toEqual(['future-hammer', 'future-vest']);
    expect(result.phase).toBe('planning');
  });

  test('resolution leaves the committed plan untouched and replays identically from the same seed', () => {
    const state = createCombat(987);
    queueCard(state, card(state, 'hammer').uid, 'guard', 0);
    const before = structuredClone(state);
    const first = resolveTurn(state);
    expect(state).toEqual(before);
    expect(resolveTurn(state)).toEqual(first);
    const next = first[first.length - 1].state;
    const nextBefore = structuredClone(next);
    resolveTurn(next);
    expect(next).toEqual(nextBefore);
    expect(first[0].state.turn).toBe(1);
  });
});

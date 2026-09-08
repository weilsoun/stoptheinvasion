import { describe, expect, test } from 'bun:test';
import {
  attachModifier,
  availableEnergy,
  canAttachModifier,
  createCombat,
  upgradeLevel,
  moveCard,
  previewPlacement,
  queueCard,
  playSurge,
  removeCard,
  removeModifier,
  resolveTurn,
  retargetCard,
  turnEnd,
  turnLength,
  visibleEnd,
} from '../src/game/combat';
import { CARDS } from '../src/game/content';
import { applyUpgrade, scaledBracket } from '../src/game/upgrades';
import type { CardInstance, CombatState } from '../src/game/types';

function card(state: CombatState, definitionId: string): CardInstance {
  for (const zone of [state.hand, state.drawPile, state.discardPile]) {
    const index = zone.findIndex((candidate) => candidate.definitionId === definitionId);
    if (index < 0) continue;
    if (zone === state.hand) return zone[index];
    const [found] = zone.splice(index, 1);
    state.hand.push(found);
    return found;
  }
  throw new Error(`Missing ${definitionId} in combat deck`);
}

function finish(state: CombatState): CombatState {
  const steps = resolveTurn(state);
  return steps[steps.length - 1].state;
}

function rich(state: CombatState): CombatState {
  state.actors.bob.energy = 20;
  state.actors.bob.energyMax = 20;
  return state;
}

describe('persistent timeline planning', () => {
  test('bracket helpers extend across a fixed enemy schedule and absolute placement can exceed one turn', () => {
    const state = rich(createCombat(11));
    const overtime = card(state, 'overtime');

    expect(turnLength(state)).toBe(7);
    expect(turnEnd(state)).toBe(7);
    expect(visibleEnd(state)).toBe(7);
    expect(state.queue[2]?.kind).toBe('enemy');
    expect(attachModifier(state, overtime.uid, { kind: 'bracket' })).toEqual({ ok: true });
    expect(turnLength(state)).toBe(9);
    expect(turnEnd(state)).toBe(9);
    expect(state.queue[8]?.kind).toBe('enemy');

    const firstEnd = finish(state);
    expect(firstEnd.position).toBe(9);
    expect(turnEnd(firstEnd)).toBe(16);
    const hammer = card(firstEnd, 'hammer');
    expect(queueCard(firstEnd, hammer.uid, 'guard', 15)).toEqual({ ok: true });
    const second = resolveTurn(firstEnd);
    expect(second.slice(0, -1).map((step) => step.state.activeSlot)).toEqual([9, 10, 11, 12, 13, 14, 15]);
    expect(second.at(-1)!.state.position).toBe(16);
    expect(second.at(-1)!.state.history.at(-1)!.position).toBe(15);
  });

  test('scouting reveal and hide preserve cached intent without enabling future placement or mutation', () => {
    const state = createCombat(12);
    const lookout = card(state, 'lookout');
    const before = structuredClone(state);
    expect(attachModifier(state, lookout.uid, { kind: 'bracket' })).toEqual({ ok: true });
    expect(turnEnd(state)).toBe(7);
    expect(visibleEnd(state)).toBe(10);
    const revealed = structuredClone(state.queue[8]);
    expect(revealed?.kind).toBe('enemy');

    const hammer = state.hand.find((candidate) => candidate.definitionId === 'hammer')!;
    expect(previewPlacement(state, hammer.uid, 'guard', 8)).toBeNull();
    expect(removeModifier(state, lookout.uid)).toEqual({ ok: true });
    expect(visibleEnd(state)).toBe(7);
    expect(state.queue[8]).toEqual(revealed);
    expect(before.queue[8]).toBeUndefined();
  });
  test('additive turn budgets have a minimum of one and no arbitrary maximum', () => {
    const state = rich(createCombat(121));
    state.actors.bob.turnLength = 2;
    const clockout = card(state, 'clockout');
    expect(attachModifier(state, clockout.uid, { kind: 'bracket' }).ok).toBe(true);
    expect(turnLength(state)).toBe(1);
    expect(turnEnd(state)).toBe(1);
    expect(removeModifier(state, clockout.uid).ok).toBe(true);
    state.actors.bob.turnLength = 40;
    const lookout = card(state, 'lookout');
    expect(attachModifier(state, lookout.uid, { kind: 'bracket' }).ok).toBe(true);
    expect(turnLength(state)).toBe(40);
    expect(visibleEnd(state)).toBe(43);
  });


  test('shortening is atomic and refunds chained out-of-range plans in deterministic position order', () => {
    const state = rich(createCombat(13));
    const overtime = card(state, 'overtime');
    expect(attachModifier(state, overtime.uid, { kind: 'bracket' }).ok).toBe(true);
    const hammer = card(state, 'hammer');
    expect(queueCard(state, hammer.uid, 'guard', 7).ok).toBe(true);
    const reinforce = card(state, 'reinforce');
    const positionReinforce: CardInstance = {
      uid: 'test-position-reinforce',
      definitionId: 'reinforce',
      owner: 'bob',
    };
    state.hand.push(positionReinforce);
    expect(attachModifier(state, reinforce.uid, { kind: 'card', uid: hammer.uid }).ok).toBe(true);
    expect(attachModifier(state, positionReinforce.uid, { kind: 'slot', slot: 7 }).ok).toBe(true);

    const clockout = card(state, 'clockout');
    expect(attachModifier(state, clockout.uid, { kind: 'bracket' })).toEqual({ ok: true });
    expect(turnEnd(state)).toBe(6);
    expect(state.queue[7]).toBeNull();
    expect(state.hand.slice(-2).map((entry) => entry.uid)).toEqual([hammer.uid, positionReinforce.uid]);
    expect(state.attachments.some((entry) => entry.card.uid === reinforce.uid)).toBe(true);
    expect(upgradeLevel(state, hammer.uid, null)).toBe(1);
    expect(availableEnergy(state)).toBe(17);

    expect(removeModifier(state, overtime.uid)).toEqual({ ok: true });
    expect(turnEnd(state)).toBe(4);
    expect(removeModifier(state, clockout.uid)).toEqual({ ok: true });
    expect(turnEnd(state)).toBe(7);
  });

  test('UID attachment to an enemy leaving the bracket refunds while its cached intent remains', () => {
    const state = rich(createCombat(14));
    state.actors.bob.turnLength = 13;
    const overtime = card(state, 'overtime');
    expect(attachModifier(state, overtime.uid, { kind: 'bracket' }).ok).toBe(true);
    const lookout = card(state, 'lookout');
    expect(attachModifier(state, lookout.uid, { kind: 'bracket' }).ok).toBe(true);
    const enemy = state.queue[14];
    expect(enemy?.kind).toBe('enemy');
    const weaken = card(state, 'weaken');
    expect(canAttachModifier(state, weaken.uid, { kind: 'card', uid: 'guard:intent:14' })).toBe(true);
    expect(attachModifier(state, weaken.uid, { kind: 'card', uid: 'guard:intent:14' }).ok).toBe(true);

    expect(removeModifier(state, overtime.uid)).toEqual({ ok: true });
    expect(turnEnd(state)).toBe(13);
    expect(visibleEnd(state)).toBe(16);
    expect(state.hand.some((entry) => entry.uid === weaken.uid)).toBe(true);
    expect(state.attachments.some((entry) => entry.card.uid === weaken.uid)).toBe(false);

    expect(state.queue[14]).toEqual(enemy);
  });
  test('occupied insertion uses absolute distance across enemy positions and ties favor lower indices', () => {
    const separated = rich(createCombat(151));
    const hammer = card(separated, 'hammer');
    const vest = card(separated, 'vest');
    expect(queueCard(separated, hammer.uid, 'guard', 1).ok).toBe(true);
    expect(queueCard(separated, vest.uid, 'bob', 1).ok).toBe(true);
    expect(separated.queue[0]).toMatchObject({ kind: 'player', card: { uid: hammer.uid } });
    expect(separated.queue[1]).toMatchObject({ kind: 'player', card: { uid: vest.uid } });
    expect(separated.queue[2]?.kind).toBe('enemy');

    const tied = rich(createCombat(152));
    const tiedHammer = card(tied, 'hammer');
    const tiedVest = card(tied, 'vest');
    expect(queueCard(tied, tiedHammer.uid, 'guard', 4).ok).toBe(true);
    expect(queueCard(tied, tiedVest.uid, 'bob', 4).ok).toBe(true);
    expect(tied.queue[3]).toMatchObject({ kind: 'player', card: { uid: tiedHammer.uid } });
    expect(tied.queue[4]).toMatchObject({ kind: 'player', card: { uid: tiedVest.uid } });
  });

  test('preview and rejected absolute commands are pure', () => {
    const state = rich(createCombat(15));
    const hammer = card(state, 'hammer');
    const before = structuredClone(state);
    const preview = previewPlacement(state, hammer.uid, null, 3);
    expect(preview?.[3]?.kind).toBe('player');
    expect(state).toEqual(before);
    expect(queueCard(state, hammer.uid, 'guard', -1).ok).toBe(false);
    expect(moveCard(state, 2, 4).ok).toBe(false);
    expect(removeCard(state, 2).ok).toBe(false);
    expect(retargetCard(state, 2, 'guard').ok).toBe(false);
    expect(state).toEqual(before);
  });
});

describe('persistent resolution and history', () => {
  test('energy reservations, automatic targets, and removal refunds remain observable', () => {
    const state = createCombat(16);
    const coffee = card(state, 'coffee');
    const heavy = card(state, 'heavy');
    expect(queueCard(state, coffee.uid, null, 0).ok).toBe(true);
    expect(queueCard(state, heavy.uid, null, 1).ok).toBe(true);
    expect(state.queue[0]).toMatchObject({ kind: 'player', target: 'bob' });
    expect(state.queue[1]).toMatchObject({ kind: 'player', target: 'guard' });
    expect(availableEnergy(state)).toBe(0);
    const hammer = card(state, 'hammer');
    const before = structuredClone(state);
    expect(queueCard(state, hammer.uid, null, 3).ok).toBe(false);
    expect(state).toEqual(before);
    expect(removeCard(state, 1).ok).toBe(true);
    expect(availableEnergy(state)).toBe(2);
    expect(queueCard(state, hammer.uid, null, 3).ok).toBe(true);
    const beforeWrongTarget = structuredClone(state);
    expect(retargetCard(state, 3, 'bob').ok).toBe(false);
    expect(state).toEqual(beforeWrongTarget);
    state.actors.guard.hp = 0;
    const beforeDeadTarget = structuredClone(state);
    expect(retargetCard(state, 3, 'guard').ok).toBe(false);
    expect(queueCard(state, heavy.uid, null, 4).ok).toBe(false);
    expect(state).toEqual(beforeDeadTarget);
  });

  test('variable-length resolution consumes empties and produces independent history snapshots', () => {
    const state = createCombat(21);
    const steps = resolveTurn(state);
    expect(steps).toHaveLength(8);
    expect(steps.slice(0, -1).map((step) => step.state.activeSlot)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const final = steps.at(-1)!.state;
    expect(final.position).toBe(7);
    expect(final.history.map((entry) => entry.position)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(steps[2].state.queue[2]?.kind).toBe('enemy');
    expect(final.queue[2]).toBeNull();

    const originalMessage = final.history[2].events[0].message;
    steps[2].state.history[2].events[0].message = 'mutated';
    if (steps[2].state.history[2].action?.kind === 'enemy') {
      steps[2].state.history[2].action.effects[0].amount = 999;
      steps[2].state.history[2].action.scaling!.effects![0] = 999;
    }
    expect(final.history[2].events[0].message).toBe(originalMessage);
    expect(final.history[2].action?.kind === 'enemy' && final.history[2].action.effects[0].amount).toBe(8);
    expect(final.history[2].action?.kind === 'enemy' && final.history[2].action.scaling?.effects?.[0]).toBe(4);
  });

  test('history freezes player definitions, modifiers, attachments and event card arrays independently', () => {
    const state = rich(createCombat(22));
    const hammer = card(state, 'hammer');
    expect(queueCard(state, hammer.uid, 'guard', 3).ok).toBe(true);
    const reinforce = card(state, 'reinforce');
    expect(attachModifier(state, reinforce.uid, { kind: 'card', uid: hammer.uid }).ok).toBe(true);
    const steps = resolveTurn(state);
    const impact = steps[3].state;
    const entry = impact.history.at(-1)!;
    expect(entry.definition?.id).toBe('hammer');
    expect(entry.upgradeLevel).toBe(1);
    expect(entry.attachments.map((item) => item.card.uid)).toEqual([reinforce.uid]);
    expect(entry.events.some((event) => event.kind === 'damage' && event.amount === 10)).toBe(true);

    entry.definition!.effects[0].amount = 100;
    entry.attachments[0].card.definitionId = 'vest';
    entry.definition!.scaling!.effects![0] = 999;
    expect(steps.at(-1)!.state.history[3].definition?.effects[0].amount).toBe(6);
    expect(steps.at(-1)!.state.history[3].definition?.scaling?.effects?.[0]).toBe(4);
    expect(steps.at(-1)!.state.history[3].attachments[0].card.definitionId).toBe('reinforce');
  });

  test('lethal at a moving absolute boundary stops immediately and terminal cleanup expires every commitment', () => {
    let state = finish(createCombat(23));
    state = rich(state);
    state.actors.guard.hp = 6;
    const hammer = card(state, 'hammer');
    expect(queueCard(state, hammer.uid, 'guard', 9).ok).toBe(true);
    const reinforce = card(state, 'reinforce');
    expect(attachModifier(state, reinforce.uid, { kind: 'card', uid: hammer.uid }).ok).toBe(true);
    const vest = card(state, 'vest');
    expect(queueCard(state, vest.uid, 'bob', 10).ok).toBe(true);
    const weaken = card(state, 'weaken');
    expect(attachModifier(state, weaken.uid, { kind: 'slot', slot: 11 }).ok).toBe(true);
    const steps = resolveTurn(state);
    const final = steps.at(-1)!.state;
    expect(final.phase).toBe('victory');
    expect(final.position).toBe(10);
    expect(final.history.at(-1)!.position).toBe(9);
    expect(final.history.at(-1)!.events.some((event) => event.kind === 'damage' && event.critical === false)).toBe(true);
    expect(final.attachments).toEqual([]);
    expect(final.queue.every((entry) => entry === null)).toBe(true);
    expect(final.hand).toEqual([]);
    expect(final.discardPile.some((entry) => entry.uid === reinforce.uid)).toBe(true);
    expect(final.discardPile.some((entry) => entry.uid === vest.uid)).toBe(true);
    expect(final.discardPile.some((entry) => entry.uid === weaken.uid)).toBe(true);
    const discardedUids = steps.at(-1)!.events.find((event) => event.kind === 'discard')!.cards!.map((entry) => entry.uid);
    expect(discardedUids).toContain(hammer.uid);
    expect(discardedUids).toContain(reinforce.uid);
    expect(discardedUids).toContain(vest.uid);
    expect(discardedUids).toContain(weaken.uid);
    expect(final.history.some((entry) => entry.position === 10)).toBe(false);
  });

  test('critical hook and Ringing use the lowest chronological enemy action after boundaries move', () => {
    let state = rich(finish(createCombat(24)));
    const tape = card(state, 'tape');
    const hammer = card(state, 'hammer');
    expect(queueCard(state, tape.uid, 'guard', 7).ok).toBe(true);
    expect(queueCard(state, hammer.uid, 'guard', 9).ok).toBe(true);
    state = finish(state);
    const critical = state.history.find((entry) => entry.position === 9)!;
    expect(critical.events.some((event) => event.kind === 'damage' && event.critical)).toBe(true);
    expect(critical.events.filter((event) => event.kind === 'ringing')).toHaveLength(1);
    expect(state.actors.guard.ringing).toBe(true);

    state.actors.bob.turnLength = 9;
    const lookout = card(state, 'lookout');
    expect(attachModifier(state, lookout.uid, { kind: 'bracket' }).ok).toBe(true);
    const hp = state.actors.bob.hp;
    const steps = resolveTurn(state);
    const final = steps.at(-1)!.state;
    const at14 = final.history.find((entry) => entry.position === 14)!;
    const at20 = final.history.find((entry) => entry.position === 20)!;
    expect(final.actors.bob.hp).toBe(hp - 16);
    expect(final.actors.bob.exposed).toBe(0);
    expect(at14.events.some((event) => event.kind === 'action')).toBe(true);
    expect(at20.events.some((event) => event.kind === 'empty' && event.message.includes('Ringing'))).toBe(true);
  });

  test('preflight rejects out-of-bracket corruption before spending or mutating', () => {
    const state = rich(createCombat(25));
    const hammer = card(state, 'hammer');
    state.hand.splice(state.hand.findIndex((entry) => entry.uid === hammer.uid), 1);
    state.queue[8] = { kind: 'player', card: hammer, target: 'guard' };
    const before = structuredClone(state);
    expect(() => resolveTurn(state)).toThrow('outside the current turn bracket');
    expect(state).toEqual(before);
  });

  test('same seed keeps refresh ordering deterministic and cleanup events own card snapshots', () => {
    const left = finish(createCombat(77));
    const right = finish(createCombat(77));
    expect(left.hand.map((entry) => entry.uid)).toEqual(right.hand.map((entry) => entry.uid));
    const steps = resolveTurn(left);
    const cleanup = steps.at(-1)!;
    const discard = cleanup.events.find((event) => event.kind === 'discard');
    const draw = cleanup.events.find((event) => event.kind === 'draw');
    expect(discard).toBeDefined();
    expect(draw).toBeDefined();
    const finalCards = cleanup.state.hand.map((entry) => entry.uid);
    discard!.cards![0].uid = 'mutated';
    expect(cleanup.state.discardPile.some((entry) => entry.uid === 'mutated')).toBe(false);
    expect(cleanup.state.hand.map((entry) => entry.uid)).toEqual(finalCards);
  });
  test('signed upgrade levels floor each damage effect before Block and Exposed while attachments spend once', () => {
    const state = rich(createCombat(31));
    state.actors.bob.block = 3;
    state.actors.bob.exposed = 4;
    const intent = state.queue[2];
    if (intent?.kind !== 'enemy') throw new Error('Expected fixed enemy damage at position 2');
    const modifiers: CardInstance[] = [
      card(state, 'weaken'),
      { uid: 'test-weaken-2', definitionId: 'weaken', owner: 'bob' },
      { uid: 'test-weaken-3', definitionId: 'weaken', owner: 'bob' },
    ];
    state.hand.push(...modifiers.slice(1));
    for (const modifier of modifiers) {
      expect(attachModifier(state, modifier.uid, { kind: 'card', uid: intent.uid }).ok).toBe(true);
    }
    const before = structuredClone(state);
    const steps = resolveTurn(state);
    expect(state).toEqual(before);
    const impact = steps.find((step) => step.state.activeSlot === 2)!;
    expect(impact.events.find((event) => event.kind === 'damage')).toMatchObject({
      amount: 1,
      critical: true,
    });
    expect(impact.state.actors.bob).toMatchObject({ hp: 41, block: 0, exposed: 0 });
    expect(steps.at(-1)!.state.attachments).toEqual([]);
  });

  test('cards drawn during resolution survive cleanup', () => {
    const state = createCombat(32);
    state.actors.bob.drawCount = 0;
    state.hand = [{ uid: 'test-toolbox', definitionId: 'toolbox', owner: 'bob' }];
    state.drawPile = [
      { uid: 'future-hammer', definitionId: 'hammer', owner: 'bob' },
      { uid: 'future-vest', definitionId: 'vest', owner: 'bob' },
    ];
    state.discardPile = [];
    expect(queueCard(state, 'test-toolbox', null, 0).ok).toBe(true);
    const final = finish(state);
    expect(final.hand.map((entry) => entry.uid).sort()).toEqual(['future-hammer', 'future-vest']);
  });

  test('cleanup emits discard before draw when the same UID is reshuffled back', () => {
    const state = createCombat(33);
    state.hand = [{ uid: 'recycled-vest', definitionId: 'vest', owner: 'bob' }];
    state.drawPile = [];
    state.discardPile = [];
    state.actors.bob.drawCount = 1;
    const before = structuredClone(state);
    const cleanup = resolveTurn(state).at(-1)!;
    expect(state).toEqual(before);
    const movements = cleanup.events.filter((event) => event.kind === 'discard' || event.kind === 'draw');
    expect(movements.map((event) => event.kind)).toEqual(['discard', 'draw']);
    expect(movements.map((event) => event.cards?.map((entry) => entry.uid)))
      .toEqual([['recycled-vest'], ['recycled-vest']]);
    movements[0].cards![0].definitionId = 'hammer';
    expect(movements[1].cards![0].definitionId).toBe('vest');
    expect(cleanup.state.hand[0].definitionId).toBe('vest');
  });

  test('multiple critical damage effects trigger the critical hook only once', () => {
    const state = rich(createCombat(34));
    state.actors.guard.exposed = 2;
    const hammer = card(state, 'hammer');
    expect(queueCard(state, hammer.uid, null, 0).ok).toBe(true);
    const originalEffects = CARDS.hammer.effects;
    const originalCritical = CARDS.hammer.onCritical;
    try {
      CARDS.hammer.effects = [
        { kind: 'damage', amount: 1, recipient: 'target' },
        { kind: 'exposed', amount: 2, recipient: 'target' },
        { kind: 'damage', amount: 1, recipient: 'target' },
      ];
      CARDS.hammer.onCritical = [{ kind: 'ringing', amount: 1, recipient: 'target' }];
      const events = resolveTurn(state).flatMap((step) => step.events);
      expect(events.filter((event) => event.kind === 'damage' && event.actor === 'bob').map((event) => event.critical))
        .toEqual([true, true]);
      expect(events.filter((event) => event.kind === 'ringing')).toHaveLength(1);
    } finally {
      CARDS.hammer.effects = originalEffects;
      CARDS.hammer.onCritical = originalCritical;
    }
  });

});

describe('authored upgrade scaling', () => {
  test('pure scaling uses authored increments, floors, and bracket polarity without mutating bases', () => {
    const hammerBefore = structuredClone(CARDS.hammer);
    const brace = applyUpgrade(CARDS.brace, 2);
    expect(brace.effects.map((effect) => effect.amount)).toEqual([8, 7]);
    expect(applyUpgrade(CARDS.hammer, -100).effects[0].amount).toBe(0);
    expect(applyUpgrade(CARDS.hammer, 100).effects[0].amount).toBe(406);
    expect(applyUpgrade(CARDS.hammer, 0).description).toBe(CARDS.hammer.description);
    expect(scaledBracket(CARDS.clockout, 2)?.positions).toBe(-5);
    expect(scaledBracket(CARDS.clockout, -4)?.positions).toBe(0);
    expect(scaledBracket(CARDS.overtime, -3)?.positions).toBe(0);
    expect(() => applyUpgrade(CARDS.hammer, Number.MAX_SAFE_INTEGER)).toThrow();
    expect(CARDS.hammer).toEqual(hammerBefore);
  });

  test('upgrades apply to defense, Exposed, resources, draws, and every effect of a mixed card', () => {
    const state = rich(createCombat(41));
    const plans = [
      { card: card(state, 'vest'), slot: 0 },
      { card: card(state, 'tape'), slot: 1 },
      { card: card(state, 'coffee'), slot: 3 },
      { card: card(state, 'toolbox'), slot: 4 },
      { card: card(state, 'brace'), slot: 5 },
    ];
    for (const plan of plans) expect(queueCard(state, plan.card.uid, null, plan.slot).ok).toBe(true);
    plans.forEach((plan, index) => {
      const source = { uid: `test-upgrade-${index}`, definitionId: 'reinforce', owner: 'bob' as const };
      state.hand.push(source);
      expect(attachModifier(state, source.uid, { kind: 'card', uid: plan.card.uid }).ok).toBe(true);
    });

    const steps = resolveTurn(state);
    const events = steps.flatMap((step) => step.events);
    expect(events.filter((event) => event.kind === 'block').map((event) => event.amount)).toEqual([10, 5]);
    expect(events.find((event) => event.kind === 'exposed')).toMatchObject({ amount: 10, target: 'guard' });
    expect(events.find((event) => event.kind === 'energy')).toMatchObject({ amount: 2, target: 'bob' });
    expect(events.find((event) => event.kind === 'draw')).toMatchObject({ amount: 3, actor: 'bob' });
    expect(steps.find((step) => step.state.activeSlot === 5)!.events.find((event) => event.kind === 'damage'))
      .toMatchObject({ amount: 16, target: 'guard' });
    expect(steps.at(-1)!.state.attachments).toEqual([]);
  });

  test('downgrades reduce enemy damage, Exposed, and healing while history retains base metadata', () => {
    const state = rich(createCombat(42));
    state.actors.bob.turnLength = 21;
    state.actors.guard.hp = 30;
    const lookout = card(state, 'lookout');
    expect(attachModifier(state, lookout.uid, { kind: 'bracket' }).ok).toBe(true);
    for (const position of [2, 8, 14, 20]) {
      const source = { uid: `test-downgrade-${position}`, definitionId: 'weaken', owner: 'bob' as const };
      state.hand.push(source);
      expect(attachModifier(state, source.uid, {
        kind: 'card',
        uid: `guard:intent:${position}`,
      }).ok).toBe(true);
    }

    const final = resolveTurn(state).at(-1)!.state;
    const history = new Map(final.history.map((entry) => [entry.position, entry] as const));
    expect(history.get(2)?.events.find((event) => event.kind === 'damage')).toMatchObject({ amount: 4 });
    expect(history.get(8)?.events.find((event) => event.kind === 'exposed')).toMatchObject({ amount: 3 });
    expect(history.get(14)?.events.find((event) => event.kind === 'damage')).toMatchObject({ amount: 11, critical: true });
    expect(history.get(20)?.events.find((event) => event.kind === 'heal')).toMatchObject({ amount: 4 });
    expect([2, 8, 14, 20].map((position) => history.get(position)?.upgradeLevel)).toEqual([-1, -1, -1, -1]);
    expect([2, 8, 14, 20].map((position) => {
      const action = history.get(position)?.action;
      return action?.kind === 'enemy' && action.effects[0].amount;
    })).toEqual([8, 4, 12, 6]);
  });

  test('upgrading active scouting reveals immediately and retracting preserves hidden cached intent', () => {
    const state = rich(createCombat(421));
    state.actors.bob.turnLength = 11;
    const lookout = card(state, 'lookout');
    expect(attachModifier(state, lookout.uid, { kind: 'bracket' })).toEqual({ ok: true });
    const reinforce = card(state, 'reinforce');
    expect(attachModifier(state, reinforce.uid, { kind: 'card', uid: lookout.uid })).toEqual({ ok: true });
    expect(visibleEnd(state)).toBe(15);
    const revealed = structuredClone(state.queue[14]);
    expect(revealed?.kind).toBe('enemy');
    expect(removeModifier(state, reinforce.uid)).toEqual({ ok: true });
    expect(visibleEnd(state)).toBe(14);
    expect(state.queue[14]).toEqual(revealed);
  });

  test('an upgraded active bracket reconciles immediately and its exact binding follows the refunded host', () => {

    const state = rich(createCombat(43));
    const overtime = card(state, 'overtime');
    expect(attachModifier(state, overtime.uid, { kind: 'bracket' }).ok).toBe(true);
    const firstUpgrade = card(state, 'reinforce');
    expect(attachModifier(state, firstUpgrade.uid, { kind: 'card', uid: overtime.uid }).ok).toBe(true);
    expect(turnLength(state)).toBe(10);

    const secondUpgrade = card(state, 'reinforce');
    expect(canAttachModifier(state, secondUpgrade.uid, { kind: 'card', uid: firstUpgrade.uid })).toBe(false);
    expect(canAttachModifier(state, secondUpgrade.uid, { kind: 'card', uid: secondUpgrade.uid })).toBe(false);
    expect(attachModifier(state, secondUpgrade.uid, { kind: 'card', uid: overtime.uid })).toEqual({ ok: true });
    expect(turnLength(state)).toBe(11);
    expect(removeModifier(state, overtime.uid)).toEqual({ ok: true });
    expect(turnLength(state)).toBe(7);
    expect(upgradeLevel(state, overtime.uid, null)).toBe(2);
    expect(availableEnergy(state)).toBe(18);

    expect(attachModifier(state, overtime.uid, { kind: 'bracket' })).toEqual({ ok: true });
    expect(turnLength(state)).toBe(11);
    const hammer = card(state, 'hammer');
    expect(queueCard(state, hammer.uid, null, 10)).toEqual({ ok: true });
    expect(removeModifier(state, firstUpgrade.uid)).toEqual({ ok: true });
    expect(turnLength(state)).toBe(10);
    expect(state.queue[10]).toBeNull();
    expect(state.hand.some((entry) => entry.uid === hammer.uid)).toBe(true);
    expect(upgradeLevel(state, overtime.uid, null)).toBe(1);
    const final = finish(state);
    expect(final.attachments).toEqual([]);
    expect(turnLength(final)).toBe(7);
  });
});

describe('Surge planning energy', () => {
  test('activates immediately above the stored cap and funds refundable plans without occupying the timeline', () => {
    const state = createCombat(51);
    const surge = card(state, 'surge');
    const queueBefore = structuredClone(state.queue);

    expect(previewPlacement(state, surge.uid, null, 0)).toBeNull();
    expect(queueCard(state, surge.uid, null, 0).ok).toBe(false);
    const result = playSurge(state, surge.uid);
    expect(result.ok).toBe(true);
    expect(state.queue).toEqual(queueBefore);
    expect(state.actors.bob).toMatchObject({ energy: 2, surgeEnergy: 2, energyMax: 4 });
    expect(availableEnergy(state)).toBe(4);
    const second = card(state, 'surge');
    expect(playSurge(state, second.uid).ok).toBe(true);
    expect(availableEnergy(state)).toBe(6);
    expect(state.actors.bob.energyMax).toBe(4);

    const heavy = card(state, 'heavy');
    const hammer = card(state, 'hammer');
    expect(queueCard(state, heavy.uid, null, 0)).toEqual({ ok: true });
    expect(queueCard(state, hammer.uid, null, 1)).toEqual({ ok: true });
    expect(availableEnergy(state)).toBe(3);
    expect(removeCard(state, 0)).toEqual({ ok: true });
    expect(availableEnergy(state)).toBe(5);
    expect(state.discardPile.filter((entry) => entry.uid === surge.uid)).toHaveLength(1);
  });

  test('multiple activations stack, zero-cost Surge works at zero, and a consumed source cannot be reused', () => {
    const state = createCombat(52);
    state.actors.bob.energy = 0;
    const first = card(state, 'surge');

    expect(playSurge(state, first.uid).ok).toBe(true);
    const second = card(state, 'surge');
    expect(playSurge(state, second.uid).ok).toBe(true);
    expect(state.actors.bob).toMatchObject({ energy: 0, surgeEnergy: 4 });
    const beforeReuse = structuredClone(state);
    expect(playSurge(state, first.uid)).toMatchObject({ ok: false, events: [] });
    expect(state).toEqual(beforeReuse);
    expect(state.discardPile.filter((entry) => entry.uid === first.uid || entry.uid === second.uid)).toHaveLength(2);
  });

  test('pre-grant funding failure is pure and cannot borrow the Surge it would generate', () => {
    const state = createCombat(53);
    const surge = card(state, 'surge');
    const heavy = card(state, 'heavy');
    expect(queueCard(state, heavy.uid, null, 0)).toEqual({ ok: true });
    const originalCost = CARDS.surge.cost;
    try {
      CARDS.surge.cost = 1;
      const before = structuredClone(state);
      expect(playSurge(state, surge.uid)).toMatchObject({ ok: false, events: [] });
      expect(state).toEqual(before);
    } finally {
      CARDS.surge.cost = originalCost;
    }
  });

  test('bound grades are paid once by their owner, consumed with the source, and returned as independent snapshots', () => {
    const state = createCombat(54);
    const surge = card(state, 'surge');
    const reinforce = card(state, 'reinforce');
    const hammer = card(state, 'hammer');
    expect(attachModifier(state, reinforce.uid, { kind: 'card', uid: surge.uid })).toEqual({ ok: true });
    expect(queueCard(state, hammer.uid, null, 0)).toEqual({ ok: true });
    expect(availableEnergy(state)).toBe(0);

    const result = playSurge(state, surge.uid);
    expect(result.ok).toBe(true);
    expect(state.actors.bob).toMatchObject({ energy: 1, surgeEnergy: 4 });
    expect(availableEnergy(state)).toBe(4);
    expect(state.attachments.some((entry) => entry.card.uid === reinforce.uid)).toBe(false);
    expect(result.events.map((event) => event.kind)).toEqual(['energy', 'discard']);
    expect(result.events[0]).toMatchObject({ actor: 'bob', target: 'bob', amount: 4 });
    expect(result.events[1].cards?.map((entry) => entry.uid)).toEqual([surge.uid, reinforce.uid]);
    result.events[1].cards![0].definitionId = 'vest';
    expect(state.discardPile.find((entry) => entry.uid === surge.uid)?.definitionId).toBe('surge');

    const final = finish(state);
    expect(final.actors.bob).toMatchObject({ energy: 3, surgeEnergy: 0 });
    expect(final.discardPile.filter((entry) => entry.uid === surge.uid)).toHaveLength(1);
    expect(final.discardPile.filter((entry) => entry.uid === reinforce.uid)).toHaveLength(1);
  });

  test('costs use each card owner pool and unused Surge expires before normal refresh', () => {
    const state = createCombat(55);
    state.actors.bob.energy = 1;
    const surge = card(state, 'surge');
    expect(playSurge(state, surge.uid).ok).toBe(true);
    const final = finish(state);
    expect(final.actors.bob).toMatchObject({ energy: 3, surgeEnergy: 0 });

    const terminal = createCombat(551);
    terminal.actors.guard.hp = 6;
    const terminalSurge = card(terminal, 'surge');
    const hammer = card(terminal, 'hammer');
    expect(playSurge(terminal, terminalSurge.uid).ok).toBe(true);
    expect(queueCard(terminal, hammer.uid, null, 0)).toEqual({ ok: true });
    const victory = finish(terminal);
    expect(victory.phase).toBe('victory');
    expect(victory.actors.bob.surgeEnergy).toBe(0);

    const owned = createCombat(56);
    owned.actors.guard.energy = 1;
    const guardSurge: CardInstance = { uid: 'guard-surge', definitionId: 'surge', owner: 'guard' };
    const guardGrade: CardInstance = { uid: 'guard-grade', definitionId: 'reinforce', owner: 'guard' };
    owned.hand.push(guardSurge, guardGrade);
    expect(attachModifier(owned, guardGrade.uid, { kind: 'card', uid: guardSurge.uid })).toEqual({ ok: true });
    expect(playSurge(owned, guardSurge.uid).ok).toBe(true);
    expect(owned.actors.guard).toMatchObject({ energy: 0, surgeEnergy: 4 });
    expect(owned.actors.bob).toMatchObject({ energy: 2, surgeEnergy: 0 });
  });
});

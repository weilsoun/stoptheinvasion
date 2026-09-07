import { describe, expect, test } from 'bun:test';
import {
  attachModifier,
  availableEnergy,
  canAttachModifier,
  createCombat,
  damageModifier,
  moveCard,
  previewPlacement,
  queueCard,
  removeCard,
  removeModifier,
  resolveTurn,
  retargetCard,
} from '../src/game/combat';
import { CARDS } from '../src/game/content';
import type { CardInstance, CombatState } from '../src/game/types';

function card(state: CombatState, definitionId: string): CardInstance {
  const inHand = state.hand.find(candidate => candidate.definitionId === definitionId);
  if (inHand) return inHand;
  const drawIndex = state.drawPile.findIndex(candidate => candidate.definitionId === definitionId);
  if (drawIndex < 0) throw new Error(`Missing ${definitionId} in combat deck`);
  const [drawn] = state.drawPile.splice(drawIndex, 1);
  state.hand.push(drawn);
  return drawn;
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

  test('obvious attack and self targets resolve without a targeting step', () => {
    const state = createCombat(12);
    expect(queueCard(state, card(state, 'hammer').uid, null, 0).ok).toBe(true);
    expect(queueCard(state, card(state, 'vest').uid, null, 4).ok).toBe(true);
    const result = finish(state);
    expect(result.actors.guard.hp).toBe(42);
    expect(result.actors.bob.hp).toBe(41);
  });

  test('moving through an occupied slot preserves targets, and removal refunds its reservation', () => {
    const state = createCombat(12);
    expect(queueCard(state, card(state, 'hammer').uid, null, 0).ok).toBe(true);
    expect(queueCard(state, card(state, 'coffee').uid, null, 1).ok).toBe(true);
    expect(state.queue[1]).toMatchObject({ kind: 'player', target: 'bob' });
    expect(moveCard(state, 0, 1).ok).toBe(true);
    expect(state.queue[1]).toMatchObject({ kind: 'player', target: 'guard' });
    expect(state.queue[0]).toMatchObject({ kind: 'player', target: 'bob' });
    expect(removeCard(state, 1).ok).toBe(true);
    expect(availableEnergy(state)).toBe(2);
  });

  test('occupied moves rotate every player card while gaps and the enemy anchor stay fixed', () => {
    const state = createCombat(12);
    state.actors.bob.energy = 10;
    const hammer = card(state, 'hammer');
    const vest = card(state, 'vest');
    const tape = card(state, 'tape');
    const coffee = card(state, 'coffee');
    const enemy = state.queue[3];
    queueCard(state, hammer.uid, null, 0);
    queueCard(state, vest.uid, 'bob', 2);
    queueCard(state, tape.uid, 'guard', 4);
    queueCard(state, coffee.uid, 'bob', 5);
    const energy = availableEnergy(state);

    expect(moveCard(state, 0, 5).ok).toBe(true);
    expect(state.queue.map(slot => slot?.kind === 'player' ? slot.card.uid : slot?.kind ?? null))
      .toEqual([vest.uid, null, tape.uid, 'enemy', coffee.uid, hammer.uid]);
    expect(state.queue.map(slot => slot?.kind === 'player' ? slot.target : null))
      .toEqual(['bob', null, 'guard', null, 'bob', 'guard']);
    expect(state.queue[3]).toBe(enemy);
    expect(availableEnergy(state)).toBe(energy);
    expect(moveCard(state, 5, 0).ok).toBe(true);
    expect(state.queue.map(slot => slot?.kind === 'player' ? slot.card.uid : slot?.kind ?? null))
      .toEqual([hammer.uid, null, vest.uid, 'enemy', tape.uid, coffee.uid]);
  });

  test('hand insertion shifts toward the nearest hole and breaks equal-distance ties to the right', () => {
    const tied = createCombat(12);
    tied.actors.bob.energy = 10;
    const tiedHammer = card(tied, 'hammer');
    const tiedVest = card(tied, 'vest');
    queueCard(tied, tiedHammer.uid, 'guard', 2);
    expect(queueCard(tied, tiedVest.uid, 'bob', 2).ok).toBe(true);
    expect(tied.queue[1]).toBeNull();
    expect(tied.queue[2]).toMatchObject({ kind: 'player', card: { uid: tiedVest.uid } });
    expect(tied.queue[4]).toMatchObject({ kind: 'player', card: { uid: tiedHammer.uid } });

    const nearest = createCombat(12);
    nearest.actors.bob.energy = 10;
    const hammer = card(nearest, 'hammer');
    const vest = card(nearest, 'vest');
    const tape = card(nearest, 'tape');
    const coffee = card(nearest, 'coffee');
    queueCard(nearest, hammer.uid, 'guard', 0);
    queueCard(nearest, vest.uid, 'bob', 1);
    queueCard(nearest, tape.uid, 'guard', 2);
    expect(queueCard(nearest, coffee.uid, 'bob', 1).ok).toBe(true);
    expect(nearest.queue.map(slot => slot?.kind === 'player' ? slot.card.uid : slot?.kind ?? null))
      .toEqual([hammer.uid, coffee.uid, vest.uid, 'enemy', tape.uid, null]);
  });

  test('preview is nonmutating and exactly matches hand insertion and queued-card commits', () => {
    const moved = createCombat(12);
    moved.actors.bob.energy = 10;
    const hammer = card(moved, 'hammer');
    const vest = card(moved, 'vest');
    const tape = card(moved, 'tape');
    queueCard(moved, hammer.uid, null, 0);
    queueCard(moved, vest.uid, 'bob', 1);
    queueCard(moved, tape.uid, 'guard', 2);
    const beforeMovePreview = structuredClone(moved);
    const movePreview = previewPlacement(moved, hammer.uid, 'bob', 2);
    expect(movePreview).not.toBeNull();
    expect(moved).toEqual(beforeMovePreview);
    expect(moveCard(moved, 0, 2).ok).toBe(true);
    expect(moved.queue).toEqual(movePreview);
    expect(moved.queue[2]).toMatchObject({ kind: 'player', target: 'guard' });

    const inserted = createCombat(12);
    inserted.actors.bob.energy = 10;
    const insertedHammer = card(inserted, 'hammer');
    const insertedVest = card(inserted, 'vest');
    queueCard(inserted, insertedHammer.uid, 'guard', 0);
    const beforeInsertPreview = structuredClone(inserted);
    const insertPreview = previewPlacement(inserted, insertedVest.uid, null, 0);
    expect(insertPreview).not.toBeNull();
    expect(inserted).toEqual(beforeInsertPreview);
    expect(queueCard(inserted, insertedVest.uid, null, 0).ok).toBe(true);
    expect(inserted.queue).toEqual(insertPreview);
  });

  test('full, invalid, and unaffordable placements reject without changing state', () => {
    const invalid = createCombat(12);
    const invalidCard = card(invalid, 'hammer');
    const beforeInvalid = structuredClone(invalid);
    expect(previewPlacement(invalid, invalidCard.uid, 'bob', 0)).toBeNull();
    expect(queueCard(invalid, invalidCard.uid, 'bob', 0).ok).toBe(false);
    expect(invalid).toEqual(beforeInvalid);
    expect(previewPlacement(invalid, invalidCard.uid, 'guard', -1)).toBeNull();
    expect(queueCard(invalid, invalidCard.uid, 'guard', -1).ok).toBe(false);
    expect(invalid).toEqual(beforeInvalid);

    const unaffordable = createCombat(12);
    unaffordable.actors.bob.energy = 0;
    const costly = card(unaffordable, 'hammer');
    const beforeUnaffordable = structuredClone(unaffordable);
    expect(previewPlacement(unaffordable, costly.uid, 'guard', 0)).toBeNull();
    expect(queueCard(unaffordable, costly.uid, 'guard', 0).ok).toBe(false);
    expect(unaffordable).toEqual(beforeUnaffordable);

    const full = createCombat(12);
    full.actors.bob.energy = 10;
    const plannedCards = [
      [card(full, 'hammer'), 'guard'],
      [card(full, 'vest'), 'bob'],
      [card(full, 'coffee'), 'bob'],
      [card(full, 'tape'), 'guard'],
      [card(full, 'heavy'), 'guard'],
    ] as const;
    for (const [index, slot] of [0, 1, 2, 4, 5].entries()) {
      const [next, target] = plannedCards[index];
      expect(queueCard(full, next.uid, target, slot).ok).toBe(true);
    }
    const extra: CardInstance = { uid: 'extra-coffee', definitionId: 'coffee', owner: 'bob' };
    full.hand.push(extra);
    const beforeFull = structuredClone(full);
    expect(previewPlacement(full, extra.uid, 'bob', 0)).toBeNull();
    expect(queueCard(full, extra.uid, 'bob', 0).ok).toBe(false);
    expect(full).toEqual(beforeFull);
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
    const nextAttack = card(state, 'heavy');
    const beforeAutomaticTarget = structuredClone(state);
    expect(queueCard(state, nextAttack.uid, null, 1).ok).toBe(false);
    expect(state).toEqual(beforeAutomaticTarget);
    expect(() => resolveTurn(state)).toThrow();
    expect(state).toEqual(beforeAutomaticTarget);
  });

  test('resolution does not subtract committed energy twice', () => {
    const state = createCombat(12);
    queueCard(state, card(state, 'heavy').uid, 'guard', 0);
    const first = resolveTurn(state)[0].state;
    expect(availableEnergy(first)).toBe(0);
  });

  test('Ringing Bob rejects a second commitment and corrupt multi-action plans before spending', () => {
    const state = createCombat(12);
    state.actors.bob.ringing = true;
    state.actors.bob.energy = 10;
    const hammer = card(state, 'hammer');
    const vest = card(state, 'vest');
    expect(queueCard(state, hammer.uid, 'guard', 0).ok).toBe(true);

    const beforeRejectedCommitment = structuredClone(state);
    expect(previewPlacement(state, vest.uid, 'bob', 1)).toBeNull();
    expect(queueCard(state, vest.uid, 'bob', 1).ok).toBe(false);
    expect(state).toEqual(beforeRejectedCommitment);

    state.hand.splice(state.hand.findIndex(candidate => candidate.uid === vest.uid), 1);
    state.queue[1] = { kind: 'player', card: vest, target: 'bob' };
    const beforePreflight = structuredClone(state);
    expect(() => resolveTurn(state)).toThrow(/Ringing/);
    expect(state).toEqual(beforePreflight);
  });

  test('invalid conditional Ringing duration fails preflight without mutating or spending', () => {
    const state = createCombat(12);
    expect(queueCard(state, card(state, 'hammer').uid, 'guard', 0).ok).toBe(true);
    const before = structuredClone(state);
    const original = CARDS.hammer.onCritical;
    try {
      CARDS.hammer.onCritical = [{ kind: 'ringing', amount: 2, recipient: 'target' }];
      expect(() => resolveTurn(state)).toThrow(/Ringing must last exactly one turn/);
      expect(state).toEqual(before);
    } finally {
      CARDS.hammer.onCritical = original;
    }
  });
});

describe('attachments', () => {
  test('enemy card binding uses the exact intent uid and damage reduction floors at zero', () => {
    const state = createCombat(12);
    state.actors.bob.energy = 3;
    const intent = state.queue[3];
    if (intent?.kind !== 'enemy') throw new Error('Expected the turn-one enemy intent');
    const modifiers = [
      card(state, 'weaken'),
      { uid: 'weaken-test-2', definitionId: 'weaken', owner: 'bob' as const },
      { uid: 'weaken-test-3', definitionId: 'weaken', owner: 'bob' as const },
    ];
    state.hand.push(...modifiers.slice(1));
    const queueLength = state.queue.length;

    for (const modifier of modifiers) {
      expect(attachModifier(state, modifier.uid, { kind: 'card', uid: intent.uid }).ok).toBe(true);
    }

    expect(state.queue).toHaveLength(queueLength);
    expect(damageModifier(state, intent.uid, 3)).toBe(-12);
    expect(availableEnergy(state)).toBe(0);
    const result = finish(state);
    expect(result.actors.bob.hp).toBe(42);
    expect(result.attachments).toEqual([]);
  });

  test('card binding follows a friendly card through queueing, reordering, and removal', () => {
    const state = createCombat(12);
    state.actors.bob.energy = 10;
    const hammer = card(state, 'hammer');
    const reinforce = card(state, 'reinforce');

    expect(attachModifier(state, reinforce.uid, { kind: 'card', uid: hammer.uid }).ok).toBe(true);
    expect(damageModifier(state, hammer.uid, null)).toBe(4);
    expect(queueCard(state, hammer.uid, 'guard', 0).ok).toBe(true);
    expect(moveCard(state, 0, 2).ok).toBe(true);
    expect(damageModifier(state, hammer.uid, 2)).toBe(4);
    expect(removeCard(state, 2).ok).toBe(true);
    expect(state.attachments[0].target).toEqual({ kind: 'card', uid: hammer.uid });
    expect(damageModifier(state, hammer.uid, null)).toBe(4);
  });

  test('position binding stays put and modifies the compatible card that moves into it', () => {
    const state = createCombat(12);
    state.actors.bob.energy = 10;
    const reinforce = card(state, 'reinforce');
    const firstHammer = card(state, 'hammer');

    expect(attachModifier(state, reinforce.uid, { kind: 'slot', slot: 0 }).ok).toBe(true);
    expect(queueCard(state, firstHammer.uid, 'guard', 0).ok).toBe(true);
    expect(moveCard(state, 0, 1).ok).toBe(true);
    const secondHammer = card(state, 'hammer');
    expect(queueCard(state, secondHammer.uid, 'guard', 0).ok).toBe(true);

    expect(state.attachments[0].target).toEqual({ kind: 'slot', slot: 0 });
    expect(damageModifier(state, firstHammer.uid, 1)).toBe(0);
    expect(damageModifier(state, secondHammer.uid, 0)).toBe(4);
    expect(finish(state).actors.guard.hp).toBe(32);
  });

  test('undo refunds reservation while invalid target, phase, energy, and queue requests are atomic', () => {
    const state = createCombat(12);
    const reinforce = card(state, 'reinforce');
    const vest = card(state, 'vest');
    const invalidTarget = { kind: 'card', uid: vest.uid } as const;
    const beforeInvalid = structuredClone(state);

    expect(canAttachModifier(state, reinforce.uid, invalidTarget)).toBe(false);
    expect(attachModifier(state, reinforce.uid, invalidTarget).ok).toBe(false);
    expect(queueCard(state, reinforce.uid, 'bob', 0).ok).toBe(false);
    expect(state).toEqual(beforeInvalid);

    state.actors.bob.energy = 0;
    const beforeEnergy = structuredClone(state);
    expect(canAttachModifier(state, reinforce.uid, { kind: 'slot', slot: 0 })).toBe(false);
    expect(attachModifier(state, reinforce.uid, { kind: 'slot', slot: 0 }).ok).toBe(false);
    expect(state).toEqual(beforeEnergy);

    state.actors.bob.energy = 2;
    state.phase = 'resolving';
    const beforePhase = structuredClone(state);
    expect(canAttachModifier(state, reinforce.uid, { kind: 'slot', slot: 0 })).toBe(false);
    expect(attachModifier(state, reinforce.uid, { kind: 'slot', slot: 0 }).ok).toBe(false);
    expect(state).toEqual(beforePhase);

    state.phase = 'planning';
    expect(attachModifier(state, reinforce.uid, { kind: 'slot', slot: 0 }).ok).toBe(true);
    expect(availableEnergy(state)).toBe(1);
    expect(removeModifier(state, reinforce.uid).ok).toBe(true);
    expect(availableEnergy(state)).toBe(2);
    expect(state.hand.some(candidate => candidate.uid === reinforce.uid)).toBe(true);
  });

  test('an unused attachment spends its cost and expires into discard without blocking Resolve', () => {
    const state = createCombat(12);
    const hammer = card(state, 'hammer');
    const reinforce = card(state, 'reinforce');
    expect(attachModifier(state, reinforce.uid, { kind: 'card', uid: hammer.uid }).ok).toBe(true);

    const result = finish(state);
    expect(result.phase).toBe('planning');
    expect(result.actors.bob.energy).toBe(3);
    expect(result.attachments).toEqual([]);
    expect(result.discardPile.some(candidate => candidate.uid === reinforce.uid)).toBe(true);
    expect(result.queue).toHaveLength(6);
  });

  test('resolution snapshots isolate attachment cards and targets and preflight broken bindings', () => {
    const state = createCombat(12);
    const hammer = card(state, 'hammer');
    const reinforce = card(state, 'reinforce');
    expect(attachModifier(state, reinforce.uid, { kind: 'card', uid: hammer.uid }).ok).toBe(true);
    expect(queueCard(state, hammer.uid, 'guard', 0).ok).toBe(true);
    const steps = resolveTurn(state);
    const first = steps[0].state.attachments[0];
    const second = steps[1].state.attachments[0];
    if (first.target.kind !== 'card' || second.target.kind !== 'card') {
      throw new Error('Expected card-bound attachment snapshots');
    }
    first.card.uid = 'mutated';
    first.target.uid = 'mutated';
    expect(second.card.uid).toBe(reinforce.uid);
    expect(second.target.uid).toBe(hammer.uid);
    expect(state.attachments[0].card.uid).toBe(reinforce.uid);

    const broken = createCombat(12);
    const brokenHammer = card(broken, 'hammer');
    const brokenReinforce = card(broken, 'reinforce');
    attachModifier(broken, brokenReinforce.uid, { kind: 'card', uid: brokenHammer.uid });
    broken.hand = broken.hand.filter(candidate => candidate.uid !== brokenHammer.uid);
    const before = structuredClone(broken);
    expect(() => resolveTurn(broken)).toThrow('Attachment has an invalid card target.');
    expect(broken).toEqual(before);
  });
});

describe('ordered resolution', () => {
  test('Block right of an anchored attack protects; Block left of it does not carry over', () => {
    const early = createCombat(12);
    const late = createCombat(12);
    queueCard(early, card(early, 'vest').uid, 'bob', 4);
    queueCard(late, card(late, 'vest').uid, 'bob', 0);
    const earlyResult = finish(early);
    const lateResult = finish(late);
    expect(earlyResult.actors.bob.hp).toBe(41);
    expect(lateResult.actors.bob.hp).toBe(34);
    expect(earlyResult.actors.bob.block).toBe(0);
    expect(lateResult.actors.bob.block).toBe(0);
  });

  test('right-to-left setup amplifies the next hit, and early lethal cancels a committed enemy attack', () => {
    const state = createCombat(12);
    state.actors.guard.hp = 11;
    queueCard(state, card(state, 'tape').uid, 'guard', 5);
    queueCard(state, card(state, 'hammer').uid, 'guard', 4);
    const steps = resolveTurn(state);
    expect(steps.map(step => step.state.activeSlot)).toEqual([5, 4, 3, 2, 1, 0, null]);
    expect(steps[0].state.actors.guard).toMatchObject({ hp: 11, exposed: 8 });
    expect(steps[1].state.actors.guard).toMatchObject({ hp: 0, exposed: 0 });
    expect(steps.flatMap(step => step.events).filter(event => event.kind === 'action').map(event => event.actor))
      .toEqual(['bob', 'bob']);
    const result = steps[steps.length - 1].state;
    expect(result.phase).toBe('victory');
    expect(result.actors.guard.hp).toBe(0);
    expect(result.actors.bob.hp).toBe(42);
    expect(result.actors.guard.exposed).toBe(0);
  });

  test('only an Exposed hit is critical, applying Ringing after damage without mutating snapshots or input', () => {
    const ordinary = createCombat(12);
    expect(ordinary.actors.bob).toMatchObject({ ringing: false, ringingNextTurn: false });
    expect(ordinary.actors.guard).toMatchObject({ ringing: false, ringingNextTurn: false });
    expect(queueCard(ordinary, card(ordinary, 'hammer').uid, 'guard', 4).ok).toBe(true);
    const ordinaryEvents = resolveTurn(ordinary).flatMap(step => step.events);
    expect(ordinaryEvents.find(event => event.kind === 'damage')).toMatchObject({
      target: 'guard', amount: 6, critical: false,
    });
    expect(ordinaryEvents.some(event => event.kind === 'ringing')).toBe(false);

    const critical = createCombat(12);
    expect(queueCard(critical, card(critical, 'tape').uid, 'guard', 5).ok).toBe(true);
    expect(queueCard(critical, card(critical, 'hammer').uid, 'guard', 4).ok).toBe(true);
    const before = structuredClone(critical);
    const steps = resolveTurn(critical);
    expect(critical).toEqual(before);
    const hit = steps.find(step => step.events.some(event => event.kind === 'ringing'));
    if (!hit) throw new Error('Expected critical Ringing');
    expect(hit.events.find(event => event.kind === 'damage')).toMatchObject({
      target: 'guard', amount: 14, critical: true,
    });
    expect(hit.events.filter(event => event.kind === 'ringing')).toHaveLength(1);
    expect(hit.state.actors.guard).toMatchObject({ hp: 34, ringing: false, ringingNextTurn: true });

    const final = steps[steps.length - 1].state;
    hit.state.actors.guard.ringingNextTurn = false;
    expect(final.actors.guard).toMatchObject({ ringing: true, ringingNextTurn: false });
    expect(final.queue.filter(action => action?.kind === 'enemy')).toHaveLength(1);
  });

  test('a Ringing enemy fires only its rightmost action across six slots, then the status expires', () => {
    const state = createCombat(12);

    state.actors.guard.ringing = true;
    state.queue = Array(6).fill(null);
    state.queue[5] = {
      kind: 'enemy', uid: 'guard:right', actor: 'guard', target: 'bob',
      name: 'Right action', description: 'Deal 3 damage.', effects: [{ kind: 'damage', amount: 3, recipient: 'target' }],
    };
    state.queue[1] = {
      kind: 'enemy', uid: 'guard:left', actor: 'guard', target: 'bob',
      name: 'Left action', description: 'Deal 7 damage.', effects: [{ kind: 'damage', amount: 7, recipient: 'target' }],
    };

    const steps = resolveTurn(state);
    expect(steps).toHaveLength(7);
    expect(steps.map(step => step.state.activeSlot)).toEqual([5, 4, 3, 2, 1, 0, null]);
    const events = steps.flatMap(step => step.events);
    expect(events.filter(event => event.kind === 'action').map(event => event.slot)).toEqual([5]);
    expect(events.filter(event => event.kind === 'damage').map(event => event.amount)).toEqual([3]);
    expect(steps.find(step => step.state.activeSlot === 1)?.events).toEqual([
      expect.objectContaining({ kind: 'empty', actor: 'guard', slot: 1 }),
    ]);
    expect(steps[steps.length - 1].state.actors.guard).toMatchObject({
      ringing: false, ringingNextTurn: false,
    });
  });

  test('multiple critical damage effects apply conditional effects only once per action', () => {
    const state = createCombat(12);
    state.actors.guard.exposed = 2;
    expect(queueCard(state, card(state, 'hammer').uid, 'guard', 4).ok).toBe(true);
    const originalEffects = CARDS.hammer.effects;
    const originalCritical = CARDS.hammer.onCritical;
    try {
      CARDS.hammer.effects = [
        { kind: 'damage', amount: 1, recipient: 'target' },
        { kind: 'exposed', amount: 2, recipient: 'target' },
        { kind: 'damage', amount: 1, recipient: 'target' },
      ];
      CARDS.hammer.onCritical = [{ kind: 'ringing', amount: 1, recipient: 'target' }];
      const events = resolveTurn(state).flatMap(step => step.events);
      expect(events.filter(event => event.kind === 'damage' && event.actor === 'bob').map(event => event.critical)).toEqual([true, true]);
      expect(events.filter(event => event.kind === 'ringing')).toHaveLength(1);
    } finally {
      CARDS.hammer.effects = originalEffects;
      CARDS.hammer.onCritical = originalCritical;
    }
  });

  test('a fully blocked critical Rings, and another critical refreshes an active restriction', () => {
    const blocked = createCombat(12);
    blocked.actors.guard.exposed = 8;
    blocked.actors.guard.block = 14;
    expect(queueCard(blocked, card(blocked, 'hammer').uid, 'guard', 4).ok).toBe(true);
    const blockedSteps = resolveTurn(blocked);
    expect(blockedSteps.flatMap(step => step.events).find(event => event.kind === 'damage')).toMatchObject({
      target: 'guard', amount: 0, critical: true,
    });
    expect(blockedSteps.flatMap(step => step.events).filter(event => event.kind === 'ringing')).toHaveLength(1);

    const refreshed = createCombat(12);
    refreshed.actors.guard.ringing = true;
    refreshed.actors.guard.exposed = 8;
    expect(queueCard(refreshed, card(refreshed, 'hammer').uid, 'guard', 4).ok).toBe(true);
    const refreshSteps = resolveTurn(refreshed);
    const refreshHit = refreshSteps.find(step => step.events.some(event => event.kind === 'ringing'));
    if (!refreshHit) throw new Error('Expected refreshed Ringing');
    expect(refreshHit.state.actors.guard).toMatchObject({ ringing: true, ringingNextTurn: true });
    expect(refreshSteps[refreshSteps.length - 1].state.actors.guard).toMatchObject({
      ringing: true, ringingNextTurn: false,
    });
  });

  test('a lethal critical does not apply a postmortem Ringing status', () => {
    const state = createCombat(12);
    state.actors.guard.hp = 10;
    state.actors.guard.exposed = 8;
    expect(queueCard(state, card(state, 'hammer').uid, 'guard', 4).ok).toBe(true);
    const steps = resolveTurn(state);
    const events = steps.flatMap(step => step.events);
    expect(events.find(event => event.kind === 'damage')).toMatchObject({
      target: 'guard', amount: 10, critical: true,
    });
    expect(events.some(event => event.kind === 'ringing')).toBe(false);
    expect(steps[steps.length - 1].state).toMatchObject({
      phase: 'victory',
      actors: { guard: { hp: 0, ringing: false, ringingNextTurn: false } },
    });
  });

  test('enemy healing caps at max health without disturbing Block or Exposed', () => {
    let state = createCombat(12);
    state = finish(state);
    state = finish(state);
    state = finish(state);
    state.actors.guard.hp = 45;
    state.actors.guard.block = 5;
    state.actors.guard.exposed = 7;
    const before = structuredClone(state);

    const steps = resolveTurn(state);
    expect(state).toEqual(before);
    const healStep = steps.find(step => step.events.some(event => event.kind === 'heal'));
    if (!healStep) throw new Error('Expected the turn-four heal');
    const heal = healStep.events.find(event => event.kind === 'heal');
    if (!heal) throw new Error('Expected a heal event');
    expect(heal).toMatchObject({ actor: 'guard', target: 'guard', amount: 3 });
    expect(healStep.state.actors.guard).toMatchObject({ hp: 48, maxHp: 48, block: 5, exposed: 7 });

    const final = steps[steps.length - 1].state;
    healStep.state.actors.guard.hp = 0;
    expect(final.actors.guard).toMatchObject({ hp: 48, exposed: 7 });
  });

  test('enemy healing is canceled when an earlier action is lethal', () => {
    let state = createCombat(12);
    state = finish(state);
    state = finish(state);
    state = finish(state);
    state.actors.guard.hp = 6;
    const lethal = { uid: 'lethal-hammer', definitionId: 'hammer', owner: 'bob' as const };
    state.hand.push(lethal);
    expect(queueCard(state, lethal.uid, 'guard', 4).ok).toBe(true);

    const steps = resolveTurn(state);
    expect(steps.flatMap(step => step.events).some(event => event.kind === 'heal')).toBe(false);
    expect(steps.flatMap(step => step.events).filter(event => event.kind === 'action').map(event => event.actor))
      .toEqual(['bob']);
    expect(steps[steps.length - 1].state).toMatchObject({
      phase: 'victory',
      actors: { guard: { hp: 0 } },
    });
  });

  test('enemy Exposed persists across turn cleanup and is consumed by the next incoming hit', () => {
    let state = finish(createCombat(12));
    state = finish(state);
    expect(state).toMatchObject({
      turn: 3,
      actors: { bob: { hp: 34, exposed: 4 } },
    });

    const steps = resolveTurn(state);
    const damage = steps.flatMap(step => step.events).find(event => event.kind === 'damage');
    expect(damage).toMatchObject({ actor: 'guard', target: 'bob', amount: 16 });
    expect(steps[steps.length - 1].state.actors.bob).toMatchObject({ hp: 18, exposed: 0 });
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

  test('cleanup reports a discard followed by a redraw even when the same UID returns', () => {
    const state = createCombat(12);
    state.hand = [{ uid: 'recycled-vest', definitionId: 'vest', owner: 'bob' }];
    state.drawPile = [];
    state.discardPile = [];
    state.actors.bob.drawCount = 1;
    const before = structuredClone(state);
    const steps = resolveTurn(state);
    const cleanup = steps[steps.length - 1];
    const movements = cleanup.events.filter(event => event.kind === 'discard' || event.kind === 'draw');
    expect(movements.map(event => event.kind)).toEqual(['discard', 'draw']);
    expect(movements.map(event => event.cards?.map(card => card.uid)))
      .toEqual([['recycled-vest'], ['recycled-vest']]);
    expect(cleanup.state.hand.map(card => card.uid)).toEqual(['recycled-vest']);
    expect(cleanup.state.discardPile).toEqual([]);
    movements[0].cards![0].definitionId = 'hammer';
    expect(movements[1].cards![0].definitionId).toBe('vest');
    expect(cleanup.state.hand[0].definitionId).toBe('vest');
    expect(state).toEqual(before);
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

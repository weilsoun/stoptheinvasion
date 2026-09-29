import { describe, expect, test } from 'bun:test';
import {
  createWorld,
  establishCheckpoint,
  legalTargets,
  projectEnemyTicks,
  rewindTargets,
  stepWorld,
} from '../src/game/combat';
import type { CardInstance, WorldState } from '../src/game/types';

function deck(...definitionIds: string[]): CardInstance[] {
  return definitionIds.map((definitionId, index) => ({ uid: `temporal-${index}-${definitionId}`, definitionId, owner: 'bob' }));
}

function card(state: WorldState, definitionId: string): CardInstance {
  const found = state.hand.find((candidate) => candidate.definitionId === definitionId);
  if (!found) throw new Error(`Missing ${definitionId}`);
  return found;
}

function adjacentSecurity(state: WorldState): void {
  for (const enemy of state.enemies) {
    if (enemy.id !== 'security') {
      enemy.hp = 0;
      state.completedEncounters.push(enemy.encounterId);
    }
  }
  state.pendingRewards = [];
  const enemy = state.enemies.find((candidate) => candidate.id === 'security')!;
  enemy.position = { x: state.player.position.x, y: state.player.position.y - 1 };
  enemy.aware = true;
}

describe('whole-tick temporal modes', () => {
  test('stretch requires two complete ticks per canonical enemy action', () => {
    const state = createWorld(20, deck('overtime'));
    adjacentSecurity(state);
    const overtime = card(state, 'overtime');

    expect(stepWorld(state, { kind: 'play', uid: overtime.uid }).ok).toBe(true);
    expect(state.tick).toBe(1);
    expect(state.player.hp).toBe(state.player.maxHp);
    expect(state.enemies.find((enemy) => enemy.id === 'security')!.actionProgress).toBe(1);
    expect(stepWorld(state, { kind: 'wait' }).ok).toBe(true);
    expect(state.player.hp).toBe(state.player.maxHp - 6);
  });

  test('compress records both ordered subactions without losing either card', () => {
    const state = createWorld(21, deck('clockout'));
    adjacentSecurity(state);
    const clockout = card(state, 'clockout');

    expect(stepWorld(state, { kind: 'play', uid: clockout.uid }).ok).toBe(true);
    const enemyCards = state.history.at(-1)!.cards.filter((entry) => entry.kind === 'enemy');
    expect(enemyCards.map((entry) => entry.definition?.name)).toEqual(['Receipt Check', 'Marked for Review']);
    expect(state.player.hp).toBe(state.player.maxHp - 6);
    expect(state.player.exposed).toBe(2);
  });

  test('switching time modes resets partial action progress', () => {
    const state = createWorld(22, deck('clockout'));
    adjacentSecurity(state);
    const enemy = state.enemies.find((candidate) => candidate.id === 'security')!;
    enemy.actionProgress = 1;
    state.timeMode = 'stretch';
    state.timeExpires = 9;
    expect(stepWorld(state, { kind: 'play', uid: card(state, 'clockout').uid }).ok).toBe(true);
    expect(state.enemies.find((candidate) => candidate.id === 'security')!.actionProgress).toBe(0);
    expect(state.history.at(-1)!.cards.filter((entry) => entry.kind === 'enemy')).toHaveLength(2);
  });

  test('idle projections begin Bob actions exactly as real waits do', () => {
    const state = createWorld(23);
    adjacentSecurity(state);
    state.player.block = 6;
    const projection = projectEnemyTicks(state, 1);
    const damage = projection.flatMap((entry) => entry.events).find((event) => event.kind === 'damage');
    expect(damage?.amount).toBe(6);
  });
});

describe('temporal inventory identity', () => {
  test('paid retention preserves the exact played UID and skips its replacement', () => {
    const state = createWorld(24, deck('receipt', 'vest', 'hammer'));
    const receipt = card(state, 'receipt');
    const vest = card(state, 'vest');
    expect(stepWorld(state, { kind: 'play', uid: receipt.uid, targetId: vest.uid }).ok).toBe(true);
    const handSize = state.hand.length;
    expect(stepWorld(state, { kind: 'play', uid: vest.uid }).ok).toBe(true);
    expect(state.hand.some((candidate) => candidate.uid === vest.uid)).toBe(true);
    expect(state.hand).toHaveLength(handSize);
    expect(state.retainedUids).not.toContain(vest.uid);
  });

  test('Borrow exhausts its source and repays exact future replacement draws', () => {
    const state = createWorld(25, deck('borrow', 'vest', 'coffee', 'hardhat', 'quickfix'));
    const extras = deck('hammer', 'precision');
    state.deck.push(...extras.map((candidate) => ({ ...candidate })));
    state.drawPile.push(...extras.map((candidate) => ({ ...candidate })));
    const source = card(state, 'borrow');
    const before = state.hand.length;
    expect(stepWorld(state, { kind: 'play', uid: source.uid }).ok).toBe(true);
    expect(state.exhaustPile.map((candidate) => candidate.uid)).toContain(source.uid);
    expect(state.hand.length).toBe(before + 1);
    expect(state.drawDebt).toBe(1);
    const next = state.hand.find((candidate) => candidate.definitionId !== 'borrow')!;
    expect(stepWorld(state, { kind: 'play', uid: next.uid }).ok).toBe(true);
    expect(state.drawDebt).toBe(0);
  });

  test('Echo repeats an eligible original occurrence once', () => {
    const state = createWorld(26, deck('hammer', 'echo'));
    adjacentSecurity(state);
    state.player.energy = state.player.energyMax;
    const enemy = state.enemies.find((candidate) => candidate.id === 'security')!;
    expect(stepWorld(state, { kind: 'play', uid: card(state, 'hammer').uid, targetId: enemy.id }).ok).toBe(true);
    const echo = card(state, 'echo');
    const [sourceId] = legalTargets(state, echo.uid);
    expect(sourceId).toBeTruthy();
    const hp = state.enemies.find((candidate) => candidate.id === 'security')!.hp;
    expect(stepWorld(state, { kind: 'play', uid: echo.uid, sourceId }).ok).toBe(true);
    expect(state.enemies.find((candidate) => candidate.id === 'security')!.hp).toBe(hp - 6);
    expect(state.echoUsed).toContain(sourceId);
  });

  test('Echo rejects an ambiguous current target without mutating the world', () => {
    const state = createWorld(260, deck('hammer', 'echo'));
    adjacentSecurity(state);
    const security = state.enemies.find((candidate) => candidate.id === 'security')!;
    const checkout = state.enemies.find((candidate) => candidate.id === 'checkout')!;
    checkout.hp = checkout.maxHp;
    checkout.position = { x: state.player.position.x + 1, y: state.player.position.y };
    checkout.aware = true;
    state.completedEncounters = state.completedEncounters.filter((id) => id !== checkout.encounterId);
    state.player.energy = state.player.energyMax;
    expect(stepWorld(state, { kind: 'play', uid: card(state, 'hammer').uid, targetId: security.id }).ok).toBe(true);
    const echo = card(state, 'echo');
    const [sourceId] = legalTargets(state, echo.uid);
    const before = structuredClone(state);
    expect(stepWorld(state, { kind: 'play', uid: echo.uid, sourceId })).toEqual({ ok: false, reason: 'Choose an Echo target.', events: [] });
    expect(state).toEqual(before);
  });
});

describe('snapshot rewind', () => {
  test('rewind restores full mutable state, discards future, and spends charge irreversibly', () => {
    const state = createWorld(27, deck('reclaim', 'coffee'));
    const initialHand = state.hand.map((candidate) => candidate.uid);
    expect(stepWorld(state, { kind: 'wait' }).ok).toBe(true);
    expect(stepWorld(state, { kind: 'move', direction: 'up' }).ok).toBe(true);
    expect(rewindTargets(state)).toContain(0);
    const reclaim = card(state, 'reclaim');

    expect(stepWorld(state, { kind: 'play', uid: reclaim.uid, sourceId: '0' }).ok).toBe(true);
    expect(state.tick).toBe(0);
    expect(state.player.position).toEqual(state.map.start);
    expect(state.rewindCharges).toBe(0);
    expect(state.exhaustedByRewind).toEqual([reclaim.uid]);
    expect(state.exhaustPile.map((candidate) => candidate.uid)).toContain(reclaim.uid);
    expect(state.hand.map((candidate) => candidate.uid).filter((uid) => uid !== reclaim.uid)).toEqual(initialHand.filter((uid) => uid !== reclaim.uid));
    expect(state.history.some((entry) => entry.tick > 0)).toBe(false);
  });

  test('failed rewind commands are pure and checkpoints reset provenance', () => {
    const state = createWorld(28);
    const before = structuredClone(state);
    expect(stepWorld(state, { kind: 'rewind', tick: -1 }).ok).toBe(false);
    expect(state).toEqual(before);
    state.rewindCharges = 0;
    state.exhaustedByRewind = ['old-source'];
    establishCheckpoint(state);
    expect(state.rewindCharges).toBe(1);
    expect(state.exhaustedByRewind).toEqual([]);
    expect(state.checkpoints.map((checkpoint) => checkpoint.tick)).toEqual([state.tick]);
  });

  test('reward and service phases cannot rewind, while defeat can', () => {
    const state = createWorld(29);
    expect(stepWorld(state, { kind: 'wait' }).ok).toBe(true);
    state.phase = 'reward';
    expect(stepWorld(state, { kind: 'rewind', tick: 0 }).ok).toBe(false);
    state.phase = 'defeat';
    expect(stepWorld(state, { kind: 'rewind', tick: 0 }).ok).toBe(true);
  });
});

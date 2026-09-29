import { describe, expect, test } from 'bun:test';
import {
  availableEnergy,
  createWorld,
  effectiveCard,
  enemyCard,
  legalTargets,
  nearbyObjects,
  projectEnemyTicks,
  stepWorld,
  visibleEnemies,
  visibleObjects,
} from '../src/game/combat';
import type { CardInstance, WorldState } from '../src/game/types';

function deck(...definitionIds: string[]): CardInstance[] {
  return definitionIds.map((definitionId, index) => ({ uid: `card-${index}-${definitionId}`, definitionId, owner: 'bob' }));
}

function isolate(state: WorldState, enemyId = 'security'): void {
  for (const enemy of state.enemies) {
    if (enemy.id !== enemyId) {
      enemy.hp = 0;
      if (!state.completedEncounters.includes(enemy.encounterId)) state.completedEncounters.push(enemy.encounterId);
    }
  }
  state.pendingRewards = [];
}

function handCard(state: WorldState, definitionId: string): CardInstance {
  const card = state.hand.find((candidate) => candidate.definitionId === definitionId);
  if (!card) throw new Error(`Missing ${definitionId}`);
  return card;
}

describe('deterministic walkable world', () => {
  test('same seed preserves shuffled identities and independent state', () => {
    const first = createWorld(91);
    const second = createWorld(91);
    expect(first.hand).toEqual(second.hand);
    expect(first.drawPile).toEqual(second.drawPile);
    expect(first.player.position).not.toBe(first.map.start);
    first.hand[0].definitionId = 'heavy';
    expect(second.hand[0].definitionId).not.toBe('heavy');
  });

  test('blocked movement fails atomically without facing or tick changes', () => {
    const state = createWorld(1);
    state.player.position = { x: 1, y: 1 };
    state.player.facing = 'right';
    const before = structuredClone(state);
    expect(stepWorld(state, { kind: 'move', direction: 'left' })).toEqual({ ok: false, reason: 'That tile is blocked.', events: [] });
    expect(state).toEqual(before);
  });

  test('aware enemies arrive by exact cardinal chase steps before attacking', () => {
    const state = createWorld(2);
    isolate(state);
    const enemy = state.enemies.find((candidate) => candidate.id === 'security')!;
    enemy.position = { x: state.player.position.x, y: state.player.position.y - 2 };
    enemy.aware = true;

    expect(stepWorld(state, { kind: 'wait' }).ok).toBe(true);
    expect(state.enemies.find((candidate) => candidate.id === 'security')!.position).toEqual({ x: state.player.position.x, y: state.player.position.y - 1 });
    expect(state.player.hp).toBe(state.player.maxHp);
    expect(stepWorld(state, { kind: 'wait' }).ok).toBe(true);
    expect(state.player.hp).toBe(state.player.maxHp - 6);
  });

  test('player effects resolve first and lethal damage cancels compressed enemy subactions', () => {
    const state = createWorld(3, deck('hammer'));
    isolate(state);
    const enemy = state.enemies.find((candidate) => candidate.id === 'security')!;
    enemy.position = { x: state.player.position.x, y: state.player.position.y - 1 };
    enemy.hp = 6;
    enemy.aware = true;
    state.timeMode = 'compress';
    state.timeExpires = 4;
    const hammer = handCard(state, 'hammer');

    const result = stepWorld(state, { kind: 'play', uid: hammer.uid, targetId: enemy.id });
    expect(result.ok).toBe(true);
    expect(state.enemies.find((candidate) => candidate.id === 'security')!.hp).toBe(0);
    expect(state.player.hp).toBe(state.player.maxHp);
    expect(state.history.at(-1)!.cards.filter((card) => card.kind === 'enemy')).toHaveLength(0);
    expect(state.pendingRewards).toEqual(['security']);
  });

  test('a spent physical card is individually replaced and stored energy caps', () => {
    const state = createWorld(4, deck('vest'));
    const card = handCard(state, 'vest');
    state.player.energy = state.player.energyMax;
    const result = stepWorld(state, { kind: 'play', uid: card.uid });
    expect(result.ok).toBe(true);
    expect(result.events.filter((event) => event.kind === 'draw').every((event) => event.tick === state.tick)).toBe(true);
    expect(state.hand.map((candidate) => candidate.uid)).toEqual([card.uid]);
    expect(state.player.energy).toBe(state.player.energyMax);
    expect(availableEnergy(state)).toBe(state.player.energyMax);
  });

  test('a grade binds one exact UID and is applied once in base-plus-level history', () => {
    const state = createWorld(5, deck('reinforce', 'hammer', 'weaken'));
    isolate(state);
    const enemy = state.enemies.find((candidate) => candidate.id === 'security')!;
    enemy.position = { x: state.player.position.x, y: state.player.position.y - 1 };
    enemy.aware = true;
    const reinforce = handCard(state, 'reinforce');
    const hammer = handCard(state, 'hammer');
    expect(legalTargets(state, reinforce.uid)).toContain(hammer.uid);
    expect(stepWorld(state, { kind: 'play', uid: reinforce.uid, targetId: hammer.uid }).ok).toBe(true);
    expect(effectiveCard(state, hammer.uid).effects[0].amount).toBe(10);
    const hp = state.enemies.find((candidate) => candidate.id === 'security')!.hp;
    expect(stepWorld(state, { kind: 'play', uid: hammer.uid, targetId: enemy.id }).ok).toBe(true);
    const occurrence = state.history.at(-1)!.cards.find((candidate) => candidate.sourceUid === hammer.uid)!;
    expect(occurrence.definition!.effects[0].amount).toBe(6);
    expect(occurrence.upgradeLevel).toBe(1);
    expect(state.enemies.find((candidate) => candidate.id === 'security')!.hp).toBe(hp - 10);
  });

  test('visibility does not expose distant actors and objects remain real map entities', () => {
    const state = createWorld(6);
    expect(visibleEnemies(state)).toHaveLength(0);
    expect(visibleObjects(state).every((object) => !state.usedObjectIds.includes(object.id))).toBe(true);
    expect(nearbyObjects(state)).toHaveLength(0);
    const before = structuredClone(state);
    expect(projectEnemyTicks(state, 6)).toEqual([]);
    expect(state).toEqual(before);
  });

  test('aware off-screen pursuit stays truthful without leaking actor identity', () => {
    const state = createWorld(61);
    isolate(state);
    const enemy = state.enemies.find((candidate) => candidate.id === 'security')!;
    enemy.position = { x: state.player.position.x + 10, y: state.player.position.y };
    enemy.aware = true;
    const result = stepWorld(state, { kind: 'wait' });
    const hidden = result.events.find((event) => event.actor === enemy.id);
    expect(hidden?.visible).toBe(false);
    expect(state.history.at(-1)!.cards.some((entry) => entry.entityId === enemy.id)).toBe(false);
    expect(state.log.some((message) => message.includes(enemy.name))).toBe(false);
  });

  test('canonical projection and actual stepping share enemy action identity', () => {
    const state = createWorld(7);
    isolate(state);
    const enemy = state.enemies.find((candidate) => candidate.id === 'security')!;
    enemy.position = { x: state.player.position.x, y: state.player.position.y - 1 };
    enemy.aware = true;
    expect(enemyCard(state, enemy.id).name).toBe('Receipt Check');
    const projected = projectEnemyTicks(state, 1);
    const actual = structuredClone(state);
    expect(stepWorld(actual, { kind: 'wait' }).ok).toBe(true);
    const actualEnemy = actual.history.at(-1)!.cards.find((card) => card.kind === 'enemy')!;
    expect(projected.map((card) => [card.definition?.id, card.events.map((event) => event.kind)])).toEqual([
      [actualEnemy.definition?.id, actualEnemy.events.map((event) => event.kind)],
    ]);
  });
});

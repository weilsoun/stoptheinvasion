import { describe, expect, test } from 'bun:test';
import { createWorld, effectiveCard, stepWorld } from '../src/game/combat';
import { CARDS } from '../src/game/content';
import { applyForecast, forecastCard, forecastEvents, forecastTimeline } from '../src/game/forecast';
import type { CardInstance, TimelineCard, WorldEnemy, WorldState } from '../src/game/types';
import { applyUpgrade } from '../src/game/upgrades';

function worldWith(...definitionIds: string[]): WorldState {
  const fillers = ['hardhat', 'vest', 'precision', 'coffee', 'hammer'];
  const ids = [...definitionIds, ...fillers].slice(0, 5);
  const deck: CardInstance[] = ids.map((definitionId, index) => ({
    uid: `forecast-${index}-${definitionId}`,
    definitionId,
    owner: 'bob',
  }));
  return createWorld(701, deck);
}

function card(state: WorldState, definitionId: string): CardInstance {
  const value = state.hand.find((candidate) => candidate.definitionId === definitionId);
  if (!value) throw new Error(`Missing test card ${definitionId}`);
  return value;
}

function security(state: WorldState, x: number, y: number): WorldEnemy {
  const enemy = state.enemies.find((candidate) => candidate.id === 'security');
  if (!enemy) throw new Error('Missing Security');
  state.player.position = { x: 4, y: 32 };
  enemy.position = { x, y };
  enemy.aware = true;
  return enemy;
}

function firstAttack(cards: readonly TimelineCard[], enemyId = 'security'): TimelineCard {
  const value = cards.find((candidate) => candidate.entityId === enemyId && candidate.definition !== null);
  if (!value) throw new Error(`Missing projected attack for ${enemyId}`);
  return value;
}

describe('world timeline forecast', () => {
  test('retreat/follow preserves relative chase ETA while waiting advances the attack toward NOW', () => {
    const retreat = worldWith();
    security(retreat, 6, 32);
    const before = structuredClone(retreat);
    const originalEta = firstAttack(forecastTimeline(retreat)).tick - retreat.tick;
    expect(retreat).toEqual(before);
    expect(originalEta).toBe(2);

    expect(stepWorld(retreat, { kind: 'move', direction: 'left' }).ok).toBe(true);
    expect(retreat.enemies.find((enemy) => enemy.id === 'security')?.position).toEqual({ x: 5, y: 32 });
    expect(firstAttack(forecastTimeline(retreat)).tick - retreat.tick).toBe(originalEta);

    const idle = worldWith();
    security(idle, 6, 32);
    const attackTick = firstAttack(forecastTimeline(idle)).tick;
    expect(stepWorld(idle, { kind: 'wait' }).ok).toBe(true);
    expect(firstAttack(forecastTimeline(idle)).tick).toBe(attackTick);
    expect(attackTick - idle.tick).toBe(1);
  });

  test('concealed enemies and objects outside current visibility do not leak into the timeline', () => {
    const state = worldWith();
    const hidden = state.enemies.find((enemy) => enemy.id === 'security')!;
    hidden.aware = true;

    const cards = forecastTimeline(state);

    expect(cards.some((entry) => entry.entityId === hidden.id)).toBe(false);
    expect(cards.some((entry) => entry.entityId === 'break-room')).toBe(false);
    expect(cards.find((entry) => entry.entityId === 'entrance-potion')?.definition?.description)
      .toContain('Collect a potion');
    expect(state.deck.some((entry) => entry.definitionId.startsWith('item:'))).toBe(false);
  });

  test('compressed canonical pursuit keeps both basic actions on their real tick', () => {
    const state = worldWith('clockout');
    security(state, 8, 32);
    const clockout = card(state, 'clockout');

    expect(stepWorld(state, { kind: 'play', uid: clockout.uid }).ok).toBe(true);
    expect(state.timeMode).toBe('compress');
    const projected = forecastTimeline(state);
    const atNextTick = projected.filter((entry) => entry.entityId === 'security' && entry.tick === state.tick + 1);

    expect(atNextTick).toHaveLength(2);
    expect(atNextTick[0].definition).toBeNull();
    expect(atNextTick[1].definition?.name).toBe('Receipt Check');
  });

  test('visible object paths end beside furniture and do not displace same-tick enemy cards', () => {
    const stacked = worldWith();
    const enemy = security(stacked, 5, 31);
    stacked.player.position = { x: 5, y: 30 };
    const before = structuredClone(stacked);
    const cards = forecastTimeline(stacked, 2);
    const potion = cards.find((entry) => entry.entityId === 'entrance-potion');
    const attack = firstAttack(cards, enemy.id);

    expect(potion?.tick).toBe(stacked.tick + 1);
    expect(attack.tick).toBe(stacked.tick + 1);
    expect(cards.filter((entry) => entry.tick === stacked.tick + 1)).toHaveLength(2);
    expect(stacked).toEqual(before);

    const table = worldWith();
    table.player.position = { x: 5, y: 19 };
    const serviceTick = forecastTimeline(table, 4).find((entry) => entry.entityId === 'break-room')?.tick;
    expect(serviceTick).toBe(table.tick + 2);
    expect(stepWorld(table, { kind: 'wait' }).ok).toBe(true);
    expect(forecastTimeline(table, 4).find((entry) => entry.entityId === 'break-room')?.tick).toBe(serviceTick! + 1);
  });
});

describe('world card forecast', () => {
  test('ordered Exposed, Block, multi-hit damage, and heal caps use resolved net amounts', () => {
    const attackState = worldWith('doubletap');
    const enemy = security(attackState, 5, 32);
    enemy.block = 5;
    enemy.exposed = 8;
    const attack = card(attackState, 'doubletap');
    const before = structuredClone(attackState);

    expect(forecastCard(attackState, attack.uid, enemy.id)).toEqual({ amounts: [6, 3], canceled: false });
    expect(attackState).toEqual(before);

    const healing = worldWith('quickfix');
    healing.player.hp = healing.player.maxHp - 2;
    const quickfix = card(healing, 'quickfix');
    expect(forecastCard(healing, quickfix.uid)).toEqual({ amounts: [2], canceled: false });
  });

  test('Ringing keeps the spent action as a canceled zero forecast', () => {
    const state = worldWith('hammer');
    const enemy = security(state, 5, 32);
    state.player.ringing = true;
    const hammer = card(state, 'hammer');

    expect(forecastCard(state, hammer.uid, enemy.id)).toEqual({ amounts: [0], canceled: true });
  });

  test('an actual upgrade command is applied once in forecast text without mutating definitions', () => {
    const state = worldWith('reinforce', 'doubletap');
    const enemy = security(state, 6, 32);
    const upgrade = card(state, 'reinforce');
    const attack = card(state, 'doubletap');
    expect(stepWorld(state, { kind: 'play', uid: upgrade.uid, targetId: attack.uid }).ok).toBe(true);
    const before = structuredClone(state);
    const catalogBefore = structuredClone(CARDS.doubletap);

    const forecast = forecastCard(state, attack.uid, enemy.id)!;
    const graded = effectiveCard(state, attack.uid);
    const rendered = applyForecast(graded, forecast);

    expect(forecast.amounts).toEqual([5, 5]);
    expect(rendered.effects.map((effect) => effect.amount)).toEqual([5, 5]);
    expect(rendered.description.match(/\d+/g)).toEqual(['5', '5']);
    rendered.effects[0].amount = 999;
    expect(graded.effects.map((effect) => effect.amount)).toEqual([5, 5]);
    expect(CARDS.doubletap).toEqual(catalogBefore);
    expect(state).toEqual(before);
  });

  test('lethal critical damage reports the hp loss and zeroes its skipped rider', () => {
    const state = worldWith('finisher');
    const enemy = security(state, 5, 32);
    enemy.hp = 2;
    enemy.exposed = 8;
    state.player.hp = state.player.maxHp - 6;
    const finisher = card(state, 'finisher');

    const forecast = forecastCard(state, finisher.uid, enemy.id)!;
    expect(forecast).toEqual({ amounts: [2], criticalAmounts: [0], canceled: false });
    const rendered = applyForecast(effectiveCard(state, finisher.uid), forecast);
    expect(rendered.description.match(/\d+/g)).toEqual(['2', '0']);
  });

  test('authored enemy actions retain independent grades until their real attack', () => {
    const state = worldWith('weaken');
    const enemy = security(state, 6, 32);
    const weaken = card(state, 'weaken');
    expect(stepWorld(state, { kind: 'play', uid: weaken.uid, targetId: enemy.id }).ok).toBe(true);

    const attack = firstAttack(forecastTimeline(state));
    expect(attack.definition?.name).toBe('Receipt Check');
    expect(attack.definition?.effects[0].amount).toBe(6);
    expect(attack.upgradeLevel).toBe(-1);
    expect(attack.events.find((event) => event.kind === 'damage')?.amount).toBe(2);
  });

  test('printed enemy forecasts include resolved Exposed damage without grading twice', () => {
    const state = worldWith();
    const enemy = security(state, 5, 32);
    enemy.upgradeLevel = 1;
    state.player.exposed = 2;
    const before = structuredClone(state);
    const attack = firstAttack(forecastTimeline(state));
    const printed = applyForecast(
      applyUpgrade(attack.definition!, attack.upgradeLevel),
      forecastEvents(attack.definition!, attack.events, attack.canceled),
    );

    expect(state).toEqual(before);
    expect(printed.effects[0].amount).toBe(12);
    expect(stepWorld(state, { kind: 'wait' }).ok).toBe(true);
    expect(before.player.hp - state.player.hp).toBe(printed.effects[0].amount);
    expect(attack.definition!.effects[0].amount).toBe(6);
  });

  test('rewind cards validate their fixed authored source window without mutating snapshots', () => {
    const state = worldWith('reclaim');
    const rewind = card(state, 'reclaim');
    expect(stepWorld(state, { kind: 'wait' }).ok).toBe(true);
    const before = structuredClone(state);

    expect(forecastCard(state, rewind.uid, undefined, '999')).toBeNull();
    const forecast = forecastCard(state, rewind.uid, undefined, '0');
    expect(forecast).toEqual({ amounts: [], canceled: false });
    const rendered = applyForecast(effectiveCard(state, rewind.uid), forecast!);
    expect(rendered.time).toEqual({ kind: 'rewind', amount: 8 });
    expect(rendered.description).toContain('8 ticks');
    expect(state).toEqual(before);
  });

  test('authored time upgrades render once and project through their real command', () => {
    const state = worldWith('reinforce', 'overtime');
    const upgrade = card(state, 'reinforce');
    const overtime = card(state, 'overtime');
    expect(stepWorld(state, { kind: 'play', uid: upgrade.uid, targetId: overtime.uid }).ok).toBe(true);

    const forecast = forecastCard(state, overtime.uid);
    expect(forecast).toEqual({ amounts: [], canceled: false });
    const rendered = applyForecast(effectiveCard(state, overtime.uid), forecast!);
    expect(rendered.time).toEqual({ kind: 'stretch', amount: 5 });
    expect(rendered.description).toContain('5 ticks');
  });

  test('Echo keeps historical source and live enemy target independent', () => {
    const state = worldWith('hammer', 'echo');
    const enemy = security(state, 5, 32);
    const hammer = card(state, 'hammer');
    const echo = card(state, 'echo');
    expect(stepWorld(state, { kind: 'play', uid: hammer.uid, targetId: enemy.id }).ok).toBe(true);
    const sourceId = state.history.at(-1)!.cards.find((entry) => entry.sourceUid === hammer.uid)!.id;
    const before = structuredClone(state);

    expect(forecastCard(state, echo.uid, enemy.id, sourceId)).toEqual({ amounts: [], canceled: false });
    expect(state).toEqual(before);
  });

  test('invalid commands and mismatched forecast shapes fail without leaking future draws', () => {
    const state = worldWith('toolbox', 'hammer');
    const enemy = security(state, 7, 32);
    const toolbox = card(state, 'toolbox');
    const hammer = card(state, 'hammer');
    const before = structuredClone(state);

    expect(forecastCard(state, 'missing')).toBeNull();
    expect(forecastCard(state, hammer.uid, enemy.id)).toBeNull();
    expect(forecastCard(state, toolbox.uid, undefined, '0')).toBeNull();
    expect(Object.keys(forecastCard(state, toolbox.uid)!)).toEqual(['amounts', 'canceled']);
    expect(state).toEqual(before);
    expect(() => forecastTimeline(state, 1.5)).toThrow('Forecast horizon');
    expect(() => applyForecast(CARDS.hammer, { amounts: [], canceled: false })).toThrow('effect count');
    expect(() => applyForecast(CARDS.hammer, { amounts: [6], criticalAmounts: [], canceled: false })).toThrow('critical effect count');
  });
});

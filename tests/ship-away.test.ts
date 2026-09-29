import { describe, expect, test } from 'bun:test';
import { createAwayBattle, stepAway } from '../src/ship/away';
import { AWAY_MISSIONS, EXPEDITION_RULES } from '../src/ship/expedition-content';
import type { AwayBattleEvent, AwayBattleState, AwayMission, CrewMember } from '../src/ship/expedition-types';

function member(id: CrewMember['id'], level: CrewMember['level'] = 1): CrewMember {
  return { id, level, cardUid: `card-${id}` };
}

function mission(enemies: AwayMission['enemies']): AwayMission {
  return {
    id: 'test-mission',
    title: 'Test Mission',
    description: 'A deterministic test encounter.',
    diplomacyRequired: 0,
    diplomacyCost: 0,
    enemies,
  };
}

function advanceToEnd(crew: readonly CrewMember[], source: AwayMission): { events: AwayBattleEvent[]; state: AwayBattleState } {
  const state = createAwayBattle(crew, source);
  const events: AwayBattleEvent[] = [];
  for (let step = 0; state.phase === 'playing' && step < 500; step += 1) {
    const result = stepAway(state);
    expect(result.ok).toBe(true);
    if (!result.ok) break;
    expect(result.events[0]?.type).toBe('action');
    expect(result.events.some(event => event.type === 'damage' || event.type === 'guard' || event.type === 'heal')).toBe(true);
    events.push(...result.events);
  }
  expect(state.phase).not.toBe('playing');
  return { events, state };
}

describe('away battle creation', () => {
  test('orders speed ties by crew side and original formation without changing front targeting', () => {
    const source = mission([
      { id: 'tie-enemy', name: 'Tie Enemy', appearance: 'drone', hp: 30, attack: 2, speed: 4 },
      { id: 'slow-enemy', name: 'Slow Enemy', appearance: 'warden', hp: 30, attack: 2, speed: 1 },
    ]);
    const state = createAwayBattle([member('sen'), member('vale')], source);

    expect(state.order).toEqual(['sen', 'vale', 'tie-enemy', 'slow-enemy']);
    const result = stepAway(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events.slice(0, 2).map(event => [event.type, event.actorId, event.targetId])).toEqual([
      ['action', 'sen', 'tie-enemy'],
      ['damage', 'sen', 'tie-enemy'],
    ]);
    expect(state.units.find(unit => unit.id === 'tie-enemy')?.hp).toBe(27);
  });

  test('uses selected formation for the front living crew target', () => {
    const state = createAwayBattle([member('sen'), member('rex')], mission([
      { id: 'fast', name: 'Fast Sentry', appearance: 'stalker', hp: 20, attack: 4, speed: 9 },
    ]));
    const result = stepAway(state);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events[0]).toMatchObject({ type: 'action', actorId: 'fast', targetId: 'sen' });
    expect(result.events[1]).toMatchObject({ type: 'damage', targetId: 'sen', amount: 4, hp: 12, guard: 0 });
  });

  test('rejects invalid teams and malformed missions without mutating callers', () => {
    const crew = [member('vale')];
    const source = mission([{ id: 'sentry', name: 'Sentry', appearance: 'drone', hp: 10, attack: 2, speed: 2 }]);
    const crewBefore = structuredClone(crew);
    const missionBefore = structuredClone(source);
    const invalidTeams: unknown[] = [
      [],
      [member('vale'), member('vale')],
      [member('vale'), member('iona'), member('rex'), member('sen')],
      [{ ...member('vale'), id: 'unknown' }],
      [{ ...member('vale'), level: 0 }],
      [{ ...member('vale'), level: 4 }],
      [{ ...member('vale'), level: 1.5 }],
    ];
    for (const candidate of invalidTeams) {
      expect(() => createAwayBattle(candidate as CrewMember[], source)).toThrow(TypeError);
    }

    const invalidMissions: AwayMission[] = [
      { ...source, id: '' },
      { ...source, diplomacyCost: -1 },
      { ...source, enemies: [] },
      { ...source, enemies: [{ ...source.enemies[0]!, hp: 0 }] },
      { ...source, enemies: [{ ...source.enemies[0]!, attack: 0 }] },
      { ...source, enemies: [{ ...source.enemies[0]!, speed: Number.NaN }] },
      { ...source, enemies: [source.enemies[0]!, { ...source.enemies[0]! }] },
      { ...source, enemies: [{ ...source.enemies[0]!, id: 'vale' }] },
    ];
    for (const candidate of invalidMissions) {
      expect(() => createAwayBattle(crew, candidate)).toThrow(TypeError);
    }
    expect(crew).toEqual(crewBefore);
    expect(source).toEqual(missionBefore);
  });

  test('copies source graphs and creates independent sibling branches', () => {
    const crew = [member('vale')];
    const source = mission([{ id: 'sentry', name: 'Sentry', appearance: 'drone', hp: 20, attack: 2, speed: 2 }]);
    const first = createAwayBattle(crew, source);
    const second = createAwayBattle(crew, source);

    crew[0]!.level = 3;
    source.enemies[0]!.hp = 1;
    expect(first).toEqual(second);
    expect(first.units).not.toBe(second.units);
    expect(first.units[0]).not.toBe(second.units[0]);
    expect(first.order).not.toBe(second.order);

    expect(stepAway(first).ok).toBe(true);
    expect(first).not.toEqual(second);
    expect(second.units.find(unit => unit.id === 'sentry')?.hp).toBe(20);
  });
});

describe('away actions and outcomes', () => {
  test('uses two basic attacks before Rex replaces his third personal action with two ordered hits', () => {
    const state = createAwayBattle([member('rex')], mission([
      { id: 'target', name: 'Target', appearance: 'warden', hp: 40, attack: 1, speed: 1 },
    ]));

    const first = stepAway(state);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.events.slice(0, 2).map(event => [event.type, event.amount])).toEqual([
      ['action', undefined],
      ['damage', 6],
    ]);
    expect(stepAway(state).ok).toBe(true);

    const second = stepAway(state);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.events[1]).toMatchObject({ type: 'damage', amount: 6 });
    expect(stepAway(state).ok).toBe(true);

    const third = stepAway(state);
    expect(third.ok).toBe(true);
    if (!third.ok) return;
    expect(third.events.map(event => [event.type, event.actorId, event.targetId, event.amount])).toEqual([
      ['action', 'rex', 'target', undefined],
      ['damage', 'rex', 'target', 4],
      ['damage', 'rex', 'target', 4],
    ]);
    expect(state.units.find(unit => unit.id === 'target')).toMatchObject({ hp: 20, guard: 0 });
    expect(state.units.find(unit => unit.id === 'rex')?.actionCount).toBe(3);
  });

  test('caps Vale Guard and records each resulting target snapshot in formation order', () => {
    const state = createAwayBattle([member('vale'), member('iona'), member('sen')], mission([
      { id: 'sentry', name: 'Sentry', appearance: 'drone', hp: 40, attack: 1, speed: 1 },
    ]));
    const vale = state.units.find(unit => unit.id === 'vale')!;
    vale.actionCount = 2;
    for (const unit of state.units.filter(unit => unit.side === 'crew')) unit.guard = 5;

    const result = stepAway(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events.slice(1).map(event => [event.type, event.targetId, event.amount, event.guard])).toEqual([
      ['guard', 'vale', 1, EXPEDITION_RULES.awayGuardCap],
      ['guard', 'iona', 1, EXPEDITION_RULES.awayGuardCap],
      ['guard', 'sen', 1, EXPEDITION_RULES.awayGuardCap],
    ]);
  });

  test('Iona guards the front living formation member and respects the shared cap', () => {
    const state = createAwayBattle([member('vale'), member('sen'), member('iona')], mission([
      { id: 'sentry', name: 'Sentry', appearance: 'drone', hp: 40, attack: 1, speed: 1 },
    ]));
    state.units.find(unit => unit.id === 'vale')!.hp = 0;
    state.units.find(unit => unit.id === 'sen')!.guard = 4;
    state.units.find(unit => unit.id === 'iona')!.actionCount = 2;
    state.cursor = state.order.indexOf('iona');

    const result = stepAway(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events).toEqual([
      expect.objectContaining({ type: 'action', actorId: 'iona', targetId: 'sen' }),
      expect.objectContaining({ type: 'guard', targetId: 'sen', amount: 2, guard: EXPEDITION_RULES.awayGuardCap }),
    ]);
    expect(state.units.find(unit => unit.id === 'vale')?.guard).toBe(0);
  });

  test('Guard absorbs damage before HP and damage events carry post-hit snapshots', () => {
    const state = createAwayBattle([member('vale')], mission([
      { id: 'fast', name: 'Fast Sentry', appearance: 'stalker', hp: 20, attack: 5, speed: 9 },
    ]));
    state.units.find(unit => unit.id === 'vale')!.guard = 3;

    const result = stepAway(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events[1]).toMatchObject({
      type: 'damage',
      actorId: 'fast',
      targetId: 'vale',
      amount: 5,
      hp: 18,
      guard: 0,
    });
  });

  test('Sen heals the most injured living ally, caps healing, and never revives', () => {
    const state = createAwayBattle([member('sen'), member('vale'), member('iona')], mission([
      { id: 'sentry', name: 'Sentry', appearance: 'drone', hp: 40, attack: 1, speed: 1 },
    ]));
    state.units.find(unit => unit.id === 'sen')!.actionCount = 2;
    state.units.find(unit => unit.id === 'sen')!.hp = 12;
    state.units.find(unit => unit.id === 'vale')!.hp = 0;
    state.units.find(unit => unit.id === 'iona')!.hp = 13;

    const result = stepAway(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events[0]).toMatchObject({ type: 'action', actorId: 'sen', targetId: 'iona' });
    expect(result.events[1]).toMatchObject({ type: 'heal', targetId: 'iona', amount: 5, hp: 18 });
    expect(state.units.find(unit => unit.id === 'vale')?.hp).toBe(0);
  });

  test('breaks equal missing-HP healing ties by formation order', () => {
    const state = createAwayBattle([member('sen'), member('iona'), member('vale')], mission([
      { id: 'sentry', name: 'Sentry', appearance: 'drone', hp: 40, attack: 1, speed: 1 },
    ]));
    state.units.find(unit => unit.id === 'sen')!.actionCount = 2;
    state.units.find(unit => unit.id === 'sen')!.hp -= 4;
    state.units.find(unit => unit.id === 'iona')!.hp -= 4;

    const result = stepAway(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events[0]).toMatchObject({ targetId: 'sen' });
    expect(result.events[1]).toMatchObject({ type: 'heal', targetId: 'sen', amount: 4, hp: 16 });
  });

  test('skips dead initiative entries and suppresses Rex second hit after lethal damage', () => {
    const skipped = createAwayBattle([member('rex'), member('vale')], mission([
      { id: 'target', name: 'Target', appearance: 'drone', hp: 20, attack: 1, speed: 1 },
    ]));
    skipped.units.find(unit => unit.id === 'rex')!.hp = 0;
    const skippedResult = stepAway(skipped);
    expect(skippedResult.ok).toBe(true);
    if (!skippedResult.ok) return;
    expect(skippedResult.events[0]).toMatchObject({ type: 'action', actorId: 'vale' });
    expect(skipped.units.find(unit => unit.id === 'rex')?.actionCount).toBe(0);

    const lethal = createAwayBattle([member('rex')], mission([
      { id: 'fragile', name: 'Fragile Target', appearance: 'drone', hp: 3, attack: 1, speed: 1 },
    ]));
    lethal.units.find(unit => unit.id === 'rex')!.actionCount = 2;
    const lethalResult = stepAway(lethal);
    expect(lethalResult.ok).toBe(true);
    if (!lethalResult.ok) return;
    expect(lethalResult.events.map(event => event.type)).toEqual(['action', 'damage', 'victory']);
    expect(lethalResult.events[1]).toMatchObject({ amount: 3, hp: 0, guard: 0 });
    expect(lethal.phase).toBe('victory');

    const nonFinal = createAwayBattle([member('rex'), member('vale')], AWAY_MISSIONS.boreal!);
    for (let index = 0; index < 8; index += 1) expect(stepAway(nonFinal).ok).toBe(true);
    const ninth = stepAway(nonFinal);
    expect(ninth.ok).toBe(true);
    if (!ninth.ok) return;
    expect(ninth.events.map(event => [event.type, event.targetId, event.amount, event.hp])).toEqual([
      ['action', 'boreal-warden', undefined, undefined],
      ['damage', 'boreal-warden', 4, 0],
    ]);
    expect(nonFinal.units.find(unit => unit.id === 'boreal-stalker')?.hp).toBe(16);
    expect(nonFinal.phase).toBe('playing');
  });

  test('fails an unresolved mission after the final actor in the authored round limit', () => {
    const state = createAwayBattle([member('vale')], mission([
      { id: 'sentry', name: 'Sentry', appearance: 'warden', hp: 100, attack: 1, speed: 1 },
    ]));
    state.round = EXPEDITION_RULES.maxAwayRounds;
    state.cursor = state.order.indexOf('sentry');

    const result = stepAway(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events.map(event => event.type)).toEqual(['action', 'damage', 'defeat']);
    expect(result.events.at(-1)).toMatchObject({ type: 'defeat', round: EXPEDITION_RULES.maxAwayRounds });
    expect(state).toMatchObject({ phase: 'defeat', round: EXPEDITION_RULES.maxAwayRounds });
    expect(state.reason).toContain('signal window');
  });

  test('rejects terminal steps atomically', () => {
    const state = createAwayBattle([member('rex')], mission([
      { id: 'fragile', name: 'Fragile Target', appearance: 'drone', hp: 1, attack: 1, speed: 1 },
    ]));
    expect(stepAway(state).ok).toBe(true);
    expect(state.phase).toBe('victory');
    const terminal = structuredClone(state);

    expect(stepAway(state)).toEqual({ ok: false, error: 'Away battle is already over.', events: [] });
    expect(state).toEqual(terminal);
  });
});

describe('authored away missions', () => {
  test('both missions replay identically through accepted deterministic steps with ordered snapshots', () => {
    const crew = [member('vale', 2), member('rex', 2), member('sen', 2)];
    for (const source of Object.values(AWAY_MISSIONS)) {
      const first = advanceToEnd(crew, source);
      const second = advanceToEnd(crew, source);
      expect(first.state).toEqual(second.state);
      expect(first.events).toEqual(second.events);
      expect(first.events.at(-1)?.type).toBe(first.state.phase);
      for (const event of first.events.filter(event => event.type === 'damage')) {
        expect(event.hp).toBeGreaterThanOrEqual(0);
        expect(event.guard).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

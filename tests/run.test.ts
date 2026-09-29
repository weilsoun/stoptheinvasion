import { describe, expect, test } from 'bun:test';
import { CARDS } from '../src/game/content';
import { canEnter, findPath } from '../src/game/map';
import type { TilePosition } from '../src/game/map';
import { chooseRunOption, createRun, deserializeRun, dispatchRun, runOptions, serializeRun, TOOLKITS } from '../src/game/run';
import type { RunState } from '../src/game/run';
import type { CardInstance, Direction } from '../src/game/types';

function takeCard(run: RunState, predicate: (card: CardInstance) => boolean): CardInstance {
  for (const zone of [run.world.hand, run.world.drawPile, run.world.discardPile]) {
    const index = zone.findIndex(predicate);
    if (index < 0) continue;
    if (zone === run.world.hand) return zone[index];
    const [card] = zone.splice(index, 1);
    run.world.hand.push(card);
    return card;
  }
  throw new Error('Missing fixture card.');
}

const neighbors = (p: TilePosition): TilePosition[] => [
  { x: p.x, y: p.y - 1 }, { x: p.x + 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x - 1, y: p.y },
];

function moveToward(run: RunState, target: TilePosition): void {
  const world = run.world;
  const occupied = world.enemies.filter((enemy) => enemy.hp > 0).map(({ position }) => position);
  const paths = neighbors(target).filter((p) => canEnter(world.map, p, world.completedEncounters))
    .map((p) => findPath(world.map, world.player.position, p, world.completedEncounters, occupied))
    .filter((path): path is TilePosition[] => path !== null).sort((a, b) => a.length - b.length);
  if (!paths.length || !paths[0].length) throw new Error('No next spatial step.');
  const next = paths[0][0];
  const direction: Direction = next.x > world.player.position.x ? 'right' : next.x < world.player.position.x ? 'left' : next.y > world.player.position.y ? 'down' : 'up';
  expect(dispatchRun(run, { kind: 'move', direction }).ok).toBe(true);
}

function adjacent(a: TilePosition, b: TilePosition): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

function defeatEnemy(run: RunState, encounterId: string): void {
  const enemy = run.world.enemies.find((candidate) => candidate.encounterId === encounterId)!;
  // One-hit opponents isolate spatial progression and reward contracts from deck balance.
  enemy.hp = 1;
  for (let limit = 0; limit < 200; limit++) {
    const enemy = run.world.enemies.find((candidate) => candidate.encounterId === encounterId)!;
    if (enemy.hp === 0) break;
    if (!adjacent(run.world.player.position, enemy.position)) moveToward(run, enemy.position);
    else {
      const attack = takeCard(run, (card) => CARDS[card.definitionId].effects.some((effect) => effect.kind === 'damage'));
      run.world.player.energy = run.world.player.energyMax;
      expect(dispatchRun(run, { kind: 'play', uid: attack.uid, targetId: enemy.id }).ok).toBe(true);
    }
  }
  expect(run.world.enemies.find((candidate) => candidate.encounterId === encounterId)!.hp).toBe(0);
  expect(run.world.phase).toBe('reward');
}

function reachObject(run: RunState, objectId: string): void {
  const object = run.world.map.objects.find(({ id }) => id === objectId)!;
  for (let limit = 0; limit < 200 && !adjacent(run.world.player.position, object.position); limit++) moveToward(run, object.position);
  expect(adjacent(run.world.player.position, object.position)).toBe(true);
  expect(dispatchRun(run, { kind: 'interact', objectId }).ok).toBe(true);
}

function skipRewards(run: RunState): void {
  while (run.world.phase === 'reward') expect(chooseRunOption(run, 'reward:skip')).toEqual({ ok: true });
}

function frontCleared(seed = 731): RunState {
  const run = createRun(seed, 'second-coat');
  defeatEnemy(run, 'security');
  skipRewards(run);
  defeatEnemy(run, 'checkout');
  skipRewards(run);
  defeatEnemy(run, 'stacker');
  skipRewards(run);
  return run;
}

describe('walkable expedition', () => {
  test('starts four authored toolkits in the real entrance and rejects obsolete route actions atomically', () => {
    for (const toolkit of TOOLKITS) {
      const run = createRun(312, toolkit.id);
      expect(run.world.phase).toBe('playing');
      expect(run.world.player.position).toEqual(run.world.map.start);
      expect(run.world.deck.map(({ definitionId }) => definitionId)).toEqual(toolkit.deck);
      expect(run.world.hand).toHaveLength(5);
      const before = serializeRun(run);
      expect(chooseRunOption(run, 'route:security').ok).toBe(false);
      expect(dispatchRun(run, { kind: 'interact', objectId: 'loading-exit' }).ok).toBe(false);
      expect(serializeRun(run)).toBe(before);
      expect(deserializeRun(before)).toEqual(run);
    }
  });

  test('resumes movement, RNG, zones, enemy progress, and an independent rewind history', () => {
    const run = createRun(17, 'second-coat');
    expect(dispatchRun(run, { kind: 'move', direction: 'right' }).ok).toBe(true);
    expect(dispatchRun(run, { kind: 'wait' }).ok).toBe(true);
    const resumed = deserializeRun(serializeRun(run))!;
    expect(resumed).toEqual(run);
    expect(dispatchRun(run, { kind: 'wait' })).toEqual(dispatchRun(resumed, { kind: 'wait' }));
    expect(resumed).toEqual(run);
    const checkpoint = resumed.world.checkpoints[0];
    const savedHp = checkpoint.snapshot.player.hp;
    resumed.world.player.hp--;
    expect(checkpoint.snapshot.player.hp).toBe(savedHp);
  });

  test('awards deterministic offers once, preserves the live partition, and seals the old rewind window', () => {
    const run = createRun(91, 'first-shift');
    defeatEnemy(run, 'security');
    const choices = runOptions(run);
    expect(choices.slice(0, 3).every(({ cardId }) => cardId !== undefined)).toBe(true);
    expect(new Set(choices.slice(0, 3).map(({ cardId }) => cardId)).size).toBe(3);
    const resumed = deserializeRun(serializeRun(run))!;
    expect(runOptions(resumed)).toEqual(choices);
    const before = serializeRun(run);
    expect(chooseRunOption(run, 'reward:missing').ok).toBe(false);
    expect(serializeRun(run)).toBe(before);
    const oldTick = run.world.tick - 1;
    const count = run.world.deck.length;
    expect(chooseRunOption(run, choices[0].id)).toEqual({ ok: true });
    expect(run.world.deck).toHaveLength(count + 1);
    const added = run.world.deck.at(-1)!;
    expect(run.world.discardPile.some(({ uid }) => uid === added.uid)).toBe(true);
    expect(chooseRunOption(run, choices[0].id).ok).toBe(false);
    expect(dispatchRun(run, { kind: 'rewind', tick: oldTick }).ok).toBe(false);
    expect(deserializeRun(serializeRun(run))).toEqual(run);
  });

  test('resumes an ordered multi-reward queue and resets rewind only after its final choice', () => {
    const run = createRun(92, 'first-shift');
    defeatEnemy(run, 'security');
    // Model the core's ordered output when a tick completes more than one encounter.
    run.world.enemies.find(({ id }) => id === 'checkout')!.hp = 0;
    run.world.completedEncounters.push('checkout');
    run.world.pendingRewards.push('checkout');
    run.world.rewindCharges = 0;
    const ticks = run.world.checkpoints.map(({ tick }) => tick);
    const first = runOptions(run)[0];
    expect(chooseRunOption(run, first.id)).toEqual({ ok: true });
    expect(run.world.pendingRewards).toEqual(['checkout']);
    expect(run.world.rewindCharges).toBe(0);
    expect(run.world.checkpoints.map(({ tick }) => tick)).toEqual(ticks);
    const resumed = deserializeRun(serializeRun(run))!;
    expect(runOptions(resumed)).toEqual(runOptions(run));
    expect(chooseRunOption(resumed, 'reward:skip')).toEqual({ ok: true });
    expect(resumed.world.phase).toBe('playing');
    expect(resumed.world.pendingRewards).toEqual([]);
    expect(resumed.world.rewindCharges).toBe(1);
    expect(resumed.world.checkpoints.map(({ tick }) => tick)).toEqual([resumed.world.tick]);
  });

  test('persists graded history as an authored base and rejects forged Echo source effects', () => {
    const run = createRun(93, 'second-coat');
    const vest = takeCard(run, (card) => card.definitionId === 'vest');
    const grade = takeCard(run, (card) => card.definitionId === 'reinforce');
    expect(dispatchRun(run, { kind: 'play', uid: grade.uid, targetId: vest.uid }).ok).toBe(true);
    expect(dispatchRun(run, { kind: 'play', uid: vest.uid }).ok).toBe(true);
    const source = serializeRun(run);
    expect(deserializeRun(source)).toEqual(run);
    const historyCard = run.world.history.at(-1)!.cards.find((card) => card.sourceUid === vest.uid)!;
    expect(historyCard.upgradeLevel).toBe(1);
    expect(historyCard.definition!.effects[0].amount).toBe(CARDS.vest.effects[0].amount);
    historyCard.definition!.effects[0].amount += 100;
    expect(deserializeRun(JSON.stringify(run))).toBeNull();
  });

  test('refines one exact UID in every live zone and its new checkpoint, and cannot reuse a station', () => {
    const run = frontCleared();
    reachObject(run, 'break-room');
    const original = run.world.deck.find(({ definitionId }) => definitionId === 'hammer')!;
    const uid = original.uid;
    const other = run.world.deck.find((card) => card.definitionId === 'hammer' && card.uid !== uid)!;
    expect(chooseRunOption(run, `service:refine:${uid}`)).toEqual({ ok: true });
    expect(original.definitionId).toBe('hammer-refined');
    expect(other.definitionId).toBe('hammer');
    const zones = [run.world.hand, run.world.drawPile, run.world.discardPile, run.world.exhaustPile];
    expect(zones.flat().filter((card) => card.uid === uid).map(({ definitionId }) => definitionId)).toEqual(['hammer-refined']);
    expect(run.world.checkpoints.every(({ snapshot }) => snapshot.deck.find((card) => card.uid === uid)?.definitionId === 'hammer-refined')).toBe(true);
    expect(dispatchRun(run, { kind: 'interact', objectId: 'break-room' }).ok).toBe(false);
    expect(deserializeRun(serializeRun(run))).toEqual(run);
  });

  test('removes only the selected physical card and heals at most twelve using a one-use service', () => {
    const run = frontCleared(621);
    reachObject(run, 'break-room');
    const uid = run.world.deck.find(({ definitionId }) => definitionId === 'hammer')!.uid;
    const count = run.world.deck.length;
    expect(chooseRunOption(run, `service:remove:${uid}`)).toEqual({ ok: true });
    expect(run.world.deck).toHaveLength(count - 1);
    expect([run.world.deck, run.world.hand, run.world.drawPile, run.world.discardPile, run.world.exhaustPile].flat().some((card) => card.uid === uid)).toBe(false);
    expect(run.world.checkpoints.every(({ snapshot }) => !snapshot.deck.some((card) => card.uid === uid))).toBe(true);
    const healed = frontCleared(622);
    reachObject(healed, 'break-room');
    healed.world.player.hp = 20;
    expect(chooseRunOption(healed, 'service:heal')).toEqual({ ok: true });
    expect(healed.world.player.hp).toBe(32);
    expect(chooseRunOption(healed, 'service:heal').ok).toBe(false);
    expect(deserializeRun(serializeRun(healed))?.world.player.hp).toBe(32);
  });

  test('walks connected departments, services, optional elite and boss, then requires explicit exit interaction', () => {
    let run = frontCleared(731);
    reachObject(run, 'break-room');
    expect(chooseRunOption(run, 'service:continue')).toEqual({ ok: true });
    for (const id of ['supervisor', 'cleaner', 'greeter', 'floor-manager']) {
      defeatEnemy(run, id);
      skipRewards(run);
      run = deserializeRun(serializeRun(run))!;
    }
    reachObject(run, 'supplies');
    reachObject(run, 'preparation');
    expect(chooseRunOption(run, 'service:continue')).toEqual({ ok: true });
    defeatEnemy(run, 'night-manager');
    skipRewards(run);
    expect(run.world.phase).toBe('playing');
    reachObject(run, 'loading-exit');
    expect(run.world.phase).toBe('victory');
    expect(runOptions(run)).toEqual([]);
    expect(deserializeRun(serializeRun(run))).toEqual(run);
  });
});

describe('strict world save boundary', () => {
  test('rejects old versions and corrupt geometry, identities, inventory, clocks, snapshots and injected commands without modifying input', () => {
    const run = createRun(0x12345678, 'first-shift');
    dispatchRun(run, { kind: 'wait' });
    const source = serializeRun(run);
    const corruptions: Array<[string, unknown]> = [
      ['version', 1],
      ['obsoleteField', true],
      ['world.phase', 'route'],
      ['world.map.tiles.0.0', 'floor'],
      ['world.map.enemies.0.id', 'forged'],
      ['world.map.doors.0.requires', []],
      ['world.enemies.0.encounterId', 'checkout'],
      ['world.enemies.0.actionProgress', 0.5],
      ['world.enemies.0.actionIndex', null],
      ['world.tick', 0.5],
      ['world.player.energy', null],
      ['world.player.position', { x: 0, y: 0 }],
      ['world.drawPile', [...run.world.drawPile, run.world.hand[0]]],
      ['world.deck.0.definitionId', 'missing'],
      ['world.grades.foreign', 2],
      ['world.echoUsed', ['forged-history']],
      ['world.timeMode', 'stretch'],
      ['world.history.0.command', { kind: 'play', uid: 'forged', execute: true }],
      ['world.history.0.events.0.visible', 'hidden'],
      ['world.checkpoints.0.snapshot.checkpoints', []],
      ['world.checkpoints.0.snapshot.hand', [...run.world.checkpoints[0].snapshot.hand, run.world.checkpoints[0].snapshot.hand[0]]],
      ['world.checkpoints', [...run.world.checkpoints, run.world.checkpoints[0]]],
    ];
    for (const [path, replacement] of corruptions) {
      const save: unknown = JSON.parse(source);
      const parts = path.split('.');
      let cursor = save;
      for (const part of parts.slice(0, -1)) {
        if (typeof cursor !== 'object' || cursor === null) throw new Error('Invalid corruption fixture path.');
        cursor = Reflect.get(cursor, part);
      }
      if (typeof cursor !== 'object' || cursor === null) throw new Error('Invalid corruption fixture target.');
      Reflect.set(cursor, parts.at(-1)!, replacement);
      const invalid = JSON.stringify(save);
      expect(deserializeRun(invalid)).toBeNull();
      expect(JSON.stringify(save)).toBe(invalid);
    }
    expect(serializeRun(run)).toBe(source);
    expect(deserializeRun('not json')).toBeNull();
    expect(deserializeRun('')).toBeNull();
  });

  test('refuses nonfinite in-memory saves and malformed commands atomically', () => {
    const run = createRun(44, 'first-shift');
    const before = serializeRun(run);
    expect(dispatchRun(run, { kind: 'rewind', tick: NaN }).ok).toBe(false);
    // JSON represents an intentionally malformed external command at the runtime boundary.
    expect(dispatchRun(run, JSON.parse('{"kind":"move","direction":"diagonal"}')).ok).toBe(false);
    expect(serializeRun(run)).toBe(before);
    run.world.player.surgeEnergy = Infinity;
    expect(() => serializeRun(run)).toThrow();
    const aliased = createRun(45, 'first-shift');
    aliased.world.checkpoints[0].snapshot.player = aliased.world.player;
    expect(() => serializeRun(aliased)).toThrow();
  });
});

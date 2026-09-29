import { describe, expect, test } from 'bun:test';
import { link, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBattle, dispatchBattle, previewCard, SHIP_DECK } from '../src/ship/combat';
import type { ShipBattleState, ShipCardDefinition, ShipLoadout } from '../src/ship/types';
import type { ResearchVariant } from '../scripts/jev-design';
import type { JevEvaluator, JevRequest, JevResponse } from '../scripts/jev-types';
import { chooseCommand, observe, POLICIES } from '../scripts/ship-policy';
import { BattleFailure, gameplayRequest, legalChoices, loadDesignFeedback, parseArgs, playJevStep, runJevBattle, runPolicyBattle, stateHash, verifyReplay, writeAtomicReport } from '../scripts/jev-ship';

const baseline: ResearchVariant = { id: 'baseline', kind: 'baseline' };
function answer(request: JevRequest, choice: string): JevResponse {
  return {
    model: 'jev-1.13.0',
    answers: { action: {
      type: 'choice', choice, confidence: 1,
      probabilities: Object.fromEntries(Object.keys(request.questions.action.criteria).map(id => [id, id === choice ? 1 : 0])),
    } },
  };
}
const endTurn: JevEvaluator = async request => {
  const choice = Object.entries(request.questions.action.criteria).find(([, description]) => String(description).startsWith('End Turn:'));
  if (!choice) throw new Error('No End Turn option');
  return answer(request, choice[0]);
};
function fullHand(state: ShipBattleState): void {
  state.hand.push(...state.draw);
  state.draw = [];
}

describe('visible-only Jev battle boundary', () => {
  test('hidden RNG, piles and future intents cannot change observations, choices or policy decisions', () => {
    const first = createBattle(21);
    const altered = structuredClone(first);
    altered.seed = 999;
    altered.rng = 987654;
    altered.draw.reverse();
    altered.discard.push(...altered.draw.splice(0, 2));
    for (const enemy of altered.enemies) {
      enemy.actionIndex += enemy.sequence.length * 7;
      const current = enemy.actionIndex % enemy.sequence.length;
      enemy.sequence = enemy.sequence.map((intent, index) => index === current ? intent : { title: 'Hidden alternative', effects: [{ kind: 'damage', amount: 24 }] });
    }
    expect(observe(altered)).toEqual(observe(first));
    expect(gameplayRequest(altered)).toEqual(gameplayRequest(first));
    expect(legalChoices(altered)).toEqual(legalChoices(first));
    for (const policy of POLICIES) expect(chooseCommand(observe(altered), policy)).toEqual(chooseCommand(observe(first), policy));
    const before = stateHash(first);
    const view = observe(first);
    view.hand[0].effects[0].amount = 999;
    view.enemies[0].intent[0].amount = 999;
    expect(stateHash(first)).toBe(before);
  });

  test('offers exact affordable hand UIDs, every living attack target and no terminal actions', () => {
    const state = createBattle(3);
    fullHand(state);
    state.energy = 1;
    state.enemies[1].hull = 0;
    const choices = legalChoices(state);
    const expected: unknown[] = [];
    for (const card of state.hand) {
      const definition = previewCard(state, card.uid)!;
      if (definition.cost > state.energy) continue;
      if (definition.kind === 'attack') {
        for (const enemy of state.enemies.filter(enemy => enemy.hull > 0)) expected.push({ type: 'play', uid: card.uid, targetId: enemy.id });
      } else expected.push({ type: 'play', uid: card.uid });
    }
    expected.push({ type: 'end-turn' });
    expect(choices.map(choice => choice.command)).toEqual(expected);
    for (const choice of choices) {
      const clone = structuredClone(state);
      const result = dispatchBattle(clone, choice.command);
      expect(result.ok).toBe(true);
      const command = choice.command;
      if (command.type === 'play') {
        expect(clone.hand.some(card => card.uid === command.uid)).toBe(false);
        expect(result.events.find(event => event.type === 'card')?.card?.uid).toBe(command.uid);
      }
    }
    state.phase = 'defeat';
    state.player.hull = 0;
    expect(legalChoices(state)).toEqual([]);
    expect(gameplayRequest(state)).toBeNull();
  });

  test('invalid model output and provider errors never mutate battle or fall back', async () => {
    const failures: JevEvaluator[] = [
      async request => answer(request, 'forged-target'),
      async request => ({ ...answer(request, Object.keys(request.questions.action.criteria)[0]), model: 'different-provider' }),
      async request => { const response = answer(request, Object.keys(request.questions.action.criteria)[0]); response.answers.action.confidence = Number.NaN; return response; },
      async () => { throw new Error('offline'); },
      async request => {
        request.questions.action.criteria.forged = 'Invented command';
        return answer(request, 'forged');
      },
    ];
    for (const evaluate of failures) {
      const state = createBattle(1);
      const before = structuredClone(state);
      await expect(playJevStep(state, evaluate)).rejects.toThrow();
      expect(state).toEqual(before);
    }
  });

  test('only End Turn is explicitly forced without a one-option model request', async () => {
    const state = createBattle(1);
    state.draw.push(...state.hand);
    state.hand = [];
    let requests = 0;
    const step = await playJevStep(state, async () => { requests++; throw new Error('Must not ask'); });
    expect(requests).toBe(0);
    expect(step.decision).toEqual({ kind: 'forced' });
    expect(state.turn).toBe(2);
    expect(state.hand.length).toBe(5);
    expect(state.player.hull).toBeLessThan(70);
    expect(step.events.filter(event => event.type === 'intent').map(event => event.actorId)).toEqual(['corsair', 'needle', 'bulwark']);
  });
});

describe('canonical traces and bounded termination', () => {
  test('non-playing evaluator reaches real defeat without retries and replay catches forged effects', async () => {
    const record = await runJevBattle(9, baseline, endTurn);
    expect(record.outcome).toBe('defeat');
    expect(record.hull).toBe(0);
    expect(record.bound).toBeNull();
    expect(record.usage).toEqual({});
    expect(record.trace.at(-1)?.events.at(-1)?.type).toBe('defeat');
    const replay = createBattle(9);
    for (const step of record.trace) {
      expect(dispatchBattle(replay, step.command).ok).toBe(true);
      expect(stateHash(replay)).toBe(step.stateHash);
    }
    expect(replay.phase).toBe('defeat');
    const forged = structuredClone(record.trace);
    const damage = forged[0].events.find(event => event.type === 'damage')!;
    damage.amount = (damage.amount ?? 0) + 1;
    expect(() => verifyReplay(9, undefined, record.initialStateHash, forged)).toThrow('Replay mismatch');
  });

  test('command and turn bounds remain unresolved instead of manufactured wins or defeats', async () => {
    const commandBound = await runJevBattle(1, baseline, endTurn, { maxCommands: 1 });
    expect(commandBound.outcome).toBe('bounded');
    expect(commandBound.bound).toBe('commands');
    expect(commandBound.turnsEnded).toBe(1);
    expect(commandBound.hull).toBeGreaterThan(0);
    const turnBound = await runJevBattle(1, baseline, endTurn, { maxTurns: 1 });
    expect(turnBound.outcome).toBe('bounded');
    expect(turnBound.bound).toBe('turns');
    expect(turnBound.turn).toBe(2);
  });

  test('research loadout deterministic replay preserves generated-card effects and exact UID commands', () => {
    const card: ShipCardDefinition = { id: 'research:trace-salvo', title: 'Trace Salvo', kind: 'attack', cost: 1, effects: [{ kind: 'damage', amount: 6 }, { kind: 'damage', amount: 6 }], flavor: 'Two precise bursts.' };
    const loadout: ShipLoadout = { deck: SHIP_DECK.map(id => id === 'pulse' ? card.id : id), cards: [card] };
    const variant: ResearchVariant = { id: 'trace', kind: 'combined', strategy: 'assault', loadout };
    const first = runPolicyBattle(13, variant, 'aggressive');
    const second = runPolicyBattle(13, variant, 'aggressive');
    expect(first).toEqual(second);
    expect(first.usage[card.id]).toBeGreaterThan(0);
    expect(first.cardEffects[card.id].damage).toBeGreaterThan(0);
    const replay = createBattle(13, loadout);
    for (const step of first.trace) expect(dispatchBattle(replay, step.command).ok).toBe(true);
    expect(stateHash(replay)).toBe(first.finalStateHash);
    expect(() => verifyReplay(13, undefined, first.initialStateHash, first.trace)).toThrow('Initial replay mismatch');
    const forged = structuredClone(first.trace);
    forged[0].command = { type: 'play', uid: 'not-a-hand-uid' };
    expect(() => verifyReplay(13, loadout, first.initialStateHash, forged)).toThrow('Rejected research command');
  });

  test('provider failure retains accepted prefix separately and does not play a fallback command', async () => {
    let requests = 0;
    try {
      await runJevBattle(1, baseline, async request => {
        requests++;
        if (requests === 2) throw new Error('interrupted-provider');
        return endTurn(request);
      });
      throw new Error('Expected provider failure');
    } catch (error) {
      expect(error).toHaveProperty('message', 'interrupted-provider');
      expect(error).toHaveProperty('partial.trace');
      if (!(error instanceof BattleFailure)) throw error;
      const partial = error.partial;
      expect(partial.trace.length).toBe(1);
      const canonical = createBattle(1);
      dispatchBattle(canonical, { type: 'end-turn' });
      expect(partial.finalStateHash).toBe(stateHash(canonical));
    }
    expect(requests).toBe(2);
  });
});

describe('research report safety', () => {
  test('serialization failure preserves prior report and successful write replaces atomically', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'jev-report-'));
    const destination = join(directory, 'report.json');
    try {
      await writeFile(destination, '{"status":"previous"}\n');
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      await expect(writeAtomicReport(destination, { evidence: [circular] })).rejects.toThrow();
      expect(await readFile(destination, 'utf8')).toBe('{"status":"previous"}\n');
      await writeAtomicReport(destination, { status: 'complete', outcomes: [{ defeat: 1 }] });
      expect(JSON.parse(await readFile(destination, 'utf8'))).toEqual({ status: 'complete', outcomes: [{ defeat: 1 }] });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('feedback cannot replace its source through a matching path, symlink or hardlink', async () => {
    expect(() => parseArgs(['--feedback', '.balance/jev-report.json'])).toThrow('distinct');
    expect(() => parseArgs(['--feedback', './.balance/jev-report.json', '--output', '.balance/../.balance/jev-report.json'])).toThrow('distinct');
    const directory = await mkdtemp(join(tmpdir(), 'jev-feedback-'));
    const source = join(directory, 'source.json');
    const hard = join(directory, 'hard.json');
    const symbolic = join(directory, 'symbolic.json');
    try {
      await writeFile(source, '{"status":"complete"}\n');
      await link(source, hard);
      await symlink(source, symbolic);
      for (const output of [source, hard, symbolic]) {
        await expect(loadDesignFeedback(source, output)).rejects.toThrow('distinct');
        expect(await readFile(source, 'utf8')).toBe('{"status":"complete"}\n');
      }
      await expect(loadDesignFeedback(source, join(directory, 'new.json'))).rejects.toThrow('completed Jev research');
      await writeFile(source, '{broken');
      await expect(loadDesignFeedback(source, join(directory, 'new.json'))).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('rejects unsafe coverage arguments and canonical output targets', () => {
    for (const args of [
      ['--seeds', '0'], ['--jev-seeds', '0'], ['--seeds', '129'], ['--max-requests', 'Infinity'],
      ['--transport', 'fallback'], ['--model', 'other-provider'], ['--seeds', '2', '--seeds', '1'],
      ['--output', '.balance/ship-report.json'], ['--output', '.balance/report.json'], ['--unknown'],
    ]) expect(() => parseArgs(args)).toThrow();
  });
});

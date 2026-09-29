import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createBattle, dispatchBattle, nextIntent, previewCard } from '../src/ship/combat';
import type { ShipBattleEvent, ShipBattleState, ShipCard, ShipCardId, ShipCommand } from '../src/ship/types';
import { chooseCommand, observe, POLICIES, type Policy } from './ship-policy';

type Outcome = 'victory' | 'defeat' | 'bounded';
const CARD_IDS: ShipCardId[] = ['pulse', 'shield', 'lance', 'cell', 'sweep', 'burst'];
const LIMITS = { seeds: 128, turns: 40, commands: 256, reportBytes: 128 * 1024 * 1024 } as const;
const ROOT = new URL('../', import.meta.url);
const POLICY_DESCRIPTIONS: Record<Policy, string> = {
  tactical: 'Prioritize efficient immediate damage and kills, weighting prevention of the currently printed attack; restore useful shields.',
  aggressive: 'Prioritize efficient immediate damage and kills; weakly value shields against currently printed attacks.',
  defensive: 'Strongly prioritize shields that absorb currently printed attacks, then immediate damage and threat removal.',
};

type Usage = { commands: { play: number; 'end-turn': number }; cards: Record<string, number>; enemyActions: Record<string, number> };
type Fixture = { hand: ShipCard[]; draw: ShipCard[] };
type TraceEntry = {
  turn: number; command: ShipCommand; stateHash: string;
  phase: ShipBattleState['phase']; hull: number; shield: number; energy: number;
  enemies: Array<{ id: string; hull: number; shield: number }>;
  cards: ShipCardId[]; enemyActions: string[];
  effects: Array<Pick<ShipBattleEvent, 'type' | 'actorId' | 'targetId' | 'amount' | 'hull' | 'shield' | 'energy'>>;
};
type BattleRecord = {
  kind: 'complete-battle-attempt'; seed: number; policy: Policy; outcome: Outcome;
  bound: 'turns' | 'commands' | null; hull: number; turn: number; turnsEnded: number;
  initialStateHash: string; finalStateHash: string; replayVerified: true; usage: Usage; trace: TraceEntry[];
};
type DiagnosticRecord = {
  kind: 'command-coverage-only'; name: string; seed: number; fixture: Fixture | null;
  initialStateHash: string; finalStateHash: string; phaseAtStop: ShipBattleState['phase'];
  stopReason: 'planned-command-prefix'; replayVerified: true; usage: Usage; trace: TraceEntry[];
};

function digest(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function stateHash(state: ShipBattleState): string { return digest(JSON.stringify(state)); }
function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function emptyUsage(): Usage {
  return { commands: { play: 0, 'end-turn': 0 }, cards: Object.fromEntries(CARD_IDS.map(id => [id, 0])), enemyActions: {} };
}
function increment(table: Record<string, number>, key: string, amount = 1): void { table[key] = (table[key] ?? 0) + amount; }
function actionKey(actorId: string, title: string): string { return `${actorId}:${title}`; }

function checkState(state: ShipBattleState, originalCards: ReadonlyMap<string, ShipCardId>): void {
  for (const actor of [state.player, ...state.enemies]) {
    requireCondition(Number.isInteger(actor.hull) && actor.hull >= 0 && actor.hull <= actor.maxHull, `Invalid hull: ${actor.id}`);
    requireCondition(Number.isInteger(actor.shield) && actor.shield >= 0 && actor.shield <= actor.maxShield, `Invalid shield: ${actor.id}`);
  }
  requireCondition(Number.isInteger(state.energy) && state.energy >= 0, 'Invalid energy');
  requireCondition(Number.isInteger(state.turn) && state.turn >= 1, 'Invalid turn');
  const cards = [...state.hand, ...state.draw, ...state.discard, ...state.exhaust];
  requireCondition(cards.length === originalCards.size && new Set(cards.map(card => card.uid)).size === cards.length, 'Card conservation failed');
  requireCondition(cards.every(card => originalCards.get(card.uid) === card.id), 'Card identity changed');
  requireCondition((state.phase === 'defeat') === (state.player.hull === 0), 'Defeat/hull mismatch');
  requireCondition((state.phase === 'victory') === state.enemies.every(enemy => enemy.hull === 0), 'Victory/enemies mismatch');
}
function inventory(state: ShipBattleState): Map<string, ShipCardId> {
  return new Map([...state.hand, ...state.draw, ...state.discard, ...state.exhaust].map(card => [card.uid, card.id]));
}
function execute(state: ShipBattleState, command: ShipCommand, usage: Usage, originalCards: ReadonlyMap<string, ShipCardId>): TraceEntry {
  const turn = state.turn;
  const expectedIntents = state.enemies.filter(enemy => enemy.hull > 0).map(enemy => actionKey(enemy.id, nextIntent(enemy).title));
  const played = command.type === 'play' ? state.hand.find(card => card.uid === command.uid) : undefined;
  const result = dispatchBattle(state, command);
  requireCondition(result.ok, `Rejected study command ${JSON.stringify(command)}: ${result.ok ? '' : result.error}`);
  increment(usage.commands, command.type);
  const cardEvents = result.events.filter(event => event.type === 'card');
  const intentEvents = result.events.filter(event => event.type === 'intent');
  const actions = intentEvents.map(event => {
    requireCondition(event.intent, 'Intent event lacks authored intent');
    return actionKey(event.actorId, event.intent.title);
  });
  for (const event of cardEvents) {
    requireCondition(event.card, 'Card event lacks card identity');
    increment(usage.cards, event.card.id);
  }
  for (const key of actions) increment(usage.enemyActions, key);
  if (command.type === 'play') {
    requireCondition(played && cardEvents.length === 1 && cardEvents[0].card?.uid === played.uid, 'Played-card event mismatch');
    requireCondition(actions.length === 0, 'Player play unexpectedly executed enemy intent');
    requireCondition(state.turn === turn, 'Card play unexpectedly advanced turn');
  } else {
    requireCondition(cardEvents.length === 0, 'End Turn unexpectedly played a card');
    requireCondition(actions.every((key, index) => key === expectedIntents[index]), 'Enemy intent order/content mismatch');
    if (state.phase === 'player') {
      requireCondition(actions.length === expectedIntents.length, 'Living enemy did not act');
      requireCondition(state.turn === turn + 1 && state.energy === state.maxEnergy && state.hand.length === 5, 'Fresh-turn contract failed');
    }
  }
  const terminalIndex = result.events.findIndex(event => event.type === 'victory' || event.type === 'defeat');
  requireCondition(terminalIndex < 0 || terminalIndex === result.events.length - 1, 'Events continued after terminal outcome');
  checkState(state, originalCards);
  return {
    turn, command: { ...command }, stateHash: stateHash(state), phase: state.phase,
    hull: state.player.hull, shield: state.player.shield, energy: state.energy,
    enemies: state.enemies.map(enemy => ({ id: enemy.id, hull: enemy.hull, shield: enemy.shield })),
    cards: cardEvents.map(event => event.card!.id), enemyActions: actions,
    effects: result.events.filter(event => event.type !== 'card' && event.type !== 'intent').map(event => ({
      type: event.type, actorId: event.actorId, targetId: event.targetId, amount: event.amount,
      hull: event.hull, shield: event.shield, energy: event.energy,
    })),
  };
}
function applyFixture(state: ShipBattleState, fixture: Fixture | null): void {
  if (!fixture) return;
  state.hand = fixture.hand.map(card => ({ ...card }));
  state.draw = fixture.draw.map(card => ({ ...card }));
}
function verifyReplay(seed: number, fixture: Fixture | null, initialHash: string, trace: readonly TraceEntry[]): true {
  const state = createBattle(seed);
  const originalCards = inventory(state);
  applyFixture(state, fixture);
  checkState(state, originalCards);
  requireCondition(stateHash(state) === initialHash, `Initial replay mismatch for seed ${seed}`);
  const usage = emptyUsage();
  for (const expected of trace) {
    const actual = execute(state, expected.command, usage, originalCards);
    requireCondition(JSON.stringify(actual) === JSON.stringify(expected), `Replay mismatch: seed ${seed}, command ${JSON.stringify(expected.command)}`);
  }
  return true;
}
function runBattle(seed: number, policy: Policy): BattleRecord {
  const state = createBattle(seed);
  const originalCards = inventory(state);
  checkState(state, originalCards);
  const initialStateHash = stateHash(state);
  const trace: TraceEntry[] = [];
  const usage = emptyUsage();
  while (state.phase === 'player' && state.turn <= LIMITS.turns && trace.length < LIMITS.commands) {
    trace.push(execute(state, chooseCommand(observe(state), policy), usage, originalCards));
  }
  const outcome: Outcome = state.phase === 'player' ? 'bounded' : state.phase;
  return {
    kind: 'complete-battle-attempt', seed, policy, outcome,
    bound: outcome !== 'bounded' ? null : trace.length >= LIMITS.commands ? 'commands' : 'turns',
    hull: state.player.hull, turn: state.turn, turnsEnded: usage.commands['end-turn'],
    initialStateHash, finalStateHash: stateHash(state), replayVerified: verifyReplay(seed, null, initialStateHash, trace), usage, trace,
  };
}

function runDiagnostics(): DiagnosticRecord[] {
  const records: DiagnosticRecord[] = [];
  for (const id of [...CARD_IDS, null]) {
    const seed = 1;
    const state = createBattle(seed);
    const originalCards = inventory(state);
    let fixture: Fixture | null = null;
    let selected: ShipCard | undefined;
    if (id) {
      const deck = [...state.hand, ...state.draw];
      const index = deck.findIndex(card => card.id === id);
      requireCondition(index >= 0, `Canonical deck lacks ${id}`);
      [selected] = deck.splice(index, 1);
      // Shield is drawn after one real enemy phase, so its restoration isn't tested at full shield.
      deck.splice(id === 'shield' ? state.hand.length : 0, 0, selected!);
      if (id === 'cell') {
        const spendIndex = deck.findIndex(card => card.id === 'lance');
        requireCondition(spendIndex >= 0, 'Reserve Cell diagnostic needs a canonical spending card');
        const [spend] = deck.splice(spendIndex, 1);
        deck.splice(1, 0, spend);
      }
      fixture = { hand: deck.slice(0, state.hand.length), draw: deck.slice(state.hand.length) };
      applyFixture(state, fixture);
    }
    checkState(state, originalCards);
    const initialStateHash = stateHash(state);
    const usage = emptyUsage();
    const trace: TraceEntry[] = [];
    const step = (command: ShipCommand) => trace.push(execute(state, command, usage, originalCards));
    if (id) {
      if (id === 'shield') step({ type: 'end-turn' });
      requireCondition(state.hand.some(card => card.uid === selected!.uid), `Diagnostic ${id} wasn't drawn`);
      const card = previewCard(state, selected!.uid);
      requireCondition(card, `Diagnostic ${id} missing preview`);
      const target = state.enemies.find(enemy => enemy.hull > 0);
      requireCondition(target, 'Diagnostic has no living target');
      if (id === 'cell') {
        const spend = state.hand.find(card => card.id === 'lance');
        requireCondition(spend, 'Reserve Cell spending card is not in hand');
        step({ type: 'play', uid: spend.uid, targetId: target.id });
      }
      step(card.effects.some(effect => effect.kind === 'damage' && effect.amount > 0) ? { type: 'play', uid: selected!.uid, targetId: target.id } : { type: 'play', uid: selected!.uid });
      requireCondition(usage.cards[id] === 1, `Diagnostic did not exercise ${id}`);
      const effects = trace[trace.length - 1].effects;
      if (id === 'shield' || id === 'cell') {
        requireCondition(effects.some(event => event.type === (id === 'shield' ? 'shield' : 'energy') && (event.amount ?? 0) > 0), `Diagnostic ${id} restored nothing`);
      }
      if (id === 'sweep') requireCondition(effects.filter(event => event.type === 'draw').length === 2, 'Tactical Sweep did not draw two cards');
      if (id === 'burst') requireCondition(effects.filter(event => event.type === 'damage').length === 2, 'Twin Burst did not resolve two hits');
    } else {
      const cycleLength = Math.max(...state.enemies.map(enemy => enemy.sequence.length));
      requireCondition(cycleLength <= LIMITS.turns, 'Enemy diagnostic exceeds turn bound');
      for (let turn = 0; turn < cycleLength && state.phase === 'player'; turn++) step({ type: 'end-turn' });
    }
    records.push({
      kind: 'command-coverage-only', name: id ? `card:${id}` : 'authored-enemy-intents', seed, fixture,
      initialStateHash, finalStateHash: stateHash(state), phaseAtStop: state.phase, stopReason: 'planned-command-prefix',
      replayVerified: verifyReplay(seed, fixture, initialStateHash, trace), usage, trace,
    });
  }
  return records;
}
function combinedUsage(records: readonly { usage: Usage }[]): Usage {
  const combined = emptyUsage();
  for (const { usage } of records) {
    for (const type of ['play', 'end-turn'] as const) combined.commands[type] += usage.commands[type];
    for (const [id, count] of Object.entries(usage.cards)) increment(combined.cards, id, count);
    for (const [id, count] of Object.entries(usage.enemyActions)) increment(combined.enemyActions, id, count);
  }
  return combined;
}
function distribution(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const quantile = (fraction: number): number => {
    const position = (sorted.length - 1) * fraction;
    const low = Math.floor(position);
    return sorted[low] + (sorted[Math.ceil(position)] - sorted[low]) * (position - low);
  };
  const histogram: Record<string, number> = {};
  for (const value of sorted) increment(histogram, String(value));
  return { count: sorted.length, min: sorted[0], p25: quantile(0.25), median: quantile(0.5), p75: quantile(0.75), max: sorted[sorted.length - 1], mean: sorted.reduce((a, b) => a + b, 0) / sorted.length, histogram };
}
function summarize(records: BattleRecord[]) {
  const outcomes = { victory: 0, defeat: 0, bounded: 0 };
  for (const record of records) outcomes[record.outcome]++;
  const distributions = (subset: BattleRecord[]) => ({ hull: distribution(subset.map(record => record.hull)), turn: distribution(subset.map(record => record.turn)), turnsEnded: distribution(subset.map(record => record.turnsEnded)) });
  return {
    attempts: records.length, wins: outcomes.victory, defeats: outcomes.defeat, bounded: outcomes.bounded,
    winFractionOfAllAttempts: outcomes.victory / records.length, usage: combinedUsage(records), distributions: distributions(records),
    byOutcome: Object.fromEntries((['victory', 'defeat', 'bounded'] as const).map(outcome => [outcome, distributions(records.filter(record => record.outcome === outcome))])),
  };
}
async function fingerprint(seeds: number[]) {
  const paths = ['src/ship/types.ts', 'src/ship/combat.ts', 'src/game/random.ts', 'scripts/ship-balance.ts', 'scripts/ship-policy.ts'];
  const files = Object.fromEntries(await Promise.all(paths.map(async path => [path, digest(await readFile(new URL(path, ROOT), 'utf8'))])));
  return { algorithm: 'sha256', files, study: digest(JSON.stringify({ files, seeds, limits: LIMITS, policies: POLICIES })) };
}
export async function buildShipReport(seedCount = 32) {
  requireCondition(Number.isInteger(seedCount) && seedCount >= 1 && seedCount <= LIMITS.seeds, `Seed count must be 1–${LIMITS.seeds}`);
  const seeds = Array.from({ length: seedCount }, (_, index) => index + 1);
  const canonical = createBattle(1);
  const authoredActions = canonical.enemies.flatMap(enemy => enemy.sequence.map(intent => ({ key: actionKey(enemy.id, intent.title), enemyId: enemy.id, title: intent.title, effects: intent.effects })));
  requireCondition(new Set(authoredActions.map(action => action.key)).size === authoredActions.length, 'Authored intent keys must be unique');
  const results = seeds.flatMap(seed => POLICIES.map(policy => runBattle(seed, policy)));
  const diagnostics = runDiagnostics();
  const normalUsage = combinedUsage(results);
  const diagnosticUsage = combinedUsage(diagnostics);
  const missing = (usage: Usage) => ({ cards: CARD_IDS.filter(id => !usage.cards[id]), enemyActions: authoredActions.filter(action => !usage.enemyActions[action.key]).map(action => action.key) });
  const diagnosticMissing = missing(diagnosticUsage);
  return {
    schemaVersion: 1, kind: 'canonical-ship-combat-study', fingerprint: await fingerprint(seeds),
    seeds, policies: POLICY_DESCRIPTIONS, limits: LIMITS, quantiles: 'Linear interpolation at (n−1) × fraction; empty outcome strata are null.',
    policyInformation: 'Only copied current hand previews, energy, player hull/shields, living enemy hull/shields and exact currently printed effects. No simulation lookahead or access to RNG, seed, draw/discard identities, action indices or future sequences.',
    traceReplay: 'createBattle(seed); for diagnostics only apply recorded hand/draw fixture; dispatch each trace command in order. Each SHA-256 covers JSON.stringify of the complete canonical state. Every trace is replayed and compared before reporting. Replay work is excluded from usage counts.',
    authoredActions,
    summaries: Object.fromEntries(POLICIES.map(policy => [policy, summarize(results.filter(record => record.policy === policy))])),
    paired: seeds.map(seed => ({ seed, policies: Object.fromEntries(results.filter(record => record.seed === seed).map(record => [record.policy, { outcome: record.outcome, hull: record.hull, turn: record.turn, turnsEnded: record.turnsEnded }])) })),
    coverage: {
      expectedCards: CARD_IDS, expectedEnemyActions: authoredActions.map(action => action.key),
      completeBattleAttempts: { usage: normalUsage, missing: missing(normalUsage) },
      diagnostics: { usage: diagnosticUsage, missing: diagnosticMissing, passed: diagnosticMissing.cards.length === 0 && diagnosticMissing.enemyActions.length === 0 },
    },
    results, diagnostics,
    limitations: [
      'This is combat only, not an expedition, progression, player-skill estimate, balance endorsement, or tuning recommendation. No production constants, enemies, hull, outcomes, or RNG are modified.',
      'The same sequential seeds are paired across three deterministic heuristic policies. These are not optimal players or independent randomized samples; no statistical population claims are made.',
      'Victory and defeat require canonical terminal phases. Bounds remain distinct and count in the all-attempt denominator; no unresolved attempt is silently treated as a defeat or win.',
      'Shield values and damage scores are immediate visible arithmetic, not future-outcome forecasts. Draw has a fixed quantity heuristic, never identity-based value.',
      'Diagnostics are incomplete command prefixes, excluded from all battle outcomes and distributions. Fixtures only rearrange the existing legal starting deck/hand. Enemy intent coverage uses unmodified battle starts and real End Turns.',
      'Action coverage counts accepted card and intent events, not mere appearances in a hand or catalogue. Coverage proves execution, not full mechanic correctness or game balance.',
      'Turn is the final canonical player-turn index (a bounded attempt can stop at the start of turn 41); turnsEnded separately counts accepted End Turn commands, including a lethal enemy phase.',
    ],
  };
}
function parseArgs(args: string[]): { seeds: number; output: string } {
  let seeds = 32;
  let output = '.balance/ship-report.json';
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    requireCondition(flag === '--seeds' || flag === '--output', `Unknown argument: ${flag}`);
    requireCondition(!seen.has(flag), `Duplicate argument: ${flag}`);
    seen.add(flag);
    const value = args[++index];
    requireCondition(value !== undefined && value.trim() !== '' && !value.startsWith('--'), `${flag} requires a value`);
    if (flag === '--seeds') {
      requireCondition(/^[1-9]\d*$/.test(value), '--seeds must be a positive decimal integer');
      seeds = Number(value);
      requireCondition(Number.isSafeInteger(seeds) && seeds <= LIMITS.seeds, `--seeds must be 1–${LIMITS.seeds}`);
    } else {
      requireCondition(!value.includes('\0') && value.endsWith('.json'), '--output must be a .json file path without NUL characters');
      output = value;
    }
  }
  return { seeds, output };
}
async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const report = await buildShipReport(options.seeds);
  const destination = resolve(options.output);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  const file = await open(temporary, 'wx');
  try {
    // Stream bounded pieces so larger seed requests don't require a second full-report string.
    const { results, diagnostics, ...summary } = report;
    let bytes = 0;
    const append = async (text: string) => {
      bytes += Buffer.byteLength(text);
      requireCondition(bytes <= LIMITS.reportBytes, `Report exceeded ${LIMITS.reportBytes} bytes; previous report retained`);
      await file.writeFile(text);
    };
    await append(`${JSON.stringify(summary).slice(0, -1)},"results":[`);
    for (let index = 0; index < results.length; index++) await append(`${index ? ',' : ''}${JSON.stringify(results[index])}`);
    await append('],"diagnostics":');
    await append(JSON.stringify(diagnostics));
    await append('}\n');
    await file.sync();
    await file.close();
    await rename(temporary, destination);
  } catch (error) {
    await file.close();
    await rm(temporary, { force: true });
    throw error;
  }
  for (const policy of POLICIES) {
    const summary = report.summaries[policy];
    console.log(`${policy}: ${summary.wins} victories / ${summary.defeats} defeats / ${summary.bounded} bounded (${summary.attempts} attempts)`);
  }
  console.log(`Combat-only evidence, not a balance endorsement. Report: ${options.output}; fingerprint: ${report.fingerprint.study}`);
  if (!report.coverage.diagnostics.passed) {
    console.error('Diagnostic coverage incomplete:', report.coverage.diagnostics.missing);
    process.exitCode = 1;
  }
}
if (import.meta.main) main().catch((error: unknown) => { console.error('Ship study failed:', error); process.exitCode = 1; });

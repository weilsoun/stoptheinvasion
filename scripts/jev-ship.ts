import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, realpath, rename, rm, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createBattle, dispatchBattle, SHIP_RULES } from '../src/ship/combat';
import type { ShipBattleEvent, ShipBattleState, ShipCard, ShipCardDefinition, ShipCommand, ShipLoadout } from '../src/ship/types';
import { assessDesigns, generateDesigns, researchVariants, type CardProposal, type DesignFeedback, type DesignResult, type ResearchVariant } from './jev-design';
import { createJevClient, validateJevResponse } from './jev-provider';
import type { JevEvaluator, JevRequest, JevResponse } from './jev-types';
import { chooseCommand, observe, POLICIES, type Observation, type Policy } from './ship-policy';

export const STUDY_LIMITS = { seeds: 128, jevSeeds: 32, turns: 40, commands: 256, requests: 4096, reportBytes: 128 * 1024 * 1024 } as const;
const ROOT = new URL('../', import.meta.url);
const PUBLIC_RULES = {
  resources: SHIP_RULES,
  rules: 'Play cards immediately, paying energy before effects. Energy refills to 3 each turn; 3 is not a cap, so energy cards can exceed it. Damage consumes shield then hull; hits resolve separately. Shields cannot exceed capacity. Adaptive Coils adds 2 to the first shield effect each player turn; displayed card effects already include this bonus. Ordinary cards discard; exhaust cards leave this battle. Only explicit draw effects replace played cards. End Turn discards the hand; surviving enemies recharge shields before executing exactly their printed intents in order. Survive to refill energy to 3, recharge your shields by 3 within capacity, refresh Coils and draw a fresh 5-card hand. Destroy all enemy hulls to win; preserve your hull. No future cards or intents are available.',
};
export interface LegalChoice { id: string; command: ShipCommand; description: string }
export interface TraceStep {
  command: ShipCommand;
  stateHash: string;
  events: ShipBattleEvent[];
  decision: { kind: 'forced' | 'heuristic' } | { kind: 'jev'; request: JevRequest; response: JevResponse };
}
export interface CardEffects { damage: number; shield: number; draw: number; energy: number; energySpent: number }
export interface BattleRecord {
  kind: 'complete-battle-attempt'; seed: number; variant: string; policy: Policy | 'jev';
  outcome: 'victory' | 'defeat' | 'bounded'; bound: 'commands' | 'turns' | null;
  hull: number; turn: number; turnsEnded: number; usage: Record<string, number>; cardEffects: Record<string, CardEffects>;
  initialStateHash: string; finalStateHash: string; replayVerified: true; trace: TraceStep[];
}
interface Fixture { hand: ShipCard[]; draw: ShipCard[]; shield: number }
export interface BattleOptions { maxCommands?: number; maxTurns?: number }
export interface StudyOptions { seeds: number; jevSeeds: number; maxRequests: number }
export interface CliOptions extends StudyOptions { transport: 'http' | 'stdio'; model: string; output: string; feedback?: string; help: boolean }

interface BattleLimits { commands: number; turns: number }
function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function stateHash(state: ShipBattleState): string {
  return createHash('sha256').update(JSON.stringify(state)).digest('hex');
}
function choicesFor(view: Observation): LegalChoice[] {
  const choices: LegalChoice[] = [];
  for (const card of view.hand) {
    if (card.cost > view.energy) continue;
    const targets = card.effects.some(effect => effect.kind === 'damage') ? view.enemies : [undefined];
    for (const target of targets) {
      choices.push({
        id: `option_${choices.length}`,
        command: target ? { type: 'play', uid: card.uid, targetId: target.id } : { type: 'play', uid: card.uid },
        description: `Play ${card.title} [${card.uid}], cost ${card.cost}, ${card.effects.map(effect => `${effect.kind} ${effect.amount}`).join(', ')}${card.exhaust ? ', exhaust' : ''}${target ? ` at ${target.id} (hull ${target.hull}, shield ${target.shield})` : ' on your ship'}.`,
      });
    }
  }
  choices.push({ id: `option_${choices.length}`, command: { type: 'end-turn' }, description: 'End Turn: discard remaining hand and resolve the displayed enemy intents.' });
  return choices;
}
export function legalChoices(state: ShipBattleState): LegalChoice[] {
  return state.phase === 'player' ? choicesFor(observe(state)) : [];
}
export function gameplayRequest(state: ShipBattleState): JevRequest | null {
  if (state.phase !== 'player') return null;
  const view = observe(state);
  const choices = choicesFor(view);
  if (choices.length === 1) return null;
  requireCondition(choices.length <= 255, 'Too many legal choices for Jev');
  return {
    state: { rules: PUBLIC_RULES, observation: view },
    questions: { action: {
      type: 'choice',
      instructions: 'Choose exactly one legal action to win this Kestrel battle while preserving hull. Use only the supplied current observation and public rules. Unknown draws and future intents are not evidence.',
      criteria: Object.fromEntries(choices.map(choice => [choice.id, choice.description])),
    } },
  };
}
function commit(state: ShipBattleState, command: ShipCommand, decision: TraceStep['decision']): TraceStep {
  const result = dispatchBattle(state, command);
  requireCondition(result.ok, `Rejected research command: ${result.ok ? '' : result.error}`);
  return { command: { ...command }, stateHash: stateHash(state), events: result.events, decision };
}
export async function playJevStep(state: ShipBattleState, evaluate: JevEvaluator): Promise<TraceStep> {
  requireCondition(state.phase === 'player', 'Cannot request an action in a terminal battle');
  const request = gameplayRequest(state);
  if (!request) return commit(state, { type: 'end-turn' }, { kind: 'forced' });
  const before = stateHash(state);
  const response = validateJevResponse(request, await evaluate(structuredClone(request)));
  requireCondition(stateHash(state) === before, 'Battle changed while awaiting Jev; action not committed');
  const choice = legalChoices(state).find(candidate => candidate.id === response.answers.action.choice);
  requireCondition(choice, 'Jev selected an action outside the current legal choices');
  return commit(state, choice.command, { kind: 'jev', request, response });
}
export function verifyReplay(seed: number, loadout: ShipLoadout | undefined, initialStateHash: string, trace: readonly TraceStep[], fixture?: Fixture): true {
  const state = createBattle(seed, loadout);
  if (fixture) {
    state.hand = fixture.hand.map(card => ({ ...card }));
    state.draw = fixture.draw.map(card => ({ ...card }));
    state.player.shield = fixture.shield;
  }
  requireCondition(stateHash(state) === initialStateHash, `Initial replay mismatch for seed ${seed}`);
  for (const [index, step] of trace.entries()) {
    const actual = commit(state, step.command, step.decision);
    requireCondition(actual.stateHash === step.stateHash && JSON.stringify(actual.events) === JSON.stringify(step.events), `Replay mismatch for seed ${seed}, command ${index}`);
  }
  return true;
}
function bounds(options: BattleOptions): BattleLimits {
  const commands = options.maxCommands ?? STUDY_LIMITS.commands;
  const turns = options.maxTurns ?? STUDY_LIMITS.turns;
  requireCondition(Number.isInteger(commands) && commands >= 1 && commands <= STUDY_LIMITS.commands, 'Invalid battle command bound');
  requireCondition(Number.isInteger(turns) && turns >= 1 && turns <= STUDY_LIMITS.turns, 'Invalid battle turn bound');
  return { commands, turns };
}
function finishBattle(state: ShipBattleState, variant: ResearchVariant, policy: BattleRecord['policy'], initialStateHash: string, trace: TraceStep[], limits: BattleLimits): BattleRecord {
  const usage: Record<string, number> = {};
  const cardEffects: Record<string, CardEffects> = {};
  for (const step of trace) {
    const card = step.events.find(event => event.type === 'card')?.card;
    if (!card) continue;
    usage[card.id] = (usage[card.id] ?? 0) + 1;
    const effects = cardEffects[card.id] ??= { damage: 0, shield: 0, draw: 0, energy: 0, energySpent: 0 };
    for (const event of step.events) {
      if (event.type === 'damage' || event.type === 'shield' || event.type === 'draw') effects[event.type] += event.amount ?? 0;
      else if (event.type === 'energy') {
        if ((event.amount ?? 0) >= 0) effects.energy += event.amount ?? 0;
        else effects.energySpent -= event.amount!;
      }
    }
  }
  return {
    kind: 'complete-battle-attempt', seed: state.seed, variant: variant.id, policy,
    outcome: state.phase === 'player' ? 'bounded' : state.phase,
    bound: state.phase !== 'player' ? null : trace.length >= limits.commands ? 'commands' : 'turns',
    hull: state.player.hull, turn: state.turn, turnsEnded: trace.filter(step => step.command.type === 'end-turn').length, usage, cardEffects,
    initialStateHash, finalStateHash: stateHash(state), replayVerified: verifyReplay(state.seed, variant.loadout, initialStateHash, trace), trace,
  };
}
export class BattleFailure extends Error {
  constructor(message: string, readonly partial: { seed: number; variant: string; initialStateHash: string; finalStateHash: string; trace: TraceStep[] }) { super(message); }
}
export async function runJevBattle(seed: number, variant: ResearchVariant, evaluate: JevEvaluator, options: BattleOptions = {}): Promise<BattleRecord> {
  const limits = bounds(options);
  const state = createBattle(seed, variant.loadout);
  const initialStateHash = stateHash(state);
  const trace: TraceStep[] = [];
  try {
    while (state.phase === 'player' && state.turn <= limits.turns && trace.length < limits.commands) trace.push(await playJevStep(state, evaluate));
    return finishBattle(state, variant, 'jev', initialStateHash, trace, limits);
  } catch (error) {
    throw new BattleFailure(error instanceof Error ? error.message : 'Jev battle failed', { seed, variant: variant.id, initialStateHash, finalStateHash: stateHash(state), trace });
  }
}
export function runPolicyBattle(seed: number, variant: ResearchVariant, policy: Policy, options: BattleOptions = {}): BattleRecord {
  const limits = bounds(options);
  const state = createBattle(seed, variant.loadout);
  const initialStateHash = stateHash(state);
  const trace: TraceStep[] = [];
  while (state.phase === 'player' && state.turn <= limits.turns && trace.length < limits.commands) {
    trace.push(commit(state, chooseCommand(observe(state), policy), { kind: 'heuristic' }));
  }
  return finishBattle(state, variant, policy, initialStateHash, trace, limits);
}

export function generatedDiagnostics(designs: DesignResult, variants = researchVariants(designs)) {
  return designs.proposals.map(proposal => {
    const variant = variants.find(candidate => candidate.kind === 'card-only' && candidate.strategy === proposal.strategy);
    requireCondition(variant?.loadout, `Missing diagnostic loadout for ${proposal.strategy}`);
    const state = createBattle(1, variant.loadout);
    const deck = [...state.hand, ...state.draw];
    const selectedIndex = deck.findIndex(card => card.id === proposal.card.id);
    requireCondition(selectedIndex >= 0, `Generated card absent: ${proposal.card.id}`);
    const [selected] = deck.splice(selectedIndex, 1);
    deck.unshift(selected);
    const fixture: Fixture = { hand: deck.slice(0, state.hand.length), draw: deck.slice(state.hand.length), shield: 0 };
    state.hand = fixture.hand.map(card => ({ ...card }));
    state.draw = fixture.draw.map(card => ({ ...card }));
    state.player.shield = 0;
    const initialStateHash = stateHash(state);
    const choice = legalChoices(state).find(candidate => candidate.command.type === 'play' && candidate.command.uid === selected.uid);
    requireCondition(choice, `Generated card is not playable: ${proposal.card.id}`);
    const step = commit(state, choice.command, { kind: 'heuristic' });
    requireCondition(step.events.some(event => event.type === 'card' && event.card?.uid === selected.uid), 'Diagnostic did not play the generated UID');
    for (const effect of proposal.card.effects) {
      requireCondition(step.events.some(event => event.type === effect.kind && (event.amount ?? 0) > 0), `Generated ${effect.kind} effect did not execute`);
    }
    requireCondition((proposal.card.exhaust ? state.exhaust : state.discard).some(card => card.uid === selected.uid), 'Generated card entered wrong destination');
    return {
      kind: 'command-coverage-only' as const, strategy: proposal.strategy, card: proposal.card.id, seed: 1, variant: variant.id,
      fixture, initialStateHash, finalStateHash: stateHash(state), trace: [step],
      replayVerified: verifyReplay(1, variant.loadout, initialStateHash, [step], fixture),
      limitations: 'Legal hand rearrangement and zero starting shield only; one accepted card command, not a battle or balance result.',
    };
  });
}
function summarize(records: readonly BattleRecord[]) {
  requireCondition(records.length > 0, 'Cannot summarize absent battle coverage');
  const outcomes = { victory: 0, defeat: 0, bounded: 0 };
  const usage: Record<string, number> = {};
  const cardEffects: Record<string, CardEffects> = {};
  let hull = 0;
  let turn = 0;
  for (const record of records) {
    outcomes[record.outcome]++;
    hull += record.hull;
    turn += record.turn;
    for (const [id, count] of Object.entries(record.usage)) usage[id] = (usage[id] ?? 0) + count;
    for (const [id, amounts] of Object.entries(record.cardEffects)) {
      const total = cardEffects[id] ??= { damage: 0, shield: 0, draw: 0, energy: 0, energySpent: 0 };
      for (const kind of ['damage', 'shield', 'draw', 'energy', 'energySpent'] as const) total[kind] += amounts[kind];
    }
  }
  return { attempts: records.length, ...outcomes, meanHull: hull / records.length, meanTurns: turn / records.length, usage, cardEffects };
}
function pairedEffect(candidate: readonly BattleRecord[], reference: readonly BattleRecord[]) {
  const pairs = candidate.map(record => {
    const baseline = reference.find(other => other.seed === record.seed && other.policy === record.policy);
    requireCondition(baseline, `Missing paired reference: ${record.seed}/${record.policy}`);
    return {
      seed: record.seed, policy: record.policy, candidate: record.variant, reference: baseline.variant,
      candidateOutcome: record.outcome, referenceOutcome: baseline.outcome,
      winDelta: Number(record.outcome === 'victory') - Number(baseline.outcome === 'victory'),
      hullDelta: record.hull - baseline.hull, turnDelta: record.turn - baseline.turn,
      cardUsesDelta: Object.fromEntries([...new Set([...Object.keys(record.usage), ...Object.keys(baseline.usage)])].map(id => [id, (record.usage[id] ?? 0) - (baseline.usage[id] ?? 0)])),
      effectDelta: Object.fromEntries((['damage', 'shield', 'draw', 'energy', 'energySpent'] as const).map(kind => [
        kind,
        Object.values(record.cardEffects).reduce((sum, effects) => sum + effects[kind], 0) - Object.values(baseline.cardEffects).reduce((sum, effects) => sum + effects[kind], 0),
      ])),
    };
  });
  requireCondition(pairs.length > 0 && candidate.length === reference.length, 'Incomplete paired coverage');
  return {
    pairs,
    meanWinDelta: pairs.reduce((sum, pair) => sum + pair.winDelta, 0) / pairs.length,
    meanHullDelta: pairs.reduce((sum, pair) => sum + pair.hullDelta, 0) / pairs.length,
    meanTurnDelta: pairs.reduce((sum, pair) => sum + pair.turnDelta, 0) / pairs.length,
  };
}
function measurements(variants: readonly ResearchVariant[], records: readonly BattleRecord[], policies: readonly BattleRecord['policy'][]) {
  const baseline = variants.find(variant => variant.kind === 'baseline');
  requireCondition(baseline, 'Missing baseline variant');
  return policies.map(policy => {
    const selected = records.filter(record => record.policy === policy);
    const base = selected.filter(record => record.variant === baseline.id);
    return {
      policy,
      variants: variants.map(variant => {
        const attempts = selected.filter(record => record.variant === variant.id);
        return { id: variant.id, kind: variant.kind, strategy: variant.strategy, summary: summarize(attempts), versusBaseline: pairedEffect(attempts, base) };
      }),
      interactions: variants.filter(variant => variant.kind === 'combined').flatMap(combined => {
        const combinedRecords = selected.filter(record => record.variant === combined.id);
        return variants.filter(variant => variant.strategy === combined.strategy && (variant.kind === 'deck-only' || variant.kind === 'card-only')).map(reference => ({
          strategy: combined.strategy,
          contrast: reference.kind === 'deck-only' ? 'card-effect-on-selected-deck' : 'deck-effect-with-selected-card',
          ...pairedEffect(combinedRecords, selected.filter(record => record.variant === reference.id)),
        }));
      }),
    };
  });
}

// Read only the public, bounded contract. Never spread report objects into model input.
export function extractDesignFeedback(value: unknown): DesignFeedback {
  const object = (input: unknown): Record<string, unknown> => {
    requireCondition(input !== null && typeof input === 'object' && !Array.isArray(input), 'Invalid feedback object');
    return input as Record<string, unknown>;
  };
  const list = (input: unknown, size: number): unknown[] => {
    requireCondition(Array.isArray(input) && input.length === size && Array.from({ length: size }, (_, i) => Object.hasOwn(input, i)).every(Boolean), 'Invalid feedback coverage');
    return input;
  };
  const number = (input: unknown, min: number, max: number, integer = false): number => {
    requireCondition(typeof input === 'number' && Number.isFinite(input) && input >= min && input <= max && (!integer || Number.isInteger(input)), 'Invalid feedback measurement');
    return input;
  };
  const text = (input: unknown, max: number): string => {
    requireCondition(typeof input === 'string' && input.length > 0 && input.length <= max, 'Invalid feedback design text');
    return input;
  };
  const report = object(value);
  requireCondition(report.schemaVersion === 1 && report.kind === 'jev-ship-research-study' && report.status === 'complete', 'Feedback must be a completed Jev research report');
  const identity = object(report.fingerprint);
  const sourceFingerprint = identity.study;
  requireCondition(identity.algorithm === 'sha256' && typeof sourceFingerprint === 'string' && /^[a-f0-9]{64}$/.test(sourceFingerprint), 'Invalid feedback fingerprint');
  const proposals = list(object(report.designs).proposals, 3).map(raw => {
    const proposal = object(raw);
    const card = object(proposal.card);
    requireCondition(Array.isArray(card.effects) && card.effects.length >= 1 && card.effects.length <= 4, 'Invalid feedback effects');
    const cleanCard = {
      id: text(card.id, 96), title: text(card.title, 80), flavor: text(card.flavor, 240),
      cost: number(card.cost, 0, 3, true), kind: text(card.kind, 16),
      effects: card.effects.map(rawEffect => {
        const effect = object(rawEffect);
        return { kind: text(effect.kind, 16), amount: number(effect.amount, 1, 24, true) };
      }),
      ...(card.exhaust === undefined ? {} : { exhaust: card.exhaust }),
    };
    requireCondition(card.exhaust === undefined || typeof card.exhaust === 'boolean', 'Invalid feedback exhaustion');
    const deck = list(proposal.deck, 15).map(id => text(id, 16));
    return {
      strategy: text(proposal.strategy, 16), card: cleanCard as ShipCardDefinition,
      deck, replace: text(proposal.replace, 16), copies: number(proposal.copies, 1, 3, true),
    } as CardProposal;
  });
  // Canonical loadout and control validation rejects invalid IDs, mechanics and replacements.
  const variants = researchVariants({ proposals, decisions: [] });
  interface FeedbackContrast { meanWinDelta: number; meanHullDelta: number; meanTurnDelta: number }
  const contrast = (raw: unknown): FeedbackContrast => {
    const data = object(raw);
    return {
      meanWinDelta: number(data.meanWinDelta, -1, 1),
      meanHullDelta: number(data.meanHullDelta, -70, 70),
      meanTurnDelta: number(data.meanTurnDelta, -STUDY_LIMITS.turns, STUDY_LIMITS.turns),
    };
  };
  const measured = (raw: unknown, policies: readonly string[], expected: readonly ResearchVariant[], maxAttempts: number) =>
    list(raw, policies.length).map((rawPolicy, index) => {
      const entry = object(rawPolicy);
      requireCondition(entry.policy === policies[index], 'Invalid feedback policy coverage');
      let attempts: number | undefined;
      const rows = list(entry.variants, expected.length).map((rawVariant, variantIndex) => {
        const row = object(rawVariant);
        const variant = expected[variantIndex];
        requireCondition(row.id === variant.id && row.kind === variant.kind && row.strategy === variant.strategy, 'Invalid feedback variant coverage');
        const summary = object(row.summary);
        const count = number(summary.attempts, 1, maxAttempts, true);
        requireCondition(attempts === undefined || count === attempts, 'Unpaired feedback coverage');
        attempts = count;
        const victory = number(summary.victory, 0, count, true);
        const defeat = number(summary.defeat, 0, count, true);
        const bounded = number(summary.bounded, 0, count, true);
        requireCondition(victory + defeat + bounded === count, 'Invalid feedback outcomes');
        const usage = object(summary.usage);
        const effects = object(summary.cardEffects);
        const ids = Object.keys(createBattle(1, variant.loadout).catalog);
        const cleanUsage: Record<string, number> = {};
        const cleanEffects: Record<string, CardEffects> = {};
        for (const id of ids) {
          if (Object.hasOwn(usage, id)) cleanUsage[id] = number(usage[id], 0, count * STUDY_LIMITS.commands, true);
          if (Object.hasOwn(effects, id)) {
            const amounts = object(effects[id]);
            cleanEffects[id] = Object.fromEntries(['damage', 'shield', 'draw', 'energy', 'energySpent'].map(key =>
              [key, number(amounts[key], 0, count * STUDY_LIMITS.commands * 100, true)])) as unknown as CardEffects;
          }
        }
        return {
          id: variant.id, kind: variant.kind, strategy: variant.strategy,
          summary: { attempts: count, victory, defeat, bounded, meanHull: number(summary.meanHull, 0, 70), meanTurns: number(summary.meanTurns, 1, STUDY_LIMITS.turns + 1), usage: cleanUsage, cardEffects: cleanEffects },
          versusBaseline: contrast(row.versusBaseline),
        };
      });
      const validateContrast = (
        supplied: FeedbackContrast,
        candidate: typeof rows[number]['summary'],
        reference: typeof rows[number]['summary'],
      ) => {
        requireCondition(candidate.attempts === reference.attempts, 'Unpaired feedback comparison');
        const derived = {
          meanWinDelta: (candidate.victory - reference.victory) / candidate.attempts,
          meanHullDelta: candidate.meanHull - reference.meanHull,
          meanTurnDelta: candidate.meanTurns - reference.meanTurns,
        };
        for (const key of ['meanWinDelta', 'meanHullDelta', 'meanTurnDelta'] as const) {
          requireCondition(Math.abs(supplied[key] - derived[key]) <= 1e-9, `Inconsistent feedback comparison: ${key}`);
        }
      };
      for (const row of rows) validateContrast(row.versusBaseline, row.summary, rows[0].summary);
      const expectedInteractions = expected.length === 10 ? 6 : 0;
      const interactions = list(entry.interactions, expectedInteractions).map((rawInteraction, interactionIndex) => {
        const interaction = object(rawInteraction);
        const strategy = proposals[Math.floor(interactionIndex / 2)].strategy;
        const name = interactionIndex % 2 === 0 ? 'card-effect-on-selected-deck' : 'deck-effect-with-selected-card';
        requireCondition(interaction.strategy === strategy && interaction.contrast === name, 'Invalid feedback interaction coverage');
        const supplied = contrast(interaction);
        const candidate = rows.find(row => row.strategy === strategy && row.kind === 'combined');
        const referenceKind = interactionIndex % 2 === 0 ? 'deck-only' : 'card-only';
        const reference = rows.find(row => row.strategy === strategy && row.kind === referenceKind);
        requireCondition(candidate && reference, 'Missing feedback interaction controls');
        validateContrast(supplied, candidate.summary, reference.summary);
        return { strategy, contrast: name, ...supplied };
      });
      return { policy: policies[index], variants: rows, interactions };
    });
  const measurements = [
    ...measured(report.heuristicMeasurements, POLICIES, variants, STUDY_LIMITS.seeds),
    ...measured(report.jevMeasurements, ['jev'], variants.filter(variant => variant.kind === 'baseline' || variant.kind === 'combined'), STUDY_LIMITS.jevSeeds),
  ];
  const strategies = Object.fromEntries(proposals.map(proposal => {
    const energyOnly = proposal.card.effects.every(effect => effect.kind === 'energy');
    const netEnergy = proposal.card.effects.reduce((sum, effect) => sum + effect.amount, 0) - proposal.card.cost;
    const findings = ['One introductory encounter only; victories alone do not establish balance or human fun. Compare isolated controls and hull/turn trade-offs.'];
    if (energyOnly && proposal.card.exhaust && netEnergy <= 2 && proposal.card.cost > 0) {
      findings.push('Prior energy-only card gives at most Reserve Cell’s net two energy, but requires upfront energy; Reserve Cell works at zero. Winning builds do not repair this card-level disadvantage.');
    }
    return [proposal.strategy, {
      proposal,
      measurements: measurements.map(entry => ({
        policy: entry.policy,
        variants: entry.variants.filter(variant => variant.kind === 'baseline' || variant.strategy === proposal.strategy),
        interactions: entry.interactions.filter(interaction => interaction.strategy === proposal.strategy),
      })),
      findings,
    }];
  })) as DesignFeedback['strategies'];
  const inputFingerprint = createHash('sha256').update(JSON.stringify({ sourceFingerprint, strategies })).digest('hex');
  return { sourceFingerprint, inputFingerprint, strategies };
}

export async function loadDesignFeedback(path: string, output: string): Promise<DesignFeedback> {
  requireCondition(resolve(path) !== resolve(output), 'Feedback and output must be distinct paths');
  const sourcePath = await realpath(path);
  const source = await stat(sourcePath);
  requireCondition(source.isFile() && source.size <= STUDY_LIMITS.reportBytes, 'Feedback report exceeds size limit or is not a file');
  let destination;
  try { destination = await stat(output); } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
  }
  requireCondition(!destination || source.dev !== destination.dev || source.ino !== destination.ino, 'Feedback and output must be distinct files');
  const data = await readFile(sourcePath, 'utf8');
  requireCondition(Buffer.byteLength(data) <= STUDY_LIMITS.reportBytes, 'Feedback report exceeds size limit');
  return extractDesignFeedback(JSON.parse(data));
}
async function fingerprint(data: unknown) {
  const paths = ['src/ship/types.ts', 'src/ship/combat.ts', 'src/game/random.ts', 'scripts/ship-policy.ts', 'scripts/ship-balance.ts', 'scripts/jev-ship.ts', 'scripts/jev-types.ts', 'scripts/jev-provider.ts', 'scripts/jev-omp.py', 'scripts/jev-design.ts'];
  const files = Object.fromEntries(await Promise.all(paths.map(async path => [path, createHash('sha256').update(await readFile(new URL(path, ROOT))).digest('hex')])));
  return { algorithm: 'sha256', files, study: createHash('sha256').update(JSON.stringify({ files, data })).digest('hex') };
}
export class StudyFailure extends Error {
  constructor(message: string, readonly partial: unknown) { super(message); }
}
export async function buildJevReport(evaluate: JevEvaluator, options: StudyOptions = { seeds: 32, jevSeeds: 2, maxRequests: 512 }, feedback?: DesignFeedback) {
  requireCondition(Number.isInteger(options.seeds) && options.seeds >= 1 && options.seeds <= STUDY_LIMITS.seeds, 'Invalid heuristic seed count');
  requireCondition(Number.isInteger(options.jevSeeds) && options.jevSeeds >= 1 && options.jevSeeds <= STUDY_LIMITS.jevSeeds, 'Invalid Jev seed count');
  requireCondition(Number.isInteger(options.maxRequests) && options.maxRequests >= 1 && options.maxRequests <= STUDY_LIMITS.requests, 'Invalid request bound');
  const seeds = Array.from({ length: options.seeds }, (_, index) => index + 1);
  const jevSeeds = Array.from({ length: options.jevSeeds }, (_, index) => index + 1);
  const requests: Array<{ request: JevRequest; response?: JevResponse }> = [];
  const results: BattleRecord[] = [];
  const jevResults: BattleRecord[] = [];
  let designs: DesignResult | undefined;
  let stage = 'design';
  const boundedEvaluate: JevEvaluator = async request => {
    requireCondition(requests.length < options.maxRequests, `Study request limit reached (${options.maxRequests}); requested coverage not reduced`);
    const entry: { request: JevRequest; response?: JevResponse } = { request: structuredClone(request) };
    requests.push(entry);
    const response = validateJevResponse(entry.request, await evaluate(request));
    entry.response = response;
    return response;
  };
  try {
    designs = await generateDesigns(boundedEvaluate, feedback);
    const variants = researchVariants(designs);
    requireCondition(designs.proposals.length === 3 && variants.length === 10, 'Expected all three proposals and ten research variants');
    stage = 'diagnostics';
    const diagnostics = generatedDiagnostics(designs, variants);
    stage = 'heuristic-battles';
    for (const variant of variants) for (const policy of POLICIES) for (const seed of seeds) results.push(runPolicyBattle(seed, variant, policy));
    requireCondition(results.length === variants.length * POLICIES.length * seeds.length, 'Incomplete heuristic coverage');
    const heuristicMeasurements = measurements(variants, results, POLICIES);
    const jevVariants = variants.filter(variant => variant.kind === 'baseline' || variant.kind === 'combined');
    requireCondition(jevVariants.length === 4, 'Expected baseline and every combined build for Jev');
    stage = 'jev-battles';
    for (const variant of jevVariants) for (const seed of jevSeeds) jevResults.push(await runJevBattle(seed, variant, boundedEvaluate));
    requireCondition(jevResults.length === 4 * jevSeeds.length, 'Incomplete Jev coverage');
    const jevMeasurements = measurements(jevVariants, jevResults, ['jev']);
    stage = 'advisory-assessment';
    const advisory = await assessDesigns(boundedEvaluate, {
      scope: 'One introductory combat, not full-expedition balance. Measurements below are evidence; your judgment is advisory, not proof.',
      proposals: designs.proposals,
      measurements: [...heuristicMeasurements, ...jevMeasurements].map(({ policy, variants: measured }) => ({
        policy,
        variants: measured.map(({ id, kind, strategy, summary, versusBaseline }) => ({
          id, kind, strategy, summary,
          versusBaseline: { meanWinDelta: versusBaseline.meanWinDelta, meanHullDelta: versusBaseline.meanHullDelta, meanTurnDelta: versusBaseline.meanTurnDelta },
        })),
      })),
    });
    return {
      schemaVersion: 1, kind: 'jev-ship-research-study', status: 'complete',
      fingerprint: await fingerprint({ designs, variants, seeds, jevSeeds, options, limits: STUDY_LIMITS, rules: SHIP_RULES, policies: POLICIES, ...(feedback ? { feedback } : {}) }),
      ...(feedback ? { feedback: structuredClone(feedback) } : {}),
      options, seeds, jevSeeds, limits: STUDY_LIMITS, designs, variants, diagnostics,
      heuristicMeasurements, jevMeasurements, advisory: { role: 'non-binding-model-judgment-not-proof', response: advisory },
      requests, results, jevResults,
      limitations: [
        'Research only: no production deck, catalog, enemy, or tuning changes. Three generated cards/builds are bounded Jev choices from authored grammar/templates, not model-written code or prose.',
        'Only copied visible observations and public rules reach gameplay decisions. No hidden draw order, RNG, seed, future enemy sequences, simulation lookahead or fallback policy.',
        'Heuristics are deterministic, not optimal players or independent randomized samples. Paired seed contrasts isolate deck-only, card-only and combined effects in this encounter only.',
        'Jev confidence, probabilities and advisory balance labels are model judgments, not tests, human fun estimates or balance proof. Outcomes and canonical replay are measured independently.',
        'Explicit turn/command bounds are unresolved outcomes, not defeats or victories. Request/provider failure aborts success reporting rather than dropping candidates or substituting heuristics.',
        'Coverage-only generated-card diagnostics are excluded from battle summaries. Natural-play usage is descriptive, not causal card power.',
      ],
    };
  } catch (error) {
    throw new StudyFailure(error instanceof Error ? error.message : 'Jev study failed', {
      status: 'failed', stage, options, seeds, jevSeeds, designs, requests, results, jevResults,
      interruptedBattle: error instanceof BattleFailure ? error.partial : undefined,
    });
  }
}

export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { seeds: 32, jevSeeds: 2, maxRequests: 512, transport: 'http', model: 'jev-latest', output: '.balance/jev-report.json', help: false };
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    requireCondition(['--seeds', '--jev-seeds', '--max-requests', '--transport', '--model', '--output', '--feedback', '--help'].includes(flag), `Unknown argument: ${flag}`);
    requireCondition(!seen.has(flag), `Duplicate argument: ${flag}`);
    seen.add(flag);
    if (flag === '--help') { options.help = true; continue; }
    const value = args[++index];
    requireCondition(value !== undefined && value.trim() !== '' && !value.startsWith('--'), `${flag} requires a value`);
    if (flag === '--seeds' || flag === '--jev-seeds' || flag === '--max-requests') {
      const maximum = flag === '--seeds' ? STUDY_LIMITS.seeds : flag === '--jev-seeds' ? STUDY_LIMITS.jevSeeds : STUDY_LIMITS.requests;
      requireCondition(/^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= maximum, `${flag} must be 1–${maximum}`);
      if (flag === '--seeds') options.seeds = Number(value);
      else if (flag === '--jev-seeds') options.jevSeeds = Number(value);
      else options.maxRequests = Number(value);
    } else if (flag === '--transport') {
      requireCondition(value === 'http' || value === 'stdio', '--transport must be http or stdio');
      options.transport = value;
    } else if (flag === '--model') {
      requireCondition(value === 'jev-latest' || /^jev-\d+\.\d+\.\d+$/.test(value), '--model must be jev-latest or an exact Jev version such as jev-1.13.0');
      options.model = value;
    } else if (flag === '--feedback') {
      requireCondition(value.endsWith('.json') && !value.includes('\0'), '--feedback must be a .json path without NUL');
      options.feedback = value;
    } else {
      requireCondition(value.endsWith('.json') && !value.includes('\0'), '--output must be a .json path without NUL');
      const destination = resolve(value);
      requireCondition(!['.balance/ship-report.json', '.balance/report.json'].some(path => destination === resolve(new URL(path, ROOT).pathname)), 'Cannot overwrite canonical ship or archived world reports');
      options.output = value;
    }
  }
  requireCondition(!options.feedback || resolve(options.feedback) !== resolve(options.output), 'Feedback and output must be distinct paths');
  return options;
}
export async function writeAtomicReport(destination: string, report: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  const file = await open(temporary, 'wx');
  let closed = false;
  try {
    let bytes = 0;
    const append = async (text: string) => {
      bytes += Buffer.byteLength(text);
      requireCondition(bytes <= STUDY_LIMITS.reportBytes, 'Report size bound exceeded; previous report retained');
      await file.writeFile(text);
    };
    await append('{');
    let first = true;
    for (const [key, value] of Object.entries(report)) {
      if (value === undefined) continue;
      await append(`${first ? '' : ','}${JSON.stringify(key)}:`);
      first = false;
      if (Array.isArray(value)) {
        await append('[');
        for (const [index, entry] of value.entries()) await append(`${index ? ',' : ''}${JSON.stringify(entry)}`);
        await append(']');
      } else await append(JSON.stringify(value));
    }
    await append('}\n');
    await file.sync();
    await file.close();
    closed = true;
    await rename(temporary, destination);
  } finally {
    if (!closed) await file.close();
    await rm(temporary, { force: true });
  }
}
async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: bun scripts/jev-ship.ts [--seeds 32] [--jev-seeds 2] [--max-requests 512] [--transport http|stdio] [--model jev-latest] [--feedback prior-report.json] [--output .balance/jev-report.json]\nBuilds three research cards/decks with Jev, measures all ten variants across three policies, then plays baseline plus every combined build with Jev on paired seeds. Optional feedback requires a completed research report and a distinct output file; only bounded public designs and aggregate comparisons inform refinement, never gameplay observations. HTTP requires TYPESAFE_API_KEY; stdio requires the OMP bridge. Actual model identifiers are recorded; OMP cache hits may report only jev-latest, so they cannot prove an exact version pin. No retries, fallback, production tuning, or silent coverage reductions. Provider failures preserve the prior report and write a separate failure artifact.');
    return;
  }
  const feedback = options.feedback ? await loadDesignFeedback(options.feedback, options.output) : undefined;
  const client = createJevClient({ transport: options.transport, maxRequests: options.maxRequests, model: options.model });
  try {
    const report = await buildJevReport(client.evaluate, options, feedback);
    await writeAtomicReport(resolve(options.output), { ...report, provider: { transport: options.transport, requestedModel: options.model, ...client.stats } });
    const summary = { kind: 'result', status: 'complete', output: options.output, fingerprint: report.fingerprint.study, heuristicBattles: report.results.length, jevBattles: report.jevResults.length, requests: client.stats.requests, models: client.stats.models };
    console.log(JSON.stringify(summary));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Jev study failed';
    const failurePath = `${resolve(options.output)}.failure-${randomUUID()}.json`;
    await writeAtomicReport(failurePath, { kind: 'jev-ship-research-failure', status: 'failed', message, partial: error instanceof StudyFailure ? error.partial : undefined, provider: { transport: options.transport, requestedModel: options.model, ...client.stats } });
    console.error(`Jev study failed; prior report retained. ${message}. Partial evidence: ${failurePath}`);
    process.exitCode = 1;
  } finally {
    client.close();
  }
}
if (import.meta.main) main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Jev study failed'); process.exitCode = 1; });

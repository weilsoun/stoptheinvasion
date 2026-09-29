import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createAwayBattle, stepAway } from '../src/ship/away';
import {
  cardDefinition,
  createBattle,
  definitionForCard,
  dispatchBattle,
  legalTargets,
  nextIntent,
  previewCard,
  SHIP_RULES,
} from '../src/ship/combat';
import {
  AWAY_MISSIONS,
  CREW,
  CREW_IDS,
  EXPEDITION_RULES,
  SECTOR,
  SHIP_ENCOUNTERS,
  upgradeShipCard,
} from '../src/ship/expedition-content';
import {
  createExpedition,
  deserializeExpedition,
  dispatchExpedition,
  expeditionCardDefinition,
  serializeExpedition,
} from '../src/ship/expedition';
import type {
  AwayBattleEvent,
  AwayBattleState,
  AwayMission,
  CrewLevel,
  CrewMember,
  ExpeditionCommand,
  ExpeditionResult,
  ExpeditionState,
  ShipEncounter,
} from '../src/ship/expedition-types';
import type {
  CrewId,
  ShipBaseCardId,
  ShipBattleEvent,
  ShipBattleState,
  ShipCard,
  ShipCardId,
  ShipCommand,
} from '../src/ship/types';
import {
  chooseExpeditionCommand,
  observeExpedition,
  ROUTE_POLICIES,
  type RoutePolicy,
} from './expedition-policy';
import { chooseCommand, observe, POLICIES, type Policy } from './ship-policy';

const ROOT = new URL('../', import.meta.url);
const BASE_CARD_IDS: readonly ShipBaseCardId[] = ['pulse', 'shield', 'lance', 'cell', 'sweep', 'burst'];
const ALL_CARD_IDS: readonly ShipCardId[] = [...BASE_CARD_IDS, 'crew:vale', 'crew:iona', 'crew:rex', 'crew:sen'];
const LIMITS = Object.freeze({
  seeds: 128,
  expeditionCommands: 800,
  battleTurns: 60,
  isolatedCommands: 384,
  awaySteps: 512,
  reportBytes: 256 * 1024 * 1024,
});
const ROUTE_DESCRIPTIONS: Record<RoutePolicy, string> = {
  salvage: 'Prefer battle and salvage routes; improve exact cards and buy finite repairs/refits before optional recruitment.',
  crew: 'Prefer planets and service stops; recruit visible crew, negotiate only when the selected visible party qualifies, otherwise deploy.',
  survey: 'Prefer planets, the science array and graveyard; use visible science/diplomacy and exact-card research choices.',
};

type Outcome = 'victory' | 'defeat' | 'bounded';
type UsageCounter = { opportunities: number; plays: number };
type Usage = Record<string, UsageCounter>;
type FullTraceEntry = {
  index: number;
  command: ExpeditionCommand;
  from: { phase: ExpeditionState['phase']; nodeId: string; hull: number; scrap: number };
  to: { phase: ExpeditionState['phase']; nodeId: string; hull: number; scrap: number };
  message: string;
  shipEvents: string[];
  awayEvents: string[];
  stateHash: string;
  saveReplayVerified: boolean;
};
type FullRecord = {
  kind: 'complete-expedition-attempt';
  seed: number;
  shipPolicy: Policy;
  routePolicy: RoutePolicy;
  outcome: Outcome;
  bound: 'commands' | 'battle-turns' | 'away-steps' | null;
  hull: number;
  scrap: number;
  repairs: number;
  crew: Array<{ id: CrewId; level: CrewLevel; cardUid: string }>;
  upgrades: Array<{ uid: string; id: ShipCardId; grade: number }>;
  path: string[];
  awayResults: Array<{ missionId: string; outcome: 'victory' | 'defeat'; rounds: number }>;
  commands: number;
  initialStateHash: string;
  finalStateHash: string;
  replayVerified: true;
  saveBoundariesVerified: number;
  usage: Usage;
  trace: FullTraceEntry[];
};
type Candidate = {
  id: string;
  family: 'baseline' | 'base-card-grade' | 'captain-level' | 'recruit-level';
  subject: ShipCardId | CrewId;
  level: number;
  deck: ShipCard[];
  candidateUid: string | null;
};
type IsolatedRecord = {
  candidateId: string;
  family: Candidate['family'];
  seed: number;
  encounterId: string;
  policy: Policy;
  outcome: Outcome;
  hull: number;
  turn: number;
  commands: number;
  candidateOpportunities: number;
  candidatePlays: number;
  usage: Usage;
};
type Diagnostic = { name: string; commands: number; passed: true; details: unknown };

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function digest(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function hashState(state: unknown): string { return digest(JSON.stringify(state)); }
function incrementUsage(usage: Usage, id: string, field: keyof UsageCounter): void {
  const entry = usage[id] ?? (usage[id] = { opportunities: 0, plays: 0 });
  entry[field] += 1;
}
function copyCommand(command: ExpeditionCommand): ExpeditionCommand { return structuredClone(command); }
function outcomeForPhase(phase: ExpeditionState['phase']): Outcome | null {
  return phase === 'victory' || phase === 'defeat' ? phase : null;
}
function cardInventory(state: ShipBattleState): ShipCard[] {
  return [...state.hand, ...state.draw, ...state.discard, ...state.exhaust];
}
function candidateOpportunity(state: ShipBattleState, card: ShipCard): boolean {
  const definition = previewCard(state, card.uid);
  return !!definition && definition.cost <= state.energy && legalTargets(state, card.uid).length > 0;
}
function observeUsage(state: ShipBattleState, usage: Usage, candidateUid: string | null): void {
  for (const card of state.hand) {
    if (!candidateOpportunity(state, card)) continue;
    incrementUsage(usage, card.id, 'opportunities');
    if (candidateUid === card.uid) incrementUsage(usage, '@candidate', 'opportunities');
  }
}
function recordPlay(state: ShipBattleState, command: ShipCommand, usage: Usage, candidateUid: string | null): void {
  if (command.type !== 'play') return;
  const card = state.hand.find(item => item.uid === command.uid);
  requireCondition(card, `Policy selected missing card ${command.uid}.`);
  incrementUsage(usage, card.id, 'plays');
  if (candidateUid === card.uid) incrementUsage(usage, '@candidate', 'plays');
}

function dispatchAccepted(state: ExpeditionState, command: ExpeditionCommand): ExpeditionResult & { ok: true } {
  const result = dispatchExpedition(state, command);
  requireCondition(result.ok, `Rejected expedition command ${JSON.stringify(command)}: ${result.ok ? '' : result.error}`);
  return result;
}
function meaningfulSaveBoundary(command: ExpeditionCommand, before: ExpeditionState['phase'], after: ExpeditionState['phase']): boolean {
  return before !== after || ['travel', 'finish-battle', 'salvage', 'service', 'finish-away', 'diplomacy', 'science', 'complete'].includes(command.type);
}
function verifySavedState(state: ExpeditionState): true {
  const loaded = deserializeExpedition(serializeExpedition(state));
  requireCondition(loaded.ok, `Committed save failed replay: ${loaded.ok ? '' : loaded.error}`);
  requireCondition(hashState(loaded.state) === hashState(state), 'Committed save replay changed canonical state.');
  return true;
}

function executeFullCommand(
  state: ExpeditionState,
  command: ExpeditionCommand,
  trace: FullTraceEntry[],
  usage: Usage,
): { result: ExpeditionResult & { ok: true }; saved: boolean } {
  const before = { phase: state.phase, nodeId: state.nodeId, hull: state.hull, scrap: state.scrap };
  if (command.type === 'battle') {
    requireCondition(state.battle, 'Battle command lacks active battle.');
    observeUsage(state.battle, usage, null);
    recordPlay(state.battle, command.command, usage, null);
  }
  const result = dispatchAccepted(state, command);
  const saved = meaningfulSaveBoundary(command, before.phase, state.phase);
  if (saved) verifySavedState(state);
  trace.push({
    index: trace.length,
    command: copyCommand(command),
    from: before,
    to: { phase: state.phase, nodeId: state.nodeId, hull: state.hull, scrap: state.scrap },
    message: result.message,
    shipEvents: result.events.map(event => `${event.type}:${event.actorId}:${event.targetId ?? ''}:${event.amount ?? ''}`),
    awayEvents: result.awayEvents.map(event => `${event.type}:${event.actorId}:${event.targetId ?? ''}:${event.amount ?? ''}`),
    stateHash: hashState(state),
    saveReplayVerified: saved,
  });
  return { result, saved };
}

function verifyFullReplay(seed: number, expectedInitialHash: string, trace: readonly FullTraceEntry[]): true {
  const replay = createExpedition(seed);
  requireCondition(hashState(replay) === expectedInitialHash, `Initial expedition replay mismatch for seed ${seed}.`);
  for (const expected of trace) {
    const before = { phase: replay.phase, nodeId: replay.nodeId, hull: replay.hull, scrap: replay.scrap };
    const result = dispatchAccepted(replay, expected.command);
    const saved = meaningfulSaveBoundary(expected.command, before.phase, replay.phase);
    if (saved) verifySavedState(replay);
    const actual: FullTraceEntry = {
      index: expected.index,
      command: copyCommand(expected.command),
      from: before,
      to: { phase: replay.phase, nodeId: replay.nodeId, hull: replay.hull, scrap: replay.scrap },
      message: result.message,
      shipEvents: result.events.map(event => `${event.type}:${event.actorId}:${event.targetId ?? ''}:${event.amount ?? ''}`),
      awayEvents: result.awayEvents.map(event => `${event.type}:${event.actorId}:${event.targetId ?? ''}:${event.amount ?? ''}`),
      stateHash: hashState(replay),
      saveReplayVerified: saved,
    };
    requireCondition(JSON.stringify(actual) === JSON.stringify(expected), `Expedition trace replay mismatch at command ${expected.index}.`);
  }
  return true;
}

function runFullExpedition(seed: number, shipPolicy: Policy, routePolicy: RoutePolicy): FullRecord {
  const state = createExpedition(seed);
  const initialStateHash = hashState(state);
  const trace: FullTraceEntry[] = [];
  const usage: Usage = {};
  const awayResults: FullRecord['awayResults'] = [];
  let bound: FullRecord['bound'] = null;
  let repairs = 0;
  let saveBoundariesVerified = 0;
  let activeAwayMission: string | null = null;

  while (!outcomeForPhase(state.phase) && trace.length < LIMITS.expeditionCommands) {
    let command: ExpeditionCommand;
    if (state.phase === 'battle') {
      requireCondition(state.battle, 'Battle phase lacks battle state.');
      if (state.battle.phase !== 'player') command = { type: 'finish-battle' };
      else if (state.battle.turn > LIMITS.battleTurns) { bound = 'battle-turns'; break; }
      else command = { type: 'battle', command: chooseCommand(observe(state.battle), shipPolicy) };
    } else if (state.phase === 'away') {
      requireCondition(state.away, 'Away phase lacks away state.');
      if (state.away.phase !== 'playing') {
        awayResults.push({ missionId: state.away.missionId, outcome: state.away.phase, rounds: state.away.round });
        command = { type: 'finish-away' };
      } else {
        if (state.journal.filter(item => item.type === 'away-step').length >= LIMITS.awaySteps) { bound = 'away-steps'; break; }
        command = { type: 'away-step' };
      }
    } else command = chooseExpeditionCommand(observeExpedition(state), routePolicy);
    if (command.type === 'deploy') activeAwayMission = SECTOR[state.nodeId].missionId ?? null;
    const hullBefore = state.hull;
    const { saved } = executeFullCommand(state, command, trace, usage);
    if (saved) saveBoundariesVerified += 1;
    if (command.type === 'service' && command.option === 'repair') repairs += state.hull - hullBefore;
    if (command.type === 'finish-away') activeAwayMission = null;
  }
  if (!outcomeForPhase(state.phase) && !bound) bound = 'commands';
  requireCondition(activeAwayMission === null || bound !== null, 'Away mission disappeared without a recorded result.');
  const outcome = outcomeForPhase(state.phase) ?? 'bounded';
  requireCondition(outcome !== 'victory' || trace.at(-1)?.command.type === 'complete', 'Victory lacked explicit relay completion.');
  return {
    kind: 'complete-expedition-attempt', seed, shipPolicy, routePolicy, outcome, bound,
    hull: state.hull, scrap: state.scrap, repairs,
    crew: state.crew.map(member => ({ ...member })),
    upgrades: state.deck.filter(card => (card.upgradeLevel ?? 0) > 0).map(card => ({ uid: card.uid, id: card.id, grade: card.upgradeLevel ?? 0 })),
    path: [...state.visited], awayResults, commands: trace.length,
    initialStateHash, finalStateHash: hashState(state),
    replayVerified: verifyFullReplay(seed, initialStateHash, trace),
    saveBoundariesVerified, usage, trace,
  };
}

function startingDeck(): ShipCard[] {
  return createExpedition(0).deck.map((card, index) => ({ ...card, uid: `study-${index + 1}` }));
}
function buildCandidates(): Candidate[] {
  const baselineDeck = startingDeck();
  const candidates: Candidate[] = [{ id: 'baseline', family: 'baseline', subject: 'pulse', level: 0, deck: baselineDeck, candidateUid: null }];
  for (const id of BASE_CARD_IDS) {
    for (const grade of [1, 2]) {
      const deck = baselineDeck.map(card => ({ ...card }));
      const card = deck.find(item => item.id === id);
      requireCondition(card, `Starting deck lacks ${id}.`);
      card.upgradeLevel = grade;
      candidates.push({ id: `${id}:grade-${grade}`, family: 'base-card-grade', subject: id, level: grade, deck, candidateUid: card.uid });
    }
  }
  for (const level of [2, 3]) {
    const deck = baselineDeck.map(card => ({ ...card }));
    const card = deck.find(item => item.id === 'crew:vale');
    requireCondition(card, 'Starting deck lacks Captain Vale.');
    card.upgradeLevel = level - 1;
    candidates.push({ id: `vale:level-${level}`, family: 'captain-level', subject: 'vale', level, deck, candidateUid: card.uid });
  }
  for (const crewId of ['iona', 'rex', 'sen'] as const) {
    for (const level of [1, 2, 3]) {
      const deck = baselineDeck.map(card => ({ ...card }));
      const card: ShipCard = { uid: `study-recruit-${crewId}`, id: CREW[crewId].card.id, upgradeLevel: level - 1 };
      deck.push(card);
      candidates.push({ id: `${crewId}:level-${level}`, family: 'recruit-level', subject: crewId, level, deck, candidateUid: card.uid });
    }
  }
  return candidates;
}

function runIsolated(candidate: Candidate, encounter: ShipEncounter, seed: number, policy: Policy): IsolatedRecord {
  const state = createBattle(seed, undefined, { hull: SHIP_RULES.playerHull, deck: candidate.deck, enemies: encounter.enemies });
  const usage: Usage = {};
  let commands = 0;
  while (state.phase === 'player' && state.turn <= LIMITS.battleTurns && commands < LIMITS.isolatedCommands) {
    observeUsage(state, usage, candidate.candidateUid);
    const command = chooseCommand(observe(state), policy);
    recordPlay(state, command, usage, candidate.candidateUid);
    const result = dispatchBattle(state, command);
    requireCondition(result.ok, `Isolated policy command rejected: ${result.ok ? '' : result.error}`);
    commands += 1;
  }
  const outcome: Outcome = state.phase === 'player' ? 'bounded' : state.phase;
  return {
    candidateId: candidate.id, family: candidate.family, seed, encounterId: encounter.id, policy, outcome,
    hull: state.player.hull, turn: state.turn, commands,
    candidateOpportunities: usage['@candidate']?.opportunities ?? 0,
    candidatePlays: usage['@candidate']?.plays ?? 0,
    usage,
  };
}

function mean(values: readonly number[]): number { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function summarizeOutcomes(records: readonly { outcome: Outcome; hull: number; turn: number }[]) {
  const outcomes = { victory: 0, defeat: 0, bounded: 0 };
  for (const record of records) outcomes[record.outcome] += 1;
  return { attempts: records.length, outcomes, meanHull: mean(records.map(record => record.hull)), meanTurn: mean(records.map(record => record.turn)) };
}
function pairedCandidateSummary(candidate: Candidate, records: readonly IsolatedRecord[], baseline: readonly IsolatedRecord[]) {
  const selected = records.filter(record => record.candidateId === candidate.id);
  const baseByKey: Record<string, IsolatedRecord> = Object.fromEntries(baseline.map(record => [`${record.seed}:${record.encounterId}:${record.policy}`, record]));
  const pairs = selected.map(record => {
    const base = baseByKey[`${record.seed}:${record.encounterId}:${record.policy}`];
    requireCondition(base, `Missing paired baseline for ${candidate.id}.`);
    return {
      seed: record.seed, encounterId: record.encounterId, policy: record.policy,
      outcome: record.outcome, baselineOutcome: base.outcome,
      hullDelta: record.hull - base.hull, turnDelta: record.turn - base.turn,
      candidateOpportunities: record.candidateOpportunities,
      candidatePlays: record.candidatePlays,
    };
  });
  const opportunities = pairs.reduce((sum, pair) => sum + pair.candidateOpportunities, 0);
  const plays = pairs.reduce((sum, pair) => sum + pair.candidatePlays, 0);
  return {
    id: candidate.id, family: candidate.family, subject: candidate.subject, level: candidate.level,
    attempts: pairs.length,
    measuredPairedDeltas: {
      meanHull: mean(pairs.map(pair => pair.hullDelta)),
      meanTurn: mean(pairs.map(pair => pair.turnDelta)),
      outcomeTransitions: Object.fromEntries(Array.from(new Set(pairs.map(pair => `${pair.baselineOutcome}->${pair.outcome}`))).sort().map(key => [key, pairs.filter(pair => `${pair.baselineOutcome}->${pair.outcome}` === key).length])),
    },
    usage: { legalDecisionOpportunities: opportunities, plays, playFractionOfLegalDecisionOpportunities: opportunities ? plays / opportunities : null },
    pairs,
  };
}

function putInHand(state: ShipBattleState, uid: string): ShipCard {
  const current = state.hand.find(card => card.uid === uid);
  if (current) return current;
  for (const zone of [state.draw, state.discard, state.exhaust]) {
    const index = zone.findIndex(card => card.uid === uid);
    if (index >= 0) {
      const [card] = zone.splice(index, 1);
      state.hand.push(card);
      return card;
    }
  }
  throw new Error(`Missing card ${uid}.`);
}
function diagnosticMission(id: string, hp = 100, attack = 1, speed = 1): AwayMission {
  return { id, title: id, description: 'Coverage-only authored-mechanic fixture.', diplomacyRequired: 0, diplomacyCost: 0, enemies: [{ id: `${id}-enemy`, name: 'Coverage Target', appearance: 'warden', hp, attack, speed }] };
}
function member(id: CrewId, level: CrewLevel): CrewMember { return { id, level, cardUid: `diagnostic-${id}` }; }
function runCardDiagnostics(): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const id of ALL_CARD_IDS) {
    for (const grade of [0, 1, 2]) {
      const selected: ShipCard = { uid: `diagnostic-${id}-${grade}`, id, upgradeLevel: grade };
      const filler = Array.from({ length: 7 }, (_, index): ShipCard => ({ uid: `filler-${id}-${grade}-${index}`, id: 'pulse', upgradeLevel: 0 }));
      const state = createBattle(17 + grade, undefined, {
        hull: SHIP_RULES.playerHull,
        deck: [selected, ...filler],
        enemies: [{ id: 'diagnostic-target', name: 'Diagnostic Target', role: 'bulwark', hull: 200, shield: 0, recharge: 0 }],
      });
      putInHand(state, selected.uid);
      state.player.shield = 0;
      const expected = upgradeShipCard(cardDefinition(id), grade);
      requireCondition(JSON.stringify(definitionForCard(state, selected)) === JSON.stringify(expected), `Authored grade mismatch for ${id} +${grade}.`);
      const command: ShipCommand = expected.kind === 'attack'
        ? { type: 'play', uid: selected.uid, targetId: 'diagnostic-target' }
        : { type: 'play', uid: selected.uid };
      const result = dispatchBattle(state, command);
      requireCondition(result.ok, `Card diagnostic rejected ${id} +${grade}.`);
      const cardEvent = result.events.find(event => event.type === 'card');
      requireCondition(cardEvent?.card?.uid === selected.uid, `Card diagnostic did not execute ${id} +${grade}.`);
      diagnostics.push({
        name: `card:${id}:grade-${grade}`, commands: 1, passed: true,
        details: { authoredEffects: expected.effects, executedEffects: cardEvent.definition?.effects, eventTypes: result.events.map(event => event.type) },
      });
    }
  }
  return diagnostics;
}
function runEncounterDiagnostics(): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const encounter of Object.values(SHIP_ENCOUNTERS).sort((left, right) => left.id.localeCompare(right.id))) {
    const state = createBattle(23, undefined, { hull: SHIP_RULES.playerHull, deck: startingDeck(), enemies: encounter.enemies });
    const expected = encounter.enemies.flatMap(enemy => {
      const actor = state.enemies.find(item => item.id === enemy.id)!;
      return actor.sequence.map(intent => `${enemy.id}:${intent.title}`);
    });
    const seen: string[] = [];
    let commands = 0;
    const maxCycle = Math.max(...state.enemies.map(enemy => enemy.sequence.length));
    for (let index = 0; index < maxCycle && state.phase === 'player'; index += 1) {
      const result = dispatchBattle(state, { type: 'end-turn' });
      requireCondition(result.ok, `Encounter diagnostic rejected ${encounter.id}.`);
      seen.push(...result.events.filter(event => event.type === 'intent').map(event => `${event.actorId}:${event.intent!.title}`));
      commands += 1;
    }
    requireCondition(expected.every(key => seen.includes(key)), `Missing authored intent in ${encounter.id}.`);
    requireCondition(new Set(state.enemies.map(enemy => enemy.id)).size === state.enemies.length, `Duplicate encounter identity in ${encounter.id}.`);
    diagnostics.push({ name: `encounter:${encounter.id}`, commands, passed: true, details: { roster: state.enemies.map(enemy => ({ id: enemy.id, role: enemy.role })), expectedIntents: expected, executedIntents: seen } });
  }
  return diagnostics;
}
function stepExpectedActor(state: AwayBattleState, actorId: string): AwayBattleEvent[] {
  state.cursor = state.order.indexOf(actorId);
  requireCondition(state.cursor >= 0, `Away actor ${actorId} absent.`);
  const result = stepAway(state);
  requireCondition(result.ok, `Away diagnostic step rejected for ${actorId}.`);
  requireCondition(result.events[0]?.actorId === actorId, `Away diagnostic acted with wrong unit for ${actorId}.`);
  return result.events;
}
function runAwayDiagnostics(): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const id of CREW_IDS) {
    for (const level of [1, 2, 3] as const) {
      const state = createAwayBattle([member(id, level)], diagnosticMission(`skill-${id}-${level}`));
      state.units.find(unit => unit.id === id)!.actionCount = 2;
      const events = stepExpectedActor(state, id);
      requireCondition(events[0]?.text.includes(CREW[id].abilityName), `Away skill did not execute for ${id} level ${level}.`);
      diagnostics.push({ name: `away-skill:${id}:level-${level}`, commands: 1, passed: true, details: events });
    }
  }
  const rex = createAwayBattle([member('rex', 1)], diagnosticMission('rex-lethal', 3));
  rex.units.find(unit => unit.id === 'rex')!.actionCount = 2;
  const rexEvents = stepExpectedActor(rex, 'rex');
  requireCondition(rexEvents.filter(event => event.type === 'damage').length === 1 && rex.phase === 'victory', 'Rex lethal did not suppress the second hit.');
  diagnostics.push({ name: 'away:rex-lethal-suppression', commands: 1, passed: true, details: rexEvents });

  const sen = createAwayBattle([member('sen', 1), member('vale', 1), member('iona', 1)], diagnosticMission('sen-no-revive'));
  sen.units.find(unit => unit.id === 'sen')!.actionCount = 2;
  sen.units.find(unit => unit.id === 'vale')!.hp = 0;
  sen.units.find(unit => unit.id === 'iona')!.hp -= 5;
  const senEvents = stepExpectedActor(sen, 'sen');
  requireCondition(sen.units.find(unit => unit.id === 'vale')!.hp === 0 && senEvents.some(event => event.type === 'heal' && event.targetId === 'iona'), 'Sen revived or healed the wrong target.');
  diagnostics.push({ name: 'away:sen-no-revive-heal-cap', commands: 1, passed: true, details: senEvents });

  for (const id of ['vale', 'iona'] as const) {
    const team = id === 'vale' ? [member('vale', 3), member('iona', 1), member('sen', 1)] : [member('iona', 3), member('sen', 1)];
    const state = createAwayBattle(team, diagnosticMission(`${id}-guard-cap`));
    const actor = state.units.find(unit => unit.id === id)!;
    actor.actionCount = 2;
    for (const unit of state.units.filter(unit => unit.side === 'crew')) unit.guard = EXPEDITION_RULES.awayGuardCap - 1;
    const events = stepExpectedActor(state, id);
    requireCondition(events.filter(event => event.type === 'guard').every(event => event.guard === EXPEDITION_RULES.awayGuardCap && event.amount === 1), `${id} exceeded Guard cap.`);
    diagnostics.push({ name: `away:${id}-guard-cap`, commands: 1, passed: true, details: events });
  }
  return diagnostics;
}

function fixtureExpedition(nodeId: string, phase: ExpeditionState['phase']): ExpeditionState {
  const state = createExpedition(41);
  state.nodeId = nodeId;
  state.phase = phase;
  state.visited = ['launch', nodeId];
  return state;
}
function expectRejectedUnchanged(state: ExpeditionState, command: ExpeditionCommand): string {
  const before = hashState(state);
  const result = dispatchExpedition(state, command);
  requireCondition(!result.ok, `Expected rejection for ${JSON.stringify(command)}.`);
  requireCondition(hashState(state) === before, `Rejected command mutated state: ${JSON.stringify(command)}.`);
  return result.error;
}
function runExpeditionDiagnostics(): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const upgradeState = fixtureExpedition('cold-beacon', 'salvage');
  const vale = upgradeState.deck.find(card => card.id === 'crew:vale')!;
  const untouched = upgradeState.deck.find(card => card.id === 'pulse')!;
  for (let level = 1; level <= 2; level += 1) {
    upgradeState.reward = { nodeId: upgradeState.nodeId, scrap: 0, cards: [], crewId: null, allowUpgrade: true };
    dispatchAccepted(upgradeState, { type: 'salvage', choice: { kind: 'upgrade', uid: vale.uid } });
    requireCondition(vale.uid === upgradeState.crew[0]!.cardUid && (upgradeState.deck.find(card => card.uid === vale.uid)!.upgradeLevel ?? 0) === level && upgradeState.crew[0]!.level === level + 1, 'Crew card and crew level lost synchronization.');
    if (level === 1) upgradeState.phase = 'salvage';
  }
  requireCondition((upgradeState.deck.find(card => card.uid === untouched.uid)!.upgradeLevel ?? 0) === 0, 'Exact UID upgrade changed another copy.');
  diagnostics.push({ name: 'expedition:exact-uid-crew-sync', commands: 2, passed: true, details: { uid: vale.uid, crewLevel: upgradeState.crew[0]!.level, otherUid: untouched.uid } });

  const rewardState = fixtureExpedition('cold-beacon', 'salvage');
  rewardState.reward = { nodeId: rewardState.nodeId, scrap: 8, cards: ['pulse'], crewId: 'iona', allowUpgrade: true };
  dispatchAccepted(rewardState, { type: 'salvage', choice: { kind: 'card', cardId: 'pulse' } });
  const rewardError = expectRejectedUnchanged(rewardState, { type: 'salvage', choice: { kind: 'card', cardId: 'pulse' } });
  diagnostics.push({ name: 'expedition:one-use-reward', commands: 1, passed: true, details: { rejection: rewardError, deckSize: rewardState.deck.length } });

  const serviceState = fixtureExpedition('orion-depot', 'depot');
  serviceState.scrap = 100;
  serviceState.hull = 40;
  const serviceCommands: ExpeditionCommand[] = [
    { type: 'service', option: 'repair' },
    { type: 'service', option: 'upgrade', target: serviceState.deck.find(card => card.id === 'pulse')!.uid },
    { type: 'service', option: 'recruit', target: 'iona' },
    { type: 'service', option: 'card', target: 'shield' },
  ];
  const serviceDetails: unknown[] = [];
  for (const command of serviceCommands) {
    dispatchAccepted(serviceState, command);
    serviceDetails.push({ command, purchases: [...serviceState.purchases], scrap: serviceState.scrap });
    serviceDetails.push({ repeatedRejection: expectRejectedUnchanged(serviceState, command) });
  }
  diagnostics.push({ name: 'expedition:finite-services', commands: serviceCommands.length, passed: true, details: serviceDetails });

  const diplomacy = fixtureExpedition('nacre', 'planet');
  const beforeScrap = diplomacy.scrap;
  dispatchAccepted(diplomacy, { type: 'diplomacy', crewIds: ['vale'] });
  requireCondition(diplomacy.phase === 'salvage' && diplomacy.scrap === beforeScrap - AWAY_MISSIONS.nacre!.diplomacyCost + EXPEDITION_RULES.diplomacyScrap, 'Diplomacy payment/reward mismatch.');
  const ineligible = fixtureExpedition('boreal', 'planet');
  ineligible.crew.push({ id: 'iona', level: 1, cardUid: 'fixture-iona' });
  const diplomacyError = expectRejectedUnchanged(ineligible, { type: 'diplomacy', crewIds: ['iona'] });
  diagnostics.push({ name: 'expedition:diplomacy-eligibility-payment', commands: 1, passed: true, details: { beforeScrap, afterScrap: diplomacy.scrap, ineligibleRejection: diplomacyError } });

  const scienceDetails: unknown[] = [];
  const decode = fixtureExpedition('lens-array', 'science');
  const senCard: ShipCard = { uid: 'fixture-sen', id: 'crew:sen', upgradeLevel: 0 };
  decode.deck.push(senCard);
  decode.crew.push({ id: 'sen', level: 1, cardUid: senCard.uid });
  const decodeTarget = decode.deck.find(card => card.id === 'pulse')!;
  dispatchAccepted(decode, { type: 'science', choice: 'decode', uid: decodeTarget.uid });
  requireCondition((decode.deck.find(card => card.uid === decodeTarget.uid)!.upgradeLevel ?? 0) === 1, 'Science decode did not upgrade the exact card.');
  scienceDetails.push({ choice: 'decode', uid: decodeTarget.uid, grade: 1 });
  scienceDetails.push({ repeatedRejection: expectRejectedUnchanged(decode, { type: 'science', choice: 'decode', uid: decodeTarget.uid }) });

  const share = fixtureExpedition('lens-array', 'science');
  const shareBefore = share.scrap;
  dispatchAccepted(share, { type: 'science', choice: 'share' });
  requireCondition(share.scrap === shareBefore + EXPEDITION_RULES.scienceShareScrap, 'Science share granted the wrong scrap.');
  scienceDetails.push({ choice: 'share', gained: share.scrap - shareBefore });

  const scienceSalvage = fixtureExpedition('lens-array', 'science');
  const salvageBefore = scienceSalvage.scrap;
  dispatchAccepted(scienceSalvage, { type: 'science', choice: 'salvage' });
  requireCondition(scienceSalvage.scrap === salvageBefore + EXPEDITION_RULES.scienceSalvageScrap, 'Science salvage granted the wrong scrap.');
  scienceDetails.push({ choice: 'salvage', gained: scienceSalvage.scrap - salvageBefore });
  diagnostics.push({ name: 'expedition:science-one-use-options', commands: 3, passed: true, details: scienceDetails });

  const rescue = fixtureExpedition('boreal', 'planet');
  const hullBefore = rescue.hull;
  dispatchAccepted(rescue, { type: 'deploy', crewIds: ['vale'] });
  let rescueSteps = 0;
  while (rescue.away?.phase === 'playing' && rescueSteps < LIMITS.awaySteps) {
    dispatchAccepted(rescue, { type: 'away-step' });
    rescueSteps += 1;
  }
  requireCondition(rescue.away?.phase === 'defeat', 'Rescue diagnostic did not reach a genuine away defeat.');
  dispatchAccepted(rescue, { type: 'finish-away' });
  requireCondition(rescue.hull === hullBefore - EXPEDITION_RULES.evacuationHullLoss, 'Failed evacuation charged the wrong hull cost.');
  diagnostics.push({ name: 'expedition:rescue-cost', commands: rescueSteps + 2, passed: true, details: { hullBefore, hullAfter: rescue.hull, awaySteps: rescueSteps } });

  const travel = createExpedition(43);
  const illegalTravel = expectRejectedUnchanged(travel, { type: 'travel', nodeId: 'far-relay' });
  dispatchAccepted(travel, { type: 'travel', nodeId: 'cold-beacon' });
  const exit = fixtureExpedition('far-relay', 'map');
  dispatchAccepted(exit, { type: 'complete' });
  requireCondition(exit.phase === 'victory', 'Explicit exit command did not win.');
  diagnostics.push({ name: 'expedition:legal-travel-explicit-exit', commands: 2, passed: true, details: { illegalTravel, legalArrival: travel.nodeId, exitPhase: exit.phase } });

  const original = createExpedition(47);
  dispatchAccepted(original, { type: 'travel', nodeId: 'cold-beacon' });
  const loaded = deserializeExpedition(serializeExpedition(original));
  requireCondition(loaded.ok && hashState(loaded.state) === hashState(original), 'Save replay diagnostic failed.');
  const loadedBefore = loaded.ok ? hashState(loaded.state) : '';
  dispatchAccepted(original, { type: 'battle', command: { type: 'end-turn' } });
  requireCondition(loaded.ok && hashState(loaded.state) === loadedBefore, 'Loaded branch changed when sibling advanced.');
  if (loaded.ok) {
    const command = chooseCommand(observe(loaded.state.battle!), 'tactical');
    dispatchAccepted(loaded.state, { type: 'battle', command });
    requireCondition(hashState(loaded.state) !== hashState(original), 'Independent save branches did not diverge.');
  }
  diagnostics.push({ name: 'expedition:save-branch-independence', commands: 3, passed: true, details: { originalHash: hashState(original), loadedHash: loaded.ok ? hashState(loaded.state) : null } });

  return diagnostics;
}

function runDiagnostics(): Diagnostic[] {
  return [...runCardDiagnostics(), ...runEncounterDiagnostics(), ...runAwayDiagnostics(), ...runExpeditionDiagnostics()];
}
function combineUsage(records: readonly { usage: Usage }[]): Usage {
  const output: Usage = {};
  for (const record of records) for (const [id, counts] of Object.entries(record.usage)) {
    const target = output[id] ?? (output[id] = { opportunities: 0, plays: 0 });
    target.opportunities += counts.opportunities;
    target.plays += counts.plays;
  }
  return output;
}
function summarizeFull(records: readonly FullRecord[]) {
  const outcomes = { victory: 0, defeat: 0, bounded: 0 };
  for (const record of records) outcomes[record.outcome] += 1;
  const commandCounts: Record<string, number> = {};
  const awayOutcomes = { victory: 0, defeat: 0 };
  for (const record of records) {
    for (const entry of record.trace) commandCounts[entry.command.type] = (commandCounts[entry.command.type] ?? 0) + 1;
    for (const away of record.awayResults) awayOutcomes[away.outcome] += 1;
  }
  return {
    attempts: records.length,
    outcomes,
    meanHull: mean(records.map(record => record.hull)),
    meanScrap: mean(records.map(record => record.scrap)),
    meanCommands: mean(records.map(record => record.commands)),
    totalRepairs: records.reduce((sum, record) => sum + record.repairs, 0),
    expeditionsRecruitingCrew: records.filter(record => record.crew.length > 1).length,
    awayOutcomes,
    acceptedCommandCounts: commandCounts,
    usage: combineUsage(records),
  };
}
async function fingerprint(seeds: readonly number[]) {
  const paths = [
    'src/game/random.ts',
    'src/ship/types.ts',
    'src/ship/combat.ts',
    'src/ship/expedition-types.ts',
    'src/ship/expedition-content.ts',
    'src/ship/away.ts',
    'src/ship/expedition.ts',
    'scripts/ship-policy.ts',
    'scripts/expedition-policy.ts',
    'scripts/expedition-balance.ts',
  ];
  const files = Object.fromEntries(await Promise.all(paths.map(async path => [path, digest(await readFile(new URL(path, ROOT), 'utf8'))])));
  return { algorithm: 'sha256', files, study: digest(JSON.stringify({ files, seeds, limits: LIMITS, shipPolicies: POLICIES, routePolicies: ROUTE_POLICIES })) };
}

export async function buildExpeditionReport(seedCount = 32) {
  requireCondition(Number.isInteger(seedCount) && seedCount >= 1 && seedCount <= LIMITS.seeds, `Seed count must be 1–${LIMITS.seeds}.`);
  const seeds = Array.from({ length: seedCount }, (_, index) => index + 1);
  const full = seeds.flatMap(seed => POLICIES.flatMap(shipPolicy => ROUTE_POLICIES.map(routePolicy => runFullExpedition(seed, shipPolicy, routePolicy))));
  const candidates = buildCandidates();
  const encounters = Object.values(SHIP_ENCOUNTERS).sort((left, right) => left.id.localeCompare(right.id));
  const isolated = candidates.flatMap(candidate => seeds.flatMap(seed => encounters.flatMap(encounter => POLICIES.map(policy => runIsolated(candidate, encounter, seed, policy)))));
  const baseline = isolated.filter(record => record.candidateId === 'baseline');
  const diagnostics = runDiagnostics();
  const candidateSummaries = candidates.filter(candidate => candidate.family !== 'baseline').map(candidate => pairedCandidateSummary(candidate, isolated, baseline));
  const diagnosticNames = diagnostics.map(item => item.name);
  requireCondition(new Set(diagnosticNames).size === diagnosticNames.length && diagnostics.every(item => item.passed), 'Diagnostic coverage gate failed.');
  return {
    schemaVersion: 1,
    kind: 'canonical-kestrel-expedition-study',
    fingerprint: await fingerprint(seeds),
    seeds,
    limits: LIMITS,
    policies: { ship: [...POLICIES], route: ROUTE_DESCRIPTIONS },
    informationBoundary: 'Ship actions receive only copied current hand previews, energy, hull/shields, living enemies and currently printed intents. Route/choice actions receive only the current public node/destinations, hull, scrap, persistent deck/crew, visible reward, current service eligibility and public crew stats. No policy receives run seed/RNG, draw order, piles, future rewards, future intents, unreached sequences or journal.',
    populations: {
      fullExpeditions: {
        label: 'Canonical complete expedition attempts through createExpedition/dispatchExpedition; bounds are not victories.',
        summary: summarizeFull(full),
        byShipAndRoutePolicy: Object.fromEntries(POLICIES.flatMap(shipPolicy => ROUTE_POLICIES.map(routePolicy => [`${shipPolicy}:${routePolicy}`, summarizeFull(full.filter(record => record.shipPolicy === shipPolicy && record.routePolicy === routePolicy))]))),
        records: full,
      },
      isolatedAuthoredEncounters: {
        label: 'Isolated paired encounter experiments from the real starting run deck. These are not full-run starting states, progression recommendations or causal estimates.',
        candidateDefinitions: candidates.map(candidate => ({
          id: candidate.id,
          family: candidate.family,
          subject: candidate.subject,
          level: candidate.level,
          candidateUid: candidate.candidateUid,
          deckSize: candidate.deck.length,
          deck: candidate.deck.map(card => ({ ...card })),
        })),
        candidateFamilies: Object.fromEntries(['baseline', 'base-card-grade', 'captain-level', 'recruit-level'].map(family => [family, candidates.filter(candidate => candidate.family === family).map(candidate => candidate.id)])),
        encounters: encounters.map(encounter => ({ id: encounter.id, roster: encounter.enemies })),
        baselineSummary: summarizeOutcomes(baseline),
        candidates: candidateSummaries,
        records: isolated,
      },
    },
    coverage: {
      passed: true,
      diagnosticCount: diagnostics.length,
      expectedCards: ALL_CARD_IDS,
      expectedGrades: [0, 1, 2],
      expectedEncounters: encounters.map(encounter => encounter.id),
      expectedAwaySkillsAndLevels: CREW_IDS.flatMap(id => [1, 2, 3].map(level => `${id}:${level}`)),
      diagnostics,
    },
    usageLabel: 'A legal decision opportunity is one policy decision where a card is currently in hand, affordable and has at least one legal target. Plays divided by these opportunities is descriptive exposure-normalized use, not card power, causality or a recommendation.',
    replayContract: 'Every full trace begins at createExpedition(seed), contains every accepted canonical command, and is replayed command-for-command with complete-state SHA-256 comparison. Meaningful phase/travel/reward/service/exit boundaries additionally round-trip serializeExpedition/deserializeExpedition. Coverage fixtures arrange legal starting state only; outcomes still come from canonical commands.',
    limitations: [
      'The three ship and three route policies are deterministic transparent heuristics, not optimal players or human samples.',
      'Victory requires the canonical victory phase after an explicit complete command at the Far Relay. Defeat and bounded attempts remain separate.',
      'Isolated encounter candidates preserve candidate families and compare paired seeds, rosters and policies against baseline. Recruitment appends the real crew card and does not replace a Pulse Cannon.',
      'Measured paired deltas and opportunity-normalized use are descriptive. This runner does not tune production data or make causal claims from use ratios.',
      'Coverage diagnostics use real reducer/engine commands. Explicitly labeled fixtures may arrange a legal current state for reachability; they never set a victory or fabricate an outcome.',
    ],
  };
}

function parseArgs(args: readonly string[]): { seeds: number; output: string } {
  let seeds = 32;
  let output = '.balance/expedition-report.json';
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    requireCondition(flag === '--seeds' || flag === '--output', `Unknown argument: ${flag}`);
    requireCondition(!seen.has(flag), `Duplicate argument: ${flag}`);
    seen.add(flag);
    const value = args[++index];
    requireCondition(value !== undefined && value.trim() !== '' && !value.startsWith('--'), `${flag} requires a value.`);
    if (flag === '--seeds') {
      requireCondition(/^[1-9]\d*$/.test(value), '--seeds must be a positive decimal integer.');
      seeds = Number(value);
      requireCondition(Number.isSafeInteger(seeds) && seeds <= LIMITS.seeds, `--seeds must be 1–${LIMITS.seeds}.`);
    } else {
      requireCondition(!value.includes('\0') && value.endsWith('.json'), '--output must be a .json file path without NUL characters.');
      output = value;
    }
  }
  return { seeds, output };
}
type ReportForWrite = {
  populations: {
    fullExpeditions: { records: FullRecord[]; [key: string]: unknown };
    isolatedAuthoredEncounters: { records: IsolatedRecord[]; [key: string]: unknown };
  };
  [key: string]: unknown;
};
async function writeReportAtomic(output: string, report: ReportForWrite): Promise<void> {
  const destination = resolve(output);
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  const file = await open(temporary, 'wx');
  let bytes = 0;
  const append = async (text: string) => {
    bytes += Buffer.byteLength(text);
    requireCondition(bytes <= LIMITS.reportBytes, `Report exceeded ${LIMITS.reportBytes} bytes; previous report retained.`);
    await file.writeFile(text);
  };
  try {
    const { populations, ...topLevel } = report;
    const { records: fullRecords, ...fullSummary } = populations.fullExpeditions;
    const { records: isolatedRecords, ...isolatedSummary } = populations.isolatedAuthoredEncounters;
    await append(`${JSON.stringify(topLevel).slice(0, -1)},\"populations\":{\"fullExpeditions\":${JSON.stringify(fullSummary).slice(0, -1)},\"records\":[`);
    for (let index = 0; index < fullRecords.length; index += 1) await append(`${index ? ',' : ''}${JSON.stringify(fullRecords[index])}`);
    await append(`]},\"isolatedAuthoredEncounters\":${JSON.stringify(isolatedSummary).slice(0, -1)},\"records\":[`);
    for (let index = 0; index < isolatedRecords.length; index += 1) await append(`${index ? ',' : ''}${JSON.stringify(isolatedRecords[index])}`);
    await append(']}}}\n');
    await file.sync();
    await file.close();
    await rename(temporary, destination);
  } catch (error) {
    await file.close();
    await rm(temporary, { force: true });
    throw error;
  }
}
async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const report = await buildExpeditionReport(options.seeds);
  await writeReportAtomic(options.output, report);
  const full = report.populations.fullExpeditions.summary;
  console.log(`Full expeditions: ${full.outcomes.victory} victories / ${full.outcomes.defeat} defeats / ${full.outcomes.bounded} bounded (${full.attempts} attempts).`);
  console.log(`Isolated authored encounters: ${report.populations.isolatedAuthoredEncounters.records.length} attempts across ${report.populations.isolatedAuthoredEncounters.candidates.length} candidates.`);
  console.log(`Diagnostics: ${report.coverage.diagnosticCount} passed. No production tuning applied.`);
  console.log(`Report: ${options.output}; fingerprint: ${report.fingerprint.study}`);
}
if (import.meta.main) main().catch((error: unknown) => { console.error('Expedition study failed:', error); process.exitCode = 1; });

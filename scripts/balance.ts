import { mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { availableParallelism } from 'node:os';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { CARDS, ENCOUNTERS, REFINEMENTS, WORLD_RULES } from '../src/game/content';
import { availableEnergy, createWorld, effectiveCard, enemyCard, establishCheckpoint, legalTargets, nearbyObjects, rewindTargets, stepWorld, visibleEnemies, visibleObjects } from '../src/game/combat';
import { forecastTimeline } from '../src/game/forecast';
import { canEnter, createStoreMap, findPath, type TilePosition } from '../src/game/map';
import { chooseRunOption, createRun, dispatchRun, runOptions, TOOLKITS, type RunState, type ToolkitId } from '../src/game/run';
import type { CardDefinition, CardInstance, Direction, WorldCommand, WorldEvent, WorldState } from '../src/game/types';
import { buildFeedback, formatFeedback } from './balance-feedback';

export type PolicyName = 'strong' | 'tactical' | 'greedy';
const POLICIES: PolicyName[] = ['strong', 'tactical', 'greedy'];
const MAX_COMMANDS = 96;
const MAX_EXPEDITION_COMMANDS = 1200;
const MAX_PLANS = 64;
const WORKERS = Math.min(4, availableParallelism());
const DIRECTIONS: Array<[Direction, number, number]> = [['up', 0, -1], ['right', 1, 0], ['down', 0, 1], ['left', -1, 0]];
export type CardUsage = {
  drawn: number; handOpportunities: number; affordableOpportunities: number; legalOpportunities: number;
  played: number; attached: number; energySpent: number; replacements: number;
  surgeActivations: number; surgeGranted: number; timeActivations: number; temporalActivations: number;
  upgradeTargets: Record<string, number>;
};
export type MechanicUsage = {
  moves: number; waits: number; pursuits: number; enemyActions: number; replacements: number; energyRegained: number;
  stretch: number; compress: number; scout: number; rewindAvailable: number; rewinds: number;
  debtIncurred: number; debtRepaid: number; echoAttack: number; echoDefense: number; retained: number; retainedLaterPlayed: number;
};
export type PolicySummary = {
  fights: number; wins: number; stalls: number; winRate: number; winRate95CI: [number, number]; medianTicks: number;
  meanHp: number; medianHp: number; distinctTrajectories: number; usage: Record<string, CardUsage>; mechanics: MechanicUsage;
  samples: Array<{ seed: number; deck: string; win: boolean; hp: number; ticks: number }>;
};
export type BalanceChange =
  | { kind: 'baseline' }
  | { kind: 'card-effect'; cardId: string; effectKind: string; delta: number }
  | { kind: 'card-time'; cardId: string; delta: number }
  | { kind: 'card-level'; cardId: string; delta: number }
  | { kind: 'card-temporal'; cardId: string; delta: number }
  | { kind: 'card-scaling-effect'; cardId: string; effectIndex: number; delta: number }
  | { kind: 'card-scaling-time'; cardId: string; delta: number }
  | { kind: 'card-cost'; cardId: string; delta: number }
  | { kind: 'regen'; delta: number }
  | { kind: 'encounter'; hpScale: number; damageScale: number };
type Candidate = { id: string; change: BalanceChange };
export type BalanceRun = Candidate & { encounterId: string; deckLabel: string; policies: Record<PolicyName, PolicySummary>; pairedBaseline?: { id: string; policies: Record<PolicyName, PolicySummary> } };
type Counts = { evaluatedPlans: number; resolvedTransitions: number; fights: number; diagnosticFights: number; elapsedMs: number };
export type DiagnosticCoverage = {
  kind: 'configured-world-command-coverage-not-normal-balance'; cardUses: Record<string, number>;
  enemyActions: Record<string, { expected: string[]; exercised: string[]; unexercised: string[] }>;
  mechanics: MechanicUsage; upgradeTargets: Record<string, number>; failures: string[];
};
export type BalanceReport = {
  schemaVersion: 8; generatedAt: string; fingerprint: string; rulesModel: string; seeds: number[]; counts: Counts;
  cards: Record<string, { name: string; cost: number; roles: string[] }>; runs: BalanceRun[];
  encounters: Record<string, { id: string; name: string; kind: 'isolated-spatial-toolkit-encounters'; policies: Record<PolicyName, PolicySummary> }>;
  diagnostics: DiagnosticCoverage; expeditions: ExpeditionAnalysis;
  coverage: { uncoveredCards: string[]; normalUncoveredCards: string[]; unexercisedScalingTargets: string[]; unexercisedEnemyActions: string[]; unexercisedMechanics: string[] };
  candidateMigration: string[]; limitations: string[];
};
type ExpeditionCandidate = { id: string; change: { kind: 'baseline' } | { kind: 'toolkit-swap'; toolkit: ToolkitId; from: string; to: string } | { kind: 'card-cost'; toolkit: ToolkitId; cardId: string; delta: number } };
type ExpeditionRoute = 'supply' | 'detour';
type ExpeditionResult = {
  seed: number; toolkit: ToolkitId; policy: PolicyName; route: ExpeditionRoute; candidateId: string;
  outcome: 'victory' | 'defeat' | 'bounded'; terminalEncounter: string; completedEncounters: number; hp: number; ticks: number; commands: number;
  encounters: Array<{ id: string; tick: number; hpBefore: number; hpAfter: number; deckSize: number }>;
  choices: Array<{ phase: string; tick: number; offered: string[]; selected: string; hpBefore: number; hpAfter: number }>;
  trace: Array<{ tick: number; command: WorldCommand; rejectedMove?: WorldCommand; hpBefore: number; hpAfter: number; position: TilePosition; energy: number; surge: number; deckSize: number; visibleEnemies: string[] }>;
  finalDeck: string[]; trajectoryHash: number; usage: Record<string, CardUsage>; mechanics: MechanicUsage;
};
export type ExpeditionAnalysis = {
  kind: 'full-spatial-expedition-persistent-world'; seeds: number[]; policies: PolicyName[];
  routePolicies: Record<ExpeditionRoute, string>; rewardPolicy: string; servicePolicy: string; candidates: ExpeditionCandidate[];
  counts: Counts; results: ExpeditionResult[];
  summaries: Array<{ candidateId: string; toolkit: ToolkitId; policy: PolicyName; route: ExpeditionRoute; runs: number; wins: number; defeats: number; bounded: number;
    winRate95CI: [number, number]; meanHp: number; meanCompletedEncounters: number; medianTicks: number; terminalEncounters: Record<string, number>;
    paired?: { gainedWins: number; lostWins: number; meanHpDelta: number; meanCompletedEncountersDelta: number; winDelta95CI: [number, number] } }>;
  limitations: string[];
};
type FightResult = { seed: number; deck: string; win: boolean; stall: boolean; ticks: number; hp: number; trajectory: number; usage: Record<string, CardUsage>; mechanics: MechanicUsage; enemyActions: string[] };
const clone = <T>(value: T): T => structuredClone(value);
const counts = (): Counts => ({ evaluatedPlans: 0, resolvedTransitions: 0, fights: 0, diagnosticFights: 0, elapsedMs: 0 });
function emptyUsage(): CardUsage { return { drawn: 0, handOpportunities: 0, affordableOpportunities: 0, legalOpportunities: 0, played: 0, attached: 0, energySpent: 0, replacements: 0, surgeActivations: 0, surgeGranted: 0, timeActivations: 0, temporalActivations: 0, upgradeTargets: {} }; }
function usageTable(): Record<string, CardUsage> { return Object.fromEntries(Object.keys(CARDS).map(id => [id, emptyUsage()])); }
function emptyMechanics(): MechanicUsage { return { moves: 0, waits: 0, pursuits: 0, enemyActions: 0, replacements: 0, energyRegained: 0, stretch: 0, compress: 0, scout: 0, rewindAvailable: 0, rewinds: 0, debtIncurred: 0, debtRepaid: 0, echoAttack: 0, echoDefense: 0, retained: 0, retainedLaterPlayed: 0 }; }
function hash(text: string, seed = 2166136261): number { for (let i = 0; i < text.length; i++) seed = Math.imul(seed ^ text.charCodeAt(i), 16777619); return seed >>> 0; }
function makeDeck(ids: readonly string[], prefix: string): CardInstance[] { return ids.map((definitionId, index) => ({ uid: `${prefix}:${index}:${definitionId}`, definitionId, owner: 'bob' })); }
function scalingKeys(prefix: string, card: Pick<CardDefinition, 'effects' | 'scaling'>): string[] {
  return [...(card.scaling?.effects ?? []).flatMap((step, i) => step ? [`${prefix}:effect:${i}:${card.effects[i].kind}:${card.effects[i].recipient}`] : []), ...(card.scaling?.time?.amount ? [`${prefix}:time`] : [])];
}
function roles(card: CardDefinition): string[] { return [...card.effects.map(effect => `${effect.kind}:${effect.recipient}`), ...(card.time ? [`time:${card.time.kind}`] : []), ...(card.temporal ? [`temporal:${card.temporal.kind}${card.temporal.defenseOnly ? ':defense' : ''}`] : []), ...(card.modifier ? [`grade:${card.modifier.levels < 0 ? 'enemy' : 'friendly'}`] : []), ...(card.surge ? ['surge'] : []), ...scalingKeys('scalable', card)]; }
function mergeUsage(target: Record<string, CardUsage>, source: Record<string, CardUsage>): void {
  for (const [id, usage] of Object.entries(source)) for (const key of Object.keys(usage) as Array<keyof CardUsage>) {
    if (key === 'upgradeTargets') for (const [name, count] of Object.entries(usage[key])) target[id][key][name] = (target[id][key][name] ?? 0) + count;
    else target[id][key] += usage[key];
  }
}
function mergeMechanics(target: MechanicUsage, source: MechanicUsage): void { for (const key of Object.keys(target) as Array<keyof MechanicUsage>) target[key] += source[key]; }
function median(values: number[]): number { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); const n = sorted.length; return (sorted[Math.floor(n / 2)] + sorted[Math.floor((n - 1) / 2)]) / 2; }
export function interval95(wins: number, n: number): [number, number] {
  if (!n) return [0, 0]; const z = 1.959963984540054; const p = wins / n; const d = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / d; const margin = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}
export function pairedInterval(values: number[]): [number, number] {
  if (!values.length) return [0, 0]; const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.length > 1 ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1) : 0;
  const margin = 1.96 * Math.sqrt(variance / values.length); return [Math.max(-1, mean - margin), Math.min(1, mean + margin)];
}
function summarize(results: FightResult[]): PolicySummary {
  const usage = usageTable(); const mechanics = emptyMechanics(); for (const result of results) { mergeUsage(usage, result.usage); mergeMechanics(mechanics, result.mechanics); }
  const wins = results.filter(result => result.win).length;
  return { fights: results.length, wins, stalls: results.filter(result => result.stall).length, winRate: wins / results.length, winRate95CI: interval95(wins, results.length), medianTicks: median(results.map(result => result.ticks)), meanHp: results.reduce((sum, result) => sum + result.hp, 0) / results.length, medianHp: median(results.map(result => result.hp)), distinctTrajectories: new Set(results.map(result => result.trajectory)).size, usage, mechanics, samples: results.map(({ seed, deck, win, hp, ticks }) => ({ seed, deck, win, hp, ticks })) };
}

/** No planner branch exposes unseen actors or uses replacement identities in its value. */
function knownState(state: WorldState): WorldState {
  const ids = new Set(visibleEnemies(state).map(enemy => enemy.id));
  return {
    ...state,
    enemies: state.enemies.filter(enemy => ids.has(enemy.id)),
    checkpoints: state.checkpoints.map(checkpoint => ({
      ...checkpoint,
      snapshot: { ...checkpoint.snapshot, enemies: checkpoint.snapshot.enemies.filter(enemy => ids.has(enemy.id)) },
    })),
  };
}
function commands(state: WorldState): WorldCommand[] {
  const result: WorldCommand[] = [{ kind: 'wait' }];
  const enemies = visibleEnemies(state);
  for (const [direction, dx, dy] of DIRECTIONS) {
    const to = { x: state.player.position.x + dx, y: state.player.position.y + dy };
    if (canEnter(state.map, to, state.completedEncounters) && !enemies.some(enemy => enemy.position.x === to.x && enemy.position.y === to.y)) result.push({ kind: 'move', direction });
  }
  if (state.potions && state.player.hp < state.player.maxHp) result.push({ kind: 'potion' });
  for (const object of nearbyObjects(state)) if (distance(state.player.position, object.position) <= 1 && !state.usedObjectIds.includes(object.id)) result.push({ kind: 'interact', objectId: object.id });
  for (const card of state.hand) {
    if (CARDS[card.definitionId].cost > availableEnergy(state)) continue;
    const definition = effectiveCard(state, card.uid);
    const targets = legalTargets(state, card.uid);
    if (definition.time?.kind === 'rewind') {
      for (const tick of rewindTargets(state)) result.push({ kind: 'play', uid: card.uid, sourceId: String(tick) });
    } else if (definition.temporal?.kind === 'echo') {
      for (const entry of state.history) for (const source of entry.cards) {
        if (!targets.includes(source.id) || !source.definition) continue;
        const actorTargets = source.definition.target === 'self' ? ['bob'] : enemies.filter(enemy => distance(state.player.position, enemy.position) === 1).map(enemy => enemy.id);
        for (const targetId of actorTargets) result.push({ kind: 'play', uid: card.uid, sourceId: source.id, targetId });
      }
    } else if (targets.length) for (const targetId of targets) result.push({ kind: 'play', uid: card.uid, targetId });
    else if (definition.target === 'self' && !definition.modifier && definition.temporal?.kind !== 'retain') result.push({ kind: 'play', uid: card.uid });
  }
  for (const tick of rewindTargets(state)) result.push({ kind: 'rewind', tick });
  // Preserve every command family before deterministically sampling excess target/source combinations.
  if (result.length <= MAX_PLANS) return result;
  const groups = new Map<string, WorldCommand[]>();
  for (const command of result) { const key = command.kind === 'play' ? command.uid : command.kind; const group = groups.get(key) ?? []; group.push(command); groups.set(key, group); }
  const bounded: WorldCommand[] = [];
  for (let round = 0; bounded.length < MAX_PLANS; round++) { let added = false; for (const group of groups.values()) if (group[round] && bounded.length < MAX_PLANS) { bounded.push(group[round]); added = true; } if (!added) break; }
  return bounded;
}
function distance(a: TilePosition, b: TilePosition): number { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
type Navigation = { route: ExpeditionRoute; visited: Set<string>; knownObjects: Map<string, { id: string; kind: string; position: TilePosition }> };
function navigation(route: ExpeditionRoute): Navigation { return { route, visited: new Set(), knownObjects: new Map() }; }
function routeGoal(state: WorldState, nav: Navigation): TilePosition | undefined {
  const p = state.player.position; nav.visited.add(`${p.x},${p.y}`);
  for (const object of visibleObjects(state)) nav.knownObjects.set(object.id, object);
  const occupied = visibleEnemies(state).map(enemy => enemy.position);
  const objects = [...nav.knownObjects.values()].filter(object => !state.usedObjectIds.includes(object.id) && (object.kind !== 'exit' || state.completedEncounters.includes('night-manager')));
  const objectPaths = objects.flatMap(object => DIRECTIONS.flatMap(([, dx, dy]) => {
    const position = { x: object.position.x + dx, y: object.position.y + dy }; const path = findPath(state.map, p, position, state.completedEncounters, occupied);
    return path === null ? [] : [{ position, cost: path.length, object }];
  })).sort((a, b) => a.cost - b.cost || a.object.id.localeCompare(b.object.id));
  const desired = objectPaths.find(entry => entry.object.kind === 'exit' || entry.object.kind === 'potion' || state.player.hp < state.player.maxHp - 5 || nav.route === 'supply');
  if (desired && desired.cost <= 14) return desired.position;
  // Public floor-plan exploration only: no spawn coordinates or concealed enemy state.
  const occupiedKeys = new Set(occupied.map(position => `${position.x},${position.y}`));
  const queue = [{ position: p, steps: 0 }];
  const reached = new Set([`${p.x},${p.y}`]);
  let best: { position: TilePosition; cost: number } | undefined;
  for (let index = 0; index < queue.length; index++) {
    const { position, steps } = queue[index];
    if (!nav.visited.has(`${position.x},${position.y}`)) {
      const cost = steps + position.y * 0.12 + (nav.route === 'supply' ? position.x : state.map.width - position.x) * 0.015;
      if (!best || cost < best.cost) best = { position, cost };
    }
    for (const [, dx, dy] of DIRECTIONS) {
      const next = { x: position.x + dx, y: position.y + dy }; const key = `${next.x},${next.y}`;
      if (reached.has(key) || occupiedKeys.has(key) || !canEnter(state.map, next, state.completedEncounters)) continue;
      reached.add(key); queue.push({ position: next, steps: steps + 1 });
    }
  }
  return best?.position;
}
type Evaluation = { command: WorldCommand; key: string; score: number; greedy: number };
function chooseCommand(state: WorldState, policy: PolicyName, nav: Navigation, counters: Counts, salt: number): WorldCommand {
  const known = knownState(state); const enemies = known.enemies; const goal = routeGoal(known, nav);
  const path = goal && findPath(known.map, known.player.position, goal, known.completedEncounters, enemies.map(enemy => enemy.position));
  const preferred = path?.[0]; const evaluations: Evaluation[] = [];
  for (const command of commands(known)) {
    const next = ({ ...known }); const result = stepWorld(next, command); counters.evaluatedPlans++; if (!result.ok) continue; counters.resolvedTransitions++;
    const damage = result.events.filter(event => event.kind === 'damage' && event.actor === 'bob').reduce((sum, event) => sum + (event.amount ?? 0), 0);
    const hp = next.player.hp - known.player.hp; const dead = next.enemies.filter(enemy => enemy.hp <= 0).length - known.enemies.filter(enemy => enemy.hp <= 0).length;
    const exposed = next.enemies.reduce((sum, enemy) => sum + enemy.exposed, 0) - enemies.reduce((sum, enemy) => sum + enemy.exposed, 0);
    let value = damage * 1.4 + hp * 1.2 + dead * 35 + exposed * 0.5 + (availableEnergy(next) - availableEnergy(known)) * 0.7;
    if (next.phase === 'defeat') value -= 10000;
    if (next.phase === 'victory') value += 10000;
    if (command.kind === 'move') {
      if (!enemies.length && preferred && distance(next.player.position, preferred) === 0) value += 4;
      if (!enemies.length && !nav.visited.has(`${next.player.position.x},${next.player.position.y}`)) value += 0.8;
      const nearestBefore = Math.min(...enemies.map(enemy => distance(known.player.position, enemy.position)));
      const nearestAfter = Math.min(...enemies.map(enemy => distance(next.player.position, enemy.position)));
      if (Number.isFinite(nearestBefore)) value += (nearestBefore - nearestAfter) * 2;
    }
    if (command.kind === 'interact') value += 12;
    if (command.kind === 'wait') value -= 0.8;
    if (command.kind === 'rewind' || result.events.some(event => event.kind === 'rewind')) value -= 4;
    if (command.kind === 'play') {
      const card = effectiveCard(known, command.uid);
      if (card.modifier && command.targetId) {
        const target = known.hand.find(instance => instance.uid === command.targetId);
        if (target) { const before = effectiveCard(known, target.uid); const after = next.hand.some(instance => instance.uid === target.uid) ? effectiveCard(next, target.uid) : before;
          value += after.effects.reduce((sum, effect, i) => sum + (effect.amount - (before.effects[i]?.amount ?? 0)) * (effect.kind === 'damage' ? 1 : 0.5), 0);
        }
      }
      // Draw value counts quantity, never identity, ordering, or unknown future offers.
      value += result.events.filter(event => event.kind === 'draw').reduce((sum, event) => sum + (event.cards?.length ?? event.amount ?? 0), 0) * 0.3;
    }
    if (policy === 'strong' && next.phase === 'playing' && next.enemies.length) {
      const danger = forecastTimeline(next, Math.min(3, WORLD_RULES.forecast + next.scouting)).flatMap(card => card.events)
        .filter(event => event.kind === 'damage' && event.target === 'bob').reduce((sum, event) => sum + (event.amount ?? 0), 0);
      value -= danger * 0.2;
    }
    const replacements = result.events.filter(event => event.kind === 'draw').reduce((sum, event) => sum + (event.cards?.length ?? event.amount ?? 0), 0);
    evaluations.push({ command, key: JSON.stringify(command), score: value, greedy: damage * 4 + dead * 30 + hp * 0.4 + replacements * 0.3 + (command.kind === 'move' ? value : 0) + (command.kind === 'interact' ? 12 : 0) - (next.phase === 'defeat' ? 10000 : 0) });
  }
  if (!evaluations.length) return { kind: 'wait' };
  evaluations.sort((a, b) => (policy === 'greedy' ? b.greedy - a.greedy : b.score - a.score) || hash(a.key, salt) - hash(b.key, salt));
  return evaluations[policy === 'tactical' && salt % 4 === 0 ? (salt >>> 2) % Math.min(4, evaluations.length) : 0].command;
}
function observeOpportunities(state: WorldState, usage: Record<string, CardUsage>): void {
  const known = knownState(state); const legal = new Set<string>();
  for (const command of commands(known)) if (command.kind === 'play' && !legal.has(command.uid) && stepWorld(({ ...known }), command).ok) legal.add(command.uid);
  for (const card of state.hand) { const entry = usage[card.definitionId]; entry.handOpportunities++; if (availableEnergy(state) >= CARDS[card.definitionId].cost) entry.affordableOpportunities++; if (legal.has(card.uid)) entry.legalOpportunities++; }
}
function observe(before: WorldState, after: WorldState, command: WorldCommand, events: WorldEvent[], usage: Record<string, CardUsage>, mechanics: MechanicUsage, retained: Set<string>, actions: Set<string>): void {
  mechanics.rewindAvailable += rewindTargets(before).length;
  mechanics.moves += events.filter(event => event.kind === 'move' && event.actor === 'bob').length;
  if (command.kind === 'wait') mechanics.waits++;
  mechanics.pursuits += events.filter(event => event.kind === 'move' && event.actor !== 'bob').length;
  for (const event of events) {
    if (event.kind === 'action' && event.actor !== 'bob' && event.definition) { mechanics.enemyActions++; const enemy = before.enemies.find(actor => actor.id === event.actor); if (enemy) actions.add(`${enemy.encounterId}:${event.definition.name}`); }
    if (event.kind === 'draw') for (const card of event.cards ?? []) usage[card.definitionId].drawn++;
    if (event.kind === 'rewind') mechanics.rewinds++;
  }
  mechanics.debtIncurred += Math.max(0, after.drawDebt - before.drawDebt); mechanics.debtRepaid += Math.max(0, before.drawDebt - after.drawDebt);
  const definition = command.kind === 'play' ? effectiveCard(before, command.uid) : undefined;
  const canceled = events.some(event => event.kind === 'ringing' && event.actor === 'bob' && event.target === undefined);
  if (after.tick > before.tick && after.player.hp > 0) {
    const paidStored = Math.max(0, (definition?.cost ?? 0) - before.player.surgeEnergy);
    const grant = !canceled && !definition?.surge ? Math.min(before.player.energyMax - before.player.energy + paidStored, definition?.effects.filter(effect => effect.kind === 'energy').reduce((sum, effect) => sum + effect.amount, 0) ?? 0) : 0;
    mechanics.energyRegained += Math.max(0, after.player.energy - before.player.energy + paidStored - grant);
  }
  if (command.kind !== 'play') return;
  const source = before.hand.find(card => card.uid === command.uid); if (!source) return;
  const card = effectiveCard(before, source.uid); const entry = usage[source.definitionId]; entry.played++; entry.energySpent += card.cost;
  if (canceled) return;
  if (retained.delete(source.uid)) mechanics.retainedLaterPlayed++;
  if (after.hand.some(instance => instance.uid === source.uid)) { mechanics.retained++; retained.add(source.uid); }
  if (card.modifier && command.targetId) {
    entry.attached++; const target = before.hand.find(instance => instance.uid === command.targetId); const enemy = before.enemies.find(actor => actor.id === command.targetId);
    const keys = target ? scalingKeys(`card:${target.definitionId}`, effectiveCard(before, target.uid)) : enemy ? scalingKeys(`intent:${enemy.encounterId}:${enemyCard(before, enemy.id).name}`, enemyCard(before, enemy.id)) : [];
    for (const key of keys) entry.upgradeTargets[key] = (entry.upgradeTargets[key] ?? 0) + 1;
  }
  if (card.surge) { entry.surgeActivations++; entry.surgeGranted += Math.max(0, after.player.surgeEnergy - Math.max(0, before.player.surgeEnergy - card.cost)); }
  if (card.time) { entry.timeActivations++; if (card.time.kind !== 'rewind') mechanics[card.time.kind]++; }
  if (card.temporal) { entry.temporalActivations++; if (card.temporal.kind === 'echo') { if (card.temporal.defenseOnly) mechanics.echoDefense++; else mechanics.echoAttack++; } }
  const drawn = events.filter(event => event.kind === 'draw').reduce((sum, event) => sum + (event.cards?.length ?? 0), 0);
  if (!after.hand.some(instance => instance.uid === source.uid) && !before.drawDebt && drawn > 0 && card.temporal?.kind !== 'borrow') { entry.replacements++; mechanics.replacements++; }
}

/** Explicit isolated encounter fixture, not a route shortcut or expedition result. */
function encounterWorld(seed: number, deck: CardInstance[], encounterId: string, diagnostic = false): WorldState {
  const state = createWorld(seed, clone(deck)); const enemy = state.enemies.find(actor => actor.encounterId === encounterId); if (!enemy) throw new Error(`Missing map encounter ${encounterId}`);
  state.enemies = [enemy];
  // Keep the production map/furniture and pursuit algorithm, but place this encounter in the entrance aisle.
  enemy.position = { x: 11, y: 32 }; enemy.aware = true; state.player.position = { x: diagnostic ? 10 : 8, y: 32 };
  if (diagnostic) { state.player.hp = state.player.maxHp = 10000; enemy.hp = enemy.maxHp = 10000; state.player.energy = state.player.energyMax; }
  establishCheckpoint(state); return state;
}
function fight(seed: number, policy: PolicyName, deck: CardInstance[], encounterId: string, counters: Counts): FightResult {
  const state = encounterWorld(seed, deck, encounterId); const usage = usageTable(); const mechanics = emptyMechanics(); const nav = navigation('supply'); const retained = new Set<string>(); const actions = new Set<string>(); let trajectory = 2166136261;
  for (const card of state.hand) usage[card.definitionId].drawn++;
  for (let n = 0; n < MAX_COMMANDS && state.phase === 'playing'; n++) {
    observeOpportunities(state, usage); const command = chooseCommand(state, policy, nav, counters, hash(`${seed}:${policy}:${n}`)); const before = ({ ...state }); const result = stepWorld(state, command); counters.resolvedTransitions++;
    if (!result.ok) throw new Error(`Planner submitted illegal ${JSON.stringify(command)}: ${result.reason}`);
    observe(before, state, command, result.events, usage, mechanics, retained, actions); trajectory = hash(JSON.stringify(command), trajectory);
  }
  counters.fights++; return { seed, deck: deck.map(card => card.definitionId).join(','), win: state.enemies.every(enemy => enemy.hp <= 0), stall: state.phase === 'playing', ticks: state.tick, hp: state.player.hp, trajectory, usage, mechanics, enemyActions: [...actions] };
}

function candidates(cards: Record<string, CardDefinition>): Candidate[] {
  const result: Candidate[] = [{ id: 'baseline', change: { kind: 'baseline' } }];
  const signed = (amount: number) => [-1, 1].filter(delta => amount + delta !== 0 && Math.sign(amount + delta) === Math.sign(amount));
  for (const [cardId, card] of Object.entries(cards)) {
    const add = (label: string, change: BalanceChange) => result.push({ id: `card:${cardId}:${label}`, change });
    if (card.effects[0]) {
      const effect = card.effects[0]; for (const delta of [-1, 1]) if (effect.amount + delta >= 0) add(`${effect.kind}:${delta}`, { kind: 'card-effect', cardId, effectKind: effect.kind, delta });
      if (card.surge && effect.amount > 1) add(`${effect.kind}:zero`, { kind: 'card-effect', cardId, effectKind: effect.kind, delta: -effect.amount });
    }
    if (card.modifier) for (const delta of signed(card.modifier.levels)) add(`level:${delta}`, { kind: 'card-level', cardId, delta });
    if (card.temporal?.amount !== undefined) for (const delta of [-1, 1]) if (card.temporal.amount + delta > 0 && card.temporal.amount + delta <= 2) add(`temporal-amount:${delta}`, { kind: 'card-temporal', cardId, delta });
    for (const [effectIndex, step] of (card.scaling?.effects ?? []).entries()) if (step) for (const delta of signed(step)) add(`scaling-effect-${effectIndex}:${delta}`, { kind: 'card-scaling-effect', cardId, effectIndex, delta });
    if (card.time && card.time.kind !== 'rewind') for (const delta of [-1, 1]) if (card.time.amount + delta > 0) add(`time-${card.time.kind}:${delta}`, { kind: 'card-time', cardId, delta });
    if (card.scaling?.time?.amount) for (const delta of signed(card.scaling.time.amount)) add(`scaling-time:${delta}`, { kind: 'card-scaling-time', cardId, delta });
    for (const delta of [-1, 1]) if (card.cost + delta >= 0) add(`cost:${delta}`, { kind: 'card-cost', cardId, delta });
  }
  for (const hpScale of [0.9, 1.1, 1.25]) result.push({ id: `encounter:hp:${hpScale}`, change: { kind: 'encounter', hpScale, damageScale: 1 } });
  for (const damageScale of [0.9, 1.1, 1.35, 1.6, 1.85]) result.push({ id: `encounter:damage:${damageScale}`, change: { kind: 'encounter', hpScale: 1, damageScale } });
  for (const delta of [-1, 1]) result.push({ id: `world:energy-per-tick:${delta}`, change: { kind: 'regen', delta } });
  return result;
}
function applyChange(change: BalanceChange): void {
  switch (change.kind) {
    case 'baseline': return;
    case 'card-cost': CARDS[change.cardId].cost += change.delta; return;
    case 'card-effect': CARDS[change.cardId].effects.find(effect => effect.kind === change.effectKind)!.amount += change.delta; return;
    case 'card-level': CARDS[change.cardId].modifier!.levels += change.delta; return;
    case 'card-temporal': CARDS[change.cardId].temporal!.amount! += change.delta; return;
    case 'card-time': CARDS[change.cardId].time!.amount += change.delta; return;
    case 'card-scaling-effect': CARDS[change.cardId].scaling!.effects![change.effectIndex] += change.delta; return;
    case 'card-scaling-time': CARDS[change.cardId].scaling!.time!.amount += change.delta; return;
    case 'regen': WORLD_RULES.energyPerTick += change.delta; return;
    case 'encounter': for (const encounter of Object.values(ENCOUNTERS)) { encounter.hp = Math.round(encounter.hp * change.hpScale); for (const action of encounter.actions) for (const effect of action.effects) if (effect.kind === 'damage') effect.amount = Math.round(effect.amount * change.damageScale); } return;
  }
}
function studyContext(change: BalanceChange): { label: string; deck: CardInstance[] } {
  const cardId = 'cardId' in change ? change.cardId : undefined; const containing = cardId && TOOLKITS.find(toolkit => toolkit.deck.includes(cardId));
  if (containing) return { label: `toolkit:${containing.id}`, deck: makeDeck(containing.deck, `study:${containing.id}`) };
  const base = cardId && Object.entries(REFINEMENTS).find(([, refined]) => refined === cardId)?.[0];
  const toolkit = (base ? TOOLKITS.find(entry => entry.deck.includes(base)) : TOOLKITS.find(entry => entry.id === 'second-coat')) ?? TOOLKITS[0];
  const ids = [...toolkit.deck]; if (base && cardId) ids[ids.indexOf(base)] = cardId; else if (cardId) ids.push(cardId);
  return { label: base ? `refined:${toolkit.id}:${base}->${cardId}` : cardId ? `reward-added:${toolkit.id}:${cardId}` : `toolkit:${toolkit.id}`, deck: makeDeck(ids, 'study') };
}

function diagnosticCoverage(counters: Counts): DiagnosticCoverage {
  const usage = usageTable(); const mechanics = emptyMechanics(); const actions = new Set<string>(); const retained = new Set<string>(); const failures: string[] = [];
  const execute = (state: WorldState, command: WorldCommand): boolean => {
    const before = ({ ...state }); const result = stepWorld(state, command); counters.resolvedTransitions++;
    if (result.ok) observe(before, state, command, result.events, usage, mechanics, retained, actions);
    return result.ok;
  };
  // Configured hands and large HP reservoirs are coverage-only. Every counted use still passes stepWorld.
  const fixture = (ids: string[], encounterId = 'security') => {
    const state = encounterWorld(101, makeDeck([...ids, 'hammer', 'vest', 'coffee', 'brace', 'hammer', 'vest', 'coffee', 'brace'], `coverage:${encounterId}:${counters.diagnosticFights}`), encounterId, true);
    state.hand = state.deck.slice(0, ids.length); state.drawPile = state.deck.slice(ids.length); state.discardPile = []; establishCheckpoint(state); counters.diagnosticFights++; return state;
  };
  for (const id of Object.keys(CARDS)) {
    const state = fixture([id, 'hammer', 'vest', 'reinforce', 'weaken', 'heavy', 'surge', 'coffee']);
    // Seed real source history and a legal rewind point, not invented timeline recipes.
    execute(state, { kind: 'play', uid: state.hand.find(card => card.definitionId === 'hammer' && card.uid !== state.deck[0].uid)!.uid, targetId: state.enemies[0].id });
    execute(state, { kind: 'play', uid: state.hand.find(card => card.definitionId === 'vest' && card.uid !== state.deck[0].uid)!.uid });
    while (state.player.energy < state.player.energyMax) execute(state, { kind: 'wait' });
    const source = state.hand.find(card => card.uid === state.deck[0].uid);
    const command = source && commands(state).find(command => command.kind === 'play' && command.uid === source.uid && (() => { const trial = ({ ...state }); return stepWorld(trial, command).ok; })());
    if (!command || !execute(state, command)) failures.push(`card:${id}`);
    if (CARDS[id].temporal?.kind === 'retain' && command?.kind === 'play' && command.targetId) {
      for (let play = 0; play < 2; play++) {
        const retainedCommand = commands(state).find(next => next.kind === 'play' && next.uid === command.targetId && stepWorld(({ ...state }), next).ok);
        if (retainedCommand) execute(state, retainedCommand);
        else failures.push(`retained-play:${id}:${play}`);
      }
    }
    for (let n = 0; n < 4; n++) {
      const next = commands(state).find(next => next.kind === 'play' && next.uid !== source?.uid && stepWorld(({ ...state }), next).ok);
      execute(state, next ?? { kind: 'wait' });
    }
  }
  for (const [id, card] of Object.entries(CARDS)) if (scalingKeys(`card:${id}`, card).length) {
    const state = fixture(['reinforce', id, 'hammer', 'vest', 'surge']); const target = state.hand[1];
    execute(state, { kind: 'play', uid: state.hand[0].uid, targetId: target.uid });
    while (state.player.energy < state.player.energyMax) execute(state, { kind: 'wait' });
    const command = commands(state).find(command => command.kind === 'play' && command.uid === target.uid && stepWorld(({ ...state }), command).ok);
    if (command) execute(state, command); else failures.push(`scaled-play:${id}`);
  }
  for (const encounter of Object.values(ENCOUNTERS)) {
    // Each authored action is a configured coverage target, not a simulated expedition.
    // A prior Ringing action must not prevent grading the next action's authored effects.
    for (let index = 0; index < encounter.actions.length; index++) {
      const state = fixture(['weaken'], encounter.id);
      state.enemies[0].actionIndex = index;
      establishCheckpoint(state);
      const source = state.hand[0];
      const grade = commands(state).find(command => command.kind === 'play' && command.uid === source.uid);
      execute(state, grade ?? { kind: 'wait' });
    }
    // Pursuit is independently exercised with production paths and action progression.
    const walking = encounterWorld(102, makeDeck(['overtime', 'clockout', 'hammer', 'vest', 'coffee'], 'pursuit'), encounter.id, true);
    walking.player.position = { x: 8, y: 32 }; establishCheckpoint(walking);
    for (let n = 0; n < encounter.actions.length + 3; n++) execute(walking, { kind: 'wait' });
  }
  const upgradeTargets: Record<string, number> = {};
  for (const entry of Object.values(usage)) for (const [key, value] of Object.entries(entry.upgradeTargets)) upgradeTargets[key] = (upgradeTargets[key] ?? 0) + value;
  return { kind: 'configured-world-command-coverage-not-normal-balance', cardUses: Object.fromEntries(Object.entries(usage).map(([id, entry]) => [id, entry.played])),
    enemyActions: Object.fromEntries(Object.values(ENCOUNTERS).map(encounter => { const expected = encounter.actions.map(action => action.name); const exercised = expected.filter(name => actions.has(`${encounter.id}:${name}`)); return [encounter.id, { expected, exercised, unexercised: expected.filter(name => !exercised.includes(name)) }]; })), mechanics, upgradeTargets, failures };
}

const EXPEDITION_CANDIDATES: ExpeditionCandidate[] = [
  { id: 'baseline', change: { kind: 'baseline' } },
  { id: 'overnight-vest-to-brace', change: { kind: 'toolkit-swap', toolkit: 'overnight', from: 'vest', to: 'brace' } },
  { id: 'overnight-vest-to-quickfix', change: { kind: 'toolkit-swap', toolkit: 'overnight', from: 'vest', to: 'quickfix' } },
  { id: 'second-coat-vest-to-brace', change: { kind: 'toolkit-swap', toolkit: 'second-coat', from: 'vest', to: 'brace' } },
  { id: 'second-coat-vest-to-quickfix', change: { kind: 'toolkit-swap', toolkit: 'second-coat', from: 'vest', to: 'quickfix' } },
  { id: 'second-coat-echo-cost-down', change: { kind: 'card-cost', toolkit: 'second-coat', cardId: 'echo', delta: -1 } },
  { id: 'second-coat-vest-to-finisher', change: { kind: 'toolkit-swap', toolkit: 'second-coat', from: 'vest', to: 'finisher' } },
];
const EXPEDITION_ROUTES: ExpeditionRoute[] = ['supply', 'detour'];
const REWARD_PRIORITY = ['finisher', 'crowbar', 'brace', 'hammer', 'quickfix'];
type ExpeditionJob = { seed: number; toolkit: ToolkitId; policy: PolicyName; route: ExpeditionRoute; candidate: ExpeditionCandidate };
function expeditionOption(run: RunState): string {
  const options = runOptions(run); const available = (id: string) => options.find(option => option.id === id)?.id;
  if (run.world.phase === 'reward') return REWARD_PRIORITY.map(id => options.find(option => option.cardId === id)?.id).find(Boolean) ?? options.find(option => option.cardId && CARDS[option.cardId].type === 'attack')?.id ?? available('reward:skip') ?? options[0]?.id;
  if (run.world.phase === 'service') return (run.world.player.hp < run.world.player.maxHp ? available('service:heal') : undefined) ?? options.find(option => option.id.includes('refine') && option.cardId === 'hammer-refined')?.id ?? available('service:continue') ?? options[0]?.id;
  throw new Error(`No world option for ${run.world.phase}`);
}
function expedition(job: ExpeditionJob, counters: Counts): ExpeditionResult {
  const run = createRun(job.seed, job.toolkit); const nav = navigation(job.route); const usage = usageTable(); const mechanics = emptyMechanics(); const retained = new Set<string>(); const actions = new Set<string>();
  const encounters: ExpeditionResult['encounters'] = []; const choices: ExpeditionResult['choices'] = []; let trajectoryHash = 2166136261; let commandCount = 0; let terminalEncounter = 'entrance';
  const trace: ExpeditionResult['trace'] = [];
  for (const card of run.world.hand) usage[card.definitionId].drawn++;
  for (; commandCount < MAX_EXPEDITION_COMMANDS && run.world.phase !== 'victory'; commandCount++) {
    if (run.world.phase === 'reward' || run.world.phase === 'service') {
      const phase = run.world.phase; const tick = run.world.tick; const offered = runOptions(run).map(option => option.id); const selected = expeditionOption(run); const hpBefore = run.world.player.hp;
      if (!selected || !offered.includes(selected)) throw new Error(`No legal ${phase} choice`); const result = chooseRunOption(run, selected); if (!result.ok) throw new Error(result.reason);
      choices.push({ phase, tick, offered, selected, hpBefore, hpAfter: run.world.player.hp }); trajectoryHash = hash(selected, trajectoryHash); continue;
    }
    if (run.world.phase === 'defeat' && (!rewindTargets(run.world).length || job.policy === 'greedy')) break;
    const known = visibleEnemies(run.world); if (known.length) terminalEncounter = known[0].encounterId;
    observeOpportunities(run.world, usage);
    const command = run.world.phase === 'defeat' ? { kind: 'rewind' as const, tick: rewindTargets(run.world)[0] } : chooseCommand(run.world, job.policy, nav, counters, hash(`${job.seed}:${job.policy}:${commandCount}`));
    const before = ({ ...run.world }); const result = dispatchRun(run, command); counters.resolvedTransitions++;
    let acceptedCommand = command;
    if (!result.ok) {
      // Concealed pursuers may occupy a tile that was legal to the information-limited planner.
      if (command.kind !== 'move') throw new Error(`Illegal expedition ${JSON.stringify(command)}: ${result.reason}`);
      acceptedCommand = { kind: 'wait' };
      const wait = dispatchRun(run, acceptedCommand); counters.resolvedTransitions++;
      if (!wait.ok) throw new Error(wait.reason); observe(before, run.world, acceptedCommand, wait.events, usage, mechanics, retained, actions);
    } else observe(before, run.world, command, result.events, usage, mechanics, retained, actions);
    trace.push({ tick: run.world.tick, command: acceptedCommand, rejectedMove: result.ok ? undefined : command, hpBefore: before.player.hp, hpAfter: run.world.player.hp, position: { ...run.world.player.position }, energy: run.world.player.energy, surge: run.world.player.surgeEnergy, deckSize: run.world.deck.length, visibleEnemies: visibleEnemies(run.world).map(enemy => enemy.id) });
    for (const id of run.world.completedEncounters.filter(id => !before.completedEncounters.includes(id))) { encounters.push({ id, tick: run.world.tick, hpBefore: before.player.hp, hpAfter: run.world.player.hp, deckSize: run.world.deck.length }); counters.fights++; terminalEncounter = id; }
    trajectoryHash = hash(`${JSON.stringify(command)}:${run.world.tick}:${run.world.player.hp}`, trajectoryHash);
  }
  return { seed: job.seed, toolkit: job.toolkit, policy: job.policy, route: job.route, candidateId: job.candidate.id, outcome: run.world.phase === 'victory' || run.world.phase === 'defeat' ? run.world.phase : 'bounded', terminalEncounter, completedEncounters: run.world.completedEncounters.length, hp: run.world.player.hp, ticks: run.world.tick, commands: commandCount, encounters, choices, trace, finalDeck: run.world.deck.map(card => card.definitionId), trajectoryHash, usage, mechanics };
}
export async function buildExpeditionAnalysis(seeds: number[], policies: PolicyName[] = POLICIES, candidateIds?: string[]): Promise<ExpeditionAnalysis> {
  if (!seeds.length || new Set(seeds).size !== seeds.length || seeds.some(seed => !Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff)) throw new Error('Expedition seeds must be distinct unsigned 32-bit integers.');
  if (!policies.length || new Set(policies).size !== policies.length || policies.some(policy => !POLICIES.includes(policy))) throw new Error('Expedition policies must be distinct declared policies.');
  if (candidateIds?.some(id => !EXPEDITION_CANDIDATES.some(candidate => candidate.id === id))) throw new Error('Unknown expedition candidate.');
  const selected = EXPEDITION_CANDIDATES.filter(candidate => candidate.id === 'baseline' || !candidateIds || candidateIds.includes(candidate.id)); const counter = counts(); const started = performance.now();
  const jobs = selected.flatMap(candidate => TOOLKITS.filter(toolkit => candidate.change.kind === 'baseline' || candidate.change.toolkit === toolkit.id).flatMap(toolkit => policies.flatMap(policy => EXPEDITION_ROUTES.flatMap(route => seeds.map(seed => ({ seed, toolkit: toolkit.id, policy, route, candidate }))))));
  const results = await studyJobs<ExpeditionResult>(jobs, counter); counter.elapsedMs = performance.now() - started;
  const groups = new Map<string, ExpeditionResult[]>(); const baselines = new Map<string, ExpeditionResult>();
  for (const result of results) { const key = `${result.candidateId}:${result.toolkit}:${result.policy}:${result.route}`; const group = groups.get(key) ?? []; group.push(result); groups.set(key, group); if (result.candidateId === 'baseline') baselines.set(`${result.toolkit}:${result.policy}:${result.route}:${result.seed}`, result); }
  const summaries = [...groups.values()].map((group): ExpeditionAnalysis['summaries'][number] => {
    const { candidateId, toolkit, policy, route } = group[0]; const wins = group.filter(result => result.outcome === 'victory').length; const terminalEncounters: Record<string, number> = {};
    for (const result of group) { const key = `${result.outcome}:${result.terminalEncounter}`; terminalEncounters[key] = (terminalEncounters[key] ?? 0) + 1; }
    const pairs = group.map(result => ({ result, baseline: baselines.get(`${toolkit}:${policy}:${route}:${result.seed}`)! }));
    return { candidateId, toolkit, policy, route, runs: group.length, wins, defeats: group.filter(result => result.outcome === 'defeat').length, bounded: group.filter(result => result.outcome === 'bounded').length, winRate95CI: interval95(wins, group.length), meanHp: group.reduce((sum, result) => sum + result.hp, 0) / group.length, meanCompletedEncounters: group.reduce((sum, result) => sum + result.completedEncounters, 0) / group.length, medianTicks: median(group.map(result => result.ticks)), terminalEncounters,
      paired: candidateId === 'baseline' ? undefined : { gainedWins: pairs.filter(({ result, baseline }) => result.outcome === 'victory' && baseline.outcome !== 'victory').length, lostWins: pairs.filter(({ result, baseline }) => result.outcome !== 'victory' && baseline.outcome === 'victory').length, meanHpDelta: pairs.reduce((sum, { result, baseline }) => sum + result.hp - baseline.hp, 0) / group.length, meanCompletedEncountersDelta: pairs.reduce((sum, { result, baseline }) => sum + result.completedEncounters - baseline.completedEncounters, 0) / group.length, winDelta95CI: pairedInterval(pairs.map(({ result, baseline }) => Number(result.outcome === 'victory') - Number(baseline.outcome === 'victory'))) } };
  });
  return { kind: 'full-spatial-expedition-persistent-world', seeds: [...seeds], policies: [...policies], routePolicies: { supply: 'Explore reachable unseen floor tiles northward with a west-side tie preference; visit visible supplies, potions and services.', detour: 'Explore reachable unseen floor tiles northward with an east-side tie preference; collect visible potions and visit recovery when injured.' }, rewardPolicy: `Choose an actual offered card in priority ${REWARD_PRIORITY.join(', ')}, then an attack, then skip.`, servicePolicy: 'Choose an actual heal when injured, otherwise an offered hammer refinement, otherwise continue.', candidates: clone(selected), counts: counter, results, summaries, limitations: [
    `Full expeditions start at createRun and only use dispatchRun/chooseRunOption. Persistent HP, individual card zones, rewards, checkpoints, services, pursuit and exit interactions are real. No forced defeats, victories, unlocks or route teleports. Maximum ${MAX_EXPEDITION_COMMANDS} commands including reward choices; bound is distinct from defeat.`,
    'Route policies use the public floor plan, visited positions and currently visible objects/enemies. They do not inspect concealed actor positions, seeded draw order or future rewards. Detour/supply are translated spatial exploration profiles, not the obsolete route graph.',
    'The six toolkit/cost expedition studies retain their original cards and values. Common seeds and deterministic policy tie salts are paired by toolkit/policy/route; differing commands can create different draw and reward consumption.',
    'Win CIs are Wilson intervals; paired delta intervals are normal approximations over seed differences and degenerate all-equal pairs do not prove certainty. No multiplicity correction; many candidates, limited seeds and bounded heuristics require human playtesting. Terminal HP is incomparable across different depths. No automatic tuning.',
  ] };
}
type StudyJob = { seeds: number[]; policy: PolicyName; change: BalanceChange; decks: CardInstance[][]; encounterId: string };
async function studyJobs<Result>(jobs: Array<StudyJob | ExpeditionJob>, counter: Counts): Promise<Result[]> {
  if (!jobs.length) return []; const workers: Worker[] = []; const { promise, resolve, reject } = Promise.withResolvers<Result[]>(); const results = new Array<Result>(jobs.length); let next = 0; let finished = 0; let settled = false;
  const fail = (error: Error) => { if (!settled) { settled = true; reject(error); } }; const dispatch = (worker: Worker) => { if (next < jobs.length) worker.postMessage({ index: next, job: jobs[next++] }); };
  try {
    for (let i = 0; i < Math.min(WORKERS, jobs.length); i++) {
      const worker = new Worker(new URL(import.meta.url), { workerData: 'balance-study' }); workers.push(worker); worker.on('error', fail); worker.on('exit', code => fail(new Error(`Balance worker exited before completion (${code})`)));
      worker.on('message', (message: { index: number; result: Result; counts: Counts }) => { results[message.index] = message.result; counter.evaluatedPlans += message.counts.evaluatedPlans; counter.resolvedTransitions += message.counts.resolvedTransitions; counter.fights += message.counts.fights; counter.diagnosticFights += message.counts.diagnosticFights; finished++; if (finished === jobs.length) { settled = true; resolve(results); } else dispatch(worker); }); dispatch(worker);
    }
    return await promise;
  } finally { settled = true; await Promise.all(workers.map(worker => worker.terminate())); }
}
async function fingerprint(seeds: number[]): Promise<string> {
  const paths = ['../src/game/combat.ts', '../src/game/content.ts', '../src/game/random.ts', '../src/game/types.ts', '../src/game/upgrades.ts', '../src/game/run.ts', '../src/game/map.ts', '../src/game/forecast.ts', './balance.ts', './balance-feedback.ts'];
  const source = await Promise.all(paths.map(async path => `${path}\n${await Bun.file(new URL(path, import.meta.url)).text()}`));
  const bytes = new TextEncoder().encode(source.join('\n') + JSON.stringify({ seeds, map: createStoreMap(), rules: WORLD_RULES, cards: CARDS, encounters: ENCOUNTERS, toolkits: TOOLKITS }));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function buildReport(seeds: number[]): Promise<BalanceReport> {
  const counter = counts(); const started = performance.now(); const jobs: StudyJob[] = [];
  const schedule = (decks: CardInstance[][], change: BalanceChange, encounterId = 'security') => POLICIES.map(policy => jobs.push({ seeds, policy, change, decks, encounterId }) - 1);
  const baselines = new Map<string, { id: string; indices: number[] }>();
  const plannedRuns = candidates(CARDS).map(candidate => { const context = studyContext(candidate.change); let baseline = baselines.get(context.label); if (candidate.change.kind !== 'baseline' && !baseline) { baseline = { id: `paired-baseline:${context.label}`, indices: schedule([context.deck], { kind: 'baseline' }) }; baselines.set(context.label, baseline); } return { candidate, context, baseline, indices: schedule([context.deck], candidate.change) }; });
  const plannedEncounters = Object.values(ENCOUNTERS).map(encounter => ({ encounter, indices: schedule(TOOLKITS.map(toolkit => makeDeck(toolkit.deck, `encounter:${toolkit.id}`)), { kind: 'baseline' }, encounter.id) }));
  const results = await studyJobs<PolicySummary>(jobs, counter); const policies = (indices: number[]) => Object.fromEntries(POLICIES.map((policy, i) => [policy, results[indices[i]]])) as Record<PolicyName, PolicySummary>;
  const runs = plannedRuns.map(({ candidate, context, baseline, indices }) => ({ ...candidate, encounterId: 'security', deckLabel: context.label, policies: policies(indices), pairedBaseline: baseline ? { id: baseline.id, policies: policies(baseline.indices) } : undefined }));
  const encounters = Object.fromEntries(plannedEncounters.map(({ encounter, indices }) => [encounter.id, { id: encounter.id, name: encounter.name, kind: 'isolated-spatial-toolkit-encounters' as const, policies: policies(indices) }]));
  const diagnostics = diagnosticCoverage(counter); const expeditions = await buildExpeditionAnalysis(seeds); counter.elapsedMs = performance.now() - started;
  const normalCards = new Set<string>(); const scaling = new Set(Object.keys(diagnostics.upgradeTargets));
  for (const run of [...runs, ...Object.values(encounters)]) for (const summary of Object.values(run.policies)) for (const [id, usage] of Object.entries(summary.usage)) { if (usage.played) normalCards.add(id); for (const key of Object.keys(usage.upgradeTargets)) scaling.add(key); }
  const expectedScaling = [...Object.entries(CARDS).flatMap(([id, card]) => scalingKeys(`card:${id}`, card)), ...Object.values(ENCOUNTERS).flatMap(encounter => encounter.actions.flatMap(action => scalingKeys(`intent:${encounter.id}:${action.name}`, action)))];
  const requiredMechanics: Array<keyof MechanicUsage> = ['pursuits', 'enemyActions', 'replacements', 'energyRegained', 'stretch', 'compress', 'scout', 'rewindAvailable', 'rewinds', 'debtIncurred', 'debtRepaid', 'echoAttack', 'echoDefense', 'retained', 'retainedLaterPlayed'];
  return { schemaVersion: 8, generatedAt: new Date().toISOString(), fingerprint: await fingerprint(seeds), rulesModel: 'WorldState/RunState v2. Ordinary moves, waits, interactions, potions and cards advance one whole tick. Cardinal pursuit and ordered authored actions use actor progress, never absolute encounter offsets. Energy regenerates continuously and spent cards are individually replaced. Stretch doubles enemy action duration; Compress permits two actions; Rewind instead restores an earlier canonical snapshot and spends its non-refundable charge.', seeds, counts: counter,
    cards: Object.fromEntries(Object.entries(CARDS).map(([id, card]) => [id, { name: card.name, cost: card.cost, roles: roles(card) }])), runs, encounters, diagnostics, expeditions,
    coverage: { uncoveredCards: Object.keys(CARDS).filter(id => !diagnostics.cardUses[id]), normalUncoveredCards: Object.keys(CARDS).filter(id => !normalCards.has(id)), unexercisedScalingTargets: expectedScaling.filter(key => !scaling.has(key)), unexercisedEnemyActions: Object.entries(diagnostics.enemyActions).flatMap(([id, entry]) => entry.unexercised.map(name => `${id}:${name}`)), unexercisedMechanics: requiredMechanics.filter(key => !diagnostics.mechanics[key]) },
    candidateMigration: [
      'Retained every primary effect ±1, Surge zero-grant, signed grade level, Borrow amount, nonzero authored scaling increment, legal cost ±1, enemy HP ×0.9/1.1/1.25 and enemy damage ×0.9/1.1/1.35/1.6/1.85 candidate.',
      'Overtime bracket positions ±1 -> Stretch duration ±1 tick; Clock Out negative bracket positions ±1 -> Compress duration ±1 tick. Both authored bracket scaling families -> positive duration scaling ±1 (nonzero signed steps only). No speed-ratio tuning: player tick and enemy 2/1/0.5 action ratios remain fixed.',
      'Lookout bracket scouting ±1 and scaling ±1 -> additional forecast horizon ±1 and horizon scaling ±1. Added stored-energy regeneration ±1 to study continuous replacement resource pressure, including zero regen. Rewind retains its fixed eight-tick window, no invented scaling or window expansion candidate.',
      'Preserved all six expedition toolkit/card-cost studies exactly. Former fixed-route supply/detour labels now identify public-floor-plan exploration profiles; no obsolete bracket or absolute enemy-schedule simulation remains.',
    ], limitations: [
      `At most ${MAX_PLANS} round-robin source/family commands per decision and ${MAX_COMMANDS} commands per isolated encounter; strong scores one real tick plus three visible idle forecast ticks, tactical one tick with bounded exploration, greedy immediate damage. All caps are reported; policies are not optimal or human skill levels.`,
      'Candidates use same-deck baselines and all seeds, not a universal baseline deck. Toolkit/refinement/reward-added contexts are explicitly labeled. Independent encounters isolate one production enemy in the real entrance aisle at full HP; their wins are not complete expedition wins.',
      'Coverage-only fixtures configure hands and large HP reservoirs, never outcomes. Usage and action coverage require accepted production commands/events. Failed coverage remains visible and fails the CLI after writing its report.',
      'Planning simulates only currently visible actors; canonical execution still includes every concealed pursuer. Replacement quantity has a small fixed heuristic value; replacement identities, hidden actors and future offers never affect choice scoring. Scouting has no fabricated information-value score.',
      'Legal-use opportunities count source commands, not timeline slots. Each hand UID is counted once per decision; usage ratios are exposure normalization, not causal power, especially for zero-cost cards.',
      'Exploration bonuses apply only without visible threats, preventing artificial rewards for endless combat retreat. Strong uses bounded idle-risk weighting; greedy values replacement quantity, never replacement identity. These policy choices are heuristics, not production balance tuning.',
      `Deterministic result ordering with at most ${WORKERS} isolated workers. Work scales as candidates × seeds × 3 × ${MAX_COMMANDS} × ${MAX_PLANS}, plus expeditions × ${MAX_EXPEDITION_COMMANDS}. Transactional projections share immutable history instead of deep-copying it. No seed/candidate shrinkage; CI allows 120 minutes. Full expedition traces stream to an atomic report file to avoid JavaScript's single-string limit.`,
      'Wilson 95% seed intervals and paired differences do not account for multiple comparisons, heuristic misspecification, player skill or correlated toolkit strata. No candidate is automatically applied to production.',
    ] };
}
function parseArgs(args: string[]): { seeds: number; output: string } {
  let seeds = 32; let output = '.balance/report.json';
  for (let i = 0; i < args.length; i++) { const argument = args[i]; if (argument !== '--seeds' && argument !== '--output') throw new Error(`Unknown argument: ${argument}`); const value = args[++i]; if (value === undefined) throw new Error(`${argument} requires a value`); if (argument === '--seeds') { seeds = Number(value); if (!Number.isSafeInteger(seeds) || seeds <= 0 || seeds > 0xffffffff) throw new Error('--seeds must be a positive unsigned 32-bit integer'); } else { if (!value.trim()) throw new Error('--output must not be empty'); output = value; } }
  return { seeds, output };
}
async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2)); const report = await buildReport(Array.from({ length: options.seeds }, (_, i) => i + 1)); const feedback = buildFeedback(report);
  await mkdir(dirname(options.output), { recursive: true });
  const { expeditions, ...summary } = report;
  const { results, ...expeditionSummary } = expeditions;
  const temporary = `${options.output}.tmp`;
  const sink = Bun.file(temporary).writer();
  // Full paired-seed traces exceed a single JavaScript string. Stream one expedition at a time.
  try {
    sink.write(`${JSON.stringify({ ...summary, feedback }).slice(0, -1)},"expeditions":`);
    sink.write(`${JSON.stringify(expeditionSummary).slice(0, -1)},"results":[`);
    for (let index = 0; index < results.length; index++) {
      if (index) sink.write(',');
      sink.write(JSON.stringify(results[index]));
      await sink.flush();
    }
    sink.write(']}}\n');
  } finally {
    await sink.end();
  }
  await rename(temporary, options.output);
  console.log(formatFeedback(feedback));
  console.log(`Report ${options.output}: ${report.runs.length} candidates; ${report.counts.fights} isolated encounters; ${report.expeditions.results.length} complete expedition attempts; fingerprint ${report.fingerprint}`);
  const failures = [...report.coverage.uncoveredCards, ...report.coverage.unexercisedScalingTargets, ...report.coverage.unexercisedEnemyActions, ...report.coverage.unexercisedMechanics, ...report.diagnostics.failures];
  if (failures.length) { console.error(`Coverage failed (report retained): ${failures.join(', ')}`); process.exitCode = 1; }
}
if (!isMainThread && workerData === 'balance-study') {
  const originalCards = clone(CARDS); const originalEncounters = clone(ENCOUNTERS); const originalRules = clone(WORLD_RULES); const originalDecks = TOOLKITS.map(toolkit => [...toolkit.deck]);
  parentPort!.on('message', ({ index, job }: { index: number; job: StudyJob | ExpeditionJob }) => {
    Object.assign(CARDS, clone(originalCards)); Object.assign(ENCOUNTERS, clone(originalEncounters)); Object.assign(WORLD_RULES, originalRules); TOOLKITS.forEach((toolkit, i) => { toolkit.deck = [...originalDecks[i]]; }); const counter = counts();
    if ('candidate' in job) { const change = job.candidate.change; if (change.kind === 'toolkit-swap') { const toolkit = TOOLKITS.find(entry => entry.id === change.toolkit)!; const slot = toolkit.deck.indexOf(change.from); if (slot < 0 || !CARDS[change.to]) throw new Error(`Invalid toolkit candidate ${job.candidate.id}`); toolkit.deck[slot] = change.to; } else if (change.kind === 'card-cost') applyChange(change); parentPort!.postMessage({ index, result: expedition(job, counter), counts: counter }); }
    else { applyChange(job.change); const result = summarize(job.decks.flatMap(deck => job.seeds.map(seed => fight(seed, job.policy, deck, job.encounterId, counter)))); parentPort!.postMessage({ index, result, counts: counter }); }
  });
} else if (import.meta.main) main().catch((error: unknown) => { console.error('Balance runner failed:', error); process.exitCode = 1; });

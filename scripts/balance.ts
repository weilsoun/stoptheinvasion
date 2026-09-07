import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { buildFeedback, formatFeedback } from './balance-feedback';
import { CARDS, ENCOUNTER, STARTER_DECK, enemyIntent } from '../src/game/content';
import {
  attachModifier,
  availableEnergy,
  canAttachModifier,
  createCombat,
  queueCard,
  removeModifier,
  resolveTurn,
  turnEnd,
  visibleEnd,
} from '../src/game/combat';
import type { CardDefinition, CombatState, ModifierTarget } from '../src/game/types';

export type PolicyName = 'strong' | 'tactical' | 'greedy';
export type CardUsage = {
  drawn: number;
  handOpportunities: number;
  affordableOpportunities: number;
  legalOpportunities: number;
  playablePositionOpportunities: number;
  visiblePositionOpportunities: number;
  played: number;
  attached: number;
  scoutedPositions: number;
  energySpent: number;
};
export type PolicySummary = {
  fights: number;
  wins: number;
  stalls: number;
  winRate: number;
  winRate95CI: [number, number];
  medianTurns: number;
  meanHp: number;
  medianHp: number;
  distinctTrajectories: number;
  usage: Record<string, CardUsage>;
};
export type BalanceChange =
  | { kind: 'baseline' }
  | { kind: 'card-effect'; cardId: string; effectKind: string; delta: number }
  | { kind: 'card-bracket'; cardId: string; field: 'positions' | 'scouting'; delta: number }
  | { kind: 'card-cost'; cardId: string; delta: number }
  | { kind: 'encounter'; hpScale: number; damageScale: number };
export type BalanceRun = {
  id: string;
  change: BalanceChange;
  policies: Record<PolicyName, PolicySummary>;
};
export type BalanceReport = {
  schemaVersion: 2;
  generatedAt: string;
  rulesModel: string;
  fingerprint: string;
  seeds: number[];
  counts: { evaluatedPlans: number; resolvedTransitions: number; fights: number; elapsedMs: number };
  cards: Record<string, { name: string; cost: number; roles: string[] }>;
  runs: BalanceRun[];
  coverage: { uncoveredCards: string[] };
  limitations: string[];
};

const POLICIES: PolicyName[] = ['strong', 'tactical', 'greedy'];
const MAX_TURNS = 20;
const MAX_ACTION_STATES = 256;
const MAX_PLANS = 256;

type Counters = BalanceReport['counts'];
type Plan = {
  key: string;
  state: CombatState;
  playedUids: string[];
  attachedUids: string[];
  spent: number;
  greedyValue: number;
};
type Evaluation = Plan & {
  next: CombatState;
  drawnDefinitionIds: string[];
  firedUids: string[];
  guardDamage: number;
  bobDamage: number;
};
type FightResult = {
  win: boolean;
  stall: boolean;
  turns: number;
  hp: number;
  trajectory: string;
  usage: Record<string, CardUsage>;
};
type Candidate = { id: string; change: BalanceChange };

function clone<T>(value: T): T {
  return structuredClone(value);
}

/** History is presentation-only, so analysis projects it away before branching or resolving. */
function clonePlanningState(state: CombatState): CombatState {
  return clone({ ...state, history: [] });
}

function emptyUsage(): CardUsage {
  return {
    drawn: 0,
    handOpportunities: 0,
    affordableOpportunities: 0,
    legalOpportunities: 0,
    playablePositionOpportunities: 0,
    visiblePositionOpportunities: 0,
    played: 0,
    attached: 0,
    scoutedPositions: 0,
    energySpent: 0,
  };
}

function usageTable(): Record<string, CardUsage> {
  return Object.fromEntries(Object.keys(CARDS).map((id) => [id, emptyUsage()]));
}

function definitionIdForUid(state: CombatState, uid: string): string | undefined {
  const card = state.hand.find((entry) => entry.uid === uid)
    ?? state.attachments.find((entry) => entry.card.uid === uid)?.card
    ?? state.queue.slice(state.position, visibleEnd(state)).flatMap((entry) => entry?.kind === 'player' ? [entry.card] : []).find((entry) => entry.uid === uid);
  return card?.definitionId;
}

function targetLabel(state: CombatState, target: ModifierTarget): string {
  if (target.kind === 'bracket') return 'bracket';
  if (target.kind === 'slot') return `position:${target.slot}`;
  const player = state.hand.find((card) => card.uid === target.uid)
    ?? state.queue.slice(state.position, turnEnd(state)).flatMap((entry) => entry?.kind === 'player' ? [entry.card] : []).find((card) => card.uid === target.uid);
  if (player) return `card:${player.definitionId}`;
  const enemy = state.queue.slice(state.position, turnEnd(state)).find((entry) => entry?.kind === 'enemy' && entry.uid === target.uid);
  return enemy?.kind === 'enemy' ? `intent:${enemy.name}` : 'card:unknown';
}

function planKey(state: CombatState): string {
  const actions: string[] = [];
  for (let position = state.position; position < turnEnd(state); position += 1) {
    const action = state.queue[position];
    if (action?.kind === 'player') actions.push(`${action.card.definitionId}@${position}`);
  }
  const modifiers = state.attachments.map((entry) => `${entry.card.definitionId}>${targetLabel(state, entry.target)}`);
  return [...actions, ...modifiers].join(',') || 'pass';
}

function stateKey(state: CombatState): string {
  const queue: string[] = [];
  for (let position = state.position; position < visibleEnd(state); position += 1) {
    const entry = state.queue[position];
    if (entry) {
      queue.push(`${position}:${entry.kind === 'player' ? `p:${entry.card.uid}>${entry.target}` : `e:${entry.uid}`}`);
    }
  }
  const attachments = state.attachments.map((entry) => {
    const target = entry.target.kind === 'bracket'
      ? 'bracket'
      : entry.target.kind === 'card' ? `card:${entry.target.uid}` : `position:${entry.target.slot}`;
    return `${entry.card.uid}>${target}`;
  }).join('|');
  const actors = (['bob', 'guard'] as const).map((id) => {
    const actor = state.actors[id];
    return `${id}:${actor.hp}:${actor.block}:${actor.exposed}:${Number(actor.ringing)}:${Number(actor.ringingNextTurn)}:${actor.energy}:${actor.turnLength}:${actor.scouting}`;
  }).join('|');
  const inventory = [state.hand, state.drawPile, state.discardPile]
    .map((pile) => pile.map((card) => card.uid).join(','))
    .join('/');
  return `${state.seed}:${state.turn}@${state.position}-${turnEnd(state)}:${visibleEnd(state)}/${actors}/${inventory}/${queue.join('|')}/${attachments}`;
}

function hash(value: string, seed = 2166136261): number {
  let result = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function bounded(states: CombatState[], limit: number, salt: string): CombatState[] {
  const unique = new Map<string, CombatState>();
  for (const state of states) unique.set(stateKey(state), state);
  if (unique.size <= limit) return [...unique.values()];
  return [...unique.entries()]
    .sort(([left], [right]) => hash(`${salt}:${left}`) - hash(`${salt}:${right}`) || left.localeCompare(right))
    .slice(0, limit)
    .map(([, state]) => state);
}

function canonicalModifierTargets(state: CombatState, uid: string): ModifierTarget[] {
  const targets: ModifierTarget[] = [];
  for (const card of state.hand) {
    const target = { kind: 'card', uid: card.uid } as const;
    if (canAttachModifier(state, uid, target)) targets.push(target);
  }
  for (let position = state.position; position < turnEnd(state); position += 1) {
    const action = state.queue[position];
    if (!action) continue;
    const target = { kind: 'card', uid: action.kind === 'player' ? action.card.uid : action.uid } as const;
    if (canAttachModifier(state, uid, target)) targets.push(target);
  }
  // Occupied position targets are resolution-equivalent to their card target. Empty current-bracket
  // positions are equivalent for a completed plan, so retain one representative.
  for (let position = state.position; position < turnEnd(state); position += 1) {
    if (state.queue[position] !== null) continue;
    const target = { kind: 'slot', slot: position } as const;
    if (canAttachModifier(state, uid, target)) targets.push(target);
    break;
  }
  return targets;
}

function enumeratePlans(source: CombatState): Plan[] {
  const bracketModifiers = source.hand.filter((card) => CARDS[card.definitionId].bracket).map((card) => card.uid);
  const ordinary = source.hand.filter((card) => {
    const cardDefinition = CARDS[card.definitionId];
    return !cardDefinition.modifier && !cardDefinition.bracket;
  }).map((card) => card.uid);
  const damageModifiers = source.hand.filter((card) => CARDS[card.definitionId].modifier).map((card) => card.uid);
  let states = [clonePlanningState(source)];

  // Bracket changes come first because they define the legal absolute action range and visible future.
  for (const uid of bracketModifiers) {
    const expanded = [...states];
    for (const state of states) {
      const sourceCard = state.hand.find((card) => card.uid === uid);
      if (!sourceCard) continue;
      const scouting = CARDS[sourceCard.definitionId].bracket?.scouting ?? 0;
      const next = clonePlanningState(state);
      if (!attachModifier(next, uid, { kind: 'bracket' }).ok) continue;
      expanded.push(next);
      if (scouting > 0) {
        const refunded = clonePlanningState(next);
        if (removeModifier(refunded, uid).ok) expanded.push(refunded);
      }
    }
    states = bounded(expanded, MAX_PLANS, `${source.seed}:${source.position}:bracket:${uid}`);
  }

  for (const uid of ordinary) {
    const expanded = [...states];
    for (const state of states) {
      if (!state.hand.some((card) => card.uid === uid)) continue;
      for (let position = state.position; position < turnEnd(state); position += 1) {
        if (state.queue[position] !== null) continue;
        const next = clonePlanningState(state);
        if (queueCard(next, uid, null, position).ok) expanded.push(next);
      }
    }
    states = bounded(expanded, MAX_ACTION_STATES, `${source.seed}:${source.position}:action:${uid}`);
  }

  for (const uid of damageModifiers) {
    const expanded = [...states];
    for (const state of states) {
      if (!state.hand.some((card) => card.uid === uid)) continue;
      for (const target of canonicalModifierTargets(state, uid)) {
        const next = clonePlanningState(state);
        if (attachModifier(next, uid, target).ok) expanded.push(next);
      }
    }
    states = bounded(expanded, MAX_PLANS, `${source.seed}:${source.position}:damage-modifier:${uid}`);
  }
  states = bounded(states, MAX_PLANS, `${source.seed}:${source.position}:complete`);

  return states.map((state) => {
    const played = state.queue.slice(state.position, turnEnd(state))
      .flatMap((entry) => entry?.kind === 'player' ? [entry.card] : []);
    const attached = state.attachments.map((entry) => entry.card);
    const printedDamage = played.reduce((total, card) => total + CARDS[card.definitionId].effects
      .filter((effect) => effect.kind === 'damage')
      .reduce((sum, effect) => sum + effect.amount, 0), 0);
    const modifierValue = state.attachments.reduce((total, attachment) => {
      if (!CARDS[attachment.card.definitionId].modifier) return total;
      const target = attachment.target;
      const hasAction = target.kind === 'slot'
        ? target.slot >= state.position && target.slot < turnEnd(state) && state.queue[target.slot] !== null
        : target.kind === 'card' && state.queue.slice(state.position, turnEnd(state))
          .some((action) => action && (action.kind === 'player' ? action.card.uid : action.uid) === target.uid);
      return total + (hasAction ? Math.max(0, CARDS[attachment.card.definitionId].modifier?.damage ?? 0) : 0);
    }, 0);
    return {
      key: planKey(state),
      state,
      playedUids: played.map((card) => card.uid),
      attachedUids: attached.map((card) => card.uid),
      spent: state.actors.bob.energy - availableEnergy(state),
      greedyValue: printedDamage + modifierValue,
    };
  });
}

function scaleVisibleIntentDamage(state: CombatState, scale: number): void {
  if (scale === 1) return;
  for (let position = state.position; position < visibleEnd(state); position += 1) {
    const action = state.queue[position];
    if (action?.kind !== 'enemy') continue;
    const baseline = enemyIntent(position);
    if (!baseline) continue;
    for (let index = 0; index < action.effects.length; index += 1) {
      if (action.effects[index].kind === 'damage') {
        action.effects[index].amount = Math.round(baseline.effects[index].amount * scale);
      }
    }
  }
}

function evaluatePlans(state: CombatState, damageScale: number, counters: Counters): Evaluation[] {
  return enumeratePlans(state).map((plan) => {
    scaleVisibleIntentDamage(plan.state, damageScale);
    const steps = resolveTurn(plan.state);
    counters.evaluatedPlans += 1;
    counters.resolvedTransitions += 1;
    const next = steps.at(-1)!.state;
    if (next.phase === 'planning') scaleVisibleIntentDamage(next, damageScale);
    const drawnDefinitionIds = steps.flatMap((step) => step.events.flatMap((event) =>
      event.kind === 'draw' ? (event.cards ?? []).map((card) => card.definitionId) : []));
    const firedUids = steps.flatMap(step => step.events.flatMap(event => {
      if (event.kind !== 'action' || event.actor !== 'bob' || event.slot === undefined) return [];
      const action = plan.state.queue[event.slot];
      return action?.kind === 'player' ? [action.card.uid] : [];
    }));
    return {
      ...plan,
      next,
      drawnDefinitionIds,
      firedUids,
      guardDamage: state.actors.guard.hp - next.actors.guard.hp,
      bobDamage: state.actors.bob.hp - next.actors.bob.hp,
    };
  });
}

function score(evaluation: Evaluation, policy: PolicyName): number {
  if (evaluation.next.phase === 'victory') return 1_000_000_000 + evaluation.next.actors.bob.hp * 10_000 - evaluation.spent;
  if (evaluation.next.phase === 'defeat') return -1_000_000_000 + evaluation.guardDamage;
  if (policy === 'greedy') return evaluation.greedyValue * 1_000 + evaluation.guardDamage - evaluation.spent * 0.01;
  const bob = evaluation.next.actors.bob;
  const guard = evaluation.next.actors.guard;
  return evaluation.guardDamage * 70 - evaluation.bobDamage * 65 + bob.hp * 4 - guard.hp * 2
    + bob.energy * 3 + evaluation.next.hand.length + guard.exposed * 2 - bob.exposed * 3 - evaluation.spent * 0.1;
}

function random(seed: number): () => number {
  let current = seed >>> 0;
  return () => {
    current += 0x6d2b79f5;
    let value = current;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function choose(evaluations: Evaluation[], policy: PolicyName, rng: () => number): Evaluation {
  if (policy === 'tactical' && rng() < 0.25) return evaluations[Math.floor(rng() * evaluations.length)];
  const ranked = evaluations.slice().sort((left, right) => score(right, policy) - score(left, policy) || left.key.localeCompare(right.key));
  const best = score(ranked[0], policy);
  const tied = ranked.filter((entry) => score(entry, policy) === best);
  return tied[Math.floor(rng() * tied.length)];
}

function hasLegalUse(state: CombatState, uid: string): boolean {
  const card = state.hand.find((entry) => entry.uid === uid);
  if (!card) return false;
  const cardDefinition = CARDS[card.definitionId];
  if (cardDefinition.bracket) return canAttachModifier(state, uid, { kind: 'bracket' });
  if (cardDefinition.modifier) return canonicalModifierTargets(state, uid).length > 0;
  for (let position = state.position; position < turnEnd(state); position += 1) {
    if (state.queue[position] !== null) continue;
    if (queueCard(clonePlanningState(state), uid, null, position).ok) return true;
  }
  return false;
}

function observeOpportunities(state: CombatState, planned: CombatState, usage: Record<string, CardUsage>): void {
  const energy = availableEnergy(state);
  const end = turnEnd(planned);
  let playablePositions = 0;
  for (let position = planned.position; position < end; position += 1) {
    if (planned.queue[position]?.kind !== 'enemy') playablePositions += 1;
  }
  const visiblePositions = visibleEnd(planned) - planned.position;
  for (const card of state.hand) {
    const entry = usage[card.definitionId];
    entry.handOpportunities += 1;
    entry.playablePositionOpportunities += playablePositions;
    entry.visiblePositionOpportunities += visiblePositions;
    if (CARDS[card.definitionId].cost <= energy) entry.affordableOpportunities += 1;
    if (hasLegalUse(state, card.uid)) entry.legalOpportunities += 1;
  }
}

function observeChoice(evaluation: Evaluation, usage: Record<string, CardUsage>): void {
  for (const uid of evaluation.playedUids) {
    const definitionId = definitionIdForUid(evaluation.state, uid);
    if (!definitionId) throw new Error(`Chosen card ${uid} has no live definition.`);
    if (evaluation.firedUids.includes(uid)) usage[definitionId].played += 1;
    usage[definitionId].energySpent += CARDS[definitionId].cost;
  }
  for (const uid of evaluation.attachedUids) {
    const definitionId = definitionIdForUid(evaluation.state, uid);
    if (!definitionId) throw new Error(`Chosen attachment ${uid} has no live definition.`);
    usage[definitionId].attached += 1;
    usage[definitionId].scoutedPositions += CARDS[definitionId].bracket?.scouting ?? 0;
    usage[definitionId].energySpent += CARDS[definitionId].cost;
  }
  for (const definitionId of evaluation.drawnDefinitionIds) usage[definitionId].drawn += 1;
}

function fight(seed: number, policy: PolicyName, damageScale: number, counters: Counters): FightResult {
  let state = createCombat(seed);
  scaleVisibleIntentDamage(state, damageScale);
  const usage = usageTable();
  for (const card of state.hand) usage[card.definitionId].drawn += 1;
  const rng = random(hash(`${policy}:${seed}`));
  const trajectory: string[] = [];
  let turns = 0;

  while (state.phase === 'planning' && turns < MAX_TURNS) {
    const selected = choose(evaluatePlans(state, damageScale, counters), policy, rng);
    observeOpportunities(state, selected.state, usage);
    observeChoice(selected, usage);
    trajectory.push(`t${state.turn}@${state.position}:${selected.key}`);
    state = selected.next;
    turns += 1;
  }
  counters.fights += 1;
  return {
    win: state.phase === 'victory',
    stall: state.phase === 'planning',
    turns,
    hp: state.actors.bob.hp,
    trajectory: trajectory.join('|'),
    usage,
  };
}

function median(values: number[]): number {
  const sorted = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function interval95(wins: number, fights: number): [number, number] {
  if (!fights) return [0, 0];
  const z = 1.959963984540054;
  const rate = wins / fights;
  const denominator = 1 + z * z / fights;
  const center = (rate + z * z / (2 * fights)) / denominator;
  const margin = z * Math.sqrt(rate * (1 - rate) / fights + z * z / (4 * fights * fights)) / denominator;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

function summarize(fights: FightResult[]): PolicySummary {
  const wins = fights.filter((fight) => fight.win).length;
  const usage = usageTable();
  for (const fight of fights) {
    for (const [id, source] of Object.entries(fight.usage)) {
      const target = usage[id];
      for (const key of Object.keys(source) as (keyof CardUsage)[]) target[key] += source[key];
    }
  }
  return {
    fights: fights.length,
    wins,
    stalls: fights.filter((fight) => fight.stall).length,
    winRate: wins / fights.length,
    winRate95CI: interval95(wins, fights.length),
    medianTurns: median(fights.map((fight) => fight.turns)),
    meanHp: fights.reduce((sum, fight) => sum + fight.hp, 0) / fights.length,
    medianHp: median(fights.map((fight) => fight.hp)),
    distinctTrajectories: new Set(fights.map((fight) => fight.trajectory)).size,
    usage,
  };
}

function restoreContent(cards: Record<string, CardDefinition>, encounter: typeof ENCOUNTER): void {
  for (const id of Object.keys(CARDS)) delete CARDS[id];
  Object.assign(CARDS, clone(cards));
  Object.assign(ENCOUNTER, encounter);
}

function applyChange(change: BalanceChange, cards: Record<string, CardDefinition>, encounter: typeof ENCOUNTER): number {
  restoreContent(cards, encounter);
  if (change.kind === 'baseline') return 1;
  if (change.kind === 'card-cost') {
    CARDS[change.cardId].cost += change.delta;
    return 1;
  }
  if (change.kind === 'card-bracket') {
    const bracket = CARDS[change.cardId].bracket!;
    bracket[change.field] = (bracket[change.field] ?? 0) + change.delta;
    return 1;
  }
  if (change.kind === 'card-effect') {
    const card = CARDS[change.cardId];
    if (change.effectKind === 'modifier') card.modifier!.damage += change.delta;
    else card.effects.find((effect) => effect.kind === change.effectKind)!.amount += change.delta;
    return 1;
  }
  ENCOUNTER.enemyHp = Math.round(encounter.enemyHp * change.hpScale);
  return change.damageScale;
}

function candidates(cards: Record<string, CardDefinition>): Candidate[] {
  const result: Candidate[] = [{ id: 'baseline', change: { kind: 'baseline' } }];
  for (const [id, card] of Object.entries(cards)) {
    const primaryKind = card.modifier ? 'modifier' : card.effects[0]?.kind;
    const primaryAmount = card.modifier?.damage ?? card.effects[0]?.amount;
    if (primaryKind !== undefined && primaryAmount !== undefined) {
      for (const delta of [-1, 1]) {
        if (primaryKind !== 'modifier' && primaryAmount + delta < 0) continue;
        result.push({
          id: `card:${id}:${primaryKind}:${delta > 0 ? '+1' : '-1'}`,
          change: { kind: 'card-effect', cardId: id, effectKind: primaryKind, delta },
        });
      }
    }
    if (card.bracket) {
      for (const field of ['positions', 'scouting'] as const) {
        const amount = card.bracket[field];
        if (amount === undefined) continue;
        for (const delta of [-1, 1]) {
          if (field === 'scouting' && amount + delta < 0) continue;
          result.push({
            id: `card:${id}:bracket-${field}:${delta > 0 ? '+1' : '-1'}`,
            change: { kind: 'card-bracket', cardId: id, field, delta },
          });
        }
      }
    }
    for (const delta of [-1, 1]) {
      if (card.cost + delta < 0) continue;
      result.push({
        id: `card:${id}:cost:${delta > 0 ? '+1' : '-1'}`,
        change: { kind: 'card-cost', cardId: id, delta },
      });
    }
  }
  for (const hpScale of [0.9, 1.1, 1.25]) {
    result.push({ id: `encounter:hp:${hpScale}`, change: { kind: 'encounter', hpScale, damageScale: 1 } });
  }
  for (const damageScale of [0.9, 1.1, 1.35, 1.6, 1.85]) {
    result.push({ id: `encounter:damage:${damageScale}`, change: { kind: 'encounter', hpScale: 1, damageScale } });
  }
  return result;
}

function roles(card: CardDefinition): string[] {
  const result = card.effects.map((effect) => `effect:${effect.kind}:${effect.recipient}`);
  if (card.modifier) {
    const polarity = card.modifier.damage < 0 ? 'negative' : card.modifier.damage > 0 ? 'positive' : 'neutral';
    result.push(`modifier:damage:${polarity}`);
  }
  if (card.bracket?.positions) {
    result.push(`bracket:positions:${card.bracket.positions > 0 ? 'extend' : 'shorten'}`);
  }
  if (card.bracket?.scouting) result.push('bracket:scouting');
  return [...new Set(result)];
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'undefined';
}

async function fingerprint(cards: Record<string, CardDefinition>, encounter: typeof ENCOUNTER): Promise<string> {
  const source = await Promise.all([
    Bun.file(new URL('../src/game/combat.ts', import.meta.url)).text(),
    Bun.file(new URL('../src/game/content.ts', import.meta.url)).text(),
    Bun.file(new URL('../src/game/types.ts', import.meta.url)).text(),
    Bun.file(new URL('./balance.ts', import.meta.url)).text(),
    Bun.file(new URL('./balance-feedback.ts', import.meta.url)).text(),
  ]);
  const all24Schedule = Array.from({ length: 24 }, (_, position) => ({ position, intent: enemyIntent(position) }));
  const bytes = new TextEncoder().encode(`${source.join('\n')}\n${stable({ cards, encounter, deck: STARTER_DECK, all24Schedule })}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function buildReport(seeds: number[]): Promise<BalanceReport> {
  const originalCards = clone(CARDS);
  const originalEncounter = { ...ENCOUNTER };
  const counters: Counters = { evaluatedPlans: 0, resolvedTransitions: 0, fights: 0, elapsedMs: 0 };
  const started = performance.now();
  try {
    const runs: BalanceRun[] = [];
    for (const candidate of candidates(originalCards)) {
      const damageScale = applyChange(candidate.change, originalCards, originalEncounter);
      const policies = {} as Record<PolicyName, PolicySummary>;
      for (const policy of POLICIES) {
        policies[policy] = summarize(seeds.map((seed) => fight(seed, policy, damageScale, counters)));
      }
      runs.push({ id: candidate.id, change: candidate.change, policies });
    }
    counters.elapsedMs = performance.now() - started;
    const exercised = new Set<string>();
    for (const run of runs) {
      for (const policy of POLICIES) {
        for (const [id, usage] of Object.entries(run.policies[policy].usage)) {
          if (usage.played + usage.attached > 0) exercised.add(id);
        }
      }
    }
    restoreContent(originalCards, originalEncounter);
    return {
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      rulesModel: 'Canonical production combat engine: persistent absolute-position timeline resolving toward higher indices; current turn bracket is playable and scouted future is inspectable only.',
      fingerprint: await fingerprint(originalCards, originalEncounter),
      seeds,
      counts: counters,
      cards: Object.fromEntries(Object.entries(originalCards).map(([id, card]) => [id, { name: card.name, cost: card.cost, roles: roles(card) }])),
      runs,
      coverage: { uncoveredCards: Object.keys(originalCards).filter((id) => !exercised.has(id)) },
      limitations: [
        `Heuristic policies are neither human nor optimal play and look ahead only one canonical resolveTurn transition, for at most ${MAX_TURNS} turns.`,
        `Search keeps at most ${MAX_ACTION_STATES} action states and ${MAX_PLANS} complete plans per turn using deterministic sampling; bracket modifiers are enumerated before actions, but large hands can still leave legal combinations unevaluated.`,
        'Only the absolute current bracket is planned or scored. Scouted positions are read only after a real scouting attachment reveals them; cached positions beyond visibleEnd are never inspected.',
        'Scouting has no combat score or fabricated information-value bonus. Its attachment and revealed-position counts prove actual use, but this one-turn policy cannot measure how a human values future knowledge.',
        'Opportunity counts include the changing playable and visible position exposure available while each card is in hand; raw use rates remain policy-dependent.',
        'Equivalent occupied card/position damage-attachment routes are represented by the card target, and equivalent empty current-bracket routes by one position.',
        'Analysis projects presentation-only timeline history to an empty array before every branch and resolution; absolute position, queue, actors, cards, attachments, and resources remain in the simulation and state keys.',
        'Confidence intervals reflect sampled seeds and policy behavior, not player populations; every candidate reuses the same paired seed set and isolates only the named data change.',
        'Strong scores one-turn outcomes; tactical uses that score but makes a uniformly random legal choice on 25% of turns; greedy prioritizes printed damage. Policy randomness is separate from combat RNG.',
        'Played counts include only actions that actually fire; energy spent includes all commitments, including actions canceled by earlier lethal damage.',
        'Candidates are diagnostics only. The runner reports measured comparisons and never applies tuning to production content.',
      ],
    };
  } finally {
    restoreContent(originalCards, originalEncounter);
  }
}

function parseArgs(args: string[]): { seeds: number; output: string } {
  let seeds = 32;
  let output = '.balance/report.json';
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument !== '--seeds' && argument !== '--output') throw new Error(`Unknown argument: ${argument}`);
    const value = args[++index];
    if (value === undefined) throw new Error(`${argument} requires a value.`);
    if (argument === '--seeds') {
      seeds = Number(value);
      if (!Number.isSafeInteger(seeds) || seeds <= 0) throw new Error('--seeds must be a positive safe integer.');
    } else {
      if (!value.trim()) throw new Error('--output must not be empty.');
      output = value;
    }
  }
  return { seeds, output };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const report = await buildReport(Array.from({ length: options.seeds }, (_, index) => index + 1));
  const feedback = buildFeedback(report);
  await mkdir(dirname(options.output), { recursive: true });
  await Bun.write(options.output, `${JSON.stringify({ ...report, feedback }, null, 2)}\n`);
  console.log(formatFeedback(feedback));
  console.log(`Report: ${options.output} | ${report.counts.fights} fights | ${report.counts.evaluatedPlans} evaluated plans | fingerprint ${report.fingerprint.slice(0, 12)}`);
  if (report.coverage.uncoveredCards.length) {
    console.error(`Balance coverage failed: no chosen play or attachment for ${report.coverage.uncoveredCards.join(', ')}. The report was still written.`);
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(`Balance runner failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}

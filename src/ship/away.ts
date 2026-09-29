import { CREW, CREW_IDS, EXPEDITION_RULES, crewStats } from './expedition-content';
import type {
  AwayBattleEvent,
  AwayBattleState,
  AwayEnemySpec,
  AwayMission,
  AwayStepResult,
  AwayUnit,
  CrewMember,
} from './expedition-types';

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}


function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function validateEnemy(enemy: AwayEnemySpec, ids: Set<string>): void {
  if (!enemy || typeof enemy !== 'object'
    || !nonEmptyString(enemy.id)
    || !nonEmptyString(enemy.name)
    || !['drone', 'warden', 'stalker'].includes(enemy.appearance)
    || !positiveInteger(enemy.hp)
    || !positiveInteger(enemy.attack)
    || !positiveInteger(enemy.speed)
    || ids.has(enemy.id)) {
    throw new TypeError('Malformed away mission.');
  }
  ids.add(enemy.id);
}

function validateMission(mission: AwayMission, crewIds: readonly string[]): void {
  if (!mission || typeof mission !== 'object'
    || !nonEmptyString(mission.id)
    || !nonEmptyString(mission.title)
    || !nonEmptyString(mission.description)
    || typeof mission.diplomacyRequired !== 'number' || !Number.isInteger(mission.diplomacyRequired) || mission.diplomacyRequired < 0
    || typeof mission.diplomacyCost !== 'number' || !Number.isInteger(mission.diplomacyCost) || mission.diplomacyCost < 0
    || !Array.isArray(mission.enemies)
    || mission.enemies.length === 0) {
    throw new TypeError('Malformed away mission.');
  }

  const ids = new Set(crewIds);
  for (const enemy of mission.enemies) validateEnemy(enemy, ids);
}

function crewUnit(member: CrewMember): AwayUnit {
  const definition = CREW[member.id];
  const stats = crewStats(member);
  return {
    id: member.id,
    name: definition.name,
    side: 'crew',
    crewId: member.id,
    appearance: member.id,
    hp: stats.hp,
    maxHp: stats.hp,
    guard: 0,
    maxGuard: EXPEDITION_RULES.awayGuardCap,
    attack: stats.attack,
    speed: stats.speed,
    ability: stats.ability,
    abilityName: definition.abilityName,
    abilityAmount: stats.abilityAmount,
    actionCount: 0,
  };
}

function enemyUnit(enemy: AwayEnemySpec): AwayUnit {
  return {
    id: enemy.id,
    name: enemy.name,
    side: 'enemy',
    appearance: enemy.appearance,
    hp: enemy.hp,
    maxHp: enemy.hp,
    guard: 0,
    maxGuard: EXPEDITION_RULES.awayGuardCap,
    attack: enemy.attack,
    speed: enemy.speed,
    ability: 'strike',
    abilityName: 'Strike',
    abilityAmount: enemy.attack,
    actionCount: 0,
  };
}

export function createAwayBattle(crew: readonly CrewMember[], mission: AwayMission): AwayBattleState {
  if (!Array.isArray(crew) || crew.length === 0 || crew.length > EXPEDITION_RULES.teamSize) {
    throw new TypeError('Away team must contain one to three crew members.');
  }

  const selected = new Set<string>();
  for (const member of crew) {
    if (!member || typeof member !== 'object'
      || !CREW_IDS.includes(member.id)
      || !Number.isInteger(member.level) || member.level < 1 || member.level > 3
      || !nonEmptyString(member.cardUid)
      || selected.has(member.id)) {
      throw new TypeError('Away team contains duplicate, unknown, or invalid crew.');
    }
    selected.add(member.id);
  }
  validateMission(mission, crew.map(member => member.id));

  const units = [...crew.map(crewUnit), ...mission.enemies.map(enemyUnit)];
  const positions = new Map(units.map((unit, index) => [unit.id, index]));
  const order = units
    .map(unit => unit.id)
    .sort((leftId, rightId) => {
      const left = units[positions.get(leftId)!];
      const right = units[positions.get(rightId)!];
      return right.speed - left.speed
        || (left.side === right.side ? 0 : left.side === 'crew' ? -1 : 1)
        || positions.get(leftId)! - positions.get(rightId)!;
    });

  return {
    missionId: mission.id,
    round: 1,
    phase: 'playing',
    units,
    order,
    cursor: 0,
    reason: '',
  };
}


function living(state: AwayBattleState, side: AwayUnit['side']): AwayUnit[] {
  return state.units.filter(unit => unit.side === side && unit.hp > 0);
}

function targetFor(state: AwayBattleState, actor: AwayUnit): AwayUnit | undefined {
  const side = actor.side === 'crew' ? 'enemy' : 'crew';
  return living(state, side)[0];
}

function applyDamage(actor: AwayUnit, target: AwayUnit, amount: number, events: AwayBattleEvent[]): void {
  const actual = Math.min(amount, target.guard + target.hp);
  const guardDamage = Math.min(target.guard, amount);
  target.guard -= guardDamage;
  target.hp = Math.max(0, target.hp - (amount - guardDamage));
  events.push({
    type: 'damage',
    actorId: actor.id,
    targetId: target.id,
    amount: actual,
    hp: target.hp,
    guard: target.guard,
    text: `${actor.name} dealt ${actual} damage to ${target.name}.`,
  });
}

function applyGuard(actor: AwayUnit, target: AwayUnit, amount: number, events: AwayBattleEvent[]): void {
  const gained = Math.min(amount, target.maxGuard - target.guard);
  target.guard += gained;
  events.push({
    type: 'guard',
    actorId: actor.id,
    targetId: target.id,
    amount: gained,
    hp: target.hp,
    guard: target.guard,
    text: `${target.name} gained ${gained} Guard.`,
  });
}

function applyHeal(actor: AwayUnit, target: AwayUnit, amount: number, events: AwayBattleEvent[]): void {
  const restored = Math.min(amount, target.maxHp - target.hp);
  target.hp += restored;
  events.push({
    type: 'heal',
    actorId: actor.id,
    targetId: target.id,
    amount: restored,
    hp: target.hp,
    guard: target.guard,
    text: `${actor.name} restored ${restored} HP to ${target.name}.`,
  });
}

function setOutcome(state: AwayBattleState, actor: AwayUnit, events: AwayBattleEvent[]): boolean {
  if (living(state, 'enemy').length === 0) {
    state.phase = 'victory';
    state.reason = 'The hostile force was defeated.';
    events.push({ type: 'victory', actorId: actor.id, text: state.reason });
    return true;
  }
  if (living(state, 'crew').length === 0) {
    state.phase = 'defeat';
    state.reason = 'The away team was knocked out.';
    events.push({ type: 'defeat', actorId: actor.id, text: state.reason });
    return true;
  }
  return false;
}

function resolveBasic(state: AwayBattleState, actor: AwayUnit, events: AwayBattleEvent[]): void {
  const target = targetFor(state, actor)!;
  events.push({ type: 'action', actorId: actor.id, targetId: target.id, text: `${actor.name} attacked ${target.name}.` });
  applyDamage(actor, target, actor.attack, events);
  setOutcome(state, actor, events);
}

function mostInjured(units: readonly AwayUnit[]): AwayUnit | undefined {
  let selected: AwayUnit | undefined;
  let missing = -1;
  for (const unit of units) {
    const candidateMissing = unit.maxHp - unit.hp;
    if (candidateMissing > missing) {
      selected = unit;
      missing = candidateMissing;
    }
  }
  return selected;
}

function resolveSkill(state: AwayBattleState, actor: AwayUnit, events: AwayBattleEvent[]): void {
  if (actor.ability === 'strike') {
    const target = targetFor(state, actor)!;
    events.push({ type: 'action', actorId: actor.id, targetId: target.id, text: `${actor.name} used ${actor.abilityName}.` });
    applyDamage(actor, target, actor.abilityAmount, events);
    setOutcome(state, actor, events);
    return;
  }

  const allies = living(state, actor.side);
  if (actor.ability === 'rally') {
    events.push({ type: 'action', actorId: actor.id, text: `${actor.name} used ${actor.abilityName}.` });
    for (const target of allies) applyGuard(actor, target, actor.abilityAmount, events);
    return;
  }

  if (actor.ability === 'barrier') {
    const target = allies[0]!;
    events.push({ type: 'action', actorId: actor.id, targetId: target.id, text: `${actor.name} used ${actor.abilityName}.` });
    applyGuard(actor, target, actor.abilityAmount, events);
    return;
  }

  if (actor.ability === 'mend') {
    const target = mostInjured(allies)!;
    events.push({ type: 'action', actorId: actor.id, targetId: target.id, text: `${actor.name} used ${actor.abilityName}.` });
    applyHeal(actor, target, actor.abilityAmount, events);
    return;
  }

  const target = targetFor(state, actor)!;
  events.push({ type: 'action', actorId: actor.id, targetId: target.id, text: `${actor.name} used ${actor.abilityName}.` });
  applyDamage(actor, target, actor.abilityAmount, events);
  if (target.hp <= 0) {
    setOutcome(state, actor, events);
    return;
  }
  applyDamage(actor, target, actor.abilityAmount, events);
  setOutcome(state, actor, events);
}

function nextLivingCursor(state: AwayBattleState, start: number): number {
  let cursor = start;
  while (cursor < state.order.length) {
    const unit = state.units.find(candidate => candidate.id === state.order[cursor]);
    if (unit && unit.hp > 0) break;
    cursor += 1;
  }
  return cursor;
}

export function stepAway(state: AwayBattleState): AwayStepResult {
  if (state.phase !== 'playing') return { ok: false, error: 'Away battle is already over.', events: [] };

  const next: AwayBattleState = {
    ...state,
    units: state.units.map(unit => ({ ...unit })),
    order: [...state.order],
  };
  next.cursor = nextLivingCursor(next, next.cursor);
  const actorId = next.order[next.cursor];
  const actor = next.units.find(unit => unit.id === actorId);
  if (!actor || actor.hp <= 0) return { ok: false, error: 'Away battle has no living actor.', events: [] };

  const events: AwayBattleEvent[] = [];
  actor.actionCount += 1;
  if (actor.actionCount % 3 === 0) resolveSkill(next, actor, events);
  else resolveBasic(next, actor, events);

  if (next.phase === 'playing') {
    next.cursor = nextLivingCursor(next, next.cursor + 1);
    if (next.cursor >= next.order.length) {
      if (next.round >= EXPEDITION_RULES.maxAwayRounds) {
        next.phase = 'defeat';
        next.reason = `The signal window closed after round ${EXPEDITION_RULES.maxAwayRounds}.`;
        events.push({ type: 'defeat', actorId: actor.id, round: next.round, text: next.reason });
      } else {
        next.round += 1;
        next.cursor = nextLivingCursor(next, 0);
        events.push({ type: 'round', actorId: actor.id, round: next.round, text: `Round ${next.round} began.` });
      }
    }
  }

  Object.assign(state, next);
  return { ok: true, events };
}

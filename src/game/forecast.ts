import { effectiveCard, projectEnemyTicks, stepWorld, visibleEnemies, visibleObjects } from './combat';
import { WORLD_RULES } from './content';
import { canEnter, findPath } from './map';
import type {
  CardDefinition,
  Effect,
  TimelineCard,
  WorldEvent,
  WorldState,
} from './types';

export interface CardForecast {
  amounts: readonly number[];
  criticalAmounts?: readonly number[];
  canceled: boolean;
}

const CARDINAL = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;

/**
 * stepWorld clones before committing, so a shallow projection is sufficient. Ordinary cards omit
 * history/checkpoints to avoid cloning the whole run for every hand preview.
 */
function projectionState(state: WorldState, definition: CardDefinition): WorldState {
  const needsHistory = definition.temporal?.kind === 'echo' || definition.time?.kind === 'rewind';
  return {
    ...state,
    history: needsHistory ? state.history : [],
    checkpoints: definition.time?.kind === 'rewind' ? state.checkpoints : [],
  };
}

function visibleHorizon(state: WorldState): number {
  return WORLD_RULES.forecast + Math.max(0, state.scouting);
}

function itemDefinition(kind: 'potion' | 'service' | 'supply' | 'exit', id: string, name: string): CardDefinition {
  const descriptions = {
    potion: 'Collect a potion. Drinking it later restores 8 health.',
    service: 'Choose healing, card removal, or refinement.',
    supply: 'Restore 8 health.',
    exit: 'Leave MOREMART.',
  } as const;
  return {
    id: `item:${id}`,
    name,
    cost: 0,
    type: 'skill',
    target: 'self',
    description: descriptions[kind],
    flavor: '',
    icon: kind === 'potion' ? 'coffee' : kind === 'exit' ? 'boot' : 'toolbox',
    art: kind === 'potion' ? 'coffee' : kind === 'exit' ? 'brace' : 'toolbox',
    effects: kind === 'supply' ? [{ kind: 'heal', amount: 8, recipient: 'self' }] : [],
  };
}

function interactionDistance(state: WorldState, x: number, y: number): number | null {
  const occupied = visibleEnemies(state).map((enemy) => enemy.position);
  let best = Number.POSITIVE_INFINITY;
  for (const [dx, dy] of CARDINAL) {
    const adjacent = { x: x + dx, y: y + dy };
    if (!canEnter(state.map, adjacent, state.completedEncounters)) continue;
    const path = findPath(state.map, state.player.position, adjacent, state.completedEncounters, occupied);
    if (path) best = Math.min(best, path.length + 1);
  }
  return Number.isFinite(best) ? best : null;
}

/** Projects visible enemy pursuit and reachable known objects without changing the world. */
export function forecastTimeline(state: WorldState, horizon = visibleHorizon(state)): TimelineCard[] {
  if (!Number.isSafeInteger(horizon) || horizon < 0) throw new TypeError('Forecast horizon must be a non-negative safe integer.');
  const limit = Math.min(horizon, visibleHorizon(state));
  if (state.phase !== 'playing' || limit === 0) return [];

  const cards = [...projectEnemyTicks(state, limit)];
  for (const object of visibleObjects(state)) {
    const distance = interactionDistance(state, object.position.x, object.position.y);
    if (distance === null || distance > limit) continue;
    cards.push({
      id: `item:${object.id}:${state.tick + distance}`,
      tick: state.tick + distance,
      kind: 'item',
      definition: itemDefinition(object.kind, object.id, object.name),
      upgradeLevel: 0,
      entityId: object.id,
      events: [],
    });
  }
  return cards.sort((left, right) => left.tick - right.tick);
}

function matchedAmounts(effects: readonly Effect[], events: readonly WorldEvent[]): { amounts: number[]; cursor: number } {
  const amounts: number[] = [];
  let cursor = 0;
  for (const effect of effects) {
    const index = events.findIndex((event, candidate) => candidate >= cursor && event.kind === effect.kind);
    if (index < 0) {
      amounts.push(0);
      continue;
    }
    const amount = events[index].amount;
    if (amount === undefined) throw new Error(`${effect.kind} resolution event has no amount.`);
    amounts.push(amount);
    cursor = index + 1;
  }
  return { amounts, cursor };
}

/** Maps one action's resolved events to printed amounts without grading or mutating its definition. */
export function forecastEvents(definition: CardDefinition, events: readonly WorldEvent[], canceled = false): CardForecast {
  if (canceled) return { amounts: definition.effects.map(() => 0), canceled: true };
  const main = matchedAmounts(definition.effects, events);
  const forecast: CardForecast = { amounts: main.amounts, canceled: false };
  if (definition.onCritical?.length && events.some((event) => event.kind === 'damage' && event.critical)) {
    forecast.criticalAmounts = matchedAmounts(definition.onCritical, events.slice(main.cursor)).amounts;
  }
  return forecast;
}

/** Projects one legal hand-card command through the canonical world resolver. */
export function forecastCard(
  state: WorldState,
  uid: string,
  targetId?: string,
  sourceId?: string,
): CardForecast | null {
  if (typeof uid !== 'string' || !state.hand.some((card) => card.uid === uid)) return null;

  const definition = effectiveCard(state, uid);
  const usesSource = definition.temporal?.kind === 'echo' || definition.time?.kind === 'rewind';
  if (sourceId !== undefined && !usesSource) return null;
  if (definition.time?.kind === 'rewind'
    && (sourceId === undefined || !/^(0|[1-9]\d*)$/.test(sourceId))) return null;

  const projection = projectionState(state, definition);
  const result = stepWorld(projection, { kind: 'play', uid, targetId, sourceId });
  if (!result.ok) return null;

  const timeline = projection.history.at(-1)?.cards
    .find((card) => card.kind === 'player' && card.sourceUid === uid);
  const events = timeline?.events ?? result.events;
  const canceled = timeline?.canceled === true
    || (definition.effects.length > 0 && !events.some((event) => event.kind === 'action' && event.sourceUid === uid));
  return forecastEvents(definition, events, canceled);
}

function validAmounts(amounts: readonly number[], label: string): void {
  for (const amount of amounts) {
    if (!Number.isFinite(amount) || amount < 0) throw new Error(`Invalid ${label} amount: ${amount}`);
  }
}

function forecastDescription(definition: CardDefinition, effects: readonly Effect[]): string {
  if (!definition.scaling) return definition.description;
  const description = definition.scaling.description.replace(/\{([^{}]+)\}/g, (token, key: string) => {
    if (key.startsWith('effect:')) {
      const indexText = key.slice('effect:'.length);
      if (!/^\d+$/.test(indexText)) throw new Error(`Invalid forecast token ${token}.`);
      const effect = effects[Number(indexText)];
      if (!effect) throw new Error(`Forecast token references missing effect ${indexText}.`);
      return String(effect.amount);
    }
    if (key === 'time' && definition.time) return String(definition.time.amount);
    throw new Error(`Forecast token references missing ${key}.`);
  });
  if (/[{}]/.test(description)) throw new Error('Malformed forecast description template.');
  return description;
}

function replaceCriticalAmount(
  description: string,
  from: number,
  to: number,
  start: number,
): { description: string; next: number } {
  const escaped = String(from).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const suffix = description.slice(start);
  const match = new RegExp(`(^|[^0-9.])${escaped}(?![0-9.])`).exec(suffix);
  if (!match) return { description, next: start };
  const numberStart = start + match.index + match[1].length;
  const nextDescription = from === to
    ? description
    : `${description.slice(0, numberStart)}${to}${description.slice(numberStart + String(from).length)}`;
  return { description: nextDescription, next: numberStart + String(to).length };
}

/** Applies resolved amounts to an already-graded definition without mutating it or grading twice. */
export function applyForecast(definition: CardDefinition, forecast: CardForecast): CardDefinition {
  if (forecast.amounts.length !== definition.effects.length) {
    throw new Error('Forecast effect count does not match the card definition.');
  }
  validAmounts(forecast.amounts, 'forecast');
  const criticalAmounts = forecast.criticalAmounts;
  if (criticalAmounts && criticalAmounts.length !== (definition.onCritical?.length ?? 0)) {
    throw new Error('Forecast critical effect count does not match the card definition.');
  }
  if (criticalAmounts) validAmounts(criticalAmounts, 'critical forecast');

  const effects = definition.effects.map((effect, index) => ({ ...effect, amount: forecast.amounts[index] }));
  const onCritical = definition.onCritical?.map((effect, index) => ({
    ...effect,
    amount: criticalAmounts?.[index] ?? effect.amount,
  }));
  let description = forecastDescription(definition, effects);
  if (criticalAmounts?.length && definition.onCritical) {
    let criticalCursor = description.toLowerCase().indexOf('critical hit');
    if (criticalCursor >= 0) {
      for (let index = 0; index < criticalAmounts.length; index += 1) {
        const replaced = replaceCriticalAmount(
          description,
          definition.onCritical[index].amount,
          criticalAmounts[index],
          criticalCursor,
        );
        description = replaced.description;
        criticalCursor = replaced.next;
      }
    }
  }

  return {
    ...definition,
    effects,
    ...(onCritical ? { onCritical } : {}),
    description,
    scaling: definition.scaling && {
      ...definition.scaling,
      effects: definition.scaling.effects && [...definition.scaling.effects],
      time: definition.scaling.time && { ...definition.scaling.time },
    },
    time: definition.time && { ...definition.time },
    modifier: definition.modifier && { ...definition.modifier },
    temporal: definition.temporal && { ...definition.temporal },
  };
}

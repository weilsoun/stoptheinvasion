import { SHIP_RULES } from '../src/ship/combat';
import { crewStats, SECTOR } from '../src/ship/expedition-content';
import {
  availableNodes,
  expeditionServices,
  recruitableCrew,
  upgradeableCards,
} from '../src/ship/expedition';
import type {
  CrewMember,
  ExpeditionCommand,
  ExpeditionNode,
  ExpeditionPhase,
  ExpeditionService,
  ExpeditionState,
  SalvageReward,
} from '../src/ship/expedition-types';
import type { CrewId, ShipBaseCardId, ShipCard } from '../src/ship/types';

export const ROUTE_POLICIES = ['salvage', 'crew', 'survey'] as const;
export type RoutePolicy = typeof ROUTE_POLICIES[number];

export type VisibleCrew = CrewMember & { diplomacy: number; science: number; hp: number; attack: number };
export type ExpeditionObservation = {
  phase: ExpeditionPhase;
  node: Pick<ExpeditionNode, 'id' | 'kind' | 'depth' | 'lane'>;
  destinations: Array<Pick<ExpeditionNode, 'id' | 'kind' | 'depth' | 'lane'>>;
  hull: number;
  maxHull: number;
  scrap: number;
  deck: ShipCard[];
  crew: VisibleCrew[];
  reward: SalvageReward | null;
  services: ExpeditionService[];
  upgradeableUids: string[];
  recruitableCrew: CrewId[];
};

// This copy boundary is the only input to route/choice policies. It deliberately
// omits the run seed, RNG, battle draw/discard/exhaust order, future rewards,
// journal, and every unreached random sequence.
export function observeExpedition(state: ExpeditionState): ExpeditionObservation {
  const node = SECTOR[state.nodeId];
  return {
    phase: state.phase,
    node: { id: node.id, kind: node.kind, depth: node.depth, lane: node.lane },
    destinations: availableNodes(state).map(({ id, kind, depth, lane }) => ({ id, kind, depth, lane })),
    hull: state.hull,
    maxHull: SHIP_RULES.playerHull,
    scrap: state.scrap,
    deck: state.deck.map(card => ({ ...card })),
    crew: state.crew.map(member => {
      const stats = crewStats(member);
      return { ...member, diplomacy: stats.diplomacy, science: stats.science, hp: stats.hp, attack: stats.attack };
    }),
    reward: state.reward ? { ...state.reward, cards: [...state.reward.cards] } : null,
    services: expeditionServices(state).map(service => ({ ...service })),
    upgradeableUids: upgradeableCards(state).map(card => card.uid),
    recruitableCrew: [...recruitableCrew(state)],
  };
}

function rankDestination(policy: RoutePolicy, node: ExpeditionObservation['destinations'][number]): number {
  const ranks: Record<RoutePolicy, Partial<Record<ExpeditionNode['kind'], number>>> = {
    salvage: { battle: 50, depot: 45, freighter: 40, science: 20, planet: 10, exit: 100 },
    crew: { planet: 55, depot: 50, freighter: 45, science: 35, battle: 20, exit: 100 },
    survey: { science: 60, planet: 50, battle: 45, freighter: 25, depot: 20, exit: 100 },
  };
  let score = ranks[policy][node.kind] ?? 0;
  if (policy === 'salvage' && node.id === 'graveyard') score += 30;
  if (policy === 'crew' && node.id === 'boreal') score += 30;
  if (policy === 'survey' && (node.id === 'lens-array' || node.id === 'graveyard')) score += 30;
  return score;
}

function bestUpgrade(view: ExpeditionObservation): string | undefined {
  const priorities = ['lance', 'burst', 'shield', 'pulse', 'sweep', 'cell', 'crew:rex', 'crew:iona', 'crew:sen', 'crew:vale'];
  return [...view.deck]
    .filter(card => view.upgradeableUids.includes(card.uid))
    .sort((left, right) => priorities.indexOf(left.id) - priorities.indexOf(right.id) || left.uid.localeCompare(right.uid))[0]?.uid;
}

function strongestParty(view: ExpeditionObservation): CrewId[] {
  return [...view.crew]
    .sort((left, right) => right.level - left.level || right.attack - left.attack || right.hp - left.hp || left.id.localeCompare(right.id))
    .slice(0, 3)
    .map(member => member.id);
}

function diplomaticParty(view: ExpeditionObservation): CrewId[] {
  return [...view.crew]
    .sort((left, right) => right.diplomacy - left.diplomacy || right.level - left.level || left.id.localeCompare(right.id))
    .slice(0, 3)
    .map(member => member.id);
}

function chooseSalvage(view: ExpeditionObservation, policy: RoutePolicy): ExpeditionCommand {
  const reward = view.reward;
  if (!reward) throw new Error('Salvage observation lacks a visible reward.');
  if (policy === 'crew' && reward.crewId && view.recruitableCrew.includes(reward.crewId)) {
    return { type: 'salvage', choice: { kind: 'crew', crewId: reward.crewId } };
  }
  const uid = reward.allowUpgrade ? bestUpgrade(view) : undefined;
  if (uid && (policy !== 'crew' || !reward.crewId)) return { type: 'salvage', choice: { kind: 'upgrade', uid } };
  const preferred: readonly ShipBaseCardId[] = policy === 'survey'
    ? ['sweep', 'shield', 'cell', 'lance', 'burst', 'pulse']
    : ['lance', 'burst', 'shield', 'pulse', 'sweep', 'cell'];
  const cardId = preferred.find(id => reward.cards.includes(id));
  if (cardId && view.deck.length < 40) return { type: 'salvage', choice: { kind: 'card', cardId } };
  if (reward.crewId && view.recruitableCrew.includes(reward.crewId) && view.deck.length < 40) {
    return { type: 'salvage', choice: { kind: 'crew', crewId: reward.crewId } };
  }
  return { type: 'salvage', choice: { kind: 'skip' } };
}

function chooseService(view: ExpeditionObservation, policy: RoutePolicy): ExpeditionCommand {
  const available = Object.fromEntries(view.services.filter(service => service.available).map(service => [service.option, service])) as Partial<Record<ExpeditionService['option'], ExpeditionService>>;
  const order = policy === 'crew'
    ? ['recruit', 'repair', 'upgrade', 'card'] as const
    : policy === 'salvage'
      ? ['repair', 'upgrade', 'card', 'recruit'] as const
      : ['upgrade', 'repair', 'recruit', 'card'] as const;
  for (const option of order) {
    if (!available[option]) continue;
    if (option === 'repair') return { type: 'service', option };
    if (option === 'upgrade') {
      const uid = bestUpgrade(view);
      if (uid) return { type: 'service', option, target: uid };
    }
    if (option === 'recruit') {
      const target = view.recruitableCrew[0];
      if (target) return { type: 'service', option, target };
    }
    if (option === 'card') return { type: 'service', option, target: policy === 'survey' ? 'sweep' : 'shield' };
  }
  return { type: 'leave' };
}

export function chooseExpeditionCommand(view: ExpeditionObservation, policy: RoutePolicy): ExpeditionCommand {
  if (view.phase === 'map') {
    if (view.node.kind === 'exit') return { type: 'complete' };
    const destination = [...view.destinations].sort((left, right) => rankDestination(policy, right) - rankDestination(policy, left) || left.id.localeCompare(right.id))[0];
    if (!destination) throw new Error(`No visible destination from ${view.node.id}.`);
    return { type: 'travel', nodeId: destination.id };
  }
  if (view.phase === 'salvage') return chooseSalvage(view, policy);
  if (view.phase === 'depot') return chooseService(view, policy);
  if (view.phase === 'planet') {
    const diplomats = diplomaticParty(view);
    const required = view.node.id === 'boreal' ? 4 : 2;
    const cost = view.node.id === 'boreal' ? 6 : 4;
    const score = diplomats.reduce((sum, id) => sum + (view.crew.find(member => member.id === id)?.diplomacy ?? 0), 0);
    if (policy === 'crew' && score >= required && view.scrap >= cost) return { type: 'diplomacy', crewIds: diplomats };
    return { type: 'deploy', crewIds: strongestParty(view) };
  }
  if (view.phase === 'science') {
    const science = view.crew.reduce((sum, member) => sum + member.science, 0);
    const diplomacy = view.crew.reduce((sum, member) => sum + member.diplomacy, 0);
    const uid = bestUpgrade(view);
    if (policy === 'survey' && science >= 3 && uid) return { type: 'science', choice: 'decode', uid };
    if (diplomacy >= 2) return { type: 'science', choice: 'share' };
    return { type: 'science', choice: 'salvage' };
  }
  if (view.phase === 'away') return { type: 'away-step' };
  throw new Error(`Route policy cannot choose in ${view.phase}; battle and terminal transitions are handled by the runner.`);
}

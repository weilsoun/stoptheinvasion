import { hashText, randomStep } from '../game/random';
import { cardDefinition, createBattle, dispatchBattle, SHIP_DECK, SHIP_RULES } from './combat';
import { createAwayBattle, stepAway } from './away';
import {
  AWAY_MISSIONS, CREW, CREW_IDS, EXPEDITION_RULES, SALVAGE_CARD_IDS, SECTOR,
  SHIP_ENCOUNTERS, crewStats, upgradeShipCard,
} from './expedition-content';
import type { CrewId, ShipBaseCardId, ShipCard, ShipCardDefinition, ShipCardId } from './types';
import type {
  CrewLevel, CrewMember, ExpeditionCommand, ExpeditionNode, ExpeditionResult,
  ExpeditionService, ExpeditionState, SalvageReward,
} from './expedition-types';

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const own = Reflect.ownKeys(value);
  return required.every(key => own.includes(key)) && own.every(key => typeof key === 'string' && (required.includes(key) || optional.includes(key)));
}
function text(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= 128; }
function uint32(value: unknown): value is number { return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff; }
function partyShape(value: unknown): value is CrewId[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= EXPEDITION_RULES.teamSize
    && Reflect.ownKeys(value).every(key => key === 'length' || (typeof key === 'string' && /^(0|[1-9]\d*)$/.test(key) && Number(key) < value.length))
    && Array.from(value).every(id => CREW_IDS.includes(id)) && new Set(value).size === value.length;
}
function commandShape(value: unknown): value is ExpeditionCommand {
  if (!record(value) || typeof value.type !== 'string') return false;
  switch (value.type) {
    case 'travel': return keys(value, ['type', 'nodeId']) && text(value.nodeId);
    case 'battle': {
      if (!keys(value, ['type', 'command']) || !record(value.command)) return false;
      const command = value.command;
      return command.type === 'end-turn' ? keys(command, ['type'])
        : command.type === 'play' && keys(command, ['type', 'uid'], ['targetId']) && text(command.uid) && (command.targetId === undefined || text(command.targetId));
    }
    case 'finish-battle': case 'leave': case 'away-step': case 'finish-away': case 'complete': return keys(value, ['type']);
    case 'deploy': case 'diplomacy': return keys(value, ['type', 'crewIds']) && partyShape(value.crewIds);
    case 'service': return keys(value, ['type', 'option'], ['target']) && ['repair', 'upgrade', 'recruit', 'card'].includes(value.option as string) && (value.target === undefined || text(value.target));
    case 'science': return keys(value, ['type', 'choice'], ['uid']) && ['decode', 'share', 'salvage'].includes(value.choice as string) && (value.uid === undefined || text(value.uid));
    case 'salvage': {
      if (!keys(value, ['type', 'choice']) || !record(value.choice)) return false;
      const choice = value.choice;
      switch (choice.kind) {
        case 'skip': return keys(choice, ['kind']);
        case 'card': return keys(choice, ['kind', 'cardId']) && SALVAGE_CARD_IDS.includes(choice.cardId as ShipBaseCardId);
        case 'crew': return keys(choice, ['kind', 'crewId']) && CREW_IDS.includes(choice.crewId as CrewId);
        case 'upgrade': return keys(choice, ['kind', 'uid']) && text(choice.uid);
        default: return false;
      }
    }
    default: return false;
  }
}
function independentCommand(command: ExpeditionCommand): ExpeditionCommand {
  let copy: ExpeditionCommand;
  if (command.type === 'battle') {
    const action = command.command;
    copy = { type: 'battle', command: action.type === 'end-turn' ? { type: 'end-turn' } : { type: 'play', uid: action.uid, ...(action.targetId === undefined ? {} : { targetId: action.targetId }) } };
    Object.freeze(copy.command);
  } else if (command.type === 'deploy' || command.type === 'diplomacy') {
    const crewIds = [...command.crewIds];
    Object.freeze(crewIds);
    copy = { type: command.type, crewIds };
  } else if (command.type === 'salvage') {
    copy = { type: 'salvage', choice: { ...command.choice } };
    Object.freeze(copy.choice);
  } else if (command.type === 'service') {
    copy = { type: 'service', option: command.option, ...(command.target === undefined ? {} : { target: command.target }) };
  } else if (command.type === 'science') {
    copy = { type: 'science', choice: command.choice, ...(command.uid === undefined ? {} : { uid: command.uid }) };
  } else copy = { ...command };
  return Object.freeze(copy);
}
function failure(error: string): ExpeditionResult { return { ok: false, error, events: [], awayEvents: [] }; }
function accepted(state: ExpeditionState, command: ExpeditionCommand): void {
  state.journal = Object.freeze([...state.journal, command]);
}
function cloneChoice(state: ExpeditionState): ExpeditionState {
  // Choice transitions replace, rather than mutate, battle/away snapshots. Ordinary
  // battle actions use their own atomic reducer and never deep-copy the journal.
  return {
    ...state, visited: [...state.visited], deck: state.deck.map(card => ({ ...card })),
    crew: state.crew.map(member => ({ ...member })), purchases: [...state.purchases],
    reward: state.reward ? { ...state.reward, cards: [...state.reward.cards] } : null,
  };
}
function random(state: ExpeditionState): number {
  const [rng, value] = randomStep(state.rng);
  state.rng = rng;
  return value;
}
function newCard(state: ExpeditionState, id: ShipCardId): ShipCard {
  return { uid: `k-${state.seed}-${state.nextUid++}`, id, upgradeLevel: 0 };
}
function recruit(state: ExpeditionState, id: CrewId): void {
  const card = newCard(state, CREW[id].card.id);
  state.deck.push(card);
  state.crew.push({ id, level: 1, cardUid: card.uid });
}
function upgrade(state: ExpeditionState, uid: string): void {
  const card = state.deck.find(candidate => candidate.uid === uid)!;
  card.upgradeLevel = (card.upgradeLevel ?? 0) + 1;
  const member = state.crew.find(candidate => candidate.cardUid === uid);
  if (member) member.level = (card.upgradeLevel + 1) as CrewLevel;
}
function party(state: ExpeditionState, ids: readonly CrewId[]): CrewMember[] | null {
  if (!partyShape(ids)) return null;
  const members = ids.map(id => state.crew.find(member => member.id === id));
  return members.every(member => member !== undefined) ? members as CrewMember[] : null;
}
function offerReward(state: ExpeditionState, scrap: number, diplomatic = false): void {
  const pool = [...SALVAGE_CARD_IDS];
  const cards: ShipBaseCardId[] = [];
  if (!diplomatic) for (let index = 0; index < 3; index += 1) cards.push(pool.splice(Math.floor(random(state) * pool.length), 1)[0]);
  const recruits = recruitableCrew(state);
  const crewId = recruits.length ? recruits[Math.floor(random(state) * recruits.length)] : null;
  const reward: SalvageReward = { nodeId: state.nodeId, scrap, cards, crewId, allowUpgrade: !diplomatic };
  state.scrap += scrap;
  state.reward = reward;
  state.phase = 'salvage';
}

export function createExpedition(seed: number): ExpeditionState {
  if (!uint32(seed)) throw new TypeError('Expedition seed must be a finite uint32 integer.');
  const deck = SHIP_DECK.map((id, index): ShipCard => ({ uid: `k-${seed}-${index + 1}`, id: index === 0 ? 'crew:vale' : id, upgradeLevel: 0 }));
  return {
    version: 1, seed, rng: seed, phase: 'map', nodeId: 'launch', visited: ['launch'],
    hull: SHIP_RULES.playerHull, scrap: EXPEDITION_RULES.startScrap, deck,
    crew: [{ id: 'vale', level: 1, cardUid: deck[0].uid }], nextUid: deck.length + 1,
    battle: null, away: null, reward: null, purchases: [], journal: Object.freeze([]),
  };
}
export function availableNodes(state: ExpeditionState): ExpeditionNode[] {
  return state.phase === 'map' ? SECTOR[state.nodeId].next.filter(id => !state.visited.includes(id)).map(id => SECTOR[id]) : [];
}
export function upgradeableCards(state: ExpeditionState): ShipCard[] {
  return state.deck.filter(card => !card.id.startsWith('research:') && (card.upgradeLevel ?? 0) < EXPEDITION_RULES.maxUpgrade);
}
export function recruitableCrew(state: ExpeditionState): CrewId[] {
  return CREW_IDS.filter(id => !state.crew.some(member => member.id === id));
}
export function expeditionCardDefinition(_state: ExpeditionState, card: ShipCard): ShipCardDefinition {
  return upgradeShipCard(cardDefinition(card.id), card.upgradeLevel ?? 0);
}
export function expeditionServices(state: ExpeditionState): ExpeditionService[] {
  if (state.phase !== 'depot') return [];
  const freighter = SECTOR[state.nodeId].kind === 'freighter';
  const offers: Array<Omit<ExpeditionService, 'available' | 'reason'>> = [
    { option: 'repair', title: 'Hull repair', cost: freighter ? EXPEDITION_RULES.freighterRepairCost : EXPEDITION_RULES.repairCost, amount: freighter ? EXPEDITION_RULES.freighterRepairAmount : EXPEDITION_RULES.repairAmount },
    { option: 'upgrade', title: 'Refit one card', cost: EXPEDITION_RULES.upgradeCost },
    { option: 'recruit', title: 'Recruit crew', cost: EXPEDITION_RULES.recruitCost },
    { option: 'card', title: 'Buy one card', cost: EXPEDITION_RULES.cardCost },
  ];
  return offers.map(offer => {
    let reason = '';
    if (state.purchases.includes(`${state.nodeId}:${offer.option}`)) reason = 'Already purchased at this stop.';
    else if (offer.option === 'repair' && state.hull >= SHIP_RULES.playerHull) reason = 'Hull is already intact.';
    else if (offer.option === 'upgrade' && !upgradeableCards(state).length) reason = 'No card can be upgraded further.';
    else if (offer.option === 'recruit' && !recruitableCrew(state).length) reason = 'All crew have joined the expedition.';
    else if ((offer.option === 'recruit' || offer.option === 'card') && state.deck.length >= EXPEDITION_RULES.maxDeck) reason = 'The deck is at capacity.';
    else if (state.scrap < offer.cost) reason = `Requires ${offer.cost} scrap.`;
    return { ...offer, available: !reason, reason };
  });
}

export function dispatchExpedition(state: ExpeditionState, input: ExpeditionCommand): ExpeditionResult {
  if (!commandShape(input)) return failure('Invalid expedition command.');
  const command = independentCommand(input);
  if (command.type === 'battle') {
    if (state.phase !== 'battle' || !state.battle) return failure('There is no active ship battle.');
    const result = dispatchBattle(state.battle, command.command);
    if (!result.ok) return failure(result.error);
    state.hull = state.battle.player.hull;
    accepted(state, command);
    return { ok: true, events: result.events, awayEvents: [], message: '' };
  }
  if (command.type === 'away-step') {
    if (state.phase !== 'away' || !state.away) return failure('There is no active away mission.');
    const result = stepAway(state.away);
    if (!result.ok) return failure(result.error);
    accepted(state, command);
    return { ok: true, events: [], awayEvents: result.events, message: '' };
  }
  const next = cloneChoice(state);
  let message = '';
  switch (command.type) {
    case 'travel': {
      const destination = availableNodes(state).find(node => node.id === command.nodeId);
      if (!destination) return failure('That destination is not reachable now.');
      next.nodeId = destination.id;
      next.visited.push(destination.id);
      if (destination.kind === 'battle') {
        const encounter = SHIP_ENCOUNTERS[destination.encounterId!];
        const seed = Math.floor(random(next) * 0x1_0000_0000);
        next.battle = createBattle(seed, undefined, { hull: next.hull, deck: next.deck, enemies: encounter.enemies });
        next.phase = 'battle';
      } else if (destination.kind === 'planet') next.phase = 'planet';
      else if (destination.kind === 'depot' || destination.kind === 'freighter') next.phase = 'depot';
      else if (destination.kind === 'science') next.phase = 'science';
      else next.phase = 'map';
      message = `Arrived at ${destination.title}.`;
      break;
    }
    case 'finish-battle': {
      if (state.phase !== 'battle' || !state.battle || state.battle.phase === 'player') return failure('Finish the ship battle first.');
      next.hull = state.battle.player.hull;
      next.battle = null;
      if (state.battle.phase === 'defeat') { next.phase = 'defeat'; message = 'The Kestrel was lost.'; }
      else { offerReward(next, EXPEDITION_RULES.battleScrap); message = `Recovered ${EXPEDITION_RULES.battleScrap} scrap. Choose salvage.`; }
      break;
    }
    case 'salvage': {
      if (state.phase !== 'salvage' || !state.reward) return failure('There is no salvage awaiting a choice.');
      const choice = command.choice;
      if (choice.kind === 'card') {
        if (!state.reward.cards.includes(choice.cardId)) return failure('That card was not offered.');
        if (state.deck.length >= EXPEDITION_RULES.maxDeck) return failure('The deck is at capacity.');
        next.deck.push(newCard(next, choice.cardId));
        message = `${cardDefinition(choice.cardId).title} added to the deck.`;
      } else if (choice.kind === 'crew') {
        if (state.reward.crewId !== choice.crewId || !recruitableCrew(state).includes(choice.crewId)) return failure('That crew member is not available.');
        if (state.deck.length >= EXPEDITION_RULES.maxDeck) return failure('The deck is at capacity.');
        recruit(next, choice.crewId);
        message = `${CREW[choice.crewId].name} joined the expedition.`;
      } else if (choice.kind === 'upgrade') {
        if (!state.reward.allowUpgrade || !upgradeableCards(state).some(card => card.uid === choice.uid)) return failure('That exact card cannot be refitted here.');
        upgrade(next, choice.uid);
        message = 'The selected card was upgraded.';
      } else message = 'Salvage declined.';
      next.reward = null;
      next.phase = 'map';
      break;
    }
    case 'service': {
      const service = expeditionServices(state).find(offer => offer.option === command.option);
      if (!service) return failure('There is no service available here.');
      if (!service.available) return failure(service.reason);
      if (command.option === 'repair') {
        if (command.target !== undefined) return failure('Hull repair does not take a target.');
        const restored = Math.min(service.amount!, SHIP_RULES.playerHull - state.hull);
        next.hull += restored;
        message = `Repaired ${restored} hull.`;
      } else if (command.option === 'upgrade') {
        if (!upgradeableCards(state).some(card => card.uid === command.target)) return failure('Choose an exact card eligible for a refit.');
        upgrade(next, command.target!);
        message = 'The selected card was upgraded.';
      } else if (command.option === 'recruit') {
        if (!recruitableCrew(state).includes(command.target as CrewId)) return failure('Choose an available crew member.');
        recruit(next, command.target as CrewId);
        message = `${CREW[command.target as CrewId].name} joined the expedition.`;
      } else {
        if (!SALVAGE_CARD_IDS.includes(command.target as ShipBaseCardId)) return failure('Choose an available card.');
        const id = command.target as ShipBaseCardId;
        next.deck.push(newCard(next, id));
        message = `${cardDefinition(id).title} added to the deck.`;
      }
      next.scrap -= service.cost;
      next.purchases.push(`${state.nodeId}:${command.option}`);
      break;
    }
    case 'leave': {
      if (state.phase !== 'depot' && state.phase !== 'planet' && state.phase !== 'science') return failure('This encounter must be resolved before departure.');
      next.phase = 'map';
      message = 'Returned to the route. Unclaimed opportunities are left behind.';
      break;
    }
    case 'deploy': {
      if (state.phase !== 'planet') return failure('There is no planet mission ready for deployment.');
      const members = party(state, command.crewIds);
      if (!members) return failure('Choose one to three distinct collected crew members.');
      const mission = AWAY_MISSIONS[SECTOR[state.nodeId].missionId!];
      next.away = createAwayBattle(members, mission);
      next.phase = 'away';
      message = `Away team deployed to ${mission.title}.`;
      break;
    }
    case 'finish-away': {
      if (state.phase !== 'away' || !state.away || state.away.phase === 'playing') return failure('Resolve the away mission first.');
      next.away = null;
      if (state.away.phase === 'victory') {
        offerReward(next, EXPEDITION_RULES.awayScrap);
        message = `Mission secured. Recovered ${EXPEDITION_RULES.awayScrap} scrap.`;
      } else {
        const lost = Math.min(next.hull, EXPEDITION_RULES.evacuationHullLoss);
        next.hull -= lost;
        next.phase = next.hull > 0 ? 'map' : 'defeat';
        message = `Emergency evacuation cost ${lost} hull. ${next.hull > 0 ? 'The crew recovered aboard Kestrel.' : 'The Kestrel was lost.'}`;
      }
      break;
    }
    case 'diplomacy': {
      if (state.phase !== 'planet') return failure('There is no diplomatic opportunity here.');
      const members = party(state, command.crewIds);
      if (!members) return failure('Choose one to three distinct collected crew members.');
      const mission = AWAY_MISSIONS[SECTOR[state.nodeId].missionId!];
      const score = members.reduce((sum, member) => sum + crewStats(member).diplomacy, 0);
      if (score < mission.diplomacyRequired) return failure(`This party needs ${mission.diplomacyRequired} Diplomacy.`);
      if (state.scrap < mission.diplomacyCost) return failure(`Negotiation requires ${mission.diplomacyCost} scrap.`);
      next.scrap -= mission.diplomacyCost;
      offerReward(next, EXPEDITION_RULES.diplomacyScrap, true);
      message = `Negotiated safe access for ${mission.diplomacyCost} scrap; recovered ${EXPEDITION_RULES.diplomacyScrap} scrap and a crew contact.`;
      break;
    }
    case 'science': {
      if (state.phase !== 'science') return failure('There is no science opportunity here.');
      if (command.choice === 'decode') {
        const science = state.crew.reduce((sum, member) => sum + crewStats(member).science, 0);
        if (science < EXPEDITION_RULES.scienceRequired) return failure(`Decoding requires ${EXPEDITION_RULES.scienceRequired} Science.`);
        if (!upgradeableCards(state).some(card => card.uid === command.uid)) return failure('Choose an exact card eligible for the research refit.');
        upgrade(next, command.uid!);
        message = 'Decoded research upgraded the selected card.';
      } else {
        if (command.uid !== undefined) return failure('This opportunity does not take a card target.');
        if (command.choice === 'share') {
          const diplomacy = state.crew.reduce((sum, member) => sum + crewStats(member).diplomacy, 0);
          if (diplomacy < EXPEDITION_RULES.scienceDiplomacyRequired) return failure(`Data exchange requires ${EXPEDITION_RULES.scienceDiplomacyRequired} Diplomacy.`);
          next.scrap += EXPEDITION_RULES.scienceShareScrap;
          message = `Navigation data earned ${EXPEDITION_RULES.scienceShareScrap} scrap.`;
        } else {
          next.scrap += EXPEDITION_RULES.scienceSalvageScrap;
          message = `Recovered ${EXPEDITION_RULES.scienceSalvageScrap} scrap from the array.`;
        }
      }
      next.phase = 'map';
      break;
    }
    case 'complete': {
      if (state.phase !== 'map' || SECTOR[state.nodeId].kind !== 'exit' || state.hull <= 0) return failure('Reach the Far Relay before transmitting the survey.');
      next.phase = 'victory';
      message = 'Survey transmitted. The expedition is home.';
      break;
    }
  }
  accepted(next, command);
  Object.assign(state, next);
  return { ok: true, events: [], awayEvents: [], message };
}

function checksum(state: ExpeditionState): string {
  const { journal: _journal, ...snapshot } = state;
  return hashText(JSON.stringify(snapshot), 2166136261).toString(16).padStart(8, '0');
}
export function serializeExpedition(state: ExpeditionState): string {
  if (state.journal.length > EXPEDITION_RULES.saveMaxCommands) throw new RangeError('This expedition exceeds the supported save history. Keep this tab open.');
  const output = JSON.stringify({ version: 1, seed: state.seed, commands: state.journal, checksum: checksum(state) });
  if (output.length > EXPEDITION_RULES.saveMaxCharacters) throw new RangeError('This expedition exceeds the supported save size. Keep this tab open.');
  return output;
}
export function deserializeExpedition(textValue: string): { ok: true; state: ExpeditionState } | { ok: false; error: string } {
  if (typeof textValue !== 'string' || textValue.length > EXPEDITION_RULES.saveMaxCharacters) return { ok: false, error: 'Saved expedition exceeds the supported size.' };
  try {
    const value: unknown = JSON.parse(textValue);
    if (!record(value) || !keys(value, ['version', 'seed', 'commands', 'checksum']) || value.version !== 1 || !uint32(value.seed)
      || !Array.isArray(value.commands) || value.commands.length > EXPEDITION_RULES.saveMaxCommands
      || typeof value.checksum !== 'string' || !/^[0-9a-f]{8}$/.test(value.checksum)) {
      return { ok: false, error: 'Saved expedition has an unsupported version or invalid structure.' };
    }
    const state = createExpedition(value.seed);
    for (const command of value.commands) {
      if (!commandShape(command)) return { ok: false, error: 'Saved expedition contains an invalid command.' };
      const result = dispatchExpedition(state, command);
      if (!result.ok) return { ok: false, error: `Saved expedition cannot be replayed: ${result.error}` };
    }
    if (checksum(state) !== value.checksum) return { ok: false, error: 'Saved expedition does not match the current rules or has been changed.' };
    return { ok: true, state };
  } catch {
    return { ok: false, error: 'Saved expedition is unreadable or incompatible with the current rules.' };
  }
}

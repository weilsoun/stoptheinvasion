import type { CrewId, ShipBaseCardId, ShipCardDefinition, ShipCardId, ShipCrewCardId } from './types';
import type { AwayMission, CrewDefinition, CrewMember, CrewStats, ExpeditionNode, ShipEncounter } from './expedition-types';

export const EXPEDITION_RULES = Object.freeze({
  minDeck: 8, maxDeck: 40, maxUpgrade: 2, maxCrew: 4, teamSize: 3,
  maxAwayRounds: 30, awayGuardCap: 6, startScrap: 8,
  battleScrap: 8, awayScrap: 10, diplomacyScrap: 6, evacuationHullLoss: 6,
  repairAmount: 16, repairCost: 8, freighterRepairAmount: 10, freighterRepairCost: 6,
  upgradeCost: 10, recruitCost: 12, cardCost: 6,
  scienceRequired: 3, scienceDiplomacyRequired: 2, scienceShareScrap: 8, scienceSalvageScrap: 5,
  saveMaxCharacters: 2_000_000, saveMaxCommands: 5_000,
} as const);
export const EXPEDITION_SAVE_KEY = 'kestrel.expedition.v1';
export const PRESENTATION_SAVE_KEY = 'kestrel.presentation.v1';
export const SALVAGE_CARD_IDS: readonly ShipBaseCardId[] = Object.freeze(['pulse', 'shield', 'lance', 'cell', 'sweep', 'burst']);

function crewCard(id: ShipCrewCardId, title: string, kind: ShipCardDefinition['kind'], effects: ShipCardDefinition['effects'], flavor: string): ShipCardDefinition {
  return Object.freeze({ id, title, cost: 1, kind, effects: Object.freeze(effects.map(effect => Object.freeze({ ...effect }))), exhaust: true, flavor });
}
const crew: Record<CrewId, CrewDefinition> = {
  vale: {
    id: 'vale', name: 'Captain Vale', role: 'Captain', department: 'command',
    biography: 'An unhurried navigator who can turn a broken transmission into an introduction.', color: '#d9b45e',
    hp: 20, attack: 5, speed: 4, diplomacy: 2, science: 1,
    ability: 'rally', abilityName: 'Hold Formation',
    card: crewCard('crew:vale', 'Captain Vale', 'crew', [{ kind: 'shield', amount: 3 }, { kind: 'draw', amount: 1 }], 'The calmest voice on every channel.'),
  },
  iona: {
    id: 'iona', name: 'Iona Voss', role: 'Engineer', department: 'engineering',
    biography: 'A freighter engineer with a spare wrench and a very personal grudge against failed seals.', color: '#bf7653',
    hp: 18, attack: 3, speed: 3, diplomacy: 0, science: 2,
    ability: 'barrier', abilityName: 'Field Barrier',
    card: crewCard('crew:iona', 'Iona Voss', 'crew', [{ kind: 'shield', amount: 5 }, { kind: 'energy', amount: 1 }], 'There is always one more circuit.'),
  },
  rex: {
    id: 'rex', name: 'Rex Calder', role: 'Security', department: 'security',
    biography: 'A station marshal who takes point, counts exits and remembers every passenger.', color: '#879dab',
    hp: 22, attack: 6, speed: 5, diplomacy: 0, science: 0,
    ability: 'double', abilityName: 'Covering Pair',
    card: crewCard('crew:rex', 'Rex Calder', 'attack', [{ kind: 'damage', amount: 10 }], 'A firing solution with a name behind it.'),
  },
  sen: {
    id: 'sen', name: 'Dr. Sen', role: 'Scientist', department: 'science',
    biography: 'A field scientist who reads abandoned machines as patiently as unfamiliar people.', color: '#72aa9b',
    hp: 16, attack: 3, speed: 4, diplomacy: 1, science: 3,
    ability: 'mend', abilityName: 'Trauma Gel',
    card: crewCard('crew:sen', 'Dr. Sen', 'crew', [{ kind: 'draw', amount: 2 }, { kind: 'shield', amount: 2 }], 'A better question changes the whole encounter.'),
  },
};
export const CREW: Readonly<Record<CrewId, CrewDefinition>> = Object.freeze(Object.fromEntries(Object.entries(crew).map(([id, definition]) => [id, Object.freeze(definition)]))) as Readonly<Record<CrewId, CrewDefinition>>;
export const CREW_IDS: readonly CrewId[] = Object.freeze(['vale', 'iona', 'rex', 'sen']);
export const CREW_CARDS: Readonly<Record<ShipCrewCardId, ShipCardDefinition>> = Object.freeze(Object.fromEntries(CREW_IDS.map(id => [CREW[id].card.id, CREW[id].card]))) as Readonly<Record<ShipCrewCardId, ShipCardDefinition>>;

export function crewIdForCard(id: ShipCardId): CrewId | null {
  return CREW_IDS.find(crewId => CREW[crewId].card.id === id) ?? null;
}
export function crewStats(member: Pick<CrewMember, 'id' | 'level'>): CrewStats {
  const source = CREW[member.id];
  if (!source || !Number.isInteger(member.level) || member.level < 1 || member.level > 3) throw new TypeError('Unknown crew member or crew level.');
  const grade = member.level - 1;
  const attack = source.attack + grade;
  const amount = source.ability === 'rally' ? 2 + grade : source.ability === 'barrier' ? 5 + grade : source.ability === 'double' ? attack - 2 : 5 + grade;
  const abilityText = source.ability === 'rally' ? `Give every living ally ${amount} Guard.`
    : source.ability === 'barrier' ? `Give the front living ally ${amount} Guard.`
      : source.ability === 'double' ? `Deal ${amount} damage twice to the front enemy.`
        : `Restore ${amount} HP to the most injured living ally.`;
  return { hp: source.hp + grade * 4, attack, speed: source.speed, diplomacy: source.diplomacy + grade, science: source.science + grade, ability: source.ability, abilityAmount: amount, abilityText };
}

const CARD_SCALING: Readonly<Record<ShipBaseCardId | ShipCrewCardId, readonly number[]>> = Object.freeze({
  pulse: [2], shield: [2], lance: [3], cell: [1], sweep: [1], burst: [1, 1],
  'crew:vale': [1, 0], 'crew:iona': [2, 0], 'crew:rex': [2], 'crew:sen': [0, 1],
});
/** Start from the catalog definition, never an already upgraded event/preview. */
export function upgradeShipCard(base: ShipCardDefinition, level: number): ShipCardDefinition {
  if (!Number.isInteger(level) || level < 0 || level > EXPEDITION_RULES.maxUpgrade) throw new TypeError('Card upgrade must be an integer from zero through two.');
  if (level === 0) return base;
  if (!Object.prototype.hasOwnProperty.call(CARD_SCALING, base.id)) throw new TypeError('This card has no authored upgrade.');
  const scaling = CARD_SCALING[base.id as keyof typeof CARD_SCALING];
  return { ...base, title: `${base.title} +${level}`, effects: base.effects.map((effect, index) => ({ ...effect, amount: effect.amount + level * scaling[index] })) };
}

const encounters: ShipEncounter[] = [
  { id: 'beacon', title: 'Cold Beacon', enemies: [
    { id: 'beacon-drone', name: 'Lost Needle Drone', role: 'needle', hull: 16, shield: 2, recharge: 0 },
  ] },
  { id: 'twins', title: 'Twin Signatures', enemies: [
    { id: 'twin-port', name: 'Needle Drone · Port', role: 'needle', hull: 18, shield: 3, recharge: 1 },
    { id: 'twin-starboard', name: 'Needle Drone · Starboard', role: 'needle', hull: 18, shield: 3, recharge: 1 },
  ] },
  { id: 'corsairs', title: 'Corsair Intercept', enemies: [
    { id: 'corsair-lead', name: 'Sable Corsair · Lead', role: 'corsair', hull: 24, shield: 5, recharge: 1 },
    { id: 'corsair-wing', name: 'Sable Corsair · Wing', role: 'corsair', hull: 24, shield: 5, recharge: 1 },
  ] },
  { id: 'graveyard', title: 'Graveyard Patrol', enemies: [
    { id: 'patrol-corsair', name: 'Sable Corsair', role: 'corsair', hull: 28, shield: 6, recharge: 1 },
    { id: 'patrol-tug', name: 'Salvage Bulwark', role: 'bulwark', hull: 32, shield: 8, recharge: 2 },
  ] },
  { id: 'relay', title: 'Relay Blockade', enemies: [
    { id: 'relay-corsair', name: 'Sable Corsair', role: 'corsair', hull: 28, shield: 6, recharge: 1 },
    { id: 'relay-needle', name: 'Needle Drone', role: 'needle', hull: 18, shield: 3, recharge: 1 },
    { id: 'relay-bulwark', name: 'Bulwark Tug', role: 'bulwark', hull: 38, shield: 10, recharge: 2 },
  ] },
];
export const SHIP_ENCOUNTERS: Readonly<Record<string, ShipEncounter>> = Object.freeze(Object.fromEntries(encounters.map(encounter => [encounter.id, Object.freeze({ ...encounter, enemies: Object.freeze(encounter.enemies.map(enemy => Object.freeze(enemy))) })])));

const missions: AwayMission[] = [
  { id: 'nacre', title: 'Nacre Listening Post', description: 'A silent listening post still answers a careful greeting. Its sentry answers footsteps.', diplomacyRequired: 2, diplomacyCost: 4, enemies: [
    { id: 'nacre-sentry', name: 'Survey Sentry', appearance: 'drone', hp: 14, attack: 3, speed: 2 },
  ] },
  { id: 'boreal', title: 'Boreal Vault', description: 'The vault remembers a trade language. Beyond the door, a patrol is already awake.', diplomacyRequired: 4, diplomacyCost: 6, enemies: [
    { id: 'boreal-warden', name: 'Vault Warden', appearance: 'warden', hp: 26, attack: 5, speed: 2 },
    { id: 'boreal-stalker', name: 'Glass Stalker', appearance: 'stalker', hp: 16, attack: 4, speed: 5 },
  ] },
];
export const AWAY_MISSIONS: Readonly<Record<string, AwayMission>> = Object.freeze(Object.fromEntries(missions.map(mission => [mission.id, Object.freeze({ ...mission, enemies: Object.freeze(mission.enemies.map(enemy => Object.freeze(enemy))) })])));

const nodes: ExpeditionNode[] = [
  { id: 'launch', title: 'Kestrel Anchorage', kind: 'launch', depth: 0, lane: 0, description: 'Plot a course through the quiet system. Reach the Far Relay and transmit the survey.', next: ['cold-beacon'] },
  { id: 'cold-beacon', title: 'Cold Beacon', kind: 'battle', depth: 1, lane: 0, description: 'One lost drone guards the first signal.', encounterId: 'beacon', next: ['twin-signatures', 'nacre'] },
  { id: 'twin-signatures', title: 'Twin Signatures', kind: 'battle', depth: 2, lane: -1, description: 'Two identical drones. Separate targets, separate shields.', encounterId: 'twins', next: ['orion-depot', 'lens-array'] },
  { id: 'nacre', title: 'Nacre', kind: 'planet', depth: 2, lane: 1, description: 'Send a team to an abandoned listening post, or negotiate access.', missionId: 'nacre', next: ['orion-depot', 'lens-array'] },
  { id: 'orion-depot', title: 'Orion Depot', kind: 'depot', depth: 3, lane: -1, description: 'Finite repair, recruitment and refit services. Pay in salvage scrap.', next: ['corsair-intercept', 'boreal'] },
  { id: 'lens-array', title: 'Lens Array', kind: 'science', depth: 3, lane: 1, description: 'Decode old research, exchange navigation data, or recover useful metal.', next: ['corsair-intercept', 'boreal'] },
  { id: 'corsair-intercept', title: 'Corsair Intercept', kind: 'battle', depth: 4, lane: -1, description: 'A paired Corsair patrol closes the inner route.', encounterId: 'corsairs', next: ['nomad-freighter', 'graveyard'] },
  { id: 'boreal', title: 'Boreal', kind: 'planet', depth: 4, lane: 1, description: 'A guarded vault rewards a stronger team or a skilled diplomatic party.', missionId: 'boreal', next: ['nomad-freighter', 'graveyard'] },
  { id: 'nomad-freighter', title: 'Nomad Freighter', kind: 'freighter', depth: 5, lane: -1, description: 'A last chance to repair, recruit or refit before the blockade.', next: ['relay-blockade'] },
  { id: 'graveyard', title: 'Ship Graveyard', kind: 'battle', depth: 5, lane: 1, description: 'Take the dangerous salvage route through a guarded wreck field.', encounterId: 'graveyard', next: ['relay-blockade'] },
  { id: 'relay-blockade', title: 'Relay Blockade', kind: 'battle', depth: 6, lane: 0, description: 'Three different ships hold the final approach.', encounterId: 'relay', next: ['far-relay'] },
  { id: 'far-relay', title: 'Far Relay', kind: 'exit', depth: 7, lane: 0, description: 'Transmit the completed survey and bring the expedition home.', next: [] },
];
export const SECTOR_NODES: readonly ExpeditionNode[] = Object.freeze(nodes.map(node => Object.freeze({ ...node, next: Object.freeze(node.next) })));
export const SECTOR: Readonly<Record<string, ExpeditionNode>> = Object.freeze(Object.fromEntries(SECTOR_NODES.map(node => [node.id, node])));

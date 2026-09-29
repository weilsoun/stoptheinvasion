import type { ShipBaseCardId, ShipCardDefinition } from './types';

export type CardRarity = 'common' | 'uncommon' | 'rare';
export type CardDepartment = 'weapons' | 'engineering' | 'command';
export interface CardIdentity {
  readonly rarity: CardRarity | null;
  readonly department: CardDepartment;
}

const BASE_IDENTITIES: Readonly<Record<ShipBaseCardId, CardIdentity>> = Object.freeze({
  pulse: Object.freeze({ rarity: 'common', department: 'weapons' }),
  shield: Object.freeze({ rarity: 'common', department: 'engineering' }),
  burst: Object.freeze({ rarity: 'uncommon', department: 'weapons' }),
  cell: Object.freeze({ rarity: 'uncommon', department: 'engineering' }),
  sweep: Object.freeze({ rarity: 'uncommon', department: 'command' }),
  lance: Object.freeze({ rarity: 'rare', department: 'weapons' }),
});

// Research drafts have no approved acquisition rarity. Their authored mechanical
// kind supplies a department until a card receives an explicit live identity.
const RESEARCH_IDENTITIES: Readonly<Record<ShipCardDefinition['kind'], CardIdentity>> = Object.freeze({
  attack: Object.freeze({ rarity: null, department: 'weapons' }),
  system: Object.freeze({ rarity: null, department: 'engineering' }),
  crew: Object.freeze({ rarity: null, department: 'command' }),
});

export const DEPARTMENT_LABELS: Readonly<Record<CardDepartment, string>> = Object.freeze({
  weapons: 'Weapons',
  engineering: 'Engineering',
  command: 'Command',
});

const RARITY_STYLES = Object.freeze({
  common: Object.freeze({ label: 'Common', accent: '#c9cfca', titleInk: '#10232a' }),
  uncommon: Object.freeze({ label: 'Uncommon', accent: '#326b9f', titleInk: '#fff4d3' }),
  rare: Object.freeze({ label: 'Rare', accent: '#d9b45e', titleInk: '#10232a' }),
});
const UNRATED_STYLE = Object.freeze({ label: 'Unrated', accent: '#a9b3b1', titleInk: '#10232a' });

export function cardIdentity(definition: Pick<ShipCardDefinition, 'id' | 'kind'>): CardIdentity {
  if (definition.id.startsWith('research:')) return RESEARCH_IDENTITIES[definition.kind];
  return BASE_IDENTITIES[definition.id as ShipBaseCardId];
}

export function rarityStyle(rarity: CardRarity | null) {
  return rarity === null ? UNRATED_STYLE : RARITY_STYLES[rarity];
}

import { createBattle, SHIP_CARDS, SHIP_DECK } from '../src/ship/combat';
import type { ShipBaseCardId, ShipCardDefinition, ShipCardId, ShipEffect, ShipLoadout } from '../src/ship/types';
import { validateJevResponse } from './jev-provider';
import type { JevEvaluator, JevRequest, JevResponse } from './jev-types';

export type DesignStrategy = 'assault' | 'bulwark' | 'tempo';
export interface CardProposal {
  strategy: DesignStrategy;
  card: ShipCardDefinition;
  deck: ShipCardId[];
  replace: ShipBaseCardId;
  copies: number;
}
export interface DesignResult {
  proposals: CardProposal[];
  decisions: Array<{ stage: string; request: JevRequest; response: JevResponse }>;
}
export interface ResearchVariant {
  id: string;
  strategy?: string;
  kind: 'baseline' | 'deck-only' | 'card-only' | 'combined';
  loadout?: ShipLoadout;
}
export interface DesignFeedback {
  sourceFingerprint: string;
  inputFingerprint: string;
  strategies: Record<DesignStrategy, { proposal: CardProposal; measurements: unknown[]; findings: string[] }>;
}

const STRATEGIES = ['assault', 'bulwark', 'tempo'] as const;
const GOALS: Record<DesignStrategy, string> = {
  assault: 'Concentrate damage to remove enemy attacks early while retaining enough defense to survive.',
  bulwark: 'Preserve hull through useful shield timing without losing the damage needed to finish the encounter.',
  tempo: 'Improve playable hand and energy sequencing without excessive cycling or spending turns without damage.',
};
const PUBLIC_RULES = {
  encounter: 'One Kestrel battle, three visible enemies; not a full expedition.',
  turn: 'Cards resolve immediately, then End Turn resolves living enemy intents. Fresh hand of five and three energy next turn.',
  shields: 'Shields cap at 12 and regenerate by 3 per turn. Adaptive Coils adds 2 to the first shield card each turn.',
  targeting: 'Attack effects all hit one selected living enemy in order; self effects affect the player. Damage uses shields before hull.',
  exhaustion: 'Exhausted cards do not recycle. Every free or energy-granting research card exhausts.',
};

type FamilyId = 'single' | 'salvo' | 'shield' | 'shield-draw' | 'draw' | 'energy' | 'energy-draw';
interface Family {
  title: string;
  description: string;
  kind: ShipCardDefinition['kind'];
  flavor: string;
  profiles: Record<string, readonly (readonly ShipEffect[])[]>;
}
const FAMILIES: Record<FamilyId, Family> = {
  single: {
    title: 'Redshift Driver', description: 'One focused damage hit.', kind: 'attack',
    flavor: 'The rangefinder paints one distant point.',
    profiles: { '1': [[{ kind: 'damage', amount: 7 }], [{ kind: 'damage', amount: 9 }]], '2': [[{ kind: 'damage', amount: 14 }], [{ kind: 'damage', amount: 17 }]] },
  },
  salvo: {
    title: 'Crosswake Salvo', description: 'Two consecutive damage hits against the same enemy.', kind: 'attack',
    flavor: 'Two trails converge beyond the bow.',
    profiles: { '1': [[{ kind: 'damage', amount: 4 }, { kind: 'damage', amount: 4 }], [{ kind: 'damage', amount: 6 }, { kind: 'damage', amount: 6 }]], '2': [[{ kind: 'damage', amount: 7 }, { kind: 'damage', amount: 7 }], [{ kind: 'damage', amount: 9 }, { kind: 'damage', amount: 9 }]] },
  },
  shield: {
    title: 'Harbor Lattice', description: 'Restore shields, bounded by the player shield cap.', kind: 'system',
    flavor: 'A small harbor in an empty sky.',
    profiles: { '1': [[{ kind: 'shield', amount: 5 }], [{ kind: 'shield', amount: 7 }]], '2': [[{ kind: 'shield', amount: 9 }], [{ kind: 'shield', amount: 11 }]] },
  },
  'shield-draw': {
    title: 'Watchkeeper Relay', description: 'Restore shields, then draw cards in that order.', kind: 'crew',
    flavor: 'The watch keeps one eye on every station.',
    profiles: { '1': [[{ kind: 'shield', amount: 3 }, { kind: 'draw', amount: 1 }], [{ kind: 'shield', amount: 5 }, { kind: 'draw', amount: 1 }]], '2': [[{ kind: 'shield', amount: 6 }, { kind: 'draw', amount: 2 }], [{ kind: 'shield', amount: 8 }, { kind: 'draw', amount: 1 }]] },
  },
  draw: {
    title: 'Signal Window', description: 'Draw cards; the free version exhausts.', kind: 'crew',
    flavor: 'A clear channel opens for a moment.',
    profiles: { '0': [[{ kind: 'draw', amount: 1 }], [{ kind: 'draw', amount: 2 }]], '1': [[{ kind: 'draw', amount: 1 }], [{ kind: 'draw', amount: 3 }]] },
  },
  energy: {
    title: 'Flywheel Release', description: 'Gain energy after paying the cost; always exhausts.', kind: 'system',
    flavor: 'Stored motion becomes one bright opportunity.',
    profiles: { '0': [[{ kind: 'energy', amount: 1 }], [{ kind: 'energy', amount: 3 }]], '1': [[{ kind: 'energy', amount: 2 }], [{ kind: 'energy', amount: 3 }]] },
  },
  'energy-draw': {
    title: 'Relay Overdrive', description: 'Gain energy then draw; always exhausts. Trades Reserve Cell’s net energy for immediate hand access.', kind: 'system',
    flavor: 'One stored spark wakes the next station.',
    profiles: {
      '0': [[{ kind: 'energy', amount: 1 }, { kind: 'draw', amount: 1 }], [{ kind: 'energy', amount: 1 }, { kind: 'draw', amount: 2 }]],
      '1': [[{ kind: 'energy', amount: 2 }, { kind: 'draw', amount: 2 }], [{ kind: 'energy', amount: 3 }, { kind: 'draw', amount: 1 }]],
    },
  },
};
const ROLES: Record<DesignStrategy, readonly FamilyId[]> = {
  assault: ['single', 'salvo'], bulwark: ['shield', 'shield-draw'], tempo: ['draw', 'energy'],
};
const BASE_IDS: readonly ShipBaseCardId[] = ['pulse', 'shield', 'lance', 'cell', 'sweep', 'burst'];
// Each authored row is a complete deck, in BASE_IDS order; Jev selects, never invents counts.
const DECKS: Record<DesignStrategy, Record<string, readonly number[]>> = {
  assault: { batteries: [5, 2, 3, 1, 1, 3], skirmish: [6, 3, 1, 1, 1, 3], heavy: [4, 3, 4, 1, 1, 2] },
  bulwark: { bastion: [5, 5, 2, 1, 1, 1], watch: [4, 4, 2, 1, 3, 1], counterfire: [3, 4, 3, 1, 1, 3] },
  tempo: { signals: [4, 3, 2, 2, 3, 1], reserves: [5, 2, 2, 3, 2, 1], cadence: [4, 3, 1, 2, 2, 3] },
};

function cloneCard(card: ShipCardDefinition): ShipCardDefinition {
  return { ...card, effects: card.effects.map((effect) => ({ ...effect })) };
}

async function choose<T>(
  evaluate: JevEvaluator,
  decisions: DesignResult['decisions'],
  strategy: DesignStrategy,
  stage: string,
  selected: unknown,
  options: Record<string, T>,
  feedback?: DesignFeedback['strategies'][DesignStrategy],
): Promise<T> {
  const request: JevRequest = {
    state: { strategy, goal: GOALS[strategy], rules: PUBLIC_RULES, baseCards: SHIP_CARDS, baselineDeck: SHIP_DECK, selected, ...(feedback ? { priorResearch: structuredClone(feedback) } : {}) },
    questions: {
      selection: {
        type: 'choice',
        instructions: `Design a ${strategy} research card and 15-card build. ${GOALS[strategy]} Select ${stage} from the declared options using the prior selections in state. Titles/flavor are authored templates, not model-generated prose. Seek a competitive candidate, not maximum raw power.${feedback ? ' Refine your prior own-strategy proposal using the measured baseline, isolated controls and interactions in priorResearch. All-win results do not establish balance; weigh hull, speed, usage and affordability. You may retain a choice when supported by evidence.' : ''}`,
        criteria: options,
      },
    },
  };
  // Keep a detached request for validation/provenance even when an injected evaluator mutates its argument.
  const response = validateJevResponse(request, await evaluate(structuredClone(request)));
  decisions.push({ stage: `${strategy}:${stage}`, request: structuredClone(request), response: structuredClone(response) });
  return options[response.answers.selection.choice];
}

function replacementOptions(deck: readonly ShipCardId[]): Record<string, { replace: ShipBaseCardId; copies: number }> {
  const options: Record<string, { replace: ShipBaseCardId; copies: number }> = {};
  for (const replace of BASE_IDS) {
    const available = Math.min(SHIP_DECK.filter((id) => id === replace).length, deck.filter((id) => id === replace).length, 3);
    for (let copies = 1; copies <= available; copies += 1) options[`${replace}-${copies}`] = { replace, copies };
  }
  return options;
}

function insertCard(deck: readonly ShipCardId[], proposal: CardProposal): ShipCardId[] {
  if (!Number.isInteger(proposal.copies) || proposal.copies < 1 || proposal.copies > 3) throw new Error('Research copy count must be an integer from 1 to 3.');
  let remaining = proposal.copies;
  const result = deck.map((id) => {
    if (id !== proposal.replace || remaining === 0) return id;
    remaining -= 1;
    return proposal.card.id;
  });
  if (remaining !== 0) throw new Error(`Not enough ${proposal.replace} cards for ${proposal.strategy} replacement.`);
  return result;
}

export async function generateDesigns(evaluate: JevEvaluator, feedback?: DesignFeedback): Promise<DesignResult> {
  const result: DesignResult = { proposals: [], decisions: [] };
  for (const strategy of STRATEGIES) {
    const prior = feedback?.strategies[strategy];
    const roles: readonly FamilyId[] = prior && strategy === 'tempo' ? ['draw', 'energy-draw'] : ROLES[strategy];
    const families = Object.fromEntries(roles.map((id) => [id, { id, title: FAMILIES[id].title, description: FAMILIES[id].description }]));
    const familyChoice = await choose(evaluate, result.decisions, strategy, 'recipe family', {}, families, prior);
    const family = FAMILIES[familyChoice.id];
    const costs = Object.fromEntries(Object.entries(family.profiles).map(([cost, effects]) => [`cost-${cost}`, {
      cost: Number(cost), feasibleEffects: effects, exhaust: Number(cost) === 0 || familyChoice.id === 'energy' || familyChoice.id === 'energy-draw',
    }]));
    const cost = await choose(evaluate, result.decisions, strategy, 'energy cost', { family: familyChoice }, costs, prior);
    const magnitudes = Object.fromEntries(family.profiles[String(cost.cost)].map((effects, index) => [`profile-${index + 1}`, { effects }]));
    const magnitude = await choose(evaluate, result.decisions, strategy, 'effect magnitude', { family: familyChoice, cost }, magnitudes, prior);
    const card: ShipCardDefinition = {
      id: `research:${strategy}-${familyChoice.id}`, title: family.title, cost: cost.cost, kind: family.kind,
      effects: magnitude.effects.map((effect) => ({ ...effect })), flavor: family.flavor,
      ...(cost.exhaust ? { exhaust: true } : {}),
    };
    const decks = Object.fromEntries(Object.entries(DECKS[strategy]).map(([id, counts]) => [id, {
      deck: BASE_IDS.flatMap((baseId, index) => Array<ShipBaseCardId>(counts[index]).fill(baseId)),
    }]));
    const selectedDeck = await choose(evaluate, result.decisions, strategy, 'base deck', { card }, decks, prior);
    const replacement = await choose(evaluate, result.decisions, strategy, 'replacement and copy count', { card, deck: selectedDeck.deck }, replacementOptions(selectedDeck.deck), prior);
    const proposal: CardProposal = { strategy, card, deck: [...selectedDeck.deck], ...replacement };
    createBattle(1, { deck: proposal.deck });
    createBattle(1, { deck: insertCard(SHIP_DECK, proposal), cards: [proposal.card] });
    createBattle(1, { deck: insertCard(proposal.deck, proposal), cards: [proposal.card] });
    result.proposals.push(proposal);
  }
  return result;
}

export function researchVariants(designs: DesignResult): ResearchVariant[] {
  if (designs.proposals.length !== STRATEGIES.length || STRATEGIES.some((strategy) => designs.proposals.filter((proposal) => proposal.strategy === strategy).length !== 1)) {
    throw new Error('Research comparisons require one proposal for each strategy.');
  }
  const variants: ResearchVariant[] = [{ id: 'baseline', kind: 'baseline' }];
  for (const proposal of designs.proposals) {
    const allowed = replacementOptions(proposal.deck);
    if (!Object.hasOwn(allowed, `${proposal.replace}-${proposal.copies}`)) throw new Error(`Invalid replacement for ${proposal.strategy}.`);
    const entries: ResearchVariant[] = [
      { id: `${proposal.strategy}-deck-only`, strategy: proposal.strategy, kind: 'deck-only', loadout: { deck: [...proposal.deck] } },
      { id: `${proposal.strategy}-card-only`, strategy: proposal.strategy, kind: 'card-only', loadout: { deck: insertCard(SHIP_DECK, proposal), cards: [cloneCard(proposal.card)] } },
      { id: `${proposal.strategy}-combined`, strategy: proposal.strategy, kind: 'combined', loadout: { deck: insertCard(proposal.deck, proposal), cards: [cloneCard(proposal.card)] } },
    ];
    for (const variant of entries) createBattle(1, variant.loadout);
    variants.push(...entries);
  }
  return variants;
}

export async function assessDesigns(evaluate: JevEvaluator, publicSummary: unknown): Promise<JevResponse> {
  const request: JevRequest = {
    state: { scope: 'Paired measurements from one encounter only; no full-expedition or human-fun claims.', measurements: structuredClone(publicSummary) },
    questions: Object.fromEntries(STRATEGIES.map((strategy) => [strategy, {
      type: 'choice' as const,
      instructions: `Assess the ${strategy} candidate against baseline using the supplied paired results and the deck-only/card-only/combined controls. Consider uncertainty, survival and generated-card usage. This is advisory only: measurements, not your confidence, are evidence; never promote to live content.`,
      criteria: {
        underpowered: 'Measured results suggest the candidate is too weak.',
        competitive: 'Measured results suggest useful tradeoffs near baseline performance.',
        overpowered: 'Measured results suggest the candidate dominates with insufficient tradeoffs.',
        uncertain: 'Evidence is insufficient, conflicting, bounded, or does not isolate the candidate effect.',
      },
    }])),
  };
  return validateJevResponse(request, await evaluate(structuredClone(request)));
}

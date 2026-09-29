import type { CardDefinition, Effect } from './types';

export const TERMS = {
  block: {
    label: 'Block',
    description: 'Absorbs damage until the actor begins their next action.',
  },
  exposed: {
    label: 'Exposed',
    description: 'Next hit deals extra damage equal to Exposed, then clears.',
  },
  surge: {
    label: 'Surge',
    description: 'Temporary energy spent before stored energy. Unused Surge expires after 4 ticks.',
  },
  retain: {
    label: 'Retain',
    description: 'Stays in hand after play instead of drawing a replacement. Granted Retain lasts for one play.',
  },
  criticalHit: {
    label: 'Critical Hit',
    description: 'A hit against Exposed. Critical effects trigger once per action, unless the hit is lethal; no extra multiplier.',
  },
  ringing: {
    label: 'Ringing',
    description: 'Skips the actor’s next action, then clears.',
  },
  upgrade: {
    label: 'Upgrade',
    description: 'Improves one exact hand card by its authored increments for its next play.',
  },
  downgrade: {
    label: 'Downgrade',
    description: 'Weakens one enemy’s next attack by its authored increments, then clears.',
  },
  scouting: {
    label: 'Scouting',
    description: 'Extends the forecast for 4 ticks. Future cards are predictions, not playable cards.',
  },
  echo: {
    label: 'Echo',
    description: 'Repeat one eligible past action at its recorded grade against the current target. Each original can be echoed once; Echo cannot copy Echo.',
  },
  rewind: {
    label: 'Rewind',
    description: 'Restore a past world state within 8 ticks and this checkpoint. Costs one checkpoint charge; no tick passes. A Rewind card exhausts outside the restored past.',
  },
  borrow: {
    label: 'Borrow',
    description: 'Draw 2 extra cards, then skip the next 2 automatic replacement draws. Extra draws do not repay debt. Exhausts; settle debt before borrowing again.',
  },
  stretch: {
    label: 'Stretch',
    description: 'Enemies need 2 ticks per action for the stated duration. Replaces Compress; your actions still cost 1 tick.',
  },
  compress: {
    label: 'Compress',
    description: 'Enemies take 2 actions per tick for the stated duration. Replaces Stretch; your actions still cost 1 tick.',
  },
} as const;

export type TermId = keyof typeof TERMS;

export interface CardTermMatch { term: TermId; start: number; end: number }

const cardTermNames = new Map<string, TermId>(
  Object.entries(TERMS).map(([id, entry]) => [entry.label.toLowerCase(), id as TermId]),
);
const cardTermAliases: Record<string, TermId> = {
  'surge energy': 'surge',
  retained: 'retain',
  upgrades: 'upgrade', upgraded: 'upgrade',
  downgrades: 'downgrade', downgraded: 'downgrade',
  echoed: 'echo',
  rewinding: 'rewind',
  borrowed: 'borrow',
  stretched: 'stretch',
  compressed: 'compress',
};
for (const [name, term] of Object.entries(cardTermAliases)) cardTermNames.set(name, term);
const cardTermPattern = new RegExp(
  `\\b(?:${[...cardTermNames.keys()].sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')).join('|')})\\b`,
  'gi',
);

/** Non-overlapping UTF-16 ranges; longest phrases win over their individual words. */
export function matchCardTerms(text: string): CardTermMatch[] {
  const matches: CardTermMatch[] = [];
  for (const match of text.matchAll(cardTermPattern)) {
    const term = cardTermNames.get(match[0].toLowerCase().replace(/\s+/g, ' '))!;
    matches.push({ term, start: match.index, end: match.index + match[0].length });
  }
  return matches;
}

function effectTerm(effect: Effect): TermId | null {
  return effect.kind === 'block' || effect.kind === 'exposed' || effect.kind === 'ringing'
    ? effect.kind : null;
}

export function cardTerms(card: CardDefinition): TermId[] {
  const terms = new Set<TermId>();
  for (const effect of card.effects) {
    const term = effectTerm(effect);
    if (term) terms.add(term);
  }
  if (card.onCritical?.length) {
    terms.add('criticalHit');
    for (const effect of card.onCritical) {
      const term = effectTerm(effect);
      if (term) terms.add(term);
    }
  }
  if (card.surge) terms.add('surge');
  if (card.modifier) terms.add(card.modifier.levels < 0 ? 'downgrade' : 'upgrade');
  if (card.time) terms.add(card.time.kind === 'scout' ? 'scouting' : card.time.kind);
  if (card.temporal) terms.add(card.temporal.kind);
  if (card.retain) terms.add('retain');
  for (const { term } of matchCardTerms(card.name)) terms.add(term);
  for (const { term } of matchCardTerms(card.description)) terms.add(term);
  return [...terms];
}

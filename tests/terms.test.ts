import { expect, test } from 'bun:test';
import { CARDS } from '../src/game/content';
import { cardTerms, matchCardTerms } from '../src/game/terms';

test('card keywords prefer whole phrases and preserve exact text spans across whitespace', () => {
  const text = 'SURGE energy, energy; Blockade; tick damage; On CRITICAL\nhit: Ringing.';
  const matches = matchCardTerms(text);
  expect(matches.map(({ term, start, end }) => ({ term, text: text.slice(start, end) }))).toEqual([
    { term: 'surge', text: 'SURGE energy' },
    { term: 'criticalHit', text: 'CRITICAL\nhit' },
    { term: 'ringing', text: 'Ringing' },
  ]);
  expect(matchCardTerms(text)).toEqual(matches);
});

test('time and retained-card mechanics expose their own glossary entries', () => {
  for (const [id, term] of [
    ['overtime', 'stretch'], ['clockout', 'compress'], ['lookout', 'scouting'],
    ['reclaim', 'rewind'], ['receipt', 'retain'], ['borrow', 'borrow'], ['echo', 'echo'],
  ] as const) {
    const card = CARDS[id];
    expect(cardTerms({ ...card, name: '', description: '' })).toContain(term);
    expect(matchCardTerms(card.description).some((match) => match.term === term)).toBe(true);
  }
});

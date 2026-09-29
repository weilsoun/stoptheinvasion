import { describe, expect, test } from 'bun:test';
import { createBattle, dispatchBattle, legalTargets, previewCard, SHIP_CARDS, SHIP_DECK } from '../src/ship/combat';
import type { ShipBattleState, ShipCardDefinition } from '../src/ship/types';
import { assessDesigns, generateDesigns, researchVariants } from '../scripts/jev-design';
import type { DesignStrategy } from '../scripts/jev-design';
import type { JevEvaluator, JevRequest, JevResponse } from '../scripts/jev-types';
import { buildJevReport, extractDesignFeedback, gameplayRequest } from '../scripts/jev-ship';

async function priorReport() {
  return buildJevReport(async request => answer(request, (options, question) => {
    if (question === 'action') return options.find(id => String(request.questions.action.criteria[id]).startsWith('End Turn:'))!;
    const state = request.state;
    const strategy = state && typeof state === 'object' && 'strategy' in state ? state.strategy : undefined;
    if (strategy === 'tempo') return ['energy', 'cost-1', 'profile-2'].find(id => options.includes(id)) ?? options[0];
    return options[0];
  }), { seeds: 1, jevSeeds: 1, maxRequests: 512 });
}

type Plan = Partial<Record<DesignStrategy, string[]>>;
function answer(request: JevRequest, choose: (options: string[], question: string) => string): JevResponse {
  return {
    model: 'typesafe/jev-1.13.0',
    answers: Object.fromEntries(Object.entries(request.questions).map(([key, question]) => {
      const options = Object.keys(question.criteria);
      const choice = choose(options, key);
      return [key, { type: 'choice', choice, confidence: 1, probabilities: Object.fromEntries(options.map((option) => [option, Number(option === choice)])) }];
    })),
    usage: { input_tokens: 100, output_tokens: 20 },
    costUsd: 0.001,
  };
}
function evaluator(plan: Plan = {}, captured: JevRequest[] = []): JevEvaluator {
  return async (request) => {
    captured.push(structuredClone(request));
    const { strategy } = request.state as { strategy: DesignStrategy };
    return answer(request, (options) => plan[strategy]?.find((option) => options.includes(option)) ?? options[0]);
  };
}
function freezeTree(value: unknown): void {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeTree);
    Object.freeze(value);
  }
}
function putCandidateInHand(state: ShipBattleState, definition: ShipCardDefinition): string {
  const inHand = state.hand.find((card) => card.id === definition.id);
  if (inHand) return inHand.uid;
  const index = state.draw.findIndex((card) => card.id === definition.id);
  if (index < 0) throw new Error('Candidate missing from battle.');
  const [card] = state.draw.splice(index, 1);
  state.hand.push(card);
  return card.uid;
}

describe('dependent Jev research construction', () => {
  test('family and cost selections constrain later effect options and the resulting card', async () => {
    const requests: JevRequest[] = [];
    const low = await generateDesigns(evaluator({ assault: ['single', 'cost-1', 'profile-2'] }, requests));
    const expensive = await generateDesigns(evaluator({ assault: ['single', 'cost-2', 'profile-2'] }));
    const salvo = await generateDesigns(evaluator({ assault: ['salvo', 'cost-2', 'profile-2'] }));
    expect(low.proposals[0].card).toMatchObject({ cost: 1, effects: [{ kind: 'damage', amount: 9 }] });
    expect(expensive.proposals[0].card).toMatchObject({ cost: 2, effects: [{ kind: 'damage', amount: 17 }] });
    expect(salvo.proposals[0].card).toMatchObject({ cost: 2, effects: [{ kind: 'damage', amount: 9 }, { kind: 'damage', amount: 9 }] });
    const lowMagnitude = low.decisions.find((decision) => decision.stage === 'assault:effect magnitude')!;
    const expensiveMagnitude = expensive.decisions.find((decision) => decision.stage === 'assault:effect magnitude')!;
    expect(lowMagnitude.request.questions.selection.criteria).not.toEqual(expensiveMagnitude.request.questions.selection.criteria);
    expect(lowMagnitude.request.state).toMatchObject({ strategy: 'assault', selected: { family: { id: 'single', title: low.proposals[0].card.title }, cost: { cost: 1 } } });
    const deckDecision = low.decisions.find((decision) => decision.stage === 'assault:base deck')!;
    expect(deckDecision.request.state).toMatchObject({ selected: { card: low.proposals[0].card } });
    for (const decision of low.decisions) {
      expect(decision.response.model).toBe('typesafe/jev-1.13.0');
      expect(decision.response.usage).toEqual({ input_tokens: 100, output_tokens: 20 });
      expect(decision.response.costUsd).toBe(0.001);
      expect(decision.request).toEqual(requests.shift()!);
    }
  });

  test('Jev deck and replacement decisions change the build, bounded by both control decks', async () => {
    const batteries = await generateDesigns(evaluator({ assault: ['batteries', 'lance-2'] }));
    const skirmish = await generateDesigns(evaluator({ assault: ['skirmish', 'burst-1'] }));
    const first = batteries.proposals[0];
    const second = skirmish.proposals[0];
    expect(first.deck.filter((id) => id === 'lance')).toHaveLength(3);
    expect(second.deck.filter((id) => id === 'lance')).toHaveLength(1);
    expect(first).toMatchObject({ replace: 'lance', copies: 2 });
    expect(second).toMatchObject({ replace: 'burst', copies: 1 });
    const replacement = skirmish.decisions.find((decision) => decision.stage === 'assault:replacement and copy count')!;
    expect(replacement.request.questions.selection.criteria).toHaveProperty('lance-1');
    expect(replacement.request.questions.selection.criteria).not.toHaveProperty('lance-2');
    expect(replacement.request.questions.selection.criteria).not.toHaveProperty('burst-2');
    const cardOnly = researchVariants(batteries).find((variant) => variant.id === 'assault-card-only')!;
    expect(cardOnly.loadout!.deck.filter((id) => id === 'lance')).toEqual([]);
    expect(cardOnly.loadout!.deck.filter((id) => id === first.card.id)).toHaveLength(2);
  });

  test('unavailable choices and evaluator-added options fail closed instead of manufacturing proposals', async () => {
    for (const forged of ['constructor', 'invented-recipe']) {
      await expect(generateDesigns(async (request) => answer(request, () => forged))).rejects.toThrow();
    }
    await expect(generateDesigns(async (request) => {
      if (Object.hasOwn(request.questions.selection.criteria, 'cost-1')) return answer(request, () => 'cost-3');
      return answer(request, (options) => options[0]);
    })).rejects.toThrow();
    await expect(generateDesigns(async (request) => {
      request.questions.selection.criteria.injected = { cost: 0, effects: [{ kind: 'damage', amount: 999 }] };
      return answer(request, () => 'injected');
    })).rejects.toThrow();
    await expect(generateDesigns(async () => { throw new Error('provider unavailable'); })).rejects.toThrow('provider unavailable');
  });

  test('every offered cost and magnitude yields an original mechanical signature', async () => {
    const signature = (card: ShipCardDefinition) => JSON.stringify({
      target: card.kind === 'attack' ? 'enemy' : 'self',
      cost: card.cost, effects: card.effects, exhaust: card.exhaust === true,
    });
    const shipped = new Set(Object.values(SHIP_CARDS).map(signature));
    for (const [strategy, family, costs] of [
      ['assault', 'single', [1, 2]], ['assault', 'salvo', [1, 2]],
      ['bulwark', 'shield', [1, 2]], ['bulwark', 'shield-draw', [1, 2]],
      ['tempo', 'draw', [0, 1]], ['tempo', 'energy', [0, 1]],
    ] as const) {
      for (const cost of costs) {
        for (const profile of ['profile-1', 'profile-2']) {
          const designs = await generateDesigns(evaluator({ [strategy]: [family, `cost-${cost}`, profile] }));
          const card = designs.proposals.find((proposal) => proposal.strategy === strategy)!.card;
          expect(shipped.has(signature(card))).toBe(false);
          expect(card.id.startsWith('research:')).toBe(true);
        }
      }
    }
  });

  test('preserves provider responses even if the evaluator later reuses its response object', async () => {
    const responses: JevResponse[] = [];
    const designs = await generateDesigns(async (request) => {
      const response = answer(request, (options) => options[0]);
      responses.push(response);
      return response;
    });
    responses[0].answers.selection.choice = 'forged-after-return';
    expect(designs.decisions[0].response.answers.selection.choice).toBe('single');
  });
});

describe('isolated card and deck controls', () => {
  test('assembles detached variants without mutating the proposals or live content', async () => {
    const catalogBefore = structuredClone(SHIP_CARDS);
    const deckBefore = [...SHIP_DECK];
    const designs = await generateDesigns(evaluator());
    const designsBefore = structuredClone(designs);
    freezeTree(designs);
    const variants = researchVariants(designs);
    expect(variants.map((variant) => variant.id)).toEqual([
      'baseline', 'assault-deck-only', 'assault-card-only', 'assault-combined',
      'bulwark-deck-only', 'bulwark-card-only', 'bulwark-combined',
      'tempo-deck-only', 'tempo-card-only', 'tempo-combined',
    ]);
    const cardOnly = variants.find((variant) => variant.id === 'assault-card-only')!;
    const combined = variants.find((variant) => variant.id === 'assault-combined')!;
    const originalAmount = designs.proposals[0].card.effects[0].amount;
    cardOnly.loadout!.cards![0].effects[0].amount = 24;
    (cardOnly.loadout!.deck as string[])[0] = 'shield';
    expect(combined.loadout!.cards![0].effects[0].amount).toBe(originalAmount);
    expect(designs).toEqual(designsBefore);
    expect(SHIP_CARDS).toEqual(catalogBefore);
    expect(SHIP_DECK).toEqual(deckBefore);
  });

  test('rejects impossible replacement counts instead of silently reducing them', async () => {
    const designs = await generateDesigns(evaluator());
    designs.proposals[0].replace = 'cell';
    designs.proposals[0].copies = 2;
    expect(() => researchVariants(designs)).toThrow('Invalid replacement');
    designs.proposals[0].copies = 1;
    designs.proposals[0].card.effects = [{ kind: 'energy', amount: 99 }];
    expect(() => researchVariants(designs)).toThrow();
  });

  test('all ten variants execute canonical commands to a terminal encounter', async () => {
    const designs = await generateDesigns(evaluator({ assault: ['salvo'], bulwark: ['shield-draw'], tempo: ['energy'] }));
    for (const variant of researchVariants(designs)) {
      const state = createBattle(71, variant.loadout);
      let commands = 0;
      while (state.phase === 'player' && commands < 512) {
        const playable = state.hand.find((card) => state.catalog[card.id].cost <= state.energy);
        const result = dispatchBattle(state, playable
          ? { type: 'play', uid: playable.uid, targetId: legalTargets(state, playable.uid)[0] }
          : { type: 'end-turn' });
        expect(result.ok).toBe(true);
        commands += 1;
      }
      expect(['victory', 'defeat']).toContain(state.phase);
      const ids = [...state.hand, ...state.draw, ...state.discard, ...state.exhaust].map((card) => card.id).sort();
      expect(ids).toEqual([...(variant.loadout?.deck ?? SHIP_DECK)].sort());
    }
  });
});

describe('generated recipe semantics in the canonical engine', () => {
  for (const [strategy, family, cost, expectedEffects] of [
    ['assault', 'single', 1, [{ kind: 'damage', amount: 7 }]],
    ['assault', 'salvo', 1, [{ kind: 'damage', amount: 4 }, { kind: 'damage', amount: 4 }]],
    ['bulwark', 'shield', 1, [{ kind: 'shield', amount: 5 }]],
    ['bulwark', 'shield-draw', 1, [{ kind: 'shield', amount: 3 }, { kind: 'draw', amount: 1 }]],
    ['tempo', 'draw', 0, [{ kind: 'draw', amount: 1 }]],
    ['tempo', 'energy', 0, [{ kind: 'energy', amount: 1 }]],
  ] as const) {
    test(`${family} applies its selected effects, target, cost and exhaustion`, async () => {
      const designs = await generateDesigns(evaluator({ [strategy]: [family, `cost-${cost}`, 'profile-1'] }));
      const proposal = designs.proposals.find((candidate) => candidate.strategy === strategy)!;
      expect(proposal.card.effects).toEqual(expectedEffects);
      const variant = researchVariants(designs).find((candidate) => candidate.id === `${strategy}-combined`)!;
      const state = createBattle(11, variant.loadout);
      const uid = putCandidateInHand(state, proposal.card);
      state.player.shield = 0;
      const handBefore = state.hand.filter((card) => card.uid !== uid).map((card) => card.uid);
      const drawBefore = state.draw.map((card) => card.uid);
      const expectedDraw = expectedEffects.reduce((sum, effect) => sum + (effect.kind === 'draw' ? effect.amount : 0), 0);
      const expectedDamage = expectedEffects.reduce((sum, effect) => sum + (effect.kind === 'damage' ? effect.amount : 0), 0);
      const expectedEnergy = expectedEffects.reduce((sum, effect) => sum + (effect.kind === 'energy' ? effect.amount : 0), 0);
      const shield = expectedEffects.find((effect) => effect.kind === 'shield');
      const target = proposal.card.kind === 'attack' ? 'corsair' : state.player.id;
      expect(previewCard(state, uid)?.effects).toEqual(expectedEffects.map((effect) => ({ ...effect, amount: effect.amount + (effect.kind === 'shield' ? 2 : 0) })));
      const result = dispatchBattle(state, { type: 'play', uid, targetId: target });
      expect(result.ok).toBe(true);
      expect(state.energy).toBe(3 - cost + expectedEnergy);
      expect(state.enemies[0].shield).toBe(Math.max(0, 6 - expectedDamage));
      expect(state.enemies[0].hull).toBe(28 - Math.max(0, expectedDamage - 6));
      expect(state.player.hull).toBe(70);
      expect(state.player.shield).toBe(shield ? Math.min(12, shield.amount + 2) : 0);
      expect(state.coilsAvailable).toBe(!shield);
      expect(state.hand.map((card) => card.uid)).toEqual([...handBefore, ...drawBefore.slice(0, expectedDraw)]);
      expect(result.events.filter((event) => event.type === 'damage').map((event) => event.amount)).toEqual(expectedEffects.filter((effect) => effect.kind === 'damage').map((effect) => effect.amount));
      const exhausts = expectedEnergy > 0 || cost === 0;
      expect(state.exhaust.some((card) => card.uid === uid)).toBe(exhausts);
      expect(state.discard.some((card) => card.uid === uid)).toBe(!exhausts);
      if (family === 'shield-draw') {
        expect(result.events.filter((event) => event.type === 'shield' || event.type === 'draw').map((event) => event.type)).toEqual(['shield', 'draw']);
      }
    });
  }

  test('paid energy recipes still exhaust after granting their net energy', async () => {
    const designs = await generateDesigns(evaluator({ tempo: ['energy', 'cost-1', 'profile-2'] }));
    const card = designs.proposals[2].card;
    const state = createBattle(8, researchVariants(designs).find((variant) => variant.id === 'tempo-combined')!.loadout);
    const uid = putCandidateInHand(state, card);
    expect(dispatchBattle(state, { type: 'play', uid }).ok).toBe(true);
    expect(state.energy).toBe(5);
    expect(state.exhaust.some((entry) => entry.uid === uid)).toBe(true);
    expect(state.discard.some((entry) => entry.uid === uid)).toBe(false);
  });
});

describe('measured research refinement', () => {
  test('only own public designs and aggregate comparisons enter synthesis; hidden changes do not alter feedback identity', async () => {
    const report = await priorReport();
    const feedback = extractDesignFeedback(report);
    const altered = structuredClone(report);
    altered.results = [];
    altered.jevResults = [];
    altered.requests = [];
    altered.seeds = [987654321];
    altered.heuristicMeasurements[0].variants[0].versusBaseline.pairs = [];
    Object.assign(altered, { provider: { apiKey: 'private-sentinel' }, rng: 'private-sentinel' });
    Object.assign(altered.designs.proposals[0].card, { secret: 'private-sentinel' });
    Object.assign(altered.heuristicMeasurements[0].variants[0].summary.usage, { 'private-sentinel': 999 });
    expect(extractDesignFeedback(altered)).toEqual(feedback);
    const requests: JevRequest[] = [];
    const observation = gameplayRequest(createBattle(17));
    await generateDesigns(evaluator({ tempo: ['energy-draw'] }, requests), feedback);
    expect(gameplayRequest(createBattle(17))).toEqual(observation);
    for (const request of requests) {
      const state = request.state as { strategy: DesignStrategy; priorResearch: { proposal: { strategy: string }; measurements: Array<{ variants: Array<{ id: string }> }> } };
      expect(state.priorResearch.proposal.strategy).toBe(state.strategy);
      for (const measurement of state.priorResearch.measurements) {
        expect(measurement.variants.every(variant => variant.id === 'baseline' || variant.id.startsWith(`${state.strategy}-`))).toBe(true);
      }
      expect(JSON.stringify(state)).not.toContain('private-sentinel');
      expect(JSON.stringify(state.priorResearch)).not.toMatch(/"(seed|rng|trace|pairs|requests|provider)"/);
    }
    expect(feedback.strategies.tempo.findings.join(' ')).toContain('requires upfront energy');
    altered.heuristicMeasurements[0].variants[0].summary.usage.pulse += 1;
    expect(extractDesignFeedback(altered).inputFingerprint).not.toBe(feedback.inputFingerprint);
    const changed = structuredClone(feedback);
    await generateDesigns(async request => {
      const state = request.state;
      if (!state || typeof state !== 'object' || !('priorResearch' in state) || !state.priorResearch || typeof state.priorResearch !== 'object') throw new Error('Missing refinement feedback');
      Object.assign(state.priorResearch, { proposal: null });
      return answer(request, options => options[0]);
    }, feedback);
    expect(feedback).toEqual(changed);
  });

  test('rejects incomplete, foreign, malformed and impossible public report data', async () => {
    const report = await priorReport();
    const mutations: Array<(value: typeof report) => void> = [
      value => { value.status = 'failed'; },
      value => { value.kind = 'other-study'; },
      value => { value.schemaVersion = 99; },
      value => { value.fingerprint.study = 'not-a-fingerprint'; },
      value => { value.designs.proposals.pop(); },
      value => { value.designs.proposals[0].copies = 9; },
      value => { value.designs.proposals[0].card.effects[0].amount = 999; },
      value => { value.heuristicMeasurements.pop(); },
      value => { value.heuristicMeasurements[0].variants.pop(); },
      value => { value.heuristicMeasurements[0].variants[0].summary.meanHull = Number.NaN; },
      value => { value.heuristicMeasurements[0].variants[0].summary.victory = 999; },
      value => { value.heuristicMeasurements[0].variants[0].versusBaseline.meanHullDelta = Number.POSITIVE_INFINITY; },
      value => { value.heuristicMeasurements[0].interactions.pop(); },
      value => { value.jevMeasurements[0].variants[1].id = 'wrong-control'; },
    ];
    for (const mutate of mutations) {
      const invalid = structuredClone(report);
      mutate(invalid);
      expect(() => extractDesignFeedback(invalid)).toThrow();
    }
  });

  test('rejects bounded but inconsistent baseline deltas and both isolated interaction contrasts', async () => {
    const report = await priorReport();
    for (const section of ['heuristicMeasurements', 'jevMeasurements'] as const) {
      for (const variantIndex of [0, 1]) {
        for (const key of ['meanWinDelta', 'meanHullDelta', 'meanTurnDelta'] as const) {
          const invalid = structuredClone(report);
          const supplied = invalid[section][0].variants[variantIndex].versusBaseline;
          supplied[key] += supplied[key] >= 0 ? -0.125 : 0.125;
          expect(() => extractDesignFeedback(invalid)).toThrow(`Inconsistent feedback comparison: ${key}`);
        }
      }
    }
    for (const interactionIndex of [0, 1]) {
      for (const key of ['meanWinDelta', 'meanHullDelta', 'meanTurnDelta'] as const) {
        const invalid = structuredClone(report);
        const supplied = invalid.heuristicMeasurements[0].interactions[interactionIndex];
        supplied[key] += supplied[key] >= 0 ? -0.125 : 0.125;
        expect(() => extractDesignFeedback(invalid)).toThrow(`Inconsistent feedback comparison: ${key}`);
      }
    }
  });

  test('refined energy/draw profiles honor Jev choices, upfront affordability, ordered effects and exhaustion', async () => {
    const feedback = extractDesignFeedback(await priorReport());
    for (const [cost, profile, energy, draw] of [[0, 1, 1, 1], [0, 2, 1, 2], [1, 1, 2, 2], [1, 2, 3, 1]]) {
      const designs = await generateDesigns(evaluator({ tempo: ['energy-draw', `cost-${cost}`, `profile-${profile}`] }), feedback);
      const proposal = designs.proposals[2];
      expect(proposal.card).toMatchObject({ cost, effects: [{ kind: 'energy', amount: energy }, { kind: 'draw', amount: draw }], exhaust: true });
      const variant = researchVariants(designs).find(candidate => candidate.id === 'tempo-combined')!;
      const state = createBattle(11, variant.loadout);
      const uid = putCandidateInHand(state, proposal.card);
      state.energy = 0;
      if (cost > 0) {
        const before = structuredClone(state);
        expect(dispatchBattle(state, { type: 'play', uid }).ok).toBe(false);
        expect(state).toEqual(before);
        state.energy = cost;
      }
      const hand = state.hand.filter(card => card.uid !== uid).map(card => card.uid);
      const drawn = state.draw.slice(0, draw).map(card => card.uid);
      const result = dispatchBattle(state, { type: 'play', uid });
      expect(result.ok).toBe(true);
      expect(state.energy).toBe(energy);
      expect(state.hand.map(card => card.uid)).toEqual([...hand, ...drawn]);
      expect(state.exhaust.some(card => card.uid === uid)).toBe(true);
      expect(state.discard.some(card => card.uid === uid)).toBe(false);
      expect(result.events.filter(event => event.type === 'energy' || event.type === 'draw').map(event => [event.type, event.amount])).toEqual([
        ...(cost ? [['energy', -cost]] : []), ['energy', energy], ...Array.from({ length: draw }, () => ['draw', 1]),
      ]);
    }
    await expect(generateDesigns(async request => answer(request, options => options.includes('energy-draw') ? 'energy' : options[0]), feedback)).rejects.toThrow();
  });
});

describe('advisory design assessment', () => {
  test('isolates measurements and rejects forged recommendations and provider failures', async () => {
    const summary = { assault: { pairs: 2, winDifference: 0 }, scope: 'single encounter' };
    const before = structuredClone(summary);
    await assessDesigns(async (request) => {
      const state = request.state;
      if (!state || typeof state !== 'object' || !('measurements' in state)) throw new Error('Missing assessment measurements');
      const measurements = state.measurements;
      if (!measurements || typeof measurements !== 'object') throw new Error('Invalid assessment measurements');
      Object.assign(measurements, { scope: 'evaluator mutation' });
      return answer(request, () => 'uncertain');
    }, summary);
    expect(summary).toEqual(before);
    await expect(assessDesigns(async (request) => answer(request, () => 'promote-to-live'), summary)).rejects.toThrow();
    await expect(assessDesigns(async () => { throw new Error('assessment timeout'); }, summary)).rejects.toThrow('assessment timeout');
  });
});

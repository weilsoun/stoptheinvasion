import { describe, expect, test } from 'bun:test';
import { definitionForCard, SHIP_RULES } from '../src/ship/combat';
import {
  availableNodes,
  createExpedition,
  deserializeExpedition,
  dispatchExpedition,
  expeditionCardDefinition,
  expeditionServices,
  recruitableCrew,
  serializeExpedition,
} from '../src/ship/expedition';
import { AWAY_MISSIONS, EXPEDITION_RULES } from '../src/ship/expedition-content';
import type { CrewId, ShipCard } from '../src/ship/types';
import type { ExpeditionCommand, ExpeditionResult, ExpeditionState } from '../src/ship/expedition-types';
import { chooseCommand, observe } from '../scripts/ship-policy';

type Accepted = Extract<ExpeditionResult, { ok: true }>;

function accept(state: ExpeditionState, command: ExpeditionCommand): Accepted {
  const result = dispatchExpedition(state, command);
  if (!result.ok) throw new Error(`Expected ${command.type} to be accepted: ${result.error}`);
  return result;
}

function rejectAtomically(state: ExpeditionState, command: ExpeditionCommand): void {
  const before = structuredClone(state);
  expect(dispatchExpedition(state, command)).toMatchObject({ ok: false, events: [], awayEvents: [] });
  expect(state).toEqual(before);
}

function fightToEnd(state: ExpeditionState): void {
  let commands = 0;
  while (state.phase === 'battle' && state.battle?.phase === 'player') {
    const command = chooseCommand(observe(state.battle), 'tactical');
    accept(state, { type: 'battle', command });
    commands += 1;
    if (commands > 200) throw new Error('Tactical battle fixture exceeded its command bound.');
  }
  expect(state.phase).toBe('battle');
  expect(state.battle?.phase).not.toBe('player');
}

function finishColdBeacon(state: ExpeditionState): void {
  accept(state, { type: 'travel', nodeId: 'cold-beacon' });
  fightToEnd(state);
  expect(state.battle?.phase).toBe('victory');
  accept(state, { type: 'finish-battle' });
  expect(state.phase).toBe('salvage');
}

function resolveAway(state: ExpeditionState): void {
  let actions = 0;
  while (state.phase === 'away' && state.away?.phase === 'playing') {
    accept(state, { type: 'away-step' });
    actions += 1;
    if (actions > 500) throw new Error('Away fixture exceeded its action bound.');
  }
  expect(state.phase).toBe('away');
  expect(state.away?.phase).not.toBe('playing');
}

function allBattleCards(state: ExpeditionState): ShipCard[] {
  if (!state.battle) throw new Error('Expected an active battle.');
  return [...state.battle.hand, ...state.battle.draw, ...state.battle.discard, ...state.battle.exhaust];
}

function planetFixture(nodeId: 'nacre' | 'boreal'): ExpeditionState {
  const state = createExpedition(41);
  state.nodeId = nodeId;
  state.visited.push(nodeId);
  state.phase = 'planet';
  return state;
}

function addCrewFixture(state: ExpeditionState, id: Exclude<CrewId, 'vale'>): ShipCard {
  const card: ShipCard = { uid: `fixture-${id}`, id: `crew:${id}`, upgradeLevel: 0 };
  state.deck.push(card);
  state.crew.push({ id, level: 1, cardUid: card.uid });
  return card;
}

describe('expedition command boundaries', () => {
  test('rejects malformed, extra-field, wrong-phase, unreachable, unavailable, and invalid-party commands atomically', () => {
    rejectAtomically(createExpedition(1), null as never);
    rejectAtomically(createExpedition(1), { type: 'travel', nodeId: 'cold-beacon', extra: true } as never);
    rejectAtomically(createExpedition(1), { type: 'away-step' });
    rejectAtomically(createExpedition(1), { type: 'travel', nodeId: 'far-relay' });
    rejectAtomically(createExpedition(1), { type: 'salvage', choice: { kind: 'skip' } });
    rejectAtomically(createExpedition(1), { type: 'service', option: 'card', target: 'pulse' });

    const salvage = createExpedition(2);
    salvage.phase = 'salvage';
    salvage.reward = { nodeId: salvage.nodeId, scrap: 0, cards: ['shield'], crewId: null, allowUpgrade: false };
    rejectAtomically(salvage, { type: 'salvage', choice: { kind: 'card', cardId: 'pulse' } });

    const depot = createExpedition(3);
    depot.nodeId = 'orion-depot';
    depot.phase = 'depot';
    depot.scrap = EXPEDITION_RULES.upgradeCost;
    rejectAtomically(depot, { type: 'service', option: 'upgrade', target: 'missing-card' });

    const planet = planetFixture('nacre');
    rejectAtomically(planet, { type: 'deploy', crewIds: ['rex'] });
    rejectAtomically(planet, { type: 'diplomacy', crewIds: ['vale', 'vale'] } as never);
  });

  test('keeps battle hull through victory and carries one exact ordinary-card upgrade into a later real battle', () => {
    const state = createExpedition(2);
    finishColdBeacon(state);
    const terminalHull = state.hull;
    const rewardedOnce = structuredClone(state);
    expect(dispatchExpedition(state, { type: 'finish-battle' }).ok).toBe(false);
    expect(state).toEqual(rewardedOnce);
    const [upgradeCandidate, siblingCandidate] = state.deck.filter((card) => card.id === 'pulse');
    expect(upgradeCandidate).toBeDefined();
    expect(siblingCandidate).toBeDefined();
    const upgradedUid = upgradeCandidate!.uid;
    const siblingUid = siblingCandidate!.uid;

    accept(state, { type: 'salvage', choice: { kind: 'upgrade', uid: upgradedUid } });
    const upgraded = state.deck.find((card) => card.uid === upgradedUid)!;
    const sibling = state.deck.find((card) => card.uid === siblingUid)!;
    expect(state.hull).toBe(terminalHull);
    expect(upgraded.upgradeLevel).toBe(1);
    expect(sibling.upgradeLevel).toBe(0);
    expect(expeditionCardDefinition(state, upgraded).effects).not.toEqual(expeditionCardDefinition(state, sibling).effects);

    accept(state, { type: 'travel', nodeId: 'twin-signatures' });
    expect(state.battle?.player.hull).toBe(terminalHull);
    const carriedUpgrade = allBattleCards(state).find((card) => card.uid === upgradedUid)!;
    const carriedSibling = allBattleCards(state).find((card) => card.uid === siblingUid)!;
    expect(carriedUpgrade).toEqual(upgraded);
    expect(carriedSibling).toEqual(sibling);
    expect(definitionForCard(state.battle!, carriedUpgrade).effects).not.toEqual(definitionForCard(state.battle!, carriedSibling).effects);

    fightToEnd(state);
    expect(state.battle?.phase).toBe('victory');
    const laterTerminalHull = state.battle!.player.hull;
    accept(state, { type: 'finish-battle' });
    expect(state.hull).toBe(laterTerminalHull);
  });
});

describe('crew, services, and diplomacy', () => {
  test('makes affordable services finite, caps repair, rejects full-hull repair, and synchronizes a recruited crew card grade', () => {
    const intact = createExpedition(10);
    intact.nodeId = 'orion-depot';
    intact.phase = 'depot';
    intact.scrap = 100;
    expect(expeditionServices(intact).find((service) => service.option === 'repair')).toMatchObject({ available: false, reason: 'Hull is already intact.' });
    rejectAtomically(intact, { type: 'service', option: 'repair' });

    const state = createExpedition(11);
    state.nodeId = 'orion-depot';
    state.phase = 'depot';
    state.hull = SHIP_RULES.playerHull - 10;
    state.scrap = 100;
    const startingScrap = state.scrap;

    accept(state, { type: 'service', option: 'repair' });
    expect(state.hull).toBe(SHIP_RULES.playerHull);
    expect(state.scrap).toBe(startingScrap - EXPEDITION_RULES.repairCost);
    rejectAtomically(state, { type: 'service', option: 'repair' });

    accept(state, { type: 'service', option: 'recruit', target: 'iona' });
    const iona = state.crew.find((member) => member.id === 'iona')!;
    const ionaCards = state.deck.filter((card) => card.id === 'crew:iona');
    expect(ionaCards).toEqual([{ uid: iona.cardUid, id: 'crew:iona', upgradeLevel: 0 }]);
    expect(iona.level).toBe(1);
    expect(recruitableCrew(state)).not.toContain('iona');
    rejectAtomically(state, { type: 'service', option: 'recruit', target: 'rex' });

    accept(state, { type: 'service', option: 'upgrade', target: iona.cardUid });
    expect(state.deck.find((card) => card.uid === iona.cardUid)?.upgradeLevel).toBe(1);
    expect(state.crew.find((member) => member.id === 'iona')?.level).toBe(2);
    expect(expeditionCardDefinition(state, state.deck.find((card) => card.uid === iona.cardUid)!).effects).toEqual([
      { kind: 'shield', amount: 7 },
      { kind: 'energy', amount: 1 },
    ]);
    rejectAtomically(state, { type: 'service', option: 'upgrade', target: iona.cardUid });

    const deckSize = state.deck.length;
    accept(state, { type: 'service', option: 'card', target: 'pulse' });
    expect(state.deck.length).toBe(deckSize + 1);
    rejectAtomically(state, { type: 'service', option: 'card', target: 'shield' });
    expect(state.purchases).toEqual([
      'orion-depot:repair',
      'orion-depot:recruit',
      'orion-depot:upgrade',
      'orion-depot:card',
    ]);
  });

  test('scores and charges only the selected diplomatic party rather than the whole roster', () => {
    const state = planetFixture('nacre');
    addCrewFixture(state, 'iona');
    state.scrap = 20;
    rejectAtomically(state, { type: 'diplomacy', crewIds: ['iona'] });

    const before = state.scrap;
    accept(state, { type: 'diplomacy', crewIds: ['vale'] });
    expect(state.phase).toBe('salvage');
    expect(state.scrap).toBe(before - AWAY_MISSIONS.nacre.diplomacyCost + EXPEDITION_RULES.diplomacyScrap);
    expect(state.reward).toMatchObject({ nodeId: 'nacre', scrap: EXPEDITION_RULES.diplomacyScrap, cards: [], allowUpgrade: false });
  });
});

describe('away settlement and expedition completion', () => {
  test('settles a real away victory once and waits for explicit finish-away before granting its reward', () => {
    const state = planetFixture('nacre');
    const scrapBefore = state.scrap;
    accept(state, { type: 'deploy', crewIds: ['vale'] });
    resolveAway(state);
    expect(state.away?.phase).toBe('victory');
    expect(state.reward).toBeNull();
    expect(state.scrap).toBe(scrapBefore);

    accept(state, { type: 'finish-away' });
    expect(state.phase).toBe('salvage');
    expect(state.away).toBeNull();
    expect(state.scrap).toBe(scrapBefore + EXPEDITION_RULES.awayScrap);
    const settled = structuredClone(state);
    expect(dispatchExpedition(state, { type: 'finish-away' }).ok).toBe(false);
    expect(state).toEqual(settled);
  });

  test('charges one failed evacuation exactly once and recovers the deployed crew for later missions', () => {
    const state = planetFixture('boreal');
    const hullBefore = state.hull;
    accept(state, { type: 'deploy', crewIds: ['vale'] });
    resolveAway(state);
    expect(state.away?.phase).toBe('defeat');
    expect(state.hull).toBe(hullBefore);

    accept(state, { type: 'finish-away' });
    expect(state.phase).toBe('map');
    expect(state.hull).toBe(hullBefore - EXPEDITION_RULES.evacuationHullLoss);
    expect(state.away).toBeNull();
    expect(state.crew).toEqual([{ id: 'vale', level: 1, cardUid: state.deck[0]!.uid }]);
    const settled = structuredClone(state);
    expect(dispatchExpedition(state, { type: 'finish-away' }).ok).toBe(false);
    expect(state).toEqual(settled);
  });

  test('clamps lethal evacuation settlement at zero hull for equal and smaller reserves', () => {
    for (const hullBefore of [EXPEDITION_RULES.evacuationHullLoss, EXPEDITION_RULES.evacuationHullLoss - 1]) {
      const state = planetFixture('boreal');
      state.hull = hullBefore;
      accept(state, { type: 'deploy', crewIds: ['vale'] });
      resolveAway(state);
      expect(state.away?.phase).toBe('defeat');
      expect(state.hull).toBe(hullBefore);
      expect(state.reward).toBeNull();

      const settlement = accept(state, { type: 'finish-away' });
      expect(settlement.message).toContain(`Emergency evacuation cost ${hullBefore} hull.`);
      expect(state.hull).toBe(0);
      expect(state.phase).toBe('defeat');
      expect(state.away).toBeNull();
      expect(state.reward).toBeNull();
      const settled = structuredClone(state);
      expect(dispatchExpedition(state, { type: 'finish-away' }).ok).toBe(false);
      expect(state).toEqual(settled);
    }
  });

  test('requires travel to the Far Relay and a separate explicit transmission', () => {
    const beforeExit = createExpedition(12);
    beforeExit.nodeId = 'relay-blockade';
    beforeExit.visited.push('relay-blockade');
    rejectAtomically(beforeExit, { type: 'complete' });
    expect(availableNodes(beforeExit).map((node) => node.id)).toEqual(['far-relay']);

    accept(beforeExit, { type: 'travel', nodeId: 'far-relay' });
    expect(beforeExit.phase).toBe('map');
    expect(beforeExit.nodeId).toBe('far-relay');
    accept(beforeExit, { type: 'complete' });
    expect(beforeExit.phase).toBe('victory');
  });
});

describe('expedition save replay', () => {
  test('round-trips a genuinely progressed mid-battle journal', () => {
    const state = createExpedition(2);
    accept(state, { type: 'travel', nodeId: 'cold-beacon' });
    accept(state, { type: 'battle', command: chooseCommand(observe(state.battle!), 'tactical') });
    expect(state.phase).toBe('battle');
    expect(state.battle?.phase).toBe('player');

    const loaded = deserializeExpedition(serializeExpedition(state));
    expect(loaded).toEqual({ ok: true, state });
  });

  test('round-trips mid-away state and isolates journaled party arrays from later caller mutation', () => {
    const state = createExpedition(2);
    finishColdBeacon(state);
    accept(state, { type: 'salvage', choice: { kind: 'skip' } });
    accept(state, { type: 'travel', nodeId: 'nacre' });
    const submittedParty: CrewId[] = ['vale'];
    accept(state, { type: 'deploy', crewIds: submittedParty });
    submittedParty[0] = 'rex';
    accept(state, { type: 'away-step' });

    expect(state.journal.at(-2)).toEqual({ type: 'deploy', crewIds: ['vale'] });
    expect(Object.isFrozen((state.journal.at(-2) as Extract<ExpeditionCommand, { type: 'deploy' }>).crewIds)).toBe(true);
    const loaded = deserializeExpedition(serializeExpedition(state));
    expect(loaded).toEqual({ ok: true, state });
    if (!loaded.ok) return;

    accept(state, { type: 'away-step' });
    accept(loaded.state, { type: 'away-step' });
    expect(loaded.state).toEqual(state);
  });

  test('rejects malformed, oversized, extra-field, unsupported, overlong, and incompatible envelopes', () => {
    expect(deserializeExpedition('{')).toMatchObject({ ok: false });
    expect(deserializeExpedition('x'.repeat(EXPEDITION_RULES.saveMaxCharacters + 1))).toMatchObject({ ok: false });

    const state = createExpedition(19);
    const envelope = JSON.parse(serializeExpedition(state)) as { version: number; seed: number; commands: unknown[]; checksum: string; extra?: boolean };
    expect(deserializeExpedition(JSON.stringify({ ...envelope, extra: true }))).toMatchObject({ ok: false });
    expect(deserializeExpedition(JSON.stringify({ ...envelope, version: 2 }))).toMatchObject({ ok: false });
    expect(deserializeExpedition(JSON.stringify({ ...envelope, commands: Array.from({ length: EXPEDITION_RULES.saveMaxCommands + 1 }, () => ({ type: 'complete' })) }))).toMatchObject({ ok: false });
    expect(deserializeExpedition(JSON.stringify({ ...envelope, checksum: envelope.checksum === '00000000' ? 'ffffffff' : '00000000' }))).toMatchObject({ ok: false });
    const progressed = createExpedition(20);
    accept(progressed, { type: 'travel', nodeId: 'cold-beacon' });
    const progressedEnvelope = JSON.parse(serializeExpedition(progressed)) as typeof envelope;
    const travel = progressedEnvelope.commands[0] as Record<string, unknown>;
    expect(deserializeExpedition(JSON.stringify({ ...progressedEnvelope, commands: [{ ...travel, extra: true }] }))).toMatchObject({ ok: false });
  });
});

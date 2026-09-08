import type { CardDefinition, EnemyAction } from './types';

export const CARDS: Record<string, CardDefinition> = {
  hammer: { id: 'hammer', name: 'Percussive Maintenance', cost: 1, type: 'attack', target: 'enemy', description: 'Deal 6 damage.\nOn critical hit: Ringing.', flavor: 'If it moves and it shouldn’t, hit it.', icon: 'hammer', effects: [{ kind: 'damage', amount: 6, recipient: 'target' }], onCritical: [{ kind: 'ringing', amount: 1, recipient: 'target' }], scaling: { effects: [4], description: 'Deal {effect:0} damage.\nOn critical hit: Ringing.' } },
  vest: { id: 'vest', name: 'Safety-ish Vest', cost: 1, type: 'skill', target: 'self', description: 'Gain 7 Block this turn.', flavor: 'OSHA has left the chat.', icon: 'shield', effects: [{ kind: 'block', amount: 7, recipient: 'self' }], scaling: { effects: [3], description: 'Gain {effect:0} Block this turn.' } },
  tape: { id: 'tape', name: 'Measure Once', cost: 1, type: 'skill', target: 'enemy', description: 'Apply 8 Exposed. The next hit deals 8 extra damage.', flavor: 'We are absolutely cutting twice.', icon: 'tape', effects: [{ kind: 'exposed', amount: 8, recipient: 'target' }], scaling: { effects: [2], description: 'Apply {effect:0} Exposed. The next hit deals {effect:0} extra damage.' } },
  heavy: { id: 'heavy', name: 'Warranty Voided', cost: 2, type: 'attack', target: 'enemy', description: 'Deal 13 damage.', flavor: 'Normal wear and tear. Probably.', icon: 'hammer', effects: [{ kind: 'damage', amount: 13, recipient: 'target' }], scaling: { effects: [4], description: 'Deal {effect:0} damage.' } },
  coffee: { id: 'coffee', name: 'Break Room Coffee', cost: 0, type: 'power', target: 'self', description: 'Bank 1 energy for next turn, up to your cap.', flavor: 'Brewed Tuesday. Which Tuesday?', icon: 'coffee', effects: [{ kind: 'energy', amount: 1, recipient: 'self' }], scaling: { effects: [1], description: 'Bank {effect:0} energy for next turn, up to your cap.' } },
  toolbox: { id: 'toolbox', name: 'Check the Toolbox', cost: 1, type: 'skill', target: 'self', description: 'Draw 2 cards. Keep them for next turn.', flavor: 'It’s always in the other pocket.', icon: 'toolbox', effects: [{ kind: 'draw', amount: 2, recipient: 'self' }], scaling: { effects: [1], description: 'Draw {effect:0} cards. Keep them for next turn.' } },
  brace: { id: 'brace', name: 'Steel-Toe Solution', cost: 1, type: 'attack', target: 'enemy', description: 'Deal 4 damage. Gain 3 Block this turn.', flavor: 'The customer is no longer right.', icon: 'boot', effects: [{ kind: 'damage', amount: 4, recipient: 'target' }, { kind: 'block', amount: 3, recipient: 'self' }], scaling: { effects: [2, 2], description: 'Deal {effect:0} damage. Gain {effect:1} Block this turn.' } },
  weaken: { id: 'weaken', name: 'Trip Hazard', cost: 1, type: 'skill', target: 'enemy', description: 'Downgrade an enemy card 1 level this turn.', flavor: 'Mind the freshly mopped floor.', icon: 'boot', effects: [], modifier: { levels: -1 } },
  reinforce: { id: 'reinforce', name: 'Duct Tape Upgrade', cost: 1, type: 'skill', target: 'self', description: 'Upgrade a friendly card 1 level this turn.', flavor: 'Load-bearing adhesive.', icon: 'tape', effects: [], modifier: { levels: 1 } },
  overtime: { id: 'overtime', name: 'Overtime Approved', cost: 1, type: 'power', target: 'self', description: 'Extend this turn by 2 positions.', flavor: 'Just one more thing before you clock out.', icon: 'coffee', art: 'coffee', effects: [], bracket: { positions: 2 }, scaling: { bracket: { positions: 1 }, description: 'Extend this turn by {positions} positions.' } },
  lookout: { id: 'lookout', name: 'Read the Fine Print', cost: 0, type: 'skill', target: 'self', description: 'Reveal 3 positions beyond this turn.', flavor: 'The danger was in the small print.', icon: 'tape', art: 'tape', effects: [], bracket: { scouting: 3 }, scaling: { bracket: { scouting: 1 }, description: 'Reveal {scouting} positions beyond this turn.' } },
  clockout: { id: 'clockout', name: 'Clock Out Early', cost: 1, type: 'power', target: 'self', description: 'Shorten this turn by 3 positions. Minimum 1.', flavor: 'That sounds like tomorrow’s problem.', icon: 'toolbox', art: 'toolbox', effects: [], bracket: { positions: -3 }, scaling: { bracket: { positions: -1 }, description: 'Shorten this turn by {positions} positions. Minimum 1.' } },
  surge: { id: 'surge', name: 'Second Wind', cost: 0, type: 'power', target: 'self', description: 'Gain 2 Surge energy now. Unused Surge expires this turn.', flavor: 'One last burst before clocking out.', icon: 'coffee', art: 'coffee', effects: [{ kind: 'energy', amount: 2, recipient: 'self' }], scaling: { effects: [2], description: 'Gain {effect:0} Surge energy now. Unused Surge expires this turn.' }, surge: true },
};

// The opening hand exposes attacks, defense, timeline planning, and immediate Surge energy.
export const STARTER_DECK = ['hammer', 'vest', 'overtime', 'lookout', 'surge', 'weaken', 'reinforce', 'reinforce', 'weaken', 'tape', 'heavy', 'hammer', 'vest', 'brace', 'toolbox', 'hammer', 'vest', 'brace', 'clockout', 'coffee', 'surge'];
export const ENCOUNTER = { playerHp: 42, enemyHp: 48, startingEnergy: 2, energyGain: 2, energyMax: 4, drawCount: 5, turnLength: 7 };

/** Fixed encounter positions, independent of turn boundaries and scouting visibility. */
export function enemyIntent(position: number): EnemyAction | null {
  if (!Number.isSafeInteger(position) || position < 0 || position % 6 !== 2) return null;
  const phase = Math.floor(position / 6) % 4;
  const uid = `guard:intent:${position}`;
  if (phase === 1) {
    return { kind: 'enemy', uid, actor: 'guard', target: 'bob', name: 'Marked for Review', description: 'Apply 4 Exposed. The next incoming hit deals 4 extra damage.', effects: [{ kind: 'exposed', amount: 4, recipient: 'target' }], scaling: { effects: [1], description: 'Apply {effect:0} Exposed. The next incoming hit deals {effect:0} extra damage.' } };
  }
  if (phase === 3) {
    return { kind: 'enemy', uid, actor: 'guard', target: 'guard', name: 'First Aid Violation', description: 'Restore 6 health, up to maximum health.', effects: [{ kind: 'heal', amount: 6, recipient: 'self' }], scaling: { effects: [2], description: 'Restore {effect:0} health, up to maximum health.' } };
  }
  const heavy = phase === 2;
  return { kind: 'enemy', uid, actor: 'guard', target: 'bob', name: heavy ? 'Excessive Force' : 'Receipt Check', description: `Deal ${heavy ? 12 : 8} damage.`, effects: [{ kind: 'damage', amount: heavy ? 12 : 8, recipient: 'target' }], scaling: { effects: [4], description: 'Deal {effect:0} damage.' } };
}

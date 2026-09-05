import type { CardDefinition, EnemyAction } from './types';

export const CARDS: Record<string, CardDefinition> = {
  hammer: { id: 'hammer', name: 'Percussive Maintenance', cost: 1, type: 'attack', target: 'enemy', description: 'Deal 6 damage.', flavor: 'If it moves and it shouldn’t, hit it.', icon: 'hammer', effects: [{ kind: 'damage', amount: 6, recipient: 'target' }] },
  vest: { id: 'vest', name: 'Safety-ish Vest', cost: 1, type: 'skill', target: 'self', description: 'Gain 7 Block this turn.', flavor: 'OSHA has left the chat.', icon: 'shield', effects: [{ kind: 'block', amount: 7, recipient: 'self' }] },
  tape: { id: 'tape', name: 'Measure Once', cost: 1, type: 'skill', target: 'enemy', description: 'Apply 8 Exposed. The next hit deals 8 extra damage.', flavor: 'We are absolutely cutting twice.', icon: 'tape', effects: [{ kind: 'exposed', amount: 8, recipient: 'target' }] },
  heavy: { id: 'heavy', name: 'Warranty Voided', cost: 2, type: 'attack', target: 'enemy', description: 'Deal 13 damage.', flavor: 'Normal wear and tear. Probably.', icon: 'hammer', effects: [{ kind: 'damage', amount: 13, recipient: 'target' }] },
  coffee: { id: 'coffee', name: 'Break Room Coffee', cost: 0, type: 'power', target: 'self', description: 'Bank 1 energy for next turn, up to your cap.', flavor: 'Brewed Tuesday. Which Tuesday?', icon: 'coffee', effects: [{ kind: 'energy', amount: 1, recipient: 'self' }] },
  toolbox: { id: 'toolbox', name: 'Check the Toolbox', cost: 1, type: 'skill', target: 'self', description: 'Draw 2 cards. Keep them for next turn.', flavor: 'It’s always in the other pocket.', icon: 'toolbox', effects: [{ kind: 'draw', amount: 2, recipient: 'self' }] },
  brace: { id: 'brace', name: 'Steel-Toe Solution', cost: 1, type: 'attack', target: 'enemy', description: 'Deal 4 damage. Gain 3 Block this turn.', flavor: 'The customer is no longer right.', icon: 'boot', effects: [{ kind: 'damage', amount: 4, recipient: 'target' }, { kind: 'block', amount: 3, recipient: 'self' }] },
  weaken: { id: 'weaken', name: 'Trip Hazard', cost: 1, type: 'skill', target: 'enemy', description: '-4 damage to an enemy attack this turn.', flavor: 'Mind the freshly mopped floor.', icon: 'boot', effects: [], modifier: { damage: -4 } },
  reinforce: { id: 'reinforce', name: 'Duct Tape Upgrade', cost: 1, type: 'skill', target: 'self', description: '+4 damage to a friendly attack this turn.', flavor: 'Load-bearing adhesive.', icon: 'tape', effects: [], modifier: { damage: 4 } },
};

// The opening five expose attacks, defense, attachments, and banking.
export const STARTER_DECK = ['hammer', 'vest', 'weaken', 'reinforce', 'coffee', 'tape', 'heavy', 'hammer', 'vest', 'brace', 'toolbox', 'hammer', 'vest', 'brace'];
export const ENCOUNTER = { playerHp: 42, enemyHp: 48, startingEnergy: 2, energyGain: 2, energyMax: 4, drawCount: 5, slotCount: 6 };
export function enemyIntent(turn: number): { slot: number; action: EnemyAction }[] {
  const heavy = turn % 3 === 0;
  return [{ slot: heavy ? 2 : 3, action: { kind: 'enemy', uid: `guard:intent:${turn}`, actor: 'guard', target: 'bob', name: heavy ? 'Excessive Force' : 'Receipt Check', description: `Deal ${heavy ? 12 : 8} damage to Bob.`, effects: [{ kind: 'damage', amount: heavy ? 12 : 8, recipient: 'target' }] } }];
}

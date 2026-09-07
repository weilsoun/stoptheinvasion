import type { CardDefinition, EnemyAction } from './types';

export const CARDS: Record<string, CardDefinition> = {
  hammer: { id: 'hammer', name: 'Percussive Maintenance', cost: 1, type: 'attack', target: 'enemy', description: 'Deal 6 damage.\nOn critical hit: Ringing.', flavor: 'If it moves and it shouldn’t, hit it.', icon: 'hammer', effects: [{ kind: 'damage', amount: 6, recipient: 'target' }], onCritical: [{ kind: 'ringing', amount: 1, recipient: 'target' }] },
  vest: { id: 'vest', name: 'Safety-ish Vest', cost: 1, type: 'skill', target: 'self', description: 'Gain 7 Block this turn.', flavor: 'OSHA has left the chat.', icon: 'shield', effects: [{ kind: 'block', amount: 7, recipient: 'self' }] },
  tape: { id: 'tape', name: 'Measure Once', cost: 1, type: 'skill', target: 'enemy', description: 'Apply 8 Exposed. The next hit deals 8 extra damage.', flavor: 'We are absolutely cutting twice.', icon: 'tape', effects: [{ kind: 'exposed', amount: 8, recipient: 'target' }] },
  heavy: { id: 'heavy', name: 'Warranty Voided', cost: 2, type: 'attack', target: 'enemy', description: 'Deal 13 damage.', flavor: 'Normal wear and tear. Probably.', icon: 'hammer', effects: [{ kind: 'damage', amount: 13, recipient: 'target' }] },
  coffee: { id: 'coffee', name: 'Break Room Coffee', cost: 0, type: 'power', target: 'self', description: 'Bank 1 energy for next turn, up to your cap.', flavor: 'Brewed Tuesday. Which Tuesday?', icon: 'coffee', effects: [{ kind: 'energy', amount: 1, recipient: 'self' }] },
  toolbox: { id: 'toolbox', name: 'Check the Toolbox', cost: 1, type: 'skill', target: 'self', description: 'Draw 2 cards. Keep them for next turn.', flavor: 'It’s always in the other pocket.', icon: 'toolbox', effects: [{ kind: 'draw', amount: 2, recipient: 'self' }] },
  brace: { id: 'brace', name: 'Steel-Toe Solution', cost: 1, type: 'attack', target: 'enemy', description: 'Deal 4 damage. Gain 3 Block this turn.', flavor: 'The customer is no longer right.', icon: 'boot', effects: [{ kind: 'damage', amount: 4, recipient: 'target' }, { kind: 'block', amount: 3, recipient: 'self' }] },
  weaken: { id: 'weaken', name: 'Trip Hazard', cost: 1, type: 'skill', target: 'enemy', description: '-4 damage to an enemy attack this turn.', flavor: 'Mind the freshly mopped floor.', icon: 'boot', effects: [], modifier: { damage: -4 } },
  reinforce: { id: 'reinforce', name: 'Duct Tape Upgrade', cost: 1, type: 'skill', target: 'self', description: '+4 damage to a friendly attack this turn.', flavor: 'Load-bearing adhesive.', icon: 'tape', effects: [], modifier: { damage: 4 } },
  overtime: { id: 'overtime', name: 'Overtime Approved', cost: 1, type: 'power', target: 'self', description: 'Extend this turn by 2 positions.', flavor: 'Just one more thing before you clock out.', icon: 'coffee', art: 'coffee', effects: [], bracket: { positions: 2 } },
  lookout: { id: 'lookout', name: 'Read the Fine Print', cost: 0, type: 'skill', target: 'self', description: 'Reveal 3 positions beyond this turn.', flavor: 'The danger was in the small print.', icon: 'tape', art: 'tape', effects: [], bracket: { scouting: 3 } },
  clockout: { id: 'clockout', name: 'Clock Out Early', cost: 1, type: 'power', target: 'self', description: 'Shorten this turn by 3 positions. Minimum 1.', flavor: 'That sounds like tomorrow Bob’s problem.', icon: 'toolbox', art: 'toolbox', effects: [], bracket: { positions: -3 } },
};

// The opening hand exposes the persistent bracket, scouting, defense, and an attack.
export const STARTER_DECK = ['hammer', 'vest', 'overtime', 'lookout', 'coffee', 'weaken', 'reinforce', 'tape', 'heavy', 'hammer', 'vest', 'brace', 'toolbox', 'hammer', 'vest', 'brace', 'clockout'];
export const ENCOUNTER = { playerHp: 42, enemyHp: 48, startingEnergy: 2, energyGain: 2, energyMax: 4, drawCount: 5, turnLength: 7 };

/** Fixed encounter positions, independent of turn boundaries and scouting visibility. */
export function enemyIntent(position: number): EnemyAction | null {
  if (!Number.isSafeInteger(position) || position < 0 || position % 6 !== 2) return null;
  const phase = Math.floor(position / 6) % 4;
  const uid = `guard:intent:${position}`;
  if (phase === 1) {
    return { kind: 'enemy', uid, actor: 'guard', target: 'bob', name: 'Marked for Review', description: 'Apply 4 Exposed to Bob. His next incoming hit deals 4 extra damage.', effects: [{ kind: 'exposed', amount: 4, recipient: 'target' }] };
  }
  if (phase === 3) {
    return { kind: 'enemy', uid, actor: 'guard', target: 'guard', name: 'First Aid Violation', description: 'Restore 6 health to the guard, up to maximum health.', effects: [{ kind: 'heal', amount: 6, recipient: 'self' }] };
  }
  const heavy = phase === 2;
  return { kind: 'enemy', uid, actor: 'guard', target: 'bob', name: heavy ? 'Excessive Force' : 'Receipt Check', description: `Deal ${heavy ? 12 : 8} damage to Bob.`, effects: [{ kind: 'damage', amount: heavy ? 12 : 8, recipient: 'target' }] };
}

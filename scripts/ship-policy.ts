import { nextIntent, previewCard } from '../src/ship/combat';
import type { ShipBattleState, ShipCardId, ShipCommand, ShipEffect } from '../src/ship/types';

export const POLICIES = ['tactical', 'aggressive', 'defensive'] as const;
export type Policy = typeof POLICIES[number];
export type VisibleCard = { uid: string; id: ShipCardId; title: string; cost: number; exhaust: boolean; effects: ShipEffect[] };
export type Observation = {
  hull: number; shield: number; maxShield: number; energy: number; maxEnergy: number; hand: VisibleCard[];
  enemies: Array<{ id: string; hull: number; shield: number; intent: ShipEffect[] }>;
};
function damage(effects: readonly ShipEffect[]): number {
  return effects.reduce((sum, effect) => sum + (effect.kind === 'damage' ? effect.amount : 0), 0);
}

// This is the sole policy input boundary. No seed, RNG, piles, action index,
// future sequence, mutable simulation references, or projected outcomes cross it.
export function observe(state: ShipBattleState): Observation {
  return {
    hull: state.player.hull, shield: state.player.shield, maxShield: state.player.maxShield, energy: state.energy, maxEnergy: state.maxEnergy,
    hand: state.hand.map(card => {
      const definition = previewCard(state, card.uid);
      if (!definition) throw new Error(`No preview for ${card.uid}`);
      return { uid: card.uid, id: card.id, title: definition.title, cost: definition.cost, exhaust: !!definition.exhaust, effects: definition.effects.map(effect => ({ ...effect })) };
    }),
    enemies: state.enemies.filter(enemy => enemy.hull > 0).map(enemy => ({
      id: enemy.id, hull: enemy.hull, shield: enemy.shield,
      intent: nextIntent(enemy).effects.map(effect => ({ ...effect })),
    })),
  };
}
export function chooseCommand(view: Observation, policy: Policy): ShipCommand {
  let best: ShipCommand = { type: 'end-turn' };
  let bestScore = 0;
  const incoming = view.enemies.reduce((sum, enemy) => sum + damage(enemy.intent), 0);
  const shieldWeight = policy === 'defensive' ? 2.5 : policy === 'tactical' ? 1.1 : 0.3;
  const threatWeight = policy === 'aggressive' ? 0.2 : policy === 'tactical' ? 1.2 : 1.8;
  const handCost = view.hand.reduce((sum, card) => sum + card.cost, 0);
  for (const card of view.hand) {
    if (card.cost > view.energy) continue;
    const attack = damage(card.effects);
    let utility = 0;
    for (const effect of card.effects) {
      if (effect.kind === 'shield') {
        const restored = Math.min(effect.amount, view.maxShield - view.shield);
        const useful = Math.min(restored, Math.max(0, incoming - view.shield));
        utility += useful * shieldWeight * (incoming >= view.hull + view.shield ? 2 : 1);
      } else if (effect.kind === 'energy') {
        utility += Math.min(effect.amount, Math.max(0, view.maxEnergy - view.energy), Math.max(0, handCost - view.energy)) * 6;
      } else if (effect.kind === 'draw' && view.energy > card.cost) {
        // Fixed quantity value only: never inspect or simulate replacement identities.
        utility += effect.amount * 2;
      }
    }
    const targets = attack > 0 ? view.enemies : [undefined];
    for (const target of targets) {
      let score = utility;
      if (target) {
        const hullDamage = Math.min(target.hull, Math.max(0, attack - target.shield));
        const effectiveDamage = Math.min(attack, target.hull + target.shield);
        const lethal = hullDamage >= target.hull;
        score += effectiveDamage * 0.65 + hullDamage * 0.35;
        if (lethal) score += 15 + damage(target.intent) * threatWeight;
      }
      score /= 0.4 + Math.max(1, card.cost) * 0.6;
      // Strict comparison preserves canonical hand/enemy order for every tie.
      if (score > bestScore) {
        bestScore = score;
        best = target ? { type: 'play', uid: card.uid, targetId: target.id } : { type: 'play', uid: card.uid };
      }
    }
  }
  return best;
}

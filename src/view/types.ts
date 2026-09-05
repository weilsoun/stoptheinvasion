import type { ActorId, CardDefinition, CombatEvent, CombatState } from '../game/types';

/** Coordinates are in the fixed 1920 x 1080 design surface. */
export interface CardVisual {
  uid: string;
  definition: CardDefinition;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  hovered: boolean;
  dimmed: boolean;
  queued: boolean;
}
export interface ScenePort {
  setCards(cards: CardVisual[]): void;
  setState(state: CombatState): void;
  setPointer(x: number, y: number): void;
  setTarget(target: ActorId | null): void;
  playEvent(event: CombatEvent): void;
  destroy(): void;
}

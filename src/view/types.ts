import type { ActorId, CardDefinition, CombatEvent, CombatState } from '../game/types';

/** Shared normalized target-strip coordinates for physical dots and pointer hit areas. */
export const CARD_TARGET_Y = 0.89;
export const CARD_TARGET_GAP = 0.18;

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
  target: ActorId | null;
  targets: ActorId[];
}
export interface ScenePort {
  setCards(cards: CardVisual[]): void;
  setState(state: CombatState): void;
  setPointer(x: number, y: number): void;
  setTarget(target: ActorId | null): void;
  playEvent(event: CombatEvent): void;
  destroy(): void;
}

import type { ActorId, CardDefinition, CombatEvent, CombatState } from '../game/types';

/** Shared normalized target-strip coordinates for physical dots and pointer hit areas. */
export const CARD_TARGET_Y = 0.89;
export const CARD_TARGET_GAP = 0.18;

/** Logical design-space actor anchors; artwork offsets do not move the HUD or impacts. */
export const ACTOR_CENTERS: Record<ActorId, { x: number; y: number }> = {
  bob: { x: 410, y: 400 },
  guard: { x: 1500, y: 400 },
};

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
  dragged: boolean;
  locked: boolean;
  damageModifier: number;
  target: ActorId | null;
  targets: ActorId[];
  /** Attachment drawn behind this host UID, following its displayed pose. */
  underCard?: string;
  /** Centered inspection card, drawn above the scene's dimming overlay. */
  detail?: boolean;
  /** Rotation around the card's vertical axis: 0 shows its face, 180 its back. */
  flip?: number;
  /** Initialize a pile transition at its source pose before animating its destination. */
  snap?: boolean;
}
export interface ScenePort {
  setCards(cards: CardVisual[]): void;
  setState(state: CombatState): void;
  setPointer(x: number, y: number): void;
  setTarget(target: ActorId | null): void;
  getCardPose(uid: string): Pick<CardVisual, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'flip'> | null;
  playEvent(event: CombatEvent): void;
  destroy(): void;
}

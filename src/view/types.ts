import type { ActorId, CardDefinition, CombatEvent, CombatState } from '../game/types';

/** Shared normalized target-strip coordinates for physical dots and pointer hit areas. */
export const CARD_TARGET_Y = 0.89;
export const CARD_TARGET_GAP = 0.18;

/** Shared 1920x1080 workspace/stage partition; all values are design coordinates. */
export const CARD_WORKSPACE = { x: 0, y: 0, width: 1152, height: 1080 };
export const HAND_TOP = 720;
/** Actor artwork centers and action-impact anchors in the right-hand combat stage. */
export const ACTOR_CENTERS: Record<ActorId, { x: number; y: number }> = {
  bob: { x: 1370, y: 730 },
  guard: { x: 1720, y: 350 },
};
export const ACTOR_HUD: Record<ActorId, { x: number; y: number; width: number }> = {
  bob: { x: 1195, y: 930, width: 350 },
  guard: { x: 1545, y: 100, width: 350 },
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
  upgradeLevel: number;
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
  /** Optional design-space clipping rectangle for resting workspace cards and their badges. */
  clip?: { x: number; y: number; width: number; height: number };
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

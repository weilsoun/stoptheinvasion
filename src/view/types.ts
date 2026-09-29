import type { CardDefinition, WorldEvent, WorldState } from '../game/types';
import type { TermId } from '../game/terms';
import type { CardForecast } from '../game/forecast';

/** Shared normalized target-strip coordinates for physical dots and pointer hit areas. */
export const CARD_TARGET_Y = 0.89;
export const CARD_TARGET_GAP = 0.18;

/** Fixed 1920 × 1080 design-space regions. */
export const MAP_VIEW = { x: 0, y: 0, width: 1920, height: 540 } as const;
export const CARD_WORKSPACE = { x: 0, y: 540, width: 1920, height: 540 } as const;
export const HAND_TOP = 875;
export const NOW_X = 960;

/** Presentation-only durations in milliseconds; simulation timing remains tick-based. */
export const CARD_MOTION = {
  layout: 220,
  navigation: 240,
  lift: 180,
  travel: 420,
  hold: 120,
  exit: 340,
  deal: 360,
  drawStagger: 60,
  puff: 180,
} as const;

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
  target: string | null;
  targets: string[];
  /** Attachment drawn behind this host UID, following its displayed pose. */
  underCard?: string;
  /** Modal inspection or choice card, drawn above the scene's dimming overlay. */
  detail?: boolean;
  /** Rotation around the card's vertical axis: 0 shows its face, 180 its back. */
  flip?: number;
  /** Initialize a pile transition at its source pose before animating its destination. */
  snap?: boolean;
  /** Optional design-space clipping rectangle for resting workspace cards and their badges. */
  clip?: { x: number; y: number; width: number; height: number };
  /** Design-space horizontal fog bounds, fading inward over feather pixels. */
  fog?: { left: number; right: number; feather: number };
  /** Anonymous, noninteractive past afterimage; renderer must not use card-face information. */
  echo?: boolean;
  /** Absolute presentation anchor; unchanged anchors follow camera movement without extra lag. */
  timelinePosition?: number;
  /** Explicit eased pose-transition duration for a discrete playback target. */
  transitionMs?: number;
  /** Pure current-plan effect projection; never applied to inventory definitions. */
  forecast?: CardForecast;
}
/** Dictionary word bounds in normalized card-face coordinates (0–1), emitted by text layout. */
export interface CardTermRegion {
  term: TermId;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScenePort {
  setPresentation(options: { reducedMotion: boolean; paused: boolean }): void;
  setCards(cards: CardVisual[]): void;
  /** Full snapshots snap poses; staged playback waits for ordered movement events. */
  setState(state: WorldState, snap: boolean): void;
  setPointer(x: number, y: number): void;
  setTarget(target: string | null): void;
  getCardPose(uid: string): Pick<CardVisual, 'x' | 'y' | 'width' | 'height' | 'rotation' | 'flip'> | null;
  /** Hit-test underlined rules text against the actual displayed pose using design coordinates. */
  getCardTermAt(uid: string, x: number, y: number): TermId | null;
  getWorldPose(entityId: string): { x: number; y: number } | null;
  playEvent(event: WorldEvent): void;
  destroy(): void;
}

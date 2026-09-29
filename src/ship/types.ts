export type ShipBaseCardId = 'pulse' | 'shield' | 'lance' | 'cell' | 'sweep' | 'burst';
export type ShipCardId = ShipBaseCardId | `research:${string}`;
export type ShipEffect = { kind: 'damage' | 'shield' | 'draw' | 'energy'; amount: number };
export interface ShipCardDefinition {
  id: ShipCardId;
  title: string;
  cost: number;
  kind: 'attack' | 'system' | 'crew';
  effects: readonly ShipEffect[];
  exhaust?: boolean;
  flavor: string;
}
export interface ShipCard { uid: string; id: ShipCardId }
export interface ShipLoadout {
  deck: readonly ShipCardId[];
  cards?: readonly ShipCardDefinition[];
}
export interface ShipActor {
  id: string;
  name: string;
  hull: number;
  maxHull: number;
  shield: number;
  maxShield: number;
  recharge: number;
}
export interface ShipIntent {
  title: string;
  effects: readonly ShipEffect[];
}
export interface EnemyShip extends ShipActor {
  role: 'corsair' | 'needle' | 'bulwark';
  actionIndex: number;
  sequence: readonly ShipIntent[];
}
export interface ShipBattleState {
  seed: number;
  rng: number;
  turn: number;
  phase: 'player' | 'victory' | 'defeat';
  catalog: Readonly<Record<string, ShipCardDefinition>>;
  player: ShipActor;
  enemies: EnemyShip[];
  energy: number;
  maxEnergy: number;
  coilsAvailable: boolean;
  hand: ShipCard[];
  draw: ShipCard[];
  discard: ShipCard[];
  exhaust: ShipCard[];
}
export type ShipCommand = { type: 'play'; uid: string; targetId?: string } | { type: 'end-turn' };
export interface ShipBattleEvent {
  type: 'card' | 'intent' | 'damage' | 'shield' | 'energy' | 'draw' | 'discard' | 'exhaust' | 'recycle' | 'turn' | 'victory' | 'defeat';
  actorId: string;
  targetId?: string;
  card?: ShipCard;
  definition?: ShipCardDefinition;
  intent?: ShipIntent;
  amount?: number;
  hull?: number;
  shield?: number;
  energy?: number;
  turn?: number;
  text: string;
}
export type ShipCommandResult = { ok: true; events: ShipBattleEvent[] } | { ok: false; error: string; events: [] };
export interface ShipPose { x: number; y: number; width: number; height: number; rotation: number }
export interface ShipCardVisual extends ShipPose {
  uid: string;
  definition: ShipCardDefinition;
  selected?: boolean;
  dimmed?: boolean;
  detail?: boolean;
  held?: boolean;
}
export interface ShipScene {
  resize(cssWidth: number, cssHeight: number): void;
  setState(state: ShipBattleState): void;
  setCards(cards: readonly ShipCardVisual[], options?: { reducedMotion: boolean }): void;
  setAimTarget(targetId: string | null): void;
  present(events: readonly ShipBattleEvent[], finalState: ShipBattleState, options: {
    reducedMotion: boolean;
    onEvent?: (event: ShipBattleEvent) => void;
  }): Promise<void>;
  cancel(): void;
  destroy(): void;
}
export const SHIP_CARD_LIFT = 38;
export const SHIP_CARD_SELECTED_SCALE = 1.08;
export const SHIP_CARD_DETAIL_SCALE = 1.18;
export interface ShipGamePort { destroy(): void }
export const SHIP_DESIGN = { width: 1920, height: 1440 } as const;
export const SHIP_SCREEN = { x: 360, y: 160, width: 1480, height: 660 } as const;
export const SHIP_SELF_DROP = { x: 560, y: 850, width: 1080, height: 150 } as const;
export const SHIP_PILES = { draw: { x: 180, y: 1130 }, discard: { x: 1740, y: 1070 }, exhaust: { x: 1740, y: 1280 } } as const;
export function shipHandPoses(count: number): ShipPose[] {
  const pitch = Math.min(252, 1100 / Math.max(1, count - 1));
  return Array.from({ length: count }, (_, index) => {
    const offset = index - (count - 1) / 2;
    return { x: 960 + offset * pitch, y: 1134 + Math.abs(offset) * 12, width: 247, height: 351, rotation: offset * 3 };
  });
}
export function enemyShipPose(index: number): ShipPose {
  return { x: SHIP_SCREEN.x + (index + .5) * SHIP_SCREEN.width / 3, y: 410, width: 420, height: 276, rotation: 0 };
}

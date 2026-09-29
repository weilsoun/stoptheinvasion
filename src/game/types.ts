import type { StoreMap, TilePosition } from './map';

export type ActorId = string;
export type Direction = 'up' | 'right' | 'down' | 'left';
export type CardRarity = 'basic' | 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type Effect = {
  kind: 'damage' | 'block' | 'exposed' | 'heal' | 'energy' | 'draw' | 'ringing';
  amount: number;
  recipient: 'self' | 'target';
};

export interface UpgradeScaling {
  effects?: number[];
  time?: { amount: number };
  description: string;
}

export interface CardDefinition {
  id: string;
  name: string;
  cost: number;
  type: 'attack' | 'skill' | 'power';
  target: 'enemy' | 'self';
  description: string;
  flavor: string;
  icon: 'hammer' | 'shield' | 'tape' | 'coffee' | 'toolbox' | 'boot';
  art?: string;
  effects: Effect[];
  onCritical?: Effect[];
  rarity?: CardRarity;
  characterColor?: string;
  retain?: boolean;
  modifier?: { levels: number };
  scaling?: UpgradeScaling;
  time?: { kind: 'stretch' | 'compress' | 'scout' | 'rewind'; amount: number };
  surge?: boolean;
  temporal?: { kind: 'echo' | 'retain' | 'borrow'; amount?: number; defenseOnly?: boolean };
}

export interface CardInstance {
  uid: string;
  definitionId: string;
  owner: ActorId;
}

export interface EncounterDefinition {
  id: string;
  name: string;
  title: string;
  description: string;
  hp: number;
  actions: Array<{
    name: string;
    description: string;
    effects: Effect[];
    scaling?: UpgradeScaling;
  }>;
  boss?: boolean;
}

export interface WorldActor {
  id: string;
  name: string;
  position: TilePosition;
  facing: Direction;
  hp: number;
  maxHp: number;
  block: number;
  exposed: number;
  ringing: boolean;
}

export interface WorldPlayer extends WorldActor {
  energy: number;
  energyMax: number;
  surgeEnergy: number;
  surgeExpires: number;
}

export interface WorldEnemy extends WorldActor {
  encounterId: string;
  aware: boolean;
  actionProgress: number;
  actionIndex: number;
  upgradeLevel: number;
}

export type WorldPhase = 'playing' | 'reward' | 'service' | 'victory' | 'defeat';

export interface WorldEvent {
  kind: 'move' | 'action' | 'damage' | 'block' | 'exposed' | 'heal' | 'energy' | 'draw' | 'ringing' | 'discard' | 'empty' | 'victory' | 'defeat' | 'tick' | 'interact' | 'time' | 'rewind';
  tick: number;
  message: string;
  visible?: boolean;
  actor?: string;
  target?: string;
  amount?: number;
  critical?: boolean;
  cards?: CardInstance[];
  definition?: CardDefinition;
  sourceUid?: string;
  from?: TilePosition;
  to?: TilePosition;
}

export interface TimelineCard {
  id: string;
  tick: number;
  kind: 'player' | 'enemy' | 'item' | 'empty';
  definition: CardDefinition | null;
  upgradeLevel: number;
  entityId?: string;
  sourceUid?: string;
  events: WorldEvent[];
  canceled?: boolean;
}

export type WorldCommand =
  | { kind: 'move'; direction: Direction }
  | { kind: 'wait' }
  | { kind: 'interact'; objectId: string }
  | { kind: 'potion' }
  | { kind: 'play'; uid: string; targetId?: string; sourceId?: string }
  | { kind: 'rewind'; tick: number };

export interface WorldHistoryEntry {
  tick: number;
  command: WorldCommand;
  events: WorldEvent[];
  cards: TimelineCard[];
}

export interface WorldMutableFields {
  seed: number;
  rng: number;
  tick: number;
  phase: WorldPhase;
  player: WorldPlayer;
  enemies: WorldEnemy[];
  deck: CardInstance[];
  hand: CardInstance[];
  drawPile: CardInstance[];
  discardPile: CardInstance[];
  exhaustPile: CardInstance[];
  grades: Record<string, number>;
  retainedUids: string[];
  drawDebt: number;
  echoUsed: string[];
  potions: number;
  usedObjectIds: string[];
  completedEncounters: string[];
  pendingRewards: string[];
  rewardIds: string[];
  serviceObjectId: string | null;
  timeMode: 'normal' | 'stretch' | 'compress';
  timeExpires: number;
  scouting: number;
  scoutingExpires: number;
  log: string[];
}

export interface WorldSnapshot extends WorldMutableFields {}

export interface WorldCheckpoint {
  tick: number;
  snapshot: WorldSnapshot;
}

export interface WorldState extends WorldMutableFields {
  version: 2;
  map: StoreMap;
  rewindCharges: number;
  exhaustedByRewind: string[];
  history: WorldHistoryEntry[];
  checkpoints: WorldCheckpoint[];
}

export interface CommandResult {
  ok: boolean;
  reason?: string;
}

export interface WorldCommandResult extends CommandResult {
  events: WorldEvent[];
}

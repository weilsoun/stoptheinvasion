export type ActorId = 'bob' | 'guard';
export type Phase = 'planning' | 'resolving' | 'victory' | 'defeat';
export type Effect = { kind: 'damage' | 'block' | 'exposed' | 'heal' | 'energy' | 'draw'; amount: number; recipient: 'self' | 'target' };
export interface CardDefinition {
  id: string;
  name: string;
  cost: number;
  type: 'attack' | 'skill' | 'power';
  target: 'enemy' | 'self';
  description: string;
  flavor: string;
  icon: 'hammer' | 'shield' | 'tape' | 'coffee' | 'toolbox' | 'boot';
  effects: Effect[];
  retain?: boolean;
  modifier?: { damage: number };
}
export interface CardInstance { uid: string; definitionId: string; owner: ActorId }
export interface Actor {
  id: ActorId;
  name: string;
  hp: number;
  maxHp: number;
  block: number;
  exposed: number;
  energy: number;
  energyMax: number;
  energyGain: number;
  drawCount: number;
}
export interface PlayerAction { kind: 'player'; card: CardInstance; target: ActorId | null }
export interface EnemyAction { kind: 'enemy'; uid: string; actor: ActorId; target: ActorId; name: string; description: string; effects: Effect[] }
export type QueueSlot = PlayerAction | EnemyAction | null;
export type ModifierTarget = { kind: 'card'; uid: string } | { kind: 'slot'; slot: number };
export interface Attachment { card: CardInstance; target: ModifierTarget }
export interface CombatState {
  seed: number;
  turn: number;
  phase: Phase;
  actors: Record<ActorId, Actor>;
  hand: CardInstance[];
  drawPile: CardInstance[];
  discardPile: CardInstance[];
  queue: QueueSlot[];
  attachments: Attachment[];
  activeSlot: number | null;
  log: string[];
}
export interface CombatEvent {
  kind: 'action' | 'damage' | 'block' | 'exposed' | 'heal' | 'energy' | 'draw' | 'discard' | 'empty' | 'victory' | 'defeat' | 'turn';
  message: string;
  actor?: ActorId;
  target?: ActorId;
  amount?: number;
  slot?: number;
  /** Exact moved cards, including cards discarded and redrawn in one cleanup. */
  cards?: CardInstance[];
}
export interface ResolutionStep { state: CombatState; events: CombatEvent[] }
export interface CommandResult { ok: boolean; reason?: string }

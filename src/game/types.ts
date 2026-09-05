export type ActorId = 'bob' | 'guard';
export type Phase = 'planning' | 'resolving' | 'victory' | 'defeat';
export type Effect = { kind: 'damage' | 'block' | 'exposed' | 'energy' | 'draw'; amount: number; recipient: 'self' | 'target' };
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
export interface PlayerAction { kind: 'player'; card: CardInstance; target: ActorId }
export interface EnemyAction { kind: 'enemy'; actor: ActorId; target: ActorId; name: string; description: string; effects: Effect[] }
export type QueueSlot = PlayerAction | EnemyAction | null;
export interface CombatState {
  seed: number;
  turn: number;
  phase: Phase;
  actors: Record<ActorId, Actor>;
  hand: CardInstance[];
  drawPile: CardInstance[];
  discardPile: CardInstance[];
  queue: QueueSlot[];
  activeSlot: number | null;
  log: string[];
}
export interface CombatEvent {
  kind: 'action' | 'damage' | 'block' | 'exposed' | 'energy' | 'draw' | 'empty' | 'victory' | 'defeat' | 'turn';
  message: string;
  actor?: ActorId;
  target?: ActorId;
  amount?: number;
  slot?: number;
}
export interface ResolutionStep { state: CombatState; events: CombatEvent[] }
export interface CommandResult { ok: boolean; reason?: string }

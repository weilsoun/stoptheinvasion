export type ActorId = 'bob' | 'guard';
export type Phase = 'planning' | 'resolving' | 'victory' | 'defeat';
export type Effect = { kind: 'damage' | 'block' | 'exposed' | 'heal' | 'energy' | 'draw' | 'ringing'; amount: number; recipient: 'self' | 'target' };
export type CardRarity = 'basic' | 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export interface CardDefinition {
  id: string;
  name: string;
  cost: number;
  type: 'attack' | 'skill' | 'power';
  target: 'enemy' | 'self';
  description: string;
  flavor: string;
  icon: 'hammer' | 'shield' | 'tape' | 'coffee' | 'toolbox' | 'boot';
  /** Reuse a named, preloaded comic illustration when identity differs from artwork. */
  art?: string;
  effects: Effect[];
  /** Applied once after this action critically hits an Exposed enemy. */
  onCritical?: Effect[];
  /** Unranked laboratory cards use the common presentation. */
  rarity?: CardRarity;
  /** Character identity color; the current builder deck defaults to Bob's orange. */
  characterColor?: string;
  retain?: boolean;
  modifier?: { damage: number };
  /** Planning-only modifier attached to the current turn bracket. Expires at cleanup. */
  bracket?: { positions?: number; scouting?: number };
}
export interface CardInstance { uid: string; definitionId: string; owner: ActorId }
export interface Actor {
  id: ActorId;
  name: string;
  hp: number;
  maxHp: number;
  block: number;
  exposed: number;
  /** Limits this actor to one action in the current turn. */
  ringing: boolean;
  /** Becomes active at cleanup, then expires after the following turn. */
  ringingNextTurn: boolean;
  energy: number;
  energyMax: number;
  energyGain: number;
  drawCount: number;
  /** Persistent actor stats; temporary bracket attachments add to these values. */
  turnLength: number;
  scouting: number;
}
export interface PlayerAction { kind: 'player'; card: CardInstance; target: ActorId | null }
export interface EnemyAction { kind: 'enemy'; uid: string; actor: ActorId; target: ActorId; name: string; description: string; effects: Effect[] }
export type QueueSlot = PlayerAction | EnemyAction | null;
export type ModifierTarget = { kind: 'card'; uid: string } | { kind: 'slot'; slot: number } | { kind: 'bracket' };
export interface Attachment { card: CardInstance; target: ModifierTarget }
export interface TimelineEntry {
  position: number;
  turn: number;
  action: QueueSlot;
  /** Player definition frozen at resolution; enemy actions already contain their rules. */
  definition: CardDefinition | null;
  damageModifier: number;
  attachments: Attachment[];
  events: CombatEvent[];
}
export interface CombatState {
  seed: number;
  turn: number;
  phase: Phase;
  actors: Record<ActorId, Actor>;
  hand: CardInstance[];
  drawPile: CardInstance[];
  discardPile: CardInstance[];
  /** Absolute position at the start of the current turn. Higher indices are later/LEFT. */
  position: number;
  /** Independent records of consumed positions, including empty and canceled positions. */
  history: TimelineEntry[];
  /** Queue indices are absolute encounter positions; consumed positions contain null. */
  queue: QueueSlot[];
  attachments: Attachment[];
  activeSlot: number | null;
  log: string[];
}
export interface CombatEvent {
  kind: 'action' | 'damage' | 'block' | 'exposed' | 'heal' | 'energy' | 'draw' | 'ringing' | 'discard' | 'empty' | 'victory' | 'defeat' | 'turn';
  message: string;
  actor?: ActorId;
  target?: ActorId;
  amount?: number;
  /** Damage hit an enemy that was Exposed before the hit consumed it. */
  critical?: boolean;
  slot?: number;
  /** Exact moved cards, including cards discarded and redrawn in one cleanup. */
  cards?: CardInstance[];
}
export interface ResolutionStep { state: CombatState; events: CombatEvent[] }
export interface CommandResult { ok: boolean; reason?: string }

import type {
  CrewId, ShipBaseCardId, ShipBattleEvent, ShipBattleState, ShipCard,
  ShipCardDefinition, ShipCommand, ShipCommandResult, ShipEnemySpec, ShipGamePort, ShipPose, ShipScene,
} from './types';

export type CrewLevel = 1 | 2 | 3;
export type CrewDepartment = 'command' | 'engineering' | 'security' | 'science';
export type AwayAbility = 'strike' | 'rally' | 'barrier' | 'double' | 'mend';
export interface CrewDefinition {
  id: CrewId;
  name: string;
  role: string;
  department: CrewDepartment;
  biography: string;
  color: string;
  hp: number;
  attack: number;
  speed: number;
  diplomacy: number;
  science: number;
  ability: AwayAbility;
  abilityName: string;
  card: ShipCardDefinition;
}
export interface CrewMember { id: CrewId; level: CrewLevel; cardUid: string }
export interface CrewStats {
  hp: number; attack: number; speed: number; diplomacy: number; science: number;
  ability: AwayAbility; abilityAmount: number; abilityText: string;
}
export interface AwayEnemySpec {
  id: string;
  name: string;
  appearance: 'drone' | 'warden' | 'stalker';
  hp: number;
  attack: number;
  speed: number;
}
export interface AwayMission {
  id: string;
  title: string;
  description: string;
  diplomacyRequired: number;
  diplomacyCost: number;
  enemies: readonly AwayEnemySpec[];
}
export interface AwayUnit {
  id: string;
  name: string;
  side: 'crew' | 'enemy';
  crewId?: CrewId;
  appearance: CrewId | AwayEnemySpec['appearance'];
  hp: number;
  maxHp: number;
  guard: number;
  maxGuard: number;
  attack: number;
  speed: number;
  ability: AwayAbility;
  abilityName: string;
  abilityAmount: number;
  actionCount: number;
}
export interface AwayBattleState {
  missionId: string;
  round: number;
  phase: 'playing' | 'victory' | 'defeat';
  units: AwayUnit[];
  order: string[];
  cursor: number;
  reason: string;
}
export interface AwayBattleEvent {
  type: 'action' | 'damage' | 'guard' | 'heal' | 'round' | 'victory' | 'defeat';
  actorId: string;
  targetId?: string;
  amount?: number;
  hp?: number;
  guard?: number;
  round?: number;
  text: string;
}
export type AwayStepResult = { ok: true; events: AwayBattleEvent[] } | { ok: false; error: string; events: [] };
export interface ShipEncounter { id: string; title: string; enemies: readonly ShipEnemySpec[] }
export type ExpeditionNodeKind = 'launch' | 'battle' | 'planet' | 'depot' | 'science' | 'freighter' | 'exit';
export interface ExpeditionNode {
  id: string;
  title: string;
  kind: ExpeditionNodeKind;
  depth: number;
  lane: -1 | 0 | 1;
  description: string;
  next: readonly string[];
  encounterId?: string;
  missionId?: string;
}
export interface SalvageReward {
  nodeId: string;
  scrap: number;
  cards: ShipBaseCardId[];
  crewId: CrewId | null;
  allowUpgrade: boolean;
}
export type SalvageChoice =
  | { kind: 'card'; cardId: ShipBaseCardId }
  | { kind: 'upgrade'; uid: string }
  | { kind: 'crew'; crewId: CrewId }
  | { kind: 'skip' };
export type ExpeditionPhase = 'map' | 'battle' | 'salvage' | 'depot' | 'planet' | 'science' | 'away' | 'victory' | 'defeat';
export type ExpeditionCommand =
  | { type: 'travel'; nodeId: string }
  | { type: 'battle'; command: ShipCommand }
  | { type: 'finish-battle' }
  | { type: 'salvage'; choice: SalvageChoice }
  | { type: 'service'; option: 'repair' | 'upgrade' | 'recruit' | 'card'; target?: string }
  | { type: 'leave' }
  | { type: 'deploy'; crewIds: CrewId[] }
  | { type: 'away-step' }
  | { type: 'finish-away' }
  | { type: 'diplomacy'; crewIds: CrewId[] }
  | { type: 'science'; choice: 'decode' | 'share' | 'salvage'; uid?: string }
  | { type: 'complete' };
export interface ExpeditionState {
  version: 1;
  seed: number;
  rng: number;
  phase: ExpeditionPhase;
  nodeId: string;
  visited: string[];
  hull: number;
  scrap: number;
  deck: ShipCard[];
  crew: CrewMember[];
  nextUid: number;
  battle: ShipBattleState | null;
  away: AwayBattleState | null;
  reward: SalvageReward | null;
  purchases: string[];
  journal: readonly ExpeditionCommand[];
}
export type ExpeditionResult =
  | { ok: true; events: ShipBattleEvent[]; awayEvents: AwayBattleEvent[]; message: string }
  | { ok: false; events: []; awayEvents: []; error: string };
export interface ExpeditionService {
  option: 'repair' | 'upgrade' | 'recruit' | 'card';
  title: string;
  cost: number;
  amount?: number;
  available: boolean;
  reason: string;
}
export interface PresentationSettings {
  motion: 'system' | 'reduced' | 'full';
  effects: 'full' | 'subtle' | 'off';
}
export interface ResolvedPresentation {
  reducedMotion: boolean;
  effects: PresentationSettings['effects'];
}
/** The combat component consumes the smaller ShipScene interface. */
export interface ExpeditionScene extends ShipScene {
  setScreen(screen: 'title' | 'map' | 'ship' | 'away'): void;
  setPresentation(settings: ResolvedPresentation): void;
  setPaused(paused: boolean): void;
  setAwayState(state: AwayBattleState | null): void;
  presentAway(events: readonly AwayBattleEvent[], finalState: AwayBattleState, options: {
    reducedMotion: boolean;
    onEvent?: (event: AwayBattleEvent) => void;
  }): Promise<void>;
}
export interface ShipCombatOptions {
  state(): ShipBattleState;
  dispatch(command: ShipCommand): ShipCommandResult;
  presentation(): ResolvedPresentation;
  blocked(): boolean;
  onMenu(): void;
  onComplete(): void;
}
export interface ShipCombatPort extends ShipGamePort {
  refresh(): void;
  cancelInteraction(): void;
}

/** Shared scene/native away layout; native panels own visible unit telemetry. */
export const AWAY_LAYOUT = Object.freeze({
  crewCenterX: 520, enemyCenterX: 1400, actorY: 870, staggerY: 22,
  actorWidth: 245, actorHeight: 408, sideWidth: 720, maxPitch: 270,
  hudTop: 1110, hudWidth: 228, hudHeight: 170,
  logX: 90, logY: 235, logWidth: 1740, logHeight: 240,
} as const);
export function awayActorPose(side: AwayUnit['side'], index: number, count: number): ShipPose {
  const pitch = Math.min(AWAY_LAYOUT.maxPitch, AWAY_LAYOUT.sideWidth / count);
  const direction = side === 'crew' ? -1 : 1;
  const center = side === 'crew' ? AWAY_LAYOUT.crewCenterX : AWAY_LAYOUT.enemyCenterX;
  return {
    x: center + (index - (count - 1) / 2) * pitch * direction,
    y: AWAY_LAYOUT.actorY + (index % 2) * AWAY_LAYOUT.staggerY,
    width: AWAY_LAYOUT.actorWidth, height: AWAY_LAYOUT.actorHeight, rotation: 0,
  };
}

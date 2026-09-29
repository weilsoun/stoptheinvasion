import type { EnemyShip, ShipBattleState, ShipEffect, ShipIntent } from './types';
import { nextIntent } from './combat';

export const ENEMY_TELEMETRY_SIZE = { width: 440, height: 160 } as const;
export const PLAYER_TELEMETRY_SIZE = { width: 284, height: 240 } as const;
export const AIM_RETICLE_SIZE = 306;

const FONT = '"Barlow Condensed", "Arial Narrow", Arial, sans-serif';
const TEXTURE_SCALE = 2;

function surface(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width * TEXTURE_SCALE;
  canvas.height = height * TEXTURE_SCALE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is required for ship telemetry.');
  context.scale(TEXTURE_SCALE, TEXTURE_SCALE);
  context.imageSmoothingEnabled = true;
  return [canvas, context];
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

export function enemyHudScaleKey(cssScale: number): number {
  const safeScale = Number.isFinite(cssScale) && cssScale > 0 ? cssScale : 1;
  // Every gameplay label and value remains at least 14 CSS pixels at the 834px portrait stage.
  return Math.ceil(Math.max(24, Math.min(36, 14 / safeScale)) * 2) / 2;
}

function groupedEffects(effects: readonly ShipEffect[]): Array<{ effect: ShipEffect; count: number }> {
  const groups: Array<{ effect: ShipEffect; count: number }> = [];
  for (let index = 0; index < effects.length; index += 1) {
    const effect = effects[index]!;
    let count = 1;
    if (effect.kind === 'damage') {
      while (effects[index + count]?.kind === effect.kind && effects[index + count]?.amount === effect.amount) count += 1;
    }
    groups.push({ effect, count });
    index += count - 1;
  }
  return groups;
}

function effectToken(effect: ShipEffect, count = 1): string {
  const prefix = effect.kind === 'damage' ? 'DMG' : effect.kind === 'shield' ? 'SHD' : effect.kind === 'energy' ? 'ENG' : 'DRAW';
  return `${prefix} ${effect.amount}${count > 1 ? `×${count}` : ''}`;
}

function orderedEffects(intent: ShipIntent): string {
  return groupedEffects(intent.effects).map(({ effect, count }) => effectToken(effect, count)).join('  ›  ');
}

function orderedIntent(enemy: EnemyShip): string {
  return `RCH +${enemy.recharge}  ›  ${orderedEffects(nextIntent(enemy))}`;
}

function telemetryKey(enemy: EnemyShip, scaleKey: number): string {
  const intent = nextIntent(enemy);
  return [
    scaleKey,
    enemy.name,
    enemy.hull,
    enemy.maxHull,
    enemy.shield,
    enemy.maxShield,
    enemy.recharge,
    intent.title,
    ...intent.effects.flatMap((effect) => [effect.kind, effect.amount]),
  ].join('|');
}

export function enemyHudTextureKey(enemy: EnemyShip, cssScale: number): string {
  return telemetryKey(enemy, enemyHudScaleKey(cssScale));
}

function meter(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  value: number,
  maximum: number,
  color: string,
): void {
  roundedRect(context, x, y, width, 7, 3.5);
  context.fillStyle = 'rgba(5, 15, 28, .88)';
  context.fill();
  const fill = maximum > 0 ? Math.max(0, Math.min(1, value / maximum)) : 0;
  if (fill <= 0) return;
  roundedRect(context, x, y, Math.max(4, width * fill), 7, 3.5);
  context.fillStyle = color;
  context.fill();
}

export function drawEnemyTelemetry(enemy: EnemyShip, cssScale: number): HTMLCanvasElement {
  const [canvas, context] = surface(ENEMY_TELEMETRY_SIZE.width, ENEMY_TELEMETRY_SIZE.height);
  const numericSize = enemyHudScaleKey(cssScale);
  const intent = nextIntent(enemy);

  const backing = context.createLinearGradient(0, 0, 0, ENEMY_TELEMETRY_SIZE.height);
  backing.addColorStop(0, 'rgba(3, 15, 29, .84)');
  backing.addColorStop(1, 'rgba(3, 15, 29, .58)');
  context.fillStyle = backing;
  context.fillRect(0, 0, ENEMY_TELEMETRY_SIZE.width, ENEMY_TELEMETRY_SIZE.height);
  const divider = context.createLinearGradient(0, 0, ENEMY_TELEMETRY_SIZE.width, 0);
  divider.addColorStop(0, 'rgba(76, 211, 235, .18)');
  divider.addColorStop(.5, 'rgba(76, 211, 235, .72)');
  divider.addColorStop(1, 'rgba(76, 211, 235, .18)');
  context.fillStyle = divider;
  context.fillRect(0, 0, ENEMY_TELEMETRY_SIZE.width, 2);

  context.font = `700 ${numericSize}px ${FONT}`;
  context.fillStyle = '#d9f8ff';
  context.textBaseline = 'alphabetic';
  context.fillText(enemy.name.toUpperCase(), 16, 34);
  context.textAlign = 'right';
  context.fillStyle = '#73ddec';
  context.fillText(`RCH +${enemy.recharge}`, 424, 34);
  context.textAlign = 'left';

  context.fillStyle = '#eaa36e';
  context.fillText(`HULL ${enemy.hull}/${enemy.maxHull}`, 16, 72);
  context.fillStyle = '#79e7ee';
  context.fillText(`SHD ${enemy.shield}/${enemy.maxShield}`, 230, 72);
  meter(context, 16, 78, 194, enemy.hull, enemy.maxHull, '#cf704b');
  meter(context, 230, 78, 194, enemy.shield, enemy.maxShield, '#50cfe0');

  context.fillStyle = 'rgba(76, 211, 235, .20)';
  context.fillRect(16, 96, 408, 1);
  context.fillStyle = '#f2fbff';
  context.fillText(`NEXT · ${intent.title.toUpperCase()}`, 16, 121);
  context.fillStyle = intent.effects.some((effect) => effect.kind === 'damage') ? '#f0a271' : '#73e1e9';
  context.fillText(orderedIntent(enemy), 16, 153);
  return canvas;
}

export function playerHudTextureKey(state: ShipBattleState, cssScale: number): string {
  const player = state.player;
  return [
    enemyHudScaleKey(cssScale),
    player.name,
    player.hull,
    player.maxHull,
    player.shield,
    player.maxShield,
    player.recharge,
    state.energy,
    state.maxEnergy,
    state.coilsAvailable ? 1 : 0,
  ].join('|');
}

export function drawPlayerTelemetry(state: ShipBattleState, cssScale: number): HTMLCanvasElement {
  const [canvas, context] = surface(PLAYER_TELEMETRY_SIZE.width, PLAYER_TELEMETRY_SIZE.height);
  const numericSize = enemyHudScaleKey(cssScale);
  const player = state.player;

  roundedRect(context, 2, 2, 280, 236, 12);
  context.fillStyle = 'rgba(3, 15, 29, .92)';
  context.fill();
  context.strokeStyle = 'rgba(76, 211, 235, .72)';
  context.lineWidth = 2;
  context.stroke();
  context.fillStyle = 'rgba(59, 184, 218, .28)';
  context.fillRect(13, 13, 4, 58);

  context.font = `700 ${numericSize}px ${FONT}`;
  context.fillStyle = '#d9f8ff';
  context.textBaseline = 'alphabetic';
  context.fillText(player.name.toUpperCase(), 20, 36);
  context.textAlign = 'right';
  context.fillStyle = '#79e7ee';
  context.fillText(`RCH +${player.recharge}`, 264, 36);
  context.textAlign = 'left';

  context.fillStyle = '#eaa36e';
  context.fillText(`HULL ${player.hull}/${player.maxHull}`, 20, 78);
  meter(context, 20, 84, 244, player.hull, player.maxHull, '#cf704b');

  context.fillStyle = '#79e7ee';
  context.fillText(`SHIELD ${player.shield}/${player.maxShield}`, 20, 120);
  meter(context, 20, 126, 244, player.shield, player.maxShield, '#50cfe0');

  context.fillStyle = '#e7c879';
  context.fillText(`ENERGY ${state.energy}`, 20, 162);
  context.textAlign = 'right';
  context.fillText(`TURN +${state.maxEnergy}`, 264, 162);
  context.textAlign = 'left';

  context.fillStyle = '#8edce7';
  context.fillText('ADAPTIVE COILS', 20, 198);
  context.fillStyle = state.coilsAvailable ? '#8ef0db' : '#7894a3';
  context.fillText(state.coilsAvailable ? 'READY · +2 SHIELD' : 'SPENT', 20, 230);
  return canvas;
}

export function drawAimReticle(): HTMLCanvasElement {
  const [canvas, context] = surface(AIM_RETICLE_SIZE, AIM_RETICLE_SIZE);
  const center = AIM_RETICLE_SIZE / 2;
  context.translate(center, center);
  context.shadowColor = '#26cfff';
  context.shadowBlur = 16;
  context.strokeStyle = 'rgba(70, 218, 255, .94)';
  context.lineWidth = 4;
  context.beginPath();
  context.arc(0, 0, 101, -.38, 1.18);
  context.arc(0, 0, 101, 2.76, 4.32);
  context.stroke();
  context.shadowBlur = 7;
  context.strokeStyle = 'rgba(129, 238, 255, .98)';
  context.lineWidth = 2;
  context.beginPath();
  context.arc(0, 0, 79, 0, Math.PI * 2);
  context.stroke();
  context.lineWidth = 4;
  for (let turn = 0; turn < 4; turn += 1) {
    context.save();
    context.rotate(turn * Math.PI / 2);
    context.beginPath();
    context.moveTo(0, -132);
    context.lineTo(0, -104);
    context.moveTo(-9, -116);
    context.lineTo(9, -116);
    context.stroke();
    context.restore();
  }
  context.shadowBlur = 0;
  context.fillStyle = '#9af4ff';
  context.beginPath();
  context.arc(0, 0, 4, 0, Math.PI * 2);
  context.fill();
  return canvas;
}

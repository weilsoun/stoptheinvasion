import type { AwayUnit } from './expedition-types';
import type { CrewId } from './types';

const INK = '#07151d';

function canvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const context = output.getContext('2d');
  if (!context) throw new Error('Canvas 2D is required for away artwork.');
  return [output, context];
}

function line(ctx: CanvasRenderingContext2D, points: readonly number[], color: string, width: number): void {
  ctx.beginPath(); ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
}

export function drawAwayBackdrop(): HTMLCanvasElement {
  const [output, ctx] = canvas(1920, 1440);
  const sky = ctx.createLinearGradient(0, 0, 0, 1440);
  sky.addColorStop(0, '#081629'); sky.addColorStop(.46, '#173a48'); sky.addColorStop(1, '#6c5948');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, 1920, 1440);
  ctx.fillStyle = '#d6c476'; ctx.beginPath(); ctx.arc(1510, 260, 132, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,245,190,.16)'; ctx.beginPath(); ctx.arc(1510, 260, 196, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 52; i++) { const x = (i * 277) % 1900; const y = 35 + (i * 83) % 520; ctx.fillStyle = i % 7 ? '#a8ced0' : '#fff1bd'; ctx.fillRect(x, y, i % 7 ? 2 : 4, 2); }
  // Distant nacre ridges and the listening post's intentional silhouette.
  ctx.fillStyle = '#263f45'; ctx.beginPath(); ctx.moveTo(0, 860); ctx.lineTo(280, 650); ctx.lineTo(520, 790); ctx.lineTo(780, 570); ctx.lineTo(1030, 790); ctx.lineTo(1320, 620); ctx.lineTo(1600, 760); ctx.lineTo(1920, 610); ctx.lineTo(1920, 1120); ctx.lineTo(0, 1120); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#142a31'; ctx.fillRect(1130, 570, 470, 380); ctx.fillStyle = '#1e424a'; ctx.fillRect(1180, 620, 370, 300);
  ctx.strokeStyle = '#79cbc6'; ctx.lineWidth = 10; ctx.strokeRect(1180, 620, 370, 300);
  ctx.fillStyle = '#07151d'; ctx.fillRect(1305, 735, 120, 185); ctx.fillStyle = '#d9b45e'; ctx.fillRect(1348, 766, 34, 8);
  line(ctx, [1365, 570, 1365, 392], '#172c33', 25); line(ctx, [1365, 414, 1250, 330], '#79cbc6', 8); line(ctx, [1365, 414, 1480, 330], '#79cbc6', 8);
  ctx.fillStyle = '#354b48'; ctx.beginPath(); ctx.moveTo(0, 1010); ctx.quadraticCurveTo(520, 900, 960, 1010); ctx.quadraticCurveTo(1460, 880, 1920, 1035); ctx.lineTo(1920, 1440); ctx.lineTo(0, 1440); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#263c3b'; for (let x = 0; x < 1920; x += 180) ctx.fillRect(x, 1220 + (x % 360) / 6, 130, 15);
  line(ctx, [80, 1140, 1840, 1140], 'rgba(121,203,198,.25)', 4);
  return output;
}

function crewPalette(id: CrewId): { suit: string; skin: string; hair: string; prop: string } {
  if (id === 'vale') return { suit: '#d9b45e', skin: '#c88765', hair: '#27303a', prop: '#326b9f' };
  if (id === 'iona') return { suit: '#bf7653', skin: '#b97454', hair: '#231e20', prop: '#79cbc6' };
  if (id === 'rex') return { suit: '#879dab', skin: '#9a644d', hair: '#171a1f', prop: '#efbd62' };
  return { suit: '#d7e4d8', skin: '#b77a58', hair: '#29313c', prop: '#72aa9b' };
}

function drawCrewActor(ctx: CanvasRenderingContext2D, id: CrewId): void {
  const p = crewPalette(id);
  ctx.fillStyle = p.suit; ctx.beginPath(); ctx.roundRect(92, 204, 176, 222, 52); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 12; ctx.stroke();
  ctx.fillStyle = '#263a46'; ctx.fillRect(130, 258, 100, 168); ctx.strokeRect(130, 258, 100, 168);
  ctx.fillStyle = p.skin; ctx.beginPath(); ctx.ellipse(180, 142, 72, 86, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = p.hair; ctx.beginPath(); ctx.arc(180, 122, 76, Math.PI, Math.PI * 2); ctx.lineTo(250, 145); ctx.quadraticCurveTo(190, 96, 108, 140); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(153, 148, 6, 0, Math.PI * 2); ctx.arc(207, 148, 6, 0, Math.PI * 2); ctx.fill();
  line(ctx, [146, 190, 180, 203, 214, 188], '#6b342e', 5);
  line(ctx, [106, 282, 46, 358], p.skin, 28); line(ctx, [254, 282, 314, 358], p.skin, 28);
  line(ctx, [138, 420, 126, 474], '#182831', 34); line(ctx, [222, 420, 234, 474], '#182831', 34);
  if (id === 'iona') { line(ctx, [277, 342, 321, 271], '#e2d5ae', 17); ctx.strokeStyle = '#e2d5ae'; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(327, 257, 24, .5, 2.65); ctx.stroke(); }
  else if (id === 'rex') { ctx.fillStyle = '#172832'; ctx.beginPath(); ctx.roundRect(244, 325, 108, 34, 10); ctx.fill(); ctx.strokeStyle = INK; ctx.stroke(); }
  else if (id === 'sen') { ctx.strokeStyle = p.prop; ctx.lineWidth = 5; for (let a = 0; a < 3; a++) { ctx.beginPath(); ctx.ellipse(300, 300, 42, 15, a * Math.PI / 3, 0, Math.PI * 2); ctx.stroke(); } }
  else { ctx.fillStyle = '#e9dfbd'; ctx.fillRect(270, 304, 66, 82); ctx.strokeStyle = INK; ctx.strokeRect(270, 304, 66, 82); line(ctx, [278, 365, 296, 344, 307, 351, 328, 324], p.prop, 4); }
}

function drawEnemyActor(ctx: CanvasRenderingContext2D, appearance: AwayUnit['appearance']): void {
  if (appearance === 'drone') {
    ctx.fillStyle = '#587781'; ctx.beginPath(); ctx.roundRect(64, 174, 232, 148, 48); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 13; ctx.stroke();
    ctx.fillStyle = '#d75d68'; ctx.beginPath(); ctx.arc(180, 232, 26, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    line(ctx, [85, 300, 48, 414, 92, 470], '#334952', 22); line(ctx, [275, 300, 312, 414, 268, 470], '#334952', 22);
    line(ctx, [58, 204, 8, 160], '#79cbc6', 12); line(ctx, [302, 204, 352, 160], '#79cbc6', 12);
  } else if (appearance === 'warden') {
    ctx.fillStyle = '#6b6965'; ctx.beginPath(); ctx.roundRect(58, 148, 244, 294, 42); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 14; ctx.stroke();
    ctx.fillStyle = '#253841'; ctx.beginPath(); ctx.moveTo(88, 148); ctx.lineTo(180, 42); ctx.lineTo(272, 148); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f0a85f'; ctx.fillRect(118, 190, 124, 24); ctx.strokeRect(118, 190, 124, 24);
    line(ctx, [58, 260, 8, 374], '#6b6965', 35); line(ctx, [302, 260, 352, 374], '#6b6965', 35);
    line(ctx, [118, 442, 102, 478], '#2a3437', 42); line(ctx, [242, 442, 258, 478], '#2a3437', 42);
  } else {
    ctx.fillStyle = '#665c73'; ctx.beginPath(); ctx.moveTo(180, 32); ctx.lineTo(286, 208); ctx.lineTo(248, 424); ctx.lineTo(112, 424); ctx.lineTo(74, 208); ctx.closePath(); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 13; ctx.stroke();
    ctx.fillStyle = '#9ce3d3'; ctx.beginPath(); ctx.moveTo(180, 86); ctx.lineTo(222, 208); ctx.lineTo(180, 252); ctx.lineTo(138, 208); ctx.closePath(); ctx.fill(); ctx.stroke();
    line(ctx, [116, 312, 30, 390], '#665c73', 28); line(ctx, [244, 312, 330, 390], '#665c73', 28);
    line(ctx, [143, 423, 121, 478], '#42394b', 35); line(ctx, [217, 423, 239, 478], '#42394b', 35);
  }
}

export function drawAwayUnit(unit: AwayUnit): HTMLCanvasElement {
  const [output, ctx] = canvas(360, 600);
  if (unit.side === 'crew' && unit.crewId) drawCrewActor(ctx, unit.crewId);
  else drawEnemyActor(ctx, unit.appearance);
  return output;
}

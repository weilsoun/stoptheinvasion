import type { CrewId } from './types';

const INK = '#07151d';

function stroke(ctx: CanvasRenderingContext2D, color = INK, width = 8): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, outline = INK, width = 7): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (width) stroke(ctx, outline, width);
}

function portraitBase(ctx: CanvasRenderingContext2D, sky: string, halo: string): void {
  const gradient = ctx.createLinearGradient(44, 176, 716, 648);
  gradient.addColorStop(0, sky);
  gradient.addColorStop(1, '#07141d');
  ctx.fillStyle = gradient;
  ctx.fillRect(44, 176, 672, 472);
  ctx.fillStyle = 'rgba(255,255,255,.08)';
  for (let x = 74; x < 700; x += 54) ctx.fillRect(x, 198, 2, 420);
  ctx.beginPath();
  ctx.arc(380, 415, 185, 0, Math.PI * 2);
  ctx.fillStyle = halo;
  ctx.fill();
  ctx.strokeStyle = 'rgba(224,248,238,.42)';
  ctx.lineWidth = 5;
  ctx.stroke();
}

function drawVale(ctx: CanvasRenderingContext2D): void {
  portraitBase(ctx, '#273e61', 'rgba(217,180,94,.22)');
  // Command coat, steady open posture and a plotted course tablet.
  ctx.beginPath();
  ctx.moveTo(228, 642); ctx.quadraticCurveTo(250, 494, 380, 482); ctx.quadraticCurveTo(510, 494, 532, 642); ctx.closePath();
  ctx.fillStyle = '#d9b45e'; ctx.fill(); stroke(ctx);
  ctx.beginPath(); ctx.moveTo(380, 500); ctx.lineTo(314, 642); ctx.lineTo(446, 642); ctx.closePath(); ctx.fillStyle = '#24475d'; ctx.fill(); stroke(ctx);
  ellipse(ctx, 380, 367, 91, 111, '#c88765');
  ctx.beginPath(); ctx.arc(380, 342, 94, Math.PI, Math.PI * 2); ctx.lineTo(466, 375); ctx.quadraticCurveTo(410, 302, 286, 349); ctx.closePath(); ctx.fillStyle = '#27303a'; ctx.fill(); stroke(ctx);
  ellipse(ctx, 347, 371, 7, 5, '#11151a', INK, 0); ellipse(ctx, 413, 371, 7, 5, '#11151a', INK, 0);
  ctx.beginPath(); ctx.moveTo(344, 417); ctx.quadraticCurveTo(380, 435, 416, 410); stroke(ctx, '#6e342c', 5);
  ctx.save(); ctx.translate(518, 512); ctx.rotate(-.16); ctx.fillStyle = '#e9dfbd'; ctx.fillRect(-55, -70, 110, 140); ctx.strokeRect(-55, -70, 110, 140); ctx.strokeStyle = '#326b9f'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-35, 35); ctx.lineTo(-8, 4); ctx.lineTo(16, 18); ctx.lineTo(38, -30); ctx.stroke(); ctx.restore();
}

function drawIona(ctx: CanvasRenderingContext2D): void {
  portraitBase(ctx, '#4a342c', 'rgba(191,118,83,.25)');
  // Rolled-sleeve engineering coverall and a real wrench at the failed seal.
  ctx.beginPath(); ctx.moveTo(216, 642); ctx.quadraticCurveTo(245, 490, 380, 480); ctx.quadraticCurveTo(522, 492, 544, 642); ctx.closePath(); ctx.fillStyle = '#bf7653'; ctx.fill(); stroke(ctx);
  ctx.fillStyle = '#243d47'; ctx.fillRect(296, 492, 168, 150); ctx.strokeRect(296, 492, 168, 150);
  ellipse(ctx, 380, 361, 86, 106, '#b97454');
  ctx.beginPath(); ctx.arc(380, 338, 89, Math.PI, Math.PI * 2); ctx.quadraticCurveTo(448, 292, 470, 360); ctx.quadraticCurveTo(418, 318, 290, 351); ctx.closePath(); ctx.fillStyle = '#231e20'; ctx.fill(); stroke(ctx);
  ellipse(ctx, 348, 365, 6, 5, '#101519', INK, 0); ellipse(ctx, 410, 365, 6, 5, '#101519', INK, 0);
  ctx.beginPath(); ctx.moveTo(350, 409); ctx.quadraticCurveTo(382, 425, 412, 403); stroke(ctx, '#6a3028', 5);
  ctx.save(); ctx.translate(536, 475); ctx.rotate(-.7); ctx.strokeStyle = '#e2d5ae'; ctx.lineWidth = 22; ctx.beginPath(); ctx.moveTo(0, 92); ctx.lineTo(0, -47); ctx.stroke(); ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(0, -64, 30, .5, 2.64); ctx.stroke(); ctx.fillStyle = '#79cbc6'; ctx.beginPath(); ctx.arc(0, 76, 16, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}

function drawRex(ctx: CanvasRenderingContext2D): void {
  portraitBase(ctx, '#263642', 'rgba(135,157,171,.24)');
  // Armored marshal, shoulder beacon and compact covering-fire carbine.
  ctx.beginPath(); ctx.moveTo(204, 642); ctx.quadraticCurveTo(236, 480, 380, 472); ctx.quadraticCurveTo(524, 480, 556, 642); ctx.closePath(); ctx.fillStyle = '#879dab'; ctx.fill(); stroke(ctx);
  ctx.beginPath(); ctx.moveTo(278, 510); ctx.lineTo(380, 570); ctx.lineTo(482, 510); ctx.lineTo(510, 642); ctx.lineTo(250, 642); ctx.closePath(); ctx.fillStyle = '#263a46'; ctx.fill(); stroke(ctx);
  ellipse(ctx, 380, 353, 88, 106, '#9a644d');
  ctx.beginPath(); ctx.arc(380, 330, 91, Math.PI, Math.PI * 2); ctx.lineTo(468, 356); ctx.quadraticCurveTo(410, 302, 290, 347); ctx.closePath(); ctx.fillStyle = '#171a1f'; ctx.fill(); stroke(ctx);
  ellipse(ctx, 347, 358, 6, 5, '#101519', INK, 0); ellipse(ctx, 413, 358, 6, 5, '#101519', INK, 0);
  ctx.beginPath(); ctx.moveTo(348, 404); ctx.lineTo(412, 404); stroke(ctx, '#542b28', 5);
  ctx.save(); ctx.translate(497, 538); ctx.rotate(-.18); ctx.fillStyle = '#172832'; ctx.beginPath(); ctx.roundRect(-106, -28, 210, 56, 18); ctx.fill(); stroke(ctx); ctx.fillStyle = '#d9b45e'; ctx.fillRect(35, -10, 74, 20); ctx.fillStyle = '#72d5d0'; ctx.fillRect(-88, -8, 34, 16); ctx.restore();
}

function drawSen(ctx: CanvasRenderingContext2D): void {
  portraitBase(ctx, '#21433f', 'rgba(114,170,155,.25)');
  // Field coat, sample canister and a hovering molecular/data readout.
  ctx.beginPath(); ctx.moveTo(214, 642); ctx.quadraticCurveTo(248, 490, 380, 478); ctx.quadraticCurveTo(516, 490, 548, 642); ctx.closePath(); ctx.fillStyle = '#d7e4d8'; ctx.fill(); stroke(ctx);
  ctx.beginPath(); ctx.moveTo(380, 492); ctx.lineTo(316, 642); ctx.lineTo(444, 642); ctx.closePath(); ctx.fillStyle = '#39716b'; ctx.fill(); stroke(ctx);
  ellipse(ctx, 380, 359, 86, 106, '#b77a58');
  ctx.beginPath(); ctx.arc(380, 333, 90, Math.PI, Math.PI * 2); ctx.quadraticCurveTo(429, 286, 468, 347); ctx.quadraticCurveTo(400, 306, 290, 350); ctx.closePath(); ctx.fillStyle = '#29313c'; ctx.fill(); stroke(ctx);
  ctx.strokeStyle = '#18353b'; ctx.lineWidth = 7; ctx.strokeRect(321, 347, 48, 31); ctx.strokeRect(391, 347, 48, 31); ctx.beginPath(); ctx.moveTo(369, 359); ctx.lineTo(391, 359); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(352, 408); ctx.quadraticCurveTo(380, 423, 410, 402); stroke(ctx, '#65322a', 5);
  ctx.save(); ctx.translate(528, 438); ctx.strokeStyle = '#9ce3d3'; ctx.lineWidth = 5; for (let a = 0; a < 3; a++) { ctx.save(); ctx.rotate(a * Math.PI / 3); ctx.beginPath(); ctx.ellipse(0, 0, 58, 21, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); } ellipse(ctx, 0, 0, 8, 8, '#f2d36c', INK, 2); ctx.restore();
  ctx.fillStyle = '#7ed3c4'; ctx.beginPath(); ctx.roundRect(252, 543, 38, 88, 12); ctx.fill(); stroke(ctx); ctx.fillStyle = '#e8f7dd'; ctx.fillRect(261, 566, 20, 47);
}

/** Hand-authored role portrait/action art for a crew card's common illustration window. */
export function drawCrewCardArtwork(ctx: CanvasRenderingContext2D, crewId: CrewId): void {
  if (crewId === 'vale') drawVale(ctx);
  else if (crewId === 'iona') drawIona(ctx);
  else if (crewId === 'rex') drawRex(ctx);
  else drawSen(ctx);
}

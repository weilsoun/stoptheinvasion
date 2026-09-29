import { SHIP_SCREEN, type EnemyShip, type ShipCardDefinition } from './types';
import { getCardActionArtwork, getEnemyShipArtwork, getShipSpacefield } from './assets';
import { cardIdentity, DEPARTMENT_LABELS, rarityStyle, type CardDepartment } from './card-identity';

const CARD_PALETTE = Object.freeze({
  ink: '#07151d',
  titlePanel: '#fff4d3',
  face: '#f7edcd',
  stock: '#eadbb6',
  footer: '#ded3b5',
  bodyInk: '#10232a',
  mutedInk: '#465457',
});
const INK = CARD_PALETTE.ink;
const PAPER = '#f3e8c8';
const FONT = '"Barlow Condensed", "Arial Narrow", Arial, sans-serif';

function surface(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is required for ship artwork.');
  context.imageSmoothingEnabled = true;
  return [canvas, context];
}

function path(ctx: CanvasRenderingContext2D, points: readonly number[], fill: string | CanvasGradient, stroke: string = INK, width = 8): void {
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let index = 2; index < points.length; index += 2) ctx.lineTo(points[index], points[index + 1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (width > 0) {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

function line(ctx: CanvasRenderingContext2D, points: readonly number[], color: string, width = 6): void {
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let index = 2; index < points.length; index += 2) ctx.lineTo(points[index], points[index + 1]);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, stroke: string = INK, width = 6): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (width > 0) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, fill: string, stroke: string = INK, strokeWidth = 6): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (strokeWidth > 0) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  }
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x - radius, y, radius * 2 + 1, 1);
  ctx.fillRect(x, y - radius, 1, radius * 2 + 1);
  ctx.globalAlpha = .55;
  ctx.fillRect(x - radius * .5, y - radius * .5, radius, radius);
  ctx.globalAlpha = 1;
}

export function drawBridgeArt(): HTMLCanvasElement {
  const [canvas, ctx] = surface(1920, 1440);
  const room = ctx.createLinearGradient(0, 0, 0, 1440);
  room.addColorStop(0, '#0b1a27');
  room.addColorStop(.62, '#07151f');
  room.addColorStop(1, '#0a1b22');
  ctx.fillStyle = room;
  ctx.fillRect(0, 0, 1920, 1440);

  // Broad navy armor keeps the bridge tactile without imitating a bank of HUD panels.
  path(ctx, [0, 0, 520, 0, 360, 142, 360, 840, 0, 930], '#132b38', '#030b11', 12);
  path(ctx, [1920, 0, 1400, 0, 1848, 140, 1848, 834, 1920, 920], '#102733', '#030b11', 12);
  path(ctx, [30, 28, 445, 28, 338, 150, 338, 796, 28, 870], '#173543', '#0a202a', 5);
  path(ctx, [1890, 28, 1475, 28, 1870, 150, 1870, 792, 1892, 858], '#15313e', '#091d27', 5);
  line(ctx, [322, 170, 322, 790], 'rgba(112,207,204,.24)', 3);
  line(ctx, [1882, 168, 1882, 788], 'rgba(112,207,204,.18)', 3);

  // Open-bottom bezel: docked ship readouts meet the glass edge without a lower armor bar.
  for (const bezel of [
    { inset: -16, radius: 34, fill: '#030c13', stroke: '#02080d', width: 18 },
    { inset: -4, radius: 25, fill: '#06151d', stroke: '#315d67', width: 5 },
  ]) {
    const left = SHIP_SCREEN.x + bezel.inset;
    const right = SHIP_SCREEN.x + SHIP_SCREEN.width - bezel.inset;
    const top = SHIP_SCREEN.y + bezel.inset;
    const bottom = SHIP_SCREEN.y + SHIP_SCREEN.height;
    ctx.beginPath();
    ctx.moveTo(left, bottom);
    ctx.lineTo(left, top + bezel.radius);
    ctx.quadraticCurveTo(left, top, left + bezel.radius, top);
    ctx.lineTo(right - bezel.radius, top);
    ctx.quadraticCurveTo(right, top, right, top + bezel.radius);
    ctx.lineTo(right, bottom);
    ctx.fillStyle = bezel.fill;
    ctx.fill();
    ctx.strokeStyle = bezel.stroke;
    ctx.lineWidth = bezel.width;
    ctx.lineCap = 'butt';
    ctx.stroke();
  }
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(SHIP_SCREEN.x, SHIP_SCREEN.y, SHIP_SCREEN.width, SHIP_SCREEN.height, [22, 22, 0, 0]);
  ctx.clip();
  ctx.drawImage(getShipSpacefield(), SHIP_SCREEN.x, SHIP_SCREEN.y, SHIP_SCREEN.width, SHIP_SCREEN.height);
  ctx.restore();

  // A few physical fastening bars break up the upper armor without reading as status lights.
  for (let x = 430; x <= 1700; x += 254) {
    roundRect(ctx, x, 119, 124, 12, 6, '#315763', '#07151d', 3);
  }

  // Unlabelled port armor is deliberately quiet; live telemetry is renderer-owned.
  path(ctx, [28, 145, 315, 145, 348, 184, 348, 805, 304, 854, 24, 854], '#17323f', '#030b10', 10);

  // Console deck and one physical action-bay recess sit behind the live scene layers.
  path(ctx, [0, 842, 1920, 842, 1920, 1440, 0, 1440], '#0a1820', '#03090d', 10);
  path(ctx, [72, 866, 1848, 866, 1920, 1440, 0, 1440], '#10262d', '#061117', 12);
  line(ctx, [102, 894, 1818, 894], '#36565c', 4);
  roundRect(ctx, 548, 838, 1104, 174, 26, '#06151c', '#3d7477', 5);

  // Card workspace rails remain subtle enough to disappear beneath the physical hand.
  line(ctx, [300, 1032, 1615, 1032], 'rgba(89,185,184,.22)', 3);
  line(ctx, [330, 1372, 1590, 1372], 'rgba(89,185,184,.12)', 3);
  for (let x = 360; x < 1590; x += 176) {
    ctx.fillStyle = 'rgba(99,191,191,.045)';
    ctx.fillRect(x, 1048, 2, 306);
  }
  return canvas;
}

export function drawEnemyShipArt(role: EnemyShip['role']): HTMLCanvasElement {
  const [canvas, ctx] = surface(700, 460);
  ctx.drawImage(getEnemyShipArtwork(role), 0, 0, 700, 460);
  return canvas;
}

function drawResearchIllustration(ctx: CanvasRenderingContext2D, definition: ShipCardDefinition): void {
  const space = ctx.createRadialGradient(390, 390, 20, 390, 390, 430);
  space.addColorStop(0, '#17394a');
  space.addColorStop(1, '#050c18');
  ctx.fillStyle = space;
  ctx.fillRect(44, 176, 672, 472);
  for (let index = 0; index < 32; index++) {
    star(ctx, 66 + (index * 157) % 620, 194 + (index * 83) % 420, index % 9 === 0 ? 2 : 1, '#d7eeef');
  }

  // Research cards depict their ordered recipe as linked, deterministic bridge modules.
  const effects = definition.effects;
  const pitch = Math.min(184, 540 / Math.max(1, effects.length));
  const left = 380 - (effects.length - 1) * pitch / 2;
  line(ctx, [112, 410, 648, 410], 'rgba(111,216,207,.45)', 13);
  effects.forEach((effect, index) => {
    const x = left + index * pitch;
    roundRect(ctx, x - 72, 314, 144, 192, 24, '#162c38', '#83c9c3', 7);
    if (effect.kind === 'damage') {
      path(ctx, [x - 46, 438, x - 3, 350, x + 17, 391, x + 52, 350, x + 17, 454], '#f07b55', '#160f13', 6);
      line(ctx, [x - 34, 458, x + 45, 337], '#fff0c6', 7);
    } else if (effect.kind === 'shield') {
      path(ctx, [x, 340, x + 50, 361, x + 42, 432, x, 470, x - 42, 432, x - 50, 361], 'rgba(76,198,189,.38)', '#a8f1d5', 8);
    } else if (effect.kind === 'draw') {
      for (let card = 0; card < 3; card++) {
        roundRect(ctx, x - 43 + card * 18, 354 + card * 13, 68, 96, 10, card === 2 ? '#e9dcae' : '#496572', '#08151d', 5);
      }
    } else {
      path(ctx, [x + 8, 337, x - 39, 414, x + 3, 414, x - 18, 478, x + 47, 392, x + 8, 392], '#ffd55f', '#152126', 7);
    }
    ellipse(ctx, x, 520, 25, 25, '#edb84e', '#07151d', 5);
    ctx.fillStyle = INK;
    ctx.font = `900 25px "Bebas Neue", ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(effect.amount), x, 521);
  });
  if (definition.exhaust) {
    line(ctx, [168, 570, 592, 570], '#d75d68', 8);
    for (let x = 194; x <= 566; x += 62) line(ctx, [x, 553, x + 28, 587], 'rgba(215,93,104,.6)', 5);
  }
}

function actionIllustration(ctx: CanvasRenderingContext2D, definition: ShipCardDefinition, accent: string): void {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(44, 176, 672, 472, 22);
  ctx.clip();
  const artwork = getCardActionArtwork(definition.id);
  if (artwork) {
    ctx.drawImage(artwork, 44, 176, 672, 472);
  } else {
    drawResearchIllustration(ctx, definition);
  }
  ctx.restore();

  ctx.strokeStyle = INK;
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.roundRect(44, 176, 672, 472, 22);
  ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(55, 187, 650, 450, 16);
  ctx.stroke();
}

function effectText(definition: ShipCardDefinition): string[] {
  const lines = definition.effects.map((effect) => {
    if (effect.kind === 'damage') return `DEAL ${effect.amount} DAMAGE`;
    if (effect.kind === 'shield') return `GAIN ${effect.amount} SHIELD`;
    if (effect.kind === 'draw') return `DRAW ${effect.amount} ${effect.amount === 1 ? 'CARD' : 'CARDS'}`;
    return `GAIN ${effect.amount} ENERGY`;
  });
  if (definition.exhaust) lines.push('EXHAUST');
  return lines;
}

function drawDepartmentEmblem(
  ctx: CanvasRenderingContext2D,
  department: CardDepartment,
  x: number,
  y: number,
  color: string,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (department === 'weapons') {
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-22, 0);
    ctx.lineTo(-8, 0);
    ctx.moveTo(8, 0);
    ctx.lineTo(22, 0);
    ctx.moveTo(0, -22);
    ctx.lineTo(0, -8);
    ctx.moveTo(0, 8);
    ctx.lineTo(0, 22);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (department === 'engineering') {
    ctx.beginPath();
    for (let index = 0; index < 32; index++) {
      const angle = -Math.PI / 2 + index * Math.PI / 16;
      const radius = index % 4 === 1 || index % 4 === 2 ? 21 : 15;
      const px = Math.cos(angle) * radius;
      const py = Math.sin(angle) * radius;
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 12, -Math.PI / 2, 0);
    ctx.stroke();
    line(ctx, [0, 0, 14, -14], color, 4);
    ctx.beginPath();
    ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(12, 8, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function ellipsizeText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const suffix = '…';
  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (ctx.measureText(`${text.slice(0, middle)}${suffix}`).width <= maxWidth) low = middle;
    else high = middle - 1;
  }
  return `${text.slice(0, low).trimEnd()}${suffix}`;
}

function fittedTitle(ctx: CanvasRenderingContext2D, title: string): string {
  let size = 66;
  while (size > 38) {
    ctx.font = `900 ${size}px "Bebas Neue", ${FONT}`;
    if (ctx.measureText(title).width <= 530) return title;
    size -= 2;
  }
  ctx.font = `900 38px "Bebas Neue", ${FONT}`;
  return ellipsizeText(ctx, title, 530);
}

function fittedFlavor(ctx: CanvasRenderingContext2D, flavor: string): string {
  let size = 26;
  while (size > 20) {
    ctx.font = `italic 700 ${size}px ${FONT}`;
    if (ctx.measureText(flavor).width <= 610) return flavor;
    size -= 1;
  }
  ctx.font = `italic 700 20px ${FONT}`;
  return ellipsizeText(ctx, flavor, 610);
}

export function drawShipCardFace(definition: ShipCardDefinition, dimmed = false): HTMLCanvasElement {
  const [canvas, ctx] = surface(760, 1080);
  ctx.beginPath();
  ctx.roundRect(0, 0, 760, 1080, 46);
  ctx.clip();
  const identity = cardIdentity(definition);
  const style = rarityStyle(identity.rarity);
  const accent = style.accent;

  // Flat stock and restrained rarity keylines follow the cutout kit without its former hatch overlay.
  ctx.fillStyle = CARD_PALETTE.stock;
  ctx.fillRect(0, 0, 760, 1080);
  ctx.fillStyle = CARD_PALETTE.face;
  ctx.fillRect(30, 150, 700, 880);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 760, 150);
  ctx.fillStyle = CARD_PALETTE.bodyInk;
  ctx.fillRect(0, 142, 760, 8);

  ctx.strokeStyle = INK;
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.roundRect(10, 10, 740, 1060, 37);
  ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(29, 29, 702, 1022, 26);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(7,21,29,.28)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(38, 38, 684, 1004, 21);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = style.titleInk;
  const title = fittedTitle(ctx, definition.title.toUpperCase());
  ctx.fillText(title, 430, 79);
  roundRect(ctx, 34, 31, 108, 108, 54, CARD_PALETTE.titlePanel, INK, 9);
  ctx.fillStyle = INK;
  ctx.font = `900 74px "Bebas Neue", ${FONT}`;
  ctx.fillText(String(definition.cost), 88, 87);
  ctx.font = `800 18px ${FONT}`;
  ctx.fillText('ENERGY', 88, 126);

  actionIllustration(ctx, definition, accent);
  roundRect(ctx, 44, 678, 672, 292, 24, CARD_PALETTE.titlePanel, INK, 10);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(56, 690, 648, 268, 16);
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.fillRect(65, 704, 630, 7);
  const rules = effectText(definition);
  const rulesSize = rules.length >= 3 ? 46 : 55;
  const lineHeight = rules.length >= 4 ? 49 : rules.length === 3 ? 56 : 66;
  const startY = 798 - (rules.length - 1) * lineHeight / 2;
  ctx.fillStyle = CARD_PALETTE.bodyInk;
  ctx.font = `900 ${rulesSize}px "Bebas Neue", ${FONT}`;
  rules.forEach((rule, index) => ctx.fillText(rule, 380, startY + index * lineHeight));
  ctx.fillStyle = CARD_PALETTE.mutedInk;
  const flavor = fittedFlavor(ctx, definition.flavor);
  ctx.fillText(flavor, 380, 938);

  roundRect(ctx, 44, 985, 672, 58, 14, CARD_PALETTE.footer, INK, 5);
  drawDepartmentEmblem(ctx, identity.department, 80, 1014, INK);
  ctx.textAlign = 'left';
  ctx.fillStyle = INK;
  ctx.font = `900 27px "Bebas Neue", ${FONT}`;
  ctx.fillText(DEPARTMENT_LABELS[identity.department].toUpperCase(), 112, 1015);
  ctx.textAlign = 'right';
  ctx.font = `900 25px "Bebas Neue", ${FONT}`;
  ctx.fillText(style.label.toUpperCase(), 686, 1015);
  if (dimmed) {
    ctx.fillStyle = 'rgba(3,10,14,.5)';
    ctx.fillRect(0, 0, 760, 1080);
  }
  return canvas;
}

type CardBackKind = 'card' | 'draw' | 'discard' | 'exhaust';

function drawTechnicalCardBack(kind: CardBackKind): HTMLCanvasElement {
  const [canvas, ctx] = surface(760, 1080);
  ctx.beginPath();
  ctx.roundRect(0, 0, 760, 1080, 46);
  ctx.clip();
  ctx.fillStyle = '#145b6b';
  ctx.fillRect(0, 0, 760, 1080);

  // Sparse circuit traces make this a technical object while preserving a solid teal read.
  ctx.strokeStyle = '#2f8490';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(116, 260);
  ctx.lineTo(248, 260);
  ctx.lineTo(304, 332);
  ctx.moveTo(644, 260);
  ctx.lineTo(512, 260);
  ctx.lineTo(456, 332);
  ctx.moveTo(116, 820);
  ctx.lineTo(248, 820);
  ctx.lineTo(304, 748);
  ctx.moveTo(644, 820);
  ctx.lineTo(512, 820);
  ctx.lineTo(456, 748);
  ctx.stroke();
  for (const [x, y] of [[116, 260], [644, 260], [116, 820], [644, 820]] as const) {
    ellipse(ctx, x, y, 13, 13, '#8ed8d2', '#082630', 5);
  }

  roundRect(ctx, 238, 330, 284, 420, 70, '#0d4959', '#79cbc6', 8);
  ctx.strokeStyle = '#2f8991';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(380, 540, 102, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(380, 540, 62, 0, Math.PI * 2);
  ctx.stroke();
  ellipse(ctx, 380, 540, 25, 25, '#8ed8d2', '#082630', 7);
  line(ctx, [380, 438, 380, 478], '#8ed8d2', 7);
  line(ctx, [380, 602, 380, 642], '#8ed8d2', 7);
  line(ctx, [278, 540, 318, 540], '#8ed8d2', 7);
  line(ctx, [442, 540, 482, 540], '#8ed8d2', 7);

  // Pile variants use compact symbols rather than labels or additional card outlines.
  if (kind === 'draw') {
    line(ctx, [332, 900, 380, 866, 428, 900], '#a6ebe0', 10);
    line(ctx, [332, 934, 380, 900, 428, 934], '#a6ebe0', 10);
  } else if (kind === 'discard') {
    line(ctx, [380, 858, 380, 926], '#efbd62', 10);
    line(ctx, [346, 900, 380, 934, 414, 900], '#efbd62', 10);
    line(ctx, [326, 948, 434, 948], '#efbd62', 10);
  } else if (kind === 'exhaust') {
    line(ctx, [346, 876, 414, 944], '#ee725b', 11);
    line(ctx, [414, 876, 346, 944], '#ee725b', 11);
    ellipse(ctx, 380, 910, 52, 52, 'rgba(0,0,0,0)', '#ee725b', 5);
  }

  ctx.strokeStyle = '#061820';
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.roundRect(10, 10, 740, 1060, 37);
  ctx.stroke();
  ctx.strokeStyle = '#79cbc6';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(31, 31, 698, 1018, 27);
  ctx.stroke();
  return canvas;
}

export function drawShipCardBack(): HTMLCanvasElement {
  return drawTechnicalCardBack('card');
}

export function drawPileTop(kind: 'draw' | 'discard' | 'exhaust'): HTMLCanvasElement {
  return drawTechnicalCardBack(kind);
}

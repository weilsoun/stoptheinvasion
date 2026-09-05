import type { ActorId, CardDefinition } from '../game/types';

const INK = '#07191c';
const PAPER = '#f3dfb3';

function canvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const surface = document.createElement('canvas');
  surface.width = width;
  surface.height = height;
  const context = surface.getContext('2d');
  if (!context) throw new Error('Canvas 2D is required for procedural scene art.');
  context.imageSmoothingEnabled = true;
  return [surface, context];
}

function polygon(ctx: CanvasRenderingContext2D, points: number[], fill: string, stroke = INK, width = 12): void {
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (width) {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string, stroke = INK, width = 12): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (width) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

function line(ctx: CanvasRenderingContext2D, points: number[], color = INK, width = 12): void {
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function halftone(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, color: string, spacing: number): void {
  ctx.save();
  ctx.fillStyle = color;
  for (let py = y; py < y + height; py += spacing) {
    for (let px = x + ((py / spacing) % 2) * spacing * 0.5; px < x + width; px += spacing) {
      ctx.beginPath();
      ctx.arc(px, py, Math.max(1.5, spacing * 0.1), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function drawArenaArt(): HTMLCanvasElement {
  const [surface, ctx] = canvas(1920, 1080);
  const gradient = ctx.createLinearGradient(0, 0, 0, 1080);
  gradient.addColorStop(0, '#071c22');
  gradient.addColorStop(0.6, '#0b3335');
  gradient.addColorStop(1, '#071517');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1920, 1080);

  ctx.fillStyle = '#092a2d';
  ctx.fillRect(0, 126, 1920, 494);
  halftone(ctx, 0, 126, 1920, 494, 'rgba(80,196,168,.12)', 22);

  // Receding fluorescent ceiling and aisle perspective.
  polygon(ctx, [0, 126, 1920, 126, 1710, 250, 210, 250], '#102c2f', '#183f40', 6);
  for (const x of [265, 640, 1015, 1390, 1765]) {
    polygon(ctx, [x - 105, 150, x + 105, 150, x + 73, 183, x - 73, 183], '#ffd477', '#472c18', 7);
    ctx.fillStyle = 'rgba(255,205,92,.13)';
    ctx.beginPath();
    ctx.moveTo(x - 90, 184);
    ctx.lineTo(x + 90, 184);
    ctx.lineTo(x + 205, 600);
    ctx.lineTo(x - 205, 600);
    ctx.closePath();
    ctx.fill();
  }

  // MOREMART back-wall sign, kept above actor/HUD label space.
  polygon(ctx, [650, 34, 1270, 34, 1232, 119, 688, 119], '#de5d2c', '#050f11', 10);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 62px Impact, Haettenschweiler, sans-serif';
  ctx.fillStyle = '#fff0bd';
  ctx.strokeStyle = '#07191c';
  ctx.lineWidth = 10;
  ctx.strokeText('MOREMART', 960, 76);
  ctx.fillText('MOREMART', 960, 76);
  ctx.font = '800 18px Arial, sans-serif';
  ctx.fillStyle = '#35170e';
  ctx.fillText('SAVE LESS. SURVIVE MORE.', 960, 108);

  // Shelf bays frame the actors without painting over the fight silhouettes.
  for (const side of [0, 1645]) {
    ctx.fillStyle = '#102024';
    ctx.fillRect(side, 242, 275, 378);
    for (let shelf = 0; shelf < 4; shelf++) {
      const sy = 290 + shelf * 92;
      ctx.fillStyle = '#41615c';
      ctx.fillRect(side, sy, 275, 16);
      for (let item = 0; item < 5; item++) {
        const colors = ['#d87535', '#8db54f', '#d9b858', '#466e72'];
        ctx.fillStyle = colors[(shelf + item) % colors.length];
        ctx.fillRect(side + 18 + item * 52, sy - 48 - (item % 2) * 10, 34, 48 + (item % 2) * 10);
        ctx.strokeStyle = '#07191c';
        ctx.lineWidth = 5;
        ctx.strokeRect(side + 18 + item * 52, sy - 48 - (item % 2) * 10, 34, 48 + (item % 2) * 10);
      }
    }
  }

  // Floor depth, scuffs, lane divider, and reserved timeline/hand beds.
  polygon(ctx, [0, 600, 1920, 600, 1920, 1080, 0, 1080], '#173638', '#07191c', 10);
  for (let x = -300; x < 2300; x += 220) line(ctx, [960, 602, x, 1080], 'rgba(93,143,129,.22)', 5);
  for (let y = 650; y < 1080; y += 86) line(ctx, [0, y, 1920, y], 'rgba(93,143,129,.16)', 4);
  ctx.fillStyle = 'rgba(3,14,16,.66)';
  ctx.fillRect(120, 620, 1680, 146);
  ctx.fillStyle = 'rgba(3,14,16,.58)';
  ctx.fillRect(48, 790, 1824, 265);
  line(ctx, [120, 620, 1800, 620], '#9e783d', 6);
  line(ctx, [48, 790, 1872, 790], '#315c55', 6);

  // Acidic infection trail points toward the guard.
  ctx.fillStyle = 'rgba(112,211,45,.34)';
  for (const [x, y, rx, ry] of [[325, 610, 92, 18], [230, 656, 44, 12], [470, 672, 28, 10]] as const) ellipse(ctx, 1920 - x, y, rx, ry, ctx.fillStyle as string, '#25411d', 5);

  // Foreground safety tape is an intentional lower-frame accent behind cards.
  ctx.save();
  ctx.translate(1660, 1020);
  ctx.rotate(-0.08);
  ctx.fillStyle = '#e4b534';
  ctx.fillRect(-300, -20, 620, 34);
  for (let x = -300; x < 320; x += 64) polygon(ctx, [x, -20, x + 30, -20, x + 2, 14, x - 28, 14], '#142326', '#142326', 1);
  ctx.restore();
  return surface;
}

function drawGuard(ctx: CanvasRenderingContext2D): void {
  // Right-facing infected uniformed guard: broad back left, face/nose to right.
  ellipse(ctx, 310, 625, 190, 34, 'rgba(0,0,0,.34)', 'transparent', 0);
  polygon(ctx, [190, 345, 382, 332, 448, 585, 139, 585], '#263d47');
  polygon(ctx, [175, 365, 226, 340, 255, 580, 140, 585], '#172a33');
  polygon(ctx, [374, 370, 442, 420, 528, 523, 478, 559, 376, 482], '#627a73');
  polygon(ctx, [176, 570, 270, 570, 248, 660, 128, 660], '#1a252d');
  polygon(ctx, [326, 566, 418, 566, 486, 657, 365, 657], '#1a252d');
  polygon(ctx, [120, 646, 254, 646, 248, 682, 103, 682], '#0c171b');
  polygon(ctx, [360, 644, 491, 644, 520, 681, 374, 681], '#0c171b');
  ellipse(ctx, 330, 250, 137, 127, '#78926d');
  polygon(ctx, [226, 211, 287, 134, 424, 168, 459, 217, 312, 215], '#172730');
  polygon(ctx, [222, 199, 427, 185, 470, 218, 240, 237], '#243d49');
  polygon(ctx, [433, 236, 535, 282, 438, 312], '#78926d');
  ellipse(ctx, 398, 242, 24, 30, '#d8ec81');
  ellipse(ctx, 407, 246, 8, 13, INK, INK, 0);
  line(ctx, [373, 208, 437, 218], INK, 16);
  polygon(ctx, [388, 319, 458, 318, 430, 351], '#172126', INK, 8);
  line(ctx, [402, 325, 418, 342, 434, 325], '#d3d7b4', 5);
  ctx.fillStyle = '#b9e829';
  for (const [x, y, r] of [[205, 276, 18], [456, 365, 13], [268, 384, 11]] as const) ellipse(ctx, x, y, r, r * .7, '#b9e829', '#29431b', 5);
  polygon(ctx, [272, 372, 359, 366, 352, 423, 280, 426], '#e6d4a4');
  ctx.font = '900 25px Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#18282b';
  ctx.save();
  ctx.translate(316, 401);
  ctx.scale(-1, 1);
  ctx.fillText('SECURITY', 0, 0);
  ctx.restore();
  // Radio antenna and dangling receipt roll.
  line(ctx, [181, 350, 143, 270], '#0b1417', 13);
  ellipse(ctx, 143, 263, 15, 15, '#a7dd31');
  polygon(ctx, [480, 534, 540, 529, 535, 628, 503, 609, 476, 637], PAPER, INK, 7);
}

function drawBob(ctx: CanvasRenderingContext2D): void {
  // Left-facing hardware worker: face/nose and defensive tool arm to left.
  ellipse(ctx, 330, 629, 192, 34, 'rgba(0,0,0,.34)', 'transparent', 0);
  polygon(ctx, [222, 337, 421, 349, 488, 590, 174, 590], '#df6d29');
  polygon(ctx, [263, 351, 307, 337, 318, 584, 236, 589], '#f49a34');
  polygon(ctx, [425, 375, 494, 400, 548, 518, 491, 540, 407, 466], '#d0a27d');
  polygon(ctx, [210, 575, 304, 575, 276, 664, 153, 664], '#33484d');
  polygon(ctx, [359, 575, 452, 575, 514, 663, 389, 663], '#33484d');
  polygon(ctx, [140, 650, 282, 650, 269, 686, 122, 686], '#172326');
  polygon(ctx, [385, 647, 514, 647, 545, 681, 400, 686], '#172326');
  ellipse(ctx, 331, 242, 135, 125, '#d0a27d');
  polygon(ctx, [224, 186, 292, 132, 430, 171, 447, 215, 306, 197], '#e97a2d');
  polygon(ctx, [213, 188, 415, 183, 477, 218, 238, 224], '#f49a34');
  polygon(ctx, [224, 236, 126, 282, 226, 308], '#d0a27d');
  ellipse(ctx, 266, 238, 22, 29, '#f5e7c6');
  ellipse(ctx, 259, 242, 8, 12, INK, INK, 0);
  line(ctx, [296, 209, 237, 218], INK, 15);
  polygon(ctx, [227, 316, 295, 316, 274, 347], '#5b241d', INK, 8);
  line(ctx, [327, 330, 405, 315], '#7b482f', 12);
  line(ctx, [344, 343, 422, 328], '#7b482f', 9);
  polygon(ctx, [316, 374, 402, 376, 397, 423, 320, 421], '#f0dfb1');
  ctx.font = '900 27px Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#422317';
  ctx.fillText('BOB', 359, 403);
  // Oversized hammer held toward the infected guard.
  line(ctx, [218, 410, 111, 539], '#72503b', 25);
  polygon(ctx, [67, 496, 165, 453, 190, 508, 88, 550], '#59676a', INK, 11);
  polygon(ctx, [168, 454, 203, 443, 225, 496, 190, 508], '#879496', INK, 8);
  // Apron clutter and comic sweat bead.
  polygon(ctx, [327, 452, 405, 452, 410, 525, 326, 525], '#bd4e24', INK, 8);
  line(ctx, [346, 476, 346, 509, 383, 509, 383, 474], '#f6b64b', 7);
  polygon(ctx, [455, 249, 481, 284, 452, 301], '#72d2d0', '#14282b', 6);
}

export function drawActorArt(actor: ActorId): HTMLCanvasElement {
  const [surface, ctx] = canvas(640, 720);
  ctx.translate(640, 0);
  ctx.scale(-1, 1);
  if (actor === 'guard') drawGuard(ctx);
  else drawBob(ctx);
  return surface;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines = 4): number {
  const words = text.split(/\s+/);
  let lineText = '';
  let lineNumber = 0;
  for (const word of words) {
    const candidate = lineText ? `${lineText} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && lineText) {
      ctx.fillText(lineText, x, y + lineNumber * lineHeight);
      lineNumber++;
      lineText = word;
      if (lineNumber >= maxLines - 1) break;
    } else lineText = candidate;
  }
  ctx.fillText(lineText, x, y + lineNumber * lineHeight);
  return y + (lineNumber + 1) * lineHeight;
}

function drawIcon(ctx: CanvasRenderingContext2D, icon: CardDefinition['icon']): void {
  ctx.save();
  ctx.translate(256, 295);
  ctx.rotate(-0.12);
  if (icon === 'hammer') {
    line(ctx, [-80, 95, 65, -75], '#8b5830', 34);
    polygon(ctx, [-68, -95, 104, -95, 124, -27, -56, -15], '#99a5a0', INK, 16);
  } else if (icon === 'shield') {
    polygon(ctx, [0, -116, 103, -77, 86, 57, 0, 126, -86, 57, -103, -77], '#ef8c32', INK, 17);
    line(ctx, [0, -82, 0, 83], '#ffe199', 15);
  } else if (icon === 'tape') {
    ellipse(ctx, 0, 0, 112, 94, '#e5ba38', INK, 17);
    ellipse(ctx, 0, 0, 44, 36, '#26383a', INK, 12);
    polygon(ctx, [69, 61, 151, 88, 128, 125, 51, 85], '#e5ba38', INK, 12);
  } else if (icon === 'coffee') {
    polygon(ctx, [-75, -65, 62, -65, 48, 90, -62, 90], '#f1e1b4', INK, 16);
    line(ctx, [60, -27, 113, -14, 105, 52, 53, 58], INK, 16);
    line(ctx, [-35, -96, -51, -134, -28, -166], '#d7efe4', 12);
    line(ctx, [9, -96, -1, -139, 24, -171], '#d7efe4', 12);
  } else if (icon === 'toolbox') {
    polygon(ctx, [-132, -42, 132, -42, 117, 101, -117, 101], '#d65729', INK, 17);
    line(ctx, [-54, -48, -41, -105, 42, -105, 56, -48], INK, 19);
    polygon(ctx, [-27, 8, 27, 8, 27, 43, -27, 43], '#efc54d', INK, 9);
  } else {
    polygon(ctx, [-108, -85, -4, -62, 52, 25, 132, 57, 102, 116, 0, 94, -47, 36, -126, 7], '#9a6a3c', INK, 17);
    line(ctx, [-48, -42, 51, 26], '#e4c48b', 16);
  }
  ctx.restore();
}

function outgoingDamage(card: CardDefinition, modifier = 0): number {
  let damage = 0;
  for (const effect of card.effects) {
    if (effect.kind === 'damage') damage += Math.max(0, effect.amount + modifier);
  }
  return damage;
}

export function drawCardArt(card: CardDefinition, locked: boolean, damageModifier: number): HTMLCanvasElement {
  const [surface, ctx] = canvas(512, 768);
  const palette = locked
    ? { accent: '#b51f2e', dark: '#26090d', glow: '#ff625c' }
    : card.type === 'attack'
      ? { accent: '#d85a2b', dark: '#3a1715', glow: '#ff9a45' }
      : card.type === 'skill'
        ? { accent: '#2e9388', dark: '#0c3435', glow: '#79d7b2' }
        : { accent: '#927032', dark: '#332816', glow: '#eed36f' };
  const baseDamage = outgoingDamage(card);
  const effectiveDamage = outgoingDamage(card, damageModifier);
  ctx.fillStyle = '#080f11';
  ctx.fillRect(0, 0, 512, 768);
  polygon(ctx, [18, 18, 494, 18, 494, 750, 18, 750], PAPER, '#03090a', 18);
  const wash = ctx.createLinearGradient(0, 0, 512, 768);
  wash.addColorStop(0, palette.accent);
  wash.addColorStop(.42, locked ? '#c66a61' : '#ead39f');
  wash.addColorStop(1, palette.dark);
  ctx.fillStyle = wash;
  ctx.fillRect(34, 34, 444, 700);
  halftone(ctx, 34, 34, 444, 700, 'rgba(4,16,18,.18)', 18);
  polygon(ctx, [45, 48, 467, 48, 445, 154, 66, 154], '#f4e2b6', INK, 11);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 37px Impact, Haettenschweiler, sans-serif';
  ctx.fillStyle = palette.dark;
  wrapText(ctx, card.name.toUpperCase(), 256, 82, locked ? 390 : 330, 37, 2);
  if (!locked) {
    ellipse(ctx, 73, 91, 50, 50, palette.glow, INK, 12);
    ctx.font = '900 50px Impact, sans-serif';
    ctx.fillStyle = INK;
    ctx.fillText(String(card.cost), 73, 95);
  }
  polygon(ctx, [58, 170, 454, 170, 468, 438, 44, 438], locked ? '#3b0c13' : '#193638', INK, 12);
  ctx.save();
  ctx.beginPath();
  ctx.rect(54, 180, 404, 248);
  ctx.clip();
  drawIcon(ctx, card.icon);
  ctx.restore();
  ctx.font = `900 ${card.modifier ? 18 : 22}px Arial, sans-serif`;
  ctx.fillStyle = '#f4deaa';
  ctx.fillText(card.modifier ? 'ATTACHMENT • NO TIMELINE SLOT' : locked ? 'LOCKED • ENEMY INTENT' : card.type.toUpperCase(), 256, 462);
  polygon(ctx, [53, 480, 459, 480, 449, 602, 63, 602], '#f4e4bd', INK, 10);
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#132527';
  if (card.modifier) {
    const modifier = card.modifier.damage;
    ctx.font = '900 29px Impact, Haettenschweiler, sans-serif';
    ctx.fillStyle = modifier > 0 ? '#16654e' : '#a5202d';
    ctx.fillText(`${modifier > 0 ? '+' : '−'}${Math.abs(modifier)} ATTACK DAMAGE`, 256, 493);
    ctx.font = '900 15px Arial, sans-serif';
    ctx.fillStyle = '#526062';
    ctx.fillText(`ATTACH TO ${card.target === 'self' ? 'FRIENDLY' : 'ENEMY'} ATTACK`, 256, 534);
    ctx.font = '700 19px Arial, sans-serif';
    ctx.fillStyle = '#132527';
    wrapText(ctx, card.description, 256, 558, 342, 24, 2);
  } else if (damageModifier !== 0 && baseDamage > 0) {
    ctx.font = '900 27px Impact, Haettenschweiler, sans-serif';
    ctx.fillText(`ATTACK DAMAGE  ${baseDamage} → ${effectiveDamage}`, 256, 492);
    ctx.font = '900 19px Arial, sans-serif';
    ctx.fillStyle = damageModifier > 0 ? '#16654e' : '#a5202d';
    ctx.fillText(`${damageModifier > 0 ? '+' : '−'}${Math.abs(damageModifier)} MODIFIER`, 256, 527);
    ctx.font = '900 12px Arial, sans-serif';
    ctx.fillStyle = '#526062';
    ctx.fillText('BASE RULE', 256, 549);
    ctx.font = '700 16px Arial, sans-serif';
    ctx.fillStyle = '#132527';
    wrapText(ctx, card.description, 256, 564, 342, 18, 2);
  } else {
    ctx.font = '700 24px Arial, sans-serif';
    wrapText(ctx, card.description, 256, 502, 342, 31, 3);
  }
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'italic 600 18px Georgia, serif';
  ctx.fillStyle = '#f3d694';
  ctx.fillText(`“${card.flavor}”`, 256, 626, 400);
  if (locked) {
    ctx.save();
    ctx.translate(256, 685);
    ctx.rotate(-.035);
    ctx.strokeStyle = '#ffaaa2';
    ctx.lineWidth = 6;
    ctx.strokeRect(-176, -28, 352, 56);
    ctx.font = '900 27px Impact, sans-serif';
    ctx.fillStyle = '#ffaaa2';
    ctx.fillText('LOCKED  //  INTENT', 0, 2);
    ctx.restore();
  } else {
    polygon(ctx, [52, 647, 460, 647, 450, 720, 62, 720], '#10292b', INK, 9);
    ctx.font = `900 ${card.modifier ? 16 : 21}px Arial, sans-serif`;
    ctx.fillStyle = palette.glow;
    ctx.fillText(card.modifier ? card.target === 'self' ? 'FRIENDLY' : 'ENEMY' : card.target === 'self' ? 'SELF' : 'TARGET', 112, 687);
    ctx.strokeStyle = 'rgba(244,226,182,.42)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(169, 661);
    ctx.lineTo(169, 706);
    ctx.stroke();
  }
  ctx.strokeStyle = palette.glow;
  ctx.lineWidth = 5;
  ctx.strokeRect(27, 27, 458, 714);
  return surface;
}

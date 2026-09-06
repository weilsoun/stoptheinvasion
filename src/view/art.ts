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


const CARD_ART_URLS: Record<string, string> = {
  hammer: new URL('../assets/cards/hammer.png', import.meta.url).href,
  vest: new URL('../assets/cards/vest.png', import.meta.url).href,
  tape: new URL('../assets/cards/tape.png', import.meta.url).href,
  heavy: new URL('../assets/cards/heavy.png', import.meta.url).href,
  coffee: new URL('../assets/cards/coffee.png', import.meta.url).href,
  toolbox: new URL('../assets/cards/toolbox.png', import.meta.url).href,
  brace: new URL('../assets/cards/brace.png', import.meta.url).href,
  weaken: new URL('../assets/cards/weaken.png', import.meta.url).href,
  reinforce: new URL('../assets/cards/reinforce.png', import.meta.url).href,
  enemy: new URL('../assets/cards/enemy.png', import.meta.url).href,
  'enemy-heal': new URL('../assets/cards/enemy-heal.png', import.meta.url).href,
  'enemy-expose': new URL('../assets/cards/enemy-expose.png', import.meta.url).href,
};
const cardImages: Partial<Record<string, HTMLImageElement>> = {};
let cardArtLoad: Promise<void> | undefined;

export function preloadCardArt(): Promise<void> {
  cardArtLoad ??= Promise.all(Object.entries(CARD_ART_URLS).map(([id, url]) => new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      cardImages[id] = image;
      resolve();
    };
    image.onerror = () => reject(new Error(`Could not load card illustration: ${id}`));
    image.src = url;
  }))).then(() => undefined);
  return cardArtLoad;
}

function drawCardIllustration(
  ctx: CanvasRenderingContext2D,
  artId: string,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const image = cardImages[artId];
  if (!image) throw new Error(`Card illustration was not preloaded: ${artId}`);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 14);
  ctx.clip();
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  ctx.drawImage(
    image,
    (image.naturalWidth - sourceWidth) / 2,
    (image.naturalHeight - sourceHeight) / 2,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
  );
  const shade = ctx.createLinearGradient(0, y, 0, y + height);
  shade.addColorStop(0, 'rgba(4,13,15,.04)');
  shade.addColorStop(.72, 'rgba(4,13,15,0)');
  shade.addColorStop(1, 'rgba(4,13,15,.34)');
  ctx.fillStyle = shade;
  ctx.fillRect(x, y, width, height);
  ctx.restore();
}

function outgoingDamage(card: CardDefinition, modifier = 0): number {
  let damage = 0;
  for (const effect of card.effects) {
    if (effect.kind === 'damage') damage += Math.max(0, effect.amount + modifier);
  }
  return damage;
}

function secondaryRules(card: CardDefinition): string[] {
  return card.effects.flatMap((effect) => {
    if (effect.kind === 'damage') return [];
    if (effect.kind === 'block') return [`Gain ${effect.amount} Block this turn.`];
    if (effect.kind === 'exposed') return [`Apply ${effect.amount} Exposed.`];
    if (effect.kind === 'heal') return [`Restore ${effect.amount} health.`];
    if (effect.kind === 'energy') return [`Bank ${effect.amount} energy for next turn.`];
    return [`Draw ${effect.amount} card${effect.amount === 1 ? '' : 's'}.`];
  });
}
function grayscale(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const image = ctx.getImageData(0, 0, width, height);
  for (let index = 0; index < image.data.length; index += 4) {
    const luminance = Math.round(
      image.data[index] * .299 + image.data[index + 1] * .587 + image.data[index + 2] * .114,
    );
    image.data[index] = luminance;
    image.data[index + 1] = luminance;
    image.data[index + 2] = luminance;
  }
  ctx.putImageData(image, 0, 0);
}


export function drawCardBack(): HTMLCanvasElement {
  const [surface, ctx] = canvas(512, 768);
  ctx.beginPath();
  ctx.roundRect(0, 0, 512, 768, 38);
  ctx.clip();
  ctx.fillStyle = '#07191c';
  ctx.fillRect(0, 0, 512, 768);

  ctx.fillStyle = '#123d3c';
  ctx.beginPath();
  ctx.roundRect(22, 22, 468, 724, 24);
  ctx.fill();
  ctx.strokeStyle = '#e56532';
  ctx.lineWidth = 10;
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(42, 42, 428, 684, 15);
  ctx.clip();
  ctx.fillStyle = '#0b2b2e';
  ctx.fillRect(42, 42, 428, 684);
  ctx.strokeStyle = 'rgba(239,191,104,.26)';
  ctx.lineWidth = 18;
  for (let offset = -650; offset < 900; offset += 68) {
    ctx.beginPath();
    ctx.moveTo(offset, 42);
    ctx.lineTo(offset + 470, 726);
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = '#e56532';
  ctx.beginPath();
  ctx.roundRect(106, 247, 300, 274, 28);
  ctx.fill();
  ctx.strokeStyle = '#f0c875';
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.fillStyle = '#092427';
  ctx.beginPath();
  ctx.roundRect(132, 273, 248, 222, 18);
  ctx.fill();

  ctx.strokeStyle = '#f0c875';
  ctx.lineWidth = 22;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(176, 432);
  ctx.lineTo(336, 336);
  ctx.moveTo(176, 336);
  ctx.lineTo(336, 432);
  ctx.stroke();
  ctx.fillStyle = '#f0c875';
  ctx.beginPath();
  ctx.arc(176, 336, 24, 0, Math.PI * 2);
  ctx.arc(336, 336, 24, 0, Math.PI * 2);
  ctx.fill();
  return surface;
}

export function drawCardArt(
  card: CardDefinition,
  locked: boolean,
  damageModifier: number,
  showTargets: boolean,
  dimmed: boolean,
): HTMLCanvasElement {
  const [surface, ctx] = canvas(512, 768);
  const palette = locked
    ? { accent: '#c74736', dark: '#eddbb8', glow: '#ff9c68', paper: '#101e24' }
    : card.type === 'attack'
      ? { accent: '#d95d2c', dark: '#331719', glow: '#ffad55', paper: '#f3dfb8' }
      : card.type === 'skill'
        ? { accent: '#278f83', dark: '#0b3031', glow: '#7de2bd', paper: '#e9dfb9' }
        : { accent: '#a27a2e', dark: '#302515', glow: '#f3d56b', paper: '#eee0b7' };
  const baseDamage = outgoingDamage(card);
  const effectiveDamage = outgoingDamage(card, damageModifier);
  const modifier = card.modifier?.damage;
  const illustration = locked
    ? card.effects.some((effect) => effect.kind === 'heal')
      ? 'enemy-heal'
      : card.effects.some((effect) => effect.kind === 'exposed')
        ? 'enemy-expose'
        : 'enemy'
    : card.id;
  const border = locked ? '#eddbb8' : '#07191c';

  ctx.beginPath();
  ctx.roundRect(0, 0, 512, 768, 38);
  ctx.clip();
  ctx.fillStyle = border;
  ctx.fillRect(0, 0, 512, 768);
  ctx.fillStyle = palette.paper;
  ctx.beginPath();
  ctx.roundRect(14, 14, 484, 740, 28);
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = 10;
  ctx.stroke();

  // Attachments expose only this top section while tucked under their host.
  ctx.fillStyle = modifier === undefined ? palette.dark : modifier > 0 ? '#08715a' : '#a92238';
  ctx.beginPath();
  ctx.roundRect(28, 28, 456, 124, 16);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (modifier !== undefined) {
    ctx.fillStyle = palette.paper;
    ctx.beginPath();
    ctx.arc(70, 60, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#14282a';
    ctx.font = '900 31px Impact, "Arial Black", sans-serif';
    ctx.fillText(String(card.cost), 70, 62);
    ctx.fillStyle = '#fff0c9';
    ctx.font = '900 39px Impact, "Arial Black", sans-serif';
    ctx.fillText(`${modifier > 0 ? '+' : '−'}${Math.abs(modifier)} DAMAGE`, 282, 60);
    ctx.font = '900 31px Impact, "Arial Narrow", sans-serif';
    wrapText(ctx, card.name.toUpperCase(), 256, 99, 408, 31, 2);
  } else {
    if (!locked) {
      ctx.fillStyle = palette.glow;
      ctx.beginPath();
      ctx.arc(72, 90, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#07191c';
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.fillStyle = '#07191c';
      ctx.font = '900 42px Impact, "Arial Black", sans-serif';
      ctx.fillText(String(card.cost), 72, 92);
    }
    ctx.fillStyle = locked ? '#101e24' : '#fff0ce';
    ctx.font = '900 35px Impact, "Arial Narrow", sans-serif';
    wrapText(ctx, card.name.toUpperCase(), locked ? 256 : 283, 62, locked ? 400 : 344, 39, 2);
  }

  drawCardIllustration(ctx, illustration, 36, 168, 440, 350);
  ctx.strokeStyle = border;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect(36, 168, 440, 350, 15);
  ctx.stroke();

  const panelFill = damageModifier > 0 && baseDamage > 0
    ? locked ? '#12362d' : '#cce8cf'
    : damageModifier < 0 && baseDamage > 0
      ? locked ? '#45212c' : '#f2cbc0'
      : locked ? '#18282d' : '#f7e9c7';
  ctx.fillStyle = panelFill;
  ctx.beginPath();
  ctx.roundRect(36, 536, 440, 180, 15);
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = 7;
  ctx.stroke();

  ctx.fillStyle = locked ? '#fff0ce' : '#14282a';
  ctx.textBaseline = 'top';
  if (modifier !== undefined) {
    ctx.font = '700 28px "Avenir Next", Arial, sans-serif';
    wrapText(ctx, card.description, 256, 566, 382, 36, 4);
  } else if (damageModifier !== 0 && baseDamage > 0) {
    const upgraded = damageModifier > 0;
    ctx.fillStyle = locked
      ? upgraded ? '#88e2aa' : '#ffa99b'
      : upgraded ? '#08715a' : '#a92238';
    ctx.font = '900 46px Impact, "Arial Black", sans-serif';
    ctx.fillText(`${effectiveDamage} DAMAGE`, 256, 546);
    ctx.font = '900 19px "Arial Narrow", Arial, sans-serif';
    ctx.fillText(
      `${baseDamage} BASE ${upgraded ? '+' : '−'} ${Math.abs(damageModifier)} ${upgraded ? 'UPGRADE' : 'DEBUFF'}`,
      256,
      600,
    );
    const rules = secondaryRules(card);
    if (rules.length > 0) {
      ctx.fillStyle = locked ? '#fff0ce' : '#23383a';
      ctx.font = '750 20px "Avenir Next", Arial, sans-serif';
      wrapText(ctx, rules.join(' '), 256, 641, 382, 27, 2);
    }
  } else {
    ctx.font = '750 23px "Avenir Next", Arial, sans-serif';
    wrapText(ctx, card.description, 256, 559, 382, 31, 4);
  }

  if (showTargets && !locked && modifier === undefined) {
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = palette.dark;
    ctx.font = '900 17px "Arial Narrow", Arial, sans-serif';
    ctx.fillText(card.target === 'self' ? 'SELF' : 'CHOOSE TARGET', 256, 697);
  }

  if (dimmed) grayscale(ctx, surface.width, surface.height);
  return surface;
}

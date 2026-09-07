import type { ActorId, CardDefinition, CardRarity } from '../game/types';

const INK = '#07191c';
const PAPER = '#f3dfb3';

const DEFAULT_CHARACTER_COLOR = '#e97a2d';
const RARITY_COLORS = {
  basic: '#aeb4b2',
  common: '#fffdf4',
  uncommon: '#55b95f',
  rare: '#f2c14e',
  epic: '#9556d8',
  legendary: '#f04f72',
} satisfies Record<CardRarity, string>;

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

  // Alien residue trail points toward the guard.
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
  // Right-facing alien-possessed guard: broad back left, face/nose to right.
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
  // Oversized hammer held toward the possessed guard.
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

function centeredText(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number,
  maxWidth: number, lineHeight: number, numberSize = 0,
  damageColor?: string,
): void {
  const baseFont = ctx.font;
  const baseColor = ctx.fillStyle;
  const numberFont = `900 ${numberSize}px "Arial Black", Arial, sans-serif`;
  const minusFont = `400 ${numberSize}px Arial, sans-serif`;
  ctx.font = minusFont;
  const minusWidth = numberSize > 0 ? ctx.measureText('−').width + numberSize * .12 : 0;
  ctx.font = baseFont;
  const gap = ctx.measureText(' ').width;
  const paragraphs = text.split('\n').map((paragraph) => paragraph.split(/\s+/).filter(Boolean).map((word, index, words) => {
    const numeric = numberSize > 0 && /^[+−-]?\d+[.,]?$/.test(word);
    const negative = numeric && /^[−-]/.test(word);
    if (negative) word = word.slice(1);
    ctx.font = numeric ? numberFont : baseFont;
    const metrics = ctx.measureText(word);
    const damage = numeric && damageColor !== undefined && /^damage\b/.test(words[index + 1] ?? '');
    return { word, numeric, negative, damage, metrics, width: metrics.width + (negative ? minusWidth : 0) };
  }));
  type TextWord = (typeof paragraphs)[number][number];
  type TextLine = { words: TextWord[]; width: number; ascent: number; descent: number };
  const lines: TextLine[] = [];
  for (const words of paragraphs) {
    let line: TextLine | undefined;
    for (const word of words) {
      if (!line || line.width + gap + word.width > maxWidth) {
        line = { words: [], width: 0, ascent: 0, descent: 0 };
        lines.push(line);
      }
      line.width += (line.words.length ? gap : 0) + word.width;
      line.ascent = Math.max(line.ascent, word.metrics.actualBoundingBoxAscent);
      line.descent = Math.max(line.descent, word.metrics.actualBoundingBoxDescent);
      line.words.push(word);
    }
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const firstBaseline = y - ((lines.length - 1) * lineHeight + lines[0].ascent + lines.at(-1)!.descent) / 2 + lines[0].ascent;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    let left = x - line.width / 2;
    for (const word of line.words) {
      ctx.fillStyle = word.damage ? damageColor! : baseColor;
      if (word.negative) {
        ctx.font = minusFont;
        ctx.fillText('−', left, firstBaseline + index * lineHeight);
        left += minusWidth;
      }
      ctx.font = word.numeric ? numberFont : baseFont;
      if (word.numeric) {
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 1.5;
        ctx.strokeText(word.word, left, firstBaseline + index * lineHeight);
      }
      ctx.fillText(word.word, left, firstBaseline + index * lineHeight);
      left += word.metrics.width + gap;
    }
  }
  ctx.font = baseFont;
  ctx.fillStyle = baseColor;
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
  'back-bob': new URL('../assets/cards/back-bob.png', import.meta.url).href,
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

function fillPlayerCardBody(
  ctx: CanvasRenderingContext2D,
  characterColor: string,
  rarity: CardRarity,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(14, 14, 484, 740, 28);
  ctx.clip();
  const gradient = ctx.createLinearGradient(0, 14, 0, 754);
  gradient.addColorStop(0, characterColor);
  gradient.addColorStop(.32, characterColor);
  gradient.addColorStop(1, RARITY_COLORS[rarity]);
  ctx.fillStyle = gradient;
  ctx.fillRect(14, 14, 484, 740);

  if (rarity === 'legendary') {
    const dyes: [number, number, number, string][] = [
      [118, 516, 205, 'rgba(255,224,67,.92)'],
      [400, 493, 220, 'rgba(45,202,255,.9)'],
      [172, 690, 230, 'rgba(115,232,91,.9)'],
      [404, 704, 235, 'rgba(153,72,234,.9)'],
      [286, 597, 155, 'rgba(255,75,101,.84)'],
    ];
    for (const [x, y, radius, color] of dyes) {
      const dye = ctx.createRadialGradient(x, y, 0, x, y, radius);
      dye.addColorStop(0, color);
      dye.addColorStop(.62, color.replace(/[\d.]+\)$/, '0.48)'));
      dye.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = dye;
      ctx.fillRect(14, 300, 484, 454);
    }
  }
  ctx.restore();
}


export function drawCardBack(enemy = false): HTMLCanvasElement {
  const [surface, ctx] = canvas(512, 768);
  ctx.beginPath();
  ctx.roundRect(0, 0, 512, 768, 38);
  ctx.clip();

  if (!enemy) {
    const image = cardImages['back-bob'];
    if (!image) throw new Error('Builder card back was not preloaded');
    ctx.drawImage(image, 0, 0, 512, 768);
    return surface;
  }

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

export function drawEnergyBadge(cost: number, dimmed: boolean): HTMLCanvasElement {
  const [surface, ctx] = canvas(128, 128);
  ctx.fillStyle = dimmed ? '#c6c6c6' : '#ffcf74';
  ctx.strokeStyle = '#07191c';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(64, 64, 57, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#07191c';
  ctx.font = '900 78px "Arial Black", Arial, sans-serif';
  centeredText(ctx, String(cost), 64, 64, 110, 80);
  if (dimmed) grayscale(ctx, 128, 128);
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
    ? { dark: '#762d29', paper: '#000000' }
    : card.type === 'attack'
      ? { dark: '#331719', paper: '#f3dfb8' }
      : card.type === 'skill'
        ? { dark: '#0b3031', paper: '#e9dfb9' }
        : { dark: '#302515', paper: '#eee0b7' };
  const modifier = card.modifier?.damage;
  const illustration = locked
    ? card.effects.some((effect) => effect.kind === 'heal')
      ? 'enemy-heal'
      : card.effects.some((effect) => effect.kind === 'exposed')
        ? 'enemy-expose'
        : 'enemy'
    : card.art ?? card.id;
  const characterColor = card.characterColor ?? DEFAULT_CHARACTER_COLOR;
  const rarity = card.rarity ?? 'common';
  const outline = locked ? '#a3a18d' : INK;

  ctx.beginPath();
  ctx.roundRect(0, 0, 512, 768, 38);
  ctx.clip();
  ctx.fillStyle = locked ? '#000000' : characterColor;
  ctx.fillRect(0, 0, 512, 768);
  if (locked) {
    ctx.fillStyle = palette.paper;
    ctx.beginPath();
    ctx.roundRect(14, 14, 484, 740, 28);
    ctx.fill();
  } else {
    fillPlayerCardBody(ctx, characterColor, rarity);
  }
  ctx.strokeStyle = outline;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.roundRect(14, 14, 484, 740, 28);
  ctx.stroke();

  // Keep attachment titles legible while tucked behind their hosts.
  ctx.fillStyle = modifier === undefined ? palette.dark : modifier > 0 ? '#08715a' : '#a92238';
  ctx.beginPath();
  ctx.roundRect(28, 28, 456, 124, 16);
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 7;
  ctx.stroke();

  ctx.fillStyle = '#fff0ce';
  ctx.font = '800 44px Arial, sans-serif';
  centeredText(ctx, card.name.toUpperCase(), 256, 90, 408, 48);

  drawCardIllustration(ctx, illustration, 36, 168, 440, 350);
  ctx.strokeStyle = outline;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect(36, 168, 440, 350, 15);
  ctx.stroke();

  ctx.fillStyle = locked ? '#182125' : 'rgba(255,248,226,.86)';
  ctx.beginPath();
  ctx.roundRect(36, 536, 440, 180, 15);
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.stroke();

  ctx.fillStyle = locked ? '#fff0ce' : '#14282a';
  const modified = damageModifier !== 0 && card.effects.some((effect) => effect.kind === 'damage');
  const description = modified
    ? card.description.replace(/\b(\d+)(?= damage\b)/g, (_, amount: string) => String(Math.max(0, Number(amount) + damageModifier)))
    : card.description;
  const damageColor = !modified ? undefined : locked
    ? damageModifier > 0 ? '#88e2aa' : '#ffa99b'
    : damageModifier > 0 ? '#08715a' : '#a92238';
  const [primaryRule, ...secondaryActions] = description.split('\n');
  ctx.font = '600 34px Arial, sans-serif';
  centeredText(ctx, primaryRule, 256, secondaryActions.length ? (showTargets ? 581 : 594) : (showTargets ? 611 : 626), 390, 42, 34, damageColor);
  if (secondaryActions.length > 0) {
    ctx.fillStyle = locked ? '#ffbf70' : '#9d352b';
    ctx.font = '800 28px Arial, sans-serif';
    centeredText(ctx, secondaryActions.join('\n'), 256, showTargets ? 651 : 664, 390, 34, 28, damageColor);
  }

  if (showTargets && !locked && modifier === undefined) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = palette.dark;
    ctx.font = '900 17px "Arial Narrow", Arial, sans-serif';
    ctx.fillText(card.target === 'self' ? 'SELF' : 'CHOOSE TARGET', 256, 697);
  }

  if (dimmed) grayscale(ctx, surface.width, surface.height);
  return surface;
}

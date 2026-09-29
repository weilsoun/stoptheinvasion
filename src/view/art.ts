import type { CardDefinition, CardRarity } from '../game/types';
import { applyForecast, type CardForecast } from '../game/forecast';
import { matchCardTerms } from '../game/terms';
import { applyUpgrade } from '../game/upgrades';
import type { CardTermRegion } from './types';

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
  if (!context) throw new Error('Canvas 2D is required for card art.');
  context.imageSmoothingEnabled = true;
  return [surface, context];
}

function polygon(ctx: CanvasRenderingContext2D, points: number[], fill: string | CanvasGradient, stroke = INK, width = 12): void {
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


function centeredText(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number,
  maxWidth: number, lineHeight: number, numberSize = 0,
  numberColors?: readonly [increase: string, decrease: string],
  originalText?: string,
  regions?: CardTermRegion[],
): void {
  const baseFont = ctx.font;
  const baseColor = ctx.fillStyle;
  const numberFont = `900 ${numberSize}px "Arial Black", Arial, sans-serif`;
  const minusFont = `400 ${numberSize}px Arial, sans-serif`;
  ctx.font = minusFont;
  const minusWidth = numberSize > 0 ? ctx.measureText('−').width + numberSize * .12 : 0;
  ctx.font = baseFont;
  const gap = ctx.measureText(' ').width;
  const originalNumbers = originalText
    ? [...originalText.matchAll(/[+−-]?\d+/g)].map((match) => Number(match[0].replace('−', '-')))
    : [];
  let numberIndex = 0;
  const terms = matchCardTerms(text);
  let paragraphStart = 0;
  const paragraphs = text.split('\n').map((paragraph) => {
    const words = [...paragraph.matchAll(/\S+/g)].map((token) => {
      let word = token[0];
      const start = paragraphStart + token.index;
      const numeric = numberSize > 0 && /^[+−-]?\d+[.,]?$/.test(word);
      const negative = numeric && /^[−-]/.test(word);
      const value = numeric ? Number(word.replace(/[.,]$/, '').replace('−', '-')) : 0;
      const original = numeric
        ? originalNumbers[Math.min(numberIndex++, Math.max(0, originalNumbers.length - 1))]
        : undefined;
      const numberColor = original === undefined || value === original || !numberColors
        ? undefined
        : value > original ? numberColors[0] : numberColors[1];
      if (negative) word = word.slice(1);
      ctx.font = numeric ? numberFont : baseFont;
      const metrics = ctx.measureText(word);
      return {
        word,
        start,
        end: start + token[0].length,
        numeric,
        negative,
        numberColor,
        metrics,
        width: metrics.width + (negative ? minusWidth : 0),
      };
    });
    paragraphStart += paragraph.length + 1;
    return words;
  });
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
    const baseline = firstBaseline + index * lineHeight;
    let left = x - line.width / 2;
    for (const word of line.words) {
      ctx.fillStyle = word.numberColor ?? baseColor;
      if (word.negative) {
        ctx.font = minusFont;
        ctx.fillText('−', left, baseline);
        left += minusWidth;
      }
      ctx.font = word.numeric ? numberFont : baseFont;
      if (word.numeric) {
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 1.5;
        ctx.strokeText(word.word, left, baseline);
      }
      ctx.fillText(word.word, left, baseline);
      const contentStart = word.start + (word.negative ? 1 : 0);
      for (const match of terms) {
        const start = Math.max(contentStart, match.start);
        const end = Math.min(word.end, match.end);
        if (start >= end) continue;
        const prefix = word.word.slice(0, start - contentStart);
        const throughMatch = word.word.slice(0, end - contentStart);
        const underlineLeft = left + ctx.measureText(prefix).width;
        const underlineRight = left + ctx.measureText(throughMatch).width;
        const underlineY = baseline + Math.max(2, word.metrics.actualBoundingBoxDescent + 2);
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(underlineLeft, underlineY);
        ctx.lineTo(underlineRight, underlineY);
        ctx.stroke();
        regions?.push({
          term: match.term,
          x: underlineLeft / 512,
          y: (baseline - word.metrics.actualBoundingBoxAscent) / 768,
          width: (underlineRight - underlineLeft) / 512,
          height: (word.metrics.actualBoundingBoxAscent + word.metrics.actualBoundingBoxDescent + 4) / 768,
        });
      }
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
  'time-echo': new URL('../assets/cards/time-echo.svg', import.meta.url).href,
  'time-retain': new URL('../assets/cards/time-retain.svg', import.meta.url).href,
  'time-reclaim': new URL('../assets/cards/time-reclaim.svg', import.meta.url).href,
  'time-borrow': new URL('../assets/cards/time-borrow.svg', import.meta.url).href,
  'time-second-coat': new URL('../assets/cards/time-second-coat.svg', import.meta.url).href,
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
  // Sparse registration hatching keeps the card stock tactile while leaving the face panels clean.
  ctx.strokeStyle = 'rgba(7,25,28,.075)';
  ctx.lineWidth = 3;
  for (let offset = -520; offset < 760; offset += 74) {
    ctx.beginPath();
    ctx.moveTo(offset, 754);
    ctx.lineTo(offset + 500, 14);
    ctx.stroke();
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

    // Preserve the dense character illustration; the print finish lives only at its perimeter.
    ctx.strokeStyle = 'rgba(7,25,28,.92)';
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.roundRect(10, 10, 492, 748, 31);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,222,139,.72)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(25, 25, 462, 718, 23);
    ctx.stroke();
    for (const [x, y] of [[38, 38], [474, 38], [38, 730], [474, 730]] as const) {
      ellipse(ctx, x, y, 7, 7, '#e5a23f', INK, 3);
    }
    return surface;
  }

  ctx.fillStyle = '#06171b';
  ctx.fillRect(0, 0, 512, 768);
  const shell = ctx.createLinearGradient(20, 20, 492, 748);
  shell.addColorStop(0, '#174845');
  shell.addColorStop(.55, '#0d3032');
  shell.addColorStop(1, '#261d31');
  ctx.fillStyle = shell;
  ctx.beginPath();
  ctx.roundRect(20, 20, 472, 728, 26);
  ctx.fill();
  ctx.strokeStyle = '#e56532';
  ctx.lineWidth = 12;
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(42, 42, 428, 684, 15);
  ctx.clip();
  ctx.fillStyle = '#09272b';
  ctx.fillRect(42, 42, 428, 684);
  ctx.strokeStyle = 'rgba(239,191,104,.16)';
  ctx.lineWidth = 16;
  for (let offset = -650; offset < 900; offset += 68) {
    ctx.beginPath();
    ctx.moveTo(offset, 42);
    ctx.lineTo(offset + 470, 726);
    ctx.stroke();
  }
  halftone(ctx, 42, 42, 428, 684, 'rgba(132,219,166,.075)', 24);
  ctx.restore();

  ctx.fillStyle = '#e56532';
  ctx.beginPath();
  ctx.roundRect(78, 224, 356, 320, 32);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 10;
  ctx.stroke();
  ctx.fillStyle = '#092427';
  ctx.beginPath();
  ctx.roundRect(102, 248, 308, 272, 21);
  ctx.fill();
  ctx.strokeStyle = '#f0c875';
  ctx.lineWidth = 6;
  ctx.stroke();

  // Receipt-scanner eye: specific to possessed security without revealing the hidden action.
  polygon(ctx, [142, 384, 205, 322, 307, 322, 370, 384, 307, 446, 205, 446], '#b7d95b', '#06171b', 10);
  ellipse(ctx, 256, 384, 58, 58, '#142d30', '#f0c875', 9);
  ellipse(ctx, 256, 384, 23, 35, '#d9f16d', INK, 7);
  ellipse(ctx, 262, 373, 7, 12, '#fff7c9', 'transparent', 0);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 24px "Arial Narrow", Arial, sans-serif';
  ctx.fillStyle = '#f7d28a';
  ctx.fillText('MOREMART SECURITY', 256, 106);
  ctx.font = '800 16px "Arial Narrow", Arial, sans-serif';
  ctx.fillStyle = '#e56532';
  ctx.fillText('RECEIPT REQUIRED • ALWAYS WATCHING', 256, 660);

  ctx.strokeStyle = 'rgba(247,210,138,.7)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(32, 32, 448, 704, 20);
  ctx.stroke();
  for (const [x, y] of [[44, 44], [468, 44], [44, 724], [468, 724]] as const) {
    ellipse(ctx, x, y, 7, 7, '#90b654', INK, 3);
  }
  return surface;
}

export function drawEchoCardBack(): HTMLCanvasElement {
  const source = drawCardBack();
  const [surface, ctx] = canvas(512, 768);
  ctx.beginPath();
  ctx.roundRect(0, 0, 512, 768, 38);
  ctx.clip();
  ctx.filter = 'blur(32px) saturate(.45)';
  ctx.drawImage(source, -32, -32, 576, 832);
  ctx.filter = 'none';
  ctx.globalCompositeOperation = 'source-atop';
  const haze = ctx.createLinearGradient(0, 0, 512, 768);
  haze.addColorStop(0, 'rgba(26,125,119,.68)');
  haze.addColorStop(.55, 'rgba(24,77,77,.46)');
  haze.addColorStop(1, 'rgba(203,130,48,.62)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, 0, 512, 768);
  ctx.globalCompositeOperation = 'destination-in';
  const horizontalFeather = ctx.createLinearGradient(0, 0, 512, 0);
  horizontalFeather.addColorStop(0, 'rgba(255,255,255,0)');
  horizontalFeather.addColorStop(.08, '#fff');
  horizontalFeather.addColorStop(.92, '#fff');
  horizontalFeather.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = horizontalFeather;
  ctx.fillRect(0, 0, 512, 768);
  const verticalFeather = ctx.createLinearGradient(0, 0, 0, 768);
  verticalFeather.addColorStop(0, 'rgba(255,255,255,0)');
  verticalFeather.addColorStop(.055, '#fff');
  verticalFeather.addColorStop(.945, '#fff');
  verticalFeather.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = verticalFeather;
  ctx.fillRect(0, 0, 512, 768);
  return surface;
}

export function drawEnergyBadge(cost: number, dimmed: boolean): HTMLCanvasElement {
  const [surface, ctx] = canvas(128, 128);
  const fill = ctx.createRadialGradient(47, 39, 4, 64, 64, 58);
  fill.addColorStop(0, dimmed ? '#eeeeee' : '#fff0ae');
  fill.addColorStop(.62, dimmed ? '#c6c6c6' : '#ffcb64');
  fill.addColorStop(1, dimmed ? '#979797' : '#d9822f');
  ctx.fillStyle = fill;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 11;
  ctx.beginPath();
  ctx.arc(64, 64, 57, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = dimmed ? '#777' : '#fff0ae';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(64, 64, 45, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.7)';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(64, 64, 47, Math.PI * 1.08, Math.PI * 1.48);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.font = '900 78px "Arial Black", Arial, sans-serif';
  centeredText(ctx, String(cost), 64, 64, 104, 80);
  if (dimmed) grayscale(ctx, 128, 128);
  return surface;
}

export function drawCardArt(
  card: CardDefinition,
  locked: boolean,
  upgradeLevel: number,
  showTargets: boolean,
  dimmed: boolean,
  regions?: CardTermRegion[],
  forecast?: CardForecast,
): HTMLCanvasElement {
  const [surface, ctx] = canvas(1024, 1536);
  ctx.scale(2, 2);
  const palette = locked
    ? { dark: '#762d29', paper: '#000000' }
    : card.type === 'attack'
      ? { dark: '#331719', paper: '#f3dfb8' }
      : card.type === 'skill'
        ? { dark: '#0b3031', paper: '#e9dfb9' }
        : { dark: '#302515', paper: '#eee0b7' };
  const modifier = card.modifier?.levels;
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
  const accent = locked ? '#e56532' : RARITY_COLORS[rarity];

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
  ctx.strokeStyle = locked ? '#e56532' : accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(23, 23, 466, 722, 21);
  ctx.stroke();

  // Keep attachment titles legible while tucked behind their hosts.
  ctx.fillStyle = modifier === undefined ? palette.dark : modifier > 0 ? '#08715a' : '#a92238';
  ctx.beginPath();
  ctx.roundRect(28, 28, 456, 124, 16);
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 7;
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(32, 32, 448, 116, 13);
  ctx.clip();
  halftone(ctx, 32, 32, 448, 116, locked ? 'rgba(255,191,112,.1)' : 'rgba(255,240,206,.075)', 22);
  ctx.restore();
  ctx.fillStyle = accent;
  ctx.fillRect(52, 143, 408, 4);

  ctx.fillStyle = '#fff0ce';
  ctx.font = '800 44px Arial, sans-serif';
  centeredText(ctx, card.name.toUpperCase(), 256, 90, 408, 48, 0, undefined, undefined, regions);

  // A layered ink frame gives the illustration a physical inset without touching its crop.
  ctx.fillStyle = outline;
  ctx.beginPath();
  ctx.roundRect(30, 162, 452, 362, 19);
  ctx.fill();
  drawCardIllustration(ctx, illustration, 36, 168, 440, 350);
  ctx.strokeStyle = outline;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect(36, 168, 440, 350, 15);
  ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(43, 175, 426, 336, 10);
  ctx.stroke();
  line(ctx, [36, 194, 36, 168, 62, 168], accent, 5);
  line(ctx, [450, 518, 476, 518, 476, 492], accent, 5);

  ctx.fillStyle = locked ? '#182125' : 'rgba(255,248,226,.86)';
  ctx.beginPath();
  ctx.roundRect(36, 536, 440, 180, 15);
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.stroke();
  // Narrow gutters and registration marks stay outside the centered rules copy.
  ctx.fillStyle = locked ? '#e56532' : accent;
  ctx.fillRect(43, 553, 5, 146);
  ctx.fillRect(464, 553, 5, 146);
  for (const [x, y] of [[50, 545], [462, 545], [50, 707], [462, 707]] as const) {
    ellipse(ctx, x, y, 4, 4, locked ? '#f0c875' : palette.dark, 'transparent', 0);
  }
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.roundRect(190, 730, 132, 10, 5);
  ctx.fill();

  ctx.fillStyle = locked ? '#fff0ce' : '#14282a';
  const graded = applyUpgrade(card, upgradeLevel);
  const effective = forecast ? applyForecast(graded, forecast) : graded;
  const description = effective.description;
  const numberColors = locked
    ? ['#88e2aa', '#ffa99b'] as const
    : ['#08715a', '#a92238'] as const;
  const [primaryRule, ...secondaryActions] = description.split('\n');
  const [basePrimary, ...baseSecondary] = card.description.split('\n');
  ctx.font = '600 34px Arial, sans-serif';
  centeredText(ctx, primaryRule, 256, secondaryActions.length ? (showTargets ? 581 : 594) : (showTargets ? 611 : 626), 390, 42, 34, numberColors, basePrimary, regions);
  if (secondaryActions.length > 0) {
    ctx.fillStyle = locked ? '#ffbf70' : '#9d352b';
    ctx.font = '800 28px Arial, sans-serif';
    centeredText(ctx, secondaryActions.join('\n'), 256, showTargets ? 651 : 664, 390, 34, 28, numberColors, baseSecondary.join('\n'), regions);
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

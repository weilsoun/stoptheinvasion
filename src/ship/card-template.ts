export interface CardRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
}

const region = (x: number, y: number, width: number, height: number, radius: number): CardRegion =>
  Object.freeze({ x, y, width, height, radius });

/**
 * The editable print specification shared by every action, crew and research face.
 * Classification colors are deliberately absent: rarity and department remain identity data.
 */
export const CARD_TEMPLATE = Object.freeze({
  width: 760,
  height: 1080,
  outerRadius: 46,
  regions: Object.freeze({
    title: region(0, 0, 760, 150, 0),
    cost: region(34, 31, 108, 108, 54),
    illustration: region(44, 176, 672, 472, 22),
    illustrationKeyline: region(55, 187, 650, 450, 16),
    rules: region(44, 678, 672, 292, 24),
    rulesKeyline: region(56, 690, 648, 268, 16),
    footer: region(44, 985, 672, 58, 14),
  }),
  chrome: Object.freeze({
    ink: '#07151d',
    face: '#f7edcd',
    stock: '#eadbb6',
    titlePanel: '#fff4d3',
    footer: '#ded3b5',
    bodyInk: '#10232a',
    mutedInk: '#465457',
    outerStroke: 18,
    accentStroke: 6,
  }),
  typography: Object.freeze({
    condensed: '"Barlow Condensed", "Arial Narrow", Arial, sans-serif',
    display: '"Bebas Neue", "Barlow Condensed", "Arial Narrow", Arial, sans-serif',
    title: Object.freeze({ max: 66, min: 38, step: 2, maxWidth: 530, x: 430, y: 79 }),
    cost: Object.freeze({ size: 74, x: 88, y: 87, labelSize: 18, labelY: 126 }),
    rules: Object.freeze({ twoSize: 55, manySize: 46, centerX: 380, centerY: 798 }),
    flavor: Object.freeze({ max: 26, min: 20, maxWidth: 610, x: 380, y: 938 }),
    footer: Object.freeze({ departmentSize: 27, raritySize: 25, y: 1015 }),
  }),
});

function rounded(
  ctx: CanvasRenderingContext2D,
  target: CardRegion,
  fill: string,
  stroke: string,
  strokeWidth: number,
): void {
  ctx.beginPath();
  ctx.roundRect(target.x, target.y, target.width, target.height, target.radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (strokeWidth > 0) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  }
}

/** Draws the shared neutral stock, title plate, rules plate and footer. */
export function drawCardTemplateChrome(ctx: CanvasRenderingContext2D, accent: string): void {
  const { width, height, regions, chrome } = CARD_TEMPLATE;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(0, 0, width, height, CARD_TEMPLATE.outerRadius);
  ctx.clip();
  ctx.fillStyle = chrome.stock;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = chrome.face;
  ctx.fillRect(30, 150, 700, 880);
  ctx.fillStyle = accent;
  ctx.fillRect(regions.title.x, regions.title.y, regions.title.width, regions.title.height);
  ctx.fillStyle = chrome.bodyInk;
  ctx.fillRect(0, 142, width, 8);

  ctx.strokeStyle = chrome.ink;
  ctx.lineWidth = chrome.outerStroke;
  ctx.beginPath();
  ctx.roundRect(10, 10, 740, 1060, 37);
  ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.lineWidth = chrome.accentStroke;
  ctx.beginPath();
  ctx.roundRect(29, 29, 702, 1022, 26);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(7,21,29,.28)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(38, 38, 684, 1004, 21);
  ctx.stroke();

  rounded(ctx, regions.cost, chrome.titlePanel, chrome.ink, 9);
  rounded(ctx, regions.rules, chrome.titlePanel, chrome.ink, 10);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(regions.rulesKeyline.x, regions.rulesKeyline.y, regions.rulesKeyline.width, regions.rulesKeyline.height, regions.rulesKeyline.radius);
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.fillRect(65, 704, 630, 7);
  rounded(ctx, regions.footer, chrome.footer, chrome.ink, 5);
  ctx.restore();
}

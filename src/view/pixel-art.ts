import type { TileKind } from '../game/map';

/**
 * Original MOREMART pixel artwork authored for this project in canvas primitives.
 * No generated, downloaded, traced, or third-party image material is used here.
 */
export type PixelDirection = 'up' | 'right' | 'down' | 'left';

type CharacterKind =
  | 'bob'
  | 'security'
  | 'checkout'
  | 'stacker'
  | 'cleaner'
  | 'greeter'
  | 'supervisor'
  | 'floor-manager'
  | 'night-manager';

type PropKind = 'hammer' | 'flashlight' | 'scanner' | 'carton' | 'mop' | 'brochure' | 'clipboard' | 'keys' | 'radio';
type Headwear = 'hardhat' | 'cap' | 'visor' | 'beanie' | 'kerchief' | 'none' | 'badge-cap' | 'manager' | 'night-cap';

interface CharacterProfile {
  uniform: string;
  uniformLight: string;
  accent: string;
  skin: string;
  hair: string;
  trousers: string;
  prop: PropKind;
  headwear: Headwear;
  wide?: boolean;
  apron?: boolean;
  tie?: boolean;
}

const PALETTE = {
  ink: '#172324',
  deepInk: '#0d1718',
  stock: '#f1e6c8',
  chalk: '#fff5da',
  orange: '#d86532',
  orangeDark: '#9d4428',
  yellow: '#e8ba45',
  teal: '#477b78',
  tealDark: '#315957',
  tealLight: '#79a19a',
  plum: '#70516f',
  plumLight: '#9c7796',
  red: '#ac443e',
  skin: '#c8845a',
  skinLight: '#e2ad76',
  brown: '#563d31',
} as const;

const CHARACTER_KINDS: readonly CharacterKind[] = [
  'bob',
  'security',
  'checkout',
  'stacker',
  'cleaner',
  'greeter',
  'supervisor',
  'floor-manager',
  'night-manager',
];
const DIRECTIONS: readonly PixelDirection[] = ['up', 'right', 'down', 'left'];
const TILE_KINDS: readonly TileKind[] = ['floor', 'wall', 'shelf', 'table', 'door', 'exit'];
const OBJECT_KINDS = ['potion', 'service', 'supply', 'exit'] as const;
type ObjectKind = (typeof OBJECT_KINDS)[number];

const PROFILES: Record<CharacterKind, CharacterProfile> = {
  bob: {
    uniform: PALETTE.orange,
    uniformLight: PALETTE.yellow,
    accent: PALETTE.teal,
    skin: PALETTE.skin,
    hair: PALETTE.brown,
    trousers: PALETTE.tealDark,
    prop: 'hammer',
    headwear: 'hardhat',
    wide: true,
  },
  security: {
    uniform: PALETTE.tealDark,
    uniformLight: PALETTE.teal,
    accent: PALETTE.yellow,
    skin: '#a96f53',
    hair: PALETTE.deepInk,
    trousers: PALETTE.ink,
    prop: 'flashlight',
    headwear: 'cap',
    wide: true,
  },
  checkout: {
    uniform: PALETTE.stock,
    uniformLight: PALETTE.chalk,
    accent: PALETTE.red,
    skin: '#d89a6e',
    hair: '#763f31',
    trousers: PALETTE.plum,
    prop: 'scanner',
    headwear: 'visor',
    apron: true,
  },
  stacker: {
    uniform: PALETTE.teal,
    uniformLight: PALETTE.tealLight,
    accent: PALETTE.orange,
    skin: '#8f604b',
    hair: PALETTE.deepInk,
    trousers: PALETTE.ink,
    prop: 'carton',
    headwear: 'beanie',
    wide: true,
  },
  cleaner: {
    uniform: PALETTE.tealLight,
    uniformLight: PALETTE.stock,
    accent: PALETTE.yellow,
    skin: '#bd7959',
    hair: '#d4c2a0',
    trousers: PALETTE.tealDark,
    prop: 'mop',
    headwear: 'kerchief',
    apron: true,
  },
  greeter: {
    uniform: PALETTE.orange,
    uniformLight: PALETTE.stock,
    accent: PALETTE.yellow,
    skin: '#bd8060',
    hair: '#ece0c2',
    trousers: PALETTE.tealDark,
    prop: 'brochure',
    headwear: 'none',
    apron: true,
  },
  supervisor: {
    uniform: PALETTE.plum,
    uniformLight: PALETTE.plumLight,
    accent: PALETTE.red,
    skin: '#b87358',
    hair: PALETTE.brown,
    trousers: PALETTE.ink,
    prop: 'clipboard',
    headwear: 'badge-cap',
    tie: true,
  },
  'floor-manager': {
    uniform: PALETTE.tealDark,
    uniformLight: PALETTE.teal,
    accent: PALETTE.yellow,
    skin: '#d1966f',
    hair: '#59413c',
    trousers: PALETTE.deepInk,
    prop: 'keys',
    headwear: 'manager',
    tie: true,
    wide: true,
  },
  'night-manager': {
    uniform: PALETTE.plum,
    uniformLight: PALETTE.tealDark,
    accent: PALETTE.red,
    skin: '#95634f',
    hair: PALETTE.deepInk,
    trousers: PALETTE.deepInk,
    prop: 'radio',
    headwear: 'night-cap',
    wide: true,
  },
};

const tileCanvases = new Map<TileKind, HTMLCanvasElement>();
const spriteCanvases = new Map<string, HTMLCanvasElement>();
const objectCanvases = new Map<ObjectKind, HTMLCanvasElement>();
const portraitCanvases = new Map<CharacterKind, HTMLCanvasElement>();

function canvas(width: number, height: number, name: string): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const surface = document.createElement('canvas');
  surface.width = width;
  surface.height = height;
  surface.dataset.worldArtKey = name;
  const context = surface.getContext('2d');
  if (!context) throw new Error('Canvas 2D is required for world pixel art.');
  context.imageSmoothingEnabled = false;
  return [surface, context];
}

function rect(context: CanvasRenderingContext2D, color: string, x: number, y: number, width: number, height: number): void {
  context.fillStyle = color;
  context.fillRect(x, y, width, height);
}

function isMember<T extends string>(values: readonly T[], value: string): value is T {
  return values.includes(value as T);
}

function characterKind(kind: string): CharacterKind {
  if (!isMember(CHARACTER_KINDS, kind)) throw new RangeError(`Unknown world sprite identity: ${kind}`);
  return kind;
}

function objectKind(kind: string): ObjectKind {
  if (!isMember(OBJECT_KINDS, kind)) throw new RangeError(`Unknown world object kind: ${kind}`);
  return kind;
}

function paintFloor(context: CanvasRenderingContext2D): void {
  rect(context, PALETTE.stock, 0, 0, 32, 32);
  rect(context, '#dfd2b4', 0, 15, 32, 1);
  rect(context, '#dfd2b4', 15, 0, 1, 32);
  rect(context, PALETTE.chalk, 2, 2, 12, 1);
  rect(context, '#cbbd9f', 27, 4, 2, 1);
  rect(context, '#cbbd9f', 5, 25, 4, 1);
  rect(context, PALETTE.orange, 17, 17, 3, 1);
  rect(context, PALETTE.plum, 20, 18, 2, 1);
}

function paintWall(context: CanvasRenderingContext2D): void {
  rect(context, PALETTE.tealDark, 0, 0, 32, 32);
  rect(context, PALETTE.ink, 0, 25, 32, 7);
  rect(context, PALETTE.teal, 0, 22, 32, 3);
  rect(context, PALETTE.stock, 2, 2, 28, 18);
  rect(context, '#d6c9aa', 2, 10, 28, 2);
  rect(context, PALETTE.chalk, 3, 3, 26, 1);
  rect(context, PALETTE.plum, 7, 12, 7, 2);
  rect(context, PALETTE.orange, 8, 11, 7, 1);
  rect(context, '#b9aa8d', 25, 5, 2, 4);
}

function paintShelf(context: CanvasRenderingContext2D): void {
  paintFloor(context);
  rect(context, PALETTE.ink, 2, 3, 28, 27);
  rect(context, PALETTE.tealDark, 4, 4, 24, 24);
  rect(context, PALETTE.tealLight, 5, 5, 22, 3);
  rect(context, PALETTE.stock, 5, 11, 22, 2);
  rect(context, PALETTE.stock, 5, 20, 22, 2);
  rect(context, PALETTE.orange, 6, 8, 5, 3);
  rect(context, PALETTE.yellow, 12, 8, 4, 3);
  rect(context, PALETTE.plum, 18, 8, 8, 3);
  rect(context, PALETTE.red, 6, 13, 4, 7);
  rect(context, PALETTE.stock, 11, 13, 7, 7);
  rect(context, PALETTE.orange, 19, 13, 7, 7);
  rect(context, PALETTE.yellow, 6, 22, 8, 5);
  rect(context, PALETTE.plum, 15, 22, 4, 5);
  rect(context, PALETTE.tealLight, 20, 22, 6, 5);
  rect(context, PALETTE.ink, 4, 28, 4, 2);
  rect(context, PALETTE.ink, 24, 28, 4, 2);
}

function paintTable(context: CanvasRenderingContext2D): void {
  paintFloor(context);
  rect(context, PALETTE.ink, 3, 5, 26, 23);
  rect(context, PALETTE.tealDark, 4, 6, 24, 20);
  rect(context, PALETTE.teal, 5, 7, 22, 17);
  rect(context, PALETTE.tealLight, 6, 8, 20, 2);
  rect(context, PALETTE.stock, 8, 12, 11, 8);
  rect(context, '#cbbd9f', 9, 19, 10, 2);
  rect(context, PALETTE.red, 10, 14, 7, 1);
  rect(context, PALETTE.red, 10, 17, 5, 1);
  rect(context, PALETTE.ink, 21, 12, 4, 7);
  rect(context, PALETTE.yellow, 22, 13, 2, 4);
  rect(context, PALETTE.ink, 4, 26, 5, 3);
  rect(context, PALETTE.ink, 23, 26, 5, 3);
}

function paintDoor(context: CanvasRenderingContext2D): void {
  paintFloor(context);
  rect(context, PALETTE.ink, 2, 2, 28, 28);
  rect(context, PALETTE.tealDark, 4, 3, 24, 26);
  rect(context, PALETTE.teal, 6, 4, 20, 23);
  rect(context, PALETTE.stock, 8, 6, 16, 12);
  rect(context, PALETTE.yellow, 9, 7, 14, 3);
  rect(context, PALETTE.red, 11, 12, 10, 2);
  rect(context, PALETTE.ink, 22, 20, 3, 3);
  rect(context, PALETTE.chalk, 22, 20, 1, 1);
  rect(context, PALETTE.orange, 5, 27, 22, 2);
  rect(context, PALETTE.plum, 8, 29, 14, 1);
}

function paintExitTile(context: CanvasRenderingContext2D): void {
  rect(context, PALETTE.deepInk, 0, 0, 32, 32);
  rect(context, PALETTE.tealDark, 2, 2, 28, 28);
  for (let x = 3; x < 29; x += 6) {
    rect(context, PALETTE.yellow, x, 3, 3, 4);
    rect(context, PALETTE.ink, x + 3, 3, 3, 4);
  }
  rect(context, PALETTE.stock, 5, 9, 22, 14);
  rect(context, PALETTE.teal, 7, 11, 18, 10);
  rect(context, PALETTE.ink, 9, 15, 10, 2);
  rect(context, PALETTE.ink, 17, 13, 2, 6);
  rect(context, PALETTE.chalk, 11, 12, 6, 1);
  rect(context, PALETTE.red, 23, 24, 5, 5);
  rect(context, PALETTE.chalk, 25, 25, 1, 1);
}

export function drawWorldTile(kind: TileKind): HTMLCanvasElement {
  if (!isMember(TILE_KINDS, kind)) throw new RangeError(`Unknown world tile kind: ${String(kind)}`);
  const cached = tileCanvases.get(kind);
  if (cached) return cached;
  const [surface, context] = canvas(32, 32, `tile:${kind}`);
  if (kind === 'floor') paintFloor(context);
  else if (kind === 'wall') paintWall(context);
  else if (kind === 'shelf') paintShelf(context);
  else if (kind === 'table') paintTable(context);
  else if (kind === 'door') paintDoor(context);
  else paintExitTile(context);
  tileCanvases.set(kind, surface);
  return surface;
}

function paintHeadwear(context: CanvasRenderingContext2D, profile: CharacterProfile, direction: PixelDirection, sideShift: number): void {
  const x = 10 + sideShift;
  const rear = direction === 'up';
  if (profile.headwear === 'hardhat') {
    rect(context, PALETTE.ink, x - 2, 4, 16, 5);
    rect(context, PALETTE.yellow, x, 3, 12, 5);
    rect(context, PALETTE.orange, x + 5, 2, 3, 5);
    rect(context, PALETTE.chalk, x + 2, 4, 3, 1);
    rect(context, PALETTE.ink, x - 4, 8, 19, 2);
  } else if (profile.headwear === 'cap' || profile.headwear === 'badge-cap') {
    rect(context, PALETTE.ink, x - 2, 4, 15, 6);
    rect(context, profile.uniformLight, x, 4, 12, 4);
    rect(context, profile.accent, x + 5, 5, 3, 2);
    if (!rear) rect(context, PALETTE.ink, direction === 'left' ? x - 4 : x + 9, 8, 7, 2);
  } else if (profile.headwear === 'visor') {
    rect(context, PALETTE.red, x - 1, 5, 14, 3);
    rect(context, PALETTE.stock, x + 1, 5, 10, 1);
    if (!rear) rect(context, PALETTE.red, direction === 'left' ? x - 4 : x + 10, 7, 6, 2);
  } else if (profile.headwear === 'beanie') {
    rect(context, PALETTE.ink, x - 1, 3, 14, 7);
    rect(context, PALETTE.orange, x + 1, 3, 10, 5);
    rect(context, PALETTE.ink, x - 2, 8, 16, 3);
  } else if (profile.headwear === 'kerchief') {
    rect(context, PALETTE.yellow, x - 1, 4, 14, 5);
    rect(context, PALETTE.ink, x - 2, 8, 16, 2);
    rect(context, PALETTE.yellow, direction === 'left' ? x + 11 : x - 2, 9, 3, 5);
  } else if (profile.headwear === 'manager') {
    rect(context, profile.hair, x, 3, 12, 6);
    rect(context, PALETTE.stock, x - 1, 4, 3, 3);
    rect(context, PALETTE.ink, x - 2, 8, 16, 2);
  } else if (profile.headwear === 'night-cap') {
    rect(context, PALETTE.ink, x - 2, 3, 16, 7);
    rect(context, PALETTE.plum, x, 4, 12, 4);
    rect(context, PALETTE.red, x + 4, 3, 4, 2);
    rect(context, PALETTE.ink, x - 3, 9, 18, 2);
  } else {
    rect(context, profile.hair, x - 1, 3, 14, 8);
    rect(context, PALETTE.stock, x, 4, 3, 2);
  }
}

function paintFace(context: CanvasRenderingContext2D, profile: CharacterProfile, direction: PixelDirection, sideShift: number): void {
  const x = 10 + sideShift;
  rect(context, PALETTE.ink, x - 1, 8, 14, 12);
  if (direction === 'up') {
    rect(context, profile.hair, x + 1, 9, 10, 8);
    rect(context, profile.skin, x + 2, 16, 8, 3);
    rect(context, PALETTE.plum, x + 3, 15, 5, 1);
    return;
  }
  rect(context, profile.skin, x + 1, 9, 10, 9);
  rect(context, profile.skin, x + 3, 17, 7, 2);
  rect(context, profile.skin === PALETTE.skin ? PALETTE.skinLight : PALETTE.stock, x + 2, 10, 6, 2);
  if (direction === 'down') {
    rect(context, PALETTE.ink, x + 3, 12, 2, 2);
    rect(context, PALETTE.plum, x + 8, 12, 2, 2);
    rect(context, PALETTE.ink, x + 5, 16, 4, 1);
    rect(context, PALETTE.plumLight, x + 9, 10, 2, 1);
  } else if (direction === 'right') {
    rect(context, PALETTE.plum, x + 8, 12, 2, 2);
    rect(context, profile.skin, x + 11, 13, 3, 2);
    rect(context, PALETTE.ink, x + 7, 16, 4, 1);
  } else {
    rect(context, PALETTE.ink, x + 2, 12, 2, 2);
    rect(context, profile.skin, x - 2, 13, 3, 2);
    rect(context, PALETTE.ink, x + 1, 16, 4, 1);
  }
}

function paintProp(context: CanvasRenderingContext2D, profile: CharacterProfile, direction: PixelDirection, frame: number): void {
  const left = direction === 'left' || direction === 'up';
  const x = left ? 2 : 25;
  const swing = frame === 0 ? 0 : (left ? -1 : 1);
  if (profile.prop === 'hammer') {
    rect(context, PALETTE.ink, x + swing, 20, 5, 18);
    rect(context, PALETTE.orange, x + 2 + swing, 25, 2, 12);
    rect(context, PALETTE.ink, x - 2 + swing, 18, 9, 6);
    rect(context, PALETTE.teal, x - 1 + swing, 19, 7, 4);
    rect(context, PALETTE.chalk, x + swing, 19, 3, 1);
  } else if (profile.prop === 'flashlight') {
    rect(context, PALETTE.ink, x - 1, 25 + swing, 7, 6);
    rect(context, PALETTE.yellow, x, 26 + swing, 4, 3);
    rect(context, PALETTE.chalk, left ? x - 3 : x + 5, 25 + swing, 3, 4);
  } else if (profile.prop === 'scanner') {
    rect(context, PALETTE.ink, x - 1, 23 + swing, 7, 9);
    rect(context, PALETTE.red, x, 24 + swing, 5, 4);
    rect(context, PALETTE.chalk, x + 1, 24 + swing, 2, 1);
    rect(context, PALETTE.ink, x + 2, 31 + swing, 3, 5);
  } else if (profile.prop === 'carton') {
    rect(context, PALETTE.ink, left ? 0 : 23, 21 + swing, 9, 12);
    rect(context, PALETTE.orange, left ? 1 : 24, 22 + swing, 7, 9);
    rect(context, PALETTE.yellow, left ? 4 : 27, 22 + swing, 1, 9);
    rect(context, PALETTE.ink, left ? 1 : 24, 26 + swing, 7, 1);
  } else if (profile.prop === 'mop') {
    rect(context, PALETTE.ink, x + 1, 17, 2, 25);
    rect(context, PALETTE.yellow, x + 2, 18, 1, 20);
    rect(context, PALETTE.ink, x - 3, 39, 10, 5);
    rect(context, PALETTE.stock, x - 2, 40, 8, 3);
    rect(context, PALETTE.plum, x + 4, 41, 2, 2);
  } else if (profile.prop === 'brochure') {
    rect(context, PALETTE.ink, x - 1, 23 + swing, 7, 9);
    rect(context, PALETTE.stock, x, 24 + swing, 5, 7);
    rect(context, PALETTE.orange, x + 2, 24 + swing, 1, 7);
    rect(context, PALETTE.teal, x + 1, 26 + swing, 3, 1);
  } else if (profile.prop === 'clipboard') {
    rect(context, PALETTE.ink, x - 2, 21 + swing, 9, 14);
    rect(context, PALETTE.stock, x - 1, 22 + swing, 7, 11);
    rect(context, PALETTE.red, x + 1, 24 + swing, 4, 1);
    rect(context, PALETTE.red, x + 1, 27 + swing, 3, 1);
    rect(context, PALETTE.yellow, x + 1, 20 + swing, 4, 3);
  } else if (profile.prop === 'keys') {
    rect(context, PALETTE.ink, x, 24 + swing, 6, 7);
    rect(context, PALETTE.yellow, x + 1, 25 + swing, 4, 4);
    rect(context, PALETTE.ink, x + 2, 26 + swing, 2, 2);
    rect(context, PALETTE.yellow, x + 3, 29 + swing, 2, 7);
    rect(context, PALETTE.yellow, x + 5, 33 + swing, 3, 2);
  } else {
    rect(context, PALETTE.ink, x - 1, 21 + swing, 7, 13);
    rect(context, PALETTE.plum, x, 22 + swing, 5, 10);
    rect(context, PALETTE.red, x + 1, 23 + swing, 3, 2);
    rect(context, PALETTE.yellow, x + 2, 28 + swing, 2, 2);
    rect(context, PALETTE.ink, x + 1, 33 + swing, 4, 3);
  }
}

function paintSprite(context: CanvasRenderingContext2D, kind: CharacterKind, direction: PixelDirection, frame: number): void {
  const profile = PROFILES[kind];
  const bob = frame === 1 ? 1 : 0;
  const sideShift = direction === 'right' ? -1 : direction === 'left' ? 1 : 0;
  const torsoX = profile.wide ? 7 : 8;
  const torsoWidth = profile.wide ? 19 : 17;
  const leftStep = frame === 0 ? 0 : 2;
  const rightStep = frame === 0 ? 2 : 0;

  rect(context, PALETTE.plum, direction === 'left' ? 8 : 11, 45, 13, 2);
  rect(context, PALETTE.ink, torsoX - 2, 19 + bob, torsoWidth + 4, 18);
  rect(context, profile.uniform, torsoX, 20 + bob, torsoWidth, 15);
  rect(context, profile.uniformLight, torsoX + 2, 21 + bob, torsoWidth - 5, 2);
  rect(context, PALETTE.ink, torsoX - 3, 22 + bob, 4, 13);
  rect(context, PALETTE.ink, torsoX + torsoWidth - 1, 22 + bob, 4, 13);
  rect(context, profile.skin, torsoX - 2, 33 + bob, 4, 4);
  rect(context, profile.skin, torsoX + torsoWidth - 1, 33 + bob, 4, 4);

  if (profile.apron) {
    rect(context, PALETTE.ink, 10, 24 + bob, 13, 12);
    rect(context, PALETTE.stock, 11, 25 + bob, 11, 10);
    rect(context, profile.accent, 14, 31 + bob, 5, 2);
  } else {
    rect(context, profile.accent, direction === 'up' ? 9 : 11, 28 + bob, 12, 3);
    rect(context, PALETTE.ink, 14, 28 + bob, 3, 3);
  }
  if (profile.tie) {
    rect(context, PALETTE.ink, 14, 21 + bob, 4, 11);
    rect(context, profile.accent, 15, 22 + bob, 2, 7);
    rect(context, profile.accent, 14, 29 + bob, 4, 3);
  }
  if (kind === 'bob') {
    rect(context, PALETTE.ink, 8, 30 + bob, 17, 5);
    rect(context, PALETTE.yellow, 9, 31 + bob, 15, 2);
    rect(context, PALETTE.teal, 11, 32 + bob, 3, 4);
    rect(context, PALETTE.teal, 20, 32 + bob, 3, 4);
  }

  rect(context, PALETTE.ink, 8 - leftStep, 35, 8, 11);
  rect(context, PALETTE.ink, 17 + rightStep, 35, 8, 11);
  rect(context, profile.trousers, 10 - leftStep, 35, 5, 8);
  rect(context, profile.trousers, 18 + rightStep, 35, 5, 8);
  rect(context, PALETTE.deepInk, 7 - leftStep, 43, 8, 4);
  rect(context, PALETTE.deepInk, 19 + rightStep, 43, 8, 4);
  rect(context, PALETTE.chalk, 8 - leftStep, 43, 3, 1);

  paintFace(context, profile, direction, sideShift);
  paintHeadwear(context, profile, direction, sideShift);
  paintProp(context, profile, direction, frame);
}

export function drawWorldSprite(kind: string, direction: PixelDirection, frame: number): HTMLCanvasElement {
  const identity = characterKind(kind);
  if (!isMember(DIRECTIONS, direction)) throw new RangeError(`Unknown pixel direction: ${String(direction)}`);
  if (!Number.isFinite(frame)) throw new TypeError('World sprite frame must be finite.');
  const walkFrame = ((Math.trunc(frame) % 2) + 2) % 2;
  const key = `${identity}:${direction}:${walkFrame}`;
  const cached = spriteCanvases.get(key);
  if (cached) return cached;
  const [surface, context] = canvas(32, 48, `sprite:${key}`);
  paintSprite(context, identity, direction, walkFrame);
  spriteCanvases.set(key, surface);
  return surface;
}

function paintPotion(context: CanvasRenderingContext2D): void {
  rect(context, PALETTE.plum, 9, 27, 16, 3);
  rect(context, PALETTE.ink, 12, 3, 8, 6);
  rect(context, PALETTE.yellow, 13, 3, 6, 3);
  rect(context, PALETTE.ink, 9, 8, 14, 19);
  rect(context, PALETTE.stock, 11, 9, 10, 5);
  rect(context, PALETTE.red, 11, 14, 10, 11);
  rect(context, PALETTE.orange, 13, 12, 6, 2);
  rect(context, PALETTE.chalk, 12, 15, 2, 7);
  rect(context, PALETTE.plum, 18, 18, 3, 6);
  rect(context, PALETTE.stock, 13, 17, 6, 5);
  rect(context, PALETTE.red, 15, 16, 2, 7);
}

function paintService(context: CanvasRenderingContext2D): void {
  rect(context, PALETTE.plum, 3, 27, 26, 3);
  rect(context, PALETTE.ink, 3, 10, 26, 18);
  rect(context, PALETTE.tealDark, 5, 12, 22, 14);
  rect(context, PALETTE.teal, 6, 13, 20, 5);
  rect(context, PALETTE.yellow, 8, 7, 4, 14);
  rect(context, PALETTE.ink, 7, 5, 6, 5);
  rect(context, PALETTE.orange, 8, 6, 4, 3);
  rect(context, PALETTE.ink, 15, 15, 9, 7);
  rect(context, PALETTE.stock, 16, 16, 7, 5);
  rect(context, PALETTE.red, 18, 17, 3, 3);
  rect(context, PALETTE.ink, 6, 26, 4, 4);
  rect(context, PALETTE.ink, 22, 26, 4, 4);
}

function paintSupply(context: CanvasRenderingContext2D): void {
  rect(context, PALETTE.plum, 4, 27, 24, 3);
  rect(context, PALETTE.ink, 3, 8, 26, 20);
  rect(context, PALETTE.orange, 5, 10, 22, 16);
  rect(context, PALETTE.yellow, 15, 10, 3, 16);
  rect(context, PALETTE.ink, 5, 16, 22, 2);
  rect(context, PALETTE.stock, 8, 19, 7, 5);
  rect(context, PALETTE.red, 10, 20, 3, 3);
  rect(context, PALETTE.stock, 19, 12, 6, 3);
  rect(context, PALETTE.chalk, 6, 11, 8, 1);
  rect(context, PALETTE.ink, 9, 6, 14, 4);
  rect(context, PALETTE.teal, 11, 7, 10, 2);
}

function paintExitObject(context: CanvasRenderingContext2D): void {
  rect(context, PALETTE.plum, 8, 27, 17, 3);
  rect(context, PALETTE.ink, 8, 3, 17, 25);
  rect(context, PALETTE.tealDark, 10, 5, 13, 21);
  rect(context, PALETTE.stock, 12, 7, 9, 7);
  rect(context, PALETTE.red, 13, 8, 7, 5);
  rect(context, PALETTE.chalk, 15, 9, 3, 2);
  rect(context, PALETTE.yellow, 12, 17, 9, 6);
  rect(context, PALETTE.ink, 14, 19, 5, 2);
  rect(context, PALETTE.orange, 7, 24, 19, 3);
  rect(context, PALETTE.chalk, 11, 5, 7, 1);
}

export function drawWorldObject(kind: string): HTMLCanvasElement {
  const identity = objectKind(kind);
  const cached = objectCanvases.get(identity);
  if (cached) return cached;
  const [surface, context] = canvas(32, 32, `object:${identity}`);
  if (identity === 'potion') paintPotion(context);
  else if (identity === 'service') paintService(context);
  else if (identity === 'supply') paintSupply(context);
  else paintExitObject(context);
  objectCanvases.set(identity, surface);
  return surface;
}

function paintPortrait(context: CanvasRenderingContext2D, kind: CharacterKind): void {
  const profile = PROFILES[kind];
  context.scale(4, 4);
  rect(context, PALETTE.plum, 5, 4, 23, 25);
  rect(context, PALETTE.orange, 4, 6, 2, 18);
  rect(context, PALETTE.tealDark, 6, 3, 21, 26);
  rect(context, PALETTE.teal, 7, 4, 19, 23);
  rect(context, PALETTE.stock, 8, 5, 17, 18);
  rect(context, PALETTE.ink, 4, 24, 24, 8);
  rect(context, profile.uniform, 6, 25, 20, 7);
  rect(context, profile.uniformLight, 9, 25, 14, 2);
  rect(context, PALETTE.ink, 9, 9, 14, 16);
  rect(context, profile.skin, 10, 10, 12, 13);
  rect(context, profile.skin === PALETTE.skin ? PALETTE.skinLight : PALETTE.stock, 11, 11, 7, 3);
  rect(context, PALETTE.ink, 12, 15, 2, 2);
  rect(context, PALETTE.plum, 19, 15, 2, 2);
  rect(context, PALETTE.plumLight, 20, 12, 2, 1);
  rect(context, PALETTE.ink, 14, 20, 6, 2);
  rect(context, profile.skin, 15, 20, 4, 1);
  rect(context, profile.hair, 9, 8, 14, 4);
  rect(context, profile.hair, 9, 10, 3, 7);

  if (profile.headwear === 'hardhat') {
    rect(context, PALETTE.ink, 7, 5, 18, 5);
    rect(context, PALETTE.yellow, 9, 4, 14, 5);
    rect(context, PALETTE.orange, 15, 3, 3, 5);
    rect(context, PALETTE.chalk, 10, 5, 4, 1);
    rect(context, PALETTE.ink, 6, 9, 20, 2);
  } else if (profile.headwear === 'visor') {
    rect(context, PALETTE.red, 8, 7, 16, 3);
    rect(context, PALETTE.stock, 10, 7, 10, 1);
    rect(context, PALETTE.red, 21, 9, 5, 2);
  } else if (profile.headwear === 'kerchief') {
    rect(context, PALETTE.yellow, 8, 6, 16, 4);
    rect(context, PALETTE.ink, 7, 9, 18, 2);
    rect(context, PALETTE.yellow, 22, 10, 3, 5);
  } else if (profile.headwear === 'beanie') {
    rect(context, PALETTE.ink, 8, 4, 16, 7);
    rect(context, PALETTE.orange, 10, 4, 12, 5);
    rect(context, PALETTE.ink, 7, 9, 18, 3);
  } else if (profile.headwear === 'none') {
    rect(context, profile.hair, 8, 5, 16, 6);
    rect(context, PALETTE.stock, 9, 6, 4, 2);
  } else {
    rect(context, PALETTE.ink, 7, 5, 18, 6);
    rect(context, profile.uniformLight, 9, 6, 14, 3);
    rect(context, profile.accent, 15, 6, 3, 2);
    rect(context, PALETTE.ink, 19, 9, 7, 2);
  }

  if (profile.apron) {
    rect(context, PALETTE.stock, 10, 26, 12, 6);
    rect(context, profile.accent, 14, 28, 5, 2);
  } else {
    rect(context, profile.accent, 8, 28, 16, 3);
    rect(context, PALETTE.ink, 15, 28, 3, 3);
  }
  if (profile.tie) {
    rect(context, PALETTE.ink, 14, 24, 5, 8);
    rect(context, profile.accent, 15, 25, 3, 5);
    rect(context, profile.accent, 14, 30, 5, 2);
  }
  if (kind === 'bob') {
    rect(context, PALETTE.ink, 23, 20, 5, 12);
    rect(context, PALETTE.orange, 25, 22, 2, 10);
    rect(context, PALETTE.ink, 21, 19, 8, 4);
    rect(context, PALETTE.teal, 22, 20, 6, 2);
  } else {
    rect(context, PALETTE.plum, 25, 14, 3, 7);
    rect(context, PALETTE.plumLight, 27, 15, 2, 4);
  }
  context.setTransform(1, 0, 0, 1, 0, 0);
}

export function drawWorldPortrait(kind: string): HTMLCanvasElement {
  const identity = characterKind(kind);
  const cached = portraitCanvases.get(identity);
  if (cached) return cached;
  const [surface, context] = canvas(128, 128, `portrait:${identity}`);
  paintPortrait(context, identity);
  portraitCanvases.set(identity, surface);
  return surface;
}

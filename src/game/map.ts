export interface TilePosition {
  x: number;
  y: number;
}

export type TileKind = 'floor' | 'wall' | 'shelf' | 'table' | 'door' | 'exit';

export interface MapEnemySpawn {
  id: string;
  encounterId: string;
  position: TilePosition;
  regionId: string;
}

export interface MapObject {
  id: string;
  kind: 'potion' | 'service' | 'supply' | 'exit';
  name: string;
  position: TilePosition;
  regionId: string;
}

export interface MapRegion {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MapDoor {
  id: string;
  position: TilePosition;
  requires: string[];
}

export interface StoreMap {
  width: number;
  height: number;
  tiles: TileKind[][];
  start: TilePosition;
  enemies: MapEnemySpawn[];
  objects: MapObject[];
  regions: MapRegion[];
  doors: MapDoor[];
}

/** A fixed 33 × 35 store. Each call owns its mutable map data. */
export function createStoreMap(): StoreMap {
  const width = 33;
  const height = 35;
  const tiles: TileKind[][] = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) =>
      x === 0 || y === 0 || x === width - 1 || y === height - 1 ? 'wall' : 'floor'));
  const fill = (x: number, y: number, w: number, h: number, kind: TileKind): void => {
    for (let row = y; row < y + h; row++) {
      for (let column = x; column < x + w; column++) tiles[row][column] = kind;
    }
  };

  // Full-width partitions prevent walking around progression locks.
  for (const y of [9, 15, 21, 28]) fill(1, y, 31, 1, 'wall');
  fill(12, 1, 1, 8, 'wall');
  fill(20, 1, 1, 8, 'wall');
  tiles[6][12] = 'floor'; // Optional office rejoins the supply route.
  fill(13, 16, 1, 4, 'wall'); // Break room opens onto the shared staff corridor at y=20.

  // Counters and shelf islands leave continuous cross-aisles and room to circle.
  fill(18, 30, 4, 1, 'table');
  fill(25, 32, 3, 1, 'table');
  fill(6, 30, 1, 1, 'table');
  fill(4, 23, 2, 3, 'table');
  fill(8, 23, 2, 3, 'table');
  fill(23, 23, 2, 3, 'shelf');
  fill(28, 23, 2, 3, 'shelf');
  fill(4, 17, 3, 1, 'table');
  fill(8, 19, 2, 1, 'table');
  fill(20, 17, 4, 1, 'table');
  fill(28, 18, 2, 2, 'shelf');
  fill(5, 11, 4, 1, 'shelf');
  fill(5, 13, 4, 1, 'shelf');
  fill(24, 11, 4, 1, 'table');
  fill(24, 13, 4, 1, 'shelf');
  fill(3, 3, 4, 1, 'table');
  fill(3, 6, 2, 1, 'shelf');
  fill(14, 5, 1, 2, 'shelf');
  fill(18, 6, 1, 1, 'table');
  fill(15, 2, 3, 1, 'table');
  fill(23, 2, 2, 2, 'shelf');
  fill(23, 6, 2, 1, 'shelf');
  fill(28, 6, 2, 1, 'shelf');

  // The loading exit has its own shutter, not a victory-triggering floor tile.
  fill(29, 1, 1, 2, 'wall');
  fill(30, 2, 2, 1, 'wall');
  tiles[1][30] = 'exit';

  const doors: MapDoor[] = [
    { id: 'security-west', position: { x: 8, y: 28 }, requires: ['security'] },
    { id: 'security-east', position: { x: 24, y: 28 }, requires: ['security'] },
    // Separate doors express an OR: either front department opens staff access.
    { id: 'checkout-staff', position: { x: 8, y: 21 }, requires: ['checkout'] },
    { id: 'stock-staff', position: { x: 24, y: 21 }, requires: ['stacker'] },
    { id: 'sales-west', position: { x: 8, y: 15 }, requires: ['supervisor'] },
    { id: 'sales-east', position: { x: 24, y: 15 }, requires: ['supervisor'] },
    // Both sales interlocks are mandatory, but share one freely connected floor.
    { id: 'control-office', position: { x: 8, y: 9 }, requires: ['cleaner', 'greeter'] },
    { id: 'supply-corridor', position: { x: 17, y: 9 }, requires: ['cleaner', 'greeter'] },
    { id: 'loading-access', position: { x: 20, y: 6 }, requires: ['cleaner', 'greeter'] },
    { id: 'loading-shutter', position: { x: 30, y: 2 }, requires: ['night-manager'] },
  ];
  for (const door of doors) tiles[door.position.y][door.position.x] = 'door';

  return {
    width,
    height,
    tiles,
    start: { x: 4, y: 32 },
    enemies: [
      { id: 'security', encounterId: 'security', position: { x: 16, y: 30 }, regionId: 'security' },
      { id: 'checkout', encounterId: 'checkout', position: { x: 12, y: 24 }, regionId: 'checkout' },
      { id: 'stacker', encounterId: 'stacker', position: { x: 20, y: 24 }, regionId: 'stacker' },
      { id: 'supervisor', encounterId: 'supervisor', position: { x: 24, y: 19 }, regionId: 'supervisor' },
      { id: 'cleaner', encounterId: 'cleaner', position: { x: 13, y: 12 }, regionId: 'cleaner' },
      { id: 'greeter', encounterId: 'greeter', position: { x: 19, y: 12 }, regionId: 'greeter' },
      { id: 'floor-manager', encounterId: 'floor-manager', position: { x: 8, y: 4 }, regionId: 'floor-manager' },
      { id: 'night-manager', encounterId: 'night-manager', position: { x: 27, y: 4 }, regionId: 'night-manager' },
    ],
    objects: [
      { id: 'entrance-potion', kind: 'potion', name: 'Emergency MORE Tonic', position: { x: 6, y: 30 }, regionId: 'entrance' },
      { id: 'break-room', kind: 'service', name: 'Break Room Repair Station', position: { x: 5, y: 17 }, regionId: 'break-room' },
      { id: 'break-room-potion', kind: 'potion', name: 'Definitely Fresh MORE Tonic', position: { x: 8, y: 19 }, regionId: 'break-room' },
      { id: 'courtesy-potion', kind: 'potion', name: 'Complimentary Courtesy Tonic', position: { x: 25, y: 11 }, regionId: 'greeter' },
      { id: 'supplies', kind: 'supply', name: 'Medical Supplies', position: { x: 18, y: 6 }, regionId: 'supplies' },
      { id: 'preparation', kind: 'service', name: 'Prep Bench', position: { x: 16, y: 2 }, regionId: 'preparation' },
      { id: 'loading-exit', kind: 'exit', name: 'Loading Bay Exit', position: { x: 30, y: 1 }, regionId: 'night-manager' },
    ],
    regions: [
      { id: 'entrance', name: 'MOREMART Entrance', x: 1, y: 29, width: 10, height: 5 },
      { id: 'security', name: 'Security Desk', x: 11, y: 29, width: 21, height: 5 },
      { id: 'checkout', name: 'Express Checkout', x: 1, y: 22, width: 15, height: 7 },
      { id: 'stacker', name: 'Stock Aisles', x: 16, y: 22, width: 16, height: 7 },
      { id: 'break-room', name: 'Break Room', x: 1, y: 16, width: 12, height: 6 },
      { id: 'supervisor', name: 'Staff Access', x: 13, y: 16, width: 19, height: 6 },
      { id: 'cleaner', name: 'Cleaning Bay', x: 1, y: 10, width: 16, height: 6 },
      { id: 'greeter', name: 'Customer Service', x: 17, y: 10, width: 15, height: 6 },
      { id: 'floor-manager', name: 'Control Office', x: 1, y: 1, width: 12, height: 9 },
      { id: 'supplies', name: 'Supply Corridor', x: 13, y: 4, width: 7, height: 6 },
      { id: 'preparation', name: 'Prep Bench', x: 13, y: 1, width: 7, height: 3 },
      { id: 'night-manager', name: 'Loading Bay', x: 20, y: 1, width: 12, height: 9 },
    ],
    doors,
  };
}

function inBounds(map: StoreMap, x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y)
    && x >= 0 && y >= 0 && x < map.width && y < map.height;
}

function passableAt(map: StoreMap, x: number, y: number, defeated: readonly string[]): boolean {
  if (!inBounds(map, x, y)) return false;
  const tile = map.tiles[y]?.[x];
  if (tile === 'floor' || tile === 'exit') return true;
  if (tile !== 'door') return false;
  const door = map.doors.find((candidate) => candidate.position.x === x && candidate.position.y === y);
  return door !== undefined && door.requires.every((id) => defeated.includes(id));
}

/** Furniture is solid; door prerequisites are defeated encounter IDs. */
export function canEnter(map: StoreMap, p: TilePosition, defeated: readonly string[]): boolean {
  return passableAt(map, p.x, p.y, defeated);
}

const CARDINAL = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;

/** Shortest traversable path, excluding the start, in stable up/right/down/left order. */
export function findPath(
  map: StoreMap,
  from: TilePosition,
  to: TilePosition,
  defeated: readonly string[],
  occupied: readonly TilePosition[] = [],
): TilePosition[] | null {
  if (!inBounds(map, from.x, from.y) || !inBounds(map, to.x, to.y)) return null;
  if (from.x === to.x && from.y === to.y) return [];
  if (!canEnter(map, from, defeated) || !canEnter(map, to, defeated)) return null;

  const start = from.y * map.width + from.x;
  const destination = to.y * map.width + to.x;
  const previous = new Int32Array(map.width * map.height).fill(-1);
  for (const p of occupied) {
    if (inBounds(map, p.x, p.y)) previous[p.y * map.width + p.x] = -2;
  }
  if (previous[destination] === -2) return null;
  previous[start] = start; // A caller may include the moving actor in occupancy.
  const queue = new Int32Array(previous.length);
  queue[0] = start;
  let length = 1;
  for (let head = 0; head < length; head++) {
    const current = queue[head];
    const x = current % map.width;
    const y = Math.floor(current / map.width);
    for (const [dx, dy] of CARDINAL) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(map, nx, ny)) continue;
      const next = ny * map.width + nx;
      if (previous[next] !== -1 || !passableAt(map, nx, ny, defeated)) continue;
      previous[next] = current;
      if (next === destination) {
        const path: TilePosition[] = [];
        for (let step = destination; step !== start; step = previous[step]) {
          path.push({ x: step % map.width, y: Math.floor(step / map.width) });
        }
        return path.reverse();
      }
      queue[length++] = next;
    }
  }
  return null;
}

/** Center-to-center supercover ray: no sight through furniture or diagonal wall corners. */
export function hasLineOfSight(
  map: StoreMap,
  from: TilePosition,
  to: TilePosition,
  defeated: readonly string[],
): boolean {
  if (!canEnter(map, from, defeated) || !canEnter(map, to, defeated)) return false;
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  const sx = Math.sign(to.x - from.x);
  const sy = Math.sign(to.y - from.y);
  let x = from.x;
  let y = from.y;
  let ix = 0;
  let iy = 0;
  while (ix < dx || iy < dy) {
    const crossing = (1 + 2 * ix) * dy - (1 + 2 * iy) * dx;
    if (crossing === 0) {
      if (!passableAt(map, x + sx, y, defeated) || !passableAt(map, x, y + sy, defeated)) return false;
      x += sx;
      y += sy;
      ix++;
      iy++;
    } else if (crossing < 0) {
      x += sx;
      ix++;
    } else {
      y += sy;
      iy++;
    }
    if (!passableAt(map, x, y, defeated)) return false;
  }
  return true;
}

export function regionAt(map: StoreMap, p: TilePosition): MapRegion | undefined {
  if (!inBounds(map, p.x, p.y)) return undefined;
  return map.regions.find((region) => p.x >= region.x && p.y >= region.y
    && p.x < region.x + region.width && p.y < region.y + region.height);
}

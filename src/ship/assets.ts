import spacefieldUrl from '../assets/ship/backgrounds/viewscreen-spacefield.png';
import corsairUrl from '../assets/ship/ships/sable-corsair.png';
import needleUrl from '../assets/ship/ships/needle-drone.png';
import bulwarkUrl from '../assets/ship/ships/bulwark-tug.png';
import pulseUrl from '../assets/ship/cards/pulse-cannon.png';
import shieldUrl from '../assets/ship/cards/shield-cycle.png';
import lanceUrl from '../assets/ship/cards/rail-lance.png';
import cellUrl from '../assets/ship/cards/reserve-cell.png';
import sweepUrl from '../assets/ship/cards/tactical-sweep.png';
import burstUrl from '../assets/ship/cards/twin-burst.png';
import type { EnemyShip, ShipBaseCardId, ShipCardId } from './types';

interface ShipArtwork {
  spacefield: HTMLImageElement;
  enemies: Record<EnemyShip['role'], HTMLImageElement>;
  cards: Record<ShipBaseCardId, HTMLImageElement>;
}

// Decoded source images belong to the document; scene-owned textures remain separate.
let artwork: ShipArtwork | undefined;
let preload: Promise<void> | undefined;

async function decodeArtwork(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
  } catch (cause) {
    throw new Error(`Unable to load ship artwork: ${url}`, { cause });
  }
  return image;
}

async function loadArtwork(): Promise<void> {
  const [spacefield, corsair, needle, bulwark, pulse, shield, lance, cell, sweep, burst] = await Promise.all([
    decodeArtwork(spacefieldUrl),
    decodeArtwork(corsairUrl),
    decodeArtwork(needleUrl),
    decodeArtwork(bulwarkUrl),
    decodeArtwork(pulseUrl),
    decodeArtwork(shieldUrl),
    decodeArtwork(lanceUrl),
    decodeArtwork(cellUrl),
    decodeArtwork(sweepUrl),
    decodeArtwork(burstUrl),
  ]);
  // Publish only a complete decoded set, never a partially loaded Canvas source.
  artwork = {
    spacefield,
    enemies: { corsair, needle, bulwark },
    cards: { pulse, shield, lance, cell, sweep, burst },
  };
}

export function preloadShipArtwork(): Promise<void> {
  return preload ??= loadArtwork();
}

function requireArtwork(): ShipArtwork {
  if (!artwork) throw new Error('Ship artwork is not loaded. Await preloadShipArtwork() before composing the scene.');
  return artwork;
}

export function getShipSpacefield(): HTMLImageElement {
  return requireArtwork().spacefield;
}

export function getEnemyShipArtwork(role: EnemyShip['role']): HTMLImageElement {
  return requireArtwork().enemies[role];
}

export function getCardActionArtwork(id: ShipCardId): HTMLImageElement | undefined {
  if (id.startsWith('research:') || id.startsWith('crew:')) return undefined;
  return requireArtwork().cards[id as ShipBaseCardId];
}

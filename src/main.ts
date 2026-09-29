import { createShipScene } from './ship/scene';
import { mountKestrel } from './ship/shell';
import { SHIP_DESIGN, type ShipGamePort } from './ship/types';
import type { ExpeditionScene } from './ship/expedition-types';
import { registerShipApp } from './ship/pwa';
import { preloadShipArtwork } from './ship/assets';
import './ship/style.css';

const shell = document.querySelector<HTMLElement>('#game-shell')!;
const stage = document.querySelector<HTMLElement>('#game-stage')!;
const canvas = document.querySelector<HTMLCanvasElement>('#arena')!;
const hud = document.querySelector<HTMLElement>('#hud')!;

let scene: ExpeditionScene | undefined;
let game: ShipGamePort | undefined;
let disposed = false;
let releaseApp: (() => void) | undefined;

stage.style.setProperty('--ship-design-width', `${SHIP_DESIGN.width}px`);
stage.style.setProperty('--ship-design-height', `${SHIP_DESIGN.height}px`);

function resize(): void {
  const bodyStyle = getComputedStyle(document.body);
  const viewport = window.visualViewport;
  // Pinch zoom must magnify the board, not trigger a compensating shrink.
  const viewportWidth = viewport?.scale === 1 ? Math.min(window.innerWidth, viewport.width) : window.innerWidth;
  const viewportHeight = viewport?.scale === 1 ? Math.min(window.innerHeight, viewport.height) : window.innerHeight;
  const width = Math.max(1, viewportWidth - parseFloat(bodyStyle.paddingLeft) - parseFloat(bodyStyle.paddingRight));
  const height = Math.max(1, viewportHeight - parseFloat(bodyStyle.paddingTop) - parseFloat(bodyStyle.paddingBottom));
  const scale = Math.min(width / SHIP_DESIGN.width, height / SHIP_DESIGN.height);
  shell.style.width = `${SHIP_DESIGN.width * scale}px`;
  shell.style.height = `${SHIP_DESIGN.height * scale}px`;
  stage.style.setProperty('--ship-scale', String(scale));
  stage.style.transform = `scale(${scale})`;
  scene?.resize(SHIP_DESIGN.width * scale, SHIP_DESIGN.height * scale);
}

function dispose(): void {
  if (disposed) return;
  disposed = true;
  releaseApp?.();
  game?.destroy();
  scene?.destroy();
  window.removeEventListener('resize', resize);
  window.visualViewport?.removeEventListener('resize', resize);
  window.removeEventListener('pageshow', resize);
  window.removeEventListener('pagehide', onPageHide);
}

function onPageHide(event: PageTransitionEvent): void {
  // Safari can restore this exact document from its back-forward cache.
  if (!event.persisted) dispose();
}

resize();
window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);
window.addEventListener('pageshow', resize);
window.addEventListener('pagehide', onPageHide);
import.meta.hot?.dispose(dispose);

async function start(): Promise<void> {
  try {
    await Promise.all([
      Promise.allSettled([
        document.fonts.load('700 24px "Barlow Condensed"'),
        document.fonts.load('24px "Bebas Neue"'),
      ]),
      preloadShipArtwork(),
    ]);
    if (disposed) return;
    scene = createShipScene(canvas);
    resize();
    game = mountKestrel(hud, scene);
    releaseApp = registerShipApp();
  } catch (error) {
    game?.destroy();
    scene?.destroy();
    if (disposed) return;
    console.error('Unable to open the expedition', error);
    hud.innerHTML = '<section class="startup-error"><h1>Could not open the expedition</h1><p>Check your connection and browser hardware acceleration, then reload.</p><button type="button" id="retry-start">Try again</button></section>';
    hud.querySelector('#retry-start')?.addEventListener('click', () => location.reload(), { once: true });
  }
}
void start();

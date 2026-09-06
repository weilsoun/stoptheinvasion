import { createScene } from './view/scene';
import { mountGame, type GamePort } from './ui';
import { preloadCardArt } from './view/art';
import type { ScenePort } from './view/types';
import './style.css';

const shell = document.querySelector<HTMLElement>('#game-shell')!;
const stage = document.querySelector<HTMLElement>('#game-stage')!;
const canvas = document.querySelector<HTMLCanvasElement>('#arena')!;
const hud = document.querySelector<HTMLElement>('#hud')!;

function resize(): void {
  const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  shell.style.width = `${1920 * scale}px`;
  shell.style.height = `${1080 * scale}px`;
  stage.style.transform = `scale(${scale})`;
}
resize();
window.addEventListener('resize', resize);

let scene: ScenePort | undefined;
let game: GamePort | undefined;
let disposed = false;
window.addEventListener('pagehide', () => {
  disposed = true;
  game?.destroy();
  scene?.destroy();
  window.removeEventListener('resize', resize);
}, { once: true });

async function start(): Promise<void> {
  try {
    await preloadCardArt();
    if (disposed) return;
    scene = createScene(canvas);
    game = mountGame(hud, scene);
  } catch (error) {
    scene?.destroy();
    if (disposed) return;
    console.error('Unable to load the combat arena', error);
    hud.innerHTML = '<section class="startup-error"><h1>Could not open the arena</h1><p>Check your connection and that browser hardware acceleration is enabled, then reload.</p><button onclick="location.reload()">Try again</button></section>';
  }
}
void start();

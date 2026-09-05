import { createScene } from './view/scene';
import { mountGame } from './ui';
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

try {
  const scene = createScene(canvas);
  const game = mountGame(hud, scene);
  window.addEventListener('pagehide', () => {
    game.destroy();
    scene.destroy();
    window.removeEventListener('resize', resize);
  }, { once: true });
} catch (error) {
  console.error('Unable to start Stop the Invasion', error);
  hud.innerHTML = '<section class="startup-error"><h1>Could not open the arena</h1><p>This game needs a browser with WebGL support. Check that hardware acceleration is enabled, then reload.</p><button onclick="location.reload()">Try again</button></section>';
}

import type { Direction } from './game/types';

export interface GamepadActions {
  canAct(): boolean;
  move(direction: Direction): void;
  navigate(direction: 1 | -1): void;
  zoom(direction: 1 | -1): void;
  toggleMenu(): void;
}

export interface GamepadSnapshot {
  select: boolean;
  l1: boolean;
  r1: boolean;
  dpadUp: boolean;
  dpadDown: boolean;
  dpadLeft: boolean;
  dpadRight: boolean;
  start: boolean;
}

export type GamepadIntent =
  | { type: 'move'; direction: Direction }
  | { type: 'navigate'; direction: 1 | -1 }
  | { type: 'zoom'; direction: 1 | -1 }
  | { type: 'toggleMenu' };
type RepeatingIntent =
  | { type: 'move'; direction: Direction }
  | { type: 'navigate'; direction: 1 | -1 };


export interface GamepadInputState {
  armed: boolean;
  actionArmed: boolean;
  start: boolean;
  zoomDirection: 1 | 0 | -1;
  action: string | null;
  repeatAt: number;
}

const REPEAT_DELAY = 350;
const REPEAT_INTERVAL = 150;

export function createGamepadInputState(): GamepadInputState {
  return {
    armed: true,
    actionArmed: true,
    start: false,
    zoomDirection: 0,
    action: null,
    repeatAt: 0,
  };
}

function controlsReleased(input: GamepadSnapshot): boolean {
  return !input.select && !input.l1 && !input.r1 && !input.dpadUp && !input.dpadDown && !input.dpadLeft && !input.dpadRight;
}

function zoomDirection(input: GamepadSnapshot): 1 | 0 | -1 {
  if (!input.select || input.l1 === input.r1) return 0;
  return input.r1 ? 1 : -1;
}

function dpadDirection(input: GamepadSnapshot): Direction | null {
  const horizontal = Number(input.dpadRight) - Number(input.dpadLeft);
  const vertical = Number(input.dpadDown) - Number(input.dpadUp);
  if ((horizontal === 0) === (vertical === 0)) return null;
  if (horizontal) return horizontal > 0 ? 'right' : 'left';
  return vertical > 0 ? 'down' : 'up';
}

function actionIntent(input: GamepadSnapshot): RepeatingIntent | null {
  const direction = dpadDirection(input);
  if (!direction) return null;
  if (input.select) {
    if (direction === 'left' || direction === 'right') {
      return { type: 'navigate', direction: direction === 'right' ? 1 : -1 };
    }
    return null;
  }
  return { type: 'move', direction };
}

function actionKey(intent: RepeatingIntent | null): string | null {
  if (!intent) return null;
  return intent.type === 'move' ? `move:${intent.direction}` : `navigate:${intent.direction}`;
}

export function stepGamepadInput(
  state: GamepadInputState,
  input: GamepadSnapshot | null,
  now: number,
  canAct: boolean,
): { state: GamepadInputState; intents: GamepadIntent[] } {
  if (!input) {
    return {
      state: { ...createGamepadInputState(), armed: false, actionArmed: false },
      intents: [],
    };
  }

  if (!state.armed) {
    if (input.start || !controlsReleased(input)) {
      return { state: { ...state, start: input.start }, intents: [] };
    }
    return { state: createGamepadInputState(), intents: [] };
  }

  const zoom = zoomDirection(input);
  const intent = actionIntent(input);
  const key = actionKey(intent);
  const startPressed = input.start && !state.start;
  let actionArmed = state.actionArmed;
  if (!canAct) actionArmed = controlsReleased(input);
  else if (!actionArmed && controlsReleased(input)) actionArmed = true;

  const nextState: GamepadInputState = {
    armed: true,
    actionArmed,
    start: input.start,
    zoomDirection: zoom,
    action: key,
    repeatAt: actionArmed && key ? (key === state.action ? state.repeatAt : now + REPEAT_DELAY) : 0,
  };

  if (startPressed) {
    nextState.actionArmed = controlsReleased(input);
    nextState.repeatAt = 0;
    return { state: nextState, intents: [{ type: 'toggleMenu' }] };
  }
  if (!canAct || !actionArmed) return { state: nextState, intents: [] };

  const intents: GamepadIntent[] = [];
  if (zoom && zoom !== state.zoomDirection) intents.push({ type: 'zoom', direction: zoom });
  if (intent) {
    if (key !== state.action) intents.push(intent);
    else if (now >= state.repeatAt) {
      intents.push(intent);
      nextState.repeatAt = now + REPEAT_INTERVAL;
    }
  }
  return { state: nextState, intents };
}

function snapshot(gamepad: Gamepad): GamepadSnapshot {
  const pressed = (index: number) => gamepad.buttons[index]?.pressed === true;
  return {
    select: pressed(8),
    l1: pressed(4),
    r1: pressed(5),
    dpadUp: pressed(12),
    dpadDown: pressed(13),
    dpadLeft: pressed(14),
    dpadRight: pressed(15),
    start: pressed(9),
  };
}

export function mountGamepad(actions: GamepadActions): () => void {
  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    typeof navigator === 'undefined' ||
    typeof navigator.getGamepads !== 'function' ||
    window.isSecureContext === false
  ) return () => {};

  const controller = new AbortController();
  let running = true;
  let frame = 0;
  let selectedGamepadIndex: number | null = null;
  let state = createGamepadInputState();
  let pageActive = document.visibilityState !== 'hidden' && document.hasFocus();
  const resetInput = () => { state = stepGamepadInput(state, null, performance.now(), false).state; };
  const deactivate = () => { pageActive = false; resetInput(); };
  const activate = () => { pageActive = document.visibilityState !== 'hidden' && document.hasFocus(); };
  const onVisibilityChange = () => document.visibilityState === 'hidden' ? deactivate() : activate();
  const onDisconnect = (event: GamepadEvent) => {
    if (event.gamepad.index !== selectedGamepadIndex) return;
    selectedGamepadIndex = null;
    resetInput();
  };

  window.addEventListener('blur', deactivate, { signal: controller.signal });
  window.addEventListener('focus', activate, { signal: controller.signal });
  window.addEventListener('gamepaddisconnected', onDisconnect, { signal: controller.signal });
  document.addEventListener('visibilitychange', onVisibilityChange, { signal: controller.signal });

  const poll = (now: number) => {
    if (!running) return;
    let gamepad: Gamepad | null = null;
    try {
      const gamepads = navigator.getGamepads();
      gamepad = gamepads.find((candidate) => candidate?.connected && candidate.index === selectedGamepadIndex && candidate.mapping === 'standard')
        ?? gamepads.find((candidate) => candidate?.connected && candidate.mapping === 'standard') ?? null;
      if (gamepad && selectedGamepadIndex !== null && gamepad.index !== selectedGamepadIndex) resetInput();
      selectedGamepadIndex = gamepad?.index ?? null;
    } catch {
      running = false;
      controller.abort();
      return;
    }

    const input = pageActive && gamepad ? snapshot(gamepad) : null;
    const result = stepGamepadInput(state, input, now, input ? actions.canAct() : false);
    state = result.state;
    for (const intent of result.intents) {
      if (intent.type === 'toggleMenu') actions.toggleMenu();
      else if (intent.type === 'zoom') actions.zoom(intent.direction);
      else if (intent.type === 'navigate') actions.navigate(intent.direction);
      else actions.move(intent.direction);
      if (!running) break;
    }
    if (running) frame = requestAnimationFrame(poll);
  };

  frame = requestAnimationFrame(poll);
  return () => {
    if (!running) return;
    running = false;
    cancelAnimationFrame(frame);
    controller.abort();
  };
}

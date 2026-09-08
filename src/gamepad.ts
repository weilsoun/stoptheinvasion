export interface GamepadActions {
  canNavigate(): boolean;
  navigate(direction: 1 | -1): void;
  zoom(direction: 1 | -1): void;
  toggleMenu(): void;
}

export interface GamepadSnapshot {
  select: boolean;
  l1: boolean;
  r1: boolean;
  dpadLeft: boolean;
  dpadRight: boolean;
  start: boolean;
}

export type GamepadIntent =
  | { type: 'navigate'; direction: 1 | -1 }
  | { type: 'zoom'; direction: 1 | -1 }
  | { type: 'toggleMenu' };

export interface GamepadInputState {
  armed: boolean;
  navigationArmed: boolean;
  start: boolean;
  zoomDirection: 1 | 0 | -1;
  navigationDirection: 1 | 0 | -1;
  repeatAt: number;
}

const NAVIGATION_REPEAT_DELAY = 350;
const NAVIGATION_REPEAT_INTERVAL = 150;

export function createGamepadInputState(): GamepadInputState {
  return {
    armed: true,
    navigationArmed: true,
    start: false,
    zoomDirection: 0,
    navigationDirection: 0,
    repeatAt: 0,
  };
}

function navigationIsReleased(input: GamepadSnapshot): boolean {
  return !input.select && !input.l1 && !input.r1 && !input.dpadLeft && !input.dpadRight;
}

function zoomDirection(input: GamepadSnapshot): 1 | 0 | -1 {
  if (!input.select || input.l1 === input.r1) return 0;
  return input.r1 ? 1 : -1;
}

function navigationDirection(input: GamepadSnapshot): 1 | 0 | -1 {
  if (!input.select || input.dpadLeft === input.dpadRight) return 0;
  return input.dpadLeft ? 1 : -1;
}

export function stepGamepadInput(
  state: GamepadInputState,
  input: GamepadSnapshot | null,
  now: number,
  canNavigate: boolean,
): { state: GamepadInputState; intents: GamepadIntent[] } {
  if (!input) {
    return {
      state: { ...createGamepadInputState(), armed: false, navigationArmed: false },
      intents: [],
    };
  }

  if (!state.armed) {
    if (input.start || !navigationIsReleased(input)) {
      return { state: { ...state, start: input.start }, intents: [] };
    }
    return { state: createGamepadInputState(), intents: [] };
  }

  const nextZoom = zoomDirection(input);
  const nextNavigation = navigationDirection(input);
  const startPressed = input.start && !state.start;
  let navigationArmed = state.navigationArmed;

  if (!canNavigate) navigationArmed = navigationIsReleased(input);
  else if (!navigationArmed && navigationIsReleased(input)) navigationArmed = true;

  const nextState: GamepadInputState = {
    armed: true,
    navigationArmed,
    start: input.start,
    zoomDirection: nextZoom,
    navigationDirection: nextNavigation,
    repeatAt:
      navigationArmed && nextNavigation !== 0
        ? nextNavigation === state.navigationDirection
          ? state.repeatAt
          : now + NAVIGATION_REPEAT_DELAY
        : 0,
  };

  if (startPressed) {
    nextState.navigationArmed = navigationIsReleased(input);
    nextState.repeatAt = 0;
    return { state: nextState, intents: [{ type: 'toggleMenu' }] };
  }

  if (!canNavigate || !navigationArmed) return { state: nextState, intents: [] };

  const intents: GamepadIntent[] = [];
  if (nextZoom !== 0 && nextZoom !== state.zoomDirection) {
    intents.push({ type: 'zoom', direction: nextZoom });
  }
  if (nextNavigation !== 0) {
    if (nextNavigation !== state.navigationDirection) {
      intents.push({ type: 'navigate', direction: nextNavigation });
    } else if (now >= state.repeatAt) {
      intents.push({ type: 'navigate', direction: nextNavigation });
      nextState.repeatAt = now + NAVIGATION_REPEAT_INTERVAL;
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
  ) {
    return () => {};
  }

  const controller = new AbortController();
  let running = true;
  let frame = 0;
  let selectedGamepadIndex: number | null = null;
  let state = createGamepadInputState();
  let pageActive = document.visibilityState !== 'hidden' && document.hasFocus();

  const resetInput = () => {
    state = stepGamepadInput(state, null, performance.now(), false).state;
  };
  const deactivate = () => {
    pageActive = false;
    resetInput();
  };
  const activate = () => {
    pageActive = document.visibilityState !== 'hidden' && document.hasFocus();
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') deactivate();
    else activate();
  };
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
      gamepad =
        gamepads.find((candidate) => candidate?.connected && candidate.index === selectedGamepadIndex && candidate.mapping === 'standard') ??
        gamepads.find((candidate) => candidate?.connected && candidate.mapping === 'standard') ??
        null;
      if (gamepad && selectedGamepadIndex !== null && gamepad.index !== selectedGamepadIndex) resetInput();
      selectedGamepadIndex = gamepad?.index ?? null;
    } catch {
      running = false;
      controller.abort();
      return;
    }

    const input = pageActive && gamepad ? snapshot(gamepad) : null;
    const result = stepGamepadInput(
      state,
      input,
      now,
      input ? actions.canNavigate() : false,
    );
    state = result.state;
    for (const intent of result.intents) {
      if (intent.type === 'toggleMenu') actions.toggleMenu();
      else if (intent.type === 'zoom') actions.zoom(intent.direction);
      else actions.navigate(intent.direction);
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

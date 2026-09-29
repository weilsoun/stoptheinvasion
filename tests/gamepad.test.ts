import { describe, expect, test } from 'bun:test';
import {
  createGamepadInputState,
  stepGamepadInput,
  type GamepadInputState,
  type GamepadSnapshot,
} from '../src/gamepad';

const RELEASED: GamepadSnapshot = {
  select: false,
  l1: false,
  r1: false,
  dpadUp: false,
  dpadDown: false,
  dpadLeft: false,
  dpadRight: false,
  start: false,
};

function step(state: GamepadInputState, input: Partial<GamepadSnapshot> | null, now = 0, canAct = true) {
  return stepGamepadInput(state, input && { ...RELEASED, ...input }, now, canAct);
}

describe('standard world gamepad input', () => {
  test('bare D-pad moves cardinally and repeats after the shared delay', () => {
    let state = createGamepadInputState();
    let result = step(state, { dpadUp: true }, 0);
    expect(result.intents).toEqual([{ type: 'move', direction: 'up' }]);
    state = result.state;

    result = step(state, { dpadUp: true }, 349);
    expect(result.intents).toEqual([]);
    state = result.state;

    result = step(state, { dpadUp: true }, 350);
    expect(result.intents).toEqual([{ type: 'move', direction: 'up' }]);
    state = result.state;

    result = step(state, { dpadUp: true }, 499);
    expect(result.intents).toEqual([]);
    state = result.state;

    result = step(state, { dpadUp: true }, 500);
    expect(result.intents).toEqual([{ type: 'move', direction: 'up' }]);
  });

  test('opposed and diagonal D-pad input is neutral', () => {
    let state = createGamepadInputState();
    let result = step(state, { dpadLeft: true, dpadRight: true });
    expect(result.intents).toEqual([]);
    state = result.state;

    result = step(state, { dpadUp: true, dpadRight: true });
    expect(result.intents).toEqual([]);
  });

  test('Select changes horizontal D-pad into timeline navigation', () => {
    let state = createGamepadInputState();
    let result = step(state, { select: true, dpadLeft: true });
    expect(result.intents).toEqual([{ type: 'navigate', direction: -1 }]);
    state = result.state;

    result = step(state, { select: true });
    state = result.state;
    result = step(state, { select: true, dpadRight: true });
    expect(result.intents).toEqual([{ type: 'navigate', direction: 1 }]);

    result = step(result.state, { select: true, dpadUp: true });
    expect(result.intents).toEqual([]);
  });

  test('Select shoulder zoom is unambiguous and edge-triggered', () => {
    let state = createGamepadInputState();
    let result = step(state, { select: true, l1: true });
    expect(result.intents).toEqual([{ type: 'zoom', direction: -1 }]);
    state = result.state;

    result = step(state, { select: true, l1: true }, 1_000);
    expect(result.intents).toEqual([]);
    state = result.state;

    result = step(state, { select: true, l1: true, r1: true });
    expect(result.intents).toEqual([]);
  });

  test('Start wins over simultaneous actions and is edge-triggered', () => {
    let state = createGamepadInputState();
    let result = step(state, { start: true, dpadRight: true });
    expect(result.intents).toEqual([{ type: 'toggleMenu' }]);
    state = result.state;

    result = step(state, { start: true, dpadRight: true }, 1_000);
    expect(result.intents).toEqual([]);
  });

  test('modal-blocked input is consumed until controls are released', () => {
    let state = createGamepadInputState();
    let result = step(state, { dpadRight: true }, 0, false);
    expect(result.intents).toEqual([]);
    state = result.state;

    result = step(state, { dpadRight: true }, 1_000, true);
    expect(result.intents).toEqual([]);
    state = result.state;

    result = step(state, {}, 1_001, true);
    state = result.state;
    result = step(state, { dpadRight: true }, 1_002, true);
    expect(result.intents).toEqual([{ type: 'move', direction: 'right' }]);
  });

  test('blur or disconnect rearms only after every relevant control is released', () => {
    let state = step(createGamepadInputState(), null).state;
    let result = step(state, { dpadDown: true });
    expect(result.intents).toEqual([]);
    expect(result.state.armed).toBe(false);
    state = result.state;

    result = step(state, {});
    expect(result.intents).toEqual([]);
    expect(result.state.armed).toBe(true);
    state = result.state;

    result = step(state, { dpadDown: true });
    expect(result.intents).toEqual([{ type: 'move', direction: 'down' }]);
  });
});

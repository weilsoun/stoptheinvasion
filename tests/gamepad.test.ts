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
  dpadLeft: false,
  dpadRight: false,
  start: false,
};

function step(
  state: GamepadInputState,
  input: Partial<GamepadSnapshot> | null,
  now = 0,
  canNavigate = true,
) {
  return stepGamepadInput(state, input && { ...RELEASED, ...input }, now, canNavigate);
}

describe('standard gamepad input state', () => {
  test('zoom requires an unambiguous Select shoulder chord and fires on its edge only', () => {
    let state = createGamepadInputState();

    let result = step(state, { l1: true });
    expect(result.intents).toEqual([]);
    state = result.state;

    result = step(state, { select: true, l1: true, r1: true });
    expect(result.intents).toEqual([]);
    state = result.state;

    result = step(state, { select: true, l1: true });
    expect(result.intents).toEqual([{ type: 'zoom', direction: -1 }]);
    state = result.state;

    result = step(state, { select: true, l1: true }, 1_000);
    expect(result.intents).toEqual([]);
    state = result.state;

    result = step(state, { select: true });
    state = result.state;
    result = step(state, { select: true, r1: true });
    expect(result.intents).toEqual([{ type: 'zoom', direction: 1 }]);
  });

  test('Select plus D-pad navigates immediately, repeats after the delay, and neutralizes opposition', () => {
    let state = createGamepadInputState();

    let result = step(state, { dpadLeft: true }, 99);
    expect(result.intents).toEqual([]);
    state = result.state;

    result = step(state, { select: true, dpadLeft: true }, 100);
    expect(result.intents).toEqual([{ type: 'navigate', direction: 1 }]);
    state = result.state;

    result = step(state, { select: true, dpadLeft: true }, 449);
    expect(result.intents).toEqual([]);
    state = result.state;

    result = step(state, { select: true, dpadLeft: true }, 450);
    expect(result.intents).toEqual([{ type: 'navigate', direction: 1 }]);
    state = result.state;

    result = step(state, { select: true, dpadLeft: true }, 599);
    expect(result.intents).toEqual([]);
    state = result.state;

    result = step(state, { select: true, dpadLeft: true }, 600);
    expect(result.intents).toEqual([{ type: 'navigate', direction: 1 }]);
    state = result.state;

    result = step(state, { select: true, dpadLeft: true, dpadRight: true }, 700);
    expect(result.intents).toEqual([]);
    state = result.state;

    result = step(state, { select: true, dpadRight: true }, 701);
    expect(result.intents).toEqual([{ type: 'navigate', direction: -1 }]);
  });

  test('Start wins over simultaneous chords and remains edge-triggered', () => {
    let state = createGamepadInputState();

    let result = step(state, { select: true, r1: true, dpadLeft: true, start: true });
    expect(result.intents).toEqual([{ type: 'toggleMenu' }]);
    state = result.state;

    result = step(state, { select: true, r1: true, dpadLeft: true, start: true }, 1_000);
    expect(result.intents).toEqual([]);
    state = result.state;

    result = step(state, RELEASED, 1_001);
    state = result.state;
    result = step(state, { start: true }, 1_002, false);
    expect(result.intents).toEqual([{ type: 'toggleMenu' }]);
  });

  test('blocked navigation is consumed and cannot replay when the modal closes', () => {
    let state = createGamepadInputState();

    let result = step(state, { select: true, dpadLeft: true, r1: true }, 0, false);
    expect(result.intents).toEqual([]);
    state = result.state;

    result = step(state, { select: true, dpadLeft: true, r1: true }, 1_000, true);
    expect(result.intents).toEqual([]);
    state = result.state;

    result = step(state, RELEASED, 1_001, true);
    state = result.state;
    result = step(state, { select: true, dpadLeft: true }, 1_002, true);
    expect(result.intents).toEqual([{ type: 'navigate', direction: 1 }]);
  });

  test('blur or disconnect requires relevant buttons to be released before rearming', () => {
    let state = createGamepadInputState();
    state = step(state, null).state;

    let result = step(state, { select: true, l1: true, start: true }, 1_000);
    expect(result.intents).toEqual([]);
    state = result.state;

    result = step(state, RELEASED, 1_001);
    expect(result.intents).toEqual([]);
    state = result.state;

    result = step(state, { select: true, l1: true }, 1_002);
    expect(result.intents).toEqual([{ type: 'zoom', direction: -1 }]);
  });
});

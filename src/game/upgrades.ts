import type { CardDefinition, Effect, UpgradeScaling } from './types';

type Scalable = {
  effects: Effect[];
  description: string;
  scaling?: UpgradeScaling;
  time?: CardDefinition['time'];
};

function integer(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer.`);
  return value;
}

function scaledInteger(base: number, step: number, level: number, label: string): number {
  integer(base, `${label} base`);
  integer(step, `${label} scaling`);
  const value = base + step * level;
  return integer(value, `Scaled ${label}`);
}

function scaledTime(base: Scalable, level: number): CardDefinition['time'] {
  const scaling = base.scaling?.time;
  if (!scaling) return base.time;
  if (!base.time) throw new Error('Time scaling requires a base time mechanic.');
  const amount = Math.max(0, scaledInteger(base.time.amount, scaling.amount, level, 'time'));
  return amount === base.time.amount ? base.time : { ...base.time, amount };
}

function scaledEffects(base: Scalable, level: number): Effect[] {
  const steps = base.scaling?.effects;
  if (!steps) return base.effects;
  for (let index = base.effects.length; index < steps.length; index += 1) {
    if (steps[index] !== undefined) throw new Error(`Upgrade scaling references missing effect ${index}.`);
  }
  return base.effects.map((effect, index) => {
    const step = steps[index];
    if (step === undefined) return effect;
    const amount = Math.max(0, scaledInteger(effect.amount, step, level, `effect ${index}`));
    return amount === effect.amount ? effect : { ...effect, amount };
  });
}

function scaledDescription(base: Scalable, effects: Effect[], time: CardDefinition['time']): string {
  const template = base.scaling!.description;
  if (typeof template !== 'string' || template.length === 0) throw new Error('Upgrade description template is missing.');
  const description = template.replace(/\{([^{}]+)\}/g, (token, key: string) => {
    if (key.startsWith('effect:')) {
      const indexText = key.slice('effect:'.length);
      if (!/^\d+$/.test(indexText)) throw new Error(`Invalid upgrade token ${token}.`);
      const effect = effects[Number(indexText)];
      if (!effect) throw new Error(`Upgrade token references missing effect ${indexText}.`);
      return String(effect.amount);
    }
    if (key === 'time') {
      if (!time) throw new Error('Upgrade token references missing time.');
      return String(time.amount);
    }
    throw new Error(`Unknown upgrade token ${token}.`);
  });
  if (/[{}]/.test(description)) throw new Error('Malformed upgrade description template.');
  return description;
}

export function applyUpgrade<T extends Scalable>(base: T, level: number): T {
  integer(level, 'Upgrade level');
  if (level === 0) return base;
  if (!base.scaling) throw new Error('Cannot apply an upgrade without authored scaling.');
  const effects = scaledEffects(base, level);
  const time = scaledTime(base, level);
  return {
    ...base,
    effects,
    ...(base.time === undefined ? {} : { time }),
    description: scaledDescription(base, effects, time),
  };
}

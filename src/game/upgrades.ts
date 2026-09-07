import type { CardDefinition, Effect, UpgradeScaling } from './types';

type Scalable = {
  effects: Effect[];
  description: string;
  scaling?: UpgradeScaling;
  bracket?: CardDefinition['bracket'];
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


function scaleBracket(base: Scalable, level: number, label: string): CardDefinition['bracket'] {
  const scaling = base.scaling;
  if (!scaling) throw new Error(`${label} has no upgrade scaling.`);
  const bracketScaling = scaling.bracket;
  if (!bracketScaling) return base.bracket;
  if (!base.bracket) throw new Error(`${label} has bracket scaling without a base bracket.`);

  const bracket = { ...base.bracket };
  if (bracketScaling.positions !== undefined) {
    if (base.bracket.positions === undefined || base.bracket.positions === 0) {
      throw new Error(`${label} has position scaling without a signed base value.`);
    }
    const value = scaledInteger(base.bracket.positions, bracketScaling.positions, level, `${label} positions`);
    bracket.positions = base.bracket.positions > 0 ? Math.max(0, value) : Math.min(0, value);
  }
  if (bracketScaling.scouting !== undefined) {
    if (base.bracket.scouting === undefined) throw new Error(`${label} has scouting scaling without a base value.`);
    bracket.scouting = Math.max(0, scaledInteger(
      base.bracket.scouting,
      bracketScaling.scouting,
      level,
      `${label} scouting`,
    ));
  }
  return bracket;
}

export function scaledBracket(base: CardDefinition, level: number): CardDefinition['bracket'] {
  integer(level, 'Upgrade level');
  return level === 0 ? base.bracket : scaleBracket(base, level, base.name);
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

function scaledDescription(base: Scalable, effects: Effect[], bracket: CardDefinition['bracket']): string {
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
    if (key === 'positions') {
      if (bracket?.positions === undefined) throw new Error('Upgrade token references missing positions.');
      return String(Math.abs(bracket.positions));
    }
    if (key === 'scouting') {
      if (bracket?.scouting === undefined) throw new Error('Upgrade token references missing scouting.');
      return String(bracket.scouting);
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
  const bracket = scaleBracket(base, level, 'Card');
  return {
    ...base,
    effects,
    ...(base.bracket === undefined ? {} : { bracket }),
    description: scaledDescription(base, effects, bracket),
  };
}

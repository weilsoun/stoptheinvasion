import { PRESENTATION_SAVE_KEY } from './expedition-content';
import type { PresentationSettings, ResolvedPresentation } from './expedition-types';

export const DEFAULT_PRESENTATION: Readonly<PresentationSettings> = Object.freeze({
  motion: 'system',
  effects: 'full',
});

export interface PresentationLoad {
  settings: PresentationSettings;
  error: string;
}

function isSettings(value: unknown): value is PresentationSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return Object.keys(candidate).length === 2
    && (candidate.motion === 'system' || candidate.motion === 'reduced' || candidate.motion === 'full')
    && (candidate.effects === 'full' || candidate.effects === 'subtle' || candidate.effects === 'off');
}

export function loadPresentationSettings(): PresentationLoad {
  try {
    const saved = localStorage.getItem(PRESENTATION_SAVE_KEY);
    if (!saved) return { settings: { ...DEFAULT_PRESENTATION }, error: '' };
    const parsed: unknown = JSON.parse(saved);
    if (!isSettings(parsed)) return { settings: { ...DEFAULT_PRESENTATION }, error: 'Saved presentation settings were invalid; defaults are active.' };
    return { settings: { ...parsed }, error: '' };
  } catch {
    return { settings: { ...DEFAULT_PRESENTATION }, error: 'Presentation settings could not be read; defaults are active for this session.' };
  }
}

export function savePresentationSettings(settings: PresentationSettings): string {
  try {
    localStorage.setItem(PRESENTATION_SAVE_KEY, JSON.stringify(settings));
    return '';
  } catch {
    return 'Presentation settings could not be saved. They remain active for this session.';
  }
}

export function resolvePresentation(settings: PresentationSettings, systemReduced: boolean): ResolvedPresentation {
  return {
    reducedMotion: settings.motion === 'reduced' || (settings.motion === 'system' && systemReduced),
    effects: settings.effects,
  };
}

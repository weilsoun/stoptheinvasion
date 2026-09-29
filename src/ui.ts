import { availableEnergy, effectiveCard, legalTargets, nearbyObjects, rewindTargets, visibleEnemies, visibleObjects } from './game/combat';
import { CARDS } from './game/content';
import { applyForecast, forecastCard, forecastEvents, forecastTimeline, type CardForecast } from './game/forecast';
import { TOOLKITS, chooseRunOption, createRun, deserializeRun, dispatchRun, runOptions, serializeRun, type RunOption, type RunState, type ToolkitId } from './game/run';
import { TERMS, cardTerms } from './game/terms';
import type { CardDefinition, CardInstance, Direction, TimelineCard, WorldCommand, WorldEvent, WorldState } from './game/types';
import { applyUpgrade } from './game/upgrades';
import { mountGamepad } from './gamepad';
import { drawWorldPortrait } from './view/pixel-art';
import { CARD_MOTION, CARD_WORKSPACE, HAND_TOP, NOW_X, type CardVisual, type ScenePort } from './view/types';

export interface GamePort { destroy(): void }

type ReducedMotionPreference = 'system' | 'on' | 'off';
interface Preferences { reducedMotion: ReducedMotionPreference; afterimages: boolean; zoom: number }
interface DragState { uid: string; pointerId: number; startX: number; startY: number; x: number; y: number; moved: boolean }
interface ChoiceState { page: number; selected: string | null }
type PileKind = 'draw' | 'discard' | 'exhaust';

const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 1080;
const SAVE_KEY = 'stoptheinvasion.world.v2';
const LEGACY_SAVE_KEY = 'stoptheinvasion.last-customer.v1';
const PREFERENCES_KEY = 'stoptheinvasion.presentation.v1';
const DEFAULT_PREFERENCES: Preferences = { reducedMotion: 'system', afterimages: true, zoom: 1 };
const ZOOM_LEVELS = [.65, 1, 1.25] as const;
const TIMELINE_GAP = 164;
const TIMELINE_CARD = { width: 136, height: 190, centerY: 715, bottom: 860 } as const;
const TIMELINE_STACK_LIMIT = 3;

function stackOffset(height: number, index: number): number {
  const peek = Math.min(22, (TIMELINE_CARD.bottom - TIMELINE_CARD.centerY - height / 2) / (TIMELINE_STACK_LIMIT - 1));
  return Math.min(index, TIMELINE_STACK_LIMIT - 1) * peek;
}
const HAND_CARD = { width: 125, height: 175, y: 890 } as const;
const CHOICE_PAGE_SIZE = 6;
const DRAG_THRESHOLD = 10;
const PILE_PAGE_SIZE = 6;
const PILE_POSES: Record<PileKind, { x: number; y: number }> = {
  draw: { x: 67, y: 1019 },
  discard: { x: 1755, y: 1019 },
  exhaust: { x: 1853, y: 1019 },
};

const escapeHtml = (value: string | number) => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!);

function freshSeed(): number {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0];
}

function loadPreferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? 'null') as Partial<Preferences> | null;
    const reducedMotion = value?.reducedMotion;
    const zoom = Number(value?.zoom);
    return {
      reducedMotion: reducedMotion === 'on' || reducedMotion === 'off' || reducedMotion === 'system' ? reducedMotion : 'system',
      afterimages: value?.afterimages !== false,
      zoom: ZOOM_LEVELS.includes(zoom as typeof ZOOM_LEVELS[number]) ? zoom : 1,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

function handLayout(cards: CardInstance[]): Map<string, CardVisual> {
  const result = new Map<string, CardVisual>();
  const gap = Math.min(142, cards.length > 1 ? 760 / (cards.length - 1) : 0);
  const left = NOW_X - (gap * (cards.length - 1) + HAND_CARD.width) / 2;
  const fanRise = cards.length > 1 ? Math.min(5, 30 / (cards.length - 1)) : 0;
  cards.forEach((card, index) => {
    const offset = index - (cards.length - 1) / 2;
    result.set(card.uid, {
      uid: card.uid,
      definition: CARDS[card.definitionId],
      x: left + index * gap,
      y: HAND_CARD.y + Math.abs(offset) * fanRise,
      width: HAND_CARD.width,
      height: HAND_CARD.height,
      rotation: offset * 2.5,
      hovered: false,
      dimmed: false,
      queued: false,
      dragged: false,
      locked: false,
      upgradeLevel: 0,
      target: null,
      targets: [],
      clip: { x: 0, y: HAND_TOP, width: DESIGN_WIDTH, height: DESIGN_HEIGHT - HAND_TOP },
    });
  });
  return result;
}

function presentationSnapshot(world: WorldState): WorldState {
  return {
    ...world,
    player: { ...world.player, position: { ...world.player.position } },
    enemies: world.enemies.map((enemy) => ({ ...enemy, position: { ...enemy.position } })),
    hand: world.hand.map((card) => ({ ...card })),
    drawPile: world.drawPile.map((card) => ({ ...card })),
    discardPile: world.discardPile.map((card) => ({ ...card })),
    exhaustPile: world.exhaustPile.map((card) => ({ ...card })),
    grades: { ...world.grades },
    retainedUids: [...world.retainedUids],
    echoUsed: [...world.echoUsed],
    usedObjectIds: [...world.usedObjectIds],
    completedEncounters: [...world.completedEncounters],
    pendingRewards: [...world.pendingRewards],
    rewardIds: [...world.rewardIds],
    exhaustedByRewind: [...world.exhaustedByRewind],
    log: [...world.log],
  };
}

function statusMarkup(label: string, value: number | boolean, className: string): string {
  if (!value) return '';
  return `<span class="status-chip ${className}">${escapeHtml(label)}${typeof value === 'number' ? ` ${value}` : ''}</span>`;
}

export function mountGame(root: HTMLElement, scene: ScenePort): GamePort {
  let run: RunState | null = null;
  let destroyed = false;
  let mode: 'title' | 'toolkit' | 'world' | 'options' = 'title';
  let optionsReturn: 'title' | 'world' = 'title';
  let menuOpen = false;
  let dictionaryOpen = false;
  let stackTick: number | null = null;
  let selectedUid: string | null = null;
  let selectedTarget: string | null = null;
  let selectedSource: string | null = null;
  let detail: { definition: CardDefinition; grade: number; label: string; locked: boolean; returnFocus: string; forecast?: CardForecast } | null = null;
  let hoverUid: string | null = null;
  let drag: DragState | null = null;
  let choice: ChoiceState = { page: 0, selected: null };
  let pileOpen: PileKind | null = null;
  let pilePage = 0;
  let pileReturnFocus: PileKind | null = null;
  let worldRevision = 0;
  let forecastCache: { revision: number; timeline: TimelineCard[]; cards: Map<string, CardForecast | null>; resolved: Map<TimelineCard, CardForecast> } = { revision: -1, timeline: [], cards: new Map(), resolved: new Map() };
  let replacement: 'new' | 'restart' | null = null;
  let timelinePan: { pointerId: number; startX: number; startOffset: number } | null = null;
  let timelineOffset = 0;
  let timelineSnapTimer = 0;
  let playing = false;
  let presentationPaused = false;
  let playbackToken = 0;
  let prefs = loadPreferences();
  let visuals = new Map<string, CardVisual>();
  const controller = new AbortController();
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const portrait = drawWorldPortrait('bob').toDataURL();

  root.className = 'game-hud';
  root.innerHTML = '<main></main><div class="live-region sr-only" aria-live="polite"></div>';
  const main = root.querySelector('main')!;
  const live = root.querySelector<HTMLElement>('.live-region')!;

  const reducedMotion = () => prefs.reducedMotion === 'on' || (prefs.reducedMotion === 'system' && media.matches);
  const blocked = () => destroyed || playing || presentationPaused || replacement !== null || drag !== null || timelinePan !== null || menuOpen || dictionaryOpen || detail !== null || pileOpen !== null || stackTick !== null || root.dataset.rewind === 'open' || mode !== 'world' || !run || run.world.phase !== 'playing';
  let announcementFrame = 0;
  const clearAnnouncement = () => {
    cancelAnimationFrame(announcementFrame);
    announcementFrame = 0;
    live.textContent = '';
  };
  const announce = (message: string) => {
    clearAnnouncement();
    announcementFrame = requestAnimationFrame(() => {
      announcementFrame = 0;
      if (!destroyed) live.textContent = message;
    });
  };
  const savePreferences = () => localStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefs));
  const pauseScene = () => scene.setPresentation({ reducedMotion: reducedMotion(), paused: presentationPaused || replacement !== null || menuOpen || dictionaryOpen || detail !== null || pileOpen !== null || stackTick !== null || root.dataset.rewind === 'open' || mode !== 'world' });

  function persist(): void {
    if (!run) return;
    try {
      localStorage.setItem(SAVE_KEY, serializeRun(run));
    } catch {
      announce('Save unavailable.');
    }
  }

  function savedRun(): RunState | null {
    try {
      const text = localStorage.getItem(SAVE_KEY);
      return text ? deserializeRun(text) : null;
    } catch {
      return null;
    }
  }

  function cardDefinition(uid: string): CardDefinition | null {
    const card = run?.world.hand.find((candidate) => candidate.uid === uid);
    return card ? CARDS[card.definitionId] ?? null : null;
  }

  function designPoint(event: Pick<MouseEvent, 'clientX' | 'clientY'>): { x: number; y: number } {
    const rect = root.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * DESIGN_WIDTH / rect.width, y: (event.clientY - rect.top) * DESIGN_HEIGHT / rect.height };
  }
  function futureTimeline(): TimelineCard[] {
    if (!run) return [];
    if (forecastCache.revision !== worldRevision) {
      forecastCache = { revision: worldRevision, timeline: forecastTimeline(run.world), cards: new Map(), resolved: new Map() };
    }
    return forecastCache.timeline;
  }

  function cachedCardForecast(uid: string, targetId?: string, sourceId?: string): CardForecast | null {
    if (!run) return null;
    if (forecastCache.revision !== worldRevision) futureTimeline();
    const key = `${uid}|${targetId ?? ''}|${sourceId ?? ''}`;
    if (!forecastCache.cards.has(key)) forecastCache.cards.set(key, forecastCard(run.world, uid, targetId, sourceId));
    return forecastCache.cards.get(key) ?? null;
  }

  function cachedTimelineForecast(card: TimelineCard | undefined): CardForecast | undefined {
    if (!card?.definition || card.kind === 'item') return;
    if (forecastCache.revision !== worldRevision) futureTimeline();
    let projection = forecastCache.resolved.get(card);
    if (!projection) {
      projection = forecastEvents(card.definition, card.events, card.canceled === true);
      forecastCache.resolved.set(card, projection);
    }
    return projection;
  }

  function displayedDescription(definition: CardDefinition, grade: number, forecast?: CardForecast): string {
    const graded = applyUpgrade(definition, grade);
    return forecast ? applyForecast(graded, forecast).description : graded.description;
  }


  function allTimelineCards(): TimelineCard[] {
    if (!run) return [];
    const past = prefs.afterimages || timelineOffset < 0 ? run.world.history.flatMap((entry) => entry.cards) : [];
    const future = futureTimeline();
    return [...past, ...future];
  }

  function timelineGroups(): Map<number, TimelineCard[]> {
    const groups = new Map<number, TimelineCard[]>();
    for (const card of allTimelineCards()) {
      if (!card.definition) continue;
      const group = groups.get(card.tick) ?? [];
      group.push(card);
      groups.set(card.tick, group);
    }
    return groups;
  }

  function choiceOptions(): RunOption[] {
    if (!run) return [];
    return runOptions(run);
  }

  function optionDefinition(option: RunOption): CardDefinition | null {
    const cardId = option.cardId ?? (option.uid ? run?.world.deck.find((card) => card.uid === option.uid)?.definitionId : undefined);
    return cardId ? CARDS[cardId] ?? null : null;
  }

  function cardsInPile(kind: PileKind, world = run!.world): CardInstance[] {
    if (kind === 'draw') return world.drawPile;
    if (kind === 'discard') return world.discardPile;
    return world.exhaustPile;
  }

  function pileInspectionCards(kind: PileKind): CardInstance[] {
    const cards = cardsInPile(kind);
    return kind === 'draw'
      ? [...cards].sort((a, b) => CARDS[a.definitionId].name.localeCompare(CARDS[b.definitionId].name) || a.uid.localeCompare(b.uid))
      : cards;
  }

  function buildVisuals(): void {
    visuals = new Map();
    if (!run) {
      scene.setCards([]);
      return;
    }
    if (run.world.phase === 'reward' || run.world.phase === 'service') {
      const options = choiceOptions();
      const cardOptions = options.filter((option) => optionDefinition(option));
      const page = cardOptions.slice(choice.page * CHOICE_PAGE_SIZE, (choice.page + 1) * CHOICE_PAGE_SIZE);
      page.forEach((option, index) => {
        const definition = optionDefinition(option)!;
        const columns = page.length > 3 ? 3 : page.length;
        const row = Math.floor(index / 3);
        const column = index % 3;
        const baseX = NOW_X + (column - (columns - 1) / 2) * (run!.world.phase === 'service' ? 540 : 300) - 110;
        const refine = option.id.startsWith('service:refine:') && option.uid;
        const x = baseX + (refine ? 116 : 0);
        visuals.set(`choice:${option.id}`, {
          uid: `choice:${option.id}`, definition, x, y: 250 + row * 340, width: 220, height: 308,
          rotation: 0, hovered: false, dimmed: choice.selected !== null && choice.selected !== option.id,
          queued: false, dragged: false, locked: false, upgradeLevel: 0, target: null, targets: [], detail: true,
        });
        if (refine) {
          const original = run!.world.deck.find((card) => card.uid === option.uid);
          if (original) {
            visuals.set(`choice-original:${option.id}`, {
              uid: `choice-original:${option.id}`, definition: CARDS[original.definitionId], x: baseX - 116, y: 250 + row * 340,
              width: 220, height: 308, rotation: 0, hovered: false, dimmed: true, queued: false, dragged: false,
              locked: false, upgradeLevel: 0, target: null, targets: [], detail: true,
            });
          }
        }
      });
      scene.setCards([...visuals.values()]);
      return;
    }
    if (pileOpen) {
      const world = run.world;
      const page = detail ? [] : pileInspectionCards(pileOpen).slice(pilePage * PILE_PAGE_SIZE, (pilePage + 1) * PILE_PAGE_SIZE);
      page.forEach((card, index) => {
        const column = index % 3;
        const row = Math.floor(index / 3);
        const uid = `pile:${pileOpen}:${card.uid}`;
        visuals.set(uid, {
          uid,
          definition: CARDS[card.definitionId],
          x: 500 + column * 310,
          y: 190 + row * 350,
          width: 220,
          height: 308,
          rotation: 0,
          hovered: false,
          dimmed: false,
          queued: false,
          dragged: false,
          locked: false,
          upgradeLevel: world.grades[card.uid] ?? 0,
          target: null,
          targets: [],
          detail: true,
        });
      });
      if (detail) {
        visuals.set('detail-card', {
          uid: 'detail-card', definition: detail.definition, x: 720, y: 150, width: 480, height: 672,
          rotation: 0, hovered: true, dimmed: false, queued: false, dragged: false, locked: false,
          upgradeLevel: detail.grade, target: null, targets: [], detail: true,
        });
      }
      scene.setCards([...visuals.values()]);
      return;
    }

    const hand = handLayout(run.world.hand);
    const legal = selectedUid ? new Set(legalTargets(run.world, selectedUid)) : new Set<string>();
    for (const [uid, visual] of hand) {
      const affordable = availableEnergy(run.world) >= visual.definition.cost;
      visual.dimmed = !affordable;
      visual.hovered = uid === selectedUid || uid === hoverUid;
      visual.upgradeLevel = run.world.grades[uid] ?? 0;
      visual.targets = [...legal];
      const cardTargets = legalTargets(run.world, uid);
      const forecastTarget = uid === selectedUid && selectedTarget ? selectedTarget : cardTargets.length === 1 ? cardTargets[0] : undefined;
      const usesSource = visual.definition.temporal?.kind === 'echo' || visual.definition.time?.kind === 'rewind';
      const projected = usesSource
        ? cachedCardForecast(uid, visual.definition.temporal?.kind === 'echo' ? selectedTarget ?? undefined : undefined, uid === selectedUid ? selectedSource ?? forecastTarget : forecastTarget)
        : cachedCardForecast(uid, forecastTarget);
      if (projected) visual.forecast = projected;
      if (hoverUid === uid && !drag) {
        visual.x += visual.width / 2 - 140;
        visual.y = Math.max(CARD_WORKSPACE.y, Math.min(DESIGN_HEIGHT - 392, visual.y + visual.height - 392));
        visual.width = 280;
        visual.height = 392;
        visual.rotation = 0;
        delete visual.clip;
      }
      if (drag?.uid === uid) {
        visual.x = drag.x - 110;
        visual.y = drag.y - 154;
        visual.width = 220;
        visual.height = 308;
        visual.rotation = 0;
        visual.dragged = true;
        delete visual.clip;
      }
      visuals.set(uid, visual);
    }

    const groups = timelineGroups();
    for (const [tick, cards] of groups) {
      const width = TIMELINE_CARD.width * prefs.zoom;
      const height = TIMELINE_CARD.height * prefs.zoom;
      const x = NOW_X + (tick - run.world.tick - timelineOffset) * TIMELINE_GAP * prefs.zoom - width / 2;
      if (x < -width || x > DESIGN_WIDTH) continue;
      cards.forEach((card, index) => {
        if (index >= TIMELINE_STACK_LIMIT || !card.definition) return;
        const uid = `timeline:${card.id}`;
        visuals.set(uid, {
          uid,
          definition: card.definition,
          x,
          y: TIMELINE_CARD.centerY - height / 2 + stackOffset(height, index),
          width,
          height,
          rotation: 0,
          hovered: false,
          dimmed: card.canceled === true,
          queued: true,
          dragged: false,
          locked: card.kind === 'enemy',
          upgradeLevel: card.upgradeLevel,
          forecast: cachedTimelineForecast(card),
          target: card.entityId ?? null,
          targets: [],
          timelinePosition: tick,
          clip: { x: 0, y: 550, width: DESIGN_WIDTH, height: 310 },
        });
      });
    }
    if (detail) {
      visuals.set('detail-card', {
        uid: 'detail-card',
        definition: detail.definition,
        x: 720,
        y: 150,
        width: 480,
        height: 672,
        rotation: 0,
        hovered: true,
        dimmed: false,
        queued: false,
        dragged: false,
        locked: detail.locked,
        upgradeLevel: detail.grade,
        forecast: detail.forecast,
        target: null,
        targets: [],
        detail: true,
      });
    }
    scene.setCards([...visuals.values()]);
  }

  function syncHandHit(button: HTMLButtonElement, uid: string): void {
    const visual = visuals.get(uid);
    if (!visual) return;
    button.style.left = `${visual.x}px`;
    button.style.top = `${visual.y}px`;
    button.style.width = `${visual.width}px`;
    button.style.height = `${visual.height}px`;
    button.style.transform = `rotate(${visual.rotation}deg)`;
  }

  function topHud(world = run!.world): string {
    const bob = world.player;
    const health = Math.max(0, Math.min(100, bob.hp / bob.maxHp * 100));
    return `<section class="top-hud ink-panel" aria-label="Bob status">
      <h1>${escapeHtml(bob.name)}</h1>
      <img src="${portrait}" alt="" class="bob-portrait">
      <div class="health-block"><b>${bob.hp}/${bob.maxHp}</b><span class="health-track"><i style="width:${health}%"></i></span></div>
      <div class="status-row">${statusMarkup('Block', bob.block, 'block')}${statusMarkup('Exposed', bob.exposed, 'exposed')}${statusMarkup('Ringing', bob.ringing, 'ringing')}${statusMarkup(world.timeMode, world.timeMode !== 'normal', 'time')}</div>
      <div class="resource-row"><span>Energy <b>${bob.energy}/${bob.energyMax}</b></span>${bob.surgeEnergy ? `<span>Surge <b>+${bob.surgeEnergy}</b></span>` : ''}<span>Potions <b>${world.potions}</b></span></div>
    </section>`;
  }

  function worldTargets(): string {
    if (!run) return '';
    const legal = selectedUid ? new Set(legalTargets(run.world, selectedUid)) : new Set<string>();
    const selectedDefinition = selectedUid ? cardDefinition(selectedUid) : null;
    const echoEnemies = selectedDefinition?.temporal?.kind === 'echo' && selectedSource
      ? new Set(visibleEnemies(run.world).filter((enemy) => Math.abs(enemy.position.x - run!.world.player.position.x) + Math.abs(enemy.position.y - run!.world.player.position.y) === 1).map((enemy) => enemy.id))
      : new Set<string>();
    const enemies = visibleEnemies(run.world).map((enemy) => {
      const pose = scene.getWorldPose(enemy.id);
      if (!pose) return '';
      const selectable = legal.has(enemy.id) || echoEnemies.has(enemy.id);
      return `<button class="world-target enemy-target ${selectable ? 'legal' : ''}" style="left:${pose.x - 40}px;top:${pose.y - 54}px" data-target="${escapeHtml(enemy.id)}" aria-label="${selectable ? 'Play on' : 'Inspect'} ${escapeHtml(enemy.name)}, ${enemy.hp} health"></button>`;
    }).join('');
    const adjacent = new Set(nearbyObjects(run.world).map((object) => object.id));
    const objects = visibleObjects(run.world).map((object) => {
      const pose = scene.getWorldPose(object.id);
      if (!pose) return '';
      const close = adjacent.has(object.id);
      return `<button class="world-target object-target ${close ? 'legal' : ''}" style="left:${pose.x - 34}px;top:${pose.y - 34}px" ${close ? `data-object="${escapeHtml(object.id)}"` : `data-inspect="${escapeHtml(object.name)}"`} aria-label="${close ? 'Interact with' : 'Inspect'} ${escapeHtml(object.name)}"></button>`;
    }).join('');
    return enemies + objects;
  }

  function timelineBandMarkup(): string {
    if (!run) return '';
    const groups = timelineGroups();
    const buttons = [...groups].map(([tick, cards]) => {
      const width = TIMELINE_CARD.width * prefs.zoom;
      const height = TIMELINE_CARD.height * prefs.zoom;
      const x = NOW_X + (tick - run!.world.tick - timelineOffset) * TIMELINE_GAP * prefs.zoom - width / 2;
      if (x < -width || x > DESIGN_WIDTH) return '';
      const names = cards.map((card) => card.definition?.name ?? card.events[0]?.message ?? 'Empty').join(', ');
      return `<button class="timeline-hit" style="left:${x}px;top:${TIMELINE_CARD.centerY - height / 2 - CARD_WORKSPACE.y}px;width:${width}px;height:${height + stackOffset(height, Math.max(0, cards.length - 1))}px" data-stack="${tick}" aria-label="Tick ${tick}, ${cards.length} ${cards.length === 1 ? 'card' : 'cards'}: ${escapeHtml(names)}">${cards.length > 1 ? `<b>${cards.length > TIMELINE_STACK_LIMIT ? `${TIMELINE_STACK_LIMIT} +${cards.length - TIMELINE_STACK_LIMIT}` : cards.length}</b>` : ''}</button>`;
    }).join('');
    return `<span class="past-label">PAST</span><span class="now-line">NOW <b>${run.world.tick}</b></span><span class="future-label">FUTURE</span>${buttons}`;
  }

  function timelineMarkup(): string {
    if (!run) return '';
    return `<section class="timeline" aria-label="Timeline">
      <div class="timeline-band">${timelineBandMarkup()}</div>
      <nav class="timeline-controls" aria-label="Timeline browsing">
        <button data-action="browse-left" aria-label="Earlier ticks">◀</button>
        <button data-action="recenter">NOW</button>
        <button data-action="browse-right" aria-label="Later ticks">▶</button>
        <button data-action="zoom-out" aria-label="Zoom out">−</button><output>${Math.round(prefs.zoom * 100)}%</output><button data-action="zoom-in" aria-label="Zoom in">+</button>
      </nav>
      ${run.world.phase === 'playing' ? `<button class="now-drop ${selectedUid ? 'ready' : ''}" data-action="play-now">PLAY AT NOW</button>` : ''}
    </section>`;
  }

  function refreshTimeline(): void {
    const focusedTick = (document.activeElement as HTMLElement | null)?.dataset.stack;
    buildVisuals();
    const band = main.querySelector('.timeline-band');
    if (band) band.innerHTML = timelineBandMarkup();
    const output = main.querySelector('.timeline-controls output');
    if (output) output.textContent = `${Math.round(prefs.zoom * 100)}%`;
    if (focusedTick) (main.querySelector<HTMLElement>(`[data-stack="${focusedTick}"]`) ?? main.querySelector<HTMLElement>('[data-action="recenter"]'))?.focus();
  }

  function stopTimelineNavigation(snap = true): void {
    window.clearTimeout(timelineSnapTimer);
    timelineSnapTimer = 0;
    if (snap) timelineOffset = Math.max(-(run?.world.tick ?? 0), Math.round(timelineOffset));
  }

  function recenterTimeline(): void {
    stopTimelineNavigation();
    timelineOffset = 0;
    refreshTimeline();
  }

  function handMarkup(): string {
    if (!run || pileOpen) return '';
    const world = run.world;
    const legal = selectedUid ? new Set(legalTargets(run.world, selectedUid)) : new Set<string>();
    const hits = visuals;
    return `<section class="hand-zone" aria-label="Current hand">${run.world.hand.map((card) => {
      const visual = hits.get(card.uid)!;
      const definition = CARDS[card.definitionId];
      const affordable = availableEnergy(world) >= definition.cost;
      return `<button class="card-hit ${selectedUid === card.uid ? 'selected' : ''} ${legal.has(card.uid) ? 'legal' : ''}" style="left:${visual.x}px;top:${visual.y}px;width:${visual.width}px;height:${visual.height}px;transform:rotate(${visual.rotation}deg)" data-card="${escapeHtml(card.uid)}" aria-pressed="${selectedUid === card.uid}" aria-disabled="${!affordable}" aria-label="${escapeHtml(definition.name)}, cost ${definition.cost}. ${escapeHtml(displayedDescription(definition, visual.upgradeLevel, visual.forecast))}"></button>`;
    }).join('')}</section>`;
  }

  function pileControls(world = run!.world): string {
    return `<nav class="pile-controls" aria-label="Card piles">
      <button data-pile="draw" aria-label="Inspect draw pile, ${world.drawPile.length} cards"><span>Draw</span><b class="pile-count">${world.drawPile.length}</b></button>
      <button data-pile="discard" aria-label="Inspect discard pile, ${world.discardPile.length} cards"><span>Discard</span><b class="pile-count">${world.discardPile.length}</b></button>
      <button data-pile="exhaust" aria-label="Inspect exhaust pile, ${world.exhaustPile.length} cards"><span>Exhaust</span><b class="pile-count">${world.exhaustPile.length}</b></button>
    </nav>`;
  }

  function pileDialog(): string {
    if (!pileOpen) return '';
    const cards = pileInspectionCards(pileOpen);
    const pageCount = Math.max(1, Math.ceil(cards.length / PILE_PAGE_SIZE));
    const page = cards.slice(pilePage * PILE_PAGE_SIZE, (pilePage + 1) * PILE_PAGE_SIZE);
    const label = pileOpen[0].toUpperCase() + pileOpen.slice(1);
    return `<div class="modal-shade pile-shade"><section class="pile-dialog" role="dialog" aria-modal="true" aria-label="${label} pile, ${cards.length} cards">
      <header><h2>${label} <b>${cards.length}</b>${pileOpen === 'draw' ? ' — unordered' : ''}</h2><button data-action="close-pile">Close</button></header>
      <div class="pile-grid">${page.map((card, index) => {
        const column = index % 3;
        const row = Math.floor(index / 3);
        const definition = CARDS[card.definitionId];
        return `<button class="pile-card-hit" style="left:${500 + column * 310}px;top:${190 + row * 350}px" data-pile-card="${escapeHtml(card.uid)}" aria-label="${escapeHtml(definition.name)}, ${escapeHtml(card.uid)}. ${escapeHtml(definition.description)}"></button>`;
      }).join('')}</div>
      <footer><button data-action="pile-prev" ${pilePage === 0 ? 'disabled' : ''}>Previous</button><span>${pilePage + 1}/${pageCount}</span><button data-action="pile-next" ${pilePage + 1 >= pageCount ? 'disabled' : ''}>Next</button></footer>
    </section></div>`;
  }

  function selectionPanel(): string {
    if (!run || !selectedUid) return '';
    const definition = cardDefinition(selectedUid);
    if (!definition) return '';
    const targets = legalTargets(run.world, selectedUid);
    const terms = cardTerms(effectiveCard(run.world, selectedUid));
    const targetControls = targets.filter((id) => run!.world.history.some((entry) => entry.cards.some((card) => card.id === id)) || /^\d+$/.test(id)).map((id) => `<button data-source="${escapeHtml(id)}">${escapeHtml(id)}</button>`).join('');
    return `<aside class="selection-panel ink-panel" aria-label="Selected card"><b>${escapeHtml(definition.name)}</b>${targetControls ? `<div class="source-targets">${targetControls}</div>` : ''}${terms.length ? `<details><summary>Terms</summary>${terms.map((id) => `<p><b>${escapeHtml(TERMS[id].label)}</b> ${escapeHtml(TERMS[id].description)}</p>`).join('')}</details>` : ''}<button data-action="inspect-selected">Inspect</button><button data-action="clear-selection">Cancel</button></aside>`;
  }

  function detailDialog(): string {
    if (!detail) return '';
    const terms = cardTerms(detail.definition);
    return `<div class="detail-shade ${pileOpen ? 'pile-detail-shade' : ''}" data-detail-shade><section data-detail-shade role="dialog" aria-modal="true" aria-label="${escapeHtml(detail.label)}"><span class="sr-only">${escapeHtml(displayedDescription(detail.definition, detail.grade, detail.forecast))}</span>${terms.length ? `<aside>${terms.map((id) => `<p><b>${escapeHtml(TERMS[id].label)}</b> ${escapeHtml(TERMS[id].description)}</p>`).join('')}</aside>` : ''}<button data-action="close-detail">Close</button></section></div>`;
  }

  function cancelPointerInteraction(): boolean {
    const active = drag !== null || timelinePan !== null || hoverUid !== null || timelineSnapTimer !== 0;
    stopTimelineNavigation();
    drag = null;
    timelinePan = null;
    hoverUid = null;
    return active;
  }

  function closeOptions(): void {
    mode = optionsReturn;
    render();
    queueMicrotask(() => main.querySelector<HTMLElement>(`[data-action="${mode === 'title' ? 'options' : 'menu'}"]`)?.focus());
  }

  function closeStack(): void {
    const tick = stackTick;
    stackTick = null;
    renderWorld();
    if (tick !== null) queueMicrotask(() => main.querySelector<HTMLElement>(`[data-stack="${tick}"]`)?.focus());
  }

  function closeDetail(): void {
    const returnFocus = detail?.returnFocus;
    detail = null;
    renderWorld();
    if (returnFocus) queueMicrotask(() => main.querySelector<HTMLElement>(returnFocus)?.focus());
  }

  function actionBar(): string {
    if (!run) return '';
    const rewind = rewindTargets(run.world);
    if (run.world.phase === 'victory') return '<section class="terminal-outcome" role="status"><h1>Expedition Complete</h1><p>Bob reached the loading dock.</p></section><nav class="action-bar terminal-actions" aria-label="Expedition complete"><button data-action="title">Tomorrow</button><button data-action="new">New Expedition</button></nav>';
    if (run.world.phase === 'defeat') return `<section class="terminal-outcome" role="status"><h1>Bob Went Down</h1><p>Stopped at tick ${run.world.tick}. ${rewind.length ? 'A rewind checkpoint remains.' : 'No rewind checkpoint remains.'}</p></section><nav class="action-bar terminal-actions" aria-label="Defeat">${rewind.length ? '<button data-action="rewind">Rewind</button>' : ''}<button data-action="title">Title</button><button data-action="new">New Expedition</button></nav>`;
    return `<nav class="action-bar" aria-label="Actions"><button data-action="wait">Wait</button><button data-action="potion" ${run.world.potions < 1 ? 'disabled' : ''}>Potion</button>${rewind.length ? `<button data-action="rewind">Rewind</button>` : ''}<button data-action="dictionary">Dictionary</button><button data-action="menu">Menu</button></nav>
      <div class="dpad" aria-label="Movement"><button data-move="up" aria-label="Move up">▲</button><button data-move="left" aria-label="Move left">◀</button><button data-move="down" aria-label="Move down">▼</button><button data-move="right" aria-label="Move right">▶</button></div>`;
  }

  function stackDialog(): string {
    if (stackTick === null) return '';
    const cards = timelineGroups().get(stackTick) ?? [];
    return `<div class="modal-shade"><section class="dialog" role="dialog" aria-modal="true" aria-label="Tick ${stackTick}"><h2>Tick ${stackTick}</h2><ol>${cards.map((card) => {
      const content = `<b>${escapeHtml(card.definition?.name ?? 'Empty')}</b><span>${escapeHtml(card.events.map((event) => event.message).join(' ') || 'No event')}</span>`;
      const selectable = selectedUid && run && legalTargets(run.world, selectedUid).includes(card.id);
      return `<li><button ${selectable ? `data-source="${escapeHtml(card.id)}"` : `data-inspect-card="${escapeHtml(card.id)}"`}>${content}</button></li>`;
    }).join('')}</ol><button data-action="close-stack">Close</button></section></div>`;
  }

  function menuDialog(): string {
    if (!menuOpen) return '';
    return `<div class="modal-shade"><section class="dialog menu-dialog" role="dialog" aria-modal="true" aria-label="Pause menu"><h2>Paused</h2><button data-action="resume">Resume</button>${playing ? '' : '<button data-action="options">Options</button><button data-action="dictionary">Dictionary</button><button data-action="restart">Restart Expedition</button>'}<button data-action="title">Title</button><details><summary>Controls</summary><p>Arrows or D-pad move. Space waits. Select + D-pad browses time. Drag a card to NOW.</p></details></section></div>`;
  }

  function dictionaryDialog(): string {
    if (!dictionaryOpen) return '';
    return `<div class="modal-shade"><section class="dialog dictionary-dialog" role="dialog" aria-modal="true" aria-label="Dictionary"><h2>Dictionary</h2><dl>${Object.values(TERMS).map((term) => `<div><dt>${escapeHtml(term.label)}</dt><dd>${escapeHtml(term.description)}</dd></div>`).join('')}</dl><button data-action="close-dictionary">Close</button></section></div>`;
  }

  function rewindDialog(): string {
    if (!run || root.dataset.rewind !== 'open') return '';
    return `<div class="modal-shade"><section class="dialog" role="dialog" aria-modal="true" aria-label="Choose rewind tick"><h2>Rewind</h2>${rewindTargets(run.world).map((tick) => `<button data-rewind="${tick}">Tick ${tick}</button>`).join('')}<button data-action="close-rewind">Cancel</button></section></div>`;
  }

  function focusModal(): void {
    queueMicrotask(() => {
      const layers = root.querySelectorAll<HTMLElement>('.modal-shade, .detail-shade, .choice-screen');
      layers.item(layers.length - 1)?.querySelector<HTMLElement>('button:not(:disabled),select,summary,[tabindex="0"]')?.focus();
    });
  }

  function renderWorld(): void {
    if (!run) return;
    stopTimelineNavigation();
    scene.setState(run.world, true);
    scene.setTarget(selectedTarget);
    buildVisuals();
    main.innerHTML = `${topHud()}${worldTargets()}${timelineMarkup()}${handMarkup()}${pileControls()}${selectionPanel()}${actionBar()}${stackDialog()}${menuDialog()}${dictionaryDialog()}${rewindDialog()}${pileDialog()}${detailDialog()}<p class="toast" role="status">${escapeHtml(run.world.log.at(-1) ?? '')}</p>`;
    root.classList.toggle('reduced-motion', reducedMotion());
    root.classList.toggle('playing-events', playing);
    pauseScene();
    if (menuOpen || dictionaryOpen || detail || pileOpen || stackTick !== null || root.dataset.rewind === 'open') focusModal();
  }

  function renderTitle(): void {
    scene.setCards([]);
    if (replacement) {
      const restart = replacement === 'restart';
      main.innerHTML = `<div class="modal-shade title-shade"><section class="dialog" role="dialog" aria-modal="true" aria-label="${restart ? 'Restart' : 'Replace'} expedition"><h2>${restart ? 'Restart' : 'Replace'} expedition?</h2><p>${restart ? 'Return to tick 0 with the same seed and toolkit.' : 'Choose a new toolkit and replace the current expedition.'}</p><button data-action="cancel-new">Cancel</button><button class="primary" data-action="confirm-new">${restart ? 'Restart' : 'Replace'}</button></section></div>`;
      pauseScene();
      focusModal();
      return;
    }
    const continued = savedRun();
    const legacy = localStorage.getItem(LEGACY_SAVE_KEY);
    main.innerHTML = `<div class="modal-shade title-shade"><section class="title-card" aria-label="MOREMART Last Customer"><span class="eyebrow">MAKE TOMORROW HAPPEN</span><h1>LAST CUSTOMER</h1><div class="title-actions">${continued ? '<button class="primary" data-action="continue">Continue</button>' : ''}<button class="primary" data-action="new">New Expedition</button><button data-action="options">Options</button></div>${legacy ? '<p class="legacy-notice">Your original expedition is untouched. <button data-action="export-legacy">Download old save</button></p>' : ''}</section></div>`;
    pauseScene();
    focusModal();
  }

  function renderToolkit(): void {
    scene.setCards([]);
    main.innerHTML = `<div class="modal-shade title-shade"><section class="toolkit-dialog"><span class="eyebrow">CHOOSE YOUR CART</span><h1>Toolkit</h1><div class="toolkit-grid">${TOOLKITS.map((toolkit) => `<button data-toolkit="${toolkit.id}"><b>${escapeHtml(toolkit.name)}</b><span>${escapeHtml(toolkit.description)}</span></button>`).join('')}</div><button data-action="title">Back</button></section></div>`;
    pauseScene();
    focusModal();
  }

  function renderOptions(): void {
    scene.setCards([]);
    main.innerHTML = `<div class="modal-shade"><section class="dialog options-dialog" role="dialog" aria-modal="true" aria-label="Options"><h2>Options</h2><label>Motion <select data-pref="motion"><option value="system" ${prefs.reducedMotion === 'system' ? 'selected' : ''}>System</option><option value="on" ${prefs.reducedMotion === 'on' ? 'selected' : ''}>Reduced</option><option value="off" ${prefs.reducedMotion === 'off' ? 'selected' : ''}>Full</option></select></label><button data-action="afterimages" aria-pressed="${prefs.afterimages}">Afterimages</button><button data-action="fullscreen">Fullscreen</button><button data-action="options-back">Back</button></section></div>`;
    pauseScene();
    focusModal();
  }

  function renderChoices(): void {
    if (!run) return;
    buildVisuals();
    const options = choiceOptions();
    const cardOptions = options.filter((option) => optionDefinition(option));
    const plainOptions = options.filter((option) => !optionDefinition(option));
    const pageCount = Math.max(1, Math.ceil(cardOptions.length / CHOICE_PAGE_SIZE));
    const page = cardOptions.slice(choice.page * CHOICE_PAGE_SIZE, (choice.page + 1) * CHOICE_PAGE_SIZE);
    const selected = options.find((option) => option.id === choice.selected);
    main.innerHTML = `<div class="choice-screen"><header><span class="eyebrow">${run.world.phase === 'reward' ? 'TAKE ONE' : 'WORK BENCH'}</span><h1>${run.world.phase === 'reward' ? 'Recovered Stock' : 'Service'}</h1></header>${page.map((option) => {
      const visual = visuals.get(`choice:${option.id}`)!;
      const pairOffset = option.id.startsWith('service:refine:') ? 232 : 0;
      const label = pairOffset ? 'Refine: before / after' : option.id.startsWith('service:remove:') ? 'Remove from deck' : '';
      return `<button class="choice-hit ${choice.selected === option.id ? 'selected' : ''}" style="left:${visual.x - pairOffset}px;top:${visual.y}px;width:${visual.width + pairOffset}px;height:${visual.height}px" data-choice="${escapeHtml(option.id)}" aria-pressed="${choice.selected === option.id}" aria-label="${escapeHtml(option.title)}. ${escapeHtml(option.description)}">${label ? `<span class="choice-label">${label}</span>` : ''}</button>`;
    }).join('')}${selected ? `<p class="choice-summary" role="status">${escapeHtml(selected.title)} — ${escapeHtml(selected.description)}</p>` : ''}<footer>${choice.page > 0 ? '<button data-action="choice-prev">Previous</button>' : ''}<span>${choice.page + 1}/${pageCount}</span>${choice.page + 1 < pageCount ? '<button data-action="choice-next">Next</button>' : ''}${plainOptions.map((option) => `<button data-choice="${escapeHtml(option.id)}">${escapeHtml(option.title)}</button>`).join('')}${choice.selected ? '<button class="primary" data-action="choice-confirm">Confirm</button>' : ''}</footer></div>`;
    pauseScene();
    focusModal();
  }

  function render(): void {
    if (mode === 'title') renderTitle();
    else if (mode === 'toolkit') renderToolkit();
    else if (mode === 'options') renderOptions();
    else if (run?.world.phase === 'reward' || run?.world.phase === 'service') renderChoices();
    else renderWorld();
  }

  async function presentationDelay(ms: number, token: number): Promise<boolean> {
    if (reducedMotion()) return token === playbackToken && !destroyed;
    let remaining = ms;
    let previous = performance.now();
    while (remaining > 0 && token === playbackToken && !destroyed) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const now = performance.now();
      if (!presentationPaused && !menuOpen && !dictionaryOpen) remaining -= now - previous;
      previous = now;
    }
    return token === playbackToken && !destroyed;
  }

  function syncPresentation(world: WorldState, cards: Map<string, CardVisual>): void {
    scene.setState(world, false);
    scene.setCards([...cards.values()]);
    const hud = main.querySelector('.top-hud');
    if (hud) hud.outerHTML = topHud(world);
    const piles = main.querySelector('.pile-controls');
    if (piles) piles.outerHTML = pileControls(world);
  }

  function actor(world: WorldState, id: string | undefined) {
    if (!id) return undefined;
    return id === world.player.id ? world.player : world.enemies.find((enemy) => enemy.id === id);
  }

  function stageEvent(world: WorldState, event: WorldEvent, finalWorld: WorldState, damageAmounts: number[]): WorldState {
    if (event.kind === 'rewind') return presentationSnapshot(finalWorld);
    const acting = actor(world, event.actor);
    const target = actor(world, event.target);
    if (event.kind === 'action') {
      if (acting) acting.ringing = false;
      if (acting === world.player && event.definition) {
        let cost = event.definition.cost;
        const surge = Math.min(cost, world.player.surgeEnergy);
        world.player.surgeEnergy -= surge;
        cost -= surge;
        world.player.energy = Math.max(0, world.player.energy - cost);
        damageAmounts.splice(0, damageAmounts.length, ...event.definition.effects.filter((effect) => effect.kind === 'damage').map((effect) => Math.max(0, Math.floor(effect.amount))));
      } else if (event.definition) {
        damageAmounts.splice(0, damageAmounts.length, ...event.definition.effects.filter((effect) => effect.kind === 'damage').map((effect) => Math.max(0, Math.floor(effect.amount))));
      }
    } else if (event.kind === 'move' && acting && event.to) {
      acting.position = { ...event.to };
      if (event.from) {
        const dx = event.to.x - event.from.x;
        const dy = event.to.y - event.from.y;
        if (Math.abs(dx) > Math.abs(dy)) acting.facing = dx > 0 ? 'right' : 'left';
        else if (dy) acting.facing = dy > 0 ? 'down' : 'up';
      }
    } else if (event.kind === 'damage' && target) {
      const incoming = (damageAmounts.shift() ?? event.amount ?? 0) + target.exposed;
      target.block = Math.max(0, target.block - Math.min(target.block, incoming));
      target.exposed = 0;
      target.hp = Math.max(0, target.hp - (event.amount ?? 0));
    } else if (event.kind === 'block' && target) target.block += event.amount ?? 0;
    else if (event.kind === 'exposed' && target) target.exposed += event.amount ?? 0;
    else if (event.kind === 'heal' && target) target.hp = Math.min(target.maxHp, target.hp + (event.amount ?? 0));
    else if (event.kind === 'ringing') {
      if (target) target.ringing = true;
      else if (acting) acting.ringing = false;
    } else if (event.kind === 'energy') {
      if (event.message.includes('Surge')) world.player.surgeEnergy += event.amount ?? 0;
      else world.player.energy = Math.min(world.player.energyMax, world.player.energy + (event.amount ?? 0));
    } else if (event.kind === 'time') {
      world.timeMode = finalWorld.timeMode;
      world.timeExpires = finalWorld.timeExpires;
      world.scouting = finalWorld.scouting;
      world.scoutingExpires = finalWorld.scoutingExpires;
    } else if (event.kind === 'interact' && event.target) {
      if (finalWorld.usedObjectIds.includes(event.target) && !world.usedObjectIds.includes(event.target)) world.usedObjectIds.push(event.target);
      world.potions = finalWorld.potions;
      if (finalWorld.phase === 'service') world.phase = 'service';
    } else if (event.kind === 'victory') world.phase = 'victory';
    else if (event.kind === 'defeat') world.phase = 'defeat';
    else if (event.kind === 'tick') {
      world.tick = event.tick;
      world.phase = finalWorld.phase;
      world.completedEncounters = [...finalWorld.completedEncounters];
      world.pendingRewards = [...finalWorld.pendingRewards];
    }
    return world;
  }

  async function playEvents(
    events: WorldEvent[],
    initialWorld: WorldState,
    initialVisuals: Map<string, CardVisual>,
    initialTimeline: TimelineCard[],
  ): Promise<void> {
    const token = ++playbackToken;
    const finalWorld = run!.world;
    let world = initialWorld;
    const cards = initialVisuals;
    const damageAmounts: number[] = [];
    const deferredDiscards = new Map<string, WorldEvent>();
    const futureActionSources = new Set(events.filter((event) => event.kind === 'action' && event.sourceUid).map((event) => event.sourceUid!));
    let historySequence = 0;
    let pendingAction: { event: WorldEvent; visualUid: string; disposal?: WorldEvent; returnVisual?: CardVisual } | null = null;
    playing = true;
    root.classList.add('playing-events');
    pauseScene();
    syncPresentation(world, cards);

    const waitUntilReady = async () => {
      while ((presentationPaused || menuOpen || dictionaryOpen) && token === playbackToken && !destroyed) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
      return token === playbackToken && !destroyed;
    };

    const animateDiscard = async (event: WorldEvent, sourceVisualUid?: string) => {
      for (const discarded of event.cards ?? []) {
        const visualUid = sourceVisualUid ?? discarded.uid;
        const visual = cards.get(visualUid);
        const pile: PileKind = finalWorld.exhaustPile.some((card) => card.uid === discarded.uid) ? 'exhaust' : 'discard';
        if (visual) {
          const destination = PILE_POSES[pile];
          cards.set(visualUid, {
            ...visual,
            x: destination.x - 40,
            y: destination.y - 56,
            width: 80,
            height: 112,
            rotation: pile === 'exhaust' ? 12 : -8,
            dragged: true,
            hovered: false,
            queued: false,
            detail: false,
            flip: 180,
            clip: undefined,
            fog: undefined,
            transitionMs: CARD_MOTION.exit,
          });
          scene.setCards([...cards.values()]);
          if (!await presentationDelay(CARD_MOTION.exit, token)) return false;
          cards.delete(visualUid);
        }
        world.hand = world.hand.filter((card) => card.uid !== discarded.uid);
        world.drawPile = world.drawPile.filter((card) => card.uid !== discarded.uid);
        world.discardPile = world.discardPile.filter((card) => card.uid !== discarded.uid);
        world.exhaustPile = world.exhaustPile.filter((card) => card.uid !== discarded.uid);
        cardsInPile(pile, world).push({ ...discarded });
      }
      syncPresentation(world, cards);
      if (event.visible !== false) scene.playEvent(event);
      announce(event.message);
      return presentationDelay(CARD_MOTION.puff, token);
    };

    const finishAction = async () => {
      if (!pendingAction) return true;
      const action = pendingAction;
      pendingAction = null;
      if (!await presentationDelay(CARD_MOTION.hold, token)) return false;
      if (action.disposal) {
        if (!await animateDiscard(action.disposal, action.visualUid)) return false;
      } else {
        const current = cards.get(action.visualUid);
        if (current && action.event.actor !== finalWorld.player.id) {
          cards.set(action.visualUid, { ...current, x: current.x + 240, y: current.y - current.height / 2, rotation: 18, dragged: true, transitionMs: CARD_MOTION.exit });
        } else if (action.returnVisual) {
          cards.set(action.visualUid, { ...action.returnVisual, transitionMs: CARD_MOTION.exit });
        }
        scene.setCards([...cards.values()]);
        if (!await presentationDelay(CARD_MOTION.exit, token)) return false;
        if (action.event.actor !== finalWorld.player.id || !action.returnVisual) cards.delete(action.visualUid);
      }
      addHistoryCopy(action.event);
      scene.setCards([...cards.values()]);
      return token === playbackToken && !destroyed;
    };

    const recordedAction = (event: WorldEvent) => finalWorld.history.at(-1)?.cards.find((card) =>
      card.tick === event.tick
      && card.entityId === event.actor
      && card.definition?.id === event.definition?.id
      && (event.actor !== finalWorld.player.id || card.sourceUid === event.sourceUid));

    const addHistoryCopy = (event: WorldEvent) => {
      const recorded = recordedAction(event);
      if (!recorded?.definition) return;
      const layer = historySequence++;
      if (layer >= TIMELINE_STACK_LIMIT) return;
      const width = TIMELINE_CARD.width * prefs.zoom;
      const height = TIMELINE_CARD.height * prefs.zoom;
      const uid = `playback-history:${event.tick}:${event.actor}:${layer}`;
      cards.set(uid, {
        uid,
        definition: recorded.definition,
        x: NOW_X - width / 2,
        y: TIMELINE_CARD.centerY - height / 2 + stackOffset(height, layer),
        width,
        height,
        rotation: 0,
        hovered: false,
        dimmed: recorded.canceled === true,
        queued: true,
        dragged: false,
        locked: recorded.kind === 'enemy',
        upgradeLevel: recorded.upgradeLevel,
        forecast: cachedTimelineForecast(recorded),
        target: recorded.entityId ?? null,
        targets: [],
        timelinePosition: event.tick,
        clip: { x: 0, y: 550, width: DESIGN_WIDTH, height: 310 },
        snap: true,
      });
    };

    const animateAction = async (event: WorldEvent) => {
      if (!event.definition) {
        world = stageEvent(world, event, finalWorld, damageAmounts);
        syncPresentation(world, cards);
        scene.playEvent(event);
        announce(event.message);
        return presentationDelay(CARD_MOTION.hold, token);
      }
      const sourceVisualUid = event.sourceUid && cards.has(event.sourceUid)
        ? event.sourceUid
        : (() => {
          const source = initialTimeline.find((card) => card.tick === event.tick && card.entityId === event.actor && card.definition?.id === event.definition?.id && cards.has(`timeline:${card.id}`));
          return source ? `timeline:${source.id}` : undefined;
        })();
      const actorPose = scene.getWorldPose(event.actor ?? '');
      const sourcePose = sourceVisualUid ? scene.getCardPose(sourceVisualUid) : null;
      const uid = sourceVisualUid ?? `playback-action:${event.tick}:${event.actor}:${historySequence}`;
      const width = 220;
      const height = 308;
      const startX = sourcePose?.x ?? (actorPose?.x ?? NOW_X) - width / 2;
      const startY = sourcePose?.y ?? (actorPose?.y ?? 360) - height / 2;
      const targetCard = event.target ? scene.getCardPose(event.target) : null;
      const targetWorld = scene.getWorldPose(event.target ?? event.actor ?? '');
      const targetX = targetCard ? targetCard.x + targetCard.width / 2 : targetWorld?.x ?? actorPose?.x ?? NOW_X;
      const targetY = targetCard ? targetCard.y + targetCard.height / 2 : targetWorld?.y ?? actorPose?.y ?? 360;
      const original = sourceVisualUid ? cards.get(sourceVisualUid) : undefined;
      cards.set(uid, {
        ...(original ?? {
          uid, hovered: false, dimmed: false, queued: false, locked: true, target: null, targets: [],
          x: startX, y: startY, width, height, rotation: 0, dragged: false, upgradeLevel: 0,
        }),
        uid,
        definition: event.definition,
        x: startX,
        y: startY - 34,
        width,
        height,
        rotation: 0,
        hovered: false,
        queued: false,
        dragged: true,
        locked: event.actor !== finalWorld.player.id,
        upgradeLevel: 0,
        forecast: cachedTimelineForecast(recordedAction(event)),
        target: event.target ?? null,
        targets: [],
        detail: false,
        dimmed: false,
        flip: 0,
        transitionMs: CARD_MOTION.lift,
        clip: undefined,
        fog: undefined,
      });
      scene.setCards([...cards.values()]);
      if (!await presentationDelay(CARD_MOTION.lift, token)) return false;
      cards.set(uid, {
        ...cards.get(uid)!,
        x: targetX - width / 2,
        y: targetY - height / 2,
        transitionMs: CARD_MOTION.travel,
      });
      scene.setCards([...cards.values()]);
      if (!await presentationDelay(CARD_MOTION.travel, token)) return false;
      world = stageEvent(world, event, finalWorld, damageAmounts);
      syncPresentation(world, cards);
      scene.playEvent(event);
      announce(event.message);
      const pending = event.sourceUid ? deferredDiscards.get(event.sourceUid) : undefined;
      if (pending) deferredDiscards.delete(event.sourceUid!);
      pendingAction = { event, visualUid: uid, disposal: pending, returnVisual: original };
      return true;
    };

    const animateDraw = async (event: WorldEvent) => {
      world.drawPile = finalWorld.drawPile.map((card) => ({ ...card }));
      world.discardPile = finalWorld.discardPile.map((card) => ({ ...card }));
      for (const drawn of event.cards ?? []) {
        world.hand = world.hand.filter((card) => card.uid !== drawn.uid);
        world.drawPile = world.drawPile.filter((card) => card.uid !== drawn.uid);
        world.discardPile = world.discardPile.filter((card) => card.uid !== drawn.uid);
        world.exhaustPile = world.exhaustPile.filter((card) => card.uid !== drawn.uid);
        world.hand.push({ ...drawn });
        const uid = drawn.uid;
        const origin = PILE_POSES.draw;
        cards.set(uid, {
          uid, definition: CARDS[drawn.definitionId], x: origin.x - HAND_CARD.width / 2, y: origin.y - HAND_CARD.height / 2, width: HAND_CARD.width, height: HAND_CARD.height,
          rotation: 0, hovered: false, dimmed: false, queued: false, dragged: true, locked: false,
          upgradeLevel: world.grades[uid] ?? 0, target: null, targets: [], snap: true, flip: 180,
        });
        syncPresentation(world, cards);
        if (!reducedMotion() && !await presentationDelay(16, token)) return false;
        const destination = handLayout(world.hand).get(uid)!;
        cards.set(uid, { ...destination, locked: false, dragged: true, flip: 0, clip: undefined, upgradeLevel: world.grades[uid] ?? 0, transitionMs: CARD_MOTION.deal });
        scene.setCards([...cards.values()]);
        if (!await presentationDelay(CARD_MOTION.deal, token)) return false;
      }
      if (event.visible !== false) scene.playEvent(event);
      announce(event.message);
      return presentationDelay(CARD_MOTION.drawStagger, token);
    };
    const endsCurrentAction = (event: WorldEvent) => pendingAction && (
      (event.actor && event.actor !== pendingAction.event.actor)
      || event.kind === 'action' || event.kind === 'move' || event.kind === 'tick'
      || event.kind === 'interact' || event.kind === 'empty' || event.kind === 'victory'
      || event.kind === 'defeat' || event.kind === 'rewind'
    );

    for (const event of events) {
      if (!await waitUntilReady()) return;
      if (endsCurrentAction(event) && !await finishAction()) return;
      if (event.visible === false) {
        world = stageEvent(world, event, finalWorld, damageAmounts);
        continue;
      }
      if (event.kind === 'discard' && event.sourceUid && futureActionSources.has(event.sourceUid)) {
        deferredDiscards.set(event.sourceUid, event);
        continue;
      }
      if (event.kind === 'action') {
        if (!await animateAction(event)) return;
        continue;
      }
      if (event.kind === 'discard') {
        if (!await animateDiscard(event)) return;
      } else if (event.kind === 'draw') {
        if (!await animateDraw(event)) return;
      } else {
        world = stageEvent(world, event, finalWorld, damageAmounts);
        const lethalTarget = event.kind === 'damage' && actor(world, event.target)?.hp === 0;
        if (lethalTarget) scene.playEvent(event);
        syncPresentation(world, cards);
        if (!lethalTarget) scene.playEvent(event);
        announce(event.message);
        const delay = event.kind === 'damage' ? 90 : event.kind === 'move' ? 150 : 50;
        if (!await presentationDelay(delay, token)) return;
      }
    }
    if (!await finishAction()) return;
    for (const pending of deferredDiscards.values()) {
      if (!await animateDiscard(pending)) return;
    }
    if (token !== playbackToken || destroyed) return;
    playing = false;
    selectedUid = null;
    selectedTarget = null;
    selectedSource = null;
    timelineOffset = 0;
    persist();
    render();
  }

  function command(value: WorldCommand): void {
    if (!run) return;
    const rewindAfterDefeat = value.kind === 'rewind' && run.world.phase === 'defeat';
    if (!rewindAfterDefeat && blocked()) return;
    if (rewindAfterDefeat && (destroyed || playing || presentationPaused || menuOpen || dictionaryOpen || pileOpen !== null || stackTick !== null || root.dataset.rewind === 'open')) return;
    stopTimelineNavigation();
    const initialWorld = presentationSnapshot(run.world);
    const initialVisuals = new Map<string, CardVisual>([...visuals].map(([uid, visual]) => [uid, {
      ...visual,
      targets: [...visual.targets],
      clip: visual.clip && { ...visual.clip },
      fog: visual.fog && { ...visual.fog },
    }]));
    const initialTimeline = allTimelineCards();
    const result = dispatchRun(run, value);
    if (!result.ok) {
      announce(result.reason ?? 'Action unavailable.');
      renderWorld();
      return;
    }
    worldRevision++;
    persist();
    void playEvents(result.events, initialWorld, initialVisuals, initialTimeline);
  }

  function playSelected(target?: string): void {
    if (!run || !selectedUid || blocked()) return;
    const sources = legalTargets(run.world, selectedUid);
    const definition = cardDefinition(selectedUid);
    if (!definition || availableEnergy(run.world) < definition.cost) {
      announce('Not enough energy.');
      return;
    }
    if (definition.temporal?.kind === 'echo') {
      if (target && sources.includes(target)) selectedSource = target;
      if (!selectedSource) {
        announce('Choose a past action.');
        renderWorld();
        return;
      }
      if (definition.target === 'self') {
        command({ kind: 'play', uid: selectedUid, sourceId: selectedSource });
        return;
      }
      const enemyTargets = visibleEnemies(run.world).filter((enemy) => Math.abs(enemy.position.x - run!.world.player.position.x) + Math.abs(enemy.position.y - run!.world.player.position.y) === 1).map((enemy) => enemy.id);
      const enemyTarget = target && enemyTargets.includes(target) ? target : selectedTarget && enemyTargets.includes(selectedTarget) ? selectedTarget : undefined;
      if (!enemyTarget) {
        announce(enemyTargets.length ? 'Choose an enemy.' : 'No enemy is in range.');
        renderWorld();
        return;
      }
      command({ kind: 'play', uid: selectedUid, sourceId: selectedSource, targetId: enemyTarget });
      return;
    }
    const selected = target ?? selectedTarget;
    if (sources.length > 1 && !selected) {
      announce('Choose a target.');
      return;
    }
    const resolved = selected ?? sources[0];
    const usesSource = definition.time?.kind === 'rewind';
    command({ kind: 'play', uid: selectedUid, ...(usesSource ? { sourceId: resolved } : resolved ? { targetId: resolved } : {}) });
  }
  function renderWithControlFocus(): void {
    const focused = document.activeElement as HTMLElement | null;
    const selector = focused?.dataset.action ? `[data-action="${focused.dataset.action}"]`
      : focused?.dataset.stack ? `[data-stack="${focused.dataset.stack}"]` : null;
    const timelineFocused = !!focused?.closest('.timeline');
    render();
    const control = selector ? main.querySelector<HTMLElement>(selector) : null;
    (control ?? (timelineFocused ? main.querySelector<HTMLElement>('[data-action="recenter"]') : null))?.focus();
  }
  function browse(direction: 1 | -1): void {
    if (!run || destroyed || menuOpen || dictionaryOpen || detail || pileOpen || stackTick !== null || drag || timelinePan || playing || presentationPaused || replacement || root.dataset.rewind === 'open' || mode !== 'world') return;
    stopTimelineNavigation();
    timelineOffset = Math.max(-run.world.tick, timelineOffset + direction);
    refreshTimeline();
  }

  function zoom(direction: 1 | -1): void {
    stopTimelineNavigation();
    const current = ZOOM_LEVELS.indexOf(prefs.zoom as typeof ZOOM_LEVELS[number]);
    prefs.zoom = ZOOM_LEVELS[Math.max(0, Math.min(ZOOM_LEVELS.length - 1, current + direction))];
    savePreferences();
    refreshTimeline();
  }

  function beginRun(seed: number, toolkit: ToolkitId): void {
    run = createRun(seed, toolkit);
    worldRevision++;
    playbackToken++;
    playing = false;
    mode = 'world';
    replacement = null;
    menuOpen = false;
    dictionaryOpen = false;
    stackTick = null;
    detail = null;
    selectedUid = null;
    selectedTarget = null;
    selectedSource = null;
    pileOpen = null;
    pilePage = 0;
    pileReturnFocus = null;
    choice = { page: 0, selected: null };
    cancelPointerInteraction();
    timelineOffset = 0;
    delete root.dataset.rewind;
    announce('New expedition. Tick 0.');
    persist();
    render();
  }

  function openMenu(): void {
    if (mode !== 'world' || !run || replacement || dictionaryOpen || detail || pileOpen || stackTick !== null || root.dataset.rewind === 'open' || run.world.phase === 'reward' || run.world.phase === 'service') return;
    cancelPointerInteraction();
    menuOpen = !menuOpen;
    if (playing) {
      main.querySelector('.playback-menu')?.remove();
      if (menuOpen) main.insertAdjacentHTML('beforeend', menuDialog().replace('modal-shade', 'modal-shade playback-menu'));
      pauseScene();
      if (menuOpen) focusModal();
      return;
    }
    renderWorld();
  }

  function setChoice(optionId: string): void {
    const option = choiceOptions().find((candidate) => candidate.id === optionId);
    if (!option) return;
    if (!optionDefinition(option)) {
      commitChoice(optionId);
      return;
    }
    choice.selected = optionId;
    renderChoices();
  }

  function commitChoice(optionId: string): void {
    const result = chooseRunOption(run!, optionId);
    if (!result.ok) announce(result.reason ?? 'Choice unavailable.');
    else {
      worldRevision++;
      choice = { page: 0, selected: null };
      persist();
    }
    render();
  }

  main.addEventListener('click', (event) => {
    const clicked = event.target as HTMLElement;
    if (clicked.dataset.detailShade !== undefined) {
      const point = designPoint(event);
      const pose = scene.getCardPose('detail-card');
      if (pose && point.x >= pose.x && point.x <= pose.x + pose.width && point.y >= pose.y && point.y <= pose.y + pose.height) return;
      closeDetail();
      return;
    }
    const button = clicked.closest<HTMLButtonElement>('button');
    if (!button) return;
    const action = button.dataset.action;
    if (playing && action !== 'menu' && action !== 'resume' && action !== 'title') return;
    if (action === 'continue') {
      run = savedRun();
      if (!run) return renderTitle();
      worldRevision++;
      mode = 'world';
      render();
    } else if (action === 'new') {
      if (savedRun()) { replacement = 'new'; renderTitle(); }
      else { mode = 'toolkit'; render(); }
    } else if (action === 'restart' && run) {
      replacement = 'restart';
      renderTitle();
    } else if (action === 'confirm-new') {
      const previous = replacement === 'restart' ? run : null;
      replacement = null;
      if (previous) beginRun(previous.seed, previous.toolkit);
      else { mode = 'toolkit'; render(); }
    } else if (action === 'cancel-new') {
      replacement = null;
      render();
    } else if (action === 'title') {
      clearAnnouncement();
      persist();
      cancelPointerInteraction();
      playbackToken++;
      playing = false;
      menuOpen = false;
      detail = null;
      pileOpen = null;
      mode = 'title';
      pileReturnFocus = null;
      render();
    } else if (action === 'options') {
      optionsReturn = mode === 'world' ? 'world' : 'title';
      menuOpen = false;
      mode = 'options';
      render();
    } else if (action === 'options-back') {
      closeOptions();
    } else if (action === 'resume') {
      menuOpen = false;
      if (playing) {
        main.querySelector('.playback-menu')?.remove();
        pauseScene();
      } else renderWorld();
    } else if (action === 'dictionary') { dictionaryOpen = true; menuOpen = false; renderWorld(); }
    else if (action === 'close-dictionary') { dictionaryOpen = false; renderWorld(); }
    else if (action === 'afterimages') { prefs.afterimages = !prefs.afterimages; savePreferences(); renderWithControlFocus(); }
    else if (action === 'fullscreen') { void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()); }
    else if (action === 'menu') openMenu();
    else if (action === 'export-legacy') {
      const legacy = localStorage.getItem(LEGACY_SAVE_KEY);
      if (legacy) {
        const anchor = document.createElement('a');
        anchor.href = URL.createObjectURL(new Blob([legacy], { type: 'application/json' }));
        anchor.download = 'stoptheinvasion-legacy-v1.json';
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(anchor.href), 0);
      }
    } else if (action === 'wait') command({ kind: 'wait' });
    else if (action === 'potion') command({ kind: 'potion' });
    else if (action === 'rewind') { root.dataset.rewind = 'open'; renderWorld(); }
    else if (action === 'close-rewind') { delete root.dataset.rewind; renderWorld(); }
    else if (action === 'close-pile') {
      const returnPile = pileReturnFocus;
      pileOpen = null;
      pileReturnFocus = null;
      detail = null;
      renderWorld();
      queueMicrotask(() => returnPile && main.querySelector<HTMLElement>(`[data-pile="${returnPile}"]`)?.focus());
    }
    else if (action === 'pile-prev') { pilePage = Math.max(0, pilePage - 1); renderWorld(); }
    else if (action === 'pile-next' && pileOpen) {
      const pages = Math.max(1, Math.ceil(cardsInPile(pileOpen).length / PILE_PAGE_SIZE));
      pilePage = Math.min(pages - 1, pilePage + 1);
      renderWorld();
    }
    else if (action === 'play-now') playSelected();
    else if (action === 'clear-selection') { selectedUid = null; selectedTarget = null; selectedSource = null; detail = null; renderWorld(); }
    else if (action === 'browse-left') browse(-1);
    else if (action === 'browse-right') browse(1);
    else if (action === 'recenter') recenterTimeline();
    else if (action === 'zoom-out') zoom(-1);
    else if (action === 'zoom-in') zoom(1);
    else if (action === 'close-stack') closeStack();
    else if (action === 'inspect-selected' && selectedUid) {
      const definition = cardDefinition(selectedUid);
      if (definition) detail = { definition, grade: run?.world.grades[selectedUid] ?? 0, label: definition.name, locked: false, returnFocus: '[data-action="inspect-selected"]', forecast: visuals.get(selectedUid)?.forecast };
      renderWorld();
    } else if (action === 'close-detail') closeDetail();
    else if (action === 'choice-prev') { choice.page--; choice.selected = null; renderChoices(); }
    else if (action === 'choice-next') { choice.page++; choice.selected = null; renderChoices(); }
    else if (action === 'choice-confirm' && choice.selected) commitChoice(choice.selected);

    if (button.dataset.toolkit) {
      beginRun(freshSeed(), button.dataset.toolkit as ToolkitId);
    } else if (button.dataset.move) command({ kind: 'move', direction: button.dataset.move as Direction });
    else if (button.dataset.object) command({ kind: 'interact', objectId: button.dataset.object });
    else if (button.dataset.inspect) announce(button.dataset.inspect);
    else if (button.dataset.pile) {
      pileReturnFocus = button.dataset.pile as PileKind;
      pileOpen = button.dataset.pile as PileKind;
      pilePage = 0;
      selectedUid = null;
      selectedTarget = null;
      selectedSource = null;
      renderWorld();
    } else if (button.dataset.pileCard && pileOpen) {
      const card = cardsInPile(pileOpen).find((candidate) => candidate.uid === button.dataset.pileCard);
      if (card) {
        const definition = CARDS[card.definitionId];
        detail = { definition, grade: run!.world.grades[card.uid] ?? 0, label: `${definition.name}, ${card.uid}`, locked: true, returnFocus: `[data-pile-card="${CSS.escape(card.uid)}"]` };
        renderWorld();
      }
    }
    else if (button.dataset.target) {
      const definition = selectedUid ? cardDefinition(selectedUid) : null;
      if (selectedUid && (legalTargets(run!.world, selectedUid).includes(button.dataset.target) || (definition?.temporal?.kind === 'echo' && selectedSource))) playSelected(button.dataset.target);
      else { selectedTarget = button.dataset.target; scene.setTarget(selectedTarget); announce(button.getAttribute('aria-label') ?? 'Target'); }
    } else if (button.dataset.card && !drag) {
      if (selectedUid && legalTargets(run!.world, selectedUid).includes(button.dataset.card)) playSelected(button.dataset.card);
      else { selectedUid = button.dataset.card; selectedTarget = null; selectedSource = null; renderWorld(); }
    } else if (button.dataset.source) {
      stackTick = null;
      playSelected(button.dataset.source);
    } else if (button.dataset.stack) { stackTick = Number(button.dataset.stack); renderWorld(); }
    else if (button.dataset.choice) setChoice(button.dataset.choice);
    else if (button.dataset.inspectCard) {
      const card = allTimelineCards().find((candidate) => candidate.id === button.dataset.inspectCard);
      if (card?.definition) {
        detail = { definition: card.definition, grade: card.upgradeLevel, label: card.definition.name, locked: card.kind === 'enemy', returnFocus: `[data-stack="${card.tick}"]`, forecast: cachedTimelineForecast(card) };
        stackTick = null;
        renderWorld();
      }
    } else if (button.dataset.rewind) {
      const tick = Number(button.dataset.rewind);
      delete root.dataset.rewind;
      command({ kind: 'rewind', tick });
    }
  }, { signal: controller.signal });

  main.addEventListener('change', (event) => {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement) || select.dataset.pref !== 'motion') return;
    const value = select.value;
    if (value !== 'system' && value !== 'on' && value !== 'off') return;
    prefs.reducedMotion = value;
    savePreferences();
    pauseScene();
  }, { signal: controller.signal });

  main.addEventListener('pointerover', (event) => {
    if (event.pointerType !== 'mouse' || playing || drag || detail) return;
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-card]');
    const uid = button?.dataset.card;
    if (!button || !uid || hoverUid === uid) return;
    hoverUid = uid;
    buildVisuals();
    syncHandHit(button, uid);
  }, { signal: controller.signal });
  main.addEventListener('pointerout', (event) => {
    if (event.pointerType !== 'mouse' || playing || drag) return;
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-card]');
    const uid = button?.dataset.card;
    if (!button || !uid || hoverUid !== uid) return;
    hoverUid = null;
    buildVisuals();
    syncHandHit(button, uid);
  }, { signal: controller.signal });

  main.addEventListener('pointerdown', (event) => {
    const element = event.target as Element;
    const button = element.closest<HTMLButtonElement>('[data-card]');
    if (!button) {
      if (element.closest('.timeline-band') && !element.closest('button') && !blocked()) {
        stopTimelineNavigation(false);
        const point = designPoint(event);
        timelinePan = { pointerId: event.pointerId, startX: point.x, startOffset: timelineOffset };
        main.setPointerCapture(event.pointerId);
      }
      return;
    }
    if (blocked() || !run) return;
    const uid = button.dataset.card!;
    const definition = cardDefinition(uid);
    stopTimelineNavigation(false);
    if (!definition || availableEnergy(run.world) < definition.cost) return;
    const point = designPoint(event);
    drag = { uid, pointerId: event.pointerId, startX: point.x, startY: point.y, x: point.x, y: point.y, moved: false };
    button.setPointerCapture(event.pointerId);
  }, { signal: controller.signal });

  main.addEventListener('pointermove', (event) => {
    const point = designPoint(event);
    scene.setPointer(point.x, point.y);
    if (timelinePan?.pointerId === event.pointerId) {
      timelineOffset = Math.max(-run!.world.tick, timelinePan.startOffset + (timelinePan.startX - point.x) / (TIMELINE_GAP * prefs.zoom));
      refreshTimeline();
      return;
    }
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag.x = point.x;
    drag.y = point.y;
    drag.moved ||= Math.hypot(point.x - drag.startX, point.y - drag.startY) >= DRAG_THRESHOLD;
    if (drag.moved) {
      selectedUid = drag.uid;
      buildVisuals();
    }
  }, { signal: controller.signal });

  function finishDrag(event: PointerEvent, canceled: boolean): void {
    if (timelinePan?.pointerId === event.pointerId) {
      timelinePan = null;
      stopTimelineNavigation();
      refreshTimeline();
      return;
    }
    if (!drag || drag.pointerId !== event.pointerId) return;
    const ended = drag;
    const point = designPoint(event);
    const nowButton = !canceled && ended.moved && document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-action="play-now"]');
    drag = null;
    if (!canceled && ended.moved && (nowButton || (Math.abs(point.x - NOW_X) <= 110 && point.y >= CARD_WORKSPACE.y && point.y < HAND_TOP))) {
      selectedUid = ended.uid;
      playSelected();
    } else if (ended.moved) renderWorld();
  }
  main.addEventListener('pointerup', (event) => finishDrag(event, false), { signal: controller.signal });
  main.addEventListener('pointercancel', (event) => finishDrag(event, true), { signal: controller.signal });
  main.addEventListener('wheel', (event) => {
    if (!(event.target as Element).closest('.timeline') || blocked() || event.ctrlKey || event.metaKey || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    const scale = main.getBoundingClientRect().width / DESIGN_WIDTH;
    if (scale <= 0) return;
    event.preventDefault();
    stopTimelineNavigation(false);
    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? CARD_WORKSPACE.width * scale : 1;
    timelineOffset = Math.max(-run!.world.tick, timelineOffset + event.deltaX * unit / scale / (TIMELINE_GAP * prefs.zoom));
    refreshTimeline();
    timelineSnapTimer = window.setTimeout(() => {
      stopTimelineNavigation();
      if (!blocked()) refreshTimeline();
    }, 140);
  }, { signal: controller.signal, passive: false });

  window.addEventListener('keydown', (event) => {
    if (destroyed) return;
    const target = event.target as HTMLElement;
    if (event.repeat && event.key !== 'Tab' && !target.closest('select,input,textarea,summary')) {
      event.preventDefault();
      return;
    }
    const layers = root.querySelectorAll<HTMLElement>('.modal-shade, .detail-shade');
    const modal = layers.item(layers.length - 1);
    if (event.key === 'Tab' && modal) {
      const focusable = [...modal.querySelectorAll<HTMLElement>('button:not(:disabled),select,summary,[tabindex="0"]')];
      if (focusable.length) {
        const index = focusable.indexOf(document.activeElement as HTMLElement);
        const next = event.shiftKey ? (index <= 0 ? focusable.at(-1)! : focusable[index - 1]) : focusable[(index + 1) % focusable.length];
        event.preventDefault();
        next.focus();
      }
      return;
    }
    if (event.key === 'Escape') {
      if (drag || timelinePan) {
        const canceledCard = drag !== null;
        cancelPointerInteraction();
        if (canceledCard) { selectedUid = null; selectedTarget = null; selectedSource = null; }
        renderWorld();
        event.preventDefault();
        return;
      }
      if (playing) {
        openMenu();
        return;
      }
      if (mode === 'options') { closeOptions(); return; }
      if (replacement) { replacement = null; render(); return; }
      if (mode === 'toolkit') { mode = 'title'; renderTitle(); return; }
      const closingPile = pileOpen !== null && !detail;
      const returnPile = pileReturnFocus;
      if (detail) {
        closeDetail();
        return;
      }
      if (dictionaryOpen) dictionaryOpen = false;
      else if (stackTick !== null) { closeStack(); return; }
      else if (pileOpen) {
        pileOpen = null;
        pileReturnFocus = null;
      } else if (root.dataset.rewind) delete root.dataset.rewind;
      else if (mode === 'world') { openMenu(); return; }
      render();
      if (closingPile && returnPile) queueMicrotask(() => main.querySelector<HTMLElement>(`[data-pile="${returnPile}"]`)?.focus());
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const timelineControl = target.closest<HTMLElement>('.timeline');
    if (timelineControl && event.key.startsWith('Arrow')) {
      event.preventDefault();
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') browse(event.key === 'ArrowRight' ? 1 : -1);
      return;
    }
    if (target.closest('select,input,textarea,summary') || blocked()) return;
    const direction: Record<string, Direction> = { ArrowUp: 'up', ArrowRight: 'right', ArrowDown: 'down', ArrowLeft: 'left' };
    if (direction[event.key]) { event.preventDefault(); command({ kind: 'move', direction: direction[event.key] }); }
    else if (!target.closest('button') && (event.key === '.' || event.key === ' ')) { event.preventDefault(); command({ kind: 'wait' }); }
    else if (event.key === 'Home') { event.preventDefault(); recenterTimeline(); }
    else if (event.key === '-' || event.key === '=' || event.key === '+') { event.preventDefault(); zoom(event.key === '-' ? -1 : 1); }
    else if (event.key === '0') { event.preventDefault(); stopTimelineNavigation(); prefs.zoom = 1; savePreferences(); refreshTimeline(); }
  }, { signal: controller.signal });

  window.addEventListener('blur', () => {
    presentationPaused = true;
    if (cancelPointerInteraction() && mode === 'world' && !playing) renderWorld();
    else pauseScene();
  }, { signal: controller.signal });
  window.addEventListener('focus', () => { presentationPaused = false; pauseScene(); }, { signal: controller.signal });
  document.addEventListener('visibilitychange', () => {
    presentationPaused = document.hidden;
    if (document.hidden && cancelPointerInteraction() && mode === 'world' && !playing) renderWorld();
    else pauseScene();
  }, { signal: controller.signal });
  media.addEventListener('change', pauseScene, { signal: controller.signal });

  const unmountGamepad = mountGamepad({
    canAct: () => !blocked(),
    move: (direction) => command({ kind: 'move', direction }),
    navigate: browse,
    zoom,
    toggleMenu: openMenu,
  });

  Object.defineProperty(window, '__WORLD__', {
    configurable: true,
    get: () => Object.freeze(run ? {
      tick: run.world.tick,
      phase: run.world.phase,
      hp: run.world.player.hp,
      position: Object.freeze({ ...run.world.player.position }),
      hand: Object.freeze(run.world.hand.map((card) => card.definitionId)),
      playing,
      modal: menuOpen || dictionaryOpen || detail !== null || pileOpen !== null || stackTick !== null || root.dataset.rewind === 'open' || run.world.phase === 'reward' || run.world.phase === 'service',
    } : { phase: mode }),
  });

  render();
  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearAnnouncement();
      stopTimelineNavigation();
      playbackToken++;
      scene.setCards([]);
      controller.abort();
      unmountGamepad();
      delete (window as Window & { __WORLD__?: unknown }).__WORLD__;
      root.replaceChildren();
    },
  };
}

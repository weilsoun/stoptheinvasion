import { cardDefinition } from './combat';
import {
  availableNodes,
  createExpedition,
  deserializeExpedition,
  dispatchExpedition,
  expeditionCardDefinition,
  expeditionServices,
  recruitableCrew,
  serializeExpedition,
  upgradeableCards,
} from './expedition';
import {
  AWAY_MISSIONS,
  CREW,
  EXPEDITION_RULES,
  EXPEDITION_SAVE_KEY,
  SALVAGE_CARD_IDS,
  SECTOR,
  SECTOR_NODES,
  crewStats,
  upgradeShipCard,
} from './expedition-content';
import {
  AWAY_LAYOUT,
  awayActorPose,
  type ExpeditionCommand,
  type ExpeditionResult,
  type ExpeditionScene,
  type ExpeditionState,
  type PresentationSettings,
  type ShipCombatPort,
} from './expedition-types';
import { DEFAULT_PRESENTATION, loadPresentationSettings, resolvePresentation, savePresentationSettings } from './presentation';
import { mountShipCombat } from './ui';
import { shipHandPoses, type CrewId, type ShipBaseCardId, type ShipCardDefinition, type ShipCardVisual, type ShipGamePort } from './types';

type View = 'title' | 'map' | 'battle' | 'salvage' | 'service' | 'planet' | 'science' | 'away' | 'victory' | 'defeat';
type Overlay = 'menu' | 'settings' | 'rules' | 'route' | 'confirm-new' | 'confirm-restart' | 'error' | null;
type ServiceOption = 'repair' | 'upgrade' | 'recruit' | 'card';
type DebugWindow = Window & { __KESTREL__?: unknown };

const clone = <T>(value: T): T => structuredClone(value);
const escapeHtml = (value: string): string => value.replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
})[character]!);

function freshSeed(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0]!;
}

function viewFor(run: ExpeditionState | null): View {
  if (!run) return 'title';
  if (run.phase === 'depot') return 'service';
  return run.phase;
}

export function mountKestrel(root: HTMLElement, scene: ExpeditionScene): ShipGamePort {
  const controller = new AbortController();
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const loadedPresentation = loadPresentationSettings();
  let settings: PresentationSettings = loadedPresentation.settings;
  let run: ExpeditionState | null = null;
  let savedRun: ExpeditionState | null = null;
  let invalidSave: string | null = null;
  let invalidSaveError = '';
  let expeditionStorageError = '';
  let presentationStorageError = loadedPresentation.error;
  let overlay: Overlay = null;
  let overlayParent: Overlay = null;
  let overlayOrigin: HTMLElement | null = null;
  let combat: ShipCombatPort | null = null;
  let destroyed = false;
  let sequence = 0;
  let awayBusy = false;
  let selectedNodeId = 'launch';
  let selectedService: ServiceOption | null = null;
  let selectedServiceTarget: string | null = null;
  let selectedParty: CrewId[] = [];
  let selectedUpgradeUid: string | null = null;
  let selectedSalvage: { kind: 'card'; cardId: ShipBaseCardId } | { kind: 'crew'; crewId: CrewId } | null = null;
  let displayedAway: ExpeditionState['away'] = null;
  let awayLog: string[] = [];
  let message = presentationStorageError;
  const resumeWaiters = new Set<() => void>();

  root.className = 'kestrel-shell';
  root.innerHTML = '<div class="shell-surface"></div><div class="shell-storage-warning" role="alert" hidden></div><div class="shell-overlay"></div><div class="live-region sr-only" aria-live="polite"></div>';
  const surface = root.querySelector<HTMLElement>('.shell-surface')!;
  const storageWarning = root.querySelector<HTMLElement>('.shell-storage-warning')!;
  const overlayLayer = root.querySelector<HTMLElement>('.shell-overlay')!;
  const live = root.querySelector<HTMLElement>('.live-region')!;

  function presentation() {
    return resolvePresentation(settings, media.matches);
  }

  function announce(text: string): void {
    message = text;
    live.textContent = '';
    requestAnimationFrame(() => { if (!destroyed) live.textContent = text; });
  }

  function combinedStorageError(): string {
    return [expeditionStorageError, presentationStorageError].filter(Boolean).join(' ');
  }

  function renderStorageWarning(): void {
    const error = combinedStorageError();
    storageWarning.hidden = !error;
    storageWarning.textContent = error;
  }

  function readSave(): void {
    savedRun = null;
    invalidSave = null;
    invalidSaveError = '';
    try {
      const text = localStorage.getItem(EXPEDITION_SAVE_KEY);
      if (text === null) return;
      const result = deserializeExpedition(text);
      if (result.ok) savedRun = result.state;
      else {
        invalidSave = text;
        invalidSaveError = result.error;
      }
    } catch {
      expeditionStorageError = 'Expedition storage is unavailable. Progress remains available in this tab; allow website storage before closing it.';
      renderStorageWarning();
    }
  }

  function persist(): void {
    if (!run) return;
    savedRun = clone(run);
    try {
      localStorage.setItem(EXPEDITION_SAVE_KEY, serializeExpedition(run));
      invalidSave = null;
      invalidSaveError = '';
      expeditionStorageError = '';
    } catch {
      expeditionStorageError = 'The committed expedition is only saved in this tab. Keep it open and allow website storage before closing it.';
      announce(expeditionStorageError);
    }
    renderStorageWarning();
  }

  function applyPresentation(): void {
    const resolved = presentation();
    root.classList.toggle('reduced-motion', resolved.reducedMotion);
    root.dataset.effects = resolved.effects;
    scene.setPresentation(resolved);
    combat?.refresh();
  }

  function currentView(): View {
    return viewFor(run);
  }

  function isPaused(): boolean {
    return overlay !== null;
  }

  function setPaused(): void {
    scene.setPaused(isPaused());
  }

  function wakePresentation(): void {
    if (isPaused()) return;
    for (const resume of resumeWaiters) resume();
    resumeWaiters.clear();
  }

  async function waitUntilUnpaused(token: number, expected: View): Promise<boolean> {
    while (!destroyed && token === sequence && currentView() === expected && isPaused()) {
      await new Promise<void>(resolve => resumeWaiters.add(resolve));
    }
    return !destroyed && token === sequence && currentView() === expected;
  }

  function dispatch(command: ExpeditionCommand): ExpeditionResult {
    if (!run) return { ok: false, events: [], awayEvents: [], error: 'No expedition is active.' };
    const result = dispatchExpedition(run, command);
    if (result.ok) {
      persist();
      if (result.message) announce(result.message);
    } else announce(result.error);
    return result;
  }

  function clearPresentation(): void {
    sequence += 1;
    awayBusy = false;
    displayedAway = null;
    for (const resume of resumeWaiters) resume();
    resumeWaiters.clear();
    combat?.cancelInteraction();
    combat?.destroy();
    combat = null;
    scene.cancel();
    scene.setCards([], { reducedMotion: presentation().reducedMotion });
    scene.setAwayState(null);
  }

  function cardVisuals(cards: readonly { uid: string; definition: ShipCardDefinition }[]): ShipCardVisual[] {
    const poses = shipHandPoses(cards.length);
    return cards.map((card, index) => ({ ...poses[index]!, uid: card.uid, definition: card.definition, selected: false, dimmed: false }));
  }

  function setPhysicalCards(cards: readonly { uid: string; definition: ShipCardDefinition }[]): void {
    scene.setCards(cardVisuals(cards), { reducedMotion: presentation().reducedMotion });
  }

  function statusMarkup(): string {
    if (!run) return '';
    return `<div class="expedition-status" aria-label="Expedition status"><span><b>HULL</b> ${run.hull}/70</span><span><b>SCRAP</b> ${run.scrap}</span><span><b>CREW</b> ${run.crew.length}/4</span><span><b>DECK</b> ${run.deck.length}</span></div>`;
  }

  function header(title: string, eyebrow: string): string {
    return `<header class="expedition-heading"><div><p class="eyebrow">${escapeHtml(eyebrow)}</p><h1>${escapeHtml(title)}</h1></div>${statusMarkup()}${run ? '<button data-action="menu" data-focus-key="menu">Menu</button>' : ''}</header>`;
  }

  function mapMarkup(inspectOnly: boolean): string {
    if (!run) return '';
    const available = new Set(availableNodes(run).map(node => node.id));
    const visited = new Set(run.visited);
    const selected = SECTOR[selectedNodeId] ?? SECTOR[run.nodeId]!;
    const nodePosition = (depth: number, lane: number) => ({ x: 145 + depth * 218, y: 575 + lane * 285 });
    const links = SECTOR_NODES.flatMap(node => node.next.map(nextId => {
      const target = SECTOR[nextId]!;
      const from = nodePosition(node.depth, node.lane);
      const to = nodePosition(target.depth, target.lane);
      const active = visited.has(node.id) && (visited.has(nextId) || available.has(nextId));
      return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" class="${active ? 'charted' : ''}" />`;
    })).join('');
    const nodes = SECTOR_NODES.map(node => {
      const position = nodePosition(node.depth, node.lane);
      const stateClass = node.id === run!.nodeId ? 'current' : visited.has(node.id) ? 'visited' : available.has(node.id) ? 'reachable' : 'future';
      return `<button class="sector-node ${stateClass} kind-${node.kind}" style="left:${position.x}px;top:${position.y}px" data-node="${escapeHtml(node.id)}" aria-pressed="${selected.id === node.id}" aria-label="Inspect ${escapeHtml(node.title)}, ${node.kind}, ${stateClass}"><span>${escapeHtml(node.title)}</span><small>${escapeHtml(node.kind)}</small></button>`;
    }).join('');
    const canTravel = !inspectOnly && available.has(selected.id);
    const atExit = !inspectOnly && selected.id === run.nodeId && selected.kind === 'exit' && run.phase === 'map';
    return `<div class="sector-map"><svg aria-hidden="true" viewBox="0 0 1920 1140" preserveAspectRatio="none">${links}</svg>${nodes}</div><aside class="route-detail ink-plate"><p class="eyebrow">${escapeHtml(selected.kind)}</p><h2>${escapeHtml(selected.title)}</h2><p>${escapeHtml(selected.description)}</p><p class="route-state">${selected.id === run.nodeId ? 'Current location' : visited.has(selected.id) ? 'Visited' : available.has(selected.id) ? 'Course available' : 'Future signal — inspect only'}</p>${canTravel ? `<button class="primary" data-travel="${escapeHtml(selected.id)}">Travel here</button>` : ''}${atExit ? '<button class="primary" data-action="complete">Transmit survey</button>' : ''}${inspectOnly ? '<p class="encounter-return">Route inspection cannot leave or advance the active encounter.</p>' : ''}</aside>`;
  }

  function renderTitle(): void {
    scene.setScreen('title');
    scene.setCards([], { reducedMotion: presentation().reducedMotion });
    surface.innerHTML = `<section class="title-screen"><div class="title-mark"><p class="eyebrow">A Kestrel expedition</p><h1>FAR RELAY</h1><p>Chart the quiet system. Bring the survey home.</p></div><nav aria-label="Main menu">${savedRun ? '<button class="primary" data-action="continue" data-focus-key="continue">Continue</button>' : ''}<button data-action="start" data-focus-key="start">Start Game</button><button data-action="settings">Settings</button><button data-action="rules">Rules</button>${invalidSave !== null ? '<button data-action="download-invalid">Download invalid save</button>' : ''}</nav>${invalidSaveError ? `<p class="save-warning" role="alert">Saved expedition cannot be loaded: ${escapeHtml(invalidSaveError)} It is retained until you confirm replacement.</p>` : ''}</section>`;
  }

  function renderMap(): void {
    if (!run) return;
    scene.setScreen('map');
    scene.setAwayState(null);
    setPhysicalCards([]);
    if (!SECTOR[selectedNodeId]) selectedNodeId = run.nodeId;
    surface.innerHTML = `${header('The Quiet System', 'Survey route')}${mapMarkup(false)}${message ? `<p class="shell-message" role="status">${escapeHtml(message)}</p>` : ''}`;
  }

  function mountBattle(): void {
    if (!run?.battle) return;
    scene.setScreen('ship');
    surface.innerHTML = '<div class="combat-host"></div>';
    const host = surface.querySelector<HTMLElement>('.combat-host')!;
    combat = mountShipCombat(host, scene, {
      state: () => {
        if (!run?.battle) throw new Error('Battle state is unavailable.');
        return run.battle;
      },
      dispatch: command => {
        const result = dispatch({ type: 'battle', command });
        return result.ok ? { ok: true, events: result.events } : { ok: false, error: result.error, events: [] };
      },
      presentation,
      blocked: () => destroyed || overlay !== null,
      onMenu: () => openOverlay('menu'),
      onComplete: finishBattle,
    });
  }

  function finishBattle(): void {
    if (!run || run.phase !== 'battle' || !run.battle || run.battle.phase === 'player') return;
    const result = dispatch({ type: 'finish-battle' });
    if (result.ok) renderRun();
  }

  function renderSalvage(): void {
    if (!run?.reward) return;
    scene.setScreen('map');
    const physical: { uid: string; definition: ShipCardDefinition }[] = run.reward.cards.map(id => ({ uid: `reward:${id}`, definition: cardDefinition(id) }));
    if (run.reward.crewId) physical.push({ uid: `reward:crew:${run.reward.crewId}`, definition: CREW[run.reward.crewId].card });
    if (selectedUpgradeUid) {
      const card = run.deck.find(candidate => candidate.uid === selectedUpgradeUid);
      if (card) {
        physical.push({ uid: `before:${card.uid}`, definition: expeditionCardDefinition(run, card) });
        physical.push({ uid: `after:${card.uid}`, definition: upgradeShipCard(cardDefinition(card.id), (card.upgradeLevel ?? 0) + 1) });
      }
    }
    setPhysicalCards(physical);
    const upgrades = run.reward.allowUpgrade ? upgradeableCards(run) : [];
    surface.innerHTML = `${header('Salvage Claim', `Recovered ${run.reward.scrap} scrap`)}<section class="choice-panel salvage-panel"><h2>Choose one claim</h2><div class="choice-grid">${run.reward.cards.map(id => `<button data-salvage-card="${id}" aria-pressed="${selectedSalvage?.kind === 'card' && selectedSalvage.cardId === id}">Take ${escapeHtml(cardDefinition(id).title)}</button>`).join('')}${run.reward.crewId ? `<button data-salvage-crew="${run.reward.crewId}" aria-pressed="${selectedSalvage?.kind === 'crew' && selectedSalvage.crewId === run.reward.crewId}">Recruit ${escapeHtml(CREW[run.reward.crewId].name)}</button>` : ''}${upgrades.length ? '<button data-action="show-upgrades">Refit an exact card</button>' : ''}<button data-action="skip-salvage">Leave salvage</button></div>${selectedSalvage ? `<div class="exact-selection"><h3>Confirm salvage claim</h3><p>${selectedSalvage.kind === 'card' ? escapeHtml(cardDefinition(selectedSalvage.cardId).title) : escapeHtml(CREW[selectedSalvage.crewId].name)}</p><div><button data-action="cancel-selection">Cancel</button><button class="primary" data-action="confirm-salvage">Confirm claim</button></div></div>` : ''}${upgrades.length && selectedUpgradeUid !== null ? `<div class="exact-selection"><h3>Exact card refit</h3><p>Physical preview: current card, then refitted card.</p>${upgrades.map(card => `<button data-upgrade-card="${escapeHtml(card.uid)}" aria-pressed="${card.uid === selectedUpgradeUid}">${escapeHtml(expeditionCardDefinition(run!, card).title)} · ${escapeHtml(card.uid)}</button>`).join('')}<div><button data-action="cancel-selection">Cancel</button><button class="primary" data-action="confirm-upgrade" ${selectedUpgradeUid ? '' : 'disabled'}>Confirm refit</button></div></div>` : ''}</section>`;
  }

  function serviceTargets(option: ServiceOption): string {
    if (!run) return '';
    if (option === 'upgrade') return upgradeableCards(run).map(card => `<button data-service-target="${escapeHtml(card.uid)}" aria-pressed="${selectedServiceTarget === card.uid}">${escapeHtml(expeditionCardDefinition(run!, card).title)} · ${escapeHtml(card.uid)}</button>`).join('');
    if (option === 'recruit') return recruitableCrew(run).map(id => `<button data-service-target="${id}" aria-pressed="${selectedServiceTarget === id}">${escapeHtml(CREW[id].name)} · ${escapeHtml(CREW[id].role)}</button>`).join('');
    if (option === 'card') return SALVAGE_CARD_IDS.map(id => `<button data-service-target="${id}" aria-pressed="${selectedServiceTarget === id}">${escapeHtml(cardDefinition(id).title)}</button>`).join('');
    return '<p>Restore the displayed amount of persistent hull.</p>';
  }

  function renderService(): void {
    if (!run) return;
    scene.setScreen('map');
    const selectedCard = selectedService === 'upgrade' && selectedServiceTarget
      ? run.deck.find(card => card.uid === selectedServiceTarget)
      : undefined;
    const serviceCards: { uid: string; definition: ShipCardDefinition }[] = selectedCard ? [
      { uid: `service-before:${selectedCard.uid}`, definition: expeditionCardDefinition(run, selectedCard) },
      { uid: `service-after:${selectedCard.uid}`, definition: upgradeShipCard(cardDefinition(selectedCard.id), (selectedCard.upgradeLevel ?? 0) + 1) },
    ] : selectedService === 'recruit' && selectedServiceTarget
      ? [{ uid: `service-crew:${selectedServiceTarget}`, definition: CREW[selectedServiceTarget as CrewId].card }]
      : selectedService === 'card' && selectedServiceTarget
        ? [{ uid: `service-card:${selectedServiceTarget}`, definition: cardDefinition(selectedServiceTarget as ShipBaseCardId) }]
        : [];
    setPhysicalCards(serviceCards);
    const services = expeditionServices(run);
    surface.innerHTML = `${header(SECTOR[run.nodeId]?.title ?? 'Service stop', run.phase === 'depot' ? 'Orion depot' : 'Nomad freighter')}<section class="choice-panel service-panel"><h2>Finite services</h2><p>Each category can be purchased once here. Leaving abandons remaining stock.</p><div class="service-list">${services.map(service => `<button data-service="${service.option}" ${service.available ? '' : 'disabled'}><b>${escapeHtml(service.title)}</b><span>${service.cost} scrap${service.amount ? ` · ${service.amount}` : ''}</span><small>${escapeHtml(service.reason)}</small></button>`).join('')}</div>${selectedService ? `<div class="exact-selection"><h3>Confirm ${escapeHtml(services.find(service => service.option === selectedService)?.title ?? selectedService)}</h3>${serviceTargets(selectedService)}<div><button data-action="cancel-selection">Cancel</button><button class="primary" data-action="confirm-service" ${(selectedService !== 'repair' && !selectedServiceTarget) ? 'disabled' : ''}>Confirm purchase</button></div></div>` : ''}<button data-action="leave">Depart permanently</button></section>`;
  }

  function partyTotals(): { diplomacy: number; science: number } {
    if (!run) return { diplomacy: 0, science: 0 };
    return selectedParty.reduce((total, id) => {
      const member = run!.crew.find(candidate => candidate.id === id);
      if (!member) return total;
      const stats = crewStats(member);
      return { diplomacy: total.diplomacy + stats.diplomacy, science: total.science + stats.science };
    }, { diplomacy: 0, science: 0 });
  }

  function renderPlanet(): void {
    if (!run) return;
    const node = SECTOR[run.nodeId];
    const mission = node?.missionId ? AWAY_MISSIONS[node.missionId] : undefined;
    if (!mission) return;
    scene.setScreen('away');
    scene.setAwayState(null);
    const selectedMembers = selectedParty.map(id => run!.crew.find(member => member.id === id)).filter(member => member !== undefined);
    setPhysicalCards(selectedMembers.map(member => ({ uid: `party:${member.cardUid}`, definition: expeditionCardDefinition(run!, run!.deck.find(card => card.uid === member.cardUid)!) })));
    const totals = partyTotals();
    surface.innerHTML = `${header(mission.title, 'Away mission')}
      <section class="mission-brief ink-plate"><p>${escapeHtml(mission.description)}</p><p><b>Diplomacy:</b> selected party ${totals.diplomacy} / ${mission.diplomacyRequired} required · ${mission.diplomacyCost} scrap</p><p><b>Deployment:</b> choose 1–${EXPEDITION_RULES.teamSize} crew. Front position takes enemy fire.</p></section>
      <section class="formation-panel" aria-label="Away-team formation"><h2>Formation</h2>${run.crew.map(member => { const stats = crewStats(member); const index = selectedParty.indexOf(member.id); return `<article class="crew-choice ${index >= 0 ? 'selected' : ''}"><button data-party="${member.id}" aria-pressed="${index >= 0}"><b>${escapeHtml(CREW[member.id].name)} · Level ${member.level}</b><span>HP ${stats.hp} · Attack ${stats.attack} · Speed ${stats.speed}</span><small>${escapeHtml(CREW[member.id].abilityName)} — ${escapeHtml(stats.abilityText)}</small></button>${index >= 0 ? `<div><button data-party-move="up" data-crew="${member.id}" ${index === 0 ? 'disabled' : ''} aria-label="Move ${escapeHtml(CREW[member.id].name)} forward">↑</button><b>${index + 1}</b><button data-party-move="down" data-crew="${member.id}" ${index === selectedParty.length - 1 ? 'disabled' : ''} aria-label="Move ${escapeHtml(CREW[member.id].name)} back">↓</button></div>` : ''}</article>`; }).join('')}<div class="mission-actions"><button data-action="leave">Leave planet</button><button data-action="diplomacy" ${(selectedParty.length && totals.diplomacy >= mission.diplomacyRequired && run.scrap >= mission.diplomacyCost) ? '' : 'disabled'}>Negotiate access</button><button class="primary" data-action="deploy" ${selectedParty.length ? '' : 'disabled'}>Deploy team</button></div></section>`;
  }

  function renderAwayStatus(): void {
    const view = displayedAway ?? run?.away;
    if (!view) return;
    const panel = surface.querySelector<HTMLElement>('.away-live');
    if (!panel) return;
    const units = (['crew', 'enemy'] as const).flatMap(side => {
      const sideUnits = view.units.filter(unit => unit.side === side);
      return sideUnits.map((unit, index) => {
        const pose = awayActorPose(side, index, sideUnits.length);
        const top = AWAY_LAYOUT.hudTop + pose.y - AWAY_LAYOUT.actorY;
        return `<article class="away-unit ${unit.side} ${unit.hp <= 0 ? 'down' : ''}" style="left:${pose.x - AWAY_LAYOUT.hudWidth / 2}px;top:${top}px;width:${AWAY_LAYOUT.hudWidth}px;height:${AWAY_LAYOUT.hudHeight}px"><h3>${escapeHtml(unit.name)}</h3><p>HP <b>${unit.hp}/${unit.maxHp}</b> · Guard <b>${unit.guard}/${unit.maxGuard}</b></p><p>Attack ${unit.attack} · Speed ${unit.speed}</p></article>`;
      });
    }).join('');
    panel.innerHTML = `<div class="away-units">${units}</div><ol class="away-log" style="left:${AWAY_LAYOUT.logX}px;top:${AWAY_LAYOUT.logY}px;width:${AWAY_LAYOUT.logWidth}px;height:${AWAY_LAYOUT.logHeight}px">${awayLog.slice(-6).map(entry => `<li>${escapeHtml(entry)}</li>`).join('')}</ol>`;
    const round = surface.querySelector<HTMLOutputElement>('[data-away-round]');
    if (round) round.value = String(view.round);
  }

  function renderAway(): void {
    if (!run?.away) return;
    scene.setScreen('away');
    scene.setAwayState(run.away);
    displayedAway = clone(run.away);
    setPhysicalCards([]);
    const terminal = run.away.phase !== 'playing';
    surface.innerHTML = `${header(AWAY_MISSIONS[run.away.missionId]?.title ?? 'Away mission', 'Away mission')}<p class="away-round">Round <output data-away-round>${run.away.round}</output></p><section class="away-live" aria-live="polite"></section><div class="shell-message">${awayBusy ? 'Resolving one action…' : escapeHtml(run.away.reason || 'Away team standing by.')}${terminal ? '<button class="primary" data-action="finish-away" data-focus-key="away-outcome">Continue expedition</button>' : ''}</div>`;
    renderAwayStatus();
    if (terminal) requestAnimationFrame(() => surface.querySelector<HTMLElement>('[data-focus-key="away-outcome"]')?.focus());
    else void continueAway();
  }

  async function continueAway(): Promise<void> {
    if (!run?.away || awayBusy || run.phase !== 'away' || run.away.phase !== 'playing') return;
    const token = sequence;
    awayBusy = true;
    if (!await waitUntilUnpaused(token, 'away')) return;
    if (!run?.away || token !== sequence || run.phase !== 'away' || run.away.phase !== 'playing') return;
    const displayedStart = clone(run.away);
    const result = dispatch({ type: 'away-step' });
    if (!result.ok || !run?.away) {
      if (token === sequence && currentView() === 'away') awayBusy = false;
      renderRun();
      return;
    }
    const finalState = clone(run.away);
    displayedAway = displayedStart;
    try {
      await scene.presentAway(result.awayEvents, finalState, {
        reducedMotion: presentation().reducedMotion,
        onEvent: event => {
          if (destroyed || token !== sequence || currentView() !== 'away' || !displayedAway) return;
          const recipientId = event.targetId ?? event.actorId;
          const unit = displayedAway.units.find(candidate => candidate.id === recipientId);
          if (unit && event.hp !== undefined) unit.hp = event.hp;
          if (unit && event.guard !== undefined) unit.guard = event.guard;
          if (event.round !== undefined) displayedAway.round = event.round;
          awayLog.push(event.text);
          renderAwayStatus();
        },
      });
    } finally {
      if (destroyed || token !== sequence || currentView() !== 'away') return;
      awayBusy = false;
      displayedAway = finalState;
      scene.setAwayState(finalState);
      renderAwayStatus();
      if (!await waitUntilUnpaused(token, 'away')) return;
      if (finalState.phase === 'playing') void continueAway();
      else renderAway();
    }
  }

  function renderScience(): void {
    if (!run) return;
    scene.setScreen('map');
    const totals = run.crew.reduce((sum, member) => { const stats = crewStats(member); return { science: sum.science + stats.science, diplomacy: sum.diplomacy + stats.diplomacy }; }, { science: 0, diplomacy: 0 });
    const upgrades = upgradeableCards(run);
    const selected = selectedUpgradeUid ? run.deck.find(card => card.uid === selectedUpgradeUid) : undefined;
    setPhysicalCards(selected ? [
      { uid: `science-before:${selected.uid}`, definition: expeditionCardDefinition(run, selected) },
      { uid: `science-after:${selected.uid}`, definition: upgradeShipCard(cardDefinition(selected.id), (selected.upgradeLevel ?? 0) + 1) },
    ] : []);
    const scienceRequired = EXPEDITION_RULES.scienceRequired;
    const diplomacyRequired = EXPEDITION_RULES.scienceDiplomacyRequired;
    surface.innerHTML = `${header('Lens Array', 'Science opportunity')}<section class="choice-panel science-panel"><h2>One signal, one outcome</h2><p>Current crew totals: Science ${totals.science} · Diplomacy ${totals.diplomacy}</p><button data-action="science-decode" ${(totals.science >= scienceRequired && upgrades.length) ? '' : 'disabled'}>Decode refit · Science ${scienceRequired}</button>${selectedUpgradeUid !== null ? `<div class="exact-selection">${upgrades.map(card => `<button data-science-card="${escapeHtml(card.uid)}" aria-pressed="${selectedUpgradeUid === card.uid}">${escapeHtml(expeditionCardDefinition(run!, card).title)} · ${escapeHtml(card.uid)}</button>`).join('')}<div><button data-action="cancel-selection">Cancel</button><button class="primary" data-action="confirm-science-decode" ${selectedUpgradeUid ? '' : 'disabled'}>Confirm exact refit</button></div></div>` : ''}<button data-science="share" ${(totals.diplomacy >= diplomacyRequired) ? '' : 'disabled'}>Share navigation data · Diplomacy ${diplomacyRequired} · gain ${EXPEDITION_RULES.scienceShareScrap} scrap</button><button data-science="salvage">Salvage the array · gain ${EXPEDITION_RULES.scienceSalvageScrap} scrap</button><button data-action="leave">Leave the array untouched</button></section>`;
  }

  function renderOutcome(victory: boolean): void {
    if (!run) return;
    scene.setScreen('map');
    setPhysicalCards([]);
    surface.innerHTML = `<section class="expedition-outcome ${victory ? 'victory' : 'defeat'}" tabindex="-1"><p class="eyebrow">Expedition report</p><h1>${victory ? 'SURVEY TRANSMITTED' : 'KESTREL LOST'}</h1><p>${victory ? 'The Far Relay carries your complete survey home.' : 'The expedition ended before the Far Relay transmission.'}</p><dl><div><dt>Route</dt><dd>${run.visited.length} nodes</dd></div><div><dt>Crew</dt><dd>${run.crew.length}</dd></div><div><dt>Deck</dt><dd>${run.deck.length}</dd></div></dl><button data-action="title">Return to title</button></section>`;
    requestAnimationFrame(() => surface.querySelector<HTMLElement>('.expedition-outcome')?.focus());
  }

  function renderRun(): void {
    if (!run || destroyed) return;
    const nextView = currentView();
    if (nextView !== 'battle') {
      combat?.destroy();
      combat = null;
    }
    selectedNodeId = SECTOR[selectedNodeId] ? selectedNodeId : run.nodeId;
    if (nextView === 'map') renderMap();
    else if (nextView === 'battle') mountBattle();
    else if (nextView === 'salvage') renderSalvage();
    else if (nextView === 'service') renderService();
    else if (nextView === 'planet') renderPlanet();
    else if (nextView === 'science') renderScience();
    else if (nextView === 'away') renderAway();
    else if (nextView === 'victory') renderOutcome(true);
    else if (nextView === 'defeat') renderOutcome(false);
    renderOverlay();
  }

  function rulesMarkup(): string {
    return '<ul class="rules"><li>Travel only along bright connected routes. You may inspect any future signal without entering it.</li><li>Ship cards resolve immediately. End Turn discards the hand, then living enemies recharge and act.</li><li>Hull persists across the expedition. Shields, hand and energy reset for each new ship battle.</li><li>Salvage, services and science choices are finite. Exact-card refits improve only the selected copy.</li><li>Away teams act automatically one unit at a time. Formation order puts the first living crew member in front.</li><li>Clearing the blockade is not victory. Reach the Far Relay and transmit the survey.</li></ul>';
  }

  function settingsMarkup(): string {
    const fullscreenSupported = typeof document.documentElement.requestFullscreen === 'function';
    const storageError = combinedStorageError();
    return `<p class="eyebrow">Presentation</p><h2 id="overlay-title">Settings</h2>${storageError ? `<p class="storage-inline" role="alert">${escapeHtml(storageError)}</p>` : ''}<fieldset><legend>Motion</legend>${(['system', 'reduced', 'full'] as const).map(value => `<label><input type="radio" name="motion" value="${value}" ${settings.motion === value ? 'checked' : ''}> ${value === 'system' ? 'System preference' : value[0]!.toUpperCase() + value.slice(1)}</label>`).join('')}</fieldset><fieldset><legend>Effects</legend>${(['full', 'subtle', 'off'] as const).map(value => `<label><input type="radio" name="effects" value="${value}" ${settings.effects === value ? 'checked' : ''}> ${value[0]!.toUpperCase() + value.slice(1)}</label>`).join('')}</fieldset><button data-action="fullscreen" ${fullscreenSupported ? '' : 'disabled'}>${document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen'}</button>${fullscreenSupported ? '' : '<p>This browser does not offer native fullscreen here.</p>'}<button data-action="reset-settings">Reset defaults</button><button class="primary" data-action="close-overlay" data-focus-key="overlay-close">Done</button>`;
  }

  function renderOverlay(): void {
    overlayLayer.innerHTML = '';
    surface.inert = overlay !== null;
    if (!overlay) {
      setPaused();
      wakePresentation();
      return;
    }
    let body = '';
    if (overlay === 'menu') body = `<p class="eyebrow">Expedition paused</p><h2 id="overlay-title">Command menu</h2><button class="primary" data-action="close-overlay" data-focus-key="overlay-close">Resume</button><button data-overlay="settings">Settings</button><button data-overlay="rules">Rules</button><button data-overlay="route">Inspect route</button><button data-overlay="confirm-restart">Restart expedition</button><button data-action="title">Title</button>`;
    else if (overlay === 'settings') body = settingsMarkup();
    else if (overlay === 'rules') body = `<p class="eyebrow">Field manual</p><h2 id="overlay-title">Expedition rules</h2>${rulesMarkup()}<button class="primary" data-action="close-overlay" data-focus-key="overlay-close">Back</button>`;
    else if (overlay === 'route') body = `<p class="eyebrow">Read-only chart</p><h2 id="overlay-title">Return to active ${currentView() === 'battle' ? 'ship encounter' : currentView() === 'away' ? 'away encounter' : 'expedition'}</h2><div class="route-overlay-map">${mapMarkup(true)}</div><button class="primary" data-action="close-overlay" data-focus-key="overlay-close">Return to encounter</button>`;
    else if (overlay === 'confirm-new') body = `<p class="eyebrow">Protected save</p><h2 id="overlay-title">Replace saved expedition?</h2><p>${invalidSave !== null ? 'The existing save is invalid but retained. Download it first if needed. Confirming replaces it with a new random-seed expedition.' : 'This starts a new random-seed expedition and replaces existing progress.'}</p><div class="confirm-actions"><button class="primary" data-action="close-overlay" data-focus-key="overlay-close">Cancel</button><button data-action="confirm-new">Replace & start</button></div>`;
    else if (overlay === 'confirm-restart') body = '<p class="eyebrow">Whole-run restart</p><h2 id="overlay-title">Restart this expedition?</h2><p>The same seed will rebuild the expedition from launch. Current progress will be replaced.</p><div class="confirm-actions"><button class="primary" data-action="close-overlay" data-focus-key="overlay-close">Cancel</button><button data-action="confirm-restart">Restart expedition</button></div>';
    else body = `<p class="eyebrow">Action required</p><h2 id="overlay-title">Kestrel report</h2><p>${escapeHtml(message || 'The requested operation could not be completed.')}</p><button class="primary" data-action="close-overlay" data-focus-key="overlay-close">Close</button>`;
    overlayLayer.innerHTML = `<div class="ship-modal shell-modal" data-overlay-backdrop><section role="${overlay.startsWith('confirm') ? 'alertdialog' : 'dialog'}" aria-modal="true" aria-labelledby="overlay-title" class="ship-dialog ink-plate${overlay === 'route' ? ' route-dialog' : ''}">${body}</section></div>`;
    setPaused();
    requestAnimationFrame(() => overlayLayer.querySelector<HTMLElement>('[data-focus-key="overlay-close"], button, input')?.focus());
  }

  function openOverlay(next: Exclude<Overlay, null>): void {
    if (overlay === null) overlayOrigin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    overlayParent = overlay === 'menu' && next !== 'route' ? 'menu' : null;
    combat?.cancelInteraction();
    overlay = next;
    renderOverlay();
  }

  function closeOverlay(): void {
    if (overlayParent) {
      overlay = overlayParent;
      overlayParent = null;
      renderOverlay();
      return;
    }
    const origin = overlayOrigin;
    const focusKey = origin?.dataset.focusKey;
    overlayOrigin = null;
    overlay = null;
    renderOverlay();
    requestAnimationFrame(() => {
      if (origin?.isConnected) origin.focus();
      else if (focusKey) root.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus();
    });
  }

  function startRun(seed: number): void {
    clearPresentation();
    run = createExpedition(seed);
    selectedNodeId = run.nodeId;
    selectedParty = [];
    selectedUpgradeUid = null;
    selectedService = null;
    selectedServiceTarget = null;
    awayLog = [];
    overlay = null;
    persist();
    selectedSalvage = null;
    renderRun();
  }

  function leaveForTitle(): void {
    const latest = run ? clone(run) : null;
    clearPresentation();
    if (latest) savedRun = latest;
    run = null;
    selectedSalvage = null;
    selectedUpgradeUid = null;
    selectedService = null;
    selectedServiceTarget = null;
    selectedParty = [];
    overlay = null;
    renderTitle();
    renderOverlay();
  }

  function downloadInvalidSave(): void {
    if (invalidSave === null) return;
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(new Blob([invalidSave], { type: 'application/json' }));
    anchor.download = 'kestrel-invalid-expedition.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 0);
  }

  function click(event: MouseEvent): void {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!button || !root.contains(button) || button.disabled) return;
    const action = button.dataset.action;
    if (button.dataset.overlay) { openOverlay(button.dataset.overlay as Exclude<Overlay, null>); return; }
    if (action === 'close-overlay') { closeOverlay(); return; }
    if (action === 'settings') { openOverlay('settings'); return; }
    if (action === 'rules') { openOverlay('rules'); return; }
    if (action === 'menu') { openOverlay('menu'); return; }
    if (action === 'download-invalid') { downloadInvalidSave(); return; }
    if (action === 'continue' && savedRun) {
      clearPresentation();
      run = clone(savedRun);
      selectedNodeId = run.nodeId;
      overlay = null;
      renderRun();
      return;
    }
    if (action === 'start') {
      if (savedRun || invalidSave !== null || expeditionStorageError) openOverlay('confirm-new');
      else startRun(freshSeed());
      return;
    }
    if (action === 'confirm-new') { startRun(freshSeed()); return; }
    if (action === 'confirm-restart' && run) { startRun(run.seed); return; }
    if (action === 'title') { leaveForTitle(); return; }
    if (button.dataset.node) {
      selectedNodeId = button.dataset.node;
      if (overlay === 'route') renderOverlay();
      else if (!overlay && run && currentView() === 'map') renderMap();
      return;
    }
    if (!run || overlay) return;
    if (button.dataset.travel) {
      const result = dispatch({ type: 'travel', nodeId: button.dataset.travel });
      if (result.ok) { selectedNodeId = run.nodeId; renderRun(); }
    } else if (action === 'complete') {
      const result = dispatch({ type: 'complete' });
      if (result.ok) renderRun();
    } else if (button.dataset.salvageCard) {
      selectedSalvage = { kind: 'card', cardId: button.dataset.salvageCard as ShipBaseCardId };
      selectedUpgradeUid = null;
      renderSalvage();
    } else if (button.dataset.salvageCrew) {
      selectedSalvage = { kind: 'crew', crewId: button.dataset.salvageCrew as CrewId };
      selectedUpgradeUid = null;
      renderSalvage();
    } else if (action === 'confirm-salvage' && selectedSalvage) {
      const result = dispatch({ type: 'salvage', choice: selectedSalvage });
      if (result.ok) { selectedSalvage = null; renderRun(); }
    } else if (action === 'show-upgrades') { selectedSalvage = null; selectedUpgradeUid = ''; renderSalvage(); }
    else if (button.dataset.upgradeCard) { selectedUpgradeUid = button.dataset.upgradeCard; renderSalvage(); }
    else if (action === 'confirm-upgrade' && selectedUpgradeUid) {
      const result = dispatch({ type: 'salvage', choice: { kind: 'upgrade', uid: selectedUpgradeUid } });
      if (result.ok) { selectedUpgradeUid = null; renderRun(); }
    } else if (action === 'skip-salvage') {
      const result = dispatch({ type: 'salvage', choice: { kind: 'skip' } });
      if (result.ok) { selectedSalvage = null; renderRun(); }
    } else if (button.dataset.service) {
      selectedService = button.dataset.service as ServiceOption;
      selectedServiceTarget = null;
      renderService();
    } else if (button.dataset.serviceTarget) { selectedServiceTarget = button.dataset.serviceTarget; renderService(); }
    else if (action === 'confirm-service' && selectedService) {
      const result = dispatch({ type: 'service', option: selectedService, ...(selectedServiceTarget ? { target: selectedServiceTarget } : {}) });
      if (result.ok) { selectedService = null; selectedServiceTarget = null; renderRun(); }
    } else if (action === 'cancel-selection') {
      selectedSalvage = null; selectedService = null; selectedServiceTarget = null; selectedUpgradeUid = null; renderRun();
    } else if (action === 'leave') {
      const result = dispatch({ type: 'leave' });
      if (result.ok) {
        selectedParty = []; selectedService = null; selectedServiceTarget = null; selectedUpgradeUid = null;
        renderRun();
      }
    } else if (button.dataset.party) {
      const id = button.dataset.party as CrewId;
      const index = selectedParty.indexOf(id);
      if (index >= 0) selectedParty.splice(index, 1);
      else if (selectedParty.length < EXPEDITION_RULES.teamSize) selectedParty.push(id);
      renderPlanet();
    } else if (button.dataset.partyMove && button.dataset.crew) {
      const index = selectedParty.indexOf(button.dataset.crew as CrewId);
      const next = button.dataset.partyMove === 'up' ? index - 1 : index + 1;
      if (index >= 0 && next >= 0 && next < selectedParty.length) [selectedParty[index], selectedParty[next]] = [selectedParty[next]!, selectedParty[index]!];
      renderPlanet();
    } else if (action === 'diplomacy') {
      const result = dispatch({ type: 'diplomacy', crewIds: [...selectedParty] });
      if (result.ok) { selectedParty = []; renderRun(); }
    } else if (action === 'deploy') {
      const result = dispatch({ type: 'deploy', crewIds: [...selectedParty] });
      if (result.ok) { awayLog = []; displayedAway = null; renderRun(); }
    } else if (action === 'finish-away' && run.away?.phase !== 'playing') {
      const result = dispatch({ type: 'finish-away' });
      if (result.ok) renderRun();
    } else if (action === 'science-decode') { selectedUpgradeUid = ''; renderScience(); }
    else if (button.dataset.scienceCard) { selectedUpgradeUid = button.dataset.scienceCard; renderScience(); }
    else if (action === 'confirm-science-decode' && selectedUpgradeUid) {
      const result = dispatch({ type: 'science', choice: 'decode', uid: selectedUpgradeUid });
      if (result.ok) { selectedUpgradeUid = null; renderRun(); }
    } else if (button.dataset.science) {
      const result = dispatch({ type: 'science', choice: button.dataset.science as 'share' | 'salvage' });
      if (result.ok) renderRun();
    }
  }

  function change(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.name === 'motion' && (input.value === 'system' || input.value === 'reduced' || input.value === 'full')) settings.motion = input.value;
    else if (input.name === 'effects' && (input.value === 'full' || input.value === 'subtle' || input.value === 'off')) settings.effects = input.value;
    else return;
    presentationStorageError = savePresentationSettings(settings);
    renderStorageWarning();
    applyPresentation();
    renderOverlay();
  }

  async function fullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (typeof document.documentElement.requestFullscreen === 'function') await document.documentElement.requestFullscreen();
      else throw new Error('Fullscreen is unsupported by this browser.');
      renderOverlay();
    } catch (error) {
      message = error instanceof Error ? error.message : 'Fullscreen could not be changed.';
      overlay = 'error';
      renderOverlay();
    }
  }

  function rootClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).closest('.combat-host')) return;
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (target?.dataset.action === 'fullscreen') { void fullscreen(); return; }
    if (target?.dataset.action === 'reset-settings') {
      settings = { ...DEFAULT_PRESENTATION };
      presentationStorageError = savePresentationSettings(settings);
      renderStorageWarning();
      applyPresentation();
      renderOverlay();
      return;
    }
    click(event);
  }

  function keydown(event: KeyboardEvent): void {
    if (destroyed) return;
    if (event.repeat && (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); return; }
    if (!overlay) return;
    if (event.key === 'Escape') { event.preventDefault(); closeOverlay(); return; }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(overlayLayer.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'));
    if (!focusable.length) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
  }

  function mediaChange(): void {
    if (settings.motion !== 'system') return;
    applyPresentation();
  }

  function fullscreenChange(): void {
    if (overlay === 'settings') renderOverlay();
  }

  root.addEventListener('click', rootClick, { signal: controller.signal });
  root.addEventListener('change', change, { signal: controller.signal });
  document.addEventListener('keydown', keydown, { signal: controller.signal });
  document.addEventListener('fullscreenchange', fullscreenChange, { signal: controller.signal });
  media.addEventListener('change', mediaChange, { signal: controller.signal });

  const debugGetter = () => {
    const shipDebug = (window as Window & { __SHIP__?: { busy?: boolean } }).__SHIP__;
    return {
      run: run ? clone(run) : null,
      view: currentView(),
      busy: awayBusy || shipDebug?.busy === true,
      modal: overlay,
    };
  };
  Object.defineProperty(window, '__KESTREL__', { configurable: true, enumerable: false, get: debugGetter });

  readSave();
  renderStorageWarning();
  applyPresentation();
  scene.setPaused(false);
  renderTitle();

  return {
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      clearPresentation();
      controller.abort();
      resumeWaiters.clear();
      const debugWindow = window as DebugWindow;
      const descriptor = Object.getOwnPropertyDescriptor(debugWindow, '__KESTREL__');
      if (descriptor?.configurable && descriptor.get === debugGetter) delete debugWindow.__KESTREL__;
      root.replaceChildren();
      root.className = '';
    },
  };
}

import type { BalanceChange, BalanceReport, ExpeditionAnalysis, PolicyName, PolicySummary } from './balance';

export type BalanceFeedback = {
  diagnostics: string[]; expeditions: string[];
  recommendations: Array<{ target: string; change: BalanceChange; baselineRunId: string; candidateRunId: string; reason: string; tradeoffs: string[] }>;
  roleFindings: string[]; limitations: string[];
};
const POLICIES: PolicyName[] = ['strong', 'tactical', 'greedy'];
const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;
const signed = (value: number): string => `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
function changeText(change: BalanceChange): string {
  switch (change.kind) {
    case 'baseline': return 'baseline';
    case 'card-effect': return `${change.cardId} ${change.effectKind} ${signed(change.delta)}`;
    case 'card-time': return `${change.cardId} time amount ${signed(change.delta)} ticks`;
    case 'card-scaling-time': return `${change.cardId} authored time scaling ${signed(change.delta)}`;
    case 'card-level': return `${change.cardId} grade level ${signed(change.delta)}`;
    case 'card-temporal': return `${change.cardId} temporal amount ${signed(change.delta)}`;
    case 'card-scaling-effect': return `${change.cardId} effect ${change.effectIndex} scaling ${signed(change.delta)}`;
    case 'card-cost': return `${change.cardId} cost ${signed(change.delta)}`;
    case 'regen': return `stored energy per completed tick ${signed(change.delta)}`;
    case 'encounter': return `enemy HP ×${change.hpScale}, damage ×${change.damageScale}`;
  }
}
function paired(baseline: PolicySummary, candidate: PolicySummary) {
  const bases = new Map(baseline.samples.map(sample => [`${sample.seed}:${sample.deck}`, sample]));
  const pairs = candidate.samples.map(sample => { const base = bases.get(`${sample.seed}:${sample.deck}`); if (!base) throw new Error('Candidate has no same-seed/same-deck baseline.'); return { sample, base }; });
  const differences = pairs.map(({ sample, base }) => Number(sample.win) - Number(base.win));
  const mean = differences.reduce((a, b) => a + b, 0) / differences.length;
  const variance = differences.length > 1 ? differences.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (differences.length - 1) : 0;
  const margin = 1.96 * Math.sqrt(variance / differences.length);
  return { gained: differences.filter(value => value > 0).length, lost: differences.filter(value => value < 0).length, low: Math.max(-1, mean - margin), high: Math.min(1, mean + margin), hp: pairs.reduce((sum, { sample, base }) => sum + sample.hp - base.hp, 0) / pairs.length };
}
export function expeditionFeedback(study: ExpeditionAnalysis): string[] {
  const lines = [`${study.results.length} natural-start spatial expeditions; ${study.seeds.length} paired seeds; ${study.policies.join(', ')}. Exit interaction is the only complete-run victory.`, ...Object.entries(study.routePolicies).map(([route, description]) => `${route}: ${description}`), `Rewards: ${study.rewardPolicy}`, `Services: ${study.servicePolicy}`];
  for (const summary of study.summaries) {
    lines.push(`${summary.candidateId}/${summary.toolkit}/${summary.policy}/${summary.route}: ${summary.wins}/${summary.runs} wins (Wilson95% ${percent(summary.winRate95CI[0])}–${percent(summary.winRate95CI[1])}); ${summary.defeats} defeats, ${summary.bounded} bounded; mean HP ${summary.meanHp.toFixed(1)}, completed encounters ${summary.meanCompletedEncounters.toFixed(2)}, median world ticks ${summary.medianTicks}. Terminal locations: ${Object.entries(summary.terminalEncounters).map(([id, count]) => `${id}=${count}`).join(', ')}.`);
    if (summary.paired) lines.push(`Paired: ${summary.paired.gainedWins} gained/${summary.paired.lostWins} lost wins; win delta95% ${percent(summary.paired.winDelta95CI[0])}–${percent(summary.paired.winDelta95CI[1])}; HP ${signed(summary.paired.meanHpDelta)}, completed encounters ${signed(summary.paired.meanCompletedEncountersDelta)}. Different terminal depths confound HP.`);
  }
  for (const candidate of study.candidates.filter(candidate => candidate.id !== 'baseline')) {
    const strata = study.summaries.filter(summary => summary.candidateId === candidate.id);
    const gained = strata.reduce((sum, summary) => sum + (summary.paired?.gainedWins ?? 0), 0); const lost = strata.reduce((sum, summary) => sum + (summary.paired?.lostWins ?? 0), 0);
    const supported = strata.some(summary => summary.paired && summary.paired.winDelta95CI[0] > 0) && strata.every(summary => !summary.paired || summary.paired.gainedWins >= summary.paired.lostWins);
    lines.push(`Measured expedition candidate ${candidate.id}: ${gained} gained/${lost} lost paired wins across ${strata.length} strata. ${supported ? 'Promising only under these policies; human validation required.' : 'No robust cross-policy complete-run improvement establishes a production change.'}`);
  }
  return lines;
}
export function buildFeedback(report: BalanceReport): BalanceFeedback {
  const diagnostics: string[] = []; const recommendations: BalanceFeedback['recommendations'] = [];
  const baseline = report.runs.find(run => run.change.kind === 'baseline');
  if (baseline) for (const policy of POLICIES) {
    const summary = baseline.policies[policy]; diagnostics.push(`Baseline/${policy}: ${summary.wins}/${summary.fights} isolated-world wins (Wilson95% ${percent(summary.winRate95CI[0])}–${percent(summary.winRate95CI[1])}), ${summary.stalls} bounded; mean HP ${summary.meanHp.toFixed(1)}, median ticks ${summary.medianTicks}, ${summary.distinctTrajectories} distinct trajectories.`);
  }
  for (const [id, encounter] of Object.entries(report.encounters)) diagnostics.push(`Spatial encounter ${id}, all four normal toolkit decks: ${POLICIES.map(policy => `${policy} ${percent(encounter.policies[policy].winRate)}, ${encounter.policies[policy].stalls} bounded`).join('; ')}. Isolated fixture, not expedition completion.`);
  if (baseline) for (const [id, card] of Object.entries(report.cards)) {
    const entries = POLICIES.map(policy => baseline.policies[policy].usage[id]);
    const uses = entries.reduce((sum, entry) => sum + entry.played, 0); const legal = entries.reduce((sum, entry) => sum + entry.legalOpportunities, 0);
    const hands = entries.reduce((sum, entry) => sum + entry.handOpportunities, 0); const affordable = entries.reduce((sum, entry) => sum + entry.affordableOpportunities, 0);
    diagnostics.push(`${card.name}: ${uses} uses/${legal} legal decision opportunities (${legal ? percent(uses / legal) : 'n/a'}); hand ${hands}, affordable ${affordable}, replacement draws ${entries.reduce((sum, entry) => sum + entry.replacements, 0)}. Diagnostic accepted uses ${report.diagnostics.cardUses[id] ?? 0}.`);
  }
  for (const run of report.runs) {
    if (run.change.kind === 'baseline') continue;
    const base = run.pairedBaseline; if (!base) throw new Error(`Missing paired baseline for ${run.id}`);
    const measurements = POLICIES.map(policy => ({ policy, delta: paired(base.policies[policy], run.policies[policy]) }));
    diagnostics.push(`Measured ${run.id} (${changeText(run.change)}), ${base.id}: ${measurements.map(({ policy, delta }) => `${policy} ${delta.gained} gained/${delta.lost} lost, paired win delta95% ${percent(delta.low)}–${percent(delta.high)}, HP ${signed(delta.hp)}`).join('; ')}.`);
    if (measurements.some(({ delta }) => delta.low > 0) && measurements.every(({ delta }) => delta.gained >= delta.lost && delta.hp >= 0)) recommendations.push({
      target: 'cardId' in run.change ? report.cards[run.change.cardId].name : run.change.kind === 'regen' ? 'Stored energy regeneration' : 'Enemy pressure', change: run.change, baselineRunId: base.id, candidateRunId: run.id,
      reason: 'At least one positive paired seed interval and no observed policy win/HP regression in this measured isolated-encounter context.',
      tradeoffs: ['Not an automatic change: paired intervals are approximate, unadjusted for multiple comparisons and may be degenerate.', 'Candidate effects depend on this deck, real pursuit and bounded policy. Check full-expedition attrition and human play before tuning.'],
    });
  }
  diagnostics.push(`Actual diagnostic mechanics: ${Object.entries(report.diagnostics.mechanics).map(([key, count]) => `${key}=${count}`).join(', ')}.`);
  diagnostics.push(`Coverage gaps: ${JSON.stringify(report.coverage)}. Diagnostic command failures: ${report.diagnostics.failures.join(', ') || 'none'}.`);
  return { diagnostics, expeditions: expeditionFeedback(report.expeditions), recommendations,
    roleFindings: Object.entries(report.cards).map(([id, card]) => `${id}: ${card.roles.join(', ')}. Source-derived role, not a power claim.`),
    limitations: [...report.candidateMigration, ...report.limitations, ...report.expeditions.limitations, 'No hidden entity, future reward or replacement-identity information is a policy feature. Legal-opportunity ratios are descriptive, never sufficient evidence of overpowered cards.'] };
}
export function formatFeedback(feedback: BalanceFeedback): string {
  const lines = ['WORLD BALANCE FEEDBACK', '', 'Diagnostics', ...feedback.diagnostics.map(line => `- ${line}`), '', 'Full expeditions', ...feedback.expeditions.map(line => `- ${line}`), '', 'Measured candidates for human review — never auto-applied'];
  if (!feedback.recommendations.length) lines.push('- No cross-policy candidate improvement supports a recommendation.');
  for (const recommendation of feedback.recommendations) lines.push(`- ${recommendation.target}: ${changeText(recommendation.change)} [${recommendation.baselineRunId} -> ${recommendation.candidateRunId}]. ${recommendation.reason}`, ...recommendation.tradeoffs.map(line => `  - ${line}`));
  lines.push('', 'Catalog roles', ...feedback.roleFindings.map(line => `- ${line}`), '', 'Candidate migration and limitations', ...feedback.limitations.map(line => `- ${line}`)); return `${lines.join('\n')}\n`;
}

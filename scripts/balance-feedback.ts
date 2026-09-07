import type { BalanceChange, BalanceReport } from './balance';

export type BalanceFeedback = {
  diagnostics: string[];
  recommendations: Array<{
    target: string;
    change: BalanceChange;
    baselineRunId: string;
    candidateRunId: string;
    reason: string;
    tradeoffs: string[];
  }>;
  roleFindings: string[];
  limitations: string[];
};

type Run = BalanceReport['runs'][number];
type CandidateRun = Run & { change: Exclude<BalanceChange, { kind: 'baseline' }> };
type Policy = keyof Run['policies'];
type Summary = Run['policies'][Policy];
type Usage = Summary['usage'][string];

const POLICIES = ['strong', 'tactical', 'greedy'] as const satisfies readonly Policy[];

const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;
const signedPercent = (value: number): string => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}pp`;
const signed = (value: number, suffix = ''): string => `${value >= 0 ? '+' : ''}${value.toFixed(1)}${suffix}`;
const ratio = (numerator: number, denominator: number): string => denominator > 0 ? `${percent(numerator / denominator)} (${numerator}/${denominator})` : 'n/a (0 opportunities)';

function weighted(summaries: Summary[], value: (summary: Summary) => number): number {
  const fights = summaries.reduce((total, summary) => total + summary.fights, 0);
  return fights > 0 ? summaries.reduce((total, summary) => total + value(summary) * summary.fights, 0) / fights : 0;
}

function outcome(run: Run) {
  const summaries = POLICIES.map((policy) => run.policies[policy]);
  const fights = summaries.reduce((total, summary) => total + summary.fights, 0);
  return {
    winRate: weighted(summaries, (summary) => summary.winRate),
    meanHp: weighted(summaries, (summary) => summary.meanHp),
    turns: weighted(summaries, (summary) => summary.medianTurns),
    stalls: summaries.reduce((total, summary) => total + summary.stalls, 0),
    stallRate: fights > 0 ? summaries.reduce((total, summary) => total + summary.stalls, 0) / fights : 0,
    fights,
    spread: Math.max(...summaries.map((summary) => summary.winRate)) - Math.min(...summaries.map((summary) => summary.winRate)),
  };
}

function sumUsage(run: Run, cardId: string): Usage {
  const total: Usage = {
    drawn: 0,
    handOpportunities: 0,
    affordableOpportunities: 0,
    legalOpportunities: 0,
    playablePositionOpportunities: 0,
    visiblePositionOpportunities: 0,
    played: 0,
    attached: 0,
    scoutedPositions: 0,
    energySpent: 0,
  };
  for (const policy of POLICIES) {
    const usage = run.policies[policy].usage[cardId];
    if (!usage) continue;
    for (const key of Object.keys(total) as (keyof Usage)[]) total[key] += usage[key];
  }
  return total;
}

function cardUsageLine(report: BalanceReport, run: Run, cardId: string): string {
  const card = report.cards[cardId];
  const usage = sumUsage(run, cardId);
  const uses = usage.played + usage.attached;
  const timingRate = usage.playablePositionOpportunities > 0
    ? (uses * 100 / usage.playablePositionOpportunities).toFixed(2)
    : 'n/a';
  const exposure = usage.handOpportunities > 0
    ? `; mean window ${((usage.playablePositionOpportunities / usage.handOpportunities)).toFixed(1)} playable/${((usage.visiblePositionOpportunities / usage.handOpportunities)).toFixed(1)} visible positions`
    : '';
  const attachment = usage.attached > 0 ? `; attached ${ratio(usage.attached, usage.legalOpportunities)}` : '';
  const scouting = usage.scoutedPositions > 0 ? `; actually revealed ${usage.scoutedPositions} scouted positions` : '';
  const free = card.cost === 0 ? ' Free-card use is availability evidence, not overpower evidence.' : '';
  return `${card.name}: drawn ${usage.drawn}; played/hand ${ratio(usage.played, usage.handOpportunities)}, played/affordable ${ratio(usage.played, usage.affordableOpportunities)}, played/legal ${ratio(usage.played, usage.legalOpportunities)}${attachment}${scouting}; ${timingRate} uses per 100 playable-position opportunities${exposure}; energy spent ${usage.energySpent}.${free}`;
}

function policyDelta(baseline: Run, candidate: Run): string {
  return POLICIES.map((policy) => `${policy} ${signedPercent(candidate.policies[policy].winRate - baseline.policies[policy].winRate)}`).join(', ');
}

function disjointWinIntervals(baseline: Run, candidate: Run): number {
  return POLICIES.filter((policy) => {
    const before = baseline.policies[policy].winRate95CI;
    const after = candidate.policies[policy].winRate95CI;
    return after[0] > before[1] || after[1] < before[0];
  }).length;
}


function changeText(change: BalanceChange): string {
  switch (change.kind) {
    case 'baseline': return 'baseline';
    case 'card-cost': return `${change.cardId} cost ${change.delta >= 0 ? '+' : ''}${change.delta}`;
    case 'card-effect': return `${change.cardId} ${change.effectKind} ${change.delta >= 0 ? '+' : ''}${change.delta}`;
    case 'card-bracket': return `${change.cardId} bracket ${change.field} ${change.delta >= 0 ? '+' : ''}${change.delta}`;
    case 'encounter': return `enemy HP ×${change.hpScale}, enemy damage ×${change.damageScale}`;
  }
}

function roleFinding(report: BalanceReport, label: string, aliases: string[], missingHypothesis: string): string {
  const cards = Object.values(report.cards)
    .filter((card) => card.roles.some((role) => aliases.some((alias) => role.toLowerCase().includes(alias))))
    .map((card) => card.name);
  return cards.length > 0
    ? `${label}: ${cards.join(', ')}. This is source-derived coverage; effectiveness still depends on the measured opportunity and outcome data above.`
    : `${label}: no matching source-derived role in the tested deck. Treat this only as a deck hypothesis: ${missingHypothesis}; it is not a mandate to add a card.`;
}

export function buildFeedback(report: BalanceReport): BalanceFeedback {
  const diagnostics: string[] = [];
  const recommendations: BalanceFeedback['recommendations'] = [];
  const limitations = Array.from(new Set([
    ...report.limitations,
    `Rules measured: ${report.rulesModel}. Planning has no realtime countdown.`,
    'Policies inspect only the current bracket plus positions revealed by active scouting. Scouting is exercised and reported, but receives no invented combat-power or information-value score.',
    'Policies are deterministic heuristics, not human or optimal play; differences can reflect policy assumptions rather than card power.',
    'Aggregate card use is normalized by legal and changing playable-position opportunities but is not a causal estimate of card strength. High use alone—especially for zero-cost cards—is not evidence that a card is overpowered.',
    'Candidate comparisons use reported 95% win-rate intervals and aggregate outcomes. Overlapping intervals or policy disagreement are uncertainty, not permission to choose a preferred result.',
    'Recommendations only select tested candidates; they do not auto-apply changes or extrapolate untested numeric tuning.',
  ]));
  const baseline = report.runs.find((run) => run.change.kind === 'baseline');

  if (!baseline) {
    return {
      diagnostics: ['No baseline run was present, so candidate effects cannot be attributed or recommended.'],
      recommendations,
      roleFindings: [],
      limitations: [...limitations, 'Candidate feedback requires a baseline run evaluated under the same policies and seeds.'],
    };
  }

  const base = outcome(baseline);
  const policyWins = POLICIES.map((policy) => baseline.policies[policy].winRate);
  const policyHp = POLICIES.map((policy) => baseline.policies[policy].meanHp);
  const policyMedianHp = POLICIES.map((policy) => baseline.policies[policy].medianHp);
  const policyTurns = POLICIES.map((policy) => baseline.policies[policy].medianTurns);
  diagnostics.push(
    `Baseline ${baseline.id}: policy win rates ${POLICIES.map((policy) => `${policy} ${percent(baseline.policies[policy].winRate)} (95% CI ${percent(baseline.policies[policy].winRate95CI[0])}–${percent(baseline.policies[policy].winRate95CI[1])})`).join(', ')}; separation ${signedPercent(Math.max(...policyWins) - Math.min(...policyWins)).replace('+', '')}.`,
    `Baseline survivability and pacing: mean HP ${POLICIES.map((policy, index) => `${policy} ${policyHp[index].toFixed(1)}`).join(', ')}; median HP ${POLICIES.map((policy, index) => `${policy} ${policyMedianHp[index].toFixed(1)}`).join(', ')}; median turns ${POLICIES.map((policy, index) => `${policy} ${policyTurns[index].toFixed(1)}`).join(', ')}; mean-HP spread ${(Math.max(...policyHp) - Math.min(...policyHp)).toFixed(1)}, pacing spread ${(Math.max(...policyTurns) - Math.min(...policyTurns)).toFixed(1)} turns.`,
    `Baseline stalls: ${base.stalls}/${base.fights} fights (${percent(base.fights > 0 ? base.stalls / base.fights : 0)}). Distinct trajectories: ${POLICIES.map((policy) => `${policy} ${baseline.policies[policy].distinctTrajectories}`).join(', ')}.`,
  );

  for (const cardId of Object.keys(report.cards)) diagnostics.push(cardUsageLine(report, baseline, cardId));
  diagnostics.push('Scouting attachments and revealed-position counts are exercised coverage, not a combat-power estimate. Scouting-number candidates remain in the report but are ineligible for automatic recommendation by these one-turn heuristics.');
  if (report.coverage.uncoveredCards.length > 0) diagnostics.push(`Coverage failure: no exercised usage for ${report.coverage.uncoveredCards.map((id) => report.cards[id]?.name ?? id).join(', ')}. These cards need exercised scenarios before balance conclusions.`);
  for (const [cardId, card] of Object.entries(report.cards)) {
    const usage = sumUsage(baseline, cardId);
    const useRate = (usage.played + usage.attached) / Math.max(1, usage.legalOpportunities);
    if (usage.legalOpportunities < 20 || useRate >= 0.1) continue;
    const alternatives = report.runs.filter(run =>
      (run.change.kind === 'card-cost' || run.change.kind === 'card-effect' || run.change.kind === 'card-bracket')
      && run.change.cardId === cardId)
      .map(run => {
        const used = sumUsage(run, cardId);
        return { run, rate: (used.played + used.attached) / Math.max(1, used.legalOpportunities) };
      }).sort((a, b) => b.rate - a.rate);
    const alternative = alternatives[0];
    if (alternative && alternative.rate > useRate) {
      diagnostics.push(`Underused role candidate: ${card.name} was used in ${percent(useRate)} of legal opportunities. Tested ${alternative.run.id} raised use to ${percent(alternative.rate)}; win-rate deltas: ${policyDelta(baseline, alternative.run)}. This is a playtest lead, not proof that the card needs a buff; one-turn policies can undervalue setup and draw.`);
    } else {
      diagnostics.push(`Underused role candidate: ${card.name} was used in ${percent(useRate)} of legal opportunities, and tested changes did not improve use. Investigate encounter demand and policy blind spots before adding more cards in this role.`);
    }
  }

  const easyBaseline = POLICIES.every((policy) => baseline.policies[policy].winRate95CI[0] > 0.5);
  const hardBaseline = POLICIES.every((policy) => baseline.policies[policy].winRate95CI[1] < 0.5);
  const separatedBaseline = POLICIES.some((left, index) => POLICIES.slice(index + 1).some((right) => {
    const a = baseline.policies[left].winRate95CI;
    const b = baseline.policies[right].winRate95CI;
    return a[0] > b[1] || b[0] > a[1];
  }));

  const candidates = report.runs.filter((run): run is CandidateRun => run.change.kind !== 'baseline').map((candidate) => {
    const result = outcome(candidate);
    const deltas = POLICIES.map((policy) => candidate.policies[policy].winRate - baseline.policies[policy].winRate);
    const direction = deltas.every((value) => value >= 0) && deltas.some((value) => value > 0)
      ? 1
      : deltas.every((value) => value <= 0) && deltas.some((value) => value < 0) ? -1 : 0;
    const significantPolicies = disjointWinIntervals(baseline, candidate);
    const stallRateDelta = result.stallRate - base.stallRate;
    const baseSkillGap = baseline.policies.strong.winRate - (baseline.policies.tactical.winRate + baseline.policies.greedy.winRate) / 2;
    const skillGap = candidate.policies.strong.winRate - (candidate.policies.tactical.winRate + candidate.policies.greedy.winRate) / 2;
    const preservesStrong = candidate.policies.strong.winRate >= Math.min(0.9, baseline.policies.strong.winRate);
    const hpDelta = result.meanHp - base.meanHp;
    const turnDelta = result.turns - base.turns;
    const clearlyDirectional = significantPolicies >= 2 || (significantPolicies >= 1 && direction !== 0 && Math.sign(hpDelta) === direction);
    let reason = '';
    let rank = 0;

    if (easyBaseline && direction < 0 && clearlyDirectional && preservesStrong && skillGap >= baseSkillGap) {
      reason = `Baseline lower 95% win-rate bounds exceed 50% under every policy; this tested change adds pressure, with aggregate win rate ${percent(base.winRate)}→${percent(result.winRate)} and ${significantPolicies}/3 policy intervals separated.`;
      rank = Math.abs(result.winRate - base.winRate) + significantPolicies;
    } else if (hardBaseline && direction > 0 && clearlyDirectional) {
      reason = `Baseline upper 95% win-rate bounds are below 50% under every policy; this tested change relieves the measured difficulty, with aggregate win rate ${percent(base.winRate)}→${percent(result.winRate)} and ${significantPolicies}/3 policy intervals separated.`;
      rank = Math.abs(result.winRate - base.winRate) + significantPolicies;
    } else if (!easyBaseline && base.stalls > 0 && stallRateDelta < 0 && direction >= 0 && (significantPolicies > 0 || result.stalls === 0)) {
      reason = `This tested change reduces stalls ${percent(base.stallRate)}→${percent(result.stallRate)} (${base.stalls}/${base.fights}→${result.stalls}/${result.fights}) without lowering any policy's observed win rate.`;
      rank = Math.abs(stallRateDelta) + significantPolicies;
    } else if (skillGap > baseSkillGap && significantPolicies > 0 && preservesStrong && result.stallRate <= base.stallRate) {
      reason = `This tested change rewards planning: strong versus imperfect-policy win-rate separation grows ${percent(baseSkillGap)}→${percent(skillGap)}, while strong win rate remains ${percent(candidate.policies.strong.winRate)}.`;
      rank = skillGap - baseSkillGap + significantPolicies;
    }

    if (candidate.change.kind === 'card-bracket' && candidate.change.field === 'scouting') {
      reason = '';
      rank = 0;
    }

    return { candidate, result, direction, significantPolicies, hpDelta, turnDelta, reason, rank };
  });

  const rankedCandidates = candidates.filter((item) => item.reason).sort((a, b) => b.rank - a.rank);
  const selectedCandidates = [
    ...rankedCandidates.filter((item) => item.candidate.change.kind !== 'encounter').slice(0, 2),
    ...rankedCandidates.filter((item) => item.candidate.change.kind === 'encounter').slice(0, 1),
  ];

  for (const evidence of selectedCandidates) {
    const { candidate, result, hpDelta, turnDelta } = evidence;
    const tradeoffs = [
      `Win-rate delta by policy: ${policyDelta(baseline, candidate)}.`,
      `Mean-HP delta by policy: ${POLICIES.map((policy) => `${policy} ${signed(candidate.policies[policy].meanHp - baseline.policies[policy].meanHp)}`).join(', ')}; aggregate ${signed(hpDelta)}.`,
      `Median-turn delta by policy: ${POLICIES.map((policy) => `${policy} ${signed(candidate.policies[policy].medianTurns - baseline.policies[policy].medianTurns)}`).join(', ')}; weighted median-turn measure ${signed(turnDelta)}; stall rate ${signedPercent(result.stallRate - base.stallRate)} (${base.stalls}/${base.fights}→${result.stalls}/${result.fights}).`,
    ];
    if (candidate.change.kind === 'card-cost' || candidate.change.kind === 'card-effect' || candidate.change.kind === 'card-bracket') {
      const cardId = candidate.change.cardId;
      const before = sumUsage(baseline, cardId);
      const after = sumUsage(candidate, cardId);
      tradeoffs.push(`${report.cards[cardId]?.name ?? cardId} played/legal ${ratio(before.played, before.legalOpportunities)}→${ratio(after.played, after.legalOpportunities)}; attached/legal ${ratio(before.attached, before.legalOpportunities)}→${ratio(after.attached, after.legalOpportunities)}; played/affordable ${ratio(before.played, before.affordableOpportunities)}→${ratio(after.played, after.affordableOpportunities)}; scouted positions ${before.scoutedPositions}→${after.scoutedPositions}.`);
    }
    recommendations.push({
      target: candidate.change.kind === 'encounter' ? 'encounter pressure' : report.cards[candidate.change.cardId]?.name ?? candidate.change.cardId,
      change: candidate.change,
      baselineRunId: baseline.id,
      candidateRunId: candidate.id,
      reason: evidence.reason,
      tradeoffs,
    });
  }

  if (recommendations.length === 0) diagnostics.push(`No candidate earned a recommendation: observed changes did not consistently address stalls, confident difficulty, or statistically separated policy performance. Keep the measured candidate runs as evidence rather than inferring an untested numeric change.`);
  else {
    const omitted = candidates.length - recommendations.length;
    if (omitted > 0) {
      const uncertain = candidates.filter((item) => !item.reason);
      const overlap = uncertain.filter((item) => item.significantPolicies === 0).length;
      const disagreement = uncertain.filter((item) => item.direction === 0).length;
      diagnostics.push(`${omitted} candidate run(s) were not recommended: ${overlap} had overlapping win-rate intervals in every policy and ${disagreement} moved policies in conflicting directions. Candidates can also be omitted by the two-card/one-encounter ranking cap.`);
    }
  }

  const survivabilityConcern = base.winRate < 1 || base.stalls > 0;
  const roleFindings = [
    roleFinding(report, 'Damage', ['effect:damage'], base.stalls > 0 ? 'stalling suggests testing whether damage access or timing is insufficient' : 'no measured pacing weakness currently points to missing damage'),
    roleFinding(report, 'Block', ['effect:block'], survivabilityConcern ? 'losses or stalls suggest testing mitigation access against encounter-pressure candidates' : 'survivability data does not establish a mitigation gap'),
    roleFinding(report, 'Exposed/setup', ['effect:exposed', 'effect:setup'], separatedBaseline ? 'policy separation suggests testing whether setup sequencing is too policy-sensitive' : 'no measured policy split establishes a setup gap'),
    roleFinding(report, 'Energy', ['effect:energy'], 'a large played/hand versus played/affordable gap would justify testing resource access'),
    roleFinding(report, 'Draw', ['effect:draw'], 'low hand opportunities or stalls would justify testing access consistency'),
    roleFinding(report, 'Heal', ['effect:heal'], survivabilityConcern ? 'losses or stalls make sustain worth testing against block or encounter-pressure candidates' : 'the current outcomes do not establish a sustain need'),
    roleFinding(report, 'Positive damage modifiers', ['modifier:damage:positive'], separatedBaseline ? 'policy separation makes attachment sequencing a testable source of skill gap' : 'no measured weakness requires another positive modifier'),
    roleFinding(report, 'Negative damage modifiers', ['modifier:damage:negative'], survivabilityConcern ? 'losses or stalls make enemy-pressure reduction worth testing against block candidates' : 'no measured survivability weakness requires another negative modifier'),
    roleFinding(report, 'Bracket extension', ['bracket:positions:extend'], 'window expansion should be tested against energy cost and added enemy exposure, not assumed beneficial'),
    roleFinding(report, 'Bracket shortening', ['bracket:positions:shorten'], 'window shortening should be tested against lost action space and avoided enemy exposure, not assumed defensive power'),
    roleFinding(report, 'Scouting', ['bracket:scouting'], 'future information has no fabricated power estimate; human playtesting must establish its decision value'),
  ];

  return { diagnostics, recommendations, roleFindings, limitations };
}

export function formatFeedback(feedback: BalanceFeedback): string {
  const lines = ['BALANCE FEEDBACK', '', 'Diagnostics'];
  lines.push(...feedback.diagnostics.map((item) => `- ${item}`));
  lines.push('', 'Recommendations — card tuning');
  const cardRecommendations = feedback.recommendations.filter((item) => item.change.kind !== 'encounter');
  const encounterRecommendations = feedback.recommendations.filter((item) => item.change.kind === 'encounter');
  if (cardRecommendations.length === 0) lines.push('- None supported by the measured candidates.');
  for (const [index, recommendation] of cardRecommendations.entries()) {
    lines.push(`${index + 1}. ${recommendation.target}: ${changeText(recommendation.change)} [${recommendation.baselineRunId} → ${recommendation.candidateRunId}]`);
    lines.push(`   ${recommendation.reason}`);
    lines.push(...recommendation.tradeoffs.map((tradeoff) => `   - ${tradeoff}`));
  }
  lines.push('', 'Recommendations — encounter pressure');
  if (encounterRecommendations.length === 0) lines.push('- None supported by the measured candidates.');
  for (const [index, recommendation] of encounterRecommendations.entries()) {
    lines.push(`${index + 1}. ${recommendation.target}: ${changeText(recommendation.change)} [${recommendation.baselineRunId} → ${recommendation.candidateRunId}]`);
    lines.push(`   ${recommendation.reason}`);
    lines.push(...recommendation.tradeoffs.map((tradeoff) => `   - ${tradeoff}`));
  }
  lines.push('', 'Role findings', ...feedback.roleFindings.map((item) => `- ${item}`));
  lines.push('', 'Limitations', ...feedback.limitations.map((item) => `- ${item}`));
  return `${lines.join('\n')}\n`;
}

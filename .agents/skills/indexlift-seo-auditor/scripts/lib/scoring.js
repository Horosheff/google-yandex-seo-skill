import { SCORE_WEIGHTS, STATUS_SCORES } from './constants.js';
import { gradeScore } from './utils.js';

function filterScored(findings, predicate = () => true) {
  return findings.filter(
    (finding) => finding.status in STATUS_SCORES && finding.scope !== 'context' && predicate(finding)
  );
}

function weightedCategoryScore(findings, category, extraPredicate = () => true) {
  const relevant = filterScored(findings, (finding) => finding.category === category && extraPredicate(finding));
  if (relevant.length === 0) {
    return {
      score: 100,
      grade: 'A',
      applicable: 0,
      passed: 0,
      warned: 0,
      failed: 0,
      not_applicable: 0,
    };
  }

  const total = relevant.length;
  const raw = relevant.reduce((sum, finding) => sum + STATUS_SCORES[finding.status], 0);
  const score = Math.round((raw / total) * 100);

  return {
    score,
    grade: gradeScore(score),
    applicable: total,
    passed: relevant.filter((finding) => finding.status === 'PASS').length,
    warned: relevant.filter((finding) => finding.status === 'WARN').length,
    failed: relevant.filter((finding) => finding.status === 'FAIL').length,
    not_applicable: findings.filter((finding) => finding.category === category && finding.status === 'N/A').length,
  };
}

function confidenceFromApplicable(applicable) {
  if (applicable >= 12) return 'high';
  if (applicable >= 7) return 'medium';
  return 'low';
}

function explainConfidence(applicable) {
  if (applicable >= 12) return 'The score is backed by a broad set of applicable page-level checks.';
  if (applicable >= 7) return 'The score is backed by a moderate set of page-level checks, but some areas remain heuristic.';
  return 'The score is based on a limited set of applicable checks and should be treated cautiously.';
}

export function scoreFindings(findings, engines) {
  const technical = weightedCategoryScore(findings, 'technical');
  const onPage = weightedCategoryScore(findings, 'on_page');
  const performance = weightedCategoryScore(findings, 'performance');
  const engineOverall = weightedCategoryScore(findings, 'engine');

  const overallScore = Math.round(
    (technical.score * SCORE_WEIGHTS.technical +
      onPage.score * SCORE_WEIGHTS.on_page +
      engineOverall.score * SCORE_WEIGHTS.engine +
      performance.score * SCORE_WEIGHTS.performance) /
      100
  );

  const byEngine = {};
  for (const engine of engines) {
    const engineScore = weightedCategoryScore(
      findings,
      'engine',
      (finding) => Array.isArray(finding.engines) && finding.engines.includes(engine)
    );

    byEngine[engine] = engineScore;
  }

  const totalApplicable =
    technical.applicable + onPage.applicable + engineOverall.applicable + performance.applicable;
  const confidence = confidenceFromApplicable(totalApplicable);

  return {
    overall: {
      score: overallScore,
      grade: gradeScore(overallScore),
      confidence,
      confidence_reason: explainConfidence(totalApplicable),
      applicable_checks: totalApplicable,
    },
    categories: {
      technical,
      on_page: onPage,
      engine: engineOverall,
      performance,
    },
    engines: byEngine,
  };
}

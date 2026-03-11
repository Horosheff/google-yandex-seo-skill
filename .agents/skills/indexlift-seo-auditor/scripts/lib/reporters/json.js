function topIssues(findings, limit = 5) {
  return findings
    .filter((finding) => finding.scope !== 'context' && (finding.status === 'FAIL' || finding.status === 'WARN'))
    .slice(0, limit)
    .map((finding) => ({
      id: finding.id,
      title: finding.title,
      category: finding.category,
      severity: finding.severity,
      status: finding.status,
      scope: finding.scope,
      engines: finding.engines,
      details: finding.details,
      recommendation: finding.recommendation,
      evidence: finding.evidence,
    }));
}

function measuredCapabilities(auditResult) {
  const snapshot = auditResult.pageSnapshot;
  return [
    'raw HTML fetch',
    'page-level title, description, headings, links, images, and assets',
    'robots.txt and sitemap as supporting site context',
    'Google and Yandex page-level metadata and markup heuristics',
    'lightweight HTML/resource performance heuristics',
    snapshot?.structured_data?.schema_types?.length ? 'schema type detection from JSON-LD' : null,
    snapshot?.business_signals?.commercial_or_local_intent ? 'commercial/local business page heuristics' : null,
  ].filter(Boolean);
}

function notMeasuredCapabilities() {
  return [
    'real browser-rendered DOM after JavaScript execution',
    'Core Web Vitals field data and lab metrics',
    'paid backlink, SERP, or competitor datasets',
    'off-page authority signals',
  ];
}

function evidenceSamples(auditResult) {
  const snapshot = auditResult.pageSnapshot;
  if (!snapshot) return {};

  return {
    generic_anchors: snapshot.links?.generic_anchor_samples || [],
    missing_alt_images: snapshot.images?.samples_missing_alt || [],
    schema_completeness_issues: snapshot.structured_data?.schema_completeness_issues || [],
    cta_samples: snapshot.business_signals?.cta_samples || [],
  };
}

export function renderJsonArtifact(auditResult) {
  const issues = topIssues(auditResult.findings, 50);
  return {
    schema_version: '2.0.0',
    metadata: auditResult.metadata,
    summary: {
      score: auditResult.scores.overall.score,
      grade: auditResult.scores.overall.grade,
      confidence: auditResult.scores.overall.confidence,
      confidence_reason: auditResult.scores.overall.confidence_reason,
      applicable_checks: auditResult.scores.overall.applicable_checks,
      pages_crawled: auditResult.crawlSummary.pagesCrawled,
      failures: auditResult.findings.filter((finding) => finding.status === 'FAIL').length,
      warnings: auditResult.findings.filter((finding) => finding.status === 'WARN').length,
      passes: auditResult.findings.filter((finding) => finding.status === 'PASS').length,
      context_only: auditResult.findings.filter((finding) => finding.scope === 'context').length,
    },
    measured: measuredCapabilities(auditResult),
    not_measured: notMeasuredCapabilities(),
    crawl: auditResult.crawlSummary,
    page_snapshot: auditResult.pageSnapshot,
    evidence_samples: evidenceSamples(auditResult),
    pages: auditResult.pages,
    duplicates: auditResult.duplicates,
    prioritized_actions: issues.slice(0, 8),
    issues,
    findings: auditResult.findings,
    scores: auditResult.scores,
  };
}

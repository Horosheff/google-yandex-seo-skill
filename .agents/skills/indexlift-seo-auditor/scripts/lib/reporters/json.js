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
    geo_reference_links: snapshot.geo_signals?.reference_link_samples || [],
  };
}

function findingById(findings, id) {
  return findings.find((finding) => finding.id === id);
}

function buildLeadTrustPriorities(auditResult) {
  const snapshot = auditResult.pageSnapshot;
  if (!snapshot) return [];

  const priorities = [];
  const pushPriority = (key, title, urgency, why, fix_now, evidence) => {
    if (priorities.some((item) => item.key === key)) return;
    priorities.push({ key, title, urgency, why, fix_now, evidence });
  };

  const hasReachableContact =
    snapshot.business_signals.phone_count > 0 ||
    snapshot.business_signals.email_count > 0 ||
    snapshot.business_signals.tel_links > 0 ||
    snapshot.business_signals.mailto_links > 0 ||
    snapshot.business_signals.messenger_links > 0;
  const hasConversionPath =
    snapshot.business_signals.form_count > 0 ||
    snapshot.business_signals.button_count > 0 ||
    snapshot.business_signals.cta_count > 0 ||
    hasReachableContact;
  const hasTrustProof = (snapshot.business_signals.trust_marker_count || 0) > 0;
  const weakTopClarity =
    !snapshot.semantics.first_paragraph ||
    (snapshot.headings.counts.h1 || 0) !== 1 ||
    (snapshot.semantics.title_h1_overlap || 0) < 0.3;
  const heavyPage =
    (snapshot.response_time_ms || 0) > 800 ||
    (snapshot.resources.inline_style_bytes || 0) > 100000 ||
    (snapshot.resources.inline_script_bytes || 0) > 50000 ||
    (snapshot.html_bytes || 0) > 350000;

  if (!hasReachableContact || ['WARN', 'FAIL'].includes(findingById(auditResult.findings, 'contact-signals')?.status)) {
    pushPriority(
      'contact',
      'Make contacting you effortless',
      'high',
      'Weak contact visibility reduces conversion from high-intent visitors.',
      'Show a preferred contact method near the offer and repeat it lower on the page.',
      `${snapshot.business_signals.phone_count} phones, ${snapshot.business_signals.email_count} emails, ${snapshot.business_signals.messenger_links || 0} messenger links`
    );
  }

  if (!hasConversionPath || ['WARN', 'FAIL'].includes(findingById(auditResult.findings, 'conversion-path-visibility')?.status)) {
    pushPriority(
      'conversion',
      'Show one obvious next step',
      'high',
      'Users need a simple visible action before they turn into leads.',
      'Add one primary CTA near the top such as request a call, get pricing, or send an inquiry.',
      `${snapshot.business_signals.form_count || 0} forms, ${snapshot.business_signals.button_count || 0} buttons, ${snapshot.business_signals.cta_count || 0} CTA links`
    );
  }

  if (!hasTrustProof || ['WARN', 'FAIL'].includes(findingById(auditResult.findings, 'trust-markers')?.status)) {
    pushPriority(
      'trust',
      'Add proof near the offer',
      'high',
      'Trust proof often decides whether a visitor contacts you now or continues comparing options.',
      'Place reviews, case studies, guarantees, certificates, or portfolio proof beside the main promise and CTA.',
      `${snapshot.business_signals.trust_marker_count || 0} trust markers detected`
    );
  }

  if (weakTopClarity || ['WARN', 'FAIL'].includes(findingById(auditResult.findings, 'first-paragraph-clarity')?.status)) {
    pushPriority(
      'clarity',
      'Clarify the offer immediately',
      'high',
      'If the first screen does not explain the offer clearly, conversion intent weakens quickly.',
      'Use one focused H1 plus a short opening paragraph that explains service, audience, outcome, and next step.',
      `H1 count: ${snapshot.headings.counts.h1 || 0}, first paragraph: ${snapshot.semantics.first_paragraph ? 'present' : 'missing'}, title/H1 alignment: ${Math.round((snapshot.semantics.title_h1_overlap || 0) * 100)}%`
    );
  }

  if (
    heavyPage ||
    ['WARN', 'FAIL'].includes(findingById(auditResult.findings, 'response-time')?.status) ||
    ['WARN', 'FAIL'].includes(findingById(auditResult.findings, 'html-payload-size')?.status) ||
    ['WARN', 'FAIL'].includes(findingById(auditResult.findings, 'inline-style-bloat')?.status)
  ) {
    pushPriority(
      'friction',
      'Reduce friction before the visitor gives up',
      'medium',
      'Slow or bloated landing pages reduce trust and lead completion.',
      'Reduce inline CSS/JS, shrink HTML weight, and improve first response speed on the main landing page.',
      `${snapshot.response_time_ms || 0} ms response, ${snapshot.html_weight_human} HTML, ${snapshot.resources.inline_style_bytes || 0} B inline CSS`
    );
  }

  return priorities.slice(0, 4);
}

function geoFindings(auditResult) {
  return auditResult.findings.filter((finding) => finding.category === 'geo');
}

function buildGeoSummary(auditResult) {
  const findings = geoFindings(auditResult);
  const strengths = findings
    .filter((finding) => finding.status === 'PASS')
    .slice(0, 5)
    .map((finding) => finding.title);
  const missing = findings
    .filter((finding) => finding.status === 'WARN' || finding.status === 'FAIL')
    .slice(0, 6)
    .map((finding) => ({
      title: finding.title,
      status: finding.status,
      recommendation: finding.recommendation,
    }));

  return {
    findings: findings.length,
    passes: findings.filter((finding) => finding.status === 'PASS').length,
    warnings: findings.filter((finding) => finding.status === 'WARN').length,
    failures: findings.filter((finding) => finding.status === 'FAIL').length,
    strengths,
    missing,
  };
}

function buildGeoPriorities(auditResult) {
  const snapshot = auditResult.pageSnapshot;
  const findings = geoFindings(auditResult);
  if (!snapshot) return [];

  const priorities = [];
  const pushPriority = (key, title, why, fix_now, evidence) => {
    if (priorities.some((item) => item.key === key)) return;
    priorities.push({ key, title, why, fix_now, evidence });
  };

  if (['WARN', 'FAIL'].includes(findingById(findings, 'direct-answer-intro')?.status)) {
    pushPriority(
      'answer_intro',
      'Add a stronger answer-first intro',
      'AI answer systems prefer pages that explain the topic clearly in the first visible block.',
      'Add a short opening summary that defines the topic or service in 50-150 words.',
      snapshot.semantics?.first_paragraph || 'No opening paragraph detected'
    );
  }

  if (['WARN', 'FAIL'].includes(findingById(findings, 'geo-schema-coverage')?.status)) {
    pushPriority(
      'schema',
      'Expand machine-readable GEO schema',
      'Richer page-, service-, person-, FAQ-, and website-level schema helps AI systems identify entities and reusable answer structures.',
      'Add the schema types that match the visible page purpose, especially Service, Person, FAQPage, HowTo, WebPage, or WebSite.',
      snapshot.structured_data?.schema_types?.join(', ') || 'No schema types detected'
    );
  }

  if (['WARN', 'FAIL'].includes(findingById(findings, 'source-citation-support')?.status)) {
    pushPriority(
      'citations',
      'Support claims with source-like references',
      'Citation-worthy pages are easier for AI systems to trust, summarize, and reference.',
      'Add documentation, studies, official sources, or other supporting references near factual claims.',
      `${snapshot.geo_signals?.reference_links || 0} reference-like links`
    );
  }

  if (['WARN', 'FAIL'].includes(findingById(findings, 'author-attribution-visibility')?.status)) {
    pushPriority(
      'author',
      'Expose visible author or expert attribution',
      'Visible ownership improves trust and helps systems understand who stands behind the content.',
      'Add a byline or expert attribution and link it to a profile or about page where relevant.',
      snapshot.geo_signals?.author_name || 'No author signal detected'
    );
  }

  if (['WARN', 'FAIL'].includes(findingById(findings, 'chunkable-content-structure')?.status)) {
    pushPriority(
      'structure',
      'Break the page into cleaner answer blocks',
      'AI systems summarize better when pages have explicit sections, lists, and reusable chunks.',
      'Use clearer H2/H3 sections, add lists or tables for comparisons, and separate key points into smaller blocks.',
      `${snapshot.geo_signals?.chunkable_sections || 0} chunkable sections`
    );
  }

  return priorities.slice(0, 5);
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
    geo_summary: buildGeoSummary(auditResult),
    geo_signals: auditResult.pageSnapshot?.geo_signals || null,
    evidence_samples: evidenceSamples(auditResult),
    geo_priorities: buildGeoPriorities(auditResult),
    lead_trust_priorities: buildLeadTrustPriorities(auditResult),
    pages: auditResult.pages,
    duplicates: auditResult.duplicates,
    prioritized_actions: issues.slice(0, 8),
    issues,
    geo_findings: geoFindings(auditResult),
    findings: auditResult.findings,
    scores: auditResult.scores,
  };
}

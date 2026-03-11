function groupByStatus(findings, status) {
  return findings.filter((finding) => finding.status === status);
}

function humanEngineLabel(engine) {
  return engine === 'google' ? 'Google' : engine === 'yandex' ? 'Yandex' : engine;
}

function estimatedEffort(finding) {
  if (finding.category === 'technical' && finding.id.includes('response')) return 'Medium';
  if (finding.category === 'performance') return 'Medium';
  if (finding.category === 'on_page') return 'Low';
  return finding.status === 'FAIL' ? 'Medium' : 'Low';
}

function renderFindingsTable(findings) {
  if (findings.length === 0) {
    return '| Status | Finding | Details | Recommendation |\n|---|---|---|---|\n| N/A | No findings | No applicable checks were produced. |  |\n';
  }

  const rows = findings.map((finding) => {
    const engines = finding.engines?.length ? ` [${finding.engines.map(humanEngineLabel).join(', ')}]` : '';
    const detail = finding.evidence?.length
      ? `${String(finding.details || '').replace(/\|/g, '\\|')} Evidence: ${JSON.stringify(finding.evidence).replace(/\|/g, '\\|')}`
      : String(finding.details || '').replace(/\|/g, '\\|');
    return `| ${finding.status} | ${finding.title}${engines} | ${detail} | ${String(
      finding.recommendation || ''
    ).replace(/\|/g, '\\|')} |`;
  });

  return ['| Status | Finding | Details | Recommendation |', '|---|---|---|---|', ...rows].join('\n');
}

function renderPriorityTable(findings) {
  if (findings.length === 0) {
    return '| Issue | Impact | Effort | Fix |\n|---|---|---|---|\n| No urgent issues | Low | Low | Keep monitoring the audited page. |\n';
  }

  return [
    '| Issue | Impact | Effort | Fix |',
    '|---|---|---|---|',
    ...findings.map(
      (finding) =>
        `| ${finding.title} | ${finding.severity} | ${estimatedEffort(finding)} | ${String(
          finding.recommendation || finding.details
        ).replace(/\|/g, '\\|')} |`
    ),
  ].join('\n');
}

function renderSnapshotTable(snapshot) {
  if (!snapshot) {
    return '| Metric | Value |\n|---|---|\n| Snapshot | No page snapshot available |\n';
  }

  const rows = [
    ['Final URL', snapshot.final_url],
    ['HTTP status', snapshot.status],
    ['Response time', `${snapshot.response_time_ms} ms`],
    ['HTML size', snapshot.html_weight_human],
    ['Title length', `${snapshot.title.length} chars`],
    ['Description length', `${snapshot.description.length} chars`],
    ['Title/H1 alignment', `${Math.round((snapshot.semantics?.title_h1_overlap || 0) * 100)}%`],
    ['Title/description alignment', `${Math.round((snapshot.semantics?.title_description_overlap || 0) * 100)}%`],
    ['Word count', snapshot.word_count],
    ['Main content ratio', `${Math.round((snapshot.semantics?.main_content_ratio || 0) * 100)}%`],
    ['H1 / H2 / H3', `${snapshot.headings.counts.h1 || 0} / ${snapshot.headings.counts.h2 || 0} / ${snapshot.headings.counts.h3 || 0}`],
    ['Links', `${snapshot.links.total} total (${snapshot.links.internal} internal, ${snapshot.links.external} external)`],
    ['Empty anchors', snapshot.links.empty_anchor_text],
    ['Generic anchors', snapshot.links.generic_anchor_text],
    ['Images', `${snapshot.images.total} total, ${snapshot.images.missing_alt} missing alt, ${snapshot.images.lazy_loaded} lazy, ${snapshot.images.missing_dimensions} no dimensions`],
    ['Assets', `${snapshot.resources.total} total (${snapshot.resources.scripts} scripts, ${snapshot.resources.stylesheets} stylesheets)`],
    ['Inline JS / CSS', `${snapshot.resources.inline_script_bytes || 0} B / ${snapshot.resources.inline_style_bytes || 0} B`],
    ['JSON-LD', `${snapshot.structured_data.json_ld_blocks} blocks, ${snapshot.structured_data.json_ld_invalid_blocks} invalid`],
    ['Schema types', snapshot.structured_data.schema_types?.join(', ') || 'None'],
    ['Business signals', `${snapshot.business_signals.phone_count} phones, ${snapshot.business_signals.email_count} emails, ${snapshot.business_signals.address_mentions} address mentions`],
    ['Viewport', snapshot.viewport || 'Missing'],
    ['Canonical', snapshot.canonical || 'Missing'],
  ];

  return ['| Metric | Value |', '|---|---|', ...rows.map(([label, value]) => `| ${label} | ${String(value).replace(/\|/g, '\\|')} |`)].join('\n');
}

function renderContextTable(snapshot) {
  if (!snapshot) {
    return '| Context signal | Value |\n|---|---|\n| robots.txt | Unknown |\n';
  }

  return [
    '| Context signal | Value |',
    '|---|---|',
    `| robots.txt | ${snapshot.site_context.robots_exists ? 'Available' : 'Missing'} |`,
    `| robots URL | ${snapshot.site_context.robots_url || 'N/A'} |`,
    `| Sitemap | ${snapshot.site_context.sitemap_available ? 'Available' : 'Missing'} |`,
    `| Sitemap files fetched | ${snapshot.site_context.sitemap_count} |`,
    `| Sitemap URLs discovered | ${snapshot.site_context.sitemap_urls_discovered} |`,
  ].join('\n');
}

function renderCapabilityList(items) {
  return items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : '- No items';
}

function measuredCapabilities(auditResult) {
  const snapshot = auditResult.pageSnapshot;
  return [
    'Raw HTML fetch of the audited page',
    'Title, meta description, headings, links, images, and asset references',
    'robots.txt and sitemap as supporting site context',
    'Built-in Google and Yandex metadata/schema heuristics',
    'Built-in lightweight HTML and resource performance heuristics',
    snapshot?.structured_data?.schema_types?.length ? 'Detected JSON-LD schema types and basic completeness heuristics' : null,
    snapshot?.business_signals?.commercial_or_local_intent ? 'Commercial/local business page heuristics' : null,
  ].filter(Boolean);
}

function notMeasuredCapabilities() {
  return [
    'Browser-rendered DOM after JavaScript execution',
    'Core Web Vitals field or lab measurements',
    'Backlinks, SERP snapshots, or competitor datasets',
    'Off-page authority signals',
  ];
}

function renderEvidenceSamples(snapshot) {
  if (!snapshot) {
    return '- No evidence samples available.';
  }

  const lines = [];
  if (snapshot.links?.generic_anchor_samples?.length) {
    lines.push(`- Generic anchors: ${snapshot.links.generic_anchor_samples.map((item) => item.text).slice(0, 5).join(', ')}`);
  }
  if (snapshot.images?.samples_missing_alt?.length) {
    lines.push(`- Missing alt image URLs: ${snapshot.images.samples_missing_alt.slice(0, 5).join(', ')}`);
  }
  if (snapshot.structured_data?.schema_completeness_issues?.length) {
    lines.push(`- Schema completeness issues: ${snapshot.structured_data.schema_completeness_issues.slice(0, 5).join('; ')}`);
  }
  if (snapshot.business_signals?.cta_samples?.length) {
    lines.push(`- CTA samples: ${snapshot.business_signals.cta_samples.slice(0, 5).join(', ')}`);
  }

  return lines.length > 0 ? lines.join('\n') : '- No high-signal evidence samples were captured for this page.';
}

export function renderMarkdownReport(auditResult) {
  const { metadata, scores, findings, pageSnapshot } = auditResult;
  const critical = groupByStatus(findings, 'FAIL');
  const warnings = groupByStatus(findings, 'WARN');
  const positives = groupByStatus(findings, 'PASS');
  const pageFindings = findings.filter((finding) => finding.scope !== 'context');
  const contextFindings = findings.filter((finding) => finding.scope === 'context');
  const technical = findings.filter((finding) => finding.category === 'technical' && finding.scope !== 'context');
  const onPage = findings.filter((finding) => finding.category === 'on_page' && finding.scope !== 'context');
  const google = findings.filter(
    (finding) => finding.category === 'engine' && finding.scope !== 'context' && finding.engines?.includes('google')
  );
  const yandex = findings.filter(
    (finding) => finding.category === 'engine' && finding.scope !== 'context' && finding.engines?.includes('yandex')
  );
  const performance = findings.filter((finding) => finding.category === 'performance' && finding.scope !== 'context');

  const actionPlan = [...critical, ...warnings].filter((finding) => finding.scope !== 'context').slice(0, 5);
  const engineBreakdown = Object.entries(scores.engines)
    .map(([engineName, engineScore]) => `| ${humanEngineLabel(engineName)} | ${engineScore.score}/100 | ${engineScore.grade} |`)
    .join('\n');
  const quickWins = warnings.filter((finding) => finding.scope !== 'context').slice(0, 5);
  const priorityIssues = [...critical, ...warnings].filter((finding) => finding.scope !== 'context').slice(0, 8);

  return `# SEO Audit Report
**URL:** ${metadata.url}
**Date:** ${metadata.generatedAt}
**Mode:** ${metadata.mode}
**Tier:** ${metadata.tier}
**Engines:** ${metadata.engines.map(humanEngineLabel).join(', ')}
**Overall Score:** ${scores.overall.score}/100 (${scores.overall.grade})

---

## Executive Summary
This audit evaluated a single page in ultra-detailed mode and used robots.txt plus sitemap discovery as supporting site context only.
The highest-impact priorities are fixing direct page-level failures first, tightening snippet and structure signals, and improving the page assets that most affect ${metadata.engines.map(humanEngineLabel).join(' + ')}.

## Score Breakdown
| Category | Score | Grade |
|---|---|---|
| Technical SEO | ${scores.categories.technical.score}/100 | ${scores.categories.technical.grade} |
| On-Page SEO | ${scores.categories.on_page.score}/100 | ${scores.categories.on_page.grade} |
| Engine Signals | ${scores.categories.engine.score}/100 | ${scores.categories.engine.grade} |
| Performance | ${scores.categories.performance.score}/100 | ${scores.categories.performance.grade} |
| **Overall** | **${scores.overall.score}/100** | **${scores.overall.grade}** |

**Confidence:** ${scores.overall.confidence}
${scores.overall.confidence_reason}

## Engine Breakdown
| Engine | Score | Grade |
|---|---|---|
${engineBreakdown || '| N/A | 100/100 | A |'}

## Client Summary
The audited page returned status **${pageSnapshot?.status ?? 'N/A'}**, responded in **${pageSnapshot?.response_time_ms ?? 'N/A'} ms**, and currently scores **${scores.overall.score}/100** overall.
The strongest areas are ${positives.length > 0 ? positives.slice(0, 3).map((finding) => finding.title.toLowerCase()).join(', ') : 'basic crawlability signals'}, while the biggest risks are ${critical.length > 0 ? critical.slice(0, 3).map((finding) => finding.title.toLowerCase()).join(', ') : 'warning-level page structure and metadata issues'}.

## Priority Action Plan
${actionPlan.length > 0 ? actionPlan.map((finding, index) => `${index + 1}. ${finding.title} - ${finding.recommendation || finding.details}`).join('\n') : '1. No urgent page-level actions were generated for the audited page.'}

## Priority Matrix
${renderPriorityTable(priorityIssues)}

## Quick Wins
${quickWins.length > 0 ? quickWins.map((finding, index) => `${index + 1}. ${finding.title} - ${finding.recommendation || finding.details}`).join('\n') : '1. No quick-win warnings were generated for the audited page.'}

## Page Snapshot
${renderSnapshotTable(pageSnapshot)}

## Site Context
${renderContextTable(pageSnapshot)}

## What Was Measured
${renderCapabilityList(measuredCapabilities(auditResult))}

## What Was Not Measured
${renderCapabilityList(notMeasuredCapabilities())}

## Evidence Samples
${renderEvidenceSamples(pageSnapshot)}

## Critical Issues (Fix Immediately)
${critical.length > 0 ? critical.map((finding, index) => `${index + 1}. **${finding.title}**: ${finding.details} ${finding.recommendation}`.trim()).join('\n') : '1. No critical FAIL findings were generated for the audited page.'}

## Warnings (Fix Soon)
${warnings.length > 0 ? warnings.map((finding, index) => `${index + 1}. **${finding.title}**: ${finding.details} ${finding.recommendation}`.trim()).join('\n') : '1. No WARN findings were generated for the audited page.'}

## What You Are Doing Well
${positives.length > 0 ? positives.slice(0, 8).map((finding) => `- ${finding.title}`).join('\n') : '- No PASS findings were generated for the audited page.'}

## Deep Technical Diagnostics

### Technical SEO
${renderFindingsTable(technical)}

### On-Page SEO
${renderFindingsTable(onPage)}

### Google Signals
${renderFindingsTable(google)}

### Yandex Signals
${renderFindingsTable(yandex)}

### Performance
${renderFindingsTable(performance)}

### Context-Only Signals
${renderFindingsTable(contextFindings)}

---
*Generated by IndexLift SEO Auditor*
`;
}

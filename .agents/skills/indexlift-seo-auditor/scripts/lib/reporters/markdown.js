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

function compactPositiveLabel(finding) {
  return String(finding.title || '')
    .replace(/^The audited page /, '')
    .replace(/^Commercial or local pages /, '')
    .replace(/^The /, '')
    .replace(/\.$/, '');
}

function compactRiskLabel(finding) {
  const recommendation = String(finding.recommendation || '').trim();
  if (recommendation) {
    return recommendation.replace(/\.$/, '');
  }

  return compactPositiveLabel(finding);
}

function findingById(findings, id) {
  return findings.find((finding) => finding.id === id);
}

function buildLeadTrustPriorities(findings, snapshot) {
  if (!snapshot) {
    return [];
  }

  const priorities = [];
  const pushPriority = (key, title, urgency, why, fix, evidence) => {
    if (priorities.some((item) => item.key === key)) return;
    priorities.push({ key, title, urgency, why, fix, evidence });
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

  if (!hasReachableContact || ['WARN', 'FAIL'].includes(findingById(findings, 'contact-signals')?.status)) {
    pushPriority(
      'contact',
      'Make contacting you effortless',
      'High',
      'If visitors cannot quickly see a phone, email, messenger, or direct contact route, many high-intent leads will drop before they ask a question.',
      'Place one clear contact block near the offer and repeat it lower on the page with the exact preferred contact method.',
      `${snapshot.business_signals.phone_count} phones, ${snapshot.business_signals.email_count} emails, ${snapshot.business_signals.messenger_links || 0} messenger links`
    );
  }

  if (!hasConversionPath || ['WARN', 'FAIL'].includes(findingById(findings, 'conversion-path-visibility')?.status)) {
    pushPriority(
      'conversion',
      'Show one obvious next step',
      'High',
      'Traffic does not become a lead unless the page makes the next action feel simple, visible, and low-friction.',
      'Add one primary CTA near the top of the page such as request a call, get pricing, book a consultation, or send a brief inquiry.',
      `${snapshot.business_signals.form_count || 0} forms, ${snapshot.business_signals.button_count || 0} buttons, ${snapshot.business_signals.cta_count || 0} CTA links`
    );
  }

  if (!hasTrustProof || ['WARN', 'FAIL'].includes(findingById(findings, 'trust-markers')?.status)) {
    pushPriority(
      'trust',
      'Add proof near the offer',
      'High',
      'For commercial and local pages, trust often decides whether a visitor contacts you now or keeps comparing alternatives.',
      'Place reviews, case studies, client logos, guarantees, certificates, or portfolio proof directly beside the main promise and CTA.',
      `${snapshot.business_signals.trust_marker_count || 0} trust markers detected`
    );
  }

  if (weakTopClarity || ['WARN', 'FAIL'].includes(findingById(findings, 'first-paragraph-clarity')?.status)) {
    pushPriority(
      'clarity',
      'Clarify the offer immediately',
      'High',
      'When the first screen does not explain what you do, for whom, and why to trust you, conversion intent weakens before SEO can help.',
      'Use a single H1 plus a short opening paragraph that states the service, audience, outcome, and next step in plain language.',
      `H1 count: ${snapshot.headings.counts.h1 || 0}, first paragraph: ${snapshot.semantics.first_paragraph ? 'present' : 'missing'}, title/H1 alignment: ${Math.round((snapshot.semantics.title_h1_overlap || 0) * 100)}%`
    );
  }

  if (
    heavyPage ||
    ['WARN', 'FAIL'].includes(findingById(findings, 'response-time')?.status) ||
    ['WARN', 'FAIL'].includes(findingById(findings, 'html-payload-size')?.status) ||
    ['WARN', 'FAIL'].includes(findingById(findings, 'inline-style-bloat')?.status)
  ) {
    pushPriority(
      'friction',
      'Reduce friction before the visitor gives up',
      'Medium',
      'Slow or bloated pages hurt both trust and lead capture because users hesitate when the page feels heavy or unstable.',
      'Reduce inline CSS/JS, shrink HTML weight, and prioritize a faster first response on the main landing page.',
      `${snapshot.response_time_ms || 0} ms response, ${snapshot.html_weight_human} HTML, ${snapshot.resources.inline_style_bytes || 0} B inline CSS`
    );
  }

  return priorities.slice(0, 4);
}

function renderLeadTrustPriorities(findings, snapshot) {
  const priorities = buildLeadTrustPriorities(findings, snapshot);
  if (priorities.length === 0) {
    return '1. No immediate lead- or trust-blocking issues were strongly detected in the parsed HTML.';
  }

  return priorities
    .map(
      (item, index) =>
        `${index + 1}. **${item.title}** (${item.urgency}) - Why it matters: ${item.why} Fix now: ${item.fix} Evidence: ${item.evidence}.`
    )
    .join('\n');
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
    ['First paragraph', snapshot.semantics?.first_paragraph || 'Missing'],
    ['Paragraph quality', `${snapshot.semantics?.paragraph_count || 0} paragraphs, ${snapshot.semantics?.short_paragraphs || 0} short, ${snapshot.semantics?.long_paragraphs || 0} long`],
    ['Repeated headings', snapshot.semantics?.repeated_headings || 0],
    ['H1 / H2 / H3', `${snapshot.headings.counts.h1 || 0} / ${snapshot.headings.counts.h2 || 0} / ${snapshot.headings.counts.h3 || 0}`],
    ['Links', `${snapshot.links.total} total (${snapshot.links.internal} internal, ${snapshot.links.external} external)`],
    ['Empty anchors', snapshot.links.empty_anchor_text],
    ['Generic anchors', snapshot.links.generic_anchor_text],
    ['Images', `${snapshot.images.total} total, ${snapshot.images.missing_alt} missing alt, ${snapshot.images.lazy_loaded} lazy, ${snapshot.images.missing_dimensions} no dimensions`],
    ['Assets', `${snapshot.resources.total} total (${snapshot.resources.scripts} scripts, ${snapshot.resources.stylesheets} stylesheets)`],
    ['Inline JS / CSS', `${snapshot.resources.inline_script_bytes || 0} B / ${snapshot.resources.inline_style_bytes || 0} B`],
    ['JSON-LD', `${snapshot.structured_data.json_ld_blocks} blocks, ${snapshot.structured_data.json_ld_invalid_blocks} invalid`],
    ['Schema types', snapshot.structured_data.schema_types?.join(', ') || 'None'],
    [
      'Business signals',
      `${snapshot.business_signals.phone_count} phones, ${snapshot.business_signals.email_count} emails, ${snapshot.business_signals.address_mentions} address mentions`,
    ],
    [
      'Conversion signals',
      `${snapshot.business_signals.form_count || 0} forms, ${snapshot.business_signals.button_count || 0} buttons, ${snapshot.business_signals.cta_count || 0} CTA links`,
    ],
    ['Messenger links', snapshot.business_signals.messenger_links || 0],
    ['Trust markers', snapshot.business_signals.trust_marker_count || 0],
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
    'Built-in HTML-only GEO heuristics for answerability, structure, attribution, citations, and entity clarity',
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
  if (snapshot.business_signals?.button_samples?.length) {
    lines.push(`- Button samples: ${snapshot.business_signals.button_samples.slice(0, 5).join(', ')}`);
  }
  if (snapshot.business_signals?.trust_marker_samples?.length) {
    lines.push(`- Trust markers: ${snapshot.business_signals.trust_marker_samples.slice(0, 4).join(' | ')}`);
  }
  if (snapshot.business_signals?.messenger_samples?.length) {
    lines.push(`- Messenger links: ${snapshot.business_signals.messenger_samples.slice(0, 4).join(', ')}`);
  }
  if (snapshot.semantics?.repeated_heading_samples?.length) {
    lines.push(
      `- Repeated headings: ${snapshot.semantics.repeated_heading_samples
        .map((item) => `${item.text} (${item.count}x)`)
        .slice(0, 4)
        .join(', ')}`
    );
  }
  if (snapshot.geo_signals?.reference_link_samples?.length) {
    lines.push(
      `- GEO reference links: ${snapshot.geo_signals.reference_link_samples
        .slice(0, 4)
        .map((item) => item.text || item.href)
        .join(', ')}`
    );
  }

  return lines.length > 0 ? lines.join('\n') : '- No high-signal evidence samples were captured for this page.';
}

function renderBusinessSnapshot(snapshot) {
  if (!snapshot) {
    return '- No business snapshot available.';
  }

  const lines = [
    `- Contact reachability: ${snapshot.business_signals.phone_count || snapshot.business_signals.email_count || snapshot.business_signals.tel_links || snapshot.business_signals.mailto_links || snapshot.business_signals.messenger_links ? 'Present' : 'Weak or missing'}`,
    `- Conversion path: ${snapshot.business_signals.form_count > 0 || snapshot.business_signals.button_count > 0 || snapshot.business_signals.cta_count > 0 ? 'Visible' : 'Weak in parsed HTML'}`,
    `- Trust proof: ${snapshot.business_signals.trust_marker_count > 0 ? 'Detected' : 'Not clearly visible'}`,
    `- Local/commercial intent: ${snapshot.business_signals.commercial_or_local_intent ? 'Detected' : 'Not strongly detected'}`,
  ];

  return lines.join('\n');
}

function renderContentSnapshot(snapshot) {
  if (!snapshot) {
    return '- No content snapshot available.';
  }

  const lines = [
    `- Topic clarity at the top: ${snapshot.semantics.first_paragraph ? 'Opening paragraph detected' : 'No clear opening paragraph'}`,
    `- Main content share: ${Math.round((snapshot.semantics.main_content_ratio || 0) * 100)}%`,
    `- Readability shape: ${snapshot.semantics.paragraph_count || 0} paragraphs with ${snapshot.semantics.short_paragraphs || 0} very short and ${snapshot.semantics.long_paragraphs || 0} very long`,
    `- Heading discipline: ${snapshot.semantics.repeated_headings ? `${snapshot.semantics.repeated_headings} repeated heading patterns` : 'No repeated heading patterns detected'}`,
  ];

  return lines.join('\n');
}

function buildGeoPriorities(findings, snapshot) {
  if (!snapshot) {
    return [];
  }

  const geoFindings = findings.filter((finding) => finding.category === 'geo');
  const priorities = [];
  const pushPriority = (key, title, why, fix, evidence) => {
    if (priorities.some((item) => item.key === key)) return;
    priorities.push({ key, title, why, fix, evidence });
  };

  if (['WARN', 'FAIL'].includes(findingById(geoFindings, 'direct-answer-intro')?.status)) {
    pushPriority(
      'answer_intro',
      'Add a stronger answer-first intro',
      'AI answer systems prefer pages that explain the topic clearly in the first visible block.',
      'Add a short opening summary that defines the topic or service in 50-150 words.',
      snapshot.semantics?.first_paragraph || 'No opening paragraph detected'
    );
  }

  if (['WARN', 'FAIL'].includes(findingById(geoFindings, 'geo-schema-coverage')?.status)) {
    pushPriority(
      'schema',
      'Expand machine-readable GEO schema',
      'Page-, service-, person-, FAQ-, and website-level schema can improve machine understanding of entities and answer blocks.',
      'Add the schema types that match the visible page purpose, especially Service, Person, FAQPage, HowTo, WebPage, or WebSite.',
      snapshot.structured_data?.schema_types?.join(', ') || 'No schema types detected'
    );
  }

  if (['WARN', 'FAIL'].includes(findingById(geoFindings, 'source-citation-support')?.status)) {
    pushPriority(
      'citations',
      'Support claims with source-like references',
      'Citation-worthy pages are easier for AI systems to trust, summarize, and reference.',
      'Add documentation, studies, official sources, or other supporting references near factual claims.',
      `${snapshot.geo_signals?.reference_links || 0} reference-like links`
    );
  }

  if (['WARN', 'FAIL'].includes(findingById(geoFindings, 'author-attribution-visibility')?.status)) {
    pushPriority(
      'author',
      'Expose visible author or expert attribution',
      'Visible ownership improves trust and helps AI systems understand who stands behind the content.',
      'Add a byline or expert attribution and link it to a profile or about page where relevant.',
      snapshot.geo_signals?.author_name || 'No author signal detected'
    );
  }

  if (['WARN', 'FAIL'].includes(findingById(geoFindings, 'chunkable-content-structure')?.status)) {
    pushPriority(
      'structure',
      'Break the page into cleaner answer blocks',
      'AI systems summarize better when pages have explicit sections, lists, and reusable chunks.',
      'Use clearer H2/H3 sections, lists, and tables for comparisons or process steps.',
      `${snapshot.geo_signals?.chunkable_sections || 0} chunkable sections`
    );
  }

  return priorities.slice(0, 5);
}

function renderGeoPriorities(findings, snapshot) {
  const priorities = buildGeoPriorities(findings, snapshot);
  if (priorities.length === 0) {
    return '1. No immediate GEO blockers were strongly detected in the parsed HTML.';
  }

  return priorities
    .map(
      (item, index) =>
        `${index + 1}. **${item.title}** - Why it matters: ${item.why} Fix now: ${item.fix} Evidence: ${item.evidence}.`
    )
    .join('\n');
}

function renderGeoSnapshot(snapshot) {
  if (!snapshot) {
    return '- No GEO snapshot available.';
  }

  const lines = [
    `- Answer-first intro: ${snapshot.geo_signals?.definition_like_intro ? 'Definition-like intro detected' : snapshot.geo_signals?.answer_first_paragraph_present ? 'Opening paragraph present but weakly answer-like' : 'Missing'}`,
    `- Question-led structure: ${snapshot.geo_signals?.question_headings || 0} question-like headings`,
    `- GEO schema: ${snapshot.geo_signals?.faq_schema_count || 0} FAQPage, ${snapshot.geo_signals?.howto_schema_count || 0} HowTo, ${snapshot.geo_signals?.service_schema_count || 0} Service, ${snapshot.geo_signals?.person_schema_count || 0} Person`,
    `- Attribution and freshness: ${snapshot.geo_signals?.author_present ? 'author present' : 'no author'}, ${snapshot.geo_signals?.date_modified_present || snapshot.geo_signals?.date_published_present ? 'date present' : 'no date signal'}`,
    `- Citation support: ${snapshot.geo_signals?.reference_links || 0} reference-like links`,
    `- Chunkable structure: ${snapshot.geo_signals?.chunkable_sections || 0} sections, ${snapshot.geo_signals?.list_blocks || 0} lists, ${snapshot.geo_signals?.table_blocks || 0} tables`,
  ];

  return lines.join('\n');
}

function renderGeoStrengths(findings) {
  const geoPasses = findings.filter((finding) => finding.category === 'geo' && finding.status === 'PASS');
  return geoPasses.length > 0
    ? geoPasses.slice(0, 6).map((finding) => `- ${finding.title}`).join('\n')
    : '- No strong GEO-supporting signals were detected yet.';
}

function renderGeoMissing(findings) {
  const geoGaps = findings.filter(
    (finding) => finding.category === 'geo' && (finding.status === 'WARN' || finding.status === 'FAIL')
  );
  return geoGaps.length > 0
    ? geoGaps.slice(0, 6).map((finding) => `- ${finding.title}: ${finding.recommendation || finding.details}`).join('\n')
    : '- No major GEO gaps were highlighted by the current HTML-only checks.';
}

function renderYandexWhyNot100(findings) {
  const yandexGaps = findings.filter(
    (finding) =>
      finding.category === 'engine' &&
      finding.engines?.includes('yandex') &&
      finding.scope !== 'context' &&
      (finding.status === 'WARN' || finding.status === 'FAIL')
  );

  if (yandexGaps.length === 0) {
    return '1. No major page-level Yandex blockers were detected by the current checks.';
  }

  return yandexGaps
    .slice(0, 6)
    .map(
      (finding, index) =>
        `${index + 1}. **${finding.title}** - ${finding.recommendation || finding.details}`
    )
    .join('\n');
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
  const geo = findings.filter((finding) => finding.category === 'geo' && finding.scope !== 'context');
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

## Why Yandex Is Not 100/100
${metadata.engines.includes('yandex') ? renderYandexWhyNot100(findings) : '1. Yandex analysis was not requested for this audit.'}

## Client Summary
The audited page returned status **${pageSnapshot?.status ?? 'N/A'}**, responded in **${pageSnapshot?.response_time_ms ?? 'N/A'} ms**, and currently scores **${scores.overall.score}/100** overall.
The strongest areas are ${positives.length > 0 ? positives.slice(0, 3).map((finding) => compactPositiveLabel(finding).toLowerCase()).join(', ') : 'basic crawlability signals'}, while the biggest risks are ${[...critical, ...warnings].length > 0 ? [...critical, ...warnings].slice(0, 3).map((finding) => compactRiskLabel(finding).toLowerCase()).join('; ') : 'warning-level page structure and metadata issues'}.

## Business Snapshot
${renderBusinessSnapshot(pageSnapshot)}

## Content Snapshot
${renderContentSnapshot(pageSnapshot)}

## GEO Snapshot
${renderGeoSnapshot(pageSnapshot)}

## What Helps AI Answer Engines Already
${renderGeoStrengths(findings)}

## What GEO Signals Are Missing
${renderGeoMissing(findings)}

## What To Fix First For GEO Visibility
${renderGeoPriorities(findings, pageSnapshot)}

## What To Fix First For More Leads And Trust
${renderLeadTrustPriorities(findings, pageSnapshot)}

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

### GEO Diagnostics
${renderFindingsTable(geo)}

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

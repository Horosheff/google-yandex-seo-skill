import { createFinding } from '../utils.js';

export function buildGoogleFindings(context) {
  const { page, pageSnapshot } = context;
  if (!page || !page.parsed || !pageSnapshot) {
    return [
      createFinding({
        id: 'google-coverage',
        title: 'Google-specific checks require a fetched HTML page',
        category: 'engine',
        engines: ['google'],
        status: 'N/A',
        value: 'No fetched HTML page',
        details: 'No HTML page was fetched, so Google-specific rendering and markup checks could not run.',
        recommendation: 'Restore crawl access or audit a reachable URL to enable Google-specific analysis.',
      }),
    ];
  }
  const canonicalMismatch = page.parsed.canonical && page.parsed.canonical !== page.finalUrl;
  const invalidJsonLd = page.parsed.jsonLd.some((item) => !item.valid);
  const hasStructuredOrPreviewData =
    page.parsed.jsonLd.length > 0 || page.parsed.structuredData.hasOpenGraph || page.parsed.structuredData.hasTwitterCard;
  const missingViewport = !page.parsed.viewport;
  const hreflangCount = pageSnapshot.structured_data.hreflang_count;
  const schemaTypes = pageSnapshot.structured_data.schema_types;
  const schemaIssues = pageSnapshot.structured_data.schema_completeness_issues;
  const hasBreadcrumbs = pageSnapshot.structured_data.has_breadcrumbs;

  return [
    createFinding({
      id: 'google-canonical-alignment',
      title: 'Google canonical signals are aligned for the audited page',
      category: 'engine',
      engines: ['google'],
      scope: 'page',
      status: canonicalMismatch ? 'WARN' : 'PASS',
      value: page.parsed.canonical || 'Missing',
      details: canonicalMismatch
        ? 'The audited page sends a canonical target that differs from the fetched final URL.'
        : 'The canonical signal does not conflict with the fetched page URL.',
      recommendation: canonicalMismatch
        ? 'Keep canonicals, redirects, internal links, and sitemap references aligned to the same preferred URL.'
        : '',
    }),
    createFinding({
      id: 'google-hreflang-coverage',
      title: 'The audited page declares hreflang only when localized alternates exist',
      category: 'engine',
      engines: ['google'],
      scope: 'context',
      status: hreflangCount > 0 ? 'PASS' : 'N/A',
      value: `${hreflangCount} hreflang annotations`,
      details:
        hreflangCount > 0
          ? 'The audited page exposes hreflang annotations.'
          : 'A single-page audit cannot infer whether alternate locales exist, so hreflang is treated as contextual.',
      recommendation:
        hreflangCount > 0 ? '' : 'If this page has localized alternates, add reciprocal hreflang annotations and align them with canonicals.',
    }),
    createFinding({
      id: 'google-structured-data-validity',
      title: 'Structured data is syntactically valid for Google processing',
      category: 'engine',
      engines: ['google'],
      scope: 'page',
      status: invalidJsonLd ? 'FAIL' : 'PASS',
      value: `${pageSnapshot.structured_data.json_ld_invalid_blocks} invalid JSON-LD blocks`,
      details: invalidJsonLd
        ? 'At least one JSON-LD block on the audited page could not be parsed and may be ignored by Google.'
        : 'No invalid JSON-LD blocks were detected on the audited page.',
      recommendation: invalidJsonLd
        ? 'Fix malformed JSON-LD and validate rich-result eligible markup with Google tooling.'
        : '',
    }),
    createFinding({
      id: 'google-structured-data-coverage',
      title: 'The audited page exposes useful structured metadata for Google',
      category: 'engine',
      engines: ['google'],
      scope: 'page',
      status: schemaTypes.length > 0 ? 'PASS' : hasStructuredOrPreviewData ? 'WARN' : 'FAIL',
      value: schemaTypes.length > 0 ? schemaTypes.join(', ') : hasStructuredOrPreviewData ? 'Preview metadata only' : 'Missing',
      details: schemaTypes.length > 0
        ? 'The audited page exposes structured data types that Google can parse beyond social preview tags.'
        : hasStructuredOrPreviewData
          ? 'The audited page exposes preview metadata, but no structured schema types were detected.'
          : 'The audited page lacks both structured data and preview metadata.',
      recommendation:
        schemaTypes.length > 0
          ? ''
          : 'Add relevant schema.org JSON-LD and keep visible content aligned with markup.',
    }),
    createFinding({
      id: 'google-schema-completeness',
      title: 'The audited page structured data is complete enough to be useful',
      category: 'engine',
      engines: ['google'],
      scope: 'page',
      status: schemaIssues.length === 0 ? (schemaTypes.length > 0 ? 'PASS' : 'N/A') : 'WARN',
      value: `${schemaIssues.length} completeness issues`,
      details:
        schemaTypes.length === 0
          ? 'No schema types were detected, so completeness could not be evaluated.'
          : schemaIssues.length === 0
            ? 'No obvious schema completeness gaps were detected in the built-in checks.'
            : `Structured data is present but has obvious completeness gaps: ${schemaIssues.slice(0, 4).join('; ')}`,
      recommendation:
        schemaTypes.length === 0 || schemaIssues.length === 0
          ? ''
          : 'Fill required and strongly recommended fields for the detected schema types before relying on them in search.',
      evidence: schemaIssues.slice(0, 8),
    }),
    createFinding({
      id: 'google-breadcrumb-coverage',
      title: 'The audited page exposes breadcrumb markup when navigational depth suggests it',
      category: 'engine',
      engines: ['google'],
      scope: 'page',
      status: pageSnapshot.links.internal >= 5 ? (hasBreadcrumbs ? 'PASS' : 'WARN') : 'N/A',
      value: hasBreadcrumbs ? 'BreadcrumbList detected' : 'No breadcrumb schema detected',
      details:
        pageSnapshot.links.internal >= 5
          ? hasBreadcrumbs
            ? 'Breadcrumb schema is present on a page with meaningful navigational context.'
            : 'The page has meaningful internal navigation context, but no breadcrumb schema was detected.'
          : 'The page does not strongly suggest a breadcrumb expectation in this built-in heuristic.',
      recommendation:
        pageSnapshot.links.internal >= 5 && !hasBreadcrumbs
          ? 'Add BreadcrumbList schema if this page belongs to a deeper navigational hierarchy.'
          : '',
    }),
    createFinding({
      id: 'google-mobile-viewport',
      title: 'The audited page exposes a mobile viewport declaration',
      category: 'engine',
      engines: ['google'],
      scope: 'page',
      status: missingViewport ? 'FAIL' : 'PASS',
      value: page.parsed.viewport || 'Missing',
      details: missingViewport
        ? 'The audited page is missing a viewport declaration, which is a mobile-friendliness red flag.'
        : 'The audited page exposes a viewport meta tag.',
      recommendation:
        missingViewport ? 'Add a responsive viewport meta tag on the audited page template.' : '',
    }),
  ];
}

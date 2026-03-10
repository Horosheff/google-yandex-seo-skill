import { createFinding } from '../utils.js';

export function buildGoogleFindings(context) {
  const pages = context.crawl.pages.filter((page) => page.parsed);
  if (pages.length === 0) {
    return [
      createFinding({
        id: 'google-coverage',
        title: 'Google-specific checks require at least one fetched HTML page',
        category: 'engine',
        engines: ['google'],
        status: 'N/A',
        value: '0 crawled HTML pages',
        details: 'No HTML pages were fetched, so Google-specific rendering and markup checks could not run.',
        recommendation: 'Restore crawl access or audit a reachable URL to enable Google-specific analysis.',
      }),
    ];
  }
  const canonicalMismatches = pages.filter(
    (page) => page.parsed.canonical && page.parsed.canonical !== page.finalUrl
  );
  const missingHreflang = pages.filter((page) => page.parsed.lang && page.parsed.hreflangs.length === 0);
  const invalidJsonLd = pages.filter((page) => page.parsed.jsonLd.some((item) => !item.valid));
  const noStructuredData = pages.filter(
    (page) =>
      page.parsed.jsonLd.length === 0 &&
      !page.parsed.structuredData.hasOpenGraph &&
      !page.parsed.structuredData.hasTwitterCard
  );
  const missingViewport = pages.filter((page) => !page.parsed.viewport);

  return [
    createFinding({
      id: 'google-canonical-alignment',
      title: 'Google canonical signals are aligned',
      category: 'engine',
      engines: ['google'],
      status: canonicalMismatches.length === 0 ? 'PASS' : 'WARN',
      value: `${canonicalMismatches.length} pages canonicalize away from their final URL`,
      details:
        canonicalMismatches.length === 0
          ? 'Canonical annotations match the fetched URL set.'
          : 'Some pages send mixed canonical signals that can weaken consolidation in Google Search.',
      recommendation:
        canonicalMismatches.length === 0
          ? ''
          : 'Keep canonicals, redirects, internal links, and sitemaps aligned to the same preferred URL.',
    }),
    createFinding({
      id: 'google-hreflang-coverage',
      title: 'International pages provide hreflang annotations when needed',
      category: 'engine',
      engines: ['google'],
      status: missingHreflang.length === 0 ? 'PASS' : 'WARN',
      value: `${missingHreflang.length} language-tagged pages without hreflang`,
      details:
        missingHreflang.length === 0
          ? 'No obvious hreflang coverage gaps were detected in the crawled sample.'
          : 'Pages declaring a language but lacking alternate annotations may need hreflang if multiple locales exist.',
      recommendation:
        missingHreflang.length === 0
          ? ''
          : 'If you serve localized alternates, add reciprocal hreflang annotations and align them with canonicals.',
    }),
    createFinding({
      id: 'google-structured-data-validity',
      title: 'Structured data is syntactically valid for Google processing',
      category: 'engine',
      engines: ['google'],
      status: invalidJsonLd.length === 0 ? 'PASS' : 'FAIL',
      value: `${invalidJsonLd.length} pages with invalid JSON-LD`,
      details:
        invalidJsonLd.length === 0
          ? 'No invalid JSON-LD blocks were detected in the crawled sample.'
          : 'At least one JSON-LD block could not be parsed and may be ignored by Google.',
      recommendation:
        invalidJsonLd.length === 0
          ? ''
          : 'Fix malformed JSON-LD and validate rich-result eligible markup with Google tooling.',
    }),
    createFinding({
      id: 'google-structured-data-coverage',
      title: 'Pages expose useful structured or preview metadata',
      category: 'engine',
      engines: ['google'],
      status: noStructuredData.length === 0 ? 'PASS' : 'WARN',
      value: `${noStructuredData.length} pages without structured or preview metadata`,
      details:
        noStructuredData.length === 0
          ? 'Every crawled page exposes structured or preview metadata.'
          : 'Some pages lack JSON-LD and social metadata, reducing richness of search and sharing previews.',
      recommendation:
        noStructuredData.length === 0
          ? ''
          : 'Add relevant schema.org JSON-LD and keep visible content aligned with markup.',
    }),
    createFinding({
      id: 'google-mobile-viewport',
      title: 'Pages expose a mobile viewport declaration',
      category: 'engine',
      engines: ['google'],
      status: missingViewport.length === 0 ? 'PASS' : 'FAIL',
      value: `${missingViewport.length} pages without viewport meta`,
      details:
        missingViewport.length === 0
          ? 'All crawled pages expose a viewport meta tag.'
          : 'Some pages are missing a viewport declaration, which is a mobile-friendliness red flag.',
      recommendation:
        missingViewport.length === 0 ? '' : 'Add a responsive viewport meta tag on all HTML templates.',
    }),
  ];
}

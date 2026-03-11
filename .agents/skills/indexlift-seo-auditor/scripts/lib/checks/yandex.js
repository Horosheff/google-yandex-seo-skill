import { createFinding } from '../utils.js';

export function buildYandexFindings(context) {
  const { crawl, page, pageSnapshot } = context;
  if (!page || !page.parsed || !pageSnapshot) {
    return [
      createFinding({
        id: 'yandex-coverage',
        title: 'Yandex-specific checks require a fetched HTML page',
        category: 'engine',
        engines: ['yandex'],
        status: 'N/A',
        value: 'No fetched HTML page',
        details: 'No HTML page was fetched, so Yandex-specific markup and indexability checks could not run.',
        recommendation: 'Restore crawl access or audit a reachable URL to enable Yandex-specific analysis.',
      }),
      createFinding({
        id: 'yandex-robots',
        title: 'Yandex crawl directives are explicitly published',
        category: 'engine',
        engines: ['yandex'],
        scope: 'context',
        status: crawl.robots.exists ? 'PASS' : 'WARN',
        value: crawl.robots.url,
        details: crawl.robots.exists
          ? 'robots.txt is available and can provide crawl hints to Yandex.'
          : 'robots.txt is unavailable, which weakens explicit crawl guidance for Yandex.',
        recommendation: crawl.robots.exists ? '' : 'Publish robots.txt and include sitemap references where appropriate.',
      }),
    ];
  }
  const robotsMissing = !crawl.robots.exists;
  const sitemapMissing = !crawl.sitemaps.fetched.some((entry) => entry.ok);
  const invalidJsonLd = page.parsed.jsonLd.some((item) => !item.valid);
  const hasMicroMarkup =
    page.parsed.jsonLd.length > 0 || page.parsed.structuredData.hasOpenGraph || page.parsed.hreflangs.length > 0;
  const isHeavyPage = page.html.length > 10 * 1024 * 1024;
  const wrongCanonical = page.parsed.canonical && page.parsed.canonical !== page.finalUrl;
  const schemaIssues = pageSnapshot.structured_data.schema_completeness_issues;
  const hasLocalBusiness = pageSnapshot.structured_data.has_local_business;
  const commercialIntent = pageSnapshot.business_signals.commercial_or_local_intent;
  const strongContactSignals =
    pageSnapshot.business_signals.phone_count > 0 ||
    pageSnapshot.business_signals.tel_links > 0 ||
    pageSnapshot.business_signals.address_mentions > 0;

  return [
    createFinding({
      id: 'yandex-robots',
      title: 'Yandex crawl directives are explicitly published',
      category: 'engine',
      engines: ['yandex'],
      scope: 'context',
      status: robotsMissing ? 'WARN' : 'PASS',
      value: crawl.robots.url,
      details: robotsMissing
        ? 'robots.txt is unavailable, which weakens explicit crawl guidance for Yandex.'
        : 'robots.txt is available and can provide crawl and sitemap hints to Yandex.',
      recommendation: robotsMissing ? 'Publish robots.txt and include sitemap references where appropriate.' : '',
    }),
    createFinding({
      id: 'yandex-sitemap',
      title: 'Yandex can discover XML sitemap coverage',
      category: 'engine',
      engines: ['yandex'],
      scope: 'context',
      status: sitemapMissing ? 'WARN' : 'PASS',
      value: `${crawl.sitemaps.urls.length} URLs discovered in sitemaps`,
      details: sitemapMissing
        ? 'No valid XML sitemap was discovered for Yandex ingestion.'
        : 'A sitemap is available and should help Yandex understand site structure and update priorities.',
      recommendation: sitemapMissing ? 'Expose a valid sitemap.xml and list it in robots.txt.' : '',
    }),
    createFinding({
      id: 'yandex-canonical-consistency',
      title: 'Canonical recommendations are consistent for Yandex on the audited page',
      category: 'engine',
      engines: ['yandex'],
      scope: 'page',
      status: wrongCanonical ? 'WARN' : 'PASS',
      value: page.parsed.canonical || 'Missing',
      details:
        wrongCanonical
          ? 'The audited page canonical recommendation differs from the fetched URL.'
          : 'The audited page canonical signal does not conflict with the fetched URL.',
      recommendation: wrongCanonical
        ? 'Use canonical only where the page is a true duplicate and keep content, linking, and sitemap signals aligned.'
        : '',
    }),
    createFinding({
      id: 'yandex-micro-markup',
      title: 'The audited page exposes markup Yandex can interpret',
      category: 'engine',
      engines: ['yandex'],
      scope: 'page',
      status: hasMicroMarkup ? 'PASS' : 'WARN',
      value: hasMicroMarkup ? 'Present' : 'Missing',
      details:
        hasMicroMarkup
          ? 'The audited page exposes structured or preview metadata that can support Yandex interpretation.'
          : 'The audited page lacks JSON-LD, preview metadata, and hreflang signals that can help Yandex-powered features.',
      recommendation:
        hasMicroMarkup ? '' : 'Add structured metadata where relevant and validate it in Yandex Webmaster tooling.',
    }),
    createFinding({
      id: 'yandex-markup-completeness',
      title: 'The audited page markup is complete enough for Yandex interpretation',
      category: 'engine',
      engines: ['yandex'],
      scope: 'page',
      status: schemaIssues.length === 0 ? (hasMicroMarkup ? 'PASS' : 'N/A') : 'WARN',
      value: `${schemaIssues.length} markup completeness issues`,
      details:
        !hasMicroMarkup
          ? 'No markup was detected, so completeness could not be evaluated.'
          : schemaIssues.length === 0
            ? 'No obvious completeness gaps were detected in the built-in markup checks.'
            : `Markup is present but incomplete in places: ${schemaIssues.slice(0, 4).join('; ')}`,
      recommendation:
        !hasMicroMarkup || schemaIssues.length === 0
          ? ''
          : 'Fill required business, organization, breadcrumb, or content fields so Yandex can interpret the page more reliably.',
      evidence: schemaIssues.slice(0, 8),
    }),
    createFinding({
      id: 'yandex-markup-validity',
      title: 'Structured data blocks are syntactically valid for Yandex validation',
      category: 'engine',
      engines: ['yandex'],
      scope: 'page',
      status: invalidJsonLd ? 'FAIL' : 'PASS',
      value: `${page.parsed.jsonLd.filter((item) => !item.valid).length} invalid JSON-LD blocks`,
      details:
        invalidJsonLd
          ? 'Malformed JSON-LD was found on the audited page and should be corrected before Yandex validation.'
          : 'No malformed JSON-LD blocks were detected on the audited page.',
      recommendation:
        invalidJsonLd ? 'Fix malformed structured data and validate markup in Yandex Webmaster.' : '',
    }),
    createFinding({
      id: 'yandex-local-signals',
      title: 'Commercial or local pages expose clear business signals for Yandex',
      category: 'engine',
      engines: ['yandex'],
      scope: 'page',
      status: !commercialIntent ? 'N/A' : strongContactSignals || hasLocalBusiness ? 'PASS' : 'WARN',
      value:
        strongContactSignals || hasLocalBusiness
          ? 'Business contact or LocalBusiness signals found'
          : 'No strong business signals found',
      details:
        !commercialIntent
          ? 'The page does not strongly suggest a commercial or local intent in the built-in heuristic.'
          : strongContactSignals || hasLocalBusiness
            ? 'The page exposes contact or LocalBusiness-style signals that help local/business interpretation.'
            : 'The page looks commercial or local in intent but lacks strong business signals such as address, phone, or LocalBusiness markup.',
      recommendation:
        !commercialIntent || strongContactSignals || hasLocalBusiness
          ? ''
          : 'Expose clearer business signals such as phone, address, or LocalBusiness schema on the page itself.',
    }),
    createFinding({
      id: 'yandex-document-size',
      title: 'The audited page stays below Yandex indexing size constraints',
      category: 'engine',
      engines: ['yandex'],
      scope: 'page',
      status: isHeavyPage ? 'FAIL' : 'PASS',
      value: `${Math.round(page.html.length / 1024)} KB`,
      details:
        isHeavyPage
          ? 'The audited HTML document exceeds the 10 MB threshold and may be truncated or ignored.'
          : 'The audited HTML document stays below Yandex size constraints.',
      recommendation:
        isHeavyPage ? 'Reduce HTML payload size so the audited page stays comfortably under 10 MB.' : '',
    }),
  ];
}

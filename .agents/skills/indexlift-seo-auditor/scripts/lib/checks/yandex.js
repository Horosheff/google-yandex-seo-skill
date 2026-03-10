import { createFinding } from '../utils.js';

export function buildYandexFindings(context) {
  const pages = context.crawl.pages.filter((page) => page.parsed);
  if (pages.length === 0) {
    return [
      createFinding({
        id: 'yandex-coverage',
        title: 'Yandex-specific checks require at least one fetched HTML page',
        category: 'engine',
        engines: ['yandex'],
        status: 'N/A',
        value: '0 crawled HTML pages',
        details: 'No HTML pages were fetched, so Yandex-specific markup and indexability checks could not run.',
        recommendation: 'Restore crawl access or audit a reachable URL to enable Yandex-specific analysis.',
      }),
      createFinding({
        id: 'yandex-robots',
        title: 'Yandex crawl directives are explicitly published',
        category: 'engine',
        engines: ['yandex'],
        status: context.crawl.robots.exists ? 'PASS' : 'WARN',
        value: context.crawl.robots.url,
        details: context.crawl.robots.exists
          ? 'robots.txt is available and can provide crawl hints to Yandex.'
          : 'robots.txt is unavailable, which weakens explicit crawl guidance for Yandex.',
        recommendation: context.crawl.robots.exists ? '' : 'Publish robots.txt and include sitemap references where appropriate.',
      }),
    ];
  }
  const robotsMissing = !context.crawl.robots.exists;
  const sitemapMissing = !context.crawl.sitemaps.fetched.some((entry) => entry.ok);
  const invalidJsonLd = pages.filter((page) => page.parsed.jsonLd.some((item) => !item.valid));
  const noMicroMarkup = pages.filter(
    (page) =>
      page.parsed.jsonLd.length === 0 &&
      !page.parsed.structuredData.hasOpenGraph &&
      page.parsed.hreflangs.length === 0
  );
  const heavyPages = pages.filter((page) => page.html.length > 10 * 1024 * 1024);
  const wrongCanonicals = pages.filter(
    (page) => page.parsed.canonical && page.parsed.canonical !== page.finalUrl
  );

  return [
    createFinding({
      id: 'yandex-robots',
      title: 'Yandex crawl directives are explicitly published',
      category: 'engine',
      engines: ['yandex'],
      status: robotsMissing ? 'WARN' : 'PASS',
      value: context.crawl.robots.url,
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
      status: sitemapMissing ? 'WARN' : 'PASS',
      value: `${context.crawl.sitemaps.urls.length} URLs discovered in sitemaps`,
      details: sitemapMissing
        ? 'No valid XML sitemap was discovered for Yandex ingestion.'
        : 'A sitemap is available and should help Yandex understand site structure and update priorities.',
      recommendation: sitemapMissing ? 'Expose a valid sitemap.xml and list it in robots.txt.' : '',
    }),
    createFinding({
      id: 'yandex-canonical-consistency',
      title: 'Canonical recommendations are consistent for Yandex',
      category: 'engine',
      engines: ['yandex'],
      status: wrongCanonicals.length === 0 ? 'PASS' : 'WARN',
      value: `${wrongCanonicals.length} pages canonicalize away from the fetched URL`,
      details:
        wrongCanonicals.length === 0
          ? 'Canonical annotations are consistent within the crawled sample.'
          : 'Some pages send canonical recommendations that differ from the fetched URL.',
      recommendation:
        wrongCanonicals.length === 0
          ? ''
          : 'Use canonical only where pages are true duplicates and keep content, linking, and sitemap signals aligned.',
    }),
    createFinding({
      id: 'yandex-micro-markup',
      title: 'Pages expose markup Yandex can interpret',
      category: 'engine',
      engines: ['yandex'],
      status: noMicroMarkup.length === 0 ? 'PASS' : 'WARN',
      value: `${noMicroMarkup.length} pages without visible markup signals`,
      details:
        noMicroMarkup.length === 0
          ? 'The crawled sample includes at least some structured or preview metadata on every page.'
          : 'Some pages lack JSON-LD/Open Graph style metadata that can help Yandex-powered features.',
      recommendation:
        noMicroMarkup.length === 0
          ? ''
          : 'Add structured metadata where relevant and validate it in Yandex Webmaster tooling.',
    }),
    createFinding({
      id: 'yandex-markup-validity',
      title: 'Structured data blocks are syntactically valid for Yandex validation',
      category: 'engine',
      engines: ['yandex'],
      status: invalidJsonLd.length === 0 ? 'PASS' : 'FAIL',
      value: `${invalidJsonLd.length} pages with invalid JSON-LD`,
      details:
        invalidJsonLd.length === 0
          ? 'No malformed JSON-LD blocks were detected.'
          : 'Malformed JSON-LD was found and should be corrected before Yandex validation.',
      recommendation:
        invalidJsonLd.length === 0 ? '' : 'Fix malformed structured data and validate markup in Yandex Webmaster.',
    }),
    createFinding({
      id: 'yandex-document-size',
      title: 'Documents stay below Yandex indexing size constraints',
      category: 'engine',
      engines: ['yandex'],
      status: heavyPages.length === 0 ? 'PASS' : 'FAIL',
      value: `${heavyPages.length} pages over 10 MB`,
      details:
        heavyPages.length === 0
          ? 'No crawled HTML document exceeded 10 MB.'
          : 'Some crawled documents exceed the 10 MB threshold and may be truncated or ignored.',
      recommendation:
        heavyPages.length === 0 ? '' : 'Reduce HTML payload size so important documents stay comfortably under 10 MB.',
    }),
  ];
}

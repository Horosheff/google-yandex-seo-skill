import { createFinding, formatBytes } from '../utils.js';

function getBrokenPages(pages) {
  return pages.filter((page) => page.response.status >= 400);
}

export function buildTechnicalFindings(context) {
  const findings = [];
  const { crawl, duplicates } = context;
  const pages = crawl.pages;
  const brokenPages = getBrokenPages(pages);
  const redirectChains = pages.filter((page) => page.response.redirectChain.length > 2);
  const canonicalMissing = pages.filter((page) => page.parsed && !page.parsed.canonical);
  const canonicalConflict = pages.filter(
    (page) => page.parsed?.canonical && page.parsed.canonical !== page.finalUrl
  );
  const noindexPages = pages.filter((page) => {
    const robots = `${page.parsed?.metaRobots || ''} ${page.parsed?.xRobotsTag || ''}`.toLowerCase();
    return robots.includes('noindex');
  });
  const mixedContentPages = pages.filter((page) => page.parsed?.mixedContentUrls?.length > 0);
  const blockedByRobots = pages.filter((page) => page.crawlableByRobots === false);
  const orphanSitemapUrls = crawl.sitemaps.urls.filter((url) => !crawl.incomingLinks[url] && url !== crawl.startUrl);

  findings.push(
    createFinding({
      id: 'https-enabled',
      title: 'HTTPS enabled on the audited origin',
      category: 'technical',
      status: crawl.startUrl.startsWith('https://') ? 'PASS' : 'FAIL',
      value: crawl.startUrl,
      details: crawl.startUrl.startsWith('https://')
        ? 'The audited entry URL uses HTTPS.'
        : 'The audited entry URL uses plain HTTP.',
      recommendation: crawl.startUrl.startsWith('https://')
        ? ''
        : 'Force HTTP to HTTPS redirects and use HTTPS as the canonical public origin.',
    })
  );

  findings.push(
    createFinding({
      id: 'robots-availability',
      title: 'robots.txt is available',
      category: 'technical',
      status: crawl.robots.exists ? 'PASS' : 'WARN',
      value: crawl.robots.url,
      details: crawl.robots.exists
        ? `robots.txt fetched successfully with status ${crawl.robots.status}.`
        : 'robots.txt could not be fetched successfully.',
      recommendation: crawl.robots.exists
        ? ''
        : 'Publish a valid robots.txt so crawlers can understand crawl rules and sitemap hints.',
    })
  );

  findings.push(
    createFinding({
      id: 'sitemap-availability',
      title: 'XML sitemap is discoverable',
      category: 'technical',
      status: crawl.sitemaps.fetched.some((entry) => entry.ok) ? 'PASS' : 'WARN',
      value: `${crawl.sitemaps.urls.length} URLs from ${crawl.sitemaps.fetched.length} sitemap fetches`,
      details: crawl.sitemaps.fetched.some((entry) => entry.ok)
        ? 'At least one sitemap file was fetched and parsed.'
        : 'No valid sitemap was discovered via robots.txt or /sitemap.xml.',
      recommendation: crawl.sitemaps.fetched.some((entry) => entry.ok)
        ? ''
        : 'Publish an XML sitemap and list it in robots.txt.',
    })
  );

  if (pages.length === 0) {
    findings.push(
      createFinding({
        id: 'crawl-coverage',
        title: 'At least one HTML page was crawled successfully',
        category: 'technical',
        status: 'FAIL',
        value: '0 crawled HTML pages',
        details: 'The crawler could not fetch any HTML pages from the provided entry URL.',
        recommendation:
          'Verify site reachability, DNS/TLS, bot blocking, or the supplied URL before trusting any page-level audit findings.',
      })
    );

    return findings;
  }

  findings.push(
    createFinding({
      id: 'crawl-errors',
      title: 'Crawled pages avoid 4xx/5xx responses',
      category: 'technical',
      status: brokenPages.length === 0 ? 'PASS' : 'FAIL',
      value: `${brokenPages.length} broken pages`,
      details:
        brokenPages.length === 0
          ? 'No crawled pages returned 4xx/5xx responses.'
          : `Broken responses found for: ${brokenPages.slice(0, 5).map((page) => page.finalUrl).join(', ')}`,
      recommendation:
        brokenPages.length === 0
          ? ''
          : 'Fix linked broken URLs or remove them from navigation, sitemaps, and internal links.',
      evidence: brokenPages.slice(0, 5).map((page) => page.finalUrl),
    })
  );

  findings.push(
    createFinding({
      id: 'redirect-hops',
      title: 'Redirect chains stay within two hops',
      category: 'technical',
      status: redirectChains.length === 0 ? 'PASS' : 'WARN',
      value: `${redirectChains.length} long redirect chains`,
      details:
        redirectChains.length === 0
          ? 'No crawled page exceeded a two-hop redirect chain.'
          : `Long redirect chains found for ${redirectChains.slice(0, 5).map((page) => page.url).join(', ')}.`,
      recommendation:
        redirectChains.length === 0
          ? ''
          : 'Collapse redirects so important URLs resolve directly to the canonical destination.',
    })
  );

  findings.push(
    createFinding({
      id: 'canonical-presence',
      title: 'Canonical tags are present on HTML pages',
      category: 'technical',
      status: canonicalMissing.length === 0 ? 'PASS' : 'WARN',
      value: `${canonicalMissing.length} pages without canonical`,
      details:
        canonicalMissing.length === 0
          ? 'All crawled HTML pages expose a canonical tag.'
          : `Canonical is missing on ${canonicalMissing.length} pages.`,
      recommendation:
        canonicalMissing.length === 0
          ? ''
          : 'Add self-referencing canonical tags on indexable pages and align alternate URLs to canonical targets.',
    })
  );

  findings.push(
    createFinding({
      id: 'canonical-conflicts',
      title: 'Canonical targets align with the final crawled URL',
      category: 'technical',
      status: canonicalConflict.length === 0 ? 'PASS' : 'WARN',
      value: `${canonicalConflict.length} pages canonicalize elsewhere`,
      details:
        canonicalConflict.length === 0
          ? 'No canonical/URL mismatches were detected on crawled pages.'
          : `Some pages canonicalize to a different URL: ${canonicalConflict
              .slice(0, 5)
              .map((page) => `${page.finalUrl} -> ${page.parsed.canonical}`)
              .join('; ')}`,
      recommendation:
        canonicalConflict.length === 0
          ? ''
          : 'Review whether cross-canonical targets are intentional and ensure they match crawl, internal linking, and sitemap signals.',
    })
  );

  findings.push(
    createFinding({
      id: 'robot-directives',
      title: 'Indexability directives are coherent',
      category: 'technical',
      status: noindexPages.length === 0 ? 'PASS' : 'WARN',
      value: `${noindexPages.length} crawled pages marked noindex`,
      details:
        noindexPages.length === 0
          ? 'No crawled page exposes a noindex directive.'
          : `Noindex directives detected on ${noindexPages.length} crawled pages.`,
      recommendation:
        noindexPages.length === 0
          ? ''
          : 'Confirm that noindex pages are intentional and do not conflict with canonicals or sitemap inclusion.',
    })
  );

  findings.push(
    createFinding({
      id: 'mixed-content',
      title: 'HTTPS pages avoid mixed content resources',
      category: 'technical',
      status: mixedContentPages.length === 0 ? 'PASS' : 'FAIL',
      value: `${mixedContentPages.length} pages with mixed content`,
      details:
        mixedContentPages.length === 0
          ? 'No mixed-content asset URLs were detected.'
          : `Mixed-content assets found on ${mixedContentPages.length} pages.`,
      recommendation:
        mixedContentPages.length === 0
          ? ''
          : 'Serve all images, scripts, fonts, and stylesheets over HTTPS.',
    })
  );

  findings.push(
    createFinding({
      id: 'robots-blocking',
      title: 'Important crawled pages are not blocked by robots rules',
      category: 'technical',
      status: blockedByRobots.length === 0 ? 'PASS' : 'WARN',
      value: `${blockedByRobots.length} crawled URLs blocked by robots rules`,
      details:
        blockedByRobots.length === 0
          ? 'No crawled page appears to be disallowed by the parsed robots.txt rules.'
          : `Some crawled URLs match Disallow rules: ${blockedByRobots.slice(0, 5).map((page) => page.finalUrl).join(', ')}`,
      recommendation:
        blockedByRobots.length === 0
          ? ''
          : 'Align robots.txt with the intended crawl/index strategy for important pages.',
    })
  );

  findings.push(
    createFinding({
      id: 'orphan-sitemap-urls',
      title: 'Sitemap URLs are internally discoverable',
      category: 'technical',
      status: orphanSitemapUrls.length === 0 ? 'PASS' : 'WARN',
      value: `${orphanSitemapUrls.length} sitemap URLs without discovered internal links`,
      details:
        orphanSitemapUrls.length === 0
          ? 'All sitemap URLs that were discovered are internally linked within the crawled scope.'
          : 'Some sitemap URLs were not found through internal linking in the crawled scope.',
      recommendation:
        orphanSitemapUrls.length === 0
          ? ''
          : 'Link important sitemap URLs from crawlable pages so both users and bots can discover them naturally.',
      evidence: orphanSitemapUrls.slice(0, 10),
    })
  );

  findings.push(
    createFinding({
      id: 'duplicate-titles',
      title: 'Title tags remain unique across crawled pages',
      category: 'technical',
      status: duplicates.title.length === 0 ? 'PASS' : 'WARN',
      value: `${duplicates.title.length} duplicate title groups`,
      details:
        duplicates.title.length === 0
          ? 'No duplicate title groups were found in the crawled sample.'
          : `Duplicate titles found, for example "${duplicates.title[0].value}" on ${duplicates.title[0].urls.length} pages.`,
      recommendation:
        duplicates.title.length === 0
          ? ''
          : 'Differentiate titles for pages with different search intent or canonicalize duplicates.',
    })
  );

  findings.push(
    createFinding({
      id: 'duplicate-descriptions',
      title: 'Meta descriptions remain unique across crawled pages',
      category: 'technical',
      status: duplicates.description.length === 0 ? 'PASS' : 'WARN',
      value: `${duplicates.description.length} duplicate description groups`,
      details:
        duplicates.description.length === 0
          ? 'No duplicate description groups were found in the crawled sample.'
          : `Duplicate descriptions found, for example "${duplicates.description[0].value}" on ${duplicates.description[0].urls.length} pages.`,
      recommendation:
        duplicates.description.length === 0
          ? ''
          : 'Rewrite duplicate descriptions so important landing pages have distinct snippets.',
    })
  );

  const avgTiming =
    pages.length > 0 ? Math.round(pages.reduce((sum, page) => sum + page.response.timingMs, 0) / pages.length) : 0;
  const largestHtml =
    pages.length > 0 ? Math.max(...pages.map((page) => page.html.length || 0)) : 0;

  findings.push(
    createFinding({
      id: 'response-time',
      title: 'Average HTML response time is within target',
      category: 'technical',
      status: avgTiming <= 500 ? 'PASS' : avgTiming <= 1000 ? 'WARN' : 'FAIL',
      value: `${avgTiming} ms`,
      details: `Average HTML fetch time across crawled pages is ${avgTiming} ms.`,
      recommendation:
        avgTiming <= 500
          ? ''
          : 'Optimize server response time, caching, and upstream dependencies for faster TTFB.',
    })
  );

  findings.push(
    createFinding({
      id: 'html-weight',
      title: 'HTML documents stay reasonably lean',
      category: 'technical',
      status: largestHtml <= 300000 ? 'PASS' : largestHtml <= 600000 ? 'WARN' : 'FAIL',
      value: formatBytes(largestHtml),
      details: `Largest crawled HTML payload is ${formatBytes(largestHtml)}.`,
      recommendation:
        largestHtml <= 300000
          ? ''
          : 'Reduce server-rendered bloat, excessive inline JSON, and repeated boilerplate in HTML output.',
    })
  );

  return findings;
}

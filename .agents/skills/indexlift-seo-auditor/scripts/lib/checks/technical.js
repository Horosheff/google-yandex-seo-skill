import { createFinding, formatBytes } from '../utils.js';

function coverageFinding(context) {
  return createFinding({
    id: 'page-fetch-coverage',
    title: 'The audited page was fetched successfully',
    category: 'technical',
    scope: 'page',
    status: 'FAIL',
    value: context.crawl.startUrl,
    details: 'The requested URL could not be fetched as an HTML page, so page-level diagnostics are unavailable.',
    recommendation:
      'Verify reachability, bot access, redirects, and the exact URL before trusting page-level SEO output.',
  });
}

export function buildTechnicalFindings(context) {
  const findings = [];
  const { crawl, page, pageSnapshot } = context;
  const robotsExists = crawl.robots.exists;
  const sitemapExists = crawl.sitemaps.fetched.some((entry) => entry.ok);

  findings.push(
    createFinding({
      id: 'https-enabled',
      title: 'The audited page uses HTTPS',
      category: 'technical',
      scope: 'page',
      status: crawl.startUrl.startsWith('https://') ? 'PASS' : 'FAIL',
      value: crawl.startUrl,
      details: crawl.startUrl.startsWith('https://')
        ? 'The requested page URL resolves over HTTPS.'
        : 'The requested page URL uses plain HTTP.',
      recommendation: crawl.startUrl.startsWith('https://')
        ? ''
        : 'Force HTTP to HTTPS redirects and keep the public page URL on HTTPS only.',
    })
  );

  findings.push(
    createFinding({
      id: 'robots-availability',
      title: 'robots.txt is available as crawl context',
      category: 'technical',
      scope: 'context',
      status: robotsExists ? 'PASS' : 'WARN',
      value: crawl.robots.url,
      details: robotsExists
        ? `robots.txt fetched successfully with status ${crawl.robots.status}.`
        : 'robots.txt could not be fetched successfully, so bot guidance is weaker than it should be.',
      recommendation: robotsExists ? '' : 'Publish a valid robots.txt so crawlers can understand crawl rules and sitemap hints.',
    })
  );

  findings.push(
    createFinding({
      id: 'sitemap-availability',
      title: 'XML sitemap is discoverable as site context',
      category: 'technical',
      scope: 'context',
      status: sitemapExists ? 'PASS' : 'WARN',
      value: `${crawl.sitemaps.urls.length} URLs from ${crawl.sitemaps.fetched.length} sitemap fetches`,
      details: sitemapExists
        ? 'At least one sitemap file was fetched and parsed.'
        : 'No valid sitemap was discovered via robots.txt or /sitemap.xml.',
      recommendation: sitemapExists ? '' : 'Publish an XML sitemap and list it in robots.txt.',
    })
  );

  if (!page || !page.parsed || !pageSnapshot) {
    findings.push(coverageFinding(context));
    return findings;
  }

  findings.push(
    createFinding({
      id: 'page-response-status',
      title: 'The audited page returns a successful status code',
      category: 'technical',
      scope: 'page',
      status: page.response.status >= 200 && page.response.status < 400 ? 'PASS' : 'FAIL',
      value: page.response.status,
      details:
        page.response.status >= 200 && page.response.status < 400
          ? `The audited page responded with status ${page.response.status}.`
          : `The audited page responded with status ${page.response.status}, which weakens crawlability and indexability.`,
      recommendation:
        page.response.status >= 200 && page.response.status < 400
          ? ''
          : 'Serve the target page with a stable 200 response or a single intentional redirect to the preferred URL.',
    })
  );

  findings.push(
    createFinding({
      id: 'redirect-hops',
      title: 'The audited page resolves without a long redirect chain',
      category: 'technical',
      scope: 'page',
      status: pageSnapshot.redirect_hops <= 1 ? 'PASS' : pageSnapshot.redirect_hops <= 2 ? 'WARN' : 'FAIL',
      value: `${pageSnapshot.redirect_hops} redirect hops`,
      details:
        pageSnapshot.redirect_hops <= 1
          ? 'The audited URL resolves directly or with a single clean redirect.'
          : `The audited URL reaches the final page after ${pageSnapshot.redirect_hops} hops.`,
      recommendation:
        pageSnapshot.redirect_hops <= 1 ? '' : 'Collapse redirects so the public page URL resolves as directly as possible.',
    })
  );

  findings.push(
    createFinding({
      id: 'canonical-presence',
      title: 'The audited page exposes a canonical tag',
      category: 'technical',
      scope: 'page',
      status: page.parsed.canonical ? 'PASS' : 'WARN',
      value: page.parsed.canonical || 'Missing',
      details: page.parsed.canonical
        ? 'A canonical link element is present on the audited page.'
        : 'The audited page does not expose a canonical tag.',
      recommendation:
        page.parsed.canonical ? '' : 'Add a self-referencing canonical tag unless this page is intentionally non-indexable.',
    })
  );

  findings.push(
    createFinding({
      id: 'canonical-conflicts',
      title: 'The audited page canonical matches the final URL',
      category: 'technical',
      scope: 'page',
      status: !page.parsed.canonical || page.parsed.canonical === page.finalUrl ? 'PASS' : 'WARN',
      value: page.parsed.canonical || 'Missing',
      details:
        !page.parsed.canonical || page.parsed.canonical === page.finalUrl
          ? 'The canonical signal does not conflict with the final fetched URL.'
          : `The audited page canonical points to ${page.parsed.canonical} instead of ${page.finalUrl}.`,
      recommendation:
        !page.parsed.canonical || page.parsed.canonical === page.finalUrl
          ? ''
          : 'Review whether the cross-canonical target is intentional and align it with redirects, internal links, and sitemaps.',
    })
  );

  const robotsValue = `${page.parsed.metaRobots || ''} ${page.parsed.xRobotsTag || ''}`.toLowerCase();
  findings.push(
    createFinding({
      id: 'robot-directives',
      title: 'The audited page has coherent indexability directives',
      category: 'technical',
      scope: 'page',
      status: robotsValue.includes('noindex') ? 'WARN' : 'PASS',
      value: (page.parsed.metaRobots || page.parsed.xRobotsTag || 'index,follow').trim(),
      details: robotsValue.includes('noindex')
        ? 'The audited page exposes a noindex directive.'
        : 'The audited page does not expose a noindex directive.',
      recommendation:
        robotsValue.includes('noindex')
          ? 'Confirm this page should stay out of the index and ensure canonicals and internal links support that intent.'
          : '',
    })
  );

  findings.push(
    createFinding({
      id: 'mixed-content',
      title: 'The audited page avoids mixed-content resources',
      category: 'technical',
      scope: 'page',
      status: page.parsed.mixedContentUrls.length === 0 ? 'PASS' : 'FAIL',
      value: `${page.parsed.mixedContentUrls.length} mixed-content resources`,
      details:
        page.parsed.mixedContentUrls.length === 0
          ? 'No HTTP resources were referenced from the audited page.'
          : 'The audited page references HTTP assets from an HTTPS context.',
      recommendation:
        page.parsed.mixedContentUrls.length === 0 ? '' : 'Serve all images, scripts, fonts, and stylesheets over HTTPS.',
      evidence: page.parsed.mixedContentUrls.slice(0, 10),
    })
  );

  findings.push(
    createFinding({
      id: 'robots-blocking',
      title: 'The audited page is not blocked by robots.txt rules',
      category: 'technical',
      scope: 'page',
      status: page.crawlableByRobots === false ? 'WARN' : 'PASS',
      value: page.crawlableByRobots === false ? 'Blocked' : 'Allowed',
      details:
        page.crawlableByRobots === false
          ? 'The audited URL matches parsed Disallow rules in robots.txt.'
          : 'The audited URL does not appear to be blocked by parsed robots rules.',
      recommendation:
        page.crawlableByRobots === false ? 'Align robots.txt with the intended crawl and index strategy for this page.' : '',
    })
  );

  findings.push(
    createFinding({
      id: 'html-lang',
      title: 'The audited page exposes an HTML lang attribute',
      category: 'technical',
      scope: 'page',
      status: page.parsed.lang ? 'PASS' : 'WARN',
      value: page.parsed.lang || 'Missing',
      details: page.parsed.lang
        ? 'The audited page exposes an HTML lang attribute.'
        : 'The audited page does not expose an HTML lang attribute.',
      recommendation: page.parsed.lang ? '' : 'Add a valid HTML lang attribute to clarify language targeting.',
    })
  );

  findings.push(
    createFinding({
      id: 'charset-declaration',
      title: 'The audited page exposes a charset declaration',
      category: 'technical',
      scope: 'page',
      status: page.parsed.charset ? 'PASS' : 'WARN',
      value: page.parsed.charset || 'Missing',
      details: page.parsed.charset
        ? 'The audited page exposes a charset declaration.'
        : 'The audited page does not expose a charset declaration in the parsed HTML.',
      recommendation: page.parsed.charset ? '' : 'Declare a charset such as UTF-8 in the HTML head.',
    })
  );

  findings.push(
    createFinding({
      id: 'response-time',
      title: 'The audited page responds within a practical time budget',
      category: 'technical',
      scope: 'page',
      status: page.response.timingMs <= 500 ? 'PASS' : page.response.timingMs <= 1000 ? 'WARN' : 'FAIL',
      value: `${page.response.timingMs} ms`,
      details: `The audited page HTML responded in ${page.response.timingMs} ms.`,
      recommendation:
        page.response.timingMs <= 500 ? '' : 'Optimize server response time, caching, and upstream dependencies for faster TTFB.',
    })
  );

  findings.push(
    createFinding({
      id: 'html-weight',
      title: 'The audited page HTML stays reasonably lean',
      category: 'technical',
      scope: 'page',
      status: page.html.length <= 300000 ? 'PASS' : page.html.length <= 600000 ? 'WARN' : 'FAIL',
      value: formatBytes(page.html.length),
      details: `The audited page HTML payload is ${formatBytes(page.html.length)}.`,
      recommendation:
        page.html.length <= 300000
          ? ''
          : 'Reduce server-rendered bloat, excessive inline JSON, and repeated boilerplate in HTML output.',
    })
  );

  return findings;
}

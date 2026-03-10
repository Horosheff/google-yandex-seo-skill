import { createFinding, formatBytes } from '../utils.js';

export function buildPerformanceFindings(context) {
  const pages = context.crawl.pages.filter((page) => page.parsed);
  if (pages.length === 0) {
    return [
      createFinding({
        id: 'performance-coverage',
        title: 'Performance analysis requires at least one fetched HTML page',
        category: 'performance',
        status: 'N/A',
        value: '0 crawled HTML pages',
        details: 'No HTML pages were fetched, so lightweight performance signals could not be calculated.',
        recommendation: 'Restore crawl access or audit a reachable URL to enable page-level performance checks.',
      }),
      createFinding({
        id: 'cwv-adapter',
        title: 'Core Web Vitals adapter is configured',
        category: 'performance',
        status: 'N/A',
        value: 'No PageSpeed/Lighthouse API integration configured',
        details: 'This build reports lightweight HTML/resource signals only unless an external performance adapter is added.',
        recommendation:
          'Connect a PageSpeed Insights or Lighthouse adapter to measure LCP, CLS, INP, and field/lab CWV data.',
      }),
    ];
  }
  const avgTiming =
    pages.length > 0 ? Math.round(pages.reduce((sum, page) => sum + page.response.timingMs, 0) / pages.length) : 0;
  const averageHtmlBytes =
    pages.length > 0 ? Math.round(pages.reduce((sum, page) => sum + (page.html.length || 0), 0) / pages.length) : 0;
  const averageRequestCount =
    pages.length > 0
      ? Math.round(
          pages.reduce(
            (sum, page) =>
              sum + page.parsed.images.length + page.parsed.scripts.length + page.parsed.stylesheets.length,
            0
          ) / pages.length
        )
      : 0;
  const heavyPages = pages.filter((page) => page.html.length > 500000);
  const scriptHeavyPages = pages.filter((page) => page.parsed.scripts.length > 15);

  return [
    createFinding({
      id: 'avg-load-time',
      title: 'Average HTML response time is below 3 seconds',
      category: 'performance',
      status: avgTiming <= 1000 ? 'PASS' : avgTiming <= 3000 ? 'WARN' : 'FAIL',
      value: `${avgTiming} ms`,
      details: `Average HTML fetch time across crawled pages is ${avgTiming} ms.`,
      recommendation:
        avgTiming <= 1000 ? '' : 'Improve backend latency, caching, and edge delivery for faster responses.',
    }),
    createFinding({
      id: 'avg-html-weight',
      title: 'Average HTML payload remains under 300 KB',
      category: 'performance',
      status: averageHtmlBytes <= 300000 ? 'PASS' : averageHtmlBytes <= 600000 ? 'WARN' : 'FAIL',
      value: formatBytes(averageHtmlBytes),
      details: `Average HTML size across crawled pages is ${formatBytes(averageHtmlBytes)}.`,
      recommendation:
        averageHtmlBytes <= 300000
          ? ''
          : 'Reduce HTML payload size by trimming repeated markup and oversized inline data.',
    }),
    createFinding({
      id: 'resource-request-count',
      title: 'Pages keep initial resource request counts reasonable',
      category: 'performance',
      status: averageRequestCount <= 50 ? 'PASS' : averageRequestCount <= 80 ? 'WARN' : 'FAIL',
      value: `${averageRequestCount} asset references per page on average`,
      details: `Average number of images, scripts, and stylesheets per crawled page is ${averageRequestCount}.`,
      recommendation:
        averageRequestCount <= 50
          ? ''
          : 'Reduce above-the-fold asset count and defer non-critical scripts and images.',
    }),
    createFinding({
      id: 'heavy-html-pages',
      title: 'No extremely heavy HTML pages are present',
      category: 'performance',
      status: heavyPages.length === 0 ? 'PASS' : 'WARN',
      value: `${heavyPages.length} pages over 500 KB of HTML`,
      details:
        heavyPages.length === 0
          ? 'No crawled page exceeded 500 KB of raw HTML.'
          : 'Some pages ship unusually heavy HTML responses.',
      recommendation:
        heavyPages.length === 0
          ? ''
          : 'Audit templates with oversized HTML and move non-critical data out of the initial response.',
    }),
    createFinding({
      id: 'js-pressure',
      title: 'Pages avoid excessive script pressure',
      category: 'performance',
      status: scriptHeavyPages.length === 0 ? 'PASS' : 'WARN',
      value: `${scriptHeavyPages.length} pages with more than 15 script tags`,
      details:
        scriptHeavyPages.length === 0
          ? 'No script-heavy pages were detected in the crawled sample.'
          : 'Some pages rely on a high number of scripts, which can increase execution cost.',
      recommendation:
        scriptHeavyPages.length === 0 ? '' : 'Remove unused third-party scripts and defer non-critical JavaScript.',
    }),
    createFinding({
      id: 'cwv-adapter',
      title: 'Core Web Vitals adapter is configured',
      category: 'performance',
      status: 'N/A',
      value: 'No PageSpeed/Lighthouse API integration configured',
      details: 'This build reports lightweight HTML/resource signals only unless an external performance adapter is added.',
      recommendation:
        'Connect a PageSpeed Insights or Lighthouse adapter to measure LCP, CLS, INP, and field/lab CWV data.',
    }),
  ];
}

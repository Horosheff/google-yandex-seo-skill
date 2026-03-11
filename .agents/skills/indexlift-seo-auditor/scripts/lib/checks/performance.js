import { createFinding, formatBytes } from '../utils.js';

export function buildPerformanceFindings(context) {
  const { page, pageSnapshot } = context;
  if (!page || !page.parsed || !pageSnapshot) {
    return [
      createFinding({
        id: 'performance-coverage',
        title: 'Performance analysis requires a fetched HTML page',
        category: 'performance',
        status: 'N/A',
        value: 'No fetched HTML page',
        details: 'No HTML page was fetched, so lightweight performance signals could not be calculated.',
        recommendation: 'Restore crawl access or audit a reachable URL to enable page-level performance checks.',
      }),
      createFinding({
        id: 'cwv-adapter',
        title: 'Built-in free audit does not measure Core Web Vitals directly',
        category: 'performance',
        status: 'N/A',
        value: 'HTML and resource signals only',
        details: 'This free local build reports built-in HTML and resource signals only.',
        recommendation: 'Use the built-in HTML/resource findings here and treat CWV as outside the current free local scope.',
      }),
    ];
  }
  const responseTime = page.response.timingMs;
  const htmlBytes = page.html.length;
  const requestCount = pageSnapshot.resources.total;
  const scriptCount = pageSnapshot.resources.scripts;
  const imageCount = pageSnapshot.images.total;
  const inlineScriptBytes = pageSnapshot.resources.inline_script_bytes;
  const inlineStyleBytes = pageSnapshot.resources.inline_style_bytes;
  const missingImageDimensions = pageSnapshot.images.missing_dimensions;

  return [
    createFinding({
      id: 'page-load-time',
      title: 'The audited page HTML response time stays below 3 seconds',
      category: 'performance',
      scope: 'page',
      status: responseTime <= 1000 ? 'PASS' : responseTime <= 3000 ? 'WARN' : 'FAIL',
      value: `${responseTime} ms`,
      details: `The audited page HTML fetch time is ${responseTime} ms.`,
      recommendation:
        responseTime <= 1000 ? '' : 'Improve backend latency, caching, and edge delivery for faster responses.',
    }),
    createFinding({
      id: 'page-html-weight',
      title: 'The audited page HTML payload remains under 300 KB',
      category: 'performance',
      scope: 'page',
      status: htmlBytes <= 300000 ? 'PASS' : htmlBytes <= 600000 ? 'WARN' : 'FAIL',
      value: formatBytes(htmlBytes),
      details: `The audited page HTML size is ${formatBytes(htmlBytes)}.`,
      recommendation:
        htmlBytes <= 300000
          ? ''
          : 'Reduce HTML payload size by trimming repeated markup and oversized inline data.',
    }),
    createFinding({
      id: 'resource-request-count',
      title: 'The audited page keeps initial asset references reasonable',
      category: 'performance',
      scope: 'page',
      status: requestCount <= 50 ? 'PASS' : requestCount <= 80 ? 'WARN' : 'FAIL',
      value: `${requestCount} asset references`,
      details: `The audited page references ${requestCount} images, scripts, and stylesheets in the parsed HTML.`,
      recommendation:
        requestCount <= 50
          ? ''
          : 'Reduce above-the-fold asset count and defer non-critical scripts and images.',
    }),
    createFinding({
      id: 'heavy-html-page',
      title: 'The audited page avoids extremely heavy HTML',
      category: 'performance',
      scope: 'page',
      status: htmlBytes <= 500000 ? 'PASS' : 'WARN',
      value: formatBytes(htmlBytes),
      details:
        htmlBytes <= 500000
          ? 'The audited page does not exceed the heavy-page HTML threshold.'
          : 'The audited page ships unusually heavy HTML.',
      recommendation:
        htmlBytes <= 500000
          ? ''
          : 'Audit templates with oversized HTML and move non-critical data out of the initial response.',
    }),
    createFinding({
      id: 'js-pressure',
      title: 'The audited page avoids excessive script pressure',
      category: 'performance',
      scope: 'page',
      status: scriptCount <= 15 ? 'PASS' : 'WARN',
      value: `${scriptCount} script tags`,
      details:
        scriptCount <= 15
          ? 'The audited page does not appear script-heavy based on parsed HTML.'
          : 'The audited page relies on a high number of scripts, which can increase execution cost.',
      recommendation:
        scriptCount <= 15 ? '' : 'Remove unused third-party scripts and defer non-critical JavaScript.',
    }),
    createFinding({
      id: 'inline-script-bloat',
      title: 'The audited page avoids excessive inline JavaScript bloat',
      category: 'performance',
      scope: 'page',
      status: inlineScriptBytes <= 50000 ? 'PASS' : inlineScriptBytes <= 150000 ? 'WARN' : 'FAIL',
      value: formatBytes(inlineScriptBytes),
      details:
        inlineScriptBytes <= 50000
          ? 'Inline JavaScript size stays within a practical range.'
          : 'The audited page carries a large amount of inline JavaScript, which can inflate HTML weight and execution cost.',
      recommendation:
        inlineScriptBytes <= 50000
          ? ''
          : 'Move non-critical inline JavaScript out of the HTML response and trim unused script payloads.',
    }),
    createFinding({
      id: 'inline-style-bloat',
      title: 'The audited page avoids excessive inline style bloat',
      category: 'performance',
      scope: 'page',
      status: inlineStyleBytes <= 30000 ? 'PASS' : inlineStyleBytes <= 100000 ? 'WARN' : 'FAIL',
      value: formatBytes(inlineStyleBytes),
      details:
        inlineStyleBytes <= 30000
          ? 'Inline style size stays within a practical range.'
          : 'The audited page carries a large amount of inline style content inside the HTML.',
      recommendation:
        inlineStyleBytes <= 30000
          ? ''
          : 'Reduce inline style payloads and move repeated style rules into cacheable stylesheets where possible.',
    }),
    createFinding({
      id: 'image-pressure',
      title: 'The audited page avoids excessive image pressure',
      category: 'performance',
      scope: 'page',
      status: imageCount <= 25 ? 'PASS' : imageCount <= 50 ? 'WARN' : 'FAIL',
      value: `${imageCount} images`,
      details:
        imageCount <= 25
          ? 'The audited page image count is within a practical range.'
          : 'The audited page carries a high number of images, which can increase transfer and rendering cost.',
      recommendation:
        imageCount <= 25 ? '' : 'Reduce non-critical images above the fold and compress or lazy load the rest.',
    }),
    createFinding({
      id: 'image-dimension-performance',
      title: 'The audited page images declare dimensions to reduce layout instability',
      category: 'performance',
      scope: 'page',
      status: imageCount === 0 || missingImageDimensions === 0 ? 'PASS' : 'WARN',
      value: `${missingImageDimensions}/${imageCount} images missing dimensions`,
      details:
        imageCount === 0
          ? 'The audited page does not contain images.'
          : missingImageDimensions === 0
            ? 'All audited-page images expose width and height attributes.'
            : 'Some images are missing width and height, which can contribute to unstable rendering and slower visual stabilization.',
      recommendation:
        imageCount === 0 || missingImageDimensions === 0
          ? ''
          : 'Declare width and height on important images so browsers can reserve layout space earlier.',
    }),
    createFinding({
      id: 'cwv-adapter',
      title: 'Built-in free audit does not measure Core Web Vitals directly',
      category: 'performance',
      scope: 'context',
      status: 'N/A',
      value: 'HTML and resource signals only',
      details: 'This free local build reports built-in HTML and resource signals only.',
      recommendation: 'Use the built-in HTML/resource findings here and treat CWV as outside the current free local scope.',
    }),
  ];
}

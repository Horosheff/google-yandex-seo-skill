import { createFinding } from '../utils.js';

function countPages(pages, predicate) {
  return pages.filter(predicate);
}

function hasHeadingSkip(parsed) {
  const present = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']
    .filter((level) => (parsed.headings[level] || []).length > 0)
    .map((level) => Number(level.slice(1)));

  for (let index = 1; index < present.length; index += 1) {
    if (present[index] - present[index - 1] > 1) {
      return true;
    }
  }

  return false;
}

export function buildOnPageFindings(context) {
  const findings = [];
  const pages = context.crawl.pages.filter((page) => page.parsed);
  if (pages.length === 0) {
    return [
      createFinding({
        id: 'on-page-coverage',
        title: 'On-page analysis requires at least one fetched HTML page',
        category: 'on_page',
        status: 'N/A',
        value: '0 crawled HTML pages',
        details: 'No HTML pages were available for title, heading, image, and content analysis.',
        recommendation: 'Restore crawl access or audit a reachable URL to enable on-page checks.',
      }),
    ];
  }
  const missingTitles = countPages(pages, (page) => !page.parsed.title);
  const titleLengthIssues = countPages(
    pages,
    (page) => page.parsed.title && (page.parsed.title.length < 30 || page.parsed.title.length > 65)
  );
  const missingDescriptions = countPages(pages, (page) => !page.parsed.description);
  const descriptionLengthIssues = countPages(
    pages,
    (page) =>
      page.parsed.description && (page.parsed.description.length < 70 || page.parsed.description.length > 170)
  );
  const invalidH1 = countPages(pages, (page) => (page.parsed.headings.h1 || []).length !== 1);
  const headingSkips = countPages(pages, (page) => hasHeadingSkip(page.parsed));
  const thinPages = countPages(pages, (page) => page.parsed.wordCount < 150);
  const missingAlt = countPages(
    pages,
    (page) => page.parsed.images.length > 0 && page.parsed.images.some((image) => !image.alt)
  );
  const noLazyLoading = countPages(
    pages,
    (page) => page.parsed.images.length > 2 && !page.parsed.images.some((image) => image.loading === 'lazy')
  );
  const weakInternalAnchors = countPages(
    pages,
    (page) =>
      page.parsed.links.filter((link) => link.href && new URL(link.href).origin === new URL(page.finalUrl).origin)
        .filter((link) => !link.text || link.text.length < 2).length > 0
  );

  findings.push(
    createFinding({
      id: 'title-presence',
      title: 'Pages expose title tags',
      category: 'on_page',
      status: missingTitles.length === 0 ? 'PASS' : 'FAIL',
      value: `${missingTitles.length} pages without title`,
      details:
        missingTitles.length === 0
          ? 'All crawled HTML pages have a title tag.'
          : 'Some crawled pages are missing a title tag entirely.',
      recommendation: missingTitles.length === 0 ? '' : 'Add a descriptive, unique title tag to every indexable page.',
    })
  );

  findings.push(
    createFinding({
      id: 'title-length',
      title: 'Title lengths stay in a practical search-snippet range',
      category: 'on_page',
      status: titleLengthIssues.length === 0 ? 'PASS' : 'WARN',
      value: `${titleLengthIssues.length} pages outside the 30-65 character range`,
      details:
        titleLengthIssues.length === 0
          ? 'No severe title length issues were found in the crawled sample.'
          : 'Several titles are likely too short or too long for strong snippet control.',
      recommendation:
        titleLengthIssues.length === 0
          ? ''
          : 'Keep titles specific and usually within roughly 30-65 characters while prioritizing intent clarity.',
    })
  );

  findings.push(
    createFinding({
      id: 'description-presence',
      title: 'Pages expose meta descriptions',
      category: 'on_page',
      status: missingDescriptions.length === 0 ? 'PASS' : 'WARN',
      value: `${missingDescriptions.length} pages without description`,
      details:
        missingDescriptions.length === 0
          ? 'All crawled HTML pages expose a meta description.'
          : 'Some crawled pages are missing a meta description.',
      recommendation:
        missingDescriptions.length === 0
          ? ''
          : 'Add concise, intent-matching descriptions for high-value landing pages.',
    })
  );

  findings.push(
    createFinding({
      id: 'description-length',
      title: 'Meta description lengths are useful for snippets',
      category: 'on_page',
      status: descriptionLengthIssues.length === 0 ? 'PASS' : 'WARN',
      value: `${descriptionLengthIssues.length} pages outside the 70-170 character range`,
      details:
        descriptionLengthIssues.length === 0
          ? 'No major description length issues were detected.'
          : 'Some descriptions look too short or too long to control snippets effectively.',
      recommendation:
        descriptionLengthIssues.length === 0
          ? ''
          : 'Rewrite outlier descriptions so they summarize page value without excessive truncation.',
    })
  );

  findings.push(
    createFinding({
      id: 'h1-usage',
      title: 'Each page has a single clear H1',
      category: 'on_page',
      status: invalidH1.length === 0 ? 'PASS' : 'WARN',
      value: `${invalidH1.length} pages without exactly one H1`,
      details:
        invalidH1.length === 0
          ? 'Every crawled page contains exactly one H1.'
          : 'Some crawled pages have no H1 or multiple H1 tags.',
      recommendation:
        invalidH1.length === 0 ? '' : 'Use a single primary H1 that clearly matches the page topic and search intent.',
    })
  );

  findings.push(
    createFinding({
      id: 'heading-hierarchy',
      title: 'Heading hierarchy is logically nested',
      category: 'on_page',
      status: headingSkips.length === 0 ? 'PASS' : 'WARN',
      value: `${headingSkips.length} pages with heading-level skips`,
      details:
        headingSkips.length === 0
          ? 'No significant heading-level skips were detected.'
          : 'Some pages jump between heading levels, which weakens document structure.',
      recommendation:
        headingSkips.length === 0 ? '' : 'Use headings in sequence so document sections remain easy to interpret.',
    })
  );

  findings.push(
    createFinding({
      id: 'thin-content',
      title: 'Pages contain enough visible copy to express topical depth',
      category: 'on_page',
      status: thinPages.length === 0 ? 'PASS' : 'WARN',
      value: `${thinPages.length} pages under 150 visible words`,
      details:
        thinPages.length === 0
          ? 'No thin-content pages were found in the crawled sample.'
          : 'Several pages provide very little visible copy, which may limit topical clarity.',
      recommendation:
        thinPages.length === 0
          ? ''
          : 'Expand pages with thin copy so they answer the user intent more completely.',
    })
  );

  findings.push(
    createFinding({
      id: 'image-alt',
      title: 'Images use descriptive alt text',
      category: 'on_page',
      status: missingAlt.length === 0 ? 'PASS' : 'WARN',
      value: `${missingAlt.length} pages with missing image alt text`,
      details:
        missingAlt.length === 0
          ? 'No missing alt-text issues were found on crawled pages with images.'
          : 'Some pages contain images without descriptive alt text.',
      recommendation:
        missingAlt.length === 0
          ? ''
          : 'Add meaningful alt text to informative images and keep decorative images intentionally empty.',
    })
  );

  findings.push(
    createFinding({
      id: 'image-lazy-loading',
      title: 'Non-critical images use lazy loading',
      category: 'on_page',
      status: noLazyLoading.length === 0 ? 'PASS' : 'WARN',
      value: `${noLazyLoading.length} image-heavy pages without lazy loading`,
      details:
        noLazyLoading.length === 0
          ? 'Image-heavy pages already use lazy loading or do not require it.'
          : 'Some image-heavy pages do not appear to lazy load below-the-fold images.',
      recommendation:
        noLazyLoading.length === 0 ? '' : 'Lazy load non-critical images to reduce initial page cost.',
    })
  );

  findings.push(
    createFinding({
      id: 'internal-anchor-text',
      title: 'Internal links use descriptive anchor text',
      category: 'on_page',
      status: weakInternalAnchors.length === 0 ? 'PASS' : 'WARN',
      value: `${weakInternalAnchors.length} pages with weak internal anchor text`,
      details:
        weakInternalAnchors.length === 0
          ? 'No obvious empty internal anchors were found.'
          : 'Some pages contain internal links with weak or empty anchor text.',
      recommendation:
        weakInternalAnchors.length === 0
          ? ''
          : 'Use descriptive internal anchors that reflect destination intent rather than generic labels.',
    })
  );

  findings.push(
    createFinding({
      id: 'social-meta',
      title: 'Pages provide social snippet metadata',
      category: 'on_page',
      status: pages.every((page) => page.parsed.structuredData.hasOpenGraph && page.parsed.structuredData.hasTwitterCard)
        ? 'PASS'
        : 'WARN',
      value: `${pages.filter((page) => !page.parsed.structuredData.hasOpenGraph || !page.parsed.structuredData.hasTwitterCard).length} pages missing OG/Twitter coverage`,
      details:
        pages.every((page) => page.parsed.structuredData.hasOpenGraph && page.parsed.structuredData.hasTwitterCard)
          ? 'Open Graph and Twitter Card coverage is present across the crawled sample.'
          : 'Some pages are missing Open Graph or Twitter Card metadata.',
      recommendation:
        pages.every((page) => page.parsed.structuredData.hasOpenGraph && page.parsed.structuredData.hasTwitterCard)
          ? ''
          : 'Add consistent social metadata to improve link previews across messengers and social platforms.',
    })
  );

  findings.push(
    createFinding({
      id: 'favicon',
      title: 'Pages expose a favicon',
      category: 'on_page',
      status: pages.every((page) => page.parsed.favicon) ? 'PASS' : 'WARN',
      value: `${pages.filter((page) => !page.parsed.favicon).length} pages without favicon reference`,
      details:
        pages.every((page) => page.parsed.favicon)
          ? 'All crawled pages expose a favicon reference.'
          : 'Some pages do not expose a favicon link tag.',
      recommendation: pages.every((page) => page.parsed.favicon) ? '' : 'Expose a favicon consistently across templates.',
    })
  );

  return findings;
}

import { createFinding } from '../utils.js';

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
  const { page, pageSnapshot } = context;
  if (!page || !page.parsed || !pageSnapshot) {
    return [
      createFinding({
        id: 'on-page-coverage',
        title: 'On-page analysis requires a fetched HTML page',
        category: 'on_page',
        status: 'N/A',
        value: 'No fetched HTML page',
        details: 'No HTML page was available for title, heading, image, and content analysis.',
        recommendation: 'Restore crawl access or audit a reachable URL to enable on-page checks.',
      }),
    ];
  }

  const findings = [];
  const titleLength = page.parsed.title.length;
  const descriptionLength = page.parsed.description.length;
  const h1Count = pageSnapshot.headings.counts.h1 || 0;
  const hasHeadingGap = hasHeadingSkip(page.parsed);
  const wordCount = page.parsed.wordCount;
  const imageCount = page.parsed.images.length;
  const missingAltCount = pageSnapshot.images.missing_alt;
  const lazyLoadedCount = pageSnapshot.images.lazy_loaded;
  const internalLinks = pageSnapshot.links.internal;
  const weakInternalAnchors = pageSnapshot.links.weak_internal_anchor_text;
  const genericAnchors = pageSnapshot.links.generic_anchor_text;
  const hasOpenGraph = page.parsed.structuredData.hasOpenGraph;
  const hasTwitterCard = page.parsed.structuredData.hasTwitterCard;
  const titleH1Overlap = pageSnapshot.semantics.title_h1_overlap;
  const titleDescriptionOverlap = pageSnapshot.semantics.title_description_overlap;
  const mainContentRatio = pageSnapshot.semantics.main_content_ratio;
  const missingImageDimensions = pageSnapshot.images.missing_dimensions;
  const commercialIntent = pageSnapshot.business_signals.commercial_or_local_intent;
  const hasReachableContact =
    pageSnapshot.business_signals.phone_count > 0 ||
    pageSnapshot.business_signals.email_count > 0 ||
    pageSnapshot.business_signals.tel_links > 0 ||
    pageSnapshot.business_signals.mailto_links > 0;

  findings.push(
    createFinding({
      id: 'title-presence',
      title: 'The audited page exposes a title tag',
      category: 'on_page',
      scope: 'page',
      status: page.parsed.title ? 'PASS' : 'FAIL',
      value: page.parsed.title || 'Missing',
      details: page.parsed.title
        ? 'The audited page includes a title tag.'
        : 'The audited page is missing a title tag entirely.',
      recommendation: page.parsed.title ? '' : 'Add a descriptive, intent-matching title tag to the audited page.',
    })
  );

  findings.push(
    createFinding({
      id: 'title-length',
      title: 'The audited page title length stays in a practical snippet range',
      category: 'on_page',
      scope: 'page',
      status: !page.parsed.title ? 'N/A' : titleLength >= 30 && titleLength <= 65 ? 'PASS' : 'WARN',
      value: page.parsed.title ? `${titleLength} chars` : 'Missing title',
      details: !page.parsed.title
        ? 'No title tag is available to score for snippet length.'
        : titleLength >= 30 && titleLength <= 65
          ? 'The title length is in a practical range for snippet control.'
          : 'The title looks shorter or longer than the typical practical range for search snippets.',
      recommendation:
        !page.parsed.title || (titleLength >= 30 && titleLength <= 65)
          ? ''
          : 'Keep the title specific and usually within roughly 30-65 characters while prioritizing intent clarity.',
    })
  );

  findings.push(
    createFinding({
      id: 'title-h1-alignment',
      title: 'The audited page title and primary H1 describe the same topic',
      category: 'on_page',
      scope: 'page',
      status: h1Count !== 1 || !page.parsed.title ? 'N/A' : titleH1Overlap >= 0.3 ? 'PASS' : 'WARN',
      value: `${Math.round(titleH1Overlap * 100)}% overlap`,
      details:
        h1Count !== 1 || !page.parsed.title
          ? 'A clean title-to-H1 comparison requires one H1 and a title tag.'
          : titleH1Overlap >= 0.3
            ? 'The title and primary H1 appear semantically aligned.'
            : 'The title and primary H1 look weakly aligned, which can blur topic focus.',
      recommendation:
        h1Count !== 1 || !page.parsed.title || titleH1Overlap >= 0.3
          ? ''
          : 'Align the title and main H1 around the same primary topic and search intent.',
    })
  );

  findings.push(
    createFinding({
      id: 'description-presence',
      title: 'The audited page exposes a meta description',
      category: 'on_page',
      scope: 'page',
      status: page.parsed.description ? 'PASS' : 'WARN',
      value: page.parsed.description || 'Missing',
      details: page.parsed.description
        ? 'The audited page includes a meta description.'
        : 'The audited page does not expose a meta description.',
      recommendation:
        page.parsed.description ? '' : 'Add a concise, intent-matching description that summarizes page value clearly.',
    })
  );

  findings.push(
    createFinding({
      id: 'description-length',
      title: 'The audited page description length is useful for snippets',
      category: 'on_page',
      scope: 'page',
      status:
        !page.parsed.description ? 'N/A' : descriptionLength >= 70 && descriptionLength <= 170 ? 'PASS' : 'WARN',
      value: page.parsed.description ? `${descriptionLength} chars` : 'Missing description',
      details: !page.parsed.description
        ? 'No description is available to score for snippet length.'
        : descriptionLength >= 70 && descriptionLength <= 170
          ? 'The description length is in a practical range for search snippets.'
          : 'The description looks too short or too long to control snippets effectively.',
      recommendation:
        !page.parsed.description || (descriptionLength >= 70 && descriptionLength <= 170)
          ? ''
          : 'Rewrite the description so it summarizes page value without excessive truncation.',
    })
  );

  findings.push(
    createFinding({
      id: 'title-description-alignment',
      title: 'The audited page title and meta description support the same intent',
      category: 'on_page',
      scope: 'page',
      status: !page.parsed.title || !page.parsed.description ? 'N/A' : titleDescriptionOverlap >= 0.15 ? 'PASS' : 'WARN',
      value: `${Math.round(titleDescriptionOverlap * 100)}% overlap`,
      details:
        !page.parsed.title || !page.parsed.description
          ? 'A title and description are both required to compare search-intent alignment.'
          : titleDescriptionOverlap >= 0.15
            ? 'The title and description appear aligned around the same page topic.'
            : 'The title and description look weakly aligned, which can reduce snippet clarity.',
      recommendation:
        !page.parsed.title || !page.parsed.description || titleDescriptionOverlap >= 0.15
          ? ''
          : 'Rewrite the title and description so they reinforce the same topic, promise, and search intent.',
    })
  );

  findings.push(
    createFinding({
      id: 'h1-usage',
      title: 'The audited page has a single clear H1',
      category: 'on_page',
      scope: 'page',
      status: h1Count === 1 ? 'PASS' : 'WARN',
      value: `${h1Count} H1 tags`,
      details:
        h1Count === 1 ? 'The audited page contains exactly one H1.' : 'The audited page has no H1 or multiple H1 tags.',
      recommendation: h1Count === 1 ? '' : 'Use a single primary H1 that clearly matches the page topic and search intent.',
    })
  );

  findings.push(
    createFinding({
      id: 'heading-hierarchy',
      title: 'The audited page heading hierarchy is logically nested',
      category: 'on_page',
      scope: 'page',
      status: hasHeadingGap ? 'WARN' : 'PASS',
      value: JSON.stringify(pageSnapshot.headings.counts),
      details: hasHeadingGap
        ? 'The audited page jumps between heading levels, which weakens document structure.'
        : 'No significant heading-level skips were detected on the audited page.',
      recommendation: hasHeadingGap ? 'Use headings in sequence so document sections remain easy to interpret.' : '',
    })
  );

  findings.push(
    createFinding({
      id: 'thin-content',
      title: 'The audited page contains enough visible copy to express topical depth',
      category: 'on_page',
      scope: 'page',
      status: wordCount >= 150 ? 'PASS' : 'WARN',
      value: `${wordCount} words`,
      details: wordCount >= 150
        ? 'The audited page has enough visible copy for basic topical clarity.'
        : 'The audited page provides very little visible copy, which may limit topical clarity.',
      recommendation: wordCount >= 150 ? '' : 'Expand the page copy so it answers the target intent more completely.',
    })
  );

  findings.push(
    createFinding({
      id: 'main-content-ratio',
      title: 'The audited page has a healthy main-content-to-template ratio',
      category: 'on_page',
      scope: 'page',
      status: mainContentRatio >= 0.35 ? 'PASS' : mainContentRatio >= 0.2 ? 'WARN' : 'FAIL',
      value: `${Math.round(mainContentRatio * 100)}% main content ratio`,
      details:
        mainContentRatio >= 0.35
          ? 'A substantial share of visible page text appears to belong to the main content area.'
          : 'A large share of visible page text appears to come from template or surrounding boilerplate.',
      recommendation:
        mainContentRatio >= 0.35
          ? ''
          : 'Strengthen the main content block and reduce repetitive template text around the core page topic.',
    })
  );

  findings.push(
    createFinding({
      id: 'image-alt',
      title: 'The audited page images use descriptive alt text',
      category: 'on_page',
      scope: 'page',
      status: imageCount === 0 || missingAltCount === 0 ? 'PASS' : 'WARN',
      value: `${missingAltCount}/${imageCount} images missing alt text`,
      details: imageCount === 0
        ? 'The audited page does not contain images.'
        : missingAltCount === 0
          ? 'All audited-page images expose alt text.'
          : 'Some audited-page images are missing descriptive alt text.',
      recommendation:
        imageCount === 0 || missingAltCount === 0
          ? ''
          : 'Add meaningful alt text to informative images and keep decorative images intentionally empty.',
    })
  );

  findings.push(
    createFinding({
      id: 'image-lazy-loading',
      title: 'The audited page uses lazy loading for non-critical images',
      category: 'on_page',
      scope: 'page',
      status: imageCount <= 2 || lazyLoadedCount > 0 ? 'PASS' : 'WARN',
      value: `${lazyLoadedCount}/${imageCount} images lazy-loaded`,
      details: imageCount <= 2
        ? 'The page is not image-heavy enough for lazy loading to be critical.'
        : lazyLoadedCount > 0
          ? 'The audited page already lazy loads at least some images.'
          : 'The audited page appears image-heavy but does not expose lazy loading.',
      recommendation:
        imageCount <= 2 || lazyLoadedCount > 0 ? '' : 'Lazy load non-critical images to reduce initial page cost.',
    })
  );

  findings.push(
    createFinding({
      id: 'internal-anchor-text',
      title: 'The audited page internal links use descriptive anchor text',
      category: 'on_page',
      scope: 'page',
      status: weakInternalAnchors === 0 ? 'PASS' : 'WARN',
      value: `${weakInternalAnchors}/${internalLinks} weak internal anchors`,
      details: internalLinks === 0
        ? 'The audited page does not expose internal links in the parsed HTML.'
        : weakInternalAnchors === 0
          ? 'No obvious weak internal anchor text was found.'
          : 'Some internal links use weak or empty anchor text.',
      recommendation:
        weakInternalAnchors === 0
          ? ''
          : 'Use descriptive internal anchors that reflect destination intent rather than generic labels.',
    })
  );

  findings.push(
    createFinding({
      id: 'generic-anchor-text',
      title: 'The audited page avoids generic anchor text',
      category: 'on_page',
      scope: 'page',
      status: genericAnchors === 0 ? 'PASS' : 'WARN',
      value: `${genericAnchors} generic anchors`,
      details:
        genericAnchors === 0
          ? 'No generic anchors like "read more" or "подробнее" were detected in the parsed link sample.'
          : 'Some links use generic anchors that weaken semantic clarity for users and search engines.',
      recommendation:
        genericAnchors === 0
          ? ''
          : 'Replace generic anchors with destination-specific phrases that describe the next page more clearly.',
      evidence: pageSnapshot.links.generic_anchor_samples,
    })
  );

  findings.push(
    createFinding({
      id: 'image-dimensions',
      title: 'The audited page images declare width and height where possible',
      category: 'on_page',
      scope: 'page',
      status: imageCount === 0 || missingImageDimensions === 0 ? 'PASS' : 'WARN',
      value: `${missingImageDimensions}/${imageCount} images missing dimensions`,
      details:
        imageCount === 0
          ? 'The audited page does not contain images.'
          : missingImageDimensions === 0
            ? 'All audited-page images expose width and height attributes.'
            : 'Some images are missing width and height, which can contribute to unstable layout and weaker rendering hints.',
      recommendation:
        imageCount === 0 || missingImageDimensions === 0
          ? ''
          : 'Declare width and height on important images so browsers can reserve layout space earlier.',
    })
  );

  findings.push(
    createFinding({
      id: 'contact-signals',
      title: 'Commercial or local pages expose clear contact signals',
      category: 'on_page',
      scope: 'page',
      status: !commercialIntent ? 'N/A' : hasReachableContact ? 'PASS' : 'WARN',
      value: hasReachableContact ? 'Visible contact signals found' : 'No clear phone or email signals found',
      details:
        !commercialIntent
          ? 'The audited page does not strongly indicate a commercial or local intent, so contact expectations are reduced.'
          : hasReachableContact
            ? 'The audited page exposes direct contact signals such as phone or email.'
            : 'The page looks commercial or local in intent but does not expose clear reachable contact signals.',
      recommendation:
        !commercialIntent || hasReachableContact
          ? ''
          : 'Expose clear contact methods such as phone, email, or direct inquiry CTAs on the page itself.',
    })
  );

  findings.push(
    createFinding({
      id: 'open-graph-meta',
      title: 'The audited page exposes Open Graph metadata',
      category: 'on_page',
      scope: 'page',
      status: hasOpenGraph ? 'PASS' : 'WARN',
      value: hasOpenGraph ? 'Present' : 'Missing',
      details: hasOpenGraph
        ? 'Open Graph metadata is available for social previews.'
        : 'Open Graph metadata is missing on the audited page.',
      recommendation: hasOpenGraph ? '' : 'Add Open Graph tags so the page previews well in messengers and social platforms.',
    })
  );

  findings.push(
    createFinding({
      id: 'twitter-card-meta',
      title: 'The audited page exposes Twitter Card metadata',
      category: 'on_page',
      scope: 'page',
      status: hasTwitterCard ? 'PASS' : 'WARN',
      value: hasTwitterCard ? 'Present' : 'Missing',
      details: hasTwitterCard
        ? 'Twitter Card metadata is available for the audited page.'
        : 'Twitter Card metadata is missing on the audited page.',
      recommendation:
        hasTwitterCard ? '' : 'Add Twitter Card metadata so link previews remain consistent outside of search results.',
    })
  );

  findings.push(
    createFinding({
      id: 'favicon',
      title: 'The audited page exposes a favicon',
      category: 'on_page',
      scope: 'page',
      status: page.parsed.favicon ? 'PASS' : 'WARN',
      value: page.parsed.favicon || 'Missing',
      details: page.parsed.favicon
        ? 'The audited page exposes a favicon reference.'
        : 'The audited page does not expose a favicon link tag.',
      recommendation: page.parsed.favicon ? '' : 'Expose a favicon consistently for this page and its templates.',
    })
  );

  return findings;
}

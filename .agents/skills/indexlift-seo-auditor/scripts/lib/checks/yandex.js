import { createFinding } from '../utils.js';

function cyrillicRatio(text) {
  const source = String(text || '');
  const letters = source.match(/[\p{L}]/gu) || [];
  if (letters.length === 0) return 0;
  const cyrillic = source.match(/[А-Яа-яЁё]/g) || [];
  return cyrillic.length / letters.length;
}

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
  const host = new URL(page.finalUrl || page.url).hostname.toLowerCase();
  const invalidJsonLd = page.parsed.jsonLd.some((item) => !item.valid);
  const hasStructuredMarkup =
    page.parsed.jsonLd.length > 0 || page.parsed.microdata.itemtypeCount > 0 || page.parsed.microdata.itempropCount > 0;
  const hasPreviewMetadata = page.parsed.structuredData.hasOpenGraph || page.parsed.structuredData.hasTwitterCard;
  const hasAnyMarkup = hasStructuredMarkup || hasPreviewMetadata || page.parsed.hreflangs.length > 0;
  const isHeavyPage = page.html.length > 2 * 1024 * 1024;
  const isExtremeHeavyPage = page.html.length > 10 * 1024 * 1024;
  const missingCanonical = !page.parsed.canonical;
  const wrongCanonical = page.parsed.canonical && page.parsed.canonical !== page.finalUrl;
  const schemaIssues = pageSnapshot.structured_data.schema_completeness_issues;
  const hasLocalBusiness = pageSnapshot.structured_data.has_local_business;
  const commercialIntent = pageSnapshot.business_signals.commercial_or_local_intent;
  const trustMarkers = pageSnapshot.business_signals.trust_marker_count || 0;
  const hasContactPage = pageSnapshot.geo_signals?.contact_page_link_present;
  const hasAboutPage = pageSnapshot.geo_signals?.about_page_link_present;
  const strongContactSignals =
    pageSnapshot.business_signals.phone_count > 0 ||
    pageSnapshot.business_signals.tel_links > 0 ||
    pageSnapshot.business_signals.address_mentions > 0;
  const businessSignalStrength = [
    strongContactSignals,
    hasLocalBusiness,
    trustMarkers > 0,
    hasContactPage,
    hasAboutPage,
  ].filter(Boolean).length;
  const titleLength = page.parsed.title.length;
  const descriptionLength = page.parsed.description.length;
  const titleReady = titleLength >= 25 && titleLength <= 70;
  const descriptionReady = descriptionLength >= 70 && descriptionLength <= 190;
  const hasViewport = Boolean(page.parsed.viewport);
  const cyrillicHeavy = cyrillicRatio(`${page.parsed.title} ${page.parsed.bodyText}`) >= 0.2;
  const looksRussianTargeted = host.endsWith('.ru') || cyrillicHeavy;
  const ruLang = /^ru\b/i.test(page.parsed.lang || '');
  const crawlGuidanceScore =
    robotsMissing && sitemapMissing ? 'FAIL' : robotsMissing || sitemapMissing ? 'WARN' : 'PASS';
  const legalSignals = pageSnapshot.legal_signals || {};
  const regionSignals = pageSnapshot.region_signals || {};
  const hasEssentialLegalPages = legalSignals.offer_count > 0 && legalSignals.privacy_count > 0;
  const legalDepth = [
    legalSignals.offer_count > 0,
    legalSignals.privacy_count > 0,
    legalSignals.cookies_count > 0,
    legalSignals.payment_count > 0,
    legalSignals.delivery_count > 0,
    legalSignals.guarantee_count > 0,
    legalSignals.requisites_count > 0,
  ].filter(Boolean).length;
  const commercialCompleteness = [
    businessSignalStrength >= 3,
    pageSnapshot.business_signals.form_count > 0 || pageSnapshot.business_signals.button_count > 0,
    hasEssentialLegalPages,
    titleReady && descriptionReady,
    hasViewport,
  ].filter(Boolean).length;
  const behavioralProxyScore = [
    hasViewport,
    pageSnapshot.response_time_ms <= 500,
    pageSnapshot.html_bytes <= 400000,
    Boolean(pageSnapshot.semantics.first_paragraph),
    (pageSnapshot.semantics.main_content_ratio || 0) >= 0.35,
    (pageSnapshot.headings.counts.h1 || 0) === 1,
    pageSnapshot.links.empty_anchor_text <= Math.max(3, Math.floor(pageSnapshot.links.total * 0.15)),
  ].filter(Boolean).length;

  return [
    createFinding({
      id: 'yandex-crawl-guidance',
      title: 'The audited page has strong crawl guidance for Yandex',
      category: 'engine',
      engines: ['yandex'],
      scope: 'page',
      status: crawlGuidanceScore,
      value: robotsMissing && sitemapMissing ? 'robots.txt and sitemap missing' : robotsMissing || sitemapMissing ? 'Partial guidance' : 'robots.txt and sitemap available',
      details:
        crawlGuidanceScore === 'PASS'
          ? 'The site hosting the audited page exposes both robots.txt and a discoverable sitemap for Yandex.'
          : crawlGuidanceScore === 'WARN'
            ? 'The audited page has only partial crawl guidance for Yandex because either robots.txt or sitemap coverage is missing.'
            : 'The audited page lacks both robots.txt and a valid sitemap, which weakens crawl discovery and canonical guidance for Yandex.',
      recommendation:
        crawlGuidanceScore === 'PASS'
          ? ''
          : 'Publish robots.txt, expose a valid XML sitemap, and reference the sitemap from robots.txt.',
    }),
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
      status: wrongCanonical ? 'FAIL' : missingCanonical ? 'WARN' : 'PASS',
      value: page.parsed.canonical || 'Missing',
      details:
        wrongCanonical
          ? 'The audited page canonical recommendation differs from the fetched URL.'
          : missingCanonical
            ? 'The audited page does not expose a canonical hint for Yandex at all.'
          : 'The audited page canonical signal does not conflict with the fetched URL.',
      recommendation: wrongCanonical
        ? 'Use canonical only where the page is a true duplicate and keep content, linking, and sitemap signals aligned.'
        : missingCanonical
          ? 'Add a self-referencing canonical tag unless the page is intentionally consolidated elsewhere.'
        : '',
    }),
    createFinding({
      id: 'yandex-micro-markup',
      title: 'The audited page exposes markup Yandex can interpret',
      category: 'engine',
      engines: ['yandex'],
      scope: 'page',
      status: hasStructuredMarkup ? 'PASS' : hasPreviewMetadata ? 'WARN' : 'FAIL',
      value: hasStructuredMarkup ? 'Structured markup present' : hasPreviewMetadata ? 'Preview metadata only' : 'Missing',
      details:
        hasStructuredMarkup
          ? 'The audited page exposes structured markup that can support deeper Yandex interpretation.'
          : hasPreviewMetadata
            ? 'The audited page exposes preview metadata, but not strong structured markup for Yandex understanding.'
          : 'The audited page lacks JSON-LD, preview metadata, and hreflang signals that can help Yandex-powered features.',
      recommendation:
        hasStructuredMarkup
          ? ''
          : 'Add structured metadata where relevant and validate it in Yandex Webmaster tooling.',
    }),
    createFinding({
      id: 'yandex-markup-completeness',
      title: 'The audited page markup is complete enough for Yandex interpretation',
      category: 'engine',
      engines: ['yandex'],
      scope: 'page',
      status: schemaIssues.length === 0 ? (hasStructuredMarkup ? 'PASS' : 'N/A') : 'WARN',
      value: `${schemaIssues.length} markup completeness issues`,
      details:
        !hasStructuredMarkup
          ? 'No markup was detected, so completeness could not be evaluated.'
          : schemaIssues.length === 0
            ? 'No obvious completeness gaps were detected in the built-in markup checks.'
            : `Markup is present but incomplete in places: ${schemaIssues.slice(0, 4).join('; ')}`,
      recommendation:
        !hasStructuredMarkup || schemaIssues.length === 0
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
      status: page.parsed.jsonLd.length === 0 ? 'N/A' : invalidJsonLd ? 'FAIL' : 'PASS',
      value:
        page.parsed.jsonLd.length === 0
          ? 'No JSON-LD blocks'
          : `${page.parsed.jsonLd.filter((item) => !item.valid).length} invalid JSON-LD blocks`,
      details:
        page.parsed.jsonLd.length === 0
          ? 'No JSON-LD blocks were detected, so syntax validation is not applicable.'
          : invalidJsonLd
          ? 'Malformed JSON-LD was found on the audited page and should be corrected before Yandex validation.'
          : 'No malformed JSON-LD blocks were detected on the audited page.',
      recommendation:
        page.parsed.jsonLd.length === 0
          ? ''
          : invalidJsonLd
            ? 'Fix malformed structured data and validate markup in Yandex Webmaster.'
            : '',
    }),
    createFinding({
      id: 'yandex-snippet-readiness',
      title: 'The audited page has snippet signals that are usable for Yandex results',
      category: 'engine',
      engines: ['yandex'],
      scope: 'page',
      status:
        page.parsed.title && page.parsed.description
          ? titleReady && descriptionReady
            ? 'PASS'
            : 'WARN'
          : 'FAIL',
      value: `${titleLength} title chars, ${descriptionLength} description chars`,
      details:
        page.parsed.title && page.parsed.description
          ? titleReady && descriptionReady
            ? 'The page has both title and description in practical ranges for Yandex result snippets.'
            : 'The page has title and description, but their lengths are not ideal for consistent snippet presentation.'
          : 'The page is missing either title or description, which weakens Yandex snippet quality.',
      recommendation:
        page.parsed.title && page.parsed.description && titleReady && descriptionReady
          ? ''
          : 'Keep a specific title and a clear meta description in practical snippet ranges so Yandex can form stronger result previews.',
    }),
    createFinding({
      id: 'yandex-language-targeting',
      title: 'The audited page clearly signals its Russian-language targeting for Yandex',
      category: 'engine',
      engines: ['yandex'],
      scope: 'page',
      status: !looksRussianTargeted ? 'N/A' : ruLang ? 'PASS' : 'WARN',
      value: page.parsed.lang || 'Missing lang',
      details:
        !looksRussianTargeted
          ? 'The page does not strongly look like a Russian-targeted page in this built-in heuristic.'
          : ruLang
            ? 'The page exposes a Russian language hint through the HTML lang attribute.'
            : 'The page appears Russian-targeted but does not clearly declare Russian language targeting in HTML.',
      recommendation:
        !looksRussianTargeted || ruLang
          ? ''
          : 'Declare `lang=\"ru\"` or another explicit Russian language variant when the page targets Russian-speaking users.',
    }),
    createFinding({
      id: 'yandex-regional-signals',
      title: 'The audited page exposes clear regional signals for Yandex',
      category: 'engine',
      engines: ['yandex'],
      scope: 'page',
      status:
        !looksRussianTargeted
          ? 'N/A'
          : regionSignals.region_mentions >= 2 || hasLocalBusiness || pageSnapshot.business_signals.address_mentions > 0
            ? 'PASS'
            : regionSignals.region_mentions === 1
              ? 'WARN'
              : 'WARN',
      value: `${regionSignals.region_mentions || 0} regional mentions`,
      details:
        !looksRussianTargeted
          ? 'The page does not strongly look like a Russian-targeted page in this heuristic.'
          : regionSignals.region_mentions >= 2 || hasLocalBusiness || pageSnapshot.business_signals.address_mentions > 0
            ? 'The page exposes regional or locality signals that can help Yandex understand geographic relevance.'
            : 'The page appears Russian-targeted but exposes weak regional signals in visible content and business data.',
      recommendation:
        !looksRussianTargeted || regionSignals.region_mentions >= 2 || hasLocalBusiness || pageSnapshot.business_signals.address_mentions > 0
          ? ''
          : 'Strengthen regional targeting with a clearer city, region, address, or locality signal in visible content and business data.',
      evidence: regionSignals.region_samples || [],
    }),
    createFinding({
      id: 'yandex-mobile-readiness',
      title: 'The audited page exposes a mobile viewport for Yandex mobile search',
      category: 'engine',
      engines: ['yandex'],
      scope: 'page',
      status: hasViewport ? 'PASS' : 'FAIL',
      value: page.parsed.viewport || 'Missing',
      details: hasViewport
        ? 'The audited page exposes a viewport declaration for mobile rendering.'
        : 'The audited page is missing a viewport declaration, which is a mobile usability red flag for Yandex as well.',
      recommendation: hasViewport ? '' : 'Add a responsive viewport meta tag on the page template.',
    }),
    createFinding({
      id: 'yandex-local-signals',
      title: 'Commercial or local pages expose clear business signals for Yandex',
      category: 'engine',
      engines: ['yandex'],
      scope: 'page',
      status:
        !commercialIntent
          ? 'N/A'
          : businessSignalStrength >= 3
            ? 'PASS'
            : businessSignalStrength >= 1
              ? 'WARN'
              : 'FAIL',
      value:
        businessSignalStrength >= 3
          ? 'Strong business signal set found'
          : businessSignalStrength >= 1
            ? 'Partial business signals found'
            : 'No strong business signals found',
      details:
        !commercialIntent
          ? 'The page does not strongly suggest a commercial or local intent in the built-in heuristic.'
          : businessSignalStrength >= 3
            ? 'The page exposes multiple business-quality signals such as contact data, trust elements, about/contact paths, or LocalBusiness markup.'
            : businessSignalStrength >= 1
              ? 'The page exposes some business signals, but they are not yet strong enough for a confident local/business interpretation.'
              : 'The page looks commercial or local in intent but lacks strong business signals such as address, phone, trust markers, or LocalBusiness markup.',
      recommendation:
        !commercialIntent || businessSignalStrength >= 3
          ? ''
          : 'Expose a fuller business footprint on the page: phone, address, LocalBusiness schema, trust markers, and clear about/contact paths.',
    }),
    createFinding({
      id: 'yandex-legal-transparency',
      title: 'Commercial pages expose legal and transparency signals Yandex can trust',
      category: 'engine',
      engines: ['yandex'],
      scope: 'page',
      status:
        !commercialIntent
          ? 'N/A'
          : hasEssentialLegalPages && legalDepth >= 3
            ? 'PASS'
            : hasEssentialLegalPages || legalDepth >= 2
              ? 'WARN'
              : 'FAIL',
      value: `${legalDepth} legal/transparency page types detected`,
      details:
        !commercialIntent
          ? 'The page does not strongly indicate a commercial intent, so legal/transparency expectations are lower.'
          : hasEssentialLegalPages && legalDepth >= 3
            ? 'The site exposes strong legal and transparency signals through offer, privacy, and related supporting pages.'
            : hasEssentialLegalPages || legalDepth >= 2
              ? 'The site exposes some legal and transparency pages, but the commercial trust layer still looks incomplete.'
              : 'The page looks commercial, but legal and transparency signals such as offer, privacy, payment, delivery, guarantee, or requisites are weak or missing.',
      recommendation:
        !commercialIntent || (hasEssentialLegalPages && legalDepth >= 3)
          ? ''
          : 'Expose a clearer legal footprint with offer, privacy, cookies, payment, delivery, guarantee, and requisites pages where relevant.',
      evidence: [
        ...(legalSignals.offer_samples || []),
        ...(legalSignals.privacy_samples || []),
        ...(legalSignals.requisites_samples || []),
      ].slice(0, 8),
    }),
    createFinding({
      id: 'yandex-commercial-completeness',
      title: 'Commercial pages look commercially complete for Yandex',
      category: 'engine',
      engines: ['yandex'],
      scope: 'page',
      status:
        !commercialIntent
          ? 'N/A'
          : commercialCompleteness >= 4
            ? 'PASS'
            : commercialCompleteness >= 2
              ? 'WARN'
              : 'FAIL',
      value: `${commercialCompleteness}/5 commercial completeness signals`,
      details:
        !commercialIntent
          ? 'The page does not strongly indicate a commercial intent in this built-in heuristic.'
          : commercialCompleteness >= 4
            ? 'The page combines business trust, usable snippet signals, mobile readiness, and conversion completeness in a way that looks commercially solid.'
            : commercialCompleteness >= 2
              ? 'The page has some commercial quality signals, but still looks incomplete for a strong Yandex commercial profile.'
              : 'The page looks commercial but still lacks too many supporting quality signals to appear fully complete.',
      recommendation:
        !commercialIntent || commercialCompleteness >= 4
          ? ''
          : 'Strengthen the commercial layer with clearer trust, legal, contact, snippet, and conversion signals on and around the landing page.',
    }),
    createFinding({
      id: 'yandex-behavioral-proxies',
      title: 'The audited page has strong behavioral-quality proxies for Yandex',
      category: 'engine',
      engines: ['yandex'],
      scope: 'page',
      status: behavioralProxyScore >= 6 ? 'PASS' : behavioralProxyScore >= 4 ? 'WARN' : 'FAIL',
      value: `${behavioralProxyScore}/7 behavioral-quality proxies`,
      details:
        behavioralProxyScore >= 6
          ? 'The page looks technically and structurally comfortable enough to support good post-click experience signals.'
          : behavioralProxyScore >= 4
            ? 'The page has mixed post-click quality signals, so user experience may be acceptable but not strong.'
            : 'The page exposes several weak proxies for post-click satisfaction, which can hurt Yandex performance over time.',
      recommendation:
        behavioralProxyScore >= 6
          ? ''
          : 'Improve first-screen clarity, reduce heavy HTML, keep one clear H1, lower empty anchors, and strengthen the main content experience after the click.',
    }),
    createFinding({
      id: 'yandex-document-size',
      title: 'The audited page stays below Yandex indexing size constraints',
      category: 'engine',
      engines: ['yandex'],
      scope: 'page',
      status: isExtremeHeavyPage ? 'FAIL' : isHeavyPage ? 'WARN' : 'PASS',
      value: `${Math.round(page.html.length / 1024)} KB`,
      details:
        isExtremeHeavyPage
          ? 'The audited HTML document exceeds the 10 MB threshold and may be truncated or ignored.'
          : isHeavyPage
            ? 'The audited HTML document stays below the hard limit but is still unusually heavy for efficient Yandex crawling and processing.'
          : 'The audited HTML document stays below Yandex size constraints.',
      recommendation:
        isExtremeHeavyPage || isHeavyPage
          ? 'Reduce HTML payload size so the audited page stays comfortably lean for Yandex crawling and indexing.'
          : '',
    }),
  ];
}

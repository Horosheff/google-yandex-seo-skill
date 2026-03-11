import fs from 'fs-extra';
import path from 'path';
import dayjs from 'dayjs';
import { crawlSite } from './crawler.js';
import { TIER_CONFIG } from './constants.js';
import { buildTechnicalFindings } from './checks/technical.js';
import { buildOnPageFindings } from './checks/on-page.js';
import { buildPerformanceFindings } from './checks/performance.js';
import { buildGoogleFindings } from './checks/google.js';
import { buildYandexFindings } from './checks/yandex.js';
import { buildGeoFindings } from './checks/geo.js';
import { renderJsonArtifact } from './reporters/json.js';
import { renderMarkdownReport } from './reporters/markdown.js';
import { scoreFindings } from './scoring.js';
import {
  formatBytes,
  normalizeUrl,
  parseAuditMode,
  parseEngines,
  sameOrigin,
  slugify,
  textOverlapRatio,
  uniqueStrings,
} from './utils.js';

function resolveOptions(options = {}) {
  const mode = parseAuditMode(options.mode);
  const tier = String(options.tier || 'standard').toLowerCase();
  const tierConfig = TIER_CONFIG[tier] || TIER_CONFIG.standard;
  const url = normalizeUrl(options.url);

  if (!url) {
    throw new Error('A valid --url is required.');
  }

  return {
    url,
    mode,
    tier,
    engines: parseEngines(options.engines),
    format: options.format || 'both',
    output: options.output || null,
    maxPages: mode === 'single-page' ? 1 : Number(options.maxPages) || tierConfig.maxPages,
    maxDepth: mode === 'single-page' ? 0 : Number(options.maxDepth) || tierConfig.maxDepth,
  };
}

function buildDuplicateGroups(pages, selector) {
  const groups = new Map();

  for (const page of pages) {
    const value = selector(page);
    if (!value) continue;
    const normalized = value.trim();
    if (!normalized) continue;
    if (!groups.has(normalized)) {
      groups.set(normalized, []);
    }
    groups.get(normalized).push(page.finalUrl);
  }

  return [...groups.entries()]
    .filter(([, urls]) => urls.length > 1)
    .map(([value, urls]) => ({ value, urls }));
}

function summarizePages(crawl) {
  return crawl.pages.map((page) => ({
    url: page.url,
    final_url: page.finalUrl,
    depth: page.depth,
    source: page.source,
    status: page.response.status,
    content_type: page.contentType,
    timing_ms: page.response.timingMs,
    html_bytes: page.html.length,
    crawlable_by_robots: page.crawlableByRobots,
    redirect_chain: page.response.redirectChain,
    parsed: page.parsed
      ? {
          title: page.parsed.title,
          description: page.parsed.description,
          canonical: page.parsed.canonical,
          meta_robots: page.parsed.metaRobots,
          x_robots_tag: page.parsed.xRobotsTag,
          word_count: page.parsed.wordCount,
          headings: page.parsed.headings,
          image_count: page.parsed.images.length,
          missing_alt_count: page.parsed.images.filter((image) => !image.alt).length,
          link_count: page.parsed.links.length,
          hreflangs: page.parsed.hreflangs,
          json_ld_blocks: page.parsed.jsonLd.length,
          json_ld_invalid_blocks: page.parsed.jsonLd.filter((item) => !item.valid).length,
          open_graph: page.parsed.openGraph,
          twitter: page.parsed.twitter,
          viewport: page.parsed.viewport,
          mixed_content_urls: page.parsed.mixedContentUrls,
          geo_signals: page.parsed.geoSignals,
        }
      : null,
  }));
}

function getAuditedPage(crawl) {
  return crawl.pages[0] || null;
}

function buildPageSnapshot(page, crawl, options) {
  if (!page || !page.parsed) {
    return null;
  }

  const pageUrl = page.finalUrl || page.url;
  const links = page.parsed.links.filter((link) => link.href);
  const internalLinks = links.filter((link) => sameOrigin(link.href, pageUrl));
  const externalLinks = links.filter((link) => !sameOrigin(link.href, pageUrl));
  const weakAnchors = internalLinks.filter((link) => !link.text || link.text.trim().length < 2);
  const emptyAnchors = links.filter((link) => !link.text || link.text.trim().length === 0);
  const imagesMissingAlt = page.parsed.images.filter((image) => !image.alt);
  const lazyImages = page.parsed.images.filter((image) => image.loading === 'lazy');
  const headingCounts = Object.fromEntries(
    Object.entries(page.parsed.headings).map(([level, values]) => [level, values.length])
  );
  const redirectChain = page.response.redirectChain || [];
  const ogCoverage = Object.values(page.parsed.openGraph).filter(Boolean).length;
  const twitterCoverage = Object.values(page.parsed.twitter).filter(Boolean).length;
  const primaryH1 = page.parsed.headings.h1?.[0] || '';
  const titleH1Overlap = textOverlapRatio(page.parsed.title, primaryH1);
  const titleDescriptionOverlap = textOverlapRatio(page.parsed.title, page.parsed.description);
  const businessIntent =
    page.parsed.contactSignals.phoneCount > 0 ||
    page.parsed.contactSignals.emailCount > 0 ||
    page.parsed.contactSignals.addressMentions > 0 ||
    page.parsed.contentSignals.ctaCount > 0 ||
    page.parsed.structuredData.hasLocalBusiness;

  return {
    mode: options.mode,
    url: page.url,
    final_url: pageUrl,
    status: page.response.status,
    content_type: page.contentType,
    response_time_ms: page.response.timingMs,
    html_bytes: page.html.length,
    html_weight_human: formatBytes(page.html.length),
    redirect_hops: Math.max(redirectChain.length - 1, 0),
    redirect_chain: redirectChain,
    crawlable_by_robots: page.crawlableByRobots,
    site_context: {
      robots_exists: crawl.robots.exists,
      robots_url: crawl.robots.url,
      sitemap_available: crawl.sitemaps.fetched.some((entry) => entry.ok),
      sitemap_count: crawl.sitemaps.fetched.filter((entry) => entry.ok).length,
      sitemap_urls_discovered: crawl.sitemaps.urls.length,
    },
    title: {
      value: page.parsed.title,
      length: page.parsed.title.length,
    },
    description: {
      value: page.parsed.description,
      length: page.parsed.description.length,
    },
    semantics: {
      first_paragraph: page.parsed.firstParagraph,
      paragraph_count: page.parsed.contentSignals.paragraphCount,
      title_h1_overlap: Number(titleH1Overlap.toFixed(2)),
      title_description_overlap: Number(titleDescriptionOverlap.toFixed(2)),
      main_content_ratio: page.parsed.contentSignals.mainContentRatio,
      main_word_count: page.parsed.contentSignals.mainWordCount,
      body_word_count: page.parsed.contentSignals.bodyWordCount,
      short_paragraphs: page.parsed.contentSignals.shortParagraphCount,
      long_paragraphs: page.parsed.contentSignals.longParagraphCount,
      repeated_headings: page.parsed.contentSignals.repeatedHeadingCount,
      repeated_heading_samples: page.parsed.contentSignals.repeatedHeadingSamples,
    },
    canonical: page.parsed.canonical,
    lang: page.parsed.lang,
    charset: page.parsed.charset,
    viewport: page.parsed.viewport,
    meta_robots: page.parsed.metaRobots,
    x_robots_tag: page.parsed.xRobotsTag,
    favicon: page.parsed.favicon,
    word_count: page.parsed.wordCount,
    headings: {
      counts: headingCounts,
      values: page.parsed.headings,
    },
    links: {
      total: links.length,
      internal: internalLinks.length,
      external: externalLinks.length,
      empty_anchor_text: emptyAnchors.length,
      weak_internal_anchor_text: weakAnchors.length,
      generic_anchor_text: page.parsed.linkSignals.genericAnchorCount,
      generic_anchor_samples: page.parsed.linkSignals.genericAnchorSamples,
      samples: links.slice(0, 12).map((link) => ({
        href: link.href,
        text: link.text,
        rel: link.rel,
      })),
    },
    images: {
      total: page.parsed.images.length,
      missing_alt: imagesMissingAlt.length,
      lazy_loaded: lazyImages.length,
      without_lazy: page.parsed.images.length - lazyImages.length,
      missing_dimensions: page.parsed.imageSignals.missingDimensionsCount,
      modern_formats: page.parsed.imageSignals.modernFormatCount,
      samples_missing_alt: imagesMissingAlt.slice(0, 10).map((image) => image.src),
    },
    resources: {
      scripts: page.parsed.scripts.length,
      inline_scripts: page.parsed.scripts.filter((script) => script.inline).length,
      inline_script_bytes: page.parsed.resourceSignals.inlineScriptBytes,
      stylesheets: page.parsed.stylesheets.length,
      inline_style_bytes: page.parsed.resourceSignals.inlineStyleBytes,
      images: page.parsed.images.length,
      total: page.parsed.scripts.length + page.parsed.stylesheets.length + page.parsed.images.length,
    },
    business_signals: {
      commercial_or_local_intent: businessIntent,
      phone_count: page.parsed.contactSignals.phoneCount,
      email_count: page.parsed.contactSignals.emailCount,
      address_mentions: page.parsed.contactSignals.addressMentions,
      tel_links: page.parsed.contactSignals.telLinks,
      mailto_links: page.parsed.contactSignals.mailtoLinks,
      messenger_links: page.parsed.contactSignals.messengerLinks,
      messenger_samples: page.parsed.contactSignals.messengerSamples,
      cta_count: page.parsed.contentSignals.ctaCount,
      cta_samples: page.parsed.contentSignals.ctaSamples,
      button_count: page.parsed.contentSignals.buttonCount,
      button_samples: page.parsed.contentSignals.buttonSamples,
      form_count: page.parsed.contentSignals.formCount,
      trust_marker_count: page.parsed.contentSignals.trustMarkerCount,
      trust_marker_samples: page.parsed.contentSignals.trustMarkerSamples,
    },
    structured_data: {
      json_ld_blocks: page.parsed.jsonLd.length,
      json_ld_valid_blocks: page.parsed.structuredData.jsonLdValidCount,
      json_ld_invalid_blocks: page.parsed.structuredData.jsonLdInvalidCount,
      has_open_graph: page.parsed.structuredData.hasOpenGraph,
      has_twitter_card: page.parsed.structuredData.hasTwitterCard,
      has_local_business: page.parsed.structuredData.hasLocalBusiness,
      has_organization: page.parsed.structuredData.hasOrganization,
      has_breadcrumbs: page.parsed.structuredData.hasBreadcrumbs,
      has_faq_page: page.parsed.structuredData.hasFAQPage,
      has_howto: page.parsed.structuredData.hasHowTo,
      has_person: page.parsed.structuredData.hasPerson,
      has_service: page.parsed.structuredData.hasService,
      has_webpage: page.parsed.structuredData.hasWebPage,
      has_website: page.parsed.structuredData.hasWebSite,
      schema_types: page.parsed.structuredData.schemaTypes,
      schema_type_counts: page.parsed.structuredData.schemaTypeCounts,
      schema_completeness_issues: page.parsed.structuredData.schemaCompletenessIssues,
      open_graph_fields_present: ogCoverage,
      twitter_fields_present: twitterCoverage,
      hreflang_count: page.parsed.hreflangs.length,
      hreflangs: page.parsed.hreflangs,
    },
    geo_signals: {
      answer_first_paragraph_present: Boolean(page.parsed.firstParagraph),
      definition_like_intro: page.parsed.geoSignals.definitionLikeIntro,
      question_headings: page.parsed.geoSignals.questionHeadingCount,
      faq_schema_present: page.parsed.geoSignals.faqSchemaCount > 0,
      faq_schema_count: page.parsed.geoSignals.faqSchemaCount,
      howto_schema_present: page.parsed.geoSignals.howToSchemaCount > 0,
      howto_schema_count: page.parsed.geoSignals.howToSchemaCount,
      person_schema_count: page.parsed.geoSignals.personSchemaCount,
      service_schema_count: page.parsed.geoSignals.serviceSchemaCount,
      webpage_schema_count: page.parsed.geoSignals.webPageSchemaCount,
      website_schema_count: page.parsed.geoSignals.webSiteSchemaCount,
      author_present: page.parsed.geoSignals.authorBylinePresent,
      author_name: page.parsed.geoSignals.authorName,
      author_profile_link_present: page.parsed.geoSignals.authorLinkPresent,
      author_profile_link: page.parsed.geoSignals.authorLink,
      date_published_present: page.parsed.geoSignals.datePublishedPresent,
      date_modified_present: page.parsed.geoSignals.dateModifiedPresent,
      date_published: page.parsed.geoSignals.datePublished,
      date_modified: page.parsed.geoSignals.dateModified,
      reference_links: page.parsed.geoSignals.referenceLinkCount,
      reference_link_samples: page.parsed.geoSignals.referenceLinkSamples,
      about_page_link_present: page.parsed.geoSignals.aboutLinkPresent,
      about_page_link: page.parsed.geoSignals.aboutLink,
      contact_page_link_present: page.parsed.geoSignals.contactLinkPresent,
      contact_page_link: page.parsed.geoSignals.contactLink,
      list_blocks: page.parsed.geoSignals.listBlockCount,
      table_blocks: page.parsed.geoSignals.tableCount,
      chunkable_sections: page.parsed.geoSignals.chunkableSectionCount,
    },
    microdata: page.parsed.microdata,
    mixed_content_urls: page.parsed.mixedContentUrls,
  };
}

export async function runAudit(rawOptions = {}) {
  const options = resolveOptions(rawOptions);
  const crawl = await crawlSite({
    url: options.url,
    maxPages: options.maxPages,
    maxDepth: options.maxDepth,
    userAgent: 'indexliftbot',
    singlePageOnly: options.mode === 'single-page',
  });
  const auditedPage = getAuditedPage(crawl);

  const duplicates = {
    title:
      options.mode === 'single-page'
        ? []
        : buildDuplicateGroups(crawl.pages.filter((page) => page.parsed), (page) => page.parsed.title),
    description:
      options.mode === 'single-page'
        ? []
        : buildDuplicateGroups(crawl.pages.filter((page) => page.parsed), (page) => page.parsed.description),
  };
  const pageSnapshot = buildPageSnapshot(auditedPage, crawl, options);

  const context = {
    options,
    crawl,
    duplicates,
    page: auditedPage,
    pageSnapshot,
  };

  const findings = [
    ...buildTechnicalFindings(context),
    ...buildOnPageFindings(context),
    ...buildPerformanceFindings(context),
    ...buildGeoFindings(context),
  ];

  if (options.engines.includes('google')) {
    findings.push(...buildGoogleFindings(context));
  }
  if (options.engines.includes('yandex')) {
    findings.push(...buildYandexFindings(context));
  }

  const scores = scoreFindings(findings, options.engines);
  const metadata = {
    url: options.url,
    mode: options.mode,
    tier: options.tier,
    engines: options.engines,
    generatedAt: dayjs().toISOString(),
  };

  const auditResult = {
    metadata,
    crawlSummary: {
      mode: options.mode,
      startUrl: crawl.startUrl,
      origin: crawl.origin,
      pagesCrawled: crawl.pages.length,
      pagesDiscovered: crawl.internalDiscovered.length,
      errors: crawl.errors,
      robots: {
        url: crawl.robots.url,
        status: crawl.robots.status,
        exists: crawl.robots.exists,
        sitemaps: crawl.robots.parsed.sitemaps,
      },
      sitemaps: crawl.sitemaps.fetched,
    },
    pageSnapshot,
    pages: summarizePages(crawl),
    duplicates,
    findings,
    scores,
  };

  auditResult.artifacts = {
    json: renderJsonArtifact(auditResult),
    markdown: renderMarkdownReport(auditResult),
  };

  return auditResult;
}

export function defaultAuditBaseName(url) {
  const host = new URL(url).hostname.replace(/^www\./, '');
  return `seo-audit-${slugify(host)}-${dayjs().format('YYYY-MM-DD')}`;
}

export async function writeAuditArtifacts(auditResult, rawOptions = {}) {
  const options = resolveOptions({
    ...rawOptions,
    url: auditResult.metadata.url,
    mode: auditResult.metadata.mode,
    tier: auditResult.metadata.tier,
    engines: auditResult.metadata.engines.join(','),
  });
  const baseName = defaultAuditBaseName(auditResult.metadata.url);
  let outputDir = options.output;
  let markdownPath = null;
  let jsonPath = null;

  if (outputDir && outputDir.endsWith('.md')) {
    markdownPath = outputDir;
    outputDir = path.dirname(outputDir);
    jsonPath = path.join(outputDir, `${path.basename(markdownPath, '.md')}.json`);
  } else {
    outputDir = outputDir || path.join(process.cwd(), 'deliverables', baseName);
    markdownPath = path.join(outputDir, `${baseName}.md`);
    jsonPath = path.join(outputDir, `${baseName}.json`);
  }

  await fs.ensureDir(outputDir);

  if (options.format === 'json' || options.format === 'both') {
    await fs.writeJson(jsonPath, auditResult.artifacts.json, { spaces: 2 });
  }

  if (options.format === 'md' || options.format === 'both') {
    await fs.writeFile(markdownPath, auditResult.artifacts.markdown, 'utf-8');
  }

  return {
    outputDir,
    markdownPath: options.format === 'json' ? null : markdownPath,
    jsonPath: options.format === 'md' ? null : jsonPath,
    summary: {
      mode: auditResult.metadata.mode,
      score: auditResult.scores.overall.score,
      grade: auditResult.scores.overall.grade,
      pages: auditResult.crawlSummary.pagesCrawled,
      findings: {
        pass: auditResult.findings.filter((finding) => finding.status === 'PASS').length,
        warn: auditResult.findings.filter((finding) => finding.status === 'WARN').length,
        fail: auditResult.findings.filter((finding) => finding.status === 'FAIL').length,
        na: auditResult.findings.filter((finding) => finding.status === 'N/A').length,
      },
      sitemaps: uniqueStrings(auditResult.crawlSummary.robots.sitemaps),
      htmlWeight: formatBytes(
        Math.max(...auditResult.pages.map((page) => page.html_bytes || 0), 0)
      ),
    },
  };
}

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
import { renderJsonArtifact } from './reporters/json.js';
import { renderMarkdownReport } from './reporters/markdown.js';
import { scoreFindings } from './scoring.js';
import { formatBytes, normalizeUrl, parseEngines, slugify, uniqueStrings } from './utils.js';

function resolveOptions(options = {}) {
  const tier = String(options.tier || 'standard').toLowerCase();
  const tierConfig = TIER_CONFIG[tier] || TIER_CONFIG.standard;
  const url = normalizeUrl(options.url);

  if (!url) {
    throw new Error('A valid --url is required.');
  }

  return {
    url,
    tier,
    engines: parseEngines(options.engines),
    format: options.format || 'both',
    output: options.output || null,
    maxPages: Number(options.maxPages) || tierConfig.maxPages,
    maxDepth: Number(options.maxDepth) || tierConfig.maxDepth,
    includeOptionalApis: options.includeOptionalApis ?? tierConfig.includeOptionalApis,
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
        }
      : null,
  }));
}

function buildOptionalModules(options) {
  const base = [
    {
      name: 'Backlink profile',
      status: 'N/A',
      details: 'External backlink APIs are not configured in this local build.',
    },
    {
      name: 'Competitor gap analysis',
      status: options.tier === 'pro' ? 'N/A' : 'Not included',
      details:
        options.tier === 'pro'
          ? 'Competitor discovery and SERP overlap require external data sources or explicit competitor inputs.'
          : 'Competitor analysis is reserved for the Pro tier.',
    },
    {
      name: 'SERP snapshot',
      status: 'N/A',
      details: 'Live SERP acquisition is not configured in this local build.',
    },
  ];

  return base;
}

export async function runAudit(rawOptions = {}) {
  const options = resolveOptions(rawOptions);
  const crawl = await crawlSite({
    url: options.url,
    maxPages: options.maxPages,
    maxDepth: options.maxDepth,
    userAgent: 'indexliftbot',
  });

  const duplicates = {
    title: buildDuplicateGroups(crawl.pages.filter((page) => page.parsed), (page) => page.parsed.title),
    description: buildDuplicateGroups(crawl.pages.filter((page) => page.parsed), (page) => page.parsed.description),
  };

  const context = {
    options,
    crawl,
    duplicates,
  };

  const findings = [
    ...buildTechnicalFindings(context),
    ...buildOnPageFindings(context),
    ...buildPerformanceFindings(context),
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
    tier: options.tier,
    engines: options.engines,
    generatedAt: dayjs().toISOString(),
  };

  const auditResult = {
    metadata,
    crawlSummary: {
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
    pages: summarizePages(crawl),
    duplicates,
    findings,
    scores,
    optionalModules: buildOptionalModules(options),
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

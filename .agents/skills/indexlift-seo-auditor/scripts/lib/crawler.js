import { XMLParser } from 'fast-xml-parser';
import { MAX_SITEMAPS } from './constants.js';
import { fetchText, fetchWithRedirects } from './fetchers/http-fetcher.js';
import { parseHtmlPage } from './parsers/html-parser.js';
import { normalizeUrl, sameOrigin, uniqueStrings } from './utils.js';

function parseRobotsTxt(content) {
  const lines = content.split(/\r?\n/);
  const rules = [];
  let currentAgents = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const [directiveRaw, ...rest] = line.split(':');
    if (!directiveRaw || rest.length === 0) continue;

    const directive = directiveRaw.trim().toLowerCase();
    const value = rest.join(':').trim();

    if (directive === 'user-agent') {
      currentAgents = [value.toLowerCase()];
      continue;
    }

    if (directive === 'allow' || directive === 'disallow') {
      rules.push({
        userAgents: currentAgents.length > 0 ? [...currentAgents] : ['*'],
        directive,
        value,
      });
    }
  }

  const sitemaps = lines
    .map((line) => line.trim())
    .filter((line) => /^sitemap:/i.test(line))
    .map((line) => line.split(':').slice(1).join(':').trim())
    .filter(Boolean);

  return {
    raw: content,
    sitemaps: uniqueStrings(sitemaps),
    rules,
  };
}

function robotsRuleApplies(rule, userAgent = '*') {
  const target = userAgent.toLowerCase();
  return rule.userAgents.some((agent) => agent === '*' || target.includes(agent));
}

function allowedByRobots(robots, urlPath, userAgent = '*') {
  if (!robots?.rules?.length) return true;

  let matchedRule = null;
  for (const rule of robots.rules) {
    if (!robotsRuleApplies(rule, userAgent)) continue;
    if (!rule.value) continue;
    if (urlPath.startsWith(rule.value)) {
      if (!matchedRule || rule.value.length >= matchedRule.value.length) {
        matchedRule = rule;
      }
    }
  }

  return matchedRule ? matchedRule.directive !== 'disallow' : true;
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function parseSitemapXml(xml) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    trimValues: true,
  });
  const parsed = parser.parse(xml);

  const urls = [];
  const sitemapUrls = [];

  for (const item of toArray(parsed?.urlset?.url)) {
    if (item?.loc) urls.push(String(item.loc).trim());
  }

  for (const item of toArray(parsed?.sitemapindex?.sitemap)) {
    if (item?.loc) sitemapUrls.push(String(item.loc).trim());
  }

  return {
    urls: uniqueStrings(urls),
    sitemapUrls: uniqueStrings(sitemapUrls),
  };
}

async function fetchRobots(origin) {
  const robotsUrl = new URL('/robots.txt', origin).toString();

  try {
    const response = await fetchText(robotsUrl);
    return {
      url: robotsUrl,
      status: response.status,
      exists: response.ok,
      parsed: response.ok ? parseRobotsTxt(response.body) : { raw: '', sitemaps: [], rules: [] },
    };
  } catch (error) {
    return {
      url: robotsUrl,
      status: null,
      exists: false,
      error: error.message,
      parsed: { raw: '', sitemaps: [], rules: [] },
    };
  }
}

async function fetchSitemaps(origin, robots) {
  const queue = [
    ...robots.parsed.sitemaps,
    new URL('/sitemap.xml', origin).toString(),
  ];
  const seen = new Set();
  const fetched = [];
  const discoveredUrls = new Set();

  while (queue.length > 0 && fetched.length < MAX_SITEMAPS) {
    const current = normalizeUrl(queue.shift());
    if (!current || seen.has(current)) continue;
    seen.add(current);

    try {
      const response = await fetchText(current);
      const entry = {
        url: current,
        status: response.status,
        ok: response.ok,
        finalUrl: response.finalUrl,
        urls: [],
        childSitemaps: [],
      };

      if (response.ok) {
        const parsed = parseSitemapXml(response.body);
        entry.urls = parsed.urls.map((url) => normalizeUrl(url)).filter(Boolean);
        entry.childSitemaps = parsed.sitemapUrls.map((url) => normalizeUrl(url)).filter(Boolean);
        for (const url of entry.urls) discoveredUrls.add(url);
        for (const child of entry.childSitemaps) {
          if (!seen.has(child)) queue.push(child);
        }
      }

      fetched.push(entry);
    } catch (error) {
      fetched.push({
        url: current,
        status: null,
        ok: false,
        error: error.message,
        urls: [],
        childSitemaps: [],
      });
    }
  }

  return {
    fetched,
    urls: [...discoveredUrls],
  };
}

export async function crawlSite({
  url,
  maxPages,
  maxDepth,
  userAgent = '*',
  singlePageOnly = false,
}) {
  const startUrl = normalizeUrl(url);
  if (!startUrl) {
    throw new Error(`Invalid start URL: ${url}`);
  }

  const start = new URL(startUrl);
  const origin = start.origin;
  const robots = await fetchRobots(origin);
  const sitemaps = await fetchSitemaps(origin, robots);
  const queue = [{ url: startUrl, depth: 0, source: 'start' }];
  const visited = new Set();
  const internalDiscovered = new Set([startUrl, ...sitemaps.urls.filter((item) => sameOrigin(item, startUrl))]);
  const pages = [];
  const errors = [];
  const incomingLinks = new Map();

  while (queue.length > 0 && pages.length < maxPages) {
    const current = queue.shift();
    if (!current?.url || visited.has(current.url)) continue;
    visited.add(current.url);

    const urlObject = new URL(current.url);
    const allowed = allowedByRobots(robots.parsed, urlObject.pathname, userAgent);

    let response;
    try {
      response = await fetchWithRedirects(current.url);
    } catch (error) {
      errors.push({
        url: current.url,
        depth: current.depth,
        error: error.message,
      });
      continue;
    }

    const contentType = response.headers['content-type'] || '';
    const isHtml = /html|xhtml/i.test(contentType) || !contentType;
    const finalUrl = normalizeUrl(response.finalUrl) || current.url;

    if (!sameOrigin(finalUrl, startUrl)) {
      continue;
    }

    const parsed = isHtml ? parseHtmlPage(response.body, finalUrl, response.headers) : null;
    const page = {
      url: current.url,
      finalUrl,
      depth: current.depth,
      source: current.source,
      response,
      contentType,
      html: response.body,
      parsed,
      crawlableByRobots: allowed,
    };
    pages.push(page);

    if (!parsed || singlePageOnly || current.depth >= maxDepth) {
      continue;
    }

    for (const link of parsed.links) {
      if (!link.href || !sameOrigin(link.href, startUrl)) continue;
      const normalized = normalizeUrl(link.href);
      if (!normalized) continue;
      internalDiscovered.add(normalized);

      if (!incomingLinks.has(normalized)) {
        incomingLinks.set(normalized, []);
      }
      incomingLinks.get(normalized).push({
        from: finalUrl,
        text: link.text,
        rel: link.rel,
      });

      if (!visited.has(normalized)) {
        queue.push({
          url: normalized,
          depth: current.depth + 1,
          source: finalUrl,
        });
      }
    }
  }

  return {
    startUrl,
    origin,
    robots,
    sitemaps,
    pages,
    errors,
    internalDiscovered: [...internalDiscovered],
    incomingLinks: Object.fromEntries(incomingLinks.entries()),
  };
}

import * as cheerio from 'cheerio';
import { normalizeUrl, truncate } from '../utils.js';

function safeJsonParse(value) {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function extractText($root) {
  return $root
    .text()
    .replace(/\s+/g, ' ')
    .trim();
}

function wordCount(text) {
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

export function parseHtmlPage(html, pageUrl, headers = {}) {
  const $ = cheerio.load(html);
  const pageText = extractText($('body'));
  const scripts = [];
  const stylesheets = [];
  const links = [];
  const images = [];
  const hreflangs = [];
  const jsonLd = [];

  $('script').each((_, element) => {
    const $element = $(element);
    const src = $element.attr('src') || '';
    const type = ($element.attr('type') || '').toLowerCase();
    const inlineContent = $element.html() || '';
    scripts.push({
      src: normalizeUrl(src, pageUrl),
      type,
      size: inlineContent.length,
      async: $element.is('[async]'),
      defer: $element.is('[defer]'),
      inline: !src,
    });

    if (type === 'application/ld+json') {
      const parsed = safeJsonParse(inlineContent.trim());
      jsonLd.push({
        valid: parsed.ok,
        value: parsed.ok ? parsed.value : null,
        error: parsed.ok ? null : parsed.error,
        raw: truncate(inlineContent.trim(), 400),
      });
    }
  });

  $('link[rel]').each((_, element) => {
    const $element = $(element);
    const rel = ($element.attr('rel') || '').toLowerCase();
    const href = normalizeUrl($element.attr('href') || '', pageUrl);

    if (rel.includes('stylesheet')) {
      stylesheets.push({
        href,
        media: $element.attr('media') || '',
      });
    }

    if (rel.includes('alternate') && $element.attr('hreflang')) {
      hreflangs.push({
        hreflang: ($element.attr('hreflang') || '').toLowerCase(),
        href,
      });
    }
  });

  $('a[href]').each((_, element) => {
    const $element = $(element);
    links.push({
      href: normalizeUrl($element.attr('href') || '', pageUrl),
      rawHref: $element.attr('href') || '',
      text: extractText($element),
      rel: ($element.attr('rel') || '').toLowerCase(),
    });
  });

  $('img').each((_, element) => {
    const $element = $(element);
    images.push({
      src: normalizeUrl($element.attr('src') || '', pageUrl),
      alt: ($element.attr('alt') || '').trim(),
      loading: ($element.attr('loading') || '').toLowerCase(),
      width: $element.attr('width') || '',
      height: $element.attr('height') || '',
    });
  });

  const title = $('title').first().text().trim();
  const description = $('meta[name="description"]').attr('content')?.trim() || '';
  const metaRobots = $('meta[name="robots"]').attr('content')?.trim() || '';
  const canonical = normalizeUrl($('link[rel="canonical"]').attr('href') || '', pageUrl);
  const faviconHref = $('link[rel="icon"], link[rel="shortcut icon"]').attr('href') || '';
  const openGraph = {
    title: $('meta[property="og:title"]').attr('content')?.trim() || '',
    description: $('meta[property="og:description"]').attr('content')?.trim() || '',
    image: $('meta[property="og:image"]').attr('content')?.trim() || '',
    type: $('meta[property="og:type"]').attr('content')?.trim() || '',
  };
  const twitter = {
    card: $('meta[name="twitter:card"]').attr('content')?.trim() || '',
    title: $('meta[name="twitter:title"]').attr('content')?.trim() || '',
    description: $('meta[name="twitter:description"]').attr('content')?.trim() || '',
    image: $('meta[name="twitter:image"]').attr('content')?.trim() || '',
  };

  const headings = {};
  for (const level of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
    headings[level] = $(level)
      .map((_, element) => extractText($(element)))
      .get();
  }

  const resourceUrls = [
    ...scripts.map((script) => script.src).filter(Boolean),
    ...stylesheets.map((sheet) => sheet.href).filter(Boolean),
    ...images.map((image) => image.src).filter(Boolean),
  ];

  return {
    url: pageUrl,
    finalUrl: pageUrl,
    title,
    description,
    metaRobots,
    xRobotsTag: headers['x-robots-tag'] || '',
    canonical,
    favicon: normalizeUrl(faviconHref, pageUrl),
    lang: $('html').attr('lang')?.trim() || '',
    charset: $('meta[charset]').attr('charset')?.trim() || '',
    viewport: $('meta[name="viewport"]').attr('content')?.trim() || '',
    openGraph,
    twitter,
    headings,
    images,
    links,
    scripts,
    stylesheets,
    hreflangs,
    jsonLd,
    text: pageText,
    wordCount: wordCount(pageText),
    mixedContentUrls: resourceUrls.filter((resourceUrl) => resourceUrl?.startsWith('http://')),
    structuredData: {
      jsonLdValidCount: jsonLd.filter((item) => item.valid).length,
      jsonLdInvalidCount: jsonLd.filter((item) => !item.valid).length,
      hasOpenGraph: Boolean(openGraph.title || openGraph.description || openGraph.image),
      hasTwitterCard: Boolean(twitter.card),
    },
  };
}

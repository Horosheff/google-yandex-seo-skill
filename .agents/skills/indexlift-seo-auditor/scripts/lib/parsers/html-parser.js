import * as cheerio from 'cheerio';
import { normalizeUrl, truncate } from '../utils.js';

const GENERIC_ANCHOR_PATTERN =
  /^(here|more|details|learn more|read more|see more|click here|далее|подробнее|читать|смотреть|детали|узнать больше|перейти)$/i;
const CTA_PATTERN =
  /(buy|order|contact|start|try|join|book|call|sign up|register|subscribe|купить|заказать|связаться|написать|позвонить|оставить заявку|записаться|получить|начать|вступить)/i;
const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{8,}\d)/g;
const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const ADDRESS_PATTERN = /\b(ул\.|улица|проспект|пр\.|бульвар|пер\.|дом|street|st\.|avenue|ave\.|road|rd\.|city|город)\b/gi;

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

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

function firstNonEmpty(values) {
  return values.find(Boolean) || '';
}

function detectParagraphs($, $root) {
  return $root
    .find('p')
    .map((_, element) => extractText($(element)))
    .get()
    .filter(Boolean);
}

function detectMainRoot($) {
  return $('main, article, [role="main"], #allrecords, .t-records').first();
}

function flattenJsonLdNodes(value, bucket = []) {
  if (!value) return bucket;

  if (Array.isArray(value)) {
    for (const item of value) flattenJsonLdNodes(item, bucket);
    return bucket;
  }

  if (typeof value !== 'object') {
    return bucket;
  }

  bucket.push(value);

  if (value['@graph']) {
    flattenJsonLdNodes(value['@graph'], bucket);
  }

  return bucket;
}

function summarizeSchema(jsonLd) {
  const typeCounts = {};
  const completenessIssues = [];
  const nodes = jsonLd
    .filter((item) => item.valid && item.value)
    .flatMap((item) => flattenJsonLdNodes(item.value, []));

  for (const node of nodes) {
    const types = toArray(node['@type']).map((type) => String(type).trim()).filter(Boolean);
    for (const type of types) {
      typeCounts[type] = (typeCounts[type] || 0) + 1;

      if (type === 'LocalBusiness') {
        if (!node.name) completenessIssues.push('LocalBusiness missing name');
        if (!node.address) completenessIssues.push('LocalBusiness missing address');
        if (!node.telephone) completenessIssues.push('LocalBusiness missing telephone');
      }
      if (type === 'Organization') {
        if (!node.name) completenessIssues.push('Organization missing name');
        if (!node.url) completenessIssues.push('Organization missing url');
      }
      if (type === 'BreadcrumbList' && !node.itemListElement) {
        completenessIssues.push('BreadcrumbList missing itemListElement');
      }
      if (type === 'Article' && !node.headline) {
        completenessIssues.push('Article missing headline');
      }
      if (type === 'Product') {
        if (!node.name) completenessIssues.push('Product missing name');
        if (!node.offers) completenessIssues.push('Product missing offers');
      }
    }
  }

  return {
    types: Object.keys(typeCounts).sort(),
    typeCounts,
    completenessIssues: [...new Set(completenessIssues)],
    hasLocalBusiness: Boolean(typeCounts.LocalBusiness),
    hasOrganization: Boolean(typeCounts.Organization),
    hasBreadcrumbs: Boolean(typeCounts.BreadcrumbList),
  };
}

function countPatternMatches(text, pattern) {
  return (String(text || '').match(pattern) || []).length;
}

function uniqueNormalizedMatches(text, pattern, normalize) {
  const matches = String(text || '').match(pattern) || [];
  return [...new Set(matches.map(normalize).filter(Boolean))];
}

function detectContactSignals(pageText, links) {
  const telLinks = links.filter((link) => /^tel:/i.test(link.rawHref)).length;
  const mailtoLinks = links.filter((link) => /^mailto:/i.test(link.rawHref)).length;
  const phones = uniqueNormalizedMatches(pageText, PHONE_PATTERN, (match) => {
    if (!/[+\s().-]/.test(match)) {
      return null;
    }
    const digits = match.replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 15 ? digits : null;
  });
  const emails = uniqueNormalizedMatches(pageText, EMAIL_PATTERN, (match) => match.toLowerCase());

  return {
    phoneCount: phones.length,
    phoneSamples: phones.slice(0, 5),
    emailCount: emails.length,
    emailSamples: emails.slice(0, 5),
    addressMentions: countPatternMatches(pageText, ADDRESS_PATTERN),
    telLinks,
    mailtoLinks,
  };
}

function imageFormat(src) {
  const match = String(src || '').toLowerCase().match(/\.([a-z0-9]+)(?:$|\?)/);
  return match?.[1] || '';
}

export function parseHtmlPage(html, pageUrl, headers = {}) {
  const $ = cheerio.load(html);
  const $main = detectMainRoot($);
  const bodyText = extractText($('body'));
  const mainText = extractText($main);
  const pageText = mainText || bodyText;
  const scripts = [];
  const stylesheets = [];
  const links = [];
  const images = [];
  const hreflangs = [];
  const jsonLd = [];
  let inlineStyleBytes = 0;

  $('style').each((_, element) => {
    inlineStyleBytes += ($(element).html() || '').length;
  });

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
    const text = extractText($element);
    links.push({
      href: normalizeUrl($element.attr('href') || '', pageUrl),
      rawHref: $element.attr('href') || '',
      text,
      rel: ($element.attr('rel') || '').toLowerCase(),
      generic: GENERIC_ANCHOR_PATTERN.test(text.trim()),
      cta: CTA_PATTERN.test(text.trim()),
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
  const paragraphs = detectParagraphs($, $main.length > 0 ? $main : $('body'));
  const genericAnchors = links.filter((link) => link.generic);
  const ctaLinks = links.filter((link) => link.cta);
  const schema = summarizeSchema(jsonLd);
  const contactSignals = detectContactSignals(bodyText, links);
  const imageSignals = {
    missingDimensionsCount: images.filter((image) => !image.width || !image.height).length,
    modernFormatCount: images.filter((image) => ['webp', 'avif', 'svg'].includes(imageFormat(image.src))).length,
  };
  const microdata = {
    itemtypeCount: $('[itemtype]').length,
    itempropCount: $('[itemprop]').length,
  };
  const mainWordCount = wordCount(mainText);
  const bodyWordCount = wordCount(bodyText);

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
    bodyText,
    mainText,
    wordCount: wordCount(pageText),
    mixedContentUrls: resourceUrls.filter((resourceUrl) => resourceUrl?.startsWith('http://')),
    paragraphs,
    firstParagraph: firstNonEmpty(paragraphs),
    contentSignals: {
      paragraphCount: paragraphs.length,
      mainWordCount,
      bodyWordCount,
      mainContentRatio: bodyWordCount > 0 ? Number((mainWordCount / bodyWordCount).toFixed(2)) : 0,
      ctaCount: ctaLinks.length,
      ctaSamples: ctaLinks.slice(0, 8).map((link) => link.text),
    },
    linkSignals: {
      genericAnchorCount: genericAnchors.length,
      genericAnchorSamples: genericAnchors.slice(0, 12).map((link) => ({
        href: link.href,
        text: link.text,
      })),
    },
    contactSignals,
    imageSignals,
    microdata,
    structuredData: {
      jsonLdValidCount: jsonLd.filter((item) => item.valid).length,
      jsonLdInvalidCount: jsonLd.filter((item) => !item.valid).length,
      hasOpenGraph: Boolean(openGraph.title || openGraph.description || openGraph.image),
      hasTwitterCard: Boolean(twitter.card),
      schemaTypes: schema.types,
      schemaTypeCounts: schema.typeCounts,
      schemaCompletenessIssues: schema.completenessIssues,
      hasLocalBusiness: schema.hasLocalBusiness,
      hasOrganization: schema.hasOrganization,
      hasBreadcrumbs: schema.hasBreadcrumbs,
    },
    resourceSignals: {
      inlineScriptBytes: scripts.filter((script) => script.inline).reduce((sum, script) => sum + script.size, 0),
      inlineStyleBytes,
    },
  };
}

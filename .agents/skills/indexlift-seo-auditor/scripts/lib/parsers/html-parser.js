import * as cheerio from 'cheerio';
import { normalizeUrl, truncate } from '../utils.js';

const GENERIC_ANCHOR_PATTERN =
  /^(here|more|details|learn more|read more|see more|click here|далее|подробнее|читать|смотреть|детали|узнать больше|перейти)$/i;
const CTA_PATTERN =
  /(buy|order|contact|start|try|join|book|call|sign up|register|subscribe|купить|заказать|связаться|написать|позвонить|оставить заявку|записаться|получить|начать|вступить)/i;
const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{8,}\d)/g;
const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const ADDRESS_PATTERN = /\b(ул\.|улица|проспект|пр\.|бульвар|пер\.|дом|street|st\.|avenue|ave\.|road|rd\.|city|город)\b/gi;
const TRUST_PATTERN =
  /(отзывы|кейсы|клиенты|гарант|сертификат|договор|портфолио|reviews|testimonials|case studies|clients|guarantee|portfolio)/i;
const MESSENGER_PATTERN = /(t\.me|telegram|wa\.me|whatsapp|vk\.com|vkvideo|viber)/i;
const AUTHOR_PATTERN =
  /\b(author|byline|written by|editor|редактор|автор|эксперт|подготовил|подготовила)\b/i;
const ABOUT_PATTERN = /\b(about|about us|company|team|о нас|о компании|команда)\b/i;
const CONTACT_PATTERN = /\b(contact|contacts|support|help|контакт|контакты|связаться|поддержка)\b/i;
const REFERENCE_PATTERN =
  /\b(source|sources|reference|references|research|study|docs|documentation|источник|источники|исследование|документац)\b/i;
const QUESTION_HEADING_PATTERN = /(\?|как|что|зачем|почему|когда|где|how|what|why|when|where)$/i;
const DEFINITION_LEAD_PATTERN =
  /\b(это|представляет собой|означает|is|are|refers to|defined as|helps|allows|lets)\b/i;
const LEGAL_PATTERNS = {
  offer: /\b(oferta|offer|terms|условия|оферт|пользовательское соглашение)\b/i,
  privacy: /\b(privacy|policy|политика конфиденциальности|обработка персональных данных|privacy policy)\b/i,
  cookies: /\b(cookie|cookies|куки|cookies policy)\b/i,
  payment: /\b(payment|оплат[аы]|billing|тариф|price rules)\b/i,
  delivery: /\b(delivery|shipping|доставк)\b/i,
  guarantee: /\b(guarantee|warranty|гарант)\b/i,
  requisites: /\b(requisites|реквизит|инн|огрн)\b/i,
};
const REGION_PATTERN =
  /\b(москва|санкт[-\s]?петербург|петербург|спб|казань|екатеринбург|новосибирск|краснодар|нижний новгород|ростов-на-дону|самара|россия|рф|московская область|ленинградская область|область|край|республика|район)\b/gi;

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

function normalizedTextKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
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
      if (type === 'FAQPage' && !node.mainEntity) {
        completenessIssues.push('FAQPage missing mainEntity');
      }
      if (type === 'HowTo' && !node.step && !node.totalTime) {
        completenessIssues.push('HowTo missing steps or totalTime');
      }
      if (type === 'Person' && !node.name) {
        completenessIssues.push('Person missing name');
      }
      if (type === 'Service' && !node.name) {
        completenessIssues.push('Service missing name');
      }
      if (type === 'WebSite') {
        if (!node.name) completenessIssues.push('WebSite missing name');
        if (!node.url) completenessIssues.push('WebSite missing url');
      }
      if (type === 'WebPage' && !node.name && !node.headline) {
        completenessIssues.push('WebPage missing name or headline');
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
    hasFAQPage: Boolean(typeCounts.FAQPage),
    hasHowTo: Boolean(typeCounts.HowTo),
    hasPerson: Boolean(typeCounts.Person),
    hasService: Boolean(typeCounts.Service),
    hasWebPage: Boolean(typeCounts.WebPage),
    hasWebSite: Boolean(typeCounts.WebSite),
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
  const messengerLinks = links.filter(
    (link) => MESSENGER_PATTERN.test(link.rawHref || '') || MESSENGER_PATTERN.test(link.href || '')
  );
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
    messengerLinks: messengerLinks.length,
    messengerSamples: messengerLinks.slice(0, 8).map((link) => link.href || link.rawHref),
  };
}

function imageFormat(src) {
  const match = String(src || '').toLowerCase().match(/\.([a-z0-9]+)(?:$|\?)/);
  return match?.[1] || '';
}

function countQuestionLikeHeadings(headings) {
  return headings.filter((heading) => QUESTION_HEADING_PATTERN.test(String(heading || '').trim())).length;
}

function looksLikeDefinitionIntro(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  const words = wordCount(normalized);
  if (!normalized || words < 12 || words > 80) {
    return false;
  }

  return DEFINITION_LEAD_PATTERN.test(normalized);
}

function detectAuthorSignals($, pageUrl, bodyText) {
  const metaAuthor = $('meta[name="author"]').attr('content')?.trim() || '';
  const bylineNode = $('[rel="author"], [itemprop="author"], .author, .byline, [class*="author"], [class*="byline"]').first();
  const bylineText = extractText(bylineNode);
  const authorLink = $('a[rel="author"], a[href*="/author"], a[href*="/authors"], a[href*="/team"]').first();
  const authorHref = authorLink.attr('href') || '';
  const bodyHasAuthorCue = AUTHOR_PATTERN.test(bodyText.slice(0, 3000));

  return {
    authorBylinePresent: Boolean(metaAuthor || bylineText || bodyHasAuthorCue),
    authorName: metaAuthor || bylineText || '',
    authorLinkPresent: Boolean(authorHref),
    authorLink: normalizeUrl(authorHref, pageUrl) || '',
  };
}

function detectDateSignals($) {
  const published =
    $('meta[property="article:published_time"]').attr('content')?.trim() ||
    $('meta[name="article:published_time"]').attr('content')?.trim() ||
    $('meta[itemprop="datePublished"]').attr('content')?.trim() ||
    $('time[datetime]').first().attr('datetime')?.trim() ||
    '';
  const modified =
    $('meta[property="article:modified_time"]').attr('content')?.trim() ||
    $('meta[name="article:modified_time"]').attr('content')?.trim() ||
    $('meta[itemprop="dateModified"]').attr('content')?.trim() ||
    $('time[datetime]').last().attr('datetime')?.trim() ||
    '';

  return {
    datePublishedPresent: Boolean(published),
    dateModifiedPresent: Boolean(modified),
    datePublished: published,
    dateModified: modified,
  };
}

function detectLegalSignals(links) {
  const categories = Object.entries(LEGAL_PATTERNS).reduce((acc, [key, pattern]) => {
    const matched = links.filter((link) => pattern.test(`${link.text} ${link.rawHref} ${link.href}`));
    acc[key] = {
      count: matched.length,
      samples: matched.slice(0, 3).map((link) => link.href || link.rawHref || link.text),
    };
    return acc;
  }, {});

  const matchedLinks = Object.values(categories).flatMap((entry) => entry.samples);

  return {
    categories,
    total: [...new Set(matchedLinks)].length,
  };
}

function detectRegionSignals(text) {
  const matches = String(text || '').match(REGION_PATTERN) || [];
  const normalized = [...new Set(matches.map((item) => String(item).trim().toLowerCase()))];
  return {
    regionMentionCount: normalized.length,
    regionMentionSamples: normalized.slice(0, 8),
  };
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
  const referenceLinks = links.filter((link) => {
    const href = String(link.href || '');
    const rawHref = String(link.rawHref || '');
    const text = String(link.text || '');
    return (
      REFERENCE_PATTERN.test(text) ||
      /wikipedia\.org|github\.com|developer\.mozilla\.org|schema\.org|w3\.org|developers\.google\.com|support\.google\.com/i.test(
        href
      ) ||
      /\/docs|\/documentation|\/guide|\/research|\/study/i.test(rawHref)
    );
  });
  const ctaButtons = $('button, input[type="submit"], input[type="button"], a[role="button"]')
    .map((_, element) => extractText($(element)) || $(element).attr('value') || '')
    .get()
    .filter(Boolean);
  const schema = summarizeSchema(jsonLd);
  const contactSignals = detectContactSignals(bodyText, links);
  const authorSignals = detectAuthorSignals($, pageUrl, bodyText);
  const dateSignals = detectDateSignals($);
  const legalSignals = detectLegalSignals(links);
  const regionSignals = detectRegionSignals(`${title} ${description} ${bodyText}`);
  const headingTexts = Object.values(headings).flat();
  const questionHeadingCount = countQuestionLikeHeadings(headingTexts);
  const headingFrequency = headingTexts.reduce((acc, heading) => {
    const key = normalizedTextKey(heading);
    if (!key) return acc;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const repeatedHeadings = Object.entries(headingFrequency)
    .filter(([, count]) => count > 1)
    .map(([text, count]) => ({ text, count }));
  const trustMentions = [
    ...new Set(
      bodyText
        .split(/(?<=[.!?])\s+/)
        .filter((line) => TRUST_PATTERN.test(line))
        .map((line) => truncate(line, 120))
    ),
  ];
  const forms = $('form').length;
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
  const shortParagraphCount = paragraphs.filter((paragraph) => wordCount(paragraph) > 0 && wordCount(paragraph) < 8).length;
  const longParagraphCount = paragraphs.filter((paragraph) => wordCount(paragraph) > 120).length;
  const firstParagraph = firstNonEmpty(paragraphs);
  const definitionLikeIntro = looksLikeDefinitionIntro(firstParagraph);
  const aboutLink = links.find((link) => ABOUT_PATTERN.test(link.text) || ABOUT_PATTERN.test(link.rawHref));
  const contactLink = links.find((link) => CONTACT_PATTERN.test(link.text) || CONTACT_PATTERN.test(link.rawHref));
  const listBlockCount = $('ul, ol, dl').length;
  const tableCount = $('table').length;
  const chunkableSectionCount = (headings.h2?.length || 0) + (headings.h3?.length || 0) + listBlockCount + tableCount;

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
    firstParagraph,
    contentSignals: {
      paragraphCount: paragraphs.length,
      mainWordCount,
      bodyWordCount,
      mainContentRatio: bodyWordCount > 0 ? Number((mainWordCount / bodyWordCount).toFixed(2)) : 0,
      ctaCount: ctaLinks.length,
      ctaSamples: ctaLinks.slice(0, 8).map((link) => link.text),
      buttonCount: ctaButtons.length,
      buttonSamples: ctaButtons.slice(0, 8),
      shortParagraphCount,
      longParagraphCount,
      repeatedHeadingCount: repeatedHeadings.length,
      repeatedHeadingSamples: repeatedHeadings.slice(0, 6),
      trustMarkerCount: trustMentions.length,
      trustMarkerSamples: trustMentions.slice(0, 6),
      formCount: forms,
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
      hasFAQPage: schema.hasFAQPage,
      hasHowTo: schema.hasHowTo,
      hasPerson: schema.hasPerson,
      hasService: schema.hasService,
      hasWebPage: schema.hasWebPage,
      hasWebSite: schema.hasWebSite,
    },
    resourceSignals: {
      inlineScriptBytes: scripts.filter((script) => script.inline).reduce((sum, script) => sum + script.size, 0),
      inlineStyleBytes,
    },
    geoSignals: {
      questionHeadingCount,
      faqSchemaCount: schema.typeCounts.FAQPage || 0,
      howToSchemaCount: schema.typeCounts.HowTo || 0,
      personSchemaCount: schema.typeCounts.Person || 0,
      serviceSchemaCount: schema.typeCounts.Service || 0,
      webPageSchemaCount: schema.typeCounts.WebPage || 0,
      webSiteSchemaCount: schema.typeCounts.WebSite || 0,
      authorBylinePresent: authorSignals.authorBylinePresent,
      authorName: authorSignals.authorName,
      authorLinkPresent: authorSignals.authorLinkPresent,
      authorLink: authorSignals.authorLink,
      datePublishedPresent: dateSignals.datePublishedPresent,
      dateModifiedPresent: dateSignals.dateModifiedPresent,
      datePublished: dateSignals.datePublished,
      dateModified: dateSignals.dateModified,
      referenceLinkCount: referenceLinks.length,
      referenceLinkSamples: referenceLinks.slice(0, 8).map((link) => ({
        href: link.href,
        text: link.text,
      })),
      aboutLinkPresent: Boolean(aboutLink),
      aboutLink: aboutLink?.href || '',
      contactLinkPresent: Boolean(contactLink),
      contactLink: contactLink?.href || '',
      listBlockCount,
      tableCount,
      definitionLikeIntro,
      chunkableSectionCount,
    },
    legalSignals,
    regionSignals,
  };
}

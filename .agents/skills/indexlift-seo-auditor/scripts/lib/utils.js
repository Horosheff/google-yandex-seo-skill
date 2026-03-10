import path from 'path';
import { VALID_ENGINES } from './constants.js';

export function normalizeUrl(rawUrl, baseUrl = null) {
  try {
    const url = baseUrl ? new URL(rawUrl, baseUrl) : new URL(rawUrl);
    url.hash = '';

    if ((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443')) {
      url.port = '';
    }

    if (!url.pathname) {
      url.pathname = '/';
    }

    // Sort query params for stable matching.
    const sorted = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    url.search = '';
    for (const [key, value] of sorted) {
      url.searchParams.append(key, value);
    }

    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.slice(0, -1);
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function sameOrigin(urlA, urlB) {
  try {
    const a = new URL(urlA);
    const b = new URL(urlB);
    return a.origin === b.origin;
  } catch {
    return false;
  }
}

export function parseEngines(rawEngines) {
  if (!rawEngines) {
    return [...VALID_ENGINES];
  }

  const parsed = rawEngines
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const unique = [...new Set(parsed.filter((engine) => VALID_ENGINES.includes(engine)))];
  return unique.length > 0 ? unique : [...VALID_ENGINES];
}

export function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'audit';
}

export function summarizeSeverity(status) {
  if (status === 'FAIL') return 'high';
  if (status === 'WARN') return 'medium';
  if (status === 'PASS') return 'low';
  return 'info';
}

export function createFinding({
  id,
  title,
  category,
  status,
  scope = 'site',
  engines = [],
  severity = summarizeSeverity(status),
  url = null,
  value = null,
  details = '',
  recommendation = '',
  evidence = [],
}) {
  return {
    id,
    title,
    category,
    status,
    scope,
    engines,
    severity,
    url,
    value,
    details,
    recommendation,
    evidence,
  };
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'N/A';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function gradeScore(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

export function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

export function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

export function truncate(value, maxLength = 160) {
  if (!value || value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

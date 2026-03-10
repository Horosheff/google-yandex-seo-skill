import { DEFAULT_USER_AGENT, MAX_REDIRECTS } from '../constants.js';
import { normalizeUrl } from '../utils.js';

function buildHeaders(extraHeaders = {}) {
  return {
    'user-agent': DEFAULT_USER_AGENT,
    accept: 'text/html,application/xhtml+xml,application/xml,text/plain;q=0.9,*/*;q=0.8',
    ...extraHeaders,
  };
}

async function fetchOnce(url, { method = 'GET', headers = {}, body = undefined } = {}) {
  return fetch(url, {
    method,
    headers: buildHeaders(headers),
    body,
    redirect: 'manual',
  });
}

export async function fetchWithRedirects(inputUrl, options = {}) {
  const redirectChain = [];
  let currentUrl = normalizeUrl(inputUrl);
  let redirects = 0;
  const method = options.method || 'GET';
  const startedAt = Date.now();

  if (!currentUrl) {
    throw new Error(`Invalid URL: ${inputUrl}`);
  }

  while (redirects <= (options.maxRedirects || MAX_REDIRECTS)) {
    const response = await fetchOnce(currentUrl, options);
    const headers = Object.fromEntries(response.headers.entries());
    const location = headers.location ? normalizeUrl(headers.location, currentUrl) : null;
    const isRedirect = response.status >= 300 && response.status < 400 && location;

    redirectChain.push({
      url: currentUrl,
      status: response.status,
      location,
    });

    if (!isRedirect) {
      const text = method === 'HEAD' ? '' : await response.text();
      return {
        url: inputUrl,
        finalUrl: currentUrl,
        status: response.status,
        ok: response.ok,
        headers,
        body: text,
        redirectChain,
        timingMs: Date.now() - startedAt,
      };
    }

    currentUrl = location;
    redirects += 1;
  }

  throw new Error(`Too many redirects while fetching ${inputUrl}`);
}

export async function fetchText(url, options = {}) {
  return fetchWithRedirects(url, {
    ...options,
    headers: {
      accept: 'text/plain,application/xml,text/html;q=0.9,*/*;q=0.8',
      ...(options.headers || {}),
    },
  });
}

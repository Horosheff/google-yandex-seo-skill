export const DEFAULT_USER_AGENT =
  'IndexLiftBot/1.0 (+https://github.com/indexlift/indexlift-seo-auditor) Mozilla/5.0 compatible';

export const TIER_CONFIG = {
  basic: {
    maxPages: 1,
    maxDepth: 0,
  },
  standard: {
    maxPages: 5,
    maxDepth: 2,
  },
  pro: {
    maxPages: 50,
    maxDepth: 4,
  },
};

export const SCORE_WEIGHTS = {
  technical: 35,
  on_page: 30,
  engine: 15,
  performance: 20,
};

export const VALID_ENGINES = ['google', 'yandex'];
export const VALID_AUDIT_MODES = ['single-page', 'crawl'];

export const STATUS_SCORES = {
  PASS: 1,
  WARN: 0.5,
  FAIL: 0,
};

export const MAX_REDIRECTS = 10;
export const MAX_SITEMAPS = 10;

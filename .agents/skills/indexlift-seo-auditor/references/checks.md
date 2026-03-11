# Check Inventory

## Technical SEO

- HTTPS entry URL
- `robots.txt` availability
- sitemap discovery
- page response status
- redirect chains
- canonical presence
- canonical conflicts
- `meta robots` and `x-robots-tag`
- mixed content
- robots blocking conflicts
- HTML `lang` attribute
- charset declaration
- response time
- HTML payload size

## On-Page SEO

- title presence
- title length
- title and H1 alignment
- meta description presence
- meta description length
- title and description alignment
- single H1
- heading hierarchy
- thin content
- main-content ratio vs template text
- image alt text
- lazy loading hints
- internal anchor quality
- generic anchor text detection
- image width/height presence
- contact-signal visibility for commercial/local pages
- Open Graph and Twitter metadata
- favicon presence

## Google-Specific

- canonical alignment
- hreflang coverage where relevant
- JSON-LD validity
- structured data coverage
- schema completeness heuristics
- breadcrumb markup coverage
- viewport presence

## Yandex-Specific

- robots availability
- sitemap availability
- canonical consistency
- markup or preview metadata availability
- markup completeness heuristics
- JSON-LD validity
- local/business signal visibility
- document size limit check

## Performance Signals

- HTML response time
- HTML weight
- asset request pressure
- heavy HTML pages
- script pressure
- inline script bloat
- inline style bloat
- image pressure
- missing image dimension performance hints
- Core Web Vitals not directly measured in the free local build

## Scoring

Weighted categories:

- Technical SEO: 35%
- On-Page SEO: 30%
- Engine Signals: 15%
- Performance: 20%

Status handling:

- `PASS`: full credit
- `WARN`: half credit
- `FAIL`: zero credit
- `N/A`: excluded from the denominator

Confidence handling:

- `high`: broad set of applicable page-level checks
- `medium`: moderate coverage with some heuristic limits
- `low`: sparse coverage, so the score should be treated cautiously

Built-in scope limits:

- raw HTML and local parsing only
- no browser-rendered DOM
- no Core Web Vitals field/lab data
- no backlinks, SERP, competitor, or off-page datasets

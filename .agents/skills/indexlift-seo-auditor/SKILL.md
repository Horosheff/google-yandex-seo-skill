---
name: indexlift-seo-auditor
description: Use this skill when the user wants an SEO audit, technical SEO review, crawl analysis, Google Search analysis, Yandex SEO analysis, robots.txt or sitemap validation, canonical/indexability checks, or a client-ready SEO report. It is designed for crawl-based website audits with actionable findings, JSON and Markdown deliverables, and separate Google/Yandex breakdowns, even if the user does not explicitly mention "skill", "audit", or "SEO tool".
license: MIT
compatibility:
  requires:
    - node
    - npm
metadata:
  category: seo
  engines:
    - google
    - yandex
---

# IndexLift SEO Auditor

## When To Use

Use this skill when the user asks to:

- audit a site or landing page for SEO
- check technical SEO, on-page SEO, crawlability, or indexability
- validate `robots.txt`, sitemaps, canonicals, redirects, or metadata
- analyze a site for Google and Yandex SEO
- generate a structured SEO report with priorities and fixes

Do not use this skill for backlink research, SERP monitoring, or competitor gap analysis unless the user explicitly provides external data or asks for placeholders. The bundled implementation marks those as `N/A`.

## What This Skill Does

This skill runs a crawl-based SEO audit and produces:

- raw JSON findings
- a Markdown report
- category scores for technical SEO, on-page SEO, engine-specific signals, and lightweight performance signals
- separate Google and Yandex findings

## Quick Start

From the skill directory, run:

```bash
cd .agents/skills/indexlift-seo-auditor
npm install
node scripts/run-audit.js --url "https://example.com" --tier standard --output ./deliverables/
```

## Workflow

1. Confirm the start URL and desired tier if the user did not specify them.
2. Run the audit script:

```bash
cd .agents/skills/indexlift-seo-auditor
npm install
node scripts/run-audit.js --url "<URL>" --tier standard --engines google,yandex --output ./deliverables/
```

3. Read the generated Markdown report and JSON artifact if you need to summarize or further analyze the output.
4. Present findings ordered by impact:
   - crawl/indexability failures first
   - metadata and canonical issues next
   - Google/Yandex-specific gaps next
   - performance and optional modules last

## Tier Guidance

- `basic`: up to 1 page
- `standard`: up to 5 pages
- `pro`: up to 50 pages and optional-module placeholders

## Output Expectations

When reporting results to the user:

- distinguish general SEO findings from Google-specific and Yandex-specific findings
- do not claim off-page data was collected if it was not
- treat zero crawl coverage as a real failure, not a successful audit
- prefer concise, actionable fixes over generic SEO advice

## Included Files

- For install and usage guidance, see [references/install.md](references/install.md)
- For the current check inventory and scoring model, see [references/checks.md](references/checks.md)

---
name: indexlift-seo-auditor
description: Use this skill when the user wants an SEO audit, technical SEO review, page-level Google or Yandex analysis, robots.txt or sitemap validation, canonical/indexability checks, or a client-ready SEO report. It is designed for ultra-detailed single-page audits by default, with actionable findings, JSON and Markdown deliverables, and separate Google/Yandex breakdowns, even if the user does not explicitly mention "skill", "audit", or "SEO tool".
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

Do not use this skill for backlink research, SERP monitoring, competitor gap analysis, or any workflow that requires paid external APIs. This build is intentionally limited to the free local tools bundled in the repository.

## What This Skill Does

This skill runs an ultra-detailed single-page SEO audit by default and produces:

- raw JSON findings
- a Markdown report
- category scores for technical SEO, on-page SEO, engine-specific signals, and lightweight performance signals
- separate Google and Yandex findings
- a page snapshot with exact counts for links, headings, images, assets, and metadata
- lightweight content-quality heuristics such as opening-copy clarity, paragraph balance, and heading repetition
- lightweight local-business heuristics such as contact reachability, messenger presence, conversion paths, and trust markers
- a business-oriented priority layer that highlights what to fix first for more leads and stronger trust
- a lightweight GEO layer that highlights what already helps AI answer engines, what is missing, and what to fix first

## Quick Start

From the skill directory, run:

```bash
cd .agents/skills/indexlift-seo-auditor
npm install
node scripts/run-audit.js --url "https://example.com" --tier standard --output ./deliverables/
```

The default mode is `single-page`. Use `--mode crawl` only when the user explicitly wants a broader internal-link crawl.

## Workflow

1. Confirm the target URL and desired tier if the user did not specify them.
2. Run the audit script:

```bash
cd .agents/skills/indexlift-seo-auditor
npm install
node scripts/run-audit.js --url "<URL>" --tier standard --engines google,yandex --output ./deliverables/
```

1. Read the generated Markdown report and JSON artifact if you need to summarize or further analyze the output.
2. Present findings ordered by impact:
   - direct page failures first
   - metadata, heading, and image issues next
   - Google/Yandex-specific gaps next
   - performance and context-only notes last
3. Answer in the same language the user is currently using in the conversation unless they explicitly ask for another language.
4. After giving the short summary, offer the user the full report and mention that the complete Markdown report and JSON artifact are available if they want the full version.

## Mode Guidance

- `single-page`: default mode, best for the most detailed audit of one URL
- `crawl`: optional mode for broader internal-link exploration when explicitly needed

## Tier Guidance

- `basic`: lightweight single-page audit
- `standard`: full single-page audit with detailed report layers
- `pro`: same single-page default with a broader reporting envelope, but still only free local checks

## Output Expectations

When reporting results to the user:

- distinguish page-level findings from context-only site signals
- distinguish general SEO findings from Google-specific and Yandex-specific findings
- do not claim off-page or paid-API data was collected if it was not
- treat zero page coverage as a real failure, not a successful audit
- prefer concise, actionable fixes over generic SEO advice
- call out content clarity, business trust, and conversion friction when those lightweight signals are visible in HTML
- distinguish HTML-only GEO heuristics from real-world citation tracking or LLM visibility measurements
- keep the final explanation in the same language the user used with the agent unless they explicitly request a different language
- after the short answer, offer the full report and tell the user that the complete Markdown report and JSON artifact can be provided or opened on request

## Included Files

- For install and usage guidance, see [references/install.md](references/install.md)
- For the current check inventory and scoring model, see [references/checks.md](references/checks.md)

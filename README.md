# IndexLift SEO Auditor

Portable SEO audit skill for agents. Designed for `Cursor`, `Agent Skills`-compatible clients, and OpenClaw-style workflows.

This repository contains **one thing**: a reusable skill package that runs crawl-based SEO audits with separate Google and Yandex checks and produces JSON + Markdown deliverables.

## What It Is

`IndexLift SEO Auditor` is a skill-first package, not an agent platform.

It includes:

- a standard `Agent Skills` skill directory
- a bundled audit script
- a self-contained crawl and scoring runtime inside the skill folder
- installation docs for Cursor and compatible clients

It does **not** pretend to include:

- backlink APIs
- competitor intelligence
- live SERP scraping
- a dashboard or business automation platform

Those are intentionally left out or reported as `N/A`.

## Quick Start

```bash
cd .agents/skills/indexlift-seo-auditor
npm install
node scripts/run-audit.js --url "https://example.com" --tier standard --output ./deliverables/
```

## Cursor Install

Cursor supports both `.agents/skills/` and `.cursor/skills/`, so this repo already uses a compatible layout.

### Option 1: Open the repo directly

1. Clone the repository.
2. Open it in Cursor.
3. Cursor will discover the skill from `.agents/skills/indexlift-seo-auditor/`.

### Option 2: Install globally for Cursor

Copy the skill folder to:

```text
~/.cursor/skills/indexlift-seo-auditor/
```

The skill is self-contained, so you can copy just the `indexlift-seo-auditor` folder if you prefer.

## OpenClaw / Compatible Clients

Use the same skill folder:

```text
.agents/skills/indexlift-seo-auditor/
```

or copy it into the client’s skills directory if your runtime expects a custom path.

## What The Audit Covers

- Technical SEO: HTTPS, robots, sitemaps, redirects, canonicals, directives, mixed content, crawl errors
- On-page SEO: title, description, headings, thin content, image alt text, internal anchors, social metadata
- Google-specific signals: canonical alignment, hreflang, JSON-LD validity, viewport, structured data coverage
- Yandex-specific signals: robots, sitemap presence, canonical consistency, markup coverage, document size constraints
- Lightweight performance signals: HTML timing, HTML weight, resource pressure, script pressure

## Repository Layout

```text
.agents/
  skills/
    indexlift-seo-auditor/
      package.json
      SKILL.md
      scripts/
        run-audit.js
        lib/
      references/
        install.md
        checks.md
README.md
LICENSE
```

## Publishing Notes

This repository is ready to be published as a GitHub repository for:

- direct cloning
- Cursor discovery from `.agents/skills/`
- manual global install into `~/.cursor/skills/`
- reuse by other `Agent Skills`-compatible clients

## License

[MIT](LICENSE)

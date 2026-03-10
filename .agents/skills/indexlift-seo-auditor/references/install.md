# Install Guide

## Cursor

Cursor discovers skills from both `.agents/skills/` and `.cursor/skills/`, so this repository is already laid out in a compatible format.

### Fastest local setup

1. Clone the repository.
2. Open the repository in Cursor.
3. Confirm that the skill appears under Agent skills or Rules.
4. Run the script from the repository root when needed:

```bash
cd .agents/skills/indexlift-seo-auditor
npm install
node scripts/run-audit.js --url "https://example.com" --tier standard --output ./deliverables/
```

### Manual global install for Cursor

Copy the `indexlift-seo-auditor` folder into:

```text
~/.cursor/skills/indexlift-seo-auditor/
```

The skill is self-contained, so you can copy only the `indexlift-seo-auditor` folder if you want a global install.

## OpenClaw-style clients

Place the same skill folder into the client's skills directory, for example:

```text
<client-workspace>/skills/indexlift-seo-auditor/
```

Then run the bundled script from the repository root or expose it through the client:

```bash
cd <client-workspace>/skills/indexlift-seo-auditor
npm install
node scripts/run-audit.js --url "https://example.com"
```

## Requirements

- Node.js 18+
- npm

Install dependencies once per clone:

```bash
cd .agents/skills/indexlift-seo-auditor
npm install
```

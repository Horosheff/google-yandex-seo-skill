#!/usr/bin/env node
import { runAudit, writeAuditArtifacts } from './lib/index.js';

function parseArgs(argv) {
  const args = {
    mode: 'single-page',
    tier: 'standard',
    engines: 'google,yandex',
    format: 'both',
  };

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];

    if (token === '--url' && next) {
      args.url = next;
      index += 1;
    } else if (token === '--output' && next) {
      args.output = next;
      index += 1;
    } else if (token === '--tier' && next) {
      args.tier = next;
      index += 1;
    } else if (token === '--mode' && next) {
      args.mode = next;
      index += 1;
    } else if (token === '--engines' && next) {
      args.engines = next;
      index += 1;
    } else if (token === '--format' && next) {
      args.format = next;
      index += 1;
    } else if (token === '--max-pages' && next) {
      args.maxPages = Number(next);
      index += 1;
    } else if (token === '--max-depth' && next) {
      args.maxDepth = Number(next);
      index += 1;
    }
  }

  if (!args.url) {
    throw new Error(
      'Usage: node ".agents/skills/indexlift-seo-auditor/scripts/run-audit.js" --url <URL> [--mode single-page|crawl] [--tier basic|standard|pro] [--output path]'
    );
  }

  return args;
}

async function main() {
  const options = parseArgs(process.argv);
  console.log('\n  IndexLift SEO Auditor');
  console.log(`  Auditing: ${options.url}`);
  console.log(`  Mode:     ${options.mode}`);
  console.log(`  Tier:     ${options.tier}`);
  console.log(`  Engines:  ${options.engines}\n`);

  const auditResult = await runAudit(options);
  const artifacts = await writeAuditArtifacts(auditResult, options);

  console.log(`  Pages crawled: ${auditResult.crawlSummary.pagesCrawled}`);
  console.log(`  Overall score: ${auditResult.scores.overall.score}/100 (${auditResult.scores.overall.grade})`);
  console.log(`  Failures:      ${auditResult.findings.filter((finding) => finding.status === 'FAIL').length}`);
  console.log(`  Warnings:      ${auditResult.findings.filter((finding) => finding.status === 'WARN').length}`);
  console.log(`  Not applicable:${auditResult.findings.filter((finding) => finding.status === 'N/A').length}`);
  if (artifacts.markdownPath) {
    console.log(`  Markdown:      ${artifacts.markdownPath}`);
  }
  if (artifacts.jsonPath) {
    console.log(`  JSON:          ${artifacts.jsonPath}`);
  }
  console.log();
}

main().catch((error) => {
  console.error(`\n  Error: ${error.message}\n`);
  process.exit(1);
});

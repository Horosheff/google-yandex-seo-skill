export function renderJsonArtifact(auditResult) {
  return {
    metadata: auditResult.metadata,
    crawl: auditResult.crawlSummary,
    pages: auditResult.pages,
    duplicates: auditResult.duplicates,
    findings: auditResult.findings,
    scores: auditResult.scores,
    optional_modules: auditResult.optionalModules,
  };
}

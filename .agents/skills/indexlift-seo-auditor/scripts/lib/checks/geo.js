import { createFinding } from '../utils.js';

export function buildGeoFindings(context) {
  const { page, pageSnapshot } = context;
  if (!page || !page.parsed || !pageSnapshot) {
    return [
      createFinding({
        id: 'geo-coverage',
        title: 'GEO checks require a fetched HTML page',
        category: 'geo',
        scope: 'page',
        status: 'N/A',
        value: 'No fetched HTML page',
        details: 'No HTML page was available, so answerability, citation, and AI-friendly structure checks could not run.',
        recommendation: 'Restore crawl access or audit a reachable URL to enable GEO analysis.',
      }),
    ];
  }

  const geo = pageSnapshot.geo_signals || {};
  const semantics = pageSnapshot.semantics || {};
  const structured = pageSnapshot.structured_data || {};
  const business = pageSnapshot.business_signals || {};
  const headingCounts = pageSnapshot.headings?.counts || {};
  const hasEntitySchema =
    structured.has_local_business ||
    structured.has_organization ||
    structured.has_service ||
    structured.has_person ||
    structured.has_webpage ||
    structured.has_website;
  const answerClarityScore = [
    Boolean(geo.answer_first_paragraph_present),
    Boolean(geo.definition_like_intro),
    (headingCounts.h1 || 0) === 1,
    (semantics.title_h1_overlap || 0) >= 0.3,
    (semantics.main_content_ratio || 0) >= 0.35,
  ].filter(Boolean).length;
  const contentHeavy = (pageSnapshot.word_count || 0) >= 600;
  const businessOrEntityRich =
    business.commercial_or_local_intent ||
    business.phone_count > 0 ||
    business.email_count > 0 ||
    business.trust_marker_count > 0;

  return [
    createFinding({
      id: 'direct-answer-intro',
      title: 'The audited page opens with an answer-friendly introduction for AI systems',
      category: 'geo',
      scope: 'page',
      status: geo.answer_first_paragraph_present && geo.definition_like_intro ? 'PASS' : geo.answer_first_paragraph_present ? 'WARN' : 'FAIL',
      value: geo.answer_first_paragraph_present
        ? geo.definition_like_intro
          ? 'Opening paragraph reads like a direct answer'
          : 'Opening paragraph present but not definition-like'
        : 'No clear opening answer block',
      details:
        geo.answer_first_paragraph_present && geo.definition_like_intro
          ? 'The page opens with a concise paragraph that can be more easily quoted, summarized, or rewritten by AI answer systems.'
          : geo.answer_first_paragraph_present
            ? 'The page has an opening paragraph, but it does not strongly resemble a direct definition or concise answer block.'
            : 'The page does not expose a strong opening paragraph that immediately explains the topic or offer.',
      recommendation:
        geo.answer_first_paragraph_present && geo.definition_like_intro
          ? ''
          : 'Add a 50-150 word opening answer block near the top that clearly defines the topic, promise, or service in plain language.',
      evidence: semantics.first_paragraph ? [semantics.first_paragraph] : [],
    }),
    createFinding({
      id: 'question-led-structure',
      title: 'The audited page includes question-led sections that map to conversational intent',
      category: 'geo',
      scope: 'page',
      status: (geo.question_headings || 0) >= 2 ? 'PASS' : (geo.question_headings || 0) === 1 ? 'WARN' : 'WARN',
      value: `${geo.question_headings || 0} question-like headings`,
      details:
        (geo.question_headings || 0) >= 2
          ? 'The page structure already includes multiple question-led headings that can align well with conversational AI queries.'
          : 'The page exposes few or no explicit question-led headings, so it may map less directly to conversational search prompts.',
      recommendation:
        (geo.question_headings || 0) >= 2
          ? ''
          : 'Turn key subtopics into explicit question-style headings such as what, how, why, pricing, process, or FAQ-style prompts.',
    }),
    createFinding({
      id: 'faq-howto-structured-support',
      title: 'The audited page supports answer extraction with FAQ or HowTo structures',
      category: 'geo',
      scope: 'page',
      status:
        (geo.faq_schema_count || 0) > 0 || (geo.howto_schema_count || 0) > 0
          ? 'PASS'
          : (geo.question_headings || 0) >= 2
            ? 'WARN'
            : 'N/A',
      value: `${geo.faq_schema_count || 0} FAQPage, ${geo.howto_schema_count || 0} HowTo`,
      details:
        (geo.faq_schema_count || 0) > 0 || (geo.howto_schema_count || 0) > 0
          ? 'The page exposes structured FAQ or HowTo signals that can help machines understand reusable answer blocks.'
          : (geo.question_headings || 0) >= 2
            ? 'The page looks like it contains answerable Q&A or process content, but no FAQPage or HowTo schema was detected.'
            : 'The page does not strongly signal FAQ-like or instructional structure in the parsed HTML.',
      recommendation:
        (geo.faq_schema_count || 0) > 0 || (geo.howto_schema_count || 0) > 0 || (geo.question_headings || 0) < 2
          ? ''
          : 'If the page already contains Q&A or step-by-step content, add matching FAQPage or HowTo schema to the visible content.',
    }),
    createFinding({
      id: 'source-citation-support',
      title: 'The audited page gives AI systems source-like references to cite or validate',
      category: 'geo',
      scope: 'page',
      status:
        (geo.reference_links || 0) >= 2
          ? 'PASS'
          : (geo.reference_links || 0) === 1
            ? 'WARN'
            : contentHeavy
              ? 'WARN'
              : 'N/A',
      value: `${geo.reference_links || 0} reference-like links`,
      details:
        (geo.reference_links || 0) >= 2
          ? 'The page includes multiple source-like links that can support citations, verification, or deeper factual context.'
          : (geo.reference_links || 0) === 1
            ? 'The page includes limited source-like references.'
            : contentHeavy
              ? 'The page is content-heavy, but no clear documentation, research, or source links were detected.'
              : 'The page is not content-heavy enough to strongly expect reference-style citations.',
      recommendation:
        (geo.reference_links || 0) >= 2 || (!contentHeavy && (geo.reference_links || 0) === 0)
          ? ''
          : 'Add links to documentation, source material, research, official references, or supporting evidence near factual claims.',
      evidence: geo.reference_link_samples || [],
    }),
    createFinding({
      id: 'author-attribution-visibility',
      title: 'The audited page exposes visible authorship or expert attribution',
      category: 'geo',
      scope: 'page',
      status: geo.author_present ? 'PASS' : contentHeavy ? 'WARN' : 'N/A',
      value: geo.author_name || (geo.author_present ? 'Author cue detected' : 'No author signal detected'),
      details:
        geo.author_present
          ? 'The page exposes a byline, author meta, or visible author cue that can strengthen perceived ownership and expertise.'
          : contentHeavy
            ? 'The page contains substantial content, but no clear author or expert attribution was detected.'
            : 'The page is not strongly article-like, so missing author attribution is less conclusive.',
      recommendation:
        geo.author_present || !contentHeavy
          ? ''
          : 'Add a visible author or expert attribution, and where possible link it to a profile or about page.',
    }),
    createFinding({
      id: 'freshness-signals',
      title: 'The audited page exposes freshness signals that help AI systems judge recency',
      category: 'geo',
      scope: 'page',
      status: geo.date_modified_present || geo.date_published_present ? 'PASS' : contentHeavy ? 'WARN' : 'N/A',
      value: geo.date_modified || geo.date_published || 'No date signals detected',
      details:
        geo.date_modified_present || geo.date_published_present
          ? 'The page exposes publication or modification dates that help communicate recency.'
          : contentHeavy
            ? 'The page contains substantial content, but no obvious publication or modification dates were detected.'
            : 'Date visibility is less critical here because the page does not look strongly article-like.',
      recommendation:
        geo.date_modified_present || geo.date_published_present || !contentHeavy
          ? ''
          : 'Expose publication and/or last-updated dates where the content can age or where recency matters to trust.',
    }),
    createFinding({
      id: 'entity-home-clarity',
      title: 'The audited page clearly identifies the entity behind the content',
      category: 'geo',
      scope: 'page',
      status:
        hasEntitySchema || geo.about_page_link_present || geo.contact_page_link_present || businessOrEntityRich ? 'PASS' : 'WARN',
      value:
        hasEntitySchema
          ? 'Entity schema detected'
          : geo.about_page_link_present || geo.contact_page_link_present
            ? 'About/contact path detected'
            : 'Weak entity signals',
      details:
        hasEntitySchema || geo.about_page_link_present || geo.contact_page_link_present || businessOrEntityRich
          ? 'The page gives at least some machine-readable or visible clues about who owns the content or business behind it.'
          : 'The page exposes weak entity-home signals, which can make AI systems less confident about ownership and authority.',
      recommendation:
        hasEntitySchema || geo.about_page_link_present || geo.contact_page_link_present || businessOrEntityRich
          ? ''
          : 'Expose clearer organization, service, person, about-page, and contact signals so the entity behind the content is easier to identify.',
    }),
    createFinding({
      id: 'chunkable-content-structure',
      title: 'The audited page is structured into reusable chunks for AI summarization',
      category: 'geo',
      scope: 'page',
      status:
        (geo.chunkable_sections || 0) >= 4
          ? 'PASS'
          : (geo.chunkable_sections || 0) >= 2
            ? 'WARN'
            : 'FAIL',
      value: `${geo.chunkable_sections || 0} chunkable sections, ${geo.list_blocks || 0} lists, ${geo.table_blocks || 0} tables`,
      details:
        (geo.chunkable_sections || 0) >= 4
          ? 'The page exposes enough sectioning, lists, or tables to support extraction into short answer blocks.'
          : (geo.chunkable_sections || 0) >= 2
            ? 'The page has some reusable structure, but it may still be harder for AI systems to break into clean answer chunks.'
            : 'The page exposes little obvious chunkable structure such as section blocks, lists, or tables.',
      recommendation:
        (geo.chunkable_sections || 0) >= 4
          ? ''
          : 'Break the page into clearer sections with descriptive H2/H3 headings, short answer blocks, lists, and comparison tables where relevant.',
    }),
    createFinding({
      id: 'geo-schema-coverage',
      title: 'The audited page exposes schema types that help AI systems understand entities and answers',
      category: 'geo',
      scope: 'page',
      status:
        (geo.faq_schema_count || 0) > 0 ||
        (geo.howto_schema_count || 0) > 0 ||
        (geo.person_schema_count || 0) > 0 ||
        (geo.service_schema_count || 0) > 0 ||
        (geo.webpage_schema_count || 0) > 0 ||
        (geo.website_schema_count || 0) > 0
          ? 'PASS'
          : hasEntitySchema
            ? 'WARN'
            : 'FAIL',
      value: structured.schema_types?.join(', ') || 'No schema types detected',
      details:
        (geo.faq_schema_count || 0) > 0 ||
        (geo.howto_schema_count || 0) > 0 ||
        (geo.person_schema_count || 0) > 0 ||
        (geo.service_schema_count || 0) > 0 ||
        (geo.webpage_schema_count || 0) > 0 ||
        (geo.website_schema_count || 0) > 0
          ? 'The page exposes GEO-relevant schema beyond the minimum organization or business layer.'
          : hasEntitySchema
            ? 'The page has some entity schema, but not the richer page-, service-, person-, FAQ-, or HowTo-level markup that can help AI understanding.'
            : 'No useful entity or answer-oriented schema types were detected.',
      recommendation:
        ((geo.faq_schema_count || 0) > 0 ||
          (geo.howto_schema_count || 0) > 0 ||
          (geo.person_schema_count || 0) > 0 ||
          (geo.service_schema_count || 0) > 0 ||
          (geo.webpage_schema_count || 0) > 0 ||
          (geo.website_schema_count || 0) > 0)
          ? ''
          : 'Add the schema types that match the visible page purpose, such as Service, Person, FAQPage, HowTo, WebPage, or WebSite.',
      evidence: structured.schema_completeness_issues?.slice(0, 8) || [],
    }),
    createFinding({
      id: 'answerability-summary-clarity',
      title: 'The audited page is easy to summarize into a clear AI answer',
      category: 'geo',
      scope: 'page',
      status: answerClarityScore >= 4 ? 'PASS' : answerClarityScore >= 2 ? 'WARN' : 'FAIL',
      value: `${answerClarityScore}/5 answerability signals`,
      details:
        answerClarityScore >= 4
          ? 'The page combines strong top-of-page clarity, focused structure, and sufficient main content for concise AI summarization.'
          : answerClarityScore >= 2
            ? 'The page has partial answerability signals, but some important clarity or structure cues are still weak.'
            : 'The page lacks multiple core signals that help machines quickly summarize the page accurately.',
      recommendation:
        answerClarityScore >= 4
          ? ''
          : 'Tighten the title/H1/topic alignment, use one clear H1, add an answer-first intro, and keep the main content visibly focused on one intent.',
    }),
  ];
}

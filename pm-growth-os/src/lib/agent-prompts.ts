export type LearningStage = 'foundational' | 'advancing' | 'mastery';

type LearningPathMap = Record<string, Record<LearningStage, string[]>>;

export const COACH_AGENT_PROMPT = {
  role: 'Coach Agent',
  mission:
    'Turn the current growth map into a focused learn-by-doing path with useful resources, practice prompts, and evidence-ready outputs.',
  workflow: ['Learn', 'Practice', 'Evidence', 'Reflect', 'Next step'],
  nextPromptTemplates: {
    'prompt-engineering': [
      'Which prompt variable changed the result most clearly?',
      'What would you test next if this prompt had to run every week?',
    ],
    'context-engineering': [
      'What context did the model need, and what context created noise?',
      'How would you compress this conversation for the next session?',
    ],
    'agent-design': [
      'Which responsibility belongs to the agent, and which belongs to a tool?',
      'Where should the workflow pause for human review?',
    ],
    'ai-evaluation': [
      'What would make this output pass or fail in a real workflow?',
      'Which metric would catch regressions without creating busywork?',
    ],
    default: [
      'What did this exercise teach you about your current product workflow?',
      'What small repeatable habit would make this skill improve next week?',
    ],
  },
};

export const MCP_TOOLS = {
  webSearch: {
    name: 'Knowledge Tool',
    purpose:
      'Find and structure learning resources so the Coach Agent can guide users through practice, reflection, and evidence saving.',
    searchTemplates: [
      '{capability} official documentation',
      '{capability} practical tutorial',
      '{capability} case study AI product manager',
      '{capability} research paper',
      '{capability} example repository',
    ],
  },
};

const learningPaths: LearningPathMap = {
  'prompt-engineering': {
    foundational: [
      'Learn how instructions, context, examples, and constraints change model output.',
      'Compare three prompt variants on the same product task.',
      'Save the winning pattern as a reusable evidence record.',
    ],
    advancing: [
      'Design a small prompt experiment with a hypothesis and scoring rubric.',
      'Test reasoning, structure, and examples separately.',
      'Turn the result into a prompt pattern for future product work.',
    ],
    mastery: [
      'Create a reusable prompt framework for a recurring PM workflow.',
      'Add evaluation criteria and failure examples.',
      'Document when the framework should not be used.',
    ],
  },
  'context-engineering': {
    foundational: [
      'Identify what context the model needs to complete the task.',
      'Remove redundant context and compare output quality.',
      'Write a compact handoff summary for the next conversation.',
    ],
    advancing: [
      'Separate task instructions, user intent, constraints, and reference material.',
      'Test how much history can be compressed before quality drops.',
      'Create a repeatable context template for PM workflows.',
    ],
    mastery: [
      'Design a retrieval or memory strategy for a multi-session workflow.',
      'Define what should be stored, summarized, or discarded.',
      'Add quality checks for stale or conflicting context.',
    ],
  },
  'agent-design': {
    foundational: [
      'Map a single-agent workflow with input, decision, tool use, and output.',
      'Identify where the user should approve or correct the agent.',
      'Save one agent boundary that improved clarity as evidence.',
    ],
    advancing: [
      'Split a workflow into planner, researcher, executor, and reviewer roles.',
      'Define handoff artifacts between agents.',
      'Test where coordination overhead becomes too high.',
    ],
    mastery: [
      'Design a multi-agent operating loop with observability and fallback paths.',
      'Define tool contracts and state transitions.',
      'Document failure modes and recovery behavior.',
    ],
  },
  'ai-evaluation': {
    foundational: [
      'Write acceptance criteria for one AI output.',
      'Compare two outputs against the same rubric.',
      'Save the metric that best predicts usefulness as evidence.',
    ],
    advancing: [
      'Build a small eval set from real product examples.',
      'Add pass/fail checks and qualitative notes.',
      'Use traces to compare cost, latency, and quality.',
    ],
    mastery: [
      'Design a repeatable evaluation workflow for shipped AI features.',
      'Add regression examples and review thresholds.',
      'Connect evaluation results to roadmap decisions.',
    ],
  },
  'ai-product-strategy': {
    foundational: [
      'Learn how AI capability maps to user value, risk, feasibility, and product timing.',
      'Score one AI opportunity with a lightweight product bet framework.',
      'Save the opportunity thesis and weakest assumption as evidence.',
    ],
    advancing: [
      'Compare multiple AI opportunities against impact, data readiness, risk, and differentiation.',
      'Define the smallest validation path for the strongest opportunity.',
      'Turn the result into a roadmap recommendation.',
    ],
    mastery: [
      'Build an AI product strategy narrative connecting bets, metrics, constraints, and sequencing.',
      'Stress-test the strategy against market, model, data, and adoption risks.',
      'Document the decision logic for future roadmap updates.',
    ],
  },
  'user-research-synthesis': {
    foundational: [
      'Learn how to preserve source evidence while using AI to cluster qualitative signals.',
      'Synthesize a small set of user notes into themes and counterexamples.',
      'Save one traceable insight as evidence.',
    ],
    advancing: [
      'Create a repeatable synthesis workflow for interviews, tickets, or feedback.',
      'Use AI to challenge themes and surface minority signals.',
      'Turn insights into product questions and opportunity areas.',
    ],
    mastery: [
      'Design a research intelligence loop that keeps evidence, summaries, and decisions connected.',
      'Define quality checks for hallucinated or overgeneralized insights.',
      'Document how research synthesis changes roadmap decisions.',
    ],
  },
  'rag-knowledge-systems': {
    foundational: [
      'Learn how retrieval, grounding, source quality, and citations affect AI reliability.',
      'Inventory sources and define which questions they should answer.',
      'Save one retrieval failure or grounding rule as evidence.',
    ],
    advancing: [
      'Design a small retrieval test set from real product questions.',
      'Compare source relevance, citation quality, and stale-content risk.',
      'Turn the results into a RAG quality checklist.',
    ],
    mastery: [
      'Design an end-to-end knowledge system with source ownership, refresh rules, and evals.',
      'Map retrieval failures to product risk.',
      'Document governance for maintaining trusted knowledge.',
    ],
  },
  'tool-orchestration': {
    foundational: [
      'Learn how AI tools need contracts for input, output, permission, and failure.',
      'Map one tool-using workflow with approval points.',
      'Save one tool contract as evidence.',
    ],
    advancing: [
      'Design tool handoffs with retries, fallbacks, and audit logs.',
      'Test one unsafe or ambiguous tool call scenario.',
      'Turn findings into orchestration rules.',
    ],
    mastery: [
      'Create a production-ready tool orchestration map with permissions, monitoring, and recovery.',
      'Review the design for failure propagation and hidden side effects.',
      'Document launch criteria for tool-using agents.',
    ],
  },
  'experimentation-metrics': {
    foundational: [
      'Learn how AI product metrics combine user value, quality, risk, latency, and cost.',
      'Create a metric tree for one AI feature.',
      'Save the leading metric and guardrail as evidence.',
    ],
    advancing: [
      'Design a lightweight experiment with baseline, treatment, and decision rule.',
      'Stress-test the metrics for false positives and metric gaming.',
      'Turn the plan into a product learning loop.',
    ],
    mastery: [
      'Build an AI experimentation system connecting offline evals, online metrics, and roadmap decisions.',
      'Define when to ship, iterate, rollback, or stop.',
      'Document the operating cadence.',
    ],
  },
  'ai-safety-governance': {
    foundational: [
      'Learn how to classify AI product risks across privacy, accuracy, bias, security, and trust.',
      'Create a risk register for one AI scenario.',
      'Save one launch gate as evidence.',
    ],
    advancing: [
      'Define prevention, detection, escalation, and recovery controls.',
      'Red-team one workflow for hidden risks.',
      'Turn findings into a governance checklist.',
    ],
    mastery: [
      'Design a launch-readiness process for AI features with owners and thresholds.',
      'Connect risk controls to product decision making.',
      'Document governance rituals for ongoing monitoring.',
    ],
  },
  'automation-ops': {
    foundational: [
      'Learn how to turn repeated PM workflows into observable automations.',
      'Map one manual workflow with trigger, owner, output, and failure symptoms.',
      'Save one automation opportunity as evidence.',
    ],
    advancing: [
      'Design an automation with human review, logging, rollback, and alerting.',
      'Run a dry test with sample inputs.',
      'Turn failures into an ops checklist.',
    ],
    mastery: [
      'Create an operating model for maintaining AI automations over time.',
      'Define ownership, monitoring, incident response, and change management.',
      'Document the runbook.',
    ],
  },
  'product-storytelling': {
    foundational: [
      'Learn how to explain AI product value without overclaiming capability.',
      'Draft a problem-insight-solution-proof story for one AI update.',
      'Save the improved narrative as evidence.',
    ],
    advancing: [
      'Adapt the story for users, executives, engineering, or GTM audiences.',
      'Add before/after evidence and objections.',
      'Turn it into a release note, demo script, or roadmap update.',
    ],
    mastery: [
      'Build a storytelling system for AI product adoption and stakeholder alignment.',
      'Connect narratives to proof, metrics, risks, and next asks.',
      'Document reusable story patterns.',
    ],
  },
  'multi-agent-collaboration': {
    foundational: [
      'Learn how specialist agents need roles, handoffs, memory, and review boundaries.',
      'Map a two-agent workflow with clear artifacts.',
      'Save one handoff protocol as evidence.',
    ],
    advancing: [
      'Design planner, researcher, executor, and reviewer interactions for one PM workflow.',
      'Identify disagreement and escalation rules.',
      'Turn the design into a testable workflow slice.',
    ],
    mastery: [
      'Create a multi-agent operating loop with observability, permissions, and fallback paths.',
      'Review coordination overhead and failure modes.',
      'Document when multi-agent complexity is justified.',
    ],
  },
};

const keywordMap: Record<string, string[]> = {
  'prompt-engineering': [
    'prompt engineering',
    'prompt design',
    'structured prompting',
    'chain of thought prompting',
  ],
  'context-engineering': [
    'context engineering',
    'context window management',
    'conversation summarization',
    'retrieval augmented generation',
  ],
  'agent-design': [
    'agent design',
    'multi agent workflow',
    'tool calling agents',
    'agent orchestration',
  ],
  'ai-evaluation': [
    'LLM evaluation',
    'AI evaluation rubric',
    'LLM as judge',
    'model tracing',
  ],
  'ai-product-strategy': ['AI product strategy', 'AI product roadmap', 'AI opportunity assessment', 'AI product bets'],
  'user-research-synthesis': ['AI user research synthesis', 'qualitative research AI', 'customer feedback synthesis', 'AI product discovery'],
  'rag-knowledge-systems': ['RAG evaluation', 'retrieval augmented generation product', 'knowledge base AI', 'grounded AI systems'],
  'tool-orchestration': ['AI tool orchestration', 'LLM tool calling', 'agent tool contracts', 'AI workflow APIs'],
  'experimentation-metrics': ['AI product metrics', 'LLM product experimentation', 'AI feature success metrics', 'AI eval online metrics'],
  'ai-safety-governance': ['AI safety governance product', 'AI risk management', 'AI launch readiness', 'responsible AI product'],
  'automation-ops': ['AI workflow automation operations', 'LLM automation monitoring', 'AI ops runbook', 'business process automation AI'],
  'product-storytelling': ['AI product storytelling', 'AI product launch narrative', 'AI demo script', 'AI product adoption'],
  'multi-agent-collaboration': ['multi agent collaboration', 'multi agent workflow', 'agent handoff protocol', 'multi agent systems design'],
};

export function getLearningPath(capabilityId: string, stage: LearningStage) {
  return learningPaths[capabilityId]?.[stage] ?? learningPaths['prompt-engineering'][stage];
}

export function getResourceSearchKeywords(capabilityId: string) {
  return keywordMap[capabilityId] ?? keywordMap['prompt-engineering'];
}

export function generateCoachStepDetail({
  capabilityName,
  stage,
  focusArea,
}: {
  capabilityName: string;
  stage: LearningStage;
  focusArea: string;
}) {
  return [
    `Focus on ${capabilityName} at the ${stage} stage.`,
    `Use ${focusArea} as the working context so the practice stays close to real product work.`,
    'Save one evidence record after the exercise so Growth Map can update.',
  ].join(' ');
}

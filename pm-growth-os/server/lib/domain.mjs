import { randomUUID } from 'node:crypto';

export const initialCapabilities = [
  {
    id: 'prompt-engineering',
    name: 'Prompt Engineering',
    category: 'Skills',
    progress: 0,
    stageLabel: 'Not started',
    summary: 'Start by saving one real prompt experiment or AI product task as evidence.',
    evidenceCount: 0,
    updatedAt: 'Not started',
  },
  {
    id: 'ai-product-strategy',
    name: 'AI Product Strategy',
    category: 'Strategy',
    progress: 0,
    stageLabel: 'Not started',
    summary: 'Connect AI capability choices to user value, market timing, product bets, and measurable outcomes.',
    evidenceCount: 0,
    updatedAt: 'Not started',
  },
  {
    id: 'user-research-synthesis',
    name: 'User Research Synthesis',
    category: 'Discovery',
    progress: 0,
    stageLabel: 'Not started',
    summary: 'Use AI to synthesize interviews, feedback, support tickets, and behavior signals without losing nuance.',
    evidenceCount: 0,
    updatedAt: 'Not started',
  },
  {
    id: 'context-engineering',
    name: 'Context Engineering',
    category: 'Skills',
    progress: 0,
    stageLabel: 'Not started',
    summary: 'Learn how to structure context, memory, and summaries for repeatable AI workflows.',
    evidenceCount: 0,
    updatedAt: 'Not started',
  },
  {
    id: 'rag-knowledge-systems',
    name: 'RAG & Knowledge Systems',
    category: 'Knowledge',
    progress: 0,
    stageLabel: 'Not started',
    summary: 'Design retrieval, grounding, source quality, chunking, and knowledge workflows for reliable AI products.',
    evidenceCount: 0,
    updatedAt: 'Not started',
  },
  {
    id: 'agent-design',
    name: 'Agent Design',
    category: 'Application',
    progress: 0,
    stageLabel: 'Not started',
    summary: 'Map simple agent roles, handoffs, tools, and review points as you learn.',
    evidenceCount: 0,
    updatedAt: 'Not started',
  },
  {
    id: 'tool-orchestration',
    name: 'Tool Orchestration',
    category: 'Tooling',
    progress: 0,
    stageLabel: 'Not started',
    summary: 'Plan how agents call tools, APIs, databases, search, and human checkpoints safely and usefully.',
    evidenceCount: 0,
    updatedAt: 'Not started',
  },
  {
    id: 'ai-evaluation',
    name: 'AI Evaluation',
    category: 'Tooling',
    progress: 0,
    stageLabel: 'Not started',
    summary: 'Define what good AI output means before building complex workflows.',
    evidenceCount: 0,
    updatedAt: 'Not started',
  },
  {
    id: 'experimentation-metrics',
    name: 'Experimentation & Metrics',
    category: 'Evaluation',
    progress: 0,
    stageLabel: 'Not started',
    summary: 'Define success metrics, offline evals, product experiments, and learning loops for AI features.',
    evidenceCount: 0,
    updatedAt: 'Not started',
  },
  {
    id: 'ai-safety-governance',
    name: 'AI Safety & Governance',
    category: 'Governance',
    progress: 0,
    stageLabel: 'Not started',
    summary: 'Identify risk boundaries, policy constraints, privacy concerns, review flows, and launch readiness.',
    evidenceCount: 0,
    updatedAt: 'Not started',
  },
  {
    id: 'automation-ops',
    name: 'Automation Ops',
    category: 'Operations',
    progress: 0,
    stageLabel: 'Not started',
    summary: 'Turn repeated PM workflows into maintainable automations with monitoring, fallback, and ownership.',
    evidenceCount: 0,
    updatedAt: 'Not started',
  },
  {
    id: 'product-storytelling',
    name: 'Product Storytelling',
    category: 'Growth',
    progress: 0,
    stageLabel: 'Not started',
    summary: 'Translate AI product work into narratives, demos, release notes, stakeholder updates, and adoption loops.',
    evidenceCount: 0,
    updatedAt: 'Not started',
  },
  {
    id: 'multi-agent-collaboration',
    name: 'Multi-Agent Collaboration',
    category: 'Application',
    progress: 0,
    stageLabel: 'Not started',
    summary: 'Design specialist agents, handoffs, review loops, and collaboration patterns for complex PM workflows.',
    evidenceCount: 0,
    updatedAt: 'Not started',
  },
];

export const initialCoachPlan = {
  description:
    'Start by saving one real AI product evidence record. The Coach Agent will generate a personalized learning path after your first evidence record or selected skill.',
  steps: [
    {
      id: 'first-note',
      title: 'Step 1: Save your first evidence record',
      detail: 'Open New Evidence and write about one AI product task, question, failure, or insight from today.',
      status: 'active',
    },
    {
      id: 'pick-skill',
      title: 'Step 2: Pick one skill to grow',
      detail: 'Use Growth Map to choose a capability such as Strategy, Research Synthesis, Context Engineering, Agent Design, RAG, Evaluation, or Governance.',
      status: 'todo',
    },
    {
      id: 'generate-learning-path',
      title: 'Step 3: Generate your first learning path',
      detail: 'Use Coach Agent to turn the selected capability into a Learn, Practice, Evidence, Reflect workflow.',
      status: 'todo',
    },
  ],
};

export const initialWeeklySummary = {
  period: 'Your first week',
  progress: ['No progress recorded yet. Save your first evidence record to begin.'],
  nextActions: [
    'Write one real AI product evidence record.',
    'Choose one capability in Growth Map.',
    'Generate a focused learning path with Coach Agent.',
  ],
};

export const initialUserProfile = {
  currentStageLabel: 'New workspace',
  weeklyGoal: 4,
  focusArea: 'Choose your first focus',
  preferredModel: 'Default platform model',
  longTermGoal: 'Build a personal operating system for compounding AI PM capability.',
  savedNotes: 0,
  lastInsight: 'No evidence yet. Start by saving one real AI product moment.',
};

export const initialToolConnectors = [
  {
    id: 'local-ai',
    name: 'Local AI Heuristics',
    category: 'llm',
    method: 'local',
    scope: 'platform',
    status: 'enabled',
    description: 'Runs local evidence inference, learning plan templates, reflection drafting, and token estimates.',
    useCases: ['Evidence suggestions', 'Coach planning fallback', 'Weekly reflection draft'],
    requiredInputs: ['No setup required'],
    enabled: true,
  },
  {
    id: 'web-search',
    name: 'Real Web Search Knowledge Tool',
    category: 'knowledge',
    method: 'mcp',
    scope: 'platform',
    status:
      process.env.TAVILY_API_KEY || process.env.BRAVE_SEARCH_API_KEY || process.env.SERPAPI_API_KEY
        ? 'configured'
        : 'not_connected',
    description: 'Retrieves current learning resources through a server-side search provider.',
    useCases: ['Learning resources', 'Guided practice', 'Knowledge Tool enrichment'],
    requiredInputs: ['TAVILY_API_KEY, BRAVE_SEARCH_API_KEY, or SERPAPI_API_KEY'],
    mcpEndpoint: '/api/knowledge-search',
    accountHint: 'Users do not provide search keys. Configure provider keys in the platform environment.',
    enabled: Boolean(process.env.TAVILY_API_KEY || process.env.BRAVE_SEARCH_API_KEY || process.env.SERPAPI_API_KEY),
  },
  {
    id: 'usage-logs-database',
    name: 'Usage Logs Database',
    category: 'database',
    method: 'env',
    scope: 'platform',
    status: process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? 'configured' : 'needs_account',
    description: 'Stores token, model, cost, latency, and feature usage in Supabase usage_logs.',
    useCases: ['Cost audit', 'Feature usage analytics', 'Metabase dashboards'],
    requiredInputs: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'usage_logs table'],
    enabled: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
  },
  {
    id: 'langfuse-trace-sink',
    name: 'Langfuse Trace Sink',
    category: 'llm',
    method: 'env',
    scope: 'platform',
    status:
      process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_BASE_URL
        ? 'configured'
        : 'needs_account',
    description: 'Forwards usage_logs to Langfuse as trace and generation events.',
    useCases: ['Trace review', 'Generation cost audit', 'Prompt debugging'],
    requiredInputs: ['LANGFUSE_SECRET_KEY', 'LANGFUSE_PUBLIC_KEY', 'LANGFUSE_BASE_URL'],
    accountHint: 'Configure Langfuse keys in the server environment only.',
    enabled: Boolean(
      process.env.LANGFUSE_SECRET_KEY && process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_BASE_URL,
    ),
  },
  {
    id: 'markdown-export',
    name: 'Markdown Export',
    category: 'export',
    method: 'local',
    scope: 'platform',
    status: 'enabled',
    description: 'Exports evidence and generated reviews without an external account.',
    useCases: ['Export evidence', 'Export weekly reviews', 'Copy artifacts'],
    requiredInputs: ['No setup required'],
    enabled: true,
  },
  {
    id: 'notion',
    name: 'Notion',
    category: 'knowledge',
    method: 'account',
    scope: 'user',
    status: 'needs_account',
    description: 'Optional future sync target for evidence and learning summaries.',
    useCases: ['Import historical evidence', 'Export weekly reports', 'Build a knowledge base'],
    requiredInputs: ['Notion integration token', 'Database ID'],
    accountHint: 'Static mode stores this setup hint locally. Real sync requires a serverless connector.',
    enabled: false,
  },
  {
    id: 'github',
    name: 'GitHub',
    category: 'workflow',
    method: 'account',
    scope: 'user',
    status: 'needs_account',
    description: 'Optional future connector for issues, pull requests, and project evidence.',
    useCases: ['Import issue evidence', 'Track shipping evidence', 'Generate project retrospectives'],
    requiredInputs: ['GitHub token or GitHub MCP server'],
    accountHint: 'Static mode does not call GitHub directly. Use this as a local setup note for now.',
    enabled: false,
  },
];

export function createInitialWorkspace() {
  return {
    capabilities: structuredClone(initialCapabilities),
    captureDraft: '',
    captureSuggestions: inferCaptureSuggestions('', initialCapabilities),
    coachPlan: structuredClone(initialCoachPlan),
    modelTraces: [],
    notes: [],
    reflectionDraft: '',
    selectedCapabilityId: initialCapabilities[0]?.id ?? '',
    toolConnectors: structuredClone(initialToolConnectors),
    usageLogs: [],
    weeklySummary: structuredClone(initialWeeklySummary),
    userProfile: structuredClone(initialUserProfile),
    updatedAt: new Date().toISOString(),
  };
}

const rules = [
  {
    capabilityId: 'prompt-engineering',
    tags: ['PromptEngineering'],
    keywords: ['prompt', 'instruction', 'few-shot', 'chain-of-thought', 'cot', 'constraint', 'example'],
  },
  {
    capabilityId: 'ai-product-strategy',
    tags: ['ProductStrategy', 'Roadmap'],
    keywords: ['strategy', 'roadmap', 'opportunity', 'bet', 'positioning', 'market', 'business model'],
  },
  {
    capabilityId: 'user-research-synthesis',
    tags: ['ResearchSynthesis', 'Discovery'],
    keywords: ['research', 'interview', 'feedback', 'insight', 'persona', 'customer', 'survey', 'synthesis'],
  },
  {
    capabilityId: 'context-engineering',
    tags: ['ContextEngineering', 'Memory'],
    keywords: ['context', 'memory', 'state', 'summary', 'retrieval', 'window', 'rag'],
  },
  {
    capabilityId: 'rag-knowledge-systems',
    tags: ['RAG', 'KnowledgeSystems'],
    keywords: ['rag', 'retrieval', 'embedding', 'knowledge base', 'citation', 'grounding', 'source'],
  },
  {
    capabilityId: 'agent-design',
    tags: ['AgentDesign', 'Workflow'],
    keywords: ['agent', 'handoff', 'workflow', 'planner', 'executor', 'reviewer'],
  },
  {
    capabilityId: 'tool-orchestration',
    tags: ['ToolOrchestration', 'Workflow'],
    keywords: ['tool call', 'tool use', 'api', 'mcp', 'connector', 'orchestration', 'automation'],
  },
  {
    capabilityId: 'ai-evaluation',
    tags: ['Evaluation', 'Guardrails'],
    keywords: ['eval', 'evaluation', 'metric', 'trace', 'guardrail', 'quality', 'judge'],
  },
  {
    capabilityId: 'experimentation-metrics',
    tags: ['Experimentation', 'Metrics'],
    keywords: ['experiment', 'ab test', 'baseline', 'conversion', 'activation', 'retention', 'north star'],
  },
  {
    capabilityId: 'ai-safety-governance',
    tags: ['Safety', 'Governance'],
    keywords: ['safety', 'risk', 'privacy', 'security', 'policy', 'compliance', 'governance', 'red team'],
  },
  {
    capabilityId: 'automation-ops',
    tags: ['AutomationOps', 'Operations'],
    keywords: ['ops', 'runbook', 'monitoring', 'alert', 'incident', 'fallback', 'rollback', 'cron'],
  },
  {
    capabilityId: 'product-storytelling',
    tags: ['Storytelling', 'Adoption'],
    keywords: ['story', 'narrative', 'demo', 'launch', 'release note', 'stakeholder', 'adoption'],
  },
  {
    capabilityId: 'multi-agent-collaboration',
    tags: ['MultiAgent', 'Collaboration'],
    keywords: ['multi-agent', 'multi agent', 'specialist agent', 'handoff protocol', 'agent team', 'collaboration'],
  },
];

export function inferCaptureSuggestions(draft, capabilities) {
  const normalizedDraft = draft.toLowerCase();
  const matchedRuleIds = new Set();
  const tags = new Set();

  for (const rule of rules) {
    const hasKeyword = rule.keywords.some((keyword) => normalizedDraft.includes(keyword.toLowerCase()));

    if (hasKeyword) {
      matchedRuleIds.add(rule.capabilityId);
      rule.tags.forEach((tag) => tags.add(tag));
    }
  }

  if (draft.trim().length > 0 && matchedRuleIds.size === 0) {
    matchedRuleIds.add('agent-design');
    tags.add('Reflection');
  }

  const relatedCapabilities = capabilities
    .filter((capability) => matchedRuleIds.has(capability.id))
    .map((capability) => ({
      id: capability.id,
      name: capability.name,
      reason: getReason(capability.id),
    }));

  return {
    tags: Array.from(tags),
    relatedCapabilities,
    confidence: getConfidence(draft, matchedRuleIds.size),
    nextPrompt: getNextPrompt(relatedCapabilities[0]?.id),
  };
}

export function generateCoachPlan({ capabilities, notes, targetCapabilityId, userProfile }) {
  const defaultCapability = capabilities.slice().sort((a, b) => a.progress - b.progress)[0];
  const targetCapability =
    capabilities.find((capability) => capability.id === targetCapabilityId) ?? defaultCapability;
  const strongestCapability = capabilities.slice().sort((a, b) => b.progress - a.progress)[0] ?? targetCapability;
  const recentTopic = notes[0]?.tags[0] ?? userProfile.focusArea;
  const practiceTask = buildPracticeTask(targetCapability, recentTopic);

  return {
    description: [
      `**${targetCapability.name} learning sprint**`,
      `Use one small Learn -> Practice -> Evidence -> Reflect loop to make progress this week.`,
      `Use ${strongestCapability.name} as leverage because it is currently your strongest adjacent capability.`,
    ].join('\n\n'),
    steps: [
      {
        id: 'learn',
        title: 'Learn: define the capability gap',
        detail: `Write the one question about ${targetCapability.name} that feels most uncertain right now.`,
        status: 'active',
      },
      {
        id: 'practice',
        title: 'Practice: run one focused exercise',
        detail: practiceTask,
        status: 'todo',
      },
      {
        id: 'capture',
        title: 'Evidence: save progress to Growth Map',
        detail: `Save the practice result as one evidence record linked to ${targetCapability.name}. Explain how it changed your product judgment.`,
        status: 'todo',
      },
      {
        id: 'reflect',
        title: 'Reflect: choose the next iteration',
        detail: `Write what became clearer, what is still uncertain, and the next smallest experiment for ${targetCapability.name}.`,
        status: 'todo',
      },
    ],
  };
}

function buildPracticeTask(targetCapability, focusArea) {
  const playbook = getPracticePlaybook(targetCapability.id, focusArea);

  return [
    `30-minute ${targetCapability.name} practice`,
    '',
    `Recommended tool: ${playbook.tool}`,
    `Working artifact: ${playbook.artifact}`,
    '',
    'Steps:',
    ...playbook.steps.map((step, index) => `${index + 1}. ${step}`),
    '',
    `Output to save as evidence: ${playbook.output}`,
    `Done when: ${playbook.doneWhen}`,
  ].join('\n');
}

function getPracticePlaybook(capabilityId, focusArea) {
  const playbooks = {
    'prompt-engineering': {
      tool: 'ChatGPT, Claude, or Codex chat. Use the same model for baseline and improved attempts.',
      artifact: `A real PM artifact from ${focusArea}: PRD section, user story, discovery notes, launch message, or customer feedback summary.`,
      steps: [
        'Run your normal prompt on the artifact and save the baseline output.',
        'Extract one prompt pattern from a learning resource, such as role + context + constraints + examples + output format.',
        'Rewrite the prompt using that pattern while keeping the source artifact unchanged.',
        'Run the improved prompt and compare clarity, completeness, actionability, and hallucination risk.',
        'Save the winning prompt, better output, and one sentence explaining why it improved.',
      ],
      output: 'Baseline prompt, improved prompt, before/after comparison, and one reusable prompt pattern.',
      doneWhen: 'You can explain which prompt change improved the PM artifact and when to reuse it.',
    },
    'context-engineering': {
      tool: 'ChatGPT, Claude, or a Markdown editor plus an AI chat for testing context packets.',
      artifact: `A messy context source from ${focusArea}: meeting notes, long chat, PRD draft, research snippets, or backlog comments.`,
      steps: [
        'Choose one task the model should perform.',
        'Create a context packet with goal, known facts, constraints, and source excerpts.',
        'Run the task once with raw context and once with the structured context packet.',
        'Compare missing details, irrelevant details, and wrong assumptions.',
        'Save the reusable context packet structure and one example output.',
      ],
      output: 'Messy context, structured context packet, output comparison, and reusable template.',
      doneWhen: 'The structured packet produces a more reliable answer with less noise.',
    },
    'agent-design': {
      tool: 'Mermaid, Whimsical, Miro, FigJam, or a Markdown flowchart with ChatGPT/Claude as reviewer.',
      artifact: `One repeatable workflow from ${focusArea}: research synthesis, PRD drafting, feedback triage, release planning, or metric review.`,
      steps: [
        'Write the workflow goal and final artifact.',
        'Map steps with role, input, tool, output, and human review point.',
        'Add an explicit approval checkpoint for one risky step.',
        'Ask an AI reviewer to find missing state, unclear handoffs, and failure modes.',
        'Save the revised workflow and top three failure modes.',
      ],
      output: 'Agent workflow map, handoff artifacts, review checkpoints, and failure modes.',
      doneWhen: 'Another PM could follow the workflow without asking what the agent should do next.',
    },
    'ai-evaluation': {
      tool: 'Google Sheets/Excel plus ChatGPT/Claude for rubric drafting and output comparison.',
      artifact: `Three real or sample AI outputs from ${focusArea}, such as summaries, requirements, release notes, or support answers.`,
      steps: [
        'Define the job-to-be-done and what a good answer must include.',
        'Create a 5-point rubric for correctness, usefulness, specificity, risk, and tone.',
        'Score three outputs in a spreadsheet with one sentence of evidence for each score.',
        'Ask an AI judge to score the same outputs using your rubric.',
        'Compare scores and revise one unclear criterion.',
      ],
      output: 'Evaluation rubric, scored examples, disagreement notes, and one revised criterion.',
      doneWhen: 'The rubric catches at least one quality difference that vague preference would miss.',
    },
  };

  return playbooks[capabilityId] ?? {
    tool: 'ChatGPT, Claude, a spreadsheet, and a Markdown decision note.',
    artifact: `One real PM workflow from ${focusArea}: product strategy, research synthesis, workflow automation, launch planning, or quality review.`,
    steps: [
      'Define the capability question you want to answer in this workflow.',
      'Choose one real artifact or workflow sample instead of a toy example.',
      'Ask AI to produce a first-pass output and record the prompt, context, and assumptions.',
      'Critique the result against usefulness, correctness, risk, and next-action clarity.',
      'Save the improved artifact and one reusable operating rule.',
    ],
    output: 'Real PM artifact, AI-assisted method, quality critique, and reusable operating rule.',
    doneWhen: 'You can explain what improved in the workflow and what evidence supports the improvement.',
  };
}

export function generateWeeklyMarkdown({ capabilities, notes, userProfile, weeklySummary }) {
  const period = getCurrentWeekLabel();
  const recentNotes = notes.slice(0, 5);
  const activeCapabilities = capabilities
    .filter((capability) =>
      recentNotes.some((note) => note.relatedCapabilityIds.includes(capability.id)),
    )
    .sort((a, b) => b.progress - a.progress);
  const progressItems =
    recentNotes.length > 0 ? recentNotes.map((note) => summarizeNote(note.content)) : weeklySummary.progress;
  const capabilityItems =
    activeCapabilities.length > 0
      ? activeCapabilities.map(
          (capability) =>
            `${capability.name}: ${capability.progress}% progress, ${capability.evidenceCount} evidence records`,
        )
      : capabilities
          .slice()
          .sort((a, b) => b.progress - a.progress)
          .slice(0, 3)
          .map((capability) => `${capability.name}: ${capability.stageLabel}`);
  const nextActions =
    recentNotes.length > 0
      ? [
          userProfile.lastInsight,
          `Add two more real work evidence records around ${userProfile.focusArea}.`,
          'Turn the most useful evidence record into a reusable case.',
        ]
      : weeklySummary.nextActions;

  return [
    `# ${period} Review`,
    '',
    '## Progress',
    ...progressItems.map((item, index) => `${index + 1}. ${item}`),
    '',
    '## Capability Changes',
    ...capabilityItems.map((item, index) => `${index + 1}. ${item}`),
    '',
    '## Next Week',
    ...nextActions.map((item, index) => `${index + 1}. ${item}`),
    '',
    '## Reflection',
    `This week focused on ${userProfile.focusArea}. The next step is to convert scattered evidence into clear capability signals and reusable methods.`,
  ].join('\n');
}

export function exportNotesToMarkdown(notes, capabilities) {
  const capabilityNameById = new Map(capabilities.map((capability) => [capability.id, capability.name]));

  if (notes.length === 0) {
    return '# PM Growth OS Evidence Export\n\nNo evidence records yet.\n';
  }

  return [
    '# PM Growth OS Evidence Export',
    '',
    `Exported at: ${new Date().toLocaleString('en-US')}`,
    `Evidence record count: ${notes.length}`,
    '',
    ...notes.flatMap((note, index) => [
      `## ${index + 1}. ${new Date(note.createdAt).toLocaleString('en-US')}`,
      '',
      note.content,
      '',
      `Capabilities: ${formatCapabilities(note, capabilityNameById)}`,
      `Tags: ${note.tags.length > 0 ? note.tags.map((tag) => `#${tag}`).join(' ') : 'None'}`,
      '',
    ]),
  ].join('\n');
}

export function createModelCallTrace({ agent, operation, prompt, completion, status = 'success' }) {
  const promptTokens = estimateTokens(prompt);
  const completionTokens = estimateTokens(completion);
  const totalTokens = promptTokens + completionTokens;

  return {
    id: randomUUID(),
    agent,
    operation,
    model: 'pm-growth-local-agent',
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCostUsd: (promptTokens / 1_000_000) * 0.05 + (completionTokens / 1_000_000) * 0.2,
    latencyMs: 120 + totalTokens * 8,
    status,
    createdAt: new Date().toISOString(),
    promptPreview: preview(prompt),
    completionPreview: preview(completion),
  };
}

export function getStageLabel(progress) {
  if (progress >= 75) return 'Mastery Sprint';
  if (progress >= 45) return 'Advancing';
  if (progress > 0) return 'Foundational';
  return 'Not started';
}

function getConfidence(draft, matchCount) {
  if (draft.trim().length < 12 || matchCount === 0) return 'low';
  if (matchCount === 1) return 'medium';
  return 'high';
}

function getReason(capabilityId) {
  const reasons = {
    'prompt-engineering': 'The note mentions prompts, instructions, examples, or constraints.',
    'ai-product-strategy': 'The note mentions product strategy, roadmap bets, opportunity sizing, or market context.',
    'user-research-synthesis': 'The note mentions user research, feedback, interviews, or insight synthesis.',
    'context-engineering': 'The note mentions context, state, memory, summaries, or retrieval.',
    'rag-knowledge-systems': 'The note mentions retrieval, knowledge bases, grounding, citations, or source quality.',
    'agent-design': 'The note mentions agents, handoffs, tools, or multi-step workflows.',
    'tool-orchestration': 'The note mentions tools, APIs, connectors, MCP, or workflow orchestration.',
    'ai-evaluation': 'The note mentions evaluation, metrics, tracing, quality, or guardrails.',
    'experimentation-metrics': 'The note mentions experiments, baselines, product metrics, or decision rules.',
    'ai-safety-governance': 'The note mentions AI risk, policy, privacy, compliance, or launch governance.',
    'automation-ops': 'The note mentions automation operations, runbooks, monitoring, or recovery paths.',
    'product-storytelling': 'The note mentions product narratives, demos, launch messaging, or adoption.',
    'multi-agent-collaboration': 'The note mentions specialist agents, agent teams, handoffs, or collaboration rules.',
  };

  return reasons[capabilityId] ?? 'This note can become new growth evidence.';
}

function getNextPrompt(capabilityId) {
  const prompts = {
    'prompt-engineering': 'Next, save one example where the prompt failed and what constraint might fix it.',
    'ai-product-strategy': 'Next, write the smallest assumption that must be true for this AI product bet to matter.',
    'user-research-synthesis': 'Next, link the insight to one source quote, signal, or counterexample.',
    'context-engineering': 'Next, identify what state should be remembered, summarized, or discarded.',
    'rag-knowledge-systems': 'Next, identify one source that should be trusted, refreshed, or excluded.',
    'agent-design': 'Next, sketch the inputs and outputs for one agent handoff.',
    'tool-orchestration': 'Next, define the tool input, output, permission, and fallback behavior.',
    'ai-evaluation': 'Next, define one minimal criterion for deciding whether the AI output is good enough.',
    'experimentation-metrics': 'Next, define the baseline, success metric, and stop/continue rule.',
    'ai-safety-governance': 'Next, write the highest-risk failure mode and one launch gate.',
    'automation-ops': 'Next, define what should be monitored and who owns the fallback.',
    'product-storytelling': 'Next, turn this into a before/after product story with one proof point.',
    'multi-agent-collaboration': 'Next, write the handoff artifact and the review rule between two agents.',
  };

  return prompts[capabilityId ?? 'agent-design'];
}

function summarizeNote(content) {
  const normalized = content.replace(/\s+/g, ' ').trim();
  return normalized.length <= 72 ? normalized : `${normalized.slice(0, 72)}...`;
}

function getCurrentWeekLabel() {
  const now = new Date();
  return `${now.getFullYear()} Week ${Math.ceil(now.getDate() / 7)}`;
}

function formatCapabilities(note, capabilityNameById) {
  if (note.relatedCapabilityIds.length === 0) return 'None';
  return note.relatedCapabilityIds.map((id) => capabilityNameById.get(id) ?? id).join(' / ');
}

function estimateTokens(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return 0;

  const cjkChars = [...trimmed].filter((char) => /[\u4e00-\u9fff]/u.test(char)).length;
  const latinWords = trimmed
    .replace(/[\u4e00-\u9fff]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean).length;

  return Math.max(1, Math.ceil(cjkChars * 0.65 + latinWords * 1.3));
}

function preview(text) {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim();
  return normalized.length <= 120 ? normalized : `${normalized.slice(0, 120)}...`;
}

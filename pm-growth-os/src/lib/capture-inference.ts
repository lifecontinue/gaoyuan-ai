import type { Capability, CaptureSuggestions } from '../types/domain';

const rules = [
  {
    capabilityId: 'prompt-engineering',
    tags: ['PromptEngineering'],
    keywords: ['prompt', 'few-shot', 'chain-of-thought', 'cot', 'constraint', 'instruction', 'example'],
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
    keywords: ['context', 'memory', 'state', 'compression', 'window', 'long-term memory', 'summary'],
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
    keywords: ['evaluation', 'eval', 'metric', 'observability', 'trace', 'guardrail', 'quality'],
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

export function inferCaptureSuggestions(
  draft: string,
  capabilities: Capability[],
): CaptureSuggestions {
  const normalizedDraft = draft.toLowerCase();
  const matchedRuleIds = new Set<string>();
  const tags = new Set<string>();

  for (const rule of rules) {
    const hasKeyword = rule.keywords.some((keyword) =>
      normalizedDraft.includes(keyword.toLowerCase()),
    );

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

function getConfidence(draft: string, matchCount: number): CaptureSuggestions['confidence'] {
  if (draft.trim().length < 12 || matchCount === 0) return 'low';
  if (matchCount === 1) return 'medium';
  return 'high';
}

function getReason(capabilityId: string) {
  const reasons: Record<string, string> = {
    'prompt-engineering': 'This note mentions prompting, constraints, or examples.',
    'ai-product-strategy': 'This note mentions product strategy, roadmap bets, opportunity sizing, or market context.',
    'user-research-synthesis': 'This note mentions user research, feedback, interviews, or insight synthesis.',
    'context-engineering': 'This note mentions context, state, or memory management.',
    'rag-knowledge-systems': 'This note mentions retrieval, knowledge bases, grounding, citations, or source quality.',
    'agent-design': 'This note mentions agents, handoffs, roles, or workflow design.',
    'tool-orchestration': 'This note mentions tools, APIs, connectors, MCP, or workflow orchestration.',
    'ai-evaluation': 'This note mentions evaluation, observability, metrics, or guardrails.',
    'experimentation-metrics': 'This note mentions experiments, baselines, product metrics, or decision rules.',
    'ai-safety-governance': 'This note mentions AI risk, policy, privacy, compliance, or launch governance.',
    'automation-ops': 'This note mentions automation operations, runbooks, monitoring, or recovery paths.',
    'product-storytelling': 'This note mentions product narratives, demos, launch messaging, or adoption.',
    'multi-agent-collaboration': 'This note mentions specialist agents, agent teams, handoffs, or collaboration rules.',
  };

  return reasons[capabilityId] ?? 'This note can become a new piece of growth evidence.';
}

function getNextPrompt(capabilityId?: string) {
  const prompts: Record<string, string> = {
    'prompt-engineering': 'Next, capture one counterexample where a prompt failed and why.',
    'ai-product-strategy': 'Next, write the smallest assumption that must be true for this AI product bet to matter.',
    'user-research-synthesis': 'Next, link the insight to one source quote, signal, or counterexample.',
    'context-engineering': 'Next, separate what should become long-term memory from what can stay in the current session.',
    'rag-knowledge-systems': 'Next, identify one source that should be trusted, refreshed, or excluded.',
    'agent-design': 'Next, map the handoff inputs and outputs between Capture and Profile.',
    'tool-orchestration': 'Next, define the tool input, output, permission, and fallback behavior.',
    'ai-evaluation': 'Next, define one minimal metric that tells whether the output is good enough.',
    'experimentation-metrics': 'Next, define the baseline, success metric, and stop/continue rule.',
    'ai-safety-governance': 'Next, write the highest-risk failure mode and one launch gate.',
    'automation-ops': 'Next, define what should be monitored and who owns the fallback.',
    'product-storytelling': 'Next, turn this into a before/after product story with one proof point.',
    'multi-agent-collaboration': 'Next, write the handoff artifact and the review rule between two agents.',
  };

  return prompts[capabilityId ?? 'agent-design'];
}

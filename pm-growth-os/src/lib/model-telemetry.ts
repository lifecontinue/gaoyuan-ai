import type { ModelCallTrace, TokenCostSummary, UsageLog } from '../types/domain';

type TraceInput = {
  agent: ModelCallTrace['agent'];
  operation: string;
  prompt: string;
  completion: string;
  latencyMs?: number;
  model?: string;
  status?: ModelCallTrace['status'];
};

const DEFAULT_MODEL = 'pm-growth-local-agent';

const pricingUsdPerMillionTokens: Record<
  string,
  { input: number; output: number }
> = {
  // Internal estimate for planning and UI monitoring. Replace with provider usage
  // metadata when real model APIs are connected.
  'pm-growth-local-agent': {
    input: 0.05,
    output: 0.2,
  },
};

export function createModelCallTrace(input: TraceInput): ModelCallTrace {
  const model = input.model ?? DEFAULT_MODEL;
  const promptTokens = estimateTokens(input.prompt);
  const completionTokens = estimateTokens(input.completion);
  const totalTokens = promptTokens + completionTokens;
  const pricing = pricingUsdPerMillionTokens[model] ?? pricingUsdPerMillionTokens[DEFAULT_MODEL];

  return {
    id: crypto.randomUUID(),
    agent: input.agent,
    operation: input.operation,
    model,
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCostUsd:
      (promptTokens / 1_000_000) * pricing.input +
      (completionTokens / 1_000_000) * pricing.output,
    latencyMs: input.latencyMs ?? estimateLatency(totalTokens),
    status: input.status ?? 'success',
    createdAt: new Date().toISOString(),
    promptPreview: preview(input.prompt),
    completionPreview: preview(input.completion),
  };
}

export function summarizeModelCalls(traces: ModelCallTrace[]): TokenCostSummary {
  return traces.reduce<TokenCostSummary>(
    (summary, trace) => ({
      totalCalls: summary.totalCalls + 1,
      promptTokens: summary.promptTokens + trace.promptTokens,
      completionTokens: summary.completionTokens + trace.completionTokens,
      totalTokens: summary.totalTokens + trace.totalTokens,
      estimatedCostUsd: summary.estimatedCostUsd + trace.estimatedCostUsd,
    }),
    {
      totalCalls: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
    },
  );
}

export function createUsageLogFromTrace(
  trace: ModelCallTrace,
  userId = 'local-user',
): UsageLog {
  return {
    id: trace.id,
    user_id: userId,
    feature: trace.operation,
    model: trace.model,
    prompt_tokens: trace.promptTokens,
    completion_tokens: trace.completionTokens,
    cost: trace.estimatedCostUsd,
    latency: trace.latencyMs,
    created_at: trace.createdAt,
  };
}

export function formatUsd(value: number) {
  return `$${value.toFixed(6)}`;
}

function estimateTokens(text: string) {
  const trimmed = text.trim();

  if (!trimmed) {
    return 0;
  }

  const cjkChars = [...trimmed].filter((char) => /[\u4e00-\u9fff]/u.test(char)).length;
  const latinWords = trimmed
    .replace(/[\u4e00-\u9fff]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean).length;

  return Math.max(1, Math.ceil(cjkChars * 0.65 + latinWords * 1.3));
}

function estimateLatency(totalTokens: number) {
  return 120 + totalTokens * 8;
}

function preview(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();

  if (normalized.length <= 120) {
    return normalized;
  }

  return `${normalized.slice(0, 120)}...`;
}

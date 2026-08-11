import { randomUUID } from 'node:crypto';
import { loadLocalEnv } from './env-loader.mjs';

loadLocalEnv();

const DEFAULT_LIMIT = 100;

export function isUsageBridgeAuthorized(request) {
  const expectedToken = process.env.VSCODE_USAGE_BRIDGE_TOKEN;

  if (!expectedToken) {
    return true;
  }

  const authorization =
    typeof request.headers?.get === 'function'
      ? request.headers.get('authorization')
      : request.headers?.authorization;

  return authorization === `Bearer ${expectedToken}`;
}

export function normalizeUsageLogPayload(payload = {}) {
  const usage = payload.usage ?? {};
  const promptTokens = normalizeInteger(
    payload.prompt_tokens ??
      payload.promptTokens ??
      payload.input_tokens ??
      payload.inputTokens ??
      usage.prompt_tokens ??
      usage.input_tokens,
  );
  const completionTokens = normalizeInteger(
    payload.completion_tokens ??
      payload.completionTokens ??
      payload.output_tokens ??
      payload.outputTokens ??
      usage.completion_tokens ??
      usage.output_tokens,
  );
  const model = normalizeString(payload.model ?? payload.model_id ?? payload.modelId);
  const feature = normalizeString(payload.feature ?? payload.operation ?? payload.action);
  const userId = normalizeString(payload.user_id ?? payload.userId ?? payload.email);
  const cost = normalizeCost(payload, promptTokens, completionTokens);

  if (!userId) {
    throw createUsageLogError(400, 'usage_logs.user_id is required.');
  }

  if (!feature) {
    throw createUsageLogError(400, 'usage_logs.feature is required.');
  }

  if (!model) {
    throw createUsageLogError(400, 'usage_logs.model is required.');
  }

  return {
    id: normalizeUuid(payload.id) ?? randomUUID(),
    user_id: userId,
    feature,
    model,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    cost,
    latency: normalizeInteger(payload.latency ?? payload.latency_ms ?? payload.latencyMs),
    created_at: normalizeDate(payload.created_at ?? payload.createdAt) ?? new Date().toISOString(),
  };
}

export function mergeUsageLogs(existing = [], incoming = []) {
  const byId = new Map();

  for (const log of [...incoming, ...existing]) {
    if (!byId.has(log.id)) {
      byId.set(log.id, log);
    }
  }

  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export async function fetchSupabaseUsageLogs(limit = DEFAULT_LIMIT) {
  const config = getSupabaseConfig();
  const url = new URL(`${config.url}/rest/v1/usage_logs`);

  url.searchParams.set('select', '*');
  url.searchParams.set('order', 'created_at.desc');
  url.searchParams.set('limit', String(limit));

  const response = await fetch(url, {
    headers: getSupabaseHeaders(config),
  });

  if (!response.ok) {
    throw createUsageLogError(
      response.status,
      `Supabase usage_logs query failed with status ${response.status}.`,
    );
  }

  return response.json();
}

export async function insertSupabaseUsageLog(log) {
  const config = getSupabaseConfig();
  const response = await fetch(`${config.url}/rest/v1/usage_logs`, {
    method: 'POST',
    headers: {
      ...getSupabaseHeaders(config),
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(log),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw createUsageLogError(
      response.status,
      payload?.message ?? `Supabase usage_logs insert failed with status ${response.status}.`,
    );
  }

  const rows = await response.json();
  return rows[0] ?? log;
}

export function createUsageLogError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw createUsageLogError(
      503,
      'Usage Bridge requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    );
  }

  return { key, url: url.replace(/\/$/, '') };
}

function getSupabaseHeaders(config) {
  return {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
  };
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeInteger(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.round(parsed));
}

function normalizeCost(payload, promptTokens, completionTokens) {
  const directCost = Number(payload.cost ?? payload.estimated_cost_usd ?? payload.estimatedCostUsd);

  if (Number.isFinite(directCost)) {
    return Math.max(0, directCost);
  }

  const inputPerMillion = Number(
    payload.input_usd_per_million ?? payload.inputUsdPerMillion ?? payload.input_cost_per_million,
  );
  const outputPerMillion = Number(
    payload.output_usd_per_million ??
      payload.outputUsdPerMillion ??
      payload.output_cost_per_million,
  );

  if (Number.isFinite(inputPerMillion) && Number.isFinite(outputPerMillion)) {
    return (promptTokens / 1_000_000) * inputPerMillion +
      (completionTokens / 1_000_000) * outputPerMillion;
  }

  return 0;
}

function normalizeUuid(value) {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function normalizeDate(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

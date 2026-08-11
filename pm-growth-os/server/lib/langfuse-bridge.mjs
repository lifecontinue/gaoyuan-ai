import { randomUUID } from 'node:crypto';
import { loadLocalEnv } from './env-loader.mjs';

loadLocalEnv();

export function getLangfuseStatus() {
  return {
    configured: Boolean(getLangfuseConfig()),
    provider: 'langfuse',
  };
}

export async function sendUsageLogToLangfuse(log) {
  const config = getLangfuseConfig();

  if (!config) {
    return {
      configured: false,
      provider: 'langfuse',
      status: 'skipped',
    };
  }

  const timestamp = normalizeDate(log.created_at);
  const traceId = log.id;
  const generationId = randomUUID();
  const totalTokens = log.prompt_tokens + log.completion_tokens;
  const endTime = new Date(new Date(timestamp).getTime() + Math.max(0, log.latency)).toISOString();

  const response = await fetch(`${config.baseUrl}/api/public/ingestion`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.publicKey}:${config.secretKey}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      batch: [
        {
          id: randomUUID(),
          timestamp,
          type: 'trace-create',
          body: {
            id: traceId,
            name: log.feature,
            timestamp,
            userId: log.user_id,
            tags: ['pm-growth-os', 'usage-log'],
            metadata: {
              source: 'pm-growth-os-dev-gateway',
              cost: log.cost,
              latency: log.latency,
              model: log.model,
            },
          },
        },
        {
          id: randomUUID(),
          timestamp,
          type: 'generation-create',
          body: {
            id: generationId,
            traceId,
            name: log.feature,
            startTime: timestamp,
            endTime,
            model: log.model,
            input: {
              feature: log.feature,
              prompt_tokens: log.prompt_tokens,
            },
            output: {
              completion_tokens: log.completion_tokens,
            },
            usage: {
              input: log.prompt_tokens,
              output: log.completion_tokens,
              total: totalTokens,
              unit: 'TOKENS',
            },
            costDetails: {
              total: log.cost,
            },
            metadata: {
              latency_ms: log.latency,
              usage_log_id: log.id,
            },
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    return {
      configured: true,
      provider: 'langfuse',
      status: 'failed',
      message: message.slice(0, 180),
    };
  }

  return {
    configured: true,
    provider: 'langfuse',
    status: 'synced',
  };
}

function getLangfuseConfig() {
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const baseUrl = process.env.LANGFUSE_BASE_URL;

  if (!secretKey || !publicKey || !baseUrl) {
    return null;
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    publicKey,
    secretKey,
  };
}

function normalizeDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

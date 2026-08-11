import {
  fetchSupabaseUsageLogs,
  insertSupabaseUsageLog,
  isUsageBridgeAuthorized,
  normalizeUsageLogPayload,
} from '../server/lib/usage-log-bridge.mjs';
import { getLangfuseStatus, sendUsageLogToLangfuse } from '../server/lib/langfuse-bridge.mjs';

export default async function handler(request, response) {
  setCorsHeaders(response);

  if (request.method === 'OPTIONS') {
    response.status(204).end();
    return;
  }

  if (request.method === 'GET') {
    try {
      const limit = Number(request.query?.limit ?? 100);
      const usageLogs = await fetchSupabaseUsageLogs(Number.isFinite(limit) ? limit : 100);
      response.status(200).json({
        observability: {
          langfuse: getLangfuseStatus(),
        },
        usageLogs,
      });
    } catch (error) {
      sendError(response, error);
    }
    return;
  }

  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!isUsageBridgeAuthorized(request)) {
    response.status(401).json({ error: 'Unauthorized usage bridge request.' });
    return;
  }

  try {
    const log = normalizeUsageLogPayload(request.body ?? {});
    const usageLog = await insertSupabaseUsageLog(log);
    const langfuse = await sendUsageLogToLangfuse(usageLog).catch((error) => ({
      configured: getLangfuseStatus().configured,
      message: error instanceof Error ? error.message : String(error),
      provider: 'langfuse',
      status: 'failed',
    }));

    response.status(201).json({
      observability: {
        langfuse,
      },
      usageLog,
    });
  } catch (error) {
    sendError(response, error);
  }
}

function sendError(response, error) {
  const status = Number(error?.statusCode ?? 500);
  response.status(status).json({
    error: 'Usage Bridge failed',
    message: error instanceof Error ? error.message : String(error),
  });
}

function setCorsHeaders(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

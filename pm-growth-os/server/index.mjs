import http from 'node:http';
import {
  createModelCallTrace,
  exportNotesToMarkdown,
  generateCoachPlan,
  generateWeeklyMarkdown,
  getStageLabel,
  inferCaptureSuggestions,
} from './lib/domain.mjs';
import { getKnowledgeSearchStatus, searchKnowledgeResources } from './lib/knowledge-search.mjs';
import { readWorkspace, resetWorkspace, updateWorkspace, writeWorkspace } from './lib/store.mjs';
import {
  isUsageBridgeAuthorized,
  mergeUsageLogs,
  normalizeUsageLogPayload,
} from './lib/usage-log-bridge.mjs';
import { getLangfuseStatus, sendUsageLogToLangfuse } from './lib/langfuse-bridge.mjs';

const port = Number(process.env.PORT ?? 8787);

const server = http.createServer(async (request, response) => {
  try {
    await route(request, response);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, {
      error: 'Internal server error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(port, () => {
  console.log(`PM Growth OS API listening on http://127.0.0.1:${port}`);
});

async function route(request, response) {
  const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
  const method = request.method ?? 'GET';

  if (method === 'OPTIONS') {
    sendNoContent(response);
    return;
  }

  if (method === 'GET' && url.pathname === '/api/health') {
    sendJson(response, 200, { ok: true, service: 'pm-growth-os-api' });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/knowledge-search') {
    sendJson(response, 200, {
      ok: true,
      service: 'pm-growth-os-knowledge-search',
      ...getKnowledgeSearchStatus(),
    });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/knowledge-search') {
    const body = await readJson(request);
    try {
      sendJson(response, 200, { resources: await searchKnowledgeResources(body) });
    } catch (error) {
      sendJson(response, Number(error?.statusCode ?? 500), {
        error: 'Knowledge search failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  if (method === 'GET' && url.pathname === '/api/workspace') {
    sendJson(response, 200, await readWorkspace());
    return;
  }

  if (method === 'GET' && url.pathname === '/api/usage-logs') {
    const workspace = await readWorkspace();
    sendJson(response, 200, {
      observability: {
        langfuse: getLangfuseStatus(),
      },
      usageLogs: workspace.usageLogs ?? [],
    });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/usage-logs') {
    if (!isUsageBridgeAuthorized(request)) {
      sendJson(response, 401, { error: 'Unauthorized usage bridge request.' });
      return;
    }

    const body = await readJson(request);
    const log = normalizeUsageLogPayload(body);
    const langfuse = await sendUsageLogToLangfuse(log).catch((error) => ({
      configured: getLangfuseStatus().configured,
      message: error instanceof Error ? error.message : String(error),
      provider: 'langfuse',
      status: 'failed',
    }));
    const workspace = await updateWorkspace((current) => ({
      ...current,
      usageLogs: mergeUsageLogs(current.usageLogs ?? [], [log]),
    }));

    sendJson(response, 201, {
      observability: {
        langfuse,
      },
      usageLog: log,
      usageLogs: workspace.usageLogs,
    });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/reset') {
    sendJson(response, 200, await resetWorkspace());
    return;
  }

  if (method === 'GET' && url.pathname === '/api/connectors') {
    const workspace = await readWorkspace();
    sendJson(response, 200, workspace.toolConnectors);
    return;
  }

  const connectorMatch = url.pathname.match(/^\/api\/connectors\/([^/]+)$/);
  if (method === 'PATCH' && connectorMatch) {
    const connectorId = decodeURIComponent(connectorMatch[1]);
    const body = await readJson(request);
    const workspace = await updateWorkspace((current) => ({
      ...current,
      toolConnectors: current.toolConnectors.map((connector) => {
        if (connector.id !== connectorId) return connector;

        const nextConnector = {
          ...connector,
          status: body.status ?? connector.status,
          enabled: typeof body.enabled === 'boolean' ? body.enabled : connector.enabled,
          mcpEndpoint:
            typeof body.mcpEndpoint === 'string' ? body.mcpEndpoint : connector.mcpEndpoint,
          accountHint:
            typeof body.accountHint === 'string' ? body.accountHint : connector.accountHint,
          updatedAt: new Date().toISOString(),
        };

        if (nextConnector.enabled && nextConnector.status === 'not_connected') {
          nextConnector.status = nextConnector.method === 'account' ? 'needs_account' : 'configured';
        }

        return nextConnector;
      }),
    }));

    sendJson(response, 200, workspace);
    return;
  }

  if (method === 'POST' && url.pathname === '/api/capture/preview') {
    const body = await readJson(request);
    const workspace = await readWorkspace();
    sendJson(response, 200, inferCaptureSuggestions(String(body.draft ?? ''), workspace.capabilities));
    return;
  }

  if (method === 'PATCH' && url.pathname === '/api/capture/draft') {
    const body = await readJson(request);
    const draft = String(body.draft ?? '');
    const workspace = await updateWorkspace((current) => ({
      ...current,
      captureDraft: draft,
      captureSuggestions: inferCaptureSuggestions(draft, current.capabilities),
    }));
    sendJson(response, 200, workspace);
    return;
  }

  if (method === 'POST' && url.pathname === '/api/notes') {
    const body = await readJson(request);
    const content = String(body.content ?? '').trim();

    if (!content) {
      sendJson(response, 400, { error: 'Note content is required.' });
      return;
    }

    const workspace = await updateWorkspace((current) => {
      const suggestions = inferCaptureSuggestions(content, current.capabilities);
      const now = new Date().toISOString();
      const trace = createModelCallTrace({
        agent: 'Evidence Capture',
        operation: 'infer_capture_suggestions',
        prompt: content,
        completion: JSON.stringify(suggestions),
      });
      const note = {
        id: crypto.randomUUID(),
        content,
        createdAt: now,
        relatedCapabilityIds: suggestions.relatedCapabilities.map((item) => item.id),
        tags: suggestions.tags,
      };

      return {
        ...current,
        capabilities: current.capabilities.map((capability) => {
          if (!note.relatedCapabilityIds.includes(capability.id)) return capability;

          const nextProgress = Math.min(capability.progress + 6, 100);
          return {
            ...capability,
            progress: nextProgress,
            evidenceCount: capability.evidenceCount + 1,
            stageLabel: getStageLabel(nextProgress),
            updatedAt: now.slice(0, 10),
          };
        }),
        captureDraft: '',
        captureSuggestions: inferCaptureSuggestions('', current.capabilities),
        modelTraces: [trace, ...current.modelTraces],
        notes: [note, ...current.notes],
        userProfile: {
          ...current.userProfile,
          focusArea: suggestions.relatedCapabilities[0]?.name ?? current.userProfile.focusArea,
          savedNotes: current.userProfile.savedNotes + 1,
          lastInsight: suggestions.nextPrompt,
        },
      };
    });

    sendJson(response, 201, workspace);
    return;
  }

  const noteDeleteMatch = url.pathname.match(/^\/api\/notes\/([^/]+)$/);
  if (method === 'DELETE' && noteDeleteMatch) {
    const noteId = decodeURIComponent(noteDeleteMatch[1]);
    const workspace = await updateWorkspace((current) => {
      const note = current.notes.find((item) => item.id === noteId);
      if (!note) return current;

      return {
        ...current,
        capabilities: current.capabilities.map((capability) => {
          if (!note.relatedCapabilityIds.includes(capability.id)) return capability;

          const nextProgress = Math.max(capability.progress - 6, 0);
          return {
            ...capability,
            evidenceCount: Math.max(capability.evidenceCount - 1, 0),
            progress: nextProgress,
            stageLabel: getStageLabel(nextProgress),
          };
        }),
        notes: current.notes.filter((item) => item.id !== noteId),
        userProfile: {
          ...current.userProfile,
          savedNotes: Math.max(current.userProfile.savedNotes - 1, 0),
        },
      };
    });
    sendJson(response, 200, workspace);
    return;
  }

  if (method === 'POST' && url.pathname === '/api/coach/generate') {
    const body = await readJson(request);
    const workspace = await updateWorkspace((current) => {
      const nextPlan = generateCoachPlan({
        capabilities: current.capabilities,
        notes: current.notes,
        targetCapabilityId: body.capabilityId,
        userProfile: current.userProfile,
      });
      const targetCapability = current.capabilities.find((item) => item.id === body.capabilityId);
      const trace = createModelCallTrace({
        agent: 'Coach Agent',
        operation: body.capabilityId ? 'generate_capability_coach_plan' : 'generate_coach_plan',
        prompt: JSON.stringify({
          targetCapability,
          capabilities: current.capabilities,
          recentNotes: current.notes.slice(0, 3),
          userProfile: current.userProfile,
        }),
        completion: JSON.stringify(nextPlan),
      });

      return {
        ...current,
        coachPlan: nextPlan,
        modelTraces: [trace, ...current.modelTraces],
        selectedCapabilityId: body.capabilityId ?? current.selectedCapabilityId,
        userProfile: {
          ...current.userProfile,
          focusArea: targetCapability?.name ?? current.userProfile.focusArea,
          lastInsight: nextPlan.steps[0]?.detail ?? current.userProfile.lastInsight,
        },
      };
    });
    sendJson(response, 200, workspace);
    return;
  }

  const coachHandoffMatch = url.pathname.match(/^\/api\/coach\/steps\/([^/]+)\/capture$/);
  if (method === 'POST' && coachHandoffMatch) {
    const stepId = decodeURIComponent(coachHandoffMatch[1]);
    const workspace = await updateWorkspace((current) => {
      const step = current.coachPlan.steps.find((item) => item.id === stepId);
      if (!step) return current;

      const nextDraft = [
        `Practice task: ${step.title}`,
        '',
        step.detail,
        '',
        'My evidence record:',
      ].join('\n');
      const trace = createModelCallTrace({
        agent: 'Coach Agent',
        operation: 'handoff_step_to_capture',
        prompt: JSON.stringify(step),
        completion: nextDraft,
      });

      return {
        ...current,
        captureDraft: nextDraft,
        captureSuggestions: inferCaptureSuggestions(nextDraft, current.capabilities),
        coachPlan: {
          ...current.coachPlan,
          steps: current.coachPlan.steps.map((item) =>
            item.id === stepId ? { ...item, status: 'active' } : item,
          ),
        },
        modelTraces: [trace, ...current.modelTraces],
      };
    });
    sendJson(response, 200, workspace);
    return;
  }

  const capabilityDraftMatch = url.pathname.match(/^\/api\/capabilities\/([^/]+)\/capture$/);
  if (method === 'POST' && capabilityDraftMatch) {
    const capabilityId = decodeURIComponent(capabilityDraftMatch[1]);
    const workspace = await updateWorkspace((current) => {
      const capability = current.capabilities.find((item) => item.id === capabilityId);
      if (!capability) return current;

      const nextDraft = [
        `Capability exploration: ${capability.name}`,
        '',
        `Current stage: ${capability.stageLabel}`,
        `Current progress: ${capability.progress}%`,
        '',
        'Real scenario I encountered today:',
        '',
        'Question I want to validate:',
      ].join('\n');
      const trace = createModelCallTrace({
        agent: 'Profile Agent',
        operation: 'handoff_capability_to_capture',
        prompt: JSON.stringify(capability),
        completion: nextDraft,
      });

      return {
        ...current,
        captureDraft: nextDraft,
        captureSuggestions: inferCaptureSuggestions(nextDraft, current.capabilities),
        modelTraces: [trace, ...current.modelTraces],
        selectedCapabilityId: capabilityId,
      };
    });
    sendJson(response, 200, workspace);
    return;
  }

  if (method === 'POST' && url.pathname === '/api/reflection/generate') {
    const workspace = await updateWorkspace((current) => {
      const reflectionDraft = generateWeeklyMarkdown(current);
      const trace = createModelCallTrace({
        agent: 'Reflection Agent',
        operation: 'generate_weekly_markdown',
        prompt: JSON.stringify({
          notes: current.notes.slice(0, 5),
          userProfile: current.userProfile,
          weeklySummary: current.weeklySummary,
        }),
        completion: reflectionDraft,
      });

      return {
        ...current,
        reflectionDraft,
        modelTraces: [trace, ...current.modelTraces],
      };
    });
    sendJson(response, 200, workspace);
    return;
  }

  if (method === 'PATCH' && url.pathname === '/api/reflection') {
    const body = await readJson(request);
    const workspace = await updateWorkspace((current) => ({
      ...current,
      reflectionDraft: String(body.draft ?? ''),
    }));
    sendJson(response, 200, workspace);
    return;
  }

  if (method === 'PATCH' && url.pathname === '/api/capabilities/selected') {
    const body = await readJson(request);
    const workspace = await updateWorkspace((current) => ({
      ...current,
      selectedCapabilityId: String(body.capabilityId ?? current.selectedCapabilityId),
    }));
    sendJson(response, 200, workspace);
    return;
  }

  const noteCaptureMatch = url.pathname.match(/^\/api\/notes\/([^/]+)\/capture$/);
  if (method === 'POST' && noteCaptureMatch) {
    const noteId = decodeURIComponent(noteCaptureMatch[1]);
    const workspace = await updateWorkspace((current) => {
      const note = current.notes.find((item) => item.id === noteId);
      if (!note) return current;

      return {
        ...current,
        captureDraft: note.content,
        captureSuggestions: inferCaptureSuggestions(note.content, current.capabilities),
      };
    });
    sendJson(response, 200, workspace);
    return;
  }

  if (method === 'DELETE' && url.pathname === '/api/traces') {
    const workspace = await updateWorkspace((current) => ({
      ...current,
      modelTraces: [],
    }));
    sendJson(response, 200, workspace);
    return;
  }

  if (method === 'GET' && url.pathname === '/api/exports/notes') {
    const workspace = await readWorkspace();
    sendText(response, 200, exportNotesToMarkdown(workspace.notes, workspace.capabilities), 'text/markdown');
    return;
  }

  if (method === 'GET' && url.pathname === '/api/exports/traces') {
    const workspace = await readWorkspace();
    sendJson(response, 200, workspace.modelTraces);
    return;
  }

  sendJson(response, 404, { error: 'Not found' });
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf-8');
  return raw ? JSON.parse(raw) : {};
}

function sendJson(response, status, data) {
  sendText(response, status, JSON.stringify(data), 'application/json');
}

function sendText(response, status, text, contentType = 'text/plain') {
  response.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': `${contentType}; charset=utf-8`,
  });
  response.end(text);
}

function sendNoContent(response) {
  response.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  response.end();
}

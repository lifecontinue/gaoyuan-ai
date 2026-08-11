import { generateCoachPlan } from './coach-generator-enhanced';
import { inferCaptureSuggestions } from './capture-inference';
import {
  capabilities,
  coachPlan,
  defaultCaptureDraft,
  defaultSuggestions,
  userProfile,
  weeklySummary,
} from './initial-workspace-data';
import {
  createModelCallTrace,
  createUsageLogFromTrace,
} from './model-telemetry';
import { generateWeeklyMarkdown } from './reflection-generator';
import type {
  Capability,
  CaptureSuggestions,
  ModelCallTrace,
  ToolConnector,
  UsageLog,
  UserProfile,
  WorkspaceState,
} from '../types/domain';

const STORAGE_KEY = 'pm-growth-os.workspace.v1';
const WORKSPACE_RESET_KEY = 'pm-growth-os.workspace-reset.v2';

type ConnectorPatch = {
  enabled?: boolean;
  status?: ToolConnector['status'];
  mcpEndpoint?: string;
  accountHint?: string;
};

const initialToolConnectors: ToolConnector[] = [
  {
    id: 'local-ai',
    name: 'Local AI Heuristics',
    category: 'llm',
    method: 'local',
    status: 'enabled',
    scope: 'platform',
    description:
      'Runs evidence inference, coach planning, reflection drafting, and token estimates in the browser.',
    useCases: ['Evidence suggestions', 'Coach plan generation', 'Weekly reflection draft'],
    requiredInputs: ['No setup required'],
    enabled: true,
  },
  {
    id: 'browser-storage',
    name: 'Browser Local Storage',
    category: 'knowledge',
    method: 'local',
    status: 'enabled',
    scope: 'platform',
    description: 'Persists evidence, growth state, reflection drafts, and traces in this browser.',
    useCases: ['Offline usage', 'Static Vercel deployment', 'Private local workspace'],
    requiredInputs: ['No setup required'],
    enabled: true,
  },
  {
    id: 'web-search',
    name: 'Real Web Search Knowledge Tool',
    category: 'knowledge',
    method: 'mcp',
    status: 'not_connected',
    scope: 'platform',
    description:
      'Calls the platform search API to retrieve current learning resources, then structures them for Coach Agent guidance.',
    useCases: ['Learning resources', 'Guided practice', 'Future MCP web search adapter'],
    requiredInputs: ['Platform search API key'],
    mcpEndpoint: '/api/knowledge-search',
    accountHint:
      'Click Test Knowledge Search to verify the API route and provider key. Set TAVILY_API_KEY, BRAVE_SEARCH_API_KEY, or SERPAPI_API_KEY in the deployment environment.',
    enabled: false,
  },
  {
    id: 'usage-logs-database',
    name: 'Usage Logs Database',
    category: 'database',
    method: 'env',
    status: 'needs_account',
    scope: 'platform',
    description:
      'Stores token, model, cost, latency, and feature usage in a usage_logs table for analytics tools such as Metabase.',
    useCases: ['Cost audit', 'Feature-level usage analytics', 'Metabase dashboards'],
    requiredInputs: ['DATABASE_URL', 'usage_logs table migration'],
    accountHint:
      'Create the usage_logs table with database/migrations/001_create_usage_logs.sql, then connect Metabase to the same database.',
    enabled: false,
  },
  {
    id: 'langfuse-trace-sink',
    name: 'Langfuse Trace Sink',
    category: 'llm',
    method: 'env',
    status: 'configured',
    scope: 'platform',
    description:
      'Receives usage_logs through the server-side gateway and stores trace/generation events in Langfuse.',
    useCases: ['Trace review', 'Generation cost audit', 'Prompt debugging'],
    requiredInputs: ['LANGFUSE_SECRET_KEY', 'LANGFUSE_PUBLIC_KEY', 'LANGFUSE_BASE_URL'],
    accountHint:
      'Configured in the platform environment. Browser code never receives the Langfuse secret key.',
    enabled: true,
  },
  {
    id: 'markdown-export',
    name: 'Markdown Export',
    category: 'export',
    method: 'local',
    status: 'enabled',
    scope: 'platform',
    description: 'Exports evidence and trace data without an external account.',
    useCases: ['Export evidence', 'Export model traces', 'Copy weekly reflections'],
    requiredInputs: ['No setup required'],
    enabled: true,
  },
  {
    id: 'notion',
    name: 'Notion',
    category: 'knowledge',
    method: 'account',
    status: 'needs_account',
    scope: 'user',
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
    status: 'needs_account',
    scope: 'user',
    description: 'Optional future connector for issues, PRs, and project evidence.',
    useCases: ['Import issue evidence', 'Track shipping evidence', 'Generate project retrospectives'],
    requiredInputs: ['GitHub token or GitHub MCP server'],
    accountHint: 'Static mode does not call GitHub directly. Use this as a local setup note for now.',
    enabled: false,
  },
];

let memoryWorkspace: WorkspaceState | null = null;

export async function fetchWorkspace() {
  return readWorkspace();
}

export async function fetchBridgeUsageLogsApi() {
  const endpoints = getUsageLogEndpoints();
  let lastError: unknown = null;
  let lastEndpoint = endpoints[0] ?? '/api/usage-logs';

  for (const endpoint of endpoints) {
    lastEndpoint = endpoint;
    try {
      const response = await fetch(endpoint);

      if (!response.ok) {
        lastError = new Error(`Usage Bridge failed with status ${response.status}.`);
        continue;
      }

      const payload = await readJsonResponse<{ usageLogs?: UsageLog[] }>(response, endpoint);
      return payload.usageLogs ?? [];
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(formatUsageBridgeError(lastError, lastEndpoint));
}

export async function syncBridgeUsageLogsApi() {
  const currentWorkspace = readWorkspace();
  const bridgeLogs = await fetchBridgeUsageLogsApi();
  const bridgeLogIds = new Set(bridgeLogs.map((log) => log.id));
  const localOnlyLogs = currentWorkspace.usageLogs.filter((log) => !bridgeLogIds.has(log.id));
  const pushedLogs = await pushBridgeUsageLogsApi(localOnlyLogs);
  const nextBridgeLogs = pushedLogs.length > 0 ? await fetchBridgeUsageLogsApi() : bridgeLogs;

  return updateWorkspace((current) => ({
    ...current,
    usageLogs: mergeUsageLogs(current.usageLogs, nextBridgeLogs),
  }));
}

async function pushBridgeUsageLogsApi(logs: UsageLog[]) {
  if (logs.length === 0) {
    return [];
  }

  const endpoints = getUsageLogEndpoints();
  let lastError: unknown = null;
  let lastEndpoint = endpoints[0] ?? '/api/usage-logs';

  for (const endpoint of endpoints) {
    lastEndpoint = endpoint;

    try {
      const pushedLogs: UsageLog[] = [];

      for (const log of logs) {
        const response = await fetch(endpoint, {
          body: JSON.stringify(log),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
        });

        if (!response.ok) {
          lastError = new Error(`Usage Bridge push failed with status ${response.status}.`);
          break;
        }

        const payload = await readJsonResponse<{ usageLog?: UsageLog }>(response, endpoint);

        if (payload.usageLog) {
          pushedLogs.push(payload.usageLog);
        }
      }

      if (pushedLogs.length === logs.length) {
        return pushedLogs;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(formatUsageBridgeError(lastError, lastEndpoint));
}

export async function resetWorkspaceApi() {
  const workspace = createInitialWorkspace();
  return writeWorkspace(workspace);
}

export async function createNoteApi(content: string, selectedCapabilityIds?: string[]) {
  const normalizedContent = content.trim();

  if (!normalizedContent) {
    throw new Error('Evidence content is required.');
  }

  return updateWorkspace((current) => {
    const inferredSuggestions = inferCaptureSuggestions(normalizedContent, current.capabilities);
    const suggestions =
      selectedCapabilityIds === undefined
        ? inferredSuggestions
        : buildAdjustedSuggestions(inferredSuggestions, current.capabilities, selectedCapabilityIds);
    const now = new Date().toISOString();
    const trace = createModelCallTrace({
      agent: 'Evidence Capture',
      operation: 'infer_capture_suggestions',
      prompt: normalizedContent,
      completion: JSON.stringify(suggestions),
    });
    const note = {
      id: createId(),
      content: normalizedContent,
      createdAt: now,
      relatedCapabilityIds: suggestions.relatedCapabilities.map((item) => item.id),
      tags: suggestions.tags,
    };
    const nextCapabilities = current.capabilities.map((capability) => {
      if (!note.relatedCapabilityIds.includes(capability.id)) return capability;

      const nextProgress = Math.min(capability.progress + 6, 100);
      return {
        ...capability,
        progress: nextProgress,
        evidenceCount: capability.evidenceCount + 1,
        stageLabel: getStageLabel(nextProgress),
        updatedAt: now.slice(0, 10),
      };
    });

    return {
      ...current,
      capabilities: nextCapabilities,
      captureDraft: '',
      captureSuggestions: inferCaptureSuggestions('', nextCapabilities),
      modelTraces: [trace, ...current.modelTraces],
      notes: [note, ...current.notes],
      usageLogs: [createUsageLogFromTrace(trace), ...current.usageLogs],
      userProfile: {
        ...current.userProfile,
        focusArea: suggestions.relatedCapabilities[0]?.name ?? current.userProfile.focusArea,
        savedNotes: current.userProfile.savedNotes + 1,
        lastInsight: suggestions.nextPrompt,
      },
    };
  });
}

export async function deleteNoteApi(noteId: string) {
  return updateWorkspace((current) => {
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
}

export async function generateCoachPlanApi(capabilityId?: string) {
  return updateWorkspace(async (current) => {
    const nextPlan = await generateCoachPlan({
      capabilities: current.capabilities,
      notes: current.notes,
      targetCapabilityId: capabilityId,
      userProfile: current.userProfile,
    });
    const targetCapability = current.capabilities.find((item) => item.id === capabilityId);
    const coachTrace = createModelCallTrace({
      agent: 'Coach Agent',
      operation: capabilityId ? 'generate_capability_coach_plan' : 'generate_coach_plan',
      prompt: JSON.stringify({
        targetCapability,
        capabilities: current.capabilities,
        recentNotes: current.notes.slice(0, 3),
        userProfile: current.userProfile,
      }),
      completion: JSON.stringify(nextPlan),
    });
    const knowledgeTrace = createModelCallTrace({
      agent: 'Knowledge Tool',
      operation: 'enrich_learning_resources',
      prompt: JSON.stringify({
        capabilityId: nextPlan.learningGuide?.capabilityId,
        focusArea: current.userProfile.focusArea,
      }),
      completion: JSON.stringify(nextPlan.learningGuide?.resources ?? []),
    });
    const reviewTrace = createModelCallTrace({
      agent: 'Learning Review Agent',
      operation: 'review_learning_path_quality',
      prompt: JSON.stringify({
        capabilityId: nextPlan.learningGuide?.capabilityId,
        resources: nextPlan.learningGuide?.resources?.map((resource) => ({
          title: resource.title,
          type: resource.resourceType,
          source: resource.source,
        })),
        practiceTask: nextPlan.learningGuide?.practiceTask,
        practiceTasks: nextPlan.learningGuide?.practiceTasks,
        evidenceTemplate: nextPlan.learningGuide?.captureTemplate,
      }),
      completion: JSON.stringify(nextPlan.learningGuide?.review ?? null),
    });

    return {
      ...current,
      coachPlan: nextPlan,
      modelTraces: [reviewTrace, knowledgeTrace, coachTrace, ...current.modelTraces],
      selectedCapabilityId: capabilityId ?? current.selectedCapabilityId,
      usageLogs: [
        createUsageLogFromTrace(reviewTrace),
        createUsageLogFromTrace(knowledgeTrace),
        createUsageLogFromTrace(coachTrace),
        ...current.usageLogs,
      ],
      userProfile: {
        ...current.userProfile,
        focusArea: targetCapability?.name ?? current.userProfile.focusArea,
        lastInsight: nextPlan.learningGuide?.nextStep ?? current.userProfile.lastInsight,
      },
    };
  });
}

export async function sendLearningResourceToCaptureApi(resourceId: string) {
  return updateWorkspace((current) => {
    const guide = current.coachPlan.learningGuide;
    const resource = guide?.resources.find((item) => item.id === resourceId);

    if (!guide || !resource) return current;

    const nextDraft = [
      `Learning resource: ${resource.title}`,
      '',
      `Capability: ${guide.capabilityName}`,
      `Resource type: ${resource.resourceType}`,
      `URL: ${resource.url}`,
      '',
      `Why this matters: ${resource.whyUseful}`,
      '',
      'Practice tasks:',
      ...(guide.practiceTasks?.length
        ? guide.practiceTasks.map((task, index) =>
            [
              `${index + 1}. ${task.title}`,
              `Objective: ${task.objective}`,
              `Tool: ${task.tool}`,
              `Output: ${task.output}`,
            ].join('\n'),
          )
        : [guide.practiceTask]),
      '',
      'Evidence template:',
      guide.captureTemplate,
    ].join('\n');
    const trace = createModelCallTrace({
      agent: 'Knowledge Tool',
      operation: 'handoff_resource_to_capture',
      prompt: JSON.stringify(resource),
      completion: nextDraft,
    });

    return {
      ...current,
      captureDraft: nextDraft,
      captureSuggestions: buildAdjustedSuggestions(
        inferCaptureSuggestions(nextDraft, current.capabilities),
        current.capabilities,
        [guide.capabilityId],
      ),
      modelTraces: [trace, ...current.modelTraces],
      usageLogs: [createUsageLogFromTrace(trace), ...current.usageLogs],
    };
  });
}

export async function sendCoachStepToCaptureApi(stepId: string) {
  return updateWorkspace((current) => {
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
      usageLogs: [createUsageLogFromTrace(trace), ...current.usageLogs],
    };
  });
}

export async function sendCapabilityToCaptureApi(capabilityId: string) {
  return updateWorkspace((current) => {
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
      usageLogs: [createUsageLogFromTrace(trace), ...current.usageLogs],
      selectedCapabilityId: capabilityId,
    };
  });
}

export async function sendNoteToCaptureApi(noteId: string) {
  return updateWorkspace((current) => {
    const note = current.notes.find((item) => item.id === noteId);
    if (!note) return current;

    return {
      ...current,
      captureDraft: note.content,
      captureSuggestions: inferCaptureSuggestions(note.content, current.capabilities),
    };
  });
}

export async function selectCapabilityApi(capabilityId: string) {
  return updateWorkspace((current) => ({
    ...current,
    selectedCapabilityId: capabilityId,
  }));
}

export async function updateCaptureDraftApi(draft: string) {
  return updateWorkspace((current) => ({
    ...current,
    captureDraft: draft,
    captureSuggestions: inferCaptureSuggestions(draft, current.capabilities),
  }));
}

export async function updateCaptureCapabilityLinksApi(capabilityIds: string[]) {
  return updateWorkspace((current) => ({
    ...current,
    captureSuggestions: buildAdjustedSuggestions(
      current.captureSuggestions,
      current.capabilities,
      capabilityIds,
    ),
  }));
}

export async function generateReflectionDraftApi() {
  return updateWorkspace((current) => {
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
      usageLogs: [createUsageLogFromTrace(trace), ...current.usageLogs],
    };
  });
}

export async function updateReflectionDraftApi(draft: string) {
  return updateWorkspace((current) => ({
    ...current,
    reflectionDraft: draft,
  }));
}

export async function updateUserProfileApi(patch: Partial<UserProfile>) {
  return updateWorkspace((current) => ({
    ...current,
    userProfile: {
      ...current.userProfile,
      ...patch,
      weeklyGoal: normalizeWeeklyGoal(patch.weeklyGoal, current.userProfile.weeklyGoal),
    },
  }));
}

export async function clearModelTracesApi() {
  return updateWorkspace((current) => ({
    ...current,
    modelTraces: [],
    usageLogs: [],
  }));
}

export async function updateConnectorApi(connectorId: string, payload: ConnectorPatch) {
  return updateWorkspace((current) => ({
    ...current,
    toolConnectors: current.toolConnectors.map((connector) => {
      if (connector.id !== connectorId) return connector;

      const nextConnector = {
        ...connector,
        ...payload,
        updatedAt: new Date().toISOString(),
      };

      if (nextConnector.enabled && nextConnector.status === 'not_connected') {
        nextConnector.status =
          nextConnector.method === 'account' ? 'needs_account' : 'configured';
      }

      return nextConnector;
    }),
  }));
}

function readWorkspace(): WorkspaceState {
  const storage = getStorage();

  if (!storage) {
    if (!memoryWorkspace) {
      memoryWorkspace = createInitialWorkspace();
    }

    return memoryWorkspace;
  }

  applyWorkspaceResetOnce(storage);

  const raw = storage.getItem(STORAGE_KEY);

  if (!raw) {
    const workspace = createInitialWorkspace();
    storage.setItem(STORAGE_KEY, JSON.stringify(workspace));
    return workspace;
  }

  try {
    return normalizeWorkspace(JSON.parse(raw) as Partial<WorkspaceState>);
  } catch {
    const workspace = createInitialWorkspace();
    storage.setItem(STORAGE_KEY, JSON.stringify(workspace));
    return workspace;
  }
}

function applyWorkspaceResetOnce(storage: Storage) {
  if (storage.getItem(WORKSPACE_RESET_KEY) === 'done') return;

  storage.removeItem(STORAGE_KEY);
  storage.setItem(WORKSPACE_RESET_KEY, 'done');
}

function writeWorkspace(workspace: WorkspaceState): WorkspaceState {
  const nextWorkspace = {
    ...workspace,
    updatedAt: new Date().toISOString(),
  };
  const storage = getStorage();

  if (!storage) {
    memoryWorkspace = nextWorkspace;
    return nextWorkspace;
  }

  storage.setItem(STORAGE_KEY, JSON.stringify(nextWorkspace));
  return nextWorkspace;
}

async function updateWorkspace(
  updater: (workspace: WorkspaceState) => WorkspaceState | Promise<WorkspaceState>,
) {
  const current = readWorkspace();
  return writeWorkspace(await updater(current));
}

function createInitialWorkspace(): WorkspaceState {
  return {
    capabilities: clone(capabilities),
    captureDraft: defaultCaptureDraft,
    captureSuggestions: clone(defaultSuggestions),
    coachPlan: clone(coachPlan),
    modelTraces: [],
    notes: [],
    reflectionDraft: '',
    selectedCapabilityId: capabilities[0]?.id ?? '',
    toolConnectors: clone(initialToolConnectors),
    usageLogs: [],
    weeklySummary: clone(weeklySummary),
    userProfile: clone(userProfile),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeWorkspace(workspace: Partial<WorkspaceState>): WorkspaceState {
  const initial = createInitialWorkspace();

  return {
    ...initial,
    ...workspace,
    capabilities: mergeCapabilities(workspace.capabilities, initial.capabilities),
    captureSuggestions: workspace.captureSuggestions ?? initial.captureSuggestions,
    coachPlan: workspace.coachPlan ?? initial.coachPlan,
    modelTraces: workspace.modelTraces ?? [],
    notes: workspace.notes ?? [],
    toolConnectors: mergeToolConnectors(workspace.toolConnectors, initial.toolConnectors),
    usageLogs: normalizeUsageLogs(workspace.usageLogs, workspace.modelTraces, initial.userProfile),
    weeklySummary: workspace.weeklySummary ?? initial.weeklySummary,
    userProfile: {
      ...initial.userProfile,
      ...(workspace.userProfile ?? {}),
    },
  };
}

function normalizeUsageLogs(
  usageLogs: UsageLog[] | undefined,
  traces: ModelCallTrace[] | undefined,
  fallbackUser: UserProfile,
): UsageLog[] {
  if (usageLogs) {
    return usageLogs.map((log) => normalizeUsageLog(log, fallbackUser));
  }

  return (traces ?? []).map((trace) =>
    createUsageLogFromTrace(trace, fallbackUser.focusArea || 'local-user'),
  );
}

function normalizeUsageLog(log: UsageLog, fallbackUser: UserProfile): UsageLog {
  const legacyLog = log as UsageLog & {
    userId?: string;
    promptTokens?: number;
    completionTokens?: number;
    createdAt?: string;
  };

  return {
    id: log.id,
    user_id: log.user_id ?? legacyLog.userId ?? fallbackUser.focusArea ?? 'local-user',
    feature: log.feature ?? 'unknown_feature',
    model: log.model ?? 'unknown_model',
    prompt_tokens: log.prompt_tokens ?? legacyLog.promptTokens ?? 0,
    completion_tokens: log.completion_tokens ?? legacyLog.completionTokens ?? 0,
    cost: log.cost ?? 0,
    latency: log.latency ?? 0,
    created_at: log.created_at ?? legacyLog.createdAt ?? new Date().toISOString(),
  };
}

function mergeUsageLogs(existing: UsageLog[] = [], incoming: UsageLog[] = []) {
  const byId = new Map<string, UsageLog>();

  for (const log of [...incoming, ...existing]) {
    byId.set(log.id, normalizeUsageLog(log, userProfile));
  }

  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

function mergeCapabilities(
  existing: Capability[] | undefined,
  latest: Capability[] = [],
): Capability[] {
  if (!existing) {
    return latest;
  }

  const existingById = new Map(existing.map((capability) => [capability.id, capability]));

  return latest.map((capability) => ({
    ...capability,
    ...(existingById.get(capability.id) ?? {}),
  }));
}

function getUsageLogEndpoints() {
  const endpoints = new Set<string>();
  const configuredBaseUrl = getViteEnv('VITE_API_URL')?.replace(/\/$/, '');

  if (isLocalBrowser()) {
    endpoints.add('http://127.0.0.1:8787/api/usage-logs');
    endpoints.add('http://localhost:8787/api/usage-logs');
  }

  if (configuredBaseUrl) {
    endpoints.add(`${configuredBaseUrl}/api/usage-logs`);
  }

  endpoints.add('/api/usage-logs');

  return [...endpoints];
}

async function readJsonResponse<T>(response: Response, endpoint: string): Promise<T> {
  const text = await response.text();

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(formatNonJsonApiResponse(endpoint, text, error));
  }
}

function formatNonJsonApiResponse(endpoint: string, text: string, error: unknown) {
  const preview = text.trim().slice(0, 80);
  const parserMessage = error instanceof Error ? error.message : String(error);
  const looksLikeSource = /^import\s|\bexport\s+default\b/.test(preview);
  const looksLikeHtml = /^<!doctype html|^<html/i.test(preview);

  if (looksLikeSource || looksLikeHtml) {
    return [
      `Usage Bridge returned a non-JSON response at ${endpoint}.`,
      'The frontend is reaching a static file or app fallback instead of the API handler.',
      'For local development, run npm run dev:api or use vercel dev, then click Sync Bridge again.',
    ].join(' ');
  }

  return `Usage Bridge returned invalid JSON at ${endpoint}. ${parserMessage}`;
}

function formatUsageBridgeError(error: unknown, endpoint: string) {
  const message = error instanceof Error ? error.message : String(error ?? '');

  if (/failed to fetch|networkerror|load failed|connection refused/i.test(message)) {
    return [
      'Usage Bridge is unavailable.',
      'For local development, run npm run dev:api and click Sync Bridge again.',
      'For production, deploy /api/usage-logs and configure Supabase environment variables.',
    ].join(' ');
  }

  return `Usage Bridge sync failed at ${endpoint}. ${message || 'Check the gateway configuration.'}`;
}

function getViteEnv(key: string): string | undefined {
  return (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.[key];
}

function isLocalBrowser(): boolean {
  if (typeof window === 'undefined') return false;

  return ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

function mergeToolConnectors(
  existing: ToolConnector[] = [],
  latest: ToolConnector[] = [],
): ToolConnector[] {
  const existingById = new Map(existing.map((connector) => [connector.id, connector]));

  return latest.map((connector) => {
    const existingConnector = existingById.get(connector.id);

    if (!existingConnector) {
      return connector;
    }

    return {
      ...connector,
      status: existingConnector.status ?? connector.status,
      enabled: existingConnector.enabled ?? connector.enabled,
      mcpEndpoint: existingConnector.mcpEndpoint ?? connector.mcpEndpoint,
      accountHint: existingConnector.accountHint ?? connector.accountHint,
      updatedAt: existingConnector.updatedAt,
    };
  });
}

function getStorage() {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getStageLabel(progress: number) {
  if (progress >= 75) return 'Mastery Sprint';
  if (progress >= 45) return 'Advancing';
  if (progress > 0) return 'Foundational';
  return 'Unexplored';
}

function buildAdjustedSuggestions(
  current: CaptureSuggestions,
  capabilities: Capability[],
  capabilityIds: string[],
): CaptureSuggestions {
  const selectedIds = new Set(capabilityIds);
  const relatedCapabilities = capabilities
    .filter((capability) => selectedIds.has(capability.id))
    .map((capability) => {
      const existing = current.relatedCapabilities.find((item) => item.id === capability.id);

      return {
        id: capability.id,
        name: capability.name,
        reason: existing?.reason ?? 'Manually linked by the user.',
      };
    });

  return {
    ...current,
    relatedCapabilities,
    confidence:
      relatedCapabilities.length === 0 ? 'low' : relatedCapabilities.length === 1 ? 'medium' : 'high',
  };
}

function normalizeWeeklyGoal(nextValue: number | undefined, currentValue: number) {
  if (typeof nextValue !== 'number' || Number.isNaN(nextValue)) {
    return currentValue;
  }

  return Math.max(1, Math.round(nextValue));
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}-${Math.random()}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

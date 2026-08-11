import { getResourceSearchKeywords } from './agent-prompts';
import type { Capability, LearningResource } from '../types/domain';

export interface MCPToolDefinition {
  id: string;
  name: string;
  description: string;
  category: 'search' | 'data' | 'communication' | 'storage';
  capabilities: ('web_search' | 'knowledge' | 'analytics' | 'export')[];
  status: 'available' | 'needs_config' | 'unavailable';
  configFields?: {
    name: string;
    type: 'string' | 'password' | 'select';
    required: boolean;
    placeholder: string;
  }[];
}

export interface SearchOptions {
  capability?: Capability;
  focusArea?: string;
  limit?: number;
  dateRange?: 'day' | 'week' | 'month' | 'year';
}

export const MCP_TOOL_REGISTRY: MCPToolDefinition[] = [
  {
    id: 'web-search',
    name: 'Real Web Search Knowledge Tool',
    description:
      'Calls the platform search API to retrieve current learning resources, then structures them for Coach Agent guidance.',
    category: 'search',
    capabilities: ['web_search', 'knowledge'],
    status: 'available',
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Optional future sync target for evidence, weekly reviews, and learning artifacts.',
    category: 'storage',
    capabilities: ['export'],
    status: 'needs_config',
    configFields: [
      {
        name: 'notion_api_key',
        type: 'password',
        required: true,
        placeholder: 'ntn_xxxxxxxxxxxx',
      },
    ],
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Optional future connector for issues, pull requests, and example repositories.',
    category: 'storage',
    capabilities: ['export'],
    status: 'needs_config',
    configFields: [
      {
        name: 'github_token',
        type: 'password',
        required: true,
        placeholder: 'ghp_xxxxxxxxxxxx',
      },
    ],
  },
];

export async function searchLearningResources(
  capabilityId: string,
  options: SearchOptions = {},
): Promise<LearningResource[]> {
  const limit = options.limit ?? 12;
  const keywords = getResourceSearchKeywords(capabilityId);

  return postKnowledgeSearch({
    capabilityId,
    focusArea: options.focusArea,
    limit,
    queries: buildSearchQueries(capabilityId, keywords, options),
  });
}

export function formatResourcesAsMarkdown(resources: LearningResource[]): string {
  if (resources.length === 0) {
    return '_No learning resources available yet._';
  }

  return resources
    .map(
      (resourceItem, index) =>
        `${index + 1}. **${resourceItem.title}** (${resourceItem.resourceType})\n` +
        `   ${resourceItem.summary}\n` +
        `   Why it helps: ${resourceItem.whyUseful}\n` +
        `   ${resourceItem.url}`,
    )
    .join('\n\n');
}

export function formatResourcesAsCards(resources: LearningResource[]) {
  return resources.map((resourceItem) => ({
    id: resourceItem.id,
    title: resourceItem.title,
    url: resourceItem.url,
    snippet: resourceItem.summary,
    badge: resourceItem.resourceType,
  }));
}

export interface ToolStatus {
  id: string;
  name: string;
  status: 'available' | 'needs_config' | 'configured' | 'error';
  lastUsed?: string;
  config?: Record<string, unknown>;
}

export interface KnowledgeSearchDiagnostic {
  ok: boolean;
  configured: boolean;
  provider: string | null;
  endpoint?: string;
  message: string;
}

export function getToolStatus(): ToolStatus[] {
  return MCP_TOOL_REGISTRY.map((tool) => ({
    id: tool.id,
    name: tool.name,
    status: tool.status === 'needs_config' ? 'needs_config' : 'available',
  }));
}

export function formatToolsForUI(tools: MCPToolDefinition[]) {
  return tools.map((tool) => ({
    id: tool.id,
    name: tool.name,
    description: tool.description,
    category: tool.category,
    status: tool.status,
    badge: getStatusBadge(tool.status),
    icon: getToolIcon(tool.id),
  }));
}

export async function checkKnowledgeSearchConnection(): Promise<KnowledgeSearchDiagnostic> {
  const endpoints = getKnowledgeSearchEndpoints();
  let lastFailure: KnowledgeSearchFailure | null = null;
  let firstReachableUnconfigured:
    | {
        endpoint: string;
        provider: string | null;
      }
    | null = null;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint);
      const payload = (await response.json().catch(() => null)) as {
        configured?: boolean;
        provider?: string | null;
        message?: string;
      } | null;

      if (!response.ok) {
        lastFailure = {
          endpoint,
          status: response.status,
          message: payload?.message,
        };

        if (response.status === 404 || response.status >= 500) {
          continue;
        }

        break;
      }

      const configured = Boolean(payload?.configured);
      const provider = payload?.provider ?? null;

      if (configured) {
        return {
          ok: true,
          configured,
          provider,
          endpoint,
          message: `Knowledge Search is connected through ${provider ?? 'the platform provider'}.`,
        };
      }

      firstReachableUnconfigured ??= {
        endpoint,
        provider,
      };
    } catch (error) {
      lastFailure = {
        endpoint,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (firstReachableUnconfigured) {
    return {
      ok: true,
      configured: false,
      provider: firstReachableUnconfigured.provider,
      endpoint: firstReachableUnconfigured.endpoint,
      message:
        `Knowledge Search API is reachable at ${firstReachableUnconfigured.endpoint}, but no provider key is configured there. ` +
        'Set TAVILY_API_KEY, BRAVE_SEARCH_API_KEY, or SERPAPI_API_KEY for that runtime.',
    };
  }

  return {
    ok: false,
    configured: false,
    provider: null,
    endpoint: lastFailure?.endpoint,
    message: formatKnowledgeSearchError(lastFailure),
  };
}

function buildSearchQueries(
  capabilityId: string,
  keywords: string[],
  options: SearchOptions,
) {
  const readableCapability = capabilityId.replace(/-/g, ' ');
  const focusArea = options.focusArea ?? 'AI product management';
  const primaryKeyword = keywords[0] ?? readableCapability;

  return [
    `${primaryKeyword} official documentation AI product management`,
    `${primaryKeyword} practical tutorial ${focusArea}`,
    `${primaryKeyword} case study ${focusArea}`,
    `${primaryKeyword} research paper LLM AI workflow`,
    `${primaryKeyword} open source tool example`,
  ];
}

type KnowledgeSearchRequest = {
  capabilityId: string;
  focusArea?: string;
  limit: number;
  queries: string[];
};

async function postKnowledgeSearch(requestBody: KnowledgeSearchRequest): Promise<LearningResource[]> {
  const endpoints = getKnowledgeSearchEndpoints();
  const body = JSON.stringify(requestBody);
  let lastFailure: KnowledgeSearchFailure | null = null;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        lastFailure = {
          endpoint,
          status: response.status,
          message: payload?.message,
        };

        if (response.status === 404 || response.status >= 500) {
          continue;
        }

        break;
      }

      const payload = (await response.json()) as { resources?: LearningResource[] };
      return (payload.resources ?? []).slice(0, requestBody.limit);
    } catch (error) {
      lastFailure = {
        endpoint,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  throw new Error(formatKnowledgeSearchError(lastFailure));
}

type KnowledgeSearchFailure = {
  endpoint: string;
  status?: number;
  message?: string;
};

function getKnowledgeSearchEndpoints(): string[] {
  const endpoints = new Set<string>();
  const configuredBaseUrl = getViteEnv('VITE_API_URL')?.replace(/\/$/, '');

  if (isLocalBrowser()) {
    endpoints.add('http://127.0.0.1:8787/api/knowledge-search');
    endpoints.add('http://localhost:8787/api/knowledge-search');
  }

  if (configuredBaseUrl) {
    endpoints.add(`${configuredBaseUrl}/api/knowledge-search`);
  }

  endpoints.add('/api/knowledge-search');

  return [...endpoints];
}

function getViteEnv(key: string): string | undefined {
  return (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.[key];
}

function isLocalBrowser(): boolean {
  if (typeof window === 'undefined') return false;

  return ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

function formatKnowledgeSearchError(failure: KnowledgeSearchFailure | null): string {
  if (!failure) {
    return 'Knowledge Search API is unavailable. Configure the platform search API before generating live resources.';
  }

  if (failure.message && !isFetchNetworkError(failure.message)) {
    return failure.message;
  }

  if (isFetchNetworkError(failure.message)) {
    return [
      'Knowledge Search API is unreachable.',
      'For local development, run npm run dev:api alongside npm run dev.',
      'For production, deploy the Vercel API route and configure a search provider key.',
    ].join(' ');
  }

  if (failure.status === 404) {
    return [
      'Knowledge Search API was not found.',
      'For local development, run npm run dev:api alongside npm run dev.',
      'For production, deploy the Vercel API route and configure a search provider key.',
    ].join(' ');
  }

  if (failure.status === 503) {
    return 'Real web search is not configured. Set TAVILY_API_KEY, BRAVE_SEARCH_API_KEY, or SERPAPI_API_KEY in the platform environment.';
  }

  return `Knowledge Search API failed${failure.status ? ` with status ${failure.status}` : ''}. Check platform search configuration.`;
}

function isFetchNetworkError(message?: string) {
  return Boolean(message && /failed to fetch|networkerror|load failed/i.test(message));
}

function getStatusBadge(status: MCPToolDefinition['status']): string {
  const badgeMap: Record<MCPToolDefinition['status'], string> = {
    available: 'Available',
    needs_config: 'Needs setup',
    unavailable: 'Unavailable',
  };
  return badgeMap[status];
}

function getToolIcon(toolId: string): string {
  const iconMap: Record<string, string> = {
    'web-search': 'Search',
    notion: 'Notes',
    github: 'Code',
  };
  return iconMap[toolId] ?? 'Tool';
}

export default {
  MCP_TOOL_REGISTRY,
  searchLearningResources,
  formatResourcesAsMarkdown,
  formatResourcesAsCards,
  checkKnowledgeSearchConnection,
  getToolStatus,
  formatToolsForUI,
};

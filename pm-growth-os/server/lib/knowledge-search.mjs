import { loadLocalEnv } from './env-loader.mjs';

loadLocalEnv();

const providerOrder = ['tavily', 'brave', 'serpapi'];

export async function searchKnowledgeResources(payload = {}) {
  const capabilityId = String(payload.capabilityId ?? 'prompt-engineering');
  const focusArea = String(payload.focusArea ?? 'AI product management');
  const limit = normalizeLimit(payload.limit);
  const queries = normalizeQueries(payload.queries, capabilityId, focusArea);
  const provider = getSearchProvider();

  if (!provider) {
    const error = new Error(
      'Real web search is not configured. Set TAVILY_API_KEY, BRAVE_SEARCH_API_KEY, or SERPAPI_API_KEY on the platform.',
    );
    error.statusCode = 503;
    throw error;
  }

  const rawResults = await runProviderSearch(provider, queries, limit);

  return dedupeResults(rawResults)
    .slice(0, limit)
    .map((result, index) =>
      toLearningResource({
        result,
        capabilityId,
        focusArea,
        index,
      }),
    );
}

export function getKnowledgeSearchStatus() {
  const provider = getSearchProvider();

  return {
    configured: Boolean(provider),
    provider: provider?.name ?? null,
  };
}

async function runProviderSearch(provider, queries, limit) {
  const perQueryLimit = Math.max(3, Math.ceil(limit / Math.max(queries.length, 1)) + 1);
  const resultGroups = await Promise.all(
    queries.map((query) => provider.search(query, perQueryLimit)),
  );

  return resultGroups.flat();
}

function getSearchProvider() {
  const forcedProvider = process.env.SEARCH_PROVIDER?.toLowerCase();
  const orderedProviders = forcedProvider
    ? [forcedProvider, ...providerOrder.filter((provider) => provider !== forcedProvider)]
    : providerOrder;

  for (const provider of orderedProviders) {
    if (provider === 'tavily' && process.env.TAVILY_API_KEY) {
      return {
        name: 'tavily',
        search: searchTavily,
      };
    }

    if (provider === 'brave' && process.env.BRAVE_SEARCH_API_KEY) {
      return {
        name: 'brave',
        search: searchBrave,
      };
    }

    if (provider === 'serpapi' && process.env.SERPAPI_API_KEY) {
      return {
        name: 'serpapi',
        search: searchSerpApi,
      };
    }
  }

  return null;
}

async function searchTavily(query, limit) {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      search_depth: 'advanced',
      max_results: limit,
      include_answer: false,
      include_raw_content: false,
    }),
  });

  if (!response.ok) {
    throw await createProviderError('Tavily', response);
  }

  const data = await response.json();
  return (data.results ?? []).map((item) => ({
    title: String(item.title ?? query),
    url: String(item.url ?? ''),
    snippet: String(item.content ?? item.snippet ?? ''),
    source: getHostname(item.url),
    score: Number(item.score ?? 0),
  }));
}

async function searchBrave(query, limit) {
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(Math.min(limit, 20)));
  url.searchParams.set('search_lang', 'en');

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY,
    },
  });

  if (!response.ok) {
    throw await createProviderError('Brave Search', response);
  }

  const data = await response.json();
  return (data.web?.results ?? []).map((item) => ({
    title: String(item.title ?? query),
    url: String(item.url ?? ''),
    snippet: stripHtml(String(item.description ?? '')),
    source: getHostname(item.url),
    score: 0,
  }));
}

async function searchSerpApi(query, limit) {
  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google');
  url.searchParams.set('q', query);
  url.searchParams.set('num', String(Math.min(limit, 10)));
  url.searchParams.set('api_key', process.env.SERPAPI_API_KEY);

  const response = await fetch(url);

  if (!response.ok) {
    throw await createProviderError('SerpAPI', response);
  }

  const data = await response.json();
  return (data.organic_results ?? []).map((item) => ({
    title: String(item.title ?? query),
    url: String(item.link ?? ''),
    snippet: String(item.snippet ?? ''),
    source: getHostname(item.link),
    score: Number(item.position ? 1 / item.position : 0),
  }));
}

function toLearningResource({ result, capabilityId, focusArea, index }) {
  const resourceType = classifyResource(result);

  return {
    id: `web-${capabilityId}-${index + 1}-${hashText(result.url || result.title)}`,
    title: result.title,
    url: result.url,
    source: result.source || 'Web',
    resourceType,
    summary:
      result.snippet ||
      `A web resource related to ${readableCapability(capabilityId)} and ${focusArea}.`,
    whyUseful: buildWhyUseful(resourceType, capabilityId, focusArea),
    difficulty: inferDifficulty(resourceType, result.title, result.snippet),
    estimatedMinutes: estimateMinutes(resourceType),
  };
}

function normalizeQueries(queries, capabilityId, focusArea) {
  if (Array.isArray(queries) && queries.length > 0) {
    return queries
      .map((query) => String(query).trim())
      .filter(Boolean)
      .slice(0, 5);
  }

  const capability = readableCapability(capabilityId);
  return [
    `${capability} official documentation AI product management`,
    `${capability} practical tutorial AI product manager`,
    `${capability} case study ${focusArea}`,
    `${capability} research paper LLM AI workflow`,
    `${capability} open source tool example`,
  ];
}

function classifyResource(result) {
  const haystack = `${result.title} ${result.url} ${result.snippet}`.toLowerCase();

  if (haystack.includes('docs') || haystack.includes('documentation') || haystack.includes('official')) {
    return 'official';
  }

  if (haystack.includes('github.com') || haystack.includes('tool') || haystack.includes('sdk')) {
    return 'tool';
  }

  if (haystack.includes('arxiv') || haystack.includes('paper') || haystack.includes('research')) {
    return 'paper';
  }

  if (haystack.includes('case study') || haystack.includes('how we')) {
    return 'case-study';
  }

  if (haystack.includes('framework') || haystack.includes('langgraph') || haystack.includes('llamaindex')) {
    return 'framework';
  }

  return 'tutorial';
}

function buildWhyUseful(resourceType, capabilityId, focusArea) {
  const capability = readableCapability(capabilityId);
  const reasonMap = {
    official: `Use this to anchor ${capability} learning in source-of-truth guidance before applying it to ${focusArea}.`,
    framework: `Use this to see how ${capability} becomes an implementation pattern rather than an isolated concept.`,
    tutorial: `Use this to turn ${capability} into a concrete practice exercise you can complete this week.`,
    'case-study': `Use this to connect ${capability} with real product decisions and tradeoffs in ${focusArea}.`,
    paper: `Use this to understand the research assumptions behind ${capability} before adopting the idea in production.`,
    tool: `Use this when you are ready to move from learning ${capability} to testing or automating it.`,
  };

  return reasonMap[resourceType];
}

function inferDifficulty(resourceType, title, snippet) {
  const haystack = `${title} ${snippet}`.toLowerCase();

  if (resourceType === 'paper' || haystack.includes('advanced') || haystack.includes('architecture')) {
    return 'advanced';
  }

  if (resourceType === 'framework' || resourceType === 'tool') {
    return 'intermediate';
  }

  return 'beginner';
}

function estimateMinutes(resourceType) {
  const estimateMap = {
    official: 25,
    framework: 40,
    tutorial: 30,
    'case-study': 25,
    paper: 45,
    tool: 35,
  };

  return estimateMap[resourceType];
}

function dedupeResults(results) {
  const seen = new Set();

  return results.filter((result) => {
    if (!result.url) return false;
    const key = result.url.toLowerCase().replace(/\/$/, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeLimit(limit) {
  const parsed = Number(limit);

  if (!Number.isFinite(parsed)) {
    return 12;
  }

  return Math.min(12, Math.max(1, Math.round(parsed)));
}

function readableCapability(capabilityId) {
  const map = {
    'prompt-engineering': 'prompt engineering',
    'ai-product-strategy': 'AI product strategy',
    'user-research-synthesis': 'user research synthesis',
    'context-engineering': 'context engineering',
    'rag-knowledge-systems': 'RAG knowledge systems',
    'agent-design': 'agent design',
    'tool-orchestration': 'tool orchestration',
    'ai-evaluation': 'AI evaluation',
    'experimentation-metrics': 'AI product experimentation metrics',
    'ai-safety-governance': 'AI safety governance',
    'automation-ops': 'AI workflow automation operations',
    'product-storytelling': 'AI product storytelling',
    'multi-agent-collaboration': 'multi-agent collaboration',
  };

  return map[capabilityId] ?? capabilityId.replace(/-/g, ' ');
}

function hashText(value) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash).toString(36);
}

function getHostname(value) {
  try {
    return new URL(String(value)).hostname.replace(/^www\./, '');
  } catch {
    return 'Web';
  }
}

function stripHtml(value) {
  return value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

async function createProviderError(provider, response) {
  const body = await response.text();
  const error = new Error(`${provider} search failed with ${response.status}: ${body.slice(0, 240)}`);
  error.statusCode = response.status;
  return error;
}

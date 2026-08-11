import {
  getKnowledgeSearchStatus,
  searchKnowledgeResources,
} from '../server/lib/knowledge-search.mjs';

export default async function handler(request, response) {
  setCorsHeaders(response);

  if (request.method === 'OPTIONS') {
    response.status(204).end();
    return;
  }

  if (request.method === 'GET') {
    response.status(200).json({
      ok: true,
      service: 'pm-growth-os-knowledge-search',
      ...getKnowledgeSearchStatus(),
    });
    return;
  }

  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const resources = await searchKnowledgeResources(request.body ?? {});
    response.status(200).json({ resources });
  } catch (error) {
    const status = Number(error?.statusCode ?? 500);
    response.status(status).json({
      error: 'Knowledge search failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function setCorsHeaders(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

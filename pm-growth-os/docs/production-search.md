# Production Web Search Setup

PM Growth OS uses a server-side Knowledge Search API so end users never provide search credentials.

## Required Environment

Configure at least one provider in Vercel project environment variables:

- `TAVILY_API_KEY`
- `BRAVE_SEARCH_API_KEY`
- `SERPAPI_API_KEY`

Optional:

- `SEARCH_PROVIDER=tavily`
- `SEARCH_PROVIDER=brave`
- `SEARCH_PROVIDER=serpapi`

If `SEARCH_PROVIDER` is omitted, the API selects the first configured provider in this order:
Tavily, Brave Search, SerpAPI.

## Runtime API

- `GET /api/knowledge-search` returns provider configuration status.
- `POST /api/knowledge-search` accepts `capabilityId`, `focusArea`, `limit`, and `queries`.
- The response returns structured `LearningResource[]` data for Coach Agent.

The app does not return mock or static search results. If no provider key is configured, the API returns a `503` error with a setup message.

## In-App Diagnostics

Open **Tool Connectors** and click **Test Knowledge Search** on the Web Search connector.

- If the API route is reachable and a provider key is configured, the connector is marked `enabled`.
- If the API route is reachable but no key is configured, the connector stays `not_connected` and shows the missing-key setup message.
- If the API route is unreachable or missing, the app explains whether to run `npm run dev:api` locally or redeploy the Vercel API route.

## Local Development

Run the API server and Vite frontend in two terminals:

```bash
npm run dev:api
npm run dev
```

For local development, put one provider key in `.env` or `.env.local`, then restart
`npm run dev:api`. The local Node API loads `.env.local` first and `.env` second.

When running `npm run preview`, Vite only serves the built static app. PM Growth OS will try `/api/knowledge-search` first, then fall back to `http://localhost:8787/api/knowledge-search` in local browsers. If your API runs elsewhere, set `VITE_API_URL` before building the frontend.

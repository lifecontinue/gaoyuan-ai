/**
 * Launch-sync page state persistence (Vercel Blob).
 * Pathname: launch-sync/state.json
 *
 * GET  — latest JSON (empty shape if none). CORS * so PM bot can fetch production URL.
 * PUT/POST — full state object; sets meta.updatedAt.
 *
 * Weak write guard: if env LAUNCH_SYNC_WRITE_KEY is set, require header x-launch-sync-key
 * on PUT/POST. If unset, writes are allowed (page is noindex under /work/).
 */
const { put, list, head, get } = require("@vercel/blob");

const BLOB_PATH = "launch-sync/state.json";

function setCors(_req, res, methods) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-launch-sync-key");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Cache-Control", "no-store");
}

function emptyState() {
  return {
    features: [],
    hiddenApps: [],
    meta: {},
  };
}

function normalize(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return emptyState();
  const features = Array.isArray(data.features) ? data.features : [];
  const hiddenApps = Array.isArray(data.hiddenApps)
    ? data.hiddenApps.map(String)
    : [];
  return {
    features,
    hiddenApps,
    meta: data.meta && typeof data.meta === "object" && !Array.isArray(data.meta) ? data.meta : {},
  };
}

function authorizeWrite(req, res) {
  const key = process.env.LAUNCH_SYNC_WRITE_KEY;
  if (!key) return true;
  const sent = req.headers["x-launch-sync-key"];
  if (sent === key) return true;
  res.status(401).json({ error: "unauthorized" });
  return false;
}

async function resolveBlobUrl() {
  try {
    const meta = await head(BLOB_PATH);
    if (meta && meta.url) return meta.url;
  } catch (_) {
    /* not found */
  }
  const listed = await list({ prefix: BLOB_PATH, limit: 20 });
  const blobs = listed.blobs || [];
  const exact = blobs.find((b) => b.pathname === BLOB_PATH);
  return (exact || blobs[0] || {}).url || null;
}

async function streamToJson(stream) {
  const text = await new Response(stream).text();
  if (!text) return emptyState();
  return normalize(JSON.parse(text));
}

async function readState() {
  try {
    const result = await get(BLOB_PATH, { access: "public", useCache: false });
    if (result && result.statusCode === 200 && result.stream) {
      return await streamToJson(result.stream);
    }
  } catch (_) {
    /* fall through */
  }

  const url = await resolveBlobUrl();
  if (!url) return emptyState();
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 404) return emptyState();
  if (!res.ok) {
    const err = new Error("blob fetch " + res.status);
    err.statusCode = 502;
    throw err;
  }
  const data = await res.json();
  return normalize(data);
}

async function writeState(payload) {
  const state = normalize(payload);
  state.meta = state.meta || {};
  state.meta.updatedAt = new Date().toISOString();
  const blob = await put(BLOB_PATH, JSON.stringify(state), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json; charset=utf-8",
    cacheControlMaxAge: 0,
  });
  return { state, url: blob.url };
}

module.exports = async function handler(req, res) {
  setCors(req, res, "GET,HEAD,PUT,POST,OPTIONS");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
    if (req.method === "GET" || req.method === "HEAD") {
      const state = await readState();
      if (req.method === "HEAD") {
        res.status(200).end();
        return;
      }
      res.status(200).json(state);
      return;
    }

    if (req.method === "PUT" || req.method === "POST") {
      if (!authorizeWrite(req, res)) return;
      let body = req.body;
      if (typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch (_) {
          res.status(400).json({ error: "body must be valid JSON" });
          return;
        }
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        res.status(400).json({ error: "body must be a JSON object" });
        return;
      }
      const { state, url } = await writeState(body);
      res.status(200).json({
        ok: true,
        updatedAt: state.meta.updatedAt,
        url,
      });
      return;
    }

    res.setHeader("Allow", "GET, HEAD, PUT, POST, OPTIONS");
    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    const status = Number(err && err.statusCode) || 500;
    res.status(status).json({
      error: "launch-sync-state failed",
      message: err instanceof Error ? err.message : String(err),
    });
  }
};

/**
 * Product-milestones overview page state persistence (Vercel Blob).
 * Pathname: product-milestones/state.json
 *
 * GET  — latest JSON (empty shape if none). CORS * so PM bot can fetch production URL.
 * PUT/POST — full { current, filter, meta } object; sets meta.updatedAt.
 *
 * Weak write guard: if env PRODUCT_MILESTONES_WRITE_KEY is set, require header
 * x-product-milestones-key on PUT/POST. If unset, writes are allowed
 * (page is under /work/, disallowed in robots.txt).
 */
const { put, list, head, get } = require("@vercel/blob");

const BLOB_PATH = "product-milestones/state.json";

function setCors(_req, res, methods) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-product-milestones-key");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Cache-Control", "no-store");
}

function isObj(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function emptyState() {
  return {
    current: {},
    filter: "all",
    meta: {},
  };
}

function normalize(data) {
  if (!isObj(data)) return emptyState();
  const current = isObj(data.current) ? data.current : {};
  const filter = typeof data.filter === "string" ? data.filter : "all";
  return {
    current,
    filter,
    meta: isObj(data.meta) ? data.meta : {},
  };
}

function authorizeWrite(req, res) {
  const key = process.env.PRODUCT_MILESTONES_WRITE_KEY;
  if (!key) return true;
  const sent = req.headers["x-product-milestones-key"];
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
      error: "product-milestones-state failed",
      message: err instanceof Error ? err.message : String(err),
    });
  }
};

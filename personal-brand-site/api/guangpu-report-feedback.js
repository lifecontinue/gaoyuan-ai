/**
 * 光谱汇报页反馈 persistence (Vercel Blob). Same pattern as api/xlx-marks.js.
 * Pathname: guangpu-report/feedback.json
 *
 * GET  — latest JSON (empty shape if none). CORS * so the PM assistant can read it back.
 * PUT/POST — full { nodes, general, meta } object; sets meta.updatedAt.
 *
 * Weak write guard: if env GUANGPU_REPORT_WRITE_KEY is set, require header
 * x-guangpu-report-key on PUT/POST. If unset, writes are allowed (page is noindex under /work/).
 */
const { put, list, head, get } = require("@vercel/blob");

const BLOB_PATH = "guangpu-report/feedback.json";

function setCors(_req, res, methods) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-guangpu-report-key");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Cache-Control", "no-store");
}

function isObj(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function emptyFeedback() {
  return { nodes: {}, general: {}, meta: {} };
}

function normalize(data) {
  if (!isObj(data)) return emptyFeedback();
  return {
    nodes: isObj(data.nodes) ? data.nodes : {},
    general: isObj(data.general) ? data.general : {},
    meta: isObj(data.meta) ? data.meta : {},
  };
}

function authorizeWrite(req, res) {
  const key = process.env.GUANGPU_REPORT_WRITE_KEY;
  if (!key) return true;
  if (req.headers["x-guangpu-report-key"] === key) return true;
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

async function readFeedback() {
  try {
    const result = await get(BLOB_PATH, { access: "public", useCache: false });
    if (result && result.statusCode === 200 && result.stream) {
      const text = await new Response(result.stream).text();
      return text ? normalize(JSON.parse(text)) : emptyFeedback();
    }
  } catch (_) {
    /* fall through to list + fetch */
  }

  const url = await resolveBlobUrl();
  if (!url) return emptyFeedback();
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 404) return emptyFeedback();
  if (!res.ok) {
    const err = new Error("blob fetch " + res.status);
    err.statusCode = 502;
    throw err;
  }
  return normalize(await res.json());
}

async function writeFeedback(payload) {
  const data = normalize(payload);
  data.meta.updatedAt = new Date().toISOString();
  const blob = await put(BLOB_PATH, JSON.stringify(data), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json; charset=utf-8",
    cacheControlMaxAge: 0,
  });
  return { data, url: blob.url };
}

module.exports = async function handler(req, res) {
  setCors(req, res, "GET,HEAD,PUT,POST,OPTIONS");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
    if (req.method === "GET" || req.method === "HEAD") {
      const data = await readFeedback();
      if (req.method === "HEAD") {
        res.status(200).end();
        return;
      }
      res.status(200).json(data);
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
      if (!isObj(body)) {
        res.status(400).json({ error: "body must be a JSON object" });
        return;
      }
      const { data, url } = await writeFeedback(body);
      res.status(200).json({ ok: true, updatedAt: data.meta.updatedAt, url });
      return;
    }

    res.setHeader("Allow", "GET, HEAD, PUT, POST, OPTIONS");
    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    const status = Number(err && err.statusCode) || 500;
    res.status(status).json({
      error: "guangpu-report-feedback failed",
      message: err instanceof Error ? err.message : String(err),
    });
  }
};

/**
 * Same-origin proxy → ai-classroom-roles-agent
 * Avoids CORS when the prototype runs on gaoyuan-ai.xyz.
 */
const AGENT = "https://ai-classroom-roles-agent.vercel.app";

module.exports = async function handler(req, res) {
  try {
    const parts = [].concat(req.query.path || []).filter((p) => p !== undefined && p !== null && String(p).length);
    const sub = parts.map(String).filter(Boolean).join("/");
    const incoming = new URL(req.url, "http://localhost");
    const target = `${AGENT}/${sub}${incoming.search || ""}`;

    const headers = { Accept: req.headers.accept || "application/json" };
    if (req.headers["content-type"]) headers["Content-Type"] = req.headers["content-type"];

    const init = { method: req.method, headers };
    if (req.method !== "GET" && req.method !== "HEAD") {
      if (typeof req.body === "string") init.body = req.body;
      else if (Buffer.isBuffer(req.body)) init.body = req.body;
      else if (req.body != null) init.body = JSON.stringify(req.body);
    }

    const upstream = await fetch(target, init);
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.status(upstream.status);
    const ct = upstream.headers.get("content-type");
    if (ct) res.setHeader("Content-Type", ct);
    res.setHeader("Cache-Control", "no-store");
    res.send(buf);
  } catch (err) {
    res.status(502).json({
      ok: false,
      error: "classroom_proxy_failed",
      detail: String(err && err.message ? err.message : err),
    });
  }
};

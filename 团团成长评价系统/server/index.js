/* =========================================================
   server/index.js — 极简 AI 代理 + 静态托管服务（Node 内置模块，无第三方依赖）
   职责：
   1. 托管 dist 静态前端（默认 ../dist-generic）
   2. 提供 POST /api/ai/chat → 转发 DeepSeek，API Key 存于服务端（.env / 环境变量），用户免输入
   运行：node index.js  （或 npm start）
   环境变量：
     PORT            监听端口（默认 8080）
     PUBLIC_DIR      静态目录（默认 ../dist-generic）
     DEEPSEEK_API_KEY DeepSeek Key（也可放同目录 .env）
     API_BASE_URL    DeepSeek 网关（默认 https://api.deepseek.com）
     MODEL           模型名（默认 deepseek-chat）
   ========================================================= */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = __dirname;
const PORT = parseInt(process.env.PORT || '8080', 10);
const PUBLIC_DIR = path.resolve(process.env.PUBLIC_DIR || path.join(ROOT, '..', 'dist-generic'));
const ASSETS_DIR = path.resolve(process.env.ASSETS_DIR || path.join(ROOT, 'public'));
const API_BASE_URL = process.env.API_BASE_URL || 'https://api.deepseek.com';
const MODEL = process.env.MODEL || 'deepseek-chat';
// 子路径部署基址，例如 https://host/tuantuan/ 时设为 /tuantuan（前端会自动按页面路径推断，无需改动）
const BASE_PATH = (process.env.BASE_PATH || '').replace(/\/+$/, '');

/* ---------- 读取 Key：环境变量优先，否则解析 server/.env ---------- */
function loadKey() {
  if (process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY.trim()) return process.env.DEEPSEEK_API_KEY.trim();
  const envPath = path.join(ROOT, '.env');
  try {
    const txt = fs.readFileSync(envPath, 'utf8');
    const m = txt.split('\n').map(l => l.trim()).find(l => /^DEEPSEEK_API_KEY=/.test(l));
    if (m) { const v = m.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, ''); if (v) return v; }
  } catch (e) { /* 无 .env */ }
  return '';
}
const KEY = loadKey();

/* ---------- CORS 中间件 ---------- */
function applyCors(req, res) {
  const origin = req.headers['origin'] || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

/* ---------- 静态文件 MIME ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.wasm': 'application/wasm', '.data': 'application/octet-stream', '.binarypb': 'application/octet-stream'
};

/* ---------- 本地资源（手势模型等，离线可用） ---------- */
/* 优先从 ASSETS_DIR(server/public) 取，缺失时回退到 PUBLIC_DIR(dist-generic)，
   避免「只更新了一处 mediapipe 资源」导致手势模型加载失败、界面自动关闭。 */
function sendAssets(rel, res) {
  const urlPath = decodeURIComponent(rel);
  const norm = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const candidates = [ASSETS_DIR, PUBLIC_DIR];
  const tryNext = (i) => {
    if (i >= candidates.length) { res.writeHead(404); res.end('not found'); return; }
    const base = candidates[i];
    const filePath = path.join(base, norm);
    if (!filePath.startsWith(base)) { tryNext(i + 1); return; }
    fs.readFile(filePath, (err, data) => {
      if (err) { tryNext(i + 1); return; }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=86400' });
      res.end(data);
    });
  };
  tryNext(0);
}

function sendStatic(rel, res) {
  let urlPath = decodeURIComponent(rel);
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA 兜底：未命中文件时回退 index.html
      const idx = path.join(PUBLIC_DIR, 'index.html');
      fs.readFile(idx, (e2, d2) => {
        if (e2) { res.writeHead(404); res.end('not found'); }
        else { res.writeHead(200, { 'Content-Type': MIME['.html'] }); res.end(d2); }
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

/* ---------- 子路径部署：剥离 BASE_PATH 前缀 ---------- */
function stripBase(p) {
  if (!BASE_PATH) return p;
  if (p === BASE_PATH) return '/';
  if (p.startsWith(BASE_PATH + '/')) return p.slice(BASE_PATH.length);
  return null; // 不在基址下
}

/* ---------- /api/ai/chat 代理 ---------- */
function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0, chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('body too large')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleChat(req, res) {
  if (!KEY) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: { message: '服务端未配置 DEEPSEEK_API_KEY，请在 server/.env 中填写后重启服务。' } }));
    return;
  }
  let body;
  try { body = JSON.parse(await readBody(req)); } catch (e) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: '请求体不是合法 JSON' } })); return; }
  // 客户端可传 stream:true 开启流式；默认流式（前端逐字显示）
  const useStream = body.stream !== false;
  const payload = {
    model: body.model || MODEL,
    messages: Array.isArray(body.messages) ? body.messages : [],
    temperature: typeof body.temperature === 'number' ? body.temperature : 0.6,
    max_tokens: typeof body.max_tokens === 'number' ? body.max_tokens : 1200,
    stream: useStream
  };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    let upstream;
    try {
      upstream = await fetch(API_BASE_URL + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY },
        body: JSON.stringify(payload),
        signal: ctrl.signal
      });
    } finally {
      clearTimeout(timer);
    }
    if (!upstream.ok) {
      // 上游鉴权/错误：原样返回 JSON（前端据此回落本地规则）
      const text = await upstream.text();
      res.writeHead(upstream.status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(text);
      return;
    }
    if (!useStream) {
      const text = await upstream.text();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(text);
      return;
    }
    // 流式：将 DeepSeek 的 SSE 透传给前端
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    const reader = upstream.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
        if (typeof res.flush === 'function') res.flush();
      }
    } finally {
      if (typeof res.end === 'function' && !res.writableEnded) res.end();
      try { reader.cancel(); } catch (e) {}
    }
  } catch (e) {
    if (e && e.name === 'AbortError') {
      if (!res.headersSent) {
        res.writeHead(504, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: { message: 'AI 服务响应超时，请稍后重试。' } }));
      } else {
        res.write('event: error\ndata: ' + JSON.stringify({ message: '响应超时，已中断' }) + '\n\n');
        try { res.end(); } catch (e2) {}
      }
      return;
    }
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: { message: '转发 DeepSeek 失败：' + (e && e.message ? e.message : String(e)) } }));
    } else {
      res.write('event: error\ndata: ' + JSON.stringify({ message: '转发 DeepSeek 失败' }) + '\n\n');
      try { res.end(); } catch (e2) {}
    }
  }
}

/* ---------- /api/search Web 搜索代理 ---------- */
async function handleSearch(req, res) {
  let body;
  try { body = JSON.parse(await readBody(req)); } catch (e) { res.writeHead(400).end('{"error":"bad json"}'); return; }
  const q = (body.query || '').trim();
  if (!q || q.length < 2) { res.writeHead(400).end('{"error":"query required"}'); return; }
  const max = Math.min(body.max_results || 5, 10);
  const results = [];

  // 1. 先尝试 DuckDuckGo Instant Answer API
  try {
    const ddgUrl = 'https://api.duckduckgo.com/?q=' + encodeURIComponent(q) + '&format=json&no_html=1&skip_disambig=1';
    const ddg = await fetch(ddgUrl, { headers: { 'User-Agent': 'tuantuan-growth/1.0' } }).then(r => r.json()).catch(() => null);
    if (ddg && ddg.AbstractText) {
      results.push({ title: ddg.Heading || q, url: ddg.AbstractURL || '', snippet: ddg.AbstractText });
    }
    if (ddg && Array.isArray(ddg.RelatedTopics)) {
      for (const t of ddg.RelatedTopics) {
        if (results.length >= max) break;
        if (t.Text) results.push({ title: t.Text.substring(0, 80), url: t.FirstURL || '', snippet: t.Text });
      }
    }
  } catch (e) { /* DDG API failed, continue */ }

  // 2. 若 DDG API 无结果，尝试 DDG HTML 搜索页面
  if (results.length === 0) {
    try {
      const htmlUrl = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q);
      const htmlRes = await fetch(htmlUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }).then(r => r.text()).catch(() => '');
      // 简易解析：提取 class="result__snippet" 和 class="result__url"
      const snippetRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
      const urlRe = /class="result__url"[^>]*>([\s\S]*?)<\/a>/gi;
      const matches = [...htmlRes.matchAll(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi)];
      for (const m of matches) {
        if (results.length >= max) break;
        const text = m[1].replace(/<[^>]+>/g, '').trim().slice(0, 300);
        if (text) results.push({ title: text.slice(0, 60), url: '', snippet: text });
      }
    } catch (e) { /* HTML search failed */ }
  }

  // 3. 最终兜底
  if (results.length === 0) {
    results.push({
      title: q,
      url: 'https://www.google.com/search?q=' + encodeURIComponent(q),
      snippet: '（未找到即时搜索结果。可点击链接在 Google 中查看，或尝试更具体的关键词。）'
    });
  }

  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ query: q, results: results.slice(0, max), source: results.length > 1 ? 'duckduckgo+html' : 'duckduckgo' }));
}

/* ---------- 路由 ---------- */
const server = http.createServer((req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const p = new URL(req.url, 'http://x').pathname;
  const rel = stripBase(p);
  if (rel === null) { res.writeHead(404); res.end('not found'); return; }
  if (rel === '/api/ai/chat' && req.method === 'POST') { handleChat(req, res).catch(() => { if (!res.headersSent) { res.writeHead(500); res.end('error'); } }); return; }
  if (rel === '/api/search' && req.method === 'POST') { handleSearch(req, res).catch(() => { if (!res.headersSent) { res.writeHead(500); res.end('error'); } }); return; }
  if (rel.startsWith('/api/')) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'unknown api' } })); return; }
  if (rel.startsWith('/mediapipe/')) { sendAssets(rel, res); return; }
  sendStatic(rel, res);
});

server.listen(PORT, () => {
  console.log('[tuantuan-ai-server] 静态目录: ' + PUBLIC_DIR);
  console.log('[tuantuan-ai-server] 本地资源: ' + ASSETS_DIR + (fs.existsSync(ASSETS_DIR) ? '（存在）' : '（缺失）'));
  console.log('[tuantuan-ai-server] DeepSeek Key: ' + (KEY ? '已加载(' + KEY.slice(0, 6) + '…)' : '未配置！请填写 server/.env'));
  console.log('[tuantuan-ai-server] 部署基址 BASE_PATH: ' + (BASE_PATH || '（根）'));
  console.log('[tuantuan-ai-server] 监听 http://localhost:' + PORT);
});

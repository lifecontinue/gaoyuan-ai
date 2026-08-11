---
name: wechat-migrate
description: >-
  Batch-export WeChat Official Account (微信公众号) articles into a personal
  website: Markdown + localized images + a JSON index, with taxonomy preserved.
  Use when the user wants to migrate / export their own public-account posts to
  their own site. Triggers: 公众号文章导出, 批量导出公众号, 迁移公众号到个人站,
  export WeChat articles, WeChat to Markdown, WeChat Official Account migration.
version: 1.0.0
---

# WeChat Official Account → Personal Site Migration

A guided, three-step workflow that turns a WeChat Official Account into portable
Markdown articles on the user's own website. The bundled `wechat-migrate/` folder
contains the Python tooling. This skill is **interactive** — it asks the user for
input, verifies before doing heavy work, then reports status.

> **Scope & ethics.** This only works for the user's *own* account, using their
> own already-logged-in session. The tool is **read-only** (no publish/edit/delete).
> Use it only to migrate content the user owns.

---

## Prerequisites (verify before starting)

- Python 3.11+ and `pip` available.
- The user can log into <https://mp.weixin.qq.com> in a desktop browser (Chrome recommended).
- A target personal-site directory where articles will land (Markdown + images + index).
- The bundled `wechat-migrate/` folder is present (this skill ships it).

If the user only has a list of article URLs (no backend login), the tool also
supports a `link_list` channel — see `config.example.yaml` → `fetch.channel`.

---

## Step 1 — Collect credentials and VERIFY accuracy

The only manual step. The user must provide two values; you must verify them
**before** any batch work, because an expired/invalid session wastes a full run.

### 1a. Tell the user exactly how to find each value

Print these instructions (adapt language to the user):

**`token`** — after scanning into the backend, look at the address bar:
`https://mp.weixin.qq.com/cgi-bin/home?t=home/index&lang=zh_CN&token=1234567890`
The trailing digits are the token.

**`cookie`** — open DevTools (`F12`) → **Network** → refresh the page → click the
first `home?t=home/index...` request → **Headers** → **Request Headers** →
`cookie:` → right-click **Copy value**. Save it as one line (no `cookie:` prefix,
no line breaks) into `wechat-migrate/secrets/cookie.txt`.

> Tip: put the cookie in `secrets/cookie.txt` (recommended) rather than inline in
> YAML — it avoids escaping problems and keeps it out of the config file.

### 1b. Ask the user to provide

- `token` (the number), and
- either the raw cookie string, or confirmation that `secrets/cookie.txt` is filled.

Do **not** echo the raw cookie back in chat. Treat it as a secret.

### 1c. Verify (this is the accuracy gate)

```
cd wechat-migrate
cp config.example.yaml config.yaml        # gitignored; holds the session
# fill auth.token and auth.cookie_file in config.yaml (or write cookie into secrets/cookie.txt)
python run.py check
```

Interpret the result:

| `check` output | Meaning | Your action |
|---|---|---|
| `[v] 登录态有效 … 后台可见内容总数：N` | Credentials correct, session live | ✅ proceed to Step 2 |
| `[x] 登录态失效` / `ret=200003` | Cookie/token expired | Ask user to **re-do 1a–1b**, then re-run `check` |
| `[x] 配置错误：…` | Config malformed | Fix the reported field, re-run `check` |
| `[x] 接口访问失败` | Network / proxy issue | Check proxy in `config.network`, retry |

**Do not continue until `check` passes.** This is the "核对用户提供是否准确" gate.

---

## Step 2 — Batch export and organize locally (per schema)

### 2a. Point at the target site

In `config.yaml`, set (at minimum):

```yaml
auth:
  token: "1234567890"
  cookie_file: "secrets/cookie.txt"
output:
  site_root: "D:/path/to/personal-brand-site"   # where articles land
```

All other paths (`content/posts`, `assets/img/posts`, `assets/js/data/posts.json`)
have safe defaults relative to `site_root`. Adjust `taxonomy.keyword_rules` if the
user wants auto-tagging of older posts without an album.

### 2b. Trial run (never go full immediately)

```
python run.py list            # list only, download nothing — confirm count matches expectation
python run.py sync --limit 3  # migrate 3 articles, inspect output
```

Inspect the produced **schema** under `site_root`:

- **`content/posts/<slug>.md`** — YAML front-matter + Markdown body. Front-matter
  fields: `title, slug, date, author, account, summary, categories[], tags[],
  cover, original, word_count, wechat_url, source_url, wechat_sn, imported_at`.
- **`assets/img/posts/<slug>/`** — images localized by content sha1 (deduped,
  one copy per unique image across all articles).
- **`assets/js/data/posts.json`** — index consumed by the front end. Each post:
  `id, title, slug, date, timestamp, summary, author, categories[], tags[],
  cover, wordCount, imageCount, markdown, wechatUrl, sourceUrl, archived`.

If formatting looks wrong, tweak `config.yaml` and re-run `sync --limit 3 --force`.

### 2c. Full sync

```
python run.py sync
```

Report the printed summary:

```
列出 / 新增 / 更新 / 无变化 / 按日期跳过 / 已失效 / 失败    (counts)
图片  下载 / 复用 / 跳过 / 失败
```

Rules to communicate:
- Safe to `Ctrl+C` anytime — progress is saved; re-run resumes from the gap.
- `ret=200013` (rate-limited) → wait 10–30 min, optionally raise
  `network.min_delay` to 4–6s, re-run.
- Failures → `python run.py retry`.
- Status: return **listed / added / updated / failed / gone** counts and the media
  download tally. If `failed > 0`, say so explicitly and offer `retry`.

---

## Step 3 — Ask the import target, import, return status

### 3a. Ask where to import

After export, ask the user **where** the articles should be imported/served:

1. **Markdown + images + index only** — already written to `site_root` during sync.
   Nothing more to do; confirm the three artifact locations exist.
2. **Also build the static, crawler-readable layer** (recommended for SEO / AI
   discoverability) — run the site's static generator so each post becomes a
   standalone HTML page plus `sitemap.xml` + `llms.txt`:
   ```
   cd <site_root>
   node tools/build-posts.mjs
   ```
   (Requires Node 18+; zero external deps — reuses the site's `md-render.js`.)
3. **A different framework** (Hugo / Astro / Hexo / Notion) — the `content/posts/*.md`
   files are standard front-matter Markdown and import directly. Set
   `output.site_root` to that project and re-run `sync`.

### 3b. Execute the chosen import

Run the selected command(s). If option 2, confirm:
- `content/posts/<slug>.html` generated for every `.md`
- `sitemap.xml` updated (URL count = static pages + posts)
- `llms.txt` updated

### 3c. Return a status report

Summarize for the user:

- **Source**: WeChat account `<name>`, `<N>` articles visible in backend.
- **Exported**: `<added>` new / `<updated>` updated / `<failed>` failed / `<gone>` removed.
- **Local schema**: `<count>` Markdown files in `content/posts/`, `<M>` images in
  `assets/img/posts/`, index at `assets/js/data/posts.json`.
- **Import**: which target was chosen and the resulting artifact paths / URLs.
- **Next step**: deploy (e.g. `vercel deploy --prod`) or commit & push; remind that
  `config.yaml` and `secrets/` must **never** be committed or shared.

---

## Command quick reference

| Command | Purpose |
|---|---|
| `python run.py check` | Validate config + verify login session (Step 1 gate) |
| `python run.py list` | List backend articles, download nothing |
| `python run.py sync --limit 3` | Trial migrate 3 articles |
| `python run.py sync` | Full incremental sync (main export) |
| `python run.py sync --force` | Re-fetch everything, ignore incremental state |
| `python run.py retry` | Retry previously failed articles |
| `python run.py stats` | Show what's already synced |
| `python run.py build` | Regenerate `posts.json` from local state, no network |
| `python selftest.py` | Offline self-test (50 checks, no login needed) |
| `node tools/build-posts.mjs` | Build static HTML + sitemap + llms.txt (Step 3) |

## Gotchas to surface proactively

- **Cookie/token expire in hours–days** → if `check` fails, re-capture; the tool
  tells you clearly when the session died.
- **`state.db` is more valuable than the Markdown** — it holds dedup/incremental
  state. Back it up; deleting it forces a full re-sync.
- **Images need localization** (`media.download: true`) — mmbiz hotlink protection
  will otherwise break images on the new site.
- **Never commit `config.yaml` / `secrets/`** — both are gitignored by design.

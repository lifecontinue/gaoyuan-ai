# WeChat → Personal Site Migration Skill

Batch-export your own WeChat Official Account (微信公众号) articles into a personal
website as portable Markdown + localized images + a JSON index, with categories and
tags preserved.

本包把一个「批量把公众号文章导出到个人网站」的能力，整理成了一个可下载、可复用的 Skill。

---

## What's inside / 包含内容

```
wechat-migrate-skill/
├── SKILL.md                 ← the agent workflow (3 steps). Load this into your AI assistant.
├── README.md                ← this file
└── wechat-migrate/          ← the Python tooling (clean copy, no secrets)
    ├── config.example.yaml
    ├── requirements.txt
    ├── run.py  selftest.py  demo_seed.py
    └── wxmigrate/           ← cli / config / http / state / article / media / convert / exporter / pipeline
        └── sources/         ← mp_backend (login session) + link_list (URL list) collectors
```

No `config.yaml`, `secrets/`, or `state.db` is included — those hold your private
session and must be created locally. Never share them.

---

## Option A — Use as an AI assistant Skill (recommended)

1. Unzip this package.
2. Copy the folder (or just `SKILL.md`) into your assistant's skill directory, e.g.:
   - User-level: `~/.workbuddy/skills/wechat-migrate/`
   - Project-level: `<your-project>/.workbuddy/skills/wechat-migrate/`
3. In a conversation, say something like *"导出我的公众号文章到个人网站"* or
   *"export my WeChat articles to my site"*. The assistant will follow `SKILL.md`:
   collect & verify your login session → batch-export & organize locally → ask where
   to import & report status.

## Option B — Run the tooling manually

```bash
cd wechat-migrate
python -m venv .venv && .venv/Scripts/pip install -r requirements.txt
cp config.example.yaml config.yaml
# fill auth.token + auth.cookie_file, then:
python run.py check     # verify login
python run.py sync      # export
```

See `wechat-migrate/README.md` for the full parameter table and FAQ.

---

## The 3-step workflow (summary)

1. **Collect & verify** — you provide the `token` (from the backend URL) and the
   `cookie` (DevTools → Network → copy `cookie` header). The assistant verifies with
   `run.py check` *before* any heavy work, so an expired session is caught early.
2. **Batch export & organize** — `run.py sync` writes Markdown + localized images +
   `posts.json` to your site, following a fixed schema (front-matter fields documented
   in `SKILL.md`). Resumable, rate-limited, deduped.
3. **Ask import target & report status** — the assistant asks where to import (Markdown
   only / build static HTML+sitemap+llms.txt / another framework), runs it, and returns
   a status summary.

---

## Notes / 注意事项

- Read-only: migrates **your own** content; never publishes/edits/deletes on WeChat.
- Your unverified personal-subscription account has no material API, so this reuses
  your own logged-in backend session — equivalent to manually saving each post.
- Cookie/token expire in hours–days; `check` will tell you when to re-capture.
- Keep `config.yaml` and `secrets/` private. Back up `state.db` (it drives incremental sync).

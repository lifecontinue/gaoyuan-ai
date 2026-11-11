# 个人开发栈：Cursor 本地 → Vercel 分享 → Supabase 数据

企业那套（Auth0、Gateway、Linear、LangGraph…）是组织操作系统。  
**个人**要的是更短的闭环：**本机改代码 → 推 Git → 自动上线 → 把链接发给别人就能用**。

---

## 你需要什么（按优先级）

| # | 服务 | 干什么 | 没有它会怎样 |
|---|------|--------|--------------|
| 1 | **Cursor** | 本地写代码 / Agent | 你已经在用 |
| 2 | **GitHub** | 存代码、触发部署、协作审 PR | Vercel 没法稳定自动发布 |
| 3 | **Vercel** | 构建托管、HTTPS、预览链接、自定义域名 | 别人打不开你的站点 |
| 4 | **Supabase** | Postgres、登录（Auth）、文件存储、Realtime | 只有静态页，没有「用户数据」 |
| 5 | **环境变量对齐** | `.env.local` ↔ Vercel ↔ Supabase | 本地通、线上挂，或密钥进仓库 |
| 6 | **（可选）自定义域名** | `yourname.com` 绑到 Vercel | 只能用 `*.vercel.app` |
| 7 | **（可选）LLM Key** | OpenAI / Anthropic 等 | 没有 AI 功能也能做普通产品 |
| 8 | **（可选）观测** | Vercel Analytics / Sentry | 不知道线上谁崩了 |

**最小可分享产品 = 1+2+3+4+5。**  
域名和 LLM 按需再加。

```text
你（Cursor）
  → git push → GitHub
                 ↓
              Vercel 自动 Deploy → https://xxx.vercel.app  ← 发给别人
                 ↓
         浏览器调 Supabase（DB / Auth / Storage）
```

---

## 和「企业 AI Infra」怎么对应（个人版缩写）

| 企业职责 | 个人用什么顶上 |
|----------|----------------|
| Auth0 | Supabase Auth |
| 1Password + Gateway | 本机 `.env.local` + Vercel Environment Variables（别提交 Git） |
| Linear / Slack Bot | GitHub Issues + 自己看 Vercel Deploy 通知即可 |
| Data Lake / Metabase | Supabase Table Editor + 简单 SQL |
| Langfuse | 先可省略；有 AI 流量再接 |
| n8n / LangGraph | 个人项目用 Vercel Serverless / Supabase Edge Functions 就够 |

---

## 连接状态（持续更新）

| 项 | 状态 |
|----|------|
| Cursor / Git / Node | OK |
| Vercel CLI | 已登录 **lifecontinue** |
| GitHub CLI (`gh`) | 已登录 **lifecontinue**（keyring） |
| Supabase CLI | 已登录 |
| 选用项目 | **lifecontinue's Project** · ref `ghlbpxlyclmgsawfjhqt` |
| `supabase link` | ⏳ 项目曾为 **paused**，需 Dashboard Restore 后再 link |
| 本地脚手架 | 仓库内 `personal-lab/`（含 `.env.example`） |

恢复项目：https://supabase.com/dashboard/project/ghlbpxlyclmgsawfjhqt  

恢复后在 `personal-lab` 执行：

```powershell
npx supabase link --project-ref ghlbpxlyclmgsawfjhqt --yes
```

---

## Step 1 — GitHub（已完成）

账号 `lifecontinue`，HTTPS，凭证在 keyring。日常：`git push` 即可触发后续 Vercel（若已 Import 仓库）。

---

## Step 2 — Vercel ↔ GitHub

你已经是 Vercel 用户 `lifecontinue`。任选一种：

**A. 网页（最省事）**

1. 打开 https://vercel.com/new  
2. Import 你的 GitHub 仓库  
3. Root Directory 指到具体应用目录（例如 `personal-lab` 或品牌站子目录）  
4. Deploy → 得到 `https://xxx.vercel.app`

**B. CLI**

```bash
cd personal-lab   # 或你的应用目录
npx vercel
npx vercel --prod
```

之后：`git push` → Vercel 自动构建 → 链接可分享。

---

## Step 3 — Supabase（选用 lifecontinue's Project）

1. 确认项目已 **Restore**（非 paused）：https://supabase.com/dashboard/project/ghlbpxlyclmgsawfjhqt  
2. Settings → API：复制 URL、`anon` public、`service_role`（仅服务端）  
3. 本机：

```bash
cd personal-lab
npx supabase link --project-ref ghlbpxlyclmgsawfjhqt --yes
copy .env.example .env.local
# 编辑 .env.local 填入 anon / service_role
```

4. 同一组变量加到 Vercel Environment Variables（Production + Preview）。

脚手架说明见仓库 [`personal-lab/README.md`](../personal-lab/README.md)。

---

## Step 4 — 「本地编辑 → 在线给别人用」日常动作

```text
1. Cursor 里改代码
2. 本地 npm run dev 自己点一遍
3. git add / commit / push
4. 等 Vercel Deploy 变绿
5. 把生产或 Preview URL 发给别人
```

Preview：每个 PR / 分支一条临时链接，适合给朋友试。  
Production：主分支自动，适合「正式分享」。

---

## Step 5 — 可选加项

| 项 | 何时加 | 怎么接 |
|----|--------|--------|
| 自定义域名 | 要品牌域名 | Vercel → Domains → 按提示改 DNS |
| OpenAI/Anthropic Key | 产品里有 AI | 只放 Vercel/本地 env，前端走自己的 `/api` 代理，别把 key 打进浏览器 |
| Vercel Analytics | 想看访问量 | 项目里一键启用 |
| Sentry | 想抓前端报错 | 接 DSN 到 env |

---

## 我这边接下来需要你配合的两步

交互登录无法替你点浏览器，请你本机完成：

1. `gh auth login`  
2. `npx supabase login`（若还没有 Supabase 项目，先在 Dashboard 建一个）

完成后回复我：

- GitHub 登录是否 OK  
- Supabase **project ref**（Settings → General 里那串）或项目名  
- 你想挂到 Vercel 的**哪个仓库/哪个子目录**（例如 `personal-brand-site` 还是新建一个 app）

我就可以继续帮你：`vercel link`、写好 `.env.example`、把 Supabase URL/Anon 接到该应用，并确认一次 Preview 部署链接。

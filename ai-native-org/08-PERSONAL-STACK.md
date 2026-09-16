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

## 连接状态（本机刚查过）

| 项 | 状态 |
|----|------|
| Git | 已安装 |
| Node | 已安装（v24） |
| Vercel CLI | 已安装，账号 **lifecontinue** 已登录 |
| GitHub CLI (`gh`) | **未登录** → 需要你在本机跑一次登录 |
| Supabase CLI | 可用（npx）；**项目登录/选项目**还要做一步 |

下面按顺序帮你连。

---

## Step 1 — GitHub（必做，需你点一下浏览器）

在 **本机终端**执行（会打开浏览器）：

```bash
gh auth login
```

建议选项：

- GitHub.com  
- HTTPS  
- Login with a web browser  

登录成功后告诉我，或自己跑：

```bash
gh auth status
```

有了 GitHub，Vercel 才能「跟仓库自动发版」。你的公开仓示例：https://github.com/lifecontinue/gaoyuan-ai

---

## Step 2 — Vercel ↔ GitHub

你已经是 Vercel 用户 `lifecontinue`。任选一种：

**A. 网页（最省事）**

1. 打开 https://vercel.com/new  
2. Import 你的 GitHub 仓库  
3. Root Directory 指到具体应用目录（例如品牌站或某个 app 子目录）  
4. Deploy → 得到 `https://xxx.vercel.app`

**B. CLI（在项目根目录）**

```bash
cd <你的应用目录>
npx vercel login   # 若未登录
npx vercel         # 预览
npx vercel --prod  # 生产
```

之后：`git push` → Vercel 自动构建 → 链接可分享。

---

## Step 3 — Supabase

1. 打开 https://supabase.com/dashboard → New project  
2. 记下：
   - Project URL  
   - `anon` public key（前端可用）  
   - `service_role` key（**只放服务端 / Vercel 私密变量，绝不进前端**）  
3. 本机登录 CLI（浏览器）：

```bash
npx supabase login
npx supabase link --project-ref <你的-project-ref>
```

4. 本地环境文件（**不要 commit**）`.env.local`：

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
# 仅服务端：
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

5. 同一组变量加到 Vercel → Project → Settings → Environment Variables（Production + Preview）。

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

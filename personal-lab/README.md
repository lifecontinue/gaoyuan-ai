# personal-lab

个人最小闭环实验目录：Cursor 本地开发 → GitHub → Vercel 分享 → Supabase（`lifecontinue's Project`）。

## 已选定的 Supabase 项目

| 字段 | 值 |
|------|-----|
| Name | lifecontinue's Project |
| Reference ID | `ghlbpxlyclmgsawfjhqt` |
| Region | Southeast Asia (Singapore) / `ap-southeast-1` |
| API URL | `https://ghlbpxlyclmgsawfjhqt.supabase.co` |
| DB host | `db.ghlbpxlyclmgsawfjhqt.supabase.co` |

> 当前状态曾为 **paused**。需在 Dashboard 点 Restore / Unpause：  
> https://supabase.com/dashboard/project/ghlbpxlyclmgsawfjhqt

## 连接步骤

### 1. 恢复项目后，在本目录 link

```powershell
cd personal-lab
npx supabase link --project-ref ghlbpxlyclmgsawfjhqt --yes
```

若提示数据库密码：在 Dashboard → Project Settings → Database 重置/查看后，仅在本机输入，不要发到聊天。

### 2. 环境变量

1. 打开 https://supabase.com/dashboard/project/ghlbpxlyclmgsawfjhqt/settings/api  
2. 复制 `Project URL`、`anon` `public` key  
3. 复制 `.env.example` → `.env.local`，填入（`.env.local` 已在 gitignore，勿提交）  
4. 同一组变量加到 Vercel Project → Settings → Environment Variables

### 3. Vercel

```powershell
npx vercel link
npx vercel env pull .env.local   # 可选：从 Vercel 拉回
npx vercel --prod
```

得到 `https://xxx.vercel.app` 即可分享。

## 和其它 Supabase 项目的关系

| 项目 | ref | 用途建议 |
|------|-----|----------|
| **lifecontinue's Project**（本目录） | `ghlbpxlyclmgsawfjhqt` | 个人通用 / 新实验 |
| child-assessment-system | `nmkjzhqonmdyghydvdyy` | 成长评估专用 |
| pm-growth-os | `bpajujusxbfhpzquhwgo` | PM Growth OS 专用（勿混用） |

不要把多个产品的表塞进同一个项目，除非你有意做成统一后端。

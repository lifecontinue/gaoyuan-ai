# PM 成长操作系统 PM Growth OS

面向产品经理的成长操作系统：把方法论、目标与复盘沉淀为个人能力地图，支撑持续自进化。

## 技术栈
- React 19 + Vite + TypeScript
- Supabase（数据 / 认证）
- 轻量 Node 服务（`server/`、`api/`）

## 本地运行
```bash
npm install
npm run dev        # 开发
npm run build      # 产物在 dist/
```

## 环境变量
复制 `.env.example` 为 `.env` 并填写所需密钥（Tavily / WandB / Langfuse / Supabase 等）。
**真实密钥请勿提交**——本仓库已通过 `.gitignore` 排除 `.env`。
生产环境参考 `.env.production.example`。

## 部署
本仓库统一以子域名 **`pm-growth-os.gaoyuan-ai.xyz`** 发布：Vercel 项目根目录指向本文件夹，
构建命令 `npm run build`、输出目录 `dist/`，并在 Vercel 项目设置中配置上述环境变量。

> 注意：AI 相关能力依赖上述密钥；密钥缺失时前端可正常构建，但智能功能不可用。

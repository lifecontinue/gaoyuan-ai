# gaoyuan-ai.xyz 混合部署 — 状态与 DNS 配置清单

> 2026-08-11 深夜 · 方案：3 应用内嵌主站真实子路径 + 5 应用走子域名

## 一、结论：不是回滚，部署是最新版本

线上已确认（curl 实测）：

| 校验项 | 结果 |
|---|---|
| 主站 https://gaoyuan-ai.xyz/ | ✅ 200 |
| /tank-wars/（内嵌） | ✅ 200，资源 css/js 全通 |
| /poop-tracker/（内嵌） | ✅ 200 |
| /pm-growth-os/（内嵌） | ✅ 200，assets 全通 |
| 线上 apps.js | ✅ 9 个应用条目齐全，URL 与本地一致 |
| 真实 DNS（Google DoH 查证） | ❌ 5 个子域名 **CNAME 全部缺失** |

**"缺失几个 app"的真实原因**：5 个子域名（travel-map / growth-stars / child-assessment / neck-soccer / breathe）在阿里云从未添加 CNAME，真实互联网里解析不到 → 点击这 5 个 app 打不开，看起来像缺失/回滚。Vercel 侧域名已全部 verified（继承 apex 验证），只差你这边加 DNS。

> 若页面仍显示旧布局：浏览器 **Ctrl+F5 强制刷新**（apps.js 无版本号，可能命中缓存）。

## 二、你需要在阿里云添加的 DNS 记录（5 条）

域名 gaoyuan-ai.xyz 解析设置里，类型选 **CNAME**，记录值统一为：

```
cname.vercel-dns.com
```

| 主机记录（前缀） | 类型 | 记录值 | 对应应用 |
|---|---|---|---|
| travel-map | CNAME | cname.vercel-dns.com | 旅行故事地图 |
| growth-stars | CNAME | cname.vercel-dns.com | 成长星图 |
| child-assessment | CNAME | cname.vercel-dns.com | 儿童成长评估 |
| neck-soccer | CNAME | cname.vercel-dns.com | 颈部足球 |
| breathe | CNAME | cname.vercel-dns.com | 呼吸 |

- 添加后 Vercel 会自动校验并签发 SSL（通常几分钟内），5 个 app 即可打开。
- 无需 DNS 的 3 个内嵌 app：tank-wars / poop-tracker / pm-growth-os（已生效）。

## 三、本次已完成的动作

1. 3 应用复制进 `personal-brand-site/{tank-wars,poop-tracker,pm-growth-os}/`（pm-growth-os 为 Vite base:'./' 构建产物，子路径资源可正确加载）。
2. `vercel.json` 移除 8 条 rewrites，恢复纯静态（保留 trailingSlash:true）。
3. `apps.js` 9 条 URL 定为：3 内嵌子路径 + 5 子域名 + /practice/。
4. 从 git 外副本目录部署成功（Ready in 9s，已 alias 到 gaoyuan-ai.xyz）。
5. Git 提交并推送：`f5197fe`（apps.js / vercel.json / 3 内嵌目录）。

## 四、遗留（需你操作）

- **DNS**：见上表 5 条 CNAME。
- **Vercel 团队成员**：把 `yuan.gao@crimsoneducation.org` 加入 lifecontinues-projects 团队（Settings → Members），Git 集成部署报错即可消除。

# gaoyuan-ai.xyz 子域名 CNAME 配置清单（阿里云）

> 生成时间：2026-08-11 23:05 · 已验证：Vercel 侧 5 个域名全部 `verified: True`，目标 `cname.vercel-dns.com` 解析正常
> 适用域名：gaoyuan-ai.xyz（阿里云，nameserver dns11/dns12.hichina.com）

## 操作入口

阿里云控制台 → 域名 → 找到 `gaoyuan-ai.xyz` → 解析 → 添加记录
（或直接访问：https://dns.console.aliyun.com/ 选择 gaoyuan-ai.xyz）

## 需要添加的 5 条 CNAME 记录

| # | 主机记录（Host） | 记录类型 | 记录值（Value） | TTL | 对应应用 |
|---|---|---|---|---|---|
| 1 | `travel-map` | CNAME | `cname.vercel-dns.com` | 10 分钟（默认） | 旅行故事地图 |
| 2 | `growth-stars` | CNAME | `cname.vercel-dns.com` | 10 分钟（默认） | 成长星图 |
| 3 | `child-assessment` | CNAME | `cname.vercel-dns.com` | 10 分钟（默认） | 儿童成长评估 |
| 4 | `neck-soccer` | CNAME | `cname.vercel-dns.com` | 10 分钟（默认） | 颈部足球 |
| 5 | `breathe` | CNAME | `cname.vercel-dns.com` | 10 分钟（默认） | 呼吸 |

## 填写说明（阿里云控制台逐字段）

- **记录类型**：选 `CNAME`（不是 A，不是 TXT）
- **主机记录**：只填前缀，不带域名。例如 `travel-map`，**不要**填 `travel-map.gaoyuan-ai.xyz`
- **记录值**：`cname.vercel-dns.com`，末尾不加点、不加域名
- **解析线路**：默认（默认线路）即可
- **TTL**：默认 10 分钟即可（无需改）
- 每条添加完点「确认」，5 条全部添加后生效

## 预期结果

- 添加后 **几分钟内** Vercel 自动完成校验并签发 HTTPS 证书
- 可访问性验证：
  - `https://travel-map.gaoyuan-ai.xyz/` → 旅行地图
  - `https://growth-stars.gaoyuan-ai.xyz/` → 成长星图
  - `https://child-assessment.gaoyuan-ai.xyz/` → 儿童成长评估
  - `https://neck-soccer.gaoyuan-ai.xyz/` → 颈部足球
  - `https://breathe.gaoyuan-ai.xyz/` → 呼吸
- 若 10 分钟后仍打不开：返回本清单检查「主机记录」是否误填了完整域名（最常见错误）

## 已配置无需动（参考）

| 记录 | 类型 | 值 | 用途 |
|---|---|---|---|
| `@`（裸域） | A | `76.76.21.21` | 主站 gaoyuan-ai.xyz（已生效） |
| `www` | CNAME | 见 Vercel 指引 | www.gaoyuan-ai.xyz（已生效） |

## 备注

- 3 个内嵌应用（tank-wars / poop-tracker / pm-growth-os）走主站子路径 `/tank-wars/` 等，**不需要**任何 DNS 记录，已经可用。
- 素白板（collab-whiteboard）是站内单文件 `/collab-whiteboard.html`，也不需要 DNS。

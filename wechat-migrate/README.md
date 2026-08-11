# wechat-migrate

把微信公众号的全部历史文章批量导出，转成 Markdown，图片本地化，并接入个人站点
`personal-brand-site` 的 `/writing` 板块。支持去重与增量同步，可以长期反复跑。

---

## 一、它做了什么

```
公众号后台登录态
      │
      ▼
 ① 列表采集 ──── 翻页拿到全部已发表图文（标题/链接/时间/合集）
      │
      ▼
 ② 增量判定 ──── 已同步过的直接跳过，连详情页请求都不发
      │
      ▼
 ③ 正文解析 ──── 标题·作者·发布时间·原文链接·合集·话题标签
      │
      ▼
 ④ 媒体本地化 ── 图片按内容指纹去重后落到 assets/img/posts/
      │
      ▼
 ⑤ 落盘 ──────── content/posts/*.md  +  assets/js/data/posts.json
                              │
                              ▼
                    站点 /writing.html 前端渲染
```

产物三件套：

| 产物 | 位置 | 说明 |
|---|---|---|
| Markdown 正文 | `personal-brand-site/content/posts/*.md` | 带 YAML front-matter，可直接迁去任何 CMS |
| 本地化图片 | `personal-brand-site/assets/img/posts/<slug>/` | 全局按 sha1 去重，同图只存一份 |
| 前端索引 | `personal-brand-site/assets/js/data/posts.json` | 只含元数据，正文按需 fetch |

---

## 二、为什么走「后台登录态」这条路

你的公众号是**未认证个人订阅号**，这类账号申请不到「素材管理」API 权限，
官方的 `freepublish/batchget` 接口对你不可用。剩下的合规选项只有一条：

> 复用你本人在浏览器里已经登录的后台会话，调用后台自己在用的那个列表接口。

这不是绕过鉴权，而是用你自己的身份读你自己的数据 —— 和你手动在后台一页页翻、
一篇篇另存为，性质完全相同，只是自动化了。脚本全程只读，不发布、不修改、不删除任何内容。

配套的克制措施：

- 请求间强制 2.5–5 秒随机停顿（可调，但不建议调低）
- 命中频率限制立即停止并冷却，不做暴力重试
- 增量机制让第二次之后的同步几乎不产生请求量

如果哪天你把公众号升级成认证账号，可以切到官方 API；采集器是可插拔的，
新增一个 source 模块即可，其余四步完全复用。

---

## 三、执行步骤

### 步骤 0 · 准备环境（只做一次）

依赖已经装在独立虚拟环境里，不会污染你的系统 Python：

```
C:/Users/haida/.workbuddy/binaries/python/envs/wxmigrate/Scripts/python.exe
```

为了少打字，下文统一用 `PY` 指代这个路径。若要重建环境：

```bash
cd "D:/forster children/wechat-migrate"
C:/Users/haida/.workbuddy/binaries/python/versions/3.13.12/python.exe -m venv \
  C:/Users/haida/.workbuddy/binaries/python/envs/wxmigrate
C:/Users/haida/.workbuddy/binaries/python/envs/wxmigrate/Scripts/pip.exe install -r requirements.txt
```

先跑一次离线自检，确认管线完好（不联网、不需要登录态，50 项检查）：

```bash
$PY selftest.py
```

---

### 步骤 1 · 生成配置文件

```bash
cd "D:/forster children/wechat-migrate"
cp config.example.yaml config.yaml
```

`config.yaml` 已被 `.gitignore` 排除。**里面会有你的登录态，不要提交、不要外发。**

---

### 步骤 2 · 抓取登录态（token + Cookie）

这是唯一需要手动操作的一步，大约一分钟。登录态有效期通常几小时到几天，
过期后重做本步即可 —— 脚本会明确告诉你「登录态失效」。

1. Chrome 打开 <https://mp.weixin.qq.com>，扫码登录你的公众号后台。

2. **取 token**：登录后看地址栏，形如
   `https://mp.weixin.qq.com/cgi-bin/home?t=home/index&lang=zh_CN&token=1234567890`
   末尾那串数字就是 token。填进 `config.yaml` 的 `auth.token`。

3. **取 Cookie**：按 `F12` 打开开发者工具 → `Network` 面板 → 刷新页面 →
   点列表里第一个 `home?t=home/index...` 请求 → 右侧 `Headers` →
   往下找到 **Request Headers** 里的 `cookie:` → 右键 `Copy value`（或手动全选复制冒号后面的一整串）。

4. 新建 `secrets/cookie.txt`，把那一整串粘进去（**一整行，不要换行，不要带 `cookie:` 前缀**）：

   ```
   D:/forster children/wechat-migrate/secrets/cookie.txt
   ```

> 小贴士：Cookie 很长（通常 500+ 字符），放文件里比塞进 YAML 更不容易出错，
> 也避免了 YAML 特殊字符转义的坑。

---

### 步骤 3 · 填写必要配置

`config.yaml` 里**至少**要改这三处，其余都有合理默认值：

```yaml
auth:
  token: "1234567890"                                   # 步骤 2 拿到的
  cookie_file: "secrets/cookie.txt"                     # 步骤 2 建的

output:
  site_root: "D:/forster children/personal-brand-site"  # 已预填，一般不用动
```

顺手可以调的：

```yaml
account:
  name: "你的公众号名"          # 会写进每篇文章的 front-matter

taxonomy:
  keyword_rules:                # 没有「合集」的老文章靠它自动打标签
    AI产品: ["AI", "大模型", "Agent"]
```

---

### 步骤 4 · 校验（强烈建议，别跳过）

```bash
$PY run.py check
```

它会一次性验证：配置合法性、站点目录存在、token 与 Cookie 匹配、登录态有效，
并告诉你后台一共有多少条内容。看到下面这样就说明可以往下走了：

```
[v] 配置校验通过
[v] 登录态有效（接口：appmsgpublish）
    后台可见内容总数：87
```

---

### 步骤 5 · 先看清单，不下载

```bash
$PY run.py list
```

只翻列表、不抓正文、不下图片。用来确认「后台能看到的文章数」和你的预期一致。

---

### 步骤 6 · 小批量试跑

**不要一上来就全量。** 先跑 3 篇，检查转换质量：

```bash
$PY run.py sync --limit 3
```

然后去看产物：

- `personal-brand-site/content/posts/` 里的 Markdown 排版是否正常
- `personal-brand-site/assets/img/posts/` 里图片是否下全
- 起个本地服务器看页面效果：

  ```bash
  cd "D:/forster children/personal-brand-site"
  $PY -m http.server 8899
  # 浏览器打开 http://127.0.0.1:8899/writing.html
  ```

如果排版有问题，调整 `config.yaml` 后加 `--force` 重跑这几篇即可。

---

### 步骤 7 · 全量同步

```bash
$PY run.py sync
```

按文章数量估算耗时：默认限速下**每篇约 3–6 秒**（正文 1 次请求 + 图片若干）。
100 篇大约 10–20 分钟。

跑的过程中可以随时 `Ctrl+C` 中断 —— 每篇处理完立即落库，下次重跑会从缺口继续，
不会重复搬运已完成的部分。

结束后会打印一份账单：

```
====================================================
  列出           87
  新增           85
  更新            0
  无变化          0
  按日期跳过      0
  已失效          2
  失败            0
  图片        下载 412 / 复用 63 / 跳过 0 / 失败 1
====================================================
```

---

### 步骤 8 · 日常增量

以后每次发了新文章，只要跑：

```bash
$PY run.py sync
```

已同步的文章连详情页都不会请求，通常几十秒就跑完。

---

### 步骤 9 · 部署上线

你的站点是 Vercel 零构建静态部署，把新增的三类文件推上去即可：

```
content/posts/*.md
assets/img/posts/**
assets/js/data/posts.json
writing.html  assets/js/writing.js  assets/js/md-render.js  assets/css/writing.css
```

上线后访问 `https://gaoyuan-ai.xyz/writing.html`。

> **注意**：`vercel.json` 里 `cleanUrls: false`，所以 URL 要带 `.html` 后缀。
> 想要 `/writing` 这种干净路径，把 `cleanUrls` 改成 `true` 即可。

---

## 四、命令速查

| 命令 | 作用 |
|---|---|
| `$PY run.py check` | 校验配置 + 验证登录态 |
| `$PY run.py list` | 只列出文章清单，不下载 |
| `$PY run.py sync` | 增量同步（主命令） |
| `$PY run.py sync --limit 5` | 本轮最多处理 5 篇，用于试跑 |
| `$PY run.py sync --force` | 忽略增量判定，全部重抓 |
| `$PY run.py sync --dry-run` | 只报告将要做什么，不写任何文件 |
| `$PY run.py build` | 不联网，仅重新生成 `posts.json` |
| `$PY run.py stats` | 查看已同步的家底 |
| `$PY run.py retry` | 重试此前失败的文章 |
| `$PY selftest.py` | 离线自检（50 项） |
| `$PY demo_seed.py --clean` | 清除演示样例文章 |

加 `-v` 可看调试级日志，加 `-c 路径` 可指定别的配置文件。

---

## 五、配置参数全表

### `account`
| 参数 | 默认 | 说明 |
|---|---|---|
| `name` | `""` | 公众号名，写入 front-matter |
| `biz` | `""` | `__biz` 参数，留空自动识别 |

### `auth`
| 参数 | 默认 | 说明 |
|---|---|---|
| `token` | `""` | **必填**（mp_backend 通道）后台 URL 里的 token |
| `cookie` | `""` | Cookie 整串，与 `cookie_file` 二选一 |
| `cookie_file` | `secrets/cookie.txt` | Cookie 文件路径，**推荐用这个** |

### `fetch`
| 参数 | 默认 | 说明 |
|---|---|---|
| `channel` | `mp_backend` | `mp_backend`（后台登录态）/ `link_list`（链接清单） |
| `page_size` | `20` | 每页条数，接口上限 20 |
| `max_pages` | `0` | 最多翻几页，0 = 不限 |
| `since` | `""` | 只同步该日期之后的文章，`YYYY-MM-DD` |
| `link_list_file` | `links.txt` | `link_list` 通道的链接清单文件 |

### `network`
| 参数 | 默认 | 说明 |
|---|---|---|
| `min_delay` / `max_delay` | `2.5` / `5.0` | 请求间随机停顿区间（秒）。**低于 2 秒极易触发频控** |
| `timeout` | `30` | 单请求超时（秒） |
| `max_retries` | `3` | 失败重试次数（指数退避） |
| `cooldown_on_freq_limit` | `600` | 命中频控后建议冷却秒数 |
| `proxy` | `""` | 如 `http://127.0.0.1:7890` |
| `user_agent` | Chrome UA | 一般不用改 |

### `media`
| 参数 | 默认 | 说明 |
|---|---|---|
| `download` | `true` | 关掉则保留 mmbiz 原链（会被防盗链拦截，**不推荐**） |
| `concurrency` | `4` | 图片并发下载线程数 |
| `max_bytes` | `20971520` | 单图体积上限（20MB），超过则跳过 |
| `download_cover` | `true` | 是否下载封面图 |
| `rich_media` | `placeholder` | 音视频处理：`placeholder`（占位说明）/ `drop`（丢弃） |

### `output`
| 参数 | 默认 | 说明 |
|---|---|---|
| `site_root` | — | **必填**，个人网站根目录绝对路径 |
| `markdown_dir` | `content/posts` | Markdown 落盘目录（相对 site_root） |
| `image_dir` | `assets/img/posts` | 图片目录 |
| `index_json` | `assets/js/data/posts.json` | 前端索引 |
| `image_url_prefix` | `assets/img/posts` | Markdown 里图片引用的 URL 前缀 |
| `markdown_url_prefix` | `content/posts` | 前端 fetch Markdown 的 URL 前缀 |
| `slug_style` | `date-title` | `date-title` / `title` / `sn` |
| `ascii_slug` | `false` | `true` 则文件名转 ASCII；`false` 保留中文（可读性更好） |

### `taxonomy`
| 参数 | 默认 | 说明 |
|---|---|---|
| `use_album_as_category` | `true` | 把公众号「合集」当分类 |
| `default_category` | `未分类` | 无合集时的兜底分类 |
| `keyword_rules` | `{}` | `标签名: [关键词...]`，命中标题或正文前 500 字则打标 |
| `extra_tags` | `[]` | 给所有文章统一追加的标签 |

### `sync`
| 参数 | 默认 | 说明 |
|---|---|---|
| `state_db` | `state.db` | 状态库路径 |
| `rewrite_on_content_change` | `true` | 正文变化时覆盖已有 Markdown |
| `keep_removed` | `true` | 后台已删的文章本地保留，索引中标记 `archived` |

---

## 六、去重与增量机制

三层去重，逐层收紧：

| 层级 | 依据 | 解决什么问题 |
|---|---|---|
| 文章身份 | 永久链接里的 `sn` 短码 | 改了标题、换了封面也不会重复搬运 |
| 内容指纹 | 正文 HTML 的 sha1 | 内容没变就不重写文件，不制造无谓的 git 改动 |
| 图片内容 | 图片二进制的 sha1 | 同一张图在多篇文章里复用，磁盘上只存一份 |

增量判定发生在**详情页请求之前**：列表阶段拿到 `update_time`，
和状态库比对，没变就跳过 —— 既省时间，又大幅降低触发频控的概率。

第二次之后的同步，通常只有列表的几次请求 + 新文章的正文请求。

状态库是 `state.db`（SQLite）。删掉它会导致全部文章被判定为「未同步」而重跑一遍，
所以**它比 Markdown 文件更值得备份**。

---

## 七、分类与标签的保留策略

微信侧只有两种结构化的分组信息，都会被完整保留：

1. **合集（album）** → 映射为 `categories`。这是公众号唯一的原生分类体系，优先级最高。
2. **话题标签（#标签）** → 映射为 `tags`。

对于早年没有加入任何合集的老文章，用 `taxonomy.keyword_rules` 兜底自动打标：

```yaml
keyword_rules:
  AI产品: ["AI", "LLM", "大模型", "Agent"]
  产品方法论: ["北极星", "指标", "复盘"]
```

规则只扫描标题 + 正文前 500 字，避免全文匹配带来的误伤。
所有分类标签都写在 Markdown 的 front-matter 里，你随时可以手工改，
只要不动 `wechat_sn` 字段，重跑同步不会覆盖你的手工调整（除非正文真的变了）。

---

## 八、常见问题

**`[x] 登录态失效（ret=200003）`**
Cookie 或 token 过期了。重做步骤 2。这是最常见的情况，属正常现象。

**`[x] 命中微信频率控制（ret=200013）`**
拉太快了。等 10–30 分钟，把 `network.min_delay` 调到 4–6 秒再跑。
已完成的进度不会丢，直接重跑 `sync` 即可。

**文章数量比后台显示的少**
后台「已发表内容」按**群发**计数，一次群发可能含多条图文；脚本会把它们全部展开，
所以文章数通常**多于**群发数。反过来如果偏少，检查 `fetch.since` 是否设了日期过滤。

**图片显示成裂图**
mmbiz 有防盗链，必须本地化。确认 `media.download: true`，
并检查 `assets/img/posts/` 下是否真的有文件。个别失败的图可以 `retry`。

**某几篇一直失败**
`$PY run.py stats` 看失败原因，再 `$PY run.py retry`。
如果报 `gone`，说明文章在后台已被删除或转私密，属正常，无法恢复。

**想换个站点/框架**
`content/posts/*.md` 是标准的 front-matter + Markdown，Hugo、Astro、Hexo、
Notion 导入都能直接吃。改 `output.site_root` 指向新目录重跑即可。

---

## 九、目录结构

```
wechat-migrate/
├── README.md                  你正在读的这份
├── config.example.yaml        配置模板（含全部参数注释）
├── config.yaml                你的实际配置（gitignore）
├── secrets/cookie.txt         登录态（gitignore）
├── state.db                   同步状态库（gitignore，建议单独备份）
├── requirements.txt
├── run.py                     便捷入口
├── selftest.py                离线自检（50 项）
├── demo_seed.py               演示样例的写入/清理
└── wxmigrate/
    ├── cli.py                 命令行
    ├── config.py              配置加载与校验
    ├── http.py                限速 / 重试 / 反爬识别
    ├── state.py               SQLite 去重与增量
    ├── article.py             正文与元信息解析
    ├── media.py               图片下载与本地化
    ├── convert.py             HTML → Markdown
    ├── exporter.py            Markdown 落盘 + 索引生成
    ├── pipeline.py            流程编排
    └── sources/
        ├── base.py            链接归一化与 sn 提取
        ├── mp_backend.py      后台登录态采集器
        └── link_list.py       链接清单兜底采集器
```

---

## 十、边界说明

- 脚本**只读**，不会在你的公众号上发布、修改或删除任何内容。
- 只访问你本人已登录账号可见的数据，不触碰他人账号。
- 内置限速与频控退避，不做高频压测式抓取。
- 请只用于迁移你自己拥有版权的内容。

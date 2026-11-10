# 协作说明（Cursor IDE 接续）

这是 `personal-brand-site/work/priority-portfolio/` 的优化首版，**不是**用户逐项标注后的定稿。请在 IDE 里直接改这些文件，或在本任务对话里反馈。

## 仓库与分支

- 仓库：https://github.com/lifecontinue/gaoyuan-ai
- 分支：`cursor/priority-portfolio-decision-2480`（独立新分支，未覆盖已合并的 `cursor/priority-portfolio-2480`）
- 基线：`main` 上 PR #39 合并提交 `0e5d90706d7b92a2a512daf80ffd28331eea262c`
- 页面入口：`personal-brand-site/work/priority-portfolio/index.html`
- 不要重开 PR #39，不要 force push，本轮不部署生产、不合并。

## 本地预览

```bash
cd personal-brand-site
python3 -m http.server 8090
```

打开 http://127.0.0.1:8090/work/priority-portfolio/

静态根必须是 `personal-brand-site/`，不要用仓库根，也不要用 `file://` 做验收。

## 已知未解决（首版不声称满足全部审美）

- 悬停浮层与右侧固定栏会叠在一起；点击固定后以右侧栏为准。
- (3,3) 191 条展开后标签仍然拥挤，读详情应靠右侧清单而不是图上标签。
- 导语来自数据集 meta，CSS 截到三行，全文需点开数据或改 `data.js` 的 lede。
- 移动端筛选控件仍占一屏，图和详情需下滚。
- 否决/审计行仍用左下角浮层，尚未全部迁到右侧栏。
- 本页不部署、不合并；生产仍是已合并的 PR #39 版本。

## 在 Cursor 里接着改

1. Checkout 上述分支。
2. 打开 `index.html` / `styles.css` / `app.js`（数据在 `data.js`，不要重估坐标）。
3. 用 Cursor 的选区 / 行内评论在文件上标注不满意处，或把截图和说明发回本任务对话。
4. 本环境无法确认「任务页标注」菜单是否存在；已知可用入口就是：**本对话反馈** + **IDE 打开该分支文件直接改**。

## 数据口径（未重估）

534 主题 / 515 可画图 / 38 明确推进 / 2 Quick win（`TH-ops-lottery-once`、`TH-gp-empty-resource`）/ 19 否决仅清单 / 688 覆盖 / 8 未知频次空心 / (3,3)=191。成本与优先级是 AI 1–5 初评。

## 相对 Manus ZIP 的取舍（输入，不是授权照搬）

保留：更紧的信息层级、分批表格、右侧固定详情、簇内产品筛选。  
不采用：默认只显示 38；把否决/现有支持/重复/排除改成只显示数量；把描述拆到 `data-details.js` 并清空审计数组。Manus `data.js` 相对 main 抽空了 19+39+34+83 条审计清单，本首版继续用 main 的完整 `data.js`。

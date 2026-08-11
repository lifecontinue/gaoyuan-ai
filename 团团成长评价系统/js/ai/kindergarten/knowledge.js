/* =========================================================
   ai/kindergarten/knowledge.js — 幼儿园阶段知识库

   职责：
   · 提供维度参考文本（领域→子领域→典型表现）
   · 提供可用活动白名单
   · 提供数据源位置引用

   数据来源（相对本文件路径）：
   · ../../data/data.js — D.indicators（全部指标）
   · ../../domain/growth.js — domLabel, D, domMeta
   · ../../data/store.js — Store（本地持久化）
   ========================================================= */
import { D, domLabel } from '../../domain/growth.js';

/* =========================================================
   维度参考：六大领域 → 子领域 → 典型表现
   由 D.indicators 实时动态生成，不硬编码
   ========================================================= */
export function dimensionsReference() {
  const byDom = {};
  Object.values(D.indicators || {}).forEach(rows => (rows || []).forEach(r => {
    (byDom[r.d] = byDom[r.d] || new Map());
    const sub = byDom[r.d];
    if (!sub.has(r.s)) sub.set(r.s, new Set());
    if (r.g) sub.get(r.s).add(r.g);
  }));
  const lines = [];
  (D.domains || []).forEach(dom => {
    lines.push(`【${domLabel(dom.key)}｜领域 key: "${dom.key}"】${dom.desc ? ' — ' + dom.desc : ''}`);
    const sub = byDom[dom.key];
    if (sub) sub.forEach((goals, s) => {
      lines.push(`  · 子领域：${s}`);
      [...goals].forEach(g => lines.push(`    - 典型表现：${g}`));
    });
  });
  return lines.join('\n');
}

/* =========================================================
   指标名索引：所有指标名按领域→子领域分组
   供 prompt 注入，约束 AI 只能使用列表中的真实指标名
   ========================================================= */
export function indicatorNamesIndex() {
  const byDom = {};
  Object.values(D.indicators || {}).forEach(rows => (rows || []).forEach(r => {
    (byDom[r.d] = byDom[r.d] || new Map());
    const sub = byDom[r.d];
    if (!sub.has(r.s)) sub.set(r.s, []);
    sub.get(r.s).push({ n: r.n, g: r.g });
  }));
  const lines = ['## 指标名索引（必须严格使用以下名称）'];
  (D.domains || []).forEach(dom => {
    const sub = byDom[dom.key];
    if (!sub) return;
    lines.push(`### ${dom.key}`);
    sub.forEach((indicators, s) => {
      const names = [...new Set(indicators.map(i => i.n))].join('、');
      lines.push(`  · ${s}：${names}`);
    });
  });
  lines.push('');
  lines.push('⚠️ **引用指标时（type:"indicator"），domain 用领域 key，metric 必须从上述名称中精确选取，禁止用同义词或自行概括。**');
  return lines.join('\n');
}

/* =========================================================
   可用活动白名单：每个领域一个代表性亲子活动
   前端 activities.js 中有这些活动的详细引导数据
   ========================================================= */
export const ACTIVITY_WHITELIST = [
  { name: '健康与体能', domain: '健康与体能' },
  { name: '习惯与自理', domain: '习惯与自理' },
  { name: '自我与社会性', domain: '自我与社会性' },
  { name: '语言与交流', domain: '语言与交流' },
  { name: '探究与认知', domain: '探究与认知' },
  { name: '美感与表现', domain: '美感与表现' },
];

export function activityWhitelistText() {
  return ACTIVITY_WHITELIST.map(a => `  · ${a.name}（领域: ${a.domain}）`).join('\n');
}

/* =========================================================
   数据源位置引用（告诉 Agent 从哪里找数据）
   ========================================================= */
export const DATA_SOURCE_REF = `
【数据源位置】
· 幼儿园测评指标：D:/forster children/团团成长评价系统/js/data/data.js → D.indicators
· 六大领域定义：同上文件 → D.domains（key/name/desc）
· 领域显示标签：../../domain/growth.js → domLabel()
· 家长记录与测评历史：../../data/store.js → Store.periods / Store.parentPeriods
· 本地存储（LS key "tuantuan_growth_v1"）：孩子信息、家庭、地址
`.trim();

/* =========================================================
   领域 key 索引（供 JSON schema 中的 domain 字段引用）
   ========================================================= */
export const DOMAIN_KEYS = (D.domains || []).map(d => d.key);
export function domainKeysText() {
  return DOMAIN_KEYS.map(k => `  · "${k}"`).join('\n');
}

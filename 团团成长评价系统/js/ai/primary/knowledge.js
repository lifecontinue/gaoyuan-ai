/* =========================================================
   ai/primary/knowledge.js — 小学阶段知识库

   职责：
   · 提供学科维度参考文本（学科→核心素养→主题）
   · 提供可用活动白名单
   · 提供数据源位置引用

   数据来源（相对本文件路径）：
   · ../../data/subjects_p3.js — SUBJECTS_P3（九大学科 + 115 条指标）
   · ../../domain/subjects.js — SUBJS, subjectAt
   · ../../data/store.js — Store
   ========================================================= */
import { SUBJS } from '../../domain/subjects.js';

/* =========================================================
   维度参考：九大学科 → 核心素养（二级）→ 主题（三级）
   由 SUBJS 实时动态生成
   ========================================================= */
export function dimensionsReference() {
  const lines = [];
  (SUBJS || []).forEach(s => {
    lines.push(`【${s.name || s.id}｜学科 key: "${s.id}"】`);
    (s.core_competencies || []).forEach(c => {
      lines.push(`  · 核心素养：${c.name}${c.desc ? '（' + c.desc + '）' : ''}`);
    });
    (s.themes || []).forEach(t => lines.push(`    - 主题：${t.name || t.id}`));
  });
  return lines.join('\n');
}

/* =========================================================
   可用活动白名单
   ========================================================= */
export function activityWhitelist() {
  return (SUBJS || []).map(s => ({ name: s.name || s.id, domain: s.id }));
}

export function activityWhitelistText() {
  return activityWhitelist().map(a => `  · ${a.name}（学科 key: "${a.domain}"）`).join('\n');
}

/* =========================================================
   数据源位置引用
   ========================================================= */
export const DATA_SOURCE_REF = `
【数据源位置】
· 小学学科指标：D:/forster children/团团成长评价系统/js/data/subjects_p3.js → SUBJECTS_P3.subjects
· 学科定义：../../domain/subjects.js → SUBJS（name/id/core_competencies/themes/learning_paths）
· 学科颜色：../../core/config.js → subjectColorHex()
· 家长记录：../../data/store.js → Store.parentPeriods
`.trim();

/* =========================================================
   学科 key 索引
   ========================================================= */
export function subjectKeysText() {
  return (SUBJS || []).map(s => `  · "${s.id}" — ${s.name}`).join('\n');
}

/* =========================================================
   指标名索引：所有指标名按学科→核心素养分组
   供 prompt 注入，约束 AI 只能使用列表中的真实指标名
   ========================================================= */
export function indicatorNamesIndex() {
  const lines = ['## 指标名索引（必须严格使用以下名称）'];
  (SUBJS || []).forEach(s => {
    lines.push(`### ${s.name}（学科 key: "${s.id}"）`);
    const byComp = new Map();
    (s.themes || []).forEach(t => {
      const comp = ((s.core_competencies || []).find(c => c.id === t.core_competency_id) || {}).name || '综合';
      if (!byComp.has(comp)) byComp.set(comp, []);
      (t.indicators || []).forEach(ind => {
        const text = typeof ind === 'string' ? ind : (ind && ind.text ? ind.text : '');
        if (text && !byComp.get(comp).includes(text)) byComp.get(comp).push(text);
      });
    });
    byComp.forEach((names, comp) => {
      lines.push(`  · ${comp}：${names.join('、')}`);
    });
  });
  lines.push('');
  lines.push('⚠️ **引用指标时（type:"indicator"），domain 用学科 key，metric 必须从上述名称中精确选取，禁止用同义词或自行概括。**');
  return lines.join('\n');
}

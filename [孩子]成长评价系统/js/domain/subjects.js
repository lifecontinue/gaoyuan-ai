/* =========================================================
   domain/subjects.js — 小学学科维度模型（三年级 · 第二学段）
   单一职责：提供学科数据访问与学科级学习路径等纯逻辑。不访问 DOM。
   ========================================================= */
import { SUBJECTS_P3 } from '../data/subjects_p3.js';
import { STORIES_P3 } from '../data/stories_p3.js';
import { subjectColorHex, subjectColorRgb } from '../core/config.js';

/** 九大学科 */
export const SUBJS = (SUBJECTS_P3 && SUBJECTS_P3.subjects) || [];
/** 学科元信息 */
export const SUBJECTS_META = (SUBJECTS_P3 && SUBJECTS_P3.meta) || {};
/** 按索引取学科 */
export const subjectAt = i => SUBJS[i] || null;

export { subjectColorHex, subjectColorRgb };

/** 学科学习路径统计：{ total, kg, curriculum } */
export function learningPathStats(s) {
  const lps = (s && s.learning_paths) || [];
  const kg = lps.filter(l => l.source === 'kg').length;
  return { total: lps.length, kg, curriculum: lps.length - kg };
}

/* =========================================================
   主题 → 学科核心素养（二级维度）映射
   依据《义务教育课程方案(2022年版)》各学科课程标准，将每个「主题/内容领域」
   归并到其首位（primary）「学科核心素养」。主题由此降级为指标的内容标签（三级）。
   部分核心素养（如艺术·创意实践/文化理解、信息科技·数字化学习与创新/信息社会责任）
   为跨主题贯穿素养，无独立拆分指标，前端按「贯穿各主题」呈现。
   此映射即「重新梳理」的核心：全部 115 条指标按二级维度重新归类。
   ========================================================= */
const THEME_COMP = {
  'chinese:C1': '文化自信', 'chinese:C2': '审美创造', 'chinese:C3': '语言运用', 'chinese:C4': '思维能力',
  'math:M1': '会用数学的思维思考现实世界', 'math:M2': '会用数学的眼光观察现实世界', 'math:M3': '会用数学的语言表达现实世界', 'math:M4': '会用数学的思维思考现实世界',
  'english:E1': '语言能力', 'english:E2': '文化意识', 'english:E3': '思维品质', 'english:E4': '学习能力',
  'science:S1': '科学观念', 'science:S2': '科学思维', 'science:S3': '态度责任', 'science:S4': '探究实践',
  'moral:R1': '健全人格', 'moral:R2': '道德修养', 'moral:R3': '法治观念', 'moral:R4': '责任意识', 'moral:R5': '政治认同',
  'pe:P1': '运动能力', 'pe:P2': '运动能力', 'pe:P3': '体育品德', 'pe:P4': '健康行为',
  'art:T1': '审美感知', 'art:T2': '艺术表现',
  'ict:K1': '信息意识', 'ict:K2': '计算思维',
  'labor:B1': '劳动习惯和品质', 'labor:B2': '劳动习惯和品质', 'labor:B3': '劳动能力', 'labor:B4': '劳动能力', 'labor:B5': '劳动观念', 'labor:B6': '劳动精神', 'labor:B7': '劳动精神'
};

/** 取某主题对应的二级维度（学科核心素养）对象 */
function compOf(s, t) {
  const name = THEME_COMP[`${s.id}:${t.id}`];
  const co = (s.core_competencies || []).find(c => c.name === name) || null;
  return { name: name || t.name, id: co ? co.id : (name || t.id), desc: co ? co.desc : '' };
}

/* 把主题下的指标按「二级维度(核心素养)」重新归类，构建学科能力树。
   每条指标保留稳定的主键 p3-<学科序号>-<主题序号>-<指标序号>，
   确保 localStorage 中已有的 subjectOverrides 家长评价不被破坏。 */
export const SUBJ_COMP_TREES = SUBJS.map((s, si) => {
  const compOrder = (s.core_competencies || []).map(c => c.name);
  const buckets = new Map();
  (s.themes || []).forEach((t, ti) => {
    const c = compOf(s, t);
    if (!buckets.has(c.name)) buckets.set(c.name, { comp: c.id, compName: c.name, compDesc: c.desc, inds: [] });
    (t.indicators || []).forEach((ind, ii) => {
      const base = (typeof ind === 'string') ? { text: ind } : (ind || {});
      buckets.get(c.name).inds.push({
        key: `p3-${si}-${ti}-${ii}`,
        text: base.text || '',
        label: base.label || (t.id || ''),
        desc: base.desc || (t.content || ''),
        criteria: base.criteria || null,   // v2：{符合,较符合,不符合} 三级场景化判定标准
        comp: c.name, compId: c.id,
        themeId: t.id, themeName: t.name, themeContent: t.content || '',
        story: (STORIES_P3 && STORIES_P3[`p3-${si}-${ti}-${ii}`]) || ''
      });
    });
  });
  // 按课标声明的核心素养顺序排列；无对应指标者保留为空维度（贯穿型素养）
  return compOrder.map(name => buckets.get(name) || {
    comp: name, compName: name,
    compDesc: ((s.core_competencies || []).find(c => c.name === name) || {}).desc || '',
    inds: []
  });
});

/** 取某学科二级维度树（按课标声明顺序，含空维度） */
export const subjectCompetencyTrees = si => SUBJ_COMP_TREES[si] || [];

/** 取小学具体指标对象：按 (学科序号, 二级维度序号, 指标序号) */
export function subjectIndicatorAt(si, ci, ii) {
  const ct = (SUBJ_COMP_TREES[si] || [])[ci]; if (!ct) return null;
  return (ct.inds || [])[ii] || null;
}

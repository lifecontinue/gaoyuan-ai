/* =========================================================
   core/config.js — 全局静态配置与常量
   单一职责：集中存放评分口径、学科配色、菜单、快捷动作、活动建议等
   不可变配置；不依赖任何其他模块，不访问 DOM / 存储。
   ========================================================= */

/** 本地存储键 */
export const STORAGE_KEY = 'tuantuan_growth_v1';

/** AI 代理后端地址（服务端持有 DeepSeek Key）。
 *  默认 '' 表示同源（由 Node 代理 server/index.js 提供 /api/ai/chat）。
 *  若把代理部署到独立域名，改为该域名，例如 https://ai.example.com。
 *  若留空，则自动按当前页面路径推断（支持子路径部署，如 https://host/tuantuan/）。 */
export const AI_API_BASE = '';

/** 部署基址：从当前页面路径推断，支持子路径部署。
 *  根部署( http://host/        ) → ''
 *  子路径( http://host/tuantuan/ ) → '/tuantuan'
 *  直接打开( file:///.../index.html ) → ''  */
export function basePath() {
  if (typeof location === 'undefined') return '';
  if (location.protocol === 'file:') return '';        // file:// 降级模式：不需基址（摄像头/AI 本就被拦截）
  const p = location.pathname;
  if (p.endsWith('/')) return p.slice(0, -1);          // '/tuantuan/' → '/tuantuan'
  const i = p.lastIndexOf('/');
  return p.slice(0, i);                                // '/tuantuan/index.html' → '/tuantuan'
}

/** AI 代理实际基址：显式配置优先 → localStorage 覆盖 → 页面路径推断。 */
export function aiApiBase() {
  // 1. 显式常量（构建时注入，最高优先级）
  if (AI_API_BASE) return AI_API_BASE;
  // 2. localStorage 运行时覆盖（部署后端后可动态配置）
  try {
    if (typeof localStorage !== 'undefined') {
      const ls = localStorage.getItem('tuantuan_api_base');
      if (ls && ls.trim()) return ls.trim();
    }
  } catch (e) { /* 沙箱中 localStorage 不可用 */ }
  // 3. 同源代理（本地 node server/index.js）
  return basePath();
}
/** 数据结构版本（用于迁移钩子，见 data/store.js） */
export const SCHEMA_VERSION = 4;

/** 评分口径：符合=1 / 较符合=0.5 / 不符合=0 / 待观察·未测试 不计入分母 */
export const LV = {
  '符合':   { c: 'ok',      s: 1 },
  '较符合': { c: 'mid',     s: 0.5 },
  '不符合': { c: 'no',      s: 0 },
  '待观察': { c: 'pending', s: null },
  '未测试': { c: 'pending', s: null }
};
/** 等级 → 样式类 */
export const lvc = l => (LV[l] || LV['未测试']).c;
/** 可评价等级（补充评价 / 家长测评用） */
export const RATE_LEVELS = ['符合', '较符合', '不符合'];

/** 学科配色（hex），供 UI 使用 */
export const SUBJECT_COLORS = {
  chinese: '#e85c48', math: '#4a90ff', english: '#78c878', science: '#78dcdc',
  morals: '#ffb450', pe: '#ff8c64', arts: '#c878dc', it: '#50b4ff', labor: '#b4a078'
};
/** 学科配色（RGB 数组），供 Canvas 星空使用 */
export const SUBJECT_COLOR_RGB = {
  chinese: [232, 92, 72], math: [74, 144, 255], english: [120, 200, 120],
  science: [120, 220, 220], morals: [255, 180, 80], pe: [255, 140, 100],
  arts: [200, 120, 220], it: [80, 180, 255], labor: [180, 160, 120]
};
export const subjectColorHex = id => SUBJECT_COLORS[id] || '#ff9a5a';
export const subjectColorRgb = id => SUBJECT_COLOR_RGB[id] || [255, 150, 100];

/** 全局菜单标题 */
export const MENU_TITLES = {
  summary: '综合评价', parent: '家长记录', subjects: '学科维度（三年级）',
  data: '数据管理', about: '关于本系统'
};

/** AI 快捷动作 */
export const QUICK_ACTIONS = [
  { id: 'trend',    label: '分析成长趋势' },
  { id: 'weak',     label: '找出薄弱领域' },
  { id: 'plan',     label: '制定提升计划' },
  { id: 'report',   label: '生成家长报告' },
  { id: 'activity', label: '推荐亲子活动' },
  { id: 'subjects', label: '三年级学科'   }
];

/** 幼儿园薄弱领域 → 亲子活动建议 */
export const ACTIVITY_MAP = {
  '健康与体能':   '每天 15 分钟户外运动：拍球、跳绳、单脚站。',
  '习惯与自理':   '用「睡前三件事」清单培养自理。',
  '自我与社会性': '通过角色扮演练习轮流与情绪表达。',
  '语言与交流':   '每天亲子共读 20 分钟，鼓励复述故事。',
  '探究与认知':   '提供自然观察任务（看蚂蚁、种豆子）。',
  '美感与表现':   '准备画材/黏土，每周一次自由创作。'
};

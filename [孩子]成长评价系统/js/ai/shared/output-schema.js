/* =========================================================
   ai/shared/output-schema.js — 统一 JSON 输出 Schema
   所有 Agent 返回 content blocks 数组，前端按 type 声明式渲染。

   设计原则：
   · JSON 格式统一，前端只需实现一次渲染
   · 每个 block 是独立单元（可单独缓存 / 引用 / 点击）
   · 活动 block 含完整引导信息，不需要前端再查 activities.js
   · 指标 block 含 domain+metric，前端可直接跳转
   ========================================================= */

export const BLOCK = {
  PARAGRAPH: 'paragraph',
  HEADING: 'heading',
  LIST: 'list',
  ACTIVITY: 'activity',
  INDICATOR: 'indicator',
  ACTION: 'action',
};

/** 创建标准响应 */
export function response(stage, blocks = []) {
  return {
    stage: stage || 'k',
    blocks: Array.isArray(blocks) ? blocks : [],
  };
}

/** ---------- block 构造器（Agent 内部用） ---------- */
export function paragraph(text) {
  return { type: BLOCK.PARAGRAPH, text: String(text || '') };
}

export function heading(text, level = 2) {
  return { type: BLOCK.HEADING, text: String(text || ''), level: Math.min(Math.max(+level || 2, 1), 4) };
}

export function list(items) {
  return { type: BLOCK.LIST, items: Array.isArray(items) ? items.map(String) : [] };
}

/** activity block：名称来自白名单，其余详情由 Agent 据其知识直接填充 */
export function activity(name, opts = {}) {
  return {
    type: BLOCK.ACTIVITY,
    name: String(name || ''),
    goal: String(opts.goal || ''),
    steps: Array.isArray(opts.steps) ? opts.steps.map(String) : [],
    talk: String(opts.talk || ''),
    note: String(opts.note || ''),
    age: String(opts.age || ''),
  };
}

/** indicator 引用：domain 用领域 key（如 language_communication），metric 为指标 / 典型表现文本 */
export function indicator(domain, metric, note = '') {
  return {
    type: BLOCK.INDICATOR,
    domain: String(domain || ''),
    metric: String(metric || ''),
    note: String(note || ''),
  };
}

/** action 按钮：前端可渲染为可点击 chip / 按钮 */
export function action(label, actionId, params = {}) {
  return { type: BLOCK.ACTION, label: String(label || ''), action: String(actionId || ''), params };
}

/* =========================================================
   注入给 LLM 的 JSON Schema 约束指令（拼入 system prompt）
   ========================================================= */
export function SCHEMA_INSTRUCTION() {
  return `
## 输出格式（JSON Schema — 必须严格遵守）

你必须返回一个严格的 JSON 对象，不要输出 markdown 代码块或任何非 JSON 文本。
JSON 结构如下：

{
  "stage": "k" 或 "p",
  "blocks": [
    段落   {"type":"paragraph","text":"…"},
    标题   {"type":"heading","text":"…","level":2},
    列表   {"type":"list","items":["…","…"]},
    活动   {"type":"activity","name":"活动名","goal":"活动目标","steps":["步骤1","步骤2"],"talk":"引导话术","note":"注意事项","age":"适龄"},
    指标引用 {"type":"indicator","domain":"领域key","metric":"指标/表现名称","note":"简短说明"},
    操作按钮 {"type":"action","label":"按钮文字","action":"action_id","params":{}}
  ]
}

命名约束：
· domain 须来自「领域 key 索引」中的领域 key（如 健康与体能 / 语言与交流 / 探究与认知）
· activity 的 name 须来自「可用活动白名单」中的活动名
· metric 须来自「指标名索引」中的指标名，精确匹配，禁止同义词替换
· 不要在 JSON 之外输出任何解释文字
· 所有 text / items / steps 字段必须为简体中文
`.trim();
}

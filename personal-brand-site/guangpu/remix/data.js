/**
 * 光谱五步创建原型 · 演示数据
 * 全部为模拟数据，不来自真实系统。
 * 数据模型对应 SPEC.md 第 2 节「业务对象」——是逻辑对象，不是接口/表结构承诺。
 */

const SOURCE_TYPE = {
  MANUAL: 'manual',
  POSITION: 'position',
  GROUP: 'group',
};

const SOURCE_LABEL = {
  manual: '手动',
  position: '岗位',
  group: '群组',
  retained: '保留',
};

// SPEC O01 最终口径（2026-10-27）：自动同步开关默认开；关=一次性按岗灌名单后手动维护。首期仅岗位。
const ASSUMPTIONS = {
  O01: '最终口径（2026-10-27）：自动同步默认开；开=岗位强绑定并按原规则自动下发/回收；关=创建时按岗一次性灌入学员列表后固定，之后仅「关联学员」手动增改，改岗不同步人。首期关联维度仅岗位（部门/群组后续）。勿反复切换开关。',
  O02: '待确认：启用时第五步为空名单的处理规则。原型允许存空草稿，不默认放行也不永久阻断。',
  O03: '评审假设：字段与「导出全部筛选结果」为评审约定，CSV 仅为原型实现选择。',
  O05: '示例采用 100 分制，仅为演示假设，非实际量表契约。',
};

/* ---------- 人员 ---------- */
const persons = [
  { userId: 'u001', employeeCode: 'A1001', userName: '陈立', deptId: 'd1', deptName: '生产中心', positionIds: ['p1'], groupIds: ['g1'] },
  { userId: 'u002', employeeCode: 'A1002', userName: '周敏', deptId: 'd1', deptName: '生产中心', positionIds: ['p1'], groupIds: [] },
  { userId: 'u003', employeeCode: 'A1003', userName: '李海', deptId: 'd2', deptName: '技术中心', positionIds: ['p2'], groupIds: ['g1'] },
  { userId: 'u004', employeeCode: 'A1004', userName: '王芳', deptId: 'd2', deptName: '技术中心', positionIds: ['p5'], groupIds: [] },
  { userId: 'u005', employeeCode: 'A1005', userName: '赵强', deptId: 'd3', deptName: '质量部', positionIds: ['p3'], groupIds: [] },
  { userId: 'u006', employeeCode: 'A1006', userName: '孙丽', deptId: 'd3', deptName: '质量部', positionIds: ['p3'], groupIds: ['g2'] },
  { userId: 'u007', employeeCode: 'A1007', userName: '吴涛', deptId: 'd4', deptName: '安全环保部', positionIds: ['p4'], groupIds: [] },
  { userId: 'u008', employeeCode: 'A1008', userName: '郑雪', deptId: 'd4', deptName: '安全环保部', positionIds: ['p4'], groupIds: ['g2'] },
// 本地演示账号以工号作为登录用户名。
].map(person => ({ ...person, loginName: person.employeeCode }));

/* ---------- 岗位 / 群组 / 部门 ---------- */
/* 岗位分类树：对齐真实「选择岗位」弹窗左侧栏（分类 + 包含子类）。
   分类 id 前缀 c-，与岗位 id 前缀 p- 区分。 */
const positionCategories = [
  { id: 'c-all', nm: '全部', isRoot: true, parent: null },
  { id: 'c-tech', nm: '技术序列', parent: null },
  { id: 'c-tech-safety', nm: '安全技术', parent: 'c-tech' },
  { id: 'c-tech-energy', nm: '能源技术', parent: 'c-tech' },
  { id: 'c-default', nm: '默认类别', parent: null },
  { id: 'c-mgmt', nm: '管理序列', parent: null },
  { id: 'c-mgmt-mid', nm: '中层管理', parent: 'c-mgmt' },
  { id: 'c-safety', nm: '安全序列', parent: null },
];

/* catIds：该岗位直接归属的分类（叶子分类）。
   deptId：岗位所属部门——本轮新增「部门」列的数据来源。 */
const positions = [
  { id: 'p1', nm: '车间安全岗', catIds: ['c-tech-safety'], deptId: 'd1', sn: [] },
  { id: 'p2', nm: '能源管理岗', catIds: ['c-tech-energy'], deptId: 'd2', sn: [] },
  { id: 'p3', nm: '质量检验岗', catIds: ['c-default'], deptId: 'd3', sn: [] },
  { id: 'p4', nm: '消防应急岗', catIds: ['c-safety'], deptId: 'd4', sn: [] },
  { id: 'p5', nm: '综合管理岗', catIds: ['c-mgmt-mid'], deptId: 'd2', sn: [] },
];

const groups = [
  { id: 'g1', nm: '安全生产群组', sn: [] },
  { id: 'g2', nm: '质量管理群组', sn: [] },
];

const departments = [
  { id: 'd1', nm: '生产中心', sn: [{ id: 'd1-1', nm: '一车间', sn: [] }, { id: 'd1-2', nm: '二车间', sn: [] }] },
  { id: 'd2', nm: '技术中心', sn: [{ id: 'd2-1', nm: '能源组', sn: [] }] },
  { id: 'd3', nm: '质量部', sn: [] },
  { id: 'd4', nm: '安全环保部', sn: [] },
];

/* ---------- 标签树（SPEC：末级不固定为第三级） ---------- */
const tagTreeA = [
  {
    id: 't1', nm: '安全意识', level: 1, children: [
      {
        id: 't1-1', nm: '风险辨识', level: 2, children: [
          { id: 't1-1-1', nm: '作业前风险分析', level: 3, leaf: true },
          { id: 't1-1-2', nm: '隐患上报', level: 3, leaf: true },
        ],
      },
      // 二级末级示例
      { id: 't1-2', nm: '应急响应', level: 2, leaf: true },
    ],
  },
  {
    id: 't2', nm: '操作规范', level: 1, children: [
      { id: 't2-1', nm: '设备点检', level: 2, leaf: true },
      {
        id: 't2-2', nm: '交接班管理', level: 2, children: [
          { id: 't2-2-1', nm: '交接记录完整', level: 3, leaf: true },
        ],
      },
    ],
  },
];

const tagTreeB = [
  {
    id: 'b1', nm: '能源分析', level: 1, children: [
      { id: 'b1-1', nm: '能耗数据解读', level: 2, leaf: true },
      { id: 'b1-2', nm: '节能方案设计', level: 2, leaf: true },
    ],
  },
  {
    id: 'b2', nm: '项目管理', level: 1, children: [
      { id: 'b2-1', nm: '项目立项', level: 2, leaf: true },
    ],
  },
];

/* ---------- 图谱 ---------- */
const graphs = {
  A: {
    id: 'A',
    order: 1,
    name: '岗位能力图谱 A',
    positionIds: ['p1', 'p2'],
    groupIds: ['g1'],
    autoAssociate: true,
    status: 'enabled',
    contentVersion: 'v1',
    tagTree: tagTreeA,
    briefing: '面向车间安全岗与能源管理岗，覆盖安全意识与操作规范。',
    duty: '负责本岗位作业风险识别、设备点检与交接班记录。',
    // 第四步：按末级标签存「适用层级」与「已选内容」，缺省取 defaultStep4Content
    step4: {},
  },
  B: {
    id: 'B',
    order: 2,
    name: '岗位能力图谱 B',
    positionIds: ['p1', 'p2'],
    groupIds: ['g1'],
    autoAssociate: true,
    status: 'enabled',
    contentVersion: 'v1',
    tagTree: tagTreeB,
    briefing: '面向能源分析与项目管理能力。',
    duty: '负责能耗数据解读与节能项目推进。',
    step4: {},
  },
};

/* ---------- 人员图谱关系（模拟状态） ---------- */
function createInitialState() {
  return {
    graphs: JSON.parse(JSON.stringify(graphs)),
    persons: JSON.parse(JSON.stringify(persons)),
    // rel: userId -> graphId -> { manual:bool, sources:Set, excluded:bool, retained:bool, order:int }
    rel: {},
    selectedGraphId: 'A',
    currentStep: 1,
    studentUserId: 'u001',
    importRows: null,
    importExecuted: null,
    log: [],
    seq: 1,
  };
}

/* ---------- 计算：某图的有效人员 ---------- */
function effectiveMembers(state, graphId) {
  const out = [];
  const bucket = state.rel[graphId] || {};
  Object.keys(bucket).forEach((uid) => {
    const r = bucket[uid];
    if (r.excluded) return;
    if (!r.sources || r.sources.length === 0) return;
    out.push({ userId: uid, ...r });
  });
  return out.sort((a, b) => a.order - b.order);
}

/* ---------- 计算：某人可访问的图谱（按建立顺序） ---------- */
function accessibleGraphs(state, userId) {
  const list = [];
  Object.keys(state.graphs).forEach((gid) => {
    const g = state.graphs[gid];
    if (g.status !== 'enabled') return;
    const r = (state.rel[gid] || {})[userId];
    if (!r || r.excluded || !r.sources || r.sources.length === 0) return;
    list.push({ graphId: gid, name: g.name, order: r.order });
  });
  return list.sort((a, b) => a.order - b.order);
}

/* ---------- 计算：末级标签评分 ---------- */
/**
 * 后测 80、90 → 均分 85
 * 平均模式：当前分 = (Σ后测 + m) / (n + 1)；n 为有效后测项数
 * 无后测但有 m：当前分 = m
 * 覆盖模式：当前分 = m
 */
function computeScore(item) {
  const posts = (item.postTests || []).filter((v) => typeof v === 'number');
  const m = typeof item.importScore === 'number' ? item.importScore : null;
  const mode = item.mode || 'avg';

  if (m === null) {
    if (posts.length === 0) return { value: null, formula: '无后测、无导入' };
    const avg = posts.reduce((a, b) => a + b, 0) / posts.length;
    return { value: round1(avg), formula: `原标签计算（${posts.join('、')}）` };
  }
  if (mode === 'override') {
    return { value: round1(m), formula: `覆盖 ${m}` };
  }
  if (posts.length === 0) {
    return { value: round1(m), formula: `无有效后测，取导入 ${m}` };
  }
  const sum = posts.reduce((a, b) => a + b, 0) + m;
  const val = sum / (posts.length + 1);
  return {
    value: round1(val),
    formula: `(${posts.join('+')}+${m})/${posts.length + 1}`,
  };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/* ---------- 评分数据（按 图谱+人员+末级标签） ---------- */
function leafTags(tree) {
  const out = [];
  (function walk(nodes) {
    nodes.forEach((n) => {
      if (n.leaf) out.push(n);
      if (n.children) walk(n.children);
    });
  })(tree);
  return out;
}

/* ---------- 标签分类（「添加标签」左栏树的来源，评审假设） ---------- */
const tagCategories = [
  {
    id: 'tc-custom', nm: '自定义标签', children: [
      { id: 'tc-custom-give', nm: '给予指导' },
      { id: 'tc-custom-online', nm: '在线教学' },
      { id: 'tc-custom-inspire', nm: '激发互动' },
    ],
  },
  {
    id: 'tc-internal', nm: '内训师', children: [
      { id: 'tc-internal-show', nm: '讲解示范' },
      { id: 'tc-internal-effect', nm: '检验效果' },
      { id: 'tc-internal-guide', nm: '引导训练' },
    ],
  },
  {
    id: 'tc-service', nm: '服务运营岗', children: [
      { id: 'tc-service-ai', nm: '服务运营岗-AI' },
      { id: 'tc-service-mgmt', nm: '管理岗' },
    ],
  },
  {
    id: 'tc-uncat', nm: '未分类', children: [],
  },
];

/* 平铺取某分类下全部末级选项（含子类，与「包含子类」勾选联动） */
function categoryOptions(catId, includeChild) {
  const out = [];
  tagCategories.forEach((c) => {
    const hit = c.id === catId || (includeChild && (c.children || []).some((x) => x.id === catId));
    if (!hit) return;
    if (c.children && c.children.length) out.push(...c.children);
    else out.push({ id: c.id, nm: c.nm });
  });
  return out;
}

/* 递归把标签挂在树上：parentId 为 null 时挂一级 */
function addTagNodes(tree, parentId, picked) {
  const mk = (t) => ({ id: t.id, nm: t.nm, level: 1, leaf: true });
  const insert = (node, depth) => {
    if (!node.children) node.children = [];
    if ((parentId || null) === node.id) {
      picked.forEach((t) => node.children.push(mk(t)));
      return true;
    }
    return node.children.some((c) => insert(c, depth + 1));
  };
  if (!parentId) {
    picked.forEach((t) => tree.push(mk(t)));
    return;
  }
  tree.some((n) => insert(n, 1));
}

/* ---------- 第四步：学习内容（课程 / 考试 / 资料） ---------- */
const courseLibrary = [
  { id: 'c001', nm: '4 级培训产品主要类型', kind: '课程', required: true },
  { id: 'c002', nm: '1 背景描述', kind: '课程', required: true },
  { id: 'c003', nm: '2 需求分析方法', kind: '课程', required: false },
  { id: 'c004', nm: '3 培训目标拆解', kind: '课程', required: false },
  { id: 'c005', nm: '5 课程结构设计', kind: '课程', required: true },
  { id: 'c006', nm: '作业前风险分析实操', kind: '课程', required: false },
  { id: 'c007', nm: '安全生产法要点解读', kind: '课程', required: true },
  { id: 'e001', nm: '培训产品类型测验', kind: '考试', required: true },
  { id: 'e002', nm: '风险辨识能力测验', kind: '考试', required: false },
  { id: 'm001', nm: '培训产品类型对照表', kind: '资料', required: false },
  { id: 'm002', nm: '风险辨识案例集', kind: '资料', required: false },
];

/* 默认已选内容（对齐截图：4 级培训产品主要类型 + 1 背景描述，均必学） */
const defaultStep4Content = {
  A: [
    { id: 'c001', nm: '4 级培训产品主要类型', required: true },
    { id: 'c002', nm: '1 背景描述', required: true },
  ],
  B: [{ id: 'c003', nm: '2 需求分析方法', required: false }],
};

function courseName(id) {
  const hit = courseLibrary.find((c) => c.id === id);
  return hit ? hit.nm : id;
}

/* 重算层级与末级：有子节点即非末级 */function relabelTree(tree) {
  (function walk(nodes, level) {
    nodes.forEach((n) => {
      n.level = level;
      if (n.children && n.children.length) {
        n.leaf = false;
        walk(n.children, level + 1);
      } else {
        n.leaf = true;
        delete n.children;
      }
    });
  })(tree, 1);
}

function createScores() {
  return [
    // 图谱A · 陈立
    { graphId: 'A', userId: 'u001', tagId: 't1-1-1', tagName: '作业前风险分析', postTests: [80, 90], importScore: null, mode: 'avg' },
    { graphId: 'A', userId: 'u001', tagId: 't1-2', tagName: '应急响应', postTests: [70], importScore: null, mode: 'avg' },
    { graphId: 'A', userId: 'u001', tagId: 't2-1', tagName: '设备点检', postTests: [0], importScore: null, mode: 'avg' },
    { graphId: 'A', userId: 'u001', tagId: 't2-2-1', tagName: '交接记录完整', postTests: [], importScore: null, mode: 'avg' },
    // 图谱A · 周敏
    { graphId: 'A', userId: 'u002', tagId: 't1-1-1', tagName: '作业前风险分析', postTests: [60], importScore: null, mode: 'avg' },
    { graphId: 'A', userId: 'u002', tagId: 't1-1-2', tagName: '隐患上报', postTests: [75, 85], importScore: null, mode: 'avg' },
    { graphId: 'A', userId: 'u002', tagId: 't2-1', tagName: '设备点检', postTests: [50], importScore: null, mode: 'avg' },
    // 图谱A · 李海（图中无有效后测，用于「无后测，导入100」）
    { graphId: 'A', userId: 'u003', tagId: 't1-1-1', tagName: '作业前风险分析', postTests: [], importScore: null, mode: 'avg' },
    { graphId: 'A', userId: 'u003', tagId: 't2-1', tagName: '设备点检', postTests: [], importScore: null, mode: 'avg' },
    // 图谱A · 王芳
    { graphId: 'A', userId: 'u004', tagId: 't1-2', tagName: '应急响应', postTests: [88], importScore: null, mode: 'avg' },
    // 图谱B · 陈立
    { graphId: 'B', userId: 'u001', tagId: 'b1-1', tagName: '能耗数据解读', postTests: [66], importScore: null, mode: 'avg' },
    { graphId: 'B', userId: 'u001', tagId: 'b2-1', tagName: '项目立项', postTests: [72], importScore: null, mode: 'avg' },
    // 图谱B · 李海
    { graphId: 'B', userId: 'u003', tagId: 'b1-1', tagName: '能耗数据解读', postTests: [81], importScore: null, mode: 'avg' },
  ];
}

/* ---------- 课程进度（D07：导入不得改动） ---------- */
function createProgress() {
  return [
    { userId: 'u001', graphId: 'A', done: 8, total: 12 },
    { userId: 'u002', graphId: 'A', done: 5, total: 12 },
    { userId: 'u003', graphId: 'A', done: 3, total: 12 },
    { userId: 'u004', graphId: 'A', done: 10, total: 12 },
    { userId: 'u001', graphId: 'B', done: 2, total: 6 },
    { userId: 'u003', graphId: 'B', done: 4, total: 6 },
  ];
}

/* ---------- 岗位选择弹窗：分类过滤与部门名 ---------- */
function deptName(deptId) {
  const hit = departments.find((d) => d.id === deptId);
  return hit ? hit.nm : '—';
}

/** 某分类下的后代分类 id（含自身）；「全部」返回 null 表示不过滤 */
function categoryScope(catId) {
  if (catId === 'c-all') return null;
  const out = [catId];
  let i = 0;
  while (i < out.length) {
    positionCategories.forEach((c) => {
      if (c.parent === out[i] && !out.includes(c.id)) out.push(c.id);
    });
    i += 1;
  }
  return out;
}

/**
 * 按分类 + 关键字筛岗位。
 * includeChild=true 时连带子分类；否则只匹配直接归属该分类的岗位。
 */
function filterPositions({ catId = 'c-all', includeChild = true, keyword = '' } = {}) {
  const kw = String(keyword || '').trim().toLowerCase();
  let scope = categoryScope(catId);
  if (scope && !includeChild) scope = [catId];
  return positions.filter((p) => {
    if (scope && !(p.catIds || []).some((c) => scope.includes(c))) return false;
    if (!kw) return true;
    return p.nm.toLowerCase().includes(kw) || deptName(p.deptId).toLowerCase().includes(kw);
  });
}

if (typeof window !== 'undefined') {
  window.GP = {
    SOURCE_TYPE, SOURCE_LABEL, ASSUMPTIONS,
    persons, positions, groups, departments, graphs, positionCategories,
    createInitialState, effectiveMembers, accessibleGraphs,
    computeScore, leafTags, createScores, createProgress, round1,
    tagCategories, categoryOptions, addTagNodes, relabelTree,
    courseLibrary, defaultStep4Content, courseName,
    deptName, categoryScope, filterPositions,
  };
}

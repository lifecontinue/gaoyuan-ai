/** 初始目录。id 稳定；已在浏览器里改过的同 id 不会被这里覆盖。 */
const T = "2026-11-11T01:30:00.000Z";

function page(p) {
  return {
    favicon: "",
    tags: [],
    status: "active",
    isFavorite: false,
    createdAt: T,
    updatedAt: p.createdAt || T,
    lastVisitedAt: null,
    sortOrder: 100,
    description: "",
    categoryId: "",
    ...p
  };
}

export const SEED = {
  version: 1,
  projects: [
    { id: "prj_gp", name: "光谱", description: "需求、原型、汇报，以及心连心那组落地页。", icon: "layers", color: "#1f4b99", sortOrder: 10, status: "active" },
    { id: "prj_sv", name: "调查", description: "调查管理原型，和评估并入调查的页面。", icon: "clipboard", color: "#0f6e56", sortOrder: 20, status: "active" },
    { id: "prj_ms", name: "里程碑", description: "产品线总览。光谱和调查的拆分页都回到这里。", icon: "flag", color: "#9a6700", sortOrder: 30, status: "active" },
    { id: "prj_cls", name: "课堂伙伴", description: "课堂流程原型，和对应的开发需求。", icon: "users", color: "#6e56cf", sortOrder: 40, status: "active" },
    { id: "prj_tools", name: "手头工具", description: "不挂在某一个产品下面的工作页。", icon: "wrench", color: "#5c6578", sortOrder: 50, status: "active" },
    { id: "prj_pub", name: "站上公开页", description: "首页已经能进去的写作和产品。这个入口本身不挂到首页。", icon: "globe", color: "#8a5a44", sortOrder: 60, status: "active" }
  ],
  categories: [
    { id: "cat_gp_proto", projectId: "prj_gp", name: "需求与原型", sortOrder: 10 },
    { id: "cat_gp_report", projectId: "prj_gp", name: "汇报", sortOrder: 20 },
    { id: "cat_gp_xlx", projectId: "prj_gp", name: "心连心", sortOrder: 30 },
    { id: "cat_sv_proto", projectId: "prj_sv", name: "原型", sortOrder: 10 },
    { id: "cat_sv_merge", projectId: "prj_sv", name: "评估并入", sortOrder: 20 },
    { id: "cat_pub_write", projectId: "prj_pub", name: "写作", sortOrder: 10 },
    { id: "cat_pub_app", projectId: "prj_pub", name: "产品", sortOrder: 20 }
  ],
  pages: [
    page({ id: "p_gp_home", title: "光谱需求总览", url: "/guangpu/", description: "光谱是什么、进展、原型入口。", projectId: "prj_gp", categoryId: "cat_gp_proto", type: "doc", tags: ["光谱"], sortOrder: 10, createdAt: "2026-11-04T02:00:00.000Z" }),
    page({ id: "p_gp_remix", title: "光谱 remix 原型", url: "/guangpu/remix/", description: "需求总览下面的交互原型。", projectId: "prj_gp", categoryId: "cat_gp_proto", type: "prototype", tags: ["光谱", "原型"], sortOrder: 20, createdAt: "2026-11-04T03:00:00.000Z" }),
    page({ id: "p_gp_progress", title: "光谱优化进展", url: "/work/guangpu-progress/", description: "2026-11-06 的进展汇报。", projectId: "prj_gp", categoryId: "cat_gp_report", type: "report", tags: ["光谱", "汇报"], sortOrder: 30, createdAt: "2026-11-06T02:00:00.000Z" }),
    page({ id: "p_gp_report", title: "心连心方案汇报", url: "/work/guangpu-report/", description: "给试点客户讲方案、收反馈。", projectId: "prj_gp", categoryId: "cat_gp_report", type: "report", tags: ["光谱", "心连心", "汇报"], sortOrder: 40, createdAt: "2026-11-04T04:00:00.000Z" }),
    page({ id: "p_gp_hand", title: "汇报交接", url: "/work/guangpu-report/claude-handoff/", description: "汇报页的子页，链到甬道图、Feature List 和上线同步。", projectId: "prj_gp", categoryId: "cat_gp_report", type: "doc", tags: ["光谱", "心连心"], sortOrder: 50, createdAt: "2026-11-04T05:00:00.000Z" }),
    page({ id: "p_xlx", title: "心连心工作页", url: "/work/xlx/", description: "心连心这组页面的索引。", projectId: "prj_gp", categoryId: "cat_gp_xlx", type: "tool", tags: ["心连心"], sortOrder: 60 }),
    page({ id: "p_xlx_flow", title: "实施甬道图", url: "/work/xlx/flow/", description: "培训考核的操作级泳道。", projectId: "prj_gp", categoryId: "cat_gp_xlx", type: "prototype", tags: ["心连心", "光谱"], sortOrder: 70 }),
    page({ id: "p_xlx_feat", title: "Feature List", url: "/work/xlx/feature-list/", description: "可勾选、可备注的需求短表。", projectId: "prj_gp", categoryId: "cat_gp_xlx", type: "tool", tags: ["心连心", "光谱"], sortOrder: 80 }),
    page({ id: "p_job", title: "岗位学习实施", url: "/work/job-learning-implementation/", description: "实施流程图。页面自己没写父级，先放在心连心。", projectId: "prj_gp", categoryId: "cat_gp_xlx", type: "prototype", tags: ["光谱"], sortOrder: 90 }),
    page({ id: "p_sv_home", title: "调查管理", url: "/survey-evaluation/", description: "评估型调查的可交互原型。", projectId: "prj_sv", categoryId: "cat_sv_proto", type: "prototype", tags: ["调查", "原型"], sortOrder: 10 }),
    page({ id: "p_sv_arch", title: "调查项目档案", url: "/survey-evaluation/archive/", description: "挂在调查管理下面的档案。", projectId: "prj_sv", categoryId: "cat_sv_proto", type: "doc", tags: ["调查"], sortOrder: 20 }),
    page({ id: "p_sv_scene", title: "选择场景预览", url: "/survey-evaluation-scene/", description: "独立副本，不挂在调查管理下面。", projectId: "prj_sv", categoryId: "cat_sv_proto", type: "prototype", tags: ["调查", "原型"], sortOrder: 30 }),
    page({ id: "p_sv_merge", title: "评估并入调查", url: "/survey-evaluation-merge/", description: "评估并入调查的原型。", projectId: "prj_sv", categoryId: "cat_sv_merge", type: "prototype", tags: ["调查", "原型"], sortOrder: 40, createdAt: "2026-11-09T02:00:00.000Z" }),
    page({ id: "p_sv_prd", title: "评估并入 · 研发精简", url: "/survey-evaluation-merge/prd/", description: "给研发看的短需求，挂在评估并入下面。", projectId: "prj_sv", categoryId: "cat_sv_merge", type: "doc", tags: ["调查"], sortOrder: 50, createdAt: "2026-11-09T03:00:00.000Z" }),
    page({ id: "p_ms_all", title: "产品线总览", url: "/work/product-milestones/", description: "光谱、调查的里程碑都从这里下去。", projectId: "prj_ms", categoryId: "", type: "doc", tags: ["里程碑"], sortOrder: 10, createdAt: "2026-11-04T06:00:00.000Z" }),
    page({ id: "p_gp_ms", title: "光谱里程碑", url: "/work/guangpu-milestones/", description: "未上线需求的拆分。页头写了返回产品线总览。", projectId: "prj_ms", categoryId: "", type: "doc", tags: ["里程碑", "光谱"], sortOrder: 20, createdAt: "2026-11-04T07:00:00.000Z" }),
    page({ id: "p_sv_ms", title: "调查里程碑", url: "/work/survey-milestones/", description: "调查与评估的拆分。页头写了返回产品线总览。", projectId: "prj_ms", categoryId: "", type: "doc", tags: ["里程碑", "调查"], sortOrder: 30, createdAt: "2026-11-04T08:00:00.000Z" }),
    page({ id: "p_cls", title: "课堂伙伴原型", url: "/ai-classroom-roles/", description: "课堂伙伴的完整流程原型。", projectId: "prj_cls", categoryId: "", type: "prototype", tags: ["课堂"], sortOrder: 10 }),
    page({ id: "p_cls_req", title: "课堂伙伴开发需求", url: "/ai-classroom-roles/requirements/", description: "挂在原型下面的编排和评估需求。", projectId: "prj_cls", categoryId: "", type: "doc", tags: ["课堂"], sortOrder: 20 }),
    page({ id: "p_launch", title: "上线同步", url: "/work/launch-sync/", description: "跨产品的上线需求同步。心连心交接页会链过来。", projectId: "prj_tools", categoryId: "", type: "tool", tags: ["上线"], sortOrder: 10 }),
    page({ id: "p_prio", title: "未完成需求优先组合", url: "/work/priority-portfolio/", description: "还没做完的需求，放在一张图上比较。", projectId: "prj_tools", categoryId: "", type: "tool", tags: ["需求"], sortOrder: 20 }),
    page({ id: "p_aie", title: "AI Engineer 笔记", url: "/work/ai-engineer-2026-11-05/", description: "2026-11-05 到 06 的会场笔记。", projectId: "prj_tools", categoryId: "", type: "note", tags: ["笔记"], sortOrder: 30, createdAt: "2026-11-06T08:00:00.000Z" }),
    page({ id: "p_ads", title: "管理端岗位 demo", url: "/admin-design-system-demo/", description: "岗位管理那页。里面的树只切换本页栏目。", projectId: "prj_tools", categoryId: "", type: "prototype", tags: ["原型"], sortOrder: 40 }),
    page({ id: "p_home", title: "书房首页", url: "/", description: "对外的个人站首页。", projectId: "prj_pub", categoryId: "cat_pub_write", type: "writing", tags: ["公开"], sortOrder: 10 }),
    page({ id: "p_about", title: "关于", url: "/about.html", description: "对外简介。", projectId: "prj_pub", categoryId: "cat_pub_write", type: "writing", tags: ["公开"], sortOrder: 20 }),
    page({ id: "p_essay", title: "写作", url: "/essay.html", description: "长文存档。", projectId: "prj_pub", categoryId: "cat_pub_write", type: "writing", tags: ["公开", "写作"], sortOrder: 30 }),
    page({ id: "p_weekly", title: "周报", url: "/weekly/", description: "企业学习 AI 战略研判。", projectId: "prj_pub", categoryId: "cat_pub_write", type: "writing", tags: ["公开", "写作"], sortOrder: 40 }),
    page({ id: "p_agent", title: "AI 助手页", url: "/agent.html", description: "站点上的助手页。", projectId: "prj_pub", categoryId: "cat_pub_write", type: "writing", tags: ["公开"], sortOrder: 50 }),
    page({ id: "p_tank", title: "坦克大战", url: "/tank-wars/", description: "已公开的游戏。", projectId: "prj_pub", categoryId: "cat_pub_app", type: "product", tags: ["公开", "产品"], sortOrder: 60 }),
    page({ id: "p_poop", title: "一起拉屎", url: "/poop-tracker/", description: "已公开的记录工具。", projectId: "prj_pub", categoryId: "cat_pub_app", type: "product", tags: ["公开", "产品"], sortOrder: 70 }),
    page({ id: "p_apple", title: "苹果嘉儿", url: "/applejack-game/", description: "已公开的游戏。", projectId: "prj_pub", categoryId: "cat_pub_app", type: "product", tags: ["公开", "产品"], sortOrder: 80 }),
    page({ id: "p_fret", title: "FRET FLOW", url: "/practice/", description: "已公开的陪练。", projectId: "prj_pub", categoryId: "cat_pub_app", type: "product", tags: ["公开", "产品"], sortOrder: 90 }),
    page({ id: "p_pmos", title: "PM Growth OS", url: "/pm-growth-os/", description: "已公开的产品页。", projectId: "prj_pub", categoryId: "cat_pub_app", type: "product", tags: ["公开", "产品"], sortOrder: 100 }),
    page({ id: "p_board", title: "素白板", url: "/collab-whiteboard.html", description: "已公开的白板。", projectId: "prj_pub", categoryId: "cat_pub_app", type: "product", tags: ["公开", "产品"], sortOrder: 110 })
  ],
  relations: [
    { id: "r_remix", sourcePageId: "p_gp_home", targetPageId: "p_gp_remix", relationType: "related", description: "总览下面的原型" },
    { id: "r_report", sourcePageId: "p_gp_home", targetPageId: "p_gp_report", relationType: "reference", description: "总览链到汇报" },
    { id: "r_gp_ms", sourcePageId: "p_gp_home", targetPageId: "p_gp_ms", relationType: "reference", description: "总览链到里程碑" },
    { id: "r_hand", sourcePageId: "p_gp_report", targetPageId: "p_gp_hand", relationType: "workflow_next", description: "汇报的子页" },
    { id: "r_hand_flow", sourcePageId: "p_gp_hand", targetPageId: "p_xlx_flow", relationType: "reference", description: "交接页里的甬道图" },
    { id: "r_hand_feat", sourcePageId: "p_gp_hand", targetPageId: "p_xlx_feat", relationType: "reference", description: "交接页里的 Feature List" },
    { id: "r_hand_launch", sourcePageId: "p_gp_hand", targetPageId: "p_launch", relationType: "reference", description: "交接页里的上线同步" },
    { id: "r_xlx_flow", sourcePageId: "p_xlx", targetPageId: "p_xlx_flow", relationType: "related", description: "索引的子页" },
    { id: "r_xlx_feat", sourcePageId: "p_xlx", targetPageId: "p_xlx_feat", relationType: "related", description: "索引的子页" },
    { id: "r_flow_feat", sourcePageId: "p_xlx_flow", targetPageId: "p_xlx_feat", relationType: "related", description: "两页互相链" },
    { id: "r_arch", sourcePageId: "p_sv_home", targetPageId: "p_sv_arch", relationType: "related", description: "档案挂在调查管理下" },
    { id: "r_prd", sourcePageId: "p_sv_merge", targetPageId: "p_sv_prd", relationType: "workflow_next", description: "原型下面的研发短需求" },
    { id: "r_ms_gp", sourcePageId: "p_gp_ms", targetPageId: "p_ms_all", relationType: "depends_on", description: "页头返回产品线总览" },
    { id: "r_ms_sv", sourcePageId: "p_sv_ms", targetPageId: "p_ms_all", relationType: "depends_on", description: "页头返回产品线总览" },
    { id: "r_cls", sourcePageId: "p_cls", targetPageId: "p_cls_req", relationType: "workflow_next", description: "原型下面的需求" }
  ]
};

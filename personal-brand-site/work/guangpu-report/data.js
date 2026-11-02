/* 光谱汇报页内容。真源：handoff + Step3/Step4/能力导入 Doc（2026-11-02）。未知状态一律写「待确认」。 */
window.GPR_DATA = {
  links: {
    featureList: "/work/xlx/feature-list/",
    flow: "/work/xlx/flow/",
    xlxIndex: "/work/xlx/",
    launchSync: "/work/launch-sync/",
    planDoc: "https://docs.google.com/document/d/1KxtHP6LwpqPmIBAGVC4kj0--eGHanF2H0n2flAeXBBw/edit",
    featureDoc: "https://docs.google.com/document/d/1hCTGLB7volQNQVSoO8U6fIs0Tk-CM2O7IPFCizl3nhU/edit",
    step3Doc: "https://docs.google.com/document/d/1w7PRyCmpv2mKbEP6li7B0RKVJZlSPyDw3ZMIxXcPJ8k/edit",
    step4Doc: "https://docs.google.com/document/d/19q1JrKT6pgUoRuvZVvbqwlQabquQgceZKC9giPvyAaQ/edit",
    importDoc: "https://docs.google.com/document/d/1P2FQrgL9MBOnwxuuUvGeokG0rb3q5_W9FVuvqi72uIs/edit",
    importSheet: "https://docs.google.com/spreadsheets/d/1vC2V-6OKhU4XVcOKWkZmjJ0nCkxofAO-a5mRY-eoy1Y/edit",
    drive: "https://drive.google.com/drive/folders/1S5emPb-gBB8jRHeHDIk6wCIGIYbhmvSo",
  },

  // kinds: demo 演示 / proto 原型 / check 与用户核对 / bg 背景
  timeline: [
    {
      id: "n1021",
      date: "10-21",
      title: "背景：旧方案交接",
      kinds: ["bg"],
      state: "done",
      points: [
        "旧方案围绕「创建五步 / 人与图谱解绑」，范围已演进，只作背景。",
        "人图解绑现跟 PRO-339（SDGH-8398）。",
      ],
      refs: [{ label: "光谱规划 intake（本机）", path: "D:\\21TB\\20-intake\\2026-10\\guangpu-product-planning\\" }],
      open: [],
    },
    {
      id: "n1026",
      date: "10-26 → 10-27",
      title: "口径：导入与创建 / 自动同步",
      kinds: ["check"],
      state: "done",
      points: [
        "与客户沟通数据导入；会议：光谱数据导入 · 图谱创建与查看。",
        "自动同步默认开、可关；首期关联只选岗位（群组后续）。",
      ],
      refs: [],
      open: ["导入规则当时仍开放 → 11-02 已由 F1–F6 定稿"],
    },
    {
      id: "n1029",
      date: "10-29 → 10-30",
      title: "心连心对齐：调整计划 + 九阶段 + Feature List",
      kinds: ["check", "proto"],
      state: "done",
      points: [
        "调整计划 + 九阶段实施方案：光谱只触达 ④–⑨，①②③ 在系统外。",
        "Feature List 可标记页已上线，用户已逐条判定（Step2 已确认）。",
        "总判：原型可演示通用路径，尚未满足「短板培训闭环」。",
      ],
      links: [
        ["方案 Doc", "planDoc"],
        ["Feature List Doc", "featureDoc"],
        ["Feature List 可标记", "featureList"],
        ["甬道图", "flow"],
      ],
      open: [],
    },
    {
      id: "n1030",
      date: "10-30",
      title: "演示 / 客户介绍",
      kinds: ["demo", "check"],
      state: "done",
      points: [
        "光谱沟通会：先做小岗位试点。",
        "介绍边界：光谱不替代外部任职资格、不做领导干部线上打分、不按勾叉重算、不做系统内晋级裁定。",
      ],
      refs: [],
      open: ["横向标签：仍开放", "养员规划：仍开放"],
    },
    {
      id: "n1102",
      date: "11-02",
      title: "模拟脚本 + 能力导入定稿",
      kinds: ["demo", "proto"],
      state: "done",
      points: [
        "Step3 管理端 20 步：标签准备 → 建图四步 → 启用下发 → L1–L5 导入。",
        "Step4 学员端本期只做「切换图谱」：PC dropdown + 搜索，H5 弹窗，「本岗位」label。",
        "能力等级导入 F1–F6 已定稿（导出学员×全部末级、错误行跳过只写通过行、必须末级 ID、L5=高级技师）。",
        "两份脚本均为桌面推演，未在原型真机点验；H5 不当作已验。",
      ],
      links: [
        ["Step3 Doc", "step3Doc"],
        ["Step4 Doc", "step4Doc"],
        ["能力导入 F1–F6", "importDoc"],
        ["示例模板 Sheet", "importSheet"],
      ],
      refs: [{ label: "原型 guangpu-five-step（本机）", path: "D:\\21TB\\50-ai-product\\prototypes\\guangpu-five-step\\" }],
      open: [],
    },
    {
      id: "n1103",
      date: "11-03",
      title: "郑州：与开发线下沟通光谱",
      kinds: ["check"],
      state: "next",
      points: [
        "中午对齐补充；带 Step3 卡点清单（P0 四项）找开发确认改动量。",
        "重点问：L1–L5 导入模板何时可用、空末级能否启用、长名三级标（PRO-348）生产是否已放宽。",
      ],
      refs: [],
      open: ["具体时间：以日历为准（待确认）"],
    },
    {
      id: "n1104",
      date: "11-04",
      title: "客户线下模拟",
      kinds: ["demo", "check"],
      state: "next",
      points: [
        "管理员段 15–20 分钟 + 学员切图段 5–8 分钟，按下方演示脚本。",
        "会前需耿丽汝提供脱敏标准表；未到则用样例标签树。",
      ],
      refs: [],
      open: ["与 11-03 日程是否冲突：以日历为准（待确认）", "脱敏标准表是否到位：待确认"],
    },
  ],

  // Step3 演示剧本 · 11/4 上午
  adminScript: [
    ["0–2", "边界一句话", "光谱不做线上打分与晋级裁定；今天只演示创建 / 下发 / L 导入。"],
    ["2–5", "标签", "标准表 → 导入或帮建（导入不友好如实说）→ 亮一条长名三级标 → 点一下适用层级。"],
    ["5–11", "建图四步", "步1 只选岗位、同步默认开 → 步2 挂标 → 步3 三个末级：有课有题 / 仅资料 / 暂无 → 步4 开同步名单；口头说明「关则首次灌入」。"],
    ["11–13", "启用下发", "草稿学员不可见 → 启用 → 学员侧应能进图（不展开）。"],
    ["13–18", "L 导入", "入口名（待议）→ 导出模板 → 填 L1–L5 → 校验含 1 行错 → 写入。无 L 模板则展示目标列并记卡点。"],
    ["18–20", "收口", "复述卡点；约定会后谁改模板、谁补脱敏表；不承诺学员短板与晋级门禁当天验完。"],
  ],
  adminShortPath: "时间不够：步骤 5 → 6 → 7 → 11 → 14 → 17 → 18 → 19 → 20（跳过关同步、空末级深究、本地上传）。",

  learnerScript: [
    ["0–1", "边界", "本期学员只验切图；学资料 / 短板 / 晋级不展开。"],
    ["1–3", "PC", "开 dropdown → 指「本岗位」label → 搜一下（若有）→ 切副图再切回。"],
    ["3–5", "H5", "弹窗列表 → 本岗位高亮 / label → 选图关闭。H5 走生产或窄屏示意，不当作原型已验。"],
    ["5–6", "收口", "记卡点：搜索有无、H5 是否真弹窗、label 文案。"],
  ],

  // 会挡 11/4 的卡点（Step3 §5 + Step4 §5）
  blockers: [
    ["P0", "导入仍是 0–100 评分轨，缺「工号×末级×L1–L5」导出→导入闭环", "A18", "会挡主路径后半段"],
    ["P0", "脱敏标准表是否按时到位；不到只能用样例树", "A01", "可能挡标签段真实感"],
    ["P0", "空末级能否启用；第三步「未挂资源」提示（PRO-382 Backlog）", "A14 · A13", "可能挡三类绑定说服力"],
    ["P0", "防错规则：F1–F6 已定稿，待开发确认实现排期", "A20", "规则不挡；实现进度待确认"],
    ["P1", "列表仍露「关联群组」，首期只岗位易被误解", "A05", "不挡点选，挡认知"],
    ["P1", "PC 切图无搜索 / 无「本岗位」label；H5 未验真弹窗", "L02 · L03", "挡学员段验收"],
    ["开放", "能否完全不挂资源 / 课 / 测", "A13", "需口头确认"],
    ["开放", "入口叫「能力等级导入」还是「评分数据导入」", "A21", "挡对外话术"],
  ],

  // 口径速查
  glossary: [
    ["A–E", "岗位对技能的标准要求程度", "只作建标参考，不是学员能力"],
    ["L1–L5", "学员末级能力结果（业务线下定稿后导入）", "L1 初级工 · L2 中级工 · L3 高级工 · L4 技师 · L5 高级技师"],
    ["0–100", "旧评分导入轨", "心连心演示隐藏；旧客户保留"],
    ["√ / ×", "评委线下勾叉", "不导入、不重算"],
  ],

  // Linear 10-30 短表快照，现网以 Linear 为准
  linear: [
    ["PRO-290", "光谱优化总包", "In Progress", ""],
    ["PRO-339", "创建流程 / 人与图谱解绑", "In Progress", "SDGH-8398"],
    ["PRO-333", "岗位序列 / 胜任力导入", "In Progress", "Jira 暂无"],
    ["PRO-348", "三级标字数 / 符号", "In Progress", "SDGH-8399"],
    ["PRO-335", "末级本地上传", "曾 In Review（现状待确认）", "SDGH-8368"],
    ["PRO-382", "第三步未挂资源提示", "Backlog", ""],
  ],
};

/* 心连心甬道图 · 操作级节点 + 同道/跨道连线 */
(function () {
  "use strict";

  var COL_W = 168;
  var NODE_W = 146;
  var LANE_H = 172;
  var LABEL_W = 58;
  var TITLE_W = 34;
  var PAD_X = 14;
  var PAD_Y = 16;

  var LANES = [
    { id: "offline", name: "客户线下\n（评委 / HR / 任职资格）" },
    { id: "admin", name: "光谱 · 管理端" },
    { id: "learner", name: "光谱 · 学员端" },
    { id: "data", name: "数据 · 导出与边界" }
  ];

  /*
   * 列位（左→右大致时序）
   * 1-5 ①线下建标 · 5-6 管理端标签
   * 6-7 ②评委 · 8-10 ③短板
   * 7-16 ⑤建图/绑定/启用（与②③并行偏后）
   * 17-20 ④能力导入（接短板清单）
   * 16-24 ⑥⑦学员 · 21-22 管理看结果
   * 25-26 ⑧晋级 · ⑨建议
   */
  var NODES = [
    /* —— 泳道1 线下 ① —— */
    { id: "o1", lane: "offline", stage: "①", col: 1, title: "定岗位序列/职级", sub: "初→中→高·技师·高级技师",
      detail: { who: "客户 · 任职资格 / 耿丽汝", action: "确定岗位序列与职级档（初级工→高级技师），挂钩薪酬宽带。", output: "岗位序列/职级清单", status: "客户线下", gap: "旁证：BIP 无初中高级工，需云大学侧设定职级。" } },
    { id: "o2", lane: "offline", stage: "①", col: 2, title: "建一/二级标", sub: "任职资格结构骨架",
      detail: { who: "客户 · 标准负责人", action: "线下建立一、二级任职资格标准结构。", output: "一/二级标", status: "客户线下", gap: "—" } },
    { id: "o3", lane: "offline", stage: "①", col: 3, title: "建三级/末级标", sub: "技能项 / 知识项",
      detail: { who: "客户 · 标准负责人", action: "建三级/末级标（技能项、知识项），形成可导入粒度。", output: "三级/末级标明细", status: "客户线下；PRO-348 字数/符号放宽在研", gap: "A02 P1 跟生产放宽。" } },
    { id: "o4", lane: "offline", stage: "①", col: 4, title: "准备脱敏标准表", sub: "11/4 前交付",
      detail: { who: "客户 · 耿丽汝", action: "整理脱敏任职资格标准表（含技能/知识项汇总逻辑）。", output: "脱敏标准表", status: "未决 · 11/4 会前", gap: "模拟依赖项。" } },
    { id: "o5", lane: "offline", stage: "①", col: 5, title: "标签批量导入准备", sub: "衔接光谱导入",
      detail: { who: "客户 + Cloud", action: "按导入字段准备标签批量导入材料，衔接管理端 Excel/帮建。", output: "可导入的标签准备包", status: "衔接光谱", gap: "A01 P0：标准表→标签树路径写清。" } },

    /* —— ② —— */
    { id: "o6", lane: "offline", stage: "②", col: 6, title: "备证据材料", sub: "危害分析/事故报告/报表/操作票",
      detail: { who: "评委 / HR / 业务", action: "收集工作危害分析表、事故报告、月度电量报表、操作票等证据。", output: "证据包", status: "客户线下已有", gap: "—" } },
    { id: "o7", lane: "offline", stage: "②", col: 7, title: "评委勾叉评价", sub: "3–5 人 · 达标/未达标",
      detail: { who: "3–5 名评委", action: "按证据判达标/未达标（勾叉）。光谱不做领导干部线上打分。", output: "勾叉结果", status: "明确不做线上打分", gap: "A22 明确不做。" } },

    /* —— ③ —— */
    { id: "o8", lane: "offline", stage: "③", col: 8, title: "汇总多人未达标", sub: "如 5 人中 3 叉",
      detail: { who: "客户业务", action: "汇总评委勾叉，识别多人未达标项。", output: "未达标项汇总", status: "客户业务", gap: "—" } },
    { id: "o9", lane: "offline", stage: "③", col: 9, title: "标能力短板项", sub: "进入针对性培训",
      detail: { who: "客户业务", action: "将多人未达标项标为能力短板，进入针对性培训逻辑。", output: "短板项集合", status: "客户定义；学员端展示在研", gap: "衔接 L04。" } },
    { id: "o10", lane: "offline", stage: "③", col: 10, title: "整理短板/等级清单", sub: "交导入 · 最终 L",
      detail: { who: "客户业务 / HR", action: "整理短板与各技能最终等级清单，交给管理员导入光谱。", output: "短板/等级导入清单", status: "衔接④", gap: "跨道：短板清单→能力导入。" } },

    /* —— ⑧ —— */
    { id: "o11", lane: "offline", stage: "⑧", col: 25, title: "线下申请下一阶段认证", sub: "持光谱完成态",
      detail: { who: "学员申请", action: "持光谱待提升项完成态，按客户制度线下申请下一阶段认证。", output: "晋级申请", status: "客户内部门禁", gap: "光谱只提供完成状态。" } },
    { id: "o12", lane: "offline", stage: "⑧", col: 26, title: "HR/评委外部裁定", sub: "光谱不裁定", kind: "gate",
      detail: { who: "客户 HR / 评委", action: "外部/线下任职资格体系裁定认证；光谱不替代、不裁定。", output: "认证结论（系统外）", status: "明确不做光谱内裁定", gap: "A29 明确不做。" } },

    /* —— 泳道2 管理端 · 标签 —— */
    { id: "a1", lane: "admin", stage: "①→", col: 5, title: "Excel/帮建导入标签树", sub: "含三级标字段", band: "建标", bandClass: "band-green",
      detail: { who: "管理员 + Cloud", action: "用 Excel 或帮建解析导入一/二/三级标标签树，校验三级标字段。", output: "光谱标签树", status: "部分：帮建可解析；无专用任职资格标准表入口", gap: "A01 P0。" } },
    { id: "a2", lane: "admin", stage: "①→", col: 6, title: "同技能复用/职级层级", sub: "适用层级 L1–L5",
      detail: { who: "管理员", action: "同技能复用标签；按职级设适用层级（映射初→高级技师）。", output: "标签适用层级配置", status: "部分：有适用层级，无专用难度模型", gap: "A03/A17 P1。" } },

    /* —— ⑤ 建图 + 绑定 + 启用 —— */
    { id: "a7", lane: "admin", stage: "⑤", col: 7, title: "新建四步·基本信息", sub: "创建岗位图谱", band: "建图", bandClass: "band-yellow",
      detail: { who: "管理员", action: "进入新建图谱四步流第一步：填写基本信息。", output: "图谱草稿骨架", status: "有 · A04", gap: "—" } },
    { id: "a8", lane: "admin", stage: "⑤", col: 8, title: "四步·标签", sub: "挂一/二/三级标",
      detail: { who: "管理员", action: "第二步选择/挂载标签树。", output: "图谱标签结构", status: "有", gap: "—" } },
    { id: "a9", lane: "admin", stage: "⑤", col: 9, title: "四步·内容", sub: "进入资源绑定",
      detail: { who: "管理员", action: "第三步配置内容，进入末级资源绑定。", output: "内容配置入口", status: "有", gap: "—" } },
    { id: "a12", lane: "admin", stage: "⑤", col: 10, title: "三类绑定落位", sub: "有课有题 / 仅资料 / 暂无", band: "绑定", bandClass: "band-yellow",
      detail: { who: "管理员 · Cloud 测通", action: "末级按三类落位：有资料+题（优先）、仅资料无题、暂无资料；状态标签写死给 11/4。", output: "末级绑定状态", status: "部分 → 需调可演示", gap: "A13/A14 P0。" } },
    { id: "a10", lane: "admin", stage: "⑤", col: 11, title: "四步·学员·仅岗位", sub: "首期关联维度=岗位",
      detail: { who: "管理员", action: "第四步按岗位关联学员；首期隐藏群组残留，避免误配。", output: "岗位名单关联", status: "部分：仍有群组列/模型", gap: "A05 P1。" } },
    { id: "a11", lane: "admin", stage: "⑤", col: 12, title: "自动同步开/关", sub: "默认开 · 关则首次灌入",
      detail: { who: "管理员", action: "确认自动同步策略：开=岗位强绑定自动下发/回收；关=仅首次灌入后固定。", output: "同步策略锁定", status: "有 · A06–A08", gap: "—" } },
    { id: "a13", lane: "admin", stage: "⑤", col: 13, title: "末级本地上传", sub: "非课程文件 · PRO-335",
      detail: { who: "管理员", action: "在末级上传操作手册等非课程文件。", output: "本地培训资料", status: "原型无 · 生产 In Review", gap: "A15 P0。" } },
    { id: "a14", lane: "admin", stage: "⑤", col: 14, title: "同步资料中心", sub: "上传后入库",
      detail: { who: "系统 + 管理员", action: "上传资料同步至资料中心。", output: "资料中心条目", status: "跟 PRO-335", gap: "A15 P0。" } },
    { id: "a15", lane: "admin", stage: "⑤", col: 15, title: "自定义可见范围", sub: "生产指标保密",
      detail: { who: "管理员", action: "为资料设部门/岗位/人员可见范围。", output: "可见范围策略", status: "原型无", gap: "A16 P0；上线前验权限模型。" } },
    { id: "a16", lane: "admin", stage: "⑤", col: 16, title: "保存草稿/启用下发", sub: "启用后学员可见",
      detail: { who: "管理员", action: "保存草稿不开放；启用后下发，学员端可见。", output: "已启用图谱", status: "有 · A10", gap: "跨道：启用下发→学员进图。" } },

    /* —— ④ 导入（接短板清单；旅程上可在绑资源后） —— */
    { id: "a3", lane: "admin", stage: "④", col: 17, title: "业务给最终 L1–L5", sub: "不重算评委比例", band: "导入 L", bandClass: "band-green",
      detail: { who: "客户给数", action: "业务直接给定各技能最终等级 L1–L5（涉密）；光谱不按勾叉比例重算。", output: "L1–L5 业务结果", status: "口径已定；原型仍为 0–100 分", gap: "A18/A19 P0。" } },
    { id: "a4", lane: "admin", stage: "④", col: 18, title: "模板：工号×末级×L", sub: "替换 0–100 评分轨",
      detail: { who: "Cloud 定模板 · 管理员填", action: "使用「工号 × 末级标签 × L1–L5」模板准备导入文件。", output: "导入文件", status: "原型无此模板 → 需调", gap: "A18/A21 P0/P1。" } },
    { id: "a5", lane: "admin", stage: "④", col: 19, title: "校验/预览/错误导出", sub: "低成本防错",
      detail: { who: "管理员", action: "上传后校验、预览、导出错误行；降低逐人导与录入错误。", output: "校验报告 / 错误导出", status: "部分：CSV 预览有；规则未锁", gap: "A20 P0 · PRO-333。" } },
    { id: "a6", lane: "admin", stage: "④", col: 20, title: "确认写入", sub: "覆盖规则未决",
      detail: { who: "管理员", action: "确认写入能力等级；覆盖/再导入/平均规则待锁。", output: "学员末级 L 已落库", status: "未决覆盖规则", gap: "黄便签：覆盖策略 11/4 对齐。" } },

    /* —— ⑦ 管理侧 —— */
    { id: "a17", lane: "admin", stage: "⑦", col: 23, title: "驾驶舱看技能分布", sub: "本岗/团队", band: "看结果", bandClass: "band-green",
      detail: { who: "管理者", action: "驾驶舱查看本岗位/团队技能分布（推演统计）。", output: "分布视图", status: "有 · A23", gap: "—" } },
    { id: "a18", lane: "admin", stage: "⑦", col: 24, title: "学员短板完成一览", sub: "门禁依据",
      detail: { who: "管理员 / HR 索取", action: "查看学员短板/待提升项完成一览，供客户晋级门禁使用。", output: "完成一览", status: "部分 → 需增视图", gap: "A26 P1。" } },

    /* —— 泳道3 学员端 —— */
    { id: "l1", lane: "learner", stage: "⑥", col: 16, title: "进当前岗图", sub: "无图则提示联系管理员",
      detail: { who: "学员", action: "打开当前岗位关联图谱；无图提示联系管理员。", output: "进入学员端图谱", status: "有 · L01", gap: "—" } },
    { id: "l2", lane: "learner", stage: "⑥", col: 17, title: "多图谱切换", sub: "PC / H5 左上角",
      detail: { who: "学员", action: "一人多图谱时在 PC/H5 切换；本岗位优先。", output: "当前查看的图谱", status: "PC 有；H5 弱/另仓", gap: "L02/L03 P1。" } },
    { id: "l3", lane: "learner", stage: "⑥", col: 20, title: "突出待提升/短板", sub: "非全量噪音", band: "短板", bandClass: "band-green",
      detail: { who: "学员（只读）", action: "当前角色下突出待提升/短板分区，按导入 L 或短板清单置顶。", output: "待学短板清单", status: "无 → 必调", gap: "L04 P0。" } },
    { id: "l4", lane: "learner", stage: "⑥", col: 21, title: "学资料", sub: "受可见范围约束",
      detail: { who: "学员", action: "打开已绑资料学习；无权限资料不展示或灰显说明。", output: "学习进度", status: "部分：无可见范围过滤", gap: "L05 P0。" } },
    { id: "l5", lane: "learner", stage: "⑥", col: 22, title: "做参考题", sub: "以实际考核为准",
      detail: { who: "学员", action: "有题则做参考题；文案声明题目仅参考，正式达标以实际考核为准。", output: "参考验证记录", status: "有考试；缺口径文案", gap: "L07 P0。" } },
    { id: "l6", lane: "learner", stage: "⑦", col: 23, title: "胜任度刷新", sub: "短板补齐后更新",
      detail: { who: "系统自动", action: "短板项学习/验证完成后刷新岗位胜任度；换图后呈现新提升项。", output: "更新后的胜任度", status: "有指数；未与短板/L 闭环", gap: "A24/L08 P0。" } },
    { id: "l7", lane: "learner", stage: "⑧", col: 24, title: "完成态卡·可申请晋级", sub: "轻量 · 不审批", kind: "gate",
      detail: { who: "学员出示 · 线下申请", action: "展示「待提升项已完成」状态卡，供线下申请时出示；不做在线审批。", output: "可申请完成态", status: "无 → P1 轻量", gap: "L10 P1。跨道→线下申请。" } },

    /* —— 泳道4 边界 —— */
    { id: "x1", lane: "data", stage: "界", col: 1, title: "不做·领导干部线上打分", sub: "评委勾叉在线下", kind: "forbid",
      detail: { who: "产品边界", action: "不承接领导干部线上打分。", output: "—", status: "明确不做", gap: "A22。" } },
    { id: "x2", lane: "data", stage: "界", col: 2, title: "不做·替代外部任职资格", sub: "认证在客户体系", kind: "forbid",
      detail: { who: "产品边界", action: "光谱不替代外部任职资格体系。", output: "—", status: "明确不做", gap: "—" } },
    { id: "x3", lane: "data", stage: "界", col: 3, title: "不做·按勾叉比例重算", sub: "导入即最终 L", kind: "forbid",
      detail: { who: "产品边界", action: "不按评委勾叉比例重算等级；导入值为业务最终结果。", output: "—", status: "明确不做", gap: "A19。" } },
    { id: "s1", lane: "data", stage: "⑨", col: 24, title: "建议·带水印导出资料", sub: "评委线下凭证", kind: "suggest", band: "建议·未承诺", bandClass: "band-yellow",
      detail: { who: "产品建议", action: "带水印导出学习资料，作线下评价凭证。", output: "水印资料包", status: "建议项，未承诺", gap: "A27。" } },
    { id: "s2", lane: "data", stage: "⑨", col: 25, title: "远期·导出学习情况", sub: "供评委核算", kind: "suggest", band: "远期", bandClass: "band-yellow",
      detail: { who: "产品远期信号", action: "后台快速查看/导出学习情况供评委核算。", output: "学习情况导出包", status: "远期，11/4 不承诺", gap: "A28。" } }
  ];

  var EDGES = [
    /* 线下 ①→②→③ */
    { from: "o1", to: "o2" },
    { from: "o2", to: "o3" },
    { from: "o3", to: "o4" },
    { from: "o4", to: "o5" },
    { from: "o5", to: "o6" },
    { from: "o6", to: "o7" },
    { from: "o7", to: "o8" },
    { from: "o8", to: "o9" },
    { from: "o9", to: "o10" },
    { from: "o11", to: "o12" },

    /* 跨道：①标签准备 → 管理端标签导入 */
    { from: "o5", to: "a1", label: "标签准备→导入", cross: true },

    /* 管理端标签 */
    { from: "a1", to: "a2" },

    /* ⑤ 建图/绑定/启用 */
    { from: "a2", to: "a7", label: "标签就绪→建图" },
    { from: "a7", to: "a8" },
    { from: "a8", to: "a9" },
    { from: "a9", to: "a12" },
    { from: "a12", to: "a10" },
    { from: "a10", to: "a11" },
    { from: "a11", to: "a13" },
    { from: "a13", to: "a14" },
    { from: "a14", to: "a15" },
    { from: "a15", to: "a16" },

    /* 跨道：③短板清单 → ④能力导入 */
    { from: "o10", to: "a3", label: "短板清单→导入", cross: true },

    /* ④ 导入链 */
    { from: "a3", to: "a4" },
    { from: "a4", to: "a5" },
    { from: "a5", to: "a6" },

    /* 跨道：⑤启用 → ⑥进图 */
    { from: "a16", to: "l1", label: "启用下发→学员可见", cross: true },

    /* 跨道：④写入 → ⑥短板展示 */
    { from: "a6", to: "l3", label: "写入L/短板→短板展示", cross: true },

    /* 跨道：⑤资源就绪 → ⑥可学 */
    { from: "a15", to: "l4", label: "资源绑定就绪→可学", cross: true },

    /* 学员链 */
    { from: "l1", to: "l2" },
    { from: "l2", to: "l3" },
    { from: "l3", to: "l4" },
    { from: "l4", to: "l5" },
    { from: "l5", to: "l6" },
    { from: "l6", to: "l7" },

    /* 管理侧看结果 */
    { from: "a6", to: "a17" },
    { from: "a16", to: "a17" },
    { from: "a17", to: "a18" },
    { from: "l6", to: "a18", label: "完成→短板一览", cross: true },

    /* 跨道：完成 → ⑧可申请 */
    { from: "l7", to: "o11", label: "完成验证→可申请", cross: true },

    /* 跨道：完成态 → ⑨凭证建议 */
    { from: "l7", to: "s1", label: "完成态→凭证建议", cross: true },
    { from: "a18", to: "s2", label: "一览→远期导出", cross: true },

    /* ⑨ */
    { from: "s1", to: "s2" }
  ];

  var STICKIES = [
    { forId: "a6", title: "未决 · 覆盖规则", text: "确认写入后覆盖/再导入/平均策略未锁（PRO-333）" },
    { forId: "a3", title: "P0 · ④ L1–L5", text: "导入改工号×末级×L；低成本防错草案 11/4 前" },
    { forId: "a13", title: "P0 · ⑤ 上传+范围", text: "末级上传→资料中心+自定义可见范围；三类绑定可演示" },
    { forId: "l3", title: "P0 · ⑥ 短板突出", text: "学员端待提升分区；题目参考、以实际考核为准" },
    { forId: "l6", title: "P0 · ⑦ 胜任度联动", text: "短板补齐 / L 导入后刷新胜任度" },
    { forId: "o4", title: "11/4 依赖", text: "客户脱敏表 + Cloud 模拟环境同步到位" }
  ];

  var nodeById = {};
  NODES.forEach(function (n) { nodeById[n.id] = n; });

  var maxCol = 1;
  NODES.forEach(function (n) { if (n.col > maxCol) maxCol = n.col; });
  var poolInnerW = PAD_X * 2 + maxCol * COL_W;

  function nodeLeft(col) {
    return PAD_X + (col - 1) * COL_W + (COL_W - NODE_W) / 2;
  }

  function renderPool() {
    var pool = document.getElementById("pool");
    if (!pool) return;

    var totalW = TITLE_W + LABEL_W + poolInnerW;
    pool.style.width = totalW + "px";
    pool.style.minWidth = totalW + "px";

    var html = '<div class="pool-title" aria-hidden="true"><span>心连心培训考核闭环 · 操作级</span></div>';
    html += '<div class="pool-body" id="pool-body">';
    html += '<div class="lanes" id="lanes">';

    LANES.forEach(function (lane, li) {
      var last = li === LANES.length - 1 ? " lane-last" : "";
      html += '<div class="lane' + last + '" data-lane="' + lane.id + '">';
      html += '<div class="lane-label"><span>' + lane.name.replace(/\n/g, "<br>") + "</span></div>";
      html += '<div class="lane-track" data-lane-track="' + lane.id + '" style="width:' + poolInnerW + "px;min-height:" + LANE_H + 'px;position:relative">';

      NODES.filter(function (n) { return n.lane === lane.id; }).forEach(function (n) {
        var cls = "step";
        if (n.kind === "forbid") cls += " step-forbid";
        if (n.kind === "suggest") cls += " step-suggest";
        if (n.kind === "gate") cls += " step-gate";
        var left = nodeLeft(n.col);
        html += '<button type="button" class="' + cls + '" data-id="' + n.id + '" style="left:' + left + "px;top:" + PAD_Y + "px;width:" + NODE_W + 'px">';
        if (n.band) html += '<span class="band ' + (n.bandClass || "band-green") + '">' + n.band + "</span>";
        html += '<span class="step-num">' + n.stage + "</span>";
        html += '<span class="step-title">' + n.title + "</span>";
        html += '<span class="step-sub">' + n.sub + "</span>";
        html += "</button>";
      });

      html += "</div></div>";
    });

    html += "</div>";
    html += '<svg class="flow-arrows" id="flow-arrows" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"></svg>';
    html += "</div>";
    pool.innerHTML = html;

    var stickiesEl = document.getElementById("stickies");
    if (stickiesEl) {
      stickiesEl.innerHTML = STICKIES.map(function (s) {
        return '<div class="sticky" data-for="' + s.forId + '"><strong>' + s.title + "</strong><p>" + s.text + "</p></div>";
      }).join("");
    }

    var stats = document.getElementById("node-stats");
    if (stats) {
      var counts = { offline: 0, admin: 0, learner: 0, data: 0 };
      NODES.forEach(function (n) { counts[n.lane]++; });
      var crossN = EDGES.filter(function (e) {
        var a = nodeById[e.from], b = nodeById[e.to];
        return a && b && a.lane !== b.lane;
      }).length;
      stats.textContent =
        "操作节点 " + NODES.length +
        "（线下 " + counts.offline +
        " · 管理端 " + counts.admin +
        " · 学员端 " + counts.learner +
        " · 边界 " + counts.data +
        "）· 连线 " + EDGES.length +
        "（跨道 " + crossN + "）";
    }

    var crossList = document.getElementById("cross-edge-list");
    if (crossList) {
      var items = EDGES.filter(function (e) {
        var a = nodeById[e.from], b = nodeById[e.to];
        return a && b && a.lane !== b.lane && e.label;
      });
      crossList.innerHTML = items.map(function (e) {
        var a = nodeById[e.from], b = nodeById[e.to];
        return "<li><span class=\"red\">" + a.title + " → " + b.title + "</span> " + e.label + "</li>";
      }).join("");
    }
  }

  var panel = document.getElementById("detail-panel");
  var body = document.getElementById("detail-body");
  var closeBtn = document.getElementById("detail-close");

  function renderDetail(id) {
    var n = nodeById[id];
    if (!n || !body) return;
    var d = n.detail || {};
    var laneName = "";
    LANES.forEach(function (l) { if (l.id === n.lane) laneName = l.name.replace(/\n/g, " "); });
    body.innerHTML =
      "<h3>" + n.stage + " " + n.title + "</h3>" +
      '<p class="meta">甬道：' + laneName + " · 列 " + n.col + "</p>" +
      "<dl>" +
      "<dt>谁做</dt><dd>" + (d.who || "—") + "</dd>" +
      "<dt>动作</dt><dd>" + (d.action || "—") + "</dd>" +
      "<dt>产物</dt><dd>" + (d.output || "—") + "</dd>" +
      "<dt>现状</dt><dd>" + (d.status || "—") + "</dd>" +
      "</dl>" +
      '<div class="gap">' + (d.gap || "—") + "</div>";
    panel.hidden = false;
  }

  function setActive(id) {
    Array.prototype.forEach.call(document.querySelectorAll(".step[data-id]"), function (el) {
      el.classList.toggle("is-active", el.getAttribute("data-id") === id);
    });
  }

  function bindClicks() {
    Array.prototype.forEach.call(document.querySelectorAll(".step[data-id]"), function (el) {
      el.addEventListener("click", function () {
        var id = el.getAttribute("data-id");
        setActive(id);
        renderDetail(id);
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll(".sticky[data-for]"), function (st) {
      st.addEventListener("click", function () {
        var id = st.getAttribute("data-for");
        var step = document.querySelector('.step[data-id="' + id + '"]');
        if (step) {
          step.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
          setActive(id);
          renderDetail(id);
        }
      });
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", function () {
      panel.hidden = true;
      setActive(null);
    });
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      panel.hidden = true;
      setActive(null);
    }
  });

  function centerOf(el, root) {
    var r = el.getBoundingClientRect();
    var p = root.getBoundingClientRect();
    return {
      x: r.left - p.left + r.width / 2,
      y: r.top - p.top + r.height / 2,
      top: r.top - p.top,
      bottom: r.bottom - p.top,
      left: r.left - p.left,
      right: r.right - p.left
    };
  }

  function drawArrows() {
    var svg = document.getElementById("flow-arrows");
    var root = document.getElementById("pool-body");
    if (!svg || !root) return;

    var w = root.scrollWidth || root.offsetWidth;
    var h = root.offsetHeight;
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    svg.setAttribute("width", w);
    svg.setAttribute("height", h);

    var defs =
      "<defs>" +
      '<marker id="arrowhead" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto">' +
      '<path d="M0,0 L7,2.5 L0,5 Z" fill="#333"/></marker>' +
      '<marker id="arrowhead-cross" markerWidth="7" markerHeight="5" refX="6" refY="2.5" orient="auto">' +
      '<path d="M0,0 L7,2.5 L0,5 Z" fill="#c62828"/></marker>' +
      "</defs>";

    function el(id) {
      return document.querySelector('.step[data-id="' + id + '"]');
    }

    var paths = "";
    var labelUsed = {};

    EDGES.forEach(function (e, idx) {
      var a = el(e.from);
      var b = el(e.to);
      if (!a || !b) return;
      var na = nodeById[e.from];
      var nb = nodeById[e.to];
      if (!na || !nb) return;

      var A = centerOf(a, root);
      var B = centerOf(b, root);
      var sameLane = na.lane === nb.lane;
      var cross = !sameLane;

      var x1, y1, x2, y2, d;

      if (sameLane) {
        if (B.left >= A.right - 4) {
          x1 = A.right;
          y1 = A.y;
          x2 = B.left;
          y2 = B.y;
          d = "M " + x1 + " " + y1 + " L " + x2 + " " + y2;
        } else {
          /* target left of source — route below */
          x1 = A.x;
          y1 = A.bottom;
          x2 = B.x;
          y2 = B.bottom;
          var by = Math.max(A.bottom, B.bottom) + 10 + (idx % 3) * 6;
          d = "M " + x1 + " " + y1 + " L " + x1 + " " + by + " L " + x2 + " " + by + " L " + x2 + " " + y2;
        }
        paths += '<path class="edge-same" d="' + d + '"/>';
        if (e.label) {
          var mx = (A.x + B.x) / 2;
          var my2 = Math.min(A.y, B.y) - 7;
          paths +=
            '<text class="same-label" x="' + mx + '" y="' + my2 + '" text-anchor="middle">' +
            e.label +
            "</text>";
        }
      } else {
        /* cross-lane elbow */
        if (A.y < B.y - 8) {
          x1 = A.x;
          y1 = A.bottom;
          x2 = B.x;
          y2 = B.top;
        } else if (A.y > B.y + 8) {
          x1 = A.x;
          y1 = A.top;
          x2 = B.x;
          y2 = B.bottom;
        } else {
          x1 = A.right;
          y1 = A.y;
          x2 = B.left;
          y2 = B.y;
        }
        var my = (y1 + y2) / 2;
        /* slight offset so parallel cross edges don't fully overlap */
        my += ((idx % 5) - 2) * 4;
        if (Math.abs(x1 - x2) > 10 && Math.abs(y1 - y2) > 10) {
          d = "M " + x1 + " " + y1 + " L " + x1 + " " + my + " L " + x2 + " " + my + " L " + x2 + " " + y2;
        } else {
          d = "M " + x1 + " " + y1 + " L " + x2 + " " + y2;
        }
        paths += '<path class="edge-cross" d="' + d + '"/>';
        if (e.label && !labelUsed[e.label + e.from + e.to]) {
          labelUsed[e.label + e.from + e.to] = true;
          var lx = (x1 + x2) / 2;
          var ly = my - 4;
          paths +=
            '<text class="cross-label" x="' + lx + '" y="' + ly + '" text-anchor="middle">' +
            e.label +
            "</text>";
        }
      }
    });

    svg.innerHTML = defs + paths;
  }

  var drawTimer;
  function scheduleDraw() {
    clearTimeout(drawTimer);
    drawTimer = setTimeout(drawArrows, 50);
  }

  renderPool();
  bindClicks();

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(scheduleDraw);
  }
  window.addEventListener("load", scheduleDraw);
  window.addEventListener("resize", scheduleDraw);
  var scrollEl = document.getElementById("pool-scroll");
  if (scrollEl) scrollEl.addEventListener("scroll", scheduleDraw);
  scheduleDraw();
})();

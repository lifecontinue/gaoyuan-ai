/* =========================================================
   main.js — 应用入口（装配与引导）
   职责：导入各层模块 → 注入跨层回调（Galaxy/Side）→ 初始化阶段 →
        构建 window.TT 桥（供内联 onclick）→ 绑定事件 → 启动。
   本文件是唯一感知全部模块的「组合根（Composition Root）」。
   ========================================================= */
import { $, esc } from './core/utils.js';
import { state } from './core/state.js';
import { bus } from './core/event-bus.js';
import { STAGES } from './domain/growth.js';
import { Store } from './data/store.js';
import { Galaxy } from './viz/galaxy.js';
import { Side } from './ui/side-panel.js';
import * as Router from './ui/router.js';
let _resizeTimer;
import * as Views from './ui/detail-views.js';
import { buildSearchIndex, doSearch } from './ui/search.js';
import { AIPanel } from './ui/ai-panel.js';
import { GestureController } from './gesture/gesture-controller.js';
import { CometCursor } from './fx/comet-cursor.js';
import { closeModal } from './ui/widgets.js';
/* 新 Agent 架构：educationAgent() 统一入口，内部按 stage 路由到 specialist。
   Agent 目录：js/ai/router/ → js/ai/kindergarten/ + js/ai/primary/ + js/ai/shared/
   前端只需 import { educationAgent }，Key 由服务端代理 server/index.js 管理。 */

/* ---------- window.TT 桥：供模板内联 onclick="TT.xxx" 在运行时解析 ---------- */
const TT = {
  openNode: Router.openNode,
  setStage: Router.setStage,
  closeModal,
  openMenu: Router.openMenu,
  closeMenu: Router.closeMenu,
  openDomain: Router.openDomain,
  openSub: Router.openSub,
  openSubject: Router.openSubject,
  aiAction(id) { AIPanel.action(id); if (window.innerWidth <= 1024) $('#aiPanel').classList.remove('collapsed'); },
  renderParent: Views.renderParent,
  newParentPeriod: Views.newParentPeriod,
  editPP: Views.editPP,
  delPP: Views.delPP,
  assessBack: Views.assessBack,
  assessFin: Views.assessFin,
  setAsDom: Views.setAsDom,
  rate: Views.rate,
  rateNote: Views.rateNote,
  openPeriod: Views.openPeriod,
  openNoteModal: Views.openNoteModal,
  openChild: Views.openChild,
  delNote: Views.delNote,
  exportNotes: Views.exportNotes,
  tapHabit: Views.tapHabit,
  editHabits: Views.editHabits,
  openSummaryForm: Views.openSummaryForm,
  printSummary: Views.printSummary,
  exportSummaryMD: Views.exportSummaryMD,
  delSummary: Views.delSummary,
  exportData: Views.exportData,
  importData: Views.importData,
  resetData: Views.resetData,
  rateIndicator: Views.rateIndicator,
  openPrimaryIndicator: Views.openPrimaryIndicator,
  ratePrimaryIndicator: Views.ratePrimaryIndicator,
  toggleAI() { $('#aiPanel').classList.toggle('collapsed'); }
};
/* 兼容/调试引用 */
TT.state = state; TT.STAGES = STAGES; TT.AI = AIPanel;
window.TT = TT;

/* 新 Agent 架构：educationAgent() 统一入口 → router → specialist Agent。
   API Key 由服务端代理 server/index.js 管理，前端免输入。 */

/* ---------- 事件绑定 ---------- */
function bindEvents() {
  Side.init();
  // #galStage 由 Galaxy.initCanvas 经 onStageChange 处理，此处不重复绑定
  // AI 面板收起 / 重新打开：用 toggle 而非只 add，确保关闭后可再次调出
  $('#aiMin').addEventListener('click', () => $('#aiPanel').classList.toggle('collapsed'));
  const launch = $('#aiLaunch'); if (launch) launch.addEventListener('click', () => $('#aiPanel').classList.toggle('collapsed'));
  /* 手势控制：点击按钮启用摄像头 + MediaPipe 手势识别 */
  const gToggle = $('#gestureToggle'); if (gToggle) gToggle.addEventListener('click', () => GestureController.toggle());
  const gClose = $('#gestureClose'); if (gClose) gClose.addEventListener('click', () => GestureController.disable());
  $('#menuClose').addEventListener('click', Router.closeMenuMask);
  $('#menuMask').addEventListener('click', Router.closeMenuMask);
  $('#menu').addEventListener('click', e => { const b = e.target.closest('.menu-item'); if (!b) return; $('#menu').classList.remove('open'); setTimeout(() => $('#menuMask').classList.remove('show'), 200); Router.openMenu(b.dataset.menu); });
  const gt = $('#galTitle'); if (gt) { gt.addEventListener('click', () => Views.openChild()); gt.style.cursor = 'pointer'; }
  $('#spClose').addEventListener('click', () => Side.hide());
  /* 孩子信息被编辑后：重建星图中心节点 + 更新标题 + 刷新抽屉 */
  bus.on('app/child-updated', () => {
    if (Galaxy) { Galaxy.buildNodes(state.stage); Galaxy.updateHud(); }
    updateGalTitle();
    Side.refresh();
  });
  const aiInput = $('#aiInput');
  function sendAi() { const t = aiInput.value.trim(); if (!t) return; aiInput.value = ''; aiInput.style.height = 'auto'; AIPanel.reply(t); }
  aiInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAi(); } });
  aiInput.addEventListener('input', () => { aiInput.style.height = 'auto'; aiInput.style.height = Math.min(aiInput.scrollHeight, 120) + 'px'; });
  $('#aiSend').addEventListener('click', sendAi);
  const si = $('#searchInput'); si.addEventListener('input', e => doSearch(e.target.value));
  si.addEventListener('focus', e => doSearch(e.target.value));
  document.addEventListener('click', e => { if (!e.target.closest('.gc-search')) { $('#searchResults').classList.remove('show'); } });
  $('#modalMask').addEventListener('click', e => { if (e.target.id === 'modalMask') closeModal(); });
}

/* ---------- 初始化（幂等） ---------- */
let _inited = false;
function updateGalTitle() {
  const el = $('#galTitle'); if (!el) return;
  const c = Store.child || {};
  const main = el.querySelector('.gt-main');
  if (main) main.innerHTML = `${esc(c.name || '')} <span>${esc(c.nickname || '')}</span>`;
}
function init() {
  if (_inited) return; _inited = true;

  /* 初始化标题为孩子信息 */
  updateGalTitle();

  /* 注入 Galaxy 跨层回调（解耦 viz ↔ 应用层） */
  Galaxy.onNodeClick = Router.openNode;
  Galaxy.onStageChange = Router.setStage;
  Galaxy.onHoverContext = (c) => bus.emit('ai/context', c);
  Galaxy.getStage = () => state.stage;
  /* 注入 Side 回调：抽屉关闭时重置 AI 上下文 */
  Side.onHide = () => bus.emit('ai/context', { domain: null, metric: null, menu: null });

  /* 恢复上次阶段 */
  state.stage = (Store.s.settings && Store.s.settings.lastStage) || 'k';

  buildSearchIndex();
  bindEvents();
  Router.refreshSide();
  if (Galaxy) Galaxy.enter(state.stage);
  AIPanel.init();
  GestureController.init();
  CometCursor.init();
  /* 初始化拟水态阶段切换器位置，并监听尺寸变化 */
  requestAnimationFrame(() => Router.initStageLiquid());
  window.addEventListener('resize', () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => Router.updateStageLiquid(state.stage), 120);
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

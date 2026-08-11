/* =========================================================
   ui/side-panel.js — 右侧万能抽屉容器（SidePanel）
   单一职责：抽屉的显隐、面包屑 + 正文渲染、当前视图刷新。
   不生成内容（内容由 detail-views 传入）；onHide 回调由 main.js 注入。
   ========================================================= */
import { $ } from '../core/utils.js';

export const Side = {
  el: null, body: null, crumbs: null, cur: null,
  /** 隐藏时的回调（如重置 AI 上下文），由 main.js 注入 */
  onHide: null,

  init() { this.el = $('#sidePanel'); this.body = $('#spBody'); this.crumbs = $('#spCrumbs'); },
  show() { this.el.classList.add('open'); document.body.classList.add('sp-open'); },
  hide() { this.el.classList.remove('open'); document.body.classList.remove('sp-open'); this.cur = null; if (this.onHide) this.onHide(); },

  /**
   * 渲染抽屉内容
   * @param {string} crumbs 面包屑 HTML
   * @param {string} html   正文 HTML（已 esc）
   * @param {{fn:Function, args:any[]}=} cur  刷新句柄：数据变更后 Side.refresh() 重放（须幂等）
   */
  render(crumbs, html, cur) { this.crumbs.innerHTML = crumbs; this.body.innerHTML = html; this.cur = cur || null; this.show(); this.body.scrollTop = 0; },
  refresh() { if (this.cur && this.cur.fn) this.cur.fn.apply(null, this.cur.args || []); },
  close() { this.hide(); }
};

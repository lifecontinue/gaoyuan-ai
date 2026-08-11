/* =========================================================
   core/utils.js — 通用工具函数
   纯函数为主 + DOM 查询助手 + 通用格式化；依赖 core/config（单向），不依赖业务模块。
   ========================================================= */
import { lvc } from './config.js';

/** DOM 查询 */
export const $ = s => document.querySelector(s);
export const $$ = s => Array.from(document.querySelectorAll(s));

/** HTML 转义（防注入） */
export const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** 评价等级小标签（通用格式化，AI 与 UI 共用） */
export const lvPill = l => `<span class="lv lv-${lvc(l)}">${esc(l || '未测试')}</span>`;

/** 百分比格式化：0.7143 → 71.4%（整数则去小数） */
export const pct = v => v == null ? '–' : (v * 100).toFixed(v * 100 % 1 === 0 ? 0 : 1) + '%';

/** 日期助手 */
export const today = () => new Date().toISOString().slice(0, 10);
export const thisMonth = () => new Date().toISOString().slice(0, 7);

/** 数组平均（忽略 null/NaN） */
export function avgOf(arr) { const v = (arr || []).filter(x => x != null && !isNaN(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }

/** 简易唯一 id */
export function uid(p) { return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

/** 触发浏览器下载（带 BOM，保证中文在 Excel/记事本正常） */
export function download(name, text, mime) {
  const b = new Blob(['﻿' + text], { type: (mime || 'text/plain') + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

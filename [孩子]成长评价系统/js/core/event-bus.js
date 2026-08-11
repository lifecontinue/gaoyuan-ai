/* =========================================================
   core/event-bus.js — 轻量事件总线
   用于跨层 / 跨模块的解耦通知（数据变更、AI 上下文、阶段切换等）。
   命名约定：'domain/action'，如 'stage/changed'、'ai/context'、'data/imported'。
   ========================================================= */

const map = new Map();

export const bus = {
  /** 订阅；返回取消订阅函数 */
  on(ev, fn) {
    if (!map.has(ev)) map.set(ev, new Set());
    map.get(ev).add(fn);
    return () => bus.off(ev, fn);
  },
  off(ev, fn) { const s = map.get(ev); if (s) s.delete(fn); },
  /** 发布；单个监听器异常不影响其他 */
  emit(ev, payload) {
    const s = map.get(ev); if (!s) return;
    s.forEach(fn => { try { fn(payload); } catch (e) { console.error('[bus]', ev, e); } });
  }
};

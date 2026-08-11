/* =========================================================
   ai/context-builder.js — AI 上下文快照构建
   把当前阶段 + 领域统计数据浓缩成 AI 可直接消费的快照，
   供 Orchestrator / Provider 使用。不访问 DOM。
   ========================================================= */
import { withData, avgOfPeriod, registry, weakestDomain, strongestDomain, STAGES } from '../domain/growth.js';
import { SUBJS } from '../domain/subjects.js';
import { state } from '../core/state.js';

/**
 * @returns {object} snapshot
 *  { stage, stageLabel, periods, cur, prev, curAvg, prevAvg, diff,
 *    weak, strong, chronicCount, subjects, hasSubjects }
 */
export function buildSnapshot() {
  const ps = withData();
  const cur = ps[ps.length - 1] || null;
  const prev = ps[ps.length - 2] || null;
  const curAvg = cur ? avgOfPeriod(cur) : null;
  const prevAvg = prev ? avgOfPeriod(prev) : null;
  const { reg } = registry();
  const chronicCount = Object.values(reg).filter(e => e.tag === 'chronic').length;
  return {
    stage: state.stage,
    stageLabel: (STAGES[state.stage] || {}).label || state.stage,
    periods: ps,
    cur, prev, curAvg, prevAvg,
    diff: (curAvg != null && prevAvg != null) ? curAvg - prevAvg : null,
    weak: cur ? weakestDomain(cur) : null,
    strong: cur ? strongestDomain(cur) : null,
    chronicCount,
    subjects: SUBJS,
    hasSubjects: state.stage === 'p' && SUBJS.length > 0
  };
}

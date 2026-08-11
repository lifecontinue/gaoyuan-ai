/* =========================================================
   ai/shared/memory.js — Child Profile Memory

   在每个 Agent 调用前，构建当前孩子的画像文本，注入 system prompt。
   数据来源：
   · Store（LocalStorage 持久化）：孩子基本信息、近期测评、家长记录
   · 领域知识注入的缓存（避免重复计算）

   调用时机：
   · 每次 Agent 处理请求前，由 provider 调用 buildChildProfile()
   · Agent 可从画像中获取：姓名/年龄/性别/阶段/近期评估/关注领域
   ========================================================= */

import { $ } from '../../core/utils.js';
import { state } from '../../core/state.js';

/**
 * 从 Store 读取孩子信息并构建画像文本。
 * 当 Store 不可用时返回通用画像模板。
 */
export async function buildChildProfile() {
  let Store = null;
  try { Store = (await import('../../data/store.js')).Store; } catch (e) { /**/ }

  const profile = {
    name: '',
    nickname: '',
    gender: '',
    age: '',
    grade: '',
    stage: state.stage || 'k',
    stageLabel: state.stage === 'p' ? '小学' : '幼儿园',
    recentPeriods: [],
    recentAssessments: [],
    concerns: [],
  };

  /* 从 Store 读取孩子基本信息 */
  if (Store && Store.child) {
    const c = Store.child;
    profile.name = c.name || '';
    profile.nickname = c.nickname || '';
    profile.gender = c.gender || '';
    profile.age = c.age || '';
    profile.grade = c.grade || '';
  }

  /* 近期测评快照 */
  if (Store && Store.periods) {
    const sorted = Object.values(Store.periods).filter(p => p && p.date).sort((a, b) => b.date.localeCompare(a.date));
    profile.recentPeriods = sorted.slice(0, 3).map(p => ({
      label: p.label || p.name || '',
      date: p.date || '',
      score: p.overallScore != null ? Math.round(p.overallScore * 100) + '%' : '',
    }));
  }

  return profile;
}

/**
 * 将 profile 对象转为 Agent system prompt 可直接使用的文本。
 */
export function profileToText(profile) {
  if (!profile) return '（未提供）';
  const parts = [];
  if (profile.name) {
    parts.push(`姓名：${profile.name}${profile.nickname ? '（小名' + profile.nickname + '）' : ''}`);
  }
  if (profile.gender) parts.push(`性别：${profile.gender}`);
  if (profile.age) parts.push(`年龄：${profile.age}`);
  if (profile.grade) parts.push(`年级：${profile.grade}`);
  if (profile.stageLabel) parts.push(`当前阶段：${profile.stageLabel}`);
  if (profile.recentPeriods && profile.recentPeriods.length) {
    parts.push('近期测评：' + profile.recentPeriods.map(p => `${p.label}（综合得分率 ${p.score}）`).join('，'));
  }
  if (profile.concerns && profile.concerns.length) {
    parts.push('家长关注：' + profile.concerns.join('，'));
  }
  return parts.join('；');
}

/**
 * 构建完整画像文本并注入提示
 * 内部调用 buildChildProfile → profileToText
 * @returns {string} 可直接拼入 system prompt 的段落
 */
export async function childProfileText() {
  const p = await buildChildProfile();
  return '当前被评估儿童信息：' + profileToText(p);
}

/* ---------- 调用时机说明（注入 system prompt） ---------- */
export const MEMORY_USAGE_NOTE = `
【Child Profile Memory 说明】
- 每次收到请求前，系统会将上述「当前被评估儿童信息」注入本上下文
- 当用户提到「团团」「孩子」「小朋友」等时，参考画像中的姓名、年龄、阶段、近期测评
- 如果某个维度的数据缺失，如实说「目前暂未录入该方面数据」，不要编造
`.trim();

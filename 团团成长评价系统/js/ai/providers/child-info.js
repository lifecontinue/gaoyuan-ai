/* =========================================================
   ai/providers/child-info.js — 当前被评估儿童信息文本（合并可编辑覆盖层）
   供两个阶段的 DeepSeek Provider 复用的纯函数。
   ========================================================= */
import { childInfo } from '../../domain/growth.js';

/** 返回「姓名（小名）｜性别｜幼儿园/学校…」文本，未提供返回空串 */
export function getChildText() {
  const c = childInfo() || {};
  const p = [];
  if (c.name) p.push(`姓名：${c.name}${c.nickname ? '（小名' + c.nickname + '）' : ''}`);
  if (c.gender) p.push(`性别：${c.gender}`);
  if (c.kindergarten) p.push(`幼儿园：${c.kindergarten}`);
  if (c.grade) p.push(`年级：${c.grade}`);
  if (c.school) p.push(`学校：${c.school}`);
  return p.join('；');
}

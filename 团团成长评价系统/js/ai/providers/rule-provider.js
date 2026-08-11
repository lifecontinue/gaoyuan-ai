/* =========================================================
   ai/providers/rule-provider.js — 本地规则 AI Provider（默认实现）
   实现 IAIProvider：基于本地统计规则生成成长分析。
   始终 ready，作为云端不可用时的降级兜底。
   返回结构：analyze → { html, navigate?: { menu } }；chat → { html }。
   不访问 DOM、不直接导航（navigate 由 UI 层执行），保持可测、可替换。
   ========================================================= */
import { avgOfPeriod, registry, weakestDomain, strongestDomain, topDomain, lastLv, domMeta, domLabel, childFullName, DOMS } from '../../domain/growth.js';
import { SUBJS } from '../../domain/subjects.js';
import { ACTIVITY_MAP } from '../../core/config.js';
import { esc, pct, lvPill } from '../../core/utils.js';

export const RuleProvider = {
  name: 'rule',
  get ready() { return true; },

  /** 欢迎语 */
  welcome(snap) {
    const { cur, curAvg, diff, weak, strong, chronicCount, hasSubjects, subjects, stageLabel } = snap;
    if (!cur) {
      if (hasSubjects) return `Hi，我是团团成长顾问。当前<b>小学</b>阶段还没有结构化测评数据，但团团已进入<b>三年级（第二学段）</b>。我已备好 <b>${subjects.length}</b> 门学科的「学科评价维度」：数学融合了教育知识图谱的真实学习路径，其余学科依据 2022 课标梳理。<br><br>在右侧抽屉「学科维度」可查看主题与可评指标；在「家长记录」里添加观察，我会随时帮你分析。`;
      return `Hi，我是团团成长顾问。当前<b>${stageLabel}</b>阶段还没有结构化测评数据。你可以在「家长记录」里添加观察，我会随时帮你分析。`;
    }
    let html = `Hi，${childFullName()}的<b>${stageLabel}</b>数据已就绪。<br><br>最新一期 <b>${esc(cur.name)}</b> 综合得分率 <b>${pct(curAvg)}</b>`;
    if (diff != null) html += `，较上期${diff >= 0 ? '提升' : '下降'} <b class="${diff >= 0 ? 'up' : 'down'}">${Math.abs(diff * 100).toFixed(1)}pt</b>`;
    html += `。<br><br>优势领域：<b style="color:${domMeta(strong.key).color}">${domLabel(strong.key)}</b>（${pct(cur.domainScores[strong.key])}）；相对薄弱：<b style="color:${domMeta(weak.key).color}">${domLabel(weak.key)}</b>（${pct(cur.domainScores[weak.key])}）。`;
    if (chronicCount) html += `<br>目前长期待突破指标共 <b>${chronicCount}</b> 项。`;
    return html + `<br><br>点击星图中的节点可下钻详情；或试试下方快捷动作。`;
  },

  /** 意图分析 */
  analyze({ intent, snapshot: snap }) {
    const ps = snap.periods, cur = snap.cur, prev = snap.prev;
    const { reg } = registry();

    if (intent === 'trend') {
      if (!cur) return { html: '当前阶段数据不足，无法分析趋势。' };
      const rows = ps.map(p => ({ name: p.name, avg: avgOfPeriod(p) }));
      let html = `最近 <b>${ps.length}</b> 期综合得分率趋势：<br>` + rows.map(r => `· ${esc(r.name)}：<b>${pct(r.avg)}</b>`).join('<br>');
      if (prev) {
        const deltas = DOMS.map(d => { const a = cur.domainScores[d], b = prev.domainScores[d]; return (a != null && b != null) ? { d, delta: a - b } : null; }).filter(Boolean).sort((a, b) => b.delta - a.delta);
        if (deltas.length) html += `<br><br>与上期相比，提升最多的是 <b style="color:${domMeta(deltas[0].d).color}">${deltas[0].d}</b>（+${(deltas[0].delta * 100).toFixed(1)}pt），变化最小/下降的是 <b style="color:${domMeta(deltas[deltas.length - 1].d).color}">${deltas[deltas.length - 1].d}</b>（${deltas[deltas.length - 1].delta >= 0 ? '+' : ''}${(deltas[deltas.length - 1].delta * 100).toFixed(1)}pt）。`;
      }
      return { html };
    }

    if (intent === 'weak') {
      const chronic = Object.values(reg).filter(e => e.tag === 'chronic').sort((a, b) => b.badTimes - a.badTimes);
      const weakDomain = cur ? weakestDomain(cur) : null;
      let html = ''; if (weakDomain) html += `当前最薄弱领域是 <b style="color:${domMeta(weakDomain.key).color}">${weakDomain.key}</b>（${pct(weakDomain.v)}）。<br><br>`;
      if (chronic.length) html += `长期待突破指标 TOP 5：<br>` + chronic.slice(0, 5).map((e, i) => `${i + 1}. <b>${esc(e.n)}</b>（${esc(domLabel(e.d))}）— 最近 ${lvPill(lastLv(e))}`).join('<br>') + `<br><br>建议优先把 <b>${topDomain(chronic)}</b> 领域的这些指标融入日常游戏与观察中。`;
      else html += '当前没有长期未达标指标，整体发展均衡。';
      return { html };
    }

    if (intent === 'plan') {
      const chronic = Object.values(reg).filter(e => e.tag === 'chronic').slice(0, 3);
      const html = `<b>${childFullName()}下阶段提升计划</b><br><br>1. <b>目标聚焦</b>：${chronic.length ? chronic.map(e => `提升「${esc(e.n)}」`).join('、') : '保持各领域均衡发展'}。<br>2. <b>每周记录</b>：在「家长记录」留下 2-3 条具体观察。<br>3. <b>习惯打卡</b>：把待突破指标转化为每日打卡项。<br>4. <b>家园对照</b>：学期末做一次家长测评。<br>5. <b>正向反馈</b>：关注进步指标，及时鼓励。`;
      return { html };
    }

    if (intent === 'report') return { html: '已为你打开「综合评价」生成器。', navigate: { menu: 'summary' } };
    if (intent === 'subjects') return { html: '已打开<b>三年级学科维度</b>。', navigate: { menu: 'subjects' } };

    if (intent === 'activity') {
      if (snap.hasSubjects) {
        const picks = ['语文', '数学', '科学', '劳动']; let html = '基于<b>三年级</b>学科维度，推荐亲子活动：<br><br>';
        picks.forEach(name => { const s = SUBJS.find(x => x.name === name || (name === '语文' && x.id === 'chinese')); if (!s) return; const t = s.themes[0]; const ind = (t && t.indicators && t.indicators[0]) ? t.indicators[0] : '结合生活情境练习'; html += `· <b>${esc(s.name)}</b>：${esc(ind.text || ind)}<br>`; });
        html += '<br>通用建议：每天 10–15 分钟小任务、用照片记录过程、优先选孩子感兴趣的形式。';
        return { html };
      }
      const weak = cur ? weakestDomain(cur) : null;
      let html = '推荐亲子活动：<br><br>'; if (weak) html += `针对薄弱领域 <b>${weak.key}</b>：${ACTIVITY_MAP[weak.key] || '多提供相关情境练习。'}<br><br>`;
      html += '通用建议：每天 10 分钟小任务 · 用照片记录 · 优先选感兴趣的形式。';
      return { html };
    }

    return { html: '暂未支持该分析。' };
  },

  /** 自由问答（未匹配到已知意图时的兜底） */
  chat({ text }) {
    const t = (text || '').trim();
    return { html: `我理解了你的问题「${esc(t)}」。可以点击中间星图的节点下钻详情，或用上方快捷动作让我分析趋势、薄弱点、生成报告或推荐活动。` };
  }
};

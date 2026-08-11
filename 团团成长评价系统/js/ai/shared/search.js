// ai/shared/search.js — Web Search 统一调用工具
// 由 provider 在构建上下文时调用，搜索结果注入 LLM prompt
import { aiApiBase } from '../../core/config.js';

/** 执行 Web 搜索，返回格式化结果 */
export async function webSearch(query, maxResults = 4) {
  if (!query || query.trim().length < 2) return null;
  // 1. 尝试代理
  try {
    const base = aiApiBase();
    if (base) {
      const res = await fetch(base + '/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), max_results: maxResults }),
      });
      if (res.ok) {
        const j = await res.json();
        if (j && Array.isArray(j.results) && j.results.length > 0) return j;
      }
    }
  } catch (e) { /* 直连 */ }
  // 2. 直连 DuckDuckGo
  try {
    const ddgUrl = 'https://api.duckduckgo.com/?q=' + encodeURIComponent(query.trim()) + '&format=json&no_html=1&skip_disambig=1';
    const ddg = await fetch(ddgUrl).then(r => r.json()).catch(() => null);
    const results = [];
    if (ddg && ddg.AbstractText) {
      results.push({ title: ddg.Heading || query, url: ddg.AbstractURL || '', snippet: ddg.AbstractText });
    }
    if (ddg && Array.isArray(ddg.RelatedTopics)) {
      for (const t of ddg.RelatedTopics) {
        if (results.length >= maxResults) break;
        if (t.Text) results.push({ title: (t.Text || '').slice(0, 80), url: t.FirstURL || '', snippet: t.Text });
      }
    }
    if (results.length > 0) return { query: query.trim(), results, source: 'duckduckgo' };
  } catch (e) { /* ignored */ }
  return null;
}

/** 判断用户输入是否可能需要实时信息 */
export function needsWebSearch(text) {
  if (!text || text.length < 10) return false;
  const patterns = [
    /最新|最近|现在|当前|今年|202[4-9]|目前/,
    /搜索|查询|查一下|查查|帮我查|网上/,
    /什么是|是什么|怎么|如何|为什么/,
    /政策|规定|标准|指南|要求|方案/,
    /比较|区别|差异|哪个好/,
  ];
  return patterns.some(p => p.test(text));
}

/** 从实时搜索结果构建上下文文本块（注入 LLM prompt） */
export function searchContextBlock(searchData) {
  if (!searchData || !Array.isArray(searchData.results) || searchData.results.length === 0) return '';
  const lines = ['【实时搜索结果（来自「' + (searchData.source || 'web') + '」）】'];
  searchData.results.forEach((r, i) => {
    const title = r.title || '';
    const snippet = (r.snippet || '').replace(/\n/g, ' ').slice(0, 300);
    lines.push(`${i + 1}. ${title}`);
    if (snippet) lines.push(`   ${snippet}`);
  });
  lines.push('（以上为实时搜索结果，请结合你的专业知识给出回答，确保信息准确。）');
  return lines.join('\n');
}

/** 从用户输入中提取搜索关键词 */
export function extractSearchQuery(text) {
  if (!text) return '';
  // 去掉常见的孩子相关名字、代词等，保留核心疑问
  let q = text
    .replace(/林悠然|悠悠|孩子|他|她|我家|宝宝|小朋友/g, '')
    .replace(/帮我|请|能不能|可以/g, '')
    .replace(/吗[？?]|[？?]+$/, '')
    .trim();
  // 限制长度
  if (q.length > 80) q = q.slice(0, 80);
  return q;
}

/* =========================================================
   viz/charts.js — 轻量 SVG 图表：雷达图 / 折线趋势图 / 堆叠条
   纯绘制：接收数据返回 SVG 字符串，不取业务数据、无外部依赖。
   ========================================================= */
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- 雷达图 ---------- */
function radar(opts) {
  const axes = opts.axes;                       // [{label}]
  const series = opts.series;                   // [{name,color,values:[0~1],dash}]
  const size = opts.size || 340;
  const min = opts.min == null ? 0.5 : opts.min;
  const cx = size / 2, cy = size / 2 + 4, R = size / 2 - 62;
  const n = axes.length;
  const ang = i => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i, v) => {
    const r = R * Math.max(0, Math.min(1, (v - min) / (1 - min)));
    return [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))];
  };
  let g = '';
  for (let k = 1; k <= 4; k++) {
    const rr = (R * k) / 4;
    const pts = axes.map((_, i) => `${(cx + rr * Math.cos(ang(i))).toFixed(1)},${(cy + rr * Math.sin(ang(i))).toFixed(1)}`).join(' ');
    g += `<polygon points="${pts}" fill="${k === 4 ? '#fbfaf7' : 'none'}" stroke="#e7e2d8" stroke-width="1"/>`;
  }
  axes.forEach((_, i) => {
    const [x, y] = [cx + R * Math.cos(ang(i)), cy + R * Math.sin(ang(i))];
    g += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e7e2d8" stroke-width="1"/>`;
  });
  series.forEach(s => {
    const valid = s.values.every(v => v != null);
    if (!valid) return;
    const pts = s.values.map((v, i) => pt(i, v).map(z => z.toFixed(1)).join(',')).join(' ');
    g += `<polygon points="${pts}" fill="${s.color}" fill-opacity="${s.fill == null ? 0.13 : s.fill}" stroke="${s.color}" stroke-width="2" ${s.dash ? 'stroke-dasharray="5 4"' : ''} stroke-linejoin="round"/>`;
    s.values.forEach((v, i) => {
      const [x, y] = pt(i, v);
      g += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.2" fill="#fff" stroke="${s.color}" stroke-width="2"/>`;
    });
  });
  axes.forEach((a, i) => {
    const rr = R + 24;
    const x = cx + rr * Math.cos(ang(i)), y = cy + rr * Math.sin(ang(i));
    let anchor = 'middle';
    if (Math.cos(ang(i)) > 0.3) anchor = 'start';
    if (Math.cos(ang(i)) < -0.3) anchor = 'end';
    const v0 = series[0] && series[0].values[i];
    g += `<text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="${anchor}" font-size="11.5" fill="#5c574e" font-weight="600">${esc(a.label)}</text>`;
    if (v0 != null) g += `<text x="${x.toFixed(1)}" y="${(y + 16).toFixed(1)}" text-anchor="${anchor}" font-size="10.5" fill="#918a7d">${(v0 * 100).toFixed(0)}%</text>`;
  });
  g += `<text x="${cx}" y="${cy - R - 8}" text-anchor="middle" font-size="9.5" fill="#bdb6a9">刻度 ${min.toFixed(1)}~1.0</text>`;
  return `<svg viewBox="0 0 ${size} ${size + 10}" width="100%" style="max-width:${size}px;display:block;margin:0 auto">${g}</svg>`;
}

/* ---------- 折线趋势图 ---------- */
function line(opts) {
  const W = opts.width || 720, H = opts.height || 260;
  const P = { t: 14, r: 16, b: 42, l: 40 };
  const labels = opts.labels;
  const series = opts.series;
  const min = opts.min == null ? 0.6 : opts.min, max = 1;
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const X = i => P.l + (labels.length === 1 ? iw / 2 : (iw * i) / (labels.length - 1));
  const Y = v => P.t + ih - (ih * (v - min)) / (max - min);
  let g = '';
  for (let k = 0; k <= 4; k++) {
    const v = min + ((max - min) * k) / 4, y = Y(v);
    g += `<line x1="${P.l}" y1="${y.toFixed(1)}" x2="${W - P.r}" y2="${y.toFixed(1)}" stroke="${k === 0 ? '#ddd8cf' : '#f0ece3'}" stroke-width="1"/>`;
    g += `<text x="${P.l - 7}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="#a9a29a">${(v * 100).toFixed(0)}%</text>`;
  }
  labels.forEach((l, i) => {
    const x = X(i);
    g += `<text x="${x.toFixed(1)}" y="${H - 22}" text-anchor="middle" font-size="10" fill="#5c574e">${esc(l.a || l)}</text>`;
    if (l.b) g += `<text x="${x.toFixed(1)}" y="${H - 9}" text-anchor="middle" font-size="9" fill="#b3aca0">${esc(l.b)}</text>`;
  });
  series.forEach(s => {
    let d = '', started = false;
    s.values.forEach((v, i) => {
      if (v == null) { started = false; return; }
      const x = X(i), y = Y(v);
      d += (started ? ' L' : ' M') + x.toFixed(1) + ' ' + y.toFixed(1);
      started = true;
    });
    if (d) g += `<path d="${d.trim()}" fill="none" stroke="${s.color}" stroke-width="2.1" stroke-linejoin="round" stroke-linecap="round" ${s.dash ? 'stroke-dasharray="5 4"' : ''} opacity="${s.dim ? 0.28 : 1}"/>`;
    s.values.forEach((v, i) => {
      if (v == null) return;
      g += `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="3" fill="#fff" stroke="${s.color}" stroke-width="2" opacity="${s.dim ? 0.3 : 1}"><title>${esc(s.name)} · ${esc((labels[i].a || labels[i]))}：${(v * 100).toFixed(1)}%</title></circle>`;
    });
  });
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block">${g}</svg>`;
}

/* ---------- 堆叠条（达标结构） ---------- */
function stack(parts, height) {
  const total = parts.reduce((a, b) => a + b.v, 0) || 1;
  let x = 0, g = '';
  parts.forEach(p => {
    const wpc = (p.v / total) * 100;
    if (wpc > 0) g += `<rect x="${x}%" y="0" width="${wpc}%" height="${height || 8}" fill="${p.c}"><title>${esc(p.n)}：${p.v}</title></rect>`;
    x += wpc;
  });
  return `<svg viewBox="0 0 100 ${height || 8}" preserveAspectRatio="none" width="100%" height="${height || 8}" style="display:block;border-radius:5px;overflow:hidden">${g}</svg>`;
}

export const Charts = { radar, line, stack };

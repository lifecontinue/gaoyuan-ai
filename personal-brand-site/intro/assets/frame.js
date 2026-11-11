document.documentElement.classList.add('has-js');
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const NS = 'http://www.w3.org/2000/svg';

const linked = [...document.querySelectorAll('[data-ref]')];
const refs = (el) => el.dataset.ref.split(' ');
let hovered = null, focused = null;
const paint = () => {
  const keys = (hovered || focused)?.dataset.ref.split(' ') ?? [];
  for (const t of linked) t.classList.toggle('is-lit', refs(t).some((k) => keys.includes(k)));
  for (const svg of document.querySelectorAll('svg')) svg.classList.toggle('has-lit', !!svg.querySelector('.is-lit'));
};
for (const el of linked) {
  el.addEventListener('pointerenter', () => { hovered = el; paint(); });
  el.addEventListener('pointerleave', () => { hovered = null; paint(); });
  el.addEventListener('focus', () => { focused = el; paint(); });
  el.addEventListener('blur', () => { focused = null; paint(); });
}

for (const root of document.querySelectorAll('.ve-steps')) {
  const parts = [...root.querySelectorAll('[data-s]')];
  const caps = [...root.querySelectorAll('.ve-cap li')];
  const range = root.querySelector('input[type=range]');
  const play = root.querySelector('[data-play]');
  const n = caps.length;
  let i = 0, timer = null;
  if (!n) continue;
  if (range) range.max = n - 1;
  const show = (k) => {
    i = Math.max(0, Math.min(n - 1, k));
    for (const el of parts) {
      el.classList.toggle('on', +el.dataset.s <= i + 1);
      el.classList.toggle('now', +el.dataset.s === i + 1);
    }
    caps.forEach((c, j) => { c.hidden = j !== i; });
    if (range) range.value = i;
  };
  const stop = () => { clearInterval(timer); timer = null; if (play) play.textContent = '播放'; };
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (b) { stop(); show(i + +b.dataset.go); return; }
    const j = e.target.closest('[data-jump]');
    if (j) { stop(); show(+j.dataset.jump - 1); }
  });
  root.addEventListener('keydown', (e) => {
    const j = e.target.closest('[data-jump]');
    if (j && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); stop(); show(+j.dataset.jump - 1); }
  });
  range?.addEventListener('input', () => { stop(); show(+range.value); });
  play?.addEventListener('click', () => {
    if (timer) return stop();
    if (i === n - 1) show(0);
    play.textContent = '暂停';
    timer = setInterval(() => (i < n - 1 ? show(i + 1) : stop()), 2800);
  });
  show(n - 1);
}

{
  const hint = () => {
    for (const fr of document.querySelectorAll('.frame')) {
      const has = fr.nextElementSibling?.classList.contains('hint');
      const wide = fr.scrollWidth > fr.clientWidth + 2;
      if (wide && !has) {
        const p = document.createElement('p');
        p.className = 'hint';
        p.textContent = '← 左右滑动查看完整图 →';
        fr.after(p);
      }
      if (!wide && has) fr.nextElementSibling.remove();
    }
  };
  hint();
  addEventListener('resize', hint);
}

{
  const pop = document.getElementById('tt-pop');
  if (pop) {
    let pinned = false;
    for (const el of document.querySelectorAll('[data-tip]')) {
      const id = 'tt-' + el.dataset.tip;
      const prev = el.getAttribute('aria-describedby');
      if (!prev || !prev.split(' ').includes(id)) el.setAttribute('aria-describedby', ((prev || '') + ' ' + id).trim());
      if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
    }
    const show = (el) => {
      const d = document.getElementById('tt-' + el.dataset.tip);
      if (!d) return;
      pop.textContent = d.textContent;
      pop.hidden = false;
      const vw = document.documentElement.clientWidth, vh = window.innerHeight, r = el.getBoundingClientRect();
      pop.style.maxWidth = Math.min(320, vw - 16) + 'px';
      const pw = pop.offsetWidth, ph = pop.offsetHeight;
      const left = Math.min(Math.max(8, r.left + r.width / 2 - pw / 2), vw - pw - 8);
      let top = r.bottom + 8;
      if (top + ph > vh - 8) top = Math.max(8, r.top - ph - 8);
      pop.style.left = left + 'px';
      pop.style.top = top + 'px';
    };
    const hide = () => { pop.hidden = true; pinned = false; };
    document.addEventListener('pointerover', (e) => { if (e.pointerType !== 'mouse' || pinned) return; const el = e.target.closest?.('[data-tip]'); if (el) show(el); });
    document.addEventListener('pointerout', (e) => { if (e.pointerType !== 'mouse' || pinned) return; const el = e.target.closest?.('[data-tip]'); if (el && !el.contains(e.relatedTarget)) hide(); });
    document.addEventListener('focusin', (e) => { const el = e.target.closest?.('[data-tip]'); if (el) show(el); });
    document.addEventListener('focusout', () => { if (!pinned) hide(); });
    document.addEventListener('click', (e) => { const el = e.target.closest?.('[data-tip]'); if (el) { pinned = true; show(el); } else hide(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
    addEventListener('scroll', () => { if (!pop.hidden) hide(); }, { passive: true });
    addEventListener('resize', hide);
  }
}

{
  const links = [...document.querySelectorAll('.toc a')];
  if (links.length) {
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) {
        for (const a of links) a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id);
        try { history.replaceState(null, '', '#' + e.target.id); } catch (_) {}
      }
    }, { rootMargin: '-10% 0px -80% 0px' });
    for (const a of links) { const t = document.querySelector(a.getAttribute('href')); if (t) io.observe(t); }
    links[0].classList.add('on');
  }
}

if (!still) {
  for (const svg of document.querySelectorAll('svg:has([data-flow])')) {
    const layer = svg.querySelector('.ve-dots');
    if (!layer) continue;
    const routes = [...svg.querySelectorAll('[data-flow]')].map((p) => ({ p, len: p.getTotalLength(), every: +p.dataset.every || 1400, next: 0 }));
    let dots = [], visible = false, running = false;
    const tick = (t) => {
      if (!visible) { running = false; for (const d of dots) d.c.remove(); dots = []; return; }
      for (const r of routes) if (t >= r.next) {
        r.next = t + r.every;
        const c = document.createElementNS(NS, 'circle');
        c.setAttribute('r', 4);
        layer.append(c);
        dots.push({ c, r, t0: t });
      }
      dots = dots.filter((d) => {
        const s = (t - d.t0) * 0.15;
        if (s > d.r.len) { d.c.remove(); return false; }
        const pt = d.r.p.getPointAtLength(s);
        d.c.setAttribute('cx', pt.x);
        d.c.setAttribute('cy', pt.y);
        return true;
      });
      requestAnimationFrame(tick);
    };
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !running) { running = true; requestAnimationFrame(tick); }
    }).observe(svg);
  }
  document.documentElement.classList.add('js-motion');
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { io.unobserve(e.target); e.target.classList.add('in'); }
  }, { rootMargin: '0px 0px -5% 0px' });
  for (const el of document.querySelectorAll('main > *')) io.observe(el);
}

{
  const drawer = document.getElementById('drawer');
  const back = document.getElementById('drawer-back');
  const body = document.getElementById('drawer-body');
  const title = document.getElementById('drawer-title');
  if (drawer && back && body && title && !drawer.dataset.bound) {
    drawer.dataset.bound = '1';
    let last = null;
    const close = () => {
      drawer.hidden = true;
      back.hidden = true;
      document.body.classList.remove('drawer-open');
      if (last) last.focus();
    };
    const open = (btn) => {
      const tpl = document.getElementById(btn.dataset.panel);
      if (!tpl) return;
      last = btn;
      title.textContent = btn.dataset.title || '设置';
      body.replaceChildren(tpl.content.cloneNode(true));
      back.hidden = false;
      drawer.hidden = false;
      document.body.classList.add('drawer-open');
      const x = drawer.querySelector('[data-close]');
      if (x) x.focus();
    };
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-panel]');
      if (btn) { open(btn); return; }
      if (e.target.closest('[data-close]') || e.target === back) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !drawer.hidden) close();
    });
  }
}

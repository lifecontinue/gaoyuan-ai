import { SEED } from "./seed.js";

const KEY = "gaoyuan-workspace-os-v1";
const TYPES = [
  ["prototype", "原型"],
  ["report", "汇报"],
  ["doc", "需求"],
  ["tool", "工具"],
  ["note", "笔记"],
  ["product", "产品"],
  ["writing", "写作"]
];
const COLORS = ["#1f4b99", "#0f6e56", "#9a6700", "#6e56cf", "#5c6578", "#8a5a44"];
const ICONS = ["layers", "clipboard", "flag", "users", "wrench", "globe", "pen", "box"];
const TYPE_LABEL = Object.fromEntries(TYPES);

const view = document.getElementById("view");
const modal = document.getElementById("modal");
const toastEl = document.getElementById("toast");
const searchEl = document.getElementById("q");
const fileEl = document.getElementById("import-file");

const state = {
  query: "",
  filters: { projectId: "", tag: "", type: "", status: "active", sort: "name" }
};
let db = load();
let routeKey = "";
let toastTimer = 0;

const svg = {
  layers: '<path d="M12 3 3 8l9 5 9-5-9-5Zm-9 8 9 5 9-5M3 16l9 5 9-5"/>',
  clipboard: '<rect x="6" y="4" width="12" height="16" rx="2"/><path d="M9 4.5h6v2H9z"/>',
  flag: '<path d="M6 21V4m0 0h11l-2 4 2 4H6"/>',
  users: '<path d="M16 20v-1a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v1M10 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm10 8v-1a3 3 0 0 0-2.2-2.9M16 6.1a3 3 0 0 1 0 5.8"/>',
  wrench: '<path d="M14.5 6.5a4 4 0 0 0-5.6 5.6L4 17l3 3 4.9-4.9a4 4 0 0 0 5.6-5.6L15 12l-3-3 2.5-2.5Z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.8 2.5 15.2 0 18M12 3c-2.5 2.8-2.5 15.2 0 18"/>',
  pen: '<path d="M4 20h4l10-10-4-4L4 16v4Zm9-13 4 4"/>',
  box: '<path d="M3 8 12 3l9 5-9 5-9-5Zm0 0v8l9 5 9-5V8M12 13v8"/>',
  star: '<path d="m12 3 2.6 5.5L20.5 9l-4.2 4.1 1 5.9L12 16.2 6.7 19l1-5.9L3.5 9l5.9-.5L12 3Z"/>'
};

function icon(name, fill) {
  const body = svg[name] || svg.box;
  const attr = fill ? 'fill="currentColor" stroke="none"' : 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"';
  return `<svg viewBox="0 0 24 24" aria-hidden="true" ${attr}>${body}</svg>`;
}

function load() {
  const seed = structuredClone(SEED);
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seed;
    const saved = JSON.parse(raw);
    const next = normalize(saved);
    if (!next) return seed;
    return mergeSeed(next);
  } catch {
    return seed;
  }
}

function mergeSeed(saved) {
  const next = structuredClone(saved);
  for (const key of ["projects", "categories", "pages", "relations"]) {
    const have = new Set(next[key].map((item) => item.id));
    for (const item of SEED[key]) {
      if (!have.has(item.id)) next[key].push(structuredClone(item));
    }
  }
  return next;
}

function save() {
  localStorage.setItem(KEY, JSON.stringify(db));
}

function uid(prefix) {
  const n = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
  return `${prefix}_${n}`;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

function isSafeUrl(url) {
  if (typeof url !== "string") return false;
  const value = url.trim();
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function absoluteUrl(url) {
  if (url.startsWith("/")) return `${location.origin}${url}`;
  return url;
}

function fmt(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const monthDay = `${date.getMonth() + 1}月${date.getDate()}日`;
  return date.getFullYear() === new Date().getFullYear() ? monthDay : `${date.getFullYear()}年${monthDay}`;
}

function fmtWhen(iso) {
  if (!iso) return "还没打开过";
  const date = new Date(iso);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${fmt(iso)} ${hh}:${mm}`;
}

function toast(text) {
  toastEl.hidden = false;
  toastEl.textContent = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2200);
}

function byId(list, id) {
  return list.find((item) => item.id === id) || null;
}

function projectOf(id) { return byId(db.projects, id); }
function categoryOf(id) { return byId(db.categories, id); }
function pageOf(id) { return byId(db.pages, id); }

function activePages(list = db.pages) {
  return list.filter((page) => page.status !== "archived" && projectOf(page.projectId)?.status !== "archived");
}

function sortedProjects() {
  return db.projects.filter((project) => project.status !== "archived").sort((a, b) => a.sortOrder - b.sortOrder);
}

function pagesIn(projectId) {
  return activePages().filter((page) => page.projectId === projectId).sort(comparePages);
}

function comparePages(a, b) {
  return a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "zh");
}

function lastTouch(projectId) {
  const times = db.pages.filter((page) => page.projectId === projectId).map((page) => page.updatedAt || page.createdAt || "");
  return times.sort().at(-1) || "";
}

function allTags() {
  return [...new Set(db.pages.flatMap((page) => page.tags || []))].sort((a, b) => a.localeCompare(b, "zh"));
}

function route() {
  const path = (location.hash || "#/").slice(1).split("?")[0];
  const segs = path.split("/").filter(Boolean);
  if (segs.length === 0) return { name: "overview" };
  if (segs[0] === "projects" && !segs[1]) return { name: "projects" };
  if (segs[0] === "projects") return { name: "project", id: decodeURIComponent(segs[1]) };
  if (segs[0] === "pages") return { name: "pages" };
  if (segs[0] === "favorites") return { name: "favorites" };
  if (segs[0] === "recent") return { name: "recent" };
  if (segs[0] === "page" && segs[1]) return { name: "page", id: decodeURIComponent(segs[1]) };
  return { name: "overview" };
}

function navKey(name) {
  if (name === "project") return "projects";
  if (name === "page") return "pages";
  return name;
}

function setNav() {
  const key = navKey(route().name);
  for (const link of document.querySelectorAll(".side nav a")) {
    const on = link.dataset.nav === key;
    if (on) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}

function pageBlob(page) {
  const project = projectOf(page.projectId);
  const category = categoryOf(page.categoryId);
  return [page.title, page.url, page.description, ...(page.tags || []), project?.name, category?.name, TYPE_LABEL[page.type] || ""]
    .join("\n").toLowerCase();
}

function searchPages(query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return db.pages.filter((page) => pageBlob(page).includes(needle)).sort(comparePages);
}

function filteredPages() {
  const { projectId, tag, type, status, sort } = state.filters;
  const needle = state.query.trim().toLowerCase();
  let list = db.pages.filter((page) => {
    if (projectId && page.projectId !== projectId) return false;
    if (tag && !(page.tags || []).includes(tag)) return false;
    if (type && page.type !== type) return false;
    if (status === "active" && page.status === "archived") return false;
    if (status === "archived" && page.status !== "archived") return false;
    if (needle && !pageBlob(page).includes(needle)) return false;
    return true;
  });
  if (sort === "created") list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  else if (sort === "visited") list.sort((a, b) => (b.lastVisitedAt || "").localeCompare(a.lastVisitedAt || ""));
  else list.sort((a, b) => a.title.localeCompare(b.title, "zh"));
  return list;
}

function relationsOf(pageId) {
  return db.relations.filter((rel) => rel.sourcePageId === pageId || rel.targetPageId === pageId);
}

function otherId(rel, pageId) {
  return rel.sourcePageId === pageId ? rel.targetPageId : rel.sourcePageId;
}

function relationLabel(rel, pageId) {
  const forward = rel.sourcePageId === pageId;
  if (rel.relationType === "workflow_next") return forward ? "下一步" : "上一步";
  if (rel.relationType === "depends_on") return forward ? "依赖" : "被依赖";
  if (rel.relationType === "reference") return forward ? "引用" : "被引用";
  return "相关";
}

function openHref(page) {
  return isSafeUrl(page.url) ? esc(page.url) : "";
}

function starBtn(page) {
  const on = page.isFavorite ? "true" : "false";
  return `<button type="button" class="icon-btn" data-act="fav" data-id="${esc(page.id)}" aria-pressed="${on}" aria-label="${page.isFavorite ? "取消收藏" : "收藏"}">${icon("star", page.isFavorite)}</button>`;
}

function tile(page) {
  const project = projectOf(page.projectId);
  const href = openHref(page);
  const archived = page.status === "archived" ? " archived" : "";
  const main = href
    ? `<a class="tile-main" href="${href}" target="_blank" rel="noopener noreferrer" data-act="visit" data-id="${esc(page.id)}">`
    : `<div class="tile-main">`;
  return `<article class="tile${archived}">${main}<span class="kicker">${esc(project?.name || "未分组")}${page.status === "archived" ? " · 已归档" : ""}</span><strong>${esc(page.title)}</strong><span class="url">${esc(page.url)}</span>${href ? "</a>" : "</div>"}<div class="tile-actions">${starBtn(page)}<a class="icon-btn" href="#/page/${esc(page.id)}">详情</a></div></article>`;
}

function row(page) {
  const project = projectOf(page.projectId);
  const href = openHref(page);
  const open = href ? `<a href="${href}" target="_blank" rel="noopener noreferrer" data-act="visit" data-id="${esc(page.id)}">打开</a>` : "";
  return `<article class="row${page.status === "archived" ? " archived" : ""}"><div><a class="title" href="#/page/${esc(page.id)}">${esc(page.title)}</a><div class="subline">${esc(project?.name || "未分组")} · ${esc(TYPE_LABEL[page.type] || "页面")}${page.status === "archived" ? " · 已归档" : ""}<br><span class="url">${esc(page.url)}</span></div></div><div class="row-actions">${starBtn(page)}${open}</div></article>`;
}

function projectCard(project) {
  const count = pagesIn(project.id).length;
  const when = fmt(lastTouch(project.id));
  return `<a class="project-card" href="#/projects/${esc(project.id)}"><div class="project-top"><span class="mark" style="background:${esc(project.color)}1a;color:${esc(project.color)}">${icon(project.icon)}</span><h3>${esc(project.name)}</h3></div><p>${esc(project.description)}</p><span class="meta">${count} 页${when ? ` · ${when}` : ""}</span></a>`;
}

function head(title, lede, actions) {
  return `<header class="page-head"><div><h1>${esc(title)}</h1>${lede ? `<p class="lede">${esc(lede)}</p>` : ""}</div><div class="actions">${actions || ""}</div></header>`;
}

function renderOverview() {
  const favorites = activePages().filter((page) => page.isFavorite);
  const recent = activePages().filter((page) => page.lastVisitedAt).sort((a, b) => b.lastVisitedAt.localeCompare(a.lastVisitedAt)).slice(0, 6);
  const added = activePages().slice().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "") || b.sortOrder - a.sortOrder).slice(0, 6);
  const favBlock = favorites.length
    ? `<section class="section"><h2>收藏</h2><div class="grid">${favorites.map(tile).join("")}</div></section>`
    : `<section class="section"><h2>收藏</h2><p class="empty">点星标，常用页面会留在这里。</p></section>`;
  return `${head("工作页面", "从这里打开散落的工作页。", `<button type="button" class="btn" data-act="new-page">新页面</button>`)}
    ${favBlock}
    <section class="section"><h2>项目</h2><div class="grid">${sortedProjects().map(projectCard).join("")}</div></section>
    <div class="split">
      <section class="section"><h2>最近打开</h2>${recent.length ? `<div class="stack">${recent.map(row).join("")}</div>` : `<p class="empty">打开过的页面会出现在这里。</p>`}</section>
      <section class="section"><h2>最近加入</h2><div class="stack">${added.map(row).join("")}</div></section>
    </div>`;
}

function renderProjects() {
  return `${head("项目", "按手头的工作分开。", `<button type="button" class="btn" data-act="new-project">新项目</button>`)}<div class="grid">${sortedProjects().map(projectCard).join("")}</div>`;
}

function renderProject(id) {
  const project = projectOf(id);
  if (!project || project.status === "archived") {
    return `${head("找不到这个项目", "")}<p><a class="primary-link" href="#/projects">回项目列表</a></p>`;
  }
  const pages = pagesIn(id);
  const cats = db.categories.filter((cat) => cat.projectId === id).sort((a, b) => a.sortOrder - b.sortOrder);
  const used = new Set(pages.map((page) => page.categoryId).filter(Boolean));
  const blocks = cats.filter((cat) => used.has(cat.id)).map((cat) => {
    const items = pages.filter((page) => page.categoryId === cat.id);
    return `<section class="section"><h2>${esc(cat.name)}</h2><div class="grid">${items.map(tile).join("")}</div></section>`;
  });
  const loose = pages.filter((page) => !page.categoryId);
  if (loose.length) blocks.push(`<section class="section"><h2>${cats.length ? "未分类" : "页面"}</h2><div class="grid">${loose.map(tile).join("")}</div></section>`);
  const related = [];
  const seen = new Set();
  for (const page of pages) {
    for (const rel of relationsOf(page.id)) {
      const other = pageOf(otherId(rel, page.id));
      if (!other || other.projectId === id || seen.has(other.id)) continue;
      seen.add(other.id);
      related.push(other);
    }
  }
  const relatedBlock = related.length
    ? `<section class="section"><h2>相关页面</h2><div class="stack">${related.map(row).join("")}</div></section>`
    : "";
  return `<a class="back" href="#/projects">全部项目</a>${head(project.name, project.description, `<button type="button" class="btn" data-act="new-page" data-project="${esc(project.id)}">新页面</button><button type="button" class="btn-ghost" data-act="edit-project" data-id="${esc(project.id)}">编辑</button><button type="button" class="btn-ghost" data-act="archive-project" data-id="${esc(project.id)}">归档</button>`)}
    ${blocks.join("") || `<p class="empty">这个项目还没有页面。</p>`}${relatedBlock}`;
}

function select(name, label, value, options) {
  const opts = options.map(([val, text]) => `<option value="${esc(val)}"${val === value ? " selected" : ""}>${esc(text)}</option>`).join("");
  return `<select data-filter="${name}" aria-label="${esc(label)}">${opts}</select>`;
}

function renderPages() {
  const projects = db.projects.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const filters = `<div class="filters">
    ${select("projectId", "项目", state.filters.projectId, [["", "全部项目"], ...projects.map((project) => [project.id, project.name])])}
    ${select("tag", "标签", state.filters.tag, [["", "全部标签"], ...allTags().map((tag) => [tag, tag])])}
    ${select("type", "类型", state.filters.type, [["", "全部类型"], ...TYPES])}
    ${select("status", "状态", state.filters.status, [["active", "使用中"], ["archived", "已归档"], ["all", "全部状态"]])}
    ${select("sort", "排序", state.filters.sort, [["name", "按名称"], ["created", "按加入时间"], ["visited", "按最近打开"]])}
  </div>`;
  const list = filteredPages();
  return `${head("全部页面", `${list.length} 页`, `<button type="button" class="btn" data-act="new-page">新页面</button>`)}${filters}${list.length ? `<div class="stack">${list.map(row).join("")}</div>` : `<p class="empty">没有符合的页面。</p>`}`;
}

function renderFavorites() {
  const list = activePages().filter((page) => page.isFavorite);
  return `${head("收藏", "常用的几页。")}${list.length ? `<div class="grid">${list.map(tile).join("")}</div>` : `<p class="empty">还没有收藏。</p>`}`;
}

function renderRecent() {
  const list = activePages().filter((page) => page.lastVisitedAt).sort((a, b) => b.lastVisitedAt.localeCompare(a.lastVisitedAt));
  return `${head("最近打开", "这台浏览器里打开过的页面。")}${list.length ? `<div class="stack">${list.map(row).join("")}</div>` : `<p class="empty">还没有打开记录。</p>`}`;
}

function renderSearch(list) {
  return `${head("搜索结果", state.query.trim())}${list.length ? `<div class="stack">${list.map(row).join("")}</div>` : `<p class="empty">没有找到。</p>`}`;
}

function renderDetail(id) {
  const page = pageOf(id);
  if (!page) return `${head("找不到这一页", "")}<p><a class="primary-link" href="#/pages">回全部页面</a></p>`;
  const project = projectOf(page.projectId);
  const category = categoryOf(page.categoryId);
  const href = openHref(page);
  const tags = (page.tags || []).map((tag) => `<a href="#/pages" data-act="use-tag" data-tag="${esc(tag)}">${esc(tag)}</a>`).join("");
  const rels = relationsOf(page.id).map((rel) => {
    const other = pageOf(otherId(rel, page.id));
    if (!other) return "";
    const note = rel.description ? ` · ${esc(rel.description)}` : "";
    return `<li><a href="#/page/${esc(other.id)}"><span class="rel-kind">${relationLabel(rel, page.id)}</span>${esc(other.title)}</a>${note}</li>`;
  }).join("");
  const open = href ? `<a class="btn" href="${href}" target="_blank" rel="noopener noreferrer" data-act="visit" data-id="${esc(page.id)}">新标签打开</a>` : "";
  const archiveLabel = page.status === "archived" ? "恢复" : "归档";
  const archiveAct = page.status === "archived" ? "restore-page" : "archive-page";
  return `<a class="back" href="#/projects/${esc(page.projectId)}">${esc(project?.name || "项目")}</a>
    <article class="detail">
      ${head(page.title, "")}
      <p class="url">${esc(page.url)}</p>
      ${page.description ? `<p>${esc(page.description)}</p>` : ""}
      <p class="meta">${esc(project?.name || "未分组")}${category ? ` / ${esc(category.name)}` : ""} · ${esc(TYPE_LABEL[page.type] || "页面")} · ${page.status === "archived" ? "已归档" : "使用中"} · 上次打开 ${fmtWhen(page.lastVisitedAt)}</p>
      ${tags ? `<div class="tags">${tags}</div>` : ""}
      <div class="actions">${open}<button type="button" class="btn-ghost" data-act="copy" data-id="${esc(page.id)}">复制链接</button><button type="button" class="btn-ghost" data-act="edit-page" data-id="${esc(page.id)}">编辑</button><button type="button" class="btn-ghost" data-act="fav" data-id="${esc(page.id)}">${page.isFavorite ? "取消收藏" : "收藏"}</button><button type="button" class="btn-ghost" data-act="${archiveAct}" data-id="${esc(page.id)}">${archiveLabel}</button></div>
      ${rels ? `<section class="section"><h2>相关页面</h2><ul class="related">${rels}</ul></section>` : ""}
    </article>`;
}

function render() {
  const nextKey = `${location.hash}|${state.query}|${JSON.stringify(state.filters)}`;
  const keepScroll = nextKey === routeKey;
  const y = window.scrollY;
  setNav();
  const current = route();
  const query = state.query.trim();
  let html = "";
  if (query && current.name !== "pages") html = renderSearch(searchPages(query));
  else if (current.name === "overview") html = renderOverview();
  else if (current.name === "projects") html = renderProjects();
  else if (current.name === "project") html = renderProject(current.id);
  else if (current.name === "pages") html = renderPages();
  else if (current.name === "favorites") html = renderFavorites();
  else if (current.name === "recent") html = renderRecent();
  else if (current.name === "page") html = renderDetail(current.id);
  view.innerHTML = html;
  routeKey = nextKey;
  window.scrollTo(0, keepScroll ? y : 0);
}

function blankPage(projectId = "") {
  const order = db.pages.reduce((max, page) => Math.max(max, page.sortOrder || 0), 0) + 10;
  return {
    id: uid("p"), title: "", url: "", description: "", projectId, categoryId: "", favicon: "",
    type: "tool", tags: [], status: "active", isFavorite: false,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastVisitedAt: null, sortOrder: order
  };
}

function categoryOptions(projectId, selected) {
  const cats = db.categories.filter((cat) => cat.projectId === projectId).sort((a, b) => a.sortOrder - b.sortOrder);
  const opts = [`<option value="">不分类</option>`]
    .concat(cats.map((cat) => `<option value="${esc(cat.id)}"${cat.id === selected ? " selected" : ""}>${esc(cat.name)}</option>`))
    .concat(`<option value="__new">新建分类…</option>`);
  return opts.join("");
}

function openPageForm(page) {
  const projects = db.projects.filter((project) => project.status !== "archived");
  const projectOptions = projects.map((project) => `<option value="${esc(project.id)}"${project.id === page.projectId ? " selected" : ""}>${esc(project.name)}</option>`).join("");
  const typeOptions = TYPES.map(([value, label]) => `<option value="${value}"${page.type === value ? " selected" : ""}>${label}</option>`).join("");
  modal.innerHTML = `<form class="form" id="page-form" data-id="${esc(page.id)}">
    <h2>${pageOf(page.id) ? "编辑页面" : "新页面"}</h2>
    <label>名称<input name="title" required maxlength="120" value="${esc(page.title)}"></label>
    <label>地址<input name="url" required maxlength="500" value="${esc(page.url)}" placeholder="/work/… 或 https://"></label>
    <label>说明<textarea name="description" maxlength="500" rows="3">${esc(page.description)}</textarea></label>
    <label>项目<select name="projectId" id="field-project">${projectOptions}</select></label>
    <label>分类<select name="categoryId" id="field-category">${categoryOptions(page.projectId, page.categoryId)}</select></label>
    <label id="new-cat-wrap" hidden>新分类名称<input name="newCategory" maxlength="40"></label>
    <label>类型<select name="type">${typeOptions}</select></label>
    <label>标签<input name="tags" maxlength="200" value="${esc((page.tags || []).join("，"))}" placeholder="用逗号分开"></label>
    <label class="choices"><input type="checkbox" name="favorite"${page.isFavorite ? " checked" : ""}>收藏</label>
    <p class="form-error" data-error></p>
    <div class="form-actions"><button type="button" class="btn-ghost" data-act="close">取消</button><button class="btn" type="submit">保存</button></div>
  </form>`;
  if (!modal.open) modal.showModal();
}

function openProjectForm(project) {
  const current = project || {
    id: uid("prj"), name: "", description: "", icon: "box", color: COLORS[0], sortOrder: 1000, status: "active"
  };
  const colors = COLORS.map((color) => `<label class="swatches"><input type="radio" name="color" value="${color}"${current.color === color ? " checked" : ""}><span style="background:${color}"></span></label>`).join("");
  const icons = ICONS.map((name) => `<label class="choices">${icon(name)}<input type="radio" name="icon" value="${name}"${current.icon === name ? " checked" : ""}></label>`).join("");
  modal.innerHTML = `<form class="form" id="project-form" data-id="${esc(current.id)}">
    <h2>${projectOf(current.id) ? "编辑项目" : "新项目"}</h2>
    <label>名称<input name="name" required maxlength="40" value="${esc(current.name)}"></label>
    <label>说明<textarea name="description" maxlength="200" rows="3">${esc(current.description)}</textarea></label>
    <div class="choices">${colors}</div>
    <div class="choices">${icons}</div>
    <p class="form-error" data-error></p>
    <div class="form-actions"><button type="button" class="btn-ghost" data-act="close">取消</button><button class="btn" type="submit">保存</button></div>
  </form>`;
  if (!modal.open) modal.showModal();
}

function formError(form, text) {
  form.querySelector("[data-error]").textContent = text;
}

function savePage(form) {
  const data = new FormData(form);
  const title = String(data.get("title") || "").trim();
  const url = String(data.get("url") || "").trim();
  const projectId = String(data.get("projectId") || "");
  if (!title) return formError(form, "写个名称。");
  if (!isSafeUrl(url)) return formError(form, "只接受站内路径，或 http / https 链接。");
  if (!projectOf(projectId)) return formError(form, "先选一个项目。");
  let categoryId = String(data.get("categoryId") || "");
  if (categoryId === "__new") {
    const name = String(data.get("newCategory") || "").trim();
    if (!name) return formError(form, "新分类要有名称。");
    let category = db.categories.find((item) => item.projectId === projectId && item.name === name);
    if (!category) {
      category = { id: uid("c"), projectId, name, sortOrder: Date.now() % 100000 };
      db.categories.push(category);
    }
    categoryId = category.id;
  } else if (categoryId && categoryOf(categoryId)?.projectId !== projectId) {
    categoryId = "";
  }
  const tags = String(data.get("tags") || "").split(/[,，]/).map((tag) => tag.trim()).filter(Boolean).slice(0, 12);
  const type = TYPES.some(([value]) => value === data.get("type")) ? String(data.get("type")) : "tool";
  const existing = pageOf(form.dataset.id);
  const next = existing ? { ...existing } : blankPage(projectId);
  next.id = form.dataset.id || next.id;
  next.title = title;
  next.url = url;
  next.description = String(data.get("description") || "").trim();
  next.projectId = projectId;
  next.categoryId = categoryId;
  next.type = type;
  next.tags = tags;
  next.isFavorite = data.get("favorite") === "on";
  next.updatedAt = new Date().toISOString();
  if (existing) {
    const index = db.pages.findIndex((page) => page.id === existing.id);
    db.pages[index] = next;
  } else {
    next.createdAt = next.updatedAt;
    db.pages.push(next);
  }
  save();
  modal.close();
  render();
  toast("已保存");
}

function saveProject(form) {
  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  if (!name) return formError(form, "写个名称。");
  const color = COLORS.includes(data.get("color")) ? String(data.get("color")) : COLORS[0];
  const iconName = ICONS.includes(data.get("icon")) ? String(data.get("icon")) : "box";
  const existing = projectOf(form.dataset.id);
  if (existing) {
    existing.name = name;
    existing.description = String(data.get("description") || "").trim();
    existing.color = color;
    existing.icon = iconName;
  } else {
    const order = db.projects.reduce((max, project) => Math.max(max, project.sortOrder || 0), 0) + 10;
    db.projects.push({
      id: form.dataset.id, name, description: String(data.get("description") || "").trim(),
      icon: iconName, color, sortOrder: order, status: "active"
    });
  }
  save();
  modal.close();
  render();
  toast("已保存");
}

function visit(id) {
  const page = pageOf(id);
  if (!page) return;
  page.lastVisitedAt = new Date().toISOString();
  save();
}

function toggleFav(id) {
  const page = pageOf(id);
  if (!page) return;
  page.isFavorite = !page.isFavorite;
  save();
  render();
}

function archivePage(id, archived) {
  const page = pageOf(id);
  if (!page) return;
  page.status = archived ? "archived" : "active";
  page.updatedAt = new Date().toISOString();
  save();
  render();
  toast(archived ? "已归档" : "已恢复");
}

function archiveProject(id) {
  const project = projectOf(id);
  if (!project) return;
  if (!window.confirm(`归档「${project.name}」？项目下的页面还在，只是总览里先不显示这个项目。`)) return;
  project.status = "archived";
  save();
  location.hash = "#/projects";
  toast("已归档");
}

function textField(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalize(raw) {
  if (!raw || !Array.isArray(raw.projects) || !Array.isArray(raw.categories) || !Array.isArray(raw.pages) || !Array.isArray(raw.relations)) return null;
  if (raw.pages.length > 500 || raw.projects.length > 100) return null;
  const projects = [];
  for (const item of raw.projects) {
    const id = textField(item?.id, 80);
    const name = textField(item?.name, 40);
    if (!id || !name || projects.some((project) => project.id === id)) return null;
    projects.push({
      id, name, description: textField(item.description, 200),
      icon: ICONS.includes(item.icon) ? item.icon : "box",
      color: COLORS.includes(item.color) ? item.color : COLORS[0],
      sortOrder: Number(item.sortOrder) || 0,
      status: item.status === "archived" ? "archived" : "active"
    });
  }
  const projectIds = new Set(projects.map((project) => project.id));
  const categories = [];
  for (const item of raw.categories) {
    const id = textField(item?.id, 80);
    const name = textField(item?.name, 40);
    if (!id || !name || !projectIds.has(item.projectId) || categories.some((cat) => cat.id === id)) return null;
    categories.push({ id, projectId: item.projectId, name, sortOrder: Number(item.sortOrder) || 0 });
  }
  const categoryIds = new Set(categories.map((cat) => cat.id));
  const pages = [];
  for (const item of raw.pages) {
    const id = textField(item?.id, 80);
    const title = textField(item?.title, 120);
    const url = textField(item?.url, 500);
    if (!id || !title || !isSafeUrl(url) || !projectIds.has(item.projectId) || pages.some((page) => page.id === id)) return null;
    const categoryId = categoryIds.has(item.categoryId) ? item.categoryId : "";
    const tags = Array.isArray(item.tags) ? item.tags.map((tag) => textField(tag, 24)).filter(Boolean).slice(0, 12) : [];
    pages.push({
      id, title, url, description: textField(item.description, 500), projectId: item.projectId, categoryId, favicon: "",
      type: TYPES.some(([value]) => value === item.type) ? item.type : "tool",
      tags, status: item.status === "archived" ? "archived" : "active", isFavorite: item.isFavorite === true,
      createdAt: textField(item.createdAt, 40) || new Date().toISOString(),
      updatedAt: textField(item.updatedAt, 40) || new Date().toISOString(),
      lastVisitedAt: textField(item.lastVisitedAt, 40) || null,
      sortOrder: Number(item.sortOrder) || 0
    });
  }
  const pageIds = new Set(pages.map((page) => page.id));
  const relations = [];
  const allowed = new Set(["related", "depends_on", "workflow_next", "reference"]);
  for (const item of raw.relations || []) {
    const id = textField(item?.id, 80);
    if (!id || relations.some((rel) => rel.id === id)) continue;
    if (!pageIds.has(item.sourcePageId) || !pageIds.has(item.targetPageId)) continue;
    if (!allowed.has(item.relationType)) continue;
    relations.push({
      id, sourcePageId: item.sourcePageId, targetPageId: item.targetPageId,
      relationType: item.relationType, description: textField(item.description, 120)
    });
  }
  return { version: 1, projects, categories, pages, relations };
}

function exportDb() {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `workspace-os-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

document.body.addEventListener("click", (event) => {
  const target = event.target.closest("[data-act]");
  if (!target) return;
  const act = target.dataset.act;
  const id = target.dataset.id;
  if (act === "visit") { visit(id); setTimeout(render, 0); }
  else if (act === "fav") toggleFav(id);
  else if (act === "new-page") openPageForm(blankPage(target.dataset.project || sortedProjects()[0]?.id || ""));
  else if (act === "edit-page") openPageForm(pageOf(id));
  else if (act === "new-project") openProjectForm(null);
  else if (act === "edit-project") openProjectForm(projectOf(id));
  else if (act === "archive-page") { if (window.confirm("归档后，默认列表里不再显示。可以在全部页面里筛「已归档」恢复。")) archivePage(id, true); }
  else if (act === "restore-page") archivePage(id, false);
  else if (act === "archive-project") archiveProject(id);
  else if (act === "copy") {
    const page = pageOf(id);
    if (!page || !isSafeUrl(page.url)) return;
    navigator.clipboard.writeText(absoluteUrl(page.url)).then(() => toast("已复制")).catch(() => toast("没复制成功"));
  } else if (act === "use-tag") {
    state.filters.tag = target.dataset.tag || "";
    state.filters.status = "all";
  } else if (act === "close") modal.close();
  else if (act === "export") exportDb();
  else if (act === "import") fileEl.click();
});

document.body.addEventListener("change", (event) => {
  const filter = event.target.dataset?.filter;
  if (filter && filter in state.filters) {
    state.filters[filter] = event.target.value;
    render();
    return;
  }
  if (event.target.id === "field-project") {
    const selectEl = document.getElementById("field-category");
    selectEl.innerHTML = categoryOptions(event.target.value, "");
    document.getElementById("new-cat-wrap").hidden = true;
  }
  if (event.target.id === "field-category") {
    document.getElementById("new-cat-wrap").hidden = event.target.value !== "__new";
  }
});

document.body.addEventListener("submit", (event) => {
  if (event.target.id === "page-form") { event.preventDefault(); savePage(event.target); }
  if (event.target.id === "project-form") { event.preventDefault(); saveProject(event.target); }
});

searchEl.addEventListener("input", () => {
  state.query = searchEl.value;
  render();
});

fileEl.addEventListener("change", async () => {
  const file = fileEl.files && fileEl.files[0];
  fileEl.value = "";
  if (!file) return;
  let raw;
  try { raw = JSON.parse(await file.text()); }
  catch { toast("这不是能用的备份"); return; }
  const next = normalize(raw);
  if (!next) { toast("这份备份不能用"); return; }
  db = mergeSeed(next);
  save();
  render();
  toast("已导入");
});

modal.addEventListener("click", (event) => {
  if (event.target === modal) modal.close();
});

window.addEventListener("hashchange", render);

if (!location.hash) history.replaceState(null, "", "#/");
render();

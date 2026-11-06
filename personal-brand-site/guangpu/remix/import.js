/**
 * 光谱五步创建原型 · 评分导入模块（D07 / D08）
 * 上传/加载演示数据 → 逐行校验 → 预览（不写正式结果）→ 执行（重新校验）
 */
(function () {
  'use strict';
  const G = window.GP;

  const IMPORT_TEMPLATE = [
    // 逻辑输入：员工唯一标识 + 图谱唯一标识 + 末级标签唯一标识 + 分数
    { userId: 'u001', graphId: 'A', tagId: 't1-1-1', score: 100, mode: 'override' },
    { userId: 'u001', graphId: 'A', tagId: 't1-1-1', score: 70, mode: 'override' },   // 同文件重复对象
    { userId: 'u002', graphId: 'A', tagId: 't1-1-2', score: 100, mode: 'override' },
    { userId: 'u001', graphId: 'A', tagId: 't2-1', score: 100, mode: 'override' },     // 后测真实 0
    { userId: 'u003', graphId: 'A', tagId: 't1-1-1', score: 100, mode: 'override' },   // 无后测
    { userId: 'u004', graphId: 'A', tagId: 't1-2', score: 95, mode: 'override' }, 
    { userId: 'u999', graphId: 'A', tagId: 't1-1-1', score: 80, mode: 'override' },    // 无此人员
    { userId: 'u006', graphId: 'A', tagId: 't1-1-1', score: 80, mode: 'override' },    // 人员未关联
    { userId: 'u001', graphId: 'A', tagId: 't1', score: 80, mode: 'override' },        // 非末级
    { userId: 'u001', graphId: 'B', tagId: 't1-1-1', score: 80, mode: 'override' },    // 标签不属该图
    { userId: 'u002', graphId: 'A', tagId: 't2-1', score: 120, mode: 'override' },     // 分数越界
    { userId: 'u002', graphId: 'A', tagId: 't1-2', score: 88, mode: 'override' },
  ];

  // 本地文件适配：Excel 模板为主，兼容 CSV；不定义生产上传协议。
  function parseCsv(text, ctx) {
    text=String(text).replace(/^\uFEFF/,'');
    const records=[]; let row=[],cell='',quoted=false,closed=false,line=1,start=1;
    const push=()=>{row.push(cell);if(row.some(v=>v.trim()))records.push({cells:row,line:start});row=[];cell='';closed=false;};
    for(let i=0;i<text.length;i++){
      const ch=text[i];
      if(quoted){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else{cell+=ch;if(ch==='\n')line++;}continue;}
      if(ch==='"'){if(cell||closed)throw new Error(`第 ${line} 行引号格式不正确`);quoted=true;}
      else if(ch===','){row.push(cell);cell='';closed=false;}
      else if(ch==='\r'||ch==='\n'){if(ch==='\r'&&text[i+1]==='\n')i++;push();line++;start=line;}
      else{if(closed&&!/\s/.test(ch))throw new Error(`第 ${line} 行引号后存在多余内容`);if(!closed)cell+=ch;}
    }
    if(quoted)throw new Error('文件中有未闭合的引号，请检查 CSV 格式');
    push();return parseTable(records, ctx);
  }

  /** Excel：找到含「员工工号」表头的工作表，行号按 Excel 实际行号记录。 */
  function parseSheets(sheets, ctx = {}) {
    // 模板「填写说明」里记录了图谱ID，防止把别的图谱的表传进来。
    const note = (sheets || []).find(x => x.name === '填写说明');
    const gid = note && (note.cells.find(r => String(r[0]).trim() === '图谱ID') || [])[1];
    if (ctx.graphId && gid && String(gid).trim() !== ctx.graphId) throw new Error('这不是本图谱的模板，请在本页面重新下载后填写。');
    for (const sheet of sheets || []) {
      if (sheet.name === '填写说明') continue;
      const h = sheet.cells.slice(0, 10).findIndex(r => r.some(v => ['工号', '员工工号'].includes(String(v).trim())));
      if (h < 0) continue;
      const width = sheet.cells[h].reduce((n, v, i) => (String(v).trim() ? i + 1 : n), 0);
      const records = sheet.cells.slice(h).map((cells, i) => {
        const last = cells.reduce((n, v, j) => (String(v).trim() ? j + 1 : n), 0);
        const row = cells.slice(0, Math.max(width, last)).map(v => String(v));
        while (row.length < width) row.push('');
        return { cells: row, line: h + i + 1 };
      }).filter((r, i) => i === 0 || r.cells.some(v => v.trim()));
      return parseTable(records, ctx);
    }
    throw new Error('表格里找不到「工号」表头，请使用本页下载的模板填写。');
  }

  /** 图谱内末级标签及其上级路径（一级、二级、三级名称）。 */
  function leafPaths(graphId) {
    const g = window.GP_UI.state.graphs[graphId], out = [];
    (function walk(nodes, path) {
      (nodes || []).forEach(n => (n.children && n.children.length ? walk(n.children, [...path, n.nm]) : out.push({ id: n.id, path: [...path, n.nm] })));
    })(g ? g.tagTree : [], []);
    return out;
  }
  function tagPath(graphId, tagId) {
    const hit = leafPaths(graphId).find(t => t.id === tagId);
    return hit ? [hit.path[0] || '', hit.path[1] || '', hit.path[2] || ''] : ['', '', ''];
  }
  function findLeaf(graphId, names) {
    const want = names.filter(Boolean);
    const hit = leafPaths(graphId).find(t => t.path.length === want.length && t.path.every((v, i) => v === want[i]));
    return hit ? hit.id : '';
  }

  // 新模板（工号 + 三级标签 + 新成绩）与旧模板（员工工号 + 图谱ID + 末级标签ID + 分数）都能读。
  function parseTable(records, ctx = {}) {
    if(records.length<2)throw new Error('文件中没有评分数据，请保留表头并填写至少一行');
    if(records.length>501)throw new Error('本地原型单次最多预览 500 行，请拆分文件');
    const headers=records.shift().cells.map(v=>String(v).trim());
    const named=headers.filter(Boolean);
    if(new Set(named).size!==named.length)throw new Error('表头存在重复列，请使用下载模板');
    const pick=list=>list.find(h=>headers.includes(h));
    const codeCol=pick(['工号','员工工号']), scoreCol=pick(['新成绩','分数']);
    const byId=headers.includes('末级标签ID'), byName=headers.includes('一级标签')&&headers.includes('二级标签');
    const missing=[!codeCol&&'工号',!scoreCol&&'新成绩',!byId&&!byName&&'一级标签、二级标签',!headers.includes('图谱ID')&&!ctx.graphId&&'图谱ID'].filter(Boolean);
    if(missing.length)throw new Error('缺少必填列：'+missing.join('、'));
    const S=window.GP_UI.state, newTemplate=scoreCol==='新成绩', rows=[];
    let skipped=0;
    records.forEach(record=>{
      const inputErrors=[];if(record.cells.length!==headers.length)inputErrors.push('列数与表头不一致');
      const get=h=>{const i=headers.indexOf(h);return i<0?'':String(record.cells[i]??'').trim();};
      const raw=get(scoreCol);
      if(newTemplate&&raw===''){skipped++;return;}  // 新成绩留空的行不更新
      const code=get(codeCol),people=S.persons.filter(p=>p.employeeCode===code);
      if(people.length>1)inputErrors.push('工号匹配到多名人员，请核对唯一标识');
      const graphId=get('图谱ID')||ctx.graphId||'';
      const names=[get('一级标签'),get('二级标签'),get('三级标签')];
      let tagId=get('末级标签ID'),tagUnmatched=false;
      if(!tagId&&byName){tagId=findLeaf(graphId,names);if(!tagId){tagUnmatched=true;inputErrors.push(`「${names.filter(Boolean).join(' › ')||'—'}」不是本图谱的末级标签`);}}
      rows.push({employeeCode:code,userId:people.length===1?people[0].userId:'',graphId,tagId,tagUnmatched,score:parseScore(raw),scoreInput:raw,mode:'override',
        userNameInput:get('姓名')||get('员工姓名'),loginInput:get('用户名'),deptInput:get('部门'),postInput:get('岗位'),
        graphNameInput:get('图谱名称'),tagNameInput:get('标签名称'),pathInput:byName?names:null,sourceLine:record.line,inputErrors});
    });
    if(!rows.length)throw new Error(newTemplate?'没有填写新成绩，请在最后一列填写后再上传':'文件中没有评分数据，请保留表头并填写至少一行');
    rows.skipped=skipped;
    return rows;
  }

  function isLeafOf(graphId, tagId) {
    const g = window.GP_UI.state.graphs[graphId];
    if (!g) return false;
    return G.leafTags(g.tagTree).some((t) => t.id === tagId);
  }

  function tagName(graphId, tagId) {
    const g = window.GP_UI.state.graphs[graphId];
    if (!g) return tagId;
    let found = null;
    (function walk(ns) {
      ns.forEach((n) => {
        if (n.id === tagId) found = n;
        if (n.children) walk(n.children);
      });
    })(g.tagTree);
    return found ? found.nm : tagId;
  }

  function personOf(uid) {
    return window.GP_UI.state.persons.find((p) => p.userId === uid);
  }

  /** 逐行校验，返回带错误原因的行 */
  function validate(rows) {
    const S = window.GP_UI.state;
    const seen = new Map();
    return rows.map((row, i) => {
      const errs = (row.inputErrors || []).slice();
      const p = personOf(row.userId);
      if (!p) errs.push('人员不存在（重名不能任取第一条，须唯一匹配）');

      const g = S.graphs[row.graphId];
      if (!g) errs.push('图谱不存在');
      else if(g.status!=='enabled')errs.push('图谱未启用，不能导入评分');
      if(p && row.employeeCode && p.employeeCode!==row.employeeCode)errs.push('工号匹配已变化，请重新选择文件预览');

      if (g && !row.tagUnmatched) {
        const leafOk = isLeafOf(row.graphId, row.tagId);
        if (!leafOk) {
          const isExisting = (function () {
            let hit = false;
            (function walk(ns) {
              ns.forEach((n) => { if (n.id === row.tagId) hit = true; if (n.children) walk(n.children); });
            })(g.tagTree);
            return hit;
          })();
          errs.push(isExisting ? '不是末级标签' : '标签不属于该图谱');
        }
      }

      if (p && g) {
        const r = (S.rel[row.graphId] || {})[row.userId];
        if (r && r.excluded) errs.push('该人员已被人工排除');
        else if (!r || !r.sources || r.sources.length === 0) errs.push('人员当前无有效关联');
      }

      if (typeof row.score !== 'number' || isNaN(row.score)) errs.push('分数无效');
      else if (row.score < 0 || row.score > 100) errs.push('分数超出 0–100（演示量表）');

      // 同文件重复对象
      const key = row.graphId + '|' + row.userId + '|' + row.tagId;
      if (seen.has(key)) {
        errs.push(`重复对象：与第 ${seen.get(key)} 行相同（员工＋图谱＋末级标签），请修正`);
      } else {
        seen.set(key, row.sourceLine || i + 1);
      }

      return { ...row, rowNo: i + 1, errors: errs, personName: p ? p.userName : '—', tagLabel: tagName(row.graphId, row.tagId) };
    });
  }

  /** 生成预览：计算原结果与预计结果（不写正式数据） */
  function preview(rows) {
    const S = window.GP_UI.state;
    const scores = window.GP_UI.scores;
    const checked = validate(rows);
    return checked.map((row) => {
      const s = scores.find((x) => x.graphId === row.graphId && x.userId === row.userId && x.tagId === row.tagId);
      const before = s ? G.computeScore(s) : { value: null, formula: '无数据' };
      let after = null;
      if (!row.errors.length) {
        after = G.computeScore({ postTests: s ? s.postTests : [], importScore: row.score, mode: 'override' });
      }
      return { ...row, latest: s && typeof s.importScore === 'number' ? s.importScore : null, before: before.value, beforeFormula: before.formula, after: after ? after.value : null, afterFormula: after ? after.formula : '' };
    });
  }

  /** 执行：重新校验，仅成功行写入 */
  function execute(rows, failMode) {
    const scores = window.GP_UI.scores;
    const checked = validate(rows);   // 已带 rowNo
    const lastNo = checked.length;
    const results = checked.map((row) => {
      if (row.errors.length) return { ...row, status: 'failed', reason: row.errors.join('；') };
      // 模拟执行失败：本批最后一行在「执行阶段」失败
      if (failMode && row.rowNo === lastNo) {
        return { ...row, status: 'failed', reason: '执行阶段校验未通过（模拟服务失败，行数据本身合法）' };
      }
      let s = scores.find((x) => x.graphId === row.graphId && x.userId === row.userId && x.tagId === row.tagId);
      if (!s) {
        s = { graphId: row.graphId, userId: row.userId, tagId: row.tagId, tagName: row.tagLabel, postTests: [], importScore: null, mode: 'avg' };
        scores.push(s);
      }
      s.importScore = row.score;
      s.mode = 'override';
      return { ...row, status: 'success', current: G.computeScore(s).value };
    });
    return {
      results,
      ok: results.filter((r) => r.status === 'success').length,
      fail: results.filter((r) => r.status === 'failed').length,
      execAt: new Date().toLocaleString('zh-CN'),
    };
  }

  // 表内改分：只改分数，校验留给「重新校验 / 保存」。
  function parseScore(raw) {
    const v = String(raw ?? '').trim();
    return v !== '' && /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(v) ? Number(v) : NaN;
  }

  /** 重新校验：rowNo 为空时整批，否则只更新该行（重复等跨行规则仍按整批计算） */
  function revalidate(rows, rowNo) {
    const fresh = preview(rows).map((r) => ({ ...r, dirty: false }));
    if (rowNo == null) return fresh;
    return rows.map((r, i) => (r.rowNo === rowNo ? fresh[i] : r));
  }

  /* ---------- 生成 .xlsx（不压缩的 zip + 最少的工作簿部件），供模板和错误明细下载 ---------- */
  const enc = new TextEncoder();
  let crcTable;
  function crc32(bytes) {
    crcTable ||= Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
    let c = 0xffffffff;
    for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function zipStore(files) {
    const parts = [], central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, 0, 2], [12, 0x21, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, name.length, 2], [28, 0, 2]]
        .forEach(([o, v, n]) => (n === 4 ? lh.setUint32(o, v, true) : lh.setUint16(o, v, true)));
      const ch = new DataView(new ArrayBuffer(46));
      [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, 0, 2], [14, 0x21, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, name.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, offset, 4]]
        .forEach(([o, v, n]) => (n === 4 ? ch.setUint32(o, v, true) : ch.setUint16(o, v, true)));
      parts.push(new Uint8Array(lh.buffer), name, data);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const size = central.reduce((n, a) => n + a.length, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, size, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }
  function toXlsx(nameOrSheets, rows, widths = []) {
    const sheets = Array.isArray(nameOrSheets) ? nameOrSheets : [{ name: nameOrSheets, rows, widths }];
    const x = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const col = i => { let s = ''; for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
    // 文本一律存为内联字符串，以 = 开头的内容也不会被当成公式；分数为数值单元格。
    const cell = (v, r, c, head) => {
      const ref = col(c) + r, st = head ? ' s="1"' : '';
      if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${st}><v>${v}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${st}><is><t xml:space="preserve">${x(v ?? '')}</t></is></c>`;
    };
    const sheetXml = sh => {
      const cols = sh.rows[0].map((_, i) => `<col min="${i + 1}" max="${i + 1}" width="${(sh.widths || [])[i] || 14}" customWidth="1"/>`).join('');
      const data = sh.rows.map((r, i) => `<row r="${i + 1}">${r.map((v, j) => cell(v, i + 1, j, i === 0)).join('')}</row>`).join('');
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${NS}/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${data}</sheetData></worksheet>`;
    };
    const NS = 'http://schemas.openxmlformats.org';
    const n = sheets.map((_, i) => i + 1);
    return zipStore([
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${NS}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${n.map(i => `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
      { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS}/package/2006/relationships"><Relationship Id="rId1" Type="${NS}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${NS}/spreadsheetml/2006/main" xmlns:r="${NS}/officeDocument/2006/relationships"><sheets>${sheets.map((sh, i) => `<sheet name="${x(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS}/package/2006/relationships">${n.map(i => `<Relationship Id="rId${i}" Type="${NS}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="${NS}/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/styles.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${NS}/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0" xfId="0"/><xf fontId="1" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
      ...sheets.map((sh, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(sh) })),
    ]);
  }

  /** 模板：所选学员 × 图谱末级标签；最后一列「新成绩」留空。另附「填写说明」记录图谱ID。 */
  function templateSheets(graphId, userIds) {
    const S = window.GP_UI.state, scores = window.GP_UI.scores, g = S.graphs[graphId];
    const head = ['工号', '姓名', '用户名', '部门', '岗位', '一级标签', '二级标签', '三级标签', '最新成绩', '新成绩'];
    const rows = [head];
    userIds.forEach(uid => {
      const p = S.persons.find(x => x.userId === uid);
      if (!p) return;
      const post = (p.positionIds || []).map(id => (G.positions.find(x => x.id === id) || {}).nm || id).join('、');
      leafPaths(graphId).forEach(t => {
        const s = scores.find(x => x.graphId === graphId && x.userId === uid && x.tagId === t.id);
        const latest = s && typeof s.importScore === 'number' ? s.importScore : '未导入';
        rows.push([p.employeeCode, p.userName, p.loginName || p.employeeCode, p.deptName || '', post, t.path[0] || '', t.path[1] || '', t.path[2] || '', latest, '']);
      });
    });
    const note = [['项目', '内容'], ['图谱名称', g ? g.name : ''], ['图谱ID', graphId], ['学员数', userIds.length], ['下载时间', new Date().toLocaleString('zh-CN')],
      ['怎么填', '只填最后一列「新成绩」（0–100 分），其他列不用改；新成绩留空的行不更新。'], ['导入规则', '新成绩直接覆盖该标签的能力分。请在本页面上传，只能导入到下载它的图谱。']];
    return [{ name: '评分导入', rows, widths: [12, 10, 12, 14, 14, 14, 14, 16, 10, 10] }, { name: '填写说明', rows: note, widths: [12, 60] }];
  }

  window.GP_IMPORT = { IMPORT_TEMPLATE, parseCsv, parseSheets, validate, preview, execute, parseScore, revalidate, toXlsx, templateSheets, tagPath };
})();

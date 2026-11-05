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
  function parseCsv(text) {
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
    push();return parseTable(records);
  }

  /** Excel：找到含「员工工号」表头的工作表，行号按 Excel 实际行号记录。 */
  function parseSheets(sheets) {
    for (const sheet of sheets || []) {
      const h = sheet.cells.slice(0, 10).findIndex(r => r.some(v => String(v).trim() === '员工工号'));
      if (h < 0) continue;
      const width = sheet.cells[h].reduce((n, v, i) => (String(v).trim() ? i + 1 : n), 0);
      const records = sheet.cells.slice(h).map((cells, i) => {
        const last = cells.reduce((n, v, j) => (String(v).trim() ? j + 1 : n), 0);
        const row = cells.slice(0, Math.max(width, last)).map(v => String(v));
        while (row.length < width) row.push('');
        return { cells: row, line: h + i + 1 };
      }).filter((r, i) => i === 0 || r.cells.some(v => v.trim()));
      return parseTable(records);
    }
    throw new Error('表格里找不到「员工工号」表头，请使用本页下载的模板填写。');
  }

  function parseTable(records) {
    if(records.length<2)throw new Error('文件中没有评分数据，请保留表头并填写至少一行');
    if(records.length>501)throw new Error('本地原型单次最多预览 500 行，请拆分文件');
    const headers=records.shift().cells.map(v=>v.trim());
    const required=['员工工号','图谱ID','末级标签ID','分数'];
    if(new Set(headers).size!==headers.length)throw new Error('表头存在重复列，请使用下载模板');
    const missing=required.filter(h=>!headers.includes(h));if(missing.length)throw new Error('缺少必填列：'+missing.join('、'));
    const S=window.GP_UI.state;
    return records.map(record=>{
      const inputErrors=[];if(record.cells.length!==headers.length)inputErrors.push('列数与表头不一致');
      const get=h=>(record.cells[headers.indexOf(h)]||'').trim();
      const code=get('员工工号'),people=S.persons.filter(p=>p.employeeCode===code);
      if(people.length>1)inputErrors.push('工号匹配到多名人员，请核对唯一标识');
      const raw=get('分数');
      return {employeeCode:code,userId:people.length===1?people[0].userId:'',graphId:get('图谱ID'),tagId:get('末级标签ID'),score:raw!==''&&/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)?Number(raw):NaN,scoreInput:raw,mode:'override',userNameInput:get('员工姓名'),graphNameInput:get('图谱名称'),tagNameInput:get('标签名称'),sourceLine:record.line,inputErrors};
    });
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

      if (g) {
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
      return { ...row, before: before.value, beforeFormula: before.formula, after: after ? after.value : null, afterFormula: after ? after.formula : '' };
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
  function toXlsx(sheetName, rows, widths = []) {
    const x = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const col = i => { let s = ''; for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
    // 文本一律存为内联字符串，以 = 开头的内容也不会被当成公式；分数为数值单元格。
    const cell = (v, r, c, head) => {
      const ref = col(c) + r, st = head ? ' s="1"' : '';
      if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${st}><v>${v}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${st}><is><t xml:space="preserve">${x(v ?? '')}</t></is></c>`;
    };
    const cols = rows[0].map((_, i) => `<col min="${i + 1}" max="${i + 1}" width="${widths[i] || 14}" customWidth="1"/>`).join('');
    const data = rows.map((r, i) => `<row r="${i + 1}">${r.map((v, j) => cell(v, i + 1, j, i === 0)).join('')}</row>`).join('');
    const NS = 'http://schemas.openxmlformats.org';
    return zipStore([
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${NS}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
      { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS}/package/2006/relationships"><Relationship Id="rId1" Type="${NS}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${NS}/spreadsheetml/2006/main" xmlns:r="${NS}/officeDocument/2006/relationships"><sheets><sheet name="${x(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS}/package/2006/relationships"><Relationship Id="rId1" Type="${NS}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${NS}/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/styles.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${NS}/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0" xfId="0"/><xf fontId="1" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
      { name: 'xl/worksheets/sheet1.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${NS}/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${data}</sheetData></worksheet>` },
    ]);
  }

  window.GP_IMPORT = { IMPORT_TEMPLATE, parseCsv, parseSheets, validate, preview, execute, parseScore, revalidate, toXlsx };
})();

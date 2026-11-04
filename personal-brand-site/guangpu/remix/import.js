/**
 * 光谱五步创建原型 · 评分导入模块（D07 / D08）
 * 上传/加载演示数据 → 逐行校验 → 预览（不写正式结果）→ 执行（重新校验）
 */
(function () {
  'use strict';
  const G = window.GP;

  const IMPORT_TEMPLATE = [
    // 逻辑输入：员工唯一标识 + 图谱唯一标识 + 末级标签唯一标识 + 分数 + 模式
    { userId: 'u001', graphId: 'A', tagId: 't1-1-1', score: 100, mode: 'avg' },
    { userId: 'u001', graphId: 'A', tagId: 't1-1-1', score: 70, mode: 'avg' },   // 同文件重复对象
    { userId: 'u002', graphId: 'A', tagId: 't1-1-2', score: 100, mode: 'avg' },
    { userId: 'u001', graphId: 'A', tagId: 't2-1', score: 100, mode: 'avg' },     // 后测真实 0
    { userId: 'u003', graphId: 'A', tagId: 't1-1-1', score: 100, mode: 'avg' },   // 无后测
    { userId: 'u004', graphId: 'A', tagId: 't1-2', score: 95, mode: 'override' }, // 覆盖
    { userId: 'u999', graphId: 'A', tagId: 't1-1-1', score: 80, mode: 'avg' },    // 无此人员
    { userId: 'u006', graphId: 'A', tagId: 't1-1-1', score: 80, mode: 'avg' },    // 人员未关联
    { userId: 'u001', graphId: 'A', tagId: 't1', score: 80, mode: 'avg' },        // 非末级
    { userId: 'u001', graphId: 'B', tagId: 't1-1-1', score: 80, mode: 'avg' },    // 标签不属该图
    { userId: 'u002', graphId: 'A', tagId: 't2-1', score: 120, mode: 'avg' },     // 分数越界
    { userId: 'u002', graphId: 'A', tagId: 't1-2', score: 88, mode: 'avg' },
  ];

  // 本地文件适配，CSV 是演示格式，不定义生产上传协议。
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
    push();if(records.length<2)throw new Error('文件中没有评分数据，请保留表头并填写至少一行');
    if(records.length>501)throw new Error('本地原型单次最多预览 500 行，请拆分文件');
    const headers=records.shift().cells.map(v=>v.trim());
    const required=['员工工号','图谱ID','末级标签ID','分数','模式'];
    if(new Set(headers).size!==headers.length)throw new Error('表头存在重复列，请使用下载模板');
    const missing=required.filter(h=>!headers.includes(h));if(missing.length)throw new Error('缺少必填列：'+missing.join('、'));
    const S=window.GP_UI.state;
    return records.map(record=>{
      const inputErrors=[];if(record.cells.length!==headers.length)inputErrors.push('列数与表头不一致');
      const get=h=>(record.cells[headers.indexOf(h)]||'').trim();
      const code=get('员工工号'),people=S.persons.filter(p=>p.employeeCode===code);
      if(people.length>1)inputErrors.push('工号匹配到多名人员，请核对唯一标识');
      const raw=get('分数'),mode=get('模式');
      return {employeeCode:code,userId:people.length===1?people[0].userId:'',graphId:get('图谱ID'),tagId:get('末级标签ID'),score:raw!==''&&/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)?Number(raw):NaN,scoreInput:raw,mode:({'参与平均':'avg','直接覆盖':'override',avg:'avg',override:'override'})[mode]||mode,sourceLine:record.line,inputErrors};
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

      if (row.mode !== 'avg' && row.mode !== 'override') errs.push('模式无效');

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
        after = G.computeScore({ postTests: s ? s.postTests : [], importScore: row.score, mode: row.mode });
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
      s.mode = row.mode;
      return { ...row, status: 'success', current: G.computeScore(s).value };
    });
    return {
      results,
      ok: results.filter((r) => r.status === 'success').length,
      fail: results.filter((r) => r.status === 'failed').length,
      execAt: new Date().toLocaleString('zh-CN'),
    };
  }

  window.GP_IMPORT = { IMPORT_TEMPLATE, parseCsv, validate, preview, execute };
})();

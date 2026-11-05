/* 帮建文档正文提取；只读取本地文件，不执行文档内容或访问外部资源。 */
(function () {
  'use strict';
  const MAX_FILE = 5 * 1024 * 1024;
  const MAX_XML = 2 * 1024 * 1024;
  const MAX_TEXT = 30000;
  const WORD_NS = new Set(['http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'http://purl.oclc.org/ooxml/wordprocessingml/main']);
  const fail = message => { throw new Error(message); };
  function utf8(bytes) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, ''); }
    catch (_) { fail('无法识别文档编码，请另存为 UTF-8 文本或重新保存为 DOCX。'); }
  }
  function clean(text) {
    return text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').split('\n').map(line => line.replace(/[ \t]+$/g, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  let crcTable;
  function crc32(bytes) {
    if (!crcTable) crcTable = Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
    let crc = 0xffffffff;
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  function xmlDocument(xml, rootName) {
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) fail('文档包含不支持的 XML 定义，请重新保存。');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length || doc.documentElement.localName !== rootName) fail('文档内部 XML 格式损坏，请重新保存。');
    return doc;
  }
  function zipArchive(bytes, totalMax = 4 * 1024 * 1024) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const within = (offset, length) => Number.isSafeInteger(offset) && Number.isSafeInteger(length) && offset >= 0 && length >= 0 && offset + length <= bytes.length;
    let end = -1;
    for (let i = bytes.length - 22, minimum = Math.max(0, bytes.length - 65557); i >= minimum; i--) {
      if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === bytes.length) { end = i; break; }
    }
    if (end < 0) fail('文件损坏或不是有效的 Office 文档，请重新保存。');
    const count = view.getUint16(end + 10, true), size = view.getUint32(end + 12, true), offset = view.getUint32(end + 16, true);
    if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || view.getUint16(end + 8, true) !== count || count === 65535 || size === 0xffffffff || offset === 0xffffffff) fail('暂不支持分卷或 ZIP64 文档，请重新保存为普通 Office 文档。');
    if (count > 10000 || !within(offset, size) || offset + size > end) fail('文档目录结构异常，请重新保存。');
    let cursor = offset, expandedTotal = 0; const entries = new Map(), cache = new Map();
    for (let i = 0; i < count; i++) {
      if (!within(cursor, 46) || cursor + 46 > offset + size || view.getUint32(cursor, true) !== 0x02014b50) fail('文档目录损坏，请重新保存。');
      const flags = view.getUint16(cursor + 8, true), method = view.getUint16(cursor + 10, true), crc = view.getUint32(cursor + 16, true), compressed = view.getUint32(cursor + 20, true), expanded = view.getUint32(cursor + 24, true);
      const nameLength = view.getUint16(cursor + 28, true), extraLength = view.getUint16(cursor + 30, true), commentLength = view.getUint16(cursor + 32, true), disk = view.getUint16(cursor + 34, true), localOffset = view.getUint32(cursor + 42, true);
      const next = cursor + 46 + nameLength + extraLength + commentLength;
      if (!within(cursor, next - cursor) || next > offset + size) fail('文档目录损坏，请重新保存。');
      const rawName = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
      // Windows 压缩工具常用 GBK 存文件名，未标 UTF-8 时按 GB18030 解码。
      const name = new TextDecoder(flags & 0x800 ? 'utf-8' : 'gb18030').decode(rawName);
      if (entries.has(name)) fail('文档中存在重复文件项，无法确定解析内容。');
      entries.set(name, { flags, method, crc, compressed, expanded, localOffset, rawName }); cursor = next;
    }
    const reader = async (name, maximum = 4 * 1024 * 1024, optional = false, raw = false) => {
      if (!raw && cache.has(name)) return cache.get(name);
      const part = entries.get(name); if (!part) { if (optional) return null; fail('未找到文档内容：' + name); }
      if (part.flags & 1 || part.flags & 64 || part.disk) fail('不支持加密或分卷文档，请解除密码后重新保存。');
      if (part.expanded > maximum || part.compressed > MAX_FILE || expandedTotal + part.expanded > totalMax) fail(`解压内容超过 ${Math.round(totalMax / 1048576)} MB 或单项上限，请拆分后导入。`);
      if (![0, 8].includes(part.method)) fail('文档压缩格式不受支持，请重新保存。');
      const loc = part.localOffset;
      if (!within(loc, 30) || view.getUint32(loc, true) !== 0x04034b50) fail('文档内容位置损坏，请重新保存。');
      const flags = view.getUint16(loc + 6, true), method = view.getUint16(loc + 8, true), nl = view.getUint16(loc + 26, true), el = view.getUint16(loc + 28, true), start = loc + 30 + nl + el;
      if ((flags & 1) || (flags & 64) || method !== part.method || !within(start, part.compressed) || start + part.compressed > offset || !bytes.subarray(loc + 30, loc + 30 + nl).every((v, i) => v === part.rawName[i])) fail('文档内容结构异常，请重新保存。');
      const packed = bytes.subarray(start, start + part.compressed); let plain;
      if (part.method === 0) plain = packed;
      else {
        if (typeof DecompressionStream !== 'function') fail('当前浏览器不支持文档解压，请使用新版 Chrome。');
        let reader;
        try {
          reader = new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
          const chunks = []; let length = 0;
          while (true) {
            const chunk = await reader.read(); if (chunk.done) break;
            length += chunk.value.length;
            if (length > maximum || length > part.expanded || length + expandedTotal > totalMax) { await reader.cancel(); fail('文档解压后的内容超过限制，请拆分后重试。'); }
            chunks.push(chunk.value);
          }
          plain = new Uint8Array(length); let index = 0; chunks.forEach(chunk => { plain.set(chunk, index); index += chunk.length; });
        } catch (error) { if (String(error?.message || '').includes('超过限制')) throw error; fail('文档内容无法解压，请使用新版 Chrome 或重新保存文档。'); }
        finally { if (reader) reader.releaseLock(); }
      }
      if (plain.length !== part.expanded || crc32(plain) !== part.crc) fail('文档内容校验失败，文件可能损坏，请重新保存。');
      expandedTotal += plain.length; if (raw) return plain;
      const text = utf8(plain); cache.set(name, text); return text;
    };
    reader.names = [...entries.keys()];
    reader.sizeOf = name => entries.get(name)?.expanded || 0;
    return reader;
  }
  function packagePath(target) {
    if (!target || /[\\?#]/.test(target) || /^[a-z][a-z0-9+.-]*:/i.test(target)) fail('工作表引用了不支持的外部内容，请重新保存。');
    const stack = target.startsWith('/') ? [] : ['xl'];
    target.split('/').forEach(part => { if (!part || part === '.') return; if (part === '..') { if (!stack.length) fail('工作表路径越界'); stack.pop(); } else stack.push(part); });
    return stack.join('/');
  }
  async function spreadsheet(bytes, maxRows = 500, maxText = MAX_TEXT) {
    const read = zipArchive(bytes), workbook = xmlDocument(await read('xl/workbook.xml'), 'workbook');
    const rels = xmlDocument(await read('xl/_rels/workbook.xml.rels'), 'Relationships');
    const links = new Map(Array.from(rels.getElementsByTagNameNS('*', 'Relationship')).map(n => [n.getAttribute('Id'), n]));
    const sheets = Array.from(workbook.getElementsByTagNameNS('*', 'sheet'));
    if (!sheets.length) fail('工作簿没有可解析的工作表。');
    if (sheets.length > 10) fail('工作簿超过 10 个工作表，请拆分后导入。');
    const sharedXml = await read('xl/sharedStrings.xml', 4 * 1024 * 1024, true);
    const shared = sharedXml ? Array.from(xmlDocument(sharedXml, 'sst').getElementsByTagNameNS('*', 'si')).map(si => Array.from(si.getElementsByTagNameNS('*', 't')).map(t => t.textContent || '').join('')) : [];
    const warnings = [], output = [];
    for (const sheet of sheets) {
      const name = sheet.getAttribute('name') || '未命名工作表';
      const relationId = Array.from(sheet.attributes).find(a => a.localName === 'id')?.value, rel = links.get(relationId);
      if (!rel || rel.getAttribute('TargetMode') === 'External' || !/\/worksheet$/.test(rel.getAttribute('Type') || '')) fail('工作表引用异常或包含外部工作表，请重新保存。');
      const path = packagePath(rel.getAttribute('Target')), doc = xmlDocument(await read(path), 'worksheet');
      const sourceRows = Array.from(doc.getElementsByTagNameNS('*', 'sheetData')[0]?.children || []).filter(n => n.localName === 'row');
      const matrix = []; let lastRow = 0, maximumColumn = 0, formulas = 0;
      for (const row of sourceRows) {
        const rowIndex = Number(row.getAttribute('r') || lastRow + 1);
        if (!Number.isInteger(rowIndex) || rowIndex <= lastRow || rowIndex > maxRows) fail(`工作表“${name}”超过 ${maxRows} 行或行号异常，请整理后导入。`);
        lastRow = rowIndex; const cells = []; let lastColumn = 0;
        for (const cell of Array.from(row.children).filter(n => n.localName === 'c')) {
          const reference = cell.getAttribute('r'), match = reference ? /^([A-Z]+)([1-9][0-9]*)$/.exec(reference) : null;
          let column = lastColumn + 1;
          if (reference) { if (!match || Number(match[2]) !== rowIndex) fail('工作表单元格位置异常，请重新保存。'); column = Array.from(match[1]).reduce((sum, ch) => sum * 26 + ch.charCodeAt(0) - 64, 0); }
          if (column <= lastColumn || column > 100) fail(`工作表“${name}”超过 100 列或列号异常，请整理后导入。`);
          lastColumn = column; maximumColumn = Math.max(maximumColumn, column);
          const type = cell.getAttribute('t'), formula = Array.from(cell.children).find(n => n.localName === 'f'), value = Array.from(cell.children).find(n => n.localName === 'v');
          let text = '';
          if (formula && (!value || value.textContent === '')) formulas++;
          else if (type === 's') { const i = Number(value?.textContent); if (!value || !/^\d+$/.test(value.textContent || '') || !Number.isInteger(i) || i < 0 || i >= shared.length) fail('共享字符串索引异常，请重新保存。'); text = shared[i]; }
          else if (type === 'inlineStr') text = Array.from(cell.getElementsByTagNameNS('*', 't')).map(n => n.textContent || '').join('');
          else if (type === 'b') text = value?.textContent === '1' ? 'TRUE' : value?.textContent === '0' ? 'FALSE' : '';
          else if (type === 'e') { warnings.push(`工作表“${name}”的 ${reference || column} 包含 Excel 错误值。`); text = value?.textContent || ''; }
          else text = value?.textContent || '';
          cells[column - 1] = String(text).replace(/\r\n?/g, '\n');
        }
        matrix[rowIndex - 1] = cells;
      }
      if (formulas) warnings.push(`工作表“${name}”有 ${formulas} 个公式没有缓存结果，相关单元格留空；请在 Excel 中重新计算并保存。`);
      const cells = Array.from({ length: lastRow }, (_, i) => Array.from({ length: maximumColumn }, (_, j) => matrix[i]?.[j] || ''));
      const text = cells.map(row => row.join('\t')).join('\n').trim();
      output.push({ name, text, rows: lastRow, cells });
    }
    const text = output.map(sheet => sheet.name + '\n' + sheet.text).join('\n\n').trim();
    if (!output.some(sheet => sheet.cells.some(row => row.some(value => value.trim())))) fail('工作簿没有可解析的文字或数值，请检查文件是否仅包含图片。');
    if (text.length > maxText) fail(`解析正文超过 ${maxText} 字符，请拆分工作簿后导入。`);
    return { text, sheets: output, warnings: Array.from(new Set(warnings)) };
  }

  function extractXml(xml) {
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) fail('文档包含不支持的 XML 定义，请用 Word 重新保存。');
    if (typeof DOMParser !== 'function') fail('当前浏览器不支持文档解析，请使用新版 Chrome。');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length || doc.documentElement.localName !== 'document' || !WORD_NS.has(doc.documentElement.namespaceURI)) fail('DOCX 正文格式异常，请重新保存文档。');
    const result = [];
    const walk = node => {
      if (node.nodeType !== 1) return;
      if (WORD_NS.has(node.namespaceURI)) {
        if (node.localName === 't') { result.push(node.textContent || ''); return; }
        if (node.localName === 'tab') { result.push('\t'); return; }
        if (node.localName === 'br' || node.localName === 'cr') { result.push('\n'); return; }
        if (node.localName === 'del' || node.localName === 'instrText') return;
      }
      Array.from(node.childNodes).forEach(walk);
      if (WORD_NS.has(node.namespaceURI)) {
        if (node.localName === 'tc') result.push('\t');
        else if (node.localName === 'p' || node.localName === 'tr') result.push('\n');
      }
    };
    walk(doc.documentElement);
    return result.join('');
  }
  async function parse(file) {
    if (!file || typeof file.arrayBuffer !== 'function') fail('请选择需要解析的文档。');
    const name = String(file.name || ''), format = (name.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();
    if (!['txt', 'md', 'docx', 'xlsx'].includes(format)) fail('当前支持 XLSX、DOCX、TXT 和 Markdown；旧版 XLS 请另存为 XLSX，PDF 或旧版 DOC 请转换为可编辑文档。');
    if (!file.size) fail('文档为空，请选择包含岗位职责的文件。');
    if (file.size > MAX_FILE) fail('文档超过 5 MB，请拆分后导入。');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > MAX_FILE) fail('文档超过 5 MB，请拆分后导入。');
    if (['docx','xlsx'].includes(format) && bytes.slice(0,8).every((value,i)=>value===[0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1][i]) && bytes.length>=8) fail('文档可能已加密或使用旧版 Office 格式，请解除密码并另存为 XLSX 或 DOCX。');
    if (format === 'xlsx') return { ...(await spreadsheet(bytes)), fileName: name, format };
    const text = clean(format === 'docx' ? extractXml(await zipArchive(bytes)('word/document.xml', MAX_XML)) : utf8(bytes));
    if (!text) fail('未提取到正文。纯图片、扫描件或空文档无法直接解析，请提供可编辑文字。');
    if (text.length > MAX_TEXT) fail('解析正文超过 30000 字符，请拆分文档后导入。');
    return { text, fileName: name, format, warnings: format === 'docx' ? ['仅提取正文文字和表格文字，不解析图片、批注、页眉页脚或扫描内容。'] : [] };
  }
  const PACKAGE_MAX = 20 * 1024 * 1024;
  const PACKAGE_FILES = 30;
  // 压缩包逐个解析；单个文件失败只记原因，不影响其余文件。
  async function parsePackage(file) {
    const name = String(file?.name || '');
    if (!/\.zip$/i.test(name)) fail('请上传 .zip 压缩包。');
    if (!file.size) fail('压缩包为空。');
    if (file.size > PACKAGE_MAX) fail('压缩包超过 20 MB，请拆分后上传。');
    const read = zipArchive(new Uint8Array(await file.arrayBuffer()), PACKAGE_MAX);
    const names = read.names.filter(n => !n.endsWith('/') && !/(^|\/)(__MACOSX|\.)/.test(n));
    if (!names.length) fail('压缩包里没有文件。');
    if (names.length > PACKAGE_FILES) fail(`压缩包内文件超过 ${PACKAGE_FILES} 个，请拆分后上传。`);
    const files = [];
    for (const entry of names) {
      const base = entry.split('/').pop(), folder = entry.includes('/') ? entry.slice(0, entry.lastIndexOf('/')) : '';
      const item = { name: base, folder, size: read.sizeOf(entry) };
      try {
        if (/\.(pdf|doc|xls|ppt|pptx|png|jpe?g|zip|rar|7z)$/i.test(base)) fail('暂不支持该格式，已跳过');
        const bytes = await read(entry, MAX_FILE, false, true);
        Object.assign(item, await parse({ name: base, size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) }), { status: 'ok' });
      } catch (error) { Object.assign(item, { status: 'skip', error: error.message }); }
      files.push(item);
    }
    return { fileName: name, files };
  }
  /** 只读 .xlsx 表格（评分导入用），行数与正文上限由调用方给出。 */
  async function parseWorkbook(file, { maxRows = 500, maxText = MAX_TEXT } = {}) {
    if (!/\.xlsx$/i.test(String(file?.name || ''))) fail('请上传 .xlsx 格式的 Excel 表格。');
    if (!file.size) fail('文件为空，请使用下载的模板填写。');
    if (file.size > MAX_FILE) fail('文件超过 5 MB，请拆分后上传。');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length >= 8 && bytes.slice(0, 8).every((v, i) => v === [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1][i])) fail('文件可能已加密或是旧版 Excel，请解除密码并另存为 .xlsx 后上传。');
    return spreadsheet(bytes, maxRows, maxText);
  }
  window.GP_BUILDER_DOCUMENT = { parse, parsePackage, parseWorkbook };
})();

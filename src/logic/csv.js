// spec.md §5 ADD-01：CSV取込ウィザードの中核ロジック（純粋関数＋デコード）。
// 依存ゼロ方針のため、パーサ・エンコーディング判定を内製する。

/**
 * ArrayBuffer をテキストへデコードする。
 * UTF-8（BOM有無とも）を優先試行し、置換文字（U+FFFD）を検出したら Shift_JIS で再デコード（spec §5 ADD-01）。
 * @param {ArrayBuffer} buf
 * @returns {{text: string, encoding: 'utf-8'|'shift_jis'}}
 */
export function decodeCsv(buf) {
  let utf8 = '';
  try {
    utf8 = new TextDecoder('utf-8').decode(buf); // 既定で BOM は除去される
  } catch (e) {
    console.warn('[csv] UTF-8 decode failed', e);
  }
  if (utf8 && !utf8.includes('\uFFFD')) {
    return { text: utf8, encoding: 'utf-8' };
  }
  // 文字化け（U+FFFD）を検出：日本のPOS/レジで多い Shift_JIS として再デコード
  try {
    const sjis = new TextDecoder('shift_jis').decode(buf);
    return { text: sjis, encoding: 'shift_jis' };
  } catch (e) {
    // shift_jis 非対応環境では UTF-8 の結果をそのまま返す（エラー行として後段で検出される）
    console.warn('[csv] Shift_JIS decode unavailable. Falling back to UTF-8 result.', e);
    return { text: utf8, encoding: 'utf-8' };
  }
}

/**
 * CSVテキストを2次元配列にパースする（RFC4180の範囲：引用符・引用符内カンマ/改行・""エスケープ対応）。
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'; // "" は引用符1つにアンエスケープ
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c === '\r') {
      // CRLF/CR は無視（次の \n で行確定。末尾CRのみの場合も後段で処理）
    } else {
      field += c;
    }
  }
  // 最終行（末尾に改行がないケース）
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // 完全な空行は除去
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/**
 * 日付文字列を ISO（YYYY-MM-DD）へ正規化する。
 * 対応形式：YYYY-MM-DD / YYYY/M/D / YYYYMMDD（spec §5 ADD-01）
 * @param {string} raw
 * @returns {string|null} 解釈不能なら null
 */
export function parseDate(raw) {
  const s = String(raw).trim();
  let y, m, d;
  let match;
  if ((match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) {
    [, y, m, d] = match;
  } else if ((match = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/))) {
    [, y, m, d] = match;
  } else if ((match = s.match(/^(\d{4})(\d{2})(\d{2})$/))) {
    [, y, m, d] = match;
  } else {
    return null;
  }
  const yy = Number(y);
  const mm = Number(m);
  const dd = Number(d);
  // 実在日チェック（例：2/30 を弾く）
  const dt = new Date(yy, mm - 1, dd);
  if (dt.getFullYear() !== yy || dt.getMonth() !== mm - 1 || dt.getDate() !== dd) return null;
  return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/**
 * 数量セルを非負整数へ正規化する（小数は四捨五入。spec §5 ADD-01）。
 * @param {string} raw
 * @returns {number|null} 数値でなければ null
 */
export function parseQty(raw) {
  const s = String(raw).trim().replace(/,/g, ''); // 桁区切りカンマを許容
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r < 0 ? null : r; // 返品等の負数はP0ではエラー行扱い（データを黙って混ぜない）
}

/**
 * パース済み行＋列マッピングから、取込プレビュー（統計・エラー行）と正規化行を作る。
 * @param {string[][]} rows ヘッダー行を含む全行
 * @param {{date:number, product:number, qty:number, hasHeader:boolean}} mapping 列インデックス
 * @returns {{records: Array<{date:string,name:string,qty:number}>, errors: Array<{line:number,reason:string,raw:string}>, stats: Object}}
 */
export function normalizeRows(rows, mapping) {
  const start = mapping.hasHeader ? 1 : 0;
  const records = [];
  const errors = [];
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    const rawDate = r[mapping.date] ?? '';
    const rawName = (r[mapping.product] ?? '').trim();
    const rawQty = r[mapping.qty] ?? '';
    const date = parseDate(rawDate);
    const qty = parseQty(rawQty);
    if (!date) {
      errors.push({ line: i + 1, reason: '日付を解釈できません', raw: r.join(',') });
      continue;
    }
    if (rawName === '') {
      errors.push({ line: i + 1, reason: '商品名が空です', raw: r.join(',') });
      continue;
    }
    if (qty === null) {
      errors.push({ line: i + 1, reason: '数量が数値ではありません（負数含む）', raw: r.join(',') });
      continue;
    }
    records.push({ date, name: rawName, qty });
  }
  // 統計：期間・SKU数・件数
  const dates = records.map((x) => x.date).sort();
  const names = new Set(records.map((x) => x.name));
  const stats = {
    validRows: records.length,
    errorRows: errors.length,
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
    skuCount: names.size,
  };
  return { records, errors, stats };
}

/**
 * 正規化行を既存データへマージする。
 * ・同日同SKUの複数行は合算（spec §5 ADD-01）
 * ・既存データと重複する (日付, SKU) は「上書き」（加算しない）
 * ・商品マスタは商品名の完全一致で同一SKU、未知なら自動採番で追加
 * @param {Array} existingProducts
 * @param {Object} existingSales 疎な辞書 { date: { pid: qty } }
 * @param {Array<{date,name,qty}>} records
 * @returns {{products: Array, sales: Object, overlapDays: number, newProducts: number}}
 */
export function mergeImport(existingProducts, existingSales, records) {
  // 1) ファイル内で同日同SKUを合算
  const byKey = new Map(); // `${date}\u0000${name}` -> qty合計
  for (const rec of records) {
    const k = rec.date + '\u0000' + rec.name;
    byKey.set(k, (byKey.get(k) ?? 0) + rec.qty);
  }
  // 2) 商品マスタの解決（名前完全一致）
  const products = existingProducts.map((p) => ({ ...p }));
  const nameToId = new Map(products.map((p) => [p.name, p.id]));
  let maxSeq = products.reduce((mx, p) => {
    const n = Number(String(p.id).replace(/^p/, ''));
    return Number.isFinite(n) ? Math.max(mx, n) : mx;
  }, 0);
  let newProducts = 0;
  const ensureId = (name) => {
    if (nameToId.has(name)) return nameToId.get(name);
    maxSeq += 1;
    const id = 'p' + maxSeq;
    products.push({ id, name, code: '', active: true });
    nameToId.set(name, id);
    newProducts++;
    return id;
  };
  // 3) 売上へ上書きマージ（既存を壊さないよう新しいオブジェクトを構築）
  const sales = {};
  for (const [d, m] of Object.entries(existingSales)) sales[d] = { ...m };
  let overlapDays = 0;
  const importedDates = new Set();
  for (const [k, qty] of byKey.entries()) {
    const [date, name] = k.split('\u0000');
    const pid = ensureId(name);
    if (!importedDates.has(date)) {
      importedDates.add(date);
      if (existingSales[date]) overlapDays++;
    }
    if (!sales[date]) sales[date] = {};
    sales[date][pid] = qty; // 上書き（spec §5 ADD-01 の既定動作）
  }
  return { products, sales, overlapDays, newProducts };
}

/**
 * エラー行ログをCSVテキスト化する（データを黙って捨てない。spec §5 ADD-01）
 * @param {Array<{line,reason,raw}>} errors
 * @returns {string} UTF-8 BOM 付きCSV
 */
export function errorsToCsv(errors) {
  const esc = (s) => '"' + String(s).replace(/"/g, '""') + '"';
  const lines = ['行番号,理由,元データ'];
  for (const e of errors) lines.push([e.line, esc(e.reason), esc(e.raw)].join(','));
  return '\uFEFF' + lines.join('\r\n');
}

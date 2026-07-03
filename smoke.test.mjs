// スモークテスト：①サンプルCSVでの一連の流れ ②D-5性能（500SKU×2年で3秒以内・4MB以内）
import { readFileSync } from 'node:fs';
import { decodeCsv, parseCsv, normalizeRows, mergeImport } from './src/logic/csv.js';
import { computeAll } from './src/logic/engine.js';
import { recommendQty } from './src/logic/order.js';
import { DEFAULT_SETTINGS } from './src/constants/index.js';

// ---------- ① サンプルCSV：取込→予測→発注 ----------
const buf = readFileSync('public/sample_sales.csv');
const { text, encoding } = decodeCsv(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const rows = parseCsv(text);
const { records, errors, stats } = normalizeRows(rows, { date: 0, product: 1, qty: 2, hasHeader: true });
const merged = mergeImport([], {}, records);
console.log('[sample] encoding=%s rows=%d valid=%d errors=%d sku=%d period=%s..%s',
  encoding, rows.length - 1, stats.validRows, errors.length, stats.skuCount, stats.from, stats.to);

const t0 = Date.now();
const analysis = computeAll(merged.products, merged.sales, DEFAULT_SETTINGS, null);
console.log('[sample] computeAll %dms lastDate=%s horizon=%d', Date.now() - t0, analysis.lastDate, analysis.horizon);
for (const p of merged.products.slice(0, 12)) {
  const r = analysis.byProduct[p.id];
  const reco = recommendQty(r.future.pred, r.sigma, DEFAULT_SETTINGS, 0);
  console.log(`  ${p.name.padEnd(10)} status=${r.status} method=${r.method} mape=${r.mape?.toFixed(1) ?? '-'} wape=${r.wape?.toFixed(1) ?? '-'} primary=${r.primary} σ=${r.sigma.toFixed(2)} 明日予測=${r.future.pred[0]?.toFixed(1)} 推奨=${reco.recommended}`);
}

// 妥当性チェック（明白な破綻がないか）
const oks = Object.values(analysis.byProduct).filter(r => r.status === 'ok');
console.assert(oks.length >= 10, 'ok件数が想定より少ない');
console.assert(oks.every(r => r.future.pred.every(v => v >= 0)), '負の予測が混入');
console.assert(oks.every(r => r.holdout.pred.length === r.holdout.actual.length), 'holdout長さ不一致');

// ---------- ② D-5性能：500SKU×2年 ----------
const products = Array.from({ length: 500 }, (_, i) => ({ id: 'p' + (i + 1), name: 'SKU' + (i + 1), active: true }));
const sales = {};
const start = new Date('2024-07-03T00:00:00');
let rnd = 12345;
const rand = () => (rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648;
for (let d = 0; d < 730; d++) {
  const dt = new Date(start.getTime() + d * 86400000);
  const iso = dt.toISOString().slice(0, 10);
  const day = {};
  for (let i = 0; i < 500; i++) {
    if (rand() < 0.3) continue; // 3割はゼロ売上（疎）
    const wd = dt.getDay();
    const basev = 5 + (i % 40);
    day['p' + (i + 1)] = Math.max(1, Math.round(basev * (wd === 0 || wd === 6 ? 1.5 : 1) * (0.7 + rand() * 0.6)));
  }
  sales[iso] = day;
}
const json = JSON.stringify({ products, sales, settings: DEFAULT_SETTINGS });
const utf16Bytes = json.length * 2;                      // 保守的：UTF-16換算（Safari系quotaの実効値に相当）
const utf8Bytes = Buffer.byteLength(json, 'utf8');       // JSONファイルとしての実サイズ（ADD-05エクスポート相当）
const t1 = Date.now();
const big = computeAll(products, sales, DEFAULT_SETTINGS, null);
const elapsed = Date.now() - t1;
console.log('[D-5] 500SKU×730日(充填率70%): computeAll=' + elapsed + 'ms (基準3000ms)');
console.log('[D-5] サイズ: UTF-16換算=' + (utf16Bytes/1048576).toFixed(2) + 'MB / UTF-8実サイズ=' + (utf8Bytes/1048576).toFixed(2) + 'MB (基準4MB)');

// キャッシュ命中時（HW探索省略）の再計算
const t2 = Date.now();
computeAll(products, sales, DEFAULT_SETTINGS, big.cacheEntry);
console.log('[D-5] キャッシュ命中時: %dms', Date.now() - t2);
console.log('D-5 計算時間: ' + (elapsed <= 3000 ? 'PASS' : 'FAIL'));
console.log('D-5 サイズ(UTF-8基準): ' + (utf8Bytes <= 4 * 1048576 ? 'PASS' : 'FAIL') + ' / (UTF-16保守基準): ' + (utf16Bytes <= 4 * 1048576 ? 'PASS' : 'FAIL'));

// spec.md §5 ADD-04：発注推奨量の算出と発注書CSVの生成。純粋関数のみ。
import { Z_TABLE } from '../constants/index.js';

/**
 * 発注推奨量：max(0, ceil(Σ予測(翌日〜L+C日) + z×σ×√(L+C) − 現在庫))（spec §5 ADD-04）
 * @param {number[]} futurePred 将来予測列（長さ = horizon）
 * @param {number} sigma 予測誤差の標準偏差
 * @param {Object} settings
 * @param {number} currentStock 現在庫（未入力は0扱い）
 * @returns {{recommended:number, forecastSum:number, safety:number}}
 */
export function recommendQty(futurePred, sigma, settings, currentStock) {
  const horizon = Math.max(1, (settings.leadTimeDays | 0) + (settings.orderCycleDays | 0));
  const z = Z_TABLE[settings.serviceLevel] ?? Z_TABLE[95];
  const forecastSum = futurePred.slice(0, horizon).reduce((s, v) => s + v, 0);
  const safety = z * (sigma || 0) * Math.sqrt(horizon);
  const raw = Math.ceil(forecastSum + safety - (currentStock || 0));
  return { recommended: Math.max(0, raw), forecastSum, safety };
}

/**
 * 発注書CSV（UTF-8 BOM付き・Excel互換。spec §5 ADD-04）
 * 列＝商品名／商品コード／推奨量／予測合計／安全在庫／現在庫／採用手法
 * @param {Array<{name,code,recommended,forecastSum,safety,stock,method}>} rows
 * @returns {string}
 */
export function orderCsv(rows) {
  const esc = (s) => '"' + String(s ?? '').replace(/"/g, '""') + '"';
  const lines = ['商品名,商品コード,推奨量,予測合計,安全在庫,現在庫,採用手法'];
  for (const r of rows) {
    lines.push([
      esc(r.name), esc(r.code), r.recommended,
      Math.round(r.forecastSum * 10) / 10, Math.round(r.safety * 10) / 10,
      r.stock ?? 0, r.method ?? '-',
    ].join(','));
  }
  return '\uFEFF' + lines.join('\r\n');
}

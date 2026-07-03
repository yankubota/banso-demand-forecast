// spec.md §5/§6：全SKUの予測計算オーケストレーションと導出キャッシュ（df_cache_forecast）。
// キャッシュは「破棄可能な導出値」。正データ（products/sales/settings）から常に再計算できる。

import { seriesFor, firstSaleDate } from './forecast.js';
import { analyzeProduct } from './backtest.js';
import { dateRange } from './dates.js';
import { save, load } from './storage.js';
import { SCHEMA_VERSION } from '../constants/index.js';

/**
 * 入力ハッシュ：正データの要約＋計算に影響する設定。これが一致すればキャッシュを信頼する。
 * @returns {string}
 */
export function computeHash(products, sales, settings) {
  const dates = Object.keys(sales);
  let rows = 0;
  for (const d of dates) rows += Object.keys(sales[d]).length;
  const s = settings;
  const settingsSig = [s.maWindow, s.dowWeeks, s.holdoutDays, s.leadTimeDays, s.orderCycleDays].join(',');
  const lastDate = dates.length ? dates.slice().sort().pop() : '';
  return `v${SCHEMA_VERSION}|${products.length}|${dates.length}|${rows}|${lastDate}|${settingsSig}`;
}

/**
 * 全SKUの分析を実行する。キャッシュ命中時はHWグリッド探索を省略して高速化する。
 * @param {Array} products
 * @param {Object} sales
 * @param {Object} settings
 * @param {{hash:string, byProduct:Object}|null} cache 事前ロード済みキャッシュ（null可）
 * @returns {{lastDate:string, horizon:number, byProduct:Object, globalDates:string[], globalActual:number[], cacheEntry:Object}|null}
 *          データが無い場合は null
 */
export function computeAll(products, sales, settings, cache) {
  const sortedDates = Object.keys(sales).sort();
  if (sortedDates.length === 0) return null;
  const lastDate = sortedDates[sortedDates.length - 1];
  const horizon = Math.max(1, (settings.leadTimeDays | 0) + (settings.orderCycleDays | 0));

  const hash = computeHash(products, sales, settings);
  const trustedMap = cache && cache.hash === hash ? cache.byProduct || {} : {};

  const byProduct = {};
  const cacheOut = {};
  for (const p of products) {
    if (p.active === false) continue;
    const start = firstSaleDate(sales, p.id, sortedDates);
    if (!start) {
      // 売上実績ゼロのSKU：予測不可として扱う（マスタには残す）
      byProduct[p.id] = { status: 'insufficient', method: null, mape: null, wape: null, sigma: 0, primary: 'mape', holdout: null, future: { dates: [], pred: [] }, trainDays: 0 };
      continue;
    }
    const dates = dateRange(start, lastDate);
    const series = seriesFor(sales, p.id, dates);
    const trusted = trustedMap[p.id] ? { method: trustedMap[p.id].method, hwParams: trustedMap[p.id].hwParams } : null;
    const result = analyzeProduct(series, dates, horizon, settings, trusted);
    byProduct[p.id] = result;
    cacheOut[p.id] = { method: result.method, hwParams: result.hwParams };
  }

  // 全SKU合計チャート用：全期間の日次合計（直近30日は呼び出し側でスライス）
  const globalDates = dateRange(sortedDates[0], lastDate);
  const globalActual = globalDates.map((d) => {
    const day = sales[d];
    if (!day) return 0;
    let s = 0;
    for (const v of Object.values(day)) s += v;
    return s;
  });

  return { lastDate, horizon, byProduct, globalDates, globalActual, cacheEntry: { hash, byProduct: cacheOut } };
}

/** キャッシュの読込（壊れていても null を返すだけで安全） */
export async function loadForecastCache() {
  return load('cache_forecast', null);
}

/** キャッシュの保存（失敗しても機能に影響なし＝導出値のため握りつぶさず警告のみ） */
export async function saveForecastCache(entry) {
  const ok = await save('cache_forecast', entry);
  if (!ok) console.warn('[engine] forecast cache save failed (derived data; safe to ignore)');
}

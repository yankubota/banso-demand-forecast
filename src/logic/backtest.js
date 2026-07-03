// spec.md §5 ADD-02：バックテストによる自動選択と、選択手法での将来予測。
// SKUごとに {status, method, mape, wape, sigma, holdout, future} を返す。純粋関数のみ。

import { fitMA, fitDOW, fitHW } from './forecast.js';
import { mape, wape, residualStd } from './metrics.js';
import { weekdayOf, addDays } from './dates.js';
import { METHOD_MA, METHOD_DOW, METHOD_HW, MIN_DAYS, HW_GRID } from '../constants/index.js';

/** 手法の優先順（タイブレーク最終手段：単純側を優先。spec §5） */
const METHOD_ORDER = [METHOD_MA, METHOD_DOW, METHOD_HW];

/**
 * 学習系列＋対象曜日列から、指定手法で h 日分の予測列を作る。
 * @param {string} method
 * @param {number[]} train
 * @param {number[]} trainWeekdays
 * @param {number[]} targetWeekdays 予測対象日の曜日列（長さ h）
 * @param {Object} settings
 * @param {{alpha:number,beta:number,gamma:number}|null} hwParams HWのとき必須
 * @returns {number[]|null} 予測列（負値は0にクリップ。spec §5）。学習不能なら null
 */
export function predictWith(method, train, trainWeekdays, targetWeekdays, settings, hwParams) {
  const h = targetWeekdays.length;
  let raw = null;
  if (method === METHOD_MA) {
    const f = fitMA(train, settings.maWindow);
    raw = targetWeekdays.map((_, i) => f(i + 1));
  } else if (method === METHOD_DOW) {
    const f = fitDOW(train, trainWeekdays, settings.dowWeeks, settings.maWindow);
    raw = targetWeekdays.map((wd, i) => f(i + 1, wd));
  } else if (method === METHOD_HW) {
    const model = fitHW(train, hwParams.alpha, hwParams.beta, hwParams.gamma);
    if (!model) return null;
    raw = Array.from({ length: h }, (_, i) => model.forecast(i + 1));
  } else {
    console.warn('[backtest] unknown method', method);
    return null;
  }
  return raw.map((v) => (v < 0 ? 0 : v)); // 負の予測は0にクリップ（spec §5）
}

/**
 * HWのグリッド探索：ホールドアウトMAPE最小（同率はWAPE）のパラメータを返す。
 */
function searchHW(train, trainWeekdays, holdActual, holdWeekdays, settings) {
  let best = null;
  for (const a of HW_GRID) {
    for (const b of HW_GRID) {
      for (const g of HW_GRID) {
        const params = { alpha: a, beta: b, gamma: g };
        const pred = predictWith(METHOD_HW, train, trainWeekdays, holdWeekdays, settings, params);
        if (!pred) continue;
        const m = mape(holdActual, pred);
        const w = wape(holdActual, pred);
        const cand = { params, pred, mape: m, wape: w };
        if (isBetter(cand, best)) best = cand;
      }
    }
  }
  return best;
}

/** 候補比較：MAPE最小 → WAPE最小（null は最劣後） */
function isBetter(a, b) {
  if (!b) return true;
  const am = a.mape;
  const bm = b.mape;
  if (am !== null && bm !== null && am !== bm) return am < bm;
  if (am !== null && bm === null) return true;
  if (am === null && bm !== null) return false;
  const aw = a.wape;
  const bw = b.wape;
  if (aw !== null && bw !== null && aw !== bw) return aw < bw;
  if (aw !== null && bw === null) return true;
  return false;
}

/**
 * 1SKUぶんのバックテスト＋自動選択＋将来予測。
 * @param {number[]} series 初売上日〜最終日のゼロ埋め系列
 * @param {string[]} dates series と同じ長さのISO日付
 * @param {number} horizon 将来予測日数（= leadTime + orderCycle, 最低1）
 * @param {Object} settings
 * @param {{method:string, hwParams?:Object}|null} trusted キャッシュ命中時：探索を省き当該手法のみ評価
 * @returns {Object} 結果オブジェクト（spec §5の項目を網羅）
 */
export function analyzeProduct(series, dates, horizon, settings, trusted = null) {
  const len = series.length;
  const lastDate = dates[dates.length - 1];
  const futureDates = Array.from({ length: horizon }, (_, i) => addDays(lastDate, i + 1));
  const futureWeekdays = futureDates.map(weekdayOf);
  const weekdays = dates.map(weekdayOf);

  // --- データ不足：実績7日未満は予測不可（spec §5 / §8 R-4） ---
  if (len < MIN_DAYS[METHOD_MA]) {
    return { status: 'insufficient', method: null, mape: null, wape: null, sigma: 0,
      primary: 'mape', holdout: null, future: { dates: futureDates, pred: futureDates.map(() => 0) },
      hwParams: null, trainDays: len };
  }

  // --- ホールドアウト幅：42日以上→14 / 未満→7（spec §5） ---
  const holdoutDays = len >= 42 ? settings.holdoutDays : 7;

  // --- 参考値フォールバック：学習が7日未満になる場合はバックテスト不能（README §実装ノート2） ---
  if (len - holdoutDays < MIN_DAYS[METHOD_MA]) {
    const predFuture = predictWith(METHOD_MA, series, weekdays, futureWeekdays, settings, null);
    // σは系列そのものの標準偏差で保守的に見積もる（誤差実測ができないため）
    const avg = series.reduce((s, v) => s + v, 0) / len;
    const sigma = Math.sqrt(series.reduce((s, v) => s + (v - avg) * (v - avg), 0) / len);
    return { status: 'reference', method: METHOD_MA, mape: null, wape: null, sigma,
      primary: 'wape', holdout: null, future: { dates: futureDates, pred: predFuture },
      hwParams: null, trainDays: len };
  }

  // --- バックテスト（train / holdout 分割） ---
  const train = series.slice(0, len - holdoutDays);
  const trainWd = weekdays.slice(0, len - holdoutDays);
  const holdActual = series.slice(len - holdoutDays);
  const holdDates = dates.slice(len - holdoutDays);
  const holdWd = holdDates.map(weekdayOf);

  /** @type {Array<{method:string, pred:number[], mape:number|null, wape:number|null, hwParams:Object|null}>} */
  const candidates = [];
  const tryMethod = (method, hwParams = null) => {
    const pred = predictWith(method, train, trainWd, holdWd, settings, hwParams);
    if (!pred) return;
    candidates.push({ method, pred, mape: mape(holdActual, pred), wape: wape(holdActual, pred), hwParams });
  };

  if (trusted && trusted.method) {
    // キャッシュ命中：選択済み手法のみ再評価（HWのグリッド探索を省略。spec §6 キャッシュ）
    tryMethod(trusted.method, trusted.hwParams ?? null);
  }
  if (candidates.length === 0) {
    if (train.length >= MIN_DAYS[METHOD_MA]) tryMethod(METHOD_MA);
    if (train.length >= MIN_DAYS[METHOD_DOW]) tryMethod(METHOD_DOW);
    if (train.length >= MIN_DAYS[METHOD_HW]) {
      const bestHW = searchHW(train, trainWd, holdActual, holdWd, settings);
      if (bestHW) candidates.push({ method: METHOD_HW, pred: bestHW.pred, mape: bestHW.mape, wape: bestHW.wape, hwParams: bestHW.params });
    }
  }

  // --- 自動選択：MAPE最小 → WAPE → 手法順（MA優先）（spec §5） ---
  let chosen = null;
  for (const method of METHOD_ORDER) {
    for (const c of candidates) {
      if (c.method !== method) continue;
      if (!chosen || isBetter(c, chosen)) chosen = c;
    }
  }
  if (!chosen) chosen = candidates[0]; // 理論上到達しない防御（MAは常に成立）

  // --- σ＝選択手法のホールドアウト残差の標準偏差（spec §5 ADD-04） ---
  const sigma = residualStd(holdActual, chosen.pred);

  // --- 主指標の切替：ホールドアウトの実績0日が50%超なら WAPE（spec §5 / §8 R-3） ---
  const zeroShare = holdActual.filter((v) => v === 0).length / holdActual.length;
  const primary = zeroShare > 0.5 ? 'wape' : 'mape';

  // --- 将来予測：選択手法を全系列で再学習して horizon 日分（spec §5） ---
  const futurePred = predictWith(chosen.method, series, weekdays, futureWeekdays, settings, chosen.hwParams);

  return {
    status: 'ok',
    method: chosen.method,
    mape: chosen.mape,
    wape: chosen.wape,
    sigma,
    primary,
    holdout: { dates: holdDates, actual: holdActual, pred: chosen.pred },
    future: { dates: futureDates, pred: futurePred ?? futureWeekdays.map(() => 0) },
    hwParams: chosen.hwParams ?? null,
    trainDays: len,
  };
}

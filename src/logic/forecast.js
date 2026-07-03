// spec.md §5 ADD-02：予測エンジン（MA / DOW / Holt-Winters加法）。純粋関数のみ。
// 実装ノート：各SKUの系列は「そのSKUの初売上日〜全データの最終日」を連続日でゼロ埋めして構築する
// （README_P0.md §実装ノート1 に解釈を記録済み）。

import { mean } from './metrics.js';
import { HW_PERIOD } from '../constants/index.js';

/**
 * 販売実績（疎辞書）から、指定SKUの連続日次系列を作る。
 * @param {Object} sales { date: { pid: qty } }
 * @param {string} pid
 * @param {string[]} dates 連続日付（このSKUの初売上日〜最終日）
 * @returns {number[]}
 */
export function seriesFor(sales, pid, dates) {
  return dates.map((d) => {
    const day = sales[d];
    const v = day ? day[pid] : undefined;
    return typeof v === 'number' ? v : 0; // 売上記録なし＝0（spec §6 疎形式）
  });
}

/**
 * 指定SKUの初売上日（qty>0 の最古日）を返す。
 * @returns {string|null}
 */
export function firstSaleDate(sales, pid, sortedDates) {
  for (const d of sortedDates) {
    const v = sales[d] && sales[d][pid];
    if (typeof v === 'number' && v > 0) return d;
  }
  return null;
}

/* ---------------- MA：移動平均（spec：直近N日の単純平均） ---------------- */

/**
 * @param {number[]} train 学習系列
 * @param {number} n 窓幅（既定28。系列が短ければ全期間）
 * @returns {(h:number)=>number} hステップ先の予測（定数）
 */
export function fitMA(train, n) {
  const w = Math.min(n, train.length);
  const v = w === 0 ? 0 : mean(train.slice(train.length - w));
  return () => v;
}

/* ------------- DOW：曜日プロファイル（同曜日の直近K週平均） ------------- */

/**
 * @param {number[]} train 学習系列
 * @param {number[]} trainWeekdays 学習系列の各日の曜日（0-6）
 * @param {number} k 参照週数（既定4）
 * @param {number} maWindow フォールバック用MA窓
 * @returns {(h:number, targetWeekday:number)=>number}
 */
export function fitDOW(train, trainWeekdays, k, maWindow) {
  // 曜日ごとに「新しい順」の値リストを前計算
  const byWd = [[], [], [], [], [], [], []];
  for (let i = train.length - 1; i >= 0; i--) {
    const wd = trainWeekdays[i];
    if (byWd[wd].length < k) byWd[wd].push(train[i]);
  }
  const maFallback = fitMA(train, maWindow)(1); // 該当曜日の実績が無い場合の代替（spec §5）
  return (_h, targetWeekday) => {
    const vals = byWd[targetWeekday];
    return vals.length === 0 ? maFallback : mean(vals);
  };
}

/* --------- HW：Holt-Winters 加法（周期7・初期値は spec §5 の定義） --------- */

/**
 * @param {number[]} train
 * @param {number} alpha
 * @param {number} beta
 * @param {number} gamma
 * @returns {{forecast:(h:number)=>number, level:number, trend:number, season:number[]}|null} 学習不能なら null
 */
export function fitHW(train, alpha, beta, gamma) {
  const m = HW_PERIOD;
  const len = train.length;
  if (len < m * 2) return null; // 初期化に最低2周期必要（適用条件28日はこの上位で担保）
  // 初期値（spec §5）：レベル＝先頭7日平均／トレンド＝(2周期目平均−1周期目平均)/m
  const level0 = mean(train.slice(0, m));
  const trend0 = (mean(train.slice(m, 2 * m)) - level0) / m;
  // 季節指数＝位置(mod 7)別平均 − 全体平均（加法）
  const grand = mean(train);
  const season = new Array(m).fill(0);
  const cnt = new Array(m).fill(0);
  for (let t = 0; t < len; t++) {
    season[t % m] += train[t];
    cnt[t % m]++;
  }
  for (let j = 0; j < m; j++) {
    season[j] = cnt[j] === 0 ? 0 : season[j] / cnt[j] - grand;
  }
  // 逐次更新（t = m .. len-1）
  let level = level0;
  let trend = trend0;
  for (let t = m; t < len; t++) {
    const sj = season[t % m];
    const y = train[t];
    const prevLevel = level;
    level = alpha * (y - sj) + (1 - alpha) * (prevLevel + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    season[t % m] = gamma * (y - level) + (1 - gamma) * sj;
  }
  const lastIndex = len - 1;
  return {
    level,
    trend,
    season,
    forecast: (h) => level + h * trend + season[(lastIndex + h) % m],
  };
}

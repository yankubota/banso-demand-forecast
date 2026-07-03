// spec.md §5 ADD-02：精度指標（MAPE / WAPE）と標準偏差。純粋関数のみ。

/**
 * MAPE（%）。実績0の日は計算から除外する（spec §5）。
 * @param {number[]} actual 実績
 * @param {number[]} pred 予測
 * @returns {number|null} 有効日が1日もなければ null
 */
export function mape(actual, pred) {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < actual.length; i++) {
    const a = actual[i];
    if (a === 0) continue; // ゼロ除算回避：実績0日は除外（spec §5 / §8 R-3）
    sum += Math.abs(a - pred[i]) / a;
    n++;
  }
  return n === 0 ? null : (sum / n) * 100;
}

/**
 * WAPE（%）＝ Σ|誤差| ÷ Σ実績。ゼロ売上が多いSKUの主指標（spec §2.5）。
 * @returns {number|null} Σ実績が0なら null
 */
export function wape(actual, pred) {
  let num = 0;
  let den = 0;
  for (let i = 0; i < actual.length; i++) {
    num += Math.abs(actual[i] - pred[i]);
    den += actual[i];
  }
  return den === 0 ? null : (num / den) * 100;
}

/**
 * 残差の（母集団）標準偏差。安全在庫のσに用いる（spec §5 ADD-04）。
 * @param {number[]} actual
 * @param {number[]} pred
 * @returns {number}
 */
export function residualStd(actual, pred) {
  const n = actual.length;
  if (n === 0) return 0;
  const res = actual.map((a, i) => a - pred[i]);
  const mean = res.reduce((s, v) => s + v, 0) / n;
  const varSum = res.reduce((s, v) => s + (v - mean) * (v - mean), 0) / n;
  return Math.sqrt(varSum);
}

/** 配列平均（空配列は0） */
export function mean(arr) {
  return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;
}

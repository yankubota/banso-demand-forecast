// spec.md §5 ADD-03：予測vs実績チャート（SVG内製・外部チャートライブラリ禁止）。
// 実績＝実線、予測（ホールドアウト＋将来）＝破線、将来部分に ±σ の帯を描く。
import React from 'react';
import { shortLabel } from '../../logic/dates.js';

const W = 640;
const H = 260;
const PAD = { top: 16, right: 12, bottom: 28, left: 44 };

/**
 * @param {{
 *  dates: string[], actual: (number|null)[],
 *  pred: (number|null)[],            // dates と同じ長さ。予測が無い位置は null
 *  bandLow?: (number|null)[], bandHigh?: (number|null)[],
 *  splitIndex?: number               // ここ以降が「将来」（縦の区切り線を描く）
 * }} props
 */
export default function LineChart({ dates, actual, pred, bandLow, bandHigh, splitIndex }) {
  const n = dates.length;
  if (n === 0) return <p className="muted">表示できるデータがありません。</p>;

  // Y軸レンジ：全系列の最大値（0始まり）。ゼロのみのときは 1 を上限にして潰れを防ぐ
  let maxV = 1;
  const scan = (arr) => {
    if (!arr) return;
    for (const v of arr) if (typeof v === 'number' && v > maxV) maxV = v;
  };
  scan(actual); scan(pred); scan(bandHigh);
  maxV = Math.ceil(maxV * 1.1);

  const x = (i) => PAD.left + (n === 1 ? 0 : (i * (W - PAD.left - PAD.right)) / (n - 1));
  const y = (v) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - v / maxV);

  /** null を跨いで分割した折れ線パスを作る */
  const linePath = (arr) => {
    let d = '';
    let pen = false;
    for (let i = 0; i < n; i++) {
      const v = arr[i];
      if (typeof v !== 'number') { pen = false; continue; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    }
    return d;
  };

  // 将来帯（bandLow/High が両方数値の連続区間のみ）
  let bandPath = '';
  if (bandLow && bandHigh) {
    const idx = [];
    for (let i = 0; i < n; i++) {
      if (typeof bandLow[i] === 'number' && typeof bandHigh[i] === 'number') idx.push(i);
    }
    if (idx.length >= 2) {
      bandPath = idx.map((i, k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(bandHigh[i]).toFixed(1)}`).join('')
        + idx.slice().reverse().map((i) => `L${x(i).toFixed(1)},${y(bandLow[i]).toFixed(1)}`).join('')
        + 'Z';
    }
  }

  // X軸ラベル：最大6個に間引く
  const step = Math.max(1, Math.ceil(n / 6));
  const ticks = [];
  for (let i = 0; i < n; i += step) ticks.push(i);
  if (ticks[ticks.length - 1] !== n - 1) ticks.push(n - 1);

  // Y軸目盛：0 / 中間 / 最大
  const yTicks = [0, Math.round(maxV / 2), maxV];

  return (
    <div className="chart-box">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="予測と実績の推移チャート">
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--color-border)" strokeWidth="1" />
            <text x={PAD.left - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="var(--color-text-muted)">{v}</text>
          </g>
        ))}
        {typeof splitIndex === 'number' && splitIndex > 0 && splitIndex < n ? (
          <line x1={x(splitIndex)} x2={x(splitIndex)} y1={PAD.top} y2={H - PAD.bottom}
            stroke="var(--color-text-muted)" strokeDasharray="2 4" strokeWidth="1" />
        ) : null}
        {bandPath ? <path d={bandPath} fill="var(--color-accent-subtle)" stroke="none" opacity="0.9" /> : null}
        <path d={linePath(actual)} fill="none" stroke="var(--color-text-primary)" strokeWidth="2" />
        <path d={linePath(pred)} fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeDasharray="5 4" />
        {ticks.map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--color-text-muted)">
            {shortLabel(dates[i])}
          </text>
        ))}
      </svg>
      <div className="legend">
        <span><span className="sw" style={{ background: 'var(--color-text-primary)' }} />実績</span>
        <span><span className="sw" style={{ background: 'var(--color-accent)' }} />予測（破線）</span>
        {bandPath ? <span><span className="sw" style={{ background: 'var(--color-accent-subtle)', height: 10 }} />将来の予測幅（±σ）</span> : null}
      </div>
    </div>
  );
}

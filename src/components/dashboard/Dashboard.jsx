// spec.md §5 ADD-03：ダッシュボード（今日の推奨カード／予測vs実績チャート／精度パネル）
import React, { useMemo, useState } from 'react';
import LineChart from '../shared/LineChart.jsx';
import { KpiCard, MethodBadge } from '../shared/ui.jsx';
import { labelWithWd } from '../../logic/dates.js';
import { useAppState, useAppDispatch } from '../../state/context.jsx';
import { VIEWS } from '../../constants/index.js';

const CHART_WINDOW = 30; // spec §5：直近30日

export default function Dashboard({ analysis, onLoadSample, sampleLoading }) {
  const { products, settings } = useAppState();
  const dispatch = useAppDispatch();
  const [selectedPid, setSelectedPid] = useState('ALL');

  // ---------- 空状態（spec §5：空画面を作らない） ----------
  if (!analysis) {
    return (
      <section className="card">
        <h2>はじめに</h2>
        <p className="muted">まだ販売データがありません。POS・レジのCSVを取り込むか、サンプルデータで動きを確認できます。データはこの端末内でのみ処理されます。</p>
        <div className="btn-row">
          <button className="btn primary" onClick={() => dispatch({ type: 'VIEW_SET', view: VIEWS.IMPORT })}>CSVを取り込む</button>
          <button className="btn" onClick={onLoadSample} disabled={sampleLoading}>{sampleLoading ? '読み込み中…' : 'サンプルデータを読み込む'}</button>
        </div>
      </section>
    );
  }

  const { byProduct, lastDate, globalDates, globalActual } = analysis;
  const nameOf = (pid) => products.find((p) => p.id === pid)?.name ?? pid;

  // ---------- 今日の推奨：future[0]（データ最終日の翌日）の予測 上位N ----------
  const todayList = useMemo(() => {
    const items = [];
    for (const [pid, r] of Object.entries(byProduct)) {
      if (r.status === 'insufficient' || !r.future.pred.length) continue;
      items.push({ pid, qty: Math.ceil(r.future.pred[0]), method: r.method, status: r.status });
    }
    items.sort((a, b) => b.qty - a.qty);
    return items.slice(0, settings.topN);
  }, [byProduct, settings.topN]);
  const todayLabel = useMemo(() => {
    const first = Object.values(byProduct).find((r) => r.future.dates.length > 0);
    return first ? labelWithWd(first.future.dates[0]) : '';
  }, [byProduct]);

  // ---------- 精度パネル：全体WAPE（全SKUホールドアウト加重）＋ワースト5 ----------
  const accuracy = useMemo(() => {
    let num = 0;
    let den = 0;
    const rows = [];
    for (const [pid, r] of Object.entries(byProduct)) {
      if (r.status !== 'ok') continue;
      for (let i = 0; i < r.holdout.actual.length; i++) {
        num += Math.abs(r.holdout.actual[i] - r.holdout.pred[i]);
        den += r.holdout.actual[i];
      }
      rows.push({ pid, mape: r.mape, wape: r.wape, primary: r.primary, method: r.method });
    }
    const overallWape = den === 0 ? null : (num / den) * 100;
    // ワースト5：主指標の降順（nullは対象外）
    const worst = rows
      .filter((r) => (r.primary === 'mape' ? r.mape !== null : r.wape !== null))
      .sort((a, b) => {
        const va = a.primary === 'mape' ? a.mape : a.wape;
        const vb = b.primary === 'mape' ? b.mape : b.wape;
        return vb - va;
      })
      .slice(0, 5);
    return { overallWape, worst, okCount: rows.length };
  }, [byProduct]);

  // ---------- チャートデータ（全SKU合計）：直近30日＋将来合計 ----------
  // ホールドアウト予測の重ね表示はSKU選択時のみ（README_P0 §実装ノート3）
  const chart = useMemo(() => {
    if (selectedPid !== 'ALL') return null;
    const win = Math.min(CHART_WINDOW, globalDates.length);
    const dates = globalDates.slice(-win);
    const actual = globalActual.slice(-win);
    const futureMap = new Map();
    for (const r of Object.values(byProduct)) {
      if (r.status === 'insufficient') continue;
      r.future.dates.forEach((d, i) => futureMap.set(d, (futureMap.get(d) ?? 0) + r.future.pred[i]));
    }
    const fDates = [...futureMap.keys()].sort();
    const allDates = [...dates, ...fDates];
    const allActual = [...actual, ...fDates.map(() => null)];
    const pred = [...dates.map(() => null), ...fDates.map((d) => futureMap.get(d))];
    // 連続性：将来線の始点を実績最終点につなぐ
    if (fDates.length && actual.length) pred[dates.length - 1] = actual[actual.length - 1];
    return { dates: allDates, actual: allActual, pred, bandLow: null, bandHigh: null, splitIndex: dates.length - 1 };
  }, [selectedPid, byProduct, globalDates, globalActual]);

  // SKU選択時にチャートへ渡す分析結果
  const productResult = selectedPid === 'ALL' ? null : byProduct[selectedPid] ?? null;

  return (
    <>
      <section className="card" aria-labelledby="today-h">
        <h2 id="today-h">今日の推奨 <span className="muted">対象日：{todayLabel}（データ最終日 {lastDate} の翌日）</span></h2>
        {todayList.length === 0 ? (
          <p className="muted">予測可能なSKUがまだありません（各SKUに7日以上の実績が必要です）。</p>
        ) : (
          <ol className="reco-list">
            {todayList.map((item) => (
              <li key={item.pid} className="reco-item">
                <span className="name">{nameOf(item.pid)}</span>
                <MethodBadge method={item.method} status={item.status} />
                <span className="qty">{item.qty}</span>
              </li>
            ))}
          </ol>
        )}
        <p className="tiny" style={{ marginTop: 'var(--space-3)' }}>
          注記：実績＝需要とみなすため、欠品していた日は実需より少なく学習されます（spec §8 R-2）。
        </p>
      </section>

      <section className="card" aria-labelledby="chart-h">
        <h2 id="chart-h">予測 vs 実績（直近{CHART_WINDOW}日）</h2>
        <div className="btn-row" style={{ marginBottom: 'var(--space-3)' }}>
          <select value={selectedPid} onChange={(e) => setSelectedPid(e.target.value)} aria-label="表示するSKU">
            <option value="ALL">全SKU合計</option>
            {products.filter((p) => p.active !== false).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {selectedPid !== 'ALL' ? <MethodBadge method={byProduct[selectedPid]?.method} status={byProduct[selectedPid]?.status} /> : null}
        </div>
        {selectedPid === 'ALL'
          ? (chart ? <LineChart {...chart} /> : <p className="muted">データがありません。</p>)
          : <ProductChart r={productResult && productResult.status !== 'insufficient' ? productResult : null} sigma={productResult?.sigma ?? 0} globalDates={globalDates} pid={selectedPid} />}
      </section>

      <section className="card" aria-labelledby="acc-h">
        <h2 id="acc-h">予測精度</h2>
        <div className="kpi-grid" style={{ marginBottom: 'var(--space-4)' }}>
          <KpiCard label="全体WAPE" value={accuracy.overallWape === null ? '—' : `${accuracy.overallWape.toFixed(1)}%`} sub="直近ホールドアウト・全SKU加重" />
          <KpiCard label="評価済みSKU" value={accuracy.okCount} sub="バックテスト実施数" />
        </div>
        <h3>精度ワースト5（改善対象）</h3>
        {accuracy.worst.length === 0 ? <p className="muted">評価対象がありません。</p> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>商品</th><th>採用手法</th><th className="num">MAPE</th><th className="num">WAPE</th></tr>
              </thead>
              <tbody>
                {accuracy.worst.map((r) => (
                  <tr key={r.pid}>
                    <td>{nameOf(r.pid)}</td>
                    <td><MethodBadge method={r.method} status="ok" /></td>
                    <td className="num">{r.mape === null ? '—' : `${r.mape.toFixed(1)}%`}{r.primary === 'mape' ? ' ★' : ''}</td>
                    <td className="num">{r.wape === null ? '—' : `${r.wape.toFixed(1)}%`}{r.primary === 'wape' ? ' ★' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="tiny">★＝主指標。売上ゼロの日が多いSKUはWAPEを主指標にしています（MAPEのゼロ除算対策）。</p>
      </section>
    </>
  );
}

/** SKU選択時のチャート：実績（直近30日）＋ホールドアウト予測の重ね＋将来（±σ帯） */
function ProductChart({ r, sigma, globalDates, pid }) {
  const { sales } = useAppState();
  const data = useMemo(() => {
    if (!r) return null;
    const win = 30;
    const dates = globalDates.slice(-win);
    const actual = dates.map((d) => (sales[d] && typeof sales[d][pid] === 'number' ? sales[d][pid] : 0));
    // ホールドアウト予測を同じ日付軸に重ねる
    const predMap = new Map();
    if (r.holdout) r.holdout.dates.forEach((d, i) => predMap.set(d, r.holdout.pred[i]));
    r.future.dates.forEach((d, i) => predMap.set(d, r.future.pred[i]));
    const fDates = r.future.dates;
    const allDates = [...dates, ...fDates];
    const allActual = [...actual, ...fDates.map(() => null)];
    const pred = allDates.map((d) => (predMap.has(d) ? predMap.get(d) : null));
    const bandLow = allDates.map((d, i) => (i >= dates.length && predMap.has(d) ? Math.max(0, predMap.get(d) - sigma) : null));
    const bandHigh = allDates.map((d, i) => (i >= dates.length && predMap.has(d) ? predMap.get(d) + sigma : null));
    return { dates: allDates, actual: allActual, pred, bandLow, bandHigh, splitIndex: dates.length - 1 };
  }, [r, sigma, globalDates, pid, sales]);

  if (!r) return <p className="muted">このSKUは実績7日未満のため予測できません（データ蓄積をお待ちください）。</p>;
  return <LineChart {...data} />;
}

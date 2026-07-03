// spec.md §5 ADD-04：発注推奨＋帳票出力（現在庫を入力→SKU別推奨量→発注書CSV）
import React, { useMemo } from 'react';
import { recommendQty, orderCsv } from '../../logic/order.js';
import { downloadText, stampDate } from '../../logic/download.js';
import { MethodBadge } from '../shared/ui.jsx';
import { useAppState, useAppDispatch } from '../../state/context.jsx';

export default function OrderView({ analysis }) {
  const { products, settings } = useAppState();
  const dispatch = useAppDispatch();

  if (!analysis) {
    return (
      <section className="card">
        <h2>発注推奨</h2>
        <p className="muted">販売データを取り込むと、SKU別の発注推奨量がここに表示されます。</p>
      </section>
    );
  }

  const horizon = analysis.horizon;
  const stock = settings.currentStock ?? {};

  // 推奨行の計算（未入力在庫は0扱い＝画面に明示。spec §5 ADD-04）
  const rows = useMemo(() => {
    const out = [];
    for (const p of products) {
      if (p.active === false) continue;
      const r = analysis.byProduct[p.id];
      if (!r || r.status === 'insufficient') continue;
      const st = stock[p.id];
      const { recommended, forecastSum, safety } = recommendQty(r.future.pred, r.sigma, settings, st ?? 0);
      out.push({
        pid: p.id, name: p.name, code: p.code ?? '',
        method: r.method, status: r.status,
        forecastSum, safety, stock: st, recommended,
      });
    }
    out.sort((a, b) => b.recommended - a.recommended);
    return out;
  }, [products, analysis, settings, stock]);

  const positives = rows.filter((r) => r.recommended > 0);
  const zeros = rows.filter((r) => r.recommended === 0);

  const exportCsv = () => {
    const csv = orderCsv(rows.map((r) => ({ ...r, stock: r.stock ?? 0 })));
    downloadText(csv, `order_${stampDate()}.csv`, 'text/csv');
  };

  return (
    <section className="card" aria-labelledby="order-h">
      <h2 id="order-h">発注推奨 <span className="muted">対象：翌日から {horizon} 日分（リードタイム {settings.leadTimeDays} 日＋発注サイクル {settings.orderCycleDays} 日）</span></h2>
      <p className="muted">
        推奨量 ＝ 予測合計 ＋ 安全在庫（サービス水準 {settings.serviceLevel}%）− 現在庫。
        現在庫が空欄のSKUは <strong>0（在庫なし）</strong> として計算します。
      </p>
      <div className="btn-row" style={{ margin: 'var(--space-3) 0' }}>
        <button className="btn primary" onClick={exportCsv} disabled={rows.length === 0}>発注書CSVをダウンロード</button>
        <span className="tiny">UTF-8（BOM付き）・Excelでそのまま開けます</span>
      </div>
      {rows.length === 0 ? <p className="muted">推奨対象のSKUがありません（各SKUに7日以上の実績が必要です）。</p> : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>商品</th><th>手法</th><th className="num">予測合計</th><th className="num">安全在庫</th><th className="num">現在庫</th><th className="num">推奨量</th></tr>
              </thead>
              <tbody>
                {positives.map((r) => <OrderRow key={r.pid} row={r} dispatch={dispatch} />)}
              </tbody>
            </table>
          </div>
          {zeros.length > 0 ? (
            <details className="fold" style={{ marginTop: 'var(--space-3)' }}>
              <summary>推奨量0のSKU（{zeros.length}件）を表示</summary>
              <div className="table-wrap" style={{ marginTop: 'var(--space-2)' }}>
                <table>
                  <tbody>
                    {zeros.map((r) => <OrderRow key={r.pid} row={r} dispatch={dispatch} />)}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}
        </>
      )}
    </section>
  );
}

/** 発注テーブルの1行。レンダー内で定義すると入力のたびに再マウントされフォーカスが失われるため、
    モジュールレベルに置く（React の再レンダー仕様への対処） */
function OrderRow({ row, dispatch }) {
  return (
    <tr>
      <td>{row.name}</td>
      <td><MethodBadge method={row.method} status={row.status} /></td>
      <td className="num">{(Math.round(row.forecastSum * 10) / 10).toFixed(1)}</td>
      <td className="num">{(Math.round(row.safety * 10) / 10).toFixed(1)}</td>
      <td className="num">
        <input
          className="stock-input"
          type="number"
          min="0"
          inputMode="numeric"
          placeholder="0"
          aria-label={row.name + ' の現在庫'}
          value={row.stock ?? ''}
          onChange={(e) => dispatch({ type: 'STOCK_SET', productId: row.pid, qty: e.target.value === '' ? null : Number(e.target.value) })}
        />
      </td>
      <td className="num"><strong>{row.recommended}</strong></td>
    </tr>
  );
}

// spec.md §5 ADD-01：CSV取込ウィザード（Step1 ファイル → Step2 列マッピング → Step3 確認・取込）
import React, { useMemo, useState } from 'react';
import { decodeCsv, parseCsv, normalizeRows, mergeImport, errorsToCsv } from '../../logic/csv.js';
import { downloadText, stampDate } from '../../logic/download.js';
import { useAppState, useAppDispatch } from '../../state/context.jsx';
import { VIEWS } from '../../constants/index.js';

const STEP_LABELS = ['ファイル選択', '列の対応付け', '確認・取込'];

/** 列見出しから初期マッピングを推定する（ユーザーはStep2で必ず確認できる） */
function guessMapping(header) {
  const find = (words) => header.findIndex((h) => words.some((w) => String(h).includes(w)));
  return {
    date: find(['日付', '日時', '売上日', 'date', 'Date', 'DATE']),
    product: find(['商品', '品名', 'メニュー', 'product', 'item', 'name']),
    qty: find(['数量', '点数', '個数', '販売数', 'qty', 'quantity', 'count']),
  };
}

export default function ImportWizard() {
  const { products, sales } = useAppState();
  const dispatch = useAppDispatch();

  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState('');
  const [encoding, setEncoding] = useState('');
  const [rows, setRows] = useState([]);           // パース済み全行
  const [hasHeader, setHasHeader] = useState(true);
  const [map, setMap] = useState({ date: -1, product: -1, qty: -1 });
  const [drag, setDrag] = useState(false);
  const [fileError, setFileError] = useState('');
  const [done, setDone] = useState(null);         // 取込完了サマリ

  /** ファイルを読み込んでStep2へ */
  const readFile = async (file) => {
    setFileError('');
    setDone(null);
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const { text, encoding: enc } = decodeCsv(buf);
      const parsed = parseCsv(text);
      if (parsed.length === 0) {
        setFileError('有効な行がありません。CSVの内容をご確認ください。');
        return;
      }
      setFileName(file.name);
      setEncoding(enc);
      setRows(parsed);
      setMap(guessMapping(parsed[0] ?? []));
      setHasHeader(true);
      setStep(1);
    } catch (e) {
      // 読込失敗時も既存データには一切触れない（spec §0 非破壊）
      console.warn('[import] file read failed', e);
      setFileError('ファイルの読み込みに失敗しました。別のファイルでお試しください。');
    }
  };

  const columnCount = rows[0]?.length ?? 0;
  const columnOptions = Array.from({ length: columnCount }, (_, i) => ({
    value: i,
    label: hasHeader && rows[0] ? `${i + 1}列目：${rows[0][i] ?? ''}` : `${i + 1}列目`,
  }));

  const mappingReady = map.date >= 0 && map.product >= 0 && map.qty >= 0
    && new Set([map.date, map.product, map.qty]).size === 3;

  /** Step3用：正規化＋統計（重い処理ではないため useMemo で都度計算） */
  const preview = useMemo(() => {
    if (step < 2 || !mappingReady) return null;
    const norm = normalizeRows(rows, { ...map, hasHeader });
    const merged = mergeImport(products, sales, norm.records);
    return { ...norm, merged };
  }, [step, rows, map, hasHeader, mappingReady, products, sales]);

  /** 取込実行（reducer は結果を受け取るだけ。ロジックは logic/csv.js） */
  const commit = () => {
    if (!preview || preview.records.length === 0) return;
    dispatch({ type: 'IMPORT_COMMITTED', payload: { products: preview.merged.products, sales: preview.merged.sales } });
    setDone({ ...preview.stats, newProducts: preview.merged.newProducts, overlapDays: preview.merged.overlapDays });
    setStep(0);
    setRows([]);
    setFileName('');
  };

  return (
    <section className="card" aria-labelledby="import-h">
      <h2 id="import-h">CSV取込ウィザード</h2>
      <div className="steps">
        {STEP_LABELS.map((label, i) => (
          <span key={label} className={`step${i === step ? ' on' : ''}`}>
            <span className="dot">{i + 1}</span>{label}
            {i < STEP_LABELS.length - 1 ? <span aria-hidden="true">→</span> : null}
          </span>
        ))}
      </div>

      {done ? (
        <div className="notice" role="status">
          取込が完了しました：{done.validRows}件（SKU {done.skuCount}／期間 {done.from}〜{done.to}
          {done.newProducts ? `／新規商品 ${done.newProducts}` : ''}
          {done.overlapDays ? `／上書きした日 ${done.overlapDays}日` : ''}）。
          <button className="btn" style={{ marginLeft: 'var(--space-3)' }}
            onClick={() => dispatch({ type: 'VIEW_SET', view: VIEWS.DASHBOARD })}>ダッシュボードを見る</button>
        </div>
      ) : null}

      {step === 0 ? (
        <>
          <p className="muted">「日付・商品・数量」の3列があるCSVならそのまま取り込めます（UTF-8／Shift_JIS 自動判定）。データはこの端末内でのみ処理され、外部には送信されません。</p>
          <label
            className={`dropzone${drag ? ' drag' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); readFile(e.dataTransfer.files?.[0]); }}
          >
            ここにCSVをドラッグ&ドロップ、またはクリックして選択
            <input type="file" accept=".csv,text/csv" style={{ display: 'none' }}
              onChange={(e) => readFile(e.target.files?.[0])} />
          </label>
          {fileError ? <p className="notice danger" role="alert" style={{ marginTop: 'var(--space-3)' }}>{fileError}</p> : null}
        </>
      ) : null}

      {step === 1 ? (
        <>
          <p className="muted">{fileName}（{encoding === 'shift_jis' ? 'Shift_JIS として読み込み' : 'UTF-8'}／{rows.length}行）</p>
          <label style={{ display: 'block', margin: 'var(--space-2) 0' }}>
            <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} /> 1行目は見出し行
          </label>
          <div className="map-grid">
            {[
              ['date', '日付の列（必須）'],
              ['product', '商品の列（必須）'],
              ['qty', '数量の列（必須）'],
            ].map(([key, label]) => (
              <label key={key}>
                <span>{label}</span>
                <select value={map[key]} onChange={(e) => setMap({ ...map, [key]: Number(e.target.value) })}>
                  <option value={-1}>選択してください</option>
                  {columnOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            ))}
          </div>
          <h3>先頭10行プレビュー</h3>
          <div className="table-wrap">
            <table>
              <tbody>
                {rows.slice(0, 10).map((r, i) => (
                  <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="btn-row" style={{ marginTop: 'var(--space-4)' }}>
            <button className="btn" onClick={() => setStep(0)}>戻る</button>
            <button className="btn primary" disabled={!mappingReady} onClick={() => setStep(2)}>確認へ進む</button>
            {!mappingReady ? <span className="tiny">3列を重複なく指定してください</span> : null}
          </div>
        </>
      ) : null}

      {step === 2 && preview ? (
        <>
          <div className="kpi-grid" style={{ marginBottom: 'var(--space-4)' }}>
            <div className="kpi"><div className="label">有効行</div><div className="value">{preview.stats.validRows}</div></div>
            <div className="kpi"><div className="label">SKU数</div><div className="value">{preview.stats.skuCount}</div><div className="sub">新規 {preview.merged.newProducts}</div></div>
            <div className="kpi"><div className="label">期間</div><div className="value" style={{ fontSize: 'var(--text-base)' }}>{preview.stats.from} 〜 {preview.stats.to}</div></div>
            <div className="kpi"><div className="label">エラー行</div><div className="value">{preview.stats.errorRows}</div></div>
          </div>
          {preview.merged.overlapDays > 0 ? (
            <p className="notice warn">既存データと重複する {preview.merged.overlapDays} 日分は、取込内容で<strong>上書き</strong>されます（加算はしません）。</p>
          ) : null}
          {preview.errors.length > 0 ? (
            <p className="notice">
              {preview.errors.length}行をスキップします（日付不正・数量非数値など）。
              <button className="btn" style={{ marginLeft: 'var(--space-3)' }}
                onClick={() => downloadText(errorsToCsv(preview.errors), `import_errors_${stampDate()}.csv`, 'text/csv')}>
                エラー行をCSVで保存
              </button>
            </p>
          ) : null}
          <div className="btn-row" style={{ marginTop: 'var(--space-4)' }}>
            <button className="btn" onClick={() => setStep(1)}>戻る</button>
            <button className="btn primary" disabled={preview.records.length === 0} onClick={commit}>この内容で取り込む</button>
          </div>
        </>
      ) : null}
    </section>
  );
}

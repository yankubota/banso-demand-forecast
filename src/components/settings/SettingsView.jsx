// spec.md §5 ADD-05・§6・§7：設定（予測パラメータ／JSONバックアップ・復元／共有端末注意の常設表示）
import React, { useRef, useState } from 'react';
import { exportJson, validateImport } from '../../logic/backup.js';
import { estimateSize } from '../../logic/storage.js';
import { STORAGE_WARN_BYTES, Z_TABLE } from '../../constants/index.js';
import { useAppState, useAppDispatch } from '../../state/context.jsx';

/** 数値設定の入力（範囲クランプつき） */
function NumField({ label, value, min, max, onCommit, help }) {
  return (
    <label style={{ display: 'grid', gap: 'var(--space-1)', fontSize: 'var(--text-sm)' }}>
      <span>{label}</span>
      <input
        type="number" min={min} max={max} value={value} inputMode="numeric"
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isFinite(n)) return; // 不正入力は反映しない（既存値を守る）
          onCommit(Math.min(max, Math.max(min, Math.round(n))));
        }}
      />
      {help ? <span className="tiny">{help}</span> : null}
    </label>
  );
}

export default function SettingsView({ onLoadSample, sampleLoading }) {
  const state = useAppState();
  const { products, sales, settings } = state;
  const dispatch = useAppDispatch();
  const fileRef = useRef(null);
  const [importMsg, setImportMsg] = useState(null); // {type:'ok'|'err', text}

  const patch = (p) => dispatch({ type: 'SETTINGS_PATCHED', patch: p });
  const sizeMb = estimateSize({ products, sales, settings }) / (1024 * 1024);

  /** JSONインポート：検証 → 自動バックアップ → 確認 → 全置換（spec §5 ADD-05） */
  const handleImportFile = async (file) => {
    setImportMsg(null);
    if (!file) return;
    let text = '';
    try {
      text = await file.text();
    } catch (e) {
      console.warn('[settings] backup file read failed', e);
      setImportMsg({ type: 'err', text: 'ファイルを読み込めませんでした。' });
      return;
    }
    const v = validateImport(text);
    if (!v.ok) {
      setImportMsg({ type: 'err', text: `取り込めません：${v.reason}` });
      return;
    }
    // ① 実行前に現行データを自動エクスポート（誤操作からの復旧路を必ず残す）
    exportJson({ products, sales, settings });
    // ② 置換内容を確認（SKU数・期間を明示）
    const ok = window.confirm(
      `現在のデータを置き換えます。\n\n取込内容：SKU ${v.summary.skuCount}件／${v.summary.days}日分` +
      (v.summary.from ? `（${v.summary.from} 〜 ${v.summary.to}）` : '') +
      `\n\n※直前に現在のデータのバックアップを自動ダウンロードしました。続行しますか？`
    );
    if (!ok) {
      setImportMsg({ type: 'ok', text: '取込を中止しました（現行データは変更されていません）。' });
      return;
    }
    dispatch({ type: 'DATA_REPLACED', payload: v.data });
    setImportMsg({ type: 'ok', text: `復元しました：SKU ${v.summary.skuCount}件／${v.summary.days}日分。` });
  };

  return (
    <>
      <section className="card" aria-labelledby="param-h">
        <h2 id="param-h">予測・発注パラメータ</h2>
        <div className="map-grid">
          <label style={{ display: 'grid', gap: 'var(--space-1)', fontSize: 'var(--text-sm)' }}>
            <span>サービス水準（欠品させない確率）</span>
            <select value={settings.serviceLevel} onChange={(e) => patch({ serviceLevel: Number(e.target.value) })}>
              {Object.keys(Z_TABLE).map((lv) => <option key={lv} value={lv}>{lv}%（z={Z_TABLE[lv]}）</option>)}
            </select>
            <span className="tiny">高いほど安全在庫が増えます</span>
          </label>
          <NumField label="リードタイム（日）" value={settings.leadTimeDays} min={0} max={30}
            onCommit={(v) => patch({ leadTimeDays: v })} help="発注から納品までの日数" />
          <NumField label="発注サイクル（日）" value={settings.orderCycleDays} min={1} max={30}
            onCommit={(v) => patch({ orderCycleDays: v })} help="発注の間隔" />
          <NumField label="移動平均の窓（日）" value={settings.maWindow} min={7} max={90}
            onCommit={(v) => patch({ maWindow: v })} help="MA手法が平均する日数（既定28）" />
          <NumField label="曜日平均の週数" value={settings.dowWeeks} min={2} max={8}
            onCommit={(v) => patch({ dowWeeks: v })} help="DOW手法が参照する同曜日の週数（既定4）" />
          <NumField label="今日の推奨の表示件数" value={settings.topN} min={3} max={30}
            onCommit={(v) => patch({ topN: v })} />
        </div>
        <p className="tiny" style={{ marginTop: 'var(--space-3)' }}>
          パラメータ変更は即時に再計算へ反映されます（保存操作は不要）。
        </p>
      </section>

      <section className="card" aria-labelledby="backup-h">
        <h2 id="backup-h">バックアップ（JSONエクスポート／インポート）</h2>
        <p className="muted">
          全データ（商品・販売実績・設定）を1ファイルに書き出し・復元できます。
          端末の変更・ブラウザのデータ消去に備え、<strong>週1回のエクスポートを推奨</strong>します。
        </p>
        <div className="btn-row">
          <button className="btn primary" onClick={() => exportJson({ products, sales, settings })}>エクスポート（保存）</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>インポート（復元）</button>
          <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }}
            onChange={(e) => { handleImportFile(e.target.files?.[0]); e.target.value = ''; }} />
          <span className="tiny">現在のデータ量：約 {sizeMb.toFixed(2)} MB</span>
        </div>
        {importMsg ? (
          <p className={`notice ${importMsg.type === 'err' ? 'danger' : ''}`} role="status" style={{ marginTop: 'var(--space-3)' }}>
            {importMsg.text}
          </p>
        ) : null}
        {sizeMb * 1024 * 1024 > STORAGE_WARN_BYTES ? (
          <p className="notice warn" style={{ marginTop: 'var(--space-3)' }}>
            データ量が4MBを超えています。ブラウザ保存の上限に近づくと保存に失敗する恐れがあります。
            エクスポートで古い期間を退避することをご検討ください（spec §6）。
          </p>
        ) : null}
      </section>

      <section className="card" aria-labelledby="sample-h">
        <h2 id="sample-h">サンプルデータ</h2>
        <p className="muted">動作確認用のサンプル（菓子店を想定した約150日分）を取り込めます。既存データがある場合は上書き取込になります。</p>
        <button className="btn" onClick={onLoadSample} disabled={sampleLoading}>{sampleLoading ? '読み込み中…' : 'サンプルデータを読み込む'}</button>
      </section>

      <section className="card" aria-labelledby="sec-h">
        <h2 id="sec-h">データの取り扱い（必ずお読みください）</h2>
        <p className="notice warn">
          販売データは<strong>この端末のブラウザ内にのみ</strong>保存され、外部には送信されません。
          一方で暗号化はされないため、<strong>共有端末（家族・複数スタッフで共用するPC等）での利用は非推奨</strong>です。
          端末の紛失・譲渡の前には、ブラウザのサイトデータ削除をお願いします（spec §7）。
        </p>
      </section>
    </>
  );
}

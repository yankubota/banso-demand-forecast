// アプリの結線：起動時ロード（HYDRATED）→ 正データ変更で永続化 → 予測はuseMemoで導出（spec §6）
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppProvider, useAppState, useAppDispatch } from './state/context.jsx';
import { Nav } from './components/shared/ui.jsx';
import Dashboard from './components/dashboard/Dashboard.jsx';
import ImportWizard from './components/import/ImportWizard.jsx';
import OrderView from './components/order/OrderView.jsx';
import SettingsView from './components/settings/SettingsView.jsx';
import { load, save } from './logic/storage.js';
import { computeAll, loadForecastCache, saveForecastCache } from './logic/engine.js';
import { decodeCsv, parseCsv, normalizeRows, mergeImport } from './logic/csv.js';
import { VIEWS, SCHEMA_VERSION, DEFAULT_SETTINGS } from './constants/index.js';

function AppInner() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { hydrated, view, products, sales, settings } = state;
  const hydrating = useRef(false);
  const [cache, setCache] = useState(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [sampleLoading, setSampleLoading] = useState(false);

  // ---------- 起動時ロード（StrictModeの二重実行をrefでガード） ----------
  useEffect(() => {
    if (hydrating.current) return;
    hydrating.current = true;
    (async () => {
      try {
        const [p, s, st, meta, c] = await Promise.all([
          load('products', []),
          load('sales', {}),
          load('settings', DEFAULT_SETTINGS),
          load('meta', null),
          loadForecastCache(),
        ]);
        // スキーマ版数の記録（旧版→現行のマイグレーションは将来ここに追加）
        if (!meta || meta.schemaVersion !== SCHEMA_VERSION) {
          await save('meta', { schemaVersion: SCHEMA_VERSION });
        }
        setCache(c);
        dispatch({ type: 'HYDRATED', payload: { products: p, sales: s, settings: st } });
      } catch (e) {
        // ロード失敗でも空状態で起動する（アプリを固めない）
        console.warn('[app] hydrate failed', e);
        dispatch({ type: 'HYDRATED', payload: { products: [], sales: {}, settings: DEFAULT_SETTINGS } });
      }
    })();
  }, [dispatch]);

  // ---------- 正データの永続化（reducerの外側で副作用を集約） ----------
  useEffect(() => {
    if (!hydrated) return; // 初期ロード前の空状態で上書きしない
    (async () => {
      const okP = await save('products', products);
      const okS = await save('sales', sales);
      const okT = await save('settings', settings);
      setSaveFailed(!(okP && okS && okT)); // 容量超過等はバナーで通知（spec §6）
    })();
  }, [hydrated, products, sales, settings]);

  // ---------- 予測の導出（正データ＋設定から常に再計算可能。キャッシュはHW探索の省略のみ） ----------
  const analysis = useMemo(() => {
    if (!hydrated) return null;
    try {
      return computeAll(products, sales, settings, cache);
    } catch (e) {
      // 計算失敗はデータを壊さない（表示だけ諦める）
      console.warn('[app] computeAll failed', e);
      return null;
    }
  }, [hydrated, products, sales, settings, cache]);

  // 計算結果のキャッシュ保存（導出値・失敗しても無害）
  useEffect(() => {
    if (analysis && analysis.cacheEntry) saveForecastCache(analysis.cacheEntry);
  }, [analysis]);

  // ---------- サンプルデータの取込（ADD-01と同じ経路を通して検証を兼ねる） ----------
  const onLoadSample = async () => {
    setSampleLoading(true);
    try {
      const res = await fetch(import.meta.env.BASE_URL + 'sample_sales.csv');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      const { text } = decodeCsv(buf);
      const rows = parseCsv(text);
      // サンプルの列順は固定（日付,商品名,数量・見出しあり）
      const { records } = normalizeRows(rows, { date: 0, product: 1, qty: 2, hasHeader: true });
      const merged = mergeImport(products, sales, records);
      dispatch({ type: 'IMPORT_COMMITTED', payload: { products: merged.products, sales: merged.sales } });
      dispatch({ type: 'VIEW_SET', view: VIEWS.DASHBOARD });
    } catch (e) {
      console.warn('[app] sample load failed', e);
      alert('サンプルデータの読み込みに失敗しました。通信環境をご確認ください。');
    } finally {
      setSampleLoading(false);
    }
  };

  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-title">需要予測ダッシュボード<small>仮称・v0.1.0</small></div>
          <Nav view={view} onChange={(v) => dispatch({ type: 'VIEW_SET', view: v })} />
        </div>
      </header>
      <main className="main">
        {saveFailed ? (
          <p className="notice danger" role="alert">
            データの保存に失敗しました（ブラウザ保存容量の上限の可能性）。設定画面からエクスポートでバックアップを取得してください。
          </p>
        ) : null}
        {!hydrated ? <p className="muted">読み込み中…</p> : (
          <>
            {view === VIEWS.DASHBOARD ? <Dashboard analysis={analysis} onLoadSample={onLoadSample} sampleLoading={sampleLoading} /> : null}
            {view === VIEWS.IMPORT ? <ImportWizard /> : null}
            {view === VIEWS.ORDER ? <OrderView analysis={analysis} /> : null}
            {view === VIEWS.SETTINGS ? <SettingsView onLoadSample={onLoadSample} sampleLoading={sampleLoading} /> : null}
          </>
        )}
        <p className="tiny" style={{ textAlign: 'center' }}>
          データは端末内でのみ処理・保存されます（外部送信なし）。© 株式会社Banso
        </p>
      </main>
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}

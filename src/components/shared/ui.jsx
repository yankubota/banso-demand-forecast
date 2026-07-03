// 共通小部品：KPIカード・バッジ・ナビ（banso-design-system：PascalCase／variantはpropで表現）
import React from 'react';
import { VIEWS, METHOD_MA, METHOD_DOW, METHOD_HW } from '../../constants/index.js';

/** KPIカード */
export function KpiCard({ label, value, sub }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  );
}

const METHOD_LABEL = {
  [METHOD_MA]: 'MA 移動平均',
  [METHOD_DOW]: 'DOW 曜日',
  [METHOD_HW]: 'HW 季節',
};

/** 採用手法バッジ（spec §5：根拠の見える化） */
export function MethodBadge({ method, status }) {
  if (status === 'insufficient') return <span className="badge warn">データ不足</span>;
  if (status === 'reference') return <span className="badge warn">参考値</span>;
  if (!method) return null;
  return <span className="badge accent">{METHOD_LABEL[method] ?? method}</span>;
}

const NAV_ITEMS = [
  { id: VIEWS.DASHBOARD, label: 'ダッシュボード' },
  { id: VIEWS.IMPORT, label: 'CSV取込' },
  { id: VIEWS.ORDER, label: '発注' },
  { id: VIEWS.SETTINGS, label: '設定' },
];

/** ヘッダーナビ */
export function Nav({ view, onChange }) {
  return (
    <nav className="nav" aria-label="主要画面">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          className={view === item.id ? 'active' : ''}
          aria-current={view === item.id ? 'page' : undefined}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

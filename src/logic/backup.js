// spec.md §5 ADD-05：JSONエクスポート／インポート（Reward Timer ADD-01 と同一パターンの新規実装）
import { SCHEMA_VERSION } from '../constants/index.js';
import { downloadText, stampDate } from './download.js';

/**
 * 全正データを1ファイルにエクスポートする。
 * @param {Object} bundle {products, sales, settings}
 */
export function exportJson(bundle) {
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    products: bundle.products,
    sales: bundle.sales,
    settings: bundle.settings,
  };
  downloadText(JSON.stringify(payload, null, 2), `df_backup_${stampDate(true)}.json`, 'application/json');
}

/**
 * インポートファイルを検証する（実データ置換は呼び出し側で確認後に実施）。
 * @param {string} text ファイル内容
 * @returns {{ok:true, data:Object, summary:Object}|{ok:false, reason:string}}
 */
export function validateImport(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    return { ok: false, reason: 'JSONとして読み取れませんでした' };
  }
  if (typeof obj !== 'object' || obj === null) return { ok: false, reason: '形式が不正です' };
  const v = obj.schemaVersion;
  if (typeof v !== 'number') return { ok: false, reason: 'schemaVersion がありません' };
  if (v > SCHEMA_VERSION) return { ok: false, reason: `このアプリより新しい形式（v${v}）のため取り込めません` }; // 未来版は拒否（spec §5）
  // v < 現行版のマイグレーションは将来ここに追加（現行 v1 のみ）
  if (!Array.isArray(obj.products) || typeof obj.sales !== 'object' || typeof obj.settings !== 'object') {
    return { ok: false, reason: 'products / sales / settings のいずれかが欠けています' };
  }
  const dates = Object.keys(obj.sales).sort();
  const summary = {
    skuCount: obj.products.length,
    days: dates.length,
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
  };
  return { ok: true, data: { products: obj.products, sales: obj.sales, settings: obj.settings }, summary };
}

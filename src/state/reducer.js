// spec.md §6 / banso-tech-stack：単方向データフロー。reducer は純粋に保ち、永続化は App 側で行う。
import { DEFAULT_SETTINGS, VIEWS } from '../constants/index.js';

export const initialState = {
  hydrated: false,          // 起動時ロード完了フラグ
  view: VIEWS.DASHBOARD,
  products: [],             // 正データ：商品カタログ（df_products）
  sales: {},                // 正データ：販売実績・疎辞書（df_sales）
  settings: { ...DEFAULT_SETTINGS }, // 正データ：設定（df_settings）
};

/**
 * 全状態遷移。副作用（storage 書込）は禁止（banso-tech-stack 設計原則3）。
 */
export function appReducer(state, action) {
  switch (action.type) {
    case 'HYDRATED': {
      const { products, sales, settings } = action.payload;
      return {
        ...state,
        hydrated: true,
        products: products ?? [],
        sales: sales ?? {},
        settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}) }, // 将来の設定追加に前方互換
      };
    }
    case 'VIEW_SET':
      return { ...state, view: action.view };
    case 'IMPORT_COMMITTED': {
      // csv.mergeImport の結果をそのまま反映（ロジックは logic/ 側）
      const { products, sales } = action.payload;
      return { ...state, products, sales };
    }
    case 'DATA_REPLACED': {
      // JSONインポート：全置換（実行前バックアップは呼び出し側で実施済み。spec §5 ADD-05）
      const { products, sales, settings } = action.payload;
      return { ...state, products, sales, settings: { ...DEFAULT_SETTINGS, ...settings } };
    }
    case 'STOCK_SET': {
      const { productId, qty } = action;
      const currentStock = { ...state.settings.currentStock };
      if (qty === null || qty === '' || Number.isNaN(qty)) {
        delete currentStock[productId]; // 空欄＝未入力（0扱いはUI側の表示規約）
      } else {
        currentStock[productId] = Math.max(0, Math.round(Number(qty)));
      }
      return { ...state, settings: { ...state.settings, currentStock } };
    }
    case 'SETTINGS_PATCHED':
      return { ...state, settings: { ...state.settings, ...action.patch } };
    default:
      // 未知のアクションは黙って無視せず警告（デバッグ容易性）
      console.warn('[reducer] unknown action', action);
      return state;
  }
}

// spec.md §2.5 / §5：ユビキタス言語に対応する定数群（推測値を作らず、仕様の既定値をここに集約）

/** localStorage キー接頭辞（spec §6：df_ で確定扱い） */
export const KEY_PREFIX = 'df_';

/** データスキーマ版数（spec §6 df_meta） */
export const SCHEMA_VERSION = 1;

/** 予測手法の識別子（spec §2.5） */
export const METHOD_MA = 'MA';
export const METHOD_DOW = 'DOW';
export const METHOD_HW = 'HW';

/** 手法の適用条件：必要な学習日数（spec §5 ADD-02） */
export const MIN_DAYS = { [METHOD_MA]: 7, [METHOD_DOW]: 14, [METHOD_HW]: 28 };

/** サービス水準 → z値（spec §5 ADD-04） */
export const Z_TABLE = { 90: 1.28, 95: 1.65, 99: 2.33 };

/** Holt-Winters グリッド探索の候補（spec §5 ADD-02） */
export const HW_GRID = [0.1, 0.3, 0.5];

/** Holt-Winters 季節周期（曜日） */
export const HW_PERIOD = 7;

/** 設定の既定値（spec §6 df_settings） */
export const DEFAULT_SETTINGS = {
  serviceLevel: 95,
  leadTimeDays: 1,
  orderCycleDays: 1,
  maWindow: 28,
  dowWeeks: 4,
  holdoutDays: 14, // 実績42日以上のとき。未満は7（spec §5）
  topN: 10,
  currentStock: {},
};

/** 保存サイズ警告のしきい値（spec §6：4MB） */
export const STORAGE_WARN_BYTES = 4 * 1024 * 1024;

/** 画面ID */
export const VIEWS = { DASHBOARD: 'dashboard', IMPORT: 'import', ORDER: 'order', SETTINGS: 'settings' };

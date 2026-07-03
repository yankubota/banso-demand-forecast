// spec.md §6：永続化ラッパー。window.storage を優先し、失敗時は localStorage にフォールバックする
// （Claude Artifact 環境と通常ブラウザの両対応。banso-tech-stack 標準パターン）
import { KEY_PREFIX } from '../constants/index.js';

/**
 * 値を保存する（JSON化）。失敗しても既存データを破壊しない。
 * @param {string} key 接頭辞なしのキー名（例: 'sales'）
 * @param {*} value JSON化可能な値
 * @returns {Promise<boolean>} 保存成功なら true
 */
export async function save(key, value) {
  const fullKey = KEY_PREFIX + key;
  let json;
  try {
    json = JSON.stringify(value);
  } catch (e) {
    // JSON化できない値は保存しない（循環参照など）。黙って握りつぶさず警告を残す
    console.warn(`[storage] JSON.stringify failed for ${fullKey}`, e);
    return false;
  }
  try {
    if (typeof window !== 'undefined' && window.storage && window.storage.set) {
      await window.storage.set(fullKey, json);
      return true;
    }
  } catch (e) {
    // window.storage が使えない環境ではフォールバックへ（警告のみ）
    console.warn('[storage] window.storage.set failed, falling back to localStorage', e);
  }
  try {
    localStorage.setItem(fullKey, json);
    return true;
  } catch (e) {
    // 容量超過（QuotaExceededError）等。呼び出し側でユーザーに案内する
    console.warn(`[storage] localStorage.setItem failed for ${fullKey}`, e);
    return false;
  }
}

/**
 * 値を読み込む。存在しない・壊れている場合は fallback を返す（データを壊さない）。
 * @param {string} key 接頭辞なしのキー名
 * @param {*} fallback 既定値
 * @returns {Promise<*>}
 */
export async function load(key, fallback = null) {
  const fullKey = KEY_PREFIX + key;
  let raw = null;
  try {
    if (typeof window !== 'undefined' && window.storage && window.storage.get) {
      const res = await window.storage.get(fullKey);
      raw = res && typeof res === 'object' && 'value' in res ? res.value : res;
    }
  } catch (e) {
    console.warn('[storage] window.storage.get failed, falling back to localStorage', e);
  }
  if (raw == null) {
    try {
      raw = localStorage.getItem(fullKey);
    } catch (e) {
      console.warn(`[storage] localStorage.getItem failed for ${fullKey}`, e);
      return fallback;
    }
  }
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw);
  } catch (e) {
    // 破損データは読み捨てるが、元のキーは消さない（復旧余地を残す）
    console.warn(`[storage] JSON.parse failed for ${fullKey}. Returning fallback.`, e);
    return fallback;
  }
}

/**
 * 現在の全 df_* データの概算バイト数を返す（4MB警告の判定用。spec §6）
 * @param {Object} bundle {products, sales, settings}
 * @returns {number} UTF-16換算の概算バイト
 */
export function estimateSize(bundle) {
  try {
    return JSON.stringify(bundle).length * 2; // JSの文字列は概ねUTF-16で2byte/文字
  } catch (e) {
    console.warn('[storage] estimateSize failed', e);
    return 0;
  }
}

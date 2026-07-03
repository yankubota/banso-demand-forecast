// 日付ユーティリティ（ISO文字列 YYYY-MM-DD で統一。タイムゾーンはローカル＝JST前提）

/** ISO日付に n 日加算 */
export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 曜日（0=日〜6=土） */
export function weekdayOf(iso) {
  return new Date(iso + 'T00:00:00').getDay();
}

/** start〜end（両端含む）の連続日付配列 */
export function dateRange(startIso, endIso) {
  const out = [];
  let cur = startIso;
  // 無限ループ防止：最大 3700日（約10年）で打ち切り、異常時は警告
  for (let i = 0; i < 3700; i++) {
    out.push(cur);
    if (cur === endIso) return out;
    cur = addDays(cur, 1);
  }
  console.warn('[dates] dateRange exceeded 3700 days. Truncated.', startIso, endIso);
  return out;
}

/** 表示用 M/D（例: 7/3） */
export function shortLabel(iso) {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}

const WD = ['日', '月', '火', '水', '木', '金', '土'];
/** 表示用 M/D(曜) */
export function labelWithWd(iso) {
  return `${shortLabel(iso)}(${WD[weekdayOf(iso)]})`;
}

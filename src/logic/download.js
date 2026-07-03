// ブラウザ内ダウンロード補助（外部送信は行わない。spec §7 セキュリティ）

/**
 * 文字列をファイルとしてダウンロードさせる。
 * @param {string} content
 * @param {string} filename
 * @param {string} mime
 */
export function downloadText(content, filename, mime = 'text/plain') {
  try {
    const blob = new Blob([content], { type: mime + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // メモリリーク防止：少し待ってから解放
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    console.warn('[download] failed', e);
    alert('ダウンロードに失敗しました。ブラウザの設定をご確認ください。');
  }
}

/** タイムスタンプ（YYYYMMDD / YYYYMMDD_HHmm） */
export function stampDate(withTime = false) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const base = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  return withTime ? `${base}_${p(d.getHours())}${p(d.getMinutes())}` : base;
}

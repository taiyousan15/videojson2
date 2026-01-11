/**
 * 日本語フォント設定
 * システムフォントとGoogle Fonts CDNを使用
 */

// フォントファミリー名  (システムフォント + Google Fonts CDN fallback)
export const JapaneseFonts = {
  notoSansJP: "'Noto Sans JP', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', 'Meiryo', sans-serif",
};

// フォントを<head>にCDN経由で読み込み
export function preloadJapaneseFonts() {
  // Google Fonts CDNから直接読み込み (ネットワークリクエストを最小化)
  if (typeof document !== 'undefined') {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  return Promise.resolve();
}

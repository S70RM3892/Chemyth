/**
 * ホーム画面に追加できるようにする（ウェブアプリの名札とアイコン）。
 * ページは 1 つの HTML で配るので、名札（manifest）とアイコンは、開いたときにこの場で作って差し込む。
 * claude.ai の中（ほかのページの枠の中）では何もしない。
 */
import { h } from './dom';

/** アイコン：紺の地に、黄色い液の入った三角フラスコ。maskable は、丸く切り抜かれても欠けないよう小さめに描く */
function icon(size: number, maskable = false): string {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (!g) return '';
  const k = size / 100;
  g.scale(k, k);
  g.fillStyle = '#1c2a48';
  if (maskable) g.fillRect(0, 0, 100, 100);
  else { g.beginPath(); if (typeof g.roundRect === 'function') g.roundRect(0, 0, 100, 100, 22); else g.rect(0, 0, 100, 100); g.fill(); }
  const s = maskable ? 0.7 : 0.86;
  g.translate(50 - 50 * s, 50 - 50 * s + 2);
  g.scale(s, s);
  // 液
  g.beginPath(); g.moveTo(32.5, 60); g.lineTo(67.5, 60); g.lineTo(77, 76); g.quadraticCurveTo(79, 82, 73, 82); g.lineTo(27, 82); g.quadraticCurveTo(21, 82, 23, 76); g.closePath();
  g.fillStyle = '#ffe14d'; g.fill();
  // 泡
  g.fillStyle = '#ffffff';
  for (const [x, y, r] of [[45, 71, 3.2], [56, 67, 2.4], [50, 52, 2.2], [47, 40, 1.6]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  // フラスコの輪郭
  g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.lineJoin = 'round'; g.lineCap = 'round';
  g.beginPath(); g.moveTo(37, 16); g.lineTo(63, 16); g.stroke();
  g.beginPath(); g.moveTo(43, 17); g.lineTo(43, 42); g.lineTo(22, 77); g.quadraticCurveTo(19, 85, 27, 85); g.lineTo(73, 85); g.quadraticCurveTo(81, 85, 78, 77); g.lineTo(57, 42); g.lineTo(57, 17); g.stroke();
  return c.toDataURL('image/png');
}

/** ホーム画面から開いたか（ブラウザとは別に保存されることがある） */
export const standalone = () => (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function initWebApp() {
  try { if (window.top !== window) return; } catch { return; }
  if (document.querySelector('link[rel="manifest"]')) return;
  const page = location.href.split(/[?#]/)[0], scope = page.replace(/[^/]*$/, '');
  const manifest = {
    name: 'Chemyth 受験化学の工場ノート', short_name: 'Chemyth', lang: 'ja', dir: 'ltr',
    description: '大学受験化学を、工場を組みながら覚えるパズル。',
    start_url: page, scope, display: 'standalone', orientation: 'any',
    background_color: '#f3f5ef', theme_color: '#1c2a48',
    icons: [
      { src: icon(192), sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: icon(512), sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: icon(512, true), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }));
  const head = document.head;
  const meta = (name: string, content: string) => { if (!document.querySelector(`meta[name="${name}"]`)) head.append(h('meta', { name, content })); };
  head.append(h('link', { rel: 'manifest', href: url }), h('link', { rel: 'apple-touch-icon', href: icon(180) }), h('link', { rel: 'icon', href: icon(64) }));
  meta('theme-color', '#1c2a48');
  meta('mobile-web-app-capable', 'yes');
  meta('apple-mobile-web-app-capable', 'yes');
  meta('apple-mobile-web-app-title', 'Chemyth');
  meta('application-name', 'Chemyth');
}

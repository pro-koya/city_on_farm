// 今は軽量（将来：インタラクション/スクロールトリガー等に拡張可）
document.addEventListener('DOMContentLoaded', () => {
  // アクセシビリティ：横スクロールのバナーにキーボードフォーカスが来たら親をスクロール
  const rail = document.querySelector('.rail');
  if (rail) {
    rail.addEventListener('focusin', (e) => {
      const el = e.target.closest('.banner');
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pr = rail.getBoundingClientRect();
      if (rect.left < pr.left || rect.right > pr.right) {
        rail.scrollTo({ left: el.offsetLeft - 16, behavior: 'smooth' });
      }
    });
  }
});
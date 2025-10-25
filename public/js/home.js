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

// Story section: reveal on scroll（低コスト）
(function(){
  const targets = document.querySelectorAll('.pillar, .story__head');
  if (!targets.length) return;

  const preferNoMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (preferNoMotion) return;

  targets.forEach(el => {
    el.style.opacity = 0;
    el.style.transform = 'translateY(12px)';
    el.style.willChange = 'opacity, transform';
  });

  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const el = e.target;
        el.animate([
          { opacity: 0, transform: 'translateY(12px)' },
          { opacity: 1, transform: 'translateY(0)' }
        ], { duration: 450, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
        io.unobserve(el);
      }
    });
  }, { threshold: 0.15 });

  targets.forEach(el => io.observe(el));
})();
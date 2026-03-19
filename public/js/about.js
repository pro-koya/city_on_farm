// 軽量：インパクト数値をカウントアップ
document.addEventListener('DOMContentLoaded', () => {
  const easeOut = t => 1 - Math.pow(1 - t, 3);

  function animateNumber(el) {
    const target = Number(el.dataset.target || '0');
    const dur = 1100;
    const start = performance.now();

    const tick = (now) => {
      const p = Math.min(1, (now - start) / dur);
      const v = Math.round(target * easeOut(p));
      el.textContent = v.toLocaleString('ja-JP');
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  document.querySelectorAll('.metric strong[data-target]').forEach(animateNumber);

  // ヒーロー内リンク：スムーズスクロール
  document.querySelectorAll('.ab-hero__nav a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const id = a.getAttribute('href').slice(1);
      const t = document.getElementById(id);
      if (t) window.scrollTo({ top: t.offsetTop - 56, behavior: 'smooth' });
    });
  });

  // ===== Vision Cycle: スクロール駆動アニメーション =====
  const vcContainer = document.querySelector('.vision-cycle-v');
  if (vcContainer) {
    const vcElements = vcContainer.querySelectorAll('[data-vc]');

    // 各ノードをスクロール位置に応じて表示
    const nodeObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
        }
      });
    }, {
      threshold: 0.15,
      rootMargin: '0px 0px -60px 0px'
    });

    vcElements.forEach(el => nodeObserver.observe(el));

    // 縦ラインの進捗をスクロールに連動
    const lineFill = vcContainer.querySelector('.vc-line__fill');
    if (lineFill) {
      const lineObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            vcContainer.classList.add('vc-active');
          }
        });
      }, { threshold: 0.05 });

      lineObserver.observe(vcContainer);

      // スクロール位置に応じてラインの高さを制御
      function updateLine() {
        const rect = vcContainer.getBoundingClientRect();
        const vh = window.innerHeight;
        const containerTop = rect.top;
        const containerH = rect.height;

        if (containerTop < vh && rect.bottom > 0) {
          const scrolled = Math.max(0, vh - containerTop);
          const progress = Math.min(1, scrolled / (containerH + vh * 0.3));
          lineFill.style.height = (progress * 100) + '%';
        }
      }

      let ticking = false;
      window.addEventListener('scroll', () => {
        if (!ticking) {
          requestAnimationFrame(() => {
            updateLine();
            ticking = false;
          });
          ticking = true;
        }
      }, { passive: true });
      updateLine();
    }
  }
});
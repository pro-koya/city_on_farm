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
});
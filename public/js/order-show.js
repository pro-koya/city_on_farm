(() => {
  const printBtn = document.getElementById('printPage');
  printBtn?.addEventListener('click', () => window.print());

  // もしサーバ側で status → rank を付与しない場合のフォールバック（任意）
  // status: pending→0, processing/paid→1, shipped→2, delivered→3, canceled→0
  const mapRank = (s) => {
    switch ((s||'').toLowerCase()) {
      case 'paid':
      case 'processing': return 1;
      case 'shipped':    return 2;
      case 'delivered':  return 3;
      default:           return 0;
    }
  };

  const progress = document.querySelector('.progress.progress--sfpath');
  if (progress && !progress.className.match(/\bis-step-/)) {
    // is-step-N のクラスが無ければ rank から見た目を補正
    const statusEl = document.querySelector('.status');
    const status = statusEl?.className?.match(/status--([a-z_]+)/)?.[1] || '';
    const r = mapRank(status);
    // li に .is-done / .is-active を付与
    const lis = [...progress.querySelectorAll('li')];
    lis.forEach((li, i) => {
      li.classList.remove('is-done', 'is-active');
      if (i < r) li.classList.add('is-done');
      if (i === r) li.classList.add('is-active');
    });
  }
})();
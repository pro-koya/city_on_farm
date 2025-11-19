(() => {
  const list = document.getElementById('notifList');
  if (!list) return;

  list.addEventListener('click', (e) => {
    // カード全体をクリック可能に
    let el = e.target;
    while (el && el !== list && !el.dataset.href) {
      el = el.parentElement;
    }
    if (el && el.dataset.href) {
      // Ctrl/⌘クリックで新規タブ
      if (e.ctrlKey || e.metaKey) {
        window.open(el.dataset.href, '_blank');
      } else {
        window.location.href = el.dataset.href;
      }
    }
  }, false);
})();
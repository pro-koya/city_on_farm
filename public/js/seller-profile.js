// /public/js/seller-profile.js
document.addEventListener('DOMContentLoaded', () => {
  const tabs  = Array.from(document.querySelectorAll('.seller-tab'));
  const panes = {
    intro:     document.getElementById('seller-pane-intro'),
    products:  document.getElementById('seller-pane-products')
  };

  if (!tabs.length) return;

  function activateTab(key, { setHash = true } = {}) {
    const pane = panes[key];
    if (!pane) return;

    tabs.forEach(btn => {
      const isActive = btn.dataset.tab === key;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      btn.setAttribute('tabindex', isActive ? '0' : '-1');
    });

    Object.entries(panes).forEach(([k, el]) => {
      if (!el) return;
      const active = (k === key);
      el.classList.toggle('is-active', active);
      el.hidden = !active;
    });

    // URL のハッシュで状態を保持（戻る/共有時にも効く）
    if (setHash) {
      const url = new URL(location.href);
      url.hash = `tab=${key}`;
      history.replaceState(null, '', url);
    }
  }

  // クリックイベント
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      activateTab(btn.dataset.tab || 'intro');
    });
  });

  // 初期タブ：URLハッシュ or デフォルト intro
  const hash = location.hash || '';
  const m = hash.match(/tab=(intro|products)/);
  const initial = m ? m[1] : 'intro';
  activateTab(initial, { setHash: false });
});
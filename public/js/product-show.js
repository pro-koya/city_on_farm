(function(){
  // ===== 画像サムネ切替 =====
  const main = document.getElementById('mainImage');
  const thumbs = document.querySelectorAll('.thumb');
  thumbs.forEach(btn => {
    btn.addEventListener('click', () => {
      const src = btn.getAttribute('data-src');
      if (!src || !main) return;
      main.src = src;
      thumbs.forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
    });
  });

  // ===== 数量ステッパー =====
  const qty = document.getElementById('qty');
  document.querySelectorAll('.stepper__btn').forEach(b=>{
    b.addEventListener('click', ()=>{
      const step = Number(b.getAttribute('data-step')) || 1;
      const cur = Math.max(1, parseInt(qty.value || '1', 10) + step);
      qty.value = cur;
    });
  });

  // ===== レビューへスクロール =====
  const goto = document.getElementById('goto-reviews');
  if (goto){
    goto.addEventListener('click', (e)=>{
      e.preventDefault();
      // タブ切替
      switchTab('reviews');
      // スクロール
      const el = document.querySelector('#pane-reviews');
      el && el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // ===== タブ切替（SPはアコーディオン風でも動く） =====
  const tabs = document.querySelectorAll('.tab');
  function switchTab(key){
    tabs.forEach(t=>t.classList.toggle('is-active', t.dataset.tab===key));
    document.querySelectorAll('.pane').forEach(p=>p.classList.remove('is-active'));
    const pane = document.getElementById(`pane-${key}`);
    pane && pane.classList.add('is-active');
  }
  tabs.forEach(t=>{
    t.addEventListener('click', ()=> switchTab(t.dataset.tab));
  });

  // ===== お気に入り（見た目のみの簡易版） =====
  const fav = document.getElementById('favBtn');
  fav && fav.addEventListener('click', ()=>{
    const on = fav.getAttribute('aria-pressed') === 'true';
    fav.setAttribute('aria-pressed', on ? 'false' : 'true');
    fav.textContent = on ? '♡ お気に入り' : '♥ お気に入り';
  });

  // ===== 画像スワイプ（SPの簡易スワイプ） =====
  let startX = null;
  main && main.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, {passive:true});
  main && main.addEventListener('touchend', e => {
    if (startX == null) return;
    const dx = e.changedTouches[0].clientX - startX;
    startX = null;
    if (Math.abs(dx) < 30 || thumbs.length === 0) return;
    // 現在インデックス
    const arr = Array.from(thumbs);
    const cur = arr.findIndex(b => b.classList.contains('is-active'));
    const next = (cur + (dx < 0 ? 1 : -1) + arr.length) % arr.length;
    arr[next].click();
  }, {passive:true});
})();
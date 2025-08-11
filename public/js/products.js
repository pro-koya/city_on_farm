(function(){
  // ======== Toast / Modal with localStorage =========
  const toast = document.getElementById('toast');
  const modal = document.getElementById('modal');
  const toastOpen = document.getElementById('toast-open');
  const toastClose = document.getElementById('toast-close');
  const modalClose = document.getElementById('modal-close');
  const modalBackdrop = document.getElementById('modal-backdrop');
  const hideToday = document.getElementById('modal-hideToday');

  const key = 'cof.hideEvent.' + new Date().toISOString().slice(0,10);
  if (!localStorage.getItem(key) && toast) toast.hidden = false;

  function openModal(){ modal && modal.setAttribute('aria-hidden','false'); }
  function closeModal(){
    if (!modal) return;
    modal.setAttribute('aria-hidden','true');
    if (hideToday && hideToday.checked) localStorage.setItem(key, '1');
  }

  toastOpen && toastOpen.addEventListener('click', openModal);
  modalClose && modalClose.addEventListener('click', closeModal);
  modalBackdrop && modalBackdrop.addEventListener('click', closeModal);
  toastClose && toastClose.addEventListener('click', () => { toast.hidden = true; });

  // ======== フィルタ（URLクエリ同期） =========
  const form = document.getElementById('filter-form');
  if (form){
    form.addEventListener('change', (e) => {
      // select/checkboxの変更で即送信（検索は手動Enter）
      if (e.target.matches('select, input[type="checkbox"]')) form.submit();
    });
  }

  // ======== 閲覧履歴：localStorageに追加（商品カード data-id を利用想定） =========
  function pushHistory(id){
    try{
      const key = 'cof.recent';
      const arr = JSON.parse(localStorage.getItem(key) || '[]');
      const next = [id, ...arr.filter(x => x !== id)].slice(0,20);
      localStorage.setItem(key, JSON.stringify(next));
    }catch(e){}
  }
  // 商品カードクリックで履歴に保存
  document.querySelectorAll('[data-product-id]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-product-id');
      if (id) pushHistory(id);
    });
  });

  // ======== お気に入り（見た目だけの簡易版） =========
  document.querySelectorAll('.fav').forEach(btn => {
    btn.addEventListener('click', (e)=>{
      e.preventDefault(); e.stopPropagation();
      btn.classList.toggle('is-on');
      btn.textContent = btn.classList.contains('is-on') ? '♥' : '♡';
    });
  });
})();
(function(){
  const form = document.getElementById('orders-filter');
  const pageHidden = document.getElementById('pageHidden');

  function submitWithReset(){
    if (!form) return;
    if (pageHidden) pageHidden.value = 1;
    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.submit();
  }

  if (form){
    // selectは変更で即時適用
    form.addEventListener('change', (e) => {
      if (e.target.matches('select')) submitWithReset();
    });

    // 検索はデバウンス送信
    const q = document.getElementById('q');
    if (q){
      let t;
      q.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(submitWithReset, 500);
      });
      q.addEventListener('keydown', (e) => {
        if (e.key === 'Enter'){ e.preventDefault(); submitWithReset(); }
      });
    }
  }

  // 商品カードクリックで閲覧履歴に保存（既存ロジックに寄せる）
  function pushHistory(id){
    try{
      const key = 'cof.recent';
      const arr = JSON.parse(localStorage.getItem(key) || '[]');
      const next = [id, ...arr.filter(x => x !== id)].slice(0,20);
      localStorage.setItem(key, JSON.stringify(next));
    }catch(e){}
  }
  document.querySelectorAll('[data-product-id]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-product-id');
      if (id) pushHistory(id);
    });
  });
})();
(() => {
  const list = document.getElementById('cartList');
  const selectAll = document.getElementById('selectAll');
  const removeSelected = document.getElementById('removeSelected');
  const couponCode = document.getElementById('couponCode');
  const applyCoupon = document.getElementById('applyCoupon');

  const sumSubtotal = document.getElementById('sumSubtotal');
  const sumDiscount = document.getElementById('sumDiscount');
  const sumShipping = document.getElementById('sumShipping');
  const sumTotal    = document.getElementById('sumTotal');

  const freeShipBar    = document.getElementById('freeShipBar');
  const freeShipRemain = document.getElementById('freeShipRemain');

  const CSRF = document.querySelector('input[name="_csrf"]')?.value || '';
  const FREE_SHIP_THRESHOLD = 5000; // 任意：送料無料のしきい値（円）
  let discount = 0;

  if (!list) return; // 空カートのとき

  // 通貨フォーマット
  const yen = n => `${Number(n||0).toLocaleString()}円`;

  // 合計の再計算
  function recalc() {
    const rows = [...list.querySelectorAll('.cart-item')];
    let subtotal = 0;
    rows.forEach(li => {
      const checked = li.querySelector('.rowCheck')?.checked;
      if (!checked) return;
      const price = Number(li.dataset.price || 0);
      const qty   = Number(li.querySelector('.qty__input')?.value || 1);
      subtotal += price * qty;
      const subEl = li.querySelector('.subtotal__val');
      if (subEl) subEl.textContent = (price * qty).toLocaleString();
    });

    // 仮の送料：合計300円（0円 if FREE_SHIP）
    const shipping = subtotal >= FREE_SHIP_THRESHOLD || subtotal === 0 ? 0 : 300;
    const total = Math.max(0, subtotal - discount) + shipping;

    if (sumSubtotal) sumSubtotal.textContent = yen(subtotal);
    if (sumDiscount) sumDiscount.textContent = `-${yen(discount)}`;
    if (sumShipping) sumShipping.textContent = yen(shipping);
    if (sumTotal)    sumTotal.textContent    = yen(total);

    // 送料無料メーター
    const remain = Math.max(0, FREE_SHIP_THRESHOLD - subtotal);
    if (freeShipRemain) freeShipRemain.textContent = remain.toLocaleString();
    if (freeShipBar) {
      const pct = Math.min(100, Math.floor((subtotal / FREE_SHIP_THRESHOLD) * 100));
      freeShipBar.style.width = `${pct}%`;
    }
  }

  // 行イベント（数量変更・削除等）
  function bindRow(li) {
    const input = li.querySelector('.qty__input');
    const btnDec = li.querySelector('[data-act="dec"]');
    const btnInc = li.querySelector('[data-act="inc"]');
    const btnRemove = li.querySelector('[data-act="remove"]');
    const rowCheck = li.querySelector('.rowCheck');

    const stock = Number(li.dataset.stock || 999);
    const id = li.dataset.id;

    function updateServer(qty) {
      // サーバに在庫超過させないよう clamp
      const safe = Math.max(1, Math.min(stock || 999, Number(qty||1)));
      // API（任意・無くてもフロント側は動く）
      fetch(`/cart/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'CSRF-Token': CSRF },
        body: JSON.stringify({ quantity: safe })
      }).catch(()=>{ /* サイレント失敗 */ });
    }

    function onChange(delta) {
      let v = Number(input.value || 1);
      v += delta;
      v = Math.max(1, v);
      if (stock) v = Math.min(stock, v);
      input.value = v;
      updateServer(v);
      recalc();
    }

    input?.addEventListener('input', () => {
      let v = parseInt(input.value || '1', 10);
      if (isNaN(v) || v < 1) v = 1;
      if (stock) v = Math.min(stock, v);
      input.value = v;
      updateServer(v);
      recalc();
    });

    btnDec?.addEventListener('click', () => onChange(-1));
    btnInc?.addEventListener('click', () => onChange(+1));
    btnRemove?.addEventListener('click', () => {
      // 見た目から即時削除
      li.remove();
      recalc();
      // API（任意）
      fetch(`/cart/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'CSRF-Token': CSRF }
      }).catch(()=>{});
      // 件数更新
      const count = document.getElementById('itemCount');
      if (count) count.textContent = String(list.querySelectorAll('.cart-item').length);
      // 空になったらリロードや置換などの挙動はお好みで
    });

    rowCheck?.addEventListener('change', recalc);
  }

  // 一括操作
  selectAll?.addEventListener('change', () => {
    const checks = list.querySelectorAll('.rowCheck');
    checks.forEach(c => (c.checked = selectAll.checked));
    recalc();
  });

  removeSelected?.addEventListener('click', () => {
    const rows = [...list.querySelectorAll('.cart-item')];
    const targets = rows.filter(li => li.querySelector('.rowCheck')?.checked);
    if (!targets.length) return;
    targets.forEach(li => {
      const id = li.dataset.id;
      li.remove();
      fetch(`/cart/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'CSRF-Token': CSRF }
      }).catch(()=>{});
    });
    recalc();
    const count = document.getElementById('itemCount');
    if (count) count.textContent = String(list.querySelectorAll('.cart-item').length);
  });

  // クーポン適用（ダミー：SUM10 → 10%OFF）
  applyCoupon?.addEventListener('click', () => {
    const code = (couponCode?.value || '').trim().toUpperCase();
    const msg = document.getElementById('couponMsg');
    if (!code) { msg.textContent = 'クーポンコードを入力してください。'; return; }

    // 例：SUM10 → 10%OFF
    const rows = [...list.querySelectorAll('.cart-item')];
    const subtotal = rows.reduce((acc, li) => {
      if (!li.querySelector('.rowCheck')?.checked) return acc;
      const price = Number(li.dataset.price||0);
      const qty = Number(li.querySelector('.qty__input')?.value||1);
      return acc + price*qty;
    }, 0);

    if (code === 'SUM10') {
      discount = Math.floor(subtotal * 0.10);
      msg.textContent = '10%OFF を適用しました。';
      // API（任意）
      fetch('/cart/apply-coupon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CSRF-Token': CSRF },
        body: JSON.stringify({ code })
      }).catch(()=>{});
    } else {
      discount = 0;
      msg.textContent = '無効なクーポンです。';
    }
    recalc();
  });

  const checkoutBtn = document.getElementById('checkoutBtn');
  checkoutBtn?.addEventListener('click', async (e) => {
    e.preventDefault();

    // チェックされている行の product_id を収集
    const checkedLis = [...list.querySelectorAll('.cart-item')]
      .filter(li => li.querySelector('.rowCheck')?.checked);

    if (!checkedLis.length) {
      alert('購入対象の商品が選択されていません。チェックを入れてください。');
      return;
    }

    const ids = checkedLis.map(li => li.dataset.id).filter(Boolean);

    try {
      // サーバに「選択中ID」を一時保存
      const resp = await fetch('/cart/selection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CSRF-Token': CSRF },
        body: JSON.stringify({ ids })
      });
      if (!resp.ok) throw new Error('save selection failed');

      // 保存できたら /checkout へ遷移
      window.location.href = '/checkout';
    } catch (err) {
      console.error(err);
      alert('購入手続きの開始に失敗しました。時間をおいて再度お試しください。');
    }
  });

  // 初期バインド
  [...list.querySelectorAll('.cart-item')].forEach(bindRow);
  recalc();
})();
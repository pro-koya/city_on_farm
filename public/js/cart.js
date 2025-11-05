(() => {
  const list = document.getElementById('allList');
  const selectAll = document.getElementById('selectAll');
  const removeSelected = document.getElementById('removeSelected');
  const couponCode = document.getElementById('couponCode');
  const applyCoupon = document.getElementById('applyCoupon');

  const CSRF = document.querySelector('input[name="_csrf"]')?.value || '';
  const FREE_SHIP_THRESHOLD = 5000; // 任意：送料無料のしきい値（円）
  let discount = 0;

  if (!list) return; // 空カートのとき
  // ── 追加: グループユーティリティ
  function getGroupRoot(el) {
    return el.closest('.partner-group');
  }
  function getGroupList(elOrGroup) {
    const group = elOrGroup.classList.contains('partner-group') ? elOrGroup : getGroupRoot(elOrGroup);
    return group ? group.querySelector('.cart-list') : null;
  }
  function removeGroupIfEmpty(elOrGroup) {
    const group = elOrGroup.classList.contains('partner-group') ? elOrGroup : getGroupRoot(elOrGroup);
    if (!group) return;
    const ul = getGroupList(group);
    const hasItems = !!(ul && ul.querySelector('.cart-item'));
    if (!hasItems) {
      group.remove();
    }
  }
  function afterAnyRemovalCleanup() {
    // 全体件数を更新
    const count = document.getElementById('itemCount');
    if (count) count.textContent = String(document.querySelectorAll('.cart-item').length);
    // カートが空ならリロード or 空表示に置換（今回は簡単にリロード）
    if (!document.querySelector('.cart-item')) {
      // サーバ側の最新状態を反映
      location.reload();
    }
  }

  // 通貨フォーマット
  const yen = n => `${Number(n||0).toLocaleString()}円`;

  // 合計の再計算
  function recalc() {
    // 現在のグループごとに計算（存在するグループのみ）
    const groups = [...list.querySelectorAll('.partner-group')];
    groups.forEach(group => {
      const partnerId = group.id.replace('seller-','');
      const perItems = [...group.querySelectorAll('.cart-item')];
      // 念のため: グループが空なら消す
      if (!perItems.length) { removeGroupIfEmpty(group); return; }

      let subtotal = 0;
      perItems.forEach(li => {
        const checked = li.querySelector('.rowCheck')?.checked;
        if (!checked) return;
        const price = Number(li.dataset.price || 0);
        console.log(li.dataset.price);
        const qty   = Number(li.querySelector('.qty__input')?.value || 1);
        subtotal += price * qty;
        console.log(subtotal);
        const subEl = li.querySelector('.subtotal__val');
        if (subEl) subEl.textContent = (price * qty).toLocaleString();
      });
      // 仮の送料：合計300円（0円 if FREE_SHIP）
      const shipping = subtotal >= FREE_SHIP_THRESHOLD || subtotal === 0 ? 0 : 300;
      const total = Math.max(0, subtotal - discount) + shipping;

      const sumSubtotal = document.getElementById('sumSubtotal-' + partnerId);
      const sumDiscount = document.getElementById('sumDiscount-' + partnerId);
      const sumShipping = document.getElementById('sumShipping-' + partnerId);
      const sumTotal    = document.getElementById('sumTotal-' + partnerId);
      console.log(subtotal);
      if (sumSubtotal) sumSubtotal.textContent = yen(subtotal);
      if (sumDiscount) sumDiscount.textContent = `-${yen(discount)}`;
      if (sumShipping) sumShipping.textContent = yen(shipping);
      if (sumTotal)    sumTotal.textContent    = yen(total);
      console.log(sumSubtotal + ':' + sumTotal);

      // 送料無料メーター
      const freeShipBar    = document.getElementById('freeShipBar-' + partnerId);
      const freeShipRemain = document.getElementById('freeShipRemain-' + partnerId);
      const remain = Math.max(0, FREE_SHIP_THRESHOLD - subtotal);
      if (freeShipRemain) freeShipRemain.textContent = remain.toLocaleString();
      if (freeShipBar) {
        const pct = Math.min(100, Math.floor((subtotal / FREE_SHIP_THRESHOLD) * 100));
        freeShipBar.style.width = `${pct}%`;
      }
    });
    afterAnyRemovalCleanup();
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
      const group = getGroupRoot(li);
      li.remove();
      removeGroupIfEmpty(group);
      recalc();
      // API（任意）
      fetch(`/cart/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'CSRF-Token': CSRF }
      }).catch(()=>{});
      // 件数更新
      afterAnyRemovalCleanup();
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
      const group = getGroupRoot(li);
      li.remove();
      removeGroupIfEmpty(group);
      fetch(`/cart/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'CSRF-Token': CSRF }
      }).catch(()=>{});
    });
    recalc();
    afterAnyRemovalCleanup();
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

  // 既存の .checkoutBtn へのリスナーを書き換え/追加
  document.querySelectorAll('.checkoutBtn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();

      const sellerId = btn.dataset.seller;
      const errEl = document.getElementById('checkoutError-' + sellerId);
      const list = document.querySelector('#cartList-' + sellerId);
      const CSRF = document.querySelector('input[name="_csrf"]')?.value || '';

      // 表示ヘルパ
      const showError = (msg) => {
        if (!errEl) return;
        errEl.textContent = msg || '';
        errEl.hidden = !msg;
      };
      const clearError = () => showError('');

      clearError(); // まず消す

      if (!sellerId || !list) {
        showError('対象の出品者グループが見つかりません。ページを更新して再度お試しください。');
        return;
      }

      const rows = [...list.querySelectorAll('.cart-item')];
      const checkedLis = rows.filter(li => li.querySelector('.rowCheck')?.checked);
      if (!checkedLis.length) {
        showError('購入対象の商品が選択されていません。チェックを入れてください。');
        return;
      }

      const ids = checkedLis.map(li => li.dataset.id).filter(Boolean);
      if (!ids.length) {
        showError('購入対象の商品が特定できませんでした。ページを更新して再度お試しください。');
        return;
      }

      // 送信中ロック
      btn.disabled = true;

      try {
        const resp = await fetch('/cart/selection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'CSRF-Token': CSRF },
          body: JSON.stringify({ sellerId, ids })
        });
        if (!resp.ok) {
          // 可能ならサーバのメッセージを拾う
          let msg = '購入手続きの開始に失敗しました。時間をおいて再度お試しください。';
          try { const j = await resp.json(); if (j?.message) msg = j.message; } catch {}
          showError(msg);
          return;
        }
        clearError();
        window.location.href = `/checkout?seller=${encodeURIComponent(sellerId)}`;
      } catch (err) {
        console.error(err);
        showError('通信に失敗しました。ネットワーク状況をご確認ください。');
      } finally {
        btn.disabled = false;
      }
    });
  });

  // 追加：チェック変更・数量変更時はそのグループのエラーを消す
  document.querySelectorAll('.cart-item').forEach((li) => {
    const sellerId = li.dataset.seller;
    const errEl = document.getElementById('checkoutError-' + sellerId);
    const clearError = () => { if (errEl) { errEl.textContent=''; errEl.hidden = true; } };

    li.querySelector('.rowCheck')?.addEventListener('change', clearError);
    li.querySelector('.qty__input')?.addEventListener('input', clearError);
  });

  // 初期バインド
  [...list.querySelectorAll('.cart-item')].forEach(bindRow);
  recalc();
})();
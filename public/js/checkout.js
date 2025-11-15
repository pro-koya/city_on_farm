(() => {
    const qs = (s, r=document) => r.querySelector(s);
    const qsa = (s, r=document) => r.querySelectorAll(s);

    const csrf = window.__CK__?.csrfToken || '';
    const applyCouponUrl = window.__CK__?.applyCouponUrl || '/checkout/apply-coupon';
    const createAddressUrl = window.__CK__?.createAddressUrl || '/addresses';

    // ====== 請求先：配送先と同じ ======
    const billSame = qs('#billSame');
    const billingBlock = qs('#billingBlock');
    billSame?.addEventListener('change', () => {
        if (!billingBlock) return;
        billingBlock.classList.toggle('is-hidden', billSame.checked);
    });

    // ====== クーポン適用 ======
    const applyBtn  = qs('#applyCoupon');
    const codeInput = qs('#couponCode');
    const msgEl     = qs('#couponMsg');

    const sumSubtotalEls = [...qsa('.sumSubtotal'), ...qsa('#sumSubtotal')];
    const sumDiscountEls = [...qsa('.sumDiscount'), ...qsa('#sumDiscount')];
    const sumShippingEls = [...qsa('.sumShipping'), ...qsa('#sumShipping')];
    const sumTotalEls    = [...qsa('.sumTotal'),    ...qsa('#sumTotal')];

    const checkoutForm = qs('#checkoutForm');
    const sellerIdInput = checkoutForm?.querySelector('input[name="sellerId"]');
    const currentSellerId = sellerIdInput?.value || '';

    // ====== 表示更新ヘルパ ======
    const yen = (n) => '¥' + Number(n||0).toLocaleString();
    function writeAll(els, text) { els.forEach(el => { if (!el) return; el.textContent = text; }); }
    function paintTotals(totals) {
        if (!totals) return;
        writeAll(sumSubtotalEls, yen(totals.subtotal));
        writeAll(sumDiscountEls, '-' + yen(totals.discount));
        writeAll(sumShippingEls, yen(totals.shipping));
        writeAll(sumTotalEls,    yen(totals.total));
    }

    async function postJSON(url, body) {
        const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CSRF-Token': csrf },
        body: JSON.stringify(body)
        });
        if (!resp.ok) throw new Error('request failed');
        return resp.json();
    }

    // ====== クーポン「適用」 ======
    applyBtn?.addEventListener('click', async () => {
        const code = (codeInput?.value || '').trim();
        if (!code) {
        if (msgEl) msgEl.textContent = 'クーポンコードを入力してください。';
        return;
        }
        applyBtn.disabled = true;
        try {
        const data = await postJSON(applyCouponUrl, {
            code,                          // ← 適用
            shipMethod: shipMethodSel?.value || 'delivery',
            sellerId: currentSellerId
        });
        if (msgEl) msgEl.textContent = data?.message || (data?.applied ? 'クーポンを適用しました。' : '無効なクーポンです。');
        paintTotals(data?.totals);
        // 適用済みになったら入力ロック（1注文1クーポン）
        if (data?.applied) {
            codeInput?.setAttribute('disabled','disabled');
            applyBtn?.setAttribute('disabled','disabled');
            ensureRemoveButtonEnabled(true);
        }
        } catch (e) {
        if (msgEl) msgEl.textContent = '適用に失敗しました。時間をおいて再度お試しください。';
        } finally { applyBtn.disabled = false; }
    });

    // ====== 解除ボタン（無ければ動的追加） ======
    let removeBtn = qs('#removeCoupon');
    function ensureRemoveButtonEnabled(enable) {
        if (!removeBtn) {
        // 既存マークアップに無ければ追加
        const row = codeInput?.closest('.row');
        if (row) {
            removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'btn btn--ghost';
            removeBtn.id = 'removeCoupon';
            removeBtn.textContent = '解除';
            row.appendChild(removeBtn);
            removeBtn.addEventListener('click', onRemoveCoupon);
        }
        }
        if (removeBtn) removeBtn.disabled = !enable;
    }

    async function onRemoveCoupon() {
        if (!removeBtn) return;
        removeBtn.disabled = true;
        try {
        const data = await postJSON(applyCouponUrl, {
            code: '',                       // ← 解除
            shipMethod: shipMethodSel?.value || 'delivery',
            sellerId: currentSellerId
        });
        paintTotals(data?.totals);
        if (msgEl) msgEl.textContent = data?.message || 'クーポンを解除しました。';
        // 入力復帰
        codeInput?.removeAttribute('disabled');
        applyBtn?.removeAttribute('disabled');
        if (codeInput) codeInput.value = '';
        ensureRemoveButtonEnabled(false);
        } catch (e) {
        if (msgEl) msgEl.textContent = '解除に失敗しました。時間をおいて再度お試しください。';
        } finally { removeBtn.disabled = false; }
    }
    removeBtn?.addEventListener('click', onRemoveCoupon);

    // ====== 住所モーダル ======
    // モーダル
    const modal = qs('#addressModal');
    const openShipBtn = qs('#openAddressModal');             // 配送先用
    const openBillBtn = qs('#openBillingAddressModal');      // （あれば）請求先用
    const closeBtn = qs('#closeAddressModal');
    const cancelBtn = qs('#cancelAddress');
    const form = qs('#addressForm');
    const addrTypeInput = qs('#addr_type');
    const err = qs('#addrError');

    function openModal(type='shipping'){
        if (addrTypeInput) addrTypeInput.value = type; // shipping | billing
        modal?.setAttribute('aria-hidden','false');
    }
    function closeModal(){
        modal?.setAttribute('aria-hidden','true');
        form?.reset();
        if (addrTypeInput) addrTypeInput.value = 'shipping';
        if (err) err.textContent = '';
    }

    openShipBtn?.addEventListener('click', () => openModal('shipping'));
    openBillBtn?.addEventListener('click', () => openModal('billing'));
    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);
    modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    function ensureList(listId, emptySelector){
        let list = qs(listId);
        if (!list) {
        // 空メッセージを消して UL を作る
        const empty = emptySelector ? qs(emptySelector) : null;
        if (empty) empty.remove();
        list = document.createElement('ul');
        list.id = listId.replace('#','');
        list.className = 'addr-list';
        // 適切なカードに append（配送先/請求先カードの中へ）
        const card = listId === '#shippingAddrList'
            ? document.querySelector('.card h2:nth-of-type(1)')?.closest('.card')
            : document.querySelector('.card h2:nth-of-type(2)')?.closest('.card');
        (card || document.body).appendChild(list);
        }
        return list;
    }

    function addAddressRow({ targetListId, groupName, a }){
        const list = ensureList(targetListId);
        // 既存のチェック外す
        list.querySelectorAll(`input[name="${groupName}"]`).forEach(el => el.checked = false);
        const li = document.createElement('li');
        li.className = 'addr-item';
        li.innerHTML = `
        <label class="addr-radio">
            <input type="radio" name="${groupName}" value="${a.id}" checked>
            <div class="addr-body">
            <div class="addr-name">${a.full_name}（${a.phone}）</div>
            <div class="addr-lines">〒${a.postal_code}　${a.prefecture}${a.city}${a.address_line1} ${a.address_line2||''}</div>
            ${a.is_default ? '<span class="badge">既定</span>' : ''}
            </div>
        </label>`;
        list.prepend(li);
        // change を飛ばして依存UIを更新したい場合
        li.querySelector('input[type="radio"]').dispatchEvent(new Event('change', {bubbles:true}));
    }

    // 住所保存（AJAX）
    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.textContent = '';

        const fd = new FormData(form);
        const payload = Object.fromEntries(fd.entries());
        // 正規化
        payload.scope = 'user';
        payload.country_code = payload.country_code || 'JP';
        payload.is_default = !!payload.is_default;
        payload.address_type = payload.address_type || 'shipping';
        console.log(payload);

        try {
        const resp = await fetch(createAddressUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'CSRF-Token': csrf, 'X-Requested-With': 'XMLHttpRequest' },
            body: JSON.stringify(payload)
        });
        const data = await resp.json();
        console.log(data);
        if (!resp.ok || !data?.ok) throw new Error(data?.message || '保存に失敗しました');

        const a = data.address;
        const safe = {
            full_name: a.full_name || '',
            phone: a.phone || '',
            postal_code: a.postal_code || '',
            prefecture: a.prefecture || '',
            city: a.city || '',
            address_line1: a.address_line1 || '',
            address_line2: a.address_line2 || '',
            is_default: !!a.is_default,
            address_type: a.address_type || a.addressType || 'shipping',
            id: a.id
        };
        if (safe.address_type === 'shipping') {
           addAddressRow({ targetListId:'#shippingAddrList', groupName:'shippingAddressId', a: safe });
            // 「同じにする」がONなら請求先も同じに合わせる
            if (billSame?.checked) {
                addAddressRow({ targetListId:'#billingAddrList', groupName:'billingAddressId', a: safe });
            }
        } else {
            addAddressRow({ targetListId:'#billingAddrList', groupName:'billingAddressId', a: safe });
        }

        closeModal();
        } catch (ex) {
        err.textContent = '保存に失敗しました。入力内容をご確認のうえ、時間をおいて再度お試しください。';
        console.error(ex);
        }
    });

    // ====== 確認へ進む（二重送信防止 & バリデーション） ======
    const toConfirm = qs('#toConfirm');

    checkoutForm?.addEventListener('submit', (e) => {
      if (!checkoutForm.checkValidity()) {
        e.preventDefault();
        checkoutForm.reportValidity();
        return;
      }
      toConfirm?.setAttribute('disabled', 'disabled');
    });
    toConfirm?.addEventListener('click', (e) => {
    });

    // ====== 受け取り方法の切り替えでUIを出し分け ======
    const shipMethodSel = qs('#shipMethod');
    const shippingCard  = qs('#shippingAddress');
    const labelDate     = qs('label[for="ev_date"]');
    const labelTime     = qs('label[for="shipTime"]');
    const shipHelp      = qs('#shipHelp');
    const noShipMsg     = qs('#shippingAddrInv');
    const shipAddrList  = qs('#shippingAddrList');
    const billSameCheck = qs('#billSameCheck');

    function applyShipMethodUI() {
      const m = shipMethodSel?.value || 'delivery';
      const isPickup = (m === 'pickup');
      const fd = new FormData(checkoutForm);
      const payload = Object.fromEntries(fd.entries());
      payload.shipMethod = m;

      // 配送先カードの表示
      if (shippingCard) {
        shippingCard.classList.toggle('is-hidden', isPickup);
        shippingCard.setAttribute('aria-hidden', isPickup ? 'true' : 'false');
      }
      if (noShipMsg) {
        noShipMsg.classList.toggle('is-hidden', isPickup);
        noShipMsg.setAttribute('aria-hidden', isPickup ? 'true' : 'false');
      }
      if (shipAddrList) {
        shipAddrList.classList.toggle('is-hidden', isPickup);
        shipAddrList.setAttribute('aria-hidden', isPickup ? 'true' : 'false');
      }
      if (billSameCheck) {
        billSameCheck.classList.toggle('is-hidden', isPickup);
        billSameCheck.setAttribute('aria-hidden', isPickup ? 'true' : 'false');
      }
      // 「配送先と同じ」チェックは pickup では無効化＆非表示
      if (billSame) {
        const wrap = billSame.closest('label.check');
        if (wrap) wrap.classList.toggle('is-hidden', isPickup);
        if (isPickup) {
          billSame.checked = false;
          if (billingBlock) billingBlock.classList.remove('is-hidden'); // 請求先は表示
        }
      }
      // ラベル切替
      if (labelDate) labelDate.textContent = isPickup ? '受け取り希望日（任意）' : 'お届け希望日（任意）';
      if (labelTime) labelTime.textContent = isPickup ? '受け取り時間帯（任意）' : 'お届け時間帯（任意）';
      // ヘルプ文言（任意で切替したい場合は #shipHelp を更新）
      if (shipHelp) shipHelp.textContent = isPickup ? '受け取り場所は出品者指定の畑になります。詳細はご注文確定後のメールをご確認ください。' : 'ご指定の配送先へお届けします。';
    }

    async function recalcTotalsForShipMethod() {
        const m = shipMethodSel?.value || 'delivery';
        try {
        // ★ code を送らず shipMethod だけ送る → サーバ側が「クーポン維持のまま再計算」
        const data = await postJSON(applyCouponUrl, {
            shipMethod: m,
            sellerId: currentSellerId
        });
        paintTotals(data?.totals);
        // メッセージあれば出す（任意）
        if (data?.message && msgEl) msgEl.textContent = data.message;
        } catch (e) {
         console.log(e);
        }
    }
    
    shipMethodSel?.addEventListener('change', () => {
        applyShipMethodUI();
        recalcTotalsForShipMethod();
    });
    applyShipMethodUI();  // 初期反映
})();
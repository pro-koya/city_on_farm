(() => {
    const qs = (s, r=document) => r.querySelector(s);

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
    const applyCouponBtn = qs('#applyCoupon');
    const couponCodeEl = qs('#couponCode');
    const couponMsg = qs('#couponMsg');

    const sumSubtotal = qs('#sumSubtotal');
    const sumDiscount = qs('#sumDiscount');
    const sumShipping = qs('#sumShipping');
    const sumTotal    = qs('#sumTotal');

    function yen(n){ return '¥' + Number(n||0).toLocaleString(); }

    applyCouponBtn?.addEventListener('click', async () => {
        const code = (couponCodeEl?.value || '').trim();
        if (!code) {
        couponMsg.textContent = 'クーポンコードを入力してください。';
        return;
        }
        applyCouponBtn.disabled = true;
        try {
        const resp = await fetch(applyCouponUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'CSRF-Token': csrf },
            body: JSON.stringify({ code })
        });
        if (!resp.ok) throw new Error('coupon failed');
        const data = await resp.json();
        if (data.applied && data.totals) {
            couponMsg.textContent = 'クーポンを適用しました。';
            sumSubtotal.textContent = yen(data.totals.subtotal);
            sumDiscount.textContent = '-' + yen(data.totals.discount);
            sumShipping.textContent = yen(data.totals.shipping);
            sumTotal.textContent    = yen(data.totals.total);
        } else {
            couponMsg.textContent = '無効なクーポンです。';
        }
        } catch (e) {
        couponMsg.textContent = '適用に失敗しました。時間をおいて再度お試しください。';
        } finally {
        applyCouponBtn.disabled = false;
        }
    });

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
    const checkoutForm = qs('#checkoutForm');
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
})();
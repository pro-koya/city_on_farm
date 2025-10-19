(() => {
  // ========= 共通：トースト =========
  function toast(msg, ok = true) {
    const t = document.createElement('div');
    t.className = 'acct-toast ' + (ok ? 'ok' : 'ng');
    t.textContent = msg;
    Object.assign(t.style, {
      position:'fixed', left:'50%', top:'24px', transform:'translateX(-50%)',
      background: ok ? '#4C6B5C' : '#e11d48', color:'#fff',
      padding:'10px 14px', borderRadius:'10px', zIndex:9999, boxShadow:'0 8px 20px rgba(0,0,0,.15)'
    });
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }

  // ========= ヘルパ =========
  function qs(sel, root=document){ return root.querySelector(sel); }
  function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

  function showError(form, key, msg) {
    const p = form.querySelector(`.error[data-for="${key}"]`);
    if (!p) return;
    p.textContent = msg || '';
  }

  function getCsrf(form) {
    return form.querySelector('input[name="_csrf"]')?.value || '';
  }

  // ========= プロフィール保存 =========
  const formProfile = qs('#formProfile');
  if (formProfile) {
    formProfile.addEventListener('submit', async (e) => {
      e.preventDefault();
      qsa('.error', formProfile).forEach(p => p.textContent = '');

      const fd = new FormData(formProfile);
      const token = getCsrf(formProfile);

      // ▼ バリデーション（簡易）
      const name = fd.get('name')?.toString().trim() || '';
      const email = fd.get('email')?.toString().trim() || '';
      if (!name) return showError(formProfile, 'name', 'お名前を入力してください。');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError(formProfile, 'email', 'メールアドレスの形式が正しくありません。');

      try {
        const res = await fetch('/account', {
          method: 'PATCH',
          headers: { 'X-Requested-With': 'XMLHttpRequest', 'CSRF-Token': token },
          body: fd,
          credentials: 'same-origin'
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          if (data.fieldErrors) {
            Object.entries(data.fieldErrors).forEach(([k,v]) => showError(formProfile, k, v));
          }
          return toast(data.message || '更新に失敗しました。', false);
        }
        toast('プロフィールを更新しました。');
      } catch {
        toast('通信に失敗しました。', false);
      }
    });
  }

  // ========= パスワード変更 =========
  const formPw = qs('#formPassword');
  const btnPwCancel = qs('#btnPwCancel');
  if (btnPwCancel && formPw) {
    btnPwCancel.addEventListener('click', () => {
      formPw.reset();
      qsa('.error', formPw).forEach(p => p.textContent = '');
    });
  }
  if (formPw) {
    formPw.addEventListener('submit', async (e) => {
      e.preventDefault();
      qsa('.error', formPw).forEach(p => p.textContent = '');

      const fd = new FormData(formPw);
      const token = getCsrf(formPw);
      const cur = fd.get('currentPassword')?.toString() || '';
      const pw  = fd.get('newPassword')?.toString() || '';
      const pwc = fd.get('newPasswordConfirm')?.toString() || '';

      if (!cur) return showError(formPw, 'currentPassword', '現在のパスワードを入力してください。');
      if (pw.length < 8) return showError(formPw, 'newPassword', '8文字以上で入力してください。');
      if (pwc !== pw) return showError(formPw, 'newPasswordConfirm', '確認用が一致しません。');

      try {
        const res = await fetch('/account/password', {
          method: 'PATCH',
          headers: { 'X-Requested-With': 'XMLHttpRequest', 'CSRF-Token': token },
          body: fd,
          credentials: 'same-origin'
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) {
          if (data.fieldErrors) {
            Object.entries(data.fieldErrors).forEach(([k,v]) => showError(formPw, k, v));
          }
          return toast(data.message || 'パスワード変更に失敗しました。', false);
        }
        toast('パスワードを変更しました。');
        formPw.reset();
      } catch {
        toast('通信に失敗しました。', false);
      }
    });
  }

  // ========= 住所：モーダル開閉 & 入力補助 =========
  const addrModal = qs('#addrModal');
  const addrForm  = qs('#addrForm');
  const btnAdd    = qs('#btnAddAddress');
  const addrList  = qs('#addrList');

  function openAddrModal(title, payload = {}) {
    if (!addrModal) return;
    qs('#addrTitle').textContent = title || '住所を追加';
    addrForm.reset();
    qsa('.error', addrForm).forEach(p => p.textContent = '');
    // 値を反映
    qs('#addrId').value      = payload.id || '';
    qs('#addrLabel').value   = payload.label || '';
    qs('#addrPhone').value   = payload.phone || '';
    qs('#addrPostal').value  = payload.postal_code || '';
    qs('#addrPref').value    = payload.prefecture || '';
    qs('#addrCity').value    = payload.city || '';
    qs('#addrA1').value      = payload.address1 || '';
    qs('#addrA2').value      = payload.address2 || '';
    qs('#addrNote').value    = payload.note || '';
    qs('#addrDefault').checked = !!payload.is_default;
    addrModal.showModal();
  }

  btnAdd?.addEventListener('click', () => openAddrModal('住所を追加'));

  // 住所カード操作（編集/削除/既定）
  addrList?.addEventListener('click', (e) => {
    const card = e.target.closest('.addr-card'); if (!card) return;
    const id = card.dataset.id;

    // 編集
    if (e.target.closest('.js-addr-edit')) {
      const payload = {
        id,
        label: card.querySelector('.addr-title strong')?.textContent.trim(),
        // 既存カードからは詳細構造を全て復元できないため、編集はサーバから取得してもOK
      };
      // ここでは編集モードだけ立ち上げて、保存時に PUT で更新
      openAddrModal('住所を編集', payload);
    }

    // 既定
    if (e.target.closest('.js-addr-default')) {
      makeDefaultAddress(id, card);
    }

    // 削除
    if (e.target.closest('.js-addr-del')) {
      if (confirm('この住所を削除しますか？')) {
        deleteAddress(id, card);
      }
    }
  });

  // 郵便番号 normalize
  const postalEl = qs('#addrPostal');
  function toHankaku(s){ return String(s || '').replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0)-0xFEE0)); }
  function normalizePostal(){
    let v = toHankaku(postalEl.value);
    v = v.replace(/[^\d]/g, '');
    if (v.length > 7) v = v.slice(0,7);
    if (v.length >= 4) v = v.slice(0,3) + '-' + v.slice(3);
    postalEl.value = v;
  }
  postalEl?.addEventListener('blur', normalizePostal);
  postalEl?.addEventListener('input', () => { postalEl.value = toHankaku(postalEl.value) });

  // 保存（追加 or 更新）
  addrForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    qsa('.error', addrForm).forEach(p => p.textContent = '');

    const fd = new FormData(addrForm);
    const token = getCsrf(addrForm);
    const id = fd.get('id')?.toString();

    // 簡易バリデーション
    const required = ['postal_code','prefecture','city','address1'];
    for (const k of required) {
      if (!(fd.get(k)?.toString().trim())) {
        showError(addrForm, k, '必須項目です。');
        return;
      }
    }

    const url = id ? `/account/addresses/${encodeURIComponent(id)}` : '/account/addresses';
    const method = id ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'CSRF-Token': token },
        body: fd,
        credentials: 'same-origin'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        if (data.fieldErrors) {
          Object.entries(data.fieldErrors).forEach(([k,v]) => showError(addrForm, k, v));
        }
        return toast(data.message || '住所の保存に失敗しました。', false);
      }

      // 楽観更新：再描画 or 差し替え（ここではリロード簡易）
      addrModal.close();
      toast('住所を保存しました。');
      location.reload();

    } catch {
      toast('通信に失敗しました。', false);
    }
  });

  async function makeDefaultAddress(id, card){
    const token = qs('input[name="_csrf"]')?.value || '';
    try {
      const res = await fetch(`/account/addresses/${encodeURIComponent(id)}/default`, {
        method:'PATCH',
        headers: { 'X-Requested-With':'XMLHttpRequest', 'CSRF-Token': token },
        credentials:'same-origin'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) return toast(data.message || '更新に失敗しました。', false);
      toast('既定の住所を更新しました。');
      location.reload();
    } catch {
      toast('通信に失敗しました。', false);
    }
  }

  async function deleteAddress(id, card){
    const token = qs('input[name="_csrf"]')?.value || '';
    try {
      const res = await fetch(`/account/addresses/${encodeURIComponent(id)}`, {
        method:'DELETE',
        headers: { 'X-Requested-With':'XMLHttpRequest', 'CSRF-Token': token },
        credentials:'same-origin'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) return toast(data.message || '削除に失敗しました。', false);
      toast('削除しました。');
      card?.remove();
    } catch {
      toast('通信に失敗しました。', false);
    }
  }
})();
(() => {
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  
  // CSRFトークンを取得する関数（確実に取得するため）
  function getCsrfToken() {
    const inputs = $$('input[name="_csrf"]');
    if (inputs.length > 0) {
      return inputs[0].value;
    }
    // メタタグから取得を試みる
    const meta = $('meta[name="csrf-token"]');
    if (meta) {
      return meta.getAttribute('content');
    }
    console.warn('CSRFトークンが見つかりません');
    return '';
  }
  
  const userId = location.pathname.split('/').filter(Boolean).pop(); // /admin/users/:id
  let pendingPartnerPayload = null;

  // ===== 表示 ↔ 編集 切り替え =====
  const btnEdit = $('#btnEdit'), btnCancel = $('#btnCancel'), btnSave = $('#btnSave');
  const viewProfile = $('#viewProfile'), formProfile = $('#profileForm');

  function setEditMode(on){
    viewProfile.hidden = !!on;
    formProfile.hidden = !on;
    btnEdit.hidden = !!on;
    btnCancel.hidden = !on ? true : false;
    btnSave.hidden = !on ? true : false;
  }
  btnEdit?.addEventListener('click', () => setEditMode(true));
  btnCancel?.addEventListener('click', () => setEditMode(false));
  setEditMode(false);

  // ===== パスワード変更（本人のみ） =====
  const pwForm = $('#pwForm');
  pwForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(pwForm);
    const body = Object.fromEntries(fd.entries());
    if (body.password !== body.passwordConfirm) {
      $('#pwErr').textContent = '確認が一致しません。'; return;
    }
    try{
      const resp = await fetch(pwForm.action, {
        method: 'POST',
        headers: {'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},
        body: JSON.stringify(body),
        credentials: 'same-origin'
      });
      const j = await resp.json();
      if (!resp.ok || !j.ok) throw new Error(j.message || '変更に失敗しました');
      $('#pwErr').textContent = '変更しました。';
      pwForm.reset();
    }catch(err){
      $('#pwErr').textContent = err.message || '変更に失敗しました。';
    }
  });

  // ===== 住所：モーダル共用 =====
  const addrModal = $('#addressModal');
  const openAddrModal = (showList=false) => {
    addrModal.setAttribute('aria-hidden','false');
    $('#allAddrWrap').hidden = !showList;
    if (showList) loadAllAddresses();
  };
  const closeAddrModal = () => addrModal.setAttribute('aria-hidden','true');

  $('#btnAddAddr')?.addEventListener('click', () => {
    $('#addrModalTitle').textContent = '新しい住所を追加';
    $('#addressForm').reset();
    $('#addr_id').value = '';
    openAddrModal(false);
  });
  $('#btnAllAddr')?.addEventListener('click', () => {
    $('#addrModalTitle').textContent = '登録済みの住所';
    $('#addressForm').reset();
    $('#addr_id').value = '';
    openAddrModal(true);
  });
  $('#closeAddressModal')?.addEventListener('click', closeAddrModal);
  $('#cancelAddress')?.addEventListener('click', closeAddrModal);

  // 住所 保存（新規/編集）
  $('#addressForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = Object.fromEntries(fd.entries());
    data.is_default = fd.get('is_default') ? true : false;

    const isEdit = !!data.id;
    const url = isEdit
      ? `/admin/users/${encodeURIComponent(userId)}/addresses/${encodeURIComponent(data.id)}`
      : `/admin/users/${encodeURIComponent(userId)}/addresses`;

    try{
      const resp = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: {'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},
        body: JSON.stringify(data),
        credentials: 'same-origin'
      });
      const j = await resp.json();
      if (!resp.ok || !j.ok) throw new Error(j.message || '保存に失敗しました');
      location.reload(); // シンプルに再読込
    }catch(err){
      $('#addrError').textContent = err.message || '保存に失敗しました';
    }
  });

  // 一覧をモーダルに描画（「すべての住所を見る」）
  async function loadAllAddresses(){
    const list = $('#allAddrList');
    list.innerHTML = '<li class="muted">読込中…</li>';
    try{
      const resp = await fetch(`/admin/users/${encodeURIComponent(userId)}/addresses`, {
        headers: {'Accept':'application/json','X-Requested-With':'XMLHttpRequest'},
        credentials: 'same-origin'
      });
      const j = await resp.json();
      if (!resp.ok || !j.ok) throw new Error(j.message || '取得に失敗しました');
      list.innerHTML = '';
      j.addresses.forEach(a => {
        const li = document.createElement('li');
        li.className = 'addr';
        li.innerHTML = `
          <div class="addr__head">
            <strong>${a.full_name}</strong>
            ${a.is_default ? '<span class="pill">既定</span>' : ''}
            <span class="muted">${a.address_type || 'shipping'}</span>
          </div>
          <div class="addr__body">
            〒${a.postal_code || ''}　${[a.prefecture,a.city,a.address_line1,a.address_line2].filter(Boolean).join(' ')}
            <span class="muted">　TEL: ${a.phone || '—'}</span>
          </div>
          <div class="addr__foot">
            <button class="link-btn" data-edit-addr="${a.id}">編集</button>
            <button class="link-btn danger" data-del-addr="${a.id}">削除</button>
          </div>
        `;
        list.appendChild(li);
      });
    }catch(err){
      list.innerHTML = `<li class="error">${err.message}</li>`;
    }
  }

  // 編集・削除（委譲）
  document.addEventListener('click', async (e) => {
    const editId = e.target.closest('[data-edit-addr]')?.dataset.editAddr;
    const delId  = e.target.closest('[data-del-addr]')?.dataset.delAddr;

    if (editId){
      // 1件取得
      try{
        const resp = await fetch(`/admin/users/${encodeURIComponent(userId)}/addresses/${encodeURIComponent(editId)}`, {
          headers: {'Accept':'application/json','X-Requested-With':'XMLHttpRequest'},
          credentials: 'same-origin'
        });
        const j = await resp.json();
        if (!resp.ok || !j.ok) throw new Error('取得に失敗');
        const a = j.address;
        $('#addrModalTitle').textContent = '住所を編集';
        $('#addr_id').value = a.id;
        $('#addr_full_name').value = a.full_name || '';
        $('#addr_phone').value = a.phone || '';
        $('#addr_postal').value = a.postal_code || '';
        $('#addr_pref').value = a.prefecture || '';
        $('#addr_city').value = a.city || '';
        $('#addr_line1').value = a.address_line1 || '';
        $('#addr_line2').value = a.address_line2 || '';
        $('#addr_default').checked = !!a.is_default;
        openAddrModal(false);
      }catch{}
    }

    if (delId){
      if (!confirm('この住所を削除します。よろしいですか？')) return;
      try{
        const resp = await fetch(`/admin/users/${encodeURIComponent(userId)}/addresses/${encodeURIComponent(delId)}`, {
          method: 'DELETE',
          headers: {'X-Requested-With':'XMLHttpRequest'},
          credentials: 'same-origin'
        });
        const j = await resp.json();
        if (!resp.ok || !j.ok) throw new Error(j.message || '削除に失敗しました');
        location.reload();
      }catch(err){
        alert(err.message || '削除に失敗しました');
      }
    }
  });

  function renderPartnerDupCandidates(list) {
    const sec = $('#partnerDupSection');
    const ul  = $('#partnerDupList');
    const err = $('#partnerDupErr');
    if (!sec || !ul) return;

    ul.innerHTML = '';
    err.textContent = '';

    if (!list || !list.length) {
      sec.hidden = true;
      return;
    }

    list.forEach(p => {
      const li = document.createElement('li');
      li.innerHTML = `
        <label class="dup-item">
          <input type="radio" name="partner_dup" value="${p.id}">
          <div class="dup-item__body">
            <div class="dup-item__title">${p.name}</div>
            <div class="dup-item__meta">
              〒${p.postal_code || ''} ${[p.prefecture, p.city, p.address1].filter(Boolean).join(' ')}
              ${p.phone ? ' ／ TEL:' + p.phone : ''}
              ${p.email ? ' ／ ' + p.email : ''}
            </div>
          </div>
        </label>
      `;
      ul.appendChild(li);
    });

    // 「作成して紐付け」ボタンを隠す（重複がある場合は既存優先）
    const createBtn = $('#btnCreatePartner');
    if (createBtn) {
      createBtn.hidden = true;
    }

    // セクション表示 & 自動スクロール
    sec.hidden = false;
    sec.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ===== 取引先：変更モーダル =====
  const parModal = $('#partnerModal');
  const btnChangePartner = $('#btnChangePartner');
  let scrollY = 0;
  function openPar(){ 
    scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    parModal?.setAttribute('aria-hidden','false');
  }
  function closePar(){
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    window.scrollTo(0, scrollY);
    parModal?.setAttribute('aria-hidden','true');
  }
  btnChangePartner?.addEventListener('click', openPar);
  $('#closePartnerModal')?.addEventListener('click', closePar);

  // タブ
  $$('.tab').forEach(t=>{
    t.addEventListener('click', ()=>{
      $$('.tab').forEach(x=>x.classList.remove('is-active'));
      t.classList.add('is-active');
      const key = t.dataset.tab;
      $$('.tabpane').forEach(p=> p.hidden = (p.dataset.pane !== key));
    });
  });

  // 検索
  const parQ = $('#par_q'), parResults = $('#par_results');
  let t;
  parQ?.addEventListener('input', ()=>{
    clearTimeout(t);
    t = setTimeout(async ()=>{
      const q = parQ.value.trim();
      if (!q){ parResults.innerHTML = ''; return; }
      const resp = await fetch(`/admin/partners/search?q=${encodeURIComponent(q)}`, {
        headers:{'Accept':'application/json','X-Requested-With':'XMLHttpRequest'}
      });
      const j = await resp.json();
      parResults.innerHTML = '';
      (j.partners||[]).forEach(p=>{
        const li = document.createElement('li');
        li.innerHTML = `
          <div>
            <strong>${p.name}</strong>
            <div class="meta">〒${p.postal_code || ''} ${[p.prefecture,p.city,p.address1].filter(Boolean).join(' ')}</div>
          </div>
          <div><button class="btn" data-bind-par="${p.id}">この取引先にする</button></div>
        `;
        parResults.appendChild(li);
      });
    }, 300);
  });

  async function submitPartnerCreate(force = false) {
    $('#partnerErr').textContent = '';

    const data = {
      name: $('#pn_name').value.trim(),
      postal_code: $('#pn_postal').value.trim(),
      prefecture: $('#pn_pref').value.trim(),
      city: $('#pn_city').value.trim(),
      address1: $('#pn_line1').value.trim(),
      address2: $('#pn_line2').value.trim(),
      phone: $('#pn_phone').value.trim(),
      email: $('#pn_email').value.trim(),
      website: $('#pn_website').value.trim(),
      taxid: $('#pn_taxid').value.trim()
    };

    if (!data.name) {
      $('#partnerErr').textContent = '名称を入力してください。';
      return;
    }
    if (!data.postal_code || !data.address1) {
      $('#partnerErr').textContent = '住所を入力してください。';
      return;
    }
    if (!data.phone && !data.email) {
      $('#partnerErr').textContent = '電話番号もしくはメールアドレスを入力してください。';
      return;
    }

    pendingPartnerPayload = data; // 後で force=true で再実行するために保持

    if (force) {
      data.force = true;
    }

    // CSRFトークンを取得
    const csrfToken = getCsrfToken();
    if (!csrfToken) {
      $('#partnerErr').textContent = 'セキュリティトークンが見つかりません。ページを再読み込みしてください。';
      return;
    }

    const resp = await fetch(`/admin/users/${encodeURIComponent(userId)}/partner/create`, {
      method:'POST',
      headers:{
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'CSRF-Token': csrfToken
      },
      body: JSON.stringify(data),
      credentials: 'same-origin'
    });

    const j = await resp.json().catch(() => ({}));

    if (!resp.ok || !j.ok) {
      $('#partnerErr').textContent = j.message || '作成に失敗しました';
      return;
    }

    // 重複候補が返ってきた場合：ラジオリストを表示してユーザーに選ばせる
    if (j.need_confirm && Array.isArray(j.candidates) && j.candidates.length && !force) {
      renderPartnerDupCandidates(j.candidates);
      return; // ここではまだ作成・紐付けしない
    }

    // 候補なし or 強制新規作成で完了
    location.reload();
  }

  // 「作成して紐付け」押下（最初の試行のみ）
  $('#btnCreatePartner')?.addEventListener('click', () => {
    submitPartnerCreate(false);
  });

  // 「この中には当てはまりません（新規作成）」 → force=true で再送
  $('#btnPartnerDupIgnore')?.addEventListener('click', () => {
    submitPartnerCreate(true);
  });

    // 重複候補から「選択した取引先にする」
  $('#btnPartnerDupBind')?.addEventListener('click', async () => {
    const err = $('#partnerDupErr');
    err.textContent = '';

    const selected = document.querySelector('input[name="partner_dup"]:checked');
    if (!selected) {
      err.textContent = '紐付ける取引先を選択してください。';
      return;
    }

    const pid = selected.value;

    // CSRFトークンを取得
    const csrfToken = getCsrfToken();
    if (!csrfToken) {
      err.textContent = 'セキュリティトークンが見つかりません。ページを再読み込みしてください。';
      return;
    }

    try {
      const resp = await fetch(`/admin/users/${encodeURIComponent(userId)}/partner`, {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'X-Requested-With':'XMLHttpRequest',
          'CSRF-Token': csrfToken
        },
        body: JSON.stringify({ partner_id: pid }),
        credentials:'same-origin'
      });
      const j = await resp.json();
      if (!resp.ok || !j.ok) {
        throw new Error(j.message || '更新に失敗しました');
      }
      location.reload();
    } catch (e) {
      err.textContent = e.message || '更新に失敗しました';
    }
  });

  // 既存に紐付け
  document.addEventListener('click', async (e) => {
    const pid = e.target.closest('[data-bind-par]')?.dataset.bindPar;
    if (!pid) return;
    const resp = await fetch(`/admin/users/${encodeURIComponent(userId)}/partner`, {
      method:'POST',
      headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},
      body: JSON.stringify({ partner_id: pid }),
      credentials:'same-origin'
    });
    const j = await resp.json();
    if (!resp.ok || !j.ok) return alert(j.message || '更新に失敗しました');
    location.reload();
  });

  const payment_form = document.querySelector('form[action$="/payments"]');
  if (!payment_form) return;
  payment_form.addEventListener('submit', () => {
    const btn = payment_form.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = '保存中…'; }
  });
  // ===== 2FA無効化 =====
  const btnDisable2FA = $('#btnDisable2FA');
  if (btnDisable2FA) {
    btnDisable2FA.addEventListener('click', async () => {
      const password = prompt('セキュリティのため、パスワードを入力してください:');
      if (!password) return;

      // CSRFトークンを取得
      const csrfToken = getCsrfToken();
      
      if (!csrfToken) {
        alert('セキュリティトークンが見つかりません。ページを再読み込みしてください。');
        console.error('CSRFトークンが見つかりません');
        return;
      }

      // ボタンを無効化
      btnDisable2FA.disabled = true;
      const originalText = btnDisable2FA.textContent;
      btnDisable2FA.textContent = '処理中...';

      try {
        console.log('2FA無効化リクエスト送信:', { csrfToken: csrfToken.substring(0, 10) + '...' });
        
        const res = await fetch('/account/2fa/disable', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRF-Token': csrfToken,
            'CSRF-Token': csrfToken  // 両方送信して互換性を確保
          },
          body: JSON.stringify({ password }),
          credentials: 'same-origin'
        });
        
        console.log('2FA無効化レスポンス:', { status: res.status, statusText: res.statusText });
        
        const data = await res.json().catch((err) => {
          console.error('JSON解析エラー:', err);
          return { ok: false, message: 'サーバーからの応答を解析できませんでした。' };
        });
        
        console.log('2FA無効化レスポンスデータ:', data);
        
        if (!res.ok || !data.ok) {
          alert(data.message || '2FA無効化に失敗しました。\nステータス: ' + res.status);
          console.error('2FA無効化エラー:', { status: res.status, data });
          btnDisable2FA.disabled = false;
          btnDisable2FA.textContent = originalText;
          return;
        }
        
        alert('2FAを無効化しました。');
        location.reload();
      } catch (err) {
        console.error('2FA無効化通信エラー:', err);
        alert('通信に失敗しました。\n' + (err.message || '不明なエラー'));
        btnDisable2FA.disabled = false;
        btnDisable2FA.textContent = originalText;
      }
    });
  }

  // ===== 信頼済みデバイス一覧 =====
  const trustedDevicesList = $('#trustedDevicesList');
  const btnRefreshDevices = $('#btnRefreshDevices');
  
  async function loadTrustedDevices() {
    if (!trustedDevicesList) {
      console.log('trustedDevicesList要素が見つかりません');
      return;
    }
    
    // 読み込み中表示
    trustedDevicesList.innerHTML = '<p class="muted small" style="margin: 0;">読み込み中...</p>';
    
    try {
      console.log('信頼済みデバイス取得リクエスト送信');
      
      const res = await fetch('/account/trusted-devices', {
        method: 'GET',
        headers: { 
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json'
        },
        credentials: 'same-origin'
      });
      
      console.log('信頼済みデバイス取得レスポンス:', { status: res.status, statusText: res.statusText, ok: res.ok });
      
      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        console.error('信頼済みデバイス取得エラー:', { status: res.status, statusText: res.statusText, body: errorText });
        trustedDevicesList.innerHTML = '<p class="muted small" style="color: #e11d48;">読み込みに失敗しました。(' + res.status + ' ' + res.statusText + ')</p>';
        return;
      }
      
      const data = await res.json().catch((err) => {
        console.error('JSON解析エラー:', err);
        return { ok: false, message: 'サーバーからの応答を解析できませんでした。' };
      });
      
      console.log('信頼済みデバイス取得レスポンスデータ:', data);
      
      if (!data.ok) {
        console.error('信頼済みデバイス取得エラー:', data);
        trustedDevicesList.innerHTML = '<p class="muted small" style="color: #e11d48;">' + (data.message || '読み込みに失敗しました。') + '</p>';
        return;
      }

      const devices = data.devices || [];
      console.log('信頼済みデバイス数:', devices.length);
      
      if (devices.length === 0) {
        trustedDevicesList.innerHTML = '<p class="muted small" style="margin: 0;">信頼済みデバイスはありません。</p>';
        return;
      }

      const html = devices.map(device => {
        const lastUsed = device.last_used_at ? new Date(device.last_used_at).toLocaleDateString('ja-JP') : '未使用';
        const expires = device.expires_at ? new Date(device.expires_at).toLocaleDateString('ja-JP') : '—';
        return `
          <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
              <div>
                <strong style="font-size: 0.9rem;">${device.device_name || '不明なデバイス'}</strong>
                <p style="margin: 4px 0 0 0; color: #666; font-size: 0.8rem;">
                  ${device.ip_address || '—'} • 最終使用: ${lastUsed}
                </p>
              </div>
              <button type="button" class="link-btn danger" data-device-id="${device.id}" style="font-size: 0.8rem;">
                削除
              </button>
            </div>
            <p style="margin: 0; color: #999; font-size: 0.75rem;">
              有効期限: ${expires}
            </p>
          </div>
        `;
      }).join('');
      
      trustedDevicesList.innerHTML = html;

      // 削除ボタンのイベントリスナー
      trustedDevicesList.querySelectorAll('[data-device-id]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const deviceId = btn.dataset.deviceId;
          if (!confirm('このデバイスを削除しますか？')) return;

          // CSRFトークンを取得
          const csrfToken = getCsrfToken();
          
          if (!csrfToken) {
            alert('セキュリティトークンが見つかりません。');
            return;
          }

          try {
            const res = await fetch(`/account/trusted-devices/${deviceId}`, {
              method: 'DELETE',
              headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRF-Token': csrfToken,
                'CSRF-Token': csrfToken  // 両方送信して互換性を確保
              },
              credentials: 'same-origin'
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.ok) {
              alert(data.message || '削除に失敗しました。');
              return;
            }
            loadTrustedDevices();
          } catch (err) {
            console.error('デバイス削除エラー:', err);
            alert('通信に失敗しました。');
          }
        });
      });
    } catch (err) {
      console.error('信頼済みデバイス読み込みエラー:', err);
      trustedDevicesList.innerHTML = '<p class="muted small" style="color: #e11d48;">読み込みに失敗しました。' + (err.message ? '\n' + err.message : '') + '</p>';
    }
  }

  if (trustedDevicesList) {
    loadTrustedDevices();
  }

  btnRefreshDevices?.addEventListener('click', () => {
    loadTrustedDevices();
  });
})();
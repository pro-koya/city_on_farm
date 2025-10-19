(() => {
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const csrf = $('input[name="_csrf"]')?.value || '';
  const userId = location.pathname.split('/').filter(Boolean).pop(); // /admin/users/:id

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

  // ===== 取引先：変更モーダル =====
  const parModal = $('#partnerModal');
  const btnChangePartner = $('#btnChangePartner');
  function openPar(){ parModal?.setAttribute('aria-hidden','false'); }
  function closePar(){ parModal?.setAttribute('aria-hidden','true'); }
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

  // 新規作成して紐付け
  $('#btnCreatePartner')?.addEventListener('click', async ()=>{
    const data = {
      name: $('#pn_name').value.trim(),
      postal_code: $('#pn_postal').value.trim(),
      prefecture: $('#pn_pref').value.trim(),
      city: $('#pn_city').value.trim(),
      address1: $('#pn_line1').value.trim(),
      address2: $('#pn_line2').value.trim(),
      phone: $('#pn_phone').value.trim()
    };
    if (!data.name) { $('#partnerErr').textContent = '名称を入力してください。'; return; }
    const resp = await fetch(`/admin/users/${encodeURIComponent(userId)}/partner/create`, {
      method:'POST',
      headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},
      body: JSON.stringify(data),
      credentials:'same-origin'
    });
    const j = await resp.json();
    if (!resp.ok || !j.ok) return $('#partnerErr').textContent = j.message || '作成に失敗しました';
    location.reload();
  });
})();
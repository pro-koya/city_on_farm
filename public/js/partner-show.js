// public/js/partner-show.js
document.addEventListener('DOMContentLoaded', () => {
  // const form  = document.getElementById('statusForm');
  // if (!form) return;

  // const btn   = document.getElementById('toggleBtn');
  // const input = document.getElementById('statusInput'); // name="status"
  // const badge = document.getElementById('statusBadge');

  // form.addEventListener('submit', async (e) => {
  //   e.preventDefault();

  //   // 送る値をここで最終確認（空なら弾く）
  //   console.log(input?.value);
  //   const val = (input?.value || '').trim().toLowerCase();
  //   if (!['active','inactive'].includes(val)) {
  //     alert('内部エラー: 送信するステータスが不正です。');
  //     return;
  //   }

  //   const fd = new FormData(form);
  //   // 念のため status を確実に上書き
  //   fd.set('status', input?.value);

  //   btn.disabled = true;
  //   try {
  //     const resp = await fetch(form.action, {
  //       method: 'POST',
  //       body: fd,
  //       headers: {
  //         'X-Requested-With': 'XMLHttpRequest',
  //         'CSRF-Token': form.querySelector('input[name="_csrf"]')?.value || '',
  //         'Accept': 'application/json'
  //       },
  //       credentials: 'same-origin'
  //     });

  //     const data = await resp.json().catch(()=>null);
  //     if (!resp.ok || !data?.ok) {
  //       throw new Error(data?.message || '更新に失敗しました。');
  //     }

  //     // 現在ステータスを data.status で反映
  //     if (badge) {
  //       badge.textContent = data.status === 'active' ? '有効' : '無効';
  //       badge.classList.toggle('ps__badge--active',   data.status === 'active');
  //       badge.classList.toggle('ps__badge--inactive', data.status === 'inactive');
  //     }
  //     // 次回送信用の hidden を反転
  //     input.value = (data.status === 'active') ? 'inactive' : 'active';
  //     // ボタン文言も反転
  //     btn.textContent = (data.status === 'active') ? '無効にする' : '有効にする';

  //   } catch (err) {
  //     console.error(err);
  //     alert(err.message || '更新に失敗しました。');
  //   } finally {
  //     btn.disabled = false;
  //   }
  // });

  const payment_form = document.querySelector('form[action*="/admin/partners/"][action$="/payments"]');
  if (payment_form) {
    payment_form.addEventListener('submit', () => {
      const btn = payment_form.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = '保存中…'; }
    });
  }

  const shipTabs   = document.querySelectorAll('.ship-tab');
  const shipPanels = document.querySelectorAll('.ship-panel');

  if (shipTabs.length && shipPanels.length) {
    console.log('ship tap toggle');
    shipTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        console.log('ship tap toggle click');
        shipTabs.forEach((t) => {
          const isActive = t === tab;
          t.classList.toggle('is-active', isActive);
          if (isActive) {
            t.setAttribute('aria-selected', 'true');
          } else {
            t.setAttribute('aria-selected', 'false');
          }
        });

        shipPanels.forEach((panel) => {
          const match = panel.dataset.tab === target;
          panel.classList.toggle('is-active', match);
        });
      });
    });
  }

  // 基本情報編集モードの切り替え
  const editBtn = document.getElementById('editPartnerBtn');
  const cancelBtn = document.getElementById('cancelEditBtn');
  const viewMode = document.getElementById('partnerViewMode');
  const editMode = document.getElementById('partnerEditMode');

  if (editBtn && viewMode && editMode) {
    editBtn.addEventListener('click', () => {
      viewMode.style.display = 'none';
      editMode.style.display = 'block';
      editBtn.style.display = 'none';
    });
  }

  if (cancelBtn && viewMode && editMode) {
    cancelBtn.addEventListener('click', () => {
      viewMode.style.display = 'block';
      editMode.style.display = 'none';
      if (editBtn) editBtn.style.display = 'inline-block';
    });
  }

  // ========== アイコン画像アップロード ==========
  const iconUploadBtn = document.getElementById('uploadIconBtn');
  const iconLibraryBtn = document.getElementById('selectFromLibraryBtn');
  const iconRemoveBtn = document.getElementById('removeIconBtn');
  const iconFileInput = document.getElementById('iconFileInput');
  const iconPreview = document.getElementById('iconPreview');
  const iconUrlInput = document.getElementById('partner_icon_url');
  const iconR2KeyInput = document.getElementById('partner_icon_r2_key');
  const iconMsg = document.getElementById('iconUploadMsg');

  // SHA256ハッシュ計算
  async function hashFileSHA256(file) {
    if (!window.crypto?.subtle) return null;
    try {
      const buf = await file.arrayBuffer();
      const dig = await crypto.subtle.digest('SHA-256', buf);
      const toHex = (buf) => Array.prototype.map.call(new Uint8Array(buf), x => x.toString(16).padStart(2,'0')).join('');
      return toHex(dig);
    } catch { return null; }
  }

  // プレビュー更新関数
  function updateIconPreview(url) {
    if (!iconPreview) return;
    if (url) {
      iconPreview.innerHTML = `<img src="${url}" alt="アイコンプレビュー" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 2px solid var(--main);">`;
    } else {
      iconPreview.innerHTML = '<span class="muted" style="font-size: 0.875rem;">アイコンなし</span>';
    }
  }

  // アップロードボタンクリック
  if (iconUploadBtn && iconFileInput) {
    iconUploadBtn.addEventListener('click', () => iconFileInput.click());

    // ファイル選択時
    iconFileInput.addEventListener('change', async () => {
      const file = iconFileInput.files[0];
      if (!file) return;

      const ALLOWED = new Set(['image/jpeg','image/png','image/webp','image/avif','image/gif']);
      if (!ALLOWED.has(file.type)) {
        iconMsg.textContent = '対応していない画像形式です。';
        iconMsg.style.color = 'var(--danger)';
        return;
      }

      iconMsg.textContent = 'アップロード中...';
      iconMsg.style.color = 'var(--muted)';

      try {
        // SHA256計算
        const sha256 = await hashFileSHA256(file);

        // 1. 署名取得
        const csrfToken = document.querySelector('input[name="_csrf"]')?.value || '';
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        const signRes = await fetch('/uploads/sign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'CSRF-Token': csrfToken },
          body: JSON.stringify({ mime: file.type, ext, name: file.name, sha256 })
        });

        if (!signRes.ok) throw new Error('署名取得失敗');
        const signData = await signRes.json();

        let meta;
        if (signData.exists && signData.image?.url) {
          // 重複画像：既存を使用
          meta = {
            url: signData.image.url,
            r2_key: signData.image.r2_key
          };
        } else {
          // 2. R2へPUT
          const { key, putUrl } = signData;
          const putRes = await fetch(putUrl, { method: 'PUT', body: file });
          if (!putRes.ok) throw new Error('アップロード失敗');

          // 3. confirm
          const confirmRes = await fetch('/uploads/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'CSRF-Token': csrfToken },
            body: JSON.stringify({ key, bytes: file.size, mime: file.type })
          });

          if (!confirmRes.ok) throw new Error('確認処理失敗');
          const confirmData = await confirmRes.json();

          meta = {
            url: confirmData.image?.url || confirmData.url,
            r2_key: confirmData.image?.r2_key || key
          };
        }

        // プレビュー更新
        updateIconPreview(meta.url);
        iconUrlInput.value = meta.url;
        iconR2KeyInput.value = meta.r2_key || '';

        iconMsg.textContent = 'アップロード完了';
        iconMsg.style.color = 'var(--accent)';

        if (iconRemoveBtn) iconRemoveBtn.style.display = 'inline-block';

      } catch (e) {
        console.error('[icon upload] error:', e);
        iconMsg.textContent = 'アップロード失敗';
        iconMsg.style.color = 'var(--danger)';
      } finally {
        iconFileInput.value = '';
      }
    });
  }

  // アイコン削除
  if (iconRemoveBtn) {
    iconRemoveBtn.addEventListener('click', () => {
      if (!confirm('アイコン画像を削除しますか？')) return;

      iconUrlInput.value = '';
      iconR2KeyInput.value = '';
      updateIconPreview(null);
      iconRemoveBtn.style.display = 'none';

      iconMsg.textContent = 'アイコンが削除されます（保存ボタンを押して確定）';
      iconMsg.style.color = 'var(--muted)';
    });
  }
});
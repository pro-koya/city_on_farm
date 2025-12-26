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

  // 決済方法フォームの処理は後で実装（paymentMethodFormの処理で統合）

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

  // ========== ライブラリから選択 ==========
  if (iconLibraryBtn) {
    iconLibraryBtn.addEventListener('click', async () => {
      try {
        await openIconLibrary();
      } catch (e) {
        console.error('[icon library] error:', e);
        alert('画像ライブラリの読み込みに失敗しました。');
      }
    });
  }

  async function openIconLibrary() {
    const modal = buildIconLibraryModal();
    document.body.appendChild(modal.wrap);
    await loadIconLibraryPage(modal, 1, '');
  }

  function buildIconLibraryModal() {
    const wrap = document.createElement('div');
    wrap.className = 'uploader-lib__wrap';
    wrap.innerHTML = `
      <style>
        .uploader-lib__wrap{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:1200}
        .uploader-lib{background:#fff;max-width:960px;width:92vw;max-height:86vh;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.3);display:flex;flex-direction:column}
        .uploader-lib__head{display:flex;gap:.5rem;align-items:center;justify-content:space-between;padding:.75rem 1rem;border-bottom:1px solid #e5e7eb}
        .uploader-lib__title{margin:0;font-size:1rem}
        .uploader-lib__body{padding: .75rem 1rem; overflow:auto}
        .uploader-lib__grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:.6rem}
        .uploader-lib__item{border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;cursor:pointer;background:#fff;transition:all 0.2s ease}
        .uploader-lib__item:hover{border-color:#4C6B5C;box-shadow:0 2px 8px rgba(0,0,0,0.1)}
        .uploader-lib__item img{display:block;width:100%;height:100px;object-fit:cover}
        .uploader-lib__foot{display:flex;justify-content:space-between;align-items:center;padding:.6rem 1rem;border-top:1px solid #e5e7eb}
        .uploader-lib__search{display:flex;gap:.4rem}
        .uploader-lib__search input{border:1px solid #e5e7eb;border-radius:999px;padding:.4rem .75rem;min-width:220px}
        .uploader-lib__btn{background:#4C6B5C;color:#fff;border:1px solid #4C6B5C;border-radius:999px;padding:.4rem .9rem;cursor:pointer}
        .uploader-lib__close{background:#fff;color:#4C6B5C;border:1px solid #e5e7eb;border-radius:999px;padding:.35rem .8rem;cursor:pointer}
        .uploader-lib__empty{color:#6b7280;padding:.6rem 0}
      </style>
      <div class="uploader-lib" role="dialog" aria-modal="true" aria-label="画像ライブラリ">
        <div class="uploader-lib__head">
          <h3 class="uploader-lib__title">画像ライブラリ</h3>
          <button type="button" class="uploader-lib__close">閉じる</button>
        </div>
        <div class="uploader-lib__body">
          <div class="uploader-lib__grid" id="iconLibGrid"><div class="uploader-lib__empty">読み込み中…</div></div>
        </div>
        <div class="uploader-lib__foot">
          <div class="uploader-lib__search">
            <input type="search" id="iconLibQ" placeholder="検索（ファイル名など）">
            <button class="uploader-lib__btn" id="iconLibSearch">検索</button>
          </div>
          <div>
            <button class="uploader-lib__close">閉じる</button>
          </div>
        </div>
      </div>
    `;
    const close = () => wrap.remove();
    wrap.querySelectorAll('.uploader-lib__close').forEach(b => b.addEventListener('click', close));
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    wrap.q = wrap.querySelector('#iconLibQ');
    wrap.btn = wrap.querySelector('#iconLibSearch');
    wrap.grid = wrap.querySelector('#iconLibGrid');
    wrap.btn.addEventListener('click', () => loadIconLibraryPage({ wrap, grid: wrap.grid, q: wrap.q }, 1, wrap.q.value.trim()));
    return { wrap, grid: wrap.grid, q: wrap.q };
  }

  async function loadIconLibraryPage(modal, page = 1, q = '') {
    const url = new URL('/uploads/library', location.origin);
    if (q) url.searchParams.set('q', q);
    url.searchParams.set('page', page);
    
    const csrfToken = document.querySelector('input[name="_csrf"]')?.value || '';
    const res = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json', 'CSRF-Token': csrfToken }
    });
    
    if (!res.ok) throw new Error('library fetch failed');
    const data = await res.json();
    const items = Array.isArray(data?.items) ? data.items : [];

    modal.grid.innerHTML = '';
    if (!items.length) {
      modal.grid.innerHTML = `<div class="uploader-lib__empty">該当する画像がありません。</div>`;
      return;
    }

    items.forEach(img => {
      const card = document.createElement('div');
      card.className = 'uploader-lib__item';
      card.innerHTML = `<img src="${img.url}" alt=""><div style="padding:.4rem .5rem;font-size:.75rem;color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${img.r2_key || ''}</div>`;
      card.addEventListener('click', () => {
        // 選択された画像を設定
        updateIconPreview(img.url);
        iconUrlInput.value = img.url;
        iconR2KeyInput.value = img.r2_key || '';
        iconMsg.textContent = '画像を選択しました';
        iconMsg.style.color = 'var(--accent)';
        if (iconRemoveBtn) iconRemoveBtn.style.display = 'inline-block';
        modal.wrap.remove();
      });
      modal.grid.appendChild(card);
    });
  }

  // ===== 決済方法フォームの送信処理 =====
  const paymentMethodForm = document.getElementById('paymentMethodForm');
  const paymentMethodError = document.getElementById('paymentMethodError');
  
  if (paymentMethodForm) {
    paymentMethodForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      // エラーメッセージを非表示
      if (paymentMethodError) {
        paymentMethodError.style.display = 'none';
        paymentMethodError.textContent = '';
      }

      // フォームデータを取得
      const formData = new FormData(paymentMethodForm);
      const csrfToken = formData.get('_csrf');

      // 選択された決済方法を取得
      const selectedMethods = Array.from(formData.getAll('methods'));

      // URLSearchParamsに変換（application/x-www-form-urlencodedで送信するため）
      const params = new URLSearchParams();
      params.append('_csrf', csrfToken);
      selectedMethods.forEach(method => {
        params.append('methods', method);
      });

      // ボタンを無効化
      const submitBtn = paymentMethodForm.querySelector('button[type="submit"]');
      const originalBtnText = submitBtn ? submitBtn.textContent : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '保存中…';
      }

      try {
        const response = await fetch(paymentMethodForm.action, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest',
            'Accept': 'application/json',
            'X-CSRF-Token': csrfToken,
            'CSRF-Token': csrfToken
          },
          body: params.toString(),
          credentials: 'same-origin'
        });
        
        // レスポンスのContent-Typeを確認
        const contentType = response.headers.get('content-type');
        let data;
        
        if (contentType && contentType.includes('application/json')) {
          // JSON形式のレスポンス
          data = await response.json().catch((err) => {
            console.error('JSON解析エラー:', err);
            return { ok: false, message: 'サーバーからの応答を解析できませんでした。' };
          });
        } else {
          // JSON形式でない場合（テキストやHTMLなど）
          const text = await response.text().catch(() => '');
          console.error('非JSONレスポンス:', { status: response.status, statusText: response.statusText, body: text });
          
          let errorMessage = '決済方法の保存に失敗しました。';
          if (response.status === 400) {
            errorMessage = 'リクエストが不正です。';
          } else if (response.status === 403) {
            errorMessage = '権限がありません。';
          } else if (response.status === 500) {
            errorMessage = 'サーバーエラーが発生しました。';
          }
          
          data = { ok: false, message: errorMessage };
        }
        
        if (!response.ok || !data.ok) {
          // エラーメッセージを表示
          if (paymentMethodError) {
            paymentMethodError.textContent = data.message || '決済方法の保存に失敗しました。';
            paymentMethodError.style.display = 'block';
            
            // エラーメッセージまでスクロール
            paymentMethodError.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
            alert(data.message || '決済方法の保存に失敗しました。');
          }
          
          // ボタンを再有効化
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText;
          }
          return;
        }
        
        // 成功時はリダイレクト（フラッシュメッセージを確実に表示するため）
        // reload()ではなくhrefでリダイレクトすることで、フラッシュメッセージが確実に表示される
        window.location.href = paymentMethodForm.action.replace('/payments', '');
      } catch (err) {
        console.error('決済方法保存エラー:', err);
        if (paymentMethodError) {
          paymentMethodError.textContent = '通信に失敗しました。もう一度お試しください。';
          paymentMethodError.style.display = 'block';
          paymentMethodError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          alert('通信に失敗しました。もう一度お試しください。');
        }
        
        // ボタンを再有効化
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalBtnText;
        }
      }
    });
  }

  // ===== 配送方法フォームの送信処理 =====
  const shipMethodForm = document.getElementById('shipMethodForm');
  const shipMethodError = document.getElementById('shipMethodError');

  if (shipMethodForm) {
    shipMethodForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      // エラーメッセージを非表示
      if (shipMethodError) {
        shipMethodError.style.display = 'none';
        shipMethodError.textContent = '';
      }

      // フォームデータを取得
      const formData = new FormData(shipMethodForm);
      const csrfToken = formData.get('_csrf');

      // 選択された配送方法を取得
      const selectedMethods = Array.from(formData.getAll('methods'));

      // URLSearchParamsに変換（application/x-www-form-urlencodedで送信するため）
      const params = new URLSearchParams();
      params.append('_csrf', csrfToken);
      selectedMethods.forEach(method => {
        params.append('methods', method);
      });

      // ボタンを無効化
      const submitBtn = shipMethodForm.querySelector('button[type="submit"]');
      const originalBtnText = submitBtn ? submitBtn.textContent : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '保存中…';
      }

      try {
        const response = await fetch(shipMethodForm.action, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest',
            'Accept': 'application/json',
            'X-CSRF-Token': csrfToken,
            'CSRF-Token': csrfToken
          },
          body: params.toString(),
          credentials: 'same-origin'
        });

        // レスポンスのContent-Typeを確認
        const contentType = response.headers.get('content-type');
        let data;

        if (contentType && contentType.includes('application/json')) {
          // JSON形式のレスポンス
          data = await response.json().catch((err) => {
            console.error('JSON解析エラー:', err);
            return { ok: false, message: 'サーバーからの応答を解析できませんでした。' };
          });
        } else {
          // JSON形式でない場合（テキストやHTMLなど）
          const text = await response.text().catch(() => '');
          console.error('非JSONレスポンス:', { status: response.status, statusText: response.statusText, body: text });

          let errorMessage = '配送方法の保存に失敗しました。';
          if (response.status === 400) {
            errorMessage = 'リクエストが不正です。';
          } else if (response.status === 403) {
            errorMessage = '権限がありません。';
          } else if (response.status === 500) {
            errorMessage = 'サーバーエラーが発生しました。';
          }

          data = { ok: false, message: errorMessage };
        }

        if (!response.ok || !data.ok) {
          // エラーメッセージを表示
          if (shipMethodError) {
            shipMethodError.textContent = data.message || '配送方法の保存に失敗しました。';
            shipMethodError.style.display = 'block';

            // エラーメッセージまでスクロール
            shipMethodError.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
            alert(data.message || '配送方法の保存に失敗しました。');
          }

          // ボタンを再有効化
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText;
          }
          return;
        }

        // 成功時はリダイレクト（フラッシュメッセージを確実に表示するため）
        // reload()ではなくhrefでリダイレクトすることで、フラッシュメッセージが確実に表示される
        window.location.href = shipMethodForm.action.replace('/shipmethods', '');
      } catch (err) {
        console.error('配送方法保存エラー:', err);
        if (shipMethodError) {
          shipMethodError.textContent = '通信に失敗しました。もう一度お試しください。';
          shipMethodError.style.display = 'block';
          shipMethodError.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          alert('通信に失敗しました。もう一度お試しください。');
        }

        // ボタンを再有効化
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalBtnText;
        }
      }
    });
  }
});
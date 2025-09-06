// /public/js/seller-listings.js
(() => {
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  // ---- DOM参照
  const selectAll   = $('#selectAll');
  const rowChecks   = () => $$('.rowCheck');
  const bulkSelect  = $('#bulkAction');
  // idゆれ対策（applyBulk / bulkApply どちらでも拾う）
  const bulkBtn     = $('#applyBulk') || $('#bulkApply');
  const bulkForm    = $('#bulkForm'); // hidden の _csrf を拾うため
  const csrfToken   = bulkForm ? bulkForm.querySelector('input[name="_csrf"]')?.value : '';

  // 選択数表示
  const countEl = document.createElement('span');
  countEl.className = 'count';
  const bulkLeft = $('.bulk__left');
  if (bulkLeft && !$('.bulk__left .count')) {
    const sep = document.createTextNode(' / ');
    bulkLeft.appendChild(sep);
    bulkLeft.appendChild(countEl);
  }

  // ---- 選択状態
  const selected = new Set();

  function syncUI() {
    // 各行/カードのチェック・ハイライト
    rowChecks().forEach(cb => {
      const id = String(cb.value);
      const on = selected.has(id);
      cb.checked = on;
      const tr   = cb.closest('tr');
      if (tr) tr.classList.toggle('is-selected', on);
      const card = cb.closest('.card');
      if (card) card.classList.toggle('is-selected', on);
    });

    // selectAll の tri-state
    const total    = rowChecks().length;
    const selCount = selected.size;
    if (selectAll) {
      selectAll.indeterminate = selCount > 0 && selCount < total;
      selectAll.checked       = selCount > 0 && selCount === total;
    }

    // 選択数表示
    if (countEl) countEl.textContent = `選択 ${selCount} 件`;

    // バルク適用ボタン活性
    if (bulkBtn) bulkBtn.disabled = selCount === 0 || (bulkSelect && !bulkSelect.value);
  }

  // ---- 行/カードのチェック操作
  document.addEventListener('change', (e) => {
    const cb = e.target.closest('.rowCheck');
    if (!cb) return;
    const id = String(cb.value);
    if (cb.checked) selected.add(id); else selected.delete(id);
    syncUI();
  });

  // 行全体クリックでトグル（リンク/ボタンは除外）
  document.addEventListener('click', (e) => {
    const tr = e.target.closest('tr');
    if (!tr || !tr.querySelector('.rowCheck')) return;
    if (e.target.closest('a, button, .icon-btn, .chk')) return;
    const cb = tr.querySelector('.rowCheck');
    cb.checked = !cb.checked;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // カード全体クリックでトグル
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card || !card.querySelector('.rowCheck')) return;
    if (e.target.closest('a, button, .icon-btn, .chk')) return;
    const cb = card.querySelector('.rowCheck');
    cb.checked = !cb.checked;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // ---- 全選択
  if (selectAll) {
    selectAll.addEventListener('change', () => {
      if (selectAll.checked) {
        rowChecks().forEach(cb => selected.add(String(cb.value)));
      } else {
        selected.clear();
      }
      syncUI();
    });
  }

  // ---- バルク操作の活性制御
  if (bulkSelect && bulkBtn) {
    bulkSelect.addEventListener('change', () => {
      bulkBtn.disabled = selected.size === 0 || !bulkSelect.value;
    });
  }

  // ---- バルク適用（Fetch + CSRF ヘッダ）
  if (bulkBtn) {
    // フォームのsubmitはJSに任せる
    bulkBtn.type = 'button';
    bulkBtn.addEventListener('click', async () => {
      if (!bulkSelect || !bulkSelect.value || selected.size === 0) return;

      const ids = Array.from(selected);
      const body = new URLSearchParams();
      body.set('bulkAction', bulkSelect.value);
      ids.forEach(v => body.append('ids', v));

      bulkBtn.disabled = true;
      try {
        const resp = await fetch('/seller/listings/bulk', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest',
            'csrf-token': csrfToken
          },
          body
        });
        if (!resp.ok) throw new Error('Bulk failed');
        location.reload();
      } catch (err) {
        alert('一括操作に失敗しました');
      } finally {
        bulkBtn.disabled = false;
      }
    });
  }

  // ---- 公開/非公開トグル
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.js-quick-toggle');
    if (!btn) return;
    const id   = btn.getAttribute('data-id');
    const next = btn.getAttribute('data-next'); // 'public' | 'private' | 'draft'
    if (!id || !next) return;

    btn.disabled = true;
    try {
      const resp = await fetch(`/seller/listings/${encodeURIComponent(id)}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'csrf-token': csrfToken
        },
        body: JSON.stringify({ status: next })
      });
      if (!resp.ok) throw new Error('toggle failed');
      location.reload();
    } catch (err) {
      alert('公開状態の切替に失敗しました');
    } finally {
      btn.disabled = false;
    }
  });

  // ---- 複製
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.js-duplicate');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    if (!id) return;

    btn.disabled = true;
    try {
      const resp = await fetch(`/seller/listings/${encodeURIComponent(id)}/duplicate`, {
        method: 'POST',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'csrf-token': csrfToken
        }
      });
      if (!resp.ok) throw new Error('dup failed');
      location.reload();
    } catch (err) {
      alert('複製に失敗しました');
    } finally {
      btn.disabled = false;
    }
  });

  // ---- 削除
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.js-delete');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    if (!id) return;

    if (!confirm('削除してよろしいですか？この操作は取り消せません。')) return;

    btn.disabled = true;
    try {
      const resp = await fetch(`/seller/listings/${encodeURIComponent(id)}/delete`, {
        method: 'POST',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'csrf-token': csrfToken
        }
      });
      if (!resp.ok) throw new Error('del failed');
      location.reload();
    } catch (err) {
      alert('削除に失敗しました');
    } finally {
      btn.disabled = false;
    }
  });

  // 初期同期
  syncUI();
})();
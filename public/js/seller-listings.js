(() => {
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  const selectAll = $('#selectAll');
  const rowChecks = () => $$('.rowCheck');
  const bulkBtn = $('#bulkApply');            // バルク実行ボタン（あれば）
  const bulkSelect = $('#bulkAction');        // バルクアクション <select>（あれば）
  const countEl = document.createElement('span');
  countEl.className = 'count';
  // bulk 左側ラベルの横に選択数を差し込む（なければスキップ）
  const bulkLeft = $('.bulk__left');
  if (bulkLeft && !$('.bulk__left .count')) {
    const sep = document.createTextNode(' / ');
    bulkLeft.appendChild(sep);
    bulkLeft.appendChild(countEl);
  }

  const selected = new Set();

  function syncUI() {
    // チェック状態反映 & 行/カードのハイライト
    rowChecks().forEach(cb => {
      const id = String(cb.value);
      const on = selected.has(id);
      cb.checked = on;

      // 行とカードのハイライト
      const tr = cb.closest('tr');
      if (tr) tr.classList.toggle('is-selected', on);
      const card = cb.closest('.card');
      if (card) card.classList.toggle('is-selected', on);
    });

    // SelectAll の indeterminate
    const total = rowChecks().length;
    const selCount = selected.size;
    if (selectAll) {
      selectAll.indeterminate = selCount > 0 && selCount < total;
      selectAll.checked = selCount > 0 && selCount === total;
    }

    // 選択数の表示
    if (countEl) {
      countEl.textContent = `選択 ${selCount} 件`;
    }

    // バルク操作の有効化
    if (bulkBtn) bulkBtn.disabled = selCount === 0 || (bulkSelect && !bulkSelect.value);
  }

  // 各行チェック
  document.addEventListener('change', (e) => {
    const cb = e.target.closest('.rowCheck');
    if (!cb) return;
    const id = String(cb.value);
    if (cb.checked) selected.add(id);
    else selected.delete(id);
    syncUI();
  });

  // 行クリックでチェック（セル無視したい場合は調整）
  document.addEventListener('click', (e) => {
    const tr = e.target.closest('tr');
    if (!tr || !tr.querySelector('.rowCheck')) return;
    // アイコンやリンククリックは除外
    if (e.target.closest('a, button, .icon-btn, .chk')) return;
    const cb = tr.querySelector('.rowCheck');
    cb.checked = !cb.checked;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // カードクリックでもチェックON/OFF
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card || !card.querySelector('.rowCheck')) return;
    if (e.target.closest('a, button, .icon-btn, .chk')) return;
    const cb = card.querySelector('.rowCheck');
    cb.checked = !cb.checked;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // 全選択
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

  // バルク：アクション選択に応じてボタンON/OFF
  if (bulkSelect && bulkBtn) {
    bulkSelect.addEventListener('change', () => {
      bulkBtn.disabled = selected.size === 0 || !bulkSelect.value;
    });
  }

  // バルク実行（POST）
  if (bulkBtn) {
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
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
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

  // 初期同期
  syncUI();
})();
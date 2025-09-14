(() => {
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  const form = $('#edit-form');
  const dirtyFlag = $('#dirtyFlag');
  const setDirty = () => { if (dirtyFlag) dirtyFlag.value = '1'; };
  form.addEventListener('input', setDirty, true);
  form.addEventListener('change', setDirty, true);

  // ===== 離脱警告 =====
  window.addEventListener('beforeunload', (e) => {
    if (dirtyFlag && dirtyFlag.value === '1') {
      e.preventDefault(); e.returnValue = '';
    }
  });
  form.addEventListener('submit', () => { if (dirtyFlag) dirtyFlag.value = '0'; });

  // ===== スペック：行追加/削除・並びの採番 =====
  const specsWrap = $('#specs');
  const addSpecBtn = $('#addSpec');
  function resequenceSpecs(){
    const rows = $$('.kv__row', specsWrap);
    rows.forEach((row, i) => {
      const id    = row.querySelector('input[name*="[id]"]');
      const label = row.querySelector('input[name*="[label]"]');
      const value = row.querySelector('input[name*="[value]"]');
      const pos   = row.querySelector('input[name*="[position]"]');
      if (id)    id.name    = `specs[${i}][id]`;
      if (label) label.name = `specs[${i}][label]`;
      if (value) value.name = `specs[${i}][value]`;
      if (pos)   pos.name   = `specs[${i}][position]`, pos.value = i;
    });
  }
  addSpecBtn?.addEventListener('click', () => {
    const i = $$('.kv__row', specsWrap).length;
    const div = document.createElement('div');
    div.className = 'kv__row';
    div.innerHTML = `
      <input type="text" name="specs[${i}][label]" placeholder="項目名（例：サイズ）">
      <input type="text" name="specs[${i}][value]" placeholder="値（例：M〜L）">
      <input type="hidden" name="specs[${i}][position]" value="${i}">
      <button type="button" class="icon-btn kv__del" title="削除">✕</button>
    `;
    specsWrap.appendChild(div);
    setDirty();
  });
  specsWrap?.addEventListener('click', (e) => {
    const del = e.target.closest('.kv__del');
    if (!del) return;
    del.closest('.kv__row')?.remove();
    resequenceSpecs();
    setDirty();
  });

  // ===== 画像：既存の削除 & 並び替え =====
  const curList = $('#currentImages');

  // 削除
  curList?.addEventListener('click', (e) => {
    const btn = e.target.closest('.img-del');
    if (!btn) return;
    const li = btn.closest('.uploader__item');
    li?.remove();
    renumberImages();
    setDirty();
  });

  // 並び替え（HTML5 DnD 簡易実装）
  let dragSrc = null;
  curList?.addEventListener('dragstart', (e) => {
    const li = e.target.closest('.uploader__item');
    if (!li) return;
    if (!e.target.closest('.handle')) { e.preventDefault(); return; }
    dragSrc = li;
    e.dataTransfer.effectAllowed = 'move';
    li.classList.add('dragging');
  });
  curList?.addEventListener('dragover', (e) => {
    e.preventDefault();
    const after = getDragAfterElement(curList, e.clientY, e.clientX);
    const dragging = $('.uploader__item.dragging', curList);
    if (!dragging) return;
    if (after == null) curList.appendChild(dragging);
    else curList.insertBefore(dragging, after);
  });
  curList?.addEventListener('drop', (e) => {
    e.preventDefault();
    $('.uploader__item.dragging', curList)?.classList.remove('dragging');
    renumberImages();
    setDirty();
  });
  curList?.addEventListener('dragend', () => {
    $('.uploader__item.dragging', curList)?.classList.remove('dragging');
  });
  function getDragAfterElement(container, y, x){
    const els = [...container.querySelectorAll('.uploader__item:not(.dragging)')];
    return els.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - (box.top + box.height/2);
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      } else return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }
  function renumberImages(){
    $$('.uploader__item', curList).forEach((li, i) => {
      const id  = li.querySelector('input[name*="[id]"]');
      const url = li.querySelector('input[name*="[url]"]');
      const alt = li.querySelector('input[name*="[alt]"]');
      const pos = li.querySelector('input[name*="[position]"]');
      if (id)  id.name  = `images[${i}][id]`;
      if (url) url.name = `images[${i}][url]`;
      if (alt) alt.name = `images[${i}][alt]`;
      if (pos) { pos.name = `images[${i}][position]`; pos.value = i; }
    });
  }

  // 新規画像の選択（プレビューのみ・実保存はサーバ実装次第）
  const pickerBtn = $('#openPicker');
  const fileInput = $('#images');
  const previewList = $('#previewList');
  pickerBtn?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', () => {
    previewList.innerHTML = '';
    [...fileInput.files].forEach(f => {
      const li = document.createElement('li');
      li.className = 'uploader__item';
      const img = document.createElement('img');
      img.src = URL.createObjectURL(f);
      li.appendChild(img);
      previewList.appendChild(li);
    });
    setDirty();
  });

  // ===== 下書き保存（status を draft にして送信） =====
  const saveDraftBtn = $('#saveDraft') || $('#sideSaveDraft');
  saveDraftBtn?.addEventListener('click', () => {
    const status = $('#status');
    if (status) status.value = 'draft';
    form.requestSubmit($('#saveBtn') || form.querySelector('button[type="submit"]'));
  });

  // ===== 危険操作（削除） =====
  const deleteBtn = $('#deleteBtn');
  deleteBtn?.addEventListener('click', async () => {
    if (!confirm('この商品を削除します。よろしいですか？')) return;
    const { csrf, productId } = window.__EDIT_DATA__ || {};
    try {
      const resp = await fetch(`/seller/listings/${productId}/delete`, {
        method: 'POST',
        headers: { 'Content-Type':'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ _csrf: csrf })
      });
      if (!resp.ok) throw new Error('delete failed');
      location.href = '/seller/listings';
    } catch (e) {
      alert('削除に失敗しました。時間をおいて再度お試しください。');
    }
  });
})();
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

  // 削除（そのまま）
  curList?.addEventListener('click', (e) => {
    const btn = e.target.closest('.img-del');
    if (!btn) return;
    const li = btn.closest('.uploader__item');
    li?.remove();
    renumberImages();
    setDirty();
  });

  if (curList) {
    let drag = null;   // { el, ph, baseX, baseY, w, h, startX, startY }
    let rafId = 0;     // requestAnimationFrame 用
    let pendingMove = null; // 最新 move イベント（rAFでまとめて描画）
    const HYST = 6;    // 6px しきい値（小さいブレで入れ替えしない）

    curList.addEventListener('pointerdown', (e) => {
      const handle = e.target.closest('.handle');
      if (!handle) return;

      const el = handle.closest('.uploader__item');
      if (!el) return;

      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);

      const listRect = curList.getBoundingClientRect();
      const r = el.getBoundingClientRect();

      // プレースホルダー
      const ph = document.createElement('li');
      ph.className = 'uploader__item uploader__placeholder';
      ph.style.height = r.height + 'px';
      ph.style.width  = r.width  + 'px';
      curList.insertBefore(ph, el);

      // 絶対配置に切り替え（親基準）
      const baseX = r.left - listRect.left + curList.scrollLeft;
      const baseY = r.top  - listRect.top  + curList.scrollTop;

      Object.assign(el.style, {
        position: 'absolute',
        top: 0, left: 0,
        width: r.width + 'px',
        height: r.height + 'px',
        transform: `translate(${baseX}px, ${baseY}px)`,
        zIndex: 1000,
        pointerEvents: 'none'
      });
      el.classList.add('dragging');
      curList.style.minHeight = curList.getBoundingClientRect().height + 'px';

      drag = {
        el, ph,
        baseX, baseY,
        w: r.width, h: r.height,
        startX: e.clientX,
        startY: e.clientY
      };
    });

    const onPointerMove = (e) => {
      if (!drag) return;
      pendingMove = e;
      if (!rafId) rafId = requestAnimationFrame(tick);
    };

    const tick = () => {
      rafId = 0;
      if (!drag || !pendingMove) return;
      const e = pendingMove;
      pendingMove = null;

      // 追従（原点は pointerdown の座標で固定 → ドリフト無し）
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      drag.el.style.transform = `translate(${drag.baseX + dx}px, ${drag.baseY + dy}px)`;

      // しきい値以下なら挿入判定しない（チラつき防止）
      if (Math.abs(dx) < HYST && Math.abs(dy) < HYST) return;

      // 挿入インデックス判定（グリッド対応：距離が最も近いカードの前後）
      const idx = calcInsertIndex(e.clientX, e.clientY, drag.el, drag.ph);
      const list = itemsExcept([drag.el, drag.ph]);
      if (idx <= 0) {
        curList.insertBefore(drag.ph, list[0] || null);
      } else if (idx >= list.length) {
        curList.appendChild(drag.ph);
      } else {
        curList.insertBefore(drag.ph, list[idx]);
      }

      // オートスクロール（上下端）
      autoScroll(e.clientY);
    };

    const onPointerUp = () => {
      if (!drag) return;

      // プレースホルダ位置へ確定
      curList.insertBefore(drag.el, drag.ph);
      drag.ph.remove();

      // スタイル解除
      drag.el.classList.remove('dragging');
      Object.assign(drag.el.style, {
        position: '', top: '', left: '', width: '', height: '', transform: '', zIndex: '', pointerEvents: ''
      });
      curList.style.minHeight = '';

      renumberImages();
      setDirty();

      drag = null;
      pendingMove = null;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    // ---- helper ----
    function itemsExcept(ex){
      const set = new Set(ex);
      return Array.from(curList.querySelectorAll('.uploader__item')).filter(x => !set.has(x));
    }

    // 画面座標 (cx,cy) に最も近いカードを探し、「前後」を決めて挿入位置 index を返す
    function calcInsertIndex(cx, cy, draggingEl, placeholder){
      const items = Array.from(curList.querySelectorAll('.uploader__item'))
        .filter(x => x !== draggingEl && x !== placeholder);
      if (!items.length) return 0;

      // 最も近い要素
      let best = { i:-1, d: Infinity, rect: null };
      items.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        const cxEl = r.left + r.width/2;
        const cyEl = r.top  + r.height/2;
        const d = (cx - cxEl)*(cx - cxEl) + (cy - cyEl)*(cy - cyEl);
        if (d < best.d) best = { i, d, rect: r };
      });

      const target = items[best.i];
      const r = best.rect;

      // 同じ「行」に近ければ X で前後判定、離れていれば Y で上下判定
      const sameRow = cy > r.top && cy < r.bottom;
      const before  = sameRow ? (cx < r.left + r.width/2) : (cy < r.top + r.height/2);

      return best.i + (before ? 0 : 1);
    }

    function autoScroll(clientY){
      const EDGE = 60;
      const rect = curList.getBoundingClientRect();
      if (clientY < rect.top + EDGE)   curList.scrollTop -= 12;
      if (clientY > rect.bottom - EDGE) curList.scrollTop += 12;
    }
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
  // const pickerBtn   = $('#openPicker');
  // const fileInput   = $('#images');
  const imageJsonEl = document.getElementById('imageJson');
  const maxImages   = (window.__EDIT_DATA__ && window.__EDIT_DATA__.maxImages) || 8;

  function appendImageToCurrentList({ url }) {
    const idx = curList.querySelectorAll('.uploader__item').length;
    const li = document.createElement('li');
    li.className = 'uploader__item';
    li.innerHTML = `
      <input type="hidden" name="images[${idx}][url]" value="${url}">
      <input type="hidden" name="images[${idx}][position]" value="${idx}">
      <img src="${url}" alt="">
      <input class="alt" type="text" name="images[${idx}][alt]" placeholder="代替テキスト" value="">
      <button type="button" class="icon-btn danger img-del" title="削除">✕</button>
      <span class="handle" title="ドラッグで並び替え">↕</span>
    `;
    curList.appendChild(li);
  }

  function appendToImageJson(meta) {
    try {
      const arr = JSON.parse(imageJsonEl.value || '[]');
      arr.push({
        url: meta.url,
        r2_key: meta.r2_key || null,
        mime: meta.mime || null,
        bytes: Number.isFinite(Number(meta.bytes)) ? Number(meta.bytes) : null,
        width: Number.isFinite(Number(meta.width)) ? Number(meta.width) : null,
        height: Number.isFinite(Number(meta.height)) ? Number(meta.height) : null
      });
      imageJsonEl.value = JSON.stringify(arr);
    } catch {
      imageJsonEl.value = JSON.stringify([{
        url: meta.url,
        r2_key: meta.r2_key || null,
        mime: meta.mime || null,
        bytes: Number.isFinite(Number(meta.bytes)) ? Number(meta.bytes) : null,
        width: Number.isFinite(Number(meta.width)) ? Number(meta.width) : null,
        height: Number.isFinite(Number(meta.height)) ? Number(meta.height) : null
      }]);
    }
  }

  // ★ 共通ローダを初期化（必須IDが全部あること！）
  window.initR2Uploader({
    openBtnId:   'openPicker',
    fileInputId: 'images',
    listId:      'previewList',   // hiddenでもOK（必須ID）
    textareaId:  'imageUrls',     // hiddenでもOK（必須ID）
    msgId:       'uploaderMsg',
    max:         maxImages,
    countFn:     () => curList.querySelectorAll('.uploader__item').length,
    onUploaded:  (meta) => {
      appendImageToCurrentList({ url: meta.url });
      appendToImageJson(meta);
      renumberImages();
      setDirty();
    }
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
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
  const maxImages = parseInt(document.getElementById('uploader')?.dataset.max || '8', 10);

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
      if (!arr.some(x => x.url === meta.url)) {
        arr.push({
          url: meta.url,
          r2_key: meta.r2_key || null,
          mime: meta.mime || null,
          bytes: Number.isFinite(Number(meta.bytes)) ? Number(meta.bytes) : null,
          width: Number.isFinite(Number(meta.width)) ? Number(meta.width) : null,
          height: Number.isFinite(Number(meta.height)) ? Number(meta.height) : null
        });
        imageJsonEl.value = JSON.stringify(arr);
      }
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

  // ===== 画像ライブラリ（R2の既存資産から選択） =====
  // ボタンは id="openLibrary" もしくは data-open-library 属性で検出
  const libBtn = document.getElementById('openLibrary') || document.querySelector('[data-open-library]');

  // ライブラリ用の簡易モーダルDOMを動的に作成
  function ensureLibraryModal(){
    let wrap = document.getElementById('imgLibModal');
    if (wrap) return wrap;
    wrap = document.createElement('div');
    wrap.id = 'imgLibModal';
    wrap.innerHTML = `
      <div class="lib__backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,.35);backdrop-filter:saturate(1.1) blur(2px);"></div>
      <div class="lib__panel" role="dialog" aria-modal="true"
           style="position:fixed;top:75px;left:0;right:0;margin:0 auto;max-width:980px;background:#fff;border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,.18);overflow:hidden">
        <header style="display:flex;gap:.5rem;align-items:center;padding:.6rem .8rem;border-bottom:1px solid #e5e7eb">
          <form id="imgLibSearchForm" style="display:flex;gap:.4rem;align-items:center">
            <input id="imgLibQ" type="search" placeholder="検索" style="min-width:200px;border:1px solid #e5e7eb;border-radius:10px;padding:.4rem .6rem">
            <button type="submit" class="btn" style="padding:.4rem .8rem;border-radius:10px;border:1px solid #4C6B5C;background:#4C6B5C;color:#fff">検索</button>
          </form>
          <button type="button" id="imgLibClose" aria-label="閉じる" style="margin-left:.5rem;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:.35rem .6rem">✕</button>
        </header>
        <div id="imgLibBody" style="max-height:60vh;overflow:auto;padding:.6rem"></div>
        <footer style="display:flex;justify-content:space-between;align-items:center;padding:.6rem .8rem;border-top:1px solid #e5e7eb">
          <div id="imgLibPager" class="muted" style="font-size:.9rem;color:#6b7280"></div>
          <div>
            <button type="button" id="imgLibUse" class="btn" style="padding:.5rem 1rem;border-radius:999px;border:1px solid #4C6B5C;background:#4C6B5C;color:#fff" disabled>選択した画像を追加</button>
          </div>
        </footer>
      </div>`;
    document.body.appendChild(wrap);
    return wrap;
  }

  // APIから一覧を取得
  async function fetchLibrary({ q = '', page = 1, pageSize = 24 } = {}){
    const u = new URL('/uploads/library', location.origin);
    if (q) u.searchParams.set('q', q);
    u.searchParams.set('page', page);
    u.searchParams.set('pageSize', pageSize);
    u.searchParams.set('all', '1'); // ★ 全ファイル対象に切り替え（サーバー側の /uploads/library が all=1 をサポート）
    const resp = await fetch(u, { headers: { 'Accept': 'application/json' } });
    if (!resp.ok) throw new Error('library fetch failed');
    return resp.json(); // { ok, items:[{url,r2_key,bytes,mime,width,height,created_at}], nextPage }
  }

  // レンダリング
  function renderLibrary(container, data){
    const items = Array.isArray(data.items) ? data.items : [];
    if (!items.length){
      container.innerHTML = '<p class="muted" style="color:#6b7280;padding:.6rem">画像がありません。</p>';
      return;
    }
    const cards = items.map((it, idx) => `
      <li class="lib__card" data-key="${it.r2_key || ''}" data-url="${it.url}" data-mime="${it.mime||''}" data-bytes="${it.bytes||0}" data-width="${it.width||''}" data-height="${it.height||''}"
          style="list-style:none;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;cursor:pointer;position:relative">
        <img src="${it.url}" alt="" loading="lazy" style="display:block;width:100%;height:140px;object-fit:cover;background:#f3f4f6">
        <div style="display:flex;justify-content:space-between;gap:.4rem;padding:.35rem .5rem;font-size:.8rem;color:#374151;background:#fff">
          <span>${(it.width||'') && (it.height||'') ? `${it.width}×${it.height}` : (it.mime||'')}</span>
          <span>${it.bytes ? (Math.round(it.bytes/1024)+'KB') : ''}</span>
        </div>
        <span class="lib__check" aria-hidden="true" style="position:absolute;right:6px;top:6px;background:rgba(0,0,0,.55);color:#fff;border-radius:999px;padding:.1rem .35rem;display:none">✓</span>
      </li>`).join('');
    container.innerHTML = `<ul class="lib__grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:.6rem;padding:.2rem">${cards}</ul>`;
  }

  // 選択状態を管理
  const selected = new Set();
  function bindSelectHandlers(container){
    container.addEventListener('click', (e) => {
      const li = e.target.closest('.lib__card');
      if (!li) return;
      const url = li.getAttribute('data-url');
      if (selected.has(url)){
        selected.delete(url);
        li.querySelector('.lib__check').style.display = 'none';
        li.style.outline = '';
      } else {
        selected.add(url);
        li.querySelector('.lib__check').style.display = 'inline-block';
        li.style.outline = '2px solid #4C6B5C';
      }
      // ボタン活性/非活性
      const useBtn = document.getElementById('imgLibUse');
      if (useBtn) useBtn.disabled = selected.size === 0;
    });
  }

  async function openLibrary(){
    const modal = ensureLibraryModal();
    const body  = modal.querySelector('#imgLibBody');
    const pager = modal.querySelector('#imgLibPager');
    const form  = modal.querySelector('#imgLibSearchForm');
    const input = modal.querySelector('#imgLibQ');
    const useBtn= modal.querySelector('#imgLibUse');

    selected.clear();
    useBtn.disabled = true;

    // ロード & 初回描画
    let state = { q: input.value.trim(), page: 1, pageSize: 24, nextPage: null };
    async function load(){
      body.innerHTML = '<p class="muted" style="padding:.6rem;color:#6b7280">読み込み中…</p>';
      try {
        const data = await fetchLibrary({ q: state.q, page: state.page, pageSize: state.pageSize });
        state.nextPage = data.nextPage || null;
        renderLibrary(body, data);
        bindSelectHandlers(body);
        pager.innerHTML = `ページ ${state.page}${state.nextPage? ` / <button type="button" id="imgLibNext" class="btn" style="padding:.25rem .6rem;border-radius:10px;border:1px solid #e5e7eb;background:#fff;color:#374151">次へ</button>`:''}`;
        const next = document.getElementById('imgLibNext');
        next?.addEventListener('click', () => { state.page = state.nextPage; load(); });
      } catch {
        body.innerHTML = '<p class="muted" style="padding:.6rem;color:#b91c1c">読み込みに失敗しました。</p>';
      }
    }
    await load();

    // 検索
    form.addEventListener('submit', (e) => { e.preventDefault(); state.q = input.value.trim(); state.page = 1; load(); });

    // 閉じる
    const close = () => { modal.remove(); };
    modal.querySelector('#imgLibClose').addEventListener('click', close);
    modal.querySelector('.lib__backdrop').addEventListener('click', close);

    // 追加
    useBtn.addEventListener('click', () => {
      const urls = Array.from(selected);
      if (!urls.length) return;

      // 今の枚数と上限
      const currentCount = curList.querySelectorAll('.uploader__item').length;
      const room = Math.max(0, maxImages - currentCount);
      const toUse = urls.slice(0, room);
      if (!toUse.length){ alert(`画像は最大 ${maxImages} 枚までです。`); return; }

      // body から該当 li を探し、メタを拾って追加
      toUse.forEach(u => {
        const li = body.querySelector(`.lib__card[data-url="${CSS.escape(u)}"]`);
        const meta = {
          url: u,
          r2_key: li?.getAttribute('data-key') || null,
          mime:   li?.getAttribute('data-mime') || null,
          bytes:  Number(li?.getAttribute('data-bytes') || 0) || null,
          width:  Number(li?.getAttribute('data-width') || 0) || null,
          height: Number(li?.getAttribute('data-height') || 0) || null
        };
        appendImageToCurrentList({ url: u });
        appendToImageJson(meta);
      });
      modal.remove();
      renumberImages();
      if (typeof setDirty === 'function') setDirty();
    });
  }

  // ボタンにバインド
  libBtn?.addEventListener('click', (e) => { e.preventDefault(); openLibrary(); });

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
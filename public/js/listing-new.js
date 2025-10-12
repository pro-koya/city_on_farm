(function(){
  const form = document.getElementById('listing-form');

  // ===== 入力バリデーション（開始後に表示） =====
  function showError(id, msg){
    const p = document.querySelector(`.error[data-for="${id}"]`);
    if (p) {
        p.textContent = msg || '';
        if (msg) {
            p.classList.add('is-visible');
        } else {
            p.classList.remove('is-visible');
        }
    }
  }
  function clearError(id){ showError(id, ''); }

  function required(id, label){
    const el = document.getElementById(id);
    if (!el) return true;
    if (!el.value || (el.type==='number' && String(el.value).trim()==='')) {
      showError(id, `${label}は必須です。`); return false;
    }
    clearError(id); return true;
  }
  function positiveInt(id, label){
    const el = document.getElementById(id);
    if (!el) return true;
    const v = Number(el.value);
    if (!Number.isInteger(v) || v < 0){
      showError(id, `${label}は0以上の整数で入力してください。`); return false;
    }
    clearError(id); return true;
  }

  ['title','category','unit','description','shipMethod','shipDays','status'].forEach(id=>{
    const el = document.getElementById(id);
    el && el.addEventListener('input', ()=> clearError(id));
    el && el.addEventListener('blur',  ()=> required(id, el.previousElementSibling?.textContent?.replace('*','').trim() || id));
  });
  const price = document.getElementById('price');
  price && price.addEventListener('input', ()=> clearError('price'));
  price && price.addEventListener('blur',  ()=> required('price','価格'));

  const stock = document.getElementById('stock');
  stock && stock.addEventListener('input', ()=> clearError('stock'));
  stock && stock.addEventListener('blur',  ()=> positiveInt('stock','在庫数'));

  // ===== 仕様・規格 追加/削除 =====
  const specs = document.getElementById('specs');
  const addSpec = document.getElementById('addSpec');
  addSpec && addSpec.addEventListener('click', ()=>{
    const i = specs.querySelectorAll('.kv__row').length;
    const row = document.createElement('div');
    row.className = 'kv__row';
    row.innerHTML = `
      <input type="text" name="specs[${i}][label]" placeholder="項目名（例：サイズ）">
      <input type="text" name="specs[${i}][value]" placeholder="値（例：M〜L）">
      <button type="button" class="icon-btn kv__del" title="削除">✕</button>
    `;
    specs.appendChild(row);
  });
  specs && specs.addEventListener('click', (e)=>{
    if (e.target.closest('.kv__del')) {
      e.preventDefault();
      const row = e.target.closest('.kv__row');
      if (row) row.remove();
      // name の連番を振り直す
      specs.querySelectorAll('.kv__row').forEach((row, idx)=>{
        const ins = row.querySelectorAll('input');
        if (ins[0]) ins[0].name = `specs[${idx}][label]`;
        if (ins[1]) ins[1].name = `specs[${idx}][value]`;
      });
    }
  });

  // ===== 画像アップロード（別ファイルに委譲） =====
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  const curList     = document.getElementById('currentImages');
  const imageJsonEl = document.getElementById('imageJson');
  const maxImages = parseInt(document.getElementById('uploader')?.dataset.max || '8', 10);

  // 既存の連番を振り直し（position / name を揃える）
  function renumberImages(){
    $$('.uploader__item', curList).forEach((li, i) => {
      const url = li.querySelector('input[name*="[url]"]');
      const alt = li.querySelector('input[name*="[alt]"]');
      const pos = li.querySelector('input[name*="[position]"]');
      if (url) url.name = `images[${i}][url]`;
      if (alt) alt.name = `images[${i}][alt]`;
      if (pos) { pos.name = `images[${i}][position]`; pos.value = i; }
    });
  }

  // 1件追加（id無し＝新規）
  function appendImageToCurrentList({ url }){
    if (curList.querySelector(`input[name*="[url]"][value="${CSS.escape(url)}"]`)) return;
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

  // hidden #imageJson にメタを push
  function appendToImageJson(meta){
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

  // 削除
  curList?.addEventListener('click', (e) => {
    const btn = e.target.closest('.img-del');
    if (!btn) return;

    // 先にURLを取得
    const li  = btn.closest('.uploader__item');
    const url = li?.querySelector('input[name*="[url]"]')?.value;

    // DOMから削除
    li?.remove();
    renumberImages();

    // imageJson からも削除
    if (url) {
      try {
        const arr = JSON.parse(imageJsonEl.value || '[]').filter(x => x.url !== url);
        imageJsonEl.value = JSON.stringify(arr);
      } catch {}
    }
  });

  // PointerEvents 版 D&D（縮約）
  if (curList) {
    let drag = null, rafId = 0, pending = null;
    const HYST = 6;

    curList.addEventListener('pointerdown', (e) => {
      const handle = e.target.closest('.handle'); if (!handle) return;
      const el = handle.closest('.uploader__item'); if (!el) return;
      e.preventDefault(); el.setPointerCapture?.(e.pointerId);

      const listRect = curList.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const ph = document.createElement('li');
      ph.className = 'uploader__item uploader__placeholder';
      ph.style.height = r.height + 'px'; ph.style.width = r.width + 'px';
      curList.insertBefore(ph, el);

      const baseX = r.left - listRect.left + curList.scrollLeft;
      const baseY = r.top  - listRect.top  + curList.scrollTop;
      Object.assign(el.style, {
        position:'absolute', top:0, left:0,
        width:r.width + 'px', height:r.height + 'px',
        transform:`translate(${baseX}px, ${baseY}px)`,
        zIndex:1000, pointerEvents:'none'
      });
      el.classList.add('dragging');
      curList.style.minHeight = curList.getBoundingClientRect().height + 'px';

      drag = { el, ph, baseX, baseY, startX:e.clientX, startY:e.clientY };
    });

    const move = e => { if (drag){ pending = e; if (!rafId) rafId = requestAnimationFrame(tick); } };
    const up   = () => {
      if (!drag) return;
      curList.insertBefore(drag.el, drag.ph); drag.ph.remove();
      drag.el.classList.remove('dragging');
      Object.assign(drag.el.style, { position:'', top:'', left:'', width:'', height:'', transform:'', zIndex:'', pointerEvents:'' });
      curList.style.minHeight = '';
      renumberImages();
      drag = null; pending = null; if (rafId) cancelAnimationFrame(rafId); rafId = 0;
    };

    function tick(){
      rafId = 0; if (!drag || !pending) return;
      const e = pending; pending = null;
      const dx = e.clientX - drag.startX, dy = e.clientY - drag.startY;
      drag.el.style.transform = `translate(${drag.baseX + dx}px, ${drag.baseY + dy}px)`;
      if (Math.abs(dx) < HYST && Math.abs(dy) < HYST) return;

      const idx = calcInsertIndex(e.clientX, e.clientY, drag.el, drag.ph);
      const list = itemsExcept([drag.el, drag.ph]);
      if (!list.length) curList.appendChild(drag.ph);
      else if (idx <= 0) curList.insertBefore(drag.ph, list[0]);
      else if (idx >= list.length) curList.appendChild(drag.ph);
      else curList.insertBefore(drag.ph, list[idx]);
    }
    function itemsExcept(ex){ const set = new Set(ex); return Array.from(curList.querySelectorAll('.uploader__item')).filter(x => !set.has(x)); }
    function calcInsertIndex(cx, cy, draggingEl, placeholder){
      const items = Array.from(curList.querySelectorAll('.uploader__item')).filter(x => x!==draggingEl && x!==placeholder);
      if (!items.length) return 0;
      let best = { i:-1, d:Infinity, r:null };
      items.forEach((el,i) => {
        const r = el.getBoundingClientRect(), cxEl=r.left+r.width/2, cyEl=r.top+r.height/2;
        const d = (cx-cxEl)*(cx-cxEl) + (cy-cyEl)*(cy-cyEl);
        if (d < best.d) best = { i, d, r };
      });
      const sameRow = cy > best.r.top && cy < best.r.bottom;
      const before  = sameRow ? (cx < best.r.left + best.r.width/2) : (cy < best.r.top + best.r.height/2);
      return best.i + (before ? 0 : 1);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  // R2アップローダを“再利用”
  if (window.initR2Uploader) {
    window.initR2Uploader({
      openBtnId:   'openPicker',
      fileInputId: 'images',        // ← ここを 'uploaderInput' から統一
      listId:      'previewList',
      textareaId:  'imageUrls',
      msgId:       'uploaderMsg',
      max:         maxImages,
      countFn:     () => curList.querySelectorAll('.uploader__item').length,
      onUploaded:  (meta) => {
        appendImageToCurrentList({ url: meta.url });
        appendToImageJson(meta);
        renumberImages();
      }
    });
  }

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
           style="position:fixed;inset:auto 0 0 0;max-width:980px;margin:5vh auto;background:#fff;border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,.18);overflow:hidden">
        <header style="display:flex;gap:.5rem;align-items:center;padding:.6rem .8rem;border-bottom:1px solid #e5e7eb">
          <strong style="flex:1">画像ライブラリ</strong>
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

  // 送信時：#currentImages ベースで必須判定（URLテキスト表示なし）
  form?.addEventListener('submit', (e) => {
    const count = curList.querySelectorAll('.uploader__item').length;
    if (count < 1){
      const p = document.querySelector('.error[data-for="images"]');
      if (p){ p.textContent = '商品画像を1枚以上追加してください。'; p.classList.add('is-visible'); }
      e.preventDefault();
    }
  });

  // 下書き保存（status を draft にして送信）
  function submitDraft(){
    const status = document.getElementById('status');
    if (status){ status.value = 'draft'; }
    if (form) {
      // 下書きは厳密な必須を緩めたい場合はここでバリデーション分岐も可
      form.requestSubmit();
    }
  }
  const saveDraft = document.getElementById('saveDraft');
  const sideSaveDraft = document.getElementById('sideSaveDraft');
  saveDraft && saveDraft.addEventListener('click', submitDraft);
  sideSaveDraft && sideSaveDraft.addEventListener('click', submitDraft);

  // 画像選択開くボタンのドラッグ演出
  const drop = document.getElementById('openPicker');
  const up  = document.getElementById('uploader');
  if (up && drop){
    ['dragenter','dragover'].forEach(ev=>{
      up.addEventListener(ev, ()=> drop.classList.add('is-drag'));
    });
    ['dragleave','drop'].forEach(ev=>{
      up.addEventListener(ev, ()=> drop.classList.remove('is-drag'));
    });
  }
})();
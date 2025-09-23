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
  const maxImages   = parseInt(document.getElementById('r2Uploader')?.dataset.max || '8', 10);

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

  // 削除
  curList?.addEventListener('click', (e) => {
    const btn = e.target.closest('.img-del');
    if (!btn) return;
    btn.closest('.uploader__item')?.remove();
    renumberImages();

    // imageJson からも同期的に削除（urlキーで粗く同期）
    try {
      const url = btn.closest('.uploader__item')?.querySelector('input[name*="[url]"]')?.value;
      if (!url) return;
      const arr = JSON.parse(imageJsonEl.value || '[]').filter(x => x.url !== url);
      imageJsonEl.value = JSON.stringify(arr);
    } catch {}
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
      fileInputId: 'uploaderInput',
      listId:      'previewList',   // hiddenでもOK（必須DOM）
      textareaId:  'imageUrls',     // hiddenでもOK（必須DOM）
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
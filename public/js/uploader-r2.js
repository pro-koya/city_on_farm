// public/js/uploader-r2.js
(function () {
  /**
   * R2 直アップローダ初期化
   * @param {Object} opt
   * @param {string} opt.openBtnId
   * @param {string} opt.fileInputId
   * @param {string} opt.listId
   * @param {string} opt.textareaId
   * @param {string} opt.msgId
   * @param {number} opt.max
   * @param {function():number} [opt.countFn]  // ★追加：現在の枚数を返す関数（省略時は textarea 行数）
   * @param {function(meta:Object):void} [opt.onUploaded] // ★追加：アップロード完了1件ごとに呼ばれる
   * @param {string} [opt.libraryBtnId]     // 既存画像を開くボタン（任意）
   * @param {string} [opt.libraryTitle]     // モーダルの見出し
   * @param {string} [opt.libraryEndpoint]  // 既存画像一覧API（GET） /uploads/library?q=&page=
   * @param {function(meta:Object):void} [opt.onSelectExisting] // 既存選択時に呼ばれる（省略時は onUploaded と同じ扱い）
   */
  function initR2Uploader(opt) {
    const openBtn = document.getElementById(opt.openBtnId);
    const input   = document.getElementById(opt.fileInputId);
    const list    = document.getElementById(opt.listId);
    const ta      = document.getElementById(opt.textareaId);
    const msg     = document.getElementById(opt.msgId);
    const max     = Number(opt.max || 8);

    const libBtn  = opt.libraryBtnId ? document.getElementById(opt.libraryBtnId) : null;
    const libTitle = opt.libraryTitle || '画像ライブラリ';
    const libEndpoint = opt.libraryEndpoint || '/uploads/library';

    if (!openBtn || !input || !list || !ta || !msg) {
      console.warn('[uploader-r2] 必須DOMのいずれかが見つかりません。', opt);
      return;
    }

    const ALLOWED = new Set(['image/jpeg','image/png','image/webp','image/avif','image/gif']);
    const CSRF = document.querySelector('input[name="_csrf"]')?.value || '';

    function setMsg(text) { msg.textContent = text || ''; }
    function appendUrl(url) {
      ta.value = (ta.value ? (ta.value.replace(/\s+$/,'') + '\n') : '') + url;
    }
    function addPreview(url) {
      const li = document.createElement('li');
      li.className = 'uploader__item';
      li.innerHTML = `<img src="${url}" alt="">`;
      list.appendChild(li);
    }
    function currentCountByTextarea() {
      const trimmed = ta.value.trim();
      if (!trimmed) return 0;
      return trimmed.split('\n').filter(Boolean).length;
    }
    // ★ ここだけ差し替え可能に
    function currentCount() {
      try { if (typeof opt.countFn === 'function') return Number(opt.countFn()) || 0; } catch {}
      return currentCountByTextarea();
    }

    // ====== ハッシュ関連（重複アップロード防止） ======
    const toHex = (buf) => Array.prototype.map.call(new Uint8Array(buf), x => x.toString(16).padStart(2,'0')).join('');
    async function hashFileSHA256(file){
      if (!window.crypto?.subtle) return null;
      try {
        const buf = await file.arrayBuffer();
        const dig = await crypto.subtle.digest('SHA-256', buf);
        return toHex(dig);
      } catch { return null; }
    }

    async function signOne(file) {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      const sha256 = await hashFileSHA256(file); // 取得できなければ null
      const res = await fetch('/uploads/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CSRF-Token': CSRF },
        body: JSON.stringify({ mime: file.type, ext, name: file.name, sha256 })
      });
      if (!res.ok) throw new Error('sign failed');
      const data = await res.json();
      // 期待するレスポンス:
      //  A) { ok:true, exists:true, image:{ url, r2_key, bytes, mime, width, height } }
      //  B) { ok:true, key, putUrl }  …通常の署名アップロード
      if (!data?.ok) throw new Error('sign bad payload');
      return data;
    }

    function normalizeMeta(image, fallback={}) {
      return {
        url: image?.url,
        r2_key: image?.r2_key || fallback.key || null,
        bytes:  image?.bytes ?? fallback.bytes ?? null,
        mime:   image?.mime  ?? fallback.mime  ?? null,
        width:  image?.width ?? null,
        height: image?.height ?? null
      };
    }

    async function confirmOne(key, file) {
      // key が null の場合は既存流用なのでそのままメタ生成
      if (!key) {
        return normalizeMeta(file?.__existingImage || null, { bytes:file?.size, mime:file?.type });
      }
      const res = await fetch('/uploads/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CSRF-Token': CSRF },
        body: JSON.stringify({ key, bytes: file?.size, mime: file?.type })
      });
      if (!res.ok) throw new Error('confirm failed');
      const data = await res.json();
      const image = data?.image || (data?.url ? { url: data.url, r2_key: key } : null);
      if (!data?.ok || !image?.url) throw new Error('confirm bad payload');
      return normalizeMeta(image, { bytes:file?.size, mime:file?.type });
    }

    async function uploadFiles(files) {
      const filesArr = Array.from(files || []);
      if (!filesArr.length) return;

      const room = max - currentCount();
      if (room <= 0) { setMsg(`最大 ${max} 枚までです。`); return; }

      const take = filesArr.slice(0, room);
      const skip = filesArr.length - take.length;
      setMsg(skip > 0 ? `最大 ${max} 枚までです。（${skip} 枚をスキップしました）` : 'アップロード中…');

      try {
        for (const file of take) {
          if (!ALLOWED.has(file.type)) {
            setMsg('対応していない画像形式です。JPEG/PNG/WebP/AVIF/GIF をご利用ください。');
            continue;
          }
          const signed = await signOne(file);

          let meta;
          if (signed.exists && signed.image?.url) {
            // 重複あり：PUTせず既存画像を流用
            file.__existingImage = signed.image; // confirmOne に渡すために一時保持
            meta = await confirmOne(null, file);
          } else {
            const { key, putUrl } = signed;
            if (!key || !putUrl) throw new Error('sign payload missing key/putUrl');
            const putRes = await fetch(putUrl, { method: 'PUT', body: file });
            if (!putRes.ok) throw new Error('PUT failed');
            meta = await confirmOne(key, file);
          }

          // ★ onUploaded があれば委譲、なければ従来どおりにテキストエリア＆プレビューへ
          if (typeof opt.onUploaded === 'function') {
            try { opt.onUploaded(meta); } catch {}
          } else {
            appendUrl(meta.url);
            addPreview(meta.url);
          }
        }
        setMsg('アップロードが完了しました。');
      } catch (e) {
        console.error('[uploader-r2] upload error:', e);
        setMsg('アップロードに失敗しました。時間をおいて再度お試しください。');
      } finally {
        input.value = '';
      }
    }

    openBtn.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      if (input.files && input.files.length) uploadFiles(input.files);
    });

    // ====== 画像ライブラリ（既存） ======
    if (libBtn) {
      libBtn.addEventListener('click', openLibrary);
    }

    async function openLibrary(){
      try {
        const modal = buildLibraryModal();
        document.body.appendChild(modal.wrap);
        await loadLibraryPage(modal, 1, '');
      } catch (e) {
        console.error('[uploader-r2] library open failed:', e);
        alert('画像ライブラリの読み込みに失敗しました。');
      }
    }

    function buildLibraryModal(){
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
          .uploader-lib__item{border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;cursor:pointer;background:#fff}
          .uploader-lib__item img{display:block;width:100%;height:100px;object-fit:cover}
          .uploader-lib__foot{display:flex;justify-content:space-between;align-items:center;padding:.6rem 1rem;border-top:1px solid #e5e7eb}
          .uploader-lib__search{display:flex;gap:.4rem}
          .uploader-lib__search input{border:1px solid #e5e7eb;border-radius:999px;padding:.4rem .75rem;min-width:220px}
          .uploader-lib__btn{background:#4C6B5C;color:#fff;border:1px solid #4C6B5C;border-radius:999px;padding:.4rem .9rem;cursor:pointer}
          .uploader-lib__close{background:#fff;color:#4C6B5C;border:1px solid #e5e7eb;border-radius:999px;padding:.35rem .8rem;cursor:pointer}
          .uploader-lib__empty{color:#6b7280;padding:.6rem 0}
        </style>
        <div class="uploader-lib" role="dialog" aria-modal="true" aria-label="${libTitle}">
          <div class="uploader-lib__head">
            <h3 class="uploader-lib__title">${libTitle}</h3>
            <button type="button" class="uploader-lib__close">閉じる</button>
          </div>
          <div class="uploader-lib__body">
            <div class="uploader-lib__grid" id="uploaderLibGrid"><div class="uploader-lib__empty">読み込み中…</div></div>
          </div>
          <div class="uploader-lib__foot">
            <div class="uploader-lib__search">
              <input type="search" id="uploaderLibQ" placeholder="検索（ファイル名など）">
              <button class="uploader-lib__btn" id="uploaderLibSearch">検索</button>
            </div>
            <div>
              <button class="uploader-lib__close">閉じる</button>
            </div>
          </div>
        </div>
      `;
      const close = () => wrap.remove();
      wrap.querySelectorAll('.uploader-lib__close').forEach(b => b.addEventListener('click', close));
      wrap.addEventListener('click', (e)=>{ if (e.target === wrap) close(); });
      wrap.q     = wrap.querySelector('#uploaderLibQ');
      wrap.btn   = wrap.querySelector('#uploaderLibSearch');
      wrap.grid  = wrap.querySelector('#uploaderLibGrid');
      wrap.btn.addEventListener('click', ()=> loadLibraryPage({wrap,grid:wrap.grid,q:wrap.q}, 1, wrap.q.value.trim()));
      return { wrap, grid: wrap.grid, q: wrap.q };
    }

    async function loadLibraryPage(modal, page=1, q=''){
      const url = new URL(libEndpoint, location.origin);
      if (q) url.searchParams.set('q', q);
      url.searchParams.set('page', page);
      const res = await fetch(url.toString(), { headers: { 'Accept':'application/json' } });
      if (!res.ok) throw new Error('library fetch failed');
      const data = await res.json(); // { items:[{url,r2_key,bytes,mime,width,height}], nextPage?:number }
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
          // onSelectExisting があればそれを、なければ onUploaded と同様に処理
          const handler = (typeof opt.onSelectExisting === 'function') ? opt.onSelectExisting : opt.onUploaded;
          if (typeof handler === 'function') {
            handler({
              url: img.url,
              r2_key: img.r2_key || null,
              bytes: img.bytes ?? null,
              mime: img.mime ?? null,
              width: img.width ?? null,
              height: img.height ?? null
            });
          } else {
            appendUrl(img.url);
            addPreview(img.url);
          }
          modal.wrap.remove();
        });
        modal.grid.appendChild(card);
      });

      // 追加のページネーションがある場合はフッターに実装しても良い
    }

    // D&D
    const dropZone = input.closest('#uploader') || input.parentElement;
    if (dropZone) {
      const stop = e => { e.preventDefault(); e.stopPropagation(); };
      ['dragenter','dragover','dragleave','drop'].forEach(ev => dropZone.addEventListener(ev, stop));
      dropZone.addEventListener('drop', e => {
        const dtFiles = e.dataTransfer?.files;
        if (dtFiles && dtFiles.length) uploadFiles(dtFiles);
      });
    }
  }

  window.initR2Uploader = initR2Uploader;
})();
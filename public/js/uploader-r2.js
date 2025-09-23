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
   */
  function initR2Uploader(opt) {
    const openBtn = document.getElementById(opt.openBtnId);
    const input   = document.getElementById(opt.fileInputId);
    const list    = document.getElementById(opt.listId);
    const ta      = document.getElementById(opt.textareaId);
    const msg     = document.getElementById(opt.msgId);
    const max     = Number(opt.max || 8);

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

    async function signOne(file) {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      const res = await fetch('/uploads/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CSRF-Token': CSRF },
        body: JSON.stringify({ mime: file.type, ext })
      });
      if (!res.ok) throw new Error('sign failed');
      const data = await res.json(); // { ok, key, putUrl }
      if (!data || !data.key || !data.putUrl) throw new Error('sign bad payload');
      return data;
    }

    async function confirmOne(key, file) {
      const res = await fetch('/uploads/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CSRF-Token': CSRF },
        body: JSON.stringify({ key, bytes: file?.size, mime: file?.type })
      });
      if (!res.ok) throw new Error('confirm failed');
      const data = await res.json(); // { ok, url } | { ok, image:{url,r2_key,bytes,mime,width,height} }
      const url = data?.image?.url || data?.url;
      if (!data?.ok || !url) throw new Error('confirm bad payload');

      // ★ 呼び出し側で使いやすいメタを返す
      return {
        url,
        r2_key: data?.image?.r2_key || key,
        bytes:  data?.image?.bytes ?? file?.size ?? null,
        mime:   data?.image?.mime  ?? file?.type ?? null,
        width:  data?.image?.width ?? null,
        height: data?.image?.height ?? null,
      };
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
          const { key, putUrl } = await signOne(file);
          const putRes = await fetch(putUrl, { method: 'PUT', body: file });
          if (!putRes.ok) throw new Error('PUT failed');

          const meta = await confirmOne(key, file); // ★ {url,r2_key,bytes,mime,width,height}

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
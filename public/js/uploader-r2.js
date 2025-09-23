// public/js/uploader-r2.js
(function () {
  /**
   * R2 直アップローダ初期化
   * @param {Object} opt
   * @param {string} opt.openBtnId - 画像選択ボタンのID
   * @param {string} opt.fileInputId - <input type="file"> のID
   * @param {string} opt.listId - プレビューULのID
   * @param {string} opt.textareaId - URLを書き込む<textarea>のID（1行1URL）
   * @param {string} opt.msgId - メッセージ表示要素のID
   * @param {number} opt.max - 最大枚数
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

    // 許可MIME
    const ALLOWED = new Set([
      'image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'
    ]);

    // CSRF
    const CSRF = document.querySelector('input[name="_csrf"]')?.value || '';

    // ユーティリティ
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
    function currentCount() {
      const trimmed = ta.value.trim();
      if (!trimmed) return 0;
      return trimmed.split('\n').filter(Boolean).length;
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
      // 可能なら bytes/mime も送る（サーバ側が無視してもOK）
      const res = await fetch('/uploads/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CSRF-Token': CSRF },
        body: JSON.stringify({
          key,
          bytes: file?.size || undefined,
          mime: file?.type || undefined
        })
      });
      if (!res.ok) throw new Error('confirm failed');
      const data = await res.json(); // { ok, url } or { ok, image:{url,...} }
      const url = data?.image?.url || data?.url;
      if (!data?.ok || !url) throw new Error('confirm bad payload');
      return url;
    }

    async function uploadFiles(files) {
      const filesArr = Array.from(files || []);
      if (!filesArr.length) return;

      // 枚数制限
      const room = max - currentCount();
      if (room <= 0) {
        setMsg(`最大 ${max} 枚までです。`);
        return;
      }
      const take = filesArr.slice(0, room);
      const skip = filesArr.length - take.length;
      if (skip > 0) {
        setMsg(`最大 ${max} 枚までです。（${skip} 枚をスキップしました）`);
      } else {
        setMsg('アップロード中…');
      }

      try {
        for (const file of take) {
          if (!ALLOWED.has(file.type)) {
            setMsg('対応していない画像形式です。JPEG/PNG/WebP/AVIF/GIF をご利用ください。');
            continue;
          }

          // 1) 署名URL
          const { key, putUrl } = await signOne(file);

          // 2) R2 に直接PUT
          const putRes = await fetch(putUrl, { method: 'PUT', body: file });
          if (!putRes.ok) throw new Error('PUT failed');

          // 3) confirm → DB保存 → URL取得
          const url = await confirmOne(key, file);

          // 4) UI反映
          appendUrl(url);
          addPreview(url);
        }
        setMsg('アップロードが完了しました。');
      } catch (e) {
        console.error('[uploader-r2] upload error:', e);
        setMsg('アップロードに失敗しました。時間をおいて再度お試しください。');
      } finally {
        input.value = '';
      }
    }

    // イベント
    openBtn.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      if (input.files && input.files.length) uploadFiles(input.files);
    });

    // 任意：ドラッグ&ドロップ（input要素に drop を委譲）
    const dropZone = input.closest('#uploader') || input.parentElement;
    if (dropZone) {
      const stop = e => { e.preventDefault(); e.stopPropagation(); };
      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => {
        dropZone.addEventListener(ev, stop);
      });
      dropZone.addEventListener('drop', e => {
        const dtFiles = e.dataTransfer?.files;
        if (dtFiles && dtFiles.length) uploadFiles(dtFiles);
      });
    }
  }

  // グローバル公開
  window.initR2Uploader = initR2Uploader;
})();
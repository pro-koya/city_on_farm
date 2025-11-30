// /public/js/admin-campaign-edit.js
(() => {
  'use strict';

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const form = document.getElementById('campaignForm');
  if (!form) return;

  const bodyHtmlInput = document.getElementById('body_html');
  const bodyRawInput  = document.getElementById('body_raw');
  const btnSave       = document.getElementById('btnSaveCampaign');

  // =========================
  // Quill ImageResize モジュール登録
  // =========================
  (function registerImageResize() {
    const IR =
      window.ImageResize &&
      (window.ImageResize.default || window.ImageResize);

    if (window.Quill && IR) {
      try {
        window.Quill.register('modules/imageResize', IR);
      } catch (err) {
        console.warn('ImageResize module registration failed', err);
      }
    }
  })();

  // =========================
  // 1) スラッグ生成
  // =========================
//   const titleEl = document.getElementById('title');
//   const slugEl  = document.getElementById('slug');
//   const btnSlug = document.getElementById('btnSlugFromTitle');

//   function toSlug(str) {
//     str = (str || '').trim().toLowerCase();
//     str = str.replace(/[Ａ-Ｚａ-ｚ０-９]/g, s =>
//       String.fromCharCode(s.charCodeAt(0) - 0xFEE0)
//     );
//     str = str.replace(/[^a-z0-9]+/g, '-');
//     str = str.replace(/^-+|-+$/g, '');
//     return str;
//   }

//   btnSlug?.addEventListener('click', () => {
//     console.log('slug start');
//     if (!titleEl) return;
//     console.log(titleEl.value);
//     const s = toSlug(titleEl.value);
//     console.log(s);
//     if (!s) return;
//     slugEl.value = s;
//   });

  // =========================
  // 2) Quill 初期化
  // =========================
  let quill = null;
  let editorEl = null;
  let editorRoot = null;

  function initQuill() {
    editorEl  = document.getElementById('campaignEditor');
    const toolbarEl = document.getElementById('campaignToolbar');
    if (!editorEl || !toolbarEl) return;
    if (typeof Quill === 'undefined') {
        console.error('Quill が読み込まれていません');
        return;
    }

    const initialHtml  = bodyHtmlInput?.value || '';
    const initialDeltaRaw = bodyRawInput?.value || '';

    quill = new Quill(editorEl, {
        theme: 'snow',
        modules: {
        toolbar: toolbarEl,
        imageResize: {}
        }
    });

    // Quill のルート要素をグローバルに保持（テーブル削除ハンドラ用）
    editorRoot = editorEl.querySelector('.ql-editor');

    // --- Delta 優先で復元（string / object 両対応）---
    let delta = null;
    if (initialDeltaRaw && initialDeltaRaw.trim()) {
        try {
        delta = JSON.parse(initialDeltaRaw.trim());

        // もし 1 回 parse しても string だったら、もう 1 回試す（2重 JSON 対策）
        if (typeof delta === 'string') {
            try {
            delta = JSON.parse(delta);
            } catch (e2) {
            console.warn('body_raw nested JSON parse failed', e2);
            delta = null;
            }
        }
        } catch (e) {
        console.warn('body_raw JSON parse failed', e);
        delta = null;
        }
    }

    try {
        if (delta && typeof delta === 'object' && Array.isArray(delta.ops)) {
        // 正常な Delta の場合のみ setContents
        quill.setContents(delta);
        } else if (initialHtml) {
        // Delta が使えなければ HTML から復元（既存の body_html）
        quill.clipboard.dangerouslyPasteHTML(initialHtml);
        }
    } catch (e) {
        console.error('Quill setContents/dangerouslyPasteHTML でエラー:', e);
        // どうしてもダメなら空にしてしまう
        quill.setText('');
    }

    // 画像ボタン → R2 + ライブラリ
    const toolbar = quill.getModule('toolbar');
    if (toolbar) {
        toolbar.addHandler('image', () => openQuillImagePickerModal());
    }

    attachTableDeleteKeyHandler();

    // 送信時に hidden に詰める
    form.addEventListener('submit', (e) => {
        const html  = editorEl.querySelector('.ql-editor').innerHTML.trim();
        const delta2 = quill.getContents();

        if (!html || html === '<p><br></p>') {
        e.preventDefault();
        showFieldError('body_html', '本文を入力してください。');
        const errEl = form.querySelector('.error.is-visible[data-for="body_html"]');
        if (errEl) {
            errEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
        }

        if (bodyHtmlInput) bodyHtmlInput.value = html;
        if (bodyRawInput)  bodyRawInput.value  = JSON.stringify(delta2);

        if (btnSave) {
        btnSave.disabled = true;
        btnSave.textContent = '保存中…';
        }
    });
    }

  function showFieldError(field, msg) {
    const p = form.querySelector(`.error[data-for="${field}"]`);
    if (!p) return;
    p.textContent = msg || '';
    if (msg) p.classList.add('is-visible');
    else p.classList.remove('is-visible');
  }

  function getCurrentIndex() {
    if (!quill) return 0;
    const range = quill.getSelection(true);
    return range ? range.index : quill.getLength();
  }

  function insertImageAtCursor(url) {
    if (!quill || !url) return;
    const range = quill.getSelection(true) || { index: quill.getLength(), length: 0 };
    quill.insertEmbed(range.index, 'image', url, 'user');
    quill.setSelection(range.index + 1, 0, 'user');
  }

  // =========================
  // 3) Quill用 画像ピッカーモーダル (R2 + /uploads/library)
  // =========================
  function openQuillImagePickerModal() {
    const existing = document.getElementById('qImgPickerModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'qImgPickerModal';
    modal.innerHTML = `
      <div data-role="backdrop"
           style="position:fixed;inset:0;background:rgba(0,0,0,.4);backdrop-filter:blur(2px);z-index:80;"></div>
      <div class="qimg-panel"
           style="position:fixed;z-index:81;top:11vh;left:0;right:0;margin:0 auto;max-width:840px;background:#fff;border-radius:16px;box-shadow:0 18px 40px rgba(0,0,0,.25);overflow:hidden;">
        <header style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:.7rem 1rem;border-bottom:1px solid #e5e7eb;">
          <div>
            <h2 style="margin:0;font-size:1rem;">本文に挿入する画像の選択</h2>
            <p style="margin:.1rem 0 0;font-size:.85rem;color:#6b7280;">
              画像をライブラリに追加してから、下のライブラリ一覧から挿入できます。
            </p>
          </div>
          <button type="button" data-role="close"
                  style="border:1px solid #e5e7eb;background:#fff;border-radius:999px;padding:.2rem .55rem;cursor:pointer;">✕</button>
        </header>

        <div style="padding:.8rem 1rem 1rem;">
          <div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-bottom:.7rem;">
            <button type="button" id="qImgUploadBtn"
                    style="border:1px solid #4C6B5C;background:#4C6B5C;color:#fff;border-radius:999px;padding:.45rem .9rem;font-size:.9rem;cursor:pointer;">
              ライブラリへ画像を追加
            </button>
            <button type="button" id="qImgLibraryBtn"
                    style="border:1px solid #e5e7eb;background:#fff;color:#374151;border-radius:999px;padding:.45rem .9rem;font-size:.9rem;cursor:pointer;">
              ライブラリから選ぶ
            </button>
          </div>

          <div id="qImgInfoMsg"
               style="font-size:.85rem;color:#6b7280;margin-bottom:.4rem;"></div>

          <div id="qImgLibraryPane"
               style="border-top:1px solid #e5e7eb;margin-top:.5rem;padding-top:.7rem;display:none;">
            <div id="qImgLibBody" style="max-height:55vh;overflow:auto;"></div>
            <div style="display:flex;justify-content:flex-end;margin-top:.5rem;">
              <button type="button" id="qImgLibUse"
                      style="border:1px solid #4C6B5C;background:#4C6B5C;color:#fff;border-radius:999px;padding:.45rem 1rem;font-size:.9rem;cursor:pointer;"
                      disabled>
                選択した画像を挿入
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const backdrop    = $('[data-role="backdrop"]', modal);
    const closeBtn    = $('[data-role="close"]', modal);
    const uploadBtn   = $('#qImgUploadBtn', modal);
    const libraryBtn  = $('#qImgLibraryBtn', modal);
    const libraryPane = $('#qImgLibraryPane', modal);
    const libBody     = $('#qImgLibBody', modal);
    const libUseBtn   = $('#qImgLibUse', modal);
    const infoMsg     = $('#qImgInfoMsg', modal);

    // seller プロファイルで使っている hidden DOM を流用
    const editorFileInput = $('#editorImgFile');
    const editorList      = $('#editorImgList');
    const editorTextarea  = $('#editorImgUrls');
    const editorMsg       = $('#editorImgMsg');

    let selectedUrl = null;

    function close() {
      modal.remove();
    }
    backdrop.addEventListener('click', close);
    closeBtn.addEventListener('click', close);

    async function loadQuillLibrary(highlightUrl) {
      if (!libraryPane) return;
      libraryPane.style.display = 'block';
      libBody.innerHTML =
        '<p style="padding:.4rem 0;color:#6b7280;">読み込み中…</p>';
      libUseBtn.disabled = true;
      selectedUrl = null;

      try {
        const u = new URL('/uploads/library', window.location.origin);
        u.searchParams.set('all', '1');
        u.searchParams.set('pageSize', '40');
        const resp = await fetch(u.toString(), {
          headers: { Accept: 'application/json' }
        });
        if (!resp.ok) throw new Error('library fetch failed');
        const data = await resp.json();
        const items = Array.isArray(data.items) ? data.items : [];

        if (!items.length) {
          libBody.innerHTML =
            '<p style="padding:.4rem 0;color:#6b7280;">画像がありません。</p>';
          return;
        }

        const cards = items.map(
          (it) => `
          <li class="qimg-card"
              data-url="${it.url}"
              style="list-style:none;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;cursor:pointer;position:relative;">
            <img src="${it.url}" alt="" loading="lazy"
                 style="display:block;width:100%;height:140px;object-fit:cover;background:#f3f4f6;">
            <span class="qimg-check"
                  aria-hidden="true"
                  style="position:absolute;right:6px;top:6px;background:rgba(0,0,0,.55);color:#fff;border-radius:999px;padding:.1rem .35rem;display:none;">
              ✓
            </span>
          </li>
        `
        ).join('');

        libBody.innerHTML = `
          <ul class="qimg-grid"
              style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:.6rem;padding:.2rem 0;margin:0;">
            ${cards}
          </ul>
        `;

        libBody.onclick = (ev) => {
          const card = ev.target.closest('.qimg-card');
          if (!card) return;
          const url = card.getAttribute('data-url');
          if (!url) return;

          if (selectedUrl === url) {
            selectedUrl = null;
          } else {
            selectedUrl = url;
          }

          $$('.qimg-card', libBody).forEach((li) => {
            const u = li.getAttribute('data-url');
            const mark = $('.qimg-check', li);
            if (!mark) return;
            if (u === selectedUrl) {
              li.style.outline = '2px solid #4C6B5C';
              mark.style.display = 'inline-block';
            } else {
              li.style.outline = '';
              mark.style.display = 'none';
            }
          });

          libUseBtn.disabled = !selectedUrl;
        };

        if (highlightUrl) {
          const esc = CSS && CSS.escape ? CSS.escape(highlightUrl) : highlightUrl.replace(/"/g, '\\"');
          const card = libBody.querySelector(`.qimg-card[data-url="${esc}"]`);
          if (card) {
            selectedUrl = highlightUrl;
            const mark = $('.qimg-check', card);
            card.style.outline = '2px solid #4C6B5C';
            if (mark) mark.style.display = 'inline-block';
            libUseBtn.disabled = false;
          }
        }
      } catch (e) {
        console.error(e);
        libBody.innerHTML =
          '<p style="padding:.4rem 0;color:#b91c1c;">画像の読み込みに失敗しました。</p>';
      }
    }

    libraryBtn?.addEventListener('click', () => {
      loadQuillLibrary();
    });

    libUseBtn?.addEventListener('click', () => {
      if (!selectedUrl) return;
      insertImageAtCursor(selectedUrl);
      close();
    });

    // R2 アップロード（uploader-r2.js 利用）
    if (
      typeof window.initR2Uploader === 'function' &&
      uploadBtn && editorFileInput && editorList && editorTextarea
    ) {
      window.initR2Uploader({
        openBtnId: uploadBtn.id,
        fileInputId: editorFileInput.id,
        listId: editorList.id,
        textareaId: editorTextarea.id,
        msgId: editorMsg ? editorMsg.id : null,
        max: 20,
        countFn: () => 0,
        onUploaded: (meta) => {
          if (!meta || !meta.url) return;
          if (infoMsg) {
            infoMsg.textContent = '画像をライブラリに追加しました。下のライブラリ一覧から挿入できます。';
          }
          loadQuillLibrary(meta.url);
        }
      });
    } else if (uploadBtn && editorFileInput) {
      // フォールバック（R2なし → data URL で直接挿入）
      uploadBtn.addEventListener('click', () => editorFileInput.click());
      editorFileInput.addEventListener('change', () => {
        const file = editorFileInput.files && editorFileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          insertImageAtCursor(reader.result);
          close();
        };
        reader.readAsDataURL(file);
      });
    }
  }

  // =========================
  // 4) ヒーロー画像（R2 + ライブラリ）
  // =========================
  function updateHeroPreview(url) {
    const img = document.getElementById('heroPreviewImg');
    const placeholder = document.getElementById('heroPreviewPlaceholder');
    const clean = (url || '').trim();

    if (clean) {
      if (img) {
        img.src = clean;
      } else if (placeholder) {
        const parent = placeholder.parentNode;
        const newImg = document.createElement('img');
        newImg.id = 'heroPreviewImg';
        newImg.alt = 'メイン画像プレビュー';
        newImg.src = clean;
        parent.innerHTML = '';
        parent.appendChild(newImg);
      }
    } else {
      if (img) {
        const parent = img.parentNode;
        const span = document.createElement('span');
        span.id = 'heroPreviewPlaceholder';
        span.className = 'hero-preview__placeholder';
        span.textContent = '画像を選ぶとここにプレビューが表示されます';
        parent.innerHTML = '';
        parent.appendChild(span);
      }
    }
  }

  function initHeroPreview() {
    const input = document.getElementById('hero_image_url');
    if (!input) return;
    input.addEventListener('input', () => updateHeroPreview(input.value));
    if (input.value) updateHeroPreview(input.value);
  }

  function initHeroUploadAndClear() {
    const inputUrl  = document.getElementById('hero_image_url');
    const uploadBtn = document.getElementById('heroUploadBtn');
    const fileInput = document.getElementById('heroImageFile');
    const msg       = document.getElementById('heroUploadMsg');
    const clearBtn  = document.getElementById('heroClearBtn');
    const dummyList = document.getElementById('heroPreviewList');
    const dummyTA   = document.getElementById('heroImageUrlsTmp');

    if (!inputUrl) return;

    // クリア
    if (clearBtn) {
      clearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        inputUrl.value = '';
        updateHeroPreview('');
        if (msg) msg.textContent = '画像をクリアしました。';
      });
    }

    if (
      typeof window.initR2Uploader === 'function' &&
      uploadBtn && fileInput && dummyList && dummyTA
    ) {
      function setUrlAndPreview(url) {
        inputUrl.value = url;
        const evt = new Event('input', { bubbles: true });
        inputUrl.dispatchEvent(evt);
      }

      window.initR2Uploader({
        openBtnId: uploadBtn.id,
        fileInputId: fileInput.id,
        listId: dummyList.id,
        textareaId: dummyTA.id,
        msgId: msg ? msg.id : null,
        max: 1,
        countFn: () => (inputUrl.value ? 1 : 0),
        onUploaded: (meta) => {
          if (!meta || !meta.url) return;
          setUrlAndPreview(meta.url);
          if (msg) msg.textContent = '画像をアップロードしました。';
        }
      });
    } else if (uploadBtn && fileInput) {
      // フォールバック：data URL
      uploadBtn.addEventListener('click', (e) => {
        e.preventDefault();
        fileInput.click();
      });
      fileInput.addEventListener('change', () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          inputUrl.value = reader.result;
          updateHeroPreview(reader.result);
          if (msg) msg.textContent = '画像を読み込みました（data URL）。';
        };
        reader.readAsDataURL(file);
      });
    }
  }

  function initHeroLibrary() {
    const trigger  = document.getElementById('heroOpenLibrary');
    const inputUrl = document.getElementById('hero_image_url');
    const msg      = document.getElementById('heroUploadMsg');
    if (!trigger || !inputUrl) return;

    trigger.addEventListener('click', async (e) => {
      e.preventDefault();

      let wrap = document.getElementById('heroImgLibModal');
      if (wrap) wrap.remove();

      wrap = document.createElement('div');
      wrap.id = 'heroImgLibModal';
      wrap.innerHTML = `
        <div class="lib__backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,.35);backdrop-filter: blur(2px);"></div>
        <div class="lib__panel" role="dialog" aria-modal="true"
             style="position:fixed;top:100px;left:0;right:0;margin:0 auto;max-width:820px;background:#fff;border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,.18);overflow:hidden">
          <header style="display:flex;gap:.5rem;align-items:center;padding:.6rem .8rem;border-bottom:1px solid #e5e7eb">
            <h2 style="margin:0;font-size:.95rem;">メイン画像を選択</h2>
            <button type="button" id="heroImgLibClose" aria-label="閉じる" style="margin-left:auto;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:.35rem .6rem">✕</button>
          </header>
          <div id="heroImgLibBody" style="max-height:60vh;overflow:auto;padding:.6rem"></div>
          <footer style="display:flex;justify-content:flex-end;align-items:center;padding:.6rem .8rem;border-top:1px solid #e5e7eb;">
            <button type="button" id="heroImgLibUse" class="btn" style="padding:.5rem 1rem;border-radius:999px;border:1px solid #4C6B5C;background:#4C6B5C;color:#fff" disabled>この画像を使う</button>
          </footer>
        </div>
      `;
      document.body.appendChild(wrap);

      const body  = document.getElementById('heroImgLibBody');
      const useBtn= document.getElementById('heroImgLibUse');

      let selectedUrl = null;

      async function fetchLibrary() {
        body.innerHTML =
          '<p class="muted" style="padding:.6rem;color:#6b7280">読み込み中...</p>';
        try {
          const u = new URL('/uploads/library', window.location.origin);
          u.searchParams.set('pageSize', '40');
          u.searchParams.set('all', '1');
          const resp = await fetch(u, { headers: { Accept: 'application/json' } });
          if (!resp.ok) throw new Error('library fetch failed');
          const data = await resp.json();
          const items = Array.isArray(data.items) ? data.items : [];
          if (!items.length) {
            body.innerHTML =
              '<p class="muted" style="padding:.6rem;color:#6b7280">画像がありません。</p>';
            return;
          }
          const cards = items.map(
            (it) => `
              <li class="lib__card"
                  data-url="${it.url}"
                  style="list-style:none;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;cursor:pointer;position:relative">
                <img src="${it.url}" alt="" loading="lazy" style="display:block;width:100%;height:150px;object-fit:cover;background:#f3f4f6">
                <span class="lib__check" aria-hidden="true"
                      style="position:absolute;right:6px;top:6px;background:rgba(0,0,0,.55);color:#fff;border-radius:999px;padding:.1rem .35rem;display:none">✓</span>
              </li>
            `
          ).join('');
          body.innerHTML = `
            <ul class="lib__grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:.6rem;padding:.2rem">
              ${cards}
            </ul>
          `;

          body.addEventListener('click', (ev) => {
            const card = ev.target.closest('.lib__card');
            if (!card) return;
            const url = card.getAttribute('data-url');
            if (!url) return;

            if (selectedUrl === url) {
              selectedUrl = null;
            } else {
              selectedUrl = url;
            }

            $$('.lib__card', body).forEach((li) => {
              const u = li.getAttribute('data-url');
              const mark = $('.lib__check', li);
              if (!mark) return;
              if (u === selectedUrl) {
                li.style.outline = '2px solid #4C6B5C';
                mark.style.display = 'inline-block';
              } else {
                li.style.outline = '';
                mark.style.display = 'none';
              }
            });

            useBtn.disabled = !selectedUrl;
          });
        } catch (err) {
          console.error(err);
          body.innerHTML =
            '<p class="muted" style="padding:.6rem;color:#b91c1c">読み込みに失敗しました。</p>';
        }
      }

      await fetchLibrary();

      const close = () => wrap.remove();
      document.getElementById('heroImgLibClose').onclick = close;
      document.querySelector('.lib__backdrop').onclick = close;

      useBtn.onclick = () => {
        if (!selectedUrl) return;
        inputUrl.value = selectedUrl;
        const evt = new Event('input', { bubbles: true });
        inputUrl.dispatchEvent(evt);
        if (msg) msg.textContent = 'メイン画像を設定しました。';
        close();
      };
    });
  }

    // ===== Backspace / Delete でテーブルを消しやすくする =====
  function attachTableDeleteKeyHandler() {
    if (!editorRoot) return;

    editorRoot.addEventListener('keydown', (e) => {
      if (e.key !== 'Backspace' && e.key !== 'Delete') return;

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;

      const range = sel.getRangeAt(0);
      if (!range.collapsed) return; // 範囲選択中はそのままブラウザに任せる

      const container = range.startContainer;
      let block = container.nodeType === Node.ELEMENT_NODE ? container : container.parentNode;
      // 段落（P）を特定
      while (block && block !== editorRoot && block.tagName !== 'P') {
        block = block.parentNode;
      }
      if (!block || block === editorRoot || block.tagName !== 'P') return;

      if (e.key === 'Backspace') {
        // 段落の一番先頭で Backspace → 直前に table があればそれを削除
        const isAtStart = range.startOffset === 0 && block.firstChild === range.startContainer;
        if (!isAtStart) return;

        let prev = block.previousSibling;
        while (prev && prev.nodeType === Node.TEXT_NODE && !prev.textContent.trim()) {
          prev = prev.previousSibling;
        }
        if (prev && prev.tagName === 'TABLE') {
          e.preventDefault();
          const parent = prev.parentNode;
          parent.removeChild(prev);
          // カーソルはそのまま
        }
      }

      if (e.key === 'Delete') {
        // 段落の末尾で Delete → 直後に table があれば削除
        const textLen = block.textContent.length;
        const isAtEnd =
          range.startOffset === textLen ||
          (block.lastChild && range.startContainer === block.lastChild &&
            range.startOffset === block.lastChild.textContent.length);

        if (!isAtEnd) return;

        let next = block.nextSibling;
        while (next && next.nodeType === Node.TEXT_NODE && !next.textContent.trim()) {
          next = next.nextSibling;
        }
        if (next && next.tagName === 'TABLE') {
          e.preventDefault();
          const parent = next.parentNode;
          parent.removeChild(next);
        }
      }
    });
  }

  // =========================
  // 5) 初期化
  // =========================
  initQuill();
  initHeroPreview();
  initHeroUploadAndClear();
  initHeroLibrary();
})();
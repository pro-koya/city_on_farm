// public/js/seller-profile-edit.js
(function () {
  'use strict';

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  let quill = null;

  // =========================
  // Quill ImageResize モジュール登録
  // =========================
  (function registerImageResize() {
    // johnny-quill-image-resize-module は default にクラスが入る場合がある
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
  // 1) Quill 初期化
  // =========================
  function initQuill() {
    const editorEl = $('#editor');
    if (!editorEl || typeof Quill === 'undefined') return;

    quill = new Quill(editorEl, {
      theme: 'snow',
      modules: {
        toolbar: '#editorToolbar',
        // ★ johnny-quill-image-resize-module はシンプルに {} でOK
        //   （modules: ['Resize', ...] を渡すと "e is not a constructor" になることがある）
        imageResize: {}
      },
      placeholder: 'ここに自己紹介やこだわりを書いていきましょう。',
    });

    // 送信時に HTML を hidden に詰める
    const form = $('.sp-form');
    const hiddenIntro = $('#intro_html');
    if (form && hiddenIntro) {
      form.addEventListener('submit', () => {
        hiddenIntro.value = quill.root.innerHTML;
      });
    }

    // ツールバーの image ボタン → カスタム処理に差し替え
    const toolbar = quill.getModule('toolbar');
    if (toolbar) {
      toolbar.addHandler('image', handleQuillImageClick);
    }
  }

  // Quill の画像ボタンを押した時の挙動
  function handleQuillImageClick() {
    openQuillImagePickerModal();
  }

  // カーソル位置に画像を挿入
  function insertImageAtCursor(url) {
    if (!quill || !url) return;
    const range = quill.getSelection(true) || { index: quill.getLength(), length: 0 };
    quill.insertEmbed(range.index, 'image', url, 'user');
    quill.setSelection(range.index + 1, 0, 'user');
  }

  // 現在位置取得（無ければ末尾）
  function getCurrentIndex() {
    const range = quill.getSelection(true);
    return range ? range.index : quill.getLength();
  }

  // 表テンプレート挿入
  function insertTableTemplate() {
    if (!quill) return;
    const index = getCurrentIndex();

    const html = `
      <table class="sp-table">
        <thead>
          <tr>
            <th>項目</th>
            <th>内容</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>例）栽培方法</td>
            <td>例）減農薬・有機肥料を中心に栽培しています。</td>
          </tr>
          <tr>
            <td>例）こだわり</td>
            <td>例）収穫のタイミングを厳密に見極めています。</td>
          </tr>
        </tbody>
      </table>
      <p><br></p>
    `;

    quill.clipboard.dangerouslyPasteHTML(index, html, 'user');
    quill.setSelection(index + 1, 0, 'user');
  }

  // 画像グリッドテンプレート挿入
  function insertImageGridTemplate() {
    if (!quill) return;
    const index = getCurrentIndex();

    const html = `
      <div class="sp-img-grid">
        <div class="sp-img-grid__item">
          画像1（この枠内をクリックして、上の画像ボタンから画像を挿入）
        </div>
        <div class="sp-img-grid__item">
          画像2（この枠内をクリックして、上の画像ボタンから画像を挿入）
        </div>
        <div class="sp-img-grid__item">
          画像3（必要なければ削除してOKです）
        </div>
      </div>
      <p><br></p>
    `;

    quill.clipboard.dangerouslyPasteHTML(index, html, 'user');
    quill.setSelection(index + 1, 0, 'user');
  }

  // スライドショーテンプレート挿入（ページにつき 1 個だけ）
  function insertSliderTemplate() {
    if (!quill) return;

    // すでに存在するかチェック
    const existing = quill.root.querySelector('.sp-slider[data-sp-slider="1"]');
    if (existing) {
      alert('画像スライドショーは1ページにつき1つまで配置できます。既存のスライドショーを削除してから再度お試しください。');
      return;
    }

    const index = getCurrentIndex();

    const html = `
      <div class="sp-slider" data-sp-slider="1">
        <div class="sp-slider__track">
          <div class="sp-slider__item">
            スライド1（ここをクリックして画像を挿入）
          </div>
          <div class="sp-slider__item">
            スライド2（必要な分だけ複製／削除して使えます）
          </div>
          <div class="sp-slider__item">
            スライド3
          </div>
        </div>
      </div>
      <p><br></p>
    `;

    quill.clipboard.dangerouslyPasteHTML(index, html, 'user');
    quill.setSelection(index + 1, 0, 'user');
  }

  // =========================
  // 2) Quill用 画像ピッカーモーダル
  // =========================
  function openQuillImagePickerModal() {
    // 既存モーダルがあれば削除（2回目以降のエラー防止）
    const existing = $('#qImgPickerModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'qImgPickerModal';
    modal.innerHTML = `
      <div data-role="backdrop"
           style="position:fixed;inset:0;background:rgba(0,0,0,.4);backdrop-filter:blur(2px);z-index:80;"></div>
      <div class="qimg-panel"
           style="position:fixed;z-index:81;top:11vh;left:0;right:0;margin:0 auto;max-width:840px;background:#fff;border-radius:16px;box-shadow:0 18px 40px rgba(0,0,0,.25);overflow:hidden;">
        <header style="display:flex;align-items:center;justify-content:space-between;padding:.7rem 1rem;border-bottom:1px solid #e5e7eb;">
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

    // hidden DOM（プロフィール画面内にあるやつを流用）
    const editorFileInput = $('#editorImgFile');
    const editorList      = $('#editorImgList');
    const editorTextarea  = $('#editorImgUrls');
    const editorMsg       = $('#editorImgMsg');

    let selectedUrl = null; // ライブラリ内での選択状態

    function close() {
      modal.remove();
    }

    backdrop.addEventListener('click', close);
    closeBtn.addEventListener('click', close);

    // --- ライブラリ一覧を読み込んで表示 ---
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
          headers: { Accept: 'application/json' },
        });
        if (!resp.ok) throw new Error('library fetch failed');
        const data = await resp.json();
        const items = Array.isArray(data.items) ? data.items : [];

        if (!items.length) {
          libBody.innerHTML =
            '<p style="padding:.4rem 0;color:#6b7280;">画像がありません。</p>';
          return;
        }

        const cards = items
          .map(
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
          )
          .join('');

        libBody.innerHTML = `
          <ul class="qimg-grid"
              style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:.6rem;padding:.2rem 0;margin:0;">
            ${cards}
          </ul>
        `;

        // カードクリックで選択/解除
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

        // アップロード直後の画像をハイライトしたい場合
        if (highlightUrl) {
          const card = libBody.querySelector(`.qimg-card[data-url="${CSS.escape(highlightUrl)}"]`);
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

    // 「ライブラリから選ぶ」ボタン
    if (libraryBtn) {
      libraryBtn.addEventListener('click', () => {
        loadQuillLibrary();
      });
    }

    // ライブラリから挿入
    if (libUseBtn) {
      libUseBtn.addEventListener('click', () => {
        if (!selectedUrl) return;
        insertImageAtCursor(selectedUrl);
        close();
      });
    }

    // --- 「ライブラリへ画像を追加」ボタン（R2 にアップロードしてからライブラリ一覧に反映） ---
    if (
      typeof window.initR2Uploader === 'function' &&
      uploadBtn && editorFileInput && editorList && editorTextarea
    ) {
      // R2 アップローダをこのボタンに紐付け
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

          // ライブラリに追加された前提で、すぐライブラリ一覧を開き、その画像をハイライト
          if (infoMsg) {
            infoMsg.textContent = '画像をライブラリに追加しました。下のライブラリ一覧から挿入できます。';
          }
          loadQuillLibrary(meta.url);
        },
      });
    } else if (uploadBtn && editorFileInput) {
      // フォールバック（R2が使えない場合：data URLを直接挿入してモーダルを閉じる）
      uploadBtn.addEventListener('click', () => {
        editorFileInput.click();
      });
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
  // 3) ハッシュタグ UI
  // =========================
  function initTags() {
    const chipsWrap   = $('#tagChips');
    const input       = $('#tagInput');
    const hiddenInput = $('#hashtag_input');
    if (!chipsWrap || !input || !hiddenInput) return;

    function getTagsFromHidden() {
      const raw = hiddenInput.value || '';
      return raw
        .split(/[,、\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }

    function syncHidden(tags) {
      hiddenInput.value = tags.join(',');
    }

    function renderChips() {
      const tags = getTagsFromHidden();
      chipsWrap.innerHTML = '';
      tags.forEach((tag) => {
        const span = document.createElement('span');
        span.className = 'chip';
        span.dataset.tag = tag;
        span.innerHTML = `
          #${tag}
          <button type="button" class="chip__remove" aria-label="削除">&times;</button>
        `;
        chipsWrap.appendChild(span);
      });
    }

    // 初期レンダリング
    renderChips();

    // 追加（Enter）
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const val = input.value.trim().replace(/^#/, '');
      if (!val) return;

      const current = getTagsFromHidden();
      if (!current.includes(val)) {
        syncHidden(current.concat(val));
        renderChips();
      }
      input.value = '';
    });

    // 削除
    chipsWrap.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip__remove');
      if (!btn) return;
      const chip = btn.closest('.chip');
      if (!chip) return;
      const tag = chip.dataset.tag;
      if (!tag) return;

      const current = getTagsFromHidden().filter((t) => t !== tag);
      syncHidden(current);
      renderChips();
    });
  }

  // =========================
  // 4) ヘッダー画像 プレビュー / アップロード / ライブラリ / クリア
  // =========================

  function updateHeroPreview(url) {
    const img = $('#heroPreviewImg');
    const placeholder = $('#heroPreviewPlaceholder');
    const clean = (url || '').trim();

    if (clean) {
      if (img) {
        img.src = clean;
      } else if (placeholder) {
        const parent = placeholder.parentNode;
        const newImg = document.createElement('img');
        newImg.id = 'heroPreviewImg';
        newImg.alt = 'ヘッダー画像プレビュー';
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
    const input = $('#hero_image_url');
    if (!input) return;
    input.addEventListener('input', () => updateHeroPreview(input.value));
    if (input.value) updateHeroPreview(input.value);
  }

  function initHeroUploadAndClear() {
    const inputUrl  = $('#hero_image_url');
    const uploadBtn = $('#heroUploadBtn');
    const fileInput = $('#heroImageFile');
    const msg       = $('#heroUploadMsg');
    const clearBtn  = $('#heroClearBtn');
    const dummyList = $('#heroPreviewList');
    const dummyTA   = $('#heroImageUrlsTmp');

    if (!inputUrl) return;

    // クリアボタン
    if (clearBtn) {
      clearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        inputUrl.value = '';
        updateHeroPreview('');
        if (msg) msg.textContent = '画像をクリアしました。';
      });
    }

    // R2 アップロード
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
        },
      });
    } else if (uploadBtn && fileInput) {
      // フォールバック：data URL でプレビューのみ
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
    const trigger = $('#heroOpenLibrary');
    const inputUrl = $('#hero_image_url');
    const msg = $('#heroUploadMsg');
    if (!trigger || !inputUrl) return;

    trigger.addEventListener('click', async (e) => {
      e.preventDefault();

      let wrap = $('#heroImgLibModal');
      if (wrap) wrap.remove();

      wrap = document.createElement('div');
      wrap.id = 'heroImgLibModal';
      wrap.innerHTML = `
        <div class="lib__backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,.35);backdrop-filter: blur(2px);"></div>
        <div class="lib__panel" role="dialog" aria-modal="true"
             style="position:fixed;top:100px;left:0;right:0;margin:0 auto;max-width:820px;background:#fff;border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,.18);overflow:hidden">
          <header style="display:flex;gap:.5rem;align-items:center;padding:.6rem .8rem;border-bottom:1px solid #e5e7eb">
            <h2 style="margin:0;font-size:.95rem;">ヘッダー画像を選択</h2>
            <button type="button" id="heroImgLibClose" aria-label="閉じる" style="margin-left:auto;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:.35rem .6rem">✕</button>
          </header>
          <div id="heroImgLibBody" style="max-height:60vh;overflow:auto;padding:.6rem"></div>
          <footer style="display:flex;justify-content:flex-end;align-items:center;padding:.6rem .8rem;border-top:1px solid #e5e7eb;height:auto;background:none;">
            <button type="button" id="heroImgLibUse" class="btn" style="padding:.5rem 1rem;border-radius:999px;border:1px solid #4C6B5C;background:#4C6B5C;color:#fff" disabled>この画像を使う</button>
          </footer>
        </div>
      `;
      document.body.appendChild(wrap);

      const body  = $('#heroImgLibBody', wrap);
      const useBtn= $('#heroImgLibUse', wrap);

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
          const cards = items
            .map(
              (it) => `
                <li class="lib__card"
                    data-url="${it.url}"
                    style="list-style:none;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;cursor:pointer;position:relative">
                  <img src="${it.url}" alt="" loading="lazy" style="display:block;width:100%;height:150px;object-fit:cover;background:#f3f4f6">
                  <span class="lib__check" aria-hidden="true"
                        style="position:absolute;right:6px;top:6px;background:rgba(0,0,0,.55);color:#fff;border-radius:999px;padding:.1rem .35rem;display:none">✓</span>
                </li>
              `
            )
            .join('');
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
      $('#heroImgLibClose', wrap).onclick = close;
      $('.lib__backdrop', wrap).onclick = close;

      useBtn.onclick = () => {
        if (!selectedUrl) return;
        inputUrl.value = selectedUrl;
        const evt = new Event('input', { bubbles: true });
        inputUrl.dispatchEvent(evt);
        if (msg) msg.textContent = 'ヘッダー画像を設定しました。';
        close();
      };
    });
  }

  // =========================
  // 5) 初期化
  // =========================
  initQuill();
  initTags();
  initHeroPreview();
  initHeroUploadAndClear();
  initHeroLibrary();
})();
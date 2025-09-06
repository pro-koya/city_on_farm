// /public/js/product-show.js
(() => {
  const form = document.getElementById('buyForm');
  if (!form) return;

  const qtyInput = document.getElementById('qty');
  const stepBtns = document.querySelectorAll('.stepper__btn');
  const submitBtn = form.querySelector('.btn--buy');
  const badge = document.querySelector('.cart-badge');
  const tabBtn = 

  // 数量ステッパー
  stepBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const step = parseInt(btn.dataset.step, 10) || 0;
      const cur = Math.max(1, parseInt(qtyInput.value, 10) || 1);
      const next = Math.max(1, cur + step);
      qtyInput.value = next;
    });
  });

  // 数量の直接入力も下限1でクランプ
  qtyInput.addEventListener('input', () => {
    const n = Math.max(1, parseInt(qtyInput.value, 10) || 1);
    if (String(n) !== qtyInput.value) qtyInput.value = n;
  });

  // 簡易トースト
  function toast(msg, ok=true){
    const t = document.createElement('div');
    t.className = 'toast ' + (ok ? 'ok' : 'ng');
    t.textContent = msg;
    Object.assign(t.style, {
      position:'fixed', left:'50%', top:'70px', transform:'translateX(-50%)',
      background: ok ? '#2e7d32' : '#c62828', color:'#fff',
      padding:'10px 14px', borderRadius:'8px', zIndex:9999, boxShadow:'0 6px 18px rgba(0,0,0,.2)'
    });
    document.body.appendChild(t);
    setTimeout(()=>{ t.remove(); }, 1800);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitBtn.disabled) return;

    try {
      submitBtn.disabled = true;

      const fd = new FormData(form);
      // ★ hidden から CSRF を取り出してヘッダーにも付ける
      const token = form.querySelector('input[name="_csrf"]')?.value || '';

      const resp = await fetch(form.action, {
        method: 'POST',
        body: fd,                               // multipart/form-data（server は multer.none() 必須）
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'CSRF-Token': token                   // ★ csurf はヘッダーからも検証可
        },
        credentials: 'same-origin'              // ★ セッションクッキーを必ず同送
      });

      if (!resp.ok) {
        const text = await resp.text();
        try {
          const j = JSON.parse(text);
          toast(j.message || 'カート追加に失敗しました。', false);
        } catch {
          document.open(); document.write(text); document.close();
        }
        return;
      }

      const data = await resp.json();
      if (data.ok) {
        if (badge) badge.textContent = data.cartCount ?? badge.textContent;
        toast('カートに追加しました。', true);
      } else {
        toast(data.message || 'カート追加に失敗しました。', false);
      }
    } catch (err) {
      toast('通信に失敗しました。', false);
    } finally {
      submitBtn.disabled = false;
    }
  });

  // タブ要素の取得
  const tabsWrap = document.querySelector('.details .tabs');
  const tabBtns  = Array.from(document.querySelectorAll('.details .tab'));
  const panes    = Array.from(document.querySelectorAll('.details .pane'));

  if (!tabsWrap || tabBtns.length === 0 || panes.length === 0) return;

  // data-tab="desc" => #pane-desc のように対応づけ
  const getPaneId = (key) => `pane-${key}`;

  // 補助：アクティブ切替
  function activate(key, { setHash = true } = {}) {
    const paneId = getPaneId(key);
    const targetBtn  = tabBtns.find(b => b.dataset.tab === key);
    const targetPane = document.getElementById(paneId);
    if (!targetBtn || !targetPane) return;

    // 全消し
    tabBtns.forEach(b => {
      b.classList.remove('is-active');
      b.setAttribute('aria-selected', 'false');
      b.setAttribute('tabindex', '-1');
    });
    panes.forEach(p => {
      p.classList.remove('is-active');
      p.hidden = true;
    });

    // 付与
    targetBtn.classList.add('is-active');
    targetBtn.setAttribute('aria-selected', 'true');
    targetBtn.setAttribute('tabindex', '0');
    targetPane.classList.add('is-active');
    targetPane.hidden = false;

    // スライダーの位置更新（下の CSS で装飾）
    updateSlider();

    // 履歴（戻るボタンで飛び散らないよう replace）
    if (setHash) {
      const url = new URL(location.href);
      url.hash = `tab=${key}`;
      history.replaceState(null, '', url);
    }

    // スクロール微調整（タブが画面外なら少し上に寄せる）
    const rect = tabsWrap.getBoundingClientRect();
    if (rect.top < 60 || rect.top > window.innerHeight - 100) {
      tabsWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // 状態保持（ページ戻り用 / 商品ごとに保存）
    const productId = document.querySelector('input[name="productId"]')?.value || location.pathname;
    try { sessionStorage.setItem(`product-tab:${productId}`, key); } catch {}
  }

  // クリック
  tabBtns.forEach(btn => {
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', btn.classList.contains('is-active') ? 'true' : 'false');
    if (!btn.hasAttribute('tabindex')) btn.setAttribute('tabindex', btn.classList.contains('is-active') ? '0' : '-1');
    btn.addEventListener('click', () => activate(btn.dataset.tab));
  });

  // キー操作（左右で移動）
  tabsWrap.setAttribute('role', 'tablist');
  tabsWrap.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const currentIdx = tabBtns.findIndex(b => b.classList.contains('is-active'));
    let nextIdx = currentIdx;

    if (e.key === 'ArrowLeft') nextIdx = (currentIdx - 1 + tabBtns.length) % tabBtns.length;
    if (e.key === 'ArrowRight') nextIdx = (currentIdx + 1) % tabBtns.length;
    if (e.key === 'Home') nextIdx = 0;
    if (e.key === 'End') nextIdx = tabBtns.length - 1;

    const nextBtn = tabBtns[nextIdx];
    if (nextBtn) {
      activate(nextBtn.dataset.tab);
      nextBtn.focus();
    }
  });

  // ハッシュ or セッションで初期タブ決定
  function initialKey() {
    // URLハッシュ #tab=reviews のような形式を拾う
    const hash = location.hash.replace(/^#/, '');
    const m = hash.match(/tab=([a-z0-9\-]+)/i);
    if (m && m[1]) return m[1];

    // 「レビューへ」リンク（id="goto-reviews"）で reviews を初期表示
    if (location.hash === '#reviews') return 'reviews';

    // セッション保持
    const productId = document.querySelector('input[name="productId"]')?.value || location.pathname;
    try {
      const saved = sessionStorage.getItem(`product-tab:${productId}`);
      if (saved) return saved;
    } catch {}

    // 既定は is-active のボタン or 最初
    const activeBtn = tabBtns.find(b => b.classList.contains('is-active'));
    return activeBtn?.dataset.tab || tabBtns[0].dataset.tab;
  }

  // 「レビュー件数」をクリックしたら reviews にジャンプ
  const gotoReviews = document.getElementById('goto-reviews');
  if (gotoReviews) {
    gotoReviews.addEventListener('click', (e) => {
      e.preventDefault();
      activate('reviews');
    });
  }

  // 初期表示
  activate(initialKey(), { setHash: false });
})();
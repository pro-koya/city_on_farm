// /public/js/product-show.js
(() => {
  const form = document.getElementById('buyForm');
  if (!form) return;

  const qtyInput = document.getElementById('qty');
  const stepBtns = document.querySelectorAll('.stepper__btn');
  const submitBtn = form.querySelector('.btn--buy');
  const badge = document.querySelector('.cart-badge');

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
      const token = form.querySelector('input[name="_csrf"]')?.value || '';

      const resp = await fetch(form.action, {
        method: 'POST',
        body: fd,
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'CSRF-Token': token
        },
        credentials: 'same-origin'
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
    } catch {
      toast('通信に失敗しました。', false);
    } finally {
      submitBtn.disabled = false;
    }
  });

  // ===== ギャラリー（サムネクリックでメイン切替 + 横スクロール対応）=====
  (function initGallery(){
    const main = document.getElementById('mainImage');
    const wrap = document.querySelector('.thumbs-wrap');
    if (!main || !wrap) return;

    const rail = wrap.querySelector('.thumbs');
    const prev = wrap.querySelector('.thumbs__prev');
    const next = wrap.querySelector('.thumbs__next');
    if (!rail) return; // 安全策

    function ensureVisible(btn, smooth = true){
      const rRail = rail.getBoundingClientRect();
      const rBtn  = btn.getBoundingClientRect();
      const deltaLeft  = rBtn.left  - rRail.left;
      const deltaRight = rBtn.right - rRail.right;

      let dx = 0;
      if (deltaLeft < 0) dx = deltaLeft;
      else if (deltaRight > 0) dx = deltaRight;

      if (dx !== 0) {
        // scrollBy が無い環境は scrollLeft にフォールバック
        if (typeof rail.scrollBy === 'function') {
          rail.scrollBy({ left: dx, behavior: smooth ? 'smooth' : 'auto' });
        } else {
          rail.scrollLeft += dx;
        }
      }
    }

    function activateThumb(btn, {smoothScroll=true} = {}){
      if (!btn || !btn.dataset.src) return;

      const img = new Image();
      img.onload = () => { main.src = btn.dataset.src; };
      img.src = btn.dataset.src;

      rail.querySelectorAll('.thumb').forEach(b => {
        b.classList.remove('is-active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('is-active');
      btn.setAttribute('aria-selected', 'true');

      ensureVisible(btn, smoothScroll);
      btn.focus?.({ preventScroll: true });
    }

    rail.addEventListener('click', (e) => {
      const btn = e.target.closest('.thumb');
      if (btn) activateThumb(btn);
    });

    rail.addEventListener('keydown', (e) => {
      const list = Array.from(rail.querySelectorAll('.thumb'));
      if (!list.length) return;
      const curIdx = Math.max(0, list.findIndex(b => b.classList.contains('is-active')));

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const btn = e.target.closest('.thumb');
        if (btn) activateThumb(btn);
        return;
      }

      let nextIdx = curIdx;
      if (e.key === 'ArrowRight') { e.preventDefault(); nextIdx = (curIdx + 1) % list.length; }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); nextIdx = (curIdx - 1 + list.length) % list.length; }
      else if (e.key === 'Home') { e.preventDefault(); nextIdx = 0; }
      else if (e.key === 'End')  { e.preventDefault(); nextIdx = list.length - 1; }
      else return;

      activateThumb(list[nextIdx]);
    });

    const pageBy = () => Math.max(120, Math.round(rail.clientWidth * 0.8)); // 最低120px送る
    prev?.addEventListener('click', () => {
      if (typeof rail.scrollBy === 'function') rail.scrollBy({ left: -pageBy(), behavior: 'smooth' });
      else rail.scrollLeft -= pageBy();
    });
    next?.addEventListener('click', () => {
      if (typeof rail.scrollBy === 'function') rail.scrollBy({ left:  pageBy(), behavior: 'smooth' });
      else rail.scrollLeft += pageBy();
    });

    // 初期選択を可視範囲に
    const initActive = rail.querySelector('.thumb.is-active') || rail.querySelector('.thumb');
    if (initActive) ensureVisible(initActive, false);
  })();

  // ===== タブ（要素が揃っているときだけ初期化） =====
  (function initTabs(){
    const tabsWrap = document.querySelector('.details .tabs');
    const tabBtns  = Array.from(document.querySelectorAll('.details .tab'));
    const panes    = Array.from(document.querySelectorAll('.details .pane'));
    if (!tabsWrap || tabBtns.length === 0 || panes.length === 0) return;

    // updateSlider が未定義なら no-op
    const updateSlider = (typeof window.updateSlider === 'function') ? window.updateSlider : function(){};

    const getPaneId = (key) => `pane-${key}`;

    function activateTab(key, { setHash = true } = {}) {
      const paneId = getPaneId(key);
      const targetBtn  = tabBtns.find(b => b.dataset.tab === key);
      const targetPane = document.getElementById(paneId);
      if (!targetBtn || !targetPane) return;

      tabBtns.forEach(b => {
        b.classList.remove('is-active');
        b.setAttribute('aria-selected', 'false');
        b.setAttribute('tabindex', '-1');
      });
      panes.forEach(p => {
        p.classList.remove('is-active');
        p.hidden = true;
      });

      targetBtn.classList.add('is-active');
      targetBtn.setAttribute('aria-selected', 'true');
      targetBtn.setAttribute('tabindex', '0');
      targetPane.classList.add('is-active');
      targetPane.hidden = false;

      updateSlider();

      if (setHash) {
        const url = new URL(location.href);
        url.hash = `tab=${key}`;
        history.replaceState(null, '', url);
      }

      const rect = tabsWrap.getBoundingClientRect();
      if (rect.top < 60 || rect.top > window.innerHeight - 100) {
        tabsWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      const productId = document.querySelector('input[name="productId"]')?.value || location.pathname;
      try { sessionStorage.setItem(`product-tab:${productId}`, key); } catch {}
    }

    tabBtns.forEach(btn => {
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', btn.classList.contains('is-active') ? 'true' : 'false');
      if (!btn.hasAttribute('tabindex')) {
        btn.setAttribute('tabindex', btn.classList.contains('is-active') ? '0' : '-1');
      }
      btn.addEventListener('click', () => activateTab(btn.dataset.tab));
    });

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
        activateTab(nextBtn.dataset.tab);
        nextBtn.focus();
      }
    });

    function initialKey() {
      const hash = location.hash.replace(/^#/, '');
      const m = hash.match(/tab=([a-z0-9\-]+)/i);
      if (m && m[1]) return m[1];
      if (location.hash === '#reviews') return 'reviews';
      const productId = document.querySelector('input[name="productId"]')?.value || location.pathname;
      try {
        const saved = sessionStorage.getItem(`product-tab:${productId}`);
        if (saved) return saved;
      } catch {}
      const activeBtn = tabBtns.find(b => b.classList.contains('is-active'));
      return activeBtn?.dataset.tab || tabBtns[0].dataset.tab;
    }

    const gotoReviews = document.getElementById('goto-reviews');
    if (gotoReviews) {
      gotoReviews.addEventListener('click', (e) => {
        e.preventDefault();
        activateTab('reviews');
      });
    }

    // 初期表示
    activateTab(initialKey(), { setHash: false });
  })();
})();
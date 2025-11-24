// /public/js/product-show.js
(() => {
  const form = document.getElementById('buyForm');
  if (!form) return;

  const qtyInput = document.getElementById('qty');
  const stepBtns = document.querySelectorAll('.stepper__btn');
  const submitBtn = form.querySelector('.btn--buy');
  const badge = document.querySelector('.cart-badge');

  // 在庫（フォームの data-stock または input[data-max]/max から）
  const maxStock =
    Number(form.dataset.stock) ||
    Number(qtyInput.dataset.max) ||
    Number(qtyInput.max) ||
    Infinity;

  // 在庫0なら購入不可
  if (!Number.isFinite(maxStock) || maxStock <= 0) {
    qtyInput.value = 0;
    qtyInput.disabled = true;
    submitBtn.disabled = true;
  }

  function clampQty(n) {
    const min = 1;
    const max = Math.max(1, maxStock); // 0在庫は上で処理済み
    return Math.min(max, Math.max(min, n));
  }

  function updateButtons() {
    const v = parseInt(qtyInput.value, 10) || 1;
    const minusBtn = document.querySelector('.stepper__btn[data-step="-1"]');
    const plusBtn  = document.querySelector('.stepper__btn[data-step="+1"], .stepper__btn[data-step="1"]');

    if (minusBtn) minusBtn.disabled = (v <= 1);
    if (plusBtn)  plusBtn.disabled  = (v >= maxStock);
  }

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

  // 数量ステッパー
  stepBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (submitBtn.disabled) return; // 在庫0など
      const step = parseInt(btn.dataset.step, 10) || 0;
      const cur  = parseInt(qtyInput.value, 10) || 1;
      const next = clampQty(cur + step);
      if (next !== cur + step && step > 0) {
        toast(`在庫は最大 ${maxStock} までです`, false);
      }
      qtyInput.value = next;
      updateButtons();
    });
  });

  // 直接入力もクランプ（1〜在庫）
  qtyInput.addEventListener('input', () => {
    const raw = parseInt(qtyInput.value, 10);
    const n = clampQty(Number.isFinite(raw) ? raw : 1);
    if (String(n) !== qtyInput.value) qtyInput.value = n;
    updateButtons();
  });

  // 初期ボタン状態
  updateButtons();

  // 送信時にも最終チェック（改竄や競合に備える）
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitBtn.disabled) return;

    // 最終クランプ
    qtyInput.value = clampQty(parseInt(qtyInput.value, 10) || 1);
    updateButtons();

    try {
      submitBtn.disabled = true;

      const fd = new FormData(form);
      const token = form.querySelector('input[name="_csrf"]')?.value || '';

      const resp = await fetch(form.action, {
        method: 'POST',
        body: fd,
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'CSRF-Token': token },
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
      submitBtn.disabled = (maxStock <= 0) ? true : false;
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
  })();

    // ===== レビュー投稿モーダル =====
  (function initReviewModal(){
    const openBtn = document.getElementById('openReviewModal');
    const modal   = document.getElementById('reviewModal');
    const closeBtn= document.getElementById('closeReviewModal');
    const cancel  = document.getElementById('cancelReview');

    const reviewForm    = document.getElementById('reviewForm');
    const starsRow= document.getElementById('starsRow');
    const starsIn = document.getElementById('rv_stars');
    const bodyEl  = document.getElementById('rv_body');
    const idEl    = document.getElementById('rv_id');
    const errP    = document.getElementById('rv_error');
    const titleEl = document.getElementById('reviewModalTitle');

    // ★ここは「レビューUIがないなら何もしない」で OK（他の処理は継続）
    if (!openBtn || !modal || !reviewForm || !starsRow || !starsIn || !bodyEl || !idEl || !errP || !titleEl) return;

    const open = () => {
      modal.classList.add('is-open');
      modal.removeAttribute('aria-hidden');
      bodyEl.focus();
    };
    const close= () => {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden','true');
      errP.textContent='';
    };

    function setStars(n){
      starsRow.querySelectorAll('.star').forEach(btn=>{
        const v = parseInt(btn.dataset.v,10);
        btn.classList.toggle('is-active', v <= n);
      });
    }

    function initFromBtn(){
      const has   = openBtn.dataset.hasReview === '1';
      const stars = parseInt(openBtn.dataset.stars||'5',10);
      const body  = openBtn.dataset.body || '';
      const rid   = openBtn.dataset.reviewId || '';

      idEl.value     = rid;
      starsIn.value  = String(stars);
      starsRow.dataset.value = String(stars);
      setStars(stars);
      bodyEl.value   = body;
      titleEl.textContent = has ? 'レビューを編集' : 'レビューを書く';
    }

    // 星クリック
    starsRow.querySelectorAll('.star').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const v = parseInt(btn.dataset.v,10);
        starsIn.value = String(v);
        setStars(v);
      });
    });

    openBtn.addEventListener('click', ()=>{ initFromBtn(); open(); });
    closeBtn?.addEventListener('click', close);
    cancel?.addEventListener('click', close);
    modal.addEventListener('click', (e)=>{ if (e.target === modal) close(); });

    // 送信
    reviewForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      errP.textContent = '';

      const s = parseInt(starsIn.value||'0',10);
      const b = bodyEl.value.trim();
      if (!(s>=1 && s<=5)) { errP.textContent='評価（星）を選択してください。'; return; }
      if (!b) { errP.textContent='本文を入力してください。'; return; }

      const fd = new FormData(reviewForm);
      const usp = new URLSearchParams();
      for (const [k,v] of fd.entries()) usp.append(k, v);

      try{
        const res = await fetch(reviewForm.action, {
          method:'POST',
          headers:{
            'Accept':'application/json',
            'Content-Type':'application/x-www-form-urlencoded',
            'CSRF-Token': fd.get('_csrf') || ''
          },
          body: usp
        });

        const text = await res.text();
        let json; try { json = JSON.parse(text); } catch { throw new Error(`non-json:${res.status}`); }
        if (!json.ok){
          errP.textContent = json.message || '入力内容をご確認ください。';
          return;
        }

        document.querySelector('.review-head .score strong').textContent = (json.rating || 0).toFixed(1);
        document.querySelector('.review-head .score').lastChild.textContent = ` / 5（${json.count||0}件）`;
        openBtn.textContent = 'レビューを編集';

        const list = document.getElementById('reviewList') || (function(){
          const ul = document.createElement('ul');
          ul.id='reviewList'; ul.className='review-list';
          document.getElementById('reviews').appendChild(ul);
          return ul;
        })();

        const liId = `rev-${json.review.id}`;
        let li = document.getElementById(liId);
        const html = `
          <div class="review__meta">
            <span class="review__stars">${'★'.repeat(json.review.rating)}${'☆'.repeat(5-json.review.rating)}</span>
            <span class="review__author badge mine">${json.review.user_name || 'あなた'}</span>
            <span class="review__date">${new Date(json.review.updated_at||json.review.created_at).toLocaleDateString('ja-JP')}</span>
          </div>
          ${json.review.title ? `<h4 class="review__title">${json.review.title}</h4>` : ''}
          <p class="review__body"></p>
        `;
        if (!li){
          li = document.createElement('li');
          li.className='review';
          li.id = liId;
          li.innerHTML = html;
          list.prepend(li);
        } else {
          li.innerHTML = html;
        }
        li.querySelector('.review__body').textContent = json.review.body || '';

        openBtn.dataset.hasReview = '1';
        openBtn.dataset.stars     = String(json.review.rating);
        openBtn.dataset.body      = json.review.body || '';
        openBtn.dataset.reviewId  = json.review.id;

        close();
      }catch(err){
        errP.textContent = '通信に失敗しました。時間をおいて再度お試しください。';
      }
    });
  })();

  // ===== 生産者紹介ポップアップ（/sellers/:userId を iframe で表示） =====
  (function initSellerProfileModal() {
    const link  = document.querySelector('.js-seller-modal-link');
    const modal = document.getElementById('sellerProfileModal');
    const frame = document.getElementById('sellerProfileFrame');

    if (!link || !modal || !frame) return;

    // --- スクロールロック用 ---
    let scrollY = 0;
    function lockScroll() {
      scrollY = window.scrollY || document.documentElement.scrollTop;
      // body を固定して背景スクロールを止める
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
    }
    function unlockScroll() {
      // 固定解除
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      // 元の位置へ戻す
      window.scrollTo(0, scrollY);
    }

    function openSellerModal() {
      const url = link.href;
      frame.src = url;

      modal.classList.add('is-open');
      modal.removeAttribute('aria-hidden');

      // ★ 背景スクロールをロック
      lockScroll();
    }

    function closeSellerModal() {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      frame.src = '';

      // ★ ロック解除
      unlockScroll();
    }

    // クリックで通常遷移を止めてモーダル
    link.addEventListener('click', (e) => {
      e.preventDefault();
      openSellerModal();
    });

    // 背景クリック or × で閉じる
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('[data-seller-modal-close]')) {
        closeSellerModal();
      }
    });

    // Esc キーでも閉じる
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) {
        closeSellerModal();
      }
    });
  })();

})();
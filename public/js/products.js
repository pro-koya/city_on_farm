(function(){
  // ===== フィルター状態の保持（一覧 ↔ 詳細の遷移） =====
  const LIST_URL_KEY = 'cof.lastListUrl';
  const path = location.pathname;
  if (path === '/products' || path === '/products/list') {
    // 一覧ページ: 現在のURL（クエリパラメータ含む）を保存
    sessionStorage.setItem(LIST_URL_KEY, location.href);
  } else if (/^\/products\/[^/]+$/.test(path)) {
    // 詳細ページ: 「商品一覧へ」リンクを保存URLに差し替え
    const saved = sessionStorage.getItem(LIST_URL_KEY);
    if (saved) {
      document.querySelectorAll('a[href="/products"]').forEach(a => {
        a.href = saved;
      });
    }
  }

  // ===== 既存のトースト/モーダルはそのまま =====
  const toast = document.getElementById('toast');
  const modal = document.getElementById('modal');
  const toastOpen = document.getElementById('toast-open');
  const toastClose = document.getElementById('toast-close');
  const modalClose = document.getElementById('modal-close');
  const modalBackdrop = document.getElementById('modal-backdrop');
  const hideToday = document.getElementById('modal-hideToday');

  const key = 'cof.hideEvent.' + new Date().toISOString().slice(0,10);
  if (!localStorage.getItem(key) && toast) toast.hidden = false;

  function openModal(){ modal && modal.setAttribute('aria-hidden','false'); }
  function closeModal(){
    if (!modal) return;
    modal.setAttribute('aria-hidden','true');
    if (hideToday && hideToday.checked) localStorage.setItem(key, '1');
  }
  toastOpen && toastOpen.addEventListener('click', openModal);
  modalClose && modalClose.addEventListener('click', closeModal);
  modalBackdrop && modalBackdrop.addEventListener('click', closeModal);
  toastClose && toastClose.addEventListener('click', () => { toast.hidden = true; });

  // ===== フィルタ自動適用（安定版） =====
  const form = document.getElementById('filter-form');
  if (form){
    const pageHidden = document.getElementById('pageHidden');
    const catHidden  = document.getElementById('catHidden');

    // iOS Safari 向け：requestSubmit()の送信先ボタンを明示的に用意
    let submitter = form.querySelector('button[type="submit"].sr-only');
    if (!submitter) {
      submitter = document.createElement('button');
      submitter.type = 'submit';
      submitter.className = 'sr-only';
      submitter.setAttribute('aria-hidden', 'true');
      form.appendChild(submitter);
    }

    let submitting = false;
    function submitWithReset(){
      if (submitting) return;
      submitting = true;
      if (pageHidden) pageHidden.value = 1; // 変更時は常に1ページ目へ
      if (typeof form.requestSubmit === 'function') form.requestSubmit(submitter);
      else form.submit();
      // 二重送信を避けるため少しだけロック（送信直後にページ遷移するので安全）
      setTimeout(() => { submitting = false; }, 500);
    }

    // 1) カテゴリチップ（button）→ hidden(category) を更新して送信
    document.querySelectorAll('.chips .chip').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const cat = btn.getAttribute('data-cat') || 'all';
        if (catHidden) catHidden.value = cat;

        // 見た目の更新（is-active と aria-pressed）
        document.querySelectorAll('.chips .chip').forEach(b => {
          const on = (b.getAttribute('data-cat') || 'all') === cat;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });

        submitWithReset();
      });
    });

    // 2) クイックフィルタ（checkbox）と並び替え（select）は変更で即送信
    //    ※ .pref-cb（都道府県チェックボックス）は除外（専用パネルで制御）
    form.addEventListener('change', (e) => {
      if (e.target.classList.contains('pref-cb')) return;
      if (e.target.matches('select, input[type="checkbox"]')) {
        submitWithReset();
      }
    });

    // 3) 検索はデバウンス（0.5s停止で送信）＋ Enter で即送信
    const q = document.getElementById('q');
    if (q){
      let t;
      q.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(submitWithReset, 500);
      });
      q.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); submitWithReset(); }
      });
    }

    // 4) 価格帯フィルタ（デバウンス 0.5s）
    ['priceMin', 'priceMax'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      let pt;
      el.addEventListener('input', () => {
        clearTimeout(pt);
        pt = setTimeout(submitWithReset, 500);
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); submitWithReset(); }
      });
    });
  }

  // ===== 折りたたみトグル（PC・モバイル共通） =====
  const toggle = document.getElementById('filtersToggle');
  const collapsible = document.getElementById('filtersCollapsible');
  const STORAGE_KEY = 'cof.filterCollapsed';
  if (toggle && collapsible) {
    // localStorage に保存された状態があればそちらを優先して復元
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      const shouldCollapse = saved === '1';
      collapsible.classList.toggle('is-collapsed', shouldCollapse);
      toggle.setAttribute('aria-expanded', String(!shouldCollapse));
      toggle.querySelector('.filters__toggle-icon').textContent = shouldCollapse ? '\u25B6' : '\u25BC';
    }

    toggle.addEventListener('click', () => {
      const collapsed = collapsible.classList.toggle('is-collapsed');
      toggle.setAttribute('aria-expanded', String(!collapsed));
      toggle.querySelector('.filters__toggle-icon').textContent = collapsed ? '\u25B6' : '\u25BC';
      localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    });
  }

  // ===== 配送先 複数選択パネル =====
  const prefPickerBtn = document.getElementById('prefPickerBtn');
  const prefPanel = document.getElementById('prefPanel');
  const prefHidden = document.getElementById('prefHidden');
  if (prefPickerBtn && prefPanel && prefHidden) {
    // パネル開閉
    prefPickerBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const open = prefPanel.hidden;
      prefPanel.hidden = !open;
      prefPickerBtn.setAttribute('aria-expanded', String(open));
    });

    // パネル外クリックで閉じる
    document.addEventListener('click', (e) => {
      const picker = document.getElementById('prefPicker');
      if (picker && !picker.contains(e.target)) {
        prefPanel.hidden = true;
        prefPickerBtn.setAttribute('aria-expanded', 'false');
      }
    });

    // すべて選択 / すべて解除
    const selectAll = document.getElementById('prefSelectAll');
    const deselectAll = document.getElementById('prefDeselectAll');
    const allCbs = prefPanel.querySelectorAll('.pref-cb');
    if (selectAll) selectAll.addEventListener('click', () => allCbs.forEach(cb => cb.checked = true));
    if (deselectAll) deselectAll.addEventListener('click', () => allCbs.forEach(cb => cb.checked = false));

    // 適用ボタン → hidden更新 → フォーム送信
    const prefApply = document.getElementById('prefApply');
    if (prefApply) {
      prefApply.addEventListener('click', () => {
        const selected = Array.from(allCbs).filter(cb => cb.checked).map(cb => cb.value);
        prefHidden.value = selected.join(',');
        prefPanel.hidden = true;
        prefPickerBtn.setAttribute('aria-expanded', 'false');
        // form の submitWithReset を呼ぶ（formスコープ外なので直接submit）
        const f = document.getElementById('filter-form');
        const ph = document.getElementById('pageHidden');
        if (ph) ph.value = 1;
        if (f) {
          const sub = f.querySelector('button[type="submit"].sr-only');
          if (sub && typeof f.requestSubmit === 'function') f.requestSubmit(sub);
          else f.submit();
        }
      });
    }
  }

  // ===== 閲覧履歴（既存） =====
  function pushHistory(id){
    try{
      const key = 'cof.recent';
      const arr = JSON.parse(localStorage.getItem(key) || '[]');
      const next = [id, ...arr.filter(x => x !== id)].slice(0,20);
      localStorage.setItem(key, JSON.stringify(next));
    }catch(e){}
  }
  document.querySelectorAll('[data-product-id]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-product-id');
      if (id) pushHistory(id);
    });
  });

  // ===== お気に入り（見た目だけの簡易版） =====
  document.querySelectorAll('.fav').forEach(btn => {
    btn.addEventListener('click', (e)=>{
      e.preventDefault(); e.stopPropagation();
      btn.classList.toggle('is-on');
      btn.textContent = btn.classList.contains('is-on') ? '♥' : '♡';
    });
  });

  // ---- 簡易トースト ----
  function carttoast(msg, ok = true) {
    const t = document.createElement('div');
    t.className = 'toast ' + (ok ? 'ok' : 'ng');
    t.textContent = msg;
    document.body.appendChild(t);
    // 表示 → 1.5秒後にフェードアウト → 消す
    setTimeout(() => {
      t.classList.add('fade-out');
      // アニメーション終了後に削除
      t.addEventListener('animationend', () => t.remove(), { once: true });
    }, 1800);
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.buyForm').forEach((form) => {
      const qtyInput  = form.querySelector('.qty-data');
      const stepBtns  = form.querySelectorAll('.stepper__btn');
      const submitBtn = form.querySelector('.btn--buy');
      const cartBadge = document.querySelector('.cart-badge'); // 任意（あれば更新）

      if (!qtyInput || !submitBtn) return;

      // ステッパーは必ず非 submit に矯正
      stepBtns.forEach((b) => { if (b.tagName === 'BUTTON') b.type = 'button'; });

      const maxStock =
        Number(form.dataset.stock) ||
        Number(qtyInput.dataset.max) ||
        Number(qtyInput.max) || Infinity;

      if (maxStock <= 0) {
        qtyInput.value = 0;
        qtyInput.disabled = true;
        submitBtn.disabled = true;
        return;
      }

      const clamp = (n) => Math.min(maxStock, Math.max(1, n));

      function updateButtons() {
        const v = parseInt(qtyInput.value, 10) || 1;
        const minusBtn = form.querySelector('.stepper__btn[data-step="-1"]');
        const plusBtn  = form.querySelector('.stepper__btn[data-step="1"]');
        if (minusBtn) minusBtn.disabled = (v <= 1);
        if (plusBtn)  plusBtn.disabled  = (v >= maxStock);
      }

      // ±ボタン
      stepBtns.forEach((btn) => {
        btn.addEventListener('click', (e) => {
          // 念のため送信抑止（type=buttonでも保険）
          e.preventDefault();
          const step = parseInt(btn.dataset.step, 10) || 0;
          const cur  = parseInt(qtyInput.value, 10) || 1;
          const rawNext = cur + step;
          const next = clamp(rawNext);
          if (step > 0 && rawNext > maxStock) {
            toast(`在庫は最大 ${maxStock} までです`, false);
          }
          qtyInput.value = next;
          updateButtons();
        });
      });

      // 直接入力
      qtyInput.addEventListener('input', () => {
        const n = clamp(parseInt(qtyInput.value, 10) || 1);
        if (String(n) !== qtyInput.value) qtyInput.value = n;
        updateButtons();
      });

      // 初期状態
      qtyInput.value = clamp(parseInt(qtyInput.value, 10) || 1);
      updateButtons();

      // 送信（JSONを画面遷移させない）
      form.addEventListener('submit', async (e) => {
        e.preventDefault(); // ← これが付かないとJSONページへ遷移します
        if (submitBtn.disabled) return;

        qtyInput.value = clamp(parseInt(qtyInput.value, 10) || 1);
        updateButtons();

        const fd = new FormData(form);
        const token = form.querySelector('input[name="_csrf"]')?.value || '';

        try {
          submitBtn.disabled = true;
          const resp = await fetch(form.action, {
            method: 'POST',
            body: fd,
            headers: {
              'X-Requested-With': 'XMLHttpRequest',
              'CSRF-Token': token,
              'Accept': 'application/json'
            },
            credentials: 'same-origin'
          });

          if (!resp.ok) {
            let msg = 'カート追加に失敗しました。';
            try { const j = await resp.json(); if (j?.message) msg = j.message; } catch {}
            carttoast(msg, false);
            return;
          }

          const data = await resp.json();
          if (data.ok) {
            if (cartBadge) cartBadge.textContent = data.cartCount ?? cartBadge.textContent;
            carttoast('カートに追加しました。', true);
          } else {
            carttoast(data.message || 'カート追加に失敗しました。', false);
          }
        } catch {
          carttoast('通信に失敗しました。', false);
        } finally {
          submitBtn.disabled = false;
        }
      });
    });
  });
})();
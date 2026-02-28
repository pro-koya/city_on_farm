// order-templates.js — テンプレート詳細ページ用JS
(function () {
  'use strict';

  // ============================================================
  // 数量ステッパー (+/- ボタン)
  // ============================================================
  document.querySelectorAll('.qty__btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var input = this.closest('.qty').querySelector('.qty__input');
      if (!input) return;
      var val = parseInt(input.value, 10) || 1;
      if (this.dataset.act === 'inc') {
        input.value = val + 1;
      } else if (this.dataset.act === 'dec' && val > 1) {
        input.value = val - 1;
      }
    });
  });

  // ============================================================
  // アイテム削除（ネストされたフォームを回避）
  // ============================================================
  document.querySelectorAll('.tpl-remove-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!confirm('この商品をテンプレートから削除しますか？')) return;
      var templateId = this.dataset.templateId;
      var itemId = this.dataset.itemId;
      var form = document.getElementById('removeItemForm');
      if (!form) return;
      form.action = '/my/templates/' + templateId + '/remove-item';
      document.getElementById('removeItemId').value = itemId;
      form.submit();
    });
  });

  // ============================================================
  // 商品追加モーダル
  // ============================================================
  var modal = document.getElementById('addProductModal');
  if (!modal) return;

  var overlay = modal.querySelector('.modal__overlay');
  var closeBtn = modal.querySelector('.modal__close');
  var cancelBtn = document.getElementById('cancelAddProduct');
  var searchInput = document.getElementById('productSearchInput');
  var resultsContainer = document.getElementById('searchResultsContainer');
  var selectedProductIdInput = document.getElementById('selectedProductId');
  var confirmBtn = document.getElementById('confirmAddProduct');
  var openBtns = [
    document.getElementById('openAddProductModal'),
    document.getElementById('openAddProductModalEmpty')
  ].filter(Boolean);

  var sellerPartnerId = searchInput ? searchInput.dataset.sellerPartnerId : '';
  var debounceTimer = null;

  function openModal() {
    modal.style.display = '';
    document.body.style.overflow = 'hidden';
    if (searchInput) {
      searchInput.value = '';
      setTimeout(function () { searchInput.focus(); }, 100);
    }
  }

  function closeModal() {
    modal.style.display = 'none';
    document.body.style.overflow = '';
    if (selectedProductIdInput) selectedProductIdInput.value = '';
    if (confirmBtn) confirmBtn.disabled = true;
    if (searchInput) searchInput.value = '';
    if (resultsContainer) {
      resultsContainer.innerHTML = '<p class="search-results__empty">商品名を入力して検索してください</p>';
    }
  }

  openBtns.forEach(function (btn) {
    btn.addEventListener('click', openModal);
  });

  if (overlay) overlay.addEventListener('click', closeModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

  // ESC で閉じる
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal.style.display !== 'none') {
      closeModal();
    }
  });

  // ============================================================
  // 商品検索
  // ============================================================
  if (searchInput) {
    searchInput.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      var q = this.value.trim();

      if (!q) {
        resultsContainer.innerHTML = '<p class="search-results__empty">商品名を入力して検索してください</p>';
        return;
      }

      resultsContainer.innerHTML = '<p class="search-spinner">検索中...</p>';

      debounceTimer = setTimeout(function () {
        fetch('/api/products/search?q=' + encodeURIComponent(q) + '&sellerPartnerId=' + encodeURIComponent(sellerPartnerId))
          .then(function (res) { return res.json(); })
          .then(function (data) {
            renderResults(data.products || []);
          })
          .catch(function () {
            resultsContainer.innerHTML = '<p class="search-results__empty">検索に失敗しました。</p>';
          });
      }, 300);
    });
  }

  function renderResults(products) {
    if (!products.length) {
      resultsContainer.innerHTML = '<p class="search-results__empty">該当する商品が見つかりません。</p>';
      return;
    }

    var ul = document.createElement('ul');
    ul.className = 'search-results';

    products.forEach(function (p) {
      var li = document.createElement('li');
      li.className = 'search-results__item';
      li.dataset.productId = p.id;

      var imgSrc = p.image_url || '/images/placeholder.png';
      li.innerHTML =
        '<div class="search-results__thumb"><img src="' + escapeHtml(imgSrc) + '" alt="" loading="lazy"></div>' +
        '<div class="search-results__info">' +
          '<div class="search-results__title">' + escapeHtml(p.title) + '</div>' +
          '<div class="search-results__price">&yen;' + Number(p.price).toLocaleString() + ' / ' + escapeHtml(p.unit || '点') + '</div>' +
        '</div>' +
        '<span class="search-results__stock">在庫 ' + p.stock + '</span>';

      li.addEventListener('click', function () {
        ul.querySelectorAll('.is-selected').forEach(function (el) {
          el.classList.remove('is-selected');
        });
        li.classList.add('is-selected');
        if (selectedProductIdInput) selectedProductIdInput.value = p.id;
        if (confirmBtn) confirmBtn.disabled = false;
      });

      ul.appendChild(li);
    });

    resultsContainer.innerHTML = '';
    resultsContainer.appendChild(ul);
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str || ''));
    return div.innerHTML;
  }
})();

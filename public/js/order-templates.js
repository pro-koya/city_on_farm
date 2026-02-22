// order-templates.js — テンプレート詳細ページ用JS
(function () {
  'use strict';

  // 数量ステッパー (+/- ボタン)
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
})();

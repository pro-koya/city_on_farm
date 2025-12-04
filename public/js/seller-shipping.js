// public/js/seller-shipping.js
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('shippingForm');
  if (!form) return;

  const btnSave = document.getElementById('shSaveBtn');

  // --- 全国デフォルト：toggle で fee の enable/disable ---
  const allCanShip = form.querySelector('.js-all-can-ship');
  const allFee     = form.querySelector('.js-all-fee');

  if (allCanShip && allFee) {
    const syncAllFee = () => {
      if (allCanShip.checked) {
        allFee.disabled = false;
      } else {
        allFee.disabled = true;
        allFee.value = allFee.value; // 値は保持してもOK。クリアしたければ "" でもよい
      }
    };
    allCanShip.addEventListener('change', syncAllFee);
    syncAllFee();
  }

  // --- 都道府県 / 市区町村の追加・削除 ---
  const prefContainer = form.querySelector('.js-pref-rows');
  const cityContainer = form.querySelector('.js-city-rows');
  const prefEmpty     = form.querySelector('.js-pref-empty');
  const cityEmpty     = form.querySelector('.js-city-empty');
  const tplPref       = document.getElementById('tpl-pref-row');
  const tplCity       = document.getElementById('tpl-city-row');

  // 既存行数からスタート
  let prefIndex = prefContainer
    ? prefContainer.querySelectorAll('[data-row]').length
    : 0;
  let cityIndex = cityContainer
    ? cityContainer.querySelectorAll('[data-row]').length
    : 0;

  function setupRow(root) {
    if (!root) return;
    // 配送可否チェック → fee enable/disable
    root.querySelectorAll('.js-can-ship').forEach(chk => {
      chk.addEventListener('change', () => {
        const row = chk.closest('[data-row]');
        if (!row) return;
        row.querySelectorAll('.js-fee-input').forEach(inp => {
          inp.disabled = !chk.checked;
        });
      });
      chk.dispatchEvent(new Event('change'));
    });

    // 削除
    root.querySelectorAll('.js-remove-row').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = btn.closest('[data-row]');
        if (!row) return;
        row.remove();
        updateEmptyStates();
      });
    });
  }

  function updateEmptyStates() {
    if (prefEmpty) {
      const hasRows = !!prefContainer && !!prefContainer.querySelector('[data-row]');
      prefEmpty.style.display = hasRows ? 'none' : '';
    }
    if (cityEmpty) {
      const hasRows = !!cityContainer && !!cityContainer.querySelector('[data-row]');
      cityEmpty.style.display = hasRows ? 'none' : '';
    }
  }

  // 既存行にハンドラ付与
  if (prefContainer) setupRow(prefContainer);
  if (cityContainer) setupRow(cityContainer);
  updateEmptyStates();

  const addPrefBtn = document.querySelector('.js-add-pref-row');
  const addCityBtn = document.querySelector('.js-add-city-row');

  if (addPrefBtn && tplPref && prefContainer) {
    const prefHtmlBase = tplPref.innerHTML.trim();
    addPrefBtn.addEventListener('click', () => {
      const html = prefHtmlBase.replace(/__INDEX__/g, String(prefIndex++));
      prefContainer.insertAdjacentHTML('beforeend', html);
      setupRow(prefContainer);
      updateEmptyStates();
    });
  }

  if (addCityBtn && tplCity && cityContainer) {
    const cityHtmlBase = tplCity.innerHTML.trim();
    addCityBtn.addEventListener('click', () => {
      const html = cityHtmlBase.replace(/__INDEX__/g, String(cityIndex++));
      cityContainer.insertAdjacentHTML('beforeend', html);
      setupRow(cityContainer);
      updateEmptyStates();
    });
  }

  form.addEventListener('submit', () => {
    if (btnSave) {
      btnSave.disabled = true;
      btnSave.textContent = '保存中…';
    }
  });
});
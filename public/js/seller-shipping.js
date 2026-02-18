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
  const tierContainer = form.querySelector('.js-tier-rows');
  const prefEmpty     = form.querySelector('.js-pref-empty');
  const cityEmpty     = form.querySelector('.js-city-empty');
  const tierEmpty     = form.querySelector('.js-tier-empty');
  const tplPref       = document.getElementById('tpl-pref-row');
  const tplCity       = document.getElementById('tpl-city-row');
  const tplTier       = document.getElementById('tpl-tier-row');

  let prefIndex = prefContainer ? prefContainer.querySelectorAll('[data-row]').length : 0;
  let cityIndex = cityContainer ? cityContainer.querySelectorAll('[data-row]').length : 0;
  let tierIndex = tierContainer ? tierContainer.querySelectorAll('[data-row]').length : 0;

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

  function setupTierRow(root) {
    if (!root) return;
    root.querySelectorAll('.js-remove-row').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = btn.closest('[data-row]');
        if (row) { row.remove(); updateEmptyStates(); }
      });
    });
  }

  function updateEmptyStates() {
    if (prefEmpty) {
      prefEmpty.style.display = (prefContainer && prefContainer.querySelector('[data-row]')) ? 'none' : '';
    }
    if (cityEmpty) {
      cityEmpty.style.display = (cityContainer && cityContainer.querySelector('[data-row]')) ? 'none' : '';
    }
    if (tierEmpty) {
      tierEmpty.style.display = (tierContainer && tierContainer.querySelector('[data-row]')) ? 'none' : '';
    }
  }

  if (prefContainer) setupRow(prefContainer);
  if (cityContainer) setupRow(cityContainer);
  if (tierContainer) setupTierRow(tierContainer);
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

  const addTierBtn = document.querySelector('.js-add-tier-row');
  if (addTierBtn && tplTier && tierContainer) {
    const tierHtmlBase = tplTier.innerHTML.trim();
    addTierBtn.addEventListener('click', () => {
      const html = tierHtmlBase.replace(/__INDEX__/g, String(tierIndex++));
      tierContainer.insertAdjacentHTML('beforeend', html);
      setupTierRow(tierContainer);
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
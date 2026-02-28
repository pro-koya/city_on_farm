// /public/js/listing-variants.js
// バリエーション管理UI（listing-new / listing-edit 共通）
(() => {
  const check = document.getElementById('hasVariantsCheck');
  const section = document.getElementById('variantsSection');
  const rows = document.getElementById('variantRows');
  const addBtn = document.getElementById('addVariantRow');
  const singleRow = document.getElementById('singlePriceRow');

  if (!check || !section || !rows || !addBtn) return;

  // 価格・単位・在庫のrequired切替
  const priceInput = document.getElementById('price');
  const unitInput = document.getElementById('unit');
  const stockInput = document.getElementById('stock');

  function toggleVariants(on) {
    section.style.display = on ? '' : 'none';
    if (singleRow) singleRow.style.display = on ? 'none' : '';

    // バリエーションON時は単品の価格等のrequiredを外す
    if (priceInput) priceInput.required = !on;
    if (unitInput) unitInput.required = !on;
    if (stockInput) stockInput.required = !on;

    // バリエーションONで行が0なら自動追加
    if (on && rows.children.length === 0) {
      addRow();
    }
  }

  function reindex() {
    Array.from(rows.querySelectorAll('.variant-row')).forEach((row, i) => {
      row.querySelectorAll('input[name]').forEach(inp => {
        inp.name = inp.name.replace(/variants\[\d+\]/, `variants[${i}]`);
      });
    });
  }

  function addRow(data) {
    const i = rows.children.length;
    const d = data || {};
    const div = document.createElement('div');
    div.className = 'kv__row variant-row';
    div.innerHTML = `
      ${d.id ? `<input type="hidden" name="variants[${i}][id]" value="${d.id}">` : ''}
      <input type="text" name="variants[${i}][label]" placeholder="規格名（例：1個）" value="${d.label || ''}" required>
      <input type="number" name="variants[${i}][price]" placeholder="価格" value="${d.price || ''}" min="0" step="1" required>
      <input type="text" name="variants[${i}][unit]" placeholder="単位" value="${d.unit || ''}">
      <input type="number" name="variants[${i}][stock]" placeholder="在庫" value="${d.stock || ''}" min="0" step="1" required>
      <button type="button" class="icon-btn kv__del variant-del" title="削除">✕</button>
    `;
    rows.appendChild(div);
  }

  check.addEventListener('change', () => toggleVariants(check.checked));

  addBtn.addEventListener('click', () => addRow());

  rows.addEventListener('click', (e) => {
    const del = e.target.closest('.variant-del');
    if (!del) return;
    del.closest('.variant-row').remove();
    reindex();
  });

  // 初期状態
  toggleVariants(check.checked);
})();

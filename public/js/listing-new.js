(function(){
  const form = document.getElementById('listing-form');

  // ===== 入力バリデーション（開始後に表示） =====
  function showError(id, msg){
    const p = document.querySelector(`.error[data-for="${id}"]`);
    if (p) {
        p.textContent = msg || '';
        if (msg) {
            p.classList.add('is-visible');
        } else {
            p.classList.remove('is-visible');
        }
    }
  }
  function clearError(id){ showError(id, ''); }

  function required(id, label){
    const el = document.getElementById(id);
    if (!el) return true;
    if (!el.value || (el.type==='number' && String(el.value).trim()==='')) {
      showError(id, `${label}は必須です。`); return false;
    }
    clearError(id); return true;
  }
  function positiveInt(id, label){
    const el = document.getElementById(id);
    if (!el) return true;
    const v = Number(el.value);
    if (!Number.isInteger(v) || v < 0){
      showError(id, `${label}は0以上の整数で入力してください。`); return false;
    }
    clearError(id); return true;
  }

  ['title','category','unit','description','shipMethod','shipDays','status'].forEach(id=>{
    const el = document.getElementById(id);
    el && el.addEventListener('input', ()=> clearError(id));
    el && el.addEventListener('blur',  ()=> required(id, el.previousElementSibling?.textContent?.replace('*','').trim() || id));
  });
  const price = document.getElementById('price');
  price && price.addEventListener('input', ()=> clearError('price'));
  price && price.addEventListener('blur',  ()=> required('price','価格'));

  const stock = document.getElementById('stock');
  stock && stock.addEventListener('input', ()=> clearError('stock'));
  stock && stock.addEventListener('blur',  ()=> positiveInt('stock','在庫数'));

  // ===== 仕様・規格 追加/削除 =====
  const specs = document.getElementById('specs');
  const addSpec = document.getElementById('addSpec');
  addSpec && addSpec.addEventListener('click', ()=>{
    const i = specs.querySelectorAll('.kv__row').length;
    const row = document.createElement('div');
    row.className = 'kv__row';
    row.innerHTML = `
      <input type="text" name="specs[${i}][label]" placeholder="項目名（例：サイズ）">
      <input type="text" name="specs[${i}][value]" placeholder="値（例：M〜L）">
      <button type="button" class="icon-btn kv__del" title="削除">✕</button>
    `;
    specs.appendChild(row);
  });
  specs && specs.addEventListener('click', (e)=>{
    if (e.target.closest('.kv__del')) {
      e.preventDefault();
      const row = e.target.closest('.kv__row');
      if (row) row.remove();
      // name の連番を振り直す
      specs.querySelectorAll('.kv__row').forEach((row, idx)=>{
        const ins = row.querySelectorAll('input');
        if (ins[0]) ins[0].name = `specs[${idx}][label]`;
        if (ins[1]) ins[1].name = `specs[${idx}][value]`;
      });
    }
  });

  // ===== 画像アップロード（別ファイルに委譲） =====
  // 別ファイル /public/js/uploader-r2.js 側で window.initR2Uploader を定義している想定。
  // DOMのIDは既存のまま流用します（openPicker / uploaderInput / previewList / imageUrls / uploaderMsg / r2Uploader）。
  if (window.initR2Uploader) {
    window.initR2Uploader({
      openBtnId: 'openPicker',
      fileInputId: 'uploaderInput',
      listId: 'previewList',
      textareaId: 'imageUrls',
      msgId: 'uploaderMsg',
      max: parseInt(document.getElementById('r2Uploader')?.dataset.max || '8', 10)
    });
  }

  // 送信時：R2直アップロード後は imageUrls にURLが入る想定。フォーム送信は通常のまま。
  form && form.addEventListener('submit', (e)=>{
    // 必須チェック
    let ok = true;
    ok &= required('title','商品名');
    ok &= required('categoryId','カテゴリ');
    ok &= required('price','価格');
    ok &= required('unit','単位');
    ok &= positiveInt('stock','在庫数');
    ok &= required('description','商品説明');
    ok &= required('shipMethod','配送方法');
    ok &= required('shipDays','発送目安');
    ok &= required('status','ステータス');

    // 画像は textarea#imageUrls に1行1URLで格納される想定
    const ta = document.getElementById('imageUrls');
    const hasImages = !!(ta && ta.value && ta.value.trim());
    if (!hasImages){
      showError('imageUrls','商品画像を1枚以上追加してください。');
      ok = false;
    } else {
      clearError('imageUrls');
    }

    if (!ok){ e.preventDefault(); return; }
    // ここでは e.preventDefault() せず、通常送信（R2に既にアップ済みのURLをサーバが受け取る）
  });

  // 下書き保存（status を draft にして送信）
  function submitDraft(){
    const status = document.getElementById('status');
    if (status){ status.value = 'draft'; }
    if (form) {
      // 下書きは厳密な必須を緩めたい場合はここでバリデーション分岐も可
      form.requestSubmit();
    }
  }
  const saveDraft = document.getElementById('saveDraft');
  const sideSaveDraft = document.getElementById('sideSaveDraft');
  saveDraft && saveDraft.addEventListener('click', submitDraft);
  sideSaveDraft && sideSaveDraft.addEventListener('click', submitDraft);

  // 画像選択開くボタンのドラッグ演出
  const drop = document.getElementById('openPicker');
  const up  = document.getElementById('uploader');
  if (up && drop){
    ['dragenter','dragover'].forEach(ev=>{
      up.addEventListener(ev, ()=> drop.classList.add('is-drag'));
    });
    ['dragleave','drop'].forEach(ev=>{
      up.addEventListener(ev, ()=> drop.classList.remove('is-drag'));
    });
  }
})();
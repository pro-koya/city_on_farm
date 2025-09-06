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

  // ===== 画像アップロード（プレビュー・並び替え・削除） =====
  const openPicker = document.getElementById('openPicker');
  const inputImages = document.getElementById('images');
  const previewList = document.getElementById('previewList');
  const uploader = document.getElementById('uploader');
  const MAX = Number(uploader?.dataset?.max || 8);

  let files = []; // {file, id}

  function renderPreviews(){
    previewList.innerHTML = '';
    files.forEach((item, idx)=>{
      const li = document.createElement('li');
      li.className = 'preview';
      li.draggable = true;
      li.dataset.idx = idx;

      const url = URL.createObjectURL(item.file);
      li.innerHTML = `
        <img src="${url}" alt="商品画像 ${idx+1}">
        <div class="preview__tools">
          <button class="preview__btn" data-act="left">←</button>
          <span class="preview__btn" title="${idx===0?'サムネイル':''}">${idx===0?'★':(idx+1)}</span>
          <button class="preview__btn" data-act="right">→</button>
          <button class="preview__btn" data-act="del">削除</button>
        </div>
      `;
      previewList.appendChild(li);
    });
  }

  function pickFiles(list){
    const added = Array.from(list || []);
    const room = MAX - files.length;
    const take = added.slice(0, Math.max(0, room));
    if (!take.length) return;

    files = files.concat(take.map(f => ({ file:f, id:Math.random().toString(36).slice(2) })));
    renderPreviews();
    clearError('images');
  }

  openPicker && openPicker.addEventListener('click', ()=> inputImages && inputImages.click());
  inputImages && inputImages.addEventListener('change', (e)=> pickFiles(e.target.files));

  // D&D
  function prevent(e){ e.preventDefault(); e.stopPropagation(); }
  uploader && ['dragenter','dragover','dragleave','drop'].forEach(ev => {
    uploader.addEventListener(ev, prevent);
  });
  uploader && uploader.addEventListener('drop', (e)=> pickFiles(e.dataTransfer.files));

  // 並び替え/削除
  previewList && previewList.addEventListener('click', (e)=>{
    const li = e.target.closest('.preview');
    if (!li) return;
    const idx = Number(li.dataset.idx);
    const act = e.target.dataset.act;
    if (act === 'left' && idx > 0){
      const t = files[idx-1]; files[idx-1]=files[idx]; files[idx]=t; renderPreviews();
    } else if (act === 'right' && idx < files.length-1){
      const t = files[idx+1]; files[idx+1]=files[idx]; files[idx]=t; renderPreviews();
    } else if (act === 'del'){
      files.splice(idx,1); renderPreviews();
    }
  });

  // drag で並び替え
  let dragIdx = null;
  previewList && previewList.addEventListener('dragstart', (e)=>{
    const li = e.target.closest('.preview');
    if (!li) return;
    dragIdx = Number(li.dataset.idx);
    li.classList.add('dragover');
  });
  previewList && previewList.addEventListener('dragend', (e)=>{
    const li = e.target.closest('.preview');
    if (li) li.classList.remove('dragover');
    dragIdx = null;
  });
  previewList && previewList.addEventListener('dragover', (e)=>{
    e.preventDefault();
    const over = e.target.closest('.preview');
    if (!over) return;
    const overIdx = Number(over.dataset.idx);
    if (dragIdx===null || dragIdx===overIdx) return;
    const item = files.splice(dragIdx,1)[0];
    files.splice(overIdx,0,item);
    dragIdx = overIdx;
    renderPreviews();
  });

  // 送信時：files を FormData に積み直す（input[type=file] では並びが持てないため）
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
    if (files.length < 1){
      showError('images','商品画像を1枚以上追加してください。'); ok = false;
    }
    if (!ok){ e.preventDefault(); return; }

    // 通常の <input type=file multiple> は並び順を保持できないため、送信を差し替え
    e.preventDefault();
    const fd = new FormData(form);
    // 既存の images をクリア（ブラウザ依存で不要だが明示）
    fd.delete('images');
    files.forEach((item, idx)=>{
      fd.append('images', item.file, `image_${idx}.jpg`);
    });

    // fetch送信（HTML遷移が良ければこのまま form.submit() でもOK）
    fetch(form.action, {
      method: 'POST',
      body: fd
    }).then(async resp=>{
      if (resp.redirected) {
        window.location.href = resp.url; // 成功時: サーバ側が一覧/詳細へリダイレクト
        return;
      }
      const text = await resp.text();
      // 失敗時、簡易的に差し替え（本来は部分更新 or エラーメッセージ表示）
      document.open(); document.write(text); document.close();
    }).catch(()=> alert('送信に失敗しました。ネットワークをご確認ください。'));
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
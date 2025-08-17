(function(){
  const form = document.getElementById('signupForm');
  if (!form) return;

  // ===== 要素参照 =====
  const last   = document.getElementById('lastName');
  const first  = document.getElementById('firstName');
  const lastK  = document.getElementById('lastNameKana');
  const firstK = document.getElementById('firstNameKana');
  const emailEl= document.getElementById('email');
  const pwdEl  = document.getElementById('password');
  const pwd2El = document.getElementById('passwordConfirm');
  const agreeEl= document.getElementById('agree');
  const submitBtn = document.getElementById('submitBtn');
  const bar = document.getElementById('strengthBar');
  const autoBtn = document.getElementById('autoKanaBtn');

  // ===== UI: パスワード表示切替 =====
  document.querySelectorAll('.pwd .toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.previousElementSibling;
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  });

  // ===== かな補助（ひら→カタ） =====
  const hiraToKata = (s) => (s||'').replace(/[\u3041-\u3096]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60));
  const isKanaOnly = (s) => /^[\u3041-\u3096\u30A1-\u30FA\u30FC\u30F4ー－\s]+$/.test(s || '');

  function tryAutofillKana(){
    const l = (last.value || '').trim();
    const f = (first.value || '').trim();
    if (l && isKanaOnly(l)) lastK.value  = hiraToKata(l);
    if (f && isKanaOnly(f)) firstK.value = hiraToKata(f);
  }

  autoBtn && autoBtn.addEventListener('click', () => {
    tryAutofillKana();
    validate(); // 反映後だけ内部判定更新（表示は後述ルールに従う）
    // カナ欄を触った扱いにしてもよければ下記を有効化
    // touched.add(lastK.id); touched.add(firstK.id); renderErrors();
  });

  [last, first].forEach(el => {
    el.addEventListener('input', () => { tryAutofillKana(); validate(); renderErrors(); });
  });
  [lastK, firstK].forEach(el => {
    el.addEventListener('input', () => { el.value = hiraToKata(el.value); validate(); renderErrors(); });
  });

  // ===== パスワード強度メータ =====
  function scorePassword(p){
    let s = 0;
    if (!p) return 0;
    if (p.length >= 8) s++;
    if (/[A-Z]/.test(p)) s++;
    if (/[a-z]/.test(p)) s++;
    if (/\d/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return Math.min(s, 5);
  }
  function updateMeter(p){
    const sc = scorePassword(p);
    const pct = [0,20,40,65,85,100][sc];
    bar.style.width = pct + '%';
    bar.classList.remove('is-mid','is-strong');
    if (sc >= 3 && sc <= 4) bar.classList.add('is-mid');
    if (sc >= 5) bar.classList.add('is-strong');
  }

  // ===== “最初は非表示”のための仕組み =====
  // ・フィールドを一度でも触ったら touched に登録
  // ・submit 後は showAllErrors を立て、全エラーを表示
  const touched = new Set();
  let showAllErrors = false;

  // フォーカスが当たったら touched 扱いにする（input/blurどちらでもOK）
  form.querySelectorAll('input, select').forEach(el => {
    el.addEventListener('focus', () => { touched.add(el.id); });
    el.addEventListener('blur',  () => { touched.add(el.id); validate(); renderErrors(); });
    el.addEventListener('input', () => { validate(); renderErrors(); });
    el.addEventListener('change',()=> { validate(); renderErrors(); });
  });

  // ===== バリデーション（状態のみ更新） =====
  const state = {}; // { fieldId: { error: 'メッセージ' or '' } }

  function setFieldError(id, msg){
    state[id] = { error: msg || '' };
  }

  function validate(){
    // 初期化
    ['lastName','firstName','lastNameKana','firstNameKana','email','password','passwordConfirm','agree'].forEach(id=>{
      if (!state[id]) state[id] = { error: '' };
      else state[id].error = '';
    });

    // 姓名（必須）
    if (!last.value.trim())  setFieldError('lastName', '姓を入力してください');
    if (!first.value.trim()) setFieldError('firstName','名を入力してください');

    // カナ（全角カタカナ）
    const kanaRe = /^[\u30A1-\u30FA\u30FC\u30F4ー－]+$/;
    if (!kanaRe.test((lastK.value || '').trim()))  setFieldError('lastNameKana',  'セイは全角カタカナで入力してください');
    if (!kanaRe.test((firstK.value || '').trim())) setFieldError('firstNameKana', 'メイは全角カタカナで入力してください');

    // email
    const em = (emailEl.value || '').trim();
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!re.test(em)) setFieldError('email','正しいメールアドレスを入力してください');

    // password
    if ((pwdEl.value || '').length < 8) setFieldError('password','8文字以上で入力してください');
    if ((pwd2El.value || '') !== (pwdEl.value || '')) setFieldError('passwordConfirm','パスワードが一致しません');

    // 規約
    if (!agreeEl.checked) setFieldError('agree','チェックが必要です');

    // 強度メータ更新
    updateMeter(pwdEl.value || '');

    // 送信可否
    const hasError = Object.values(state).some(v => v.error);
    submitBtn.disabled = hasError;
    return !hasError;
  }

  // ===== エラー描画（touched または showAllErrors のときだけ表示） =====
  function renderErrors(){
    Object.entries(state).forEach(([id, { error }]) => {
      const holder = form.querySelector(`.error[data-error-for="${id}"]`);
      const input  = document.getElementById(id);
      if (!holder || !input) return;

      const shouldShow = showAllErrors || touched.has(id);
      if (error && shouldShow){
        holder.textContent = error;
        holder.classList.add('is-visible');
        input.setAttribute('aria-invalid','true');
      }else{
        holder.textContent = '';
        holder.classList.remove('is-visible');
        input.setAttribute('aria-invalid','false');
      }
    });
  }

  // 初期表示：エラー非表示
  updateMeter(pwdEl.value || '');
  validate();         // 内部状態だけ更新
  renderErrors();     // 何も表示しない（touched も showAllErrors も無い）

  // 送信時：全エラーを表示してブロック
  form.addEventListener('submit', (e) => {
    const ok = validate();
    if (!ok){
      e.preventDefault();
      showAllErrors = true;
      renderErrors();
      // 最初のエラーへフォーカス
      const firstBad = form.querySelector('[aria-invalid="true"]');
      firstBad && firstBad.focus();
    }
  });
})();
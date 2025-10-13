// /public/js/signup.js
(() => {
  const form = document.getElementById('signup-form');
  const btn  = document.getElementById('signupBtn');
  const requiredIds = ['name','email','password','passwordConfirm','agree'];

  if (!form) return;

  // エラーメッセージ制御（.error.is-visible で表示）
  function showError(id, msg) {
    const p = document.querySelector(`.error[data-for="${id}"]`);
    if (!p) return;
    p.textContent = msg || '';
    if (msg) p.classList.add('is-visible');
    else p.classList.remove('is-visible');
  }
  function clearError(id) { showError(id, ''); }

  // 各種バリデーション
  const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
  const isStrongPassword = (v) => {
    const s = String(v || '');
    const hasLower = /[a-z]/.test(s);
    const hasUpper = /[A-Z]/.test(s);
    const hasDigit = /\d/.test(s);
    const hasSymbol = /[^A-Za-z0-9]/.test(s); // 記号
    return s.length >= 8 && hasLower && hasUpper && hasDigit && hasSymbol;
  };

  // 各フィールド参照
  const nameEl = document.getElementById('name');
  const emailEl = document.getElementById('email');
  const pwEl = document.getElementById('password');
  const pwcEl = document.getElementById('passwordConfirm');
  const agreeEl = document.getElementById('agree');

  // —— サイレント判定用（メッセージを出さずに真偽だけ返す）——
  function okNameSilent() {
    const v = nameEl?.value?.trim() || '';
    return v && v.length <= 60;
  }
  function okEmailSilent() {
    const v = emailEl?.value || '';
    return !!v.trim() && isEmail(v);
  }
  function okPasswordSilent() {
    const v = pwEl?.value || '';
    return isStrongPassword(v);
  }
  function okPasswordConfirmSilent() {
    const v = pwEl?.value || '';
    const c = pwcEl?.value || '';
    return c === v && !!c;
  }
  function okAgreeSilent() {
    return !!agreeEl?.checked;
  }
  function isAllValidSilent() {
    return (
      okNameSilent() &&
      okEmailSilent() &&
      okPasswordSilent() &&
      okPasswordConfirmSilent() &&
      okAgreeSilent()
    );
  }

  // —— 活性/非活性の切替 —— 
  function updateSubmitState() {
    // すべての必須条件が満たされているかで切替
    btn.disabled = !isAllValidSilent();
  }

  function estimatePasswordLevel(pw) {
    const s = String(pw || '');
    if (!s) return { level: 0, percent: 0, label: '未入力' };

    // 基本ポイント：長さ
    let score = 0;
    if (s.length >= 8) score += 1;
    if (s.length >= 12) score += 1;
    if (s.length >= 16) score += 1;

    // 文字種
    const hasLower = /[a-z]/.test(s);
    const hasUpper = /[A-Z]/.test(s);
    const hasDigit = /\d/.test(s);
    const hasSymbol = /[^A-Za-z0-9]/.test(s);
    const varieties = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;
    score += Math.max(0, varieties - 1); // 0〜3点

    // ペナルティ（単純な繰り返し/連番）
    if (/(.)\1{2,}/.test(s)) score -= 1;             // 同一文字の連続
    if (/0123|1234|2345|3456|4567|5678|6789/.test(s)) score -= 1;
    if (/abcd|bcde|cdef|defg|efgh|fghi|ghij/i.test(s)) score -= 1;

    // 0〜4 に丸め
    let level = Math.max(0, Math.min(4, score));
    // ラベル
    const labels = ['とても弱い', '弱い', 'ふつう', '強い', 'とても強い'];
    // パーセント（見た目用）
    const percent = [10, 30, 55, 80, 100][level];

    return { level, percent, label: labels[level] };
  }

  function updatePwMeter(pw) {
    const meter = document.getElementById('pwMeter');
    const bar   = document.getElementById('pwBar');
    const label = document.getElementById('pwLabel');
    const track = meter?.querySelector('.pw-meter__track');

    if (!meter || !bar || !label || !track) return;

    if (!pw) {
      meter.classList.remove('is-visible');
      meter.setAttribute('aria-hidden', 'true');
      track.setAttribute('aria-valuenow', '0');
      bar.style.width = '0%';
      label.textContent = '強度: -';
      meter.dataset.level = '0';
      return;
    }

    const { level, percent, label: text } = estimatePasswordLevel(pw);
    meter.classList.add('is-visible');
    meter.setAttribute('aria-hidden', 'false');
    meter.dataset.level = String(level);
    bar.style.width = `${percent}%`;
    track.setAttribute('aria-valuenow', String(level));
    label.textContent = `強度: ${text}`;
  }

  // 既存のイベントを少し拡張
  pwEl?.addEventListener('input', () => {
    updatePwMeter(pwEl.value);     // ★ 追記：強度ゲージを更新
    validatePassword();            // 既存の強度要件（大/小/数/記号）チェック
  });

  // 初期化（再表示時など）
  updatePwMeter(pwEl?.value || '');

  // 単項目チェック（メッセージ付き）
  function validateName() {
    const v = nameEl?.value || '';
    if (!v.trim()) { showError('name', 'お名前を入力してください。'); updateSubmitState(); return false; }
    if (v.trim().length > 60) { showError('name', 'お名前は60文字以内で入力してください。'); updateSubmitState(); return false; }
    clearError('name'); updateSubmitState(); return true;
  }

  function validateEmail() {
    const v = emailEl?.value || '';
    if (!v.trim()) { showError('email', 'メールアドレスを入力してください。'); updateSubmitState(); return false; }
    if (!isEmail(v)) { showError('email', '正しいメールアドレスの形式で入力してください。'); updateSubmitState(); return false; }
    clearError('email'); updateSubmitState(); return true;
  }

  function validatePassword() {
    const v = pwEl?.value || '';
    if (!isStrongPassword(v)) {
      showError('password', '8文字以上で「英小文字・英大文字・数字・記号」をすべて含めてください。');
      updateSubmitState(); 
      return false;
    }
    clearError('password'); 
    // 確認用も同時再検証（利便性）
    if (pwcEl?.value) validatePasswordConfirm();
    updateSubmitState();
    return true;
  }

  function validatePasswordConfirm() {
    const v = pwEl?.value || '';
    const c = pwcEl?.value || '';
    if (c !== v) { showError('passwordConfirm', '確認用パスワードが一致しません。'); updateSubmitState(); return false; }
    if (!c) { showError('passwordConfirm', '確認用パスワードを入力してください。'); updateSubmitState(); return false; }
    clearError('passwordConfirm'); updateSubmitState(); return true;
  }

  function validateAgree() {
    if (!agreeEl?.checked) { showError('agree', '利用規約・プライバシーポリシーに同意してください。'); updateSubmitState(); return false; }
    clearError('agree'); updateSubmitState(); return true;
  }

  // イベント（リアルタイム&フォーカスアウト）
  nameEl?.addEventListener('input', () => { clearError('name'); updateSubmitState(); });
  nameEl?.addEventListener('blur', validateName);

  emailEl?.addEventListener('input', () => { clearError('email'); updateSubmitState(); });
  emailEl?.addEventListener('blur', validateEmail);

  pwEl?.addEventListener('input', () => { validatePassword(); });
  pwEl?.addEventListener('blur', validatePassword);

  pwcEl?.addEventListener('input', () => { validatePasswordConfirm(); });
  pwcEl?.addEventListener('blur', validatePasswordConfirm);

  agreeEl?.addEventListener('change', validateAgree);

  // 送信時の総合チェック
  form.addEventListener('submit', (e) => {
    const ok =
      validateName() &
      validateEmail() &
      validatePassword() &
      validatePasswordConfirm() &
      validateAgree();
    if (!ok) {
      e.preventDefault();
      const firstErr = document.querySelector('.error.is-visible');
      if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  // 初期状態（非活性を維持）
  updateSubmitState();

    // === 取引先 UI 切替 ===
  const selExisting  = document.getElementById('partnerId');
  const inpName      = document.getElementById('partnerName');

  // フィールド用のエラーメッセージ表示（衝突回避のため別名）
  function showFieldError(id, msg){
    const p = form.querySelector(`.error[data-for="${id}"]`);
    if (!p) return;
    p.textContent = msg || '';
    if (msg) p.classList.add('is-visible');
    else p.classList.remove('is-visible');
  }

  // 郵便番号の整形は、要素があるときだけ設定（なければ return しない！）
  (function setupPostal(){
    const postal = document.getElementById('partnerPostal');
    if (!postal) return;
    const toHankaku = (s) => s.replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
    function normalize() {
      let v = toHankaku(postal.value || '');
      v = v.replace(/[^\d]/g, '');
      if (v.length > 7) v = v.slice(0,7);
      if (v.length >= 4) v = v.slice(0,3) + '-' + v.slice(3);
      postal.value = v;
    }
    postal.addEventListener('blur', normalize);
    postal.addEventListener('input', () => { postal.value = toHankaku(postal.value || ''); });
  })();

  // 送信直前の軽いチェック（postal が無くても効くように、この位置で必ず登録）
  form.addEventListener('submit', (e) => {
    const v = form.querySelector('input[name="partnerChoice"]:checked')?.value || 'none';
    let ok = true;

    if (v === 'existing') {
      if (!selExisting?.value) { showFieldError('partnerId', '既存の取引先を選択してください。'); ok = false; }
      else { showFieldError('partnerId', ''); }
    } else if (v === 'new') {
      const name = inpName?.value?.trim();
      if (!name) { showFieldError('partnerName', '取引先名を入力してください。'); ok = false; }
      else { showFieldError('partnerName', ''); }
    }

    if (!ok) {
      e.preventDefault();
      const firstErr = form.querySelector('.error.is-visible');
      firstErr?.scrollIntoView({ behavior:'smooth', block:'center' });
    }
  });
})();
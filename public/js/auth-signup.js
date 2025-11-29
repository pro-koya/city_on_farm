// /public/js/auth-signup.js
(() => {
  const form = document.getElementById('signup-form');
  const btn  = document.getElementById('signupBtn');
  if (!form || !btn) return;

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const lastnameEl  = $('#firstname');
  const firstnameEl  = $('#lastname');
  const emailEl = $('#email');
  const pwEl    = $('#password');
  const pwcEl   = $('#passwordConfirm');
  const agreeEl = $('#agree');

  const corpFields = $('#corpFields');
  const accTypeRadios = $$('input[name="account_type"]');

  const partnerNameEl       = $('#partnerName');
  const partnerPhoneEl      = $('#partnerPhone');
  const partnerPostalEl     = $('#partnerPostal');
  const partnerPrefEl       = $('#partnerPrefecture');
  const partnerCityEl       = $('#partnerCity');
  const partnerAddress1El   = $('#partnerAddress1');

  // ===== エラー表示 =====
  function showError(id, msg) {
    const p = document.querySelector(`.error[data-for="${id}"]`);
    if (!p) return;
    p.textContent = msg || '';
    if (msg) p.classList.add('is-visible');
    else p.classList.remove('is-visible');
  }
  function clearError(id) { showError(id, ''); }

  // ===== 判定ヘルパ =====
  const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
  const isStrongPassword = (v) => {
    const s = String(v || '');
    const hasLower  = /[a-z]/.test(s);
    const hasUpper  = /[A-Z]/.test(s);
    const hasDigit  = /\d/.test(s);
    const hasSymbol = /[^A-Za-z0-9]/.test(s);
    return s.length >= 8 && hasLower && hasUpper && hasDigit && hasSymbol;
  };
  const isCorporate = () =>
    (document.querySelector('input[name="account_type"]:checked')?.value === 'corporate');

  // ===== パスワードメーター =====
  function estimatePasswordLevel(pw) {
    const s = String(pw || '');
    if (!s) return { level: 0, percent: 0, label: '未入力' };
    let score = 0;
    if (s.length >= 8)  score += 1;
    if (s.length >= 12) score += 1;
    if (s.length >= 16) score += 1;

    const hasLower = /[a-z]/.test(s);
    const hasUpper = /[A-Z]/.test(s);
    const hasDigit = /\d/.test(s);
    const hasSymbol = /[^A-Za-z0-9]/.test(s);
    const varieties = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;
    score += Math.max(0, varieties - 1);

    if (/(.)\1{2,}/.test(s)) score -= 1;
    if (/0123|1234|2345|3456|4567|5678|6789/.test(s)) score -= 1;
    if (/abcd|bcde|cdef|defg|efgh|fghi|ghij/i.test(s)) score -= 1;

    let level = Math.max(0, Math.min(4, score));
    const labels = ['とても弱い', '弱い', 'ふつう', '強い', 'とても強い'];
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

  // ===== 単項目サイレント判定（ボタン活性用） =====
  function okLastNameSilent() {
    const v = lastnameEl?.value?.trim() || '';
    return v && v.length <= 60;
  }
  function okFirstNameSilent() {
    const v = firstnameEl?.value?.trim() || '';
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
    // サブミットボタンの活性条件（法人の取引先部分までは見ない）
    return (
      okLastNameSilent() &&
      okFirstNameSilent() &&
      okEmailSilent() &&
      okPasswordSilent() &&
      okPasswordConfirmSilent() &&
      okAgreeSilent()
    );
  }

  function updateSubmitState() {
    btn.disabled = !isAllValidSilent();
  }

  // ===== フィールドごとのバリデーション（エラー表示付き） =====
  function validateLastName() {
    const v = lastnameEl?.value || '';
    if (!v.trim()) { showError('lastname', '姓を入力してください。'); updateSubmitState(); return false; }
    if (v.trim().length > 60) { showError('lastname', '姓は30文字以内で入力してください。'); updateSubmitState(); return false; }
    clearError('lastname'); updateSubmitState(); return true;
  }
  function validateFirstName() {
    const v = firstnameEl?.value || '';
    if (!v.trim()) { showError('firstname', '名を入力してください。'); updateSubmitState(); return false; }
    if (v.trim().length > 60) { showError('firstname', '名は30文字以内で入力してください。'); updateSubmitState(); return false; }
    clearError('firstname'); updateSubmitState(); return true;
  }

  function validateEmail() {
    const v = emailEl?.value || '';
    if (!v.trim()) { showError('email', 'メールアドレスを入力してください。'); updateSubmitState(); return false; }
    if (!isEmail(v)) { showError('email', '正しいメールアドレスの形式で入力してください。'); updateSubmitState(); return false; }
    clearError('email'); updateSubmitState(); return true;
  }

  function validatePassword() {
    const v = pwEl?.value || '';
    updatePwMeter(v);
    if (!isStrongPassword(v)) {
      showError('password', '8文字以上で「英小文字・英大文字・数字・記号」をすべて含めてください。');
      updateSubmitState();
      return false;
    }
    clearError('password');
    if (pwcEl?.value) validatePasswordConfirm();
    updateSubmitState();
    return true;
  }

  function validatePasswordConfirm() {
    const v = pwEl?.value || '';
    const c = pwcEl?.value || '';
    if (!c) { showError('passwordConfirm', '確認用パスワードを入力してください。'); updateSubmitState(); return false; }
    if (c !== v) { showError('passwordConfirm', '確認用パスワードが一致しません。'); updateSubmitState(); return false; }
    clearError('passwordConfirm'); updateSubmitState(); return true;
  }

  function validateAgree() {
    if (!agreeEl?.checked) { showError('agree', '利用規約・プライバシーポリシーに同意してください。'); updateSubmitState(); return false; }
    clearError('agree'); updateSubmitState(); return true;
  }

  // 法人のときの簡易チェック（サーバ側が最終判定）
  function validateCorporateFields() {
    if (!isCorporate()) return true; // 個人はスキップ

    let ok = true;

    const name = partnerNameEl?.value?.trim() || '';
    if (!name) {
      showError('partnerName', '取引先名を入力してください。');
      ok = false;
    } else {
      clearError('partnerName');
    }

    const phone = partnerPhoneEl?.value?.trim() || '';
    if (!phone) {
      showError('partnerPhone', '電話番号を入力してください。');
      ok = false;
    } else {
      clearError('partnerPhone');
    }

    const postal = partnerPostalEl?.value?.trim() || '';
    if (!postal) {
      showError('partnerPostal', '郵便番号を入力してください。');
      ok = false;
    } else {
      clearError('partnerPostal');
    }

    const pref = partnerPrefEl?.value?.trim() || '';
    if (!pref) {
      showError('partnerPrefecture', '都道府県を選択してください。');
      ok = false;
    } else {
      clearError('partnerPrefecture');
    }

    const city = partnerCityEl?.value?.trim() || '';
    if (!city) {
      showError('partnerCity', '市区町村を入力してください。');
      ok = false;
    } else {
      clearError('partnerCity');
    }

    const addr1 = partnerAddress1El?.value?.trim() || '';
    if (!addr1) {
      showError('partnerAddress1', '番地を入力してください。');
      ok = false;
    } else {
      clearError('partnerAddress1');
    }

    return ok;
  }

  // ===== アカウント種別変更時の法人ブロック表示切替 =====
  function updateCorpVisibility() {
    if (!corpFields) return;
    if (isCorporate()) {
      corpFields.hidden = false;
    } else {
      corpFields.hidden = true;
      // 個人に戻したときは法人エラーを消しておく
      ['partnerName','partnerPhone','partnerPostal','partnerPrefecture','partnerCity','partnerAddress1','partnerAddress2']
        .forEach(clearError);
    }
  }

  accTypeRadios.forEach(r => {
    r.addEventListener('change', () => {
      updateCorpVisibility();
      clearError('account_type');
    });
  });
  updateCorpVisibility();

  // ===== 郵便番号の整形 =====
  (function setupPostal() {
    if (!partnerPostalEl) return;
    const toHankaku = (s) => s.replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
    function normalize() {
      let v = toHankaku(partnerPostalEl.value || '');
      v = v.replace(/[^\d]/g, '');
      if (v.length > 7) v = v.slice(0, 7);
      if (v.length >= 4) v = v.slice(0, 3) + '-' + v.slice(3);
      partnerPostalEl.value = v;
    }
    partnerPostalEl.addEventListener('blur', normalize);
    partnerPostalEl.addEventListener('input', () => {
      partnerPostalEl.value = toHankaku(partnerPostalEl.value || '');
    });
  })();

  // ===== イベント登録 =====
  firstnameEl?.addEventListener('input', () => { clearError('firstname'); updateSubmitState(); });
  firstnameEl?.addEventListener('blur', validateFirstName);

  lastnameEl?.addEventListener('input', () => { clearError('lastname'); updateSubmitState(); });
  lastnameEl?.addEventListener('blur', validateLastName);

  emailEl?.addEventListener('input', () => { clearError('email'); updateSubmitState(); });
  emailEl?.addEventListener('blur', validateEmail);

  pwEl?.addEventListener('input', () => { validatePassword(); });
  pwEl?.addEventListener('blur', validatePassword);
  updatePwMeter(pwEl?.value || '');

  pwcEl?.addEventListener('input', () => { validatePasswordConfirm(); });
  pwcEl?.addEventListener('blur', validatePasswordConfirm);

  agreeEl?.addEventListener('change', validateAgree);

  // パスワード表示/非表示
  const togglePwBtn = document.getElementById('togglePw');
  togglePwBtn?.addEventListener('click', () => {
    if (!pwEl) return;
    const type = pwEl.type === 'password' ? 'text' : 'password';
    pwEl.type = type;
    if (pwcEl) pwcEl.type = type;
    togglePwBtn.textContent = (type === 'password') ? '表示' : '非表示';
  });

  // ===== 送信時の総合チェック =====
  form.addEventListener('submit', (e) => {
    let ok = true;
    if (!validateLastName()) ok = false;
    if (!validateFirstName()) ok = false;
    if (!validateEmail()) ok = false;
    if (!validatePassword()) ok = false;
    if (!validatePasswordConfirm()) ok = false;
    if (!validateAgree()) ok = false;
    if (!validateCorporateFields()) ok = false;

    if (!ok) {
      e.preventDefault();
      const firstErr = document.querySelector('.error.is-visible');
      if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    // 二重送信防止
    btn.disabled = true;
    btn.textContent = '送信中…';
  });

  // 初期状態
  updateSubmitState();
})();
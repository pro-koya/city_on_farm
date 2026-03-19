(function(){
  const form = document.getElementById('loginForm');
  if (!form) return;

  const emailEl = document.getElementById('email');
  const pwdEl   = document.getElementById('password');
  const remember= document.getElementById('remember');
  const btn     = document.getElementById('loginBtn');

  // パスワード表示切替（SVGアイコン対応）
  const eyeOpenSVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  const eyeClosedSVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

  document.querySelectorAll('.pwd .toggle').forEach(toggleBtn => {
    toggleBtn.addEventListener('click', () => {
      const input = toggleBtn.closest('.pwd').querySelector('input');
      if (!input) return;
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      toggleBtn.innerHTML = isPassword ? eyeClosedSVG : eyeOpenSVG;
      toggleBtn.setAttribute('aria-label', isPassword ? 'パスワードを非表示' : 'パスワードを表示');
    });
  });

  // Remember Me（メールのみ保存）
  const KEY = 'cof.auth.email';
  try{
    const saved = localStorage.getItem(KEY);
    if (saved) {
      emailEl.value = saved;
    }
  }catch(e){}

  // touched / showAllErrors
  const touched = new Set();
  let showAllErrors = false;

  [emailEl, pwdEl].forEach(el => {
    if (!el) return;
    el.addEventListener('focus', () => touched.add(el.id));
    el.addEventListener('blur',  () => { touched.add(el.id); validate(); render(); });
    el.addEventListener('input', () => { validate(); render(); });
  });

  // バリデーション
  const state = { email:{error:''}, password:{error:''} };
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validate(){
    state.email.error = '';
    state.password.error = '';

    const em = (emailEl.value || '').trim();
    if (!em) state.email.error = 'メールアドレスを入力してください';
    else if (!emailRe.test(em)) state.email.error = '正しいメールアドレスを入力してください';

    const pw = pwdEl.value || '';
    if (!pw) state.password.error = 'パスワードを入力してください';
    else if (pw.length < 8) state.password.error = '8文字以上で入力してください';

    const hasError = !!(state.email.error || state.password.error);
    btn.disabled = hasError;
    return !hasError;
  }

  function render(){
    ['email', 'password'].forEach(id => {
      const holder = form.querySelector(`.error[data-error-for="${id}"]`);
      const input = document.getElementById(id);
      const err = state[id].error;
      const show = showAllErrors || touched.has(id);
      if (holder){
        if (err && show){
          holder.textContent = err;
          holder.classList.add('is-visible');
          if (input) input.setAttribute('aria-invalid','true');
        }else{
          holder.textContent = '';
          holder.classList.remove('is-visible');
          if (input) input.setAttribute('aria-invalid','false');
        }
      }
    });
  }

  // 初期描画
  validate(); render();

  // 送信時：エラーがあれば全表示
  form.addEventListener('submit', (e) => {
    if (!validate()){
      e.preventDefault();
      showAllErrors = true;
      render();
      const firstBad = form.querySelector('[aria-invalid="true"]');
      firstBad && firstBad.focus();
      return;
    }
    // Remember Me（メールのみ保存）
    try{
      localStorage.setItem(KEY, (emailEl.value || '').trim());
    }catch(e){}
  });
})();
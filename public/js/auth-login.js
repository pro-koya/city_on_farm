(function(){
  const form = document.getElementById('loginForm');
  if (!form) return;

  const emailEl = document.getElementById('email');
  const pwdEl   = document.getElementById('password');
  const remember= document.getElementById('remember');
  const btn     = document.getElementById('loginBtn');

  // パスワード表示切替
  document.querySelectorAll('.pwd .toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.previousElementSibling;
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  });

  // Remember Me（メールのみ保存）
  const KEY = 'cof.auth.email';
  try{
    const saved = localStorage.getItem(KEY);
    if (saved) {
      emailEl.value = saved;
      remember.checked = true;
    }
  }catch(e){}

  // touched / showAllErrors
  const touched = new Set();
  let showAllErrors = false;

  [emailEl, pwdEl, remember].forEach(el => {
    el.addEventListener('focus', () => touched.add(el.id));
    el.addEventListener('blur',  () => { touched.add(el.id); validate(); render(); });
    el.addEventListener('input', () => { validate(); render(); });
    el.addEventListener('change',() => { validate(); render(); });
  });

  // バリデーション
  const state = { email:{error:''}, password:{error:''} };
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validate(){
    state.email.error = '';
    state.password.error = '';

    const em = (emailEl.value || '').trim();
    if (!emailRe.test(em)) state.email.error = '正しいメールアドレスを入力してください';

    const pw = pwdEl.value || '';
    if (!pw) state.password.error = 'パスワードを入力してください';
    else if (pw.length < 8) state.password.error = '8文字以上で入力してください';

    const hasError = !!(state.email.error || state.password.error);
    btn.disabled = hasError;
    return !hasError;
  }

  function render(){
    [
      ['email', emailEl],
      ['password', pwdEl],
    ].forEach(([id, input]) => {
      const holder = form.querySelector(`.error[data-error-for="${id}"]`);
      const err = state[id].error;
      const show = showAllErrors || touched.has(input.id);
      if (holder){
        if (err && show){
          holder.textContent = err;
          holder.classList.add('is-visible');
          input.setAttribute('aria-invalid','true');
        }else{
          holder.textContent = '';
          holder.classList.remove('is-visible');
          input.setAttribute('aria-invalid','false');
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
    // Remember Me（メールのみ保存/削除）
    try{
      if (remember.checked) localStorage.setItem(KEY, (emailEl.value || '').trim());
      else localStorage.removeItem(KEY);
    }catch(e){}
  });
})();
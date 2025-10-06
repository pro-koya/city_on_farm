(function(){
  const $ = (s, r=document) => r.querySelector(s);

  // 目アイコンで表示/非表示
  document.addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-toggle]');
    if (!btn) return;
    const id = btn.getAttribute('data-toggle');
    const input = $('#'+id);
    if (!input) return;
    input.type = (input.type === 'password') ? 'text' : 'password';
  });

  // 強度：超簡易スコア
  const pw  = $('#pw');
  const pw2 = $('#pw2');
  const hint = $('#pwStrength');

  function score(s){
    let sc = 0;
    if (!s) return 0;
    if (s.length >= 8) sc += 1;
    if (/[a-z]/.test(s)) sc += 1;
    if (/[A-Z]/.test(s)) sc += 1;
    if (/\d/.test(s))    sc += 1;
    if (/[^A-Za-z0-9]/.test(s)) sc += 1;
    return sc;
  }

  function render(){
    const s = score(pw.value);
    const ok = (s >= 4);
    const same = pw.value && pw.value === pw2.value;

    let msg = '';
    if (!ok) msg = '8文字以上・英大小・数字・記号を含めてください。';
    else if (!same) msg = '確認用パスワードが一致していません。';
    else msg = '安全なパスワードです。';

    hint.textContent = msg;
    hint.style.color = (ok && same) ? '#4C6B5C' : '#6b7280';
  }

  ['input','blur'].forEach(ev => {
    pw?.addEventListener(ev, render);
    pw2?.addEventListener(ev, render);
  });
})();
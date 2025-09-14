(() => {
  const form = document.getElementById('confirmForm');
  const place = document.getElementById('placeOrder');

  if (!form || !place) return;

  // 二重送信ガード＆UX向上
  form.addEventListener('submit', (e) => {
    // 簡易バリデーション（サーバでも最終確認します）
    place.disabled = true;
    place.textContent = '処理中...';
    // 3.5秒で予防的に解除（失敗時フォールバック）
    setTimeout(() => {
      place.disabled = false;
      place.textContent = 'この内容で注文する';
    }, 3500);
  });
})();
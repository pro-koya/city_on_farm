(() => {
  const $ = (s, r=document) => r.querySelector(s);

  // 領収書印刷
  $('#printReceipt')?.addEventListener('click', () => {
    window.print();
  });

  // 注文番号コピー
  $('#copyOrderNo')?.addEventListener('click', async () => {
    const no = $('#orderNo')?.textContent?.trim();
    if (!no) return;
    try {
      await navigator.clipboard.writeText(no);
      showToast('注文番号をコピーしました');
    } catch {
      showToast('コピーに失敗しました');
    }
  });

  // 軽量トースト
  function showToast(msg) {
    let el = $('#toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.style.position = 'fixed';
      el.style.left = '50%';
      el.style.bottom = '24px';
      el.style.transform = 'translateX(-50%)';
      el.style.background = 'rgba(0,0,0,.8)';
      el.style.color = '#fff';
      el.style.padding = '10px 14px';
      el.style.borderRadius = '8px';
      el.style.zIndex = '9999';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    setTimeout(()=> el.style.opacity = '0', 1500);
  }

  // 完了時のクリーンアップ（クライアント側）
  try {
    // もしクライアント側に checkoutDraft や selection を持っていたら削除
    sessionStorage.removeItem('checkoutDraft');
    sessionStorage.removeItem('cartSelection');
  } catch {}

  // 簡易イベント送信（任意）
  try {
    window.dispatchEvent(new CustomEvent('order:completed', {
      detail: { orderId: window.__CK__?.orderId, orderNo: window.__CK__?.orderNo }
    }));
  } catch {}
})();
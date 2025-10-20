(() => {
  const form = document.querySelector('.toolbar');
  if (!form) return;

  // SP ではセレクト変更で自動送信（タップ数削減）
  const statusSel = document.getElementById('sStatus');
  const typeSel   = document.getElementById('sType');
  const isMobile  = () => matchMedia('(max-width: 840px)').matches;

  function autoSubmitOnMobile(e){
    if (isMobile()) form.requestSubmit?.(); // ない環境は普通の submit と同じ
  }
  statusSel?.addEventListener('change', autoSubmitOnMobile);
  typeSel?.addEventListener('change', autoSubmitOnMobile);

  // 検索欄で Enter 送信 & クリアボタンはEJS側でリンク化済み
  // ここでは特別な処理不要
})();
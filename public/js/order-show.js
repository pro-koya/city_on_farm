(() => {
  const printBtn = document.getElementById('printPage');
  printBtn?.addEventListener('click', () => window.print());

  // status → rank マッピング
  // pending→0, processing/paid→1, shipped→2, delivered→3, canceled→0
  const mapRank = (s) => {
    switch ((s || '').toLowerCase()) {
      case 'paid':
      case 'processing':
        return 1;
      case 'shipped':
        return 2;
      case 'delivered':
        return 3;
      default:
        return 0;
    }
  };

  const progress = document.querySelector('.progress.progress--sfpath');
  if (progress && !progress.className.match(/\bis-step-/)) {
    // is-step-N のクラスが無ければ rank から見た目を補正
    const statusEl = document.querySelector('.status');
    const status = statusEl?.className?.match(/status--([a-z_]+)/)?.[1] || '';
    const r = mapRank(status);

    const lis = [...progress.querySelectorAll('li')];
    lis.forEach((li, i) => {
      li.classList.remove('is-done', 'is-active');
      if (i < r) li.classList.add('is-done');
      if (i === r) li.classList.add('is-active');
    });
  }

  // 領収書宛名入力モーダル
  const modal = document.getElementById('receiptNameModal');
  const showInvoiceBtn = document.getElementById('showInvoiceBtn');
  const receiptNameForm = document.getElementById('receiptNameForm');
  const receiptNameInput = document.getElementById('receipt_name_input');
  const receiptNameError = document.getElementById('receiptNameError');
  const cancelBtn = document.getElementById('cancelReceiptNameBtn');
  const closeBtn = modal?.querySelector('.modal__close');
  const orderNo = window.location.pathname.match(/\/orders\/([^\/]+)/)?.[1];

  function openModal() {
    if (modal) {
      modal.style.display = 'flex';
      modal.setAttribute('aria-hidden', 'false');
      receiptNameInput?.focus();
    }
  }

  function closeModal() {
    if (modal) {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
      receiptNameError.style.display = 'none';
      receiptNameForm?.reset();
    }
  }

  showInvoiceBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    openModal();
  });

  cancelBtn?.addEventListener('click', closeModal);
  closeBtn?.addEventListener('click', closeModal);

  // オーバーレイクリックで閉じる
  modal?.querySelector('.modal__overlay')?.addEventListener('click', closeModal);

  // ESCキーで閉じる
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal?.style.display === 'flex') {
      closeModal();
    }
  });

  // フォーム送信
  receiptNameForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const receiptName = receiptNameInput.value.trim();
    
    // バリデーション
    if (receiptName.length === 0 || receiptName.length > 40) {
      receiptNameError.textContent = '宛名は1〜40文字で入力してください';
      receiptNameError.style.display = 'block';
      return;
    }

    receiptNameError.style.display = 'none';

    try {
      // CSRFトークンを取得
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || 
                        document.querySelector('input[name="_csrf"]')?.value;

      const response = await fetch(`/orders/${orderNo}/receipt-name`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken && { 'X-CSRF-Token': csrfToken })
        },
        body: JSON.stringify({ receipt_name: receiptName })
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.message || '宛名の保存に失敗しました');
      }

      // 成功したら領収書を開く
      closeModal();
      window.open(`/orders/${orderNo}/invoice.pdf`, '_blank');
    } catch (error) {
      receiptNameError.textContent = error.message || 'エラーが発生しました';
      receiptNameError.style.display = 'block';
    }
  });

  // 納品書ボタン
  const showDeliveryNoteBtn = document.getElementById('showDeliveryNoteBtn');
  showDeliveryNoteBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    if (orderNo) {
      // 納品書を別タブで開く（価格非表示）
      // 価格を表示したい場合は ?showPrice=1 を追加
      window.open(`/orders/${orderNo}/delivery-note.pdf`, '_blank');
    }
  });
})();
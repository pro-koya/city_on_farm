(() => {
  const copyBtn = document.getElementById('copyTicket');
  const ticket = document.getElementById('ticketNo');

  if (copyBtn && ticket) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(ticket.textContent.trim());
        copyBtn.textContent = 'コピーしました';
        copyBtn.disabled = true;
        setTimeout(() => {
          copyBtn.textContent = 'コピー';
          copyBtn.disabled = false;
        }, 1600);
      } catch (e) {
        // フォールバック
        const r = document.createRange();
        r.selectNode(ticket);
        const sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(r);
        document.execCommand('copy');
        sel.removeAllRanges();
        copyBtn.textContent = 'コピーしました';
        setTimeout(() => (copyBtn.textContent = 'コピー'), 1600);
      }
    });
  }
})();
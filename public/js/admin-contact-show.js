(() => {
  const chatForm   = document.getElementById('adminChatForm');
  const chatBody   = document.getElementById('chatBody');
  const chatThread = document.getElementById('chatThread');
  const chatMsg    = document.getElementById('chatMsg');
  const chatBtn    = document.getElementById('chatSubmit');

  const statusForm  = document.getElementById('statusForm');
  const statusSel   = document.getElementById('status');
  const statusMsg   = document.getElementById('statusMsg');
  const statusBtn   = document.getElementById('statusSubmit');
  const badge       = document.getElementById('statusBadge');
  const badgeInline = document.getElementById('statusBadgeInline');

  function showToast(message) {
    let el = document.getElementById('contactToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'contactToast';
      document.body.appendChild(el);
    }
    el.textContent = message || '';
    el.style.opacity = '1';
    setTimeout(() => { el.style.opacity = '0'; }, 1600);
  }

  function setStatusMessage(text, ok = true) {
    if (!statusMsg) return;
    statusMsg.textContent = text || '';
    statusMsg.classList.remove('ok', 'err');
    if (!text) return;
    statusMsg.classList.add(ok ? 'ok' : 'err');
  }

  function setChatMessage(text, ok = true) {
    if (!chatMsg) return;
    chatMsg.textContent = text || '';
    chatMsg.classList.remove('ok', 'err');
    if (!text) return;
    chatMsg.classList.add(ok ? 'ok' : 'err');
  }

  function jaStatusLabel(v) {
    switch (v) {
      case 'open':        return '未対応';
      case 'in_progress': return '対応中';
      case 'closed':      return '完了';
      default:            return v || '';
    }
  }

  function updateStatusBadges(v) {
    const label = jaStatusLabel(v);
    [badge, badgeInline].forEach(el => {
      if (!el) return;
      el.textContent = label;
      el.className = 'status status--' + v;
    });
  }

  // ===== 状態更新（Ajax） =====
  if (statusForm && statusSel && statusBtn) {
    const csrf = statusForm.querySelector('input[name="_csrf"]')?.value || '';
    const action = statusForm.getAttribute('action');

    statusForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const next = statusSel.value;

      setStatusMessage('更新中…', true);
      statusBtn.disabled = true;

      try {
        const res = await fetch(action, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
            'CSRF-Token': csrf
          },
          body: new URLSearchParams({ status: next }).toString()
        });

        if (!res.ok) {
          const t = await res.text();
          throw new Error(t || ('HTTP ' + res.status));
        }
        const data = await res.json().catch(() => ({}));
        if (data && data.ok === false) {
          throw new Error(data.message || '更新に失敗しました。');
        }

        updateStatusBadges(next);
        setStatusMessage('状態を更新しました。', true);
        showToast('状態を更新しました');
      } catch (err) {
        console.error(err);
        setStatusMessage('更新に失敗しました。時間をおいて再度お試しください。', false);
        showToast('更新に失敗しました');
      } finally {
        statusBtn.disabled = false;
      }
    });
  }

  // ===== チャット送信 =====
  if (chatForm && chatBody && chatThread && chatBtn) {
    const csrf      = chatForm.querySelector('input[name="_csrf"]')?.value || '';
    const contactId = chatForm.dataset.contactId;

    function appendAdminMessage(m) {
      const el = document.createElement('div');
      el.className = 'msg msg--admin';
      const timeStr = m.created_at
        ? new Date(m.created_at).toLocaleString('ja-JP')
        : new Date().toLocaleString('ja-JP');
      el.innerHTML = `
        <div class="msg__meta">
          <span class="msg__name">サポート</span>
          <time class="msg__time">${timeStr}</time>
        </div>
        <div class="msg__body"></div>
      `;
      el.querySelector('.msg__body').textContent = m.body || '';
      chatThread.appendChild(el);
      chatThread.scrollTop = chatThread.scrollHeight;
    }

    // Enter = 送信, Shift+Enter = 改行
    // chatBody.addEventListener('keydown', (e) => {
    //   if (e.key === 'Enter' && !e.shiftKey) {
    //     e.preventDefault();
    //     chatForm.requestSubmit?.();
    //   }
    // });

    chatForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = chatBody.value.trim();
      if (!text) return;

      setChatMessage('送信中…', true);
      chatBtn.disabled = true;

      try {
        const res = await fetch(`/admin/contacts/${encodeURIComponent(contactId)}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'CSRF-Token': csrf
          },
          body: JSON.stringify({ body: text })
        });

        const data = await res.json();
        if (!res.ok || !data?.ok) {
          throw new Error(data?.message || '送信に失敗しました');
        }

        appendAdminMessage(data.message || { body: text });
        chatBody.value = '';
        setChatMessage('送信しました。', true);
        showToast('メッセージを送信しました');

        // 状態を自動的に in_progress に寄せたい場合はここでバッジも補正
        if (statusSel && statusSel.value === 'open') {
          statusSel.value = 'in_progress';
          updateStatusBadges('in_progress');
        }
      } catch (err) {
        console.error(err);
        setChatMessage('送信に失敗しました。時間をおいて再度お試しください。', false);
        showToast('送信に失敗しました');
      } finally {
        chatBtn.disabled = false;
      }
    });

    // 初期表示：一番下までスクロール
    chatThread.scrollTop = chatThread.scrollHeight;
  }
})();
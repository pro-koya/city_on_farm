(() => {
  const form   = document.getElementById('chatForm');
  const textarea = document.getElementById('chatBody');
  const sendBtn  = document.getElementById('chatSendBtn');
  const statusEl = document.getElementById('chatStatus');
  const chatList = document.getElementById('chatList');
  const scrollBox = document.getElementById('chatScroll');
  const csrf = form?.querySelector('input[name="_csrf"]')?.value || '';

  if (!form || !textarea) return;

  function setStatus(msg, ok = true) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.style.color = ok ? '#14532d' : '#b91c1c';
  }

  function appendMessage(m) {
    if (!chatList) return;

    // m: { sender_type, sender_name, body, created_at }
    const isUser = (m.sender_type === 'user');

    const li = document.createElement('li');
    li.className = 'chat__item chat__item--' + (isUser ? 'me' : 'admin');

    const meta = document.createElement('div');
    meta.className = 'chat__meta';

    const sender = document.createElement('span');
    sender.className = 'chat__sender';
    sender.textContent = isUser ? 'あなた' : (m.sender_name || 'サポート');

    const time = document.createElement('time');
    time.className = 'chat__time';
    const dt = m.created_at ? new Date(m.created_at) : new Date();
    time.dateTime = dt.toISOString();
    time.textContent = dt.toLocaleString('ja-JP', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    meta.appendChild(sender);
    meta.appendChild(time);

    const pre = document.createElement('pre');
    pre.className = 'chat__bubble';
    pre.textContent = m.body || '';

    li.appendChild(meta);
    li.appendChild(pre);
    chatList.appendChild(li);

    // スクロールを一番下へ
    if (scrollBox) {
      scrollBox.scrollTop = scrollBox.scrollHeight;
    }
  }

  async function sendMessage() {
    const body = textarea.value.trim();
    if (!body) {
      setStatus('メッセージを入力してください。', false);
      return;
    }

    setStatus('送信中…', true);
    sendBtn.disabled = true;

    try {
      const url = window.location.pathname.replace(/\/$/, '') + '/messages';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'CSRF-Token': csrf
        },
        credentials: 'same-origin',
        body: JSON.stringify({ body })
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || 'HTTP ' + res.status);
      }

      const data = await res.json();
      if (!data?.ok || !data.message) {
        throw new Error(data?.message || '送信に失敗しました。');
      }

      // チャットリストが空表示だけの場合は消す
      const emptyMsg = document.querySelector('.mycd-chat__empty');
      emptyMsg?.remove();

      appendMessage({
        sender_type: 'user',
        sender_name: null,
        body: body,
        created_at: data.message.created_at || new Date().toISOString()
      });

      textarea.value = '';
      setStatus('送信しました。', true);
    } catch (err) {
      console.error(err);
      setStatus('送信に失敗しました。時間をおいて再度お試しください。', false);
    } finally {
      sendBtn.disabled = false;
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    sendMessage();
  });

  // Ctrl+Enter で送信（任意）
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      sendMessage();
    }
  });
})();
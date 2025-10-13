(() => {
  const form = document.getElementById('statusForm');
  if (!form) return;

  const btn   = document.getElementById('toggleBtn');
  const input = document.getElementById('statusInput');
  const badge = document.getElementById('statusBadge');

  function toast(msg, ok=true){
    const t = document.createElement('div');
    t.className = 'toast ' + (ok ? 'ok' : 'ng');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(()=> t.remove(), 1800);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!btn || !input) return;

    const nextStatus = input.value; // active / inactive
    const fd = new FormData(form);
    fd.set('status', nextStatus);

    btn.disabled = true;
    try {
      const resp = await fetch(form.action, {
        method: 'POST',
        body: fd,
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'CSRF-Token': form.querySelector('input[name="_csrf"]')?.value || ''
        },
        credentials: 'same-origin'
      });
      if (!resp.ok) {
        let msg = '更新に失敗しました。';
        try { const j = await resp.json(); msg = j.message || msg; } catch {}
        toast(msg, false);
        return;
      }
      const data = await resp.json();
      if (data.ok) {
        // バッジ反映
        if (badge) {
          badge.textContent = data.status === 'active' ? '有効' : '無効';
          badge.classList.remove('ps__badge--active','ps__badge--inactive');
          badge.classList.add('ps__badge--' + data.status);
        }
        // ボタンとhidden切替
        const next = (data.status === 'active') ? 'inactive' : 'active';
        input.value = next;
        btn.textContent = (data.status === 'active') ? '無効にする' : '有効にする';

        toast('ステータスを更新しました。', true);
      } else {
        toast(data.message || '更新に失敗しました。', false);
      }
    } catch {
      toast('通信に失敗しました。', false);
    } finally {
      btn.disabled = false;
    }
  });
})();
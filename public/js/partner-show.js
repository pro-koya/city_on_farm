// public/js/partner-show.js
document.addEventListener('DOMContentLoaded', () => {
  // const form  = document.getElementById('statusForm');
  // if (!form) return;

  // const btn   = document.getElementById('toggleBtn');
  // const input = document.getElementById('statusInput'); // name="status"
  // const badge = document.getElementById('statusBadge');

  // form.addEventListener('submit', async (e) => {
  //   e.preventDefault();

  //   // 送る値をここで最終確認（空なら弾く）
  //   console.log(input?.value);
  //   const val = (input?.value || '').trim().toLowerCase();
  //   if (!['active','inactive'].includes(val)) {
  //     alert('内部エラー: 送信するステータスが不正です。');
  //     return;
  //   }

  //   const fd = new FormData(form);
  //   // 念のため status を確実に上書き
  //   fd.set('status', input?.value);

  //   btn.disabled = true;
  //   try {
  //     const resp = await fetch(form.action, {
  //       method: 'POST',
  //       body: fd,
  //       headers: {
  //         'X-Requested-With': 'XMLHttpRequest',
  //         'CSRF-Token': form.querySelector('input[name="_csrf"]')?.value || '',
  //         'Accept': 'application/json'
  //       },
  //       credentials: 'same-origin'
  //     });

  //     const data = await resp.json().catch(()=>null);
  //     if (!resp.ok || !data?.ok) {
  //       throw new Error(data?.message || '更新に失敗しました。');
  //     }

  //     // 現在ステータスを data.status で反映
  //     if (badge) {
  //       badge.textContent = data.status === 'active' ? '有効' : '無効';
  //       badge.classList.toggle('ps__badge--active',   data.status === 'active');
  //       badge.classList.toggle('ps__badge--inactive', data.status === 'inactive');
  //     }
  //     // 次回送信用の hidden を反転
  //     input.value = (data.status === 'active') ? 'inactive' : 'active';
  //     // ボタン文言も反転
  //     btn.textContent = (data.status === 'active') ? '無効にする' : '有効にする';

  //   } catch (err) {
  //     console.error(err);
  //     alert(err.message || '更新に失敗しました。');
  //   } finally {
  //     btn.disabled = false;
  //   }
  // });

  const payment_form = document.querySelector('form[action*="/admin/partners/"][action$="/payments"]');
  if (payment_form) {
    payment_form.addEventListener('submit', () => {
      const btn = payment_form.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = '保存中…'; }
    });
  }

  const shipTabs   = document.querySelectorAll('.ship-tab');
  const shipPanels = document.querySelectorAll('.ship-panel');

  if (shipTabs.length && shipPanels.length) {
    console.log('ship tap toggle');
    shipTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        console.log('ship tap toggle click');
        shipTabs.forEach((t) => {
          const isActive = t === tab;
          t.classList.toggle('is-active', isActive);
          if (isActive) {
            t.setAttribute('aria-selected', 'true');
          } else {
            t.setAttribute('aria-selected', 'false');
          }
        });

        shipPanels.forEach((panel) => {
          const match = panel.dataset.tab === target;
          panel.classList.toggle('is-active', match);
        });
      });
    });
  }
});
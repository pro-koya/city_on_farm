// public/js/favorites.js
// お気に入り機能のトグル処理

document.addEventListener('DOMContentLoaded', () => {
  const favoriteButtons = document.querySelectorAll('.favorite-btn:not(.favorite-btn--guest)');
  
  favoriteButtons.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation(); // 親要素のリンククリックを防ぐ

      const productId = btn.dataset.productId;
      if (!productId) return;

      // CSRFトークンの取得
      const csrfToken = document.querySelector('input[name="_csrf"]')?.value || 
                       document.querySelector('meta[name="csrf-token"]')?.content || '';

      if (!csrfToken) {
        alert('セキュリティトークンが見つかりません。ページを再読み込みしてください。');
        return;
      }

      // ボタンを無効化（二重送信防止）
      btn.disabled = true;
      const wasFavorited = btn.classList.contains('is-favorited');

      try {
        const response = await fetch(`/favorites/${productId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'CSRF-Token': csrfToken
          },
          credentials: 'same-origin'
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.ok) {
          throw new Error(data.message || 'お気に入りの更新に失敗しました');
        }

        // UI更新
        if (data.favorited) {
          btn.classList.add('is-favorited');
          btn.setAttribute('aria-pressed', 'true');
          btn.setAttribute('aria-label', 'お気に入りから削除');
        } else {
          btn.classList.remove('is-favorited');
          btn.setAttribute('aria-pressed', 'false');
          btn.setAttribute('aria-label', 'お気に入りに追加');
        }

        // お気に入り一覧ページの場合は、削除された商品を非表示にする
        if (!data.favorited && window.location.pathname === '/my/favorites') {
          const card = btn.closest('.card');
          if (card) {
            card.style.transition = 'opacity 0.3s ease';
            card.style.opacity = '0';
            setTimeout(() => {
              card.remove();
              // 空になった場合のメッセージ表示
              const grid = document.querySelector('.grid');
              if (grid && grid.children.length === 0) {
                const emptyMsg = document.createElement('div');
                emptyMsg.className = 'empty';
                emptyMsg.style.textAlign = 'center';
                emptyMsg.style.padding = '60px 20px';
                emptyMsg.innerHTML = `
                  <p style="font-size: 1.1rem; margin-bottom: 16px;">お気に入り商品はまだありません</p>
                  <a class="btn btn--ghost" href="/products">商品一覧を見る</a>
                `;
                document.querySelector('.grid-wrap').appendChild(emptyMsg);
              }
            }, 300);
          }
        }

      } catch (error) {
        console.error('お気に入り更新エラー:', error);
        alert(error.message || 'お気に入りの更新に失敗しました。ページを再読み込みして再度お試しください。');
        // エラー時は元の状態に戻す
        if (wasFavorited) {
          btn.classList.add('is-favorited');
          btn.setAttribute('aria-pressed', 'true');
        } else {
          btn.classList.remove('is-favorited');
          btn.setAttribute('aria-pressed', 'false');
        }
      } finally {
        btn.disabled = false;
      }
    });
  });
});


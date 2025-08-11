(function(){
  const shareBtn = document.getElementById('btn-share');
  const copyBtn  = document.getElementById('btn-copy');

  if (shareBtn && navigator.share) {
    shareBtn.addEventListener('click', async () => {
      try {
        await navigator.share({
          title: document.title,
          text: 'この記事をシェア',
          url: location.href
        });
      } catch (e) {
        // ユーザーがキャンセルしたなど
      }
    });
  } else if (shareBtn) {
    // Web Share API 非対応時：コピーにフォールバック
    shareBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        shareBtn.textContent = 'リンクをコピーしました！';
        setTimeout(()=> shareBtn.textContent = '共有', 1500);
      } catch(e) {}
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        copyBtn.textContent = 'コピーしました！';
        setTimeout(()=> copyBtn.textContent = 'リンクをコピー', 1500);
      } catch(e) {}
    });
  }
})();

// 記事内の table を自動で .table-wrapper で包む
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.post-body table').forEach((tbl) => {
    if (!tbl.parentElement.classList.contains('table-wrapper')) {
      const wrap = document.createElement('div');
      wrap.className = 'table-wrapper';
      tbl.parentNode.insertBefore(wrap, tbl);
      wrap.appendChild(tbl);
    }
  });
});
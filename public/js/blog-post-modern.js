// 記事内のテーブルを横スクロール可能に
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.np__content table').forEach(tbl => {
    if (!tbl.parentElement.classList.contains('table-wrapper')) {
      const w = document.createElement('div');
      w.className = 'table-wrapper';
      w.style.overflowX = 'auto';
      tbl.parentNode.insertBefore(w, tbl);
      w.appendChild(tbl);
    }
  });
});
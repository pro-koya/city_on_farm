document.addEventListener('DOMContentLoaded', () => {
    // クラス名 'coupon-row' を持つすべての行を取得
    const rows = document.querySelectorAll('.coupon-row');

    rows.forEach(row => {
        const url = row.getAttribute('data-href');
        if (url) {
            // 行にポインターカーソルを設定 (CSSでも可)
            row.style.cursor = 'pointer'; 
            
            // クリックイベントリスナーを追加
            row.addEventListener('click', () => {
                // 指定されたURLへ遷移
                window.location.href = url;
            });
        }
    });
});
(function () {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-toggle]');
        if (!btn) return;
        const sel = btn.getAttribute('data-toggle');
        const pane = document.querySelector(sel);
        if (!pane) return;
        pane.classList.toggle('is-open');
    });

    // モバイルのフィルタ開閉
    const toggle = document.querySelector('.lv__toggle');
    const filters = document.getElementById('lvFilters');
    if (toggle && filters) {
        toggle.addEventListener('click', () => {
            const open = filters.classList.toggle('is-open');
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        });

        // 画面サイズ変更で PC 幅に戻ったら強制的に開いた状態にしておく必要はありません（PCは常時表示CSS）
        // ただ、念のためモバイル→PC→モバイルで状態が残らないようにしてもOKです。
        const mql = window.matchMedia('(max-width: 768px)');
        const sync = () => {
            if (!mql.matches) {
                // PC時は CSS 側で横並び表示。JS側では余計な状態をリセット
                filters.classList.remove('is-open');
                toggle.setAttribute('aria-expanded', 'false');
            }
        };
        mql.addEventListener?.('change', sync);
        sync();
    }
    // 全選択チェックボックス対応（必要な画面のみで使われる想定）
    const master = document.querySelector('[data-lv-check-all]');
    if (master) {
        const boxes = Array.from(document.querySelectorAll('[data-lv-row-check]'));
        master.addEventListener('change', () => {
            boxes.forEach(b => { b.checked = master.checked; });
            toggleBulkActions();
        });
        boxes.forEach(b => b.addEventListener('change', toggleBulkActions));
    }

    function toggleBulkActions() {
        const any = !!document.querySelector('[data-lv-row-check]:checked');
        document.querySelectorAll('[data-lv-bulk-action]').forEach(btn => {
            btn.classList.toggle('is-disabled', !any);
            btn.disabled = !any;
        });
    }
})();
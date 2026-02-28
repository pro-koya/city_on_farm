// /public/js/base.js

document.addEventListener('DOMContentLoaded', function () {
    /* ====== ドロワーナビゲーション ====== */
    const toggle = document.getElementById('navbar-toggle');
    const drawer = document.getElementById('navbar-drawer');
    const overlay = document.getElementById('navbar-overlay');
    let scrollY = 0;

    function openDrawer() {
        if (!drawer || !overlay) return;
        scrollY = window.scrollY;
        toggle?.classList.add('is-open');
        drawer.classList.add('is-open');
        overlay.classList.add('is-visible');
        document.body.classList.add('drawer-open');
        document.body.style.top = `-${scrollY}px`;
        toggle?.setAttribute('aria-expanded', 'true');
    }

    function closeDrawer() {
        if (!drawer || !overlay) return;
        toggle?.classList.remove('is-open');
        drawer.classList.remove('is-open');
        overlay.classList.remove('is-visible');
        document.body.classList.remove('drawer-open');
        document.body.style.top = '';
        window.scrollTo(0, scrollY);
        toggle?.setAttribute('aria-expanded', 'false');
    }

    if (toggle) {
        toggle.addEventListener('click', function () {
            drawer?.classList.contains('is-open') ? closeDrawer() : openDrawer();
        });
    }
    if (overlay) {
        overlay.addEventListener('click', closeDrawer);
    }
    const drawerClose = document.getElementById('drawer-close');
    if (drawerClose) {
        drawerClose.addEventListener('click', closeDrawer);
    }

    // ESCキーで閉じる
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && drawer?.classList.contains('is-open')) {
            closeDrawer();
        }
    });

    // ドロワー内リンククリックで閉じる
    if (drawer) {
        drawer.addEventListener('click', function (e) {
            const link = e.target.closest('a');
            if (link) closeDrawer();
        });
    }

    /* ====== 階層メニューのアコーディオン ====== */
    document.querySelectorAll('.drawer-menu__header').forEach(header => {
        header.addEventListener('click', function(e) {
            e.stopPropagation();
            const group = this.closest('.drawer-menu__group');
            if (!group) return;

            const isOpen = group.classList.contains('is-open');
            group.classList.toggle('is-open');
            this.setAttribute('aria-expanded', !isOpen);
        });
    });

    /* ====== 現在のページに応じたメニューグループの自動展開 ====== */
    (function() {
        const path = window.location.pathname;
        document.querySelectorAll('.drawer-menu__group').forEach(group => {
            // 出品者グループは初期状態 is-open のままにする
            if (group.classList.contains('drawer-menu__group--seller')) return;
            const links = group.querySelectorAll('.drawer-menu__items a');
            let match = false;
            links.forEach(a => {
                const href = a.getAttribute('href');
                if (href && path.startsWith(href) && href !== '/') {
                    match = true;
                }
            });
            if (match) {
                group.classList.add('is-open');
                const hdr = group.querySelector('.drawer-menu__header');
                if (hdr) hdr.setAttribute('aria-expanded', 'true');
            }
        });
    })();

    /* ====== スライドショー ====== */
    const slides = document.querySelectorAll('.slide');
    if (slides.length > 0) {
        let index = 0;
        // 初期状態
        slides[0].classList.add('active');
        setInterval(() => {
            slides[index]?.classList.remove('active');
            index = (index + 1) % slides.length;
            slides[index]?.classList.add('active');
        }, 8000);
    }

    /* ====== よくある質問アコーディオン ====== */
    document.querySelectorAll('.faq-item').forEach(item => {
        item.addEventListener('click', () => item.classList.toggle('active'));
    });

    /* ====== お問い合わせフォーム簡易バリデーション ====== */
    const contactForm = document.getElementById('contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', function (e) {
            const name = document.getElementById('name')?.value.trim();
            const email = document.getElementById('email')?.value.trim();
            const message = document.getElementById('message')?.value.trim();
            if (!name || !email || !message) {
                alert('すべての項目を入力してください。');
                e.preventDefault();
            }
        });
    }

    /* ====== flatpickr ====== */
    const fp = window.flatpickr;
    if (!fp) {
        // flatpickr が未読込なら何もしない（ページによっては不要）
        return;
    }
    // 日本語ロケール
    try { fp.localize(fp.l10ns.ja); } catch { }

    const baseOpts = {
        locale: 'ja',
        dateFormat: 'Y-m-d',
        disableMobile: true,
        allowInput: false
    };

    // --- 日付レンジ（日単位） ---
    const elRange = document.getElementById('dateRange');
    if (elRange) {
        fp(elRange, {
            ...baseOpts,
            mode: 'range',
            dateFormat: 'Y-m-d',
            onChange: (selectedDates) => {
                const [from, to] = selectedDates;
                const df = document.getElementById('dateFrom');
                const dt = document.getElementById('dateTo');
                if (df) df.value = from ? fp.formatDate(from, 'Y-m-d') : '';
                if (dt) dt.value = to ? fp.formatDate(to, 'Y-m-d') : '';
            }
        });
    }

    // --- 週指定（ISO週） ---
    const elWeek = document.getElementById('weekPick');
    if (elWeek) {
        // プラグイン存在チェック
        const hasWeekPlugin = (typeof window.weekSelect === 'function');
        const plugins = hasWeekPlugin ? [new window.weekSelect({})] : [];

        // ISO週文字列ヘルパ
        function isoWeekString(d) {
            const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
            const day = date.getUTCDay() || 7;
            date.setUTCDate(date.getUTCDate() + 4 - day);
            const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
            const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
            const yyyy = date.getUTCFullYear();
            const ww = String(weekNo).padStart(2, '0');
            return `${yyyy}-W${ww}`;
        }

        fp(elWeek, {
            ...baseOpts,
            weekNumbers: true,
            plugins,
            onChange: (selectedDates) => {
                if (selectedDates[0]) elWeek.value = isoWeekString(selectedDates[0]);
            },
            onClose: (selectedDates) => {
                if (selectedDates[0]) elWeek.value = isoWeekString(selectedDates[0]);
            }
        });
    }

    // --- 月指定（YYYY-MM） ---
    const elMonth = document.getElementById('monthPick');
    if (elMonth) {
        const hasMonthPlugin = (typeof window.monthSelectPlugin === 'function');
        const plugins = hasMonthPlugin ? [new window.monthSelectPlugin({
            shorthand: true,
            dateFormat: 'Y-m',
            altFormat: 'Y年n月',
            theme: 'light'
        })] : [];

        fp(elMonth, {
            ...baseOpts,
            plugins
        });
    }

    // --- 年指定（YYYY） ---
    const elYear = document.getElementById('yearPick');
    if (elYear) {
        const hasMonthPlugin = (typeof window.monthSelectPlugin === 'function');
        const plugins = hasMonthPlugin ? [new window.monthSelectPlugin({
            shorthand: true,
            dateFormat: 'Y',
            altFormat: 'Y年',
            theme: 'light'
        })] : [];

        const inst = fp(elYear, { ...baseOpts, plugins });
        // 年だけに見せたいときの軽い調整（任意）
        inst?.config?.onReady?.push?.(() => {
            inst?.calendarContainer?.classList?.add('fp-year-only');
        });
    }

    // --- 日付レンジ（日単位） ---
    // const eventDate = document.getElementById('ev_date');
    // if (eventDate) {
    //     fp(eventDate, {
    //         ...baseOpts,
    //         onChange: (selectedDates) => {
    //             const nowDate = selectedDates[0];
    //             console.log(selectedDates + ' : ' + nowDate);
    //             const dt = document.getElementById('shipDate');
    //             if (dt) dt.value = nowDate ? fp.formatDate(nowDate, 'Y-m-d') : '';
    //         }
    //     });
    // }
});
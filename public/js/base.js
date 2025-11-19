// /public/js/base.js

document.addEventListener('DOMContentLoaded', function () {
    /* ====== ナビトグル ====== */
    const toggle = document.getElementById('navbar-toggle');
    const menu = document.getElementById('navbar-menu');
    const icon = document.getElementById('toggle-icon');
    if (toggle && menu && icon) {
        toggle.addEventListener('click', function () {
            menu.classList.toggle('active');
            toggle.classList.toggle('open');
            icon.textContent = menu.classList.contains('active') ? '✕' : '☰';
        });
    }

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
    const eventDate = document.getElementById('ev_date');
    if (eventDate) {
        fp(eventDate, {
            ...baseOpts,
            onChange: (selectedDates) => {
                const nowDate = selectedDates[0];
                console.log(selectedDates + ' : ' + nowDate);
                const dt = document.getElementById('shipDate');
                if (dt) dt.value = nowDate ? fp.formatDate(nowDate, 'Y-m-d') : '';
            }
        });
    }
});
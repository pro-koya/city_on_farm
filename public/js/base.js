document.addEventListener("DOMContentLoaded", function () {
    const toggle = document.getElementById("navbar-toggle");
    const menu = document.getElementById("navbar-menu");
    const icon = document.getElementById("toggle-icon");

    toggle.addEventListener("click", function () {
        menu.classList.toggle("active");
        toggle.classList.toggle("open");

        // アイコン切り替え
        if (menu.classList.contains("active")) {
            icon.textContent = "✕";
        } else {
            icon.textContent = "☰";
        }
    });
});

// スライドショー
const slides = document.querySelectorAll('.slide');
let index = 0;

setInterval(() => {
    slides[index].classList.remove('active');
    index = (index + 1) % slides.length;
    slides[index].classList.add('active');
}, 8000);

// よくある質問
document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".faq-item").forEach(item => {
        item.addEventListener("click", () => {
            item.classList.toggle("active");
        });
    });
});

// 問い合わせページ
document.getElementById('contact-form').addEventListener('submit', function(e) {
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const message = document.getElementById('message').value.trim();

    if (!name || !email || !message) {
        alert('すべての項目を入力してください。');
        e.preventDefault();
    }
});

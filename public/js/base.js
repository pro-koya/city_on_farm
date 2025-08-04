// ハンバーガーメニュー動作
document.addEventListener("DOMContentLoaded", function() {
    const toggle = document.getElementById("navbar-toggle");
    const menu = document.getElementById("navbar-menu");

    toggle.addEventListener("click", function() {
        menu.classList.toggle("active");
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
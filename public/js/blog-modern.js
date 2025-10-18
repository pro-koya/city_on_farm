(function(){
  const form = document.querySelector('.nm__toolbar');
  if (!form) return;
  const autoEls = form.querySelectorAll('select');
  autoEls.forEach(el => el.addEventListener('change', () => form.submit()));
})();
const btn = document.getElementById('hamburger');
const menu = document.querySelector('.header-nav');
btn?.addEventListener('click', () => {
  const open = menu?.classList.toggle('open');
  btn.classList.toggle('open', open);
  btn.setAttribute('aria-expanded', String(!!open));
  document.body.style.overflow = open ? 'hidden' : '';
});
menu?.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => {
    menu.classList.remove('open');
    btn?.classList.remove('open');
    btn?.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  });
});

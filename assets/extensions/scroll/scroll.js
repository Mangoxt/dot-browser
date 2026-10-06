(() => {
  if (window.top !== window || document.querySelector('[data-dot-scroll-top]')) return;
  const host = document.createElement('div');
  host.dataset.dotScrollTop = '';
  const root = host.attachShadow({ mode: 'closed' });
  const button = document.createElement('button');
  button.textContent = '↑';
  button.title = 'Sayfanın başına dön';
  button.setAttribute('aria-label', 'Sayfanın başına dön');
  button.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:2147483647;width:42px;height:42px;border:1px solid #ffffff44;border-radius:50%;background:#282633;color:#fff;box-shadow:0 4px 14px #0004;font:22px system-ui;cursor:pointer';
  button.addEventListener('click', () => window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }));
  const update = () => { button.hidden = window.scrollY < 400; };
  window.addEventListener('scroll', update, { passive: true });
  update();
  root.append(button);
  document.documentElement.append(host);
})();

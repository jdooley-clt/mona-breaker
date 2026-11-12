// Applies the saved or preferred theme before the stylesheet renders, so there is no flash.
// Kept as a separate classic script so the page's Content Security Policy can forbid inline scripts.
(() => {
  let theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  try {
    const saved = localStorage.getItem('mona-breaker-theme');
    if (saved === 'dark' || saved === 'light') theme = saved;
  } catch { /* storage unavailable */ }
  document.documentElement.dataset.theme = theme;
})();

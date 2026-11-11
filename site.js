(function () {
  var root = document.documentElement;

  function currentTheme() { return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }

  var btn = document.getElementById('theme');
  function renderBtn() {
    if (!btn) return;
    // the button shows the theme it will switch TO
    var next = currentTheme() === 'dark' ? 'light' : 'dark';
    btn.textContent = btn.getAttribute('data-' + next);
  }
  if (btn) {
    btn.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
      renderBtn();
    });
    renderBtn();
  }

  var lang = document.getElementById('lang');
  if (lang) {
    // opened from disk: folder links would show a directory listing, so point at index.html
    if (location.protocol === 'file:') {
      lang.querySelectorAll('a').forEach(function (a) {
        a.setAttribute('href', a.getAttribute('href') + 'index.html');
      });
    }
    document.addEventListener('click', function (e) { if (!lang.contains(e.target)) lang.open = false; });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') lang.open = false; });
  }
})();

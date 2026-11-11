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
    lang.addEventListener('change', function () {
      try { localStorage.setItem('lang', lang.value); } catch (e) {}
      var u = lang.value; if (location.protocol === 'file:') u += 'index.html'; location.href = u;
    });
  }
})();

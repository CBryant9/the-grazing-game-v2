/* The live activity ticker (PRD 9.4). Website pages only, never the game. No libraries.
   data-place="strip" on the script tag shows it as a strip on narrow screens too. */
(function () {
  var s = document.currentScript,
    strip = !!s && s.getAttribute('data-place') === 'strip',
    K = 'gg-ticker-hidden',
    d = document;
  try {
    if (localStorage.getItem(K)) return;
  } catch {}
  function ago(t) {
    var m = Math.max(0, Math.round((Date.now() - Date.parse(t)) / 60000));
    return m < 1
      ? 'just now'
      : m < 60
        ? m + ' min ago'
        : m < 1440
          ? Math.round(m / 60) + ' h ago'
          : Math.round(m / 1440) + ' d ago';
  }
  fetch('/api/ticker', { credentials: 'same-origin' })
    .then(function (r) {
      return r.ok ? r.json() : null;
    })
    .then(function (j) {
      var L = j && j.lines;
      if (!L || !L.length) return;
      var st = d.createElement('style');
      st.textContent =
        '.ggt{position:fixed;left:20px;bottom:20px;z-index:50;box-sizing:border-box;width:340px;max-width:calc(100vw - 40px);display:flex;align-items:center;gap:10px;padding:6px 6px 6px 12px;background:var(--panel,#111a2e);color:var(--text,#f3e7cf);border:1px solid var(--line,#22304d);border-color:color-mix(in srgb,var(--ok) 50%,var(--panel));border-radius:var(--radius,10px);box-shadow:0 0 0 1px rgba(0,0,0,.4),0 0 24px color-mix(in srgb,var(--ok) 22%,transparent);font:0.8125rem/1.3 var(--font-body,system-ui,sans-serif)}' +
        '.ggt p{margin:0;min-width:0;overflow-wrap:anywhere}.ggt small{display:block;color:var(--muted,#8f9bb5)}' +
        '.ggt button{flex:none;min-width:44px;min-height:44px;background:none;color:inherit;border:1px solid var(--line,#22304d);border-radius:var(--radius,10px);font:inherit;cursor:pointer}' +
        '@media (prefers-reduced-motion:no-preference){.ggt p{transition:opacity .3s}}' +
        '@media (max-width:759px){.ggt{display:' +
        (strip
          ? 'flex;position:static;width:auto;max-width:none;margin:0;border-width:0 0 1px;border-radius:0;box-shadow:none'
          : 'none') +
        '}}';
      d.head.appendChild(st);
      var box = d.createElement('div'),
        p = d.createElement('p'),
        b = d.createElement('button'),
        i = 0;
      box.className = 'ggt';
      box.setAttribute('role', 'region');
      box.setAttribute('aria-label', 'Recent activity');
      b.type = 'button';
      b.textContent = 'Hide';
      b.setAttribute('aria-label', 'Hide recent activity');
      b.onclick = function () {
        try {
          localStorage.setItem(K, '1');
        } catch {}
        clearInterval(t);
        box.remove();
      };
      function show() {
        var x = L[i++ % L.length],
          u = d.createElement('small');
        u.textContent = ago(x.at);
        p.textContent = '@' + x.user + ' ' + x.text;
        p.appendChild(u);
      }
      show();
      box.append(p, b);
      if (strip && matchMedia('(max-width:759px)').matches)
        d.body.insertBefore(box, d.body.firstChild);
      else d.body.appendChild(box);
      var t = L.length > 1 ? setInterval(show, 6000) : 0;
    })
    .catch(function () {});
})();

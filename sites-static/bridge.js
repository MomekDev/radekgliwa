/* Mostek podglądu: wysyła do kreatora błędy z konsoli i obsługuje tryb „Wybierz element”. */
(function () {
  if (window.parent === window) return;
  var script = document.currentScript;
  var builder = script && script.getAttribute('data-builder');
  var target = builder || '*';
  function post(msg) {
    msg.kreator = true;
    try { window.parent.postMessage(msg, target); } catch (e) {}
  }

  var base = (script && script.getAttribute('data-base')) || '/';
  var path = location.pathname;
  var page = (path.indexOf(base) === 0 ? decodeURIComponent(path.slice(base.length)) : '') || 'index.html';
  if (/\/$/.test(page)) page += 'index.html';
  post({ type: 'loaded', page: page });

  // ---- błędy
  var sent = 0;
  // level: 'error' (prawdziwy błąd – pokazuje baner) albo 'log' (console.error – tylko kontekst dla AI)
  function report(text, level) {
    if (sent++ > 30) return;
    post({ type: 'error', message: String(text).slice(0, 600), page: page, level: level || 'error' });
  }
  var IGNORE = /ResizeObserver loop|^Script error\.?$/i;
  window.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t !== window && (t.src || t.href)) {
      var url = t.src || t.href;
      // brakujące pliki z własnego projektu to realny problem; obce obrazki/skrypty – tylko informacja
      var own = url.indexOf(location.origin) === 0;
      report('Nie udało się wczytać pliku: ' + url, own ? 'error' : 'log');
      return;
    }
    var msg = e.message || 'Błąd';
    if (IGNORE.test(msg) && !e.filename) return;
    if (/ResizeObserver loop/.test(msg)) return;
    report(msg + (e.filename ? ' (' + e.filename.split('/').pop() + ':' + e.lineno + ')' : ''), 'error');
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    report('Nieobsłużony błąd Promise: ' + (r && r.message ? r.message : String(r)), 'error');
  });
  var origError = console.error;
  console.error = function () {
    try {
      report(Array.prototype.map.call(arguments, function (a) {
        return a instanceof Error ? a.message : typeof a === 'object' ? JSON.stringify(a) : String(a);
      }).join(' '), 'log');
    } catch (e) {}
    return origError.apply(console, arguments);
  };

  // ---- wybieranie elementu
  var selecting = false;
  var box = null;
  function ensureBox() {
    if (box) return box;
    box = document.createElement('div');
    box.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #6d5efc;background:rgba(109,94,252,.12);border-radius:3px;transition:all .05s;display:none';
    document.documentElement.appendChild(box);
    return box;
  }
  function selectorOf(el) {
    var parts = [];
    while (el && el.nodeType === 1 && el !== document.documentElement && parts.length < 6) {
      if (el.id) { parts.unshift('#' + CSS.escape(el.id)); break; }
      var tag = el.tagName.toLowerCase();
      var idx = 1, s = el;
      while ((s = s.previousElementSibling)) if (s.tagName === el.tagName) idx++;
      var cls = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(function (c) { return '.' + CSS.escape(c); }).join('');
      parts.unshift(tag + cls + (idx > 1 ? ':nth-of-type(' + idx + ')' : ''));
      el = el.parentElement;
    }
    return parts.join(' > ');
  }
  function onMove(e) {
    var b = ensureBox();
    var r = e.target.getBoundingClientRect();
    b.style.display = 'block';
    b.style.left = r.left + 'px'; b.style.top = r.top + 'px';
    b.style.width = r.width + 'px'; b.style.height = r.height + 'px';
  }
  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    var el = e.target;
    var html = el.outerHTML;
    if (html.length > 1500) html = html.slice(0, 1500) + '…';
    post({
      type: 'selected',
      page: page,
      selector: selectorOf(el),
      tag: el.tagName.toLowerCase(),
      text: (el.innerText || '').trim().slice(0, 80),
      html: html,
    });
    setSelecting(false);
  }
  function setSelecting(on) {
    selecting = on;
    var fn = on ? 'addEventListener' : 'removeEventListener';
    document[fn]('mousemove', onMove, true);
    document[fn]('click', onClick, true);
    document.documentElement.style.cursor = on ? 'crosshair' : '';
    if (!on && box) box.style.display = 'none';
    if (!on) post({ type: 'select-off' });
  }
  window.addEventListener('keydown', function (e) { if (selecting && e.key === 'Escape') setSelecting(false); });
  window.addEventListener('message', function (e) {
    if (builder && e.origin !== builder) return;
    var d = e.data || {};
    if (d.kreator && d.type === 'select') setSelecting(!!d.on);
  });
})();

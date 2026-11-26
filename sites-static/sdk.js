/* Kreator SDK – wbudowany backend dla wygenerowanych aplikacji: window.app.db i window.app.auth */
(function () {
  if (window.kreator && window.kreator.__kreator) return;
  var script = document.currentScript;
  var projectId = script && script.getAttribute('data-project');
  var base = new URL('/_api/' + projectId + '/', script ? script.src : location.href).href;
  var KEY = 'kreator_auth_' + projectId;

  var mem = {};
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return mem[k] || null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { mem[k] = v; } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { delete mem[k]; } },
  };

  var session = null;
  try { session = JSON.parse(store.get(KEY) || 'null'); } catch (e) { session = null; }
  var listeners = [];

  function setSession(s) {
    session = s;
    if (s) store.set(KEY, JSON.stringify(s)); else store.del(KEY);
    var u = s ? s.user : null;
    listeners.slice().forEach(function (cb) { try { cb(u); } catch (e) { console.error(e); } });
  }

  function request(method, path, body, query) {
    var url = base + path;
    if (query) {
      var qs = Object.keys(query).filter(function (k) { return query[k] !== undefined && query[k] !== null; })
        .map(function (k) { var v = query[k]; return encodeURIComponent(k) + '=' + encodeURIComponent(typeof v === 'object' ? JSON.stringify(v) : String(v)); }).join('&');
      if (qs) url += '?' + qs;
    }
    var headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (session && session.token) headers['Authorization'] = 'Bearer ' + session.token;
    return fetch(url, { method: method, headers: headers, body: body !== undefined ? JSON.stringify(body) : undefined })
      .catch(function () { throw new Error('Brak połączenia z serwerem'); })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          // wygasła lub usunięta sesja – wyloguj lokalnie
          if (res.status === 401 && session && path.indexOf('auth/') !== 0) setSession(null);
          if (!res.ok) throw new Error(data.error || ('Błąd serwera (' + res.status + ')'));
          return data;
        });
      });
  }

  function collection(name) {
    if (!/^[A-Za-z][\w-]{0,49}$/.test(String(name))) throw new Error('Nieprawidłowa nazwa kolekcji: ' + name);
    var p = 'db/' + encodeURIComponent(name);
    return {
      list: function (opts) {
        opts = opts || {};
        return request('GET', p, undefined, { where: opts.where, sort: opts.sort, limit: opts.limit, offset: opts.offset, mine: opts.mine ? 1 : undefined });
      },
      get: function (id) { return request('GET', p + '/' + encodeURIComponent(id)); },
      create: function (data) { return request('POST', p, data || {}); },
      update: function (id, data) { return request('PATCH', p + '/' + encodeURIComponent(id), data || {}); },
      remove: function (id) { return request('DELETE', p + '/' + encodeURIComponent(id)); },
    };
  }

  var auth = {
    signUp: function (o) {
      o = o || {};
      return request('POST', 'auth/signup', { email: o.email, password: o.password, name: o.name }).then(function (r) { setSession(r); return r.user; });
    },
    signIn: function (o) {
      o = o || {};
      return request('POST', 'auth/signin', { email: o.email, password: o.password }).then(function (r) { setSession(r); return r.user; });
    },
    signOut: function () {
      var p = session ? request('POST', 'auth/signout', {}).catch(function () {}) : Promise.resolve();
      return p.then(function () { setSession(null); });
    },
    user: function () { return session ? session.user : null; },
    me: function () {
      if (!session) return Promise.resolve(null);
      return request('GET', 'auth/me').then(function (r) {
        if (!r.user) setSession(null);
        return r.user;
      });
    },
    onChange: function (cb) {
      listeners.push(cb);
      try { cb(session ? session.user : null); } catch (e) { console.error(e); }
      return function () { listeners = listeners.filter(function (x) { return x !== cb; }); };
    },
  };

  // sprawdź, czy zapisana sesja jest nadal ważna
  if (session) auth.me().catch(function () {});

  // logowanie/wylogowanie w innej karcie
  window.addEventListener('storage', function (e) {
    if (e.key !== KEY) return;
    var next = null;
    try { next = JSON.parse(e.newValue || 'null'); } catch (err) {}
    session = next;
    var u = next ? next.user : null;
    listeners.slice().forEach(function (cb) { try { cb(u); } catch (err) { console.error(err); } });
  });

  // ---- płatności Stripe
  var payments = {
    products: function () { return request('GET', 'payments/products'); },
    checkout: function (o) {
      o = o || {};
      var here = location.href.split('#')[0];
      var body = {
        items: o.items || [],
        successUrl: o.successUrl || here,
        cancelUrl: o.cancelUrl || here,
        email: o.email,
        collectAddress: !!o.collectAddress,
        collectPhone: !!o.collectPhone,
      };
      // w podglądzie (ramka) Stripe otwieramy w nowej karcie – Stripe nie działa w ramkach
      var inFrame = window.top !== window;
      var popup = inFrame ? window.open('', '_blank') : null;
      return request('POST', 'payments/checkout', body).then(function (r) {
        if (popup) popup.location.href = r.url;
        else if (inFrame) window.open(r.url, '_blank');
        else location.href = r.url;
        return r;
      }, function (e) {
        if (popup) popup.close();
        throw e;
      });
    },
    verify: function (sessionId) {
      var sid = sessionId || new URLSearchParams(location.search).get('session_id');
      if (!sid) return Promise.resolve({ paid: false, status: 'none' });
      return request('GET', 'payments/session/' + encodeURIComponent(sid));
    },
    myOrders: function () { return request('GET', 'payments/orders'); },
  };

  var api = { __kreator: true, projectId: projectId, db: { collection: collection }, auth: auth, payments: payments };
  // window.kreator zawsze działa; window.app – o ile strona nie nadpisze tej nazwy własną zmienną
  window.kreator = api;
  window.app = api;
})();

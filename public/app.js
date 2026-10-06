/* Shared client helpers for the server-backed pages (account, library, news, admin).
   Loaded with `defer` after site.js. Exposes window.HM. No framework, no build step. */
(function () {
  // fetch wrapper: JSON in/out, same-origin cookies, CSRF header (server rejects writes without it)
  function api(url, opts) {
    opts = opts || {};
    var headers = { 'X-HM-Request': '1', 'Accept': 'application/json' };
    var body = opts.body;
    if (body && !(body instanceof FormData)) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
    return fetch(url, { method: opts.method || (body ? 'POST' : 'GET'), headers: headers, body: body, credentials: 'same-origin' })
      .then(function (res) {
        var ct = res.headers.get('content-type') || '';
        var data = ct.indexOf('application/json') >= 0 ? res.json() : Promise.resolve({});
        return data.then(function (d) {
          if (!res.ok) { var e = new Error(d.error || ('Lỗi ' + res.status)); e.status = res.status; e.data = d; throw e; }
          return d;
        });
      }, function () { var e = new Error('Không kết nối được máy chủ. Vui lòng thử lại.'); e.status = 0; throw e; });
  }
  // Upload with progress (XMLHttpRequest: fetch has no upload progress)
  function upload(url, formData, method, onProgress) {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest();
      x.open(method || 'POST', url);
      x.setRequestHeader('X-HM-Request', '1');
      x.responseType = 'json';
      if (onProgress) x.upload.onprogress = function (e) { if (e.lengthComputable) onProgress(e.loaded / e.total); };
      x.onload = function () {
        var d = x.response || {};
        if (x.status >= 200 && x.status < 300) resolve(d);
        else { var e = new Error(d.error || ('Lỗi ' + x.status)); e.status = x.status; reject(e); }
      };
      x.onerror = function () { reject(new Error('Không kết nối được máy chủ.')); };
      x.send(formData);
    });
  }
  // h('div', {class: 'x', onclick: fn}, child, 'text', [children]) — text is always set via textContent (no innerHTML)
  function h(tag, attrs) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.keys(v).forEach(function (d) { n.dataset[d] = v[d]; });
      else if (v === true) n.setAttribute(k, '');
      else n.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) append(n, arguments[i]);
    return n;
  }
  function append(n, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) return c.forEach(function (x) { append(n, x); });
    n.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  function placeholder(text) { return h('span', { class: 'placeholder', text: '[CẦN BỔ SUNG — ' + text + ']' }); }
  function vnd(n) { return new Intl.NumberFormat('vi-VN').format(n || 0) + ' đ'; }
  // All times shown in Vietnam time
  function date(iso, withTime) {
    if (!iso) return '';
    var d = new Date(/Z$|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso.replace(' ', 'T') + 'Z');
    var o = { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' };
    if (withTime) { o.hour = '2-digit'; o.minute = '2-digit'; }
    return d.toLocaleString('vi-VN', o);
  }
  function me() { return api('/api/me').then(function (d) { return d.user; }); }
  function logout() { return api('/api/auth/logout', { method: 'POST' }).then(function () { location.href = 'index.html'; }); }
  // Safe internal redirect target (?next=) — must be a same-site path, never //host or a scheme
  function safeNext(fallback) {
    var m = /[?&]next=([^&]+)/.exec(location.search);
    var n = m ? decodeURIComponent(m[1]) : '';
    return /^\/(?!\/)[\w\-./?=&%#]*$/.test(n) ? n : fallback;
  }
  function announce(el, msg) { if (el) { el.textContent = ''; setTimeout(function () { el.textContent = msg; }, 30); } }

  window.HM = { api: api, upload: upload, h: h, placeholder: placeholder, vnd: vnd, date: date, me: me, logout: logout, safeNext: safeNext, announce: announce };
})();

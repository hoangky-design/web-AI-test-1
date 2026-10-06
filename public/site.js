/* Shared page behaviour (loaded with `defer` on every page). */

/* Mobile nav disclosure — design/site-header.md §3.4. Collapses below 80em (9 header links).
   Disclosure, not a modal: no focus trap, no aria-modal, no scroll lock. */
(function () {
  var nav = document.querySelector('.site-nav');
  var toggle = document.querySelector('.nav-toggle');
  var menu = document.getElementById('primary-menu');
  if (!nav || !toggle || !menu) return;
  var mq = window.matchMedia('(min-width: 80em)');
  function isOpen() { return toggle.getAttribute('aria-expanded') === 'true'; }
  function setOpen(open, returnFocus) {
    toggle.setAttribute('aria-expanded', String(open));
    menu.classList.toggle('is-open', open);
    if (!open && returnFocus) toggle.focus();
  }
  toggle.addEventListener('click', function () { setOpen(!isOpen()); });
  // Esc closes and returns focus to the toggle
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen()) setOpen(false, true);
  });
  // Activating a link closes the menu (the page then navigates)
  menu.addEventListener('click', function (e) { if (e.target.closest('a') && !mq.matches) setOpen(false); });
  // Focus leaving the nav closes it (focus is not moved)
  nav.addEventListener('focusout', function (e) {
    if (isOpen() && e.relatedTarget && !nav.contains(e.relatedTarget)) setOpen(false);
  });
  // Pointer down outside the nav closes it (focus is not moved)
  document.addEventListener('pointerdown', function (e) {
    if (isOpen() && !nav.contains(e.target)) setOpen(false);
  });
  // Crossing the breakpoint closes it
  mq.addEventListener('change', function () { setOpen(false); });
})();

/* Forms — input.md §3.4/3.5 + button.md loading/error. One validator shared by:
     - the contact form (lien-he.html, #contact-form, ids cf-*)
     - the course registration form (khoa-hoc.html, #course-form, ids rf-*)
     - the account forms (dang-ky.html / dang-nhap.html, via window.HM_FORMS in account.js)
   Contact + course-registration backend: [CẦN BỔ SUNG]. Those two forms therefore always end
   in the error state; forms given cfg.submit (account forms) post to the Node server.
   Each field: <id> input/select/textarea + <id>-error (aria-live) in the markup. */
(function () {
  function phoneCheck(v) {
    if (!v) return 'Nhập số điện thoại để chúng tôi gọi lại.';
    return /^\+?[0-9]{9,12}$/.test(v.replace(/[\s.-]/g, '')) ? '' : 'Nhập số điện thoại hợp lệ: 9–12 chữ số, có thể bắt đầu bằng +84.';
  }
  function emailCheck(v, el) { return !v || el.validity.valid ? '' : 'Nhập email hợp lệ, ví dụ ten@congty.vn.'; }
  function optional() { return ''; }

  var pointerDown = false, pending = [];
  document.addEventListener('pointerdown', function () { pointerDown = true; }, true);
  document.addEventListener('pointerup', function () {
    pointerDown = false;
    setTimeout(function () { // after the click has been dispatched
      pending.splice(0).forEach(function (f) { if (f.el.value.trim()) f.check(); });
    }, 0);
  }, true);

  function setup(cfg) {
    var form = document.getElementById(cfg.form);
    if (!form) return;
    var btn = document.getElementById(cfg.prefix + '-submit');
    var btnError = document.getElementById(cfg.prefix + '-submit-error');
    var status = document.getElementById(cfg.prefix + '-status');
    var fields = cfg.fields;

    fields.forEach(function (f) {
      f.el = document.getElementById(f.id);
      f.err = document.getElementById(f.id + '-error');
      f.hint = f.el.getAttribute('aria-describedby') || ''; // hint id(s) always kept
      f.touched = false;
      f.check = function () { return check(f); };
      // Blur validation is deferred while a pointer is pressed: showing an error on mousedown would
      // shift the submit button before mouseup and swallow the click.
      f.el.addEventListener('blur', function () {
        if (!f.el.value.trim()) return;
        if (pointerDown) pending.push(f); else check(f);
      });
      function recheck() { if (f.touched && f.el.getAttribute('aria-invalid') === 'true') check(f); }
      f.el.addEventListener('input', recheck);
      f.el.addEventListener('change', recheck); // <select>: also fired when a course card preselects it
    });

    // input.md §3.4: error id + aria-invalid added/removed together; error first, then hint
    function check(f) {
      f.touched = true;
      var v = f.el.value.trim();
      if (f.el.type === 'email') f.el.value = v;
      var msg = f.validate(v, f.el);
      f.err.textContent = msg;
      if (msg) {
        f.el.setAttribute('aria-invalid', 'true');
        f.el.setAttribute('aria-describedby', (f.err.id + ' ' + f.hint).trim());
      } else {
        f.el.removeAttribute('aria-invalid');
        if (f.hint) f.el.setAttribute('aria-describedby', f.hint); else f.el.removeAttribute('aria-describedby');
      }
      return !msg;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (btn.getAttribute('aria-busy') === 'true') return;
      btn.removeAttribute('data-state'); btn.removeAttribute('aria-describedby'); btnError.textContent = '';
      var firstInvalid = null;
      fields.forEach(function (f) { if (!check(f) && !firstInvalid) firstInvalid = f.el; });
      if (firstInvalid) { firstInvalid.focus(); return; }

      btn.style.width = btn.offsetWidth + 'px';
      btn.setAttribute('aria-busy', 'true');
      status.textContent = 'Đang gửi…';
      function done() { btn.removeAttribute('aria-busy'); btn.style.width = ''; status.textContent = ''; }
      function showError(msg) {
        btn.setAttribute('data-state', 'error');
        btn.setAttribute('aria-describedby', btnError.id);
        btnError.textContent = msg;
      }
      // cfg.submit(values) → Promise (server-backed forms). Server field errors map back onto the fields.
      if (cfg.submit) {
        var values = {};
        fields.forEach(function (f) { values[f.el.name] = f.el.type === 'password' ? f.el.value : f.el.value.trim(); });
        cfg.submit(values).then(function (msg) { done(); if (msg) status.textContent = msg; }, function (err) {
          done();
          var fe = err.data && err.data.errors, first = null;
          if (fe) fields.forEach(function (f) {
            if (fe[f.el.name]) {
              f.err.textContent = fe[f.el.name]; f.el.setAttribute('aria-invalid', 'true');
              f.el.setAttribute('aria-describedby', (f.err.id + ' ' + f.hint).trim()); f.touched = true;
              if (!first) first = f.el;
            }
          });
          showError(err.message);
          if (first) first.focus();
        });
        return;
      }
      setTimeout(function () { done(); showError(cfg.failMessage); }, 1200);
    });
  }
  window.HM_FORMS = { setup: setup, phoneCheck: phoneCheck, emailCheck: emailCheck, optional: optional };

  setup({
    form: 'contact-form', prefix: 'cf',
    fields: [
      { id: 'cf-name', validate: function (v) { return v ? '' : 'Nhập họ tên của bạn.'; } },
      { id: 'cf-phone', validate: phoneCheck },
      { id: 'cf-email', validate: emailCheck },
      { id: 'cf-need', validate: optional }
    ],
    failMessage: 'Chưa gửi được: biểu mẫu chưa kết nối máy chủ. Vui lòng gọi hotline hoặc nhắn qua kênh ở mục Liên hệ.'
  });

  setup({
    form: 'course-form', prefix: 'rf',
    fields: [
      { id: 'rf-name', validate: function (v) { return v ? '' : 'Nhập họ tên của bạn.'; } },
      { id: 'rf-phone', validate: phoneCheck },
      { id: 'rf-email', validate: emailCheck },
      { id: 'rf-course', validate: function (v) { return v ? '' : 'Chọn khóa học bạn muốn đăng ký.'; } },
      { id: 'rf-note', validate: optional }
    ],
    failMessage: 'Chưa đăng ký được: biểu mẫu chưa kết nối máy chủ và cổng thanh toán. Vui lòng gọi hotline hoặc nhắn qua kênh ở trang Liên hệ.'
  });
})();

/* Header account link (all pages): "Đăng nhập" by default (no-JS / static hosting).
   When the Node server says a user is logged in, it becomes "Bài học của tôi" (or "Quản trị"). */
(function () {
  var link = document.querySelector('[data-account-link]');
  if (!link || !window.fetch || location.protocol === 'file:') return;
  fetch('/api/me', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
    .then(function (r) { return r.ok && /json/.test(r.headers.get('content-type') || '') ? r.json() : null; })
    .then(function (d) {
      if (!d || !d.user) return;
      var admin = d.user.role === 'admin';
      var href = admin ? 'quan-tri.html' : 'bai-hoc-cua-toi.html';
      link.href = (link.getAttribute('href').charAt(0) === '/' ? '/' : '') + href;
      link.textContent = admin ? 'Quản trị' : 'Bài học của tôi';
      var here = location.pathname.replace(/^.*\//, '') || 'index.html';
      if (here === href || here + '.html' === href) link.setAttribute('aria-current', 'page');
    })
    .catch(function () {});
})();

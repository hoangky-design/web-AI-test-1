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

/* Rich footer: shared across every static page. The existing HTML footer remains
   as a no-JS fallback; this enhancement gives visitors the full branch/map UI. */
(function () {
  var footer = document.querySelector('.site-footer');
  if (!footer) return;

  var branches = [
    {
      code: 'CS1', city: 'Hải Phòng',
      address: 'Tổ dân phố Phi Xá (Nhà ông Bùi Văn Tuyến), Phường An Phong, TP Hải Phòng',
      query: 'Tổ dân phố Phi Xá, Phường An Phong, Hải Phòng'
    },
    {
      code: 'CS2', city: 'Hải Phòng',
      address: 'Hoàng Huy Commerce, Lê Chân, Hải Phòng',
      query: 'Hinton Group Media & Truyền Thông, Hải Phòng'
    },
    {
      code: 'CS3', city: 'Hà Nội',
      address: '66 Hồ Tùng Mậu, Cầu Giấy, Hà Nội',
      query: '66 Hồ Tùng Mậu, Cầu Giấy, Hà Nội'
    },
    {
      code: 'CS4', city: 'TP. Hồ Chí Minh',
      address: 'Chung cư Conic Riverside, Phường 7, Quận 8, TP.HCM',
      query: 'Chung cư Conic Riverside, Phường 7, Quận 8, TP Hồ Chí Minh'
    }
  ];

  function branchMarkup(b) {
    return '<article class="footer-branch">' +
      '<h3><span>' + b.code + '</span>' + b.city + '</h3>' +
      '<address>' + b.address + '</address>' +
    '</article>';
  }
  function optionMarkup(b, i) {
    return '<option value="' + i + '"' + (i === 1 ? ' selected' : '') + '>' +
      b.code + ' · ' + (i === 1 ? 'Hinton Group Media & Truyền Thông' : b.city) + '</option>';
  }
  function mapEmbed(b) {
    return 'https://www.google.com/maps?q=' + encodeURIComponent(b.query) + '&output=embed';
  }
  function mapOpen(b) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(b.query);
  }

  footer.innerHTML =
    '<div class="container footer-inner footer-shell">' +
      '<div class="footer-intro">' +
        '<a class="footer-brand" href="index.html" aria-label="Hinton Media — Trang chủ">' +
          '<picture><source type="image/webp" srcset="assets/logo/logo-horizontal.webp">' +
          '<img src="assets/logo/logo-horizontal.png" width="138" height="28" alt="Hinton Media" loading="lazy" decoding="async"></picture>' +
        '</a>' +
        '<p>Truyền thông, tiếp thị và đào tạo thực hành giúp thương hiệu tạo dấu ấn trên nền tảng số.</p>' +
      '</div>' +
      '<nav class="footer-nav footer-discover" aria-label="Khám phá">' +
        '<p class="footer-eyebrow">Khám phá</p>' +
        '<ul class="footer-nav-list" role="list">' +
          '<li><a href="gioi-thieu.html">Về Hinton</a></li>' +
          '<li><a href="dich-vu.html">Dịch vụ</a></li>' +
          '<li><a href="khach-hang.html">Dự án</a></li>' +
          '<li><a href="tin-tuc.html">Bài viết</a></li>' +
          '<li><a href="bai-hoc-cua-toi.html">Dành cho học viên</a></li>' +
        '</ul>' +
      '</nav>' +
      '<div class="footer-rule" aria-hidden="true"></div>' +
      '<section class="footer-locations" aria-labelledby="footer-locations-title">' +
        '<h2 id="footer-locations-title">Hệ thống cơ sở</h2>' +
        '<div class="footer-branch-grid">' + branches.map(branchMarkup).join('') + '</div>' +
        '<div class="footer-contact-card">' +
          '<div class="footer-hotlines"><span>Điện thoại tư vấn</span>' +
            '<div><a href="tel:+84365061186">0365 061 186</a><a href="tel:+84902223730">090 222 37 30</a></div>' +
          '</div>' +
          '<div class="footer-email-info"><span>Email</span>' +
            '<a class="footer-email" href="mailto:congtyhintongroup@gmail.com">congtyhintongroup@gmail.com</a>' +
          '</div>' +
          '<a class="footer-cta" href="lien-he.html">Nhận tư vấn <span aria-hidden="true">↗</span></a>' +
        '</div>' +
      '</section>' +
      '<section class="footer-map-panel" aria-labelledby="footer-map-heading">' +
        '<h2 id="footer-map-heading">Tìm đường đến Hinton</h2>' +
        '<label for="footer-location-select">Chọn cơ sở</label>' +
        '<select id="footer-location-select" class="footer-location-select">' + branches.map(optionMarkup).join('') + '</select>' +
        '<div class="footer-map-canvas">' +
          '<iframe id="footer-map-frame" src="' + mapEmbed(branches[1]) + '" title="Bản đồ Hinton Group Media &amp; Truyền Thông tại Hải Phòng" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>' +
        '</div>' +
        '<p class="footer-map-note">Bản đồ tìm theo địa chỉ. Vui lòng liên hệ để xác nhận điểm đến cụ thể.</p>' +
        '<a id="footer-map-link" class="footer-map-link" href="' + mapOpen(branches[1]) + '" target="_blank" rel="noopener noreferrer">Mở chỉ đường ↗ <span class="visually-hidden">(mở tab mới)</span></a>' +
      '</section>' +
      '<div class="footer-bottom">' +
        '<p>© 2026 Hinton Media</p>' +
        '<p>Để tác phẩm nói lên giá trị.</p>' +
        '<a href="#top" data-back-to-top>Lên đầu trang ↑</a>' +
      '</div>' +
    '</div>' +
    '<aside class="footer-social-rail" aria-label="Liên hệ nhanh">' +
      '<a class="footer-social footer-social-phone" href="tel:+84365061186" aria-label="Gọi Hinton Media">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 2.8 9 2.2l2 4.7-1.7 1.4a15.2 15.2 0 0 0 6.4 6.4l1.4-1.7 4.7 2-.6 2.4a3 3 0 0 1-3.2 2.3C10.7 18.8 5.2 13.3 4.3 6A3 3 0 0 1 6.6 2.8Z"/></svg>' +
      '</a>' +
      '<a class="footer-social footer-social-facebook" href="https://www.facebook.com/BuiHuuThangTeam" target="_blank" rel="noopener noreferrer" aria-label="Facebook Hinton Media"><span aria-hidden="true">f</span></a>' +
      '<a class="footer-social footer-social-zalo" href="https://zalo.me/84365061186" target="_blank" rel="noopener noreferrer" aria-label="Zalo Hinton Media"><span aria-hidden="true">Zalo</span></a>' +
    '</aside>';

  var select = document.getElementById('footer-location-select');
  var frame = document.getElementById('footer-map-frame');
  var mapLink = document.getElementById('footer-map-link');
  select.addEventListener('change', function () {
    var branch = branches[Number(select.value)] || branches[1];
    frame.src = mapEmbed(branch);
    frame.title = 'Bản đồ ' + branch.code + ' Hinton Media tại ' + branch.address;
    mapLink.href = mapOpen(branch);
  });

  var current = location.pathname.replace(/^.*\//, '') || 'index.html';
  Array.prototype.forEach.call(footer.querySelectorAll('.footer-nav a'), function (a) {
    if (a.getAttribute('href') === current) a.setAttribute('aria-current', 'page');
  });
  var topLink = footer.querySelector('[data-back-to-top]');
  topLink.addEventListener('click', function (e) {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();

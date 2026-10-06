/* Account pages: dang-ky.html (#register-form, ids rg-*) and dang-nhap.html (#login-form, ids lg-*).
   Validation/UI states come from site.js (window.HM_FORMS); requests go to the Node server.
   Static hosting (no server): the pages show #server-required instead of the form. */
(function () {
  if (!window.HM_FORMS || !window.HM) return;
  var F = window.HM_FORMS, HM = window.HM;
  var next = HM.safeNext('/bai-hoc-cua-toi.html') + (location.hash || '');

  function go(user) {
    var dest = next;
    if (user && user.role === 'admin' && dest === '/bai-hoc-cua-toi.html') dest = '/quan-tri.html';
    location.assign(dest);
  }

  // Already logged in → straight to the destination. No server → explain instead of a dead form.
  var form = document.getElementById('register-form') || document.getElementById('login-form');
  if (!form) return;
  HM.me().then(function (u) { if (u) go(u); }, function (err) {
    if (err.status === 0 || err.status === 404) {
      var note = document.getElementById('server-required');
      if (note) note.hidden = false;
    }
  });
  // Keep ?next= when switching between login and register
  Array.prototype.forEach.call(document.querySelectorAll('[data-keep-next]'), function (a) {
    if (location.search) a.href = a.getAttribute('href').split('?')[0] + location.search + location.hash;
  });

  F.setup({
    form: 'register-form', prefix: 'rg',
    fields: [
      { id: 'rg-name', validate: function (v) { return v ? '' : 'Nhập họ tên của bạn.'; } },
      { id: 'rg-phone', validate: F.phoneCheck },
      { id: 'rg-email', validate: function (v, el) { return !v ? 'Nhập email để đăng nhập.' : F.emailCheck(v, el); } },
      { id: 'rg-password', validate: function (v) { return v.length >= 8 ? '' : 'Mật khẩu cần ít nhất 8 ký tự.'; } },
      { id: 'rg-password2', validate: function (v) {
          return v && v === document.getElementById('rg-password').value ? '' : 'Mật khẩu nhập lại chưa khớp.';
        } }
    ],
    submit: function (v) {
      return HM.api('/api/auth/register', { body: { name: v.name, phone: v.phone, email: v.email, password: v.password } })
        .then(function (d) { go(d.user); return 'Đã tạo tài khoản. Đang chuyển trang…'; });
    }
  });

  F.setup({
    form: 'login-form', prefix: 'lg',
    fields: [
      { id: 'lg-email', validate: function (v, el) { return !v ? 'Nhập email đã đăng ký.' : F.emailCheck(v, el); } },
      { id: 'lg-password', validate: function (v) { return v ? '' : 'Nhập mật khẩu.'; } }
    ],
    submit: function (v) {
      return HM.api('/api/auth/login', { body: { email: v.email, password: v.password } })
        .then(function (d) { go(d.user); return 'Đăng nhập thành công. Đang chuyển trang…'; });
    }
  });
})();

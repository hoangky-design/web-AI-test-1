/* quan-tri.html — admin dashboard. Every call hits /api/admin/* which re-checks the admin role
   on the server; this file is only the UI. Tabs: Tổng quan · Khóa học (+ video) · Thanh toán ·
   Khách hàng · Bài viết · Cài đặt. Tab state lives in the URL hash (#tong-quan, #khoa-hoc, …). */
(function () {
  var HM = window.HM; if (!HM) return;
  var h = HM.h, api = HM.api;
  var status = document.getElementById('admin-status');
  var say = function (m) { HM.announce(status, m); toast(m); };

  /* ---------- Small UI helpers ---------- */
  var toastEl = document.getElementById('admin-toast');
  var toastTimer;
  function toast(msg, isError) {
    toastEl.textContent = msg; toastEl.hidden = false; toastEl.classList.toggle('is-error', !!isError);
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.hidden = true; }, 3500);
  }
  function fail(err) { toast(err.message || String(err), true); HM.announce(status, err.message); }
  function btn(label, cls, onclick, extra) {
    var b = h('button', Object.assign({ class: 'btn ' + (cls || 'btn-secondary') + ' btn-small', type: 'button', title: label }, extra || {}),
      h('span', { class: 'btn-label', text: label }));
    if (onclick) b.addEventListener('click', onclick);
    return b;
  }
  var uid = 0;
  function field(label, input, opts) {
    opts = opts || {};
    var id = input.id || (input.id = 'af-' + (++uid));
    var hintId = opts.hint ? id + '-hint' : null;
    if (hintId) input.setAttribute('aria-describedby', hintId);
    return h('div', { class: 'field' + (opts.cls ? ' ' + opts.cls : '') },
      h('label', { class: 'field-label', for: id }, label, opts.optional ? h('span', { class: 'field-optional', text: ' (không bắt buộc)' }) : null),
      input, hintId ? h('p', { class: 'field-hint', id: hintId, text: opts.hint }) : null);
  }
  function input(name, value, attrs) { return h('input', Object.assign({ class: 'field-input', name: name, value: value == null ? '' : value }, attrs || {})); }
  function textarea(name, value, attrs) { var t = h('textarea', Object.assign({ class: 'field-input field-textarea', name: name }, attrs || {})); t.value = value || ''; return t; }
  function check(name, checked, label) {
    var i = h('input', { type: 'checkbox', class: 'check-input', name: name, id: 'af-' + (++uid) }); i.checked = !!checked;
    return h('div', { class: 'check-field' }, i, h('label', { class: 'check-label', for: i.id, text: label }));
  }
  function select(name, options, value) {
    var s = h('select', { class: 'field-input field-select', name: name });
    options.forEach(function (o) { var op = h('option', { value: o[0], text: o[1] }); if (String(o[0]) === String(value)) op.selected = true; s.appendChild(op); });
    return s;
  }
  function badge(text, kind) { return h('span', { class: 'status-badge status-' + kind, text: text }); }
  function empty(text) { return h('p', { class: 'card-text admin-empty', text: text }); }
  // Datetime helpers: <input type="datetime-local"> works in local (Vietnam) time
  function toLocalInput(iso) {
    if (!iso) return '';
    var d = new Date(iso); var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function fromLocalInput(v) { return v ? new Date(v).toISOString() : ''; }

  /* Native <dialog>: focus is trapped and Esc closes; returns focus to the opener */
  function dialog(title, body, onSave, saveLabel) {
    var opener = document.activeElement;
    var titleId = 'dlg-' + (++uid);
    var err = h('p', { class: 'btn-error-text', role: 'alert' });
    var save = h('button', { class: 'btn btn-primary', type: 'submit', title: saveLabel || 'Lưu' },
      h('span', { class: 'btn-spinner', 'aria-hidden': 'true' }), h('span', { class: 'btn-label', text: saveLabel || 'Lưu' }));
    var form = h('form', { class: 'admin-dialog-form', novalidate: true },
      h('div', { class: 'admin-dialog-head' }, h('h2', { class: 'admin-dialog-title', id: titleId, text: title }),
        h('button', { class: 'btn btn-ghost btn-small', type: 'button', title: 'Đóng', onclick: function () { d.close(); } }, h('span', { class: 'btn-label', text: 'Đóng' }))),
      h('div', { class: 'admin-dialog-body' }, body),
      onSave ? h('div', { class: 'admin-dialog-foot' }, err, h('div', { class: 'form-actions' }, save)) : null);
    var d = h('dialog', { class: 'admin-dialog', 'aria-labelledby': titleId }, form);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (save.getAttribute('aria-busy') === 'true') return;
      save.setAttribute('aria-busy', 'true'); err.textContent = '';
      Promise.resolve().then(function () { return onSave(form); }).then(function (keepOpen) {
        save.removeAttribute('aria-busy'); if (!keepOpen) d.close();
      }, function (e2) { save.removeAttribute('aria-busy'); err.textContent = e2.message; });
    });
    d.addEventListener('close', function () { d.remove(); if (opener && opener.focus) opener.focus(); });
    document.body.appendChild(d);
    d.showModal();
    return d;
  }

  // Image picker: upload → /api/admin/uploads, or keep a path; shows a preview
  function imagePicker(name, value, label) {
    var hidden = h('input', { type: 'hidden', name: name, value: value || '' });
    var preview = h('img', { class: 'image-picker-preview', alt: '', hidden: !value, src: value || null });
    var file = h('input', { type: 'file', class: 'field-input field-file', accept: 'image/jpeg,image/png,image/webp,image/gif', id: 'af-' + (++uid) });
    var note = h('p', { class: 'field-hint', 'aria-live': 'polite', text: 'JPG, PNG, WebP hoặc GIF, tối đa 5 MB.' });
    var clear = btn('Bỏ ảnh', 'btn-ghost', function () { hidden.value = ''; preview.hidden = true; preview.removeAttribute('src'); note.textContent = 'Đã bỏ ảnh.'; });
    file.addEventListener('change', function () {
      if (!file.files[0]) return;
      var fd = new FormData(); fd.append('file', file.files[0]);
      note.textContent = 'Đang tải ảnh…';
      HM.upload('/api/admin/uploads', fd, 'POST').then(function (d) {
        hidden.value = d.url; preview.src = d.url; preview.hidden = false; note.textContent = 'Đã tải ảnh lên.'; file.value = '';
      }, function (e) { note.textContent = e.message; });
    });
    return h('div', { class: 'field image-picker' }, h('label', { class: 'field-label', for: file.id }, label, h('span', { class: 'field-optional', text: ' (không bắt buộc)' })),
      preview, file, h('div', { class: 'image-picker-actions' }, clear), note, hidden);
  }

  /* ---------- Tabs (WAI-ARIA tabs, manual activation, arrow keys) ---------- */
  var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));
  var loaders = {};
  function activate(tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
    if (focus) tab.focus();
    var key = tab.dataset.tab;
    if (history.replaceState) history.replaceState(null, '', '#' + key);
    if (loaders[key]) loaders[key]();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { activate(t); });
    t.addEventListener('keydown', function (e) {
      var j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (j == null) return;
      e.preventDefault(); activate(tabs[(j + tabs.length) % tabs.length], true);
    });
  });
  document.getElementById('admin-logout').addEventListener('click', function () { HM.logout(); });

  /* ---------- Tổng quan ---------- */
  var pDash = document.getElementById('panel-tong-quan');
  loaders['tong-quan'] = function () {
    api('/api/admin/stats').then(function (d) {
      var c = d.counts;
      pDash.textContent = '';
      if (!d.bank_configured) pDash.appendChild(h('p', { class: 'admin-alert' }, 'Chưa có thông tin chuyển khoản: học viên sẽ thấy ',
        HM.placeholder('tên ngân hàng / số tài khoản'), '. ', h('a', { href: '#cai-dat', onclick: function (e) { e.preventDefault(); activate(tabs[5], true); }, text: 'Điền ở tab Cài đặt' }), '.'));
      function stat(label, value, sub, tabIndex) {
        return h('li', { class: 'stat-card' }, h('p', { class: 'stat-label', text: label }), h('p', { class: 'stat-value', text: String(value) }),
          sub ? h('p', { class: 'stat-sub', text: sub }) : null,
          tabIndex != null ? h('button', { class: 'stat-link', type: 'button', onclick: function () { activate(tabs[tabIndex], true); } }, 'Mở', h('span', { class: 'visually-hidden', text: ' ' + label })) : null);
      }
      pDash.appendChild(h('ul', { class: 'stat-grid', role: 'list' },
        stat('Chờ duyệt thanh toán', c.pending_payments, null, 2),
        stat('Khách hàng', c.customers, null, 3),
        stat('Khóa học', c.courses, c.courses_published + ' đang mở bán · ' + c.videos + ' video', 1),
        stat('Bài viết', c.posts, c.posts_published + ' đã đăng', 4),
        stat('Đã thu (đã duyệt)', HM.vnd(c.revenue_approved))));
      pDash.appendChild(h('h2', { class: 'admin-h2', text: 'Hoạt động gần đây' }));
      if (!d.activity.length) pDash.appendChild(empty('Chưa có hoạt động.'));
      else pDash.appendChild(h('ol', { class: 'activity-list', role: 'list' }, d.activity.map(function (a) {
        return h('li', { class: 'activity-item' }, h('time', { class: 'activity-time', datetime: a.at, text: HM.date(a.at, true) }),
          h('span', { class: 'activity-text', text: a.detail || a.action }));
      })));
      var pend = document.querySelector('[data-tab="thanh-toan"] .tab-count');
      pend.textContent = c.pending_payments ? String(c.pending_payments) : ''; pend.hidden = !c.pending_payments;
    }, fail);
  };

  /* ---------- Khóa học + video ---------- */
  var pCourses = document.getElementById('panel-khoa-hoc');
  function courseForm(c) {
    c = c || { published: 0, price: 0, sort_order: 0 };
    return [
      field('Tên khóa học', input('title', c.title, { required: true, maxlength: 200 })),
      field('Mô tả', textarea('description', c.description, { rows: 4 }), { optional: true }),
      h('div', { class: 'field-row' },
        field('Học phí (VNĐ)', input('price', c.price, { type: 'number', min: 0, step: 1000, inputmode: 'numeric', required: true }), { hint: 'Số tiền học viên chuyển khoản, ví dụ 1500000.' }),
        field('Thứ tự hiển thị', input('sort_order', c.sort_order, { type: 'number', step: 1 }), { optional: true })),
      imagePicker('thumbnail', c.thumbnail, 'Ảnh đại diện'),
      h('div', { class: 'field-row' },
        field('Trình độ', input('level', c.level), { optional: true }),
        field('Thời lượng', input('duration', c.duration), { optional: true }),
        field('Hình thức', input('format', c.format), { optional: true })),
      check('published', c.published, 'Mở bán (hiện trên trang Khóa học và Bài học của tôi)')
    ];
  }
  function readForm(form) {
    var o = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name) return;
      if (el.type === 'checkbox') o[el.name] = el.checked; else if (el.type !== 'file') o[el.name] = el.value;
    });
    return o;
  }
  loaders['khoa-hoc'] = function () {
    api('/api/admin/courses').then(function (d) {
      pCourses.textContent = '';
      pCourses.appendChild(h('div', { class: 'admin-toolbar' }, h('h2', { class: 'admin-h2', text: 'Khóa học (' + d.courses.length + ')' }),
        btn('Thêm khóa học', 'btn-primary', function () {
          dialog('Thêm khóa học', courseForm(), function (form) {
            return api('/api/admin/courses', { body: readForm(form) }).then(function () { say('Đã thêm khóa học.'); loaders['khoa-hoc'](); });
          });
        })));
      if (!d.courses.length) { pCourses.appendChild(empty('Chưa có khóa học. Bấm «Thêm khóa học».')); return; }
      var table = h('table', { class: 'admin-table' },
        h('thead', null, h('tr', null, ['Khóa học', 'Học phí', 'Video', 'Học viên', 'Trạng thái', 'Thao tác'].map(function (t) { return h('th', { scope: 'col', text: t }); }))),
        h('tbody', null, d.courses.map(function (c) {
          return h('tr', null,
            h('td', { 'data-label': 'Khóa học' }, h('div', { class: 'admin-cell-title' },
              c.thumbnail ? h('img', { class: 'admin-thumb', src: c.thumbnail, alt: '', width: 64, height: 36, loading: 'lazy' }) : null,
              h('strong', { text: c.title }))),
            h('td', { 'data-label': 'Học phí', text: HM.vnd(c.price) }),
            h('td', { 'data-label': 'Video', text: String(c.video_count) }),
            h('td', { 'data-label': 'Học viên', text: String(c.student_count) }),
            h('td', { 'data-label': 'Trạng thái' }, c.published ? badge('Đang bán', 'open') : badge('Ẩn', 'locked')),
            h('td', { 'data-label': 'Thao tác' }, h('div', { class: 'admin-actions' },
              btn('Video', 'btn-primary', function () { videoManager(c); }, { 'aria-label': 'Quản lý video: ' + c.title }),
              btn('Sửa', 'btn-secondary', function () {
                dialog('Sửa khóa học', courseForm(c), function (form) {
                  return api('/api/admin/courses/' + c.id, { method: 'PUT', body: readForm(form) }).then(function () { say('Đã lưu khóa học.'); loaders['khoa-hoc'](); });
                });
              }, { 'aria-label': 'Sửa: ' + c.title }),
              btn('Xóa', 'btn-ghost btn-danger', function () {
                if (!confirm('Xóa khóa học «' + c.title + '»? Toàn bộ video, yêu cầu thanh toán và quyền xem của khóa này sẽ bị xóa.')) return;
                api('/api/admin/courses/' + c.id, { method: 'DELETE' }).then(function () { say('Đã xóa khóa học.'); loaders['khoa-hoc'](); }, fail);
              }, { 'aria-label': 'Xóa: ' + c.title }))));
        })));
      pCourses.appendChild(h('div', { class: 'admin-table-wrap' }, table));
      pCourses.appendChild(h('div', { id: 'video-manager', class: 'video-manager', tabindex: '-1' }));
    }, fail);
  };

  function videoForm(v) {
    v = v || { source_type: 'file', published: 1 };
    var typeName = 'source_type';
    var rFile = h('input', { type: 'radio', name: typeName, value: 'file', id: 'af-' + (++uid), class: 'check-input' });
    var rEmbed = h('input', { type: 'radio', name: typeName, value: 'embed', id: 'af-' + (++uid), class: 'check-input' });
    rFile.checked = v.source_type !== 'embed'; rEmbed.checked = v.source_type === 'embed';
    var fileField = field(v.id ? 'Thay tệp video' : 'Tệp video', h('input', { type: 'file', name: 'file', class: 'field-input field-file', accept: 'video/mp4,video/webm,video/quicktime,.mp4,.m4v,.webm,.mov' }),
      { hint: 'MP4 (H.264/AAC) phát được trên mọi trình duyệt. Tệp lưu ngoài thư mục public, chỉ phát qua máy chủ sau khi kiểm tra quyền.' + (v.id && v.file_name ? ' Để trống nếu giữ tệp hiện tại.' : ''), optional: !!(v.id && v.file_name) });
    var embedField = field('Link YouTube (không công khai) hoặc Vimeo', input('embed_url', v.embed_url, { type: 'url', inputmode: 'url', placeholder: 'https://youtu.be/…' }),
      { hint: 'Link chỉ được gửi cho học viên đã mở khóa. Lưu ý: người xem có quyền vẫn có thể chia sẻ link YouTube.' });
    function sync() { fileField.hidden = !rFile.checked; embedField.hidden = !rEmbed.checked; }
    rFile.addEventListener('change', sync); rEmbed.addEventListener('change', sync); sync();
    return [
      field('Tiêu đề video', input('title', v.title, { required: true, maxlength: 200 })),
      field('Mô tả', textarea('description', v.description, { rows: 3 }), { optional: true }),
      h('fieldset', { class: 'check-group' }, h('legend', { class: 'field-label', text: 'Nguồn video' }),
        h('div', { class: 'check-field' }, rFile, h('label', { class: 'check-label', for: rFile.id, text: 'Tải tệp lên máy chủ' })),
        h('div', { class: 'check-field' }, rEmbed, h('label', { class: 'check-label', for: rEmbed.id, text: 'Link nhúng (YouTube/Vimeo)' }))),
      fileField, embedField,
      check('published', v.published, 'Hiển thị trong khóa học'),
      h('progress', { class: 'upload-progress', max: 100, value: 0, hidden: true })
    ];
  }
  function saveVideo(form, url, method) {
    var fd = new FormData(form);
    fd.set('published', form.elements.published.checked ? '1' : '0');
    var f = form.elements.file && form.elements.file.files[0];
    if (!f) fd.delete('file');
    var prog = form.querySelector('.upload-progress');
    if (f) { prog.hidden = false; prog.value = 0; }
    return HM.upload(url, fd, method, function (r) { prog.value = Math.round(r * 100); });
  }
  function videoManager(c) {
    var box = document.getElementById('video-manager');
    api('/api/admin/courses/' + c.id + '/videos').then(function (d) {
      box.textContent = '';
      box.appendChild(h('div', { class: 'admin-toolbar' }, h('h2', { class: 'admin-h2', text: 'Video của «' + c.title + '» (' + d.videos.length + ')' }),
        btn('Thêm video', 'btn-primary', function () {
          dialog('Thêm video vào «' + c.title + '»', videoForm(), function (form) {
            return saveVideo(form, '/api/admin/courses/' + c.id + '/videos', 'POST').then(function () { say('Đã thêm video.'); videoManager(c); });
          });
        })));
      if (!d.videos.length) box.appendChild(empty('Khóa học chưa có video.'));
      var ids = d.videos.map(function (v) { return v.id; });
      function move(i, delta) {
        var j = i + delta; if (j < 0 || j >= ids.length) return;
        var t = ids[i]; ids[i] = ids[j]; ids[j] = t;
        api('/api/admin/courses/' + c.id + '/videos/order', { body: { ids: ids } }).then(function () { say('Đã đổi thứ tự.'); videoManager(c); }, fail);
      }
      box.appendChild(h('ol', { class: 'admin-video-list', role: 'list' }, d.videos.map(function (v, i) {
        return h('li', { class: 'admin-video-item' },
          h('div', { class: 'admin-video-info' }, h('strong', { text: (i + 1) + '. ' + v.title }),
            h('span', { class: 'admin-muted', text: (v.source_type === 'embed' ? 'Link nhúng' : 'Tệp tải lên') + (v.published ? '' : ' · Ẩn') })),
          h('div', { class: 'admin-actions' },
            btn('Lên', 'btn-ghost', function () { move(i, -1); }, { disabled: i === 0, 'aria-label': 'Chuyển lên: ' + v.title }),
            btn('Xuống', 'btn-ghost', function () { move(i, 1); }, { disabled: i === d.videos.length - 1, 'aria-label': 'Chuyển xuống: ' + v.title }),
            btn('Sửa', 'btn-secondary', function () {
              dialog('Sửa video', videoForm(v), function (form) {
                return saveVideo(form, '/api/admin/videos/' + v.id, 'PUT').then(function () { say('Đã lưu video.'); videoManager(c); });
              });
            }, { 'aria-label': 'Sửa: ' + v.title }),
            btn('Xóa', 'btn-ghost btn-danger', function () {
              if (!confirm('Xóa video «' + v.title + '»?')) return;
              api('/api/admin/videos/' + v.id, { method: 'DELETE' }).then(function () { say('Đã xóa video.'); videoManager(c); }, fail);
            }, { 'aria-label': 'Xóa: ' + v.title })));
      })));
      box.focus();
    }, fail);
  }

  /* ---------- Thanh toán ---------- */
  var pPay = document.getElementById('panel-thanh-toan');
  var payFilter = 'pending';
  var statusText = { pending: ['Chờ duyệt', 'pending'], approved: ['Đã duyệt', 'open'], rejected: ['Từ chối', 'closed'] };
  loaders['thanh-toan'] = function () {
    api('/api/admin/payments' + (payFilter ? '?status=' + payFilter : '')).then(function (d) {
      pPay.textContent = '';
      var sel = select('filter', [['pending', 'Chờ duyệt'], ['approved', 'Đã duyệt'], ['rejected', 'Từ chối'], ['', 'Tất cả']], payFilter);
      sel.addEventListener('change', function () { payFilter = sel.value; loaders['thanh-toan'](); });
      pPay.appendChild(h('div', { class: 'admin-toolbar' }, h('h2', { class: 'admin-h2', text: 'Yêu cầu thanh toán (' + d.payments.length + ')' }),
        field('Lọc', sel, { cls: 'field-inline' })));
      pPay.appendChild(h('p', { class: 'field-hint', text: 'Đối chiếu sao kê ngân hàng: đúng số tiền và nội dung chuyển khoản (HM<mã khách>K<mã khóa>) rồi bấm Duyệt. Duyệt sẽ mở khóa học cho học viên.' }));
      if (!d.payments.length) { pPay.appendChild(empty('Không có yêu cầu.')); return; }
      pPay.appendChild(h('div', { class: 'admin-table-wrap' }, h('table', { class: 'admin-table' },
        h('thead', null, h('tr', null, ['Thời gian', 'Học viên', 'Khóa học', 'Số tiền', 'Nội dung CK', 'Trạng thái', 'Thao tác'].map(function (t) { return h('th', { scope: 'col', text: t }); }))),
        h('tbody', null, d.payments.map(function (p) {
          var st = statusText[p.status];
          return h('tr', null,
            h('td', { 'data-label': 'Thời gian', text: HM.date(p.created_at, true) }),
            h('td', { 'data-label': 'Học viên' }, h('strong', { text: p.user_name }), h('br'), h('span', { class: 'admin-muted', text: p.user_email + ' · ' + p.user_phone })),
            h('td', { 'data-label': 'Khóa học', text: p.course_title }),
            h('td', { 'data-label': 'Số tiền', text: HM.vnd(p.amount) }),
            h('td', { 'data-label': 'Nội dung CK' }, h('code', { class: 'transfer-code', text: p.transfer_code })),
            h('td', { 'data-label': 'Trạng thái' }, badge(st[0], st[1])),
            h('td', { 'data-label': 'Thao tác' }, p.status === 'pending' ? h('div', { class: 'admin-actions' },
              btn('Duyệt', 'btn-primary', function () {
                api('/api/admin/payments/' + p.id + '/approve', { method: 'POST' }).then(function () { say('Đã duyệt và mở khóa học cho ' + p.user_name + '.'); loaders['thanh-toan'](); }, fail);
              }, { 'aria-label': 'Duyệt ' + p.transfer_code }),
              btn('Từ chối', 'btn-ghost btn-danger', function () {
                if (!confirm('Từ chối yêu cầu ' + p.transfer_code + '?')) return;
                api('/api/admin/payments/' + p.id + '/reject', { method: 'POST' }).then(function () { say('Đã từ chối yêu cầu.'); loaders['thanh-toan'](); }, fail);
              }, { 'aria-label': 'Từ chối ' + p.transfer_code })) : h('span', { class: 'admin-muted', text: HM.date(p.decided_at, true) })));
        })))));
    }, fail);
  };

  /* ---------- Khách hàng ---------- */
  var pUsers = document.getElementById('panel-khach-hang');
  var userQuery = '';
  function accessDialog(u) {
    api('/api/admin/users/' + u.id + '/access').then(function (d) {
      var rows = d.access.map(function (a) {
        var open = h('input', { type: 'checkbox', class: 'check-input', id: 'af-' + (++uid) }); open.checked = !!a.is_open;
        var exp = h('input', { type: 'date', class: 'field-input', id: 'af-' + (++uid), value: a.expires_at ? toLocalInput(a.expires_at).slice(0, 10) : '' });
        var save = btn('Lưu', 'btn-primary', function () {
          api('/api/admin/users/' + u.id + '/access/' + a.course_id, { method: 'PUT', body: { is_open: open.checked, expires_at: exp.value } })
            .then(function () { say((open.checked ? 'Đã mở' : 'Đã đóng') + ' «' + a.title + '» cho ' + u.name + '.'); }, fail);
        }, { 'aria-label': 'Lưu quyền «' + a.title + '»' });
        return h('li', { class: 'access-row' },
          h('p', { class: 'access-title' }, h('strong', { text: a.title }), a.published ? null : h('span', { class: 'admin-muted', text: ' (đang ẩn)' })),
          h('div', { class: 'access-controls' },
            h('div', { class: 'check-field' }, open, h('label', { class: 'check-label', for: open.id, text: 'Mở quyền xem' })),
            h('div', { class: 'field field-inline' }, h('label', { class: 'field-label', for: exp.id }, 'Hết hạn', h('span', { class: 'field-optional', text: ' (để trống = không hạn)' })), exp),
            save));
      });
      dialog('Quyền khóa học: ' + u.name, [h('p', { class: 'field-hint', text: u.email + ' · ' + u.phone }),
        rows.length ? h('ul', { class: 'access-list', role: 'list' }, rows) : empty('Chưa có khóa học.')], null);
    }, fail);
  }
  loaders['khach-hang'] = function () {
    api('/api/admin/users?q=' + encodeURIComponent(userQuery)).then(function (d) {
      pUsers.textContent = '';
      var q = input('q', userQuery, { type: 'search', placeholder: 'Tên, email hoặc số điện thoại' });
      var searchForm = h('form', { class: 'admin-search', role: 'search', onsubmit: function (e) { e.preventDefault(); userQuery = q.value.trim(); loaders['khach-hang'](); } },
        field('Tìm khách hàng', q, { cls: 'field-inline' }), btn('Tìm', 'btn-secondary', null, { type: 'submit' }));
      pUsers.appendChild(h('div', { class: 'admin-toolbar' }, h('h2', { class: 'admin-h2', text: 'Khách hàng (' + d.users.length + ')' }), searchForm));
      if (!d.users.length) { pUsers.appendChild(empty('Không có tài khoản phù hợp.')); return; }
      pUsers.appendChild(h('div', { class: 'admin-table-wrap' }, h('table', { class: 'admin-table' },
        h('thead', null, h('tr', null, ['Khách hàng', 'Liên hệ', 'Ngày tạo', 'Khóa đang mở', 'Trạng thái', 'Thao tác'].map(function (t) { return h('th', { scope: 'col', text: t }); }))),
        h('tbody', null, d.users.map(function (u) {
          return h('tr', null,
            h('td', { 'data-label': 'Khách hàng' }, h('strong', { text: u.name }), u.role === 'admin' ? h('span', { class: 'admin-muted', text: ' · quản trị' }) : null),
            h('td', { 'data-label': 'Liên hệ' }, h('span', { text: u.email }), h('br'), h('span', { class: 'admin-muted', text: u.phone })),
            h('td', { 'data-label': 'Ngày tạo', text: HM.date(u.created_at) }),
            h('td', { 'data-label': 'Khóa đang mở', text: String(u.open_courses) + (u.pending ? ' · ' + u.pending + ' chờ duyệt' : '') }),
            h('td', { 'data-label': 'Trạng thái' }, u.locked ? badge('Đã khóa', 'closed') : badge('Hoạt động', 'open')),
            h('td', { 'data-label': 'Thao tác' }, h('div', { class: 'admin-actions' },
              btn('Quyền khóa học', 'btn-primary', function () { accessDialog(u); }, { 'aria-label': 'Quyền khóa học: ' + u.name }),
              u.role === 'admin' ? null : btn(u.locked ? 'Mở khóa TK' : 'Khóa TK', 'btn-ghost' + (u.locked ? '' : ' btn-danger'), function () {
                if (!u.locked && !confirm('Khóa tài khoản ' + u.email + '? Người dùng sẽ bị đăng xuất và không đăng nhập được.')) return;
                api('/api/admin/users/' + u.id, { method: 'PUT', body: { locked: !u.locked } }).then(function () { say(u.locked ? 'Đã mở khóa tài khoản.' : 'Đã khóa tài khoản.'); loaders['khach-hang'](); }, fail);
              }, { 'aria-label': (u.locked ? 'Mở khóa tài khoản ' : 'Khóa tài khoản ') + u.name }))));
        })))));
    }, fail);
  };

  /* ---------- Bài viết ---------- */
  var pPosts = document.getElementById('panel-bai-viet');
  loaders['bai-viet'] = function () {
    api('/api/admin/posts').then(function (d) {
      pPosts.textContent = '';
      pPosts.appendChild(h('div', { class: 'admin-toolbar' }, h('h2', { class: 'admin-h2', text: 'Bài viết (' + d.posts.length + ')' }),
        btn('Viết bài mới', 'btn-primary', function () { postEditor(null); })));
      if (!d.posts.length) { pPosts.appendChild(empty('Chưa có bài viết.')); return; }
      pPosts.appendChild(h('div', { class: 'admin-table-wrap' }, h('table', { class: 'admin-table' },
        h('thead', null, h('tr', null, ['Tiêu đề', 'Chuyên mục', 'Trạng thái', 'Ngày đăng', 'Thao tác'].map(function (t) { return h('th', { scope: 'col', text: t }); }))),
        h('tbody', null, d.posts.map(function (p) {
          var live = p.status === 'published' && p.published_at && new Date(p.published_at) <= new Date();
          return h('tr', null,
            h('td', { 'data-label': 'Tiêu đề' }, h('strong', { text: p.title })),
            h('td', { 'data-label': 'Chuyên mục', text: p.category || '—' }),
            h('td', { 'data-label': 'Trạng thái' }, p.status === 'draft' ? badge('Nháp', 'locked') : live ? badge('Đã đăng', 'open') : badge('Hẹn giờ', 'pending')),
            h('td', { 'data-label': 'Ngày đăng', text: p.published_at ? HM.date(p.published_at, true) : '—' }),
            h('td', { 'data-label': 'Thao tác' }, h('div', { class: 'admin-actions' },
              btn('Sửa', 'btn-primary', function () { api('/api/admin/posts/' + p.id).then(function (r) { postEditor(r.post); }, fail); }, { 'aria-label': 'Sửa: ' + p.title }),
              live ? h('a', { class: 'btn btn-ghost btn-small', href: 'bai-viet.html?slug=' + encodeURIComponent(p.slug), target: '_blank', rel: 'noopener', title: 'Xem bài' },
                h('span', { class: 'btn-label', text: 'Xem' }), h('span', { class: 'visually-hidden', text: ': ' + p.title + ' (mở tab mới)' })) : null,
              btn('Xóa', 'btn-ghost btn-danger', function () {
                if (!confirm('Xóa bài viết «' + p.title + '»?')) return;
                api('/api/admin/posts/' + p.id, { method: 'DELETE' }).then(function () { say('Đã xóa bài viết.'); loaders['bai-viet'](); }, fail);
              }, { 'aria-label': 'Xóa: ' + p.title }))));
        })))));
    }, fail);
  };

  // Markdown editor: toolbar inserts syntax around the selection; preview is rendered + sanitized by the server
  function postEditor(p) {
    p = p || { status: 'draft' };
    pPosts.textContent = '';
    var content = textarea('content_md', p.content_md, { rows: 18, class: 'field-input field-textarea editor-textarea', spellcheck: 'true' });
    var preview = h('div', { class: 'editor-preview prose', hidden: true, 'aria-live': 'polite' });
    function wrap(before, after, ph) {
      var s = content.selectionStart, e = content.selectionEnd, sel = content.value.slice(s, e) || ph || '';
      content.setRangeText(before + sel + (after || ''), s, e, 'end');
      content.focus();
      if (!content.value.slice(s, e)) { content.selectionStart = s + before.length; content.selectionEnd = s + before.length + sel.length; }
    }
    function line(prefix) {
      var s = content.selectionStart; var start = content.value.lastIndexOf('\n', s - 1) + 1;
      content.setRangeText(prefix, start, start, 'end'); content.focus();
    }
    var imgInput = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', hidden: true });
    imgInput.addEventListener('change', function () {
      if (!imgInput.files[0]) return;
      var fd = new FormData(); fd.append('file', imgInput.files[0]);
      say('Đang tải ảnh…');
      HM.upload('/api/admin/uploads', fd, 'POST').then(function (d) { wrap('![Mô tả ảnh](' + d.url + ')', '', ''); say('Đã chèn ảnh.'); imgInput.value = ''; }, fail);
    });
    function tool(label, title, fn) { return h('button', { class: 'editor-tool', type: 'button', title: title, 'aria-label': title, onclick: fn, text: label }); }
    var writeTab = h('button', { class: 'editor-mode', type: 'button', 'aria-pressed': 'true', text: 'Soạn' });
    var previewTab = h('button', { class: 'editor-mode', type: 'button', 'aria-pressed': 'false', text: 'Xem trước' });
    writeTab.addEventListener('click', function () { writeTab.setAttribute('aria-pressed', 'true'); previewTab.setAttribute('aria-pressed', 'false'); content.hidden = false; preview.hidden = true; toolbar.hidden = false; });
    previewTab.addEventListener('click', function () {
      previewTab.setAttribute('aria-pressed', 'true'); writeTab.setAttribute('aria-pressed', 'false');
      api('/api/admin/posts/preview', { body: { content_md: content.value } }).then(function (d) {
        preview.innerHTML = d.html || '<p>(Chưa có nội dung)</p>'; // server-sanitized
        content.hidden = true; preview.hidden = false; toolbar.hidden = true;
      }, fail);
    });
    var toolbar = h('div', { class: 'editor-toolbar', role: 'toolbar', 'aria-label': 'Định dạng nội dung' },
      tool('B', 'Chữ đậm', function () { wrap('**', '**', 'chữ đậm'); }),
      tool('I', 'Chữ nghiêng', function () { wrap('_', '_', 'chữ nghiêng'); }),
      tool('H2', 'Tiêu đề mục', function () { line('## '); }),
      tool('H3', 'Tiêu đề nhỏ', function () { line('### '); }),
      tool('• Danh sách', 'Danh sách gạch đầu dòng', function () { line('- '); }),
      tool('1. Danh sách', 'Danh sách đánh số', function () { line('1. '); }),
      tool('❝ Trích dẫn', 'Trích dẫn', function () { line('> '); }),
      tool('Liên kết', 'Chèn liên kết', function () { var u = prompt('Địa chỉ liên kết (https://…)', 'https://'); if (u) wrap('[', '](' + u + ')', 'chữ hiển thị'); }),
      tool('Ảnh', 'Tải ảnh lên và chèn', function () { imgInput.click(); }), imgInput);

    var form = h('form', { class: 'post-editor', novalidate: true },
      h('div', { class: 'admin-toolbar' }, h('h2', { class: 'admin-h2', text: p.id ? 'Sửa bài viết' : 'Viết bài mới' }),
        btn('← Danh sách bài viết', 'btn-ghost', function () { if (!dirty || confirm('Bỏ các thay đổi chưa lưu?')) loaders['bai-viet'](); })),
      h('div', { class: 'post-editor-grid' },
        h('div', { class: 'post-editor-main' },
          field('Tiêu đề', input('title', p.title, { required: true, maxlength: 200 })),
          field('Tóm tắt', textarea('excerpt', p.excerpt, { rows: 3, maxlength: 600 }), { optional: true, hint: 'Hiện trong danh sách Tin tức.' }),
          h('div', { class: 'field' }, h('span', { class: 'field-label', id: 'editor-label', text: 'Nội dung (Markdown)' }),
            h('div', { class: 'editor-modes' }, writeTab, previewTab), toolbar, content, preview,
            h('p', { class: 'field-hint', text: 'Gợi ý: **đậm**, _nghiêng_, ## tiêu đề, - danh sách, [chữ](https://link). HTML lạ sẽ bị lọc bỏ khi lưu.' }))),
        h('div', { class: 'post-editor-side' },
          field('Trạng thái', select('status', [['draft', 'Nháp'], ['published', 'Đăng']], p.status)),
          field('Ngày đăng', input('published_at', toLocalInput(p.published_at), { type: 'datetime-local' }), { optional: true, hint: 'Để trống = đăng ngay khi chọn «Đăng». Ngày tương lai = hẹn giờ.' }),
          field('Chuyên mục', input('category', p.category, { maxlength: 80, list: 'post-categories' }), { optional: true }),
          field('Đường dẫn (slug)', input('slug', p.slug, { maxlength: 120, pattern: '[a-z0-9-]*' }), { optional: true, hint: 'Để trống để tạo tự động từ tiêu đề.' }),
          imagePicker('cover', p.cover, 'Ảnh bìa'))),
      h('div', { class: 'form-actions post-editor-actions' },
        h('button', { class: 'btn btn-primary', type: 'submit', title: 'Lưu bài viết' }, h('span', { class: 'btn-spinner', 'aria-hidden': 'true' }), h('span', { class: 'btn-label', text: 'Lưu bài viết' }))),
      h('p', { class: 'btn-error-text', role: 'alert' }));
    content.setAttribute('aria-labelledby', 'editor-label');
    var dirty = false;
    form.addEventListener('input', function () { dirty = true; });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var submit = form.querySelector('[type=submit]'), err = form.querySelector('.btn-error-text');
      if (submit.getAttribute('aria-busy') === 'true') return;
      var body = readForm(form); body.content_md = content.value; body.published_at = fromLocalInput(body.published_at);
      if (!body.title.trim()) { err.textContent = 'Nhập tiêu đề bài viết.'; form.elements.title.focus(); return; }
      submit.setAttribute('aria-busy', 'true'); err.textContent = '';
      api(p.id ? '/api/admin/posts/' + p.id : '/api/admin/posts', { method: p.id ? 'PUT' : 'POST', body: body }).then(function (r) {
        submit.removeAttribute('aria-busy'); dirty = false;
        say(r.post.status === 'published' ? 'Đã lưu và đăng bài.' : 'Đã lưu bản nháp.');
        postEditor(r.post);
      }, function (e2) { submit.removeAttribute('aria-busy'); err.textContent = e2.message; });
    });
    pPosts.appendChild(form);
    form.elements.title.focus();
  }

  /* ---------- Cài đặt ---------- */
  var pSet = document.getElementById('panel-cai-dat');
  loaders['cai-dat'] = function () {
    api('/api/admin/settings').then(function (d) {
      var b = d.bank;
      pSet.textContent = '';
      var bankErr = h('p', { class: 'btn-error-text', role: 'alert' });
      var bankForm = h('form', { class: 'contact-form admin-card', novalidate: true },
        h('h2', { class: 'admin-h2', text: 'Thông tin chuyển khoản' }),
        h('p', { class: 'field-hint', text: 'Hiện cho học viên trong bảng thanh toán và dùng để tạo mã VietQR. Khi còn trống, trang học viên hiện [CẦN BỔ SUNG].' }),
        field('Tên ngân hàng', input('bank_name', b.bank_name, { placeholder: 'Ví dụ: Vietcombank' })),
        field('Mã ngân hàng VietQR', input('bank_id', b.bank_id, { placeholder: 'Ví dụ: VCB hoặc 970436', autocapitalize: 'characters' }), { hint: 'Mã viết tắt hoặc mã BIN theo danh sách của VietQR (vietqr.io).' }),
        field('Số tài khoản', input('account_no', b.account_no, { inputmode: 'numeric' })),
        field('Chủ tài khoản', input('account_name', b.account_name, { autocapitalize: 'characters' }), { hint: 'Viết in hoa không dấu, đúng như trên ngân hàng.' }),
        field('Mẫu ảnh QR', select('qr_template', [['compact2', 'Gọn, có thông tin (compact2)'], ['compact', 'Gọn (compact)'], ['qr_only', 'Chỉ mã QR'], ['print', 'Bản in']], b.qr_template)),
        h('div', { class: 'form-actions' }, h('button', { class: 'btn btn-primary', type: 'submit', title: 'Lưu thông tin chuyển khoản' }, h('span', { class: 'btn-label', text: 'Lưu thông tin chuyển khoản' }))),
        bankErr);
      bankForm.addEventListener('submit', function (e) {
        e.preventDefault(); bankErr.textContent = '';
        api('/api/admin/settings', { method: 'PUT', body: readForm(bankForm) }).then(function (r) {
          say(r.configured ? 'Đã lưu. Mã QR đã sẵn sàng.' : 'Đã lưu. Còn thiếu thông tin để tạo mã QR.');
        }, function (e2) { bankErr.textContent = e2.message; });
      });
      var pwErr = h('p', { class: 'btn-error-text', role: 'alert' });
      var pwForm = h('form', { class: 'contact-form admin-card', novalidate: true },
        h('h2', { class: 'admin-h2', text: 'Đổi mật khẩu quản trị' }),
        h('input', { type: 'text', name: 'username', autocomplete: 'username', hidden: true, value: '' }),
        field('Mật khẩu hiện tại', input('current', '', { type: 'password', autocomplete: 'current-password', required: true })),
        field('Mật khẩu mới', input('next', '', { type: 'password', autocomplete: 'new-password', required: true, minlength: 10 }), { hint: 'Ít nhất 10 ký tự. Các thiết bị khác sẽ bị đăng xuất.' }),
        field('Nhập lại mật khẩu mới', input('next2', '', { type: 'password', autocomplete: 'new-password', required: true })),
        h('div', { class: 'form-actions' }, h('button', { class: 'btn btn-primary', type: 'submit', title: 'Đổi mật khẩu' }, h('span', { class: 'btn-label', text: 'Đổi mật khẩu' }))),
        pwErr);
      pwForm.addEventListener('submit', function (e) {
        e.preventDefault(); pwErr.textContent = '';
        var v = readForm(pwForm);
        if (v.next !== v.next2) { pwErr.textContent = 'Mật khẩu nhập lại chưa khớp.'; return; }
        api('/api/admin/password', { body: { current: v.current, next: v.next } }).then(function () { pwForm.reset(); say('Đã đổi mật khẩu.'); }, function (e2) { pwErr.textContent = e2.message; });
      });
      pSet.appendChild(h('div', { class: 'admin-settings-grid' }, bankForm, pwForm));
    }, fail);
  };

  /* ---------- Start ---------- */
  HM.me().then(function (u) {
    if (!u || u.role !== 'admin') { location.replace('dang-nhap.html?next=' + encodeURIComponent('/quan-tri.html')); return; }
    document.getElementById('admin-hello').textContent = 'Đăng nhập: ' + u.name + ' (' + u.email + ')';
    var key = location.hash.slice(1);
    var t = tabs.filter(function (x) { return x.dataset.tab === key; })[0] || tabs[0];
    activate(t);
    if (t !== tabs[0]) loaders['tong-quan'](); // keeps the pending badge on the tab current
  }, fail);
})();

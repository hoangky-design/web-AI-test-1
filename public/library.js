/* bai-hoc-cua-toi.html — customer library, grouped by course.
   Paid/opened course → video list + player (sources fetched from /api/videos/:id/play, which
   checks access server-side; files stream from /api/videos/:id/stream with HTTP Range).
   Locked course → video titles only + bank-transfer payment panel (VietQR) + "Tôi đã chuyển khoản".
   Deep link: bai-hoc-cua-toi.html#khoa-<courseId> scrolls to that course (and opens its payment panel). */
(function () {
  var HM = window.HM; if (!HM) return;
  var h = HM.h;
  var root = document.getElementById('library');
  var status = document.getElementById('library-status');
  var hello = document.getElementById('library-hello');
  if (!root) return;

  document.getElementById('logout-btn').addEventListener('click', function () { HM.logout(); });

  function copyBtn(value, label) {
    return h('button', { class: 'btn btn-ghost btn-small', type: 'button', title: 'Sao chép ' + label, onclick: function (e) {
      var b = e.currentTarget;
      (navigator.clipboard ? navigator.clipboard.writeText(value) : Promise.reject()).then(function () {
        b.querySelector('.btn-label').textContent = 'Đã chép'; HM.announce(status, 'Đã sao chép ' + label + '.');
        setTimeout(function () { b.querySelector('.btn-label').textContent = 'Sao chép'; }, 1500);
      }, function () { HM.announce(status, 'Không sao chép được, vui lòng chép thủ công.'); });
    } }, h('span', { class: 'btn-label', text: 'Sao chép' }), h('span', { class: 'visually-hidden', text: ' ' + label }));
  }

  function badge(c) {
    if (c.access.open) return h('span', { class: 'status-badge status-open', text: 'Đã mở khóa' });
    if (c.access.expired) return h('span', { class: 'status-badge status-closed', text: 'Hết hạn' });
    if (c.access.closed_by_admin) return h('span', { class: 'status-badge status-closed', text: 'Đã đóng' });
    if (c.last_payment && c.last_payment.status === 'pending') return h('span', { class: 'status-badge status-pending', text: 'Chờ xác nhận thanh toán' });
    return h('span', { class: 'status-badge status-locked', text: 'Chưa mở khóa' });
  }

  /* ---------- Player ---------- */
  function play(v, playerBox, btn, list) {
    Array.prototype.forEach.call(list.querySelectorAll('[aria-current]'), function (b) { b.removeAttribute('aria-current'); });
    btn.setAttribute('aria-current', 'true');
    playerBox.hidden = false;
    playerBox.textContent = '';
    playerBox.appendChild(h('p', { class: 'lib-player-loading', text: 'Đang tải video…' }));
    HM.api('/api/videos/' + v.id + '/play').then(function (d) {
      playerBox.textContent = '';
      var media;
      if (d.type === 'embed') {
        media = h('iframe', { class: 'lib-player-frame', src: d.src, title: d.title, allow: 'encrypted-media; picture-in-picture; fullscreen',
                              allowfullscreen: true, referrerpolicy: 'strict-origin-when-cross-origin', loading: 'lazy' });
      } else {
        // controlsList/nodownload + no context menu = deterrence only; a determined viewer can still record the screen
        media = h('video', { class: 'lib-player-video', controls: true, controlslist: 'nodownload noplaybackrate', disablepictureinpicture: true,
                             playsinline: true, preload: 'metadata', oncontextmenu: function (e) { e.preventDefault(); } },
          h('source', { src: d.src, type: d.mime || 'video/mp4' }), 'Trình duyệt của bạn không phát được video này.');
      }
      playerBox.appendChild(h('div', { class: 'lib-player-media' }, media));
      playerBox.appendChild(h('p', { class: 'lib-player-title', text: d.title }));
      HM.announce(status, 'Đang phát: ' + d.title);
      playerBox.scrollIntoView({ block: 'nearest' });
    }, function (err) {
      playerBox.textContent = '';
      playerBox.appendChild(h('p', { class: 'field-error', role: 'alert', text: err.message }));
    });
  }

  /* ---------- Payment panel ---------- */
  function paymentPanel(c, panel) {
    panel.textContent = '';
    panel.appendChild(h('p', { class: 'lib-player-loading', text: 'Đang tải thông tin chuyển khoản…' }));
    HM.api('/api/my/courses/' + c.id + '/payment').then(function (p) {
      panel.textContent = '';
      var b = p.bank;
      var qr = p.qr_url
        ? h('img', { class: 'pay-qr', src: p.qr_url, width: 300, height: 300, alt: 'Mã VietQR chuyển khoản ' + HM.vnd(p.amount) + ', nội dung ' + p.transfer_code, loading: 'lazy' })
        : h('span', { class: 'placeholder placeholder-block pay-qr-placeholder', text: '[CẦN BỔ SUNG — mã QR: quản trị điền thông tin ngân hàng trong Quản trị › Cài đặt]' });
      function row(label, value, missing, copy) {
        return h('div', { class: 'course-meta-row' }, h('dt', { class: 'course-meta-label', text: label }),
          h('dd', { class: 'course-meta-value pay-value' }, value ? h('span', { class: 'pay-text', text: value }) : HM.placeholder(missing), value && copy ? copyBtn(value, label.toLowerCase()) : null));
      }
      var pending = c.last_payment && c.last_payment.status === 'pending';
      var btnError = h('p', { class: 'btn-error-text', role: 'alert' });
      var sent = h('p', { class: 'pay-sent', role: 'status' });
      var paidBtn = h('button', { class: 'btn btn-primary', type: 'button', title: 'Tôi đã chuyển khoản' },
        h('span', { class: 'btn-spinner', 'aria-hidden': 'true' }), h('span', { class: 'btn-label', text: 'Tôi đã chuyển khoản' }));
      paidBtn.addEventListener('click', function () {
        if (paidBtn.getAttribute('aria-busy') === 'true') return;
        paidBtn.setAttribute('aria-busy', 'true'); btnError.textContent = '';
        HM.api('/api/my/courses/' + c.id + '/payments', { method: 'POST' }).then(function () {
          paidBtn.removeAttribute('aria-busy');
          c.last_payment = { status: 'pending' };
          sent.textContent = 'Đã ghi nhận. Khóa học sẽ được mở sau khi Hinton Media kiểm tra giao dịch.';
          paidBtn.disabled = true;
          var art = document.getElementById('khoa-' + c.id);
          var old = art.querySelector('.status-badge'); old.replaceWith(badge(c));
        }, function (err) { paidBtn.removeAttribute('aria-busy'); btnError.textContent = err.message; });
      });
      if (pending) { paidBtn.disabled = true; sent.textContent = 'Bạn đã báo chuyển khoản. Đang chờ xác nhận.'; }
      var rejected = c.last_payment && c.last_payment.status === 'rejected';

      panel.appendChild(h('div', { class: 'pay-grid' },
        h('div', { class: 'pay-qr-box' }, qr),
        h('div', { class: 'pay-info' },
          h('h3', { class: 'pay-title', text: 'Chuyển khoản để mở khóa' }),
          h('dl', { class: 'course-meta' },
            row('Ngân hàng', b.bank_name, 'tên ngân hàng'),
            row('Số tài khoản', b.account_no, 'số tài khoản', true),
            row('Chủ tài khoản', b.account_name, 'chủ tài khoản'),
            row('Số tiền', HM.vnd(p.amount), '', true),
            row('Nội dung chuyển khoản', p.transfer_code, '', true)),
          h('p', { class: 'field-hint', text: 'Ghi đúng nội dung chuyển khoản ' + p.transfer_code + ' để được mở khóa nhanh. Sau khi chuyển, bấm «Tôi đã chuyển khoản».' }),
          rejected ? h('p', { class: 'field-error', text: 'Yêu cầu trước đã bị từ chối. Vui lòng kiểm tra lại giao dịch hoặc gọi hotline.' }) : null,
          h('div', { class: 'form-actions' }, paidBtn), btnError, sent)));
    }, function (err) { panel.textContent = ''; panel.appendChild(h('p', { class: 'field-error', role: 'alert', text: err.message })); });
  }

  /* ---------- Course block ---------- */
  function courseBlock(c) {
    var titleId = 'lib-course-' + c.id + '-title';
    var thumb = c.thumbnail
      ? h('img', { class: 'lib-course-thumb', src: c.thumbnail, alt: '', width: 320, height: 180, loading: 'lazy', decoding: 'async' })
      : h('span', { class: 'placeholder placeholder-block lib-course-thumb', text: '[CẦN BỔ SUNG — ảnh khóa học]' });
    var meta = h('p', { class: 'lib-course-meta' }, h('span', { text: c.video_count + ' video' }), ' · ', h('span', { text: HM.vnd(c.price) }),
      c.access.open && c.access.expires_at ? h('span', { text: ' · Hết hạn ' + HM.date(c.access.expires_at) }) : null);
    var art = h('article', { class: 'lib-course', id: 'khoa-' + c.id, tabindex: '-1', 'aria-labelledby': titleId },
      h('div', { class: 'lib-course-head' }, thumb,
        h('div', { class: 'lib-course-heading' },
          h('h2', { class: 'lib-course-title', id: titleId, text: c.title }), badge(c), meta,
          c.description ? h('p', { class: 'card-text', text: c.description }) : null)));

    var list = h('ol', { class: 'lib-video-list', role: 'list' });
    if (c.access.open) {
      var player = h('div', { class: 'lib-player', hidden: true, 'aria-live': 'polite' });
      c.videos.forEach(function (v, i) {
        var btn = h('button', { class: 'lib-video-btn', type: 'button' },
          h('span', { class: 'lib-video-num', 'aria-hidden': 'true', text: String(i + 1) }),
          h('span', { class: 'lib-video-name', text: v.title }), h('span', { class: 'lib-video-action', text: 'Xem' }));
        btn.addEventListener('click', function () { play(v, player, btn, list); });
        list.appendChild(h('li', null, btn));
      });
      if (!c.videos.length) list.appendChild(h('li', { class: 'card-text', text: 'Khóa học chưa có video.' }));
      art.appendChild(player);
      art.appendChild(list);
    } else {
      c.videos.forEach(function (v, i) {
        list.appendChild(h('li', { class: 'lib-video-locked' },
          h('span', { class: 'lib-video-num', 'aria-hidden': 'true', text: String(i + 1) }),
          h('span', { class: 'lib-video-name', text: v.title }),
          h('span', { class: 'lib-video-action' }, h('span', { class: 'lock-icon', 'aria-hidden': 'true' }), 'Đã khóa')));
      });
      art.appendChild(list);
      if (c.access.closed_by_admin || c.access.expired) {
        art.appendChild(h('p', { class: 'field-hint', text: 'Quyền xem khóa học này đã ' + (c.access.expired ? 'hết hạn' : 'bị đóng') + '. Liên hệ hotline nếu cần mở lại.' }));
      }
      var panelId = 'pay-' + c.id;
      var panel = h('div', { class: 'pay-panel', id: panelId, hidden: true });
      var toggle = h('button', { class: 'btn btn-primary', type: 'button', 'aria-expanded': 'false', 'aria-controls': panelId, title: 'Mua khóa học' },
        h('span', { class: 'btn-label', text: 'Mua khóa học · ' + HM.vnd(c.price) }));
      toggle.addEventListener('click', function () {
        var open = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', String(open));
        panel.hidden = !open;
        if (open && !panel.dataset.loaded) { panel.dataset.loaded = '1'; paymentPanel(c, panel); }
      });
      art.appendChild(h('div', { class: 'lib-course-actions' }, toggle));
      art.appendChild(panel);
      art._openPayment = function () { if (toggle.getAttribute('aria-expanded') !== 'true') toggle.click(); };
    }
    return art;
  }

  HM.me().then(function (u) {
    if (!u) { location.replace('dang-nhap.html?next=' + encodeURIComponent('/bai-hoc-cua-toi.html') + location.hash); return; }
    hello.textContent = 'Xin chào, ' + u.name + '.';
    return HM.api('/api/my/courses').then(function (d) {
      root.textContent = '';
      if (!d.courses.length) { root.appendChild(h('p', { class: 'card-text', text: 'Chưa có khóa học nào được mở bán.' })); return; }
      d.courses.forEach(function (c) { root.appendChild(courseBlock(c)); });
      var m = /^#khoa-(\d+)$/.exec(location.hash);
      var target = m && document.getElementById('khoa-' + m[1]);
      if (target) { if (target._openPayment) target._openPayment(); target.scrollIntoView(); target.focus({ preventScroll: true }); }
    });
  }).catch(function (err) {
    root.textContent = '';
    root.appendChild(h('p', { class: 'field-error', role: 'alert', text: err.message }));
  });
})();

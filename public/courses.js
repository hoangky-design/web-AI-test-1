/* ================================================================
   COURSES — the ONE place to edit the courses sold on khoa-hoc.html.
   Loaded with `defer` on khoa-hoc.html only. With JavaScript on, this
   script rebuilds the course cards ([data-courses="list"]), the course
   <select> of the registration form ([data-courses="select"]) and the
   "Khóa học đã chọn" summary from COURSES. With JavaScript off, visitors
   see the static "COURSES — no-JS FALLBACK" blocks in khoa-hoc.html.

   HOW TO EDIT (Cách sửa thông tin khóa học):
     1. Edit, add or remove objects in COURSES below (order = display order).
        Leave a value as null and it shows as the cyan [CẦN BỔ SUNG — …]
        marker (placeholder.md: never invent names, prices or numbers).
     2. Copy the same values into the two static blocks in khoa-hoc.html
        (the card list and the <option>s of #rf-course), so the page is
        still correct with JavaScript off.
     3. Launch gate: zero "CẦN BỔ SUNG" left on the page.

   Fields (all text is plain text, no HTML):
     id        unique, lowercase, no spaces, e.g. 'capcut-co-ban'. Also used in
               deep links: khoa-hoc.html?khoa=<id>#dang-ky preselects the course.
     name      course name                      e.g. 'Dựng video Capcut chuyên nghiệp'
     summary   one or two sentences
     price     displayed exactly as written     e.g. '1.500.000 đ' or 'Liên hệ'
     duration  e.g. '4 tuần' · lessons e.g. '8 buổi' · level e.g. 'Cơ bản'
     format    e.g. 'Online qua Zoom' / 'Offline tại Hải Phòng'
     image     { webp, jpg, width, height, alt } or null (→ placeholder frame).
               alt describes only what is visible in the photo.
     buyUrl    optional. If set (e.g. a payment / checkout page), the card's
               "Đăng ký / Mua bài học" button opens it in a new tab instead of
               scrolling to the registration form.

   Course names already published on dich-vu.html ("Các khóa học"), verified
   from the company profile — copy them into `name` once the matching price
   and details are confirmed: Dựng video Capcut chuyên nghiệp · Affiliate
   Tiktok · Chạy Ads Tiktok · Khóa Livestream Tiktok · Tiktok coaching 1:1 ·
   Khóa học Tiktok Shop · Khóa học Tiktok THCN.

   With the Node server (README.md): courses are managed in Quản trị › Khóa học and this
   script replaces the cards/select with GET /api/courses (published courses). The COURSES
   array below is then only the fallback for static hosting / server down. Set COURSES_API
   to null for a static-only deploy (avoids a 404 request).

   Photos: the three example cards reuse workshop photos already on
   hoat-dong.html as temporary thumbnails ([CẦN BỔ SUNG — ảnh từng khóa học]).
   ================================================================ */
var COURSES_API = '/api/courses';

var COURSES = [
  {
    id: 'khoa-hoc-1',
    name: null,
    summary: null,
    price: null,
    duration: null,
    lessons: null,
    level: null,
    format: null,
    image: { webp: 'assets/photos/workshop-drive-03.webp', jpg: 'assets/photos/workshop-drive-03.jpg', width: 1920, height: 1440,
             alt: 'Một người mặc áo sơ mi trắng đứng nói trong phòng học, học viên ngồi tại các dãy bàn dài, nhiều người đang ghi chép' },
    buyUrl: null
  },
  {
    id: 'khoa-hoc-2',
    name: null,
    summary: null,
    price: null,
    duration: null,
    lessons: null,
    level: null,
    format: null,
    image: { webp: 'assets/photos/workshop-drive-04.webp', jpg: 'assets/photos/workshop-drive-04.jpg', width: 1920, height: 1278,
             alt: 'Một người mặc vest đứng giữa lối đi dang tay, phía sau là lớp học đông người ngồi trước máy tính xách tay' },
    buyUrl: null
  },
  {
    id: 'khoa-hoc-3',
    name: null,
    summary: null,
    price: null,
    duration: null,
    lessons: null,
    level: null,
    format: null,
    image: { webp: 'assets/photos/workshop-speaker-audience.webp', jpg: 'assets/photos/workshop-speaker-audience.jpg', width: 1920, height: 1280,
             alt: 'Một người mặc vest đứng quay lưng về phía máy ảnh, nhìn ra hội trường kín chỗ ngồi' },
    buyUrl: null
  }
];

(function (courses) {
  var list = document.querySelector('[data-courses="list"]');
  var select = document.querySelector('[data-courses="select"]');
  if (!list && !select) return;

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function placeholder(text) { return el('span', 'placeholder', '[CẦN BỔ SUNG — ' + text + ']'); }
  // placeholder.md §3.3: a missing value is plain text, never inside a link/button
  function value(v, missing) { return v ? document.createTextNode(v) : placeholder(missing); }
  // Plain-text label (option text, aria strings): name, or the bracketed marker
  function nameText(c, i) { return c.name || '[CẦN BỔ SUNG — tên khóa học ' + (i + 1) + ']'; }
  function byId(id) { for (var i = 0; i < courses.length; i++) if (courses[i].id === id) return courses[i]; return null; }

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var summary = document.querySelector('[data-courses="summary"]');

  /* ---------- Cards ---------- */
  function card(c, i) {
    var titleId = 'course-' + c.id + '-title';
    var li = el('li', 'course-card');
    li.setAttribute('data-course-id', c.id);
    var article = el('article', 'course-card-inner');
    article.setAttribute('aria-labelledby', titleId);

    // Thumbnail: lazy, with data-fallback → cyan placeholder if the image fails
    var media = el('div', 'course-card-media');
    media.setAttribute('data-fallback-box', '');
    var ph = el('span', 'placeholder placeholder-block course-card-placeholder img-fallback', '[CẦN BỔ SUNG — ảnh khóa học]');
    if (c.image) {
      var pic = el('picture');
      if (c.image.webp) { var s = el('source'); s.type = 'image/webp'; s.srcset = c.image.webp; pic.appendChild(s); }
      var img = el('img', 'course-card-thumb');
      img.src = c.image.jpg; img.width = c.image.width; img.height = c.image.height;
      img.alt = c.image.alt || ''; img.loading = 'lazy'; img.decoding = 'async';
      img.setAttribute('data-fallback', '');
      pic.appendChild(img);
      media.appendChild(pic);
      ph.hidden = true; ph.setAttribute('aria-hidden', 'true');
    }
    media.appendChild(ph);
    article.appendChild(media);

    var body = el('div', 'course-card-body');
    var h3 = el('h3', 'course-card-title'); h3.id = titleId;
    h3.appendChild(value(c.name, 'tên khóa học ' + (i + 1)));
    body.appendChild(h3);
    var p = el('p', 'course-card-text'); p.appendChild(value(c.summary, 'mô tả ngắn')); body.appendChild(p);

    var dl = el('dl', 'course-meta');
    [['Thời lượng', c.duration, 'thời lượng'], ['Số buổi học', c.lessons, 'số buổi'],
     ['Trình độ', c.level, 'trình độ'], ['Hình thức', c.format, 'online / offline']].forEach(function (m) {
      if (c.hideEmpty && !m[1]) return; // server data: the admin left it empty on purpose
      var row = el('div', 'course-meta-row');
      row.appendChild(el('dt', 'course-meta-label', m[0]));
      var dd = el('dd', 'course-meta-value'); dd.appendChild(value(m[1], m[2]));
      row.appendChild(dd); dl.appendChild(row);
    });
    body.appendChild(dl);

    var price = el('p', 'course-price');
    price.appendChild(el('span', 'course-price-label', 'Học phí'));
    var pv = el('span', 'course-price-value'); pv.appendChild(value(c.price, 'học phí')); price.appendChild(pv);
    body.appendChild(price);

    function cta(cls, label) {
      var a = el('a', 'btn ' + cls + ' course-cta');
      a.title = label;
      a.setAttribute('aria-describedby', titleId); // which course: the card title (link text stays short)
      a.appendChild(el('span', 'btn-label', label));
      return a;
    }
    var links = el('div', 'course-card-links');
    if (c.onlineUrl) {
      // Server-backed course: buy by bank transfer + watch in the student area (login/register first)
      var online = cta('btn-primary', 'Mua & học online'); online.href = c.onlineUrl; links.appendChild(online);
      var ask = cta('btn-secondary', 'Đăng ký tư vấn'); ask.href = '#dang-ky'; ask.setAttribute('data-course-select', c.id); links.appendChild(ask);
    } else if (c.buyUrl) {
      var buy = cta('btn-primary', 'Đăng ký / Mua bài học');
      buy.href = c.buyUrl; buy.target = '_blank'; buy.rel = 'noopener noreferrer';
      buy.appendChild(el('span', 'visually-hidden', ' (mở tab mới)'));
      links.appendChild(buy);
    } else {
      var reg = cta('btn-primary', 'Đăng ký / Mua bài học'); reg.href = '#dang-ky'; reg.setAttribute('data-course-select', c.id); links.appendChild(reg);
    }
    body.appendChild(links);
    article.appendChild(body);
    li.appendChild(article);
    return li;
  }

  function render() {
    if (list) {
      list.textContent = '';
      courses.forEach(function (c, i) { list.appendChild(card(c, i)); });
      if (!courses.length) { var li = el('li'); li.appendChild(placeholder('danh sách khóa học')); list.appendChild(li); }
    }
    if (!select) return;
    var keep = select.value;
    select.textContent = '';
    var first = el('option', null, '— Chọn khóa học —'); first.value = ''; select.appendChild(first);
    courses.forEach(function (c, i) { var o = el('option', null, nameText(c, i)); o.value = c.id; select.appendChild(o); });
    if (byId(keep)) select.value = keep;
  }
  render();

  // Node server present → replace the static COURSES with the published courses from the admin
  if (window.COURSES_API && window.fetch && location.protocol !== 'file:') {
    fetch(window.COURSES_API, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok && /json/.test(r.headers.get('content-type') || '') ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.courses || !d.courses.length) return;
        var vnd = function (n) { return new Intl.NumberFormat('vi-VN').format(n) + ' đ'; };
        courses = d.courses.map(function (x) {
          return { id: String(x.id), name: x.title, summary: x.description || null, price: vnd(x.price), duration: x.duration,
            lessons: x.video_count + ' video', level: x.level, format: x.format, hideEmpty: true,
            image: x.thumbnail ? { jpg: x.thumbnail, width: 1280, height: 720, alt: '' } : null,
            onlineUrl: 'bai-hoc-cua-toi.html#khoa-' + x.id };
        });
        render();
        if (summary) renderSummary();
      })
      .catch(function () {});
  }

  /* ---------- Form select + "Khóa học đã chọn" summary ---------- */
  if (!select) return;

  function renderSummary() {
    if (!summary) return;
    var c = byId(select.value);
    summary.textContent = '';
    if (!c) { summary.appendChild(el('p', 'course-summary-empty', 'Chưa chọn khóa học. Chọn trong biểu mẫu hoặc bấm «Đăng ký / Mua bài học» ở một khóa học.')); return; }
    var dl = el('dl', 'course-meta');
    [['Khóa học', c.name, 'tên khóa học ' + (courses.indexOf(c) + 1)], ['Học phí', c.price, 'học phí'],
     ['Thời lượng', c.duration, 'thời lượng'], ['Hình thức', c.format, 'online / offline']].forEach(function (m) {
      if (c.hideEmpty && !m[1]) return;
      var row = el('div', 'course-meta-row');
      row.appendChild(el('dt', 'course-meta-label', m[0]));
      var dd = el('dd', 'course-meta-value'); dd.appendChild(value(m[1], m[2]));
      row.appendChild(dd); dl.appendChild(row);
    });
    summary.appendChild(dl);
  }
  select.addEventListener('change', renderSummary);

  // Deep link: khoa-hoc.html?khoa=<id>#dang-ky preselects that course
  var q = /[?&]khoa=([^&#]+)/.exec(location.search);
  if (q && byId(decodeURIComponent(q[1]))) select.value = decodeURIComponent(q[1]);
  renderSummary();

  // Card CTA: preselect the course, scroll to the form, focus the select (no keyboard pops up on mobile)
  var form = select.form;
  var status = document.getElementById('rf-status');
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-course-select]');
    if (!a || !form) return;
    var c = byId(a.getAttribute('data-course-select'));
    if (!c) return;
    e.preventDefault();
    select.value = c.id;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    form.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
    select.focus({ preventScroll: true });
    if (status) status.textContent = 'Đã chọn khóa học: ' + nameText(c, courses.indexOf(c)) + '.';
    if (history.replaceState) history.replaceState(null, '', '#dang-ky');
  });
})(COURSES);

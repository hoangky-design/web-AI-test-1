/* Tin tức: tin-tuc.html (paginated list, ?page=N&category=…), bai-viet.html?slug=… (detail),
   and the "Tin tức mới" strip on hoat-dong.html ([data-posts="latest"], hidden if no posts / no server).
   Posts are written in Quản trị › Bài viết (Markdown; the server sanitizes the HTML). */
(function () {
  var HM = window.HM; if (!HM) return;
  var h = HM.h;
  var params = new URLSearchParams(location.search);

  function card(p) {
    var href = 'bai-viet.html?slug=' + encodeURIComponent(p.slug);
    var titleId = 'post-' + p.id + '-title';
    return h('li', { class: 'post-card' },
      h('article', { class: 'post-card-inner', 'aria-labelledby': titleId },
        h('div', { class: 'post-card-media' }, p.cover
          ? h('img', { class: 'post-card-thumb', src: p.cover, alt: '', width: 640, height: 360, loading: 'lazy', decoding: 'async' })
          : h('span', { class: 'post-card-noimage', 'aria-hidden': 'true', text: 'Hinton Media' })),
        h('div', { class: 'post-card-body' },
          h('p', { class: 'card-meta' }, p.category ? h('span', { text: p.category + ' · ' }) : null, h('time', { datetime: p.published_at, text: HM.date(p.published_at) })),
          // Whole-card link via the title (stretched with CSS) — one link per card, readable name
          h('h3', { class: 'post-card-title', id: titleId }, h('a', { class: 'post-card-link', href: href, text: p.title })),
          p.excerpt ? h('p', { class: 'card-text', text: p.excerpt }) : null)));
  }

  /* ---------- List ---------- */
  var list = document.querySelector('[data-posts="list"]');
  if (list) {
    var page = Math.max(parseInt(params.get('page'), 10) || 1, 1);
    var cat = params.get('category') || '';
    var pager = document.querySelector('[data-posts="pager"]');
    var cats = document.querySelector('[data-posts="categories"]');
    HM.api('/api/posts?per=9&page=' + page + (cat ? '&category=' + encodeURIComponent(cat) : '')).then(function (d) {
      list.textContent = '';
      if (!d.posts.length) list.appendChild(h('li', { class: 'card-text', text: cat ? 'Chưa có bài viết trong chuyên mục này.' : 'Chưa có bài viết nào.' }));
      d.posts.forEach(function (p) { list.appendChild(card(p)); });
      if (cats && d.categories.length) {
        cats.hidden = false; cats.textContent = '';
        var all = h('a', { class: 'chip', href: 'tin-tuc.html', text: 'Tất cả' }); if (!cat) all.setAttribute('aria-current', 'page');
        cats.appendChild(h('li', null, all));
        d.categories.forEach(function (c) {
          var a = h('a', { class: 'chip', href: 'tin-tuc.html?category=' + encodeURIComponent(c.category), text: c.category + ' (' + c.n + ')' });
          if (c.category === cat) a.setAttribute('aria-current', 'page');
          cats.appendChild(h('li', null, a));
        });
      }
      if (pager && d.pages > 1) {
        pager.hidden = false; pager.textContent = '';
        var ul = h('ul', { class: 'pager-list', role: 'list' });
        for (var i = 1; i <= d.pages; i++) {
          var a = h('a', { class: 'pager-link', href: 'tin-tuc.html?page=' + i + (cat ? '&category=' + encodeURIComponent(cat) : '') }, h('span', { class: 'visually-hidden', text: 'Trang ' }), String(i));
          if (i === d.page) a.setAttribute('aria-current', 'page');
          ul.appendChild(h('li', null, a));
        }
        pager.appendChild(ul);
      }
    }, function () {
      list.textContent = '';
      list.appendChild(h('li', null, HM.placeholder('tin tức: cần chạy máy chủ Node (xem README)')));
    });
  }

  /* ---------- Detail ---------- */
  var detail = document.querySelector('[data-posts="detail"]');
  if (detail) {
    var slug = params.get('slug') || '';
    var crumb = document.getElementById('post-crumb');
    var title = document.getElementById('page-title-text');
    function notFound(msg) {
      title.textContent = 'Không tìm thấy bài viết';
      detail.textContent = '';
      detail.appendChild(h('p', { class: 'card-text', text: msg }));
      detail.appendChild(h('a', { class: 'btn btn-secondary', href: 'tin-tuc.html', title: 'Xem tất cả tin tức' }, h('span', { class: 'btn-label', text: 'Xem tất cả tin tức' })));
    }
    if (!slug) notFound('Liên kết bài viết không đầy đủ.');
    else HM.api('/api/posts/' + encodeURIComponent(slug)).then(function (d) {
      var p = d.post;
      document.title = p.title + ' | Hinton Media';
      title.textContent = p.title; crumb.textContent = p.title;
      var meta = document.getElementById('post-meta');
      meta.textContent = '';
      if (p.category) meta.appendChild(h('span', { text: p.category + ' · ' }));
      meta.appendChild(h('time', { datetime: p.published_at, text: HM.date(p.published_at) }));
      meta.hidden = false;
      if (p.excerpt) { var lead = document.getElementById('post-lead'); lead.textContent = p.excerpt; lead.hidden = false; }
      detail.textContent = '';
      if (p.cover) detail.appendChild(h('img', { class: 'post-cover', src: p.cover, alt: '', width: 1200, height: 675, decoding: 'async' }));
      var body = h('div', { class: 'post-content prose' });
      body.innerHTML = p.content_html; // sanitized on the server (sanitize-html allow-list; see server/lib.js renderMarkdown)
      detail.appendChild(body);
    }, function (err) { notFound(err.status === 404 ? 'Bài viết không tồn tại hoặc chưa được đăng.' : err.message); });
  }

  /* ---------- Latest strip (hoat-dong.html) ---------- */
  var latest = document.querySelector('[data-posts="latest"]');
  if (latest) {
    HM.api('/api/posts?per=3').then(function (d) {
      if (!d.posts.length) return;
      var ul = latest.querySelector('ul');
      d.posts.forEach(function (p) { ul.appendChild(card(p)); });
      latest.hidden = false;
    }, function () {});
  }
})();

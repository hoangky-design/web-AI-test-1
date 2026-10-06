/* ================================================================
   CONTACT — the ONE place to edit contact details (all 14 pages).
   Loaded with `defer` on every page. With JavaScript on, this script
   rewrites every [data-contact] slot from CONTACT. With JavaScript off,
   visitors see the static "CONTACT INFO — no-JS FALLBACK" blocks:
     - the FOOTER block, identical on all 14 pages
     - the full block on lien-he.html
   To change contact info: edit CONTACT here, then copy the same values
   into those fallback blocks (the footer block must stay identical on all pages).
   Empty phones / null email → plain-text [CẦN BỔ SUNG — …] (never a link).
   Values: from the QA-passed one-page build (hinton/index.html, 2026-10-05).
   ================================================================ */
var CONTACT = {
  // tel: links must use E.164.
  phones: [
    { display: '0365 061 186', e164: '+84365061186' },
    { display: '090 222 37 30', e164: '+84902223730' }
  ],
  email: 'buihuuthangvimaon@gmail.com',
  office: 'Hoàng Huy Commerce, Lê Chân, Hải Phòng',
  mapUrl: 'https://www.google.com/maps/search/?api=1&query=Hoang+Huy+Commerce,+Le+Chan,+Hai+Phong',
  hours: { open: '09:00', close: '17:00', days: 'Thứ Hai đến Chủ nhật' },
  social: [
    { label: 'Facebook', url: 'https://www.facebook.com/BuiHuuThangTeam' },
    { label: 'Instagram @buihuuthang.hinton', url: 'https://www.instagram.com/buihuuthang.hinton/' },
    { label: 'Instagram @buihuuthang.official', url: 'https://www.instagram.com/buihuuthang.official/' },
    { label: 'Instagram @buihuuthang', url: 'https://www.instagram.com/buihuuthang/' }
  ]
};

(function (c) {
  function each(sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function placeholder(text) { return el('span', 'placeholder', '[CẦN BỔ SUNG — ' + text + ']'); }
  // External links: new tab + noopener/noreferrer + visually hidden notice (contact-block.md §3.4)
  function external(cls, label, url) {
    var a = el('a', cls, label);
    a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.appendChild(el('span', 'visually-hidden', ' (mở tab mới)'));
    return a;
  }
  var phones = (c.phones || []).filter(function (p) { return p && p.e164; });

  // placeholder.md §3.3: a missing value is rendered as plain text, never inside a link/button
  each('[data-contact="phones"]', function (box) {
    box.textContent = '';
    if (!phones.length) { box.appendChild(placeholder('hotline')); return; }
    phones.forEach(function (p) {
      var a = el('a', 'contact-link contact-link-tel');
      a.href = 'tel:' + p.e164;
      a.appendChild(el('span', 'visually-hidden', 'Gọi '));
      a.appendChild(document.createTextNode(p.display));
      box.appendChild(a);
    });
  });
  // Hero "Gọi ngay": no-JS href is lien-he.html; with a hotline it becomes tel:
  each('[data-contact-href="phone"]', function (a) { if (phones.length) a.href = 'tel:' + phones[0].e164; });
  each('[data-contact="email"]', function (box) {
    box.textContent = '';
    if (c.email) {
      var a = el('a', 'contact-link contact-link-mail', c.email);
      a.href = 'mailto:' + c.email;
      box.appendChild(a);
    } else {
      box.appendChild(placeholder('email'));
    }
  });
  each('[data-contact="social"]', function (list) {
    list.textContent = '';
    (c.social || []).forEach(function (s) {
      var li = el('li');
      li.appendChild(external('contact-link contact-link-social', s.label, s.url));
      list.appendChild(li);
    });
    if (!list.children.length) { var li = el('li'); li.appendChild(placeholder('mạng xã hội')); list.appendChild(li); }
  });
  each('[data-contact="office"]', function (n) { n.textContent = c.office; });
  each('[data-contact="map"]', function (a) { a.href = c.mapUrl; });
  each('[data-contact="hours"]', function (p) {
    p.textContent = '';
    var t1 = el('time', null, c.hours.open); t1.dateTime = c.hours.open;
    var t2 = el('time', null, c.hours.close); t2.dateTime = c.hours.close;
    p.appendChild(t1); p.appendChild(document.createTextNode('–')); p.appendChild(t2);
    p.appendChild(document.createTextNode(', ' + c.hours.days));
  });
})(CONTACT);

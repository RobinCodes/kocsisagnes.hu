/**
 * shared.js — Agnes Kocsis Real Estate
 * Handles: header/footer injection, theme (dark/light/system),
 *          language switching, mobile menu, listing modal/gallery,
 *          toast notifications.
 */

/* ── Helpers ──────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const q = sel => document.querySelector(sel);
const qq = sel => document.querySelectorAll(sel);

/* Handle returned by BotDefense.protect() for the contact form, if built. */
var contactGuard = null;

/* ── Image extension fallback ─────────────────────────────── */
/**
 * Cycles jpg → jpeg → png → webp -> jfif until one loads.
 * Explicitly re-sets img.onerror before each new src so the chain
 * survives browsers that clear the inline onerror attribute after it fires.
 */
window._extFallback = function (img) {
  const exts = ['jpg', 'jpeg', 'png', 'webp', 'jfif'];
  const src = img.src;                          // always the absolute URL
  const match = src.match(/\.(\w+)(\?.*)?$/);
  if (!match) { img.onerror = null; return; }
  const cur = match[1].toLowerCase();
  const idx = exts.indexOf(cur);
  if (idx >= 0 && idx < exts.length - 1) {
    /* Re-attach BEFORE changing src, so the new load sees the handler */
    img.onerror = () => window._extFallback(img);
    img.src = src.replace(/\.\w+(\?.*)?$/, '.' + exts[idx + 1]);
  } else {
    img.onerror = null;   /* all extensions exhausted — stop */
  }
};

/* ── Theme ────────────────────────────────────────────────── */
function resolveTheme() {
  const stored = localStorage.getItem('theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  /* The reCAPTCHA widget bakes its palette in at render time, so it has to be
     re-rendered rather than restyled. */
  if (contactGuard) contactGuard.refreshCaptcha();
  const emoji = theme === 'light' ? '☀️' : '🌙';
  const orb = q('.theme-toggle .toggle-orb');
  if (orb) orb.textContent = emoji;
  const fab = $('theme-fab');
  if (fab) fab.textContent = emoji;
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme;
  const next = current === 'light' ? 'dark' : 'light';
  localStorage.setItem('theme', next);
  applyTheme(next);
}

/* Apply immediately to avoid flash */
(function () {
  document.documentElement.dataset.theme = resolveTheme();
})();

/* ── Header Template ──────────────────────────────────────── */
function buildHeader(activePage) {
  const lang = getLang();
  const t = translations[lang];

  const propPages = ['for-sale', 'for-rent', 'garage', 'storage', 'spain'];
  const propActive = propPages.includes(activePage);

  const navLinks = `
    <a href="index.html"${activePage === 'home'    ? ' class="active-nav"' : ''}>${t.home}</a>
    <div class="dropdown" id="prop-dropdown">
      <button class="dropbtn${propActive ? ' active-nav' : ''}">${t.properties} <i class="fas fa-chevron-down" style="font-size:0.7rem;opacity:0.6;margin-left:3px"></i></button>
      <div class="dropdown-content">
        <a href="for-sale.html"${activePage === 'for-sale' ? ' class="active-nav"' : ''}>${t.forSale}</a>
        <a href="for-rent.html"${activePage === 'for-rent' ? ' class="active-nav"' : ''}>${t.forRent}</a>
        <a href="garage.html"${activePage  === 'garage'   ? ' class="active-nav"' : ''}>${t.garages}</a>
        <a href="storage.html"${activePage === 'storage'  ? ' class="active-nav"' : ''}>${t.storages}</a>
        <a href="spain.html" class="spain-link${activePage === 'spain' ? ' active-nav' : ''}">${t.spain}</a>
      </div>
    </div>
    <a href="about.html"${activePage   === 'about'   ? ' class="active-nav"' : ''}>${t.about}</a>
    <a href="contact.html"${activePage === 'contact' ? ' class="active-nav"' : ''}>${t.contact}</a>
  `;

  return `
    <a class="logo-area" href="index.html">
      <img src="../assets/favicon.png" alt="Agnes Kocsis logo">
      <h1>${t.name}</h1>
    </a>

    <nav class="nav-links" id="main-nav">${navLinks}</nav>

    <div class="header-controls">
      <div class="lang-switch">
        <a href="#" data-lang="en">EN</a>
        <a href="#" data-lang="hu">HU</a>
      </div>
      <button class="theme-toggle" id="theme-toggle" aria-label="Toggle theme" title="Toggle light / dark">
        <span class="toggle-orb">🌙</span>
      </button>
      <button class="hamburger" id="hamburger" aria-label="Open menu">
        <span></span><span></span><span></span>
      </button>
    </div>

    <!-- Floating theme button shown only on mobile (CSS-controlled) -->
    <button class="theme-fab" id="theme-fab" aria-label="Toggle theme">🌙</button>
  `;
}

/* ── Footer Template ──────────────────────────────────────── */
function buildFooter() {
  const lang = getLang();
  const t = translations[lang];
  return `
    <div class="footer-left">
      <p>© 2026 <span>${t.name}</span>. ${t.rights}</p>
      <p onclick="location.href='../privacy_policy_2026.pdf'" style="cursor:pointer">
        ${t.privacyPolicy}
      </p>
      <p>${t.realEstate}</p>
    </div>
    <div class="footer-right footer-contact">
      <p data-bd-email="YWduZXNrb2NzaXNAZ21haWwuY29t" style="cursor:pointer">
        <i class="fas fa-envelope"></i> <span data-bd-slot></span>
      </p>
      <p onclick="location.href='tel:+36209117442'" style="cursor:pointer">
        <i class="fas fa-phone-alt"></i> +36 20 911 7442
      </p>
    </div>
  `;
}

/* ── Inject Header & Footer ───────────────────────────────── */
function initPage(activePage) {
  const header = q('#header');
  const footer = q('footer');
  if (header) header.innerHTML = buildHeader(activePage);
  if (footer) footer.innerHTML = buildFooter();
  window.BotDefense?.revealEmails(document);

  /* Move FAB out of header so backdrop-filter can't trap its fixed position */
  const fab = $('theme-fab');
  if (fab) document.body.appendChild(fab);

  /* Theme toggle (desktop pill) + FAB (mobile) */
  applyTheme(resolveTheme());
  const btn = $('theme-toggle');
  if (btn) btn.addEventListener('click', toggleTheme);
  if (fab) fab.addEventListener('click', toggleTheme);

  /* Mobile hamburger + blur backdrop */
  const burger = $('hamburger');
  const nav = $('main-nav');
  if (burger && nav) {
    /* Inject backdrop once */
    let backdrop = $('nav-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'nav-backdrop';
      backdrop.className = 'nav-backdrop';
      document.body.appendChild(backdrop);
    }

    function closeNav() {
      burger.classList.remove('open');
      nav.classList.remove('open');
      backdrop.classList.remove('open');
    }

    burger.addEventListener('click', () => {
      const opening = !burger.classList.contains('open');
      burger.classList.toggle('open');
      nav.classList.toggle('open');
      backdrop.classList.toggle('open', opening);
    });

    backdrop.addEventListener('click', closeNav);

    /* Also close on resize to desktop */
    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) closeNav();
    });
  }

  /* Mobile: dropdown inside nav opens on tap */
  const propDrop = $('prop-dropdown');
  if (propDrop) {
    const dropBtn = propDrop.querySelector('.dropbtn');
    if (dropBtn) {
      dropBtn.addEventListener('click', (e) => {
        if (window.innerWidth <= 768) {
          e.stopPropagation();
          propDrop.classList.toggle('open');
        }
      });
    }
  }

  /* Language switcher */
  initLangSwitch();

  /* Polish: fade-in sections, auto-hiding header */
  initReveal();
  initHeaderAutoHide();
}

/* ── Language Switching ───────────────────────────────────── */
function getLang() {
  // Primary: URL path segment (works on server, e.g. /hu/about.html)
  const parts = window.location.pathname.split('/');
  if (parts.includes('hu')) return 'hu';
  // Fallback: html[lang] attribute — reliable for local file testing too
  if (document.documentElement.lang === 'hu') return 'hu';
  return 'en';
}

function initLangSwitch() {
  const lang = getLang();
  qq('.lang-switch a').forEach(a => {
    if (a.dataset.lang === lang) a.classList.add('active');
    a.addEventListener('click', function (e) {
      e.preventDefault();
      const target = this.dataset.lang;
      if (target === lang) return;
      const parts = window.location.pathname.split('/');
      const newParts = parts.map(p => (p === 'en' || p === 'hu') ? target : p);
      window.location.href = newParts.join('/') + (window.location.hash || '');
    });
  });
}

/* ── Translations ─────────────────────────────────────────── */
const translations = {
  en: {
    name: 'Agnes Kocsis',
    home: 'Home', properties: 'Properties', forSale: 'For sale',
    forRent: 'For rent', garages: 'Garages', storages: 'Storages',
    spain: '🇪🇸 Spain',
    about: 'About', contact: 'Contact',
    contactTitle: 'Get in touch',
    rights: 'All rights reserved.', realEstate: 'Real Estate · Budapest',
    // Modal
    contactBtn: 'Contact', shareBtn: 'Share', linkCopied: '🔗 Link copied!',
    rooms: 'rooms',
    // Empty state
    noListings: 'No listings at the moment. Check back soon!',
    // Contact form
    formName: 'Name', formNamePh: 'Full name',
    formEmail: 'E-mail', formEmailPh: 'email@example.com',
    formMessage: 'Message', formMessagePh: 'Write your message here…',
    formSend: 'Send message', formSending: 'Sending…',
    formOk: 'Message sent — thank you!',
    formErr: 'Something went wrong. Please try again.',
    // Filters
    filterLocation: 'Location', filterLocationAll: 'All locations',
    filterRooms: 'Rooms', filterRoomsAll: 'Any',
    filterReset: 'Clear filters',
    filterNoMatch: 'No properties match the selected filters.',
    filterMore: 'More filters', filterLess: 'Fewer filters',
    filterArea: 'Area (m²)', filterPrice: 'Price',
    filterMin: 'Min', filterMax: 'Max',
    filterCurrency: 'Currency',
    // Homepage
    catListingOne: 'listing', catListingMany: 'listings',
    catComingSoon: 'Coming soon',
    homeTagline: 'Properties for sale and for rent — with personal attention.',
    browseAll: 'Browse properties',
    ctaTitle: 'Get in touch',
    ctaSub: 'If you have a property for sale, or one of the listings has caught your interest — I am happy to help.',
    // Spain page
    spainHeroTitle: 'Properties in Spain',
    spainHeroSub: 'Exclusive residences on the Mediterranean coast — curated for discerning buyers and guided with personal expertise.',
    spainBadge: '🇪🇸 Spain',
    spainComingSoon: 'An exclusive selection is being curated. <a href="contact.html" style="color:inherit;text-decoration:underline">Reach out</a> to be the first to know.',
    spainDocsTitle: 'Development documents',
    spainDocsSub: 'Villas de Loix — 27 exclusive villas in Rincón de Loix, Benidorm.',
    spainDocsDossier: 'Project brochure',
    spainDocsSpecs: 'Building specifications',
    spainDocsPdf: 'PDF',
    privacyPolicy: 'Privacy Policy'
  },
  hu: {
    name: 'Kocsis Ágnes',
    home: 'Főoldal', properties: 'Ingatlanok', forSale: 'Eladó',
    forRent: 'Kiadó', garages: 'Garázsok', storages: 'Tárolók',
    spain: '🇪🇸 Spanyolország',
    about: 'Rólam', contact: 'Kapcsolat',
    contactTitle: 'Lépjen kapcsolatba velem',
    rights: 'Minden jog fenntartva.', realEstate: 'Ingatlan · Budapest',
    // Modal
    contactBtn: 'Kapcsolat', shareBtn: 'Megosztás', linkCopied: '🔗 Link másolva!',
    rooms: 'szoba',
    // Empty state
    noListings: 'Jelenleg nincs aktív hirdetés. Nézzen vissza hamarosan!',
    // Contact form
    formName: 'Név', formNamePh: 'Teljes neve',
    formEmail: 'E-mail', formEmailPh: 'email@example.com',
    formMessage: 'Üzenet', formMessagePh: 'Írja ide az üzenetét…',
    formSend: 'Küldés', formSending: 'Küldés…',
    formOk: 'Üzenet elküldve – köszönöm!',
    formErr: 'Hiba történt. Kérem, próbálja újra később.',
    // Filters
    filterLocation: 'Helyszín', filterLocationAll: 'Összes helyszín',
    filterRooms: 'Szobák', filterRoomsAll: 'Bármennyi',
    filterReset: 'Szűrők törlése',
    filterNoMatch: 'Nincs a szűrőknek megfelelő ingatlan.',
    filterMore: 'Több szűrő', filterLess: 'Kevesebb szűrő',
    filterArea: 'Alapterület (m²)', filterPrice: 'Ár',
    filterMin: 'Min', filterMax: 'Max',
    filterCurrency: 'Pénznem',
    // Homepage
    catListingOne: 'hirdetés', catListingMany: 'hirdetés',
    catComingSoon: 'Hamarosan',
    homeTagline: 'Eladó és kiadó ingatlanok — személyes figyelemmel.',
    browseAll: 'Ingatlanok böngészése',
    ctaTitle: 'Keressen bizalommal!',
    ctaSub: 'Ha eladó ingatlana van, vagy valamelyik hirdetés felkeltette az érdeklődését — örömmel segítek.',
    // Spain page
    spainHeroTitle: 'Spanyolországi ingatlanok',
    spainHeroSub: 'Exkluzív rezidenciák a Földközi-tenger partján — igényes vevők számára válogatva, személyes szakértelemmel.',
    spainBadge: '🇪🇸 Spanyolország',
    spainComingSoon: 'Exkluzív kínálatunkat éppen összeállítjuk. <a href="contact.html" style="color:inherit;text-decoration:underline">Lépjen kapcsolatba</a>, hogy elsőként értesüljön.',
    spainDocsTitle: 'A projekt dokumentumai',
    spainDocsSub: 'Villas de Loix — 27 exkluzív villa Benidormban, a Rincón de Loix negyedben.',
    spainDocsDossier: 'Projekt prospektus',
    spainDocsSpecs: 'Műszaki tartalom',
    spainDocsPdf: 'PDF',
    privacyPolicy: 'Adatkezelési Tájékoztató'
  }
};

/* ── Contact Form Builder ─────────────────────────────────── */
function buildContactForm(containerId) {
  const t = translations[getLang()];
  const wrap = $(containerId);
  if (!wrap) return;
  wrap.innerHTML = `
    <h2>${t.contactTitle}</h2>
    <form id="contact-form">
      <div>
        <label for="name">${t.formName}</label>
        <input type="text" id="name" name="name" placeholder="${t.formNamePh}" required>
      </div>
      <div>
        <label for="email">${t.formEmail}</label>
        <input type="email" id="email" name="email" placeholder="${t.formEmailPh}" required>
      </div>
      <div>
        <label for="message">${t.formMessage}</label>
        <textarea id="message" name="message" placeholder="${t.formMessagePh}" required></textarea>
      </div>
      <button type="submit">${t.formSend}</button>
      <p id="form-status"></p>
    </form>
  `;

  const form   = $('contact-form');
  const status = $('form-status');

  /* Honeypot, timing trap, rate limit, spam scoring and reCAPTCHA v2. If the
     script is missing the form submits unprotected — losing enquiries is worse
     than losing a layer, and the warning says which it is. */
  if (!window.BotDefense) console.warn('bot-defense.js did not load — contact form is unprotected');
  contactGuard = window.BotDefense?.protect(form, {
    id: 'kocsis-contact',
    lang: getLang(),
    fields: { name: 'name', email: 'email', message: 'message' },
    captchaAnchor: 'button[type="submit"]',
    captchaTheme: () => document.documentElement.dataset.theme
  }) || null;
  const guard = contactGuard;

  const showOk = () => {
    status.textContent = t.formOk;
    status.style.color = 'var(--accent-bright)';
    form.reset();
  };

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    const verdict = guard ? guard.check() : { ok: true };
    if (!verdict.ok) {
      /* Definitive bot tells get the success message and no e-mail, so whoever
         is sending has nothing to tune against. */
      if (verdict.silent) { showOk(); guard.reset(); return; }
      status.textContent = verdict.message;
      status.style.color = '#ef4444';
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = t.formSending;
    status.textContent = '';
    emailjs.sendForm('service_49g5oye', 'template_79mp0xu', form)
      .then(() => {
        showOk();
        guard?.done();
      })
      .catch(err => {
        console.error(err);
        status.textContent = t.formErr;
        status.style.color = '#ef4444';
        guard?.reset();
      })
      .finally(() => {
        btn.disabled = false;
        btn.textContent = t.formSend;
      });
  });
}

/* ── Spain Hero Builder ────────────────────────────────────── */
function buildSpainHero(containerId) {
  const t = translations[getLang()];
  const wrap = $(containerId);
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="spain-tile-border"></div>
    <div class="spain-hero-inner">
      <div class="spain-sun" aria-hidden="true">☀️</div>
      <div class="spain-lux-eyebrow">🇪🇸 Mediterranean Collection</div>
      <h2>${t.spainHeroTitle}</h2>
      <div class="spain-gold-rule" aria-hidden="true"></div>
      <p>${t.spainHeroSub}</p>
    </div>
    <div class="spain-arch-row" aria-hidden="true">
      <span class="arch"></span><span class="arch"></span><span class="arch"></span>
      <span class="arch"></span><span class="arch"></span>
    </div>
    <div class="spain-tile-border spain-tile-border--bottom"></div>
  `;
}

/* ── Spain Developer Documents ─────────────────────────────── */
function buildSpainDocs(containerId) {
  const t = translations[getLang()];
  const wrap = $(containerId);
  if (!wrap) return;
  const base = '../assets/properties/spain/';
  const doc = (file, label) => `
    <a class="spain-doc" href="${base}${file}" target="_blank" rel="noopener">
      <i class="fas fa-file-pdf" aria-hidden="true"></i>
      <span class="spain-doc-label">${label}</span>
      <span class="spain-doc-ext">${t.spainDocsPdf}</span>
    </a>`;
  wrap.innerHTML = `
    <div class="spain-docs reveal">
      <h3>${t.spainDocsTitle}</h3>
      <p class="spain-docs-sub">${t.spainDocsSub}</p>
      <div class="spain-docs-row">
        ${doc('villas-de-loix-dossier.pdf', t.spainDocsDossier)}
        ${doc('villas-de-loix-building-specifications.pdf', t.spainDocsSpecs)}
      </div>
    </div>
  `;
  initReveal();
}

/* ── Spain Coming-Soon Builder ─────────────────────────────── */
function buildSpainComingSoon(containerId) {
  const t = translations[getLang()];
  const wrap = $(containerId);
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="spain-empty">
      <div class="spain-empty-icon">🇪🇸</div>
      <p class="spain-empty-msg">${t.spainComingSoon}</p>
    </div>
  `;
}



/**
 * Generate image path array for a property folder.
 * Convention: main.jpg for first image, then 1.jpg, 2.jpg, …
 */
function generateImages(folder, count) {
  const arr = [];
  for (let i = 0; i < count; i++) {
    arr.push(`${folder}/${i === 0 ? 'main.jpg' : i + '.jpg'}`);
  }
  return arr;
}

/* ── Property data access (data/properties.js) ────────────── */
const CATEGORY_PAGES = {
  'for-sale': 'for-sale.html',
  'for-rent': 'for-rent.html',
  'garage':   'garage.html',
  'storage':  'storage.html',
  'spain':    'spain.html'
};

/**
 * Flatten the bilingual ESTATE_DATA records into the shape the
 * render functions expect, resolved for the current language.
 */
function getProperties(category) {
  if (!window.ESTATE_DATA) return [];
  const lang = getLang();
  return (ESTATE_DATA.categories[category] || []).map(p => ({
    id: p.id,
    featured: p.featured || 0,
    category: category,
    room: p.room || null,
    area: p.area || '',
    title: p[lang].title,
    loc: p[lang].loc,
    price: p[lang].price,
    type: p[lang].type,
    desc: p[lang].desc,
    images: p.images.map(f => '../' + p.folder + '/' + f)
  }));
}

/** One-call setup for a listings page. */
function initListingsPage(category) {
  initPage(category);
  initModal();
  renderListings(getProperties(category));
}

/* ── Numeric parsing for the advanced filters ─────────────── */
function parsePriceValue(str) {
  const m = String(str).replace(/ /g, ' ').match(/\d[\d\s.,]*/);
  return m ? parseInt(m[0].replace(/\D/g, ''), 10) : null;
}
function parsePriceCurrency(str) {
  return /EUR/i.test(str) ? 'EUR' : 'Ft';
}
function parseAreaValue(str) {
  if (!str) return null;
  const s = String(str).replace(/,/g, '.');
  /* "3 × 12 m²" → the unit size (12), otherwise the first number */
  const mult = s.match(/\d+(?:\.\d+)?\s*[×x]\s*(\d+(?:\.\d+)?)/);
  if (mult) return parseFloat(mult[1]);
  const m = s.match(/\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

/* ── Homepage: featured grid ──────────────────────────────── */
function buildFeatured(containerId) {
  const wrap = $(containerId);
  if (!wrap || !window.ESTATE_DATA) return;
  const feats = [];
  Object.keys(CATEGORY_PAGES).forEach(cat => {
    getProperties(cat).forEach(p => { if (p.featured) feats.push(p); });
  });
  feats.sort((a, b) => a.featured - b.featured);

  const section = wrap.closest('.featured-section');
  if (!feats.length) {
    if (section) section.style.display = 'none';
    return;
  }

  wrap.innerHTML = feats.map(p => `
    <a class="featured-card reveal" href="${CATEGORY_PAGES[p.category]}#property-${p.id}">
      <div class="badge" style="background:var(--badge-gradient)">${p.type}</div>
      <div class="f-media"><img src="${p.images[0]}" onerror="window._extFallback(this)" alt="${p.title}" loading="lazy"></div>
      <div class="f-meta">
        <div class="f-price">${p.price}</div>
        <div class="f-title">${p.title}</div>
        <div class="f-loc"><i class="fas fa-map-marker-alt" style="margin-right:4px;color:var(--accent)"></i>${p.loc}</div>
        <div class="f-specs">
          ${p.room ? `<span><i class="fas fa-house"></i> ${p.room}</span>` : ''}
          ${p.area ? `<span><i class="fas fa-ruler-combined"></i> ${p.area}</span>` : ''}
        </div>
      </div>
    </a>`).join('');
  initReveal();
}

/* ── Homepage: category tiles with live counts ────────────── */
function buildCategoryTiles(containerId) {
  const wrap = $(containerId);
  if (!wrap || !window.ESTATE_DATA) return;
  const t = translations[getLang()];
  const cats = [
    { key: 'for-sale', icon: 'fa-home',           label: t.forSale },
    { key: 'for-rent', icon: 'fa-key',            label: t.forRent },
    { key: 'garage',   icon: 'fa-warehouse',      label: t.garages },
    { key: 'storage',  icon: 'fa-box-open',       label: t.storages },
    { key: 'spain',    icon: 'fa-umbrella-beach', label: t.spain, spain: true }
  ];
  wrap.innerHTML = cats.map(c => {
    const n = (ESTATE_DATA.categories[c.key] || []).length;
    const count = n
      ? `${n} ${n === 1 ? t.catListingOne : t.catListingMany}`
      : t.catComingSoon;
    return `
      <a class="cat-tile reveal${c.spain ? ' cat-tile-spain' : ''}" href="${CATEGORY_PAGES[c.key]}">
        <i class="fas ${c.icon}"></i>
        <span class="cat-name">${c.label}</span>
        <span class="cat-count">${count}</span>
      </a>`;
  }).join('');
  initReveal();
}

/* ── Homepage: contact call-to-action strip ───────────────── */
function buildContactCta(containerId) {
  const wrap = $(containerId);
  if (!wrap) return;
  const t = translations[getLang()];
  wrap.innerHTML = `
    <div class="cta-strip reveal">
      <h2>${t.ctaTitle}</h2>
      <p>${t.ctaSub}</p>
      <div class="cta-actions">
        <a class="btn-primary" href="contact.html"><i class="fas fa-paper-plane" style="margin-right:6px"></i>${t.contact}</a>
        <a class="btn-ghost" href="tel:+36209117442"><i class="fas fa-phone-alt" style="margin-right:6px"></i>+36 20 911 7442</a>
        <a class="btn-ghost" data-bd-email="YWduZXNrb2NzaXNAZ21haWwuY29t" href="#"><i class="fas fa-envelope" style="margin-right:6px"></i><span data-bd-slot></span></a>
      </div>
    </div>`;
  window.BotDefense?.revealEmails(wrap);
  initReveal();
}

/**
 * Render a grid of property cards into `#listings`, with
 * location + rooms filters above.
 */
function renderListings(properties, emptyOverrideHtml) {
  const container = $('listings');
  if (!container) return;

  const t = translations[getLang()];

  if (!properties.length) {
    container.innerHTML = emptyOverrideHtml || `
      <div class="empty-state">
        <i class="fas fa-home"></i>
        <p>${t.noListings}</p>
      </div>`;
    return;
  }

  /* ── Build unique filter options ── */
  const locs = [...new Set(properties.map(p => p.loc).filter(Boolean))];
  const rooms = [...new Set(properties.map(p => p.room).filter(Boolean))].sort((a,b)=>a-b);
  const showRooms = rooms.length > 0;

  /* Precompute numeric values for the range filters */
  properties.forEach(p => {
    p._priceVal = parsePriceValue(p.price);
    p._priceCur = parsePriceCurrency(p.price);
    p._areaVal  = parseAreaValue(p.area);
  });
  const currencies = [...new Set(properties.map(p => p._priceCur))];

  /* ── Inject filter bar before the grid ── */
  const filterBarId = 'listings-filter-bar';
  let bar = $(filterBarId);
  if (!bar) {
    bar = document.createElement('div');
    bar.id = filterBarId;
    bar.className = 'filter-bar';
    container.parentNode.insertBefore(bar, container);
  }

  bar.innerHTML = `
    <div class="filter-row">
      <div class="filter-group">
        <label class="filter-label" for="filter-loc">
          <i class="fas fa-map-marker-alt"></i> ${t.filterLocation}
        </label>
        <select id="filter-loc" class="filter-select">
          <option value="">${t.filterLocationAll}</option>
          ${locs.map(l => `<option value="${l}">${l}</option>`).join('')}
        </select>
      </div>
      ${showRooms ? `
      <div class="filter-group">
        <label class="filter-label" for="filter-rooms">
          <i class="fas fa-house"></i> ${t.filterRooms}
        </label>
        <select id="filter-rooms" class="filter-select">
          <option value="">${t.filterRoomsAll}</option>
          ${rooms.map(r => `<option value="${r}">${r}</option>`).join('')}
        </select>
      </div>` : ''}
      <button class="filter-more" id="filter-more" aria-expanded="false">
        <i class="fas fa-sliders-h"></i> <span>${t.filterMore}</span>
      </button>
      <button class="filter-reset" id="filter-reset" title="${t.filterReset}">
        <i class="fas fa-times"></i> ${t.filterReset}
      </button>
    </div>
    <div class="filter-row filter-row-adv" id="filter-adv">
      <div class="filter-group">
        <label class="filter-label"><i class="fas fa-ruler-combined"></i> ${t.filterArea}</label>
        <div class="filter-range">
          <input type="number" id="filter-area-min" class="filter-input" min="0" placeholder="${t.filterMin}">
          <span class="filter-range-sep">–</span>
          <input type="number" id="filter-area-max" class="filter-input" min="0" placeholder="${t.filterMax}">
        </div>
      </div>
      <div class="filter-group">
        <label class="filter-label"><i class="fas fa-tag"></i> ${t.filterPrice}</label>
        <div class="filter-range">
          <input type="number" id="filter-price-min" class="filter-input" min="0" placeholder="${t.filterMin}">
          <span class="filter-range-sep">–</span>
          <input type="number" id="filter-price-max" class="filter-input" min="0" placeholder="${t.filterMax}">
          ${currencies.length > 1 ? `
          <select id="filter-cur" class="filter-select filter-cur">
            ${currencies.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>` : `<span class="filter-cur-fixed">${currencies[0] || ''}</span>`}
        </div>
      </div>
    </div>
  `;

  /* ── Render cards (optionally filtered) ── */
  const numVal = id => {
    const el = $(id);
    if (!el || el.value === '') return null;
    const v = parseFloat(el.value);
    return isNaN(v) ? null : v;
  };

  let firstRender = true;

  function applyFilters() {
    const locVal   = ($('filter-loc')   || {}).value || '';
    const roomsVal = ($('filter-rooms') || {}).value || '';
    const areaMin  = numVal('filter-area-min');
    const areaMax  = numVal('filter-area-max');
    const priceMin = numVal('filter-price-min');
    const priceMax = numVal('filter-price-max');
    const curVal   = ($('filter-cur') || {}).value || currencies[0] || '';

    const filtered = properties.filter(p => {
      if (locVal   && p.loc !== locVal)                             return false;
      if (roomsVal && String(p.room) !== roomsVal)                  return false;
      if ((areaMin !== null || areaMax !== null)) {
        if (p._areaVal === null)                                    return false;
        if (areaMin !== null && p._areaVal < areaMin)               return false;
        if (areaMax !== null && p._areaVal > areaMax)               return false;
      }
      if ((priceMin !== null || priceMax !== null)) {
        if (p._priceVal === null || p._priceCur !== curVal)         return false;
        if (priceMin !== null && p._priceVal < priceMin)            return false;
        if (priceMax !== null && p._priceVal > priceMax)            return false;
      }
      return true;
    });

    if (!filtered.length) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-filter"></i>
          <p>${t.filterNoMatch}</p>
        </div>`;
      return;
    }

    container.innerHTML = filtered.map(p => `
      <article class="card${firstRender ? ' reveal' : ''}" data-id="${p.id}">
        <div class="badge">${p.type}</div>
        <div class="media">
          <img src="${p.images[0]}" alt="${p.title}" onerror="window._extFallback(this)" loading="lazy">
        </div>
        <div class="meta">
          <div class="price">${p.price}</div>
          <div class="title">${p.title}</div>
          <div class="loc">${p.loc}</div>
          <div class="specs">
            ${p.room  ? `<span><i class="fas fa-house"></i> ${p.room}</span>` : ''}
            ${p.area ? `<span><i class="fas fa-ruler-combined"></i> ${p.area}</span>` : ''}
            ${p.extra ? `<span>${p.extra}</span>` : ''}
          </div>
        </div>
      </article>
    `).join('');

    qq('.card').forEach(card => {
      card.addEventListener('click', () => {
        const prop = properties.find(p => p.id === parseInt(card.dataset.id));
        if (prop) openModal(prop);
      });
    });

    if (firstRender) { initReveal(); firstRender = false; }
  }

  /* ── Wire up filter controls ── */
  applyFilters();

  ['filter-loc', 'filter-rooms', 'filter-cur'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('change', applyFilters);
  });
  ['filter-area-min', 'filter-area-max', 'filter-price-min', 'filter-price-max'].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener('input', applyFilters);
  });

  /* "More filters" reveals the advanced row */
  const moreBtn = $('filter-more');
  if (moreBtn) {
    moreBtn.addEventListener('click', () => {
      const open = bar.classList.toggle('adv-open');
      moreBtn.setAttribute('aria-expanded', open);
      moreBtn.querySelector('span').textContent = open ? t.filterLess : t.filterMore;
    });
  }

  const resetBtn = $('filter-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      ['filter-loc', 'filter-rooms', 'filter-cur',
       'filter-area-min', 'filter-area-max',
       'filter-price-min', 'filter-price-max'].forEach(id => {
        const el = $(id);
        if (el) el.value = el.tagName === 'SELECT' && id === 'filter-cur'
          ? (currencies[0] || '') : '';
      });
      applyFilters();
    });
  }

  /* Auto-open from URL hash */
  const hash = window.location.hash;
  if (hash.startsWith('#property-')) {
    const id = parseInt(hash.replace('#property-', ''));
    const prop = properties.find(p => p.id === id);
    if (prop) openModal(prop);
  }
}

/* ── Modal ────────────────────────────────────────────────── */
let galleryImgs = [];
let currentIdx  = 0;

function openModal(property) {
  const modal   = $('modal');
  const gallery = $('gallery');
  const content = $('modal-content');
  if (!modal || !gallery || !content) return;

  /* Gallery */
  gallery.innerHTML = property.images
    .map((src, i) => `<img src="${src}" onerror="window._extFallback(this)" class="${i === 0 ? 'active' : ''}" alt="Property photo ${i+1}">`)
    .join('');
  galleryImgs = gallery.querySelectorAll('img');
  currentIdx  = 0;

  const t = translations[getLang()];

  /* Content */
  content.innerHTML = `
    <h3>${property.title}</h3>
    <h4 class="price">${property.price}</h4>
    <p class="loc"><i class="fas fa-map-marker-alt" style="margin-right:5px;color:var(--accent)"></i>${property.loc}</p>
    <div class="modal-specs">
      ${property.room  ? `<span><i class="fas fa-house"></i> ${property.room} ${t.rooms}</span>` : ''}
      ${property.area ? `<span><i class="fas fa-ruler-combined"></i> ${property.area}</span>` : ''}
    </div>
    <p>${property.desc.replace(/\n/g, '<br>')}</p>
    <div class="modal-actions">
      <a class="btn-primary" href="contact.html"><i class="fas fa-paper-plane" style="margin-right:6px"></i>${t.contactBtn}</a>
      <button class="btn-ghost" id="share-btn"><i class="fas fa-link" style="margin-right:6px"></i>${t.shareBtn}</button>
    </div>
  `;

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  history.pushState(null, '', '#property-' + property.id);

  $('share-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(window.location.href)
      .then(() => showToast(t.linkCopied));
  });
}

function closeModal() {
  const modal = $('modal');
  if (!modal) return;
  modal.style.display = 'none';
  document.body.style.overflow = '';
  history.pushState('', document.title, window.location.pathname);
}

function changeImage(dir) {
  if (!galleryImgs.length) return;
  galleryImgs[currentIdx].classList.remove('active');
  currentIdx = (currentIdx + dir + galleryImgs.length) % galleryImgs.length;
  galleryImgs[currentIdx].classList.add('active');
}

function initModal() {
  const closeBtn = $('modal-close');
  const modal    = $('modal');
  const prev     = $('prev');
  const next     = $('next');
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (modal)    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  if (prev)     prev.addEventListener('click',  () => changeImage(-1));
  if (next)     next.addEventListener('click',  () => changeImage(1));

  /* Keyboard nav */
  document.addEventListener('keydown', e => {
    if (modal && modal.style.display === 'flex') {
      if (e.key === 'ArrowLeft')  changeImage(-1);
      if (e.key === 'ArrowRight') changeImage(1);
      if (e.key === 'Escape')     closeModal();
    }
  });
}

/* ── Reveal on scroll ─────────────────────────────────────── */
let _revealObserver = null;

function initReveal() {
  const els = qq('.reveal:not(.visible)');
  if (!els.length) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !('IntersectionObserver' in window)) {
    els.forEach(el => el.classList.add('visible'));
    return;
  }

  if (!_revealObserver) {
    _revealObserver = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          en.target.classList.add('visible');
          _revealObserver.unobserve(en.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });
  }
  els.forEach(el => _revealObserver.observe(el));
}

/* ── Hide header while scrolling down, show on scroll up ──── */
function initHeaderAutoHide() {
  const headerEl = q('#header');
  if (!headerEl) return;
  let lastY = window.scrollY, ticking = false;

  function update() {
    const y = window.scrollY;
    const navOpen = q('.nav-links.open');
    if (y < 140 || navOpen)      headerEl.classList.remove('header-hidden');
    else if (y > lastY + 4)      headerEl.classList.add('header-hidden');
    else if (y < lastY - 4)      headerEl.classList.remove('header-hidden');
    lastY = y;
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) { window.requestAnimationFrame(update); ticking = true; }
  }, { passive: true });
}

/* ── Toast ────────────────────────────────────────────────── */
function showToast(message) {
  let toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.bottom = '60px';
  });
  setTimeout(() => { toast.style.opacity = '0'; toast.style.bottom = '40px'; }, 2200);
  setTimeout(() => toast.remove(), 2700);
}

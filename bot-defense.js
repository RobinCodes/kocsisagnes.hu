/**
 * bot-defense.js — layered anti-bot / anti-spam protection for EmailJS forms.
 *
 * Layers, in the order check() runs them:
 *   1. honeypot fields          — invisible inputs only a bot fills in
 *   2. timing trap              — a human cannot fill a contact form in 3 seconds
 *   3. trusted-interaction gate — a real keystroke / tap / focus must have happened
 *   4. rate limit               — per-browser cooldown + hourly / daily caps + replay check
 *   5. content heuristics       — link spam, header injection, spam vocabulary
 *   6. reCAPTCHA v2             — the only captcha EmailJS verifies server-side
 *
 * Layers 1-3 are definitive bot tells, so the submit is dropped silently and the
 * caller shows the same "sent" confirmation a human gets — a bot that is told it
 * failed is a bot that gets retuned. Layers 4-6 can misfire on a real person, so
 * they surface a message the visitor can act on.
 *
 * Only reCAPTCHA is enforced server-side (EmailJS validates g-recaptcha-response
 * against the secret key stored on the template). The rest is defence in depth,
 * not a wall — see BOT-DEFENSE.md for the dashboard settings that back it up.
 */
(function (global) {
  'use strict';

  /* ── Configuration ──────────────────────────────────────────
     recaptchaSiteKey — the reCAPTCHA **v2 "I'm not a robot" checkbox** site key.
     While it is empty every other layer still runs and the widget is simply not
     rendered, so the forms keep working. BOT-DEFENSE.md has the setup steps.   */
  var CONFIG = {
    recaptchaSiteKey: '6Le1VpEtAAAAAO4HCIT9w0T6MDJgyzSh5FuAfV97',
    minFillSeconds:   3,
    cooldownSeconds:  45,
    maxPerHour:       4,
    maxPerDay:        10,
    maxFieldLength:   200,
    maxMessageLength: 3000,
    spamThreshold:    5,
    storageKey:       'bd-guard'
  };

  /* ── Localised visitor-facing copy ──────────────────────── */
  var MESSAGES = {
    hu: {
      cooldown:       'Kérjük, várjon egy kicsit, mielőtt újabb üzenetet küld.',
      rateLimit:      'Túl sok üzenet érkezett erről az eszközről. Kérjük, próbálja újra később, vagy írjon közvetlenül e-mailben.',
      duplicate:      'Ezt az üzenetet már elküldte — hamarosan válaszolunk.',
      spam:           'Az üzenetet nem sikerült elküldeni. Kérjük, távolítsa el belőle a linkeket, és próbálja újra.',
      tooLong:        'Az üzenet túl hosszú. Kérjük, fogalmazza rövidebbre.',
      invalid:        'Kérjük, ellenőrizze a megadott adatokat.',
      captchaRequired:'Kérjük, jelölje be, hogy nem robot.',
      captchaLoading: 'A robotellenőrzés még töltődik — kérjük, próbálja újra egy pillanat múlva.',
      captchaBlocked: 'A robotellenőrzés nem tölthető be. Kérjük, engedélyezze a google.com-ot, vagy frissítse az oldalt.'
    },
    en: {
      cooldown:       'Please wait a moment before sending another message.',
      rateLimit:      'Too many messages have been sent from this device. Please try again later, or e-mail us directly.',
      duplicate:      'You have already sent this message — we will be in touch shortly.',
      spam:           'This message could not be sent. Please remove any links from it and try again.',
      tooLong:        'This message is too long. Please shorten it.',
      invalid:        'Please check the details you entered.',
      captchaRequired:'Please confirm that you are not a robot.',
      captchaLoading: 'The bot check is still loading — please try again in a moment.',
      captchaBlocked: 'The bot check could not load. Please allow google.com or refresh the page.'
    }
  };

  /* Weighted vocabulary. Nothing here is an automatic block on its own: a
     submission has to clear CONFIG.spamThreshold, and the visitor is told why. */
  var SPAM_WORDS = [
    ['backlink', 3], ['link building', 3], ['guest post', 3], ['rank your site', 3],
    ['seo service', 3], ['seo expert', 3], ['web design service', 2], ['bulk email', 3],
    ['crypto', 2], ['bitcoin', 2], ['forex', 3], ['binary option', 3], ['casino', 3],
    ['viagra', 3], ['cialis', 3], ['escort', 3], ['payday loan', 3], ['loan offer', 3],
    ['investment opportunity', 2], ['make money', 2], ['work from home', 2],
    ['click here', 2], ['limited time offer', 2], ['unsubscribe', 2], ['dear sir or madam', 1]
  ];

  var DISPOSABLE = [
    'mailinator.com', 'guerrillamail.com', 'sharklasers.com', '10minutemail.com',
    'yopmail.com', 'trashmail.com', 'temp-mail.org', 'tempmail.com', 'dispostable.com',
    'maildrop.cc', 'getnada.com', 'throwawaymail.com', 'fakeinbox.com', 'mailnesia.com'
  ];

  var URL_RE     = /(?:https?:\/\/|www\.)\S+/gi;
  var URL_ONE_RE = /(?:https?:\/\/|www\.)\S+/i;
  var BARE_TLD_RE= /\b[a-z0-9][a-z0-9-]*\.(?:com|net|org|ru|xyz|top|club|info|biz|online|site|shop|icu|cn|tk|link|live|store)\b/gi;
  var MARKUP_RE  = /\[url[=\]]|<\s*a\s|\[link[=\]]|href\s*=/i;
  var NONLATIN_RE= /[\u0400-\u04FF\u0600-\u06FF\u4E00-\u9FFF\u3040-\u30FF\u0E00-\u0E7F]/g;
  var EMAIL_RE   = /^[^\s@<>,;:"'\\]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;

  /* ── Storage (private mode / disabled cookies must not break the form) ── */
  function readState() {
    try {
      var raw = global.localStorage.getItem(CONFIG.storageKey);
      var parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== 'object') return { sends: {}, hashes: [] };
      parsed.sends  = parsed.sends  || {};
      parsed.hashes = parsed.hashes || [];
      return parsed;
    } catch (e) { return { sends: {}, hashes: [] }; }
  }

  function writeState(state) {
    try { global.localStorage.setItem(CONFIG.storageKey, JSON.stringify(state)); } catch (e) {}
  }

  function hash(str) {                       /* djb2 — only needs to spot replays */
    var h = 5381, i;
    for (i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return h.toString(36);
  }

  /* ── Injected styles ────────────────────────────────────── */
  var stylesInjected = false;
  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    var css =
      '.bd-hp{position:absolute!important;left:-9999px!important;top:0!important;' +
      'width:1px!important;height:1px!important;opacity:0!important;' +
      'pointer-events:none!important;overflow:hidden!important;z-index:-1!important}' +
      '.bd-captcha{margin:14px 0;min-height:78px}' +
      '.bd-captcha:empty{min-height:0;margin:0}' +
      '@media (max-width:400px){.bd-captcha>div{transform:scale(.85);transform-origin:0 0}' +
      '.bd-captcha{min-height:68px}}';
    var tag = document.createElement('style');
    tag.setAttribute('data-bot-defense', '');
    tag.appendChild(document.createTextNode(css));
    document.head.appendChild(tag);
  }

  /* ── reCAPTCHA loader (lazy: viewport or first interaction) ── */
  var recaptcha = { status: 'idle', queue: [] };   /* idle | loading | ready | failed */

  function loadRecaptcha(lang) {
    if (recaptcha.status !== 'idle') return;
    if (!CONFIG.recaptchaSiteKey) return;   /* not configured — stay idle, not failed */
    recaptcha.status = 'loading';

    global.__botDefenseRecaptchaReady = function () {
      recaptcha.status = 'ready';
      recaptcha.queue.splice(0).forEach(function (fn) { fn(); });
    };

    var s = document.createElement('script');
    s.src = 'https://www.google.com/recaptcha/api.js?onload=__botDefenseRecaptchaReady' +
            '&render=explicit&hl=' + encodeURIComponent(lang || 'en');
    s.async = true;
    s.defer = true;
    s.onerror = function () {
      recaptcha.status = 'failed';
      recaptcha.queue.splice(0);
    };
    document.head.appendChild(s);
  }

  function whenRecaptchaReady(fn) {
    if (recaptcha.status === 'ready') fn();
    else if (recaptcha.status !== 'failed') recaptcha.queue.push(fn);
  }

  /* ── Guard ──────────────────────────────────────────────── */
  function protect(form, options) {
    if (!form) return null;
    if (form.__botDefense) return form.__botDefense;

    var opts = options || {};
    var lang = opts.lang || document.documentElement.lang || 'en';

    injectStyles();

    var guard = {
      form:       form,
      id:         opts.id || form.id || 'form',
      lang:       lang.slice(0, 2),
      msg:        {},
      fields:     opts.fields || { name: 'name', email: 'email', message: 'message' },
      themeFor:   opts.captchaTheme || 'light',
      readyAt:    Date.now(),
      interacted: false,
      busy:       false,
      widgetId:   null,
      captchaBox: null
    };

    setLang(guard, lang, opts.messages);

    addHoneypots(form);
    watchInteraction(guard);
    if (opts.captcha !== false) setUpCaptcha(guard, opts.captchaAnchor);

    /* Sites that switch language without a page load call this so the guard's
       messages follow along. */
    guard.setLang        = function (next) { setLang(guard, next, opts.messages); };
    guard.check          = function () { return check(guard); };
    guard.reset          = function () { resetGuard(guard); };
    guard.done           = function () { record(guard); resetGuard(guard); };
    guard.refreshCaptcha = function () { renderCaptcha(guard); };

    form.__botDefense = guard;
    return guard;
  }

  function setLang(guard, lang, overrides) {
    var code  = (lang || 'en').slice(0, 2);
    var table = MESSAGES[code] || MESSAGES.en;
    var key;
    guard.lang = code;
    for (key in table) if (table.hasOwnProperty(key)) guard.msg[key] = table[key];
    if (overrides) for (key in overrides) if (overrides.hasOwnProperty(key)) guard.msg[key] = overrides[key];
  }

  /* 1. Honeypots. Off-screen rather than display:none — the latter is trivial for
        a bot to skip. The ignore attributes keep password managers from autofilling
        them and locking a real visitor out. */
  function addHoneypots(form) {
    var wrap = document.createElement('div');
    wrap.className = 'bd-hp';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.style.cssText = 'position:absolute;left:-9999px;top:0;width:1px;height:1px;' +
                         'opacity:0;pointer-events:none;overflow:hidden;z-index:-1';
    wrap.innerHTML =
      '<label>Website<input type="text" name="website" tabindex="-1" autocomplete="off"' +
      ' data-lpignore="true" data-1p-ignore data-form-type="other"></label>' +
      '<label>Subscribe<input type="checkbox" name="terms_optin" tabindex="-1"' +
      ' data-lpignore="true" data-1p-ignore></label>';
    form.appendChild(wrap);
  }

  function honeypotTripped(form) {
    var text = form.querySelector('.bd-hp input[name="website"]');
    var box  = form.querySelector('.bd-hp input[name="terms_optin"]');
    return !!((text && text.value.trim()) || (box && box.checked));
  }

  /* 2 + 3. A trusted event is one the browser dispatched because a person acted;
           scripted clicks and synthetic key events carry isTrusted === false. */
  function watchInteraction(guard) {
    var mark = function (e) {
      if (!e.isTrusted) return;
      guard.interacted = true;
      loadRecaptcha(guard.lang);
    };
    ['keydown', 'pointerdown', 'touchstart', 'focusin'].forEach(function (type) {
      guard.form.addEventListener(type, mark, { passive: true });
    });
  }

  function setUpCaptcha(guard, anchorSelector) {
    var box = document.createElement('div');
    box.className = 'bd-captcha';
    var anchor = anchorSelector ? guard.form.querySelector(anchorSelector)
                                : guard.form.querySelector('button[type="submit"], input[type="submit"], button');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(box, anchor);
    else guard.form.appendChild(box);
    guard.captchaBox = box;

    var start = function () {
      loadRecaptcha(guard.lang);
      whenRecaptchaReady(function () { renderCaptcha(guard); });
    };

    /* Defer Google's script until the form is actually in play, so it costs
       nothing on a visit that never scrolls to the contact section. */
    if (global.IntersectionObserver) {
      var io = new global.IntersectionObserver(function (entries, observer) {
        if (entries.some(function (en) { return en.isIntersecting; })) {
          observer.disconnect();   /* the argument, not the closure — this can fire
                                      before the `io` assignment completes */
          start();
        }
      }, { rootMargin: '250px' });
      io.observe(guard.form);
    } else {
      start();
    }
  }

  function resolveTheme(guard) {
    var t = typeof guard.themeFor === 'function' ? guard.themeFor() : guard.themeFor;
    return t === 'dark' ? 'dark' : 'light';
  }

  function renderCaptcha(guard) {
    if (!guard.captchaBox || recaptcha.status !== 'ready' || !global.grecaptcha) return;
    guard.captchaBox.innerHTML = '';        /* re-render is how the widget changes theme */
    try {
      guard.widgetId = global.grecaptcha.render(guard.captchaBox, {
        sitekey: CONFIG.recaptchaSiteKey,
        theme:   resolveTheme(guard)
      });
    } catch (e) {
      guard.widgetId = null;
    }
  }

  function captchaToken(guard) {
    if (guard.widgetId === null || !global.grecaptcha) return '';
    try { return global.grecaptcha.getResponse(guard.widgetId) || ''; } catch (e) { return ''; }
  }

  /* 4. Rate limit + replay */
  function pruneAndRead(id, now) {
    var state = readState();
    var day   = 24 * 60 * 60 * 1000;
    state.sends[id] = (state.sends[id] || []).filter(function (t) { return now - t < day; });
    state.hashes    = state.hashes.filter(function (h) { return now - h.t < day; });
    return state;
  }

  function checkRate(guard, now) {
    var state = pruneAndRead(guard.id, now);
    var sends = state.sends[guard.id];
    var last  = sends[sends.length - 1];
    var hour  = 60 * 60 * 1000;

    if (last && now - last < CONFIG.cooldownSeconds * 1000) return { ok: false, message: guard.msg.cooldown };
    if (sends.filter(function (t) { return now - t < hour; }).length >= CONFIG.maxPerHour) return { ok: false, message: guard.msg.rateLimit };
    if (sends.length >= CONFIG.maxPerDay) return { ok: false, message: guard.msg.rateLimit };
    return { ok: true };
  }

  function checkReplay(guard, now) {
    var body = fieldValue(guard, 'message') || fieldValue(guard, 'name');
    if (!body) return { ok: true };
    var h = hash(guard.id + '|' + body);
    var state = pruneAndRead(guard.id, now);
    var seen = state.hashes.some(function (entry) { return entry.h === h; });
    return seen ? { ok: false, message: guard.msg.duplicate } : { ok: true };
  }

  /* 5. Content heuristics */
  function fieldValue(guard, role) {
    var name = guard.fields[role];
    if (!name) return '';
    var el = guard.form.elements[name];
    if (!el || typeof el.value !== 'string') return '';
    return el.value.trim();
  }

  function countMatches(str, re) {
    var m = str.match(re);
    return m ? m.length : 0;
  }

  function scanContent(guard) {
    var name    = fieldValue(guard, 'name');
    var email   = fieldValue(guard, 'email');
    var phone   = fieldValue(guard, 'phone');
    var message = fieldValue(guard, 'message');

    /* Header injection: a newline in a single-line field is never legitimate. */
    if (/[\r\n]/.test(name + email + phone)) return { ok: false, message: guard.msg.invalid };
    if (name.length > CONFIG.maxFieldLength || email.length > CONFIG.maxFieldLength) return { ok: false, message: guard.msg.invalid };
    if (message.length > CONFIG.maxMessageLength) return { ok: false, message: guard.msg.tooLong };
    if (email && !EMAIL_RE.test(email)) return { ok: false, message: guard.msg.invalid };

    var score = 0;
    var haystack = (name + ' ' + message).toLowerCase();

    /* Count full URLs first, then bare domains in what is left, so one link is
       never counted twice. */
    var links = countMatches(message, URL_RE) +
                countMatches(message.replace(URL_RE, ' '), BARE_TLD_RE);
    if (links >= 1) score += 2;
    if (links >= 2) score += 3;
    if (MARKUP_RE.test(message)) score += 3;

    /* Nobody's name contains a URL — on its own that is enough to reject. */
    if (URL_ONE_RE.test(name)) score += CONFIG.spamThreshold;
    if (name.indexOf('@') !== -1) score += 2;

    SPAM_WORDS.forEach(function (pair) {
      if (haystack.indexOf(pair[0]) !== -1) score += pair[1];
    });

    if (email) {
      var domain = email.split('@')[1] || '';
      if (DISPOSABLE.indexOf(domain.toLowerCase()) !== -1) score += 3;
    }

    if (message.length > 20) {
      var foreign = countMatches(message, NONLATIN_RE);
      if (foreign / message.length > 0.25) score += 2;
      if (message === message.toUpperCase() && /[A-ZÁÉÍÓÖŐÚÜŰ]/.test(message)) score += 1;
    }

    return score >= CONFIG.spamThreshold ? { ok: false, message: guard.msg.spam } : { ok: true };
  }

  /* ── The gate every submit handler calls ────────────────── */
  function check(guard) {
    var now = Date.now();

    if (honeypotTripped(guard.form))                       return { ok: false, silent: true, reason: 'honeypot' };
    if (now - guard.readyAt < CONFIG.minFillSeconds * 1000) return { ok: false, silent: true, reason: 'too-fast' };
    if (!guard.interacted)                                 return { ok: false, silent: true, reason: 'no-interaction' };
    if (guard.busy)                                        return { ok: false, silent: true, reason: 'in-flight' };

    var rate = checkRate(guard, now);
    if (!rate.ok) return { ok: false, silent: false, reason: 'rate-limit', message: rate.message };

    var replay = checkReplay(guard, now);
    if (!replay.ok) return { ok: false, silent: false, reason: 'duplicate', message: replay.message };

    var content = scanContent(guard);
    if (!content.ok) return { ok: false, silent: false, reason: 'content', message: content.message };

    if (CONFIG.recaptchaSiteKey) {
      if (recaptcha.status === 'failed') return { ok: false, silent: false, reason: 'captcha-blocked', message: guard.msg.captchaBlocked };
      if (guard.widgetId === null) {
        loadRecaptcha(guard.lang);
        whenRecaptchaReady(function () { renderCaptcha(guard); });
        return { ok: false, silent: false, reason: 'captcha-loading', message: guard.msg.captchaLoading };
      }
      if (!captchaToken(guard)) return { ok: false, silent: false, reason: 'captcha-empty', message: guard.msg.captchaRequired };
    }

    guard.busy = true;
    /* Safety net: never leave the form permanently wedged if a send neither
       resolves nor rejects. */
    global.setTimeout(function () { guard.busy = false; }, 30000);
    return { ok: true };
  }

  function resetGuard(guard) {
    guard.busy    = false;
    guard.readyAt = Date.now();
    if (guard.widgetId !== null && global.grecaptcha) {
      try { global.grecaptcha.reset(guard.widgetId); } catch (e) {}
    }
  }

  function record(guard) {
    var now   = Date.now();
    var state = pruneAndRead(guard.id, now);
    state.sends[guard.id].push(now);
    var body = fieldValue(guard, 'message') || fieldValue(guard, 'name');
    if (body) {
      state.hashes.push({ h: hash(guard.id + '|' + body), t: now });
      state.hashes = state.hashes.slice(-20);
    }
    writeState(state);
  }

  /* ── E-mail harvesting ──────────────────────────────────────
     Addresses live in the markup base64-encoded in data-bd-email, so a harvester
     regexing the served HTML (or this file) finds no address to lift. On load the
     real address is written into the element's [data-bd-slot] descendant — or into
     the element itself if it has none — and mailto: is wired up. Pages that need
     to stay usable without scripting carry a <noscript> fallback spelling the
     address out in "name [kukac] domain" form, which regex harvesters skip.     */
  function revealEmails(root) {
    var nodes = (root || document).querySelectorAll('[data-bd-email]');
    Array.prototype.forEach.call(nodes, function (el) {
      var address;
      try { address = global.atob(el.getAttribute('data-bd-email')); } catch (e) { return; }
      if (!address) return;
      el.removeAttribute('data-bd-email');

      var slot = el.querySelector('[data-bd-slot]');
      if (slot) slot.textContent = address;
      else el.textContent = address;

      if (el.tagName === 'A') {
        el.setAttribute('href', 'mailto:' + address);
      } else {
        el.style.cursor = 'pointer';
        el.addEventListener('click', function () { global.location.href = 'mailto:' + address; });
      }
    });
  }

  global.BotDefense = {
    config:       CONFIG,
    messages:     MESSAGES,
    protect:      protect,
    revealEmails: revealEmails
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { revealEmails(document); });
  } else {
    revealEmails(document);
  }
})(window);

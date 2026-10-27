/* ============================================================
   SCRIPT.JS — логика сайта (чистый JS, без зависимостей).

   Разделы:
     1. Утилиты (esc, store, $)
     2. Модель: параграфы плоским списком (+detailed, slides, links)
     3. Состояние: localStorage (неймспейс obsh11:*, миграция старых ключей)
     4. Тема: light / dark / auto (цикл по кнопке) + акцент «порода дерева»
     5. Роутинг: #/, #/p1 …
     6. Рендер TOC (сайдбар)
     7. Главная
     8. Параграф: actionbar → вкладки Кратко/Подробно → презентация → тест
     9. Логика теста
    10. Презентация: слайды, стрелки/точки/счётчик, свайп, ←/→, фулскрин
    11. Действия параграфа: закладка, заметки, печать, TTS
    12. Шапка: курс-бар, «Продолжить», поиск с подсветкой
    13. Модалки: инструменты/настройки, закладки, хоткеи
    14. Хоткеи, PWA (SW + install), toast, инициализация
   ============================================================ */

'use strict';

/* ---------- 1. УТИЛИТЫ ---------- */

var $  = function (sel, root) { return (root || document).querySelector(sel); };
var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

/* Экранирование HTML (сущности конкатенацией, чтобы не искажались) */
function esc(s) {
  var AMP = '&' + 'amp;', LT = '&' + 'lt;', GT = '&' + 'gt;', QUOT = '&' + 'quot;';
  return String(s == null ? '' : s)
    .replace(/&/g, AMP)
    .replace(/</g, LT)
    .replace(/>/g, GT)
    .replace(/"/g, QUOT)
    .replace(/'/g, '&#39;');
}

/* Безопасный localStorage + миграция старых ключей (obsh11-*) */
var store = {
  get: function (key, fallback) {
    try {
      var v = localStorage.getItem(key);
      if (v === null) {
        var old = localStorage.getItem(key.replace(':', '-'));
        if (old !== null) return JSON.parse(old);
        return fallback;
      }
      return JSON.parse(v);
    } catch (e) { return fallback; }
  },
  set: function (key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }
};

var K = {                       // ключи состояния (единый неймспейс obsh11:*)
  progress: 'obsh11:progress',   // { pid: true } — параграф пройден
  theme:    'obsh11:theme-v2',  // 'light'|'dark'|'auto' (v2: дефолт — тёмная)
  accent:   'obsh11:accent',     // 'oak'|'walnut'|'birch'|'teak'
  tab:      'obsh11:tab',        // 'short'|'detailed'|'pres'|'quiz'
  last:     'obsh11:last',       // id последнего открытого
  bookmarks:'obsh11:bookmarks',  // [pid] — параграфы в избранном (старый список)
  notes:    'obsh11:notes:',     // + pid — заметки пользователя
  search:   'obsh11:search-term',// последний поисковый запрос
  quizLog:  'obsh11:quizlog',    // { pid: [{d,score,total,wrong}] } — история тестов
  mistakes: 'obsh11:mistakes',   // { 'pid:qi': count } — счётчик ошибок
  daily:    'obsh11:daily',      // { date: {paras,tests} } — активность
  goal:     'obsh11:goal',       // число: цель на день
  badges:   'obsh11:badges',     // { badgeId: true }
  onboarded:'obsh11:onboarded',  // true после онбординг-тура
  pomo:     'obsh11:pomo',       // { min, brk } — Pomodoro
  repeat:   'obsh11:repeat',     // { pid: ISO } — spaced repetition
  voice:    'obsh11:voice',      // имя голоса TTS
  /* — фичи 3/5/10/28/29/31/39/40/43 — */
  myconspect:'obsh11:myconspect',// [{pid, block:'short:0'|'detailed:3', text, head}]
  anchors:  'obsh11:anchors',    // [{pid, type:'block'|'slide', index, label}]
  hotkeys:  'obsh11:hotkeys',    // { action: 'Key' } — свои хоткеи (ф. 31)
  reading:  'obsh11:reading',    // true — режим чтения включён
  livebg:   'obsh11:livebg'      // true — живой фон включён (ф. 40)
};

/* ---------- 2. МОДЕЛЬ (мульти-учебники) ---------- */

/* Все книги из data.js: SITE_DATA = { books: [{id, meta, sections}, ...] }.
   Старый формат {meta, sections} — обёртывается в одну книгу (book11). */
var BOOKS = (SITE_DATA.books && SITE_DATA.books.length)
  ? SITE_DATA.books
  : (SITE_DATA.sections ? [{ id: 'book11', meta: SITE_DATA.meta, sections: SITE_DATA.sections }] : []);

/* Активная книга (id в localStorage; дефолт — первая) */
var K_book = 'obsh11:book';
function activeBook() {
  var id = store.get(K_book, BOOKS.length ? BOOKS[0].id : 'book11');
  for (var i = 0; i < BOOKS.length; i++) if (BOOKS[i].id === id) return BOOKS[i];
  return BOOKS.length ? BOOKS[0] : null;
}
function bookMeta() {
  var b = activeBook();
  return (b && b.meta) || { siteTitle: 'Обществоведение', siteSubtitle: '', heroText: '', grade: '' };
}
/* ---------- ПЕРЕКЛЮЧАТЕЛЬ УЧЕБНИКОВ (в оглавлении сайдбара) ----------
   Рендерится в renderTOC() как выпадающий список .toc-book-select.
   Выбор книги → location.reload(): страница полностью перезагружается
   с новой активной книгой (надёжнее SPA-переключения: чистый старт
   всех роутов/поиска/прогресса). */
function setBook(id) {
  var found = false;
  for (var i = 0; i < BOOKS.length; i++) if (BOOKS[i].id === id) found = true;
  if (!found) return;
  if (store.get(K_book, null) === id) return;   // та же книга — ничего не делать
  store.set(K_book, id);                       // сохранить выбор
  /* ПОЛНОЕ ОБНОВЛЕНИЕ: сначала роут сбрасываем через replaceState
     (не триггерит hashchange-роутер), затем reload. */
  try { history.replaceState(null, '', '#/'); } catch (e) {}
  try { location.reload(); } catch (e) { location.href = location.href; }
}

/* Плоский список параграфов АКТИВНОЙ книги (весь код дальше работает с ним) */
var PARAGRAPHS = [];
function buildParagraphs() {
  PARAGRAPHS = [];
  var b = activeBook();
  if (!b) return;
  (b.sections || []).forEach(function (section) {
    (section.paragraphs || []).forEach(function (p) {
      PARAGRAPHS.push({
        id: p.id, num: p.num, title: p.title,
        status: p.status || 'ready',
        conspect: p.conspect || { intro: '', theses: [], terms: [], dates: [] },
        detailed: p.detailed || [],
        slides: p.slides || [],
        test: p.test || [],
        links: p.links || [],
        timeline: p.timeline || [],        // ф. 5: доп. события [{when, what}]
        model3d: p.model3d || null,        // ф. 39: {src:'assets/models/x.glb', caption}
        sectionId: section.id, sectionTitle: section.title
      });
    });
  });
}
buildParagraphs();

/* Совместимость: SITE_DATA.sections/meta → всегда АКТИВНАЯ книга.
   Геттеры нужны при НОВОМ формате (books есть): старый код читает
   SITE_DATA.sections — и получает параграфы текущего учебника.
   Старый формат (одна книга) уже содержит sections — геттеры не нужны. */
(function () {
  if (!SITE_DATA.books) return;   // старый формат: ничего делать не надо
  try {
    Object.defineProperty(SITE_DATA, 'sections', {
      get: function () { var b = activeBook(); return b ? b.sections : []; },
      configurable: true
    });
    Object.defineProperty(SITE_DATA, 'meta', {
      get: function () { return bookMeta(); },
      configurable: true
    });
  } catch (e) { /* экстремально старые браузеры: PARAGRAPHS уже собран */ }
})();

function getParagraph(id) {
  for (var i = 0; i < PARAGRAPHS.length; i++) {
    if (PARAGRAPHS[i].id === id) return PARAGRAPHS[i];
  }
  return null;
}
function paraIndex(p) { return PARAGRAPHS.indexOf(p); }

/* ---------- 3. СОСТОЯНИЕ: прогресс ---------- */

var progress = store.get(K.progress, {});

function isDone(id)      { return !!progress[id]; }
function markDone(id)    { progress[id] = true;  saveProgress(); }
function markUndone(id)  { delete progress[id];   saveProgress(); }
function saveProgress()  { store.set(K.progress, progress); updateHeaderProgress(); renderTOC(); }

/* ---------- 4. ТЕМА: light / dark / auto + акцент ---------- */


function applyTheme(mode) {
  store.set(K.theme, mode);
  document.documentElement.dataset.themeMode = mode;
  /* слот dark = «Светлая» (слоновая кость); слот light = «Тёмная модерн» */
  var dark = mode === 'dark' ||
             (mode === 'auto' && (new Date().getHours() >= 21 || new Date().getHours() < 7));
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#e9e2d0' : '#1c1a17');
}

function applyAccent(a) {
  store.set(K.accent, a);
  document.documentElement.dataset.accent = a;
}

function initTheme() {
  applyAccent(store.get(K.accent, 'oak'));
  applyTheme(store.get(K.theme, 'dark'));   // дефолт — «Светлая» (кость, слот dark)
  $('#theme-toggle').addEventListener('click', function () {
    var order = ['dark', 'light', 'auto'];  // цикл: светлая(кость) → модерн → авто
    var cur = document.documentElement.dataset.themeMode || 'dark';
    var next = order[(order.indexOf(cur) + 1) % 3];
    applyTheme(next);
    toast(next === 'auto' ? 'Тема: авто (по времени)'
         : next === 'dark' ? 'Светлая тема (слоновая кость)'
         : 'Тёмная модерн (дерево/мрамор)');
  });
  /* авто-переключение раз в минуту */
  setInterval(function () {
    if ((document.documentElement.dataset.themeMode || 'auto') === 'auto') applyTheme('auto');
  }, 60000);
}

/* ---------- 5. РОУТИНГ ---------- */

function currentRoute() {
  var h = location.hash.replace(/^#\/?/, '');
  /* deep-link слайда (#/p1/s5) маршрутизируется как параграф p1 */
  var m = h.match(/^([\w-]+)\/s\d+$/);
  return m ? m[1] : (h || 'home');
}

function navigate() {
  closeSidebar();
  var route = currentRoute();
  if (route === 'home') {
    renderHome();
  } else if (route === 'catalog') {
    renderCatalog();               // отдельная страница всех параграфов
  } else if (route === 'glossary') {
    renderGlossary();              // глоссарий всех терминов
  } else if (route === 'flashcards') {
    renderFlashcards();            // флеш-карточки (термины + из тестов)
  } else if (route === 'exam') {
    renderExam();                  // экзамен: случайные вопросы + таймер
  } else if (route === 'mistakes') {
    renderMistakes();              // частые ошибки + разбор
  } else if (route === 'drill') {
    renderDrill();                 // тренажёр по ошибкам
  } else if (route === 'stats') {
    renderStats();                 // статистика, бейджи, цель, повторения
  } else if (route === 'map') {
    renderMap();                   // mind-map курса
  } else if (route === 'game') {
    renderGame();                  // мини-игры: пары/сортировка
  } else if (route === 'myconspect') {
    renderMyConspect();            // конспект-конструктор (ф. 3)
  } else if (route === 'timeline') {
    renderTimeline();              // хронологическая лента (ф. 5)
  } else if (route === 'anchors') {
    renderAnchors();               // мои закладки внутри параграфов (ф. 29)
  } else {
    var p = getParagraph(route);
    if (p) {
      store.set(K.last, p.id);
      bumpDaily('paras');      // активность дня: открыт параграф (streak/цели)
      renderParagraph(p);
    }
    else renderNotFound();
  }
  var app = $('#app');
  if (app) {
    app.focus({ preventScroll: true });
    /* единый плавный вход страниц (гасится при prefers-reduced-motion) */
    app.classList.remove('page-enter');
    void app.offsetWidth;
    app.classList.add('page-enter');
  }
  window.scrollTo(0, 0);
}

/* ---------- 6. TOC (сайдбар) ---------- */

function renderTOC() {
  /* шапка оглавления: вернуться ко всем параграфам (страница каталога) */
  var html = '<div class="toc-book-row">' +
    '<label class="toc-book-label" for="toc-book-select">Учебник</label>' +
    '<select id="toc-book-select" class="toc-book-select glass" aria-label="Выбор учебника">' +
    '</select></div>' +
    '<a class="toc-all" href="#/catalog">' +
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>' +
    'Все параграфы</a>';
  SITE_DATA.sections.forEach(function (section) {
    html += '<div class="toc-section">' + esc(section.short) + '</div>';
    section.paragraphs.forEach(function (p) {
      var active = currentRoute() === p.id ? ' active' : '';
      var mark = isDone(p.id) ? '<span class="toc-mark done">✓</span>'
             : '<span class="toc-mark"></span>';
      html += '<a class="toc-link' + active + '" href="#/' + esc(p.id) + '">' +
                '<span class="toc-num">' + esc(p.num) + '</span>' +
                '<span class="toc-title"><span>' + esc(p.title) + '</span></span>' +
                mark + '</a>';
    });
  });
  $('#toc-list').innerHTML = html;
  renderBookSwitch();   // наполнить селект книгами
}

/* ---------- 7. ГЛАВНАЯ ---------- */

function statCard(v, l) { return '<div class="stat"><b>' + esc(v) + '</b><span>' + esc(l) + '</span></div>'; }

function continueTarget() {
  var last = store.get(K.last, null);
  if (last && getParagraph(last)) return getParagraph(last);
  var first = PARAGRAPHS.filter(function (p) { return !isDone(p.id); })[0];
  return first || PARAGRAPHS[0];
}

function renderHome() {
  var meta = SITE_DATA.meta;
  var ready = PARAGRAPHS.filter(function (p) { return p.status === 'ready'; }).length;
  var done  = PARAGRAPHS.filter(function (p) { return isDone(p.id); }).length;
  var nQ    = PARAGRAPHS.reduce(function (a, p) { return a + p.test.length; }, 0);
  var nS    = PARAGRAPHS.reduce(function (a, p) { return a + p.slides.length; }, 0);
  var cont  = continueTarget();

  var html = '';

  /* --- HERO с книгой из serca-na-daloni: авто-раскрытие через 900 мс,
         клик по раскрытой → каталог параграфов --- */
  html += '<section class="book-hero glass-strong glint">' +
    '<div class="book-scene">' +
      '<div class="book" id="hero-book" role="button" tabindex="0" ' +
           'aria-label="Книга учебника. Нажмите, чтобы открыть список параграфов">' +
        '<span class="book-page-face">' +
          '<span class="p-quote">«Прогресс и регресс, цивилизация и глобализация, право и общество — курс, который собирается в цельную картину мира»</span>' +
          '<span class="p-src">— конспекты 21 параграфа</span>' +
        '</span>' +
        '<span class="book-flap" id="hero-flap">' +
          '<span class="b-frame"></span>' +
          '<span class="b-author">11 класс</span>' +
          '<span class="b-orn">❦</span>' +
          '<span class="b-title">Обществоведение</span>' +
          '<span class="b-orn">✦ ✦ ✦</span>' +
          '<span class="b-genre">конспекты · уроки · тесты</span>' +
        '</span>' +
      '</div>' +
      '<p class="cover-caption">Нажмите на книгу — она раскроется; ещё раз — ко всем параграфам</p>' +
    '</div>' +
    '<div class="book-hero-copy">' +
      '<h1>' + esc(meta.siteTitle) + '</h1>' +
      '<p>' + esc(meta.heroText) + '</p>' +
      '<span class="hero-source">' + esc(meta.source) + '</span>' +
      '<p style="margin-top:16px">' +
        '<button type="button" class="btn btn-primary" id="hero-book-btn">Все параграфы (' + PARAGRAPHS.length + ')</button> ' +
        (cont ? '<a class="btn btn-ghost" href="#/' + esc(cont.id) + '">Продолжить: ' + esc(cont.num) + ' →</a>' : '') +
      '</p>' +
    '</div>' +
  '</section>';

  html += '<div class="stat-grid">' +
      statCard(PARAGRAPHS.length, 'параграфов') +
      statCard(ready, 'с контентом') +
      statCard(nS, 'слайдов уроков') +
      statCard(nQ, 'тестовых вопросов') +
    '</div>';

  SITE_DATA.sections.forEach(function (section) {
    var dc = section.paragraphs.filter(function (p) { return isDone(p.id); }).length;
    html += '<section class="section-card card glint">' +
      '<div class="card-head"><h2>' + esc(section.title) + '</h2>' +
      '<span class="muted">' + dc + ' / ' + section.paragraphs.length + ' пройдено</span></div><ul class="p-list">';
    section.paragraphs.forEach(function (p) {
      var tag = isDone(p.id) ? '<span class="tag tag-done">✓ пройден</span>'
             : '<span class="tag tag-ready">конспект + урок + тест</span>';
      html += '<li class="p-item glint"><a href="#/' + esc(p.id) + '">' +
        '<span class="p-num">' + esc(p.num) + '</span>' +
        '<span class="p-name"><span>' + esc(p.title) + '</span></span>' +
        '<span class="p-status">' + tag + '</span></a></li>';
    });
    html += '</ul></section>';
  });

  $('#app').innerHTML = html;
  document.title = meta.siteTitle;
  initHeroBook();      // книга-обложка: авто-раскрытие + клик → каталог
  renderTOC();
}

/* ---------- 7b. КАТАЛОГ: отдельная страница всех параграфов (#/catalog) ---------- */

function renderCatalog() {
  var html = '';

  /* Шапка каталога: назад + поиск по списку */
  html += '<nav class="crumbs"><a href="#/">Главная</a> / <span>Все параграфы</span></nav>' +
    '<div class="p-head"><span class="p-head-num">§§</span><h1>Все параграфы</h1></div>' +
    '<p class="muted" style="margin-bottom:14px">' + PARAGRAPHS.length + ' параграфов · клик — открыть конспект, урок и тест</p>' +
    '<input type="search" class="gloss-search" id="catalog-filter" placeholder="Фильтр по названию или описанию…" aria-label="Фильтр параграфов">';

  /* Сетка карточек: раздел → параграфы */
  html += '<div id="catalog-grid">';
  SITE_DATA.sections.forEach(function (section) {
    html += '<h2 class="cat-sec">' + esc(section.title) + '</h2><div class="cat-grid">';
    section.paragraphs.forEach(function (p) {
      var intro = (p.conspect.intro || '').slice(0, 140);
      html += '<a class="cat-card card glint" href="#/' + esc(p.id) + '">' +
        '<span class="cat-num">' + esc(p.num) + '</span>' +
        '<b class="cat-title">' + esc(p.title) + '</b>' +
        (intro ? '<span class="cat-intro">' + esc(intro) + '…</span>' : '') +
        '<span class="cat-tags">' +
          (isDone(p.id) ? '<span class="tag tag-done">✓ пройден</span>' : '') +
          p.slides.length + ' слайдов · ' + p.test.length + ' вопросов' +
        '</span>' +
      '</a>';
    });
    html += '</div>';
  });
  html += '</div>';

  $('#app').innerHTML = html;
  document.title = 'Все параграфы · ' + SITE_DATA.meta.siteTitle;

  /* Фильтр: живой поиск по номеру/названию/описанию */
  var filter = $('#catalog-filter');
  filter.addEventListener('input', function () {
    var q = filter.value.trim().toLowerCase();
    $$('#catalog-grid .cat-card').forEach(function (card) {
      var txt = card.textContent.toLowerCase();
      card.hidden = q && txt.indexOf(q) === -1;
    });
    /* скрываем пустые секции */
    $$('#catalog-grid .cat-sec').forEach(function (sec) {
      var any = false, el = sec.nextElementSibling;
      while (el && el.classList.contains('cat-grid')) {
        if ($$('.cat-card', el).some(function (c) { return !c.hidden; })) { any = true; break; }
        el = el.nextElementSibling;
      }
      sec.hidden = !any;
    });
  });

  renderTOC();
}

/* ============================================================================
   HERO-КНИГА на главной (renderHome): перенос анимации из serca-na-daloni —
   авто-раскрытие через 900 мс, клик — тумблер open/close (как в оригинале),
   двойной клик/кнопка — переход к каталогу. Обложка = assets/book-cover.*.
   Плюс параллакс: книга мягко наклоняется к курсору (--px/--py).
   ============================================================================ */

function initHeroBook() {
  var book = $('#hero-book');
  if (!book) return;
  var flap = $('#hero-flap');

  /* Обложка-изображение (если есть) */
  ['png', 'jpg'].forEach(function (ext) {
    var img = new Image();
    img.onload = function () {
      if (flap.classList.contains('has-img')) return;
      flap.style.backgroundImage = 'url(' + img.src + ')';
      flap.classList.add('has-img');
    };
    img.src = 'assets/book-cover.' + ext;
  });

  /* Оригинальная логика serca-na-daloni: авто-open через 900 мс,
     клик — тумблер. Первый клик = «полюбоваться разворотом»,
     клик по уже открытой — переход к параграфам (предсказуемо). */
  var opened = false;
  setTimeout(function () {
    opened = true;
    book.classList.add('open');
  }, 900);

  book.addEventListener('click', function () {
    if (!opened) {
      opened = true;
      book.classList.add('open');
    } else {
      location.hash = '#/catalog';   // книга уже раскрыта → к параграфам
    }
  });

  /* Кнопка-дублер под книгой */
  var btn = $('#hero-book-btn');
  if (btn) btn.addEventListener('click', function () { location.hash = '#/catalog'; });

  /* Параллакс: книга мягко наклоняется к курсору (только десктоп,
     respecting prefers-reduced-motion — см. CSS-медиа) */
  if (motionOK) {
    var scene = book.closest('.book-scene');
    if (scene) {
      scene.addEventListener('pointermove', function (e) {
        var r = scene.getBoundingClientRect();
        var dx = (e.clientX - r.left) / r.width - 0.5;    // -0.5..0.5
        var dy = (e.clientY - r.top) / r.height - 0.5;
        book.style.setProperty('--px', (dx * 6).toFixed(2) + 'deg');
        book.style.setProperty('--py', (dy * 5).toFixed(2) + 'deg');
      }, { passive: true });
      scene.addEventListener('pointerleave', function () {
        book.style.setProperty('--px', '0deg');
        book.style.setProperty('--py', '0deg');
      }, { passive: true });
    }
  }
}

/* ============================================================================
   МИКРОВЗАИМОДЕЙСТВИЯ: ripple на стеклянных кнопках (делегированный),
   пауза idle-анимаций у скрытой вкладки, скелетон первого рендера.
   ============================================================================ */

function initMicroInteractions() {
  /* Ripple: на .btn/.act/.icon-btn при клике/Enter */
  document.addEventListener('pointerdown', function (e) {
    var btn = e.target.closest && e.target.closest('.btn, .act, .icon-btn, .tool-btn');
    if (!btn || !motionOK) return;
    var r = btn.getBoundingClientRect();
    var rip = document.createElement('span');
    rip.className = 'ripple';
    var d = Math.max(r.width, r.height);
    rip.style.width = rip.style.height = d + 'px';
    rip.style.left = (e.clientX - r.left - d / 2) + 'px';
    rip.style.top = (e.clientY - r.top - d / 2) + 'px';
    if (getComputedStyle(btn).position === 'static') btn.style.position = 'relative';
    btn.appendChild(rip);
    setTimeout(function () { rip.remove(); }, 400);
  }, { passive: true });

  /* Скрытая вкладка → гасим idle-анимации (батарея) */
  document.addEventListener('visibilitychange', function () {
    document.body.classList.toggle('idle-anim-off', document.hidden);
  });
}

/* ============================================================================
   ЧАСТЬ C: ЯДРО ФИЧ — журнал тестов, активность, повторения, достижения.
   Все роуты (#/glossary, #/flashcards, #/exam, #/mistakes, #/stats, #/map,
   #/game, #/repeat) рендерятся в #app, данные — из data.js, состояние — K.*.
   ============================================================================ */

/* ---------- Журнал попытки теста (для статистики/ошибок/streak) ---------- */

function logQuizAttempt(p, answers, score, total) {
  var log = store.get(K.quizLog, {});
  var wrong = [];
  answers.forEach(function (a, qi) { if (a !== p.test[qi].correct) wrong.push(qi); });
  (log[p.id] = log[p.id] || []).push({
    d: new Date().toISOString().slice(0, 10),
    score: score, total: total, wrong: wrong
  });
  store.set(K.quizLog, log);

  /* счётчик ошибок по вопросам «pid:qi» — для тренажёра и «частых ошибок» */
  var mis = store.get(K.mistakes, {});
  wrong.forEach(function (qi) {
    var k = p.id + ':' + qi;
    mis[k] = (mis[k] || 0) + 1;
  });
  store.set(K.mistakes, mis);

  /* активность дня: тест +, параграф + (если впервые пройден) */
  bumpDaily('tests');

  /* параграф пройден ≥60% → назначаем повторение через 3 дня */
  if (score / total >= 0.6) scheduleRepeat(p.id, 3);

  checkBadges();  // обновляем достижения
}

/* ---------- Ежедневная активность, цель, streak (фичи 10, 14) ---------- */

function todayKey() { return new Date().toISOString().slice(0, 10); }

function bumpDaily(kind) {
  var d = store.get(K.daily, {});
  var t = d[todayKey()] || { paras: 0, tests: 0 };
  t[kind] = (t[kind] || 0) + 1;
  d[todayKey()] = t;
  store.set(K.daily, d);
}

function streakDays() {
  var d = store.get(K.daily, {});
  var streak = 0;
  var day = new Date();
  /* идём назад от сегодня, пока находим активность (сегодня — если уже есть) */
  if (!d[day.toISOString().slice(0, 10)]) day.setDate(day.getDate() - 1);
  while (d[day.toISOString().slice(0, 10)]) {
    streak++;
    day.setDate(day.getDate() - 1);
  }
  return streak;
}

/* ---------- Spaced repetition: «повторить сегодня» (фича 19) ---------- */

function scheduleRepeat(pid, days) {
  var r = store.get(K.repeat, {});
  var d = new Date();
  d.setDate(d.getDate() + days);
  r[pid] = d.toISOString().slice(0, 10);
  store.set(K.repeat, r);
}

function dueRepeats() {
  var r = store.get(K.repeat, {});
  var today = todayKey();
  return Object.keys(r).filter(function (pid) { return r[pid] <= today && getParagraph(pid); });
}

/* ---------- Достижения/бейджи (фича 14) ---------- */

var BADGES = [
  { id: 'first',   icon: '🌱', name: 'Первый шаг',    test: function () { return doneCount() >= 1; } },
  { id: 'five',    icon: '📖', name: 'Пять параграфов', test: function () { return doneCount() >= 5; } },
  { id: 'half',    icon: '🏛', name: 'Половина курса', test: function () { return doneCount() >= Math.ceil(PARAGRAPHS.length / 2); } },
  { id: 'all',     icon: '🎓', name: 'Весь курс!',    test: function () { return doneCount() >= PARAGRAPHS.length; } },
  { id: 'perfect', icon: '💯', name: 'Идеальный тест', test: function () {
      var log = store.get(K.quizLog, {});
      return Object.keys(log).some(function (pid) {
        return log[pid].some(function (a) { return a.score === a.total; });
      });
  } },
  { id: 'streak3', icon: '🔥', name: 'Серия 3 дня',   test: function () { return streakDays() >= 3; } },
  { id: 'streak7', icon: '⚡', name: 'Серия 7 дней',  test: function () { return streakDays() >= 7; } },
  { id: 'goal',    icon: '🎯', name: 'Дневная цель',  test: function () {
      var t = store.get(K.daily, {})[todayKey()];
      var g = store.get(K.goal, 1);
      return t && (t.paras + t.tests) >= g;
  } }
];

function doneCount() { return PARAGRAPHS.filter(function (p) { return isDone(p.id); }).length; }

function checkBadges() {
  var got = store.get(K.badges, {});
  BADGES.forEach(function (b) {
    if (!got[b.id] && b.test()) {
      got[b.id] = true;
      store.set(K.badges, got);
      toast('Достижение: ' + b.name + ' ' + b.icon);
    }
  });
}

/* ---------- 6. ГЛОССАРИЙ (#/glossary) ---------- */

function allTerms() {
  var out = [];
  PARAGRAPHS.forEach(function (p) {
    (p.conspect.terms || []).forEach(function (t) {
      out.push({ term: t.term, def: t.def, src: p.num + ' ' + p.title, pid: p.id });
    });
    (p.detailed || []).forEach(function (b) {
      if (b.type === 'terms') (b.items || []).forEach(function (t) {
        out.push({ term: t.term, def: t.def, src: p.num + ' ' + p.title, pid: p.id });
      });
    });
  });
  /* дедупликация по термину */
  var seen = {};
  return out.filter(function (t) {
    var k = t.term.toLowerCase();
    if (seen[k]) return false;
    seen[k] = true;
    return true;
  }).sort(function (a, b) { return a.term.localeCompare(b.term, 'ru'); });
}

function renderGlossary() {
  var terms = allTerms();
  var html = '<nav class="crumbs"><a href="#/">Главная</a> / <span>Глоссарий</span></nav>' +
    '<div class="p-head"><span class="p-head-num">А—Я</span><h1>Глоссарий курса</h1></div>' +
    '<p class="muted" style="margin-bottom:14px">' + terms.length + ' терминов из всех параграфов</p>' +
    '<input type="search" class="gloss-search" id="gloss-filter" placeholder="Поиск термина…" aria-label="Поиск по глоссарию">' +
    '<dl class="gloss-list" id="gloss-list">';
  terms.forEach(function (t) {
    html += '<div class="gloss-item"><dt>' + esc(t.term) + '</dt><dd>' + esc(t.def) +
      '<div class="gloss-src"><a href="#/' + esc(t.pid) + '">' + esc(t.src) + '</a></div></dd></div>';
  });
  html += '</dl>';
  $('#app').innerHTML = html;
  document.title = 'Глоссарий · ' + SITE_DATA.meta.siteTitle;

  var f = $('#gloss-filter');
  f.addEventListener('input', function () {
    var q = f.value.trim().toLowerCase();
    $$('#gloss-list .gloss-item').forEach(function (el) {
      el.hidden = q && el.textContent.toLowerCase().indexOf(q) === -1;
    });
  });
  f.focus();
  renderTOC();
}

/* ---------- 4. FLASHCARDS (#/flashcards) ---------- */

function renderFlashcards() {
  var terms = allTerms();
  var quizDeck = quizCards();                    // ф. 10: карточки из тестов
  var i = 0, flipped = false, deck = terms.slice();
  var mode = 'terms';                            // 'terms' | 'quiz'

  var html = '<nav class="crumbs"><a href="#/">Главная</a> / <span>Флеш-карточки</span></nav>' +
    '<div class="p-head"><span class="p-head-num">↻</span><h1>Флеш-карточки</h1></div>' +
    /* переключатель источника колоды (ф. 10) */
    '<div class="tabs" role="tablist" aria-label="Источник карточек">' +
      '<button type="button" class="tab-btn active" data-mode="terms">Из терминов (' + terms.length + ')</button>' +
      '<button type="button" class="tab-btn" data-mode="quiz">Из тестов (' + quizDeck.length + ')</button>' +
    '</div>' +
    '<div class="flash-zone">' +
      '<div class="flash-card glint" id="flash-card" role="button" tabindex="0" aria-label="Перевернуть карточку"></div>' +
      '<div class="flash-hint" id="flash-count"></div>' +
      '<div class="quiz-actions" style="justify-content:center">' +
        '<button type="button" class="btn btn-ghost" id="flash-prev">← Назад</button>' +
        '<button type="button" class="btn btn-ghost" id="flash-shuffle">Перемешать</button>' +
        '<button type="button" class="btn btn-primary" id="flash-next">Вперёд →</button>' +
      '</div>' +
    '</div>';
  $('#app').innerHTML = html;
  document.title = 'Флеш-карточки · ' + SITE_DATA.meta.siteTitle;

  var card = $('#flash-card');
  function draw() {
    var t = deck[i];
    if (!t) { card.innerHTML = '<span class="muted">Колода пуста</span>'; return; }
    card.innerHTML = '<small>' + (i + 1) + ' / ' + deck.length + '</small>' +
      (flipped ? '<b>' + esc(t.def) + '</b>' : '<b>' + esc(t.term) + '</b>');
    $('#flash-count').textContent =
      (flipped ? (mode === 'quiz' ? 'Ответ' : 'Определение') : (mode === 'quiz' ? 'Вопрос' : 'Термин')) +
      ' · ' + esc(t.src || '');
  }
  function flip() { flipped = !flipped; draw(); }
  function next() { i = (i + 1) % deck.length; flipped = false; draw(); }
  function prev() { i = (i - 1 + deck.length) % deck.length; flipped = false; draw(); }
  function switchMode(m) {
    mode = m;
    deck = (m === 'quiz' ? quizDeck : terms).slice();
    i = 0; flipped = false;
    $$('.tab-btn[data-mode]').forEach(function (b) { b.classList.toggle('active', b.dataset.mode === m); });
    draw();
  }

  card.addEventListener('click', flip);
  card.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); }
  });
  $('#flash-next').addEventListener('click', next);
  $('#flash-prev').addEventListener('click', prev);
  /* свайп карточек (touch/mouse): влево — вперёд, вправо — назад */
  initSwipeSimple(card, next, prev);
  $$('.tab-btn[data-mode]').forEach(function (b) {
    b.addEventListener('click', function () { switchMode(b.dataset.mode); });
  });
  $('#flash-shuffle').addEventListener('click', function () {
    deck.sort(function () { return Math.random() - 0.5; });
    i = 0; flipped = false; draw();
    toast('Колода перемешана');
  });
  document.addEventListener('keydown', function (e) {
    if (currentRoute() !== 'flashcards') return;
    if (e.key === 'ArrowRight') next();
    if (e.key === 'ArrowLeft') prev();
  });
  draw();
  renderTOC();
}

/* ---------- 9. ЭКЗАМЕН (#/exam): случайные вопросы + таймер ---------- */

function renderExam() {
  var N = 15, TIME = 10 * 60;   // 15 вопросов, 10 минут
  var pool = [];
  PARAGRAPHS.forEach(function (p) {
    p.test.forEach(function (q, qi) { pool.push({ p: p, q: q, qi: qi }); });
  });
  /* перемешиваем и берём N */
  pool.sort(function () { return Math.random() - 0.5; });
  pool = pool.slice(0, Math.min(N, pool.length));

  var html = '<nav class="crumbs"><a href="#/">Главная</a> / <span>Экзамен</span></nav>' +
    '<div class="p-head"><span class="p-head-num">№</span><h1>Режим «Экзамен»</h1></div>' +
    '<div class="exam-top"><span class="muted">' + pool.length + ' случайных вопросов из всего курса</span>' +
    '<span class="exam-timer" id="exam-timer">' + TIME / 60 + ':00</span></div>' +
    '<form class="quiz" id="exam-form">';
  pool.forEach(function (item, n) {
    html += '<fieldset class="quiz-q" data-n="' + n + '"><legend class="quiz-q-title">Вопрос ' + (n + 1) + '</legend><div class="quiz-opts">';
    item.q.options.forEach(function (opt, oi) {
      html += '<label class="quiz-opt"><input type="radio" name="e' + n + '" value="' + oi + '"><span>' + esc(opt) + '</span></label>';
    });
    html += '</div></fieldset>';
  });
  html += '<div class="quiz-actions"><button type="submit" class="btn btn-primary">Завершить экзамен</button></div>' +
    '<div class="quiz-result" id="exam-result" hidden></div></form>';

  $('#app').innerHTML = html;
  document.title = 'Экзамен · ' + SITE_DATA.meta.siteTitle;

  /* таймер */
  var left = TIME;
  var timerEl = $('#exam-timer');
  var timer = setInterval(function () {
    left--;
    var m = Math.floor(left / 60), s = left % 60;
    timerEl.textContent = m + ':' + (s < 10 ? '0' : '') + s;
    if (left <= 60) timerEl.classList.add('low');
    if (left <= 0) { clearInterval(timer); finish(true); }
  }, 1000);

  function finish(timeout) {
    clearInterval(timer);
    var score = 0;
    pool.forEach(function (item, n) {
      var sel = $('input[name="e' + n + '"]:checked');
      if (sel && parseInt(sel.value, 10) === item.q.correct) score++;
    });
    var pct = Math.round((score / pool.length) * 100);
    var res = $('#exam-result');
    res.hidden = false;
    res.innerHTML = (timeout ? '<b>Время вышло!</b> ' : '') +
      '<b>Результат экзамена: ' + score + ' из ' + pool.length + ' (' + pct + '%)</b>' +
      '<div class="score-bar"><i style="width:' + pct + '%"></i></div>' +
      (pct >= 80 ? 'Отличная подготовка!' : pct >= 60 ? 'Хорошо, но повторите слабые темы.' : 'Рекомендуем повторить конспекты.');
    $$('#exam-form .quiz-opt input').forEach(function (r) { r.disabled = true; });
    res.scrollIntoView({ behavior: 'smooth' });
    bumpDaily('tests');
    checkBadges();
  }

  $('#exam-form').addEventListener('submit', function (e) {
    e.preventDefault();
    finish(false);
  });
  renderTOC();
}

/* ---------- 15/26. ТРЕНАЖЁР ОШИБОК и «ЧАСТЫЕ ОШИБКИ» (#/mistakes) ---------- */

function mistakeItems() {
  var mis = store.get(K.mistakes, {});
  return Object.keys(mis).map(function (k) {
    var parts = k.split(':');
    var pid = parts[0], qi = parseInt(parts[1], 10);
    var p = getParagraph(pid);
    if (!p || !p.test[qi]) return null;
    return { pid: pid, qi: qi, count: mis[k], p: p, q: p.test[qi] };
  }).filter(Boolean).sort(function (a, b) { return b.count - a.count; });
}

function renderMistakes() {
  var items = mistakeItems();
  var html = '<nav class="crumbs"><a href="#/">Главная</a> / <span>Частые ошибки</span></nav>' +
    '<div class="p-head"><span class="p-head-num">!</span><h1>Частые ошибки</h1></div>';

  if (!items.length) {
    html += '<div class="notice notice-info">Пока ошибок нет — пройдите тесты, и здесь появятся вопросы, в которых вы ошибались чаще всего.</div>';
  } else {
    html += '<p class="muted">Вопросы, где вы ошибались чаще всего. Разбор показывает правильный ответ.</p>';
    items.slice(0, 12).forEach(function (it) {
      html += '<div class="quiz-q glint"><div class="quiz-q-title">' +
        '<span class="tag tag-tpl">×' + it.count + '</span> ' + esc(it.q.q) + '</div>' +
        '<div class="quiz-opts">' +
        it.q.options.map(function (o, oi) {
          return '<label class="quiz-opt' + (oi === it.q.correct ? ' correct' : '') + '">' +
            '<input type="radio" disabled' + (oi === it.q.correct ? ' checked' : '') + '><span>' + esc(o) + '</span></label>';
        }).join('') +
        '</div><div class="why"><b>Правильный ответ и пояснение:</b> ' + esc(it.q.why || '') + '</div>' +
        '<div class="small muted" style="margin-top:8px"><a href="#/' + esc(it.pid) + '">Повторить конспект ' + esc(it.p.num) + ' →</a></div></div>';
    });
    /* кнопка тренажёра: те же вопросы, но отвечать можно заново */
    html += '<div class="quiz-actions"><a class="btn btn-primary" href="#/drill">Тренажёр по ошибкам (' + items.length + ')</a></div>';
  }
  $('#app').innerHTML = html;
  document.title = 'Частые ошибки · ' + SITE_DATA.meta.siteTitle;
  renderTOC();
}

/* Тренажёр: вопросы из ошибок, ответы заново */
function renderDrill() {
  var items = mistakeItems().slice(0, 10);
  if (!items.length) { location.hash = '#/mistakes'; return; }

  var html = '<nav class="crumbs"><a href="#/mistakes">Частые ошибки</a> / <span>Тренажёр</span></nav>' +
    '<div class="p-head"><span class="p-head-num">↻</span><h1>Тренажёр ошибок</h1></div>' +
    '<form class="quiz" id="drill-form">';
  items.forEach(function (it, n) {
    html += '<fieldset class="quiz-q" data-n="' + n + '"><legend class="quiz-q-title">' + (n + 1) + '. ' + esc(it.q.q) + '</legend><div class="quiz-opts">';
    it.q.options.forEach(function (o, oi) {
      html += '<label class="quiz-opt"><input type="radio" name="d' + n + '" value="' + oi + '"><span>' + esc(o) + '</span></label>';
    });
    html += '</div><div class="why" hidden><b>Пояснение:</b> ' + esc(it.q.why || '') + '</div></fieldset>';
  });
  html += '<div class="quiz-actions"><button type="submit" class="btn btn-primary">Проверить</button></div>' +
    '<div class="quiz-result" id="drill-result" hidden></div></form>';
  $('#app').innerHTML = html;

  $('#drill-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var score = 0, wrongs = 0;
    items.forEach(function (it, n) {
      var sel = $('input[name="d' + n + '"]:checked');
      var val = sel ? parseInt(sel.value, 10) : -1;
      $$('#drill-form .quiz-q[data-n="' + n + '"] .quiz-opt').forEach(function (el, oi) {
        if (oi === it.q.correct) el.classList.add('correct');
        else if (oi === val) el.classList.add('wrong');
        else el.classList.add('dim');
      });
      var why = $('#drill-form .quiz-q[data-n="' + n + '"] .why'); if (why) why.hidden = false;
      if (val === it.q.correct) {
        score++;
        /* правильный ответ в тренажёре снижает счётчик ошибки вдвое */
        var mis = store.get(K.mistakes, {});
        var k = it.pid + ':' + it.qi;
        mis[k] = Math.floor(mis[k] / 2);
        if (!mis[k]) delete mis[k];
        store.set(K.mistakes, mis);
      } else wrongs++;
    });
    var res = $('#drill-result');
    res.hidden = false;
    res.innerHTML = '<b>Тренажёр: ' + score + ' из ' + items.length + '</b>' +
      (wrongs ? '<div class="small muted">Ошибки остались в списке частых.</div>' : '<div class="small muted">Все ошибки отработаны!</div>');
  });
  renderTOC();
}

/* ---------- 5. СТАТИСТИКА (#/stats) ---------- */

function renderStats() {
  var log = store.get(K.quizLog, {});
  var attempts = 0, bestScore = 0, totalQ = 0, totalCorrect = 0;
  Object.keys(log).forEach(function (pid) {
    log[pid].forEach(function (a) {
      attempts++;
      totalQ += a.total;
      totalCorrect += a.score;
      if (a.score / a.total > bestScore) bestScore = a.score / a.total;
    });
  });
  var goal = store.get(K.goal, 1);
  var todayAct = store.get(K.daily, {})[todayKey()] || { paras: 0, tests: 0 };
  var due = dueRepeats();

  var html = '<nav class="crumbs"><a href="#/">Главная</a> / <span>Статистика</span></nav>' +
    '<div class="p-head"><span class="p-head-num">📊</span><h1>Моя статистика</h1></div>' +
    '<div class="stats-grid">' +
      '<div class="stat-box"><b>' + doneCount() + ' / ' + PARAGRAPHS.length + '</b><span>параграфов пройдено</span></div>' +
      '<div class="stat-box"><b>' + attempts + '</b><span>попыток тестов</span></div>' +
      '<div class="stat-box"><b>' + Math.round(bestScore * 100) + '%</b><span>лучший результат</span></div>' +
      '<div class="stat-box"><b>' + (totalQ ? Math.round(totalCorrect / totalQ * 100) : 0) + '%</b><span>средняя точность</span></div>' +
      '<div class="stat-box"><b>' + streakDays() + '</b><span>дней серия</span></div>' +
      '<div class="stat-box"><b>' + todayAct.paras + ' 📖 + ' + todayAct.tests + ' ✅</b><span>сегодня (цель: ' + goal + ')</span></div>' +
    '</div>' +

    /* Достижения */
    '<h2 class="block-title" style="margin-top:22px">Достижения</h2><div class="badges">' +
    BADGES.map(function (b) {
      var got = store.get(K.badges, {})[b.id];
      return '<div class="badge' + (got ? ' got' : '') + '"><span class="b-icon">' + b.icon + '</span><b>' + esc(b.name) + '</b></div>';
    }).join('') + '</div>' +

    /* Цель дня */
    '<h2 class="block-title" style="margin-top:22px">Цель на день</h2>' +
    '<div class="set-row"><span>Параграфов/тестов в день</span>' +
    '<input type="number" id="goal-input" min="1" max="21" value="' + goal + '"></div>' +

    /* Повторения */
    '<h2 class="block-title" style="margin-top:22px">Повторить сегодня (' + due.length + ')</h2>' +
    (due.length ? due.map(function (pid) {
      var p = getParagraph(pid);
      return '<div class="list-row"><a href="#/' + esc(pid) + '">' + esc(p.num) + '. ' + esc(p.title) + '</a><small>по расписанию</small></div>';
    }).join('') : '<p class="muted small">На сегодня повторений нет. Пройденные параграфы вернутся сюда через 3 дня.</p>') +

    /* История по параграфам */
    '<h2 class="block-title" style="margin-top:22px">История тестов</h2>';
  var any = false;
  Object.keys(log).forEach(function (pid) {
    var p = getParagraph(pid);
    if (!p || !log[pid].length) return;
    any = true;
    var best = log[pid].reduce(function (m, a) { return Math.max(m, a.score / a.total); }, 0);
    html += '<div class="list-row"><a href="#/' + esc(pid) + '">' + esc(p.num) + '. ' + esc(p.title) + '</a>' +
      '<small>лучший: ' + Math.round(best * 100) + '% · попыток: ' + log[pid].length + '</small></div>' +
      log[pid].slice(-3).map(function (a) {
        return '<div class="hist-row"><span>' + a.d + '</span><span>' + a.score + ' / ' + a.total + '</span></div>';
      }).join('');
  });
  if (!any) html += '<p class="muted small">Пройдите любой тест — здесь появится история.</p>';

  $('#app').innerHTML = html;
  document.title = 'Статистика · ' + SITE_DATA.meta.siteTitle;

  $('#goal-input').addEventListener('change', function () {
    store.set(K.goal, Math.max(1, Math.min(21, parseInt(this.value, 10) || 1)));
    toast('Цель сохранена');
    checkBadges();
  });
  renderTOC();
}

/* ---------- 13. MIND-MAP КУРСА (#/map): SVG-карта связей ---------- */

function renderMap() {
  /* Раскладка: 21 узел по «рядам» разделов; связи — из p.links */
  var W = 960, rowH = 110, colW = 150;
  var nodes = [], pos = {};
  PARAGRAPHS.forEach(function (p, i) {
    var sec = PARAGRAPHS.slice(0, i + 1).filter(function (x) { return x.sectionId === p.sectionId; }).length - 1;
    pos[p.id] = { x: 40 + (i % 2) * colW + sec * 0, y: 0 };
    nodes.push(p);
  });
  /* проще: узлы по порядку, зигзаг в 2 колонки на раздел */
  var sections = SITE_DATA.sections;
  var y = 30, coords = {};
  sections.forEach(function (s) {
    s.paragraphs.forEach(function (p, i) {
      var x = 60 + (i % 2) * 220 + sections.indexOf(s) * 10;
      coords[p.id] = { x: x, y: y };
      y += i % 2 === 1 ? rowH : 14;
    });
    y += 30;
  });

  var html = '<nav class="crumbs"><a href="#/">Главная</a> / <span>Карта курса</span></nav>' +
    '<div class="p-head"><span class="p-head-num">◎</span><h1>Карта курса</h1></div>' +
    '<p class="muted" style="margin-bottom:12px">Линии — связи между параграфами (из data.js). Клик по узлу — открыть.</p>' +
    '<div class="map-wrap"><svg class="map-svg" viewBox="0 0 ' + W + ' ' + (y + 40) + '" role="img" aria-label="Схема связей параграфов">';

  /* рёбра */
  PARAGRAPHS.forEach(function (p) {
    (p.links || []).forEach(function (lid) {
      var a = coords[p.id], b = coords[lid];
      if (!a || !b) return;
      var mx = (a.x + b.x) / 2 + 40, my = (a.y + b.y) / 2;
      html += '<path class="map-edge" d="M' + (a.x + 60) + ' ' + (a.y + 22) + ' Q' + mx + ' ' + my + ' ' + (b.x + 60) + ' ' + (b.y + 22) + '"/>';
    });
  });
  /* узлы */
  PARAGRAPHS.forEach(function (p) {
    var c = coords[p.id];
    html += '<g class="map-node' + (isDone(p.id) ? ' done' : '') + '" data-id="' + esc(p.id) + '" tabindex="0" role="link" aria-label="' + esc(p.num + ' ' + p.title) + '">' +
      '<rect x="' + c.x + '" y="' + c.y + '" width="120" height="44" rx="12"/>' +
      '<text class="map-num" x="' + (c.x + 10) + '" y="' + (c.y + 18) + '">' + esc(p.num) + '</text>' +
      '<text x="' + (c.x + 10) + '" y="' + (c.y + 34) + '">' + esc(p.title.slice(0, 16)) + (p.title.length > 16 ? '…' : '') + '</text></g>';
  });
  html += '</svg></div>';
  $('#app').innerHTML = html;
  document.title = 'Карта курса · ' + SITE_DATA.meta.siteTitle;

  $('.map-svg').addEventListener('click', function (e) {
    var n = e.target.closest('.map-node');
    if (n) location.hash = '#/' + n.dataset.id;
  });
  $('.map-svg').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    var n = e.target.closest('.map-node');
    if (n) location.hash = '#/' + n.dataset.id;
  });
  renderTOC();
}

/* ---------- 7. POMODORO (виджет + режим фокуса) ---------- */

var pomoState = { left: 25 * 60, mode: 'focus', run: false, timer: null };

function pomoFmt(s) { return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); }

function pomoTick() {
  if (!pomoState.run) return;
  pomoState.left--;
  if (pomoState.left <= 0) {
    /* смена режима: фокус → перерыв → фокус */
    var next = pomoState.mode === 'focus' ? 'break' : 'focus';
    var cfg = store.get(K.pomo, { min: 25, brk: 5 });
    pomoState.mode = next;
    pomoState.left = (next === 'focus' ? cfg.min : cfg.brk) * 60;
    toast(next === 'break' ? 'Перерыв! Отдохните ' + cfg.brk + ' минут' : 'Фокус! ' + cfg.min + ' минут учёбы');
  }
  $('#pomo-time').textContent = pomoFmt(pomoState.left);
  $('#pomo-mode').textContent = pomoState.mode === 'focus' ? 'фокус' : 'перерыв';
}

function initPomodoro() {
  var cfg = store.get(K.pomo, { min: 25, brk: 5 });
  pomoState.left = cfg.min * 60;
  $('#pomo-time').textContent = pomoFmt(pomoState.left);
  var widget = $('#pomodoro');

  $('#pomo-start').addEventListener('click', function () {
    pomoState.run = !pomoState.run;
    this.textContent = pomoState.run ? '⏸' : '▶';
    document.body.classList.toggle('focus-mode', pomoState.run && pomoState.mode === 'focus');
    toast(pomoState.run ? 'Таймер запущен. Режим фокуса.' : 'Пауза');
  });
  $('#pomo-reset').addEventListener('click', function () {
    pomoState.run = false;
    pomoState.left = cfg.min * 60;
    pomoState.mode = 'focus';
    $('#pomo-start').textContent = '▶';
    $('#pomo-time').textContent = pomoFmt(pomoState.left);
    $('#pomo-mode').textContent = 'фокус';
    document.body.classList.remove('focus-mode');
  });
  $('#pomo-hide').addEventListener('click', function () {
    widget.hidden = true;   /* скрыть до перезагрузки (не обяз. фича) */
  });

  pomoState.timer = setInterval(pomoTick, 1000);
}

/* ---------- 22. МИНИ-ИГРЫ (#/game): пары + сортировка ---------- */

function shuffle(a) { var r = a.slice(); r.sort(function () { return Math.random() - 0.5; }); return r; }

function renderGame() {
  var terms = allTerms().slice(0, 40);
  var html = '<nav class="crumbs"><a href="#/">Главная</a> / <span>Мини-игры</span></nav>' +
    '<div class="p-head"><span class="p-head-num">🎮</span><h1>Мини-игры на термины</h1></div>' +
    '<div class="tabs"><button type="button" class="tab-btn active" data-g="pairs">Пары</button>' +
    '<button type="button" class="tab-btn" data-g="sort">Сортировка</button></div>' +
    '<div id="game-zone"></div>';
  $('#app').innerHTML = html;
  document.title = 'Мини-игры · ' + SITE_DATA.meta.siteTitle;

  $$('.tab-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('.tab-btn').forEach(function (x) { x.classList.toggle('active', x === b); });
      b.dataset.g === 'pairs' ? gamePairs(terms) : gameSort(terms);
    });
  });
  gamePairs(terms);
  renderTOC();
}

/* Пары: терм ↔ определение */
function gamePairs(terms) {
  var pick = shuffle(terms).slice(0, 6);
  var left = shuffle(pick), right = shuffle(pick);
  var selL = null, matched = 0;
  var zone = $('#game-zone');

  function draw() {
    zone.innerHTML = '<div class="game-pairs">' +
      '<div class="pair-col">' + left.map(function (t, i) {
        return '<button type="button" class="pair-card" data-side="l" data-i="' + i + '"' + (t._m ? ' style="opacity:.3;pointer-events:none"' : '') + '>' + esc(t.term) + '</button>';
      }).join('') + '</div>' +
      '<div class="pair-col">' + right.map(function (t, i) {
        return '<button type="button" class="pair-card" data-side="r" data-i="' + i + '"' + (t._m ? ' style="opacity:.3;pointer-events:none"' : '') + '>' + esc(t.def.slice(0, 60)) + '…</button>';
      }).join('') + '</div></div>' +
      '<div class="game-msg" id="game-msg"></div>';
  }

  zone.addEventListener('click', function (e) {
    var card = e.target.closest('.pair-card');
    if (!card) return;
    var side = card.dataset.side, i = parseInt(card.dataset.i, 10);
    var t = (side === 'l' ? left : right)[i];
    if (side === 'l') {
      selL = { t: t, el: card };
      $$('.pair-card[data-side="l"]').forEach(function (c) { c.classList.remove('sel'); });
      card.classList.add('sel');
      $('#game-msg').textContent = 'Теперь выберите определение…';
    } else if (selL) {
      if (selL.t === t) {
        t._m = true;
        selL.el.style.opacity = '.3'; selL.el.style.pointerEvents = 'none';
        card.style.opacity = '.3'; card.style.pointerEvents = 'none';
        matched++;
        $('#game-msg').textContent = matched === pick.length ? 'Все пары найдены!' : 'Верно! +1';
        if (matched === pick.length) { toast('Игра «Пары» пройдена!'); bumpDaily('tests'); checkBadges(); }
      } else {
        $('#game-msg').textContent = 'Не то. Попробуйте ещё.';
      }
      selL = null;
      $$('.pair-card[data-side="l"]').forEach(function (c) { c.classList.remove('sel'); });
    }
  });
  draw();
}

/* Сортировка: разложить термины по разделам курса */
function gameSort(terms) {
  var secs = SITE_DATA.sections.map(function (s) { return { id: s.id, title: s.short, terms: [] }; });
  /* собираем по 3 термина из каждого раздела */
  var pool = [];
  secs.forEach(function (sec) {
    var secP = PARAGRAPHS.filter(function (p) { return p.sectionId === sec.id; });
    secP.forEach(function (p) {
      (p.conspect.terms || []).slice(0, 1).forEach(function (t) { pool.push({ t: t, sec: sec.id }); });
    });
  });
  pool = shuffle(pool).slice(0, 8);
  var placed = 0;
  var zone = $('#game-zone');

  zone.innerHTML = '<p class="muted">Раскладывайте термины по разделам курса:</p>' +
    '<div class="pair-col" id="sort-pool">' +
    pool.map(function (it, i) { return '<button type="button" class="pair-card" data-i="' + i + '">' + esc(it.t.term) + '</button>'; }).join('') +
    '</div>' +
    '<div class="stats-grid" style="margin-top:14px">' + secs.map(function (s) {
      return '<div class="stat-box"><b style="font-size:1rem">' + esc(s.title) + '</b>' +
        '<div class="drop-zone" data-sec="' + s.id + '" style="min-height:40px;margin-top:8px;border:2px dashed var(--border);border-radius:12px;padding:8px"></div></div>';
    }).join('') + '</div><div class="game-msg" id="game-msg"></div>';

  var sel = null;
  zone.addEventListener('click', function (e) {
    var card = e.target.closest('.pair-card[data-i]');
    var drop = e.target.closest('.drop-zone');
    if (card) {
      sel = card;
      $$('.pair-card').forEach(function (c) { c.classList.remove('sel'); });
      card.classList.add('sel');
    } else if (drop && sel) {
      var it = pool[parseInt(sel.dataset.i, 10)];
      var ok = it.sec === drop.dataset.sec;
      if (ok) {
        drop.innerHTML += '<div class="pair-card" style="cursor:default">' + esc(it.t.term) + '</div>';
        sel.remove();
        placed++;
        $('#game-msg').textContent = placed === pool.length ? 'Все термины разложены!' : 'Верно!';
        if (placed === pool.length) { toast('Сортировка пройдена!'); bumpDaily('tests'); checkBadges(); }
      } else {
        $('#game-msg').textContent = 'Не тот раздел — попробуйте другой.';
      }
      sel = null;
    }
  });
}

/* ---------- 23. Печать карточек-шпаргалок (принт-окно) ---------- */

function printCheats() {
  var w = window.open('', '_blank');
  if (!w) { toast('Разрешите всплывающие окна'); return; }
  var terms = allTerms();
  w.document.write('<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Шпаргалки</title><style>' +
    'body{font:12px/1.4 "Segoe UI",Arial,sans-serif;padding:16px}' +
    '.cheat-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
    '.cheat-card{border:1px solid #888;border-radius:8px;padding:8px 10px;break-inside:avoid}' +
    '.cheat-card b{display:block;margin-bottom:3px}' +
    '@media print{.cheat-grid{grid-template-columns:1fr 1fr 1fr}}' +
    '</style></head><body><h2>Шпаргалки: ключевые термины (' + terms.length + ')</h2><div class="cheat-grid">' +
    terms.map(function (t) { return '<div class="cheat-card"><b>' + t.term + '</b>' + t.def + '</div>'; }).join('') +
    '</div><script>setTimeout(function(){print()},300)<\/script></body></html>');
  w.document.close();
}

/* ---------- 16. Экспорт/импорт прогресса кодом ---------- */

function exportState() {
  var out = {};
  [K.progress, K.bookmarks, K.quizLog, K.mistakes, K.daily, K.goal, K.badges, K.repeat, K.notes + ''].forEach(function () {});
  [K.progress, K.bookmarks, K.quizLog, K.mistakes, K.daily, K.goal, K.badges, K.repeat].forEach(function (k) {
    out[k] = store.get(k, null);
  });
  /* заметки: собираем по параграфам */
  var notes = {};
  PARAGRAPHS.forEach(function (p) {
    var n = store.get(K.notes + p.id, '');
    if (n) notes[p.id] = n;
  });
  out[K.notes + '*'] = notes;
  return btoa(unescape(encodeURIComponent(JSON.stringify(out))));
}

function importState(code) {
  try {
    var data = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
    Object.keys(data).forEach(function (k) {
      if (k === K.notes + '*') {
        Object.keys(data[k]).forEach(function (pid) { store.set(K.notes + pid, data[k][pid]); });
      } else {
        store.set(k, data[k]);
      }
    });
    progress = store.get(K.progress, {});
    toast('Прогресс импортирован');
    navigate();
  } catch (e) {
    toast('Код повреждён — проверьте и повторите');
  }
}

/* ---------- 25. Онбординг-тур (первый вход) ---------- */

function runOnboarding() {
  if (store.get(K.onboarded, false)) return;
  var steps = [
    { icon: '📖', title: 'Добро пожаловать!', text: 'Конспекты, уроки-презентации и тесты по всем 21 параграфам учебника обществоведения.' },
    { icon: '🔍', title: 'Поиск', text: 'Строка поиска в шапке ищет по всем конспектам. Клавиша / — быстрый фокус.' },
    { icon: '🔖', title: 'Закладки и заметки', text: 'На странице параграфа: добавить в закладки, вести заметки, прослушать конспект.' },
    { icon: '🎯', title: 'Прогресс и цели', text: 'Отмечайте параграфы пройденными. Статистика, серия дней и достижения — в шестерёнке.' },
    { icon: '⌨️', title: 'Хоткеи', text: 'Нажмите ? в любой момент, чтобы увидеть все горячие клавиши.' }
  ];
  var i = 0;
  function show() {
    var s = steps[i];
    openModal('Знакомство с сайтом',
      '<div class="ob-step"><div class="ob-art">' + s.icon + '</div>' +
      '<h3>' + s.title + '</h3><p>' + s.text + '</p>' +
      '<div class="ob-dots">' + steps.map(function (_, n) { return '<span class="' + (n === i ? 'on' : '') + '"></span>'; }).join('') + '</div>' +
      '<div class="quiz-actions" style="justify-content:center">' +
      (i > 0 ? '<button type="button" class="btn btn-ghost" id="ob-prev">Назад</button>' : '') +
      (i < steps.length - 1
        ? '<button type="button" class="btn btn-primary" id="ob-next">Далее</button>'
        : '<button type="button" class="btn btn-success" id="ob-done">Начать учёбу</button>') +
      '</div></div>');
    var n = $('#ob-next'), p = $('#ob-prev'), d = $('#ob-done');
    if (n) n.addEventListener('click', function () { i++; show(); });
    if (p) p.addEventListener('click', function () { i--; show(); });
    if (d) d.addEventListener('click', function () {
      store.set(K.onboarded, true);
      closeModal();
    });
  }
  show();
  /* помечаем сразу, чтобы тур не показывался повторно при сбое */
  store.set(K.onboarded, true);
}

/* ---------- 8. СТРАНИЦА ПАРАГРАФА ---------- */

function renderParagraph(p) {
  var idx = paraIndex(p);
  var prev = idx > 0 ? PARAGRAPHS[idx - 1] : null;
  var next = idx < PARAGRAPHS.length - 1 ? PARAGRAPHS[idx + 1] : null;
  var bookmarked = isBookmarked(p.id);
  var tab = store.get(K.tab, 'short');
  var c = p.conspect;

  var html = '';

  /* Зона 1: навигационные крошки + заголовок */
  html += '<nav class="crumbs"><a href="#/">Главная</a> / <a href="#/">' +
    esc(p.sectionTitle) + '</a> / <span>' + esc(p.num) + '. ' + esc(p.title) + '</span></nav>';
  html += '<div class="p-head"><span class="p-head-num">' + esc(p.num) + '</span><h1>' + esc(p.title) + '</h1></div>';

  /* Зона 2: ACTIONBAR — действия с контентом (закладка, заметки, озвучка, печать) */
  html += '<div class="actionbar" role="toolbar" aria-label="Действия с параграфом">' +
    '<button type="button" class="act' + (bookmarked ? ' on' : '') + '" id="act-bookmark">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 3h12v18l-6-4.5L6 21z"/></svg>' +
      (bookmarked ? 'В закладках' : 'В закладки') + '</button>' +
    '<button type="button" class="act" id="act-notes">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4h16v13l-4 4H4z"/><path d="M8 9h8M8 13h5"/></svg> Заметки</button>' +
    '<button type="button" class="act" id="act-tts">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg> Прослушать</button>' +
    '<button type="button" class="act" id="act-print">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/></svg> Печать / PDF</button>' +
    '<button type="button" class="act' + (store.get(K.reading, false) ? ' on' : '') + '" id="act-reading" title="Режим чтения">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 19V6a2 2 0 0 1 2-2h5v15"/><path d="M20 19V6a2 2 0 0 0-2-2h-5v15"/><path d="M2 19h20"/></svg> ' + (store.get(K.reading, false) ? 'Обычный' : 'Чтение') + '</button>' +
  '</div>';

  /* Скрытая панель заметок (раскрывается кнопкой) */
  html += '<div id="notes-panel" class="block" hidden>' +
    '<h2 class="block-title">Мои заметки (автосохранение)</h2>' +
    '<textarea class="notes-area" id="notes-area" placeholder="Записывайте мысли, вопросы, ассоциации…"></textarea>' +
  '</div>';

  /* Зона 3: ПОДСТРАНИЦЫ параграфа: Кратко · Подробно · Презентация · Тест.
     Все четыре — равноправные вкладки; активная запоминается (K.tab). */
  var hasSlides = p.slides && p.slides.length;
  var hasTest = p.test && p.test.length;
  html += '<div class="tabs" role="tablist" aria-label="Разделы параграфа">' +
    '<button type="button" class="tab-btn' + (tab === 'short' ? ' active' : '') + '" data-tab="short" role="tab">Кратко</button>' +
    '<button type="button" class="tab-btn' + (tab === 'detailed' ? ' active' : '') + '" data-tab="detailed" role="tab">Подробно</button>' +
    (hasSlides ? '<button type="button" class="tab-btn' + (tab === 'pres' ? ' active' : '') + '" data-tab="pres" role="tab">Презентация <span class="tab-n">' + p.slides.length + '</span></button>' : '') +
    (hasTest ? '<button type="button" class="tab-btn' + (tab === 'quiz' ? ' active' : '') + '" data-tab="quiz" role="tab">Тест <span class="tab-n">' + p.test.length + '</span></button>' : '') +
  '</div>';

  /* — Подстраница «Кратко» — */
  html += '<div class="tab-panel" id="tab-short"' + (tab !== 'short' ? ' hidden' : '') + '>';
  if (c.intro) html += '<p class="intro-lead">' + esc(c.intro) + '</p>';

  if (c.theses && c.theses.length) {
    html += '<section class="block"><h2 class="block-title">Тезисы конспекта</h2><ol class="thesis-list">';
    c.theses.forEach(function (t, i) {
      var mc = 'short:' + i;   // ключ блока для «Мой конспект» (ф. 3)
      var bk = hasAnchor(p.id, 'block', mc);   // закладка-якорь (ф. 29)
      html += '<li class="thesis glint">' +
        '<span class="thesis-n">' + (i + 1) + '</span>' +
        '<div><b>' + esc(t.head) + '</b><p>' + esc(t.text) + '</p></div>' +
        '<div class="row-tools">' +
          '<label class="mycon-lb" title="В «Мой конспект»"><input type="checkbox" class="mycon-cb" data-block="' + esc(mc) + '" data-pid="' + esc(p.id) + '" data-head="' + esc(t.head) + '" data-text="' + esc(t.text) + '"' + (inMyConspect(p.id, mc) ? ' checked' : '') + '></label>' +
          '<button type="button" class="anchor-btn' + (bk ? ' on' : '') + '" data-type="block" data-index="' + esc(mc) + '" data-label="' + esc(t.head) + '" aria-label="Закладка на тезис" title="Закладка">' + (bk ? '★' : '☆') + '</button>' +
        '</div></li>';
    });
    html += '</ol></section>';
  }
  if (c.terms && c.terms.length) {
    html += '<section class="block"><h2 class="block-title">Ключевые термины</h2><dl class="term-grid">';
    c.terms.forEach(function (t) {
      html += '<div class="term"><dt>' + esc(t.term) + '</dt><dd>' + esc(t.def) + '</dd></div>';
    });
    html += '</dl></section>';
  }
  if (c.dates && c.dates.length) {
    html += '<section class="block"><h2 class="block-title">Даты для запоминания</h2>' +
      '<table class="dates-table"><thead><tr><th>Когда</th><th>Что произошло</th></tr></thead><tbody>';
    c.dates.forEach(function (d) { html += '<tr><td>' + esc(d.when) + '</td><td>' + esc(d.what) + '</td></tr>'; });
    html += '</tbody></table></section>';
  }
  html += '</div>';

  /* — Подстраница «Подробно» — */
  html += '<div class="tab-panel" id="tab-detailed"' + (tab !== 'detailed' ? ' hidden' : '') + '>';
  if (p.detailed && p.detailed.length) {
    html += renderDetailed(p.detailed, p.id);
  } else {
    html += '<div class="notice notice-warn">Подробный конспект для этого параграфа пока не заполнен.</div>';
  }
  /* 3D-модель темы (ф. 39, если задана в data.js) */
  html += renderModel3D(p);
  html += '</div>';

  /* — Подстраница «Презентация» (мини-сайт: story, 3D, авто) — */
  if (hasSlides) {
    html += '<div class="tab-panel" id="tab-pres"' + (tab !== 'pres' ? ' hidden' : '') + '>' +
    '<section class="pres glass" id="pres">' +
      '<div class="pres-top">' +
        '<span class="pres-title">Презентация урока</span>' +
        '<span class="pres-count" id="pres-count">1 / ' + p.slides.length + '</span>' +
        '<div class="pres-top-actions">' +
          '<button type="button" class="act" id="pres-auto" aria-pressed="false" title="Автопрокрутка (A)">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 5v14l11-7z"/></svg> Авто</button>' +
          '<button type="button" class="act" id="pres-fs" title="Полный экран (F)">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg> Полный экран</button>' +
        '</div>' +
      '</div>' +
      '<div class="pres-story" id="pres-story" role="progressbar" aria-label="Прогресс урока"></div>' +
      '<div class="pres-stage" id="pres-stage">' +
        '<div class="pres-slides" id="pres-slides"></div>' +   /* слайды здесь (hint не затирается) */
        '<div class="sw-hint" aria-hidden="true"><i class="l">‹</i> можно свайпать <i class="r">›</i></div>' +
      '</div>' +
      '<div class="pres-nav">' +
        '<button type="button" class="pres-arrow" id="pres-prev" aria-label="Предыдущий слайд"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg></button>' +
        '<div class="pres-dots" id="pres-dots"></div>' +
        '<button type="button" class="pres-arrow" id="pres-next" aria-label="Следующий слайд"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M9 5l7 7-7 7"/></svg></button>' +
      '</div>' +
      '<div class="pres-help muted small">← → — слайды · F — экран · A — авто · свайп на мобильных</div>' +
    '</section></div>';
  }

  /* — Подстраница «Тест» — */
  if (hasTest) {
    html += '<div class="tab-panel" id="tab-quiz"' + (tab !== 'quiz' ? ' hidden' : '') + '>' +
    '<section class="block" id="quiz-block" style="margin-top:0">' +
      '<h2 class="block-title">Проверь себя (' + p.test.length + ' вопросов)</h2>' +
      '<p class="muted small">Выберите один вариант в каждом вопросе и нажмите «Проверить ответы».</p>' +
      '<form class="quiz" id="quiz" data-pid="' + esc(p.id) + '">';
    p.test.forEach(function (q, qi) {
      html += '<fieldset class="quiz-q glint" data-q="' + qi + '"><legend class="quiz-q-title">' +
        (qi + 1) + '. ' + esc(q.q) + '</legend><div class="quiz-opts">';
      q.options.forEach(function (opt, oi) {
        var id = 'q' + qi + 'o' + oi;
        html += '<label class="quiz-opt" for="' + id + '">' +
          '<input type="radio" name="q' + qi + '" value="' + oi + '" id="' + id + '">' +
          '<span>' + esc(opt) + '</span></label>';
      });
      html += '</div><div class="why" hidden><b>Пояснение:</b> ' + esc(q.why || '') + '</div></fieldset>';
    });
    html += '<div class="quiz-actions">' +
        '<button type="submit" class="btn btn-primary">Проверить ответы</button>' +
        '<button type="button" class="btn btn-ghost" id="quiz-reset">Пройти заново</button>' +
      '</div><div class="quiz-result" id="quiz-result" hidden></div></form></section></div>';
  }

  /* Зона 6: «пройдено» + пейджер */
  html += doneBannerHTML(p);
  html += pagerHTML(prev, next);

  $('#app').innerHTML = html;
  document.title = p.num + '. ' + p.title;

  initTabs(p);        // 4 подстраницы; презентация инициализируется лениво
  initActions(p);
  initQuiz(p);
  initDoneBtn(p);
  applySearchHighlight();
  renderTOC();
}

/* Подробный конспект: блоки h/p/ul/mark/terms/memo.
   pid — для чекбоксов «Мой конспект» (ф. 3) и закладок (ф. 29). */
function renderDetailed(blocks, pid) {
  var out = '';
  blocks.forEach(function (b, bi) {
    var mc = 'detailed:' + bi;   // ключ для «Мой конспект» (ф. 3)
    /* инструменты строки для текстовых блоков: чекбокс + звезда-закладка */
    function tools(head) {
      var bk = pid ? hasAnchor(pid, 'block', mc) : false;   // ф. 29
      return '<div class="row-tools">' +
        '<label class="mycon-lb" title="В «Мой конспект»"><input type="checkbox" class="mycon-cb" data-block="' + esc(mc) + '" data-pid="' + esc(pid || '') + '" data-head="' + esc(head || '') + '" data-text="' + esc(b.text || '') + '"' + (pid && inMyConspect(pid, mc) ? ' checked' : '') + '></label>' +
        '<button type="button" class="anchor-btn' + (bk ? ' on' : '') + '" data-type="block" data-index="' + esc(mc) + '" data-label="' + esc(head || '') + '" aria-label="Закладка" title="Закладка">' + (bk ? '★' : '☆') + '</button></div>';
    }
    if (b.type === 'h') {
      out += '<h3 class="d-h">' + esc(b.text) + '</h3>';
    } else if (b.type === 'p') {
      out += '<div class="d-row"><p class="d-p">' + esc(b.text) + '</p>' + tools(b.text.slice(0, 40)) + '</div>';
    } else if (b.type === 'ul') {
      out += '<ul class="d-ul">' + b.items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul>';
    } else if (b.type === 'mark') {
      out += '<div class="d-row"><div class="d-mark">★ ' + esc(b.text) + '</div>' + tools('Выделено') + '</div>';
    } else if (b.type === 'terms') {
      out += '<dl class="d-terms">' + b.items.map(function (t) {
        return '<div class="term"><dt>' + esc(t.term) + '</dt><dd>' + esc(t.def) + '</dd></div>';
      }).join('') + '</dl>';
    } else if (b.type === 'memo') {
      out += '<div class="d-row"><div class="d-memo"><b>Запомнить</b><ul>' +
        b.items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul></div>' + tools('Запомнить') + '</div>';
    }
  });
  return out;
}

/* ---------- Вкладки-подстраницы (Кратко · Подробно · Презентация · Тест) ---------- */

var TABS = ['short', 'detailed', 'pres', 'quiz'];

function initTabs(p) {
  var presInited = false;

  function activate(t) {
    store.set(K.tab, t);
    $$('.tab-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === t); });
    TABS.forEach(function (id) {
      var el = document.getElementById('tab-' + id);
      if (el) el.hidden = id !== t;
    });
    /* ленивая инициализация движка презентации при первом показе вкладки */
    if (t === 'pres' && !presInited && p && p.slides && p.slides.length) {
      presInited = true;
      initPresentation(p);
    }
  }

  $$('.tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { activate(btn.dataset.tab); });
  });

  /* если сохранённая вкладка — презентация, инициализируем сразу */
  if (store.get(K.tab, 'short') === 'pres' && p && p.slides && p.slides.length) {
    presInited = true;
    initPresentation(p);
  }
}

/* ---------- Пейджер / пройдено / not-found ---------- */

function doneBannerHTML(p) {
  if (isDone(p.id)) {
    return '<div class="done-banner"><span>✅ <b>Параграф отмечен пройденным.</b></span>' +
      '<button type="button" class="btn btn-ghost" id="done-toggle">Отменить</button></div>';
  }
  return '<div class="done-banner" style="background:var(--glass-bg-soft);border-color:var(--border)">' +
    '<span>Изучили параграф? Отметьте — это отразится в прогрессе.</span>' +
    '<button type="button" class="btn btn-success" id="done-toggle">✓ Отметить пройденным</button></div>';
}

function pagerHTML(prev, next) {
  var h = '<nav class="pager">';
  h += prev ? '<a href="#/' + esc(prev.id) + '"><span class="dir">← Предыдущий</span><span class="pg-name">' +
       esc(prev.num) + '. ' + esc(prev.title) + '</span></a>' : '<span></span>';
  h += next ? '<a class="next" href="#/' + esc(next.id) + '"><span class="dir">Следующий →</span><span class="pg-name">' +
       esc(next.num) + '. ' + esc(next.title) + '</span></a>' : '<span></span>';
  return h + '</nav>';
}

function renderNotFound() {
  $('#app').innerHTML = '<div class="notice notice-warn">Раздел не найден. Вернитесь на <a href="#/">главную</a>.</div>';
  renderTOC();
}

/* ---------- 9. ТЕСТ ---------- */

function initQuiz(p) {
  var form = $('#quiz');
  if (!form) return;
  var resultBox = $('#quiz-result');
  var resetBtn = $('#quiz-reset');

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var questions = $$('.quiz-q', form);
    var unanswered = [];
    var answers = [];

    questions.forEach(function (qEl, qi) {
      qEl.classList.remove('unanswered');
      $$('.quiz-opt', qEl).forEach(function (o) { o.classList.remove('correct', 'wrong', 'dim'); });
      var why = $('.why', qEl); if (why) why.hidden = true;
      var checked = $('input:checked', qEl);
      if (!checked) unanswered.push(qi);
      answers.push(checked ? parseInt(checked.value, 10) : -1);
    });

    if (unanswered.length) {
      unanswered.forEach(function (qi) { $('.quiz-q[data-q="' + qi + '"]', form).classList.add('unanswered'); });
      resultBox.hidden = false;
      resultBox.innerHTML = '<span style="color:var(--err)"><b>Ответьте на все вопросы.</b></span>' +
        '<div class="small muted">Осталось: ' + unanswered.map(function (i) { return '№' + (i + 1); }).join(', ') + '</div>';
      $('.quiz-q[data-q="' + unanswered[0] + '"]', form).scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    var score = 0;
    questions.forEach(function (qEl, qi) {
      var q = p.test[qi];
      var user = answers[qi];
      $$('.quiz-opt', qEl).forEach(function (optEl, oi) {
        if (oi === q.correct) optEl.classList.add('correct');
        else if (oi === user) optEl.classList.add('wrong');
        else optEl.classList.add('dim');
        var input = $('input', optEl); if (input) input.disabled = true;
      });
      if (user === q.correct) score++;
      var why = $('.why', qEl); if (why) why.hidden = false;
    });

    var totalQ = p.test.length;
    var pct = Math.round((score / totalQ) * 100);
    var verdict = pct === 100 ? 'Идеально! Материал усвоен на отлично.' :
                  pct >= 80   ? 'Отличный результат!' :
                  pct >= 60   ? 'Неплохо, но есть что повторить.' :
                                'Стоит перечитать конспект и пройти тест снова.';
    resultBox.hidden = false;
    resultBox.innerHTML = '<b>' + verdict + '</b>' +
      '<div class="score-line">Ваш результат: <b>' + score + ' из ' + totalQ + '</b> (' + pct + '%)</div>' +
      '<div class="score-bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="small muted">Зелёные — правильные ответы, красные — ваши ошибки.</div>';
    resultBox.scrollIntoView({ behavior: 'smooth', block: 'center' });

    /* Журналирование попытки: история + ошибки + активность дня (Часть C) */
    logQuizAttempt(p, answers, score, totalQ);

    if (pct >= 60 && !isDone(p.id)) {
      markDone(p.id);
      var banner = $('.done-banner'); if (banner) banner.outerHTML = doneBannerHTML(p);
      initDoneBtn(p);
    }
    var sb = $('button[type="submit"]', form);
    if (sb) { sb.disabled = true; sb.textContent = 'Тест пройден'; }
  });

  if (resetBtn) resetBtn.addEventListener('click', function () { renderParagraph(p); });
}

/* ---------- 10. ПРЕЗЕНТАЦИЯ-«МИНИ-САЙТ» ----------
   Направленные 3D-переходы, каскадные пункты, story-прогресс с автозаливкой,
   авто-режим (A), фулскрин (F), deep-link (#/p1/s5), свайп, клавиатура. */

/* Декор слайда по роли: у каждой секции свой значок и акцент */
var SLIDE_KIND = {
  title:   { label: 'Тема урока',      icon: '◆', accent: '--brand-2' },
  repeat:  { label: 'Повторение',       icon: '↻', accent: '--brand' },
  content: { label: 'Материал',         icon: '▸', accent: '--brand' },
  example: { label: 'Разбор',           icon: '✦', accent: '--ok' },
  quiz:    { label: 'Закрепление',      icon: '?', accent: '--warn' },
  summary: { label: 'Итоги',            icon: '✓', accent: '--ok' },
  homework:{ label: 'Домашнее задание', icon: '✎', accent: '--warn' }
};

function slideHTML(s, i, total, p) {
  var k = SLIDE_KIND[s.kind] || SLIDE_KIND.content;
  var bk = hasAnchor(p.id, 'slide', String(i));   // ф. 29: закладка на слайд
  var h = '<div class="pres-slide" data-i="' + i + '" data-kind="' + esc(s.kind) + '" style="--sk-accent: var(' + k.accent + ')">' +
    '<div class="ps-topline"><span class="ps-kicker"><i>' + k.icon + '</i>' + k.label + '</span>' +
    '<span class="ps-meta">' + esc(p.num) + ' · ' + (i + 1) + '<span class="ps-total"> / ' + total + '</span>' +
    '<button type="button" class="anchor-btn anchor-slide' + (bk ? ' on' : '') + '" data-type="slide" data-index="' + i + '" data-pid="' + esc(p.id) + '" data-label="' + esc(s.title) + '" aria-label="Закладка на слайд" title="Закладка на слайд">' + (bk ? '★' : '☆') + '</button></span></div>';

  if (s.kind === 'title') {
    h += '<div class="ps-hero">' +
      '<h3 class="ps-title">' + esc(s.title) + '</h3>' +
      (s.subtitle ? '<p class="ps-subtitle">' + esc(s.subtitle) + '</p>' : '') +
      (s.goals ? '<div class="ps-goals"><div class="ps-goals-cap">Цели урока</div><ul>' +
        s.goals.map(function (g, n) {
          return '<li style="--d:' + (n * 0.12 + 0.15) + 's"><span>' + (n + 1) + '</span>' + esc(g) + '</li>';
        }).join('') + '</ul></div>' : '') +
    '</div>';
  } else {
    h += '<h3 class="ps-title">' + esc(s.title) + '</h3>';
    if (s.items) h += '<ul class="ps-items">' +
      s.items.map(function (x, n) {
        return '<li style="--d:' + (n * 0.09 + 0.1) + 's"><i>' + k.icon + '</i><span>' + esc(x) + '</span></li>';
      }).join('') + '</ul>';
    if (s.note) h += '<p class="ps-note">' + esc(s.note) + '</p>';
    if (s.kind === 'quiz')    h += '<p class="ps-cta">Обсудите ответы классом</p>';
    if (s.kind === 'homework') h += '<p class="ps-cta">Запишите в дневник</p>';
  }
  return h + '</div>';
}

function initPresentation(p) {
  var slides = p.slides;
  var stage = $('#pres-stage');
  var dots = $('#pres-dots');
  var story = $('#pres-story');
  var count = $('#pres-count');
  var pres = $('#pres');
  var cur = -1, dir = 1;
  var auto = false, autoT = null;
  var AUTO_MS = 7000;                    // 7 секунд на слайд в авто-режиме

  var slidesHost = $('#pres-slides') || stage;   // слайды в отдельном контейнере
  slidesHost.innerHTML = slides.map(function (s, i) { return slideHTML(s, i, slides.length, p); }).join('');
  story.innerHTML = slides.map(function (_, i) {
    return '<button type="button" class="story-seg" data-i="' + i + '" aria-label="Слайд ' + (i + 1) + '"><i></i></button>';
  }).join('');
  dots.innerHTML = slides.map(function (_, i) {
    return '<button type="button" class="pres-dot' + (i === 0 ? ' on' : '') + '" data-i="' + i + '" aria-label="Слайд ' + (i + 1) + '"></button>';
  }).join('');

  /* Deep-link: #/p1/s5 — открыть сразу слайд 5 */
  var m = (location.hash || '').match(/^#\/([\w-]+)\/s(\d+)$/);
  var startAt = (m && m[1] === p.id) ? Math.max(0, Math.min(slides.length - 1, parseInt(m[2], 10) - 1)) : 0;

  function paintDots() {
    $$('.pres-dot', dots).forEach(function (d, n) { d.classList.toggle('on', n === cur); });
  }
  function paintStory() {
    $$('.story-seg', story).forEach(function (seg, n) {
      seg.classList.toggle('seen', n < cur);
      seg.classList.toggle('now', n === cur);
    });
  }
  function syncHash() {
    var want = '#/' + p.id + '/s' + (cur + 1);
    if (location.hash !== want) {
      try { history.replaceState(null, '', want); } catch (e) { /* file:// */ }
    }
  }
  /* Заливка текущего story-сегмента — визуальный таймер авто-режима */
  function armStoryFill() {
    var bar = story.querySelector('.story-seg.now i');
    if (!bar) return;
    bar.style.animation = 'none';
    void bar.offsetWidth;                                   // reflow
    bar.style.animation = auto ? 'story-fill ' + AUTO_MS + 'ms linear forwards' : 'none';
  }

  function show(i, fromAuto) {
    var next = Math.max(0, Math.min(slides.length - 1, i));
    if (next === cur) return;
    dir = next > cur ? 1 : -1;
    cur = next;
    stage.style.setProperty('--dir', dir);

    $$('.pres-slide', slidesHost).forEach(function (el, n) {
      if (n === cur) {
        el.classList.remove('exit-l', 'exit-r');
        el.classList.add('active');
        $$('.ps-items li, .ps-goals li', el).forEach(function (li) {
          li.classList.remove('in');
          void li.offsetWidth;                               // перезапуск каскада
          li.classList.add('in');
        });
      } else if (el.classList.contains('active')) {
        el.classList.remove('active');
        el.classList.add(dir === 1 ? 'exit-r' : 'exit-l');
      } else {
        el.classList.remove('exit-l', 'exit-r');
      }
    });
    paintDots(); paintStory();
    count.textContent = (cur + 1) + ' / ' + slides.length;
    $('#pres-prev').disabled = cur === 0;
    $('#pres-next').disabled = cur === slides.length - 1;
    syncHash();
    armStoryFill();
    if (!fromAuto) restartAuto();
  }

  /* Авто-режим: учитель ведёт урок, слайды листаются сами */
  function setAuto(on) {
    auto = on;
    var b = $('#pres-auto');
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.classList.toggle('on', on);
    pres.classList.toggle('auto', on);
    restartAuto();
    armStoryFill();
  }
  function restartAuto() {
    clearTimeout(autoT);
    if (!auto || cur >= slides.length - 1) return;
    autoT = setTimeout(function () { show(cur + 1, true); }, AUTO_MS);
  }
  $('#pres-auto').addEventListener('click', function () { setAuto(!auto); });

  /* Навигация */
  $('#pres-prev').addEventListener('click', function () { show(cur - 1); });
  $('#pres-next').addEventListener('click', function () { show(cur + 1); });
  dots.addEventListener('click', function (e) {
    var d = e.target.closest('.pres-dot'); if (d) show(parseInt(d.dataset.i, 10));
  });
  story.addEventListener('click', function (e) {
    var s = e.target.closest('.story-seg'); if (s) show(parseInt(s.dataset.i, 10));
  });

  /* Клавиатура: ←/→, PgUp/PgDn, пробел, Home/End, F, A */
  document.addEventListener('keydown', function (e) {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (!document.getElementById('pres')) return;
    var mb = document.getElementById('modal-backdrop');
    if (mb && !mb.hidden) return;
    switch (e.key) {
      case 'ArrowRight': case 'PageDown': show(cur + 1); break;
      case 'ArrowLeft':  case 'PageUp':   show(cur - 1); break;
      case ' ': e.preventDefault(); show(cur + 1); break;
      case 'Home': show(0); break;
      case 'End':  show(slides.length - 1); break;
      case 'f': case 'F': $('#pres-fs').click(); break;
      case 'a': case 'A': setAuto(!auto); break;
    }
  });

  /* ---- СВАЙП v2: Pointer Events (touch/mouse/pen), drag за пальцем ----
     Горизонтальный drag двигает активный слайд (--dx), отпустил:
     |dx| > max(22% ширины, 44px-флик) → перелист; иначе — пружина назад.
     Вертикальный скролл не блокируем (touch-action: pan-y в CSS);
     в момент явного вертикального движения — свайп отменяется. */
  function stageW() {
    try { return (stage.getBoundingClientRect().width) || 320; }
    catch (e) { return 320; }   // экзотика без DOM-геометрии
  }
  var W = stageW();
  var dragging = false, startX = 0, startY = 0, locked = null;   // null|'x'|'y'
  var THRESH = 0.22, MIN_PX = 44;
  var hintSeen = false;   // подсказка «‹ можно свайпать ›» до первого свайпа

  function setDrag(dx) {
    stage.classList.add('sw-drag');
    stage.style.setProperty('--dx', dx.toFixed(1) + 'px');
  }
  function endDrag() {
    stage.classList.remove('sw-drag');
    stage.style.removeProperty('--dx');
  }

  stage.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragging = true; locked = null;
    startX = e.clientX; startY = e.clientY;
    W = stageW();
  }, { passive: true });

  stage.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var dx = e.clientX - startX;
    var dy = e.clientY - startY;
    /* определяем ось жеста один раз (защита от конфликта с верт. скроллом) */
    if (!locked) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) locked = 'x';
      else if (Math.abs(dy) > 12) { locked = 'y'; dragging = false; return; }
    }
    if (locked !== 'x') return;
    e.preventDefault();                     // на десктопе с мышью не выделяем
    /* у краёв — резинка (сопротивление) */
    var atEdge = (dx > 0 && cur === 0) || (dx < 0 && cur === slides.length - 1);
    if (atEdge) dx = dx * 0.3;
    setDrag(dx);
  }, { passive: false });

  function finishDrag(e) {
    if (!dragging) return;
    dragging = false;
    if (locked !== 'x') { endDrag(); return; }
    var dx = (e.clientX - startX);
    var vx = dx / Math.max(1, (e.timeStamp - (finishDrag.t0 || e.timeStamp)));  // px/ms
    finishDrag.t0 = null;
    var passed = Math.abs(dx) > Math.max(W * THRESH, MIN_PX) || Math.abs(dx) > 20;
    endDrag();
    if (!hintSeen) { hintSeen = true; stage.classList.add('sw-used'); }   // спрятать подсказку
    if (passed) show(dx < 0 ? cur + 1 : cur - 1);
    /* иначе — пружинный возврат CSS сам (transition на .active) */
  }
  stage.addEventListener('pointerup', finishDrag, { passive: true });
  stage.addEventListener('pointercancel', function () { dragging = false; endDrag(); }, { passive: true });

  /* Полный экран */
  $('#pres-fs').addEventListener('click', function () {
    if (!document.fullscreenElement) {
      pres.classList.add('fs');
      if (pres.requestFullscreen) pres.requestFullscreen().catch(function () {});
    } else {
      if (document.exitFullscreen) document.exitFullscreen().catch(function () {});
      pres.classList.remove('fs');
    }
  });
  document.addEventListener('fullscreenchange', function () {
    var el = document.getElementById('pres');
    if (el && !document.fullscreenElement) el.classList.remove('fs');
  });

  show(startAt);
}

/* Универсальный свайп для простых списков (флеш-карточки):
   без drag — чистый порог 30% ширины, обе оси разведены. */
function initSwipeSimple(el, onLeft, onRight) {
  var sx = 0, sy = 0, moved = null;
  el.addEventListener('pointerdown', function (e) {
    sx = e.clientX; sy = e.clientY; moved = null;
  }, { passive: true });
  el.addEventListener('pointermove', function (e) {
    if (moved === 'done') return;
    var dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      moved = 'x';
    } else if (Math.abs(dy) > 16) moved = 'y';
  }, { passive: true });
  el.addEventListener('pointerup', function (e) {
    if (moved !== 'x') return;
    var w = el.getBoundingClientRect().width || 300;
    var dx = e.clientX - sx;
    if (Math.abs(dx) > w * 0.3) { dx < 0 ? onLeft() : onRight(); moved = 'done'; }
  }, { passive: true });
}

/* ---------- 11. ДЕЙСТВИЯ ПАРАГРАФА ---------- */

function isBookmarked(id) {
  var b = store.get(K.bookmarks, []);
  return b.indexOf(id) !== -1;
}

function toggleBookmark(id) {
  var b = store.get(K.bookmarks, []);
  var i = b.indexOf(id);
  if (i === -1) b.push(id); else b.splice(i, 1);
  store.set(K.bookmarks, b);
  return i === -1;
}

/* Кнопка «Отметить пройденным» / «Отменить» */
function initDoneBtn(p) {
  var btn = $('#done-toggle');
  if (!btn) return;
  btn.addEventListener('click', function () {
    if (isDone(p.id)) markUndone(p.id); else markDone(p.id);
    var banner = btn.closest('.done-banner');
    if (banner) banner.outerHTML = doneBannerHTML(p);
    initDoneBtn(p);  // переподключаем обработчик
    toast(isDone(p.id) ? 'Параграф отмечен пройденным' : 'Отметка снята');
  });
}

function initActions(p) {
  /* Закладка */
  var bBtn = $('#act-bookmark');
  bBtn.addEventListener('click', function () {
    var added = toggleBookmark(p.id);
    bBtn.classList.toggle('on', added);
    bBtn.lastChild.textContent = added ? ' В закладках' : ' В закладки';
    toast(added ? 'Добавлено в закладки' : 'Удалено из закладок');
  });

  /* Заметки: показать/скрыть + автосохранение */
  var notesPanel = $('#notes-panel');
  var area = $('#notes-area');
  area.value = store.get(K.notes + p.id, '');
  var saveT = null;
  area.addEventListener('input', function () {
    clearTimeout(saveT);
    saveT = setTimeout(function () { store.set(K.notes + p.id, area.value); }, 400);
  });
  $('#act-notes').addEventListener('click', function () {
    notesPanel.hidden = !notesPanel.hidden;
    if (!notesPanel.hidden) area.focus();
  });

  /* Печать / PDF (стили @media print в style.css) */
  $('#act-print').addEventListener('click', function () { window.print(); });

  /* Режим чтения (ф. 28): Esc — выход; состояние запоминается */
  var rBtn = $('#act-reading');
  rBtn.addEventListener('click', function () {
    toggleReading(!document.body.classList.contains('reading'));
    /* обновляем подпись кнопки без перерисовки страницы */
    rBtn.classList.toggle('on', document.body.classList.contains('reading'));
    rBtn.lastChild.textContent = document.body.classList.contains('reading') ? ' Обычный' : ' Чтение';
  });
  if (store.get(K.reading, false)) {
    document.body.classList.add('reading');
    rBtn.classList.add('on');
    rBtn.lastChild.textContent = ' Обычный';
  }

  /* «Мой конспект» (ф. 3): чекбоксы — делегированные */
  document.addEventListener('change', function (e) {
    var cb = e.target.closest && e.target.closest('.mycon-cb');
    if (!cb || !cb.dataset.block) return;
    if (cb.dataset.pid !== p.id) return;   // страница уже сменилась
    toggleConspectItem(p.id, cb.dataset.block, cb.dataset.text || '', cb.dataset.head || '');
    cb.checked = inMyConspect(p.id, cb.dataset.block);
  });

  /* Закладки-якоря (ф. 29): звёзды у тезисов/абзацев/слайдов */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.anchor-btn');
    if (!b || !b.dataset.index) return;
    /* слайд-звёзды живут в презентации: у них свой pid в data-pid */
    var pid = b.dataset.pid || p.id;
    if (pid !== p.id) return;
    var added = toggleAnchor(pid, b.dataset.type, b.dataset.index, b.dataset.label || '');
    b.classList.toggle('on', added);
    b.textContent = added ? '★' : '☆';
  });

  /* 3D-модель темы (ф. 39): ленивая инициализация, если задана */
  if (p.model3d) initModel3D(p);

  /* Озвучивание конспекта (Web Speech API) */
  var ttsBtn = $('#act-tts');
  var speaking = false;
  ttsBtn.addEventListener('click', function () {
    if (!('speechSynthesis' in window)) { toast('Озвучивание не поддерживается браузером'); return; }
    if (speaking) { speechSynthesis.cancel(); speaking = false; ttsBtn.classList.remove('on'); return; }
    var c = p.conspect;
    var text = [c.intro].concat((c.theses || []).map(function (t) { return t.head + '. ' + t.text; })).join('. ');
    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'ru-RU';
    u.onend = function () { speaking = false; ttsBtn.classList.remove('on'); };
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    speaking = true; ttsBtn.classList.add('on');
  });
}

/* ---------- 12. ШАПКА: курс-бар, «Продолжить», поиск ---------- */

function updateHeaderProgress() {
  var total = PARAGRAPHS.length;
  var done = PARAGRAPHS.filter(function (p) { return isDone(p.id); }).length;
  var pct = total ? Math.round((done / total) * 100) : 0;
  var ring = $('#progress-ring');
  if (ring) { ring.style.setProperty('--p', pct); ring.innerHTML = '<span>' + pct + '%</span>'; }
  var label = $('#progress-label');
  if (label) label.textContent = done + ' / ' + total;
  var fill = $('#course-bar-fill');
  if (fill) fill.style.width = pct + '%';
}

function initHeader() {
  $('#progress-btn').addEventListener('click', function () {
    var t = continueTarget();
    if (t) location.hash = '#/' + t.id;
  });
  /* Селект учебников живёт в TOC (динамический) — здесь только подпись
     бренда; сам список наполняется в renderTOC → renderBookSwitch(). */
}

/* ---------- ПЕРЕКЛЮЧАТЕЛЬ УЧЕБНИКОВ ----------
   Выпадающий список в оглавлении сайдбара (#toc-book-select, рендерится
   из renderTOC). Выбор → setBook() → location.reload() — страница
   полностью перезагружается с новой активной книгой. */
function renderBookSwitch() {
  var host = $('#toc-book-select');
  if (!host) return;
  if (BOOKS.length < 2) { host.hidden = true; return; }
  host.hidden = false;
  var cur = activeBook();
  var html = '';
  BOOKS.forEach(function (b) {
    var sel = (b.id === cur.id) ? ' selected' : '';
    html += '<option value="' + esc(b.id) + '"' + sel + '>' + esc((b.meta && b.meta.grade) || b.id) + '</option>';
  });
  host.innerHTML = html;
}
function initBookSwitch() {
  /* Селект создаётся ДИНАМИЧЕСКИ в renderTOC (innerHTML перезаписывается
     при каждом рендере) → обычный addEventListener терялся бы. Поэтому
     ДЕЛЕГИРОВАНИЕ: слушаем 'change' на статичном родителе #toc-list
     и ловим событие от #toc-book-select, где бы ни находился select. */
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t && t.id === 'toc-book-select' && t.value) {
      setBook(t.value);   // сохранит выбор и перезагрузит страницу
    }
  });
  /* при старте: подпись класса в бренде шапки = активная книга */
  var sub = document.getElementById('brand-sub');
  if (sub) sub.textContent = (bookMeta().grade || '') + ' · конспекты и уроки';
  renderBookSwitch();
}

/* ---------- Шапка: 3 режима + уезд/возврат (аккумулятор против лага) ----
   Режимы (кнопка-булавка, цикл): 'auto' → 'pinned' → 'hidden' → 'auto'.
     auto   — как сейчас: скролл вниз прячет, вверх — возвращает (везде).
     pinned — закреплена: никогда не уезжает.
     hidden — скрыта ПОЛНОСТЬЮ; внизу справа — пилюля «Показать шапку».
   Направление — аккумулятор (медленный скролл вверх суммируется кадрами),
   rAF + passive, без layout thrashing. */
var HD_MODES = ['auto', 'pinned', 'hidden'];
var HD_TITLES = {
  auto:   'Шапка: авто-скрытие (клик — закрепить)',
  pinned: 'Шапка закреплена (клик — скрыть полностью)',
  hidden: 'Шапка скрыта (клик — авто-скрытие)'
};
function initHeaderHide() {
  var hd = $('.site-header');
  if (!hd) return;

  var HIDE_AT = 10;       // px накопленного вниз-скролла → спрятать
  var SHOW_AT = 6;        // px накопленного вверх-скролла → вернуть
  var COMPACT_AT = 110;   // px — порог сжатия по высоте
  var lastY = window.scrollY || 0;
  var acc = 0;
  var ticking = false;
  var retT = null;
  var mode = 'auto';
  try { mode = store.get('obsh11:hd-mode', 'auto'); } catch (e) {}
  if (HD_MODES.indexOf(mode) === -1) mode = 'auto';

  var pinBtn = $('#pin-header');
  var restoreBtn = null;   // пилюля «показать шапку» (создаётся в hidden)

  /* — применяем режим к DOM (кнопка + классы шапки + пилюля) — */
  function applyMode(m, animate) {
    mode = m;
    store.set('obsh11:hd-mode', m);
    if (pinBtn) {
      pinBtn.dataset.mode = m;
      pinBtn.setAttribute('title', HD_TITLES[m]);
      pinBtn.setAttribute('aria-label', HD_TITLES[m]);
      pinBtn.setAttribute('aria-pressed', m === 'pinned' ? 'true' : 'false');
      /* иконка: pin (auto/pinned) или eye (hidden) */
      var pin = pinBtn.querySelector('.pin-svg');
      var eye = pinBtn.querySelector('.eye-svg');
      if (pin) pin.hidden = m !== 'auto' && m !== 'pinned';
      if (eye) eye.hidden = m !== 'hidden';
    }
    hd.classList.toggle('hd-pinned', m === 'pinned');
    hd.classList.toggle('hd-force-hidden', m === 'hidden');
    if (m !== 'hidden') {
      /* показать шапку; анимация возврата — только при смене с hidden */
      hd.classList.remove('hd-hide');
      if (animate) {
        hd.classList.add('hd-return');
        clearTimeout(retT);
        retT = setTimeout(function () { hd.classList.remove('hd-return'); }, 520);
      }
      acc = 0;
    }
    /* пилюля возврата: живёт только в hidden */
    if (m === 'hidden' && !restoreBtn) {
      restoreBtn = document.createElement('button');
      restoreBtn.type = 'button';
      restoreBtn.className = 'hd-restore';
      restoreBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 3.83A7.93 7.93 0 0 0 12 16a7.93 7.93 0 0 0 4.11-1.41A2 2 0 0 1 15 10.76V7h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"/></svg> Показать шапку';
      restoreBtn.setAttribute('aria-label', 'Показать шапку');
      restoreBtn.addEventListener('click', function () {
        /* возврат к авто — шапка красиво возвращается */
        applyMode('auto', true);
        toast('Шапка снова с вами');
      });
      document.body.appendChild(restoreBtn);
    } else if (m !== 'hidden' && restoreBtn) {
      restoreBtn.remove();
      restoreBtn = null;
    }
  }

  /* кнопка-булавка: цикл режимов */
  if (pinBtn) {
    pinBtn.addEventListener('click', function () {
      var next = HD_MODES[(HD_MODES.indexOf(mode) + 1) % HD_MODES.length];
      applyMode(next, mode === 'hidden');   // анимация только при возврате из hidden
      toast(mode === 'pinned' ? 'Шапка закреплена — не уезжает'
           : mode === 'hidden' ? 'Шапка скрыта (пилюля внизу — вернуть)'
           : 'Шапка: авто-скрытие');
    });
  }
  applyMode(mode, false);   // восстановление после перезагрузки (без анимации)

  function onScroll(ev) {
    /* источник скролла: окно ИЛИ внутренний контейнер (слайды, сайдбар,
       модалка…) — берём top того, что реально скроллится.
       ИСКЛЮЧЕНИЕ: выпадающие результаты поиска — скролл внутри них
       НЕ должен прятать/показывать шапку (иначе список «закрывается»). */
    var t = ev && ev.target;
    if (t && t.classList && (t.classList.contains('search-results') ||
        (t.closest && t.closest && t.closest('.search-results')))) {
      ticking = false;
      return;
    }
    var src = (t && t !== document && t.scrollTop !== undefined) ? t : null;
    var y, dy;
    if (src) {
      /* внутренний скролл: работаем по его позиции, окно не трогаем */
      y = src.scrollTop;
      dy = y - (src._hdLastY || 0);
      src._hdLastY = y;
    } else {
      y = window.scrollY || 0;
      dy = y - lastY;
      lastY = y;
    }

    if (mode !== 'auto') { ticking = false; return; }   // pinned/hidden — логика выключена

    /* поиск активен (фокус в поле или мобильный expand-режим) — шапку
       не трогаем: пользователь работает с результатами */
    var sIn = document.getElementById('search-input');
    var inner = document.querySelector('.header-inner');
    var searchActive = (sIn && document.activeElement === sIn) ||
                       (inner && inner.classList.contains('search-mode'));
    if (searchActive && hd.classList.contains('hd-hide') === false) {
      /* шапка видима при активном поиске — просто не прячем её */
      acc = 0;
      ticking = false;
      return;
    }

    /* аккумулятор: медленный, но устойчивый скролл копится */
    acc += dy;
    if (Math.sign(acc) !== Math.sign(dy)) acc = acc * 0.6 + dy;

    /* сжатие по высоте — только от позиции ОКНА (внутренний скролл не влияет) */
    if (!src) {
      var wantCompact = y > COMPACT_AT;
      if (wantCompact !== hd.classList.contains('hd-compact')) {
        hd.classList.toggle('hd-compact', wantCompact);
      }
    }

    /* правило «у верха» — только для окна; внутренний скролл живёт по аккумулятору */
    if (!src && y <= 4) {
      if (hd.classList.contains('hd-hide') || hd.classList.contains('hd-return')) {
        hd.classList.remove('hd-hide', 'hd-return');
        acc = 0;
      }
      ticking = false;
      return;
    }

    if (acc > HIDE_AT && !hd.classList.contains('hd-hide')) {
      /* вниз → спрятать */
      hd.classList.add('hd-hide');
      hd.classList.remove('hd-return');
      acc = 0;
    } else if (acc < -SHOW_AT && hd.classList.contains('hd-hide')) {
      /* вверх → вернуть: пружинный transition */
      hd.classList.remove('hd-hide');
      hd.classList.add('hd-return');
      clearTimeout(retT);
      retT = setTimeout(function () { hd.classList.remove('hd-return'); }, 520);
      acc = 0;
    }

    ticking = false;
  }

  /* 1) скролл окна */
  window.addEventListener('scroll', function (e) {
    if (!ticking) { ticking = true; requestAnimationFrame(function () { onScroll(null); }); }
  }, { passive: true });
  /* 2) внутренние скроллы ЛЮБОГО элемента (capture: ловит все контейнеры,
        включая созданные позже — слайды, сайдбар, модалки). Так шапка
        реагирует на скролл вверх в КАЖДОЙ части сайта. */
  document.addEventListener('scroll', function (e) {
    var t = e.target;
    if (!t || t === document || t === document.body || t === window) return;
    if (typeof t.scrollTop !== 'number') return;
    if (!ticking) { ticking = true; requestAnimationFrame(function () { onScroll({ target: t }); }); }
  }, { passive: true, capture: true });
}

/* Поиск с подсветкой */
function plainText(p) {
  var c = p.conspect;
  var parts = [c.intro || '', p.title];
  (c.theses || []).forEach(function (t) { parts.push(t.head, t.text); });
  (c.terms || []).forEach(function (t) { parts.push(t.term, t.def); });
  (p.detailed || []).forEach(function (b) {
    if (b.text) parts.push(b.text);
    if (b.items) parts.push(b.items.join(' '));
  });
  return parts.join(' ').toLowerCase();
}

/* Поиск по конспектам с подсветкой совпадений (исходная версия) */
function initSearch() {
  var input = $('#search-input');
  var box = $('#search-results');

  input.addEventListener('input', function () {
    var q = input.value.trim().toLowerCase();
    if (q.length < 2) { box.hidden = true; box.innerHTML = ''; return; }
    var hits = PARAGRAPHS.filter(function (p) { return plainText(p).indexOf(q) !== -1; }).slice(0, 8);
    if (!hits.length) {
      box.hidden = false;
      box.innerHTML = '<div class="sr-item empty-state" style="padding:22px 10px">' +
        '<div class="e-icon">⌕</div><b>Ничего не найдено</b>' +
        '<span class="small">Попробуйте другое слово или откройте <a href="#/catalog">все параграфы</a></span></div>';
      return;
    }
    box.innerHTML = hits.map(function (p) {
      var c = p.conspect;
      var snippet = (c.intro || (c.theses[0] && c.theses[0].text) || '').slice(0, 120);
      var re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      var hl = function (s) { return esc(s).replace(re, function (m) { return '<mark class="hit">' + m + '</mark>'; }); };
      return '<button type="button" class="sr-item" data-id="' + esc(p.id) + '">' +
        '<b>' + esc(p.num) + '. ' + hl(p.title) + '</b><br><span class="small">' + hl(snippet) + '…</span></button>';
    }).join('');
    box.hidden = false;
  });

  box.addEventListener('click', function (e) {
    var it = e.target.closest('.sr-item');
    if (!it || !it.dataset.id) return;
    store.set(K.search, input.value.trim());
    box.hidden = true; input.value = '';
    location.hash = '#/' + it.dataset.id;
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.search-wrap')) box.hidden = true;
  });
}

/* Подсветка совпадений на открытой странице (после перехода из поиска) */
function applySearchHighlight() {
  var q = store.get(K.search, '');
  if (!q || q.length < 2) return;
  var re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  var walker = document.createTreeWalker($('#app'), NodeFilter.SHOW_TEXT, null, false);
  var nodes = [];
  while (walker.nextNode()) {
    var n = walker.currentNode;
    if (n.nodeValue.trim() && n.parentElement && !n.parentElement.closest('script,style')) nodes.push(n);
  }
  nodes.forEach(function (n) {
    re.lastIndex = 0;
    if (!re.test(n.nodeValue)) return;
    re.lastIndex = 0;
    var span = document.createElement('span');
    span.innerHTML = esc(n.nodeValue).replace(re, function (m) { return '<mark class="hit">' + m + '</mark>'; });
    n.parentNode.replaceChild(span, n);
  });
  store.set(K.search, '');  /* подсветили — сбрасываем */
}

/* ---------- 13. МОДАЛКИ ---------- */

function openModal(title, html) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = html;
  $('#modal-backdrop').hidden = false;
  $('#modal-close').focus();
}
function closeModal() { $('#modal-backdrop').hidden = true; }

function initModals() {
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal-backdrop').addEventListener('click', function (e) {
    if (e.target === this) closeModal();
  });

  /* Инструменты: все фичи Части C + настройки темы и «породы дерева» */
  $('#tools-btn').addEventListener('click', function () {
    var accents = [['oak', 'Дуб'], ['walnut', 'Орех'], ['birch', 'Берёза'], ['teak', 'Тик']];
    var cur = store.get(K.accent, 'oak');
    var curTheme = document.documentElement.dataset.themeMode || 'auto';
    var themeNames = { auto: 'Авто (по времени)', light: 'Светлая', dark: 'Тёмная' };
    var due = dueRepeats().length;
    var mis = mistakeItems().length;

    /* SVG-иконки (минимальные, stroke) */
    var ic = {
      cards: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="13" height="16" rx="2"/><path d="M8 3h13v16"/></svg>',
      exam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></svg>',
      bug: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M5 19l3-3M16 8l3-3"/></svg>',
      stats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></svg>',
      map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M7 6h10M6 8l4 8M14 16l4-8"/></svg>',
      game: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="10" rx="5"/><path d="M7 12h4M9 10v4M15 11h.01M17 13h.01"/></svg>',
      clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
      cheat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="3" width="12" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>',
      save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 21h16"/></svg>'
    };

    openModal('Инструменты и настройки',
      /* Разделы-фичи (сетка кнопок) */
      '<div class="tools-grid">' +
      '<a class="tool-btn" href="#/flashcards">' + ic.cards + '<b>Флеш-карточки</b><small>термины + из тестов</small></a>' +
      '<a class="tool-btn" href="#/exam">' + ic.exam + '<b>Экзамен</b><small>15 вопросов, 10 мин</small></a>' +
      '<a class="tool-btn" href="#/mistakes">' + ic.bug + '<b>Частые ошибки</b><small>' + (mis ? mis + ' вопросов' : 'пока нет') + '</small></a>' +
      '<a class="tool-btn" href="#/stats">' + ic.stats + '<b>Статистика</b><small>серия: ' + streakDays() + ' дн.</small></a>' +
      '<a class="tool-btn" href="#/glossary">' + ic.cards + '<b>Глоссарий</b><small>все термины</small></a>' +
      '<a class="tool-btn" href="#/map">' + ic.map + '<b>Карта курса</b><small>связи параграфов</small></a>' +
      '<a class="tool-btn" href="#/game">' + ic.game + '<b>Мини-игры</b><small>пары и сортировка</small></a>' +
      '<a class="tool-btn" href="#/timeline">' + ic.clock + '<b>Хронология</b><small>лента дат</small></a>' +
      '<a class="tool-btn" href="#/myconspect">' + ic.cheat + '<b>Мой конспект</b><small>' + getMyConspect().length + ' заметок</small></a>' +
      '<a class="tool-btn" href="#/anchors">' + ic.map + '<b>Мои закладки</b><small>места и параграфы</small></a>' +
      '<button type="button" class="tool-btn" id="tool-cheats">' + ic.cheat + '<b>Печать шпаргалок</b><small>карточки A4</small></button>' +
      '<button type="button" class="tool-btn" id="tool-pomo">' + ic.clock + '<b>Pomodoro</b><small>таймер фокуса</small></button>' +
      '<button type="button" class="tool-btn" id="tool-export">' + ic.save + '<b>Экспорт/импорт</b><small>код прогресса</small></button>' +
      '</div>' +

      /* Повторения сегодня */
      (due ? '<div class="set-row" style="margin-top:14px"><span>Повторить сегодня</span><a class="btn btn-ghost" href="#/stats">« + due + » →</a></div>' : '') +

      /* Настройки */
      '<h2 class="block-title" style="margin-top:18px">Настройки</h2>' +
      '<div class="set-row"><span>Тема</span>' +
      '<select id="set-theme">' + ['auto', 'light', 'dark'].map(function (m) {
        return '<option value="' + m + '"' + (m === curTheme ? ' selected' : '') + '>' + themeNames[m] + '</option>';
      }).join('') + '</select></div>' +
      '<div class="set-row"><span>Порода дерева (акцент)</span><div class="swatches">' +
      accents.map(function (a) {
        return '<button type="button" class="swatch' + (a[0] === cur ? ' on' : '') + '" data-accent="' + a[0] + '" title="' + a[1] + '" aria-label="' + a[1] + '"></button>';
      }).join('') + '</div></div>' +
      '<div class="set-row"><span>Живой фон (частицы)</span>' +
      '<button type="button" class="btn btn-ghost" id="tool-livebg">' + (store.get(K.livebg, true) ? 'Включён — выключить' : 'Выключен — включить') + '</button></div>' +
      '<div class="set-row"><span>Горячие клавиши</span>' +
      '<button type="button" class="btn btn-ghost" id="tool-hotkeys">Настроить</button></div>');

    /* живой фон: вкл/выкл (ф. 40) */
    $('#tool-livebg').addEventListener('click', function () {
      store.set(K.livebg, !store.get(K.livebg, true));
      toast(store.get(K.livebg, true) ? 'Живой фон включён (обновите страницу)' : 'Живой фон выключен');
      closeModal();
    });
    /* свои хоткеи (ф. 31) */
    $('#tool-hotkeys').addEventListener('click', function () { showHotkeyEditor(); });

    $('#set-theme').addEventListener('change', function () { applyTheme(this.value); });
    $('#modal-body').querySelector('.swatches').addEventListener('click', function (e) {
      var sw = e.target.closest('.swatch');
      if (!sw) return;
      applyAccent(sw.dataset.accent);
      $$('.swatch').forEach(function (s) { s.classList.toggle('on', s === sw); });
      toast('Акцент: ' + sw.title);
    });
    /* ссылки-кнопки закрывают модалку при переходе */
    $('#modal-body').addEventListener('click', function (e) {
      var t = e.target.closest('.tool-btn[href]');
      if (t) closeModal();
    });
    $('#tool-cheats').addEventListener('click', function () { printCheats(); });
    $('#tool-pomo').addEventListener('click', function () {
      closeModal();
      var w = $('#pomodoro'); w.hidden = false;
      toast('Pomodoro: 25 минут фокуса — кнопка ▶');
    });
    $('#tool-export').addEventListener('click', function () {
      var code = exportState();
      openModal('Экспорт / импорт прогресса',
        '<p class="muted small">Скопируйте код для переноса на другое устройство. Вставьте чужой код и нажмите «Импорт».</p>' +
        '<textarea class="code-area" id="exp-code" readonly>' + code + '</textarea>' +
        '<div class="quiz-actions"><button type="button" class="btn btn-ghost" id="exp-copy">Копировать</button>' +
        '<button type="button" class="btn btn-primary" id="imp-btn">Импортировать из поля</button></div>');
      $('#exp-code').addEventListener('click', function () { this.select(); });
      $('#exp-copy').addEventListener('click', function () {
        $('#exp-code').select();
        try { document.execCommand('copy'); toast('Скопировано'); } catch (e) { toast('Выделите и скопируйте вручную'); }
      });
      $('#imp-btn').addEventListener('click', function () {
        importState($('#exp-code').value);
      });
    });
  });

  /* Закладки */
  $('#bookmarks-btn').addEventListener('click', function () {
    var b = store.get(K.bookmarks, []);
    var items = b.map(getParagraph).filter(Boolean);
    openModal('Закладки', items.length
      ? items.map(function (p) {
          return '<div class="list-row"><a href="#/' + esc(p.id) + '" class="bm-link" data-id="' + esc(p.id) + '">' +
            esc(p.num) + '. ' + esc(p.title) + '</a><small>' + esc(p.sectionTitle.replace('Раздел ', '')) + '</small></div>';
        }).join('')
      : '<div class="empty-state"><div class="e-icon">🔖</div>' +
        '<b>Закладок пока нет</b>' +
        '<span class="small">Нажмите «В закладки» на странице параграфа — он появится здесь.</span>' +
        '<a class="btn btn-ghost" href="#/catalog" onclick="closeModal()">Выбрать параграф</a></div>');
  });
  $('#modal-body').addEventListener('click', function (e) {
    var a = e.target.closest('.bm-link');
    if (a) { closeModal(); location.hash = '#/' + a.dataset.id; }
  });

  /* Хоткеи */
  $('#hotkeys-open').addEventListener('click', function () { showHotkeys(); });
}

function showHotkeys() {
  var hk = getHotkeys();   // ф. 31: показываем актуальные (кастомные) клавиши
  openModal('Горячие клавиши',
    '<table class="hk-table">' +
    [[esc(hk.search), 'Фокус на поиск'],
     ['← / →', 'Слайды (на вкладке «Презентация») / соседние параграфы'],
     [esc(hk.prev) + ' / ' + esc(hk.next), 'Предыдущий / следующий параграф'],
     [esc(hk.short) + ' / ' + esc(hk.detailed) + ' / ' + esc(hk.pres) + ' / ' + esc(hk.quiz), 'Кратко / Подробно / Презентация / Тест'],
     [esc(hk.reading), 'Режим чтения'],
     ['A · F · Space', 'Презентация: авто · полный экран · вперёд'],
     ['B', 'Добавить параграф в закладки'],
     ['T', 'Переключить тему'],
     ['Esc', 'Закрыть окно / меню / чтение'],
     [esc(hk.hotkeys), 'Показать эту подсказку']].map(function (r) {
      return '<tr><td><kbd>' + r[0] + '</kbd></td><td>' + r[1] + '</td></tr>';
    }).join('') + '</table>' +
    '<p class="small muted" style="margin-top:10px">Переназначить — кнопка «Настроить» рядом с «Горячими клавишами» в инструментах.</p>');
}

/* ---------- Глобальные хоткеи (учитывают кастомные, ф. 31) ---------- */

function initHotkeys() {
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    var tag = e.target && e.target.tagName;
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    if (!$('#modal-backdrop').hidden) { if (e.key === 'Escape') closeModal(); return; }

    var route = currentRoute();
    var p = getParagraph(route);
    var idx = p ? paraIndex(p) : -1;
    var hk = getHotkeys();
    var k = e.key;

    /* стрелки заняты слайдами, когда открыта вкладка «Презентация» */
    var activeTab = (p && store.get(K.tab, 'short')) || 'short';
    var presActive = activeTab === 'pres' &&
      document.getElementById('tab-pres') && !document.getElementById('tab-pres').hidden;

    /* переназначаемые действия (ф. 31) */
    if (k === hk.search) { e.preventDefault(); $('#search-input').focus(); return; }
    if (k === hk.hotkeys) { showHotkeys(); return; }
    if (k === hk.reading) {
      if (p) toggleReading(!document.body.classList.contains('reading'));
      return;
    }
    if (k === hk.short || k === hk.detailed || k === hk.pres || k === hk.quiz) {
      if (!p) return;
      var tabMap = {};
      tabMap[hk.short] = 'short'; tabMap[hk.detailed] = 'detailed';
      tabMap[hk.pres] = 'pres'; tabMap[hk.quiz] = 'quiz';
      var tb = $('.tab-btn[data-tab="' + tabMap[k] + '"]');
      if (tb) tb.click();
      return;
    }
    if (k === hk.next || (e.key === 'ArrowRight' && !presActive)) {
      if (p && idx < PARAGRAPHS.length - 1) location.hash = '#/' + PARAGRAPHS[idx + 1].id;
      return;
    }
    if (k === hk.prev || (e.key === 'ArrowLeft' && !presActive)) {
      if (p && idx > 0) location.hash = '#/' + PARAGRAPHS[idx - 1].id;
      return;
    }

    /* фиксированные (не переназначаются) */
    switch (k) {
      case 'b': case 'B':
        if (p) { var ab = $('#act-bookmark'); if (ab) ab.click(); } break;
      case 't': case 'T': $('#theme-toggle').click(); break;
      case 'Escape':
        if (document.body.classList.contains('reading')) toggleReading(false);
        else closeSidebar();
        break;
    }
  });
}

/* ---------- 14. Прочее: glint, sidebar, PWA, toast, init ---------- */

var motionOK = true;
try { motionOK = !window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

function initGlint() {
  if (!motionOK) return;
  document.addEventListener('pointermove', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('.glint') : null;
    if (!el) return;
    var r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    el.style.setProperty('--mx', (((e.clientX - r.left) / r.width) * 100).toFixed(1) + '%');
    el.style.setProperty('--my', (((e.clientY - r.top) / r.height) * 100).toFixed(1) + '%');
  }, { passive: true });
}

function openSidebar() {
  $('#sidebar').classList.add('open');
  $('#backdrop').hidden = false;
  $('#menu-toggle').setAttribute('aria-expanded', 'true');
  /* a11y: фокус внутрь панели (на первую ссылку оглавления) */
  try {
    var first = ($('#toc-list a') && $('#toc-list a').focus) ? $('#toc-list a') : $('#menu-close');
    if (first && first.focus) first.focus({ preventScroll: true });
  } catch (e) { /* фокус не критичен */ }
}
function closeSidebar() {
  $('#sidebar').classList.remove('open');
  $('#backdrop').hidden = true;
  $('#menu-toggle').setAttribute('aria-expanded', 'false');
  /* a11y: возврат фокуса на бургер */
  try {
    var t = $('#menu-toggle');
    if (t && t.focus) t.focus({ preventScroll: true });
  } catch (e) { /* не критично */ }
}

function initSidebar() {
  $('#menu-toggle').addEventListener('click', function () {
    $('#sidebar').classList.contains('open') ? closeSidebar() : openSidebar();
  });
  $('#menu-close').addEventListener('click', closeSidebar);
  $('#backdrop').addEventListener('click', closeSidebar);
  $('#reset-progress').addEventListener('click', function () {
    if (!window.confirm('Сбросить весь прогресс изучения?')) return;
    progress = {};
    saveProgress();
    navigate();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSidebar(); });
}

/* Toast */
var toastT = null;
function toast(msg) {
  var t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  requestAnimationFrame(function () { t.classList.add('show'); });
  clearTimeout(toastT);
  toastT = setTimeout(function () { t.classList.remove('show'); }, 2200);
}

/* PWA: регистрация SW + кнопка установки */
function initPWA() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    var btn = $('#install-hint');
    btn.hidden = false;
    btn.addEventListener('click', function () { e.prompt(); btn.hidden = true; }, { once: true });
  });
}

/* ============================================================================
   ФИЧИ 3 · 5 · 10 · 28 · 29 · 31 · 39 · 40 · 43 (модуль поверх чистой базы)
   ============================================================================ */

/* ---------- Ф.3. КОНСПЕКТ-КОНСТРУКТОР ---------- */
/* Чекбоксы у тезисов «Кратко» и абзацев «Подробно» → страница «Мой конспект». */

function getMyConspect() { return store.get(K.myconspect, []); }
function saveMyConspect(l) { store.set(K.myconspect, l); }

function toggleConspectItem(pid, block, text, head) {
  var list = getMyConspect();
  var i = -1;
  for (var j = 0; j < list.length; j++) {
    if (list[j].pid === pid && list[j].block === block) { i = j; break; }
  }
  if (i === -1) {
    list.push({ pid: pid, block: block, text: text, head: head || '' });
    toast('Добавлено в «Мой конспект»');
  } else {
    list.splice(i, 1);
    toast('Убрано из «Мой конспект»');
  }
  saveMyConspect(list);
  return i === -1;
}
function inMyConspect(pid, block) {
  return getMyConspect().some(function (x) { return x.pid === pid && x.block === block; });
}

/* Страница «Мой конспект» (#/myconspect): ↑↓ порядок, экспорт MD, печать */
function renderMyConspect() {
  var list = getMyConspect();
  var html = '<nav class="crumbs"><a href="#/">Главная</a> / <span>Мой конспект</span></nav>' +
    '<div class="p-head"><span class="p-head-num">✎</span><h1>Мой конспект</h1></div>' +
    '<p class="muted">Отмеченные тезисы и абзацы. Меняйте порядок стрелками ↑↓.</p>';

  if (!list.length) {
    html += '<div class="empty-state"><div class="e-icon">✎</div><b>Пока пусто</b>' +
      '<span class="small">Откройте параграф и отметьте галочками нужные тезисы (вкладки «Кратко»/«Подробно»).</span>' +
      '<a class="btn btn-ghost" href="#/catalog">К параграфам</a></div>';
    $('#app').innerHTML = html;
    document.title = 'Мой конспект · ' + SITE_DATA.meta.siteTitle;
    renderTOC();
    return;
  }

  html += '<div class="quiz-actions" style="margin:12px 0">' +
    '<button type="button" class="btn btn-ghost" id="mc-export">Экспорт в Markdown</button>' +
    '<button type="button" class="btn btn-ghost" id="mc-print">Печать / PDF</button>' +
    '<button type="button" class="btn btn-ghost" id="mc-clear">Очистить всё</button></div>' +
    '<ol class="thesis-list" id="mc-list">';
  list.forEach(function (it, n) {
    var p = getParagraph(it.pid);
    html += '<li class="thesis glint">' +
      '<span class="thesis-n">' + (n + 1) + '</span>' +
      '<div><b>' + esc(it.head || (p ? p.num + ' ' + p.title : '')) + '</b>' +
      '<p>' + esc(it.text) + '</p>' +
      '<div class="small muted">из ' + esc(p ? p.num + ' ' + p.title : it.pid) + '</div></div>' +
      '<div class="mc-actions">' +
        '<button type="button" class="pomo-btn" data-mc="up" data-n="' + n + '" aria-label="Выше">↑</button>' +
        '<button type="button" class="pomo-btn" data-mc="down" data-n="' + n + '" aria-label="Ниже">↓</button>' +
        '<button type="button" class="pomo-btn" data-mc="del" data-n="' + n + '" aria-label="Удалить">✕</button>' +
      '</div></li>';
  });
  html += '</ol>';
  $('#app').innerHTML = html;
  document.title = 'Мой конспект · ' + SITE_DATA.meta.siteTitle;

  $('#mc-list').addEventListener('click', function (e) {
    var b = e.target.closest('[data-mc]');
    if (!b) return;
    var l = getMyConspect();
    var n = parseInt(b.dataset.n, 10);
    if (b.dataset.mc === 'up' && n > 0) {
      var t = l[n - 1]; l[n - 1] = l[n]; l[n] = t;
      saveMyConspect(l); renderMyConspect();
    } else if (b.dataset.mc === 'down' && n < l.length - 1) {
      var t2 = l[n + 1]; l[n + 1] = l[n]; l[n] = t2;
      saveMyConspect(l); renderMyConspect();
    } else if (b.dataset.mc === 'del') {
      l.splice(n, 1); saveMyConspect(l); renderMyConspect();
    }
  });
  $('#mc-clear').addEventListener('click', function () {
    if (!window.confirm('Очистить «Мой конспект»?')) return;
    saveMyConspect([]); renderMyConspect();
  });
  $('#mc-export').addEventListener('click', function () {
    var md = '# Мой конспект\n\n' + getMyConspect().map(function (it, n) {
      var p = getParagraph(it.pid);
      return (n + 1) + '. **' + (it.head || '') + '** (' + (p ? p.num + ' ' + p.title : '') + ')\n   ' + it.text;
    }).join('\n\n');
    var w = window.open('', '_blank');
    if (w) {
      w.document.write('<pre style="font:14px/1.6 Consolas,monospace;padding:20px;white-space:pre-wrap">' + esc(md) + '</pre>');
      w.document.close();
    }
  });
  $('#mc-print').addEventListener('click', function () { window.print(); });
  renderTOC();
}

/* ---------- Ф.5. ХРОНОЛОГИЧЕСКАЯ ЛЕНТА (#/timeline) ---------- */
/* Собирает conspect.dates всех параграфов + опциональное поле p.timeline. */

function timelineEvents() {
  var out = [];
  PARAGRAPHS.forEach(function (p) {
    (p.conspect.dates || []).forEach(function (d) {
      out.push({ when: d.when, what: d.what, pid: p.id, pnum: p.num });
    });
    (p.timeline || []).forEach(function (d) {
      out.push({ when: d.when, what: d.what, pid: p.id, pnum: p.num });
    });
  });
  return out;
}

function renderTimeline() {
  var ev = timelineEvents();
  var html = '<nav class="crumbs"><a href="#/">Главная</a> / <span>Хронология</span></nav>' +
    '<div class="p-head"><span class="p-head-num">⏳</span><h1>Хронологическая лента</h1></div>';

  if (!ev.length) {
    html += '<div class="empty-state"><div class="e-icon">⏳</div><b>Дат пока нет</b>' +
      '<span class="small">Добавьте события в data.js: conspect.dates или поле timeline параграфа.</span></div>';
  } else {
    html += '<input type="search" class="gloss-search" id="tl-filter" placeholder="Поиск по событиям…" aria-label="Поиск по ленте">' +
      '<div class="tl-list" id="tl-list">';
    ev.forEach(function (e) {
      html += '<div class="tl-item glint">' +
        '<span class="tl-when">' + esc(e.when) + '</span>' +
        '<span class="tl-what">' + esc(e.what) +
        ' <a class="small" href="#/' + esc(e.pid) + '">' + esc(e.pnum) + ' →</a></span></div>';
    });
    html += '</div>';
  }
  $('#app').innerHTML = html;
  document.title = 'Хронология · ' + SITE_DATA.meta.siteTitle;

  if (ev.length) {
    var f = $('#tl-filter');
    f.addEventListener('input', function () {
      var q = f.value.trim().toLowerCase();
      $$('#tl-list .tl-item').forEach(function (el) {
        el.hidden = q && el.textContent.toLowerCase().indexOf(q) === -1;
      });
    });
  }
  renderTOC();
}

/* ---------- Ф.10. FLASHCARDS «из тестов» ---------- */
/* Второй режим в существующем разделе: вопрос → правильный ответ + пояснение. */

function quizCards() {
  var out = [];
  PARAGRAPHS.forEach(function (p) {
    p.test.forEach(function (q) {
      out.push({
        term: q.q,
        def: q.options[q.correct] + (q.why ? ' — ' + q.why : ''),
        src: p.num + ' ' + p.title, pid: p.id
      });
    });
  });
  return out;
}

/* ---------- Ф.28. РЕЖИМ ЧТЕНИЯ ---------- */
/* body.reading: только конспект, комфортная строка, Esc — выход. */

function toggleReading(on) {
  document.body.classList.toggle('reading', on);
  store.set(K.reading, on);
  var btn = $('#act-reading');
  if (btn) { btn.classList.toggle('on', on); btn.lastChild.textContent = on ? ' Обычный' : ' Чтение'; }
  /* настоящая кнопка выхода (кликабельна, в отличие от ::after) */
  var exit = document.getElementById('reading-exit');
  if (exit) {
    exit.hidden = !on;
    if (on) {
      exit.onclick = function () { toggleReading(false); };   // клик — выход
      exit.focus({ preventScroll: true });                    // сразу доступна с клавиатуры
    }
  }
  toast(on ? 'Режим чтения включён (Esc или кнопка ✕)' : 'Режим чтения выключен');
}

/* ---------- Ф.29. ЗАКЛАДКИ ВНУТРИ ПАРАГРАФА ---------- */
/* {pid, type:'block'|'slide', index, label}; звёзды у тезисов/абзацев. */

function getAnchors() { return store.get(K.anchors, []); }
function saveAnchors(a) { store.set(K.anchors, a); }
function anchorKey(a) { return a.pid + ':' + a.type + ':' + a.index; }

function toggleAnchor(pid, type, index, label) {
  var a = getAnchors();
  var k = pid + ':' + type + ':' + index;
  var i = -1;
  for (var j = 0; j < a.length; j++) if (anchorKey(a[j]) === k) { i = j; break; }
  if (i === -1) { a.push({ pid: pid, type: type, index: index, label: label || '' }); toast('Закладка добавлена'); }
  else { a.splice(i, 1); toast('Закладка удалена'); }
  saveAnchors(a);
  return i === -1;
}
function hasAnchor(pid, type, index) {
  return getAnchors().some(function (a) { return anchorKey(a) === pid + ':' + type + ':' + index; });
}

/* Страница «Мои закладки» (#/anchors): якоря + параграфы */
function renderAnchors() {
  var a = getAnchors();
  var html = '<nav class="crumbs"><a href="#/">Главная</a> / <span>Мои закладки</span></nav>' +
    '<div class="p-head"><span class="p-head-num">★</span><h1>Мои закладки</h1></div>';

  var paras = store.get(K.bookmarks, []).map(getParagraph).filter(Boolean);
  if (!a.length && !paras.length) {
    html += '<div class="empty-state"><div class="e-icon">★</div><b>Закладок нет</b>' +
      '<span class="small">Добавляйте параграфы (кнопка «В закладки») и отмечайте звёздочкой ☆ нужные тезисы и абзацы.</span></div>';
  } else {
    if (a.length) {
      html += '<h2 class="block-title">Внутри параграфов</h2>';
      a.forEach(function (an, n) {
        var p = getParagraph(an.pid);
        if (!p) return;
        var target = an.type === 'slide'
          ? '#/' + an.pid + '/s' + ((parseInt(an.index, 10) || 0) + 1)
          : '#/' + an.pid;
        html += '<div class="list-row">' +
          '<a href="' + esc(target) + '">' +
          esc(p.num) + ' · ' + esc(an.label || ('место ' + an.index)) + '</a>' +
          '<small>' + (an.type === 'slide' ? 'слайд' : 'абзац') + ' · ' +
          '<button type="button" class="link-btn" data-del="' + n + '">удалить</button></small></div>';
      });
    }
    if (paras.length) {
      html += '<h2 class="block-title">Параграфы</h2>';
      paras.forEach(function (p) {
        html += '<div class="list-row"><a href="#/' + esc(p.id) + '">' + esc(p.num) + '. ' + esc(p.title) + '</a>' +
          '<small>параграф</small></div>';
      });
    }
  }
  $('#app').innerHTML = html;
  document.title = 'Мои закладки · ' + SITE_DATA.meta.siteTitle;

  $('#app').addEventListener('click', function (e) {
    var d = e.target.closest('[data-del]');
    if (!d) return;
    var l = getAnchors();
    l.splice(parseInt(d.dataset.del, 10), 1);
    saveAnchors(l);
    renderAnchors();
  });
  renderTOC();
}

/* ---------- Ф.31. СВОИ ХОТКЕИ ---------- */
/* Переназначение: действия → клавиша; конфликты подсвечиваются. */

var DEFAULT_HOTKEYS = {
  search: '/', prev: 'p', next: 'n', short: 's', detailed: 'd',
  pres: 'l', quiz: 'q', reading: 'r', hotkeys: '?'
};
function getHotkeys() {
  var custom = store.get(K.hotkeys, {});
  var out = {};
  Object.keys(DEFAULT_HOTKEYS).forEach(function (a) { out[a] = custom[a] || DEFAULT_HOTKEYS[a]; });
  return out;
}
function hotkeyConflicts(keys) {
  var seen = {}, dup = {};
  Object.keys(keys).forEach(function (a) {
    var k = keys[a];
    if (seen[k]) { dup[a] = seen[k]; dup[seen[k]] = a; } else seen[k] = a;
  });
  return dup;
}

var HK_NAMES = {
  search: 'Поиск', prev: 'Параграф назад', next: 'Параграф вперёд',
  short: 'Кратко', detailed: 'Подробно', pres: 'Презентация',
  quiz: 'Тест', reading: 'Режим чтения', hotkeys: 'Подсказка (?)'
};

function showHotkeyEditor() {
  var hk = getHotkeys();
  var rows = Object.keys(HK_NAMES).map(function (a) {
    return '<div class="set-row"><span>' + esc(HK_NAMES[a]) + '</span>' +
      '<button type="button" class="btn btn-ghost hk-capture" data-action="' + a + '">' +
      '<kbd>' + esc(hk[a]) + '</kbd> — нажмите клавишу</button></div>';
  }).join('');

  openModal('Свои горячие клавиши',
    '<p class="muted small">Нажмите кнопку и затем клавишу. Конфликты подсвечиваются красным.</p>' + rows +
    '<div id="hk-conflicts"></div>' +
    '<div class="quiz-actions" style="margin-top:14px">' +
    '<button type="button" class="btn btn-ghost" id="hk-reset">Сбросить к стандартным</button>' +
    '<button type="button" class="btn btn-primary" id="hk-save">Сохранить</button></div>');

  var draft = {}; Object.keys(hk).forEach(function (a) { draft[a] = hk[a]; });

  function paintAll() {
    var conf = hotkeyConflicts(draft);
    $$('.hk-capture').forEach(function (b) {
      var a = b.dataset.action;
      b.innerHTML = '<kbd>' + esc(draft[a]) + '</kbd> — нажмите клавишу';
      b.style.borderColor = conf[a] ? 'var(--err)' : '';
    });
    var cBox = $('#hk-conflicts');
    var keys = Object.keys(conf);
    cBox.innerHTML = keys.length
      ? '<p class="small" style="color:var(--err)">Конфликт: клавиша «' + esc(draft[keys[0]]) + '» назначена несколько раз (' +
        keys.map(function (a) { return esc(HK_NAMES[a]); }).join(', ') + ')</p>'
      : '';
  }

  $$('.hk-capture').forEach(function (btn) {
    btn.addEventListener('click', function () {
      btn.textContent = '…нажмите клавишу';
      btn.classList.add('waiting');
      function onKey(e) {
        e.preventDefault();
        if (e.key === 'Escape') { btn.classList.remove('waiting'); paintAll(); return; }
        if (e.key.length === 1 || e.key === '/') draft[btn.dataset.action] = e.key;
        document.removeEventListener('keydown', onKey, true);
        btn.classList.remove('waiting');
        paintAll();
      }
      document.addEventListener('keydown', onKey, true);
    });
  });

  $('#hk-reset').addEventListener('click', function () {
    draft = {}; Object.keys(DEFAULT_HOTKEYS).forEach(function (a) { draft[a] = DEFAULT_HOTKEYS[a]; });
    paintAll();
  });
  $('#hk-save').addEventListener('click', function () {
    if (Object.keys(hotkeyConflicts(draft)).length) { toast('Сначала устраните конфликты'); return; }
    var custom = {};
    Object.keys(draft).forEach(function (a) {
      if (draft[a] !== DEFAULT_HOTKEYS[a]) custom[a] = draft[a];
    });
    store.set(K.hotkeys, custom);
    toast('Хоткеи сохранены');
    closeModal();
  });
  paintAll();
}

/* ---------- Ф.39. 3D-МОДЕЛИ ПО ТЕМАМ (слот model3d) ---------- */
/* Лениво: IntersectionObserver → Three.js; fallback — подпись с инструкцией. */

function renderModel3D(p) {
  if (!p.model3d) return '';
  return '<div class="model3d glass glint">' +
    '<div class="m3d-stub">3D-модель: ' + esc(p.model3d.caption || p.model3d.src) +
    '<div class="small muted">Положите ' + esc(p.model3d.src) + ' и assets/three.min.js — модель загрузится автоматически.</div></div></div>';
}
function initModel3D(p) {
  var box = $('.model3d');
  if (!box || !p.model3d) return;
  if (!('IntersectionObserver' in window)) return;   // фолбэк — подпись
  var io = new IntersectionObserver(function (entries) {
    if (!entries[0].isIntersecting) return;
    io.disconnect();
    if (!window.fetch) return;
    fetch(p.model3d.src, { method: 'HEAD' })
      .then(function (r) { if (!r.ok) throw 0; return fetch('assets/three.min.js', { method: 'HEAD' }); })
      .then(function (r) {
        if (!r.ok) throw 0;
        var s = document.createElement('script');
        s.src = 'assets/three.min.js';
        s.onload = function () {
          try {
            var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            renderer.setSize(box.clientWidth || 320, 300);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));  // DPR cap
            box.innerHTML = ''; box.appendChild(renderer.domElement);
            var camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
            camera.position.set(0, 1, 4); camera.lookAt(0, 0, 0);
            var scn = new THREE.Scene();
            scn.add(new THREE.AmbientLight(0xffffff, 0.9));
            var dl = new THREE.DirectionalLight(0xffffff, 0.9); dl.position.set(2, 3, 4); scn.add(dl);
            var loader = new THREE.GLTFLoader();
            loader.load(p.model3d.src, function (gltf) {
              var bb = new THREE.Box3().setFromObject(gltf.scene);
              var h = bb.getSize(new THREE.Vector3()).length() || 1;
              gltf.scene.scale.setScalar(2.2 / h);
              scn.add(gltf.scene);
              var visible = true;
              new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }).observe(box);
              (function tick(t) {
                requestAnimationFrame(tick);
                if (document.hidden || !visible) return;   // пауза вне вьюпорта
                if (motionOK) gltf.scene.rotation.y = t / 2400;  // reduced-motion — без вращения
                renderer.render(scn, camera);
              })(0);
            });
          } catch (e) { /* WebGL нет — остаётся подпись */ }
        };
        document.head.appendChild(s);
      })
      .catch(function () { /* файлов нет — фолбэк-подпись */ });
  }, { threshold: 0.1 });
  io.observe(box);
}

/* ---------- Ф.40. ЖИВОЙ ФОН (canvas-частицы) ---------- */
/* ~30 FPS, DPR≤1.5, ≤26 частиц; отключается в настройках и при reduced-motion. */

function initLiveBg() {
  if (!store.get(K.livebg, true)) return;
  if (!motionOK) return;
  var stage = $('.bg-stage');
  if (!stage) return;
  var cv = document.createElement('canvas');
  cv.className = 'live-bg';
  cv.setAttribute('aria-hidden', 'true');
  stage.appendChild(cv);
  if (!cv.getContext) return;
  var ctx = cv.getContext('2d');
  if (!ctx) return;
  var W, H, parts = [], mx = -999, my = -999;
  var DPR = Math.min(window.devicePixelRatio || 1, 1.5);

  function resize() {
    W = cv.width = innerWidth * DPR; H = cv.height = innerHeight * DPR;
    parts = [];
    var n = Math.min(26, Math.round(innerWidth / 60));
    for (var i = 0; i < n; i++) {
      parts.push({
        x: Math.random() * W, y: Math.random() * H,
        r: (Math.random() * 1.6 + 0.6) * DPR,
        vx: (Math.random() - 0.5) * 0.08 * DPR, vy: (Math.random() - 0.5) * 0.06 * DPR,
        ph: Math.random() * Math.PI * 2
      });
    }
  }
  resize();
  window.addEventListener('resize', resize);

  var last = 0;
  (function tick(t) {
    requestAnimationFrame(tick);
    if (t - last < 33) return;              // ~30 FPS
    if (document.hidden) return;
    last = t;
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var dx = p.x - mx * DPR, dy = p.y - my * DPR, d2 = dx * dx + dy * dy;
      if (d2 < 14400 * DPR * DPR) { p.x += dx * 0.004; p.y += dy * 0.004; }
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      var a = 0.25 + 0.2 * Math.sin(t / 1400 + p.ph);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(220,200,160,' + a.toFixed(3) + ')';
      ctx.fill();
    }
  })(0);

  document.addEventListener('pointermove', function (e) { mx = e.clientX; my = e.clientY; }, { passive: true });
}

/* ---------- Ф.43. БЫСТРЫЙ ПОИСК ПО ВСЕМУ САЙТУ ---------- */
/* Индекс: параграфы, термины, вопросы тестов, слайды; группы + ↑↓/Enter. */

function globalSearchIndex() {
  var idx = [];
  PARAGRAPHS.forEach(function (p) {
    idx.push({ type: 'page', pid: p.id, title: p.num + ' ' + p.title, text: p.conspect.intro || '', go: p.id });
    (p.conspect.terms || []).forEach(function (t) {
      idx.push({ type: 'term', pid: p.id, title: t.term, text: t.def, go: p.id });
    });
    p.test.forEach(function (q) {
      idx.push({ type: 'quiz', pid: p.id, title: q.q, text: q.options[q.correct], go: p.id + '?tab=quiz' });
    });
    p.slides.forEach(function (s, si) {
      idx.push({ type: 'slide', pid: p.id, title: s.title, text: (s.items || []).join(' · '), go: p.id + '/s' + (si + 1) });
    });
  });
  return idx;
}

function initGlobalSearch() {
  var input = $('#search-input');
  var box = $('#search-results');
  var idx = globalSearchIndex();
  var sel = -1;

  function hl(s, re) { return esc(s).replace(re, function (m) { return '<mark class="hit">' + m + '</mark>'; }); }
  function typeLabel(t) {
    return ({ page: 'Параграфы', term: 'Термины', quiz: 'Вопросы тестов', slide: 'Слайды' })[t] || t;
  }
  function paint(items) {
    items.forEach(function (el, n) { el.classList.toggle('sel', n === sel); });
    if (items[sel]) items[sel].scrollIntoView({ block: 'nearest' });
  }
  function go(it) {
    box.hidden = true; input.value = ''; input.blur();
    location.hash = '#/' + it.dataset.go;
  }
  function run() {
    var q = input.value.trim().toLowerCase();
    sel = -1;
    if (q.length < 2) { box.hidden = true; box.innerHTML = ''; return; }
    var re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    var hits = idx.filter(function (r) {
      return (r.title + ' ' + r.text).toLowerCase().indexOf(q) !== -1;
    }).slice(0, 12);

    if (!hits.length) {
      box.hidden = false;
      box.innerHTML = '<div class="sr-item empty-state" style="padding:22px 10px">' +
        '<div class="e-icon">⌕</div><b>Ничего не найдено</b></div>';
      return;
    }
    var groups = {};
    hits.forEach(function (r) { (groups[r.type] = groups[r.type] || []).push(r); });
    box.innerHTML = Object.keys(groups).map(function (t) {
      return '<div class="sr-group small muted" style="padding:6px 12px 2px">' + typeLabel(t) + '</div>' +
        groups[t].map(function (r) {
          return '<button type="button" class="sr-item" data-go="' + esc(r.go) + '">' +
            '<b>' + hl(r.title, re) + '</b><br><span class="small">' + hl((r.text || '').slice(0, 110), re) + '</span></button>';
        }).join('');
    }).join('');
    box.hidden = false;
  }

  input.addEventListener('input', run);
  input.addEventListener('keydown', function (e) {
    var items = $$('.sr-item[data-go]', box);
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); paint(items); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); paint(items); }
    else if (e.key === 'Enter') { e.preventDefault(); var it = items[sel === -1 ? 0 : sel]; if (it) go(it); }
    else if (e.key === 'Escape') { box.hidden = true; }
  });
  box.addEventListener('click', function (e) {
    var it = e.target.closest('.sr-item[data-go]');
    if (it) go(it);
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.search-wrap') && !e.target.closest('#search-open')) box.hidden = true;
  });
}

/* ---------- Мобильный поиск: кнопка-лупа СЛЕВА у оглавления ----------
   ОДНА строка поиска на весь сайт: существующий .search-wrap c #search-input.
   На мобиле строка скрыта; клик по лупе: кнопка летит в левый угол,
   круглеет, и .search-wrap появляется на всю шапку (search-mode).
   Никаких вторых инпутов — двойной поиск невозможен физически. */
function initMobileSearch() {
  var btn = document.getElementById('search-open');
  var inner = document.querySelector('.header-inner');
  var wrap = document.querySelector('.search-wrap');     // та же строка, что на ПК
  var input = document.getElementById('search-input');
  if (!btn || !inner || !wrap) return;

  var mq = window.matchMedia('(max-width: 800px)');
  function sync() {
    btn.hidden = !mq.matches;
    if (!mq.matches) {
      inner.classList.remove('search-mode');
      if (input && input.blur) input.blur();
    }
  }
  if (mq.addEventListener) mq.addEventListener('change', sync);
  else if (mq.addListener) mq.addListener(sync);
  sync();

  function open() {
    inner.classList.add('search-mode');
    btn.setAttribute('aria-label', 'Закрыть поиск');
    btn.setAttribute('aria-expanded', 'true');
    setTimeout(function () { if (input.focus) input.focus({ preventScroll: true }); }, 150);
  }
  function close() {
    /* красивое закрытие: класс search-closing — строка гаснет, кнопка
       летит обратно; через 260ms снимаем search-mode полностью.
       БЕЗ мгновенного remove — иначе display:none обрубал анимацию
       и на Android кнопки «не возвращались» из залипшего forwards. */
    inner.classList.add('search-closing');
    btn.setAttribute('aria-label', 'Открыть поиск');
    btn.setAttribute('aria-expanded', 'false');
    if (input.blur) input.blur();
    input.value = '';
    var box = document.getElementById('search-results');
    if (box) box.hidden = true;
    setTimeout(function () {
      inner.classList.remove('search-mode', 'search-closing');
      if (btn.focus) btn.focus({ preventScroll: true });
    }, 260);
  }

  btn.addEventListener('click', function () {
    if (inner.classList.contains('search-mode')) close();
    else open();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && inner.classList.contains('search-mode')) close();
  });
  /* клик мимо поиска/кнопки — закрыть (только на мобиле) */
  document.addEventListener('click', function (e) {
    if (!mq.matches) return;
    if (!e.target.closest || (!e.target.closest('.search-wrap') && !e.target.closest('#search-open'))) {
      var box = document.getElementById('search-results');
      if (box) box.hidden = true;
    }
  });
}

/* Инициализация */
function init() {
  initTheme();
  initSidebar();
  initGlint();
  initHeader();
  initBookSwitch();       // переключатель учебников (11/10 класс)
  initHeaderHide();     // уезжающая шапка (скролл-логика)
  initGlobalSearch();    // ф. 43: глобальный поиск (заменяет initSearch)
  initMobileSearch();    // мобильная лупа → expand-поиск на всю шапку
  initModals();
  initHotkeys();
  initPWA();
  initPomodoro();       // виджет Pomodoro (тихо живёт в углу)
  initMicroInteractions();  // ripple, пауза idle-анимаций, мелкая магия
  initLiveBg();         // ф. 40: живой фон-частицы
  renderTOC();
  updateHeaderProgress();
  window.addEventListener('hashchange', navigate);
  navigate();
  runOnboarding();      // тур при первом входе (однократно, localStorage)
  checkBadges();        // актуализируем достижения при старте
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

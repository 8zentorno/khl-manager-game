/* KHL Manager 8.28.0 — верхняя панель: место · очки · В П ПО, серия, ближайший матч, доверие руководства,
   сворачивание на телефоне, вкладки, которые листаются мышью, колесом, стрелками и пальцем. */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const $ = id => document.getElementById(id);
  const plural = (n, a, b, c) => { const m = Math.abs(n) % 100, d = m % 10; return m > 10 && m < 20 ? c : d === 1 ? a : d >= 2 && d <= 4 ? b : c; };
  const CONF = { West: 'Запад', East: 'Восток' };

  proto.topPanelInfo = function () {
    const st = this.state, my = st.teamId, team = this.teamById(my), ss = st.standings[my] || {};
    const conf = String(team.conf || '').toLowerCase();
    const place = this.standingsFor(conf).findIndex(x => x.id === my) + 1;
    const pts = ss.pts || 0;
    const played = this.userPlayedMatches ? this.userPlayedMatches() : [];
    let run = 0, kind = null;
    for (let i = played.length - 1; i >= 0; i--) {
      const m = played[i], mine = m.homeId === my, w = (mine ? m.homeScore : m.awayScore) > (mine ? m.awayScore : m.homeScore);
      const k = w ? 'w' : 'l';
      if (kind === null) kind = k; if (k !== kind) break; run++;
    }
    const streak = run >= 2 ? (kind === 'w' ? `🔥 ${run} ${plural(run, 'победа', 'победы', 'побед')} подряд` : `❄️ ${run} ${plural(run, 'поражение', 'поражения', 'поражений')} подряд`) : '';
    return {
      placeText: `${place}-е место · ${CONF[team.conf] || team.conf}`,
      pointsText: `${pts} ${plural(pts, 'очко', 'очка', 'очков')}`,
      rec: this.recordBreakdown(my),
      streak
    };
  };

  // В / ВО / ВБ / П / ПО / ПБ по всем сыгранным матчам клуба: регулярка + плей-офф.
  // Овертайм с пустыми воротами считается обычным результатом (как в начислении очков).
  proto.recordBreakdown = function (teamId) {
    const z = () => ({ w: 0, wo: 0, wb: 0, l: 0, lo: 0, lb: 0 }), reg = z(), po = z();
    for (const m of this.state.matches) {
      if (!m.played || m.cancelled || (m.homeId !== teamId && m.awayId !== teamId)) continue;
      const mine = m.homeId === teamId, a = mine ? m.homeScore : m.awayScore, b = mine ? m.awayScore : m.homeScore;
      if (a === b) continue;
      const t = m.playoff ? po : reg, win = a > b, extra = (m.ot || m.so) && !m.overtimeEmptyNet;
      const k = win ? (!extra ? 'w' : m.so ? 'wb' : 'wo') : (!extra ? 'l' : m.so ? 'lb' : 'lo');
      t[k]++;
    }
    const tot = {}; for (const k of Object.keys(reg)) tot[k] = reg[k] + po[k];
    return { reg, po, tot, games: Object.values(tot).reduce((x, y) => x + y, 0) };
  };
  proto.recordHtml = function (r) {
    const cell = (k, l, c) => `<div class="${c}"><b>${r.tot[k]}</b><small>${l}</small></div>`;
    return cell('w', 'В', 'w') + cell('wo', 'ВО', 'w') + cell('wb', 'ВБ', 'w') + cell('l', 'П', 'l') + cell('lo', 'ПО', 'l') + cell('lb', 'ПБ', 'l');
  };
  proto.recordTitle = function (r) {
    const f = t => `В ${t.w} · ВО ${t.wo} · ВБ ${t.wb} · П ${t.l} · ПО ${t.lo} · ПБ ${t.lb}`;
    return `Регулярка: ${f(r.reg)}\nПлей-офф: ${f(r.po)}`;
  };

  proto.renderTopPanel = function () {
    if (!this.state || !$('header-place')) return;
    const i = this.topPanelInfo();
    { const pm = /^(\d+-е)(.*)$/.exec(i.placeText), hp = $('header-place'); if (pm) hp.innerHTML = pm[1] + '<span class="ph-x">\u00a0' + pm[2].trim().replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</span>'; else hp.textContent = i.placeText; } $('header-points').textContent = i.pointsText; const rec = $('header-record'); rec.innerHTML = this.recordHtml(i.rec); rec.title = this.recordTitle(i.rec);
    const sr = $('header-rec-short'); if (sr) { const t = i.rec.tot; sr.textContent = `${t.w + t.wo + t.wb}В ${t.l + t.lo + t.lb}П`; sr.title = rec.title; }
    const sk = $('header-streak'); sk.textContent = i.streak; sk.classList.toggle('hidden', !i.streak);
    const t = this.ensureTrust(), z = this.trustZoneOf(t.value);
    $('trust-needle').style.left = t.value + '%';
    const zn = $('trust-zone'); zn.textContent = z.name; zn.className = 'trust-zone ' + z.cls;
    this.fixThemeLabel();
  };

  // Подпись у кнопки темы.
  proto.fixThemeLabel = function () {
    const light = this.currentTheme && this.currentTheme() === 'light';
    document.querySelectorAll('.top-actions [data-theme-toggle]').forEach(b => { b.innerHTML = (light ? '☀️' : '🌙') + ' <span class="lbl">Тема</span>'; });
  };

  // Сворачивание панели на телефоне.
  const KEY = 'khl.topCollapsed';
  const narrow = () => window.matchMedia && window.matchMedia('(max-width:760px)').matches;
  proto.applyTopCollapsed = function (force) {
    const bar = $('topbar'); if (!bar) return;
    let v = force;
    if (v === undefined) { try { const s = localStorage.getItem(KEY); v = s === null ? true : s === '1'; } catch (e) { v = true; } }
    const c = false; // 14.3: на телефоне шапка не сворачивается, лишнее прячется при прокрутке
    bar.classList.toggle('collapsed', c);
    const b = $('top-toggle'); if (b) { b.setAttribute('aria-expanded', String(!c)); b.textContent = c ? '▾' : '▴'; }
  };
  proto.toggleTopPanel = function () {
    const bar = $('topbar'), now = !bar.classList.contains('collapsed');
    try { localStorage.setItem(KEY, now ? '1' : '0'); } catch (e) {}
    this.applyTopCollapsed(now);
  };

  // Вкладки: мышь (перетаскивание), колесо, стрелки, затемнение у края, свайп пальцем (родная прокрутка).
  proto.setupNavScroll = function () {
    const nav = $('main-nav'), shell = $('nav-shell'); if (!nav || !shell || nav._scrollReady) return;
    nav._scrollReady = true;
    const L = shell.querySelector('.nav-arr.l'), R = shell.querySelector('.nav-arr.r'), FL = shell.querySelector('.nav-fade.l'), FR = shell.querySelector('.nav-fade.r');
    const edge = () => {
      const max = nav.scrollWidth - nav.clientWidth, l = nav.scrollLeft > 2, r = nav.scrollLeft < max - 2;
      FL.classList.toggle('show', l); FR.classList.toggle('show', r); L.classList.toggle('show', l); R.classList.toggle('show', r);
    };
    let down = false, sx = 0, sl = 0, moved = false;
    nav.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' || e.button !== 0) return; down = true; moved = false; sx = e.clientX; sl = nav.scrollLeft; });
    window.addEventListener('pointermove', e => { if (!down) return; const dx = e.clientX - sx; if (Math.abs(dx) > 5) { moved = true; nav.classList.add('drag'); } if (moved) nav.scrollLeft = sl - dx; });
    window.addEventListener('pointerup', () => { down = false; nav.classList.remove('drag'); });
    nav.addEventListener('click', e => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
    nav.addEventListener('wheel', e => {
      if (nav.scrollWidth <= nav.clientWidth) return;
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      const max = nav.scrollWidth - nav.clientWidth;
      if ((d < 0 && nav.scrollLeft <= 0) || (d > 0 && nav.scrollLeft >= max)) return;
      nav.scrollLeft += d; e.preventDefault();
    }, { passive: false });
    L.addEventListener('click', () => nav.scrollBy({ left: -Math.max(160, nav.clientWidth * 0.6), behavior: 'smooth' }));
    R.addEventListener('click', () => nav.scrollBy({ left: Math.max(160, nav.clientWidth * 0.6), behavior: 'smooth' }));
    nav.addEventListener('scroll', edge, { passive: true });
    window.addEventListener('resize', () => { edge(); this.applyTopCollapsed(); });
    this._navEdge = edge; edge();
  };
  proto.scrollActiveTabIntoView = function () {
    const nav = $('main-nav'), b = nav && nav.querySelector('button.active'); if (!b) return;
    const left = b.offsetLeft - (nav.clientWidth - b.offsetWidth) / 2;
    if (nav.scrollTo) nav.scrollTo({ left: Math.max(0, left), behavior: 'smooth' }); else nav.scrollLeft = left;
  };
  const _tab = proto.switchTab;
  proto.switchTab = function () {
    const r = _tab.apply(this, arguments);
    try { this.scrollActiveTabIntoView(); } catch (e) {}
    return r;
  };

  const _render = proto.renderAll;
  proto.renderAll = function () {
    const r = _render.apply(this, arguments);
    if (this.state) { try { this.renderTopPanel(); this.setupNavScroll(); this.applyTopCollapsed(); if (this._navEdge) this._navEdge(); } catch (e) { /* панель не должна ломать игру */ } }
    return r;
  };

  /* Закрепление: при прокрутке шапка сжимается в одну строку и закрепляется вместе с вкладками.
     Место в потоке держит прокладка, поэтому страница не прыгает. */
  (function () {
    let expanded = 0, compact = false;
    const outer = () => $('sticky-top'), tb = () => $('topbar');
    const measure = () => { const o = outer(); if (o && !compact) expanded = o.offsetHeight; };
    const apply = on => {
      const o = outer(), t = tb(); if (!o || !t || compact === on) return;
      if (on) { measure(); o.style.minHeight = expanded + 'px'; o.classList.add('is-fixed'); t.classList.add('compact'); }
      else { o.classList.remove('is-fixed'); o.style.minHeight = ''; t.classList.remove('compact'); }
      compact = on;
    };
    const onScroll = () => {
      const y = window.scrollY || document.documentElement.scrollTop || 0, scr = $('screen-game');
      if (!outer() || (scr && scr.classList.contains('hidden'))) { apply(false); return; }
      if (!compact && y > 90) apply(true); else if (compact && y < 12) apply(false);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', () => { if (!compact) measure(); else { apply(false); onScroll(); } });
    document.addEventListener('DOMContentLoaded', measure);
  })();
})();

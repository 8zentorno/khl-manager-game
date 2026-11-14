/* KHL Manager 11.1 — цвета формы клубов (по формам сезона 2026/27).
   Дома клуб в цветной форме, в гостях в светлой (у Северстали жёлтой); клуб в гостях узнаётся по цветной кайме.
   Используется на табло, ленте матча, кружках голов, статистике матча, тикере, новостях, подготовке и плей-офф. */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  // id: [цвет домашней формы, кайма дома, кайма гостевой формы, гостевая форма (если не белая)]
  const KITS = {
    avangard: ['#1d1d22', '#e8512b', '#e8512b'], avtomobilist: ['#e03a32', '#ffffff', '#e03a32'], admiral: ['#1b1b1e', '#c8a45c', '#c8a45c'],
    akbars: ['#1f8a4a', '#ffffff', '#1f8a4a'], amur: ['#f08a1c', '#1b1b1e', '#f08a1c'], barys: ['#1f5fb4', '#8ec7f0', '#1f5fb4'],
    dinamo_mn: ['#1b1b20', '#7fc4ee', '#7fc4ee'], dinamo_msk: ['#1d3f9a', '#ffffff', '#1d3f9a'], lada: ['#1e3a82', '#ffffff', '#1e3a82'],
    lokomotiv: ['#d43030', '#1e3a82', '#d43030'], metallurg: ['#1b2c5c', '#f0a82a', '#f0a82a'], neftekhimik: ['#1b2a55', '#d8433a', '#d8433a'],
    salavat: ['#3fa74f', '#ffffff', '#3fa74f'], severstal: ['#1c1c20', '#f2c315', '#1c1c20', '#f2c315'], sibir: ['#7cc3ee', '#ffffff', '#7cc3ee'],
    ska: ['#2a5fd0', '#d8433a', '#2a5fd0'], sochi: ['#2c7f96', '#f2c315', '#2c7f96'], spartak: ['#e0352f', '#ffffff', '#e0352f'],
    torpedo: ['#2a49c0', '#ffffff', '#2a49c0'], traktor: ['#1c1c20', '#ffffff', '#1c1c20'], cska: ['#d93a2e', '#1e3a82', '#d93a2e'],
    shanghai: ['#1d2d5e', '#f08a1c', '#f08a1c']
  };
  const LIGHT = '#f4f6fa', NEUTRAL = ['#3a4658', '#93a3ba'];
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const lum = h => { const c = rgb(h); return .299 * c[0] + .587 * c[1] + .114 * c[2]; };
  const dist = (a, b) => { const x = rgb(a), y = rgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
  // n — цвет цифр и подписей: цвет клуба, который виден и на светлой, и на тёмной теме (у светлой формы это кайма, у чёрной цветная кайма)
  const usable = h => lum(h) >= 60 && lum(h) <= 225;
  const finish = (f, e) => ({ f, e, i: lum(f) > 150 ? '#16202f' : '#ffffff', t: lum(f) < 90 ? e : f, n: usable(f) ? f : usable(e) ? e : (Math.abs(lum(f) - 128) <= Math.abs(lum(e) - 128) ? f : e) });
  proto.kitFor = function (teamId, home) {
    const k = KITS[teamId]; if (!k) return finish(NEUTRAL[0], NEUTRAL[1]);
    return home ? finish(k[0], k[1]) : finish(k[3] || LIGHT, k[2]);
  };
  // форма обеих команд матча; если цвета слишком похожи, гость берёт чисто светлую форму
  proto.matchKits = function (m) {
    const h = this.kitFor(m.homeId, true); let a = this.kitFor(m.awayId, false);
    if (dist(h.f, a.f) < 90) a = finish(LIGHT, (KITS[m.awayId] || NEUTRAL)[2] || NEUTRAL[1]);
    return { h, a };
  };
  proto.kitStyle = k => `background:${k.f};border-color:${k.e}`;
  proto.kitDot = function (teamId, home, size) { const k = this.kitFor(teamId, home); return `<span class="kd${size ? ' ' + size : ''}" style="${this.kitStyle(k)}"></span>`; };
  // кружок формы команды в конкретном матче
  proto.kitDotFor = function (m, teamId, size) {
    if (!m) return this.kitDot(teamId, true, size);
    const K = this.matchKits(m), k = String(teamId) === String(m.homeId) ? K.h : K.a;
    return `<span class="kd${size ? ' ' + size : ''}" style="${this.kitStyle(k)}"></span>`;
  };
  proto.kitSetVars = function (K) {
    const s = document.documentElement && document.documentElement.style; if (!s || !s.setProperty) return;
    [['h', K.h], ['a', K.a]].forEach(([p, k]) => { s.setProperty(`--k${p}-f`, k.f); s.setProperty(`--k${p}-e`, k.e); s.setProperty(`--k${p}-i`, k.i); s.setProperty(`--k${p}-t`, k.t); s.setProperty(`--k${p}-n`, k.n); });
  };
  proto.kitCurrentMatch = function () {
    if (!this.state) return null;
    return this.liveMatch && this.liveMatch.matchId === this.currentMatchId ? this.liveMatch.simulatedMatch : this.state.matches.find(x => x.id === this.currentMatchId) || null;
  };

  proto.kitsDecorate = function () {
    const m = this.kitCurrentMatch(); if (!m) return;
    const K = this.matchKits(m); this.kitSetVars(K);
    const sb = document.getElementById('match-scoreboard'); if (!sb) return;
    const hero = sb.querySelector('.match-hero');
    if (hero) {
      const badges = hero.querySelectorAll('.club-badge');
      [[badges[0], K.h], [badges[1], K.a]].forEach(([b, k]) => { if (b && b.style) { b.style.background = k.f; b.style.color = k.i; b.style.boxShadow = `0 0 0 3px ${k.e}`; } });
    }
    sb.querySelectorAll('.period-table tbody tr').forEach((tr, i) => {
      const th = tr.querySelector('th'); if (!th || th.querySelector('.kd')) return;
      th.insertAdjacentHTML('afterbegin', `<span class="kd s" style="${this.kitStyle(i === 0 ? K.h : K.a)}"></span> `);
    });
    const log = document.getElementById('match-log');
    if (log && typeof this.mcVisibleEvents === 'function') {
      const events = this.mcVisibleEvents(m), rows = [...log.querySelectorAll(':scope > .event')];
      if (rows.length === events.length) rows.forEach((r, i) => {
        const e = events[i], tid = e && e.teamId; if (!tid || r.querySelector('.event-time .kd')) return;
        if (e.kind === 'final' || e.kind === 'intermission') return;
        const k = String(tid) === String(m.homeId) ? K.h : String(tid) === String(m.awayId) ? K.a : null; if (!k) return;
        const t = r.querySelector('.event-time'); if (t) t.insertAdjacentHTML('beforeend', `<span class="kd s" style="${this.kitStyle(k)}"></span>`);
      });
    }
  };
  const baseRender = proto.renderMatchCenter;
  proto.renderMatchCenter = function () {
    const r = baseRender.apply(this, arguments);
    try { this.kitsDecorate(); } catch (e) { console.warn('team_colors', e); }
    return r;
  };
})();
// значок клуба в сетке плей-офф: домашняя форма
KHLManagerApp.prototype.kitCrestStyle = function (id) { const k = this.kitFor(id, true); return `background:${k.f};color:${k.i};box-shadow:0 0 0 2px ${k.e}`; };

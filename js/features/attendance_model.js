/* KHL Manager 8.22 — посещаемость: интерес к клубу по домашним результатам, поправка на место гостя, рост спроса в плей-офф, вкладка «Арены». */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const AP = proto.ATTENDANCE_PARAMS = {
    start: 0.70, min: 0.45, max: 0.92, step: 0.006, streakLen: 5, streakBonus: 0.03,
    guestTop: 0.06, guestLow: -0.10, topRank: 3, zoneRank: 8, warmup: 6, noise: 0.06,
    playoff: { 1: [0.92, 0.95], 2: [0.94, 0.97], 3: [0.96, 0.98], 4: [0.98, 1.0] }, decisiveGame: 7
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const homeGames = (app, teamId, before) => (app.state?.matches || []).filter(m =>
    !m.playoff && m.played && !m.cancelled && m.homeId === teamId && m.homeScore != null && m.awayScore != null &&
    (!before || m.dateOffset < before.dateOffset || (m.dateOffset === before.dateOffset && m.id < before.id) && m.id !== before.id))
    .sort((a, b) => a.dateOffset - b.dateOffset || String(a.id).localeCompare(String(b.id)));

  // Интерес к клубу выводится из его домашних результатов: старые сохранения считаются по уже сыгранным матчам.
  proto.fanInterest = function (teamId, before) {
    const games = homeGames(this, teamId, before);
    let v = AP.start, streak = 0;
    games.forEach(m => {
      const win = m.homeScore > m.awayScore;
      v = clamp(v + (win ? AP.step : -AP.step), AP.min, AP.max);
      streak = win ? (streak > 0 ? streak + 1 : 1) : (streak < 0 ? streak - 1 : -1);
      if (Math.abs(streak) === AP.streakLen) v = clamp(v + (streak > 0 ? AP.streakBonus : -AP.streakBonus), AP.min, AP.max);
    });
    return { value: v, games: games.length, streak };
  };

  proto.calculateAttendance = function (match) {
    if (!match) return 0;
    if (match.attendance && match.arenaCapacity) return match.attendance;
    const arena = this.stadiumFor(match.homeId);
    let fill, mod;
    if (match.playoff) {
      const range = AP.playoff[match.playoffStage] || AP.playoff[1];
      const decisive = Number(match.gameNo) >= AP.decisiveGame;
      fill = decisive ? 1 : range[0] + Math.random() * (range[1] - range[0]);
      mod = decisive ? 'decisive' : 'playoff';
    } else {
      const info = this.fanInterest(match.homeId, match), rank = this.conferenceRank(match.awayId);
      fill = info.value;
      if (info.games < AP.warmup) mod = 'early';
      else if (rank <= AP.topRank) { fill += AP.guestTop; mod = 'top'; }
      else if (rank > AP.zoneRank) { fill += AP.guestLow; mod = 'low'; }
      else mod = 'norm';
      fill += (Math.random() - 0.5) * AP.noise;
      fill = clamp(fill, 0.3, 0.99);
    }
    match.attendance = Math.min(arena.capacity, Math.round(arena.capacity * fill / 10) * 10);
    match.attendancePercent = Math.round(match.attendance / arena.capacity * 100);
    match.attendanceAwayRank = this.conferenceRank(match.awayId);
    match.attendanceMod = mod;
    match.arenaName = arena.name; match.arenaCapacity = arena.capacity;
    if (match.playoff) match.playoffAttendance = true;
    return match.attendance;
  };

  proto.attendanceExplanation = function (match) {
    const mod = match?.attendanceMod, rank = match?.attendanceAwayRank || this.conferenceRank(match?.awayId);
    if (mod === 'decisive') return 'Решающий матч серии: аншлаг';
    if (match?.playoff) return 'Плей-офф: повышенный спрос на каждый матч';
    if (mod === 'early') return 'Начало сезона: интерес зависит от результатов клуба';
    if (mod === 'top') return `Гость на ${rank}-м месте — повышенный интерес`;
    if (mod === 'low') return `Гость на ${rank}-м месте, ниже зоны плей-офф — пониженный интерес`;
    if (mod === 'norm') return `Гость на ${rank}-м месте — обычный интерес`;
    return rank <= 7 ? `Гость на ${rank}-м месте в конференции — повышенный интерес` : `Гость на ${rank}-м месте в конференции — пониженный интерес`;
  };

  /* ---------- статистика арены ---------- */
  const avgOf = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null;
  proto.arenaStats = function (teamId) {
    const arena = this.stadiumFor(teamId), all = (this.state?.matches || []).filter(m => m.homeId === teamId && m.played && !m.cancelled && m.attendance)
      .sort((a, b) => a.dateOffset - b.dateOffset || String(a.id).localeCompare(String(b.id)));
    const reg = all.filter(m => !m.playoff).map(m => m.attendance), po = all.filter(m => m.playoff).map(m => m.attendance);
    const avg = avgOf(reg);
    let tr = null;
    if (reg.length >= 6) { const last = avgOf(reg.slice(-5)), prev = avgOf(reg.slice(-10, -5)); if (prev) tr = Math.round((last - prev) / prev * 100); }
    return { cap: arena.capacity, arena, n: reg.length, avg, pct: avg == null ? null : Math.round(avg / arena.capacity * 100), tr,
      max: reg.length ? Math.max(...reg) : null, min: reg.length ? Math.min(...reg) : null, last: reg.length ? reg[reg.length - 1] : null,
      hist: reg, po: { n: po.length, avg: avgOf(po) } };
  };

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  const fmt = n => n == null ? '—' : Number(n).toLocaleString('ru-RU');
  const SORTS = [['conf', 'По конференции'], ['avg', 'По средней'], ['pct', 'По заполняемости'], ['cap', 'По вместимости']];

  function spark(h, cap) {
    const d = h.slice(-10); if (d.length < 2) return '';
    const w = 240, hh = 30, pts = d.map((v, i) => [(i / (d.length - 1) * w).toFixed(1), (hh - 3 - (v / cap) * (hh - 6)).toFixed(1)]);
    return `<svg class="ar-spark" viewBox="0 0 ${w} ${hh}" preserveAspectRatio="none" aria-hidden="true"><polyline fill="none" stroke="var(--cyan)" stroke-width="2" points="${pts.map(p => p.join(',')).join(' ')}"/></svg>`;
  }

  proto.renderStadiums = function () {
    const root = document.getElementById('stadium-list');
    if (!root || !this.db.teams.length) return;
    const esc = s => this.escape(s), me = this.state?.teamId;
    let tools = document.getElementById('stadium-tools');
    if (!tools) {
      tools = document.createElement('div'); tools.id = 'stadium-tools'; tools.className = 'ar-tools';
      root.insertAdjacentElement('beforebegin', tools);
      tools.addEventListener('click', ev => { const b = ev.target.closest('[data-arsort]'); if (b) { store.set('khl.arenaSort', b.dataset.arsort); this.renderStadiums(); } });
    }
    const sort = store.get('khl.arenaSort', 'conf');
    const rows = this.db.teams.map(t => ({ t, s: this.arenaStats(t.id) }));
    const withData = rows.filter(r => r.s.avg != null);
    const league = avgOf(withData.map(r => r.s.avg));
    const full = [...withData].sort((a, b) => b.s.pct - a.s.pct)[0], empty = [...withData].sort((a, b) => a.s.pct - b.s.pct)[0];
    const mine = rows.find(r => r.t.id === me);
    const kpi = (l, v, s) => `<div class="ar-kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
    tools.innerHTML = `<div class="ar-top">${kpi('Средняя по лиге', fmt(league), 'зрителей на матч')}${kpi('Самая полная', full ? full.s.pct + '%' : '—', full ? esc(full.t.name) : 'нет данных')}` +
      `${kpi('Самая пустая', empty ? empty.s.pct + '%' : '—', empty ? esc(empty.t.name) : 'нет данных')}${kpi('Твой клуб', fmt(mine?.s.avg), mine?.s.avg != null ? `${mine.s.pct}% заполнения · ${mine.s.n} дом. матчей` : 'домашних матчей ещё нет')}</div>` +
      `<div class="ar-sort"><span>Сортировка</span>${SORTS.map(([k, l]) => `<button type="button" class="btn btn-quiet" data-arsort="${k}" aria-pressed="${k === sort}">${l}</button>`).join('')}</div>`;
    const key = { conf: (a, b) => a.t.conf.localeCompare(b.t.conf) || this.conferenceRank(a.t.id) - this.conferenceRank(b.t.id), avg: (a, b) => (b.s.avg || 0) - (a.s.avg || 0), pct: (a, b) => (b.s.pct || 0) - (a.s.pct || 0), cap: (a, b) => b.s.cap - a.s.cap }[sort] || null;
    if (key) rows.sort(key);
    root.innerHTML = rows.map(({ t, s }) => {
      const trHtml = s.tr == null ? '<span class="ar-tr fl">—</span>' : s.tr > 0 ? `<span class="ar-tr up">▲ +${s.tr}%</span>` : s.tr < 0 ? `<span class="ar-tr dn">▼ ${s.tr}%</span>` : '<span class="ar-tr fl">= 0%</span>';
      return `<article class="card stadium-card ar-card${t.id === me ? ' me' : ''}"><div class="eyebrow">${t.conf === 'West' ? 'Западная конференция' : 'Восточная конференция'} · ${this.conferenceRank(t.id)}-е место</div>` +
        `<h3><span class="nm" data-cl="${esc(t.id)}">${esc(t.name)}</span>${t.id === me ? ' <span class="ar-me">твой клуб</span>' : ''}</h3><div class="stadium-meta"><span>📍 ${esc(s.arena.city)}</span><span>🏟️ ${esc(s.arena.name)}</span></div>` +
        `${this.crowdArt(t.id, s.pct == null ? 0 : s.pct / 100)}<div class="ar-avgrow"><div><div class="eyebrow">Средняя посещаемость</div><div class="ar-avg">${fmt(s.avg)}</div></div><div class="ar-r"><b>${s.pct == null ? '—' : s.pct + '%'}</b><div>${trHtml}</div></div></div>` +
        `${spark(s.hist, s.cap)}<div class="ar-rows"><div><span>Вместимость</span><b>${fmt(s.cap)}</b></div><div><span>Домашних матчей</span><b>${s.n}</b></div><div><span>Последний матч</span><b>${fmt(s.last)}</b></div>` +
        `<div><span>Лучший / худший</span><b>${s.n ? fmt(s.max) + ' / ' + fmt(s.min) : '—'}</b></div>${s.po.n ? `<div><span>Плей-офф, средняя (${s.po.n})</span><b>${fmt(s.po.avg)}</b></div>` : ''}</div></article>`;
    }).join('');
  };
})();

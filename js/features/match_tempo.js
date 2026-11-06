/* KHL Manager 8.17 — Матч-центр: темп просмотра, счётчик бросков, «Итоги тура», окно «Статистика матча» по центру. */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  /* ---------- темп просмотра ---------- */
  proto.mcSpeed = function () { return store.get('khl.mcSpeed', '1') === '3' ? 3 : 1; };
  proto.mcManualSO = function () { return store.get('khl.mcManualSO', '0') === '1'; };
  const goalCount = live => (live.simulatedMatch.events || []).reduce((n, e) => n + (e.kind === 'goal' ? 1 : 0), 0);
  const waiting = live => !!live.pendingShootoutPick && !live.autoResolveShootouts;

  proto.advanceLiveBatch = function (live) {
    if (live.paused && !live.runMode) return false;
    const mode = live.runMode;
    if (mode) {
      const goals0 = goalCount(live);
      const boundary = mode === 'period' && live.visibleMinute < 60 ? [20, 40, 60].find(b => b > live.visibleMinute) : null;
      let fin = false, guard = 0, atBoundary = false;
      while (guard++ < 120) {
        if (waiting(live)) break;
        fin = this.advanceLiveMatch(live);
        if (fin) break;
        if (mode === 'goal' && goalCount(live) > goals0) break;
        if (mode === 'period') {
          if (boundary && live.visibleMinute >= boundary) { atBoundary = true; break; }
          if (!boundary && live.inShootout) break; // овертайм закончился ничьей: дальше буллиты
        }
      }
      if (!fin) {
        live.runMode = null; live.forceUiRender = true;
        live.paused = !!atBoundary; // после периода матч встаёт на паузу
      }
      return fin;
    }
    let fin = false;
    const steps = this.mcSpeed() === 3 ? 3 : 1; // ×3: три минуты за шаг
    for (let i = 0; i < steps && !fin; i++) { if (waiting(live)) break; fin = this.advanceLiveMatch(live); }
    return fin;
  };

  proto.startLiveTicker = function () {
    if (this.liveTimer) clearInterval(this.liveTimer);
    if (!this.liveMatch) return;
    const tick = () => {
      const live = this.liveMatch;
      if (!live || !this.state?.matches.some(x => x.id === live.matchId)) { clearInterval(this.liveTimer); this.liveTimer = null; return; }
      let finished = false;
      try { finished = this.advanceLiveBatch(live); }
      catch (error) {
        console.error('KHL Manager live-match tick failed:', error);
        clearInterval(this.liveTimer); this.liveTimer = null;
        live.runtimeError = String(error?.message || error || 'unknown error');
        this.setNotice(`Симуляция временно остановлена из-за внутренней ошибки: ${live.runtimeError}. Нажми «Быстрый итог» или перезапусти матч после исправления.`);
        this.renderMatchCenter(); return;
      }
      const now = Date.now();
      const matchVisible = document.visibilityState !== 'hidden' && document.getElementById('view-match')?.classList.contains('active');
      const waitingPick = waiting(live);
      const pickerKey = waitingPick ? `${live.pendingShootoutPick.teamId}|${live.pendingShootoutPick.attemptNumber}|${(live.pendingShootoutPick.candidateIds || []).join(',')}` : '';
      const pickerNeedsRender = waitingPick && live.renderedShootoutPickerKey !== pickerKey;
      const forceRender = !!live.forceUiRender;
      if (matchVisible && (finished || forceRender || pickerNeedsRender || (!waitingPick && !live.paused))) {
        live.lastUiRenderAt = now; this.renderMatchCenter();
        if (waitingPick) live.renderedShootoutPickerKey = pickerKey;
        live.forceUiRender = false;
      }
      if (!waitingPick) live.renderedShootoutPickerKey = null;
      if (finished) { clearInterval(this.liveTimer); this.liveTimer = null; this.completeLiveMatch(live); }
    };
    this._mcTick = tick;
    this.liveTimer = setInterval(tick, 1200);
  };

  // «Быстрый итог»: по умолчанию буллиты решаются автоматически; можно выбирать бьющих вручную
  proto.revealFullMatch = function () {
    if (this.liveTimer) clearInterval(this.liveTimer);
    this.liveTimer = null;
    const live = this.liveMatch;
    if (!live) return;
    live.quick = true; this._tkQuickId = live.matchId;   // строка событий не проигрывает накопленное
    const manual = this.mcManualSO();
    live.autoResolveShootouts = !manual;
    if (!manual) live.pendingShootoutPick = null;
    live.runMode = null;
    let guard = 0;
    try {
      while (!live.finished && guard++ < 1200) {
        if (waiting(live)) break;
        const bm = Number(live.visibleMinute) || 0, be = live.simulatedMatch?.events?.length || 0;
        const finished = this.advanceLiveMatch(live);
        if (finished || live.finished) break;
        if (waiting(live)) break;
        const am = Number(live.visibleMinute) || 0, ae = live.simulatedMatch?.events?.length || 0;
        if (am <= bm && ae <= be) throw new Error('симуляция не продвинулась к следующему игровому событию');
      }
      if (waiting(live)) { live.forceUiRender = true; this.renderMatchCenter(); this.startLiveTicker(); return; }
      if (!live.finished) throw new Error('достигнут защитный предел быстрого итога');
      this.completeLiveMatch(live);
    } catch (error) {
      console.error('KHL Manager quick result failed:', error);
      this.setNotice(`Быстрый итог остановлен: ${String(error?.message || error)}. Матч сохранён до последнего обработанного события.`);
      this.renderMatchCenter();
      if (this.liveMatch && !this.liveMatch.finished) this.startLiveTicker();
    }
  };

  /* ---------- место в конференции до матча ---------- */
  const baseStart = proto.saveLineupAndStart;
  proto.saveLineupAndStart = function () {
    let before = null, mid = null;
    try {
      if (this.state && !(this.liveMatch && !this.liveMatch.finished)) {
        const m = this.state.matches.find(x => x.id === (this.pendingMatchId || this.currentMatchId));
        if (m && !m.played) { mid = m.id; before = { rank: this.conferenceRank(this.state.teamId), pts: this.state.standings[this.state.teamId]?.pts || 0 }; }
      }
    } catch (e) { before = null; }
    const r = baseStart.apply(this, arguments);
    try {
      if (before && this.liveMatch && this.liveMatch.matchId === mid) {
        const m = this.state.matches.find(x => x.id === mid); if (m) m.tourBefore = before;
      }
    } catch (e) {}
    return r;
  };

  /* ---------- итоги тура ---------- */
  const pl = (app, id) => app.db.players.find(p => String(p.id) === String(id));
  const POS_RU = { LW: 'ЛН', C: 'Ц', RW: 'ПН', D: 'З', F: 'Н', G: 'В' };
  const posChip = p => (p && POS_RU[p.pos]) ? `<span class="mc-pos">${POS_RU[p.pos]}</span> ` : '';
  const surname = p => p ? String(p.name || '').split(' ').slice(-1)[0] : '';
  proto.mcThreeStars = function (m) {
    const score = new Map(), line = new Map();
    const add = (p, v, key, n = 1) => {
      if (!p) return; score.set(p.id, (score.get(p.id) || 0) + v);
      const r = line.get(p.id) || { p, g: 0, a: 0 }; r[key] += n; line.set(p.id, r);
    };
    (m.events || []).forEach(e => {
      if (e.kind !== 'goal') return;
      add(pl(this, e.scorerId), 3, 'g'); add(pl(this, e.assist1Id), 1.5, 'a'); add(pl(this, e.assist2Id), 1, 'a');
    });
    const out = [...line.values()].map(r => ({ id: r.p.id, score: score.get(r.p.id), text: `${surname(r.p)} ${r.g}+${r.a}` }));
    for (const home of [true, false]) {
      const tid = home ? m.homeId : m.awayId, against = home ? m.awayShots : m.homeShots, ga = home ? m.awayScore : m.homeScore;
      const gid = home ? m.goalieHomeId : m.goalieAwayId;
      const g = (gid != null && pl(this, gid)) || this.activeSkaters(tid).goalie;
      if (!g || !against) continue;
      const goalsAgainst = (m.events || []).filter(e => e.kind === 'goal' && e.teamId !== tid).length;
      const saves = Math.max(0, against - goalsAgainst);
      const win = (home ? m.homeScore > m.awayScore : m.awayScore > m.homeScore) ? 1 : 0;
      const sc = saves * 0.16 + (goalsAgainst === 0 ? 3 : 0) + win - goalsAgainst * 0.9 + (saves >= 25 ? 1 : 0);
      if (sc >= 3.5) out.push({ id: g.id, score: sc, text: `${surname(g)} ${saves} ${saves % 10 === 1 && saves % 100 !== 11 ? 'сейв' : (saves % 10 >= 2 && saves % 10 <= 4 && (saves % 100 < 10 || saves % 100 >= 20)) ? 'сейва' : 'сейвов'}` });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, 3);
  };

  proto.renderTourSummary = function (m) {
    const root = document.getElementById('mc-tour');
    if (!root) return;
    const live = !!(this.liveMatch && this.liveMatch.matchId === m?.id && !this.liveMatch.finished);
    const mine = m && (m.homeId === this.state.teamId || m.awayId === this.state.teamId);
    if (!m || !m.played || live || !mine) { root.classList.add('hidden'); root.innerHTML = ''; return; }
    const esc = s => this.escape(s);
    const day = this.state.matches.filter(x => x.played && !x.cancelled && x.dateOffset === m.dateOffset)
      .sort((a, b) => (b.id === m.id) - (a.id === m.id));
    const sfx = x => x.so ? ' Б' : x.ot ? ' ОТ' : '';
    const rows = day.map(x => {
      const h = this.teamById(x.homeId), a = this.teamById(x.awayId);
      return `<div class="mct-row${x.id === m.id ? ' me' : ''}"><span class="l">${esc(h?.name)}</span><span class="m">${x.homeScore} : ${x.awayScore}${sfx(x)}</span><span>${esc(a?.name)}</span></div>`;
    }).join('');
    const nWord = (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'матч' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? 'матча' : 'матчей'}`;
    let open = false; try { open = localStorage.getItem('khl.mctOpen') === '1'; } catch (e) {}
    const me = this.teamById(this.state.teamId), oppId = m.homeId === this.state.teamId ? m.awayId : m.homeId, opp = this.teamById(oppId);
    const minis = []; let confLine = '';
    if (!m.playoff) {
      const rank = this.conferenceRank(this.state.teamId), pts = this.state.standings[this.state.teamId]?.pts || 0, b = m.tourBefore;
      let mv = '';
      if (b && b.rank !== rank) mv = ` <span class="${rank < b.rank ? 'up' : 'dn'}">${rank < b.rank ? '▲ +' : '▼ −'}${Math.abs(rank - b.rank)}</span>`;
      const oRank = this.conferenceRank(oppId), oPts = this.state.standings[oppId]?.pts || 0;
      const oConf = opp && me && opp.conf !== me.conf ? ` <small class="muted">${esc({ West: 'Запад', East: 'Восток' }[opp.conf] || opp.conf)}</small>` : '';
      confLine = `<div class="mct-mini mct-conf"><b>Таблица конференции</b><span class="mct-me">${esc(me?.name || '')}</span>: ${rank}-е место, ${pts} очк.${mv}<br><span class="mct-opp">${esc(opp?.name || '')}</span>: ${oRank}-е место, ${oPts} очк.${oConf}</div>`;
    }
    const stars = this.mcThreeStars(m);
    if (stars.length) minis.push(`<div class="mct-mini"><b>Три звезды</b>${stars.map((s, i) => { const p = pl(this, s.id), t = p && this.teamById(p.teamId); return `${i + 1}. ${posChip(p)}<span class="nm"${p ? ` data-pl="${esc(p.id)}"` : ''}>${esc(s.text)}</span>${t ? ` <small class="muted">${esc(t.name)}</small>` : ''}`; }).join('<br>')}</div>`);
    const seen = new Set(), all = [...(m.injuries || []), ...(m.events || []).filter(e => e.kind === 'injury').map(e => ({ playerId: e.playerId, teamId: e.teamId, severity: e.severity }))]
      .filter(i => i && i.playerId && !seen.has(i.playerId) && seen.add(i.playerId));
    const sev = v => v === 'severe' ? 'тяжёлая' : v === 'medium' ? 'средняя' : 'лёгкая';
    const injLine = tid => {
      const t = this.teamById(tid), list = all.filter(i => i.teamId === tid).map(i => { const p = pl(this, i.playerId); return p ? `${posChip(p)}<span class="nm" data-pl="${esc(p.id)}">${esc(surname(p))}</span>, ${sev(i.severity)}` : ''; }).filter(Boolean);
      return `${esc(t?.name || '')}: ${list.length ? list.join('; ') : 'нет'}`;
    };
    minis.push(`<div class="mct-mini"><b>Травмы в матче</b>${injLine(m.homeId)}<br>${injLine(m.awayId)}</div>`);
    root.innerHTML = `${confLine}<div class="mct-grid">${minis.join('')}</div>`;
    root.classList.remove('hidden');
  };

  /* ---------- статистика матча по центру ---------- */
  proto.renderMatchStatistics = function (match) {
    const panel = document.getElementById('match-statistics');
    if (!panel) return;
    const live = this.liveMatch && this.liveMatch.matchId === match?.id && !this.liveMatch.finished ? this.liveMatch : null;
    if (!match || (!match.played && !live)) { panel.classList.add('hidden'); panel.innerHTML = ''; return; }
    let src = match, stats;
    if (live) {
      // живой матч: значения из счётчиков движка, обновляются вместе с лентой
      src = live.simulatedMatch;
      const per0 = (live.visibleMinute > 60 || src.ot) ? 4 : 3, c = live.cnt;
      const z = () => zeros(4);
      const side = k => {
        const mk = key => { const a = ((c && c[k][key]) || z()).slice(0, per0); return { total: a.reduce((x, y) => x + y, 0), periods: a }; };
        return { shots: mk('shots'), faceoffs: mk('faceoffs'), blocks: mk('blocks'), hits: mk('hits'), penalties: { total: 0, periods: zeros(per0) } };
      };
      src.matchStats = { home: side('h'), away: side('a'), periodCount: per0, penaltyStatsVersion: 3 };
      stats = this.ensureMatchStats(src);
    } else {
      const hadSaved = !!match.matchStats, prev = Number(match.matchStats?.penaltyStatsVersion) || 0;
      stats = this.ensureMatchStats(match);
      if (!hadSaved || prev !== 3) this.persistQuietly();
    }
    const home = this.teamById(match.homeId), away = this.teamById(match.awayId);
    const per = stats.periodCount, esc = s => this.escape(s);
    // голы в большинстве по периодам из событий
    const pp = { h: zeros(per), a: zeros(per) };
    (src.events || []).forEach(e => {
      if (e.kind !== 'goal' || !e.powerPlay) return;
      const i = e.period === 'ОТ' ? Math.min(3, per - 1) : Math.max(0, Math.min(2, (parseInt(e.period, 10) || 1) - 1));
      pp[e.teamId === match.homeId ? 'h' : 'a'][i]++;
    });
    const sum = a => a.reduce((x, y) => x + y, 0);
    const cats = [
      ['Броски в створ', stats.home.shots, stats.away.shots, false],
      ['Блокированные броски', stats.home.blocks, stats.away.blocks, false],
      ['Вбрасывания выиграно', stats.home.faceoffs, stats.away.faceoffs, false],
      ['Силовые приёмы', stats.home.hits, stats.away.hits, false],
      ['Штраф, мин.', stats.home.penalties, stats.away.penalties, true],
      ['Голы в большинстве', { total: sum(pp.h), periods: pp.h }, { total: sum(pp.a), periods: pp.a }, false]
    ];
    const prev = panel._prev && panel._prev.id === match.id ? panel._prev.v : null, now = {};
    const vmin = this._mcViewNow != null ? this._mcViewNow : (live ? live.visibleMinute : null);
    const curP = vmin != null ? Math.min(per - 1, Math.max(0, Math.floor((Math.max(1, vmin || 1) - 1) / 20))) : -1;
    const perHtml = arr => arr.map((x, i) => `<em${i === curP ? ' class="cur"' : ''}>${x}</em>`).join('');
    const rows = cats.map(([label, h, a, lowBetter], idx) => {
      const t = h.total + a.total, hw = t ? 100 * h.total / t : 50;
      const hl = h.total !== a.total && (lowBetter ? h.total < a.total : h.total > a.total), al = h.total !== a.total && (lowBetter ? a.total < h.total : a.total > h.total);
      now[idx] = [h.total, a.total];
      const fh = prev && prev[idx] && prev[idx][0] !== h.total ? ' flash' : '', fa = prev && prev[idx] && prev[idx][1] !== a.total ? ' flash' : '';
      return `<div class="mst-row${idx >= 3 ? ' mst-x' : ''}"><div class="mst-n h${hl ? ' lead' : ''}${fh}">${h.total}</div><div class="mst-c"><div class="mst-name">${label}</div>` +
        `<div class="mst-bar" role="img" aria-label="${esc(home?.name)} ${h.total}, ${esc(away?.name)} ${a.total}"><i class="h" style="width:${hw}%"></i><i class="a" style="width:${100 - hw}%"></i></div>` +
        `<div class="mst-per"><span>${perHtml(h.periods)}</span><span>${perHtml(a.periods)}</span></div></div><div class="mst-n a${al ? ' lead' : ''}${fa}">${a.total}</div></div>`;
    }).join('');
    panel._prev = { id: match.id, v: now };
    const labels = per === 4 ? '1П · 2П · 3П · ОТ' : '1П · 2П · 3П';
    const ds = panel.dataset || (panel.dataset = {}), open = ds.open === '1';
    if (panel.classList.toggle) panel.classList.toggle('mst-compact', !open);
    panel.innerHTML = `<h3 class="mst-title">📊 Статистика матча</h3>` +
      `<div class="mst-vs"><span class="mst-pill h">${esc(home?.name || 'Хозяева')}</span><span class="mst-mid">${this._mcViewNow != null ? 'на ' + this._mcViewNow + '-й минуте' : live ? 'сейчас' : ''}</span><span class="mst-pill a">${esc(away?.name || 'Гости')}</span></div>${rows}` +
      `<button type="button" class="mst-more" data-mst="more">${open ? 'Свернуть' : 'Показать все показатели'}</button>`;
    if (!panel._bound) { panel._bound = true; panel.addEventListener('click', ev => { if (!ev.target.closest('[data-mst]')) return; panel.dataset.open = panel.dataset.open === '1' ? '0' : '1'; panel.classList.toggle('mst-compact', panel.dataset.open !== '1'); const b = panel.querySelector('.mst-more'); if (b) b.textContent = panel.dataset.open === '1' ? 'Свернуть' : 'Показать все показатели'; }); }
    panel.classList.remove('hidden');
  };
  const zeros = n => Array(n).fill(0);

  /* ---------- панель темпа, счётчик бросков, итоги тура ---------- */
  function ensureDom(app) {
    const sb = document.getElementById('match-scoreboard');
    if (!sb) return;
    if (!document.getElementById('mc-tempo')) {
      const t = document.createElement('div'); t.id = 'mc-tempo'; t.className = 'mct-bar hidden';
      t.innerHTML = '<div class="mct-btns"><button type="button" data-sp="1">×1</button><button type="button" data-sp="3">×3</button>' +
        '<button type="button" data-act="pause" class="mct-pause">❚❚ Пауза</button>' +
        '<button type="button" data-run="goal">До гола</button><button type="button" data-run="period">До конца 1-го периода</button>' +
        '</div>' +
        '<label class="mct-chk"><input type="checkbox" id="mct-manual"> Буллиты выбирать вручную</label>';
      sb.insertAdjacentElement('beforebegin', t);
      t.addEventListener('click', ev => {
        const b = ev.target.closest('button'); if (!b) return;
        const live = app.liveMatch; if (!live || live.finished) return;
        if (b.disabled) return;
        if (b.dataset.sp) { store.set('khl.mcSpeed', b.dataset.sp); live.runMode = null; live.paused = false; }
        else if (b.dataset.act === 'pause') { live.paused = !live.paused; live.runMode = null; live.forceUiRender = true; }
        else if (b.dataset.run) {
          live.runMode = b.dataset.run; live.paused = false;
          if (app._mcTick && app.liveTimer) app._mcTick(); // перемотка начинается сразу, без ожидания шага
        }
        app.mcRefreshTempo();
      });
      t.querySelector('#mct-manual').addEventListener('change', ev => { store.set('khl.mcManualSO', ev.target.checked ? '1' : '0'); });
    }
    const oldShots = document.getElementById('mc-shots'); if (oldShots) oldShots.remove();
    const log = document.getElementById('match-log'), panel = document.getElementById('match-statistics');
    if (!document.getElementById('mc-tour') && log) {
      const d = document.createElement('div'); d.id = 'mc-tour'; d.className = 'mct-tour card hidden'; log.insertAdjacentElement('afterend', d);
      d.addEventListener('click', ev => {
        if (!ev.target.closest('[data-mct="toggle"]')) return;
        const list = d.querySelector('.mct-list'), btn = d.querySelector('[data-mct="toggle"]'); if (!list || !btn) return;
        const open = list.classList.toggle('hidden') === false;
        btn.setAttribute('aria-expanded', open); const sp = btn.lastElementChild; if (sp) sp.textContent = sp.textContent.replace(/[▴▾]/, open ? '▴' : '▾');
        try { localStorage.setItem('khl.mctOpen', open ? '1' : '0'); } catch (e) {}
      });
    }
    // «Статистика матча» стоит над заголовком «Ход матча»
    if (panel && log && !panel.dataset.moved) {
      const heads = [...log.parentElement.querySelectorAll(':scope > .section-head')];
      const head = heads[heads.length - 1];
      if (head) { head.insertAdjacentElement('beforebegin', panel); panel.dataset.moved = '1'; }
    }
  }
  proto.mcRefreshTempo = function () {
    const t = document.getElementById('mc-tempo'); if (!t) return;
    const live = this.liveMatch, on = !!(live && !live.finished && live.matchId === this.currentMatchId);
    t.classList.toggle('hidden', !on);
    if (!on) return;
    const sp = this.mcSpeed();
    const paused = !!live.paused;
    t.querySelectorAll('[data-sp]').forEach(b => b.setAttribute('aria-pressed', String(!paused && Number(b.dataset.sp) === sp)));
    const pb = t.querySelector('[data-act="pause"]');
    if (pb) { pb.textContent = paused ? '▶ Продолжить' : '❚❚ Пауза'; pb.setAttribute('aria-pressed', String(paused)); }
    const vm = live.visibleMinute || 0, pr = t.querySelector('[data-run="period"]');
    if (pr) {
      pr.textContent = vm < 20 ? 'До конца 1-го периода' : vm < 40 ? 'До конца 2-го периода' : vm < 60 ? 'До конца 3-го периода' : 'До конца овертайма';
      pr.disabled = !!live.inShootout;
    }
    const gb = t.querySelector('[data-run="goal"]'); if (gb) gb.disabled = !!live.inShootout;
    const c = t.querySelector('#mct-manual'); if (c) c.checked = this.mcManualSO();
  };
  const baseRender = proto.renderMatchCenter;
  proto.renderMatchCenter = function () {
    baseRender.apply(this, arguments);
    try {
      if (!this.state) return;
      ensureDom(this);
      const m = this.liveMatch && this.liveMatch.matchId === this.currentMatchId ? this.liveMatch.simulatedMatch : this.state.matches.find(x => x.id === this.currentMatchId);
      this.mcRefreshTempo();
      const done = this.state.matches.find(x => x.id === this.currentMatchId);
      this.renderTourSummary(done || m);
    } catch (e) { console.error('match tempo ui failed', e); }
  };
})();

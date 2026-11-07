/* KHL Manager 8.19/8.20 — Матч-центр: шкала «Минута матча» с ползунком, просмотр матча на выбранную минуту, авторы голов с номерами и позициями. */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const POS = { LW: 'ЛН', C: 'Ц', RW: 'ПН', D: 'З', F: 'Н', G: 'В' };
  const posLabel = p => POS[p?.pos] || '';

  /* ---------- номера и позиции ---------- */
  proto.goalNoHtml = function (p) {
    if (!p) return '';
    const pos = posLabel(p);
    return (p.number ? `<span class="goal-no">№${p.number}</span> ` : '') + (pos ? `<span class="mc-pos">${pos}</span> ` : '');
  };
  proto.goalAssistText = function (a1, a2) {
    const sn = p => `${p.number ? '№' + p.number + ' ' : ''}${String(p.name).trim().split(/\s+/).slice(-1)[0]}${this.kaText ? this.kaText(p) : ''}`;
    const list = [a1, a2].filter(Boolean).map(sn);
    return list.length ? list.join(', ') : 'без передач';
  };
  // то же, что goalAssistText, но фамилии ассистентов кликабельны (14.1)
  proto.goalAssistHtml = function (a1, a2) {
    const esc = s => this.escape(String(s));
    const sn = p => `${p.number ? '№' + p.number + ' ' : ''}<span class="nm" data-pl="${esc(p.id)}">${esc(String(p.name).trim().split(/\s+/).slice(-1)[0])}</span>${this.kaText ? esc(this.kaText(p)) : ''}`;
    const list = [a1, a2].filter(Boolean).map(sn);
    return list.length ? list.join(', ') : 'без передач';
  };
  const goalTag = e => e.emptyNet ? 'в пустые ворота' : e.powerPlay ? 'большинство' : (e.shortHanded || e.text === 'Гол в меньшинстве') ? 'меньшинство' : e.penaltyShot ? 'штрафной бросок' : '';

  function rebuildGoalLists(app, m) {
    const hero = document.querySelector('#match-scoreboard .match-hero');
    if (!hero || hero.children.length < 3) return;
    const goals = app.mcGoals(m), esc = s => app.escape(s);
    const pl = id => app.db.players.find(p => p.id === id);
    [[0, true], [2, false]].forEach(([i, home]) => {
      const col = hero.children[i];
      col.querySelector('.mc-goals')?.remove();
      const html = goals.filter(g => g.home === home).map(g => {
        const e = g.e, sc = pl(e.scorerId), tag = goalTag(e);
        return `<li data-goal="${g.n}"><span class="t">${esc(e.period)} · ${esc(e.time)}</span>` +
          `<span class="gl">${sc?.number ? `<span class="mc-num">${sc.number}</span>` : ''}${posLabel(sc) ? `<span class="mc-pos">${posLabel(sc)}</span>` : ''}<b${sc ? ` data-pl="${esc(sc.id)}"` : ''}>${esc(sc?.name || 'Автор не указан')}</b>${sc && app.kaBadge ? app.kaBadge(sc) : ''}${tag ? `<span class="mc-tag">${tag}</span>` : ''}</span>` +
          `<span class="mc-as">передачи: ${app.goalAssistHtml(pl(e.assist1Id), pl(e.assist2Id))}</span></li>`;
      }).join('');
      if (html) col.insertAdjacentHTML('beforeend', `<ul class="mc-goals v2">${html}</ul>`);
    });
    hero.querySelectorAll('.mc-goals li').forEach(li => li.addEventListener('click', () => app.mcSelectGoal(Number(li.dataset.goal))));
    app.mcMarkSelection?.();
  }

  /* ---------- поминутная запись статистики (для ползунка) ---------- */
  // statTl: по 8 символов (base36) на каждую минуту — прирост бросков, блоков, силовых и вбрасываний: хозяева, гости.
  const CATS = ['shots', 'blocks', 'hits', 'faceoffs'];
  const sumCnt = c => { const t = []; CATS.forEach(k => { t.push(c.h[k].reduce((x, y) => x + y, 0), c.a[k].reduce((x, y) => x + y, 0)); }); return t; };
  const baseAdvance = proto.advanceLiveMatch;
  proto.advanceLiveMatch = function (live) {
    const r = baseAdvance.apply(this, arguments);
    try {
      const sim = live && live.simulatedMatch;
      if (sim && live.cnt) {
        const mi = Math.floor(live.visibleMinute || 0), done = live._tlMin || 0;
        if (mi > done) {
          const tot = sumCnt(live.cnt), prev = live._tlTot || tot.map(() => 0);
          let add = '';
          for (let i = done + 1; i <= mi; i++) add += tot.map((v, j) => i === mi ? Math.min(35, Math.max(0, v - prev[j])).toString(36) : '0').join('');
          sim.statTl = (sim.statTl || '') + add; live._tlMin = mi; live._tlTot = tot;
        }
      }
    } catch (e) { console.error('statTl failed', e); }
    return r;
  };
  const baseComplete = proto.completeLiveMatch;
  proto.completeLiveMatch = function (live) {
    const r = baseComplete.apply(this, arguments);
    try {
      const t = this.state && live && this.state.matches.find(x => x.id === live.matchId);
      if (t && live.simulatedMatch?.statTl && !t.statTl) t.statTl = live.simulatedMatch.statTl;
    } catch (e) {}
    return r;
  };

  const periodOfMinute = i => i <= 20 ? 0 : i <= 40 ? 1 : i <= 60 ? 2 : 3;
  const emptyCnt = () => ({ h: { shots: [0, 0, 0, 0], blocks: [0, 0, 0, 0], hits: [0, 0, 0, 0], faceoffs: [0, 0, 0, 0] }, a: { shots: [0, 0, 0, 0], blocks: [0, 0, 0, 0], hits: [0, 0, 0, 0], faceoffs: [0, 0, 0, 0] } });
  // накопленная статистика на минуту sel (массивы по периодам)
  function snapshotAt(app, m, sel) {
    const c = emptyCnt();
    if (m.statTl) {
      const n = Math.min(Math.floor(sel), Math.floor(m.statTl.length / 8));
      for (let i = 1; i <= n; i++) {
        const p = periodOfMinute(i);
        CATS.forEach((k, ci) => { c.h[k][p] += parseInt(m.statTl[(i - 1) * 8 + ci * 2], 36) || 0; c.a[k][p] += parseInt(m.statTl[(i - 1) * 8 + ci * 2 + 1], 36) || 0; });
      }
      return c;
    }
    const st = app.ensureMatchStats(m);
    CATS.forEach(k => ['home', 'away'].forEach(side => {
      const arr = st[side][k].periods || [];
      arr.forEach((v, p) => {
        const len = p === 3 ? 5 : 20, frac = Math.max(0, Math.min(1, (sel - 20 * p) / len));
        c[side === 'home' ? 'h' : 'a'][k][p] = Math.round((Number(v) || 0) * frac);
      });
    }));
    return c;
  }
  function viewMatch(app, m, sel) {
    const keep = e => e.kind !== 'final' && (Number.isFinite(e.visibleAtMinute) ? e.visibleAtMinute <= sel + 0.001 : app.eventMinute(e) <= sel + 0.001);
    const events = (m.events || []).filter(keep), goals = events.filter(e => e.kind === 'goal' && e.period !== 'Б');
    const mv = Object.assign({}, m, {
      events, homeScore: goals.filter(e => e.teamId === m.homeId).length, awayScore: goals.filter(e => e.teamId === m.awayId).length,
      ot: events.some(e => e.period === 'ОТ'), so: events.some(e => e.period === 'Б' || e.kind === 'shootout' || e.kind === 'shootoutAttempt'), matchStats: null
    });
    const c = snapshotAt(app, m, sel), per = mv.ot ? 4 : 3, zeros = n => Array(n).fill(0);
    const side = k => { const mk = key => { const a = c[k][key].slice(0, per); return { total: a.reduce((x, y) => x + y, 0), periods: a }; };
      return { shots: mk('shots'), faceoffs: mk('faceoffs'), blocks: mk('blocks'), hits: mk('hits'), penalties: { total: 0, periods: zeros(per) } }; };
    mv.matchStats = { home: side('h'), away: side('a'), periodCount: per, penaltyStatsVersion: 3, generatedAt: Date.now() };
    return { mv, cnt: Object.assign({ sogMin: { h: 0, a: 0 }, foBias: 0 }, c) };
  }

  /* ---------- шкала «Минута матча» с ползунком ---------- */
  const evMin = (app, e) => { const v = app.eventMinute(e); return Number.isFinite(v) ? v : 0; };
  const clockText = v => `${Math.floor(v)}:00`;

  function timelineShell(app) {
    let root = document.getElementById('mc-tl');
    if (root) return root;
    const anchor = document.getElementById('mc-tempo');
    if (!anchor) return null;
    root = document.createElement('section'); root.id = 'mc-tl'; root.className = 'mc-tl card hidden';
    root.innerHTML = '<div class="tl-head"><h3>Минута матча <span class="tl-rew hidden">просмотр прошлого</span></h3><span class="tl-right"><button type="button" class="tl-back hidden"></button><span class="tl-clock"></span></span></div>' +
      '<div class="tl"><div class="tl-dyn"></div><input class="tl-range" type="range" min="0" max="60" step="1" value="60" aria-label="Минута матча"></div><div class="tl-leg"><span class="h">гол хозяев</span><span class="a">гол гостей</span><span class="p">удаление</span></div>';
    anchor.insertAdjacentElement('beforebegin', root);
    const inp = root.querySelector('.tl-range');
    inp.addEventListener('pointerdown', () => { inp._drag = true; });
    ['pointerup', 'pointercancel', 'blur'].forEach(ev => inp.addEventListener(ev, () => { inp._drag = false; }));
    inp.addEventListener('input', () => {
      let v = Number(inp.value); const avail = Number(inp.dataset.avail || inp.max);
      if (v > avail) { v = avail; inp.value = String(v); }
      app._mcView = v >= avail ? null : v; app._mcViewMatch = app.currentMatchId;
      if (inp._raf) return;
      inp._raf = requestAnimationFrame(() => { inp._raf = 0; app.renderMatchCenter(); });
    });
    root.querySelector('.tl-back').addEventListener('click', () => { app._mcView = null; app.renderMatchCenter(); });
    return root;
  }

  function renderTimeline(app, m, live, view) {
    const root = timelineShell(app);
    if (!root) return;
    if (!m || (!m.played && !live)) { root.classList.add('hidden'); return; }
    const events = (live ? (m.events || []).filter(e => Number.isFinite(e.visibleAtMinute) ? e.visibleAtMinute <= live.visibleMinute + 0.001 : app.eventMinute(e) <= live.visibleMinute + 0.001) : (m.events || [])).filter(e => e.kind !== 'final');
    const curMax = live ? Math.floor(Math.max(0, live.visibleMinute || 0)) : null;
    const hasOT = (live && live.visibleMinute > 60) || events.some(e => e.period === 'ОТ') || !!m.ot;
    let otLen = 0;
    if (hasOT) {
      const last = Math.max(0, ...events.filter(e => e.period === 'ОТ').map(e => evMin(app, e) - 60), live ? live.visibleMinute - 60 : 0);
      otLen = Math.max(5, Math.ceil(last / 5) * 5);
    }
    const total = 60 + otLen, pct = v => Math.min(100, Math.max(0, v / total * 100));
    const max = live ? Math.min(curMax, total) : total, shown = view == null ? max : view;
    // Удаление: отдельное событие «penalty» или назначенный на остановке штраф внутри события свистка (penaltyAssessed)
    const seenPen = new Set();
    const marks = events.filter(e => (e.kind === 'goal' || e.kind === 'penalty' || (e.penaltyAssessed && e.penaltyDetails && e.penaltyDetails.length)) && e.period !== 'Б').map(e => {
      const t = evMin(app, e), x = pct(t), dim = view != null && t > view + 0.001 ? ' dim' : '';
      if (e.kind !== 'goal') {
        const list = e.kind === 'penalty' ? [{ id: e.id || e.penaltyId, playerId: e.playerId, minutes: e.minutes }] : e.penaltyDetails;
        return list.filter(d => { const k = d.id || d.penaltyId; if (k && seenPen.has(k)) return false; if (k) seenPen.add(k); return true; }).map((d, i) => {
          const pl = app.db.players.find(p => p.id === d.playerId), mins = d.minutes || d.penaltyMinutes;
          return `<span class="tlm pen${dim}" style="left:${Math.min(100, x + i * 0.9)}%" title="Удаление${pl ? ': ' + app.escape(pl.name) : ''}${mins ? ', ' + mins + ' мин' : ''}, ${e.period} ${app.escape(e.time)}"></span>`;
        }).join('');
      }
      const sc = app.db.players.find(p => p.id === e.scorerId), home = e.teamId === m.homeId;
      return `<span class="tlm goal ${home ? 'h' : 'a'}${dim}" style="left:${x}%" title="Гол, ${e.period} ${app.escape(e.time)}">${sc?.number || ''}</span>`;
    }).join('');
    const seg = hasOT ? 'repeat(3,1fr) ' + (otLen / 20) + 'fr' : 'repeat(3,1fr)';
    const per = (name, a, b) => `<span class="tl-per${shown > a && shown <= b ? ' on' : ''}" style="left:${pct((a + b) / 2)}%">${name}</span>`;
    const ticks = [0, 20, 40, 60].concat(hasOT ? [total] : []).map(v => `<span class="tl-tick" style="left:${pct(v)}%">${v}</span>`).join('');
    root.querySelector('.tl-dyn').innerHTML = `<div class="tl-track" style="grid-template-columns:${seg}"><i></i><i></i><i></i>${hasOT ? '<i></i>' : ''}</div>` +
      (live ? `<div class="tl-avail" style="width:${pct(max)}%"></div>` : '') + `<div class="tl-fill" style="width:${pct(shown)}%"></div>${marks}` +
      per('1-й период', 0, 20) + per('2-й период', 20, 40) + per('3-й период', 40, 60) + (hasOT ? per('ОТ', 60, total) : '') + ticks;
    const inp = root.querySelector('.tl-range');
    inp.max = String(total);
    inp.dataset.avail = String(max);
    if (!inp._drag) inp.value = String(shown);
    root.querySelector('.tl-clock').textContent = view != null || live ? clockText(shown) : 'итог';
    root.querySelector('.tl-rew').classList.toggle('hidden', view == null);
    const back = root.querySelector('.tl-back');
    back.textContent = live ? '▶ К прямому эфиру' : '↦ К итогу';
    back.classList.toggle('hidden', view == null);
    root.classList.toggle('rew', view != null);
    root.classList.remove('hidden');
  }

  /* ---------- подсветка новых строк ленты ---------- */
  function glowNewRows(live) {
    const rows = [...document.querySelectorAll('#match-log > *')];
    if (!live) return;
    const key = r => r.textContent.trim().slice(0, 160);
    const seen = live._seenRows;
    if (seen) rows.forEach(r => { if (!seen.has(key(r))) r.classList.add('mc-new'); });
    live._seenRows = new Set(rows.map(key));
  }

  /* ---------- просмотр на выбранную минуту ---------- */
  function currentView(app, m, live) {
    if (app._mcViewMatch !== app.currentMatchId) { app._mcView = null; app._mcViewMatch = app.currentMatchId; }
    let v = app._mcView;
    if (v == null || !m) return null;
    const hasOT = (m.events || []).some(e => e.period === 'ОТ');
    const max = live ? Math.floor(live.visibleMinute || 0) : (hasOT ? 65 : 60);
    if (v >= max) { app._mcView = null; return null; }
    return Math.max(0, v);
  }

  const base = proto.renderMatchCenter;
  proto.renderMatchCenter = function () {
    if (!this.state) return base.apply(this, arguments);
    const liveObj = this.liveMatch && this.liveMatch.matchId === this.currentMatchId ? this.liveMatch : null;
    const live = liveObj && !liveObj.finished ? liveObj : null;
    let m = liveObj ? liveObj.simulatedMatch : this.state.matches.find(x => x.id === this.currentMatchId);
    const view = (m && (m.played || live)) ? currentView(this, m, live) : null;
    const args = arguments;
    const inner = mm => { base.apply(this, args); try { if (mm && (mm.played || live)) rebuildGoalLists(this, mm); } catch (e) { console.error('goal lists failed', e); } };
    if (view == null) { this._mcViewNow = null; inner(m); }
    else {
      const { mv, cnt } = viewMatch(this, m, view);
      this._mcViewNow = view;
      if (liveObj) {
        const saved = { sim: liveObj.simulatedMatch, vm: liveObj.visibleMinute, cnt: liveObj.cnt };
        liveObj.simulatedMatch = mv; liveObj.visibleMinute = view; liveObj.cnt = cnt;
        try { inner(mv); } finally { liveObj.simulatedMatch = saved.sim; liveObj.visibleMinute = saved.vm; liveObj.cnt = saved.cnt; this._mcViewNow = null; }
      } else {
        const idx = this.state.matches.findIndex(x => x.id === m.id), saved = this.state.matches[idx];
        this.state.matches[idx] = mv;
        try { inner(mv); } finally { this.state.matches[idx] = saved; this._mcViewNow = null; }
      }
    }
    try {
      renderTimeline(this, m, live, view);
      if (view != null) {
        const sb = document.getElementById('match-scoreboard');
        sb?.querySelectorAll('.pill-row .badge').forEach(b => { b.textContent = `Просмотр: ${view}-я минута`; b.className = 'badge gold'; });
        sb?.querySelectorAll('.live-clock').forEach(c => c.remove());
        [...(sb?.children || [])].forEach(c => { if (/^\s*На льду/.test(c.textContent)) c.classList.add('hidden'); });
        document.getElementById('mc-tour')?.classList.add('hidden');
      }
      glowNewRows(live && view == null ? live : null);
    } catch (e) { console.error('match timeline failed', e); }
  };
})();

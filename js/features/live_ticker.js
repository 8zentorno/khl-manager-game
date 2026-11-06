/* KHL Manager 9.19.0 — строка событий в лайв-матче вместо «На льду: …».
   Показывает удаления, возвращения, вратарей, тайм-ауты, травмы, драки, перерывы и начало овертайма.
   Событие держится минимум 3,5 с; пришедшие вместе встают в очередь, лишние сворачиваются («ещё N в журнале»).
   В режиме просмотра по минутам показывает событие выбранной минуты. */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const $ = id => document.getElementById(id);
  const HOLD = { 1: 900, 2: 1800, 3: 2400 }, MIN_SHOWN = 600, GOAL_MIN = 1200, IDLE_AFTER = 4000;
  // на ×3 минута идёт втрое быстрее: удержание сокращается, иначе голы встают в очередь
  const speedK = app => (typeof app.mcSpeed === 'function' && app.mcSpeed() === 3 ? 0.55 : 1);
  const KINDS = {
    delayedPenalty: ['🟨', 'pen'], penalty: ['🟨', 'pen'], penaltyStart: ['🟨', 'pen'], penaltyCancelled: ['🏁', 'pen'], penaltyReduced: ['🟨', 'pen'],
    penaltyShot: ['🎯', 'warn'], penaltyShotAttempt: ['🎯', 'warn'], penaltyEnd: ['✅', 'ret'], penaltySegmentEnd: ['✅', 'ret'], penaltyReturn: ['✅', 'ret'], misconductEnd: ['✅', 'ret'],
    goalieChange: ['🔄', 'warn'], goalieReturn: ['🧤', 'ret'], emptyNet: ['🥅', 'warn'], timeout: ['⏱️', 'info'], fatigue: ['💤', 'info'], injury: ['🩹', 'warn'], fight: ['🥊', 'warn'],
    intermission: ['🛎️', 'info'], goal: ['🚨', 'goal']
  };
  const MINOR = { save: '🧤', hit: '💥', icing: '🚫', offside: '🚩', chance: '🔥', faceoff: '🔵', block: '🛡️', shot: '🏒' };
  const SERIOUS = new Set(['goal', 'fight', 'injury', 'goalieChange', 'emptyNet', 'penaltyShot', 'penaltyShotAttempt']);
  const SKIP = new Set(['final', 'shootout', 'shootoutAttempt']);

  proto.tkTier = function (e) {
    if (!e || SKIP.has(e.kind)) return 0;
    if (SERIOUS.has(e.kind) || e.serious) return 3;
    if (KINDS[e.kind]) return (e.kind === 'faceoff') ? 2 : 2;
    if (e.kind === 'faceoff' && /Начинается|не выявил|Жребий|овертайм/i.test(e.text || '')) return 2;
    return e.text ? 1 : 0;
  };
  proto.tkRelevant = function (e) { return this.tkTier(e) > 0; };
  proto.tkSerious = function (e) { return this.tkTier(e) === 3; };
  proto.tkText = function (m, e) {
    if (e.kind !== 'goal') return e.text || '';
    const pl = id => this.db.players.find(p => String(p.id) === String(id)), name = ((pl(e.scorerId) || {}).name || 'Автор не указан') + (this.kaText && pl(e.scorerId) ? this.kaText(pl(e.scorerId)) : '');
    const goals = (m.events || []).filter(x => x.kind === 'goal'), i = goals.indexOf(e);
    const h = goals.slice(0, i + 1).filter(x => x.teamId === m.homeId).length, a = goals.slice(0, i + 1).filter(x => x.teamId === m.awayId).length;
    let as = ''; try { as = this.goalAssistText ? this.goalAssistText(pl(e.assist1Id), pl(e.assist2Id)) : ''; } catch (err) { }
    return `Гол! ${name}${as ? ` (${as})` : ''}. Счёт ${h}:${a}`;
  };
  proto.tkTime = function (e) {
    if (e.kind === 'intermission') return `${e.period} · перерыв`;
    try { if (e.period === 'ОТ' && this.otStampText) return this.otStampText(e); } catch (err) { }
    return `${e.period || ''} ${e.time || ''}`.trim();
  };
  proto.tkHtml = function (e, folded, m) {
    const k = KINDS[e.kind], ico = k ? k[0] : (MINOR[e.kind] || '🏒'), cls0 = k ? k[1] : 'minor', team = this.teamById(e.teamId), name = team ? `${this.kitDotFor ? this.kitDotFor(m, e.teamId, 's') : ''}<b>${this.escape(team.name)}</b>. ` : '';
    const cls = this.tkSerious(e) && cls0 === 'pen' ? 'warn' : cls0;
    return { cls, html: `<span class="lt-tm">${this.escape(this.tkTime(e))}</span><span class="lt-tt">${ico} ${name}${this.linkNames(this.tkText(m, e), [e.scorerId, e.assist1Id, e.assist2Id, e.actorId, e.targetId, e.playerId, e.opponentPlayerId, e.goalieId])}</span>${folded ? `<span class="lt-n">ещё ${folded} в журнале</span>` : ''}` };
  };
  proto.tkIdleText = function (m, live) {
    if (!live) return '';
    if (live.inShootout) return 'Серия буллитов';
    const mp = m && m.liveManpower;
    if (!mp) return 'Игра идёт';
    const pp = mp.ppTeamId ? ` · большинство: ${this.escape((this.teamById(mp.ppTeamId) || {}).name || '')}` : '';
    return `Игра идёт · ${mp.home} на ${mp.away}${pp}`;
  };

  /* ----- состояние ----- */
  proto.tkState = function (m) {
    if (!this._tk || this._tk.matchId !== m.id) this._tk = { matchId: m.id, seen: new Set(), queue: [], cur: null, folded: 0, left: 0, idleLeft: 0, last: null, lastT: Date.now() };
    return this._tk;
  };
  proto.tkCollect = function (m, live, T, all) {
    const vm = all ? Infinity : live.visibleMinute, first = !all && T.seen.size === 0 && !T.initDone;
    for (const e of m.events || []) {
      if (T.seen.has(e) || e.kind === 'final') continue;
      const vis = Number.isFinite(e.visibleAtMinute) ? e.visibleAtMinute <= vm + 0.001 : this.eventMinute(e) <= vm + 0.001;
      if (!vis) continue;
      T.seen.add(e);
      if (first && vm > 1) continue;           // зашли в уже идущий матч: старое не показываем
      if (this.tkRelevant(e)) T.queue.push(e);
    }
    T.initDone = true;
    // слишком много сразу: тяжёлые события остаются все, средние — два последних, мелкие — только последнее (и то если больше ничего нет)
    const t3 = T.queue.filter(e => this.tkTier(e) === 3), t2 = T.queue.filter(e => this.tkTier(e) === 2), t1 = T.queue.filter(e => this.tkTier(e) === 1);
    const keep = new Set([...t3, ...t2.slice(-2)]);
    if (!keep.size && t1.length) keep.add(t1[t1.length - 1]);
    if (keep.size !== T.queue.length) { T.folded += T.queue.filter(e => !keep.has(e) && this.tkTier(e) >= 2).length; T.queue = T.queue.filter(e => keep.has(e)); }
  };
  // последняя по ходу игры запись, достойная строки (итог и серия буллитов в строку не попадают)
  proto.tkLast = function (m) {
    let best = null, bm = -1;
    (m.events || []).forEach(e => { if (e.kind === 'final' || !this.tkRelevant(e)) return; const t = this.eventMinute(e); if (t >= bm) { bm = t; best = e; } });
    return best;
  };
  proto.tkNext = function (T) {
    if (!T.queue.length) return false;
    const gi = T.queue.findIndex(e => this.tkTier(e) === 3);         // гол показываем первым
    T.cur = T.queue.splice(gi >= 0 ? gi : 0, 1)[0]; T.last = T.cur;
    if (this.tkTier(T.cur) === 3 || T.queue.some(e => this.tkTier(e) >= 2)) T.queue = T.queue.filter(e => this.tkTier(e) >= 2); // мелочь за важным не копим
    T.hold = Math.round((HOLD[this.tkTier(T.cur)] || HOLD[2]) * speedK(this)); T.left = T.hold; T.idleLeft = IDLE_AFTER; T.fresh = true; return true;
  };
  proto.tkPaint = function (m, live) {
    const el = $('live-ticker'), T = this._tk; if (!el || !T) return;
    if (T.viewOnly) return;
    let cls = 'idle', html;
    if (T.cur) { const h = this.tkHtml(T.cur, T.curFolded || 0, m); cls = h.cls; html = h.html; }
    else if (live) html = `<span class="lt-tm"></span><span class="lt-tt">${this.tkIdleText(m, live)}</span>`;
    else if (T.last) { const h = this.tkHtml(T.last, 0, m); cls = h.cls; html = h.html; }
    else { el.innerHTML = ''; return; }
    const key = cls + '|' + html;
    if (el._tkKey !== key) { el.className = 'live-ticker lt-' + cls + (T.fresh ? ' lt-in' : ''); el.innerHTML = html + '<div class="lt-bar"><i></i></div>'; el._tkKey = key; T.fresh = false; }
    const bar = el.querySelector('.lt-bar i'); if (bar) bar.style.width = T.cur ? Math.max(0, T.left / (T.hold || HOLD[2]) * 100) + '%' : '0';
  };
  proto.tkPump = function () {
    const T = this._tk, live = this.liveMatch;
    const stop = () => { if (this._tkTimer) { clearInterval(this._tkTimer); this._tkTimer = null; } };
    if (!T || !this.state || T.done) return stop();
    const isLive = !!(live && live.matchId === T.matchId);
    const m = isLive ? live.simulatedMatch : this.state.matches.find(x => x.id === T.matchId);
    if (!m) return stop();
    const ended = !isLive || live.finished;
    if (ended && this._tkQuickId === T.matchId) { T.done = true; return stop(); } // быстрый итог: строка уже в финальном состоянии
    if (this.currentMatchId !== T.matchId) { if (ended) { T.done = true; return stop(); } return; }
    if (this._mcViewNow != null) return;                                    // просмотр по минутам рисует tkSync
    const now = Date.now(), dt = Math.min(500, now - T.lastT); T.lastT = now;
    if (!ended && live.paused && !live.runMode) return;                     // пауза замораживает и строку
    if (ended && !T.flush) { T.flush = true; this.tkCollect(m, null, T, true); }
    if (T.cur) {
      T.left -= dt;
      const shown = T.hold - T.left, tier = this.tkTier(T.cur), goalWait = T.queue.some(e => this.tkTier(e) === 3);
      const lowNow = (tier === 1 && T.queue.some(e => this.tkTier(e) >= 2) && shown >= MIN_SHOWN)
        || (goalWait && tier < 3 && shown >= MIN_SHOWN) || (goalWait && tier === 3 && shown >= GOAL_MIN * speedK(this));
      if (T.left <= 0 || lowNow) {
        if (!this.tkNext(T)) { if (ended) { T.cur = null; } else { T.idleLeft -= dt; if (T.idleLeft <= 0) { T.cur = null; T.curFolded = 0; } } }
        else { T.curFolded = T.folded; T.folded = 0; }
      }
    } else if (T.queue.length) { this.tkNext(T); T.curFolded = T.folded; T.folded = 0; }
    if (ended && !T.cur && !T.queue.length) {                               // лента доиграна: остаётся последняя запись матча
      T.done = true; T.last = this.tkLast(m) || T.last; stop();
      const el = $('live-ticker'); if (el) { el._tkKey = null; this.tkFinal(el, m, T); }
      return;
    }
    this.tkPaint(m, ended ? null : live);
  };
  proto.tkFinal = function (el, m, T) {
    const e = (T && T.last) || this.tkLast(m);
    if (!e) { el.innerHTML = ''; return; }
    const h = this.tkHtml(e, 0, m); el.className = 'live-ticker lt-' + h.cls; el.innerHTML = h.html;
  };

  /* ----- встраивание в отрисовку матч-центра ----- */
  const base = proto.renderMatchCenter;
  proto.renderMatchCenter = function () {
    const r = base.apply(this, arguments);
    try { this.tkSync(); } catch (err) { console.error('live ticker failed', err); }
    return r;
  };
  proto.tkSync = function () {
    const el = $('live-ticker'); if (!el || !this.state) return;
    const live = this.liveMatch && this.liveMatch.matchId === this.currentMatchId && !this.liveMatch.finished ? this.liveMatch : null;
    const m = live ? live.simulatedMatch : this.state.matches.find(x => x.id === this.currentMatchId);
    if (!m) { el.innerHTML = ''; return; }
    const view = this._mcViewNow;
    if (view != null) {                                    // просмотр по минутам: событие этой минуты
      const evs = (m.events || []).filter(e => this.tkRelevant(e) && this.eventMinute(e) > view - 1 && this.eventMinute(e) <= view + 0.001);
      const top = Math.max(0, ...evs.map(x => this.tkTier(x))), e = evs.filter(x => this.tkTier(x) === top).pop();
      el._tkKey = null;
      if (e) { const h = this.tkHtml(e, Math.max(0, evs.filter(x => this.tkTier(x) >= 2).length - 1), m); el.className = 'live-ticker lt-' + h.cls; el.innerHTML = h.html; }
      else { el.className = 'live-ticker lt-idle'; el.innerHTML = `<span class="lt-tm"></span><span class="lt-tt">Минута ${Math.round(view)}: без событий</span>`; }
      return;
    }
    if (!live) {                                           // матч завершён
      const T = this._tk, lm = this.liveMatch, quick = this._tkQuickId === m.id, src = lm && lm.matchId === m.id ? lm.simulatedMatch : m;
      if (T && T.matchId === m.id && !quick && !T.done) {  // матч закончился, а лента не успела: доигрываем её до последнего события
        if (!T.flush) { T.flush = true; this.tkCollect(src, null, T, true); }
        el._tkKey = null;
        if (!T.cur && T.queue.length) { this.tkNext(T); T.curFolded = T.folded; T.folded = 0; }
        if (T.cur) { this.tkPaint(src, null); if (!this._tkTimer) { T.lastT = Date.now(); this._tkTimer = setInterval(() => this.tkPump(), 120); } return; }
      }
      if (T && T.matchId === m.id) { T.done = true; T.cur = null; T.queue = []; }
      el._tkKey = null; this.tkFinal(el, src, null);          // быстрый итог и старые матчи: последняя запись по ходу событий
      return;
    }
    const T = this.tkState(m);
    if (live.quick) {                                      // быстрый итог: накопленное не проигрываем, при буллитах сразу «Серия буллитов»
      for (const e of m.events || []) T.seen.add(e);
      T.queue = []; T.cur = null; T.folded = 0; T.initDone = true; el._tkKey = null;
      this.tkPaint(m, live);
      if (!this._tkTimer) this._tkTimer = setInterval(() => this.tkPump(), 120);
      return;
    }
    this.tkCollect(m, live, T);
    el._tkKey = null; T.lastT = Date.now();
    if (!T.cur && T.queue.length) { this.tkNext(T); T.curFolded = T.folded; T.folded = 0; }
    this.tkPaint(m, live);
    if (!this._tkTimer) this._tkTimer = setInterval(() => this.tkPump(), 120);
  };
})();

/* KHL Manager 9.17.0 — окно «Буллиты»: жребий, выбор трёх исполнителей, ворота с анимацией броска (3 с ожидания,
   5 с между бросками), журнал серии, закрытие вручную. Исходы бросков считает прежний движок; окно их только показывает. */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const $ = id => document.getElementById(id);
  const SENTINEL = '__so__';
  const ZONES = [
    { x: 25, y: 26, n: 'левый верхний угол' }, { x: 75, y: 26, n: 'правый верхний угол' },
    { x: 25, y: 68, n: 'левый нижний угол' }, { x: 75, y: 68, n: 'правый нижний угол' },
    { x: 50, y: 72, n: 'между щитков' }, { x: 50, y: 28, n: 'под перекладину' }
  ];

  proto.soAttempts = function (live) { return ((live && live.simulatedMatch && live.simulatedMatch.events) || []).filter(e => e.kind === 'shootoutAttempt'); };
  proto.soPlayer = function (id) { return this.db.players.find(p => String(p.id) === String(id)); };

  /* ---------- перехват движка: пока идут буллиты, шаги делает только окно ---------- */
  const baseAdvance = proto.advanceLiveMatch;
  const blocked = (app, live) => live && live.inShootout && !live.finished && !live.autoResolveShootouts && !(app._so && app._so.live === live && app._so.driving);
  const sentinel = live => { if (!app._so && !live.pendingShootoutPick) live.pendingShootoutPick = { teamId: SENTINEL, candidateIds: [], attemptNumber: 0 }; };
  proto.advanceLiveMatch = function (live) {
    // Пока окно показывает серию, шагает только оно: иначе таймер матча успевает «завершить» матч раньше анимации (и записать его дважды).
    if (this._so && !this._so.review && this._so.live === live && !this._so.done && !this._so.driving) return false;
    if (blocked(this, live)) { sentinel(live); return false; }
    const r = baseAdvance.apply(this, arguments);
    if (blocked(this, live)) sentinel(live);
    return r;
  };
  const baseBatch = proto.advanceLiveBatch;
  proto.advanceLiveBatch = function (live) {
    const r = baseBatch.apply(this, arguments);
    if (live && live.inShootout && !live.finished && !live.autoResolveShootouts && !this._so && live.pendingShootoutPick && live.pendingShootoutPick.teamId === SENTINEL) this.soOpen(live);
    return r;
  };

  // Завершение матча идемпотентно: повторный вызов (таймер, «Быстрый итог», окно) не должен второй раз писать таблицу и статистику.
  const baseComplete = proto.completeLiveMatch;
  proto.completeLiveMatch = function (live) {
    const t = this.state && live && this.state.matches.find(x => x.id === live.matchId);
    if (!t || t.played) return;
    return baseComplete.apply(this, arguments);
  };

  /* ---------- состояние и таймеры ---------- */
  proto.soLater = function (ms, fn) {
    const S = this._so; if (!S) return;
    const t = setTimeout(() => { S.timers = S.timers.filter(x => x !== t); if (this._so === S) fn.call(this); }, S.fast ? Math.round(ms * 0.2) : ms);
    S.timers.push(t);
  };
  proto.soOpen = function (live) {
    if (this._so) return;
    if (live.pendingShootoutPick && live.pendingShootoutPick.teamId === SENTINEL) live.pendingShootoutPick = null;
    const my = this.state.teamId, n = this.soAttempts(live).length;
    this._so = { live, review: false, my, shown: n, stepped: n, queue: [], phase: 'coin', fast: false, timers: [], driving: false, finishing: false, done: false, cur: null, say: '', sayCls: '', timer: '' };
    try { this.renderMatchCenter(); } catch (err) { }
    this.soBuildDom(); this.soRenderAll();
    if (n === 0) { this._so.say = 'Жребий…'; this._so.sayCls = 'wt'; this.soRenderStage(); this.soLater(2200, this.soAfterCoin); } else this.soAfterCoin();
  };
  proto.soAfterCoin = function () {
    const S = this._so, live = S.live, side = S.my === live.homeId ? 'home' : S.my === live.awayId ? 'away' : null;
    if (side && !((live.shootoutAttempts || {})[side] > 0) && this.soCandidates(live).length) { S.phase = 'pick3'; S.picks = []; S.say = ''; S.sayCls = ''; this.soRenderAll(); return; }
    this.soNext();
  };
  proto.soCandidates = function (live) {
    const my = this.state.teamId, side = my === live.homeId ? 'home' : 'away';
    const used = new Set(((live.shootoutUsedPlayerIds || {})[side]) || []), inj = (live.injured || {})[my] || [], sent = (live.sentOff || {})[my] || [];
    const act = (my === live.homeId ? live.activeH : live.activeA) || this.activeSkaters(my);
    return (act.skaters || []).filter(p => p && !used.has(p.id) && !inj.includes(p.id) && !sent.includes(p.id) && !this.isPlayerUnavailable(p))
      .sort((a, b) => this.effectiveOVR(b) - this.effectiveOVR(a));
  };

  /* ---------- ход серии ---------- */
  proto.soStep = function () {
    const S = this._so, live = S.live; S.driving = true;
    if (live.pendingShootoutPick && live.pendingShootoutPick.teamId === SENTINEL) live.pendingShootoutPick = null;
    try {
      for (let g = 0; g < 4; g++) {
        const fin = this.advanceLiveMatch(live), at = this.soAttempts(live);
        if (at.length > S.stepped) { S.stepped = at.length; if (fin || live.finished) S.finishing = true; return { attempt: at[at.length - 1] }; }
        const p = live.pendingShootoutPick;
        if (p && p.teamId === S.my) {
          const cand = (p.candidateIds || []).map(String);
          while (S.queue.length) { const id = S.queue.shift(); if (cand.includes(String(id))) { live.pendingShootoutShooterId = id; live.pendingShootoutPick = null; break; } }
          if (live.pendingShootoutPick) return { need: p };
          continue;
        }
        if (fin || live.finished) { S.finishing = true; return { finished: true }; }
      }
      return { finished: !!live.finished };
    } finally { S.driving = false; }
  };
  proto.soNext = function () {
    const S = this._so; if (!S || S.done) return;
    const r = this.soStep();
    if (r.attempt) { S.cur = r.attempt; this.soCountdown(); return; }
    if (r.need) {
      S.phase = 'pickOne'; S.need = r.need; S.say = ''; this.soRenderAll();
      return;
    }
    this.soFinish();
  };
  proto.soPickOne = function (id) {
    const S = this._so, live = S.live; if (!S || S.phase !== 'pickOne') return;
    live.pendingShootoutShooterId = id; live.pendingShootoutPick = null; S.need = null; S.phase = 'wait';
    this.soNext();
  };
  proto.soTogglePick = function (id) {
    const S = this._so; if (!S || S.phase !== 'pick3') return;
    const i = S.picks.indexOf(id);
    if (i >= 0) S.picks.splice(i, 1); else if (S.picks.length < Math.min(3, this.soCandidates(S.live).length)) S.picks.push(id);
    this.soRenderPick(); this.soRenderActions();
  };
  proto.soConfirm = function () {
    const S = this._so; if (!S || S.phase !== 'pick3') return;
    if (S.picks.length < Math.min(3, this.soCandidates(S.live).length)) return;
    S.queue = S.picks.slice(); S.phase = 'wait'; S.picks = [];
    this.soNext();
  };
  proto.soCountdown = function () {
    const S = this._so, e = S.cur, pl = this.soPlayer(e.scorerId), tm = this.teamById(e.teamId);
    S.phase = 'count'; S.reveal = null;
    S.say = `${pl ? pl.name : 'Игрок'} (${tm ? tm.name : ''}) выходит на бросок…`; S.sayCls = 'wt';
    this.soRenderAll(); this.soResetStage();
    let n = 3;
    S.timer = String(n); this.soRenderStage();
    const tick = () => {
      n--;
      if (n > 0) { S.timer = String(n); this.soRenderStage(); this.soLater(1000, tick); } else { S.timer = ''; this.soReveal(); }
    };
    this.soLater(1000, tick);
  };
  proto.soReveal = function () {
    const S = this._so, e = S.cur, pl = this.soPlayer(e.scorerId), gk = this.soPlayer(e.goalieId);
    S.shown++; S.phase = 'reveal';
    const zone = ZONES[Math.floor(Math.random() * ZONES.length)], post = e.outcome === 'wide' && Math.random() < 0.5;
    S.reveal = { outcome: e.outcome, zone, post, left: Math.random() < 0.5 };
    e.soKind = e.outcome === 'goal' ? 'goal' : e.outcome === 'save' ? 'save' : post ? 'post' : 'wide';
    S.say = e.outcome === 'goal' ? `🚨 Гол! ${pl ? pl.name : ''}, ${zone.n}`
      : e.outcome === 'save' ? `🧤 Сейв! ${gk ? gk.name : 'Вратарь'} отражает бросок`
      : post ? `Штанга! ${pl ? pl.name : 'Игрок'} не попал` : `Мимо ворот! ${pl ? pl.name : 'Игрок'}`;
    S.sayCls = e.outcome === 'goal' ? 'ok' : 'no';
    this.soRenderAll(); this.soAnimate();
    if (S.finishing) this.soLater(2200, this.soFinish); else this.soLater(2000, this.soNext);
  };
  proto.soFinish = function () {
    const S = this._so; if (!S || S.done) return;
    const live = S.live;
    if (this.liveTimer) { clearInterval(this.liveTimer); this.liveTimer = null; }
    try { if (!live.simulatedMatch.events.some(x => x.kind === 'final')) this.endLiveMatch(live, live.visibleMinute); this.completeLiveMatch(live); } catch (err) { console.error('shootout finish failed', err); }
    S.done = true; S.phase = 'done'; S.cur = null; S.timer = '';
    const w = this.soWinner(live.simulatedMatch);
    S.say = w ? `Победа ${w.name} в серии буллитов` : 'Серия завершена'; S.sayCls = 'ok';
    this.soRenderAll(); this.soResetStage();
    try { this.renderMatchCenter(); } catch (err) { }
  };
  proto.soWinner = function (m) {
    const at = (m.events || []).filter(e => e.kind === 'shootoutAttempt');
    let h = 0, a = 0; at.forEach(e => { if (e.outcome === 'goal') { if (e.teamId === m.homeId) h++; else a++; } });
    const ev = (m.events || []).find(e => e.kind === 'shootout');
    const id = ev ? ev.teamId : h > a ? m.homeId : h < a ? m.awayId : null;
    return id ? this.teamById(id) : null;
  };

  /* ---------- повторный просмотр ---------- */
  proto.soOpenReview = function () {
    if (this._so) return;
    const live = this.liveMatch && this.liveMatch.matchId === this.currentMatchId ? this.liveMatch : null;
    const m = live ? live.simulatedMatch : this.state.matches.find(x => x.id === this.currentMatchId);
    if (!m) return;
    const fake = { simulatedMatch: m, homeId: m.homeId, awayId: m.awayId, finished: true, shootoutFirstTeamId: m.shootoutFirstTeamId || (live && live.shootoutFirstTeamId) || null };
    const n = this.soAttempts(fake).length;
    this._so = { live: fake, review: true, my: this.state.teamId, shown: n, stepped: n, queue: [], phase: 'done', fast: false, timers: [], driving: false, finishing: false, done: true, cur: null, say: '', sayCls: '', timer: '' };
    const w = this.soWinner(m); this._so.say = w ? `Победа ${w.name} в серии буллитов` : ''; this._so.sayCls = 'ok';
    this.soBuildDom(); this.soRenderAll();
  };
  proto.soClose = function () {
    const S = this._so; if (!S || !S.done) return;
    S.timers.forEach(clearTimeout); this._so = null;
    const el = $('so-modal'); if (el) el.remove();
    document.removeEventListener('keydown', this._soKey);
    try { this.renderMatchCenter(); } catch (err) { }
  };
  proto.soToggleFast = function () { const S = this._so; if (S) { S.fast = !S.fast; this.soRenderActions(); } };

  /* ---------- отрисовка ---------- */
  proto.soBuildDom = function () {
    const old = $('so-modal'); if (old) old.remove();
    const el = document.createElement('div'); el.id = 'so-modal'; el.className = 'so-scrim';
    el.innerHTML = `<div class="so-dlg" role="dialog" aria-modal="true" aria-labelledby="so-title"><div class="eyebrow" id="so-title">Буллиты</div><div class="so-head"></div>
      <div class="so-stagebox"><div class="so-goal" id="so-goal"><svg viewBox="0 0 240 130" preserveAspectRatio="none" aria-hidden="true"><rect x="30" y="10" width="180" height="108" class="so-netbg"/><g class="so-netlines"><path d="M30 37h180M30 64h180M30 91h180M60 10v108M90 10v108M120 10v108M150 10v108M180 10v108"/></g><path d="M30 118V10h180v108" class="so-frame"/></svg><i class="so-puck" id="so-puck"></i><span class="so-glove" id="so-glove">🧤</span><b class="so-timer" id="so-timer"></b></div><div class="so-say" id="so-say"></div></div>
      <div class="so-pick" id="so-pick"></div><div class="so-log" id="so-log"></div><div class="so-actions" id="so-actions"></div></div>`;
    document.body.appendChild(el);
    this._soKey = ev => { if (ev.key === 'Escape' && this._so && this._so.done) this.soClose(); };
    document.addEventListener('keydown', this._soKey);
  };
  proto.soRenderAll = function () { this.soRenderHead(); this.soRenderStage(); this.soRenderPick(); this.soRenderLog(); this.soRenderActions(); };
  proto.soTeamsShown = function () {
    const S = this._so, live = S.live, at = this.soAttempts(live).slice(0, S.shown), res = { [live.homeId]: [], [live.awayId]: [] };
    at.forEach(e => { (res[e.teamId] || (res[e.teamId] = [])).push(e.outcome === 'goal'); });
    return res;
  };
  proto.soRenderHead = function () {
    const S = this._so, live = S.live, res = this.soTeamsShown(), el = document.querySelector('#so-modal .so-head'); if (!el) return;
    const g = id => (res[id] || []).filter(Boolean).length;
    const dots = id => { const r = res[id] || [], n = Math.max(3, r.length); return Array.from({ length: n }, (_, i) => i < r.length ? `<i class="${r[i] ? 'g' : 'm'}">${r[i] ? '✓' : '✕'}</i>` : '<i></i>').join(''); };
    const nm = id => this.escape((this.teamById(id) || {}).name || '');
    el.innerHTML = `<div class="so-team"><b>${nm(live.homeId)}</b><div class="so-dots">${dots(live.homeId)}</div></div><div class="so-score">${g(live.homeId)} : ${g(live.awayId)}</div><div class="so-team"><b>${nm(live.awayId)}</b><div class="so-dots">${dots(live.awayId)}</div></div>`;
  };
  proto.soRenderStage = function () {
    const S = this._so; if (!S) return;
    const say = $('so-say'), tm = $('so-timer');
    if (say) { say.textContent = S.say || ''; say.className = 'so-say ' + (S.sayCls || ''); }
    if (tm) tm.textContent = S.timer || '';
  };
  proto.soResetStage = function () {
    const puck = $('so-puck'), glove = $('so-glove'), goal = $('so-goal'); if (!puck) return;
    puck.style.transition = 'none'; puck.style.left = '50%'; puck.style.top = '132%'; puck.style.opacity = '1';
    glove.style.opacity = '0'; goal.classList.remove('flash');
  };
  proto.soAnimate = function () {
    const S = this._so, R = S.reveal, puck = $('so-puck'), glove = $('so-glove'), goal = $('so-goal'); if (!R || !puck) return;
    this.soResetStage(); void puck.offsetWidth;
    let x = R.zone.x, y = R.zone.y;
    if (R.outcome === 'wide') { if (R.post) { x = R.left ? 12.5 : 87.5; y = 42; } else { x = R.left ? 6 : 94; y = R.left ? 20 : 8; } }
    puck.style.transition = 'left .55s ease-out, top .55s ease-out'; puck.style.left = x + '%'; puck.style.top = y + '%';
    if (R.outcome === 'goal') setTimeout(() => goal.classList.add('flash'), 500);
    if (R.outcome === 'save') { glove.style.left = x + '%'; glove.style.top = y + '%'; setTimeout(() => { glove.style.opacity = '1'; }, 420); }
  };
  proto.soRenderPick = function () {
    const S = this._so, el = $('so-pick'); if (!el) return;
    { const old = el.querySelector('.so-plist'); if (old) S.pkScroll = old.scrollTop; }   // 14.7.1: список не прыгает вверх при выборе следующего исполнителя
    const row = (p, num, cls, act) => `<button type="button" class="so-pk ${cls}" onclick="${act}"><span>${num ? `<b>${num}</b> · ` : ''}${this.escape(p.name)} · ${this.escape(this.positionLabel(p.pos))}</span><span class="o">OVR ${Math.round(this.effectiveOVR(p))}</span></button>`;
    if (S.phase === 'pick3') {
      const list = this.soCandidates(S.live), need = Math.min(3, list.length);
      el.innerHTML = `<div class="so-ptitle">Выберите исполнителей по порядку: ${S.picks.length} из ${need}</div><div class="so-plist">${list.map(p => { const i = S.picks.indexOf(p.id); return row(p, i >= 0 ? i + 1 : '', i >= 0 ? 'sel' : '', `app.soTogglePick('${p.id}')`); }).join('')}</div>`;
    } else if (S.phase === 'pickOne') {
      const list = (S.need.candidateIds || []).map(id => this.soPlayer(id)).filter(Boolean).sort((a, b) => this.effectiveOVR(b) - this.effectiveOVR(a));
      el.innerHTML = `<div class="so-bar">🏒 Выбери исполнителя буллита · бросок № ${S.need.attemptNumber || ''}</div><div class="so-plist">${list.map(p => row(p, '', '', `app.soPickOne('${p.id}')`)).join('')}</div>`;
    } else el.innerHTML = '';
    { const nl = el.querySelector('.so-plist'); if (nl && S.pkScroll) nl.scrollTop = S.pkScroll; }
  };
  proto.soRenderLog = function () {
    const S = this._so, el = $('so-log'); if (!el) return;
    const live = S.live, at = this.soAttempts(live).slice(0, S.shown);
    const first = live.shootoutFirstTeamId ? this.teamById(live.shootoutFirstTeamId) : null;
    const kind = { goal: 'гол', save: 'сейв', wide: 'мимо', post: 'штанга' };
    const rows = at.map(e => {
      const pl = this.soPlayer(e.scorerId), k = e.soKind || (e.outcome === 'wide' ? 'wide' : e.outcome), ico = k === 'goal' ? '🚨' : k === 'save' ? '🧤' : '✕';
      return `<div><i>${ico}</i><span><b>${this.escape((this.teamById(e.teamId) || {}).name || '')}</b> · ${this.escape(pl ? pl.name : 'Игрок')}: ${kind[k] || e.outcome}</span></div>`;
    });
    el.innerHTML = (first ? `<div><i>🪙</i><span>Жребий: первыми бросает <b>${this.escape(first.name)}</b></span></div>` : '') + rows.join('');
    el.scrollTop = el.scrollHeight;
  };
  proto.soRenderActions = function () {
    const S = this._so, el = $('so-actions'); if (!el) return;
    if (S.done) { el.innerHTML = `<button type="button" class="btn btn-primary" onclick="app.soClose()">Закрыть окно</button>`; return; }
    const parts = [];
    if (S.phase === 'pick3') { const need = Math.min(3, this.soCandidates(S.live).length), ok = S.picks.length >= need; parts.push(`<button type="button" class="btn btn-primary" ${ok ? '' : 'disabled'} onclick="app.soConfirm()">Подтвердить исполнителей${ok ? '' : ` (${S.picks.length} из ${need})`}</button>`); }
    parts.push(`<button type="button" class="btn btn-quiet" aria-pressed="${S.fast}" onclick="app.soToggleFast()">${S.fast ? '⏩ Быстро: вкл' : '⏩ Быстро'}</button>`);
    el.innerHTML = parts.join('');
  };

  /* кнопка «Показать буллиты» в матч-центре */
  const baseRender = proto.renderMatchCenter;
  proto.renderMatchCenter = function () {
    const r = baseRender.apply(this, arguments);
    try {
      const sc = $('match-scoreboard');
      if (sc && !this._so) {
        const live = this.liveMatch && this.liveMatch.matchId === this.currentMatchId ? this.liveMatch : null;
        const m = live ? live.simulatedMatch : (this.state && this.state.matches.find(x => x.id === this.currentMatchId));
        sc.querySelectorAll('.so-open').forEach(b => b.remove());
        if (m && m.so && (m.events || []).some(e => e.kind === 'shootoutAttempt') && (!live || live.finished || m.played)) sc.insertAdjacentHTML('beforeend', '<div style="text-align:center;margin:.6rem 0"><button type="button" class="btn so-open" onclick="app.soOpenReview()">🏒 Показать буллиты</button></div>');
      }
    } catch (err) { }
    return r;
  };
})();

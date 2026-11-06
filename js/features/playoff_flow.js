/* 9.20.0 — плей-офф: окно цели с отсчётом, календарь серий 4+, мгновенная смена стадий, кубок по дням после вылета,
 * «Итоги сезона», новости «старт стадии» и «итоги игры N». Подключается последним, чтобы обёртки шли поверх прежних слоёв. */
(function () {
  'use strict';
  if (typeof KHLManagerApp === 'undefined') return;
  const proto = KHLManagerApp.prototype;
  const $ = id => (typeof document !== 'undefined' ? document.getElementById(id) : null);
  const activeTab = () => (typeof document !== 'undefined' && document.querySelector ? (document.querySelector('.view.active') || {}).id : '');
  const allSeries = app => {
    const po = app.state && app.state.playoff; if (!po) return [];
    const seen = new Set(), out = [];
    [...(po.history || []).flatMap(h => h.series || []), ...(po.series || [])].forEach(s => { if (s && !seen.has(s.id)) { seen.add(s.id); out.push(s); } });
    return out;
  };
  const name = (app, id) => (app.teamById(id) || {}).name || '—';

  // Серию может закрыть аудит при отрисовке раньше recordPlayoffResult (живой матч): тогда оценка цели пропускалась.
  proto.poSyncObjective = function () {
    const st = this.state; if (!st || !st.playoffObjective || !st.playoffObjective.selected || st.playoffObjective.evaluated) return false;
    const my = st.teamId;
    for (const s of allSeries(this).filter(x => x.complete && (x.teamA === my || x.teamB === my)).sort((a, b) => a.stage - b.stage)) {
      if (typeof this.assessPlayoffObjectiveSeries === 'function') this.assessPlayoffObjectiveSeries(s);
      if (st.playoffObjective.evaluated) break;
    }
    const po = st.playoff;
    if (!st.playoffObjective.evaluated && po && po.completed && po.championId === my) this.evaluatePlayoffObjective(true, 'Команда выиграла Кубок Гагарина!');
    return !!st.playoffObjective.evaluated;
  };

  /* ---------- 1. кубок без нашей команды / серия видна по мере необходимости ---------- */
  proto.poOutOfCup = function () {
    const po = this.state && this.state.playoff;
    if (!po || !po.started || po.completed) return false;
    return !!(this.isUserEliminatedFromPlayoffs() || !this.userQualifiedForPlayoffs());
  };
  // матчи 5–7 серии показываются, только когда они реально нужны (серия не закончена и предыдущая игра сыграна)
  proto.poGameVisible = function (m) {
    if (!m || !m.playoff || m.played) return true;
    const n = Number(m.gameNo) || 1; if (n <= 4) return true;
    const s = allSeries(this).find(x => x.id === m.seriesId);
    if (s && s.complete) return false;
    const prev = this.state.matches.find(x => x.seriesId === m.seriesId && Number(x.gameNo) === n - 1);
    return !!(prev && prev.played && !prev.cancelled);
  };

  /* ---------- 2. новая стадия появляется сразу ---------- */
  const baseSMA = proto.simulateMatchesAt;
  proto.simulateMatchesAt = function () {
    const r = baseSMA.apply(this, arguments);
    try { this.poSyncObjective(); } catch (e) { console.warn('sync objective', e); }
    try { const po = this.state && this.state.playoff; if (po && po.started && !po.completed) this.refreshPlayoffStages723(); } catch (e) { console.warn('refresh stages', e); }
    return r;
  };
  const baseCLM = proto.completeLiveMatch;
  proto.completeLiveMatch = function () {
    const r = baseCLM.apply(this, arguments);
    try { this.poSyncObjective(); } catch (e) { console.warn('sync objective', e); }
    try {
      const po = this.state && this.state.playoff;
      if (po && po.started && !po.completed && this.refreshPlayoffStages723()) { this.persistQuietly(); this.renderAll(); }
    } catch (e) { console.warn('refresh stages', e); }
    return r;
  };

  /* ---------- 3. после вылета: по дням ---------- */
  /* Матч-центр: кнопки «Играть следующий матч» нет, если для нашей команды сезон закончен (не вышли в плей-офф или вылетели) */
  proto.poNoNextMatch = function () {
    const st = this.state; if (!st) return false;
    const my = st.teamId, po = st.playoff;
    if (st.matches.some(m => !m.played && !m.cancelled && (m.homeId === my || m.awayId === my))) return false;
    if (po && po.started && !po.completed) return !!this.poOutOfCup();
    if (po && po.completed) return po.championId !== my;
    // регулярный чемпионат: все матчи сыграны, но плей-офф ещё не стартовал — убираем кнопку, если выбывание уже ясно
    try {
      const mine = this.teamById(my), pts = (st.standings[my] || {}).pts || 0;
      const above = this.db.teams.filter(t => t.id !== my && t.conf === mine.conf && ((st.standings[t.id] || {}).pts || 0) > pts).length;
      return above >= 8;
    } catch (e) { return false; }
  };

  /* ---------- 3a. ожидание конца раунда: серия закрыта, остальные доигрывают ---------- */
  proto.poWaiting = function () {
    const po = this.state && this.state.playoff;
    if (!po || !po.started || po.completed || this.poOutOfCup()) return false;
    const my = this.state.teamId;
    return !this.state.matches.some(m => m.playoff && !m.played && !m.cancelled && (m.homeId === my || m.awayId === my));
  };
  // стадия, которую ждём: последняя завершённая серия нашей команды
  proto.poWaitInfo = function () {
    const my = this.state.teamId;
    const mine = allSeries(this).filter(s => (s.teamA === my || s.teamB === my) && s.complete).sort((a, b) => b.stage - a.stage)[0];
    if (!mine) return null;
    const ser = allSeries(this).filter(s => Number(s.stage) === Number(mine.stage));
    const exp = typeof this.__poExpectedSeriesCount723 === 'function' ? this.__poExpectedSeriesCount723(mine.stage) : ser.length;
    const total = Math.max(exp || 0, ser.length), left = ser.filter(s => !s.complete).length + Math.max(0, total - ser.length);
    const isA = mine.teamA === my;
    return { stage: mine.stage, total, left, wins: isA ? mine.winsA : mine.winsB, losses: isA ? mine.winsB : mine.winsA };
  };
  proto.poSkipDay = function () {
    if (!this.state || !this.poWaiting()) return;
    this.advanceDay();
    this.poAfterWait();
  };
  proto.poSkipToStageEnd = function () {
    if (!this.state || !this.poWaiting()) return;
    for (let g = 0; g < 120 && this.poWaiting(); g++) this.advanceDay();
    this.poAfterWait();
  };
  proto.poAfterWait = function () {
    try {
      if (this.state && !this.poWaiting() && this.state.playoff && !this.state.playoff.completed) {
        const my = this.state.teamId;
        const next = this.state.matches.filter(m => m.playoff && !m.played && !m.cancelled && (m.homeId === my || m.awayId === my)).sort((a, b) => a.dateOffset - b.dateOffset)[0];
        if (next && typeof this.setNotice === 'function') {
          const opp = next.homeId === my ? next.awayId : next.homeId;
          this.setNotice(`Раунд завершён. Определились пары: ${this.playoffStageName(next.playoffStage)}. Ваш соперник: ${name(this, opp)}. Игра 1: ${this.formatDate(next.dateOffset)}.`);
        }
      }
    } catch (e) {}
    this.persistQuietly(); this.renderAll();
  };
  const basePNM = proto.playNextMatch;
  proto.playNextMatch = function () {
    if (!this.state) return;
    const po = this.state.playoff;
    if (po && po.completed) { this.openSeasonSummary(); return; }
    if (po && po.started && !this.state.objectiveModal && this.poOutOfCup()) { this.advanceDay(); return; }
    if (po && po.started && !this.state.objectiveModal && this.poWaiting()) { this.poSkipDay(); return; }
    return basePNM.apply(this, arguments);
  };
  // 11.1.1: для клуба вне Кубка — симуляция до конца текущей стадии (пока не завершатся все серии этой стадии)
  proto.poSkipStageOut = function () {
    if (!this.state || !this.state.playoff || this.state.playoff.completed) return;
    const stageNow = () => { const ms = this.state.matches.filter(m => m.playoff && !m.played && !m.cancelled); return ms.length ? Math.min.apply(null, ms.map(m => Number(m.playoffStage) || 0)) : null; };
    const s0 = stageNow();
    for (let g = 0; g < 160; g++) {
      if (this.state.playoff.completed) break;
      this.advanceDay();
      const s = stageNow();
      if (s == null || s !== s0) break;
    }
    this.persistQuietly(); this.renderAll();
  };
  proto.poSkipToFinal = function () {
    if (!this.state || !this.state.playoff || this.state.playoff.completed) return;
    this.simulateCupToChampion();
    this.persistQuietly();
    this.renderAll();
  };
  proto.renderPlayoffToolbar = function () {
    const tb = $('playoffs-toolbar'); if (!tb || !this.state) return;
    const po = this.state.playoff;
    let key, html;
    if (po && po.completed) { key = 'done'; html = '<button class="btn btn-primary" onclick="app.openSeasonSummary()">📊 Итоги сезона</button>'; }
    else if (po && po.started && this.poOutOfCup()) { key = 'out'; html = '<button class="btn btn-primary" onclick="app.advanceDay()">▶ День вперёд</button><button class="btn btn-quiet" onclick="app.poSkipStageOut()">⏩ До конца стадии</button><button class="btn btn-quiet" onclick="app.poSkipToFinal()">⏩ До финала</button>'; }
    else if (po && po.started && this.poWaiting()) { key = 'wait'; html = '<button class="btn btn-primary" onclick="app.poSkipDay()">⏭ Промотать день</button><button class="btn btn-quiet" onclick="app.poSkipToStageEnd()">⏩ До конца стадии</button>'; }
    else { key = 'play'; html = '<button class="btn btn-primary" onclick="app.playNextMatch()">▶ Следующая игра</button>'; }
    if (tb.dataset && tb.dataset.mode === key) return;
    tb.innerHTML = html; if (tb.dataset) tb.dataset.mode = key;
  };
  const baseRP = proto.renderPlayoffs;
  proto.renderPlayoffs = function () {
    try { const po = this.state && this.state.playoff; if (po && po.started && !po.completed && this.refreshPlayoffStages723()) this.persistQuietly(); } catch (e) { console.warn(e); }
    const r = baseRP.apply(this, arguments);
    try { this.renderPlayoffToolbar(); } catch (e) {}
    try { this.renderPlayoffBannerWait(); } catch (e) {}
    return r;
  };
  proto.renderPlayoffBannerWait = function () {
    const banner = $('playoffs-banner'); const po = this.state && this.state.playoff;
    if (!banner || !po || !po.started || po.completed) return;
    if (this.poWaiting()) {
      const w = this.poWaitInfo();
      if (w) banner.innerHTML = `<b>Ваша серия завершена: ${w.wins > w.losses ? 'победа' : 'поражение'} ${w.wins}:${w.losses}.</b> Ждём завершения раунда: осталось ${w.left} из ${w.total} серий.`;
      return;
    }
    const my = this.state.teamId;
    const next = this.state.matches.filter(m => m.playoff && !m.played && !m.cancelled && (m.homeId === my || m.awayId === my)).sort((a, b) => a.dateOffset - b.dateOffset)[0];
    if (next && Number(next.gameNo) === 1 && Number(next.playoffStage) > 1) {
      const opp = next.homeId === my ? next.awayId : next.homeId;
      banner.innerHTML = `<b>Раунд завершён.</b> Определились пары: ${this.escape(this.playoffStageName(next.playoffStage))}. Ваш соперник: ${this.escape(name(this, opp))}. Игра 1: ${this.escape(this.formatDate(next.dateOffset))}.`;
    }
  };
  const baseRA = proto.renderAll;
  proto.renderAll = function () {
    const r = baseRA.apply(this, arguments);
    try { if (this.state && this.poSyncObjective()) this.ensurePendingObjectiveModalV71(); } catch (e) {}
    try {
      if (this.state && typeof document !== 'undefined' && document.querySelector) {
        const b = document.querySelector('.ov-actions .btn-primary');
        if (b) {
          const po = this.state.playoff;
          const waiting = !!(po && po.started && !po.completed && this.poWaiting());
          b.textContent = po && po.completed ? '📊 Итоги сезона' : (po && po.started && this.poOutOfCup() ? '▶ День вперёд' : waiting ? '⏭ Промотать день' : '▶ Играть следующий матч');
          const second = b.parentElement && b.parentElement.querySelector('.btn:not(.btn-primary)');
          if (second) second.hidden = waiting;
        }
      }
    } catch (e) {}
    return r;
  };

  /* ---------- 4. окно цели: отсчёт 5 с на вкладке «Плей-офф» ---------- */
  proto.objCountdown = function (ms) {
    try {
      const view = $('view-playoffs'); if (!view || !view.insertAdjacentElement) return;
      const old = $('obj-countdown'); if (old) old.remove();
      const el = document.createElement('div'); el.id = 'obj-countdown'; el.className = 'obj-countdown';
      el.innerHTML = '<div class="oc-row"><span class="oc-t"></span><button type="button" class="btn btn-quiet oc-skip" onclick="app.objShowNow()">Показать сейчас</button></div><div class="oc-bar"><i></i></div>';
      const head = view.querySelector('.section-head');
      if (head) head.insertAdjacentElement('afterend', el); else view.insertBefore(el, view.firstChild);
      const t0 = Date.now(), lab = el.querySelector('.oc-t'), bar = el.querySelector('i');
      const tick = () => { const used = Date.now() - t0; lab.textContent = 'Подводим итоги цели… ' + Math.max(0, Math.ceil((ms - used) / 1000)) + ' с'; bar.style.width = Math.min(100, used / ms * 100) + '%'; };
      tick();
      const iv = setInterval(() => { if (!document.body.contains(el)) { clearInterval(iv); return; } tick(); if (Date.now() - t0 >= ms + 300) { clearInterval(iv); el.remove(); } }, 200);
    } catch (e) {}
  };
  proto.objShowNow = function () {
    const s = this.state; if (!s) return;
    const el = $('obj-countdown'); if (el) el.remove();
    if (s.objectiveModal) return; // уже открыто другое окно цели: это подождёт в очереди
    let p = null;
    if (s.pendingObjectiveModalV71) {
      if (this._khl71ObjectiveTimer) { clearTimeout(this._khl71ObjectiveTimer); this._khl71ObjectiveTimer = null; }
      p = s.pendingObjectiveModalV71; delete s.pendingObjectiveModalV71;
    } else if (s.pendingRegularObjectiveModal725 && !s.pendingRegularObjectiveModal725.waitForPlayoffsTab) {
      if (this._khl725RegularModalTimer) { clearTimeout(this._khl725RegularModalTimer); this._khl725RegularModalTimer = null; }
      p = s.pendingRegularObjectiveModal725; delete s.pendingRegularObjectiveModal725;
    }
    if (p && !s.objectiveModal) s.objectiveModal = p.modal;
    this.persistQuietly(); this.renderAll();
    if (typeof this.renderObjectiveModal === 'function') this.renderObjectiveModal();
  };
  proto.ensurePendingObjectiveModalV71 = function () {
    const pending = this.state && this.state.pendingObjectiveModalV71;
    if (!pending || this._khl71ObjectiveTimer) return;
    if (activeTab() !== 'view-playoffs' || (this.liveMatch && !this.liveMatch.finished)) return;
    this.objCountdown(5000);
    this._khl71ObjectiveTimer = setTimeout(() => {
      this._khl71ObjectiveTimer = null;
      if (!this.state || this.state.pendingObjectiveModalV71 !== pending) return;
      if (activeTab() !== 'view-playoffs') { const el = $('obj-countdown'); if (el) el.remove(); return; }
      this.objShowNow();
    }, 5000);
  };
  const baseCOM = proto.closeObjectiveModal;
  proto.closeObjectiveModal = function () {
    const r = baseCOM.apply(this, arguments);
    setTimeout(() => { try { if (this.state) this.ensurePendingObjectiveModalV71(); } catch (e) {} }, 350);
    return r;
  };
  const baseST = proto.switchTab;
  proto.switchTab = function (name) {
    const r = baseST.apply(this, arguments);
    if (name === 'playoffs' && this.state) { try { this.ensurePendingObjectiveModalV71(); } catch (e) {} }
    return r;
  };

  /* ---------- 5. «Итоги сезона» ---------- */
  proto.seasonSummaryHtml = function () {
    const e = s => this.escape(s);
    const po = this.state.playoff, my = this.state.teamId, champ = this.teamById(po.championId);
    const fin = allSeries(this).find(s => Number(s.stage) === 4 && s.complete);
    const finText = fin ? `Финал: ${name(this, fin.teamA)} ${fin.winsA}:${fin.winsB} ${name(this, fin.teamB)}` : '';
    const st = (this.state.standings || {})[my] || {};
    const path = [];
    path.push(`Регулярный чемпионат: ${this.conferenceRank(my)}-е место в конференции, ${st.pts == null ? '—' : st.pts} очк.`);
    const mine = allSeries(this).filter(s => s.teamA === my || s.teamB === my).sort((a, b) => a.stage - b.stage);
    if (!mine.length) path.push('В плей-офф команда не попала.');
    mine.forEach(s => {
      const isA = s.teamA === my, w = isA ? s.winsA : s.winsB, l = isA ? s.winsB : s.winsA, opp = name(this, isA ? s.teamB : s.teamA);
      path.push(`${this.playoffStageName(s.stage)}: ${s.winnerId === my ? 'победа' : 'поражение'} ${w}:${l} ${s.winnerId === my ? 'над' : 'от'} ${opp}`);
    });
    if (po.championId === my) path.push('Кубок Гагарина завоёван.');
    const goals = [];
    try { const t = this.teamObjectiveInfo(); goals.push(`Регулярный чемпионат: ${t.title}. ${t.status}`); } catch (x) {}
    try { if (this.state.playoffObjective && this.state.playoffObjective.selected) { const p = this.playoffObjectiveInfo(); goals.push(`Кубок Гагарина: ${p.title}. ${p.status}`); } else if (mine.length) goals.push('Кубок Гагарина: цель не выбрана.'); } catch (x) {}
    const block = (t, lines) => `<div class="ss-block"><b>${e(t)}</b>${lines.map(l => `<div class="small">${e(l)}</div>`).join('')}</div>`;
    return `<div class="ss-card" role="dialog" aria-modal="true" aria-label="Итоги сезона"><div class="ss-eyebrow">Итоги сезона 2026/27</div>`
      + `<div class="ss-champ"><span class="ss-cup">🏆</span><div><b>Чемпион Кубка Гагарина: ${e(champ ? champ.name : '—')}</b><div class="small muted">${e(finText)}</div></div></div>`
      + block('Твой путь', path) + block('Цели', goals.length ? goals : ['—'])
      + `<div class="ss-actions"><button class="btn btn-primary" onclick="app.closeSeasonSummary(true)">📈 Статистика сезона</button><button class="btn btn-quiet" onclick="app.closeSeasonSummary(false)">Закрыть</button></div>`
      + `<p class="small muted ss-hint">Чтобы увидеть полную статистику сезона, нажми на кнопку «Статистика сезона».</p></div>`;
  };
  proto.openSeasonSummary = function () {
    if (!this.state || !this.state.playoff || !this.state.playoff.completed) return;
    const old = $('season-summary-overlay'); if (old) old.remove();
    const el = document.createElement('div'); el.id = 'season-summary-overlay'; el.className = 'ss-overlay';
    el.innerHTML = this.seasonSummaryHtml(); document.body.appendChild(el);
  };
  proto.closeSeasonSummary = function (toStats) {
    const el = $('season-summary-overlay'); if (el) el.remove();
    if (toStats) this.switchTab('stats');
  };

  /* ---------- 6. новости плей-офф ---------- */
  const skipDay = fn => function (date) {
    try { const ms = this.matchesOnDate ? this.matchesOnDate(date) : []; if (ms.length && ms[0].playoff) return null; } catch (e) {}
    return fn.apply(this, arguments);
  };
  if (proto.ensureAnons) proto.ensureAnons = skipDay(proto.ensureAnons);
  if (proto.publishResultsDigest) proto.publishResultsDigest = skipDay(proto.publishResultsDigest);

  proto.publishPlayoffStageStartNews = function (stage) {
    if (!this.state || typeof this.publishNews !== 'function') return null;
    const exp = typeof this.__poExpectedSeriesCount723 === 'function' ? this.__poExpectedSeriesCount723(stage) : ({ 1: 8, 2: 4, 3: 2, 4: 1 })[stage];
    const ser = allSeries(this).filter(s => Number(s.stage) === Number(stage));
    if (!exp || ser.length < exp || ser.some(s => (s.gameResults || []).length)) return null;
    const dateOf = s => { const g = this.state.matches.find(m => m.id === `${s.id}_g1`); return g ? Number(g.dateOffset) : null; };
    const groups = [['west', 'Запад'], ['east', 'Восток'], ['overall', '']];
    const lines = [];
    groups.forEach(([c, label]) => {
      const part = ser.filter(s => (s.conference || 'overall') === c); if (!part.length) return;
      if (label) lines.push(label + ':');
      part.forEach(s => {
        const d = dateOf(s);
        lines.push(`${s.seedA ? '(' + s.seedA + ') ' : ''}${name(this, s.teamA)} — ${s.seedB ? '(' + s.seedB + ') ' : ''}${name(this, s.teamB)}${d == null ? '' : ' · игра 1: ' + this.formatDate(d)}`);
      });
    });
    lines.push('Серии до четырёх побед.');
    const stageName = this.playoffStageName(stage);
    return this.publishNews({ key: `po-start:${stage}`, category: 'playoff', icon: '🏆', tag: 'Старт стадии', headline: `Определились пары: ${stageName} Кубка Гагарина`, body: lines.join('\n'), dateOffset: this.state.dayIndex, teamIds: [], scope: 'league' });
  };
  proto.publishPlayoffGameDigest = function (stage, n) {
    if (!this.state || typeof this.publishNews !== 'function') return null;
    const ms = this.state.matches.filter(m => m.playoff && Number(m.playoffStage) === Number(stage) && Number(m.gameNo) === Number(n) && !m.cancelled);
    if (!ms.length || ms.some(m => !m.played)) return null;
    const series = allSeries(this);
    const lines = ms.slice().sort((a, b) => a.dateOffset - b.dateOffset).map(m => {
      const s = series.find(x => x.id === m.seriesId);
      let tail = '';
      if (s) {
        let wa = 0, wb = 0;
        (s.gameResults || []).filter(g => Number(g.gameNo) <= Number(n)).forEach(g => { const w = g.homeScore > g.awayScore ? g.homeId : g.awayId; if (w === s.teamA) wa++; else if (w === s.teamB) wb++; });
        const hi = Math.max(wa, wb), lo = Math.min(wa, wb), leader = wa > wb ? s.teamA : s.teamB;
        tail = hi >= 4 ? ` · ${name(this, leader)} выиграл серию ${hi}:${lo}` : wa === wb ? ` · серия ${wa}:${wb}` : ` · ${name(this, leader)} ведёт ${hi}:${lo}`;
      }
      return `${name(this, m.homeId)} ${m.homeScore}:${m.awayScore} ${name(this, m.awayId)}${m.ot ? ' (ОТ)' : ''}${tail}`;
    });
    const last = Math.max(...ms.map(m => Number(m.dateOffset)));
    return this.publishNews({ key: `po-game:${stage}:${n}`, category: 'result', icon: '📋', tag: `Итоги игры ${n}`, headline: `${this.playoffStageName(stage)}: итоги игры ${n}`, body: lines.join('\n'), dateOffset: last, teamIds: [], scope: 'league' });
  };
  const stageNews = app => { try { for (let st = 1; st <= 4; st++) app.publishPlayoffStageStartNews(st); } catch (e) { console.warn('stage news', e); } };
  const baseCPS = proto.createPlayoffStage;
  proto.createPlayoffStage = function () { const r = baseCPS.apply(this, arguments); stageNews(this); return r; };
  // Лишние серии стадии (баг 9.20: пары пересчитывались по временной таблице во время записи матча) убираем: остаются сыгранные и «правильные» по посеву.
  proto.poDedupeStages = function () {
    const po = this.state && this.state.playoff; if (!po || !po.started || this._poStandSwapped) return false;
    let changed = false;
    for (let stage = 2; stage <= 4; stage++) {
      const exp = ({ 2: 4, 3: 2, 4: 1 })[stage], list = allSeries(this).filter(s => Number(s.stage) === stage);
      if (list.length <= exp) continue;
      const played = s => (s.gameResults || []).length > 0 || this.state.matches.some(m => m.seriesId === s.id && m.played && !m.cancelled);
      const prev = allSeries(this).filter(s => Number(s.stage) === stage - 1 && s.complete && s.winnerId);
      let canon = new Set();
      try { this.__poPairWinners723(prev.map(s => s.winnerId)).forEach(p => { canon.add(p.teamA + '|' + p.teamB); canon.add(p.teamB + '|' + p.teamA); }); } catch (e) {}
      if (!canon.size) continue;
      const drop = new Set(list.filter(s => !played(s) && !canon.has(s.teamA + '|' + s.teamB)).map(s => s.id));
      if (!drop.size) continue;
      po.series = (po.series || []).filter(s => !drop.has(s.id));
      (po.history || []).forEach(h => { if (h.series) h.series = h.series.filter(s => !drop.has(s.id)); });
      this.state.matches = this.state.matches.filter(m => !drop.has(m.seriesId));
      changed = true;
    }
    if (changed) this.persistQuietly();
    return changed;
  };
  const baseRef = proto.refreshPlayoffStages723;
  proto.refreshPlayoffStages723 = function () {
    if (this._poStandSwapped) return false;          // таблица временно подменена на время записи матча плей-офф
    try { this.poDedupeStages(); } catch (e) { console.warn('dedupe stages', e); }
    const r = baseRef.apply(this, arguments); if (r) stageNews(this); return r;
  };
  const baseRepair = proto.repairSave;
  if (typeof baseRepair === 'function') proto.repairSave = function () { const r = baseRepair.apply(this, arguments); try { this.poDedupeStages(); } catch (e) {} return r; };
  const baseRPR = proto.recordPlayoffResult;
  proto.recordPlayoffResult = function (match) {
    const r = baseRPR.apply(this, arguments);
    try { this.poSyncObjective(); } catch (e) {}
    try { if (match && match.playoff) for (let n = 1; n <= 7; n++) this.publishPlayoffGameDigest(match.playoffStage, n); } catch (e) { console.warn('game digest', e); }
    return r;
  };
})();

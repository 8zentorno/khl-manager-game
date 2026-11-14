/* KHL Manager 14.7.5 — переход в новый сезон (модель).
 *
 * Как устроено. После Кубка Гагарина игрок проходит мастер: 1 «Итоги», 2 «Контракты» (в старом сезоне), затем переход (trRollover):
 * строится новое состояние createState(), в него переносится всё постоянное (рынок, игроки, развитие, составы, новости, карьера),
 * а дни переводятся в отрицательные: межсезонье идёт с dayIndex < 0, старт нового чемпионата — dayIndex 0 (3 сентября).
 * Дальше 3 «Возраст и сборы», 4 «Прощание», 5 «Рынок» и сама игра по ключевым датам до старта сезона.
 * Новых игроков не создаётся: пополнение идёт только из реальных свободных агентов.
 */
(function () {
  'use strict';
  if (typeof KHLManagerApp === 'undefined') return;
  const proto = KHLManagerApp.prototype;
  const FA = 'FA', RET = 'RET';
  const SEASONS = 5, POOL_CAP = 260, EXCL_DAYS = 7, SUMMER_SCALE = 0.65;
  const RET_TABLE = { 38: 0.03, 39: 0.10, 40: 0.35, 41: 0.65 };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const grp = pos => (pos === 'LW' || pos === 'RW') ? 'W' : pos;
  const DAY = 86400000;
  const FOCUS = {
    balance: { name: 'Баланс', hint: 'Ровное развитие по всем линиям. Без прорывов, но и без провалов.' },
    attack: { name: 'Атака', hint: 'Нападающие ставят бросок, защитники — пас. Лучше реализация моментов в чужой зоне.' },
    defense: { name: 'Защита', hint: 'Все оттачивают оборонительную игру, вратари — технику.' },
    physical: { name: 'Физика', hint: 'Упор на выносливость. Возрастной спад у игроков 29+ замедляется на 30%.' },
    youth: { name: 'Молодёжь', hint: 'Особая программа для игроков до 22 лет: рост характеристик ускоряется на 30%.' }
  };
  proto.TR_FOCUS = FOCUS;
  proto.SEASONS_TOTAL = SEASONS;

  /* ------------------------------------------------------------------ вспомогательное */
  proto.seasonLabel = function (n) {
    n = Number(n) || (this.state && this.state.seasonNumber) || 1;
    const y = 2026 + n - 1; return y + '/' + String(y + 1).slice(-2);
  };
  proto.ofs = function () { const o = this.state && this.state.offseason; return o && o.active ? o : null; };
  proto.trDayOf = function (y, mo, d) { return Math.round((Date.UTC(y, mo - 1, d, 12) - this.seasonStartMs()) / DAY); };
  proto.trStartYear = function () { return new Date(this.seasonStartMs()).getUTCFullYear(); };
  proto.trKeyDates = function () {
    const y = this.trStartYear(), o = this.ofs(), L = [];
    if (o && o.exclusive && !o.exclusive.done) L.push({ day: o.exclusive.until, label: 'Конец эксклюзивного окна на своих игроков', short: 'конец эксклюзива' });
    L.push({ day: this.trDayOf(y, 7, 1), label: '1 июля: новые контракты вступают в силу', short: '1 июля' });
    L.push({ day: this.trDayOf(y, 8, 1), label: '1 августа: начало сборов', short: '1 августа' });
    L.push({ day: this.trDayOf(y, 8, 27), label: '27 августа: закрывается окно расторжения', short: '27 августа' });
    L.push({ day: 0, label: '3 сентября: старт чемпионата', short: 'старт' });
    return L.sort((a, b) => a.day - b.day);
  };
  proto.trNextKeyDate = function () { const d = Number(this.state.dayIndex || 0); return this.trKeyDates().find(k => k.day > d) || null; };
  proto.trJuly1 = function () { return this.trDayOf(this.trStartYear(), 7, 1); };
  proto.trNews = function (headline, body, teamIds, tag, icon) {
    try { if (this.publishNews) this.publishNews({ category: 'transfer', icon: icon || '📅', key: `season:${this.state.seasonNumber}:${this.state.dayIndex}:${headline}`, headline, body, teamIds: teamIds || [], tag: tag || 'Межсезонье' }); } catch (e) { }
  };
  proto.marketAiLimit = function () {
    const o = this.ofs();
    return o && Number(this.state.dayIndex || 0) < this.trJuly1() ? 6 : 2;
  };

  /* ------------------------------------------------------------------ итоги сезона для мастера и карьеры */
  proto.trSummary = function () {
    const st = this.state, my = st.teamId, po = st.playoff || {};
    const ss = st.standings[my] || {};
    let finish = ''; try { const s = this.seasonSummaryData(); finish = s ? s.playoffFinish : ''; } catch (e) { }
    const goals = [];
    try { const t = this.teamObjectiveInfo(); goals.push(`Регулярный чемпионат: ${t.title}. ${t.status}`); } catch (e) { }
    try { if (st.playoffObjective && st.playoffObjective.selected) { const p = this.playoffObjectiveInfo(); goals.push(`Кубок Гагарина: ${p.title}. ${p.status}`); } } catch (e) { }
    return {
      n: st.seasonNumber || 1, label: this.seasonLabel(st.seasonNumber), club: (this.teamById(my) || {}).name || my,
      place: this.conferenceRank ? this.conferenceRank(my) : 0, pts: ss.pts || 0, finish, goals,
      champion: po.championId ? (this.teamById(po.championId) || {}).name || '' : '', champ: po.championId === my,
      best: this.trBestPlayers(3)
    };
  };
  proto.trBestPlayers = function (n) {
    const st = this.state, rows = this.teamPlayers(st.teamId).map(p => {
      const s = st.playerStats[p.id] || {};
      return p.pos === 'G' ? { id: p.id, name: p.name, pos: p.pos, v: (s.goalieW || 0) * 2 + (s.shutouts || 0) * 3, t: `${s.goalieW || 0} поб.` }
        : { id: p.id, name: p.name, pos: p.pos, v: s.pts || 0, t: `${s.g || 0}+${s.a || 0}=${s.pts || 0}` };
    });
    return rows.sort((a, b) => b.v - a.v).slice(0, n);
  };
  proto.trCareerEntry = function () {
    const e = this.buildSeasonHistoryEntry(), b = this.trBestPlayers(3);
    return { n: this.state.seasonNumber || 1, label: e.label, club: e.club, place: e.place, pts: e.pts, playoff: e.playoff, champ: e.championId === (this.state.initialTeamId || this.state.teamId), champion: e.champion, best: b.map(x => ({ name: x.name, pos: x.pos, t: x.t, v: x.v })) };
  };

  /* ------------------------------------------------------------------ шаг 2: контракты своих игроков (старый сезон) */
  proto.trExpiring = function (teamId) {
    const Y = this.seasonEndYear();
    return this.teamPlayers(teamId || this.state.teamId).filter(p => Number(p.contractUntil) <= Y && !p.nextSalary).sort((a, b) => this.permanentOVR(b) - this.permanentOVR(a));
  };
  proto.trRank = function (p) {
    const g = grp(p.pos), list = this.teamPlayers(p.teamId).filter(x => grp(x.pos) === g).sort((a, b) => this.permanentOVR(b) - this.permanentOVR(a));
    return { rank: list.findIndex(x => x.id === p.id) + 1, of: list.length, need: { C: 4, W: 8, D: 6, G: 2 }[g] };
  };
  // рекомендация помощника: словами и ключом действия
  proto.trRecommend = function (p) {
    const age = Math.floor(this.ageOn(p, this.currentDateMs())), ovr = this.permanentOVR(p), r = this.trRank(p);
    const room = this.capStatus(this.state.teamId).room;
    if (age >= 36 && ovr < 78) return { key: 'free', text: 'Возраст и спад: лучше отпустить' };
    if (r.rank <= Math.max(1, Math.floor(r.need / 3)) || (age <= 23 && ovr >= 68)) return { key: 'ext', text: age <= 23 ? 'Молодой и растёт: продлевать' : 'Один из лучших на позиции: продлевать' };
    if (r.rank > r.need + 1 && ovr < 66) return { key: 'free', text: 'Не в основе и слабый: можно отпустить' };
    if (room < this.askSalary(p)) return { key: 'cheap', text: 'Нужна экономия: только дешевле' };
    return { key: 'cheap', text: age >= 31 ? 'Ветеран: продлевать на год и дешевле' : 'Нужен в составе: можно продлить, торгуйся' };
  };
  proto.trLetGo = function (pid, on) {
    const os = this.state; os.trDraft = os.trDraft || { letGo: {} };
    if (on === false) delete os.trDraft.letGo[pid]; else os.trDraft.letGo[pid] = 1;
    this.persistQuietly && this.persistQuietly();
  };
  // быстрое предложение: «Дешевле» — 85% запроса на 1 год (или срок, который хочет игрок, если он молод)
  proto.trQuickOffer = function (pid, cheap) {
    const p = this.marketPlayer(pid); if (!p) return { ok: false, text: 'Игрок не найден.' };
    const ask = this.askSalary(p), age = Math.floor(this.ageYears(p));
    const type = age <= 20 ? '3-way' : (p.contract === '1-way' ? '1-way' : '2-way');
    const salary = Math.max(this.MARKET.minWage, Math.round(ask * (cheap ? 0.85 : 1) / 500000) * 500000);
    const years = cheap ? Math.min(2, this.wantYears(p)) : this.wantYears(p);
    const r = this.negotiate(pid, this.state.teamId, { salary, years, type, promises: [], round: 0 }, 'ext');
    if (r.ok && r.done) this.trLetGo(pid, false);
    return r;
  };

  /* ------------------------------------------------------------------ переход */
  proto.trShiftDays = function (m, shift) {
    const sh = v => (v == null ? v : v - shift);
    (m.log || []).forEach(x => { x.day = sh(x.day); });
    (m.transfers || []).forEach(x => { x.day = sh(x.day); });
    (m.results || []).forEach(x => { x.day = sh(x.day); });
    (m.promises || []).forEach(x => { x.day = sh(x.day); });
    (m.requests || []).forEach(x => { x.day = sh(x.day); x.until = sh(x.until); });
    Object.keys(m.cooldown || {}).forEach(k => { m.cooldown[k] = sh(m.cooldown[k]); });
    (m.thinking || []).forEach(x => { x.start = sh(x.start); x.until = sh(x.until); if (x.seenDay != null) x.seenDay = sh(x.seenDay); (x.rivals || []).forEach(r => { r.day = sh(r.day); }); });
    Object.values(m.players || {}).forEach(p => { if (p.freeSince != null) p.freeSince = sh(p.freeSince); });
    this.db.players.forEach(p => { if (p.freeSince != null) p.freeSince = sh(p.freeSince); });
  };
  proto.retireChance = function (p, ageAtStart) {
    let c = ageAtStart >= 42 ? 1 : (RET_TABLE[ageAtStart] || 0);
    if (!c) return 0;
    if (c < 1) { const o = this.permanentOVR(p); c *= o < 60 ? 2 : o < 65 ? 1.5 : o >= 80 ? 0.6 : 1; }
    return clamp(c, 0, 1);
  };
  proto.trRetire = function (p, why) {
    const m = this.mk(); this.marketOwn(p);
    const from = p.teamId, t = this.teamById(from);
    p.prevTeam = from; p.teamId = RET; p.contractUntil = null; delete p.nextSalary;
    const i = this.db.players.indexOf(p); if (i >= 0) this.db.players.splice(i, 1);
    if (m) m.promises.filter(x => x.pid === p.id && x.status === 'active').forEach(x => { x.status = 'void'; });
    this._mkPow = null;
    if (from === this.state.teamId && this.refillSlotsWithout) { try { this.refillSlotsWithout(p.id); } catch (e) { } }
    if (from === this.state.teamId || this.permanentOVR(p) >= 75) {
      this.marketLog(`{p:${p.id}} (${this.positionLabel(p.pos)}) завершил карьеру${why ? ' (' + why + ')' : ''}`, from === this.state.teamId ? 'mine' : 'info');
      this.trNews(`${p.name} завершает карьеру`, `${p.name} (${this.positionLabel(p.pos)}, ${t ? t.name : 'свободный агент'}) объявил о завершении карьеры.`, from === FA ? [] : [from], 'Конец карьеры', '🎗️');
    }
  };
  // клуб ИИ продлевает контракты своих игроков: вероятность зависит от места в составе, возраста и денег
  proto.trAiChance = function (p, info) {
    const age = Math.floor(this.ageOn(p, this.seasonStartMs()));
    let c = 80;
    if (info.rank <= 1) c += 12;
    if (info.rank > info.need) c -= 20;
    if (age < 24) c += 8;
    c -= age >= 38 ? 35 : age >= 35 ? 20 : 0;
    return clamp(c, 20, 97);
  };
  proto.trAiResign = function (oldY) {
    const my = this.state.teamId, rep = { renewed: 0, left: 0 }, pending = {};
    for (const t of this.db.teams) {
      if (t.id === my) continue;
      const exp = this.teamPlayers(t.id).filter(p => Number(p.contractUntil) <= oldY);
      if (!exp.length) continue;
      let pay = this.teamPlayers(t.id).reduce((s, p) => s + (Number(p.nextSalary) || p.salary), 0);
      const roll = exp.map(p => ({ p, ask: this.askSalary(p), info: this.trRank(p) })).sort((a, b) => a.ask - b.ask);
      for (const { p, ask, info } of roll) {
        const keep = Math.random() * 100 < this.trAiChance(p, info);
        if (!keep) { this.trToMarket(p, 'контракт истёк'); rep.left++; continue; }
        const cur = p.salary, over = pay - cur + ask > this.MARKET.cap;
        const sal = over ? Math.min(ask, cur) : ask;
        const years = clamp(this.wantYears(p), 1, 4);
        this.marketOwn(p);
        p.contractUntil = oldY + years; p.nextSalary = sal;
        pay += sal - cur; rep.renewed++;
      }
    }
    return rep;
  };
  proto.trToMarket = function (p, why) {
    const m = this.mk(), from = p.teamId;
    this.marketOwn(p);
    this.marketTransfer(p, 'out', from, FA, { note: why || '' });
    p.prevTeam = from; p.teamId = FA; p.contractUntil = null; p.freeSince = Number(this.state.dayIndex || 0); delete p.nextSalary;
    const i = this.db.players.indexOf(p); if (i >= 0) this.db.players.splice(i, 1);
    if (from === this.state.teamId) {
      if (this.refillSlotsWithout) { try { this.refillSlotsWithout(p.id); } catch (e) { } }
      if (this.state.farm) delete this.state.farm[p.id];
      m.promises.filter(x => x.pid === p.id && x.status === 'active').forEach(x => { x.status = 'void'; });
    }
    this._mkPow = null;
  };

  proto.trPreSave = function () {
    try {
      if (!this.slotStore || !this.serializeState) return Promise.resolve(false);
      const json = this.serializeState(this.state), meta = this.buildSlotMeta(this.state, json, 'pre');
      meta.savedAt = Date.now(); meta.preSeason = this.state.seasonNumber || 1;
      return this.slotStore.put({ id: 'pre', meta, json }).then(() => { this.slotMeta['pre'] = meta; return true; }).catch(() => false);
    } catch (e) { return Promise.resolve(false); }
  };

  proto.trRollover = function () {
    const os = this.state;
    if (!os || !os.playoff || !os.playoff.completed || os.offseason || !this.mk()) return false;
    const letGo = ((os.trDraft || {}).letGo) || {};
    try { this.trPreSave(); } catch (e) { }
    // 1. итоги сезона в архив и в карьеру
    this.recordSeasonHistory();
    const sum = this.trSummary();
    os.career = (os.career || []).filter(e => e.n !== sum.n);
    os.career.push(this.trCareerEntry());
    // 2. обещания
    try { if (!this.mk().review) this.marketSeasonReview(); this.marketCupReview(); } catch (e) { }
    const oldY = this.seasonEndYear(), oldMs = this.seasonStartMs(), oldDay = Number(os.dayIndex || 0);
    const newStart = (new Date(oldMs).getUTCFullYear() + 1) + '-09-03';
    const shift = Math.round((Date.parse(newStart + 'T12:00:00Z') - oldMs) / DAY);
    const myExpiring = this.trExpiring(os.teamId).map(p => p.id);
    const wasPaid = this.teamPayroll(os.teamId);
    // 3. новое состояние
    const ns = this.createState(os.teamId);
    const KEEP = ['teamId', 'initialTeamId', 'market', 'news', 'newsMeta', 'plog', 'matchSeed', 'permLog', 'vacant', 'vacantSp', 'tactics', 'chem', 'preMatchTac', 'lineAssignments', 'slotAssignments', 'starterGoalieId', 'specialTeams', 'playerDevelopment', 'createdAt', 'dbVersion', 'farm', 'slotId', 'savedAt', 'career', 'seasonHistory'];
    KEEP.forEach(k => { if (os[k] !== undefined) ns[k] = os[k]; });
    const SKIP = new Set(['version', 'dayIndex', 'seasonStart', 'standings', 'playerStats', 'matches', 'playoff', 'calendar', 'seasonFinished', 'seasonHistoryRecorded', 'seasonHistoryArchived', 'teamObjective', 'playoffObjective', 'objectiveModal', 'lastMatchId', 'seasonNumber', 'scheduleOptimizationVersion', 'trWiz', 'trDraft', 'offseason', 'pendingRegularObjectiveModal725', 'pendingObjectiveModalV71', 'summer']);
    Object.keys(os).forEach(k => { if (!(k in ns) && !SKIP.has(k)) ns[k] = os[k]; });
    if (os.plog) { ns.plog = { ...os.plog, j: {}, moKey: null }; if (ns.plog.mo) Object.keys(ns.plog.mo).forEach(id => { if (ns.plog.mo[id].length > 36) ns.plog.mo[id] = ns.plog.mo[id].slice(-36); }); }      // журнал матчей прошлого сезона не переносим
    ns.seasonNumber = (os.seasonNumber || 1) + 1;
    ns.seasonStart = newStart; ns.dayIndex = oldDay - shift;
    ns.seasonHistoryRecorded = false; ns.seasonHistoryArchived = false; ns.seasonFinished = false;
    ns.teamObjective = { type: 'playoffs', selected: true, evaluated: false, completed: null, hold: true };
    ns.news = (os.news || []).map(n => ({ ...n, dateOffset: (Number(n.dateOffset) || 0) - shift }));
    this.state = ns;
    try { document.querySelectorAll('.objective-modal-overlay').forEach(e => e.remove()); } catch (e) { }   // окна целей старого сезона
    this.trClearNotice();
    const m = ns.market;
    this.trShiftDays(m, shift);
    if (ns.permLog) Object.keys(ns.permLog).forEach(id => { ns.permLog[id] = (ns.permLog[id] || []).map(r => [r[0] - shift, r[1]]); });
    m.capCharges = m.capChargesNext || {}; m.capChargesNext = {};
    m.review = false; m.lastTeamGp = null; m.lastSample = null; m.watch = {}; m.thinking = [];
    (m.requests || []).forEach(r => { if (r.status === 'open') r.status = 'closed'; });
    (m.promises || []).forEach(x => { if (x.status === 'active' && x.kind !== 'ext') x.status = 'void'; });
    // 4. завершение карьеры, свободные агенты, контракты
    const startMs = Date.parse(newStart + 'T12:00:00Z');
    const ofs = ns.offseason = {
      active: true, n: ns.seasonNumber, step: 3, wizard: true, focus: 'balance', prevTraining: {}, shift,
      exclusive: null, report: { summary: sum, wasPaid, expiring: myExpiring.slice(), retiring: [], retiredOther: 0, aiRenewed: 0, aiLeft: 0, poolLeft: 0, ovr0: {}, age0: {} }
    };
    const rep = ofs.report;
    const rets = [];
    [...this.db.players.slice(), ...this.marketPool()].forEach(p => {
      const age = Math.floor(this.ageOn(p, startMs)), c = this.retireChance(p, age);
      if (c && Math.random() < c) rets.push({ p, age, c });
    });
    rets.forEach(({ p, age, c }) => {
      if (p.teamId === ns.teamId) { this.marketOwn(p); p.retiring = true; rep.retiring.push({ pid: p.id, name: p.name, pos: p.pos, age, ovr: this.permanentOVR(p), chance: Math.round(c * 100) }); }
      else { this.trRetire(p, 'возраст'); rep.retiredOther++; }
    });
    // слабые и возрастные свободные агенты могут уйти из хоккея сами
    this.marketPool().forEach(p => {
      if (this.permanentOVR(p) < 60 || this.ageOn(p, startMs) > 33) { if (Math.random() < 0.35) { this.trRetire(p, 'не нашёл клуб'); rep.poolLeft++; } }
    });
    const rr = this.trAiResign(oldY); rep.aiRenewed = rr.renewed; rep.aiLeft = rr.left;
    // свои игроки: 7 дней эксклюзивного окна, отпущенные уходят сразу
    const pids = [];
    myExpiring.forEach(id => {
      const p = this.marketPlayer(id); if (!p || p.teamId !== ns.teamId || p.retiring) return;
      if (Number(p.contractUntil) > oldY) return;
      if (letGo[id]) this.trToMarket(p, 'не продлён'); else pids.push(id);
    });
    ofs.exclusive = { until: ns.dayIndex + EXCL_DAYS, pids, done: !pids.length };
    // пул не больше потолка: лишние слабейшие уходят
    const pool = this.marketPool().sort((a, b) => this.permanentOVR(b) - this.permanentOVR(a));
    pool.slice(POOL_CAP).forEach(p => { if (p.prevTeam !== ns.teamId) { this.trRetire(p, 'не нашёл клуб'); rep.poolLeft++; } });
    // 5. развитие: профиль по новому возрасту, лето даёт примерно треть годового роста
    this.trProfileAll(true);
    this.db.players.forEach(p => {
      const d = this.playerDev(p); if (!d) return;
      rep.ovr0[p.id] = this.permanentOVR(p);
      try { const f = this.createPlayerDevelopment(p); d.goal = f.goal; } catch (e) { }
      d.gamesPlayed = 0; d.gpSeen = 0; delete d.injury;
    });
    this.teamPlayers(ns.teamId).forEach(p => { rep.age0[p.id] = Math.floor(this.ageOn(p, startMs)); });
    this._mkPow = null;
    if (this.autoAssignNumbers) { try { this.autoAssignNumbers(false); } catch (e) { } }
    this.trNews(`Начало межсезонья ${this.seasonLabel(ns.seasonNumber)}`, `Клубы продлили ${rep.aiRenewed} контрактов, ${rep.aiLeft} игроков вышли на рынок, ${rep.retiredOther + rep.retiring.length} завершают карьеру.`, [], 'Межсезонье');
    this.marketLog(`Началось межсезонье: ${rep.aiLeft} игроков стали свободными агентами`, 'info');
    this.persistQuietly && this.persistQuietly();
    try { this.writeAutosave && this.writeAutosave(); } catch (e) { }
    return true;
  };

  // профиль развития по возрасту на старт нового сезона; на лето ставит коэффициент
  proto.trProfileAll = function (summer) {
    const o = this.ofs();
    for (const p of this.db.players) {
      const d0 = this.state.playerDevelopment[p.id]; if (!d0) continue;
      d0.rl = 1; d0.am = 0;
      const d = this.playerDev(p); if (!d) continue;
      if (summer) {
        let pr = SUMMER_SCALE, dc = SUMMER_SCALE;
        const age = this.ageOn(p, this.seasonStartMs());
        if (o && o.focus === 'youth' && age < 22) pr *= 1.3;
        if (o && o.focus === 'physical') dc *= 0.7;
        d.profileRate *= pr; d.declinePerDay *= dc; d.sm = 1;
      }
    }
  };

  /* ------------------------------------------------------------------ шаг 3: сборы */
  proto.trSetFocus = function (key) {
    const o = this.ofs(); if (!o || !FOCUS[key]) return;
    o.focus = key;
    this.trApplyFocus();
    this.persistQuietly && this.persistQuietly();
  };
  proto.trApplyFocus = function () {
    const o = this.ofs(); if (!o) return;
    const f = o.focus, my = this.state.teamId;
    this.teamPlayers(my).forEach(p => {
      const d = this.playerDev(p); if (!d) return;
      if (o.prevTraining[p.id] == null) o.prevTraining[p.id] = d.training;
      const g = grp(p.pos);
      d.training = f === 'attack' ? (g === 'D' ? 'passing' : g === 'G' ? 'goalkeeping' : 'shooting')
        : f === 'defense' ? (g === 'G' ? 'goalkeeping' : 'defense')
          : f === 'physical' ? 'conditioning' : 'balanced';
      if (f === 'balance') d.training = o.prevTraining[p.id] || 'balanced';
    });
    // коэффициенты роста/спада зависят от фокуса: пересчитываем профиль
    this.trProfileAll(true);
  };
  // прогноз на лето: «растёт / стабилен / спад» и оценка в очках
  proto.trForecast = function (p) {
    const d = this.playerDev(p); if (!d) return { dir: 0, v: 0 };
    const days = Math.max(1, -Number(this.state.dayIndex || 0));
    const up = d.profileRate > 0.06 ? d.profileRate * 1.3 * days / 250 : 0, down = d.declinePerDay > 0 ? d.declinePerDay * days : 0;
    const v = up - down;
    return { dir: v > 0.35 ? 1 : v < -0.35 ? -1 : 0, v: Math.round(v * 10) / 10 };
  };

  /* ------------------------------------------------------------------ шаг 4: прощание */
  proto.trRetiringList = function () {
    return this.teamPlayers(this.state.teamId).filter(p => p.retiring);
  };
  proto.trPersuade = function (pid) {
    const o = this.ofs(), p = this.marketPlayer(pid); if (!o || !p || !p.retiring) return null;
    o.rt = o.rt || {};
    if (o.rt[pid]) return o.rt[pid];
    const ok = Math.random() < 0.25;
    o.rt[pid] = ok ? 'stay' : 'gone';
    if (ok) { p.retiring = false; delete p.retiring; const d = this.playerDev(p); if (d) d.morale = clamp((d.morale == null ? 60 : d.morale) + 5, 0, 100); this.marketLog(`{p:${p.id}} (${this.positionLabel(p.pos)}) согласился сыграть ещё один год`, 'good'); }
    else this.trRetire(p, 'решение принято');
    this.persistQuietly && this.persistQuietly();
    return o.rt[pid];
  };
  proto.trHonor = function (pid) {
    const o = this.ofs(), p = this.marketPlayer(pid); if (!o || !p || !p.retiring) return;
    o.rt = o.rt || {}; o.rt[pid] = 'honor';
    this.trRetire(p, 'проводы с почестями');
    const m = this.mk(); m.rep = clamp(m.rep + 1, 0, 100);
    this.persistQuietly && this.persistQuietly();
  };
  proto.trFinalizeRetire = function () {
    this.trRetiringList().forEach(p => this.trRetire(p, 'возраст'));
  };

  /* ------------------------------------------------------------------ межсезонье по дням */
  proto.trApplyNewContracts = function () {
    let n = 0;
    this.db.players.forEach(p => { if (p.nextSalary) { p.salary = p.nextSalary; delete p.nextSalary; n++; } });
    this._mkPow = null;
    if (n) this.marketLog(`1 июля: вступили в силу ${n} новых контрактов`, 'info');
  };
  proto.trExclusiveEnd = function () {
    const o = this.ofs(); if (!o || !o.exclusive || o.exclusive.done) return;
    o.exclusive.done = true;
    const m = this.mk(); let left = 0, kept = 0;
    o.exclusive.pids.forEach(id => {
      const p = this.marketPlayer(id); if (!p || p.teamId !== this.state.teamId) return;
      if (Number(p.contractUntil) > this.seasonEndYear() - 1 || p.nextSalary) { kept++; return; }
      const pr = m.promises.find(x => x.pid === id && x.kind === 'ext' && x.status === 'active');
      if (pr) this.promiseBroken(pr, 'продление не оформлено');
      this.trToMarket(p, 'не продлён'); left++;
    });
    m.promises.filter(x => x.kind === 'ext' && x.status === 'active').forEach(x => { const p = this.marketPlayer(x.pid); if (p && Number(p.contractUntil) > this.seasonEndYear() - 1) { x.status = 'kept'; m.rep = clamp(m.rep + 2, 0, 100); } });
    if (left) { this.marketLog(`Эксклюзивное окно закрыто: ${left} игроков ушли на рынок`, 'info'); this.trNews('Эксклюзивное окно закрыто', `Игроки, с которыми не договорились о продлении, стали свободными агентами: ${left}.`, [this.state.teamId], 'Контракты'); }
    this.persistQuietly && this.persistQuietly();
  };
  proto.trSig = function () {
    const m = this.mk();
    return [this.openRequests().length, this.thinkingList().filter(x => !x.seen).length, (m.results || []).filter(x => !x.seen).length].join('|');
  };
  proto.trOneDay = function () {
    const st = this.state, o = this.ofs(); if (!o) return false;
    st.dayIndex = Number(st.dayIndex || 0) + 1;
    const day = st.dayIndex;
    if (day === this.trJuly1()) this.trApplyNewContracts();
    this.advancePlayerDays(1);
    if (o.exclusive && !o.exclusive.done && day >= o.exclusive.until) this.trExclusiveEnd();
    return true;
  };
  // mode: число дней | 'next' | 'start'. Останавливается на событиях: конкурирующие предложения, требования, ответы игроков.
  proto.offseasonAdvance = function (mode) {
    const o = this.ofs(); if (!o) return { moved: 0, why: '' };
    const st = this.state, day0 = Number(st.dayIndex || 0);
    let target = mode === 'start' ? 0 : mode === 'next' ? (this.trNextKeyDate() || { day: 0 }).day : day0 + Number(mode || 1);
    target = Math.min(0, target);
    const sig0 = this.trSig();
    let why = '';
    while (Number(st.dayIndex) < target) {
      this.trOneDay();
      if (this.trSig() !== sig0 && Number(st.dayIndex) < target) { why = 'event'; break; }
    }
    o.moved = (o.moved || 0) + (Number(st.dayIndex) - day0);
    this.persistQuietly && this.persistQuietly();
    return { moved: Number(st.dayIndex) - day0, why };
  };

  /* ------------------------------------------------------------------ старт сезона */
  proto.trFillSlots = function () {
    const slots = this.state.slotAssignments; if (!slots || !this.slotDefinitions) return 0;
    const my = this.state.teamId, ids = new Set(this.teamPlayers(my).map(p => p.id));
    const defs = this.slotDefinitions();
    defs.forEach(s => { if (slots[s.id] && !ids.has(slots[s.id])) slots[s.id] = ''; });
    const used = new Set(Object.values(slots).filter(Boolean));
    let n = 0;
    for (const s of defs) {
      if (slots[s.id]) continue;
      const ok = x => !used.has(x.id) && !this.isPlayerUnavailable(x) && (s.type === 'F' ? ['LW', 'C', 'RW'].includes(x.pos) : x.pos === s.type);
      const cand = this.teamPlayers(my).filter(ok).sort((a, b) => this.effectiveOVR(b) - this.effectiveOVR(a))[0];
      if (cand) { slots[s.id] = cand.id; used.add(cand.id); n++; }
    }
    if (this.syncLineAssignmentsFromSlots) { try { this.syncLineAssignmentsFromSlots(); } catch (e) { } }
    return n;
  };
  proto.trLineupGaps = function () {
    const slots = this.state.slotAssignments || {}, my = this.state.teamId, ids = new Set(this.teamPlayers(my).filter(p => !this.isPlayerUnavailable(p)).map(p => p.id));
    let defs = []; try { defs = this.slotDefinitions(); } catch (e) { }
    return defs.filter(s => !slots[s.id] || !ids.has(slots[s.id])).length;
  };
  // проверка готовности: только предупреждения
  proto.trReadiness = function () {
    const my = this.state.teamId, pl = this.teamPlayers(my), L = [];
    const cnt = { F: pl.filter(p => ['LW', 'C', 'RW'].includes(p.pos)).length, D: pl.filter(p => p.pos === 'D').length, G: pl.filter(p => p.pos === 'G').length };
    const cs = this.capStatus(my);
    L.push({ ok: cnt.F >= 12 && cnt.D >= 6 && cnt.G >= 2, text: `Состав: нападающих ${cnt.F} из 12, защитников ${cnt.D} из 6, вратарей ${cnt.G} из 2` });
    const gaps = this.trLineupGaps();
    L.push({ ok: gaps === 0, text: gaps ? `В звеньях не хватает игроков: ${gaps}. Расставь их или нажми «Заполнить»` : 'Звенья заполнены' });
    L.push({ ok: pl.length <= this.MARKET.maxRoster, text: `Заявка: ${pl.length} из ${this.MARKET.maxRoster} игроков` });
    L.push({ ok: !cs.over, text: cs.over ? `Фонд зарплат выше потолка на ${(Math.abs(cs.room) / 1e6).toFixed(1)} млн` : `Фонд зарплат в пределах потолка (${(cs.payroll / 1e6).toFixed(0)} млн)` });
    const exp = pl.filter(p => Number(p.contractUntil) <= this.seasonEndYear()).length;
    L.push({ ok: true, info: true, text: `Контракты истекают после сезона: ${exp}` });
    const inj = pl.filter(p => this.isPlayerUnavailable(p)).length;
    L.push({ ok: inj === 0, text: inj ? `Недоступны игроки: ${inj}` : 'Все игроки здоровы' });
    return L;
  };
  // безопасная сеть: клубу не хватает людей на позиции — подписываем слабейшего свободного агента (любой позиции), фиктивных игроков нет
  proto.trSafetyNet = function () {
    let n = 0;
    const m = this.mk(), floor = this.MARKET.floor;
    for (const t of this.db.teams) {
      if (t.id === this.state.teamId) continue;          // свой клуб укомплектовывает игрок, готовность покажет предупреждение
      for (let guard = 0; guard < 12; guard++) {
        const needs = this.marketNeeds(t.id), lack = Object.entries(needs).filter(([, v]) => v.short > 0);
        if (!lack.length) break;
        const [g] = lack[0];
        const pool = this.marketPool().filter(x => !this.thinkOf(x.id));
        const pick = pool.filter(x => grp(x.pos) === g).sort((a, b) => this.permanentOVR(a) - this.permanentOVR(b))[0] || pool.sort((a, b) => this.permanentOVR(a) - this.permanentOVR(b))[0];
        if (!pick) break;
        this.marketComplete(pick, t.id, { salary: this.MARKET.minWage, years: 1, type: '2-way', promises: [], round: 0, kind: 'fa' }, 'fa'); n++;
      }
    }
    void m; void floor;
    return n;
  };
  // нижняя граница фонда: разница распределяется между игроками пропорционально зарплате
  proto.trFloorTopUp = function () {
    const out = [];
    for (const t of this.db.teams) {
      const pl = this.teamPlayers(t.id), pay = pl.reduce((s, p) => s + (this.payrollOf ? this.payrollOf(p) : p.salary), 0) + ((this.mk().capCharges[t.id]) || 0);
      const need = this.MARKET.floor - pay;
      if (need <= 0 || !pl.length) continue;
      const tot = pl.reduce((s, p) => s + p.salary, 0) || 1;
      pl.forEach(p => { this.marketOwn(p); p.salary += Math.round(need * p.salary / tot / 100000) * 100000; });
      if (t.id === this.state.teamId) pl.forEach(p => { const d = this.playerDev(p); if (d) d.morale = clamp((d.morale == null ? 60 : d.morale) + 3, 0, 100); });
      out.push({ id: t.id, sum: need });
    }
    const mine = out.find(x => x.id === this.state.teamId);
    if (mine) this.trNews('Доплата до нижней границы фонда', `Фонд зарплат клуба ниже ${(this.MARKET.floor / 1e6).toFixed(0)} млн. Недостающие ${(mine.sum / 1e6).toFixed(1)} млн распределены между игроками (+ к настроению).`, [this.state.teamId], 'Финансы', '💰');
    return out;
  };
  proto.trClearNotice = function () {
    this.notice = '';
    try { const n = document.getElementById('last-result-note'); if (n) { n.textContent = ''; n.classList.add('hidden'); } } catch (e) { }
  };
  proto.trStartSeason = function () {
    const o = this.ofs(), st = this.state; if (!o) return false;
    if (Number(st.dayIndex) < 0) { this.offseasonAdvance('start'); }
    this.trExclusiveEnd();
    if (!st.market.capChargesNext) st.market.capChargesNext = {};
    this.trApplyNewContracts();
    this.trSafetyNet();
    const top = this.trFloorTopUp();
    // обычный профиль возраста на сезон, прежние тренировки возвращаются
    this.teamPlayers(st.teamId).forEach(p => { const d = this.playerDev(p); if (d && o.prevTraining[p.id]) d.training = o.prevTraining[p.id]; });
    this.trProfileAll(false);
    this.db.players.forEach(p => { const d = this.state.playerDevelopment[p.id]; if (d) delete d.sm; });
    const ovr1 = {}; this.db.players.forEach(p => { ovr1[p.id] = this.permanentOVR(p); });
    st.summer = { n: st.seasonNumber, rows: this.teamPlayers(st.teamId).map(p => ({ id: p.id, name: p.name, pos: p.pos, a: o.report.ovr0[p.id], b: ovr1[p.id], age: this.ageYears(p) })).filter(r => r.a != null), seen: false, topUp: top.some(x => x.id === st.teamId) };
    this.trFillSlots();
    delete st.offseason;
    this.trClearNotice();
    this._mkPow = null;
    this.marketLog(`Старт сезона ${this.seasonLabel(st.seasonNumber)}`, 'info');
    this.persistQuietly && this.persistQuietly();
    try { this.writeAutosave && this.writeAutosave(); } catch (e) { }
    return true;
  };

  // цель сезона выбирается после «Итогов лета»: до этого держим заглушку
  proto.trReleaseObjective = function () {
    const st = this.state; if (!st) return;
    if (st.teamObjective && st.teamObjective.hold) { st.teamObjective = { type: 'playoffs', selected: false, evaluated: false, completed: null }; st.objectiveModal = null; }
    this.persistQuietly && this.persistQuietly();
  };

  const _mci = proto.menuContinueInfo;
  if (_mci) proto.menuContinueInfo = function (save) {
    const i = _mci.apply(this, arguments);
    try { if (i && save) i.season = this.seasonLabel(save.seasonNumber || 1); } catch (e) { }
    return i;
  };
  const _tpi = proto.topPanelInfo;
  if (_tpi) proto.topPanelInfo = function () {
    const r = _tpi.apply(this, arguments);
    if (this.ofs && this.ofs()) { r.placeText = 'Межсезонье'; r.pointsText = `сезон ${this.state.seasonNumber} из ${SEASONS}`; r.streak = ''; }
    return r;
  };

  /* ------------------------------------------------------------------ защита обычных кнопок в межсезонье */
  ['advanceDay', 'playNextMatch'].forEach(name => {
    const base = proto[name];
    if (typeof base !== 'function') return;
    proto[name] = function () {
      if (this.ofs && this.ofs()) { try { this.setNotice('Сейчас межсезонье: листай даты в панели «Межсезонье» на главной.'); this.switchTab && this.switchTab('dashboard'); } catch (e) { } return; }
      return base.apply(this, arguments);
    };
  });
  const _apply = proto.marketApplyToDb;
  proto.marketApplyToDb = function () {
    _apply.apply(this, arguments);
    const m = this.mk(); if (m) this.db.players = this.db.players.filter(p => p.teamId !== RET);
  };
  // окно расторжения клубом: с начала межсезонья до 27 августа
  proto.clubTerminationWindow = function () {
    const o = this.ofs(), day = Number((this.state || {}).dayIndex || 0);
    const open = (this.state && this.state.offseason === true) || (!!o && day <= this.trDayOf(this.trStartYear(), 8, 27));
    return { open, reason: 'Клуб может расторгнуть контракт только в межсезонье: с окончания Кубка до 27 августа.' };
  };
})();

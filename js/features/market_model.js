/* KHL Manager 14.7 — рынок: свободные агенты, потолок и пол зарплат, переговоры, обещания, расторжение контрактов, подписания ИИ-клубов.
 *
 * Хранение. Игроки базы живут в памяти (this.db.players) и при загрузке строятся заново из KHL_DATABASE.
 * Всё, что рынок меняет, лежит в state.market:
 *   players  — «собственные» игроки рынка (свободные агенты, подписанные, продлённые, отпущенные); при загрузке они заменяют
 *              одноимённые записи базы; teamId === 'FA' значит «свободный агент» (в this.db.players такого игрока нет);
 *   promises — обещания клуба игрокам; requests — требования игроков (расторжение, уговоры);
 *   cooldown — после отказа игрок не ведёт переговоры до указанного дня; rep — репутация клуба (0–100);
 *   capCharges — компенсации при расторжении, которые идут в потолок текущего сезона; log — журнал рынка;
 *   watch — счётчики для обещаний о роли и требований (простой, настроение).
 * Рынок включается только в карьере (initNewCareer / repairSave); createState и регресс-тесты его не затрагивают. */
(function () {
  'use strict';
  if (typeof KHLManagerApp === 'undefined') return;
  const proto = KHLManagerApp.prototype;
  const FA = 'FA';
  const CAP = { cap: 950e6, floor: 525e6, deadline: '2027-01-31', maxRoster: 40, rounds: 3, thinkDays: 3, minAnswerDays: 2, cooldownDays: 30, persuadeDays: 14, minWage: 1e6 };
  const NEED = { C: 4, W: 8, D: 6, G: 2 };
  const TYPE_RANK = { '1-way': 1, '2-way': 2, '3-way': 3 };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const grp = pos => (pos === 'LW' || pos === 'RW') ? 'W' : pos;
  const roundHalf = v => Math.round(v / 500000) * 500000;
  proto.MARKET = CAP;
  proto.PROMISE_KINDS = {
    top4: 'Войти в четвёрку сильнейших своей конференции', po: 'Выйти в плей-офф', role: 'Играть в первом звене',
    nt: 'Не отпускать до конца сезона', ext: 'Начать переговоры о продлении по окончании сезона',
    cup1: 'Дойти до 1/4 финала Кубка Гагарина', cup2: 'Дойти до полуфинала Кубка Гагарина', cup3: 'Дойти до финала Кубка Гагарина', cup4: 'Выиграть Кубок Гагарина'
  };
  const CUP_NEED = { cup1: 1, cup2: 2, cup3: 3, cup4: 4 };       // сколько серий клуб должен выиграть
  proto.isCupPromise = kind => !!CUP_NEED[kind];

  proto.mk = function () { return (this.state && this.state.market) || null; };
  proto.seasonEndYear = function () { return (parseInt(String((this.state && this.state.seasonStart) || '2026-09-03').slice(0, 4), 10) || 2026) + 1; };

  /* ------------------------------------------------------------------ инициализация и хранение */
  proto.marketInit = function () {
    if (!this.state || typeof KHL_FREE_AGENTS === 'undefined') return;
    const m = this.state.market = {
      v: 1, players: {}, promises: [], requests: [], cooldown: {}, rep: 50, capCharges: {}, log: [], watch: {}, review: false, seq: 1
    };
    KHL_FREE_AGENTS.forEach(a => { m.players[a.id] = { ...a, skills: { ...a.skills }, teamId: FA, contractUntil: null }; });
  };
  proto.marketOwn = function (p) { const m = this.mk(); if (m && p && !m.players[p.id]) m.players[p.id] = p; return p; };
  proto.marketApplyToDb = function () {
    const m = this.mk(); if (!m || typeof KHL_DATABASE === 'undefined') return;
    const owned = m.players;
    this.db.players = KHL_DATABASE.players.filter(p => !owned[p.id]).map(p => ({ ...p }))
      .concat(Object.values(owned).filter(p => p.teamId !== FA));
  };
  proto.marketPool = function () { const m = this.mk(); return m ? Object.values(m.players).filter(p => p.teamId === FA) : []; };
  proto.marketPlayer = function (id) { const m = this.mk(); return (m && m.players[id]) || this.db.players.find(p => p.id === id) || null; };

  const baseRepair = proto.repairSave;
  proto.repairSave = function () {
    if (this.state && !this.state.market && this.state.teamId) this.marketInit();
    if (this.state && this.state.market) this.marketApplyToDb();
    const r = baseRepair.apply(this, arguments);
    try { this.marketMigrate(); } catch (e) { console.warn('KHL Manager 14.7.3 migrate:', e); }
    return r;
  };
  const baseInit = proto.initNewCareer;
  proto.initNewCareer = function () {
    const r = baseInit.apply(this, arguments);
    if (this.state && !this.state.market) { this.marketInit(); this.marketApplyToDb(); }
    return r;
  };
  // перевод во вторую команду по отказам меняет teamId: фиксируем в рынке, чтобы обмен пережил перезагрузку
  const baseSend = proto.sendToFarm;
  if (baseSend) proto.sendToFarm = function (id) {
    const p = this.db.players.find(x => x.id === id), team0 = p && p.teamId;
    const r = baseSend.apply(this, arguments);
    if (p && this.mk() && p.teamId !== team0) this.marketOwn(p);
    if (p && this.mk() && (p.teamId !== team0 || this.isInFarm(p))) this.marketPromiseBreak(id, 'nt', 'отправлен во вторую команду');
    return r;
  };

  /* 14.7.3: старые записи → русские позиции в новостях, ссылки в журнале, список трансферов клуба (один раз на сохранение) */
  proto.marketMigrate = function () {
    const m = this.mk(), st = this.state; if (!m || m.mig >= 2) return;
    const teams = (this.db.teams || []).slice().sort((a, b) => b.name.length - a.name.length);
    const names = {}; Object.values(m.players || {}).forEach(p => { names[p.name] = p.id; });
    (this.db.players || []).forEach(p => { if (!names[p.name]) names[p.name] = p.id; });
    const nameList = Object.keys(names).sort((a, b) => b.length - a.length);
    const posRu = { C: 'Ц', LW: 'ЛН', RW: 'ПН', D: 'З', G: 'В' };
    (st.news || []).forEach(n => {
      if (n.category !== 'transfer') return;
      const fix = t => String(t || '').replace(/\((C|LW|RW|D|G),\s*(\d+)\)/g, (x, pos, age) => `(${this.positionLabel(pos)}, ${this.ageText(Number(age))})`);
      n.body = fix(n.body); n.headline = fix(n.headline);
    });
    const hasTok = t => /\{[pt]:/.test(t);
    const transfers = m.transfers || (m.transfers = []);
    const haveIn = new Set(transfers.map(x => x.pid + ':' + x.day + ':' + x.kind));
    for (const e of (m.log || [])) {
      if (hasTok(e.text)) continue;
      let t = String(e.text), tid = null, pid = null;
      for (const tm of teams) if (t.includes(tm.name)) { if (!tid) tid = tm.id; t = t.split(tm.name).join(`{t:${tm.id}}`); }
      for (const nm of nameList) if (t.includes(nm)) { if (!pid) pid = names[nm]; t = t.split(nm).join(`{p:${names[nm]}}`); }
      t = t.replace(/\((C|LW|RW|D|G),/g, (x, pos) => `(${this.positionLabel(pos)},`).replace(/\((C|LW|RW|D|G)\)/g, (x, pos) => `(${this.positionLabel(pos)})`);
      e.text = t;
      const mm = /подписан/.test(e.text) && e.kind !== 'info' ? /\{t:([^}]+)\}.*подписан \{p:([^}]+)\}.*?([\d.,]+) млн.*?до (\d{4})/.exec(e.text) : null;
      if (mm && !m.migTransfers && !haveIn.has(mm[2] + ':' + e.day + ':in')) {
        const pl = this.marketPlayer(mm[2]);
        transfers.push({ day: e.day, pid: mm[2], name: pl ? pl.name : '', pos: pl ? pl.pos : '', kind: 'in', from: 'FA', to: mm[1], salary: Math.round(parseFloat(mm[3].replace(',', '.')) * 1e6), until: Number(mm[4]), ...(pl && pl.prevTeam && this.teamById(pl.prevTeam) ? { prev: pl.prevTeam } : {}) });
      }
    }
    transfers.sort((a, b) => b.day - a.day);
    // старый формат «откуда»: prev:ID → свободный агент (ранее ID)
    transfers.forEach(x => { if (x.kind === 'in' && String(x.from).startsWith('prev:')) { x.prev = x.prev || String(x.from).slice(5); x.from = 'FA'; } });
    m.migTransfers = true; m.mig = 2;
  };

  /* ------------------------------------------------------------------ окно рынка */
  proto.marketDeadlineDay = function () {
    const s = new Date(((this.state && this.state.seasonStart) || '2026-09-03') + 'T12:00:00Z').getTime();
    const d = new Date((new Date(s).getUTCFullYear() + 1) + CAP.deadline.slice(4) + 'T12:00:00Z').getTime();   // 31 января сезона
    return Math.round((d - s) / 86400000);
  };
  proto.marketWindow = function () {
    if (!this.mk()) return { open: false, reason: 'Рынок недоступен.' };
    const day = Number(this.state.dayIndex || 0), dl = this.marketDeadlineDay();
    if (day > dl) return { open: false, reason: 'Трансферное окно закрыто (дедлайн 31 января). Откроется после сезона.' };
    return { open: true, daysLeft: dl - day };
  };

  /* ------------------------------------------------------------------ деньги и потолок */
  proto.teamPayroll = function (teamId) {
    const m = this.mk();
    return this.teamPlayers(teamId).reduce((s, p) => s + (this.payrollOf ? this.payrollOf(p) : p.salary), 0) + ((m && m.capCharges[teamId]) || 0);
  };
  proto.capStatus = function (teamId) {
    const pay = this.teamPayroll(teamId);
    return { payroll: pay, cap: CAP.cap, floor: CAP.floor, room: CAP.cap - pay, over: pay > CAP.cap, belowFloor: pay < CAP.floor, toFloor: Math.max(0, CAP.floor - pay) };
  };
  // «мягкий старт»: клуб выше потолка не может увеличивать фонд, пока не опустится
  proto.capReserved = function (teamId, skipPid) {
    const m = this.mk(); if (!m || !m.thinking) return 0;
    return m.thinking.filter(x => x.teamId === teamId && x.pid !== skipPid).reduce((s, x) => s + (Number(x.offer.salary) || 0), 0);
  };
  proto.capBlock = function (teamId, delta, skipPid) {
    if (delta <= 0) return null;
    const pay = this.teamPayroll(teamId) + this.capReserved(teamId, skipPid);
    if (pay + delta <= CAP.cap) return null;
    return pay > CAP.cap
      ? `Фонд клуба (${(pay / 1e6).toFixed(0)} млн) выше потолка ${CAP.cap / 1e6} млн: пока не опустится ниже, увеличивать его нельзя.`
      : `Не хватает места под потолком ${CAP.cap / 1e6} млн: свободно ${((CAP.cap - pay) / 1e6).toFixed(1)} млн, нужно ${(delta / 1e6).toFixed(1)} млн.`;
  };
  // лимит легионеров относится к заявке на матч, а не к составу клуба: при подписании не проверяется
  proto.foreignBlock = function (teamId, p) {
    return null;
  };
  proto.foreignBlockOld = function (teamId, p) {
    if (!p || !p.foreign) return null;
    if (this.isForeignQuotaExemptTeamV75 && this.isForeignQuotaExemptTeamV75(teamId)) return null;
    const f = this.teamPlayers(teamId).filter(x => x.foreign && x.id !== p.id);
    if (f.length >= 5) return 'В заявке уже 5 легионеров.';
    if (p.pos === 'G' && f.some(x => x.pos === 'G')) return 'В заявке уже есть вратарь-легионер.';
    return null;
  };
  proto.askSalary = function (p) {
    const a = this.ageYears(p);
    const f = a <= 22 ? 1.15 : a <= 25 ? 1.1 : a <= 28 ? 1.05 : a <= 31 ? 1 : a <= 34 ? 0.92 : 0.85;
    const star = 1 + clamp((Number(p.ovr) - 76) * 0.015, 0, 0.3);   // звёзды просят больше
    return Math.max(CAP.minWage, roundHalf((Number(p.salary) || CAP.minWage) * f * star));
  };
  proto.wantYears = function (p) { const a = this.ageYears(p); return a <= 23 ? 4 : a <= 27 ? 3 : a <= 31 ? 2 : 1; };
  proto.yearsLeft = function (p) { const u = Number(p.contractUntil); return Number.isFinite(u) ? Math.max(0, u - this.seasonEndYear() + 1) : 0; };

  /* ------------------------------------------------------------------ сила клуба и роль */
  proto.marketPower = function () {
    const key = (this.state ? this.state.dayIndex : 0) + ':' + this.db.players.length;
    if (this._mkPow && this._mkPow.key === key) return this._mkPow.v;
    const avg = (arr, n) => { arr = arr.slice().sort((a, b) => b - a).slice(0, n); while (arr.length < n) arr.push(55); return arr.reduce((s, x) => s + x, 0) / n; };
    const rows = this.db.teams.map(t => {
      const ps = this.teamPlayers(t.id), o = { id: t.id };
      for (const g in NEED) o[g] = avg(ps.filter(p => grp(p.pos) === g).map(p => this.permanentOVR(p)), NEED[g]);
      return o;
    });
    const mean = {}; for (const g in NEED) mean[g] = rows.reduce((s, r) => s + r[g], 0) / rows.length;
    rows.forEach(r => { r.diff = {}; for (const g in NEED) r.diff[g] = r[g] - mean[g]; r.power = r.diff.C + r.diff.W + r.diff.D + r.diff.G * 1.5; });
    const order = rows.slice().sort((a, b) => b.power - a.power).map(r => r.id);
    const v = { rows: Object.fromEntries(rows.map(r => [r.id, r])), rank: Object.fromEntries(order.map((id, i) => [id, i + 1])), n: rows.length };
    this._mkPow = { key, v };
    return v;
  };
  // роль словами: вратарь — номер, защитник — пара, нападающий — звено
  proto.roleLabel = function (g, rank) {
    if (g === 'G') return rank <= 1 ? 'основной вратарь' : rank === 2 ? 'второй вратарь' : 'третий вратарь';
    if (g === 'D') return rank <= 2 ? 'первая пара' : rank <= 4 ? 'вторая пара' : rank <= 6 ? 'третья пара' : 'запас';
    const line = g === 'C' ? rank : Math.ceil(rank / 2);
    return line === 1 ? 'первое звено' : line === 2 ? 'второе звено' : line === 3 ? 'третье звено' : line === 4 ? 'четвёртое звено' : 'запас';
  };
  proto.marketRole = function (p, teamId) {
    const g = grp(p.pos), ovr = this.permanentOVR(p);
    const better = this.teamPlayers(teamId).filter(x => x.id !== p.id && grp(x.pos) === g && !this.isInFarm(x) && this.permanentOVR(x) > ovr).length;
    const rank = better + 1, slots = NEED[g] || 4;
    const label = this.roleLabel(g, rank);
    if (rank <= Math.ceil(slots / 2)) return { score: 90, rank, label, text: g === 'G' ? 'основной вратарь' : 'первое звено / пара' };
    if (rank <= slots) return { score: 65, rank, label, text: g === 'G' ? 'второй вратарь' : 'в основном составе' };
    if (rank <= slots + 2) return { score: 40, rank, label, text: 'борьба за место' };
    return { score: 22, rank, label, text: 'скорее запасной' };
  };
  // потребность клуба по позициям: насколько средний рейтинг основных игроков ниже среднего по лиге (+ нехватка людей)
  proto.marketNeeds = function (teamId) {
    const pw = this.marketPower().rows[teamId]; if (!pw) return {};
    const ps = this.teamPlayers(teamId).filter(p => !this.isInFarm(p)), min = { C: 5, W: 11, D: 8, G: 2 }, out = {};
    for (const g in NEED) {
      const cnt = ps.filter(p => grp(p.pos) === g).length;
      out[g] = { diff: pw.diff[g], count: cnt, short: Math.max(0, min[g] - cnt), score: -pw.diff[g] + Math.max(0, min[g] - cnt) * 4 };
    }
    return out;
  };

  /* ------------------------------------------------------------------ желание игрока играть за клуб (0–100, скрыто, показывается словом) */
  const hash01 = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 1000) / 1000; };
  proto.marketDesire = function (p, teamId) {
    const sym = hash01(String(p.id) + '|' + teamId) * 100;                       // личная симпатия: стабильна для пары «игрок — клуб»
    let coach = 50; try { const c = this.coachOf && this.coachOf(teamId); if (c && Number.isFinite(c.ovr)) coach = clamp((c.ovr - 55) / 35 * 100, 0, 100); } catch (e) { }
    const st = (typeof KHL_STADIUMS !== 'undefined' && KHL_STADIUMS[teamId]) || null;
    const arena = st ? clamp((st.capacity - 5000) / 17000 * 100, 0, 100) : 50;
    let mood = 60;
    try { const ps = this.teamPlayers(teamId), ms = ps.map(x => { const d = this.playerDev && this.playerDev(x); return d && Number.isFinite(d.morale) ? d.morale : null; }).filter(x => x != null); if (ms.length) mood = ms.reduce((a, b) => a + b, 0) / ms.length; } catch (e) { }
    let leg = 50;
    if (p.foreign) { const n = this.teamPlayers(teamId).filter(x => x.foreign && x.id !== p.id).length; leg = clamp(n / 4 * 100, 0, 100); }
    const w = p.foreign ? { sym: .35, coach: .15, arena: .15, mood: .15, leg: .2 } : { sym: .45, coach: .2, arena: .15, mood: .2, leg: 0 };
    return clamp(Math.round(sym * w.sym + coach * w.coach + arena * w.arena + mood * w.mood + leg * w.leg), 0, 100);
  };

  /* ------------------------------------------------------------------ оценка предложения игроком */
  proto.promiseBelief = function (kind, p, teamId) {
    const rank = this.marketPower().rank[teamId] || 11, role = this.marketRole(p, teamId).score;
    switch (kind) {
      case 'top4': return rank <= 6 ? 100 : rank <= 9 ? 75 : rank <= 13 ? 40 : 15;
      case 'po': return rank <= 12 ? 100 : rank <= 16 ? 65 : rank <= 19 ? 35 : 15;
      case 'role': return role >= 65 ? 100 : role >= 40 ? 55 : 20;
      case 'cup1': return rank <= 8 ? 100 : rank <= 12 ? 70 : rank <= 16 ? 40 : 15;
      case 'cup2': return rank <= 5 ? 100 : rank <= 8 ? 70 : rank <= 12 ? 35 : 12;
      case 'cup3': return rank <= 3 ? 100 : rank <= 5 ? 65 : rank <= 8 ? 35 : 10;
      case 'cup4': return rank <= 1 ? 90 : rank <= 2 ? 65 : rank <= 3 ? 45 : rank <= 5 ? 25 : 8;
      case 'nt': return 90;
      case 'ext': return 85;
      default: return 50;
    }
  };
  proto.evaluateOffer = function (p, teamId, offer) {
    const m = this.mk(), ask = this.askSalary(p), a = this.ageYears(p);
    const ratio = offer.salary / ask;
    let money = clamp((ratio - 0.7) / 0.5 * 100, 0, 100);
    const pref = TYPE_RANK[p.contract] || 2, got = TYPE_RANK[offer.type] || pref;
    if (got > pref) money = clamp(money - 12 * (got - pref), 0, 100);
    const pw = this.marketPower(), strRaw = Math.round((1 - ((pw.rank[teamId] || 11) - 1) / Math.max(1, pw.n - 1)) * 100);
    const role = this.marketRole(p, teamId);
    const length = clamp(100 - Math.abs((offer.years || 1) - this.wantYears(p)) * 30, 0, 100);
    const promises = (offer.promises || []).filter(Boolean);
    const beliefs = promises.map(k => this.promiseBelief(k, p, teamId));
    const prom = beliefs.length ? clamp(Math.max(...beliefs) + 5 * Math.max(0, beliefs.filter(b => b >= 60).length - 1), 0, 100) : null;
    const w = a <= 24 ? { m: .2, s: .2, r: .35, l: .1, p: .15 } : a >= 32 ? { m: .4, s: .2, r: .15, l: .15, p: .1 } : { m: .3, s: .3, r: .2, l: .1, p: .1 };
    const amb = clamp((Number(p.ovr) - 72) / 12, 0, 1);      // сильный игрок выбирает сильный клуб
    w.s += .15 * amb; w.m -= .07 * amb; w.r -= .08 * amb;
    const desire = this.marketDesire(p, teamId), wd = a >= 32 ? .16 : a <= 24 ? .1 : .13;   // «Желание» забирает долю у остальных факторов
    for (const k of ['m', 's', 'r', 'l', 'p']) w[k] *= (1 - wd);
    w.d = wd;
    const strength = Math.round(clamp(50 + (strRaw - 50) * (1 + 0.8 * amb) - 15 * amb, 0, 100));
    let score = money * w.m + strength * w.s + role.score * w.r + length * w.l + (prom == null ? 50 : prom) * w.p + desire * w.d;
    const rep = m ? (m.rep - 50) * 0.12 : 0;
    // чем дольше игрок без клуба и чем он слабее, тем он сговорчивее
    const free = p.teamId === FA ? clamp((Number(p.ovr) < 72 ? (72 - Number(p.ovr)) * 1.5 : 0), 0, 18) + Math.min(10, Math.max(0, Number(this.state.dayIndex || 0) - (Number(p.freeSince) || 0)) * 0.12) : 0;
    const extra = (offer.round || 0) * 3;
    let moodAdj = 0;
    if (offer.kind === 'ext') { const d = this.playerDev ? this.playerDev(p) : null; moodAdj = d && d.morale != null ? (d.morale - 60) * 0.15 : 0; }
    score = clamp(score + rep + extra + moodAdj + free, 0, 100);
    let verdict = score >= 60 ? 'accept' : score >= 45 ? 'counter' : 'reject';
    let counter = null;
    if (verdict === 'counter') {
      const need = (60 - score) / Math.max(.05, w.m);                      // нехватка по фактору «деньги»
      counter = { salary: Math.min(roundHalf(ask * 1.6), roundHalf(offer.salary + need / 100 * 0.5 * ask + 250000)) };
      // 14.7.8: при продлении встречное — это ПРОВЕРЕННАЯ сумма: на следующем раунде игрок с ней точно согласится.
      // Если такой суммы нет (или она выше потолка клуба), встречного нет — отказ.
      if (offer.kind === 'ext' && !offer._probe) {
        let max = roundHalf(ask * 1.6);
        try { max = Math.min(max, this.maxOfferSalary(p, teamId, 'ext')); } catch (e) { }
        let found = null;
        for (let sal = roundHalf(offer.salary + 500000); sal <= max; sal += 500000) {
          if (this.evaluateOffer(p, teamId, { ...offer, salary: sal, round: (offer.round || 0) + 1, _probe: true }).verdict === 'accept') { found = sal; break; }
        }
        if (found) counter = { salary: found, checked: true }; else { counter = null; verdict = 'reject'; }
      }
    }
    return { score, verdict, counter, noCounter: verdict === 'reject' && score >= 45, ask, factors: { money, strength, role: role.score, length, promise: prom, desire }, roleText: role.text, roleLabel: role.label, wantYears: this.wantYears(p), rank: pw.rank[teamId], weights: w, rep, extra };
  };

  // слова вместо цифр: [текст, цвет] (g — хорошо, y — средне, r — плохо, b — отлично, '' — нейтрально)
  proto.marketWords = function (ev, offer, teamId) {
    const f = ev.factors, n = (this.marketPower().n) || 20, rk = ev.rank || n, frac = rk / n;
    const money = f.money < 35 ? ['ниже ожиданий', 'r'] : f.money < 60 ? ['почти устраивает', 'y'] : f.money < 84 ? ['устраивает', 'g'] : ['выше ожиданий', 'b'];
    const status = frac <= .1 ? ['лидер лиги', 'b'] : frac <= .25 ? ['претендент', 'g'] : frac <= .45 ? ['борется за плей-офф', 'y'] : frac <= .7 ? ['середняк', ''] : ['аутсайдер', 'r'];
    const d = f.desire, desire = d < 20 ? ['не хочет', 'r'] : d < 40 ? ['без энтузиазма', ''] : d < 60 ? ['не против', 'y'] : d < 80 ? ['хочет', 'g'] : ['мечтает', 'b'];
    const rl = ev.roleLabel || ev.roleText, role = [rl, f.role >= 90 ? 'b' : f.role >= 65 ? 'g' : f.role >= 40 ? 'y' : 'r'];
    const diff = Math.abs((offer.years || 1) - (ev.wantYears || 1));
    const length = diff === 0 ? ['как хотел', 'g'] : diff === 1 ? ['близко к желаемому', 'y'] : ['далеко от желаемого', 'r'];
    const pr = f.promise, promise = pr == null ? ['не даны', ''] : pr >= 95 ? ['полностью верит', 'b'] : pr >= 70 ? ['правдоподобно', 'g'] : pr >= 40 ? ['сомнительно', 'y'] : ['не верит', 'r'];
    return { money, status, desire, role, length, promise };
  };

  /* ------------------------------------------------------------------ подписание и продление */
  // список трансферов для страницы клуба: kind = in (пришёл), ext (продлён), out (ушёл)
  proto.marketTransfer = function (p, kind, fromId, toId, extra) {
    const m = this.mk(); if (!m) return;
    const L = m.transfers || (m.transfers = []);
    L.unshift({ day: Number(this.state.dayIndex || 0), pid: p.id, name: p.name, pos: p.pos, kind, from: fromId || '', to: toId || '', salary: p.salary || 0, until: p.contractUntil || null, ...(extra || {}) });
    if (L.length > 600) L.length = 600;
  };
  proto.marketLog = function (text, kind, extra) {
    const m = this.mk(); if (!m) return;
    m.log.unshift({ day: Number(this.state.dayIndex || 0), text, kind: kind || 'info', ...(extra || {}) });
    if (m.log.length > 300) m.log.length = 300;
  };
  proto.marketNews = function (headline, body, teamIds, tag) {
    try { if (this.publishNews) this.publishNews({ category: 'transfer', icon: '✍️', key: `transfer:${this.state.dayIndex}:${headline}`, headline, body, teamIds: teamIds || [], tag: tag || 'Трансфер' }); } catch (e) { }
  };
  // клуб выше потолка может подписать игрока по минимуму (1 млн, 1 год), если на его позиции не хватает людей
  proto.minContractAllowed = function (teamId, p, deal) {
    if (!deal || Number(deal.salary) > CAP.minWage || Number(deal.years) !== 1) return false;
    const n = this.marketNeeds(teamId)[grp(p.pos)];
    return !!(n && n.short > 0);
  };
  // доступный максимум зарплаты в предложении (для ползунка): без потолка — как просит игрок ×1,6
  proto.maxOfferSalary = function (p, teamId, kind) {
    const top = roundHalf(this.askSalary(p) * 1.6);
    const cur = kind === 'ext' ? (Number(p.nextSalary) || Number(p.salary) || CAP.minWage) : 0;
    const pay = this.teamPayroll(teamId) + this.capReserved(teamId, p.id);
    const room = Math.max(0, CAP.cap - pay);
    let max = kind === 'ext' ? cur + room : room;
    if (pay > CAP.cap) max = kind === 'ext' ? cur : (this.minContractAllowed(teamId, p, { salary: CAP.minWage, years: 1 }) ? CAP.minWage : 0);
    return Math.max(0, Math.min(top, Math.floor(max / 500000) * 500000));
  };
  proto.dealCheck = function (p, teamId, deal, kind) {
    const w = this.marketWindow();
    if (!w.open && kind !== 'ext') return w.reason;
    if (kind === 'fa') {
      if (this.teamPlayers(teamId).length >= CAP.maxRoster) return 'В заявке уже ' + CAP.maxRoster + ' игроков.';
    }
    if (kind === 'ext' && p.nextSalary && p.teamId === teamId) return `${p.name} уже продлён до ${p.contractUntil} (${(p.nextSalary / 1e6).toFixed(1).replace('.', ',')} млн со следующего сезона). Повторно продлевать нельзя.`;
    const delta = kind === 'ext' ? deal.salary - (Number(p.nextSalary) || p.salary) : deal.salary;
    let c = this.capBlock(teamId, delta, p.id);
    if (c && kind === 'fa' && this.minContractAllowed(teamId, p, deal)) c = null;      // по минимуму можно, если игроков не хватает
    if (c) return kind === 'fa' ? c + ' Выше потолка можно подписать только по минимуму (1 млн, 1 год), и только если на этой позиции не хватает игроков.' : c;
    if (deal.type === '1-way') {
      if (this.ageYears(p) <= this.CONTRACT_RULES.maxOneWayAge) return 'Игрокам до 21 года нельзя односторонний контракт.';
      const cnt = this.teamPlayers(teamId).filter(x => x.contract === '1-way' && x.id !== p.id).length;
      if (cnt >= this.CONTRACT_RULES.oneWayLimit) return 'В клубе уже 25 односторонних контрактов.';
    }
    if (deal.type === '3-way' && this.ageYears(p) > 20) return 'Трёхсторонний контракт только до 21 года.';
    return null;
  };
  proto.negotiate = function (pid, teamId, offer, kind) {
    const m = this.mk(), p = this.marketPlayer(pid);
    if (!m || !p) return { ok: false, text: 'Игрок не найден.' };
    kind = kind || (p.teamId === FA ? 'fa' : 'ext');
    const block = this.dealCheck(p, teamId, offer, kind);
    if (block) return { ok: false, blocked: true, text: block };
    if ((m.cooldown[pid] || 0) > (this.state.dayIndex || 0)) return { ok: false, blocked: true, text: `${p.name} не вернётся к переговорам до ${this.formatDate(m.cooldown[pid])}.` };
    if (this.thinkOf(pid)) return { ok: false, blocked: true, text: `${p.name} уже обдумывает ваше предложение.` };
    const ev = this.evaluateOffer(p, teamId, { ...offer, kind });
    if (kind === 'fa' && ev.verdict === 'counter') {
      this.marketThinkStart(p, teamId, offer);
      return { ok: true, done: false, thinking: true, ev, text: `${p.name} возьмёт паузу и ответит через ${CAP.thinkDays} дня. Пока он думает, его могут пригласить другие клубы.` };
    }
    if (ev.verdict === 'accept') { this.marketComplete(p, teamId, offer, kind); return { ok: true, done: true, ev, text: kind === 'fa' ? 'Игрок согласен. Контракт подписан.' : 'Игрок согласен продлить контракт.' }; }
    if (ev.verdict === 'counter' && (offer.round || 0) < CAP.rounds - 1) return { ok: true, done: false, ev, text: `Встречное предложение: ${(ev.counter.salary / 1e6).toFixed(1)} млн в год или более веское обещание.` };
    if (ev.verdict === 'reject' && (offer.round || 0) < CAP.rounds - 1) return { ok: true, done: false, rejected: true, ev, text: ev.noCounter ? 'Игрок готов говорить, но за доступную клубу сумму не согласится. Улучшите условия: срок, тип контракта, обещания.' : 'Отказ: условия сильно не устраивают. Можно улучшить предложение.' };
    m.cooldown[pid] = Number(this.state.dayIndex || 0) + CAP.cooldownDays;
    return { ok: false, done: false, ended: true, ev, text: 'Отказ. Переговоры прекращены, игрок не вернётся к ним 30 дней.' };
  };
  proto.marketComplete = function (p, teamId, offer, kind) {
    const m = this.mk(), st = this.state, Y = this.seasonEndYear();
    this.marketOwn(p);
    if (kind === 'fa') {
      p.teamId = teamId; p.salary = offer.salary; p.contract = offer.type; p.contractUntil = Y + (offer.years || 1) - 1;
      delete p.nextSalary;
      if (!this.db.players.includes(p)) this.db.players.push(p);
      if (!st.playerStats[p.id]) st.playerStats[p.id] = { gp: 0, g: 0, a: 0, pts: 0, shots: 0, plusMinus: 0, goalieGP: 0, goalieW: 0, goalieShots: 0, goalieSaves: 0, goalieGA: 0, shutouts: 0 };
      if (!st.playerDevelopment[p.id]) st.playerDevelopment[p.id] = this.createPlayerDevelopment(p);
      if (st.playoff && st.playoff.playerStats && !st.playoff.playerStats[p.id]) st.playoff.playerStats[p.id] = { gp: 0, g: 0, a: 0, pts: 0, shots: 0, plusMinus: 0, goalieGP: 0, goalieW: 0, goalieShots: 0, goalieSaves: 0, goalieGA: 0, shutouts: 0 };
      if (st.lineAssignments) st.lineAssignments[p.id] = p.line || (p.pos === 'G' ? 1 : 4);
      if (this.autoAssignNumbers) { try { this.autoAssignNumbers(false); } catch (e) { } }
      this._mkPow = null;
      const t = this.teamById(teamId);
      this.marketTransfer(p, 'in', 'FA', teamId, p.prevTeam && this.teamById(p.prevTeam) ? { prev: p.prevTeam } : {});
      this.marketLog(`{t:${teamId}}: подписан {p:${p.id}} (${this.positionLabel(p.pos)}, ${(offer.salary / 1e6).toFixed(1).replace('.', ',')} млн, до ${p.contractUntil})`, teamId === st.teamId ? 'mine' : 'ai');
      this.marketNews(`${p.name} — в ${t ? t.name : 'клуб'}`, `${p.name} (${this.positionLabel(p.pos)}, ${this.ageText(Math.floor(this.ageYears(p)))}) подписал контракт до ${p.contractUntil} года.`, [teamId]);
    } else {
      const base = Math.max(Number(p.contractUntil) || Y, Y), expired = Number(p.contractUntil) < Y;   // в межсезонье старый контракт уже закончился
      p.nextSalary = offer.salary; p.contract = offer.type; p.contractUntil = expired ? Y + (offer.years || 1) - 1 : base + (offer.years || 1);
      this.marketTransfer(p, 'ext', teamId, teamId, { salary: offer.salary });
      this.marketLog(`Продлён {p:${p.id}} (${this.positionLabel(p.pos)}): до ${p.contractUntil}, ${(offer.salary / 1e6).toFixed(1).replace('.', ',')} млн со следующего сезона`, 'mine');
    }
    (offer.promises || []).filter(Boolean).forEach(k => this.promiseAdd(p.id, teamId, k));
    if (this.persistQuietly) this.persistQuietly();
    return p;
  };

  /* ------------------------------------------------------------------ обещания */
  proto.promiseAdd = function (pid, teamId, kind) {
    const m = this.mk(); if (!m || teamId !== this.state.teamId) return null;
    const pr = { id: 'pr' + (m.seq++), pid, kind, teamId, day: Number(this.state.dayIndex || 0), status: 'active' };
    m.promises.push(pr); return pr;
  };
  proto.promisesOf = function (pid) { const m = this.mk(); return m ? m.promises.filter(x => x.pid === pid && x.status === 'active') : []; };
  proto.marketPromiseBreak = function (pid, kind, why) {
    const m = this.mk(); if (!m) return;
    m.promises.filter(x => x.pid === pid && x.kind === kind && x.status === 'active').forEach(x => this.promiseBroken(x, why));
  };
  proto.promiseBroken = function (pr, why) {
    const m = this.mk(), p = this.marketPlayer(pr.pid);
    pr.status = 'broken'; pr.why = why || '';
    m.rep = clamp(m.rep - 8, 0, 100);
    this.marketLog(`Нарушено обещание: {p:${pr.pid}} (${p ? this.positionLabel(p.pos) : ''}) — «${this.PROMISE_KINDS[pr.kind]}»${why ? ' (' + why + ')' : ''}`, 'bad');
    if (p && p.teamId === this.state.teamId && pr.kind !== 'nt') this.requestOpen(p.id, 'promise', `${p.name}: клуб не выполнил обещание — «${this.PROMISE_KINDS[pr.kind]}».`);
  };
  proto.cupRecord = function (tid) {
    const po = this.state && this.state.playoff; if (!po) return null;
    const seen = new Set(), all = [];
    [...(po.history || []).flatMap(h => h.series || []), ...(po.series || [])].forEach(x => { if (x && !seen.has(x.id)) { seen.add(x.id); all.push(x); } });
    const mine = all.filter(x => x.teamA === tid || x.teamB === tid);
    const wins = mine.filter(x => x.winnerId === tid).length, out = mine.some(x => x.winnerId && x.winnerId !== tid);
    return { in: mine.length > 0, wins: po.championId === tid ? Math.max(4, wins) : wins, out, done: !!po.completed };
  };
  proto.promiseProgress = function (pr) {
    const st = this.state, tid = pr.teamId, gp = (st.standings[tid] || {}).gp || 0;
    if (pr.kind === 'top4' || pr.kind === 'po') {
      const r = this.conferenceRank(tid), need = pr.kind === 'top4' ? 4 : 8;
      return { text: `сейчас ${r}-е место в конференции, нужно ${need}-е или выше`, ok: r <= need, pct: clamp(100 - (r - need) * 12, 8, 100) };
    }
    if (this.isCupPromise(pr.kind)) {
      const need = CUP_NEED[pr.kind], rec = this.cupRecord(tid), r = this.conferenceRank(tid);
      if (!rec || !rec.in) return r > 8 && this.regularSeasonComplete && this.regularSeasonComplete()
        ? { text: 'клуб не вышел в плей-офф', ok: false, pct: 5 }
        : { text: `сейчас ${r}-е место в конференции, нужно войти в восьмёрку; затем выиграть серий: ${need}`, ok: r <= 8, pct: clamp(100 - (r - 8) * 12, 8, 60) };
      return { text: `в Кубке выиграно серий: ${rec.wins} из ${need}${rec.out && rec.wins < need ? ', клуб выбыл' : ''}`, ok: rec.wins >= need || (!rec.out && !rec.done), pct: clamp(rec.wins / need * 100, 8, 100) };
    }
    if (pr.kind === 'role') { const w = (this.mk().watch[pr.pid] || {}); const s = w.samples || 0; return { text: s ? `в первом звене ${w.top}/${s} проверок` : 'проверки впереди', ok: !s || w.top / s >= 0.7, pct: s ? Math.round(w.top / s * 100) : 50 }; }
    if (pr.kind === 'nt') return { text: 'действует', ok: true, pct: 100 };
    return { text: 'проверка после сезона', ok: true, pct: 50 };
  };
  // проверка обещаний про Кубок: когда клуб выбыл или Кубок завершён
  proto.marketCupReview = function () {
    const m = this.mk(); if (!m) return;
    let kept = 0;
    m.promises.filter(x => x.status === 'active' && this.isCupPromise(x.kind)).forEach(pr => {
      const rec = this.cupRecord(pr.teamId); if (!rec || !rec.in) return;
      const need = CUP_NEED[pr.kind];
      if (rec.wins >= need) { pr.status = 'kept'; kept++; }
      else if (rec.out || rec.done) this.promiseBroken(pr, rec.out ? 'клуб выбыл из Кубка Гагарина' : 'Кубок Гагарина завершён');
    });
    if (kept) { m.rep = clamp(m.rep + Math.min(6, kept * 2), 0, 100); this.marketLog(`Выполнено обещаний про Кубок Гагарина: ${kept}. Репутация клуба растёт.`, 'good'); }
  };
  // итоговая проверка после регулярного чемпионата
  proto.marketSeasonReview = function () {
    const m = this.mk(); if (!m || m.review) return;
    m.review = true;
    const st = this.state; let kept = 0;
    m.promises.filter(x => x.status === 'active').forEach(pr => {
      const pg = this.promiseProgress(pr);
      if (pr.kind === 'ext') return;
      if (pr.kind === 'nt') { pr.status = 'kept'; kept++; return; }
      if (this.isCupPromise(pr.kind)) { if (this.conferenceRank(pr.teamId) > 8) this.promiseBroken(pr, 'клуб не вышел в плей-офф'); return; }
      if (pg.ok) { pr.status = 'kept'; kept++; } else this.promiseBroken(pr, 'итоги регулярного чемпионата');
    });
    if (kept) { m.rep = clamp(m.rep + Math.min(6, kept * 2), 0, 100); this.marketLog(`Выполнено обещаний: ${kept}. Репутация клуба растёт.`, 'good'); }
  };

  /* ------------------------------------------------------------------ требования игроков */
  proto.requestOpen = function (pid, kind, text) {
    const m = this.mk(); if (!m) return null;
    if (m.requests.some(r => r.pid === pid && r.status === 'open')) return null;
    const r = { id: 'rq' + (m.seq++), pid, kind, text, day: Number(this.state.dayIndex || 0), until: kind === 'veteran' ? null : Number(this.state.dayIndex || 0) + CAP.persuadeDays, status: 'open' };
    m.requests.push(r);
    this.marketLog(text, 'request');
    try { this.marketNews('Игрок просит расторгнуть контракт', text, [this.state.teamId]); } catch (e) { }
    return r;
  };
  proto.openRequests = function () { const m = this.mk(); return m ? m.requests.filter(r => r.status === 'open') : []; };
  // порог уговоров: на сколько процентов надо поднять зарплату, чтобы игрок остался
  proto.persuadeThreshold = function (r) {
    const p = this.marketPlayer(r.pid), d = p && this.playerDev ? this.playerDev(p) : null, mor = d && d.morale != null ? d.morale : 60;
    const base = r.kind === 'conflict' ? 25 : r.kind === 'role' ? 15 : 18;
    return Math.round(clamp(base - (mor - 50) * 0.3, 5, 35));
  };
  proto.requestPersuade = function (rid, raisePct) {
    const m = this.mk(), r = m && m.requests.find(x => x.id === rid && x.status === 'open'); if (!r) return { ok: false, text: 'Запрос уже закрыт.' };
    const p = this.marketPlayer(r.pid); if (!p) return { ok: false, text: 'Игрок не найден.' };
    if (r.kind === 'veteran') return { ok: false, text: 'Ветеран просит отпустить, уговорить его нельзя. Можно отказать или расторгнуть по соглашению.' };
    const thr = this.persuadeThreshold(r);
    if (raisePct < thr) return { ok: false, need: thr, text: `Недостаточно: игрок остаётся при прибавке от ${thr}%.` };
    const delta = Math.round(p.salary * raisePct / 100), cap = this.capBlock(this.state.teamId, delta);
    if (cap) return { ok: false, text: cap };
    this.marketOwn(p); p.salary += delta; r.status = 'stayed';
    const d = this.playerDev ? this.playerDev(p) : null; if (d) d.morale = clamp((d.morale == null ? 60 : d.morale) + 15, 0, 100);
    m.promises.filter(x => x.pid === p.id && x.status === 'broken').forEach(x => { x.status = 'settled'; });
    this.marketLog(`{p:${p.id}} (${this.positionLabel(p.pos)}) остаётся: зарплата +${raisePct}%`, 'good');
    return { ok: true, text: `${p.name} остаётся в клубе.` };
  };
  proto.requestRefuse = function (rid) {
    const m = this.mk(), r = m && m.requests.find(x => x.id === rid && x.status === 'open'); if (!r) return;
    const p = this.marketPlayer(r.pid);
    if (r.kind === 'veteran') { r.status = 'stayed'; const d = p && this.playerDev(p); if (d) d.morale = clamp((d.morale == null ? 60 : d.morale) - 10, 0, 100); this.marketLog(`{p:${p.id}} (${this.positionLabel(p.pos)}) остаётся в клубе против желания (настроение −10)`, 'info'); return; }
    this.terminateByPlayer(r.pid, r);
  };
  proto.requestRelease = function (rid) {
    const m = this.mk(), r = m && m.requests.find(x => x.id === rid && x.status === 'open'); if (!r) return;
    this.terminateByPlayer(r.pid, r, true);
  };

  /* ------------------------------------------------------------------ расторжение */
  proto.compensation = function (p) {
    const y = Math.max(1, this.yearsLeft(p));
    return Math.round(p.salary * (0.25 + 0.2 * (y - 1)) / 100000) * 100000;
  };
  proto.clubTerminationWindow = function () {
    // по правилам КХЛ клуб расторгает контракт с 1 мая до 7 дней до старта чемпионата; в сезоне окно закрыто
    return { open: !!(this.state && this.state.offseason), reason: 'Клуб может расторгнуть контракт только в межсезонье (с 1 мая до недели до старта чемпионата).' };
  };
  proto.mutualNeed = function (p) {
    const d = this.playerDev ? this.playerDev(p) : null, mor = d && d.morale != null ? d.morale : 60;
    const s = this.state.playerStats[p.id] || {}, tgp = (this.state.standings[this.state.teamId] || {}).gp || 0;
    let k = 0.85;
    if (mor < 40) k -= 0.2;
    if (tgp >= 15 && (s.gp || 0) < tgp * 0.3) k -= 0.2;
    if (this.ageYears(p) >= 33 && this.conferenceRank(this.state.teamId) > 8) k -= 0.15;
    return Math.round(this.compensation(p) * clamp(k, 0.15, 1) / 100000) * 100000;
  };
  proto.mutualAvailable = function (p) {
    const d = this.playerDev ? this.playerDev(p) : null, mor = d && d.morale != null ? d.morale : 60;
    const s = this.state.playerStats[p.id] || {}, tgp = (this.state.standings[this.state.teamId] || {}).gp || 0;
    return mor < 50 || (tgp >= 15 && (s.gp || 0) < tgp * 0.3) || (this.ageYears(p) >= 33 && this.conferenceRank(this.state.teamId) > 8) || !!this.offseasonFlag;
  };
  proto.marketRelease = function (p) {
    const m = this.mk(); this.marketOwn(p);
    const oldTeam = p.teamId;
    this.marketTransfer(p, 'out', oldTeam, 'FA');
    p.prevTeam = oldTeam;
    const wasSlot = Object.values(this.state.slotAssignments || {}).includes(p.id);
    if (this.state.farm) delete this.state.farm[p.id];
    p.teamId = FA; p.contractUntil = null; p.freeSince = Number(this.state.dayIndex || 0); delete p.nextSalary;
    const i = this.db.players.indexOf(p); if (i >= 0) this.db.players.splice(i, 1);
    if (wasSlot && this.refillSlotsWithout) this.refillSlotsWithout(p.id);
    this._mkPow = null;
    m.promises.filter(x => x.pid === p.id && x.status === 'active').forEach(x => { x.status = 'void'; });
  };
  // компенсация идёт в потолок текущего сезона; у клуба выше потолка — в потолок следующего (capChargesNext, применяется при переходе в новый сезон)
  proto.marketChargeCap = function (teamId, sum) {
    const m = this.mk(), over = this.teamPayroll(teamId) > CAP.cap;
    if (over) { m.capChargesNext = m.capChargesNext || {}; m.capChargesNext[teamId] = (m.capChargesNext[teamId] || 0) + sum; }
    else m.capCharges[teamId] = (m.capCharges[teamId] || 0) + sum;
    return over;
  };
  proto.terminateByClub = function (pid) {
    const p = this.marketPlayer(pid), w = this.clubTerminationWindow();
    if (!p || p.teamId !== this.state.teamId) return { ok: false, text: 'Игрок не в клубе.' };
    if (!w.open) return { ok: false, text: w.reason };
    const comp = this.compensation(p), m = this.mk();
    this.marketPromiseBreak(pid, 'nt', 'контракт расторгнут клубом');
    const later = this.marketChargeCap(this.state.teamId, comp);
    this.marketRelease(p);
    this.marketLog(`Расторгнут контракт с {p:${p.id}} (${this.positionLabel(p.pos)}): компенсация ${(comp / 1e6).toFixed(1).replace('.', ',')} млн идёт в потолок${later ? ' следующего сезона' : ''}`, 'mine');
    return { ok: true, text: `Контракт расторгнут. Компенсация ${(comp / 1e6).toFixed(1)} млн учтена в потолке${later ? ' следующего сезона' : ''}.`, comp };
  };
  proto.terminateMutual = function (pid, sum) {
    const p = this.marketPlayer(pid);
    if (!p || p.teamId !== this.state.teamId) return { ok: false, text: 'Игрок не в клубе.' };
    if (!this.mutualAvailable(p)) return { ok: false, text: `${p.name} не хочет уходить: расторжение по соглашению возможно при плохом настроении, малой игровой практике или у ветерана в слабом клубе.` };
    const need = this.mutualNeed(p), comp = this.compensation(p);
    if (sum < need) return { ok: false, need, text: `Игрок не согласен: ждёт не меньше ${(need / 1e6).toFixed(1)} млн.` };
    const m = this.mk();
    this.marketPromiseBreak(pid, 'nt', 'расторжение по соглашению');
    const later = this.marketChargeCap(this.state.teamId, sum);
    this.marketRelease(p);
    this.marketLog(`Контракт с {p:${p.id}} (${this.positionLabel(p.pos)}) расторгнут по соглашению: ${(sum / 1e6).toFixed(1).replace('.', ',')} млн в потолок${later ? ' следующего сезона' : ''}`, 'mine');
    return { ok: true, text: `Расторгнуто по соглашению. Выплата ${(sum / 1e6).toFixed(1)} млн учтена в потолке${later ? ' следующего сезона' : ''}.`, comp };
  };
  proto.terminateByPlayer = function (pid, req, free) {
    const p = this.marketPlayer(pid), m = this.mk(); if (!p || !m) return;
    this.marketRelease(p);
    if (req) req.status = 'left';
    m.rep = clamp(m.rep - (free ? 1 : 4), 0, 100);
    const t = this.teamById(this.state.teamId);
    this.marketLog(`{p:${p.id}} (${this.positionLabel(p.pos)}) покидает клуб${free ? ' по соглашению (без компенсации)' : ' по своей инициативе'}`, 'bad');
    this.marketNews(`${p.name} покинул ${t ? t.name : 'клуб'}`, `Контракт расторгнут${free ? ' по соглашению сторон' : ' по инициативе игрока'}. Игрок стал свободным агентом.`, [this.state.teamId]);
  };

  /* ------------------------------------------------------------------ раздумья игрока (3 дня) и конкурирующие предложения */
  proto.thinkOf = function (pid) { const m = this.mk(); return m && m.thinking ? m.thinking.find(x => x.pid === pid) || null : null; };
  proto.thinkingList = function () { const m = this.mk(); return m && m.thinking ? m.thinking : []; };
  proto.marketThinkStart = function (p, teamId, offer) {
    const m = this.mk(), day = Number(this.state.dayIndex || 0);
    if (!m.thinking) m.thinking = [];
    const o = { salary: offer.salary, years: offer.years, type: offer.type, promises: (offer.promises || []).filter(Boolean), round: 0 };
    m.thinking.push({ id: 'th' + (m.seq++), pid: p.id, teamId, offer: o, start: day, until: day + CAP.thinkDays, improves: 0, rivals: [], seen: true });
    this.marketLog(`{p:${p.id}} (${this.positionLabel(p.pos)}) обдумывает предложение {t:${teamId}} (${CAP.thinkDays} дня)`, 'mine');
  };
  proto.marketThinkImprove = function (pid, offer) {
    const th = this.thinkOf(pid), p = this.marketPlayer(pid); if (!th || !p) return { ok: false, text: 'Переговоры не найдены.' };
    if (th.improves >= 2) return { ok: false, text: 'Предложение уже улучшали дважды.' };
    const o = { salary: offer.salary, years: offer.years, type: offer.type, promises: (offer.promises || []).filter(Boolean), round: 0 };
    const block = this.dealCheck(p, th.teamId, o, 'fa'); if (block) return { ok: false, text: block };
    th.offer = o; th.improves++;
    this.marketLog(`Предложение для {p:${pid}} улучшено (${th.improves} из 2)`, 'mine');
    return { ok: true, text: `Предложение улучшено (${th.improves} из 2). Игрок решит через ${Math.max(0, th.until - Number(this.state.dayIndex || 0))} дн.` };
  };
  proto.marketThinkWithdraw = function (pid) {
    const m = this.mk(), th = this.thinkOf(pid); if (!th) return;
    m.thinking = m.thinking.filter(x => x !== th);
    const p = this.marketPlayer(pid);
    this.marketLog(`Предложение для {p:${pid}} (${p ? this.positionLabel(p.pos) : ''}) отозвано`, 'info');
  };
  proto.marketRivalOffer = function (th) {
    const p = this.marketPlayer(th.pid), st = this.state, g = grp(p.pos), ask = this.askSalary(p);
    const cands = this.db.teams.filter(t => t.id !== st.teamId && !th.rivals.some(r => r.teamId === t.id)).map(t => {
      const n = this.marketNeeds(t.id)[g]; return { t, w: (n ? n.score : 0) + Math.random() * 4 };
    }).sort((a, b) => b.w - a.w);
    for (const { t } of cands.slice(0, 8)) {
      const yrs = clamp(this.wantYears(p) + (Math.random() < .35 ? (Math.random() < .5 ? -1 : 1) : 0), 1, 4);
      const type = this.ageYears(p) <= 20 ? '3-way' : (p.contract === '1-way' && this.ageYears(p) > 20 ? '1-way' : '2-way');
      const offer = { salary: roundHalf(ask * (0.88 + Math.random() * 0.4)), years: yrs, type, promises: [], round: 0 };
      if (this.dealCheck(p, t.id, offer, 'fa')) continue;
      return { teamId: t.id, ...offer, role: this.marketRole(p, t.id).label, day: Number(st.dayIndex || 0) };
    }
    return null;
  };
  proto.marketThinkDay = function () {
    const m = this.mk(), st = this.state; if (!m || !m.thinking || !m.thinking.length) return;
    const day = Number(st.dayIndex || 0);
    for (const th of m.thinking.slice()) {
      const p = this.marketPlayer(th.pid);
      if (!p || p.teamId !== FA) { m.thinking = m.thinking.filter(x => x !== th); continue; }
      // игрок решает, когда срок вышел, вы увидели все предложения конкурентов и после этого прошло минимум 2 дня (но не позже чем через 8 дней)
      const unseen = th.rivals.some(r => !r.seen), waitSeen = th.seenDay != null && day < th.seenDay + CAP.minAnswerDays;
      if (day >= th.until && ((!unseen && !waitSeen) || day >= th.start + 8)) { this.marketThinkResolve(th, p); continue; }
      if (day > th.start && day <= th.until && th.rivals.length < 2 && Math.random() < 0.5) {
        const r = this.marketRivalOffer(th);
        if (r) {
          th.rivals.push(r); th.seen = false;
          this.marketLog(`Игроком {p:${p.id}} заинтересовался {t:${r.teamId}}: ${(r.salary / 1e6).toFixed(1).replace('.', ',')} млн, ${r.years} г., ${r.role}`, 'info');
          if (this.setNotice) { try { this.setNotice(`${p.name}: поступило конкурирующее предложение от ${(this.teamById(r.teamId) || {}).name || 'клуба'}.`); } catch (e) { } }
        }
      }
    }
  };
  // почему игрок выбрал другой клуб: по каким показателям конкурент был заметно лучше (словами)
  proto.marketWhyLost = function (scored, myId, winId) {
    const a = scored.find(x => x.teamId === myId), b = scored.find(x => x.teamId === winId); if (!a || !b) return '';
    const names = [['money', 'деньги выше'], ['strength', 'клуб сильнее'], ['desire', 'больше желание играть там'], ['role', 'роль лучше'], ['length', 'срок ближе к желаемому'], ['promise', 'обещания убедительнее']];
    const out = names.filter(([k]) => (b.ev.factors[k] == null ? 50 : b.ev.factors[k]) - (a.ev.factors[k] == null ? 50 : a.ev.factors[k]) >= 8).map(x => x[1]);
    return out.length ? out.join(', ') : 'решило небольшое общее преимущество';
  };
  proto.marketResult = function (p, winnerId, th, scored, why) {
    const m = this.mk(); if (!m) return;
    const R = m.results || (m.results = []);
    const mine = scored.find(x => x.teamId === th.teamId), win = winnerId ? scored.find(x => x.teamId === winnerId) : null;
    R.unshift({ id: 'rs' + (m.seq++), day: Number(this.state.dayIndex || 0), pid: p.id, name: p.name, pos: p.pos, winner: winnerId, mine: winnerId === th.teamId, why: why || '',
      my: { salary: th.offer.salary, years: th.offer.years }, won: win ? { salary: win.offer.salary, years: win.offer.years } : null, seen: false });
    if (R.length > 10) R.length = 10;
  };
  proto.marketThinkResolve = function (th, p) {
    const m = this.mk(), st = this.state;
    m.thinking = m.thinking.filter(x => x !== th);
    const cand = [{ teamId: th.teamId, offer: th.offer }].concat(th.rivals.map(r => ({ teamId: r.teamId, offer: { salary: r.salary, years: r.years, type: r.type, promises: [], round: 0 } })));
    const scored = cand.map(c => { const e = this.evaluateOffer(p, c.teamId, { ...c.offer, kind: 'fa' }); return { ...c, ev: e, score: e.score, roll: (Math.random() - 0.5) * 8 }; });
    scored.forEach(c => { c.total = c.score + c.roll; });
    scored.sort((a, b) => b.total - a.total);
    const win = scored[0];
    if (!win || win.score < 45) {
      m.cooldown[p.id] = Number(st.dayIndex || 0) + 7;
      this.marketLog(`{p:${p.id}} (${this.positionLabel(p.pos)}) отклонил все предложения и остаётся свободным агентом`, 'bad');
      this.marketResult(p, null, th, scored, 'ни одно предложение его не устроило');
      if (this.setNotice) { try { this.setNotice(`${p.name} отклонил все предложения.`); } catch (e) { } }
      return;
    }
    const mine = win.teamId === th.teamId;
    const block = this.dealCheck(p, win.teamId, win.offer, 'fa');
    if (block) {
      this.marketLog(`Переговоры с {p:${p.id}} сорвались: ${block}`, 'bad');
      this.marketResult(p, null, th, scored, 'переговоры сорвались: ' + block);
      if (mine && this.setNotice) { try { this.setNotice(`Переговоры с ${p.name} сорвались: ${block}`); } catch (e) { } }
      return;
    }
    this.marketComplete(p, win.teamId, win.offer, 'fa');
    this.marketResult(p, win.teamId, th, scored, mine ? '' : this.marketWhyLost(scored, th.teamId, win.teamId));
    if (mine) {
      if (this.setNotice) { try { this.setNotice(`${p.name} выбрал ваш клуб и подписал контракт.`); } catch (e) { } }
    } else {
      this.marketLog(`{p:${p.id}} выбрал {t:${win.teamId}} вместо вашего предложения`, 'bad');
      if (this.setNotice) { try { this.setNotice(`${p.name} выбрал другой клуб: ${(this.teamById(win.teamId) || {}).name || ''}.`); } catch (e) { } }
    }
  };

  /* ------------------------------------------------------------------ ежедневные процессы */
  const baseAdv = proto.advancePlayerDays;
  proto.advancePlayerDays = function (days) {
    const r = baseAdv.apply(this, arguments);
    try { if (this.mk() && Number(days) > 0) this.marketTick(Math.min(60, Math.round(days))); } catch (e) { console.warn('KHL Manager 14.7 market:', e); }
    return r;
  };
  proto.marketTick = function (days) {
    const m = this.mk(), st = this.state; if (!m) return;
    const end = Number(st.dayIndex || 0);
    this.marketWatchTick(days);
    for (let k = days - 1; k >= 0; k--) { st.dayIndex = end - k; try { this.marketThinkDay(); this.marketAiDay(); } finally { st.dayIndex = end; } }
    // сроки требований
    m.requests.filter(r => r.status === 'open' && r.until != null && end > r.until).forEach(r => this.terminateByPlayer(r.pid, r));
    try { if (!m.review && this.regularSeasonComplete && this.regularSeasonComplete()) this.marketSeasonReview(); } catch (e) { }
    try { if (m.review && st.playoff) this.marketCupReview(); } catch (e) { }
    this.openRequestsLimit();
  };
  proto.openRequestsLimit = function () { /* зарезервировано: ограничение числа одновременных требований */ };
  proto.marketWatchTick = function (days) {
    const m = this.mk(), st = this.state, my = st.teamId;
    const tgp = (st.standings[my] || {}).gp || 0;
    const prevGp = m.lastTeamGp == null ? tgp : m.lastTeamGp, played = tgp - prevGp; m.lastTeamGp = tgp;
    const sinceSample = (m.lastSample == null ? 0 : tgp - m.lastSample);
    const doSample = sinceSample >= 3; if (doSample || m.lastSample == null) m.lastSample = tgp;
    const slots = st.slotAssignments || {}, top = new Set(Object.entries(slots).filter(([k, v]) => v && /^(F1|D1|G$)/.test(k)).map(([k, v]) => v));
    for (const p of this.teamPlayers(my)) {
      const w = m.watch[p.id] || (m.watch[p.id] = { top: 0, samples: 0, dnp: 0, low: 0, gp: (st.playerStats[p.id] || {}).gp || 0 });
      const gp = (st.playerStats[p.id] || {}).gp || 0;
      if (played > 0) w.dnp = gp > w.gp ? 0 : w.dnp + played;
      w.gp = gp;
      if (doSample && tgp > 0) { w.samples++; if (top.has(p.id)) w.top++; }
      const d = this.playerDev ? this.playerDev(p) : null;
      w.low = d && d.morale != null && d.morale < 30 ? w.low + days : 0;
      const hasRole = m.promises.some(x => x.pid === p.id && x.kind === 'role' && x.status === 'active');
      if (hasRole && w.dnp >= 10) { this.promiseBroken(m.promises.find(x => x.pid === p.id && x.kind === 'role' && x.status === 'active'), 'не выходит в составе 10 матчей подряд'); w.dnp = 0; }
      if (w.low >= 60) { this.requestOpen(p.id, 'conflict', `${p.name}: затяжной конфликт с тренером, просит расторгнуть контракт.`); w.low = 0; }
      if (this.ageYears(p) >= 33 && tgp >= 36 && this.conferenceRank(my) > 8 && d && d.morale != null && d.morale < 55) this.requestOpen(p.id, 'veteran', `${p.name} (${Math.round(this.ageYears(p))}) хочет побороться за титул и просит отпустить его в сильный клуб.`);
    }
  };

  /* ИИ-клубы: подписывают свободных агентов по потребности на позицию, с учётом потолка и оценки клуба игроком */
  proto.marketAiDay = function () {
    const m = this.mk(), st = this.state; if (!m) return;
    if (!this.marketWindow().open) return;
    const pool = this.marketPool().filter(x => !this.thinkOf(x.id)); if (!pool.length) return;
    const my = st.teamId;
    const teams = this.db.teams.filter(t => t.id !== my).map(t => ({ t, needs: this.marketNeeds(t.id) }));
    teams.sort(() => Math.random() - 0.5);
    let signed = 0;
    const maxSign = this.marketAiLimit ? this.marketAiLimit() : 2;
    for (const { t, needs } of teams) {
      if (signed >= maxSign) break;
      const hole = Object.entries(needs).sort((a, b) => b[1].score - a[1].score)[0];
      if (!hole) continue;
      const [g, n] = hole, short = n.short > 0;
      const p = short ? 0.5 : n.score > 1.5 ? 0.06 : n.score > 0.5 ? 0.025 : 0;
      if (!(p > 0 && Math.random() < p)) continue;
      if (this.teamPlayers(t.id).length >= (short ? CAP.maxRoster : 34)) continue;
      const cur = this.marketPower().rows[t.id][g];
      const cands = pool.filter(x => x.teamId === FA && grp(x.pos) === g && (short || this.permanentOVR(x) > cur - 2)).sort((a, b) => this.permanentOVR(b) - this.permanentOVR(a));
      for (const c of cands.slice(0, 6)) {
        const years = Math.min(this.wantYears(c), 2), type = c.contract === '1-way' && this.ageYears(c) > 20 ? '1-way' : (this.ageYears(c) <= 20 ? '3-way' : '2-way');
        const offer = { salary: this.askSalary(c), years, type, promises: [], round: 0, kind: 'fa' };
        if (this.dealCheck(c, t.id, offer, 'fa')) continue;
        if (this.evaluateOffer(c, t.id, offer).score < 60) continue;
        this.marketComplete(c, t.id, offer, 'fa'); signed++;
        pool.splice(pool.indexOf(c), 1);
        break;
      }
    }
  };

  /* ------------------------------------------------------------------ сводка для интерфейса */
  proto.marketSummary = function () {
    const m = this.mk(); if (!m) return null;
    const pool = this.marketPool(), cs = this.capStatus(this.state.teamId);
    return { pool: pool.length, rep: m.rep, window: this.marketWindow(), cap: cs, openRequests: this.openRequests().length };
  };
})();

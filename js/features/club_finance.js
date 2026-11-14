/* KHL Manager 14.7.11 — экономика клуба: реальный счёт.
   state.finance: счёт каждого клуба, доходы/расходы сезона по статьям, журнал и помесячные итоги вашего клуба.
   Начисления: по дням (ТВ, спонсоры, атрибутика, зарплаты, фарм, арена, штаб, прочее — суммы за сезон делятся на 250 игровых дней),
   по матчам (билеты хозяев, плей-офф ×1,35, переезды гостей), по итогам (бонус лиги за место, призовые плей-офф).
   Решения игрока: цена билета и инвестиции в арену. Случайных чисел нет: на результаты матчей экономика не влияет. */
(function () {
  const proto = KHLManagerApp.prototype;
  const E = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const M = x => (Math.abs(x) / 1e6).toFixed(1).replace('.', ',') + ' млн';
  const MS = x => (x < 0 ? '−' : x > 0 ? '+' : '') + M(x);
  const DAYS = 250;                                       // игровых дней сезона, по которым делятся годовые статьи
  const PRICES = [0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15, 1.2, 1.3];
  const ARENA = [{ cost: 120e6, cap: 0.07 }, { cost: 180e6, cap: 0.14 }, { cost: 260e6, cap: 0.22 }];   // уровни арены: цена и прирост вместимости
  const INC = [['tv', 'Лига и телетрансляции'], ['spo', 'Спонсоры'], ['gate', 'Билеты (регулярка)'], ['po', 'Билеты и призовые (плей-офф)'], ['mer', 'Атрибутика и прочее']];
  const EXP = [['pay', 'Зарплаты игроков'], ['farm', 'Фарм-клуб'], ['arena', 'Арена и содержание'], ['staff', 'Персонал и медицина'], ['log', 'Переезды'], ['inv', 'Инвестиции'], ['oth', 'Прочее']];
  const MON = ['Сен', 'Окт', 'Ноя', 'Дек', 'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн'];

  proto.clubStrengthRank = function (id) {
    const key = (this.state ? this.state.dayIndex : 0) + ':' + this.db.players.length;
    if (!this._csr || this._csr.key !== key) {
      const v = this.db.teams.map(t => {
        const a = this.teamPlayers(t.id).map(p => this.permanentOVR(p)).sort((x, y) => y - x).slice(0, 20);
        return { id: t.id, s: a.reduce((s, x) => s + x, 0) / Math.max(1, a.length) };
      }).sort((x, y) => y.s - x.s);
      this._csr = { key, rank: Object.fromEntries(v.map((x, i) => [x.id, i + 1])) };
    }
    return this._csr.rank[id] || 11;
  };

  proto.finEnsure = function () {
    const st = this.state; if (!st) return null;
    if (!st.finance) {
      const clubs = {}, bal = {};
      this.db.teams.forEach(t => { clubs[t.id] = { inc: {}, exp: {} }; bal[t.id] = 0; });
      st.finance = { v: 1, season: st.seasonNumber || 1, lastDay: Math.max(0, Number(st.dayIndex) || 0), clubs, bal, months: [], ledger: [], price: 1, arenaLvl: 0, hist: [], bonusDone: false, prizeDone: {} };
      // старые сохранения: уже сыгранные матчи в счёт не идут, начисления — с сегодняшнего дня
      st.matches.forEach(m => { if (m.played) m.finDone = true; });
    }
    return st.finance;
  };

  proto.finBook = function (id, side, cat, amt, note) {
    const f = this.state.finance, c = f.clubs[id]; if (!c || !amt) return;
    c[side][cat] = (c[side][cat] || 0) + amt;
    f.bal[id] = (f.bal[id] || 0) + (side === 'inc' ? amt : -amt);
    if (id === this.state.teamId) {
      const mi = clamp(Math.floor((Number(this.state.dayIndex) || 0) / 30), 0, 9);
      const m = f.months[mi] || (f.months[mi] = { inc: 0, exp: 0 }); m[side] += amt;
      if (note) { f.ledger.push({ d: Number(this.state.dayIndex) || 0, side, cat, amt: Math.round(amt), note }); if (f.ledger.length > 60) f.ledger.splice(0, f.ledger.length - 60); }
    }
  };

  // доход от билетов за один домашний матч
  proto.finGate = function (id, playoff) {
    const f = this.state.finance, n = this.db.teams.length || 22, rank = this.clubStrengthRank(id), mine = id === this.state.teamId;
    const ss = this.state.standings[id] || {}, gp = ss.gp || 0, form = clamp(gp ? (ss.pts || 0) / (2 * gp) : 0.5, 0, 1);
    const arena = (this.stadiumFor && this.stadiumFor(id)) || {};
    const cap = (Number(arena.capacity) || 8000) * (1 + (mine && f.arenaLvl ? ARENA[f.arenaLvl - 1].cap : 0));
    const k = mine ? f.price : 1;
    const demand = clamp(0.66 + 0.30 * form + (n - rank) * 0.004 - 1.4 * (k - 1), 0.4, 1.0);   // загрузка арены
    const sold = cap * demand;
    return sold * (1500 + (n - rank) * 35) * k * (playoff ? 1.35 : 1);
  };

  proto.finSync = function () {
    const st = this.state; if (!st) return;
    const f = this.finEnsure(), n = this.db.teams.length || 22, day = Number(st.dayIndex) || 0;
    // по дням
    const from = Math.max(f.lastDay + 1, 1), to = Math.min(day, DAYS);
    if (to >= from) {
      const k = (to - from + 1) / DAYS;
      this.db.teams.forEach(t => {
        const id = t.id, rank = this.clubStrengthRank(id), arena = (this.stadiumFor && this.stadiumFor(id)) || {}, cap = Number(arena.capacity) || 8000;
        const farm = this.teamPlayers(id).filter(p => this.isInFarm && this.isInFarm(p)).length, r = (rank - 1) / Math.max(1, n - 1);
        this.finBook(id, 'inc', 'tv', 170e6 * k);
        this.finBook(id, 'inc', 'spo', 380e6 * (1.3 - 0.6 * r) * k);
        this.finBook(id, 'inc', 'mer', 130e6 * (1.15 - 0.3 * r) * k);
        this.finBook(id, 'exp', 'pay', this.teamPayroll(id) * k);
        this.finBook(id, 'exp', 'farm', (45e6 + farm * 1.5e6) * k);
        this.finBook(id, 'exp', 'arena', (90e6 + cap * 7000) * k);
        this.finBook(id, 'exp', 'staff', 140e6 * k);
        this.finBook(id, 'exp', 'oth', 60e6 * k);
      });
    }
    if (day > f.lastDay) f.lastDay = Math.min(Math.max(day, f.lastDay), DAYS + 40);
    // по матчам
    for (const m of st.matches) {
      if (!m.played || m.cancelled || m.finDone) continue;
      m.finDone = true;
      if (!f.clubs[m.homeId]) continue;
      this.finBook(m.homeId, 'inc', m.playoff ? 'po' : 'gate', this.finGate(m.homeId, !!m.playoff), m.homeId === st.teamId ? (m.playoff ? 'Билеты: матч плей-офф' : 'Билеты: домашний матч') : '');
      const away = m.awayId; if (f.clubs[away]) this.finBook(away, 'exp', 'log', away === 'shanghai' || /шанх/i.test(String((this.teamById(away) || {}).name || '')) ? 4.5e6 : 2.2e6, away === st.teamId ? 'Переезд на выездной матч' : '');
    }
    // бонус лиги за место в регулярке и призовые плей-офф
    const po = st.playoff;
    if (po && po.started && !f.bonusDone) {
      f.bonusDone = true;
      const rows = this.db.teams.map(t => ({ id: t.id, ...(st.standings[t.id] || {}) })).sort((a, b) => (b.pts || 0) - (a.pts || 0) || ((b.gf || 0) - (b.ga || 0)) - ((a.gf || 0) - (a.ga || 0)));
      rows.forEach((r, i) => this.finBook(r.id, 'inc', 'tv', 40e6 * (1 - i / Math.max(1, n - 1)), r.id === st.teamId ? 'Бонус лиги за место в регулярке' : ''));
    }
    if (po && this.__poAllSeries723) {
      const prize = { 1: 8e6, 2: 12e6, 3: 20e6, 4: 40e6 };
      for (let s = 1; s <= 4; s++) for (const se of this.__poAllSeries723(s)) {
        if (!se || !se.complete || !se.winnerId) continue;
        const key = s + ':' + se.winnerId; if (f.prizeDone[key]) continue; f.prizeDone[key] = 1;
        this.finBook(se.winnerId, 'inc', 'po', prize[s], se.winnerId === st.teamId ? 'Призовые за победу в серии' : '');
      }
    }
  };

  proto.finSetPrice = function (dir) {
    const f = this.finEnsure(); let i = PRICES.indexOf(f.price); if (i < 0) i = PRICES.indexOf(1);
    i = clamp(i + dir, 0, PRICES.length - 1); f.price = PRICES[i];
    this.persistQuietly && this.persistQuietly();
  };
  proto.finInvestArena = function () {
    const f = this.finEnsure(); if (f.arenaLvl >= ARENA.length) return false;
    const lv = ARENA[f.arenaLvl]; this.finSync();
    this.finBook(this.state.teamId, 'exp', 'inv', lv.cost, `Модернизация арены, уровень ${f.arenaLvl + 1}`);
    f.arenaLvl++; this.persistQuietly && this.persistQuietly(); return true;
  };
  // начало нового сезона: итоги архивируются, статьи сбрасываются, счёт остаётся
  proto.finNewSeason = function () {
    const st = this.state, f = st && st.finance; if (!f) return;
    const me = f.clubs[st.teamId] || { inc: {}, exp: {} };
    f.hist.push({ season: f.season, inc: me.inc, exp: me.exp });
    if (f.hist.length > 10) f.hist.shift();
    this.db.teams.forEach(t => { f.clubs[t.id] = { inc: {}, exp: {} }; });
    f.months = []; f.ledger = []; f.bonusDone = false; f.prizeDone = {}; f.season = st.seasonNumber || (f.season + 1); f.lastDay = 0;
  };
  const _tss = proto.trStartSeason;
  if (typeof _tss === 'function') proto.trStartSeason = function () {
    try { this.finSync(); } catch (e) { }
    const r = _tss.apply(this, arguments);
    if (r) { try { this.finNewSeason(); } catch (e) { console.warn('finNewSeason', e); } }
    return r;
  };
  const _ra = proto.renderAll;
  proto.renderAll = function () { try { this.finSync(); } catch (e) { console.warn('finSync', e); } return _ra.apply(this, arguments); };

  // 14.7.21: убрали строку плашек «Счёт клуба / Доходы сезона / Расходы сезона / Результат
  // сезона» (у всех клубов — не нужны на этом этапе) и блок «По месяцам / Решения клуба /
  // Последние операции» (показывался только для своего клуба — тоже пока не нужен; вкладка
  // «Финансы» своего клуба теперь выглядит так же, как и у ИИ-клубов). Сами данные и функции
  // (finBook, finSetPrice, finInvestArena, ledger, months) не удалены — только скрыты в вёрстке,
  // их легко вернуть в UI позже.
  proto.clubFinanceHtml = function (id) {
    this.finSync();
    const st = this.state, f = st.finance, c = f.clubs[id] || { inc: {}, exp: {} };
    const sum = o => Object.values(o).reduce((s, x) => s + x, 0), inc = sum(c.inc), exp = sum(c.exp);
    const col = (title, defs, data, total) => `<div class="cd-box"><h4>${title}</h4><div class="cf-list">${defs.filter(([k]) => data[k] || k !== 'inv').map(([k, name]) => `<div class="cf-row"><div class="cf-top"><span>${E(name)}</span><b>${M(data[k] || 0)}</b></div>`
      + `<div class="cf-bar"><i style="width:${total > 0 ? Math.min(100, Math.round((data[k] || 0) / total * 100)) : 0}%"></i></div></div>`).join('')}</div></div>`;
    return `<div class="cd-fin"><div class="grid grid-equal">${col('Доходы', INC, c.inc, inc)}${col('Расходы', EXP, c.exp, exp)}</div></div>`;
  };
})();

/* KHL Manager 14.8.0 — экономика клуба: реальные бюджеты 22 клубов вместо одной обобщённой формулы.
   state.finance: счёт каждого клуба, доходы/расходы сезона по статьям, журнал и помесячные итоги вашего клуба.

   Источник цифр — реальная годовая ведомость игрока (файл KHL_finances_2026_27_v3.xlsx), согласована
   отдельным концептом перед реализацией. Правила начисления (решены игроком, см. CHANGELOG 14.8.0):
    - Зарплаты игроков остаются ДИНАМИЧЕСКИМИ (teamPayroll — реальный фонд по текущему составу): цифра
      «pay» из файла сюда НЕ идёт буквально — иначе обмены и контракты перестали бы влиять на баланс.
    - Спонсоры, Атрибутика, Фарм-клуб, Арена и содержание, Персонал, Прочее — фиксированные годовые суммы
      из файла, равными долями 1/12 на каждый из 12 календарных месяцев (включая межсезонье).
    - Лига и ТВ — ГИБРИД (явное решение игрока): 35% годовой суммы — равными долями помесячно (как раньше,
      ровный кэшфлоу), 65% — одной выплатой 1 мая (ближе к практике КХЛ, премия по итогам сезона).
    - Билеты (регулярка) — НЕ фиксированная сумма: файл даёт БАЗУ (годовая сумма ÷ 34 домашних матча при
      нейтральной посещаемости), а дальше решает уже готовая модель посещаемости (attendance_model.js,
      fanInterest/calculateAttendance — форма команды, ранг гостя, стадия плей-офф) и цена билета игрока —
      только множитель поверх базы, иначе управление матчдэем в менеджере станет декорацией.
    - Переезды — база из файла ÷ 34 выездных матча (вместо прежнего плоского «2,2 млн / 4,5 млн для Шанхая» —
      реальные цифры клуба уже учитывают его географию, отдельный частный случай больше не нужен).
    - Билеты и премии плей-офф — с нуля: выход в плей-офф = +20% годовой билетной базы (всем участникам
      сетки), каждый выигранный раунд = ещё +15% (кумулятивно, победителю серии). Призовые ИГРОКАМ за
      раунд (вне потолка, playoff_prize.js) остались прежней структурой «по стадии выбывания», но теперь
      масштабируются по тиру клуба (finClubTier, по годовой выручке) — заменяет прежнюю единую для всех
      таблицу 50/75/150+150 млн, а не дублирует её.
    - Доплаты в обменах / расторжения — как и раньше, 0 по умолчанию, только по факту события.
    - Стартовый баланс клуба — тоже решение игрока, добавлено в эту же версию: раньше все клубы стартовали
      с нуля (из-за этого, в частности, ползунок доплаты деньгами в обменах был недвижим в начале карьеры) —
      теперь стартовый резерв = ±20% годовой выручки клуба, знак берётся из баланса клуба в файле (клубы
      с историческим дефицитом стартуют в минусе, устойчивые — с запасом).
   Решения игрока: цена билета и инвестиции в арену (теперь реально поднимают вместимость через stadiumFor,
   а не только внутренний расчёт — отражается и в посещаемости, и в статистике арены). Случайных чисел в
   начислении нет — на баланс не влияет ничего, кроме уже посчитанной посещаемости матча. */
(function () {
  const proto = KHLManagerApp.prototype;
  const E = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&lt;', '>': '&gt;', '"': '&quot;', '&': '&amp;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const M = x => (Math.abs(x) / 1e6).toFixed(1).replace('.', ',') + ' млн';
  const MS = x => (x < 0 ? '−' : x > 0 ? '+' : '') + M(x);
  const DAY = 86400000;
  const PRICES = [0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15, 1.2, 1.3];
  const ARENA = [{ cost: 120e6, cap: 0.07 }, { cost: 180e6, cap: 0.14 }, { cost: 260e6, cap: 0.22 }];   // уровни арены: цена и прирост вместимости
  const INC = [['tv', 'Лига и телетрансляции'], ['spo', 'Спонсоры'], ['gate', 'Билеты (регулярка)'], ['po', 'Билеты плей-офф'], ['mer', 'Атрибутика и прочее'], ['trade', 'Доплаты в обменах']];
  const EXP = [['pay', 'Зарплаты игроков'], ['farm', 'Фарм-клуб'], ['arena', 'Арена и содержание'], ['staff', 'Персонал и медицина'], ['log', 'Переезды'], ['inv', 'Инвестиции'], ['trade', 'Доплаты в обменах'], ['sever', 'Расторжение контрактов'], ['prize', 'Призовые плей-офф игрокам'], ['oth', 'Прочее']];
  const MON = ['Сен', 'Окт', 'Ноя', 'Дек', 'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн'];
  const TV_MONTHLY_SHARE = 0.35, TV_LUMP_SHARE = 0.65;        // гибрид ТВ/лиги — решение игрока, 14.8.0

  // 14.8.0: годовые бюджеты 22 клубов (₽, из файла игрока). pay — справочно (реальная зарплата идёт из
  // teamPayroll, см. комментарий выше), на начисление не влияет. startBal — стартовый резерв/дефицит счёта.
  const CLUB_BUDGET = {
    ska:          { tv: 90e6,  spo: 2580e6, gate: 520e6, mer: 210e6, farm: 350e6, arena: 700e6, staff: 600e6, log: 220e6, oth: 380e6, startBal: 680e6 },
    akbars:       { tv: 111e6, spo: 2089e6, gate: 410e6, mer: 190e6, farm: 180e6, arena: 420e6, staff: 420e6, log: 260e6, oth: 320e6, startBal: 560e6 },
    lokomotiv:    { tv: 190e6, spo: 1750e6, gate: 450e6, mer: 130e6, farm: 210e6, arena: 320e6, staff: 300e6, log: 230e6, oth: 260e6, startBal: 504e6 },
    cska:         { tv: 100e6, spo: 1860e6, gate: 350e6, mer: 130e6, farm: 180e6, arena: 400e6, staff: 380e6, log: 210e6, oth: 260e6, startBal: 488e6 },
    avangard:     { tv: 110e6, spo: 1465e6, gate: 490e6, mer: 150e6, farm: 110e6, arena: 260e6, staff: 600e6, log: 660e6, oth: 280e6, startBal: -443e6 },
    avtomobilist: { tv: 90e6,  spo: 870e6,  gate: 685e6, mer: 135e6, farm: 90e6,  arena: 270e6, staff: 100e6, log: 260e6, oth: 180e6, startBal: 356e6 },
    metallurg:    { tv: 107e6, spo: 1253e6, gate: 310e6, mer: 100e6, farm: 110e6, arena: 210e6, staff: 110e6, log: 230e6, oth: 190e6, startBal: 354e6 },
    salavat:      { tv: 124e6, spo: 841e6,  gate: 500e6, mer: 55e6,  farm: 110e6, arena: 260e6, staff: 160e6, log: 210e6, oth: 190e6, startBal: 304e6 },
    spartak:      { tv: 93e6,  spo: 927e6,  gate: 350e6, mer: 100e6, farm: 50e6,  arena: 260e6, staff: 210e6, log: 190e6, oth: 150e6, startBal: 294e6 },
    dinamo_msk:   { tv: 118e6, spo: 722e6,  gate: 545e6, mer: 80e6,  farm: 90e6,  arena: 320e6, staff: 300e6, log: 210e6, oth: 210e6, startBal: -293e6 },
    traktor:      { tv: 157e6, spo: 693e6,  gate: 490e6, mer: 80e6,  farm: 90e6,  arena: 210e6, staff: 150e6, log: 210e6, oth: 160e6, startBal: -284e6 },
    shanghai:     { tv: 60e6,  spo: 950e6,  gate: 180e6, mer: 55e6,  farm: 50e6,  arena: 110e6, staff: 110e6, log: 190e6, oth: 130e6, startBal: 249e6 },
    torpedo:      { tv: 70e6,  spo: 860e6,  gate: 260e6, mer: 80e6,  farm: 60e6,  arena: 160e6, staff: 130e6, log: 190e6, oth: 130e6, startBal: -254e6 },
    amur:         { tv: 55e6,  spo: 965e6,  gate: 170e6, mer: 60e6,  farm: 50e6,  arena: 140e6, staff: 100e6, log: 440e6, oth: 120e6, startBal: -250e6 },
    sibir:        { tv: 65e6,  spo: 770e6,  gate: 290e6, mer: 90e6,  farm: 70e6,  arena: 160e6, staff: 130e6, log: 230e6, oth: 130e6, startBal: -243e6 },
    admiral:      { tv: 55e6,  spo: 925e6,  gate: 160e6, mer: 60e6,  farm: 50e6,  arena: 130e6, staff: 100e6, log: 430e6, oth: 120e6, startBal: -240e6 },
    dinamo_mn:    { tv: 60e6,  spo: 810e6,  gate: 210e6, mer: 70e6,  farm: 70e6,  arena: 130e6, staff: 110e6, log: 260e6, oth: 130e6, startBal: 230e6 },
    neftekhimik:  { tv: 60e6,  spo: 750e6,  gate: 210e6, mer: 60e6,  farm: 60e6,  arena: 160e6, staff: 110e6, log: 210e6, oth: 130e6, startBal: 216e6 },
    barys:        { tv: 50e6,  spo: 760e6,  gate: 130e6, mer: 50e6,  farm: 60e6,  arena: 130e6, staff: 100e6, log: 470e6, oth: 120e6, startBal: -198e6 },
    severstal:    { tv: 55e6,  spo: 625e6,  gate: 190e6, mer: 70e6,  farm: 70e6,  arena: 130e6, staff: 110e6, log: 170e6, oth: 120e6, startBal: 188e6 },
    sochi:        { tv: 55e6,  spo: 580e6,  gate: 200e6, mer: 60e6,  farm: 40e6,  arena: 110e6, staff: 90e6,  log: 260e6, oth: 110e6, startBal: -179e6 },
    lada:         { tv: 50e6,  spo: 360e6,  gate: 230e6, mer: 60e6,  farm: 40e6,  arena: 120e6, staff: 90e6,  log: 200e6, oth: 110e6, startBal: -140e6 }
  };
  // защитный фоллбэк — не должен срабатывать в игре (db.teams всегда 22 клуба из таблицы выше), но на
  // случай рассинхрона данных лучше правдоподобное среднее, чем ошибка/NaN
  const DEFAULT_BUDGET = { tv: 85e6, spo: 1000e6, gate: 320e6, mer: 95e6, farm: 110e6, arena: 240e6, staff: 220e6, log: 260e6, oth: 180e6, startBal: 0 };
  const budgetFor = id => CLUB_BUDGET[id] || DEFAULT_BUDGET;

  // 14.8.0: тир клуба по годовой выручке (не по силе состава — та волатильна в течение сезона и дала бы
  // скачущие призовые на ровном месте). Используется для масштабирования призовых плей-офф игрокам.
  proto.finClubTier = function (id) {
    const b = budgetFor(id), inc = b.tv + b.spo + b.gate + b.mer;
    return inc >= 2000e6 ? 'top' : inc >= 1000e6 ? 'mid' : 'low';
  };

  proto.finEnsure = function () {
    const st = this.state; if (!st) return null;
    if (!st.finance) {
      const clubs = {}, bal = {};
      this.league('KHL').teams().forEach(t => { clubs[t.id] = { inc: {}, exp: {} }; bal[t.id] = budgetFor(t.id).startBal; });
      st.finance = { v: 2, season: st.seasonNumber || 1, lastDay: Math.max(0, Number(st.dayIndex) || 0), clubs, bal, months: [], ledger: [], price: 1, arenaLvl: 0, hist: [], poQualDone: {}, poRoundDone: {}, tvLumpDone: {} };
      // старые сохранения: уже сыгранные матчи в счёт не идут, начисления — с сегодняшнего дня
      st.matches.forEach(m => { if (m.played) m.finDone = true; });
    }
    // переход со старой версии (v:1, без poQualDone/poRoundDone/tvLumpDone) — доращиваем недостающие поля,
    // баланс и уже начисленное за сезон не трогаем
    const f = st.finance;
    if (!f.poQualDone) f.poQualDone = {};
    if (!f.poRoundDone) f.poRoundDone = {};
    if (!f.tvLumpDone) f.tvLumpDone = {};
    f.v = 2;
    return f;
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

  // 14.8.0: база арены БЕЗ учёта апгрейда (апгрейд теперь поднимает вместимость по-настоящему, через
  // stadiumFor — см. ниже; «база» нужна отдельно, чтобы калибровка цены за место не плавала вместе с ней)
  const _stadiumForBase = proto.stadiumFor;
  proto.stadiumFor = function (teamId) {
    const base = _stadiumForBase.call(this, teamId);
    const st = this.state, f = st && st.finance;
    if (!f || teamId !== st.teamId || !f.arenaLvl) return base;
    const bonus = ARENA[f.arenaLvl - 1] ? ARENA[f.arenaLvl - 1].cap : 0;
    return Object.assign({}, base, { capacity: Math.round(base.capacity * (1 + bonus)) });
  };

  // 14.8.0: цена билета — множитель поверх реальной посещаемости матча, а не отдельная формула спроса;
  // сама посещаемость (сколько придёт зрителей) считает attendance_model.js — здесь только деньги с неё.
  // Вызывается из attendance_model.js (finPriceAdjustFill) ДО финального клампа заполняемости — так цена
  // двигает не только выручку, но и реальную явку (эластичность: дороже — меньше народу).
  proto.finPriceAdjustFill = function (teamId, fill) {
    const f = this.state && this.state.finance;
    if (!f || teamId !== this.state.teamId) return fill;
    const adj = 1 - 0.5 * (f.price - 1);   // цена 1.3 → ×0.85 явки, цена 0.8 → ×1.10 явки
    return fill * adj;
  };

  // доход от билетов за один домашний матч: база из файла (годовая сумма ÷ 34, при нейтральной явке по
  // ATTENDANCE_PARAMS.start) × реальная посещаемость этого конкретного матча × цена билета (только свой клуб)
  proto.finGate = function (id, match) {
    const b = budgetFor(id);
    const baseCap = Math.max(1, _stadiumForBase.call(this, id).capacity || 8000);
    const neutralFill = (this.ATTENDANCE_PARAMS && this.ATTENDANCE_PARAMS.start) || 0.70;
    const perSeat = (b.gate / 34) / (baseCap * neutralFill);
    const attendance = (match && match.attendance) || baseCap * neutralFill;
    const priceMult = id === this.state.teamId ? (this.state.finance ? this.state.finance.price : 1) : 1;
    return attendance * perSeat * priceMult;
  };

  proto.finSync = function () {
    const st = this.state; if (!st) return;
    const f = this.finEnsure(), day = Number(st.dayIndex) || 0, po = st.playoff;
    // по дням — все клубы, календарный год целиком (включая межсезонье), а не только игровые дни сезона
    const from = f.lastDay + 1, to = day;
    if (to >= from) {
      const days = to - from + 1;
      this.league('KHL').teams().forEach(t => {
        const id = t.id, b = budgetFor(id);
        this.finBook(id, 'inc', 'tv', b.tv * TV_MONTHLY_SHARE / 12 / 30 * days);
        this.finBook(id, 'inc', 'spo', b.spo / 12 / 30 * days);
        this.finBook(id, 'inc', 'mer', b.mer / 12 / 30 * days);
        this.finBook(id, 'exp', 'pay', this.teamPayroll(id) / 12 / 30 * days);  // динамический фонд (реальные контракты), делится так же помесячно
        this.finBook(id, 'exp', 'farm', b.farm / 12 / 30 * days);
        this.finBook(id, 'exp', 'arena', b.arena / 12 / 30 * days);
        this.finBook(id, 'exp', 'staff', b.staff / 12 / 30 * days);
        this.finBook(id, 'exp', 'oth', b.oth / 12 / 30 * days);
      });
    }
    if (day > f.lastDay) f.lastDay = day;
    // итоговая выплата лиги/ТВ — 65% годовой суммы, один раз на клуб за сезон, по итогам сезона
    // (привязано к завершению плей-офф, а не к календарной дате: дата "1 мая" неоднозначна —
    // trStartYear() означает разный год до и после сезонного роллвера, а флаг playoff.completed
    // надёжен в обоих случаях и уже используется для этой же цели в playoff_prize.js)
    if (po && po.completed) {
      this.league('KHL').teams().forEach(t => {
        if (f.tvLumpDone[t.id]) return; f.tvLumpDone[t.id] = 1;
        this.finBook(t.id, 'inc', 'tv', budgetFor(t.id).tv * TV_LUMP_SHARE, t.id === st.teamId ? 'Итоговая выплата лиги и ТВ (по итогам сезона)' : '');
      });
    }
    // по матчам: билеты хозяев (реальная посещаемость) и переезды гостей (база из файла ÷ 34)
    for (const m of st.matches) {
      if (!m.played || m.cancelled || m.finDone) continue;
      m.finDone = true;
      if (!f.clubs[m.homeId]) continue;
      if (!m.playoff) this.finBook(m.homeId, 'inc', 'gate', this.finGate(m.homeId, m), m.homeId === st.teamId ? 'Билеты: домашний матч' : '');
      const away = m.awayId; if (f.clubs[away]) this.finBook(away, 'exp', 'log', budgetFor(away).log / 34, away === st.teamId ? 'Переезд на выездной матч' : '');
    }
    // плей-офф: билетная база клуба растёт ступенями, а не считается по матчам
    if (po && po.started && this.__poAllSeries723) {
      this.__poAllSeries723(1).forEach(se => {
        [se.teamA, se.teamB].forEach(tid => {
          if (!tid || !f.clubs[tid] || f.poQualDone[tid]) return;
          f.poQualDone[tid] = 1;
          this.finBook(tid, 'inc', 'po', budgetFor(tid).gate * 0.20, tid === st.teamId ? 'Билеты плей-офф: выход в плей-офф (+20% годовой базы)' : '');
        });
      });
      for (let s = 1; s <= 4; s++) for (const se of this.__poAllSeries723(s)) {
        if (!se || !se.complete || !se.winnerId || !f.clubs[se.winnerId]) continue;
        const key = s + ':' + se.winnerId; if (f.poRoundDone[key]) continue; f.poRoundDone[key] = 1;
        this.finBook(se.winnerId, 'inc', 'po', budgetFor(se.winnerId).gate * 0.15, se.winnerId === st.teamId ? 'Билеты плей-офф: выигран раунд (+15% годовой базы)' : '');
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
  // начало нового сезона: итоги архивируются, статьи сбрасываются, счёт остаётся (баланс клуба — не статья,
  // переносится через сезон как есть; стартовый резерв/дефицит задаётся только один раз, при первом finEnsure)
  proto.finNewSeason = function () {
    const st = this.state, f = st && st.finance; if (!f) return;
    const me = f.clubs[st.teamId] || { inc: {}, exp: {} };
    f.hist.push({ season: f.season, inc: me.inc, exp: me.exp });
    if (f.hist.length > 10) f.hist.shift();
    this.league('KHL').teams().forEach(t => { f.clubs[t.id] = { inc: {}, exp: {} }; });
    f.months = []; f.ledger = []; f.poQualDone = {}; f.poRoundDone = {}; f.tvLumpDone = {}; f.season = st.seasonNumber || (f.season + 1); f.lastDay = Number(st.dayIndex) || 0;
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

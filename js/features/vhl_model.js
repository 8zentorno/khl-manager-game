/* KHL Manager 15.2.2 — ВХЛ: вторая лига в одном сохранении.
 * Лёгкая модель: счёт и авторы голов без хронологии; таблица 2-1-0; статистика И·Г·П·О;
 * плей-офф на Кубок Петрова: 16 команд, серии до 4 побед с пересевом.
 * Расписание детерминированное (не хранится, пересчитывается на лету для каждого из 5 сезонов карьеры по общему
 * принципу — см. vhlSchedule): 58 туров, окно 02.09–18.03 с паузами 31.12–04.01 и 08–11.01 (Кубок Дружбы),
 * без понедельников, плотнее в октябре-ноябре и по вторникам/четвергам — по анализу реального календаря ВХЛ 26/27.
 * Выездные серии клубов группируются по 8 географическим геогруппам (vhlGeoGroup) в блоки 3–5 игр подряд,
 * домашняя/гостевая серия не длиннее 2 подряд — те же «честные упрощения», что в реальном алгоритме ВХЛ
 * (туры синхронны, серии не выходят за пределы своей геогруппы).
 * В сохранении — только результаты (компактные массивы) и статистика, см. state.vhl.
 */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const SEASON = { firstDay: 1, lastDay: 196, poStart: 200, rounds: 58 };
  // смещения от seasonStart: 119–123 = 31.12–04.01 (Новый год), 127–130 = 08–11.01 (пауза на Кубок Дружбы)
  const EXCLUDED = new Set([119, 120, 121, 122, 123, 127, 128, 129, 130]);
  const VHL_SCHED_VERSION = 2; // меняется при изменении алгоритма расписания — требует пересборки сохранённых результатов сезона

  /* 15.5.0 (Этап 2 роадмапа «мультилиговая архитектура»): отдельный, собственный набор калибровок
   * для vhlSimMatch — НЕ часть KHL_MATCH_MODEL_PARAMS (match_model.js) и не читает его.
   * Калибровочная цель (по турнирной таблице ОЛИМПБЕТ ВХЛ 2024/25, sport-express.ru, регулярный чемпионат,
   * выборка 15 клубов из 64 игр): среднее число шайб за игру на команду ≈ 2,9, то есть суммарно за матч ≈ 5,8;
   * домашнее преимущество в хоккее на этом уровне — типичные ~55% побед дома (как и в КХЛ).
   * Подобрано эмпирически (прогон vhlSimMatch по полному расписанию сезона ВХЛ через harness, разовый расчёт,
   * скрипт не входит в репозиторий): итог на этих константах — 5,82 гола за матч, 56,0% побед дома, 16,6% игр
   * уходит в овертайм/буллиты — совпадает с целью.
   */
  const VHL_MATCH_MODEL_PARAMS = {
    base: { home: 3.06, away: 2.88 },   // среднеожидаемые голы при равных составах (off=def=gk у обеих команд)
    homeBonus: 0.17,                    // фиксированная добавка хозяевам сверху формулы
    coef: { offDef: 0.05, gk: 0.045 },  // чувствительность к разнице нападение/защита и к силе вратаря соперника
    clampHome: [0.9, 4.6], clampAway: [0.8, 4.4],
    otSoSplit: 0.5,                     // доля несыгранных вничью матчей, уходящих в овертайм (остальное — буллиты)
    tieBreak: { base: 0.5, k: 0.004, min: 0.25, max: 0.75 } // кто забивает решающую в ОТ/Б — по суммарной силе состава
  };
  proto.VHL_MATCH_MODEL_PARAMS = VHL_MATCH_MODEL_PARAMS;

  /* 8 географических групп ВХЛ 26/27 (из присланного анализа реального календаря) — основа для выездных серий. */
  const GEO_GROUPS = {
    'Северо-Запад': ['ska_vmf', 'dinamo_spb', 'zvezda', 'khimik'],
    'Центр-Юг': ['buran', 'tambov', 'dizel', 'kristall'],
    'Центр': ['kaluga', 'akm', 'ryazan'],
    'Поволжье': ['csk_vvs', 'neftyanik', 'bars'],
    'Прикамье': ['olimpiya', 'izhstal', 'toros', 'molot'],
    'Южный Урал': ['yuzhny_ural', 'magnitka', 'chelmet', 'gornyak'],
    'Зауралье-Сибирь': ['yugra', 'rubin', 'zaurale', 'omskie_krylya'],
    'Восток': ['norilsk', 'sokol', 'metallurg_nk', 'dinamo_altay']
  };
  const GEO_GROUP_OF = {};
  Object.entries(GEO_GROUPS).forEach(([g, ids]) => ids.forEach(id => { GEO_GROUP_OF[id] = g; }));

  const mulberry = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

  // 15.13.0: визард предлагает чекбокс «Подгружать ВХЛ и МХЛ в фоне» — если игрок его снял перед стартом
  // карьеры, this.state.bgLeagues===false и vhlAvailable() возвращает false для ЭТОЙ карьеры (нет данных —
  // то же самое, что раньше означало «ВХЛ недоступна»): это гасит и вкладку ВХЛ, и блок «Клубы-партнёры»
  // в «Развитии», и сам дневной прогон vhlCatchUp (см. advanceDay ниже) — без бэкграунд-лиг карьера быстрее.
  // У старых сохранений (bgLeagues не задан) поведение не меняется — считаем как включено.
  proto.vhlAvailable = function () {
    if (!(typeof VHL_DATABASE !== 'undefined' && Array.isArray(VHL_DATABASE.teams) && VHL_DATABASE.teams.length >= 4)) return false;
    if (this.state && this.state.bgLeagues === false) return false;
    return true;
  };
  // 15.4.1: делегируют в league('VHL') (js/features/league_core.js) — те же объекты/ссылки на VHL_DATABASE, поведение не меняется.
  proto.vhlTeams = function () { return this.vhlAvailable() ? this.league('VHL').teams() : []; };
  proto.vhlTeamById = function (id) { return this.vhlAvailable() ? this.league('VHL').team(id) : null; };
  proto.vhlFarmsOf = function (teamId) { return this.vhlTeams().filter(t => t.parentId === teamId); };
  // 15.13.0: отношения клуба ВХЛ с материнским клубом КХЛ — 'farm' (полный контроль материнского клуба,
  // общая квота командировок не действует — задел на будущее, список пока пуст) или 'partner' (свой
  // менеджмент/покупки, общая квота на командированных — см. PARTNER_LOAN_LIMIT в vhl_transfers.js).
  // По умолчанию у ВСЕХ клубов с parentId отношение — partner; null — независимый клуб (без parentId),
  // там действует прежняя механика рынка (компенсация, см. vhlSignIndependentProspect).
  const VHL_FARM_RELATION = new Set([]);
  proto.vhlRelationOf = function (clubId) {
    const t = this.vhlTeamById(clubId);
    if (!t || !t.parentId) return null;
    return VHL_FARM_RELATION.has(clubId) ? 'farm' : 'partner';
  };
  proto.vhlGeoGroup = function (teamId) { return GEO_GROUP_OF[teamId] || null; };
  proto.vhlGeoGroups = function () { return GEO_GROUPS; };

  proto.vhlState = function () {
    if (!this.state) return null;
    if (!this.state.vhl) {
      this.state.vhl = { v: VHL_SCHED_VERSION, seed: this.makeStableHash((this.state.createdAt || '') + 'vhl'), r: {}, ps: {}, gs: {}, pops: {}, pogs: {}, out: [], callups: [], lastGame: {}, grow: {}, aiFarm: {}, moves: {}, contractUntil: {}, vfat: {}, directive: 'develop', protectedIds: [], primaryFarm: null, po: null, newsDone: {} };
    }
    const v = this.state.vhl;
    // 15.2.2: алгоритм расписания изменился (геогруппы/выездные серии) — индексы туров у старых сохранений больше не совпадают
    // с новым расписанием, поэтому результаты текущего сезона ВХЛ один раз пересобираются (vhlCatchUp досчитает всё заново).
    if (v.v !== VHL_SCHED_VERSION) {
      v.v = VHL_SCHED_VERSION; v.r = {}; v.ps = {}; v.gs = {}; v.pops = {}; v.pogs = {}; v.lastGame = {}; v.po = null;
    }
    ['r', 'ps', 'gs', 'pops', 'pogs', 'lastGame', 'grow', 'aiFarm', 'newsDone', 'moves', 'contractUntil', 'vfat'].forEach(k => { if (!v[k]) v[k] = {}; });
    ['out', 'callups', 'protectedIds'].forEach(k => { if (!Array.isArray(v[k])) v[k] = []; });
    if (!v.directive) v.directive = 'develop';
    return v;
  };
  // 15.9.0: принадлежность клубу воспитанника ВХЛ после трансфера между клубами ВХЛ — единственная точка чтения,
  // через которую должен идти ЛЮБОЙ код, которому нужен текущий клуб игрока с id вида v_* (VHL_DATABASE статична
  // и общая для всех сохранений, трогать p.clubId напрямую нельзя — только через оверлей state.vhl.moves).
  proto.vhlEffectiveClubId = function (p) {
    if (!p) return null;
    if (!String(p.id).startsWith('v_')) return p.clubId || null;
    const v = this.vhlState();
    return (v && v.moves && v.moves[p.id]) || p.clubId;
  };

  /* ---------- расписание (детерминированное, не хранится; свой вариант на каждый из 5 сезонов карьеры) ---------- */
  proto.vhlSchedule = function () {
    if (!this.state) return [];
    const seasonNum = this.state.seasonNumber || 1;
    this._vhlSchedCache = this._vhlSchedCache || {};
    if (this._vhlSchedCache[seasonNum]) return this._vhlSchedCache[seasonNum];
    const ids = this.vhlTeams().map(t => t.id);
    if (ids.length < 4) return (this._vhlSchedCache[seasonNum] = []);
    const n = ids.length, half = n / 2, roundsBase = n - 1, totalRounds = roundsBase * 2;

    // 1) двойной круговой турнир — классический «круговой» метод даёт только пары («кто с кем»); хозяина/гостя
    //    из него не берём (у него бывают серии до 20+ подряд дома/в гостях у отдельных клубов) — назначаем сами на шаге 3.
    let ring = ids.slice();
    const legPairsRaw = []; // пары без значения «кто дома» — просто [team, team]
    for (let r = 0; r < roundsBase; r++) {
      const pairs = [];
      for (let i = 0; i < half; i++) pairs.push([ring[i], ring[n - 1 - i]]);
      legPairsRaw.push(pairs);
      ring = [ring[0], ring[ring.length - 1], ...ring.slice(1, -1)];
    }
    const roundsPairsOnly = []; // 58 туров × 15 пар, каждая пара встречается ровно 2 раза за сезон (по кругу турнира)
    for (let k = 0; k < totalRounds; k++) roundsPairsOnly.push(legPairsRaw[k % roundsBase]);

    // 2) сид свой для каждого сезона карьеры — поэтому порядок туров, хозяева и даты у сезонов 1–5 разные
    const v0 = this.vhlState();
    const baseSeed = (v0 && v0.seed) || this.makeStableHash((this.state.createdAt || '') + 'vhl');
    const rnd = mulberry((baseSeed ^ Math.imul(seasonNum, 0x9E3779B1)) >>> 0);

    // 3а) порядок туров — локальный поиск, который группирует будущие выездные блоки по геогруппам (мягкая цель;
    //    кто хозяин ещё не решён, поэтому ориентируемся на чередование (r+i)%2 как рабочую подсказку кластеризации)
    let order = roundsPairsOnly.map((_, k) => k);
    const clusterScore = ord => {
      const seq = {}; ids.forEach(id => { seq[id] = []; });
      ord.forEach(k => { roundsPairsOnly[k].forEach((pr, i) => {
        const guessHome = (k + i) % 2 === 0 ? pr[0] : pr[1], guessAway = guessHome === pr[0] ? pr[1] : pr[0];
        seq[guessHome].push({ home: true, opp: guessAway }); seq[guessAway].push({ home: false, opp: guessHome });
      }); });
      let score = 0;
      for (const id of ids) {
        const arr = seq[id], myGroup = GEO_GROUP_OF[id];
        let i = 0;
        while (i < arr.length) {
          if (arr[i].home) { i++; continue; }
          let j = i; while (j < arr.length && !arr[j].home) j++;
          const seg = arr.slice(i, j), same = myGroup ? seg.filter(x => GEO_GROUP_OF[x.opp] === myGroup).length : 0;
          score += same * 2;
          if (seg.length >= 3 && seg.length <= 5 && same === seg.length) score += 6;
          if (seg.length > 5) score -= (seg.length - 5) * 4;
          i = j;
        }
      }
      return score;
    };
    const swapAt = (ord, i, j) => { const next = ord.slice(); const tmp = next[i]; next[i] = next[j]; next[j] = tmp; return next; };
    const pickPair = () => {
      const i = Math.floor(rnd() * order.length);
      const span = 1 + Math.floor(rnd() * 6);
      const j = i + (rnd() < 0.5 ? -span : span);
      return (j < 0 || j >= order.length || j === i) ? null : [i, j];
    };
    let bestScore = clusterScore(order);
    const ITER = Math.min(6000, totalRounds * 100);
    for (let it = 0; it < ITER; it++) {
      const pr = pickPair(); if (!pr) continue;
      const next = swapAt(order, pr[0], pr[1]);
      const sc = clusterScore(next);
      if (sc >= bestScore) { order = next; bestScore = sc; }
    }

    // 3б) хозяин/гость — назначаем последовательно, по порядку туров, конструктивно (не подбором). Каждая пара клубов
    //    встречается дважды за сезон — ОДИН раз дома у каждого (стандартное правило двухкругового турнира): при первой
    //    встрече решаем свободно, при второй хозяин уже предопределён (наоборот) — так аккуратно получаем ровно 29/29
    //    у каждого клуба и никогда не нарушаем «один раз дома у каждого соперника». Серию «дома/в гостях» не длиннее
    //    2 подряд пытаемся удержать выбором среди СВОБОДНЫХ (первых) встреч; редкие случаи ≥3 чинятся на шаге 3в.
    const st = {}; ids.forEach(id => { st[id] = { last: null, run: 0, home: 0, away: 0 }; });
    const pairHome = {}; // ключ "A|B" (сортированный) -> кто был хозяином на первой встрече
    const pairKey = (A, B) => A < B ? A + '|' + B : B + '|' + A;
    const roundsAll = order.map(k => {
      const finalPairs = [];
      for (const [A, B] of roundsPairsOnly[k]) {
        const key = pairKey(A, B);
        let home;
        if (pairHome[key] !== undefined) {
          home = pairHome[key] === A ? B : A; // вторая встреча — хозяин наоборот, без вариантов
        } else {
          const sA = st[A], sB = st[B];
          const forceHomeA = sA.last === 'A' && sA.run >= 2, forceHomeB = sB.last === 'A' && sB.run >= 2;
          const forceAwayA = sA.last === 'H' && sA.run >= 2, forceAwayB = sB.last === 'H' && sB.run >= 2;
          if (forceHomeA && forceHomeB) home = sA.run >= sB.run ? A : B; // оба «просят» дом — отдаём более срочному (длиннее серия)
          else if (forceAwayA && forceAwayB) home = sA.run >= sB.run ? B : A; // оба «просят» выезд — симметрично
          else if (forceHomeA) home = A;
          else if (forceHomeB) home = B;
          else if (forceAwayA) home = B;
          else if (forceAwayB) home = A;
          else {
            // свободный выбор: продолжаем/начинаем «чистую» выездную серию внутри геогруппы, если можем
            const contA = sA.last === 'A' && GEO_GROUP_OF[A] && GEO_GROUP_OF[B] === GEO_GROUP_OF[A];
            const contB = sB.last === 'A' && GEO_GROUP_OF[B] && GEO_GROUP_OF[A] === GEO_GROUP_OF[B];
            if (contA && !contB) home = B;
            else if (contB && !contA) home = A;
            else {
              // балансируем: кому из пары до сих пор реже выпадало «дома» среди уже сыгранных свободных встреч
              const diff = sA.home - sA.away - (sB.home - sB.away);
              if (diff < 0) home = A; else if (diff > 0) home = B; else home = rnd() < 0.5 ? A : B;
            }
          }
          pairHome[key] = home;
        }
        const away = home === A ? B : A;
        finalPairs.push({ h: home, a: away });
        const upd = (id, isHome) => {
          const s = st[id], v = isHome ? 'H' : 'A'; s.run = (s.last === v) ? s.run + 1 : 1; s.last = v;
          if (isHome) s.home++; else s.away++;
        };
        upd(home, true); upd(away, false);
      }
      return finalPairs;
    });

    // 3в) точечный ремонт: иногда и вторая (предопределённая) встреча продолжает серию ≥3 — чиним, меняя местами
    //    хозяина СРАЗУ в обеих встречах пары (A↔B) — это не трогает итоговый счёт 29/29 (у каждого так и остаётся
    //    одна встреча дома и одна в гостях с этим соперником), просто переставляет, КАКАЯ из двух встреч домашняя.
    const pairPos = {}; // ключ пары -> [{pos,pi}, {pos,pi}] — обе временные позиции этой пары за сезон
    roundsAll.forEach((pairs, pos) => pairs.forEach((p, pi) => {
      const key = pairKey(p.h, p.a); (pairPos[key] = pairPos[key] || []).push({ pos, pi });
    }));
    const pairKeys = Object.keys(pairPos);
    const keysOf = {}; ids.forEach(id => { keysOf[id] = []; }); // какие пары (ключи) затрагивают каждый клуб
    pairKeys.forEach(key => { const [A, B] = key.split('|'); keysOf[A].push(key); keysOf[B].push(key); });
    const posOf = {}; ids.forEach(id => { posOf[id] = []; });
    roundsAll.forEach((pairs, pos) => pairs.forEach((p, pi) => { posOf[p.h].push({ pos, pi }); posOf[p.a].push({ pos, pi }); }));
    const seqOf = id => posOf[id].map(({ pos, pi }) => roundsAll[pos][pi].h === id);
    const violCountOf = id => { const seq = seqOf(id); let v = 0, run = 1; for (let i = 1; i < seq.length; i++) { if (seq[i] === seq[i - 1]) { run++; if (run > 2) v++; } else run = 1; } return v; };
    const totalViol = () => { let v = 0; for (const id of ids) v += violCountOf(id); return v; };
    // переворот одной пары трогает ТОЛЬКО эти два клуба (у каждого ровно одна домашняя и одна гостевая встреча с
    // этим соперником, независимо от переворота) — считаем нарушения только у них, это быстро и этого достаточно
    const flipPairKey = key => { const spots = pairPos[key]; spots.forEach(sp => { const p = roundsAll[sp.pos][sp.pi]; roundsAll[sp.pos][sp.pi] = { h: p.a, a: p.h }; }); };
    // имитация отжига по 435 битам «кто дома на первой встрече» — минимизируем число нарушений серии >2 подряд.
    // большую часть попыток берём из пар, где у кого-то из клубов сейчас есть нарушение (иначе почти все
    // случайные перевороты — это «пустой ход» без эффекта) — так быстрее сходимся при том же бюджете итераций.
    let curViol = totalViol();
    let bestViol = curViol, bestSnap = roundsAll.map(pairs => pairs.map(p => ({ h: p.h, a: p.a })));
    const ITERS = 150000;
    let hotIds = ids.filter(id => violCountOf(id) > 0);
    for (let it = 0; it < ITERS && bestViol > 0; it++) {
      if (it % 500 === 0) hotIds = ids.filter(id => violCountOf(id) > 0);
      let key;
      if (hotIds.length && rnd() < 0.6) {
        const hid = hotIds[Math.floor(rnd() * hotIds.length)];
        key = keysOf[hid][Math.floor(rnd() * keysOf[hid].length)];
      } else {
        key = pairKeys[Math.floor(rnd() * pairKeys.length)];
      }
      const [A, B] = key.split('|');
      const before = violCountOf(A) + violCountOf(B);
      flipPairKey(key);
      const after = violCountOf(A) + violCountOf(B);
      const delta = after - before;
      const T = Math.max(0.02, 1.5 * (1 - it / ITERS)); // температура убывает к нулю
      if (delta <= 0 || rnd() < Math.exp(-delta / T)) {
        curViol += delta;
        if (curViol < bestViol) { bestViol = curViol; bestSnap = roundsAll.map(pairs => pairs.map(p => ({ h: p.h, a: p.a }))); }
      } else {
        flipPairKey(key); // отклонили — переворачиваем обратно
      }
    }
    if (curViol > bestViol) for (let pos = 0; pos < roundsAll.length; pos++) roundsAll[pos] = bestSnap[pos];

    // 4) даты: без понедельников (в реальном календаре их нет), плотнее в окт/ноя и по вт/чт, плюс фиксированные паузы
    const days = [];
    for (let d = SEASON.firstDay; d <= SEASON.lastDay; d++) {
      if (EXCLUDED.has(d)) continue;
      const dt = this.clubCalDate(d);
      if (dt.getDay() === 1) continue; // понедельников с играми не бывает
      let w = 1, mo = dt.getMonth(), dow = dt.getDay();
      if (mo === 9 || mo === 10) w *= 1.6; else if (mo === 8 || mo === 0) w *= 0.8; // окт/ноя — пик, сен/янв — спад
      if (dow === 2 || dow === 4) w *= 1.4; // вт/чт — самые частые игровые дни
      days.push({ d, w });
    }
    let acc = 0; const cum = days.map(x => (acc += x.w)); const total = acc;
    const pickDay = k => {
      const target = (k + 0.5) / totalRounds * total;
      let lo = 0, hi = days.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < target) lo = mid + 1; else hi = mid; }
      return days[lo] ? days[lo].d : SEASON.lastDay;
    };
    const dates = roundsAll.map((_, pos) => pickDay(pos));
    // 5) чуть больше паузы вокруг переезда Норильск↔Красноярск (конкретный маршрут из анализа реального календаря)
    for (let pos = 0; pos < roundsAll.length - 1; pos++) {
      const pairs = roundsAll[pos];
      const route = pairs.some(p => (p.h === 'norilsk' && p.a === 'sokol') || (p.h === 'sokol' && p.a === 'norilsk'));
      if (route && dates[pos + 1] - dates[pos] < 2) dates[pos + 1] = Math.min(SEASON.lastDay, dates[pos] + 2);
    }
    for (let pos = 1; pos < dates.length; pos++) if (dates[pos] < dates[pos - 1]) dates[pos] = dates[pos - 1]; // монотонность после сдвига

    const sched = [];
    let idx = 0;
    roundsAll.forEach((pairs, pos) => { for (const p of pairs) sched.push({ i: idx++, d: dates[pos], round: pos + 1, h: p.h, a: p.a }); });
    return (this._vhlSchedCache[seasonNum] = sched);
  };

  /* ---------- выездные серии клуба (для отображения в календаре) — вычисляются из уже готового расписания,
   * поэтому всегда согласованы с тем, что реально получилось у генератора, а не с теоретическим идеалом. */
  proto.vhlTripsOf = function (clubId) {
    const sched = this.vhlSchedule().filter(m => m.h === clubId || m.a === clubId).sort((a, b) => a.round - b.round);
    const trips = []; let cur = null;
    for (const m of sched) {
      const away = m.a === clubId;
      if (!away) { cur = null; continue; }
      const grp = GEO_GROUP_OF[m.h] || null;
      if (cur && cur.group && grp === cur.group) cur.games.push(m); else { cur = { group: grp, games: [m] }; trips.push(cur); }
    }
    return trips.filter(t => t.games.length >= 2); // одиночные выезды не считаем «серией»
  };
  proto.vhlTripInfo = function (clubId, matchIndex) {
    const trips = this.vhlTripsOf(clubId);
    for (const t of trips) {
      const pos = t.games.findIndex(g => g.i === matchIndex);
      if (pos >= 0) return { group: t.group, pos: pos + 1, total: t.games.length };
    }
    return null;
  };

  /* ---------- составы клубов (воспитанники + командированные из КХЛ) ---------- */
  proto.vhlOwnPlayers = function (clubId) {
    const v = this.vhlState();
    const out = new Set(v ? v.out : []);
    return (this.vhlAvailable() ? VHL_DATABASE.players : []).filter(p => this.vhlEffectiveClubId(p) === clubId && !out.has(p.id));
  };
  proto.vhlLoanEntries = function (clubId) {
    const res = [];
    const add = (pid, entry, ai) => { const p = this.league('KHL').players().find(x => x.id === pid); if (p) res.push({ p, entry, ai }); };
    if (this.state && this.state.farm) Object.entries(this.state.farm).forEach(([pid, e]) => { if (e && e.clubId === clubId) add(pid, e, false); });
    const v = this.vhlState();
    if (v) Object.entries(v.aiFarm).forEach(([pid, e]) => { if (e && e.clubId === clubId) add(pid, e, true); });
    return res;
  };
  proto.vhlPlayerById = function (id) {
    if (this.vhlAvailable()) { const p = VHL_DATABASE.players.find(x => x.id === id); if (p) return p; }
    return this.league('KHL').players().find(x => x.id === id) || null;
  };
  proto.vhlPlayerOvr = function (p) {
    if (!p) return 60;
    if (String(p.id).startsWith('v_')) {
      const v = this.vhlState();
      return Math.min(85, (Number(p.ovr) || 60) + (v && v.grow[p.id] ? v.grow[p.id] : 0));
    }
    return this.permanentOVR ? this.permanentOVR(p) : (Number(p.ovr) || 70);
  };
  proto.vhlPlayerAge = function (p) {
    if (!p || !p.birthDate) return 25;
    if (this.exactAgeOn && this.currentDateMs && !String(p.id).startsWith('v_')) return Math.floor(this.ageYears(p));
    const base = new Date((this.state && this.state.seasonStart || '2026-09-03') + 'T12:00:00');
    base.setDate(base.getDate() + (this.state ? this.state.dayIndex || 0 : 0));
    const b = new Date(p.birthDate + 'T12:00:00');
    let a = base.getFullYear() - b.getFullYear();
    if (base.getMonth() < b.getMonth() || (base.getMonth() === b.getMonth() && base.getDate() < b.getDate())) a--;
    return a;
  };
  /* ---------- контракты и свободная агентация внутри ВХЛ (15.9.0) ----------
   * Сделана замкнутой экономикой самой ВХЛ: срок контракта игрока — своё поле оверлея (state.vhl.contractUntil,
   * по тому же принципу, что и moves выше — VHL_DATABASE статична и общая на все сохранения, трогать её нельзя).
   * На переходе между сезонами карьеры (vhlSeasonChurn, вызывается из trRollover) истекающие контракты либо
   * продлеваются тем же клубом, либо игрок становится свободным агентом ВНУТРИ ВХЛ — специальным «клубом»-
   * значением VHL_FA в том же оверлее moves, которое сразу работает со всем уже написанным кодом (vhlOwnPlayers,
   * vhlClubOf, league('VHL').teamPlayers и т.д. ищут эффективный клуб игрока — для VHL_FA его просто ни у кого
   * не найдут, что и значит «без клуба»). Клуб КХЛ может подписать такого игрока без компенсации (никто не
   * держит его прав) — см. vhlSignIndependentProspect в vhl_transfers.js. Общего пула с КХЛ нет: свободные
   * агенты ВХЛ остаются внутри ВХЛ, пока не подписаны клубом ВХЛ (следующая итерация — трансферный рынок) или КХЛ. */
  const VHL_FA = 'FA';
  proto.VHL_FA = VHL_FA;
  proto.vhlIsFree = function (p) { return !!p && this.vhlEffectiveClubId(p) === VHL_FA; };
  proto.vhlFreeAgents = function () {
    const v = this.vhlState(); if (!v) return [];
    const out = new Set(v.out);
    return (this.vhlAvailable() ? VHL_DATABASE.players : []).filter(p => !out.has(p.id) && this.vhlIsFree(p));
  };
  proto.vhlRand01 = function (seedStr) { return (this.makeStableHash(String(seedStr)) % 10000) / 10000; };
  // длина нового контракта: моложе — чаще длиннее (3-сторонний горизонт), ветераны — почти всегда на год
  proto.vhlContractYears = function (age, seedStr) {
    const r = this.vhlRand01(seedStr);
    if (age <= 20) return 1 + Math.floor(r * 3);   // 1–3
    if (age <= 26) return 1 + Math.floor(r * 2);   // 1–2
    return r < 0.8 ? 1 : 2;                         // ветераны почти всегда на год
  };
  // первичный контракт у игрока, который встречается впервые — срок «на середине» (не все контракты лиги
  // истекают одним годом), подобие случайного сдвига выравнивается вторым независимым броском.
  proto.vhlInitialContractUntil = function (p, nowY) {
    const age = this.vhlPlayerAge(p);
    const years = this.vhlContractYears(age, p.id + '|c0a');
    const elapsed = Math.floor(this.vhlRand01(p.id + '|c0b') * years);
    return nowY + Math.max(0, years - elapsed);
  };
  proto.vhlContractUntil = function (p) {
    const v = this.vhlState(); if (!v || !p) return null;
    if (v.contractUntil[p.id] == null) v.contractUntil[p.id] = this.vhlInitialContractUntil(p, this.seasonEndYear ? this.seasonEndYear() : 2027);
    return v.contractUntil[p.id];
  };
  // шанс, что клуб продлит контракт сам (не игрок решает — это ИИ-экономика ВХЛ): моложе и сильнее — охотнее
  proto.vhlResignChance = function (p) {
    const age = this.vhlPlayerAge(p), ovr = this.vhlPlayerOvr(p);
    let c = 0.75;
    if (age <= 23) c += 0.10;
    if (age >= 30) c -= 0.15;
    if (age >= 34) c -= 0.20;
    if (ovr >= 68) c += 0.08;
    if (ovr < 55) c -= 0.10;
    return Math.max(0.15, Math.min(0.95, c));
  };
  // контракты истекают на границе сезона карьеры (oldY — seasonEndYear() старого сезона, вызывается из trRollover
  // ПОСЛЕ того, как this.state уже указывает на новый сезон, но contractUntil/moves — те же данные карьеры).
  proto.vhlSeasonChurn = function (oldY) {
    const v = this.vhlState(); const rep = { resigned: 0, freed: 0, retired: 0, signedByClub: 0 };
    if (!v || !this.vhlAvailable()) return rep;
    const out = new Set(v.out);
    for (const p of VHL_DATABASE.players) {
      if (out.has(p.id)) continue; // уже в КХЛ — не наш игрок
      const cur = this.vhlEffectiveClubId(p);
      if (cur === VHL_FA) {
        // уже был свободен с прошлого межсезонья — слабые и возрастные могут уйти из хоккея сами
        const age = this.vhlPlayerAge(p), ovr = this.vhlPlayerOvr(p);
        if ((ovr < 58 || age > 32) && this.vhlRand01(p.id + '|ret' + oldY) < 0.3) { v.moves[p.id] = 'RETIRED'; rep.retired++; }
        continue;
      }
      if (cur === 'RETIRED') continue;
      if (this.vhlContractUntil(p) > oldY) continue; // контракт ещё действует
      if (this.vhlRand01(p.id + '|rs' + oldY) < this.vhlResignChance(p)) {
        v.contractUntil[p.id] = oldY + this.vhlContractYears(this.vhlPlayerAge(p), p.id + '|rs2' + oldY);
        rep.resigned++;
      } else {
        v.moves[p.id] = VHL_FA;
        rep.freed++;
      }
    }
    return rep;
  };
  /* 15.13.0: раньше свободный агент ВХЛ, которого никто не подписал (ни КХЛ, ни клуб ВХЛ — такого
   * механизма не было), «висел» без клуба до конца сезона карьеры. Теперь сразу после vhlSeasonChurn
   * (т.е. на переходе между сезонами — «в первые дни нового сезона», свободные агенты ещё не сыграли ни
   * одного матча) пробуем пристроить каждого в клуб с позиционным дефицитом — тот же перекос
   * fracF/fracD/fracG относительно среднего по лиге, что и у vhlSeasonTrades, только без обмена: просто
   * подписание (v.moves[p.id] = clubId). Кого не взяли — остаётся свободным до следующего межсезонья,
   * где у него снова будет шанс либо подписаться, либо уйти на пенсию (ветка выше, cur === VHL_FA). */
  proto.vhlFreeAgentSigningPass = function (oldY) {
    const rep = { signed: 0, stillFree: 0 };
    if (!this.vhlAvailable()) return rep;
    const v = this.vhlState(); if (!v) return rep;
    const agents = this.vhlFreeAgents();
    if (!agents.length) return rep;
    const clubs = this.vhlTeams().map(t => t.id);
    if (!clubs.length) return rep;
    const counts = {};
    clubs.forEach(id => {
      counts[id] = { F: 0, D: 0, G: 0 };
      this.vhlOwnPlayers(id).forEach(p => counts[id][this.vhlTradeBucket(p)]++);
    });
    const total = id => counts[id].F + counts[id].D + counts[id].G;
    const fracOf = (id, bucket) => { const t = total(id) || 1; return counts[id][bucket] / t; };
    const avgFrac = bucket => clubs.reduce((s, id) => s + fracOf(id, bucket), 0) / clubs.length;
    const avg = { F: avgFrac('F'), D: avgFrac('D'), G: avgFrac('G') };
    // сильнейшие свободные агенты находят клуб первыми (как и было бы на реальном рынке)
    const sorted = agents.slice().sort((a, b) => this.vhlPlayerOvr(b) - this.vhlPlayerOvr(a));
    for (const p of sorted) {
      const bucket = this.vhlTradeBucket(p);
      const deficit = clubs
        .map(id => ({ id, d: avg[bucket] - fracOf(id, bucket) }))
        .filter(x => x.d > 0.01)
        .sort((a, b) => b.d - a.d);
      if (!deficit.length) { rep.stillFree++; continue; } // нигде нет дефицита этой позиции — остаётся свободным
      const age = this.vhlPlayerAge(p), ovr = this.vhlPlayerOvr(p);
      let chance = 0.6;
      if (ovr >= 62) chance += 0.2; if (ovr < 55) chance -= 0.2;
      if (age >= 32) chance -= 0.15;
      chance = Math.max(0.1, Math.min(0.9, chance));
      if (this.vhlRand01(p.id + '|fasign' + oldY) >= chance) { rep.stillFree++; continue; }
      const clubId = deficit[0].id;
      v.moves[p.id] = clubId;
      counts[clubId][bucket]++;
      rep.signed++;
    }
    return rep;
  };
  /* 15.10.0: внутренний трансферный рынок ВХЛ — обмены игрок-на-игрока между клубами ВХЛ (включая фармы КХЛ —
   * так решили сознательно: ИИ может обменять воспитанника чужого фарма, защитить от этого можно только через
   * v.protectedIds, максимум 3 проспекта). Деньги не участвуют — у клубов ВХЛ нет модели бюджета, только обмен
   * состава на состав, по позиционному дисбалансу относительно средних по лиге показателей (F/D/G). Замкнуто
   * внутри ВХЛ, не связано с КХЛ-рынком. Вызывается раз в межсезонье, из trRollover, после vhlSeasonChurn.
   */
  proto.vhlTradeBucket = function (p) {
    if (p.pos === 'G') return 'G';
    if (p.pos === 'D') return 'D';
    return 'F'; // 'F','LW','C','RW' — все нападающие в одном бакете
  };
  // выбор игрока для обмена: не трогаем защищённых и не отдаём предпоследнего/последнего на позиции (пустой клуб
  // по бакету недопустим); избегаем как самого слабого, так и самого сильного — отдают глубину состава, не звёзд.
  proto.vhlPickTradePiece = function (clubId, bucket, seedKey) {
    const v = this.vhlState(); if (!v) return null;
    const protectedSet = new Set(v.protectedIds || []);
    const pool = this.vhlOwnPlayers(clubId)
      .filter(p => this.vhlTradeBucket(p) === bucket && !protectedSet.has(p.id))
      .sort((a, b) => this.vhlPlayerOvr(b) - this.vhlPlayerOvr(a));
    if (pool.length < 2) return null;
    const lo = Math.floor(pool.length * 0.25), hi = Math.max(lo, Math.ceil(pool.length * 0.75) - 1);
    const idx = Math.min(pool.length - 1, lo + Math.floor(this.vhlRand01(seedKey) * (hi - lo + 1)));
    return pool[idx];
  };
  proto.vhlSeasonTrades = function (oldY) {
    const rep = { trades: 0, pairs: [] };
    if (!this.vhlAvailable()) return rep;
    const v = this.vhlState();
    const clubs = this.vhlTeams().map(t => t.id);
    if (clubs.length < 2) return rep;
    const counts = {};
    clubs.forEach(id => {
      counts[id] = { F: 0, D: 0, G: 0 };
      this.vhlOwnPlayers(id).forEach(p => counts[id][this.vhlTradeBucket(p)]++);
    });
    // составы клубов ВХЛ различаются в основном по общему размеру (сильные фармы крупнее), а не по позиционным
    // пропорциям — поэтому избыток/недостаток считаем не от абсолютного среднего по лиге, а от доли позиции в
    // собственном составе клуба относительно средней по лиге доли (devF/devD в «игроках», а не в процентах):
    // клуб, где нападающих заметно больше «своей обычной доли», отдаёт нападающего клубу с обратным перекосом.
    const total = id => counts[id].F + counts[id].D + counts[id].G;
    const fracF = {}, fracD = {};
    clubs.forEach(id => { const t = total(id) || 1; fracF[id] = counts[id].F / t; fracD[id] = counts[id].D / t; });
    const avgFracF = clubs.reduce((s, id) => s + fracF[id], 0) / clubs.length;
    const avgFracD = clubs.reduce((s, id) => s + fracD[id], 0) / clubs.length;
    const devF = {}, devD = {};
    clubs.forEach(id => { devF[id] = (fracF[id] - avgFracF) * total(id); devD[id] = (fracD[id] - avgFracD) * total(id); });

    const traded = new Set(); // не больше одного обмена на клуб за межсезонье
    const doTrade = (clubA, bucketOut, clubB, bucketIn, tag) => {
      if (traded.has(clubA) || traded.has(clubB) || clubA === clubB) return false;
      const pOut = this.vhlPickTradePiece(clubA, bucketOut, clubA + '|' + clubB + '|' + oldY + '|out');
      const pIn = this.vhlPickTradePiece(clubB, bucketIn, clubB + '|' + clubA + '|' + oldY + '|in');
      if (!pOut || !pIn) return false;
      v.moves[pOut.id] = clubB;
      v.moves[pIn.id] = clubA;
      traded.add(clubA); traded.add(clubB);
      rep.trades++;
      rep.pairs.push({ from: clubA, to: clubB, out: pOut.id, in: pIn.id, tag });
      return true;
    };

    // нападающий <-> защитник: клуб с относительным избытком защитников и недостатком нападающих (needF) меняется
    // с клубом с обратным перекосом (needD) — каждый отдаёт свою лишнюю позицию, получает нужную.
    const needF = clubs.map(id => ({ id, dF: devF[id], dD: devD[id] })).filter(x => x.dF <= -1 && x.dD >= 1);
    const needD = clubs.map(id => ({ id, dF: devF[id], dD: devD[id] })).filter(x => x.dD <= -1 && x.dF >= 1);
    needF.sort((a, b) => a.dF - b.dF);
    needD.sort((a, b) => a.dD - b.dD);
    for (const a of needF) {
      if (traded.has(a.id)) continue;
      const b = needD.find(x => !traded.has(x.id) && x.id !== a.id);
      if (!b) continue;
      doTrade(b.id, 'F', a.id, 'D', 'fd'); // b (избыток F) отдаёт нападающего, получает защитника; a — наоборот
    }

    // вратари: клуб с избытком вратарей отдаёт одного клубу, где вратаря почти нет, получает нужного ему полевого
    const sellG = clubs.filter(id => !traded.has(id) && counts[id].G >= 3);
    const buyG = clubs.filter(id => !traded.has(id) && counts[id].G <= 1);
    for (const sid of sellG) {
      if (traded.has(sid)) continue;
      const bid = buyG.find(x => !traded.has(x) && x !== sid);
      if (!bid) continue;
      const back = devF[bid] >= devD[bid] ? 'F' : 'D'; // bid отдаёт то, чего у него относительно больше
      doTrade(bid, back, sid, 'G', 'goalie'); // bid отдаёт полевого, получает вратаря; sid — наоборот
    }

    // новости — только обмены, затрагивающие собственные фармы пользователя
    if (this.state && this.publishNews) {
      const myFarms = new Set(this.vhlFarmsOf(this.state.teamId).map(t => t.id));
      for (const pr of rep.pairs) {
        if (!myFarms.has(pr.from) && !myFarms.has(pr.to)) continue;
        const pOut = this.vhlPlayerById(pr.out), pIn = this.vhlPlayerById(pr.in);
        const clubFrom = this.vhlTeamById(pr.from), clubTo = this.vhlTeamById(pr.to);
        if (!pOut || !pIn || !clubFrom || !clubTo) continue;
        this.publishNews({
          key: `vhl-trade:${pr.out}:${pr.in}:${oldY}`, category: 'club', icon: '🔄', teamIds: [this.state.teamId],
          headline: `Обмен в ВХЛ: «${clubFrom.name}» и «${clubTo.name}»`,
          body: `${pOut.name} перешёл в «${clubTo.name}», ${pIn.name} — в «${clubFrom.name}». Обмен без денежной составляющей, по решению клубов ВХЛ.`
        });
      }
    }
    return rep;
  };
  // полный боевой состав клуба ВХЛ: [{p, ovr, loan, line}]
  proto.vhlClubRoster = function (clubId) {
    const own = this.vhlOwnPlayers(clubId).map(p => ({ p, ovr: this.vhlPlayerOvr(p), loan: false }));
    const loans = this.vhlLoanEntries(clubId).map(x => ({ p: x.p, ovr: this.vhlPlayerOvr(x.p), loan: true, ai: x.ai }));
    return own.concat(loans);
  };
  proto.vhlClubStrength = function (clubId) {
    const roster = this.vhlClubRoster(clubId);
    const F = roster.filter(x => x.p.pos === 'F' || ['LW', 'C', 'RW'].includes(x.p.pos)).sort((a, b) => b.ovr - a.ovr);
    const D = roster.filter(x => x.p.pos === 'D').sort((a, b) => b.ovr - a.ovr);
    const G = roster.filter(x => x.p.pos === 'G').sort((a, b) => b.ovr - a.ovr);
    const avg = (arr, n, fb) => { const s = arr.slice(0, n); return s.length ? s.reduce((t, x) => t + x.ovr, 0) / s.length : fb; };
    let off = avg(F, 9, 60), def = avg(D, 6, 60), gk = G.length ? G[0].ovr : 58;
    if (this.state && clubId && this.vhlState()) {
      const mineFarm = this.vhlFarmsOf(this.state.teamId).some(t => t.id === clubId);
      if (mineFarm) {
        const dir = this.vhlState().directive;
        if (dir === 'result') { off += 1.2; def += 1.2; }
        if (dir === 'develop') { off -= 0.8; def -= 0.8; }
      }
    }
    return { off, def, gk, roster, F, D, G };
  };

  /* ---------- симуляция матча ---------- */
  proto.vhlScorerWeight = function (x, clubId) {
    const pos = x.p.pos;
    let w = pos === 'D' ? 0.8 : 1.6 + (x.ovr - 58) * 0.12;
    if (pos === 'G') return 0;
    const v = this.vhlState();
    if (v && this.state) {
      const mineFarm = this.vhlFarmsOf(this.state.teamId).some(t => t.id === clubId);
      const age = this.vhlPlayerAge(x.p);
      if (mineFarm) {
        if (v.protectedIds.includes(x.p.id)) w *= 1.6;
        if (v.directive === 'develop' && age <= 21) w *= 1.6;
        if (v.directive === 'result' && age <= 21) w *= 0.6;
      }
      if (x.loan) w *= 1.15; // командированный из КХЛ обычно сильнее лиги
    }
    return Math.max(0.05, w);
  };
  // 15.14.3: ротация голкиперов и состава. Раньше на каждый матч играл строго топ-18 по рейтингу
  // и единственный лучший вратарь клуба — весь сезон, без единого изменения. Теперь выбор на КАЖДЫЙ
  // матч вероятностный (детерминированный от сидированного rnd() конкретного матча): основа состава
  // («ядро») почти всегда в деле, а нижняя часть ростера и второй вратарь ротируются по простой
  // усталости (v.vfat) — так лавочка со временем получает реальные игры, а не 0 за весь сезон.
  proto.vhlPickGoalie = function (S, rnd) {
    const list = S.G;
    if (!list.length) return null;
    if (list.length === 1) return list[0];
    const v = this.vhlState();
    const starter = list[0], backup = list[1]; // третий+ вратарь в ВХЛ — практически не играющий резерв
    const fat = v.vfat || (v.vfat = {});
    const gap = Math.max(0, starter.ovr - backup.ovr);
    const gapCap = 6, highShare = 0.42, lowShare = 0.14; // почти тандем при равных вратарях, иначе — вторая роль
    const gapFactor = Math.max(0, Math.min(1, gap / gapCap));
    let share = highShare - (highShare - lowShare) * gapFactor;
    share += Math.max(0, (fat[starter.p.id] || 0) - (fat[backup.p.id] || 0)) * 0.004; // усталый стартёр чаще отдыхает
    share = Math.max(0.03, Math.min(0.6, share));
    return rnd() < share ? backup : starter;
  };
  proto.vhlPickLineup = function (S, rnd) {
    const arr = S.roster.filter(x => x.p.pos !== 'G').sort((a, b) => b.ovr - a.ovr);
    const TARGET = 18, CORE = Math.min(13, arr.length);
    if (arr.length <= TARGET) return arr;
    const core = arr.slice(0, CORE), pool = arr.slice(CORE);
    const slots = Math.min(TARGET - CORE, pool.length);
    const v = this.vhlState(); const fat = v.vfat || (v.vfat = {});
    const left = pool.map(x => ({ x, w: Math.max(1, x.ovr - 45) * (1 + (100 - (fat[x.p.id] || 0)) / 100) }));
    const chosen = [];
    for (let i = 0; i < slots && left.length; i++) {
      const tot = left.reduce((s, e) => s + e.w, 0);
      let r = rnd() * tot, idx = left.length - 1;
      for (let j = 0; j < left.length; j++) { r -= left[j].w; if (r <= 0) { idx = j; break; } }
      chosen.push(left[idx].x); left.splice(idx, 1);
    }
    return core.concat(chosen);
  };
  proto.vhlFatigueTick = function (S, playedIds) {
    const v = this.vhlState(); const fat = v.vfat || (v.vfat = {});
    for (const x of S.roster) {
      const id = x.p.id;
      fat[id] = Math.max(0, Math.min(100, (fat[id] || 0) + (playedIds.has(id) ? 16 : -11)));
    }
  };
  proto.vhlSimMatch = function (m) {
    const v = this.vhlState(); if (!v) return;
    const P = VHL_MATCH_MODEL_PARAMS;
    const rnd = mulberry((v.seed ^ (m.i * 2654435761)) >>> 0);
    const H = this.vhlClubStrength(m.h), A = this.vhlClubStrength(m.a);
    // Вратарь выбирается до расчёта ожидаемых голов — реально играющий голкипер (а не просто
    // лучший по рейтингу клуба) определяет и шансы соперника, и исход овертайма/буллитов.
    const hGoalie = this.vhlPickGoalie(H, rnd), aGoalie = this.vhlPickGoalie(A, rnd);
    const hGk = hGoalie ? hGoalie.ovr : H.gk, aGk = aGoalie ? aGoalie.ovr : A.gk;
    let expH = Math.max(P.clampHome[0], Math.min(P.clampHome[1], P.base.home + (H.off - A.def) * P.coef.offDef - (aGk - 62) * P.coef.gk + P.homeBonus));
    let expA = Math.max(P.clampAway[0], Math.min(P.clampAway[1], P.base.away + (A.off - H.def) * P.coef.offDef - (hGk - 62) * P.coef.gk));
    const pois = exp => { let L = Math.exp(-exp), k = 0, p = 1; do { k++; p *= rnd(); } while (p > L && k < 11); return k - 1; };
    let hs = pois(expH), as = pois(expA), ot = 0;
    if (hs === as) {
      ot = rnd() < P.otSoSplit ? 1 : 2; // 1 — овертайм, 2 — буллиты
      const pH = P.tieBreak.base + (H.off + H.def + hGk - A.off - A.def - aGk) * P.tieBreak.k;
      if (rnd() < Math.max(P.tieBreak.min, Math.min(P.tieBreak.max, pH))) hs++; else as++;
    }
    v.r[m.i] = [hs, as, ot];
    this.vhlRecordStats(m, hs, as, ot, rnd, H, A, hGoalie, aGoalie);
    this._vhlStandingsCache = null;
    return v.r[m.i];
  };
  // Вратарская статистика ВХЛ: [игры, победы, пропущено, броски по воротам (оценка), «сухие» матчи].
  // ВХЛ не считает реальные броски (только итоговый счёт), поэтому число бросков — правдоподобная оценка (26–35 за матч),
  // согласованная с пропущенными шайбами; на исход матча не влияет (вызывается уже после того, как счёт определён).
  proto.vhlGoalieAccum = function (dict, id, ga, rnd, win) {
    let g = dict[id]; if (!g || g.length < 5) g = dict[id] = [g && g[0] || 0, g && g[1] || 0, 0, 0, 0];
    g[0]++; if (win) g[1]++;
    const shots = Math.max(ga, Math.round(26 + rnd() * 9));
    g[2] += ga; g[3] += shots; if (ga === 0) g[4]++;
  };
  // Безопасное чтение (старые сохранения могли иметь только [игры, победы]).
  proto.vhlGoalieRead = function (dict, id) { const g = dict[id]; if (!g) return { gp: 0, w: 0, ga: 0, shots: 0, so: 0 }; return { gp: g[0] || 0, w: g[1] || 0, ga: g[2] || 0, shots: g[3] || 0, so: g[4] || 0 }; };
  proto.vhlRecordStats = function (m, hs, as, ot, rnd, H, A, hGoalie, aGoalie) {
    const v = this.vhlState();
    const sides = [{ clubId: m.h, S: H, goals: hs, win: hs > as, goalie: hGoalie }, { clubId: m.a, S: A, goals: as, win: as > hs, goalie: aGoalie }];
    for (const side of sides) {
      const skaters = this.vhlPickLineup(side.S, rnd);
      const goalie = side.goalie || side.S.G[0];
      for (const x of skaters) { const s = v.ps[x.p.id] || (v.ps[x.p.id] = [0, 0, 0]); s[0]++; }
      if (goalie) { const gaGame = side.clubId === m.h ? as : hs; this.vhlGoalieAccum(v.gs, goalie.p.id, gaGame, rnd, side.win); }
      const playedIds = new Set(skaters.map(x => x.p.id)); if (goalie) playedIds.add(goalie.p.id);
      this.vhlFatigueTick(side.S, playedIds);
      const weights = skaters.map(x => this.vhlScorerWeight(x, side.clubId));
      const pick = exclude => {
        let tot = 0; for (let i = 0; i < skaters.length; i++) if (!exclude.has(i)) tot += weights[i];
        if (tot <= 0) return -1;
        let r = rnd() * tot;
        for (let i = 0; i < skaters.length; i++) { if (exclude.has(i)) continue; r -= weights[i]; if (r <= 0) return i; }
        return -1;
      };
      const scored = {};
      for (let gl = 0; gl < side.goals; gl++) {
        const si = pick(new Set()); if (si < 0) break;
        const sId = skaters[si].p.id;
        (v.ps[sId])[1]++; scored[sId] = (scored[sId] || 0) + 1;
        const nA = rnd() < 0.82 ? (rnd() < 0.55 ? 2 : 1) : 0, ex = new Set([si]);
        for (let j = 0; j < nA; j++) { const ai = pick(ex); if (ai < 0) break; ex.add(ai); (v.ps[skaters[ai].p.id])[2]++; }
      }
      // развитие и события для командированных игроков КХЛ
      for (const x of skaters.concat(goalie ? [goalie] : [])) {
        if (!x.loan) {
          // рост воспитанников: молодёжь прибавляет с игровой практикой
          if (String(x.p.id).startsWith('v_') && this.vhlPlayerAge(x.p) <= 21) {
            const s = v.ps[x.p.id]; if (s && s[0] > 0 && s[0] % 16 === 0) v.grow[x.p.id] = Math.min(8, (v.grow[x.p.id] || 0) + 1);
          }
          continue;
        }
        v.lastGame[x.p.id] = m.d;
        if (x.ai) continue;
        const d = this.playerDev ? this.playerDev(x.p) : null;
        if (d) {
          const age = this.vhlPlayerAge(x.p);
          const over = this.vhlPlayerOvr(x.p) >= 75 ? 0.4 : 1; // перерос лигу — бонус затухает
          const dirBoost = v.directive === 'develop' ? 1.25 : 1;
          d.fatigue = this.clamp(d.fatigue + 6.5, 0, 100);
          d.growthXP += (age <= 21 ? 1.25 : 0.3) * (d.profileRate || 1) * over * dirBoost;
          const g = scored[x.p.id] || 0;
          d.form = this.clamp(d.form + g * 2.5 + (side.win ? 0.8 : -0.5), 15, 100);
          if (this.resolvePlayerProgress) this.resolvePlayerProgress(x.p, d, true);
          if (g >= 3 && this.publishNews) this.publishNews({ key: `vhl-hat:${x.p.id}:${m.d}`, category: 'club', icon: '🎩', dateOffset: m.d, teamIds: [this.state.teamId], headline: `${x.p.name} оформил хет-трик в ВХЛ`, body: `${x.p.name} забросил ${g} шайбы за «${this.vhlTeamById(side.clubId)?.name}» в матче ВХЛ. Командировка идёт игроку на пользу.` });
          if (!d.injury && rnd() < 0.02) {
            d.injury = { severity: 'medium', gamesRemaining: 2, daysRemaining: 7 };
            if (this.publishNews) this.publishNews({ key: `vhl-inj:${x.p.id}:${m.d}`, category: 'club', icon: '🩹', dateOffset: m.d, teamIds: [this.state.teamId], headline: `${x.p.name} получил травму в матче ВХЛ`, body: `${x.p.name} травмирован в игре за «${this.vhlTeamById(side.clubId)?.name}». Пропустит около недели.` });
          }
        }
      }
    }
  };

  /* ---------- таблица ---------- */
  // Подробная таблица — разбивка победы/поражения на осн.время/овертайм/буллиты (ot: 0 — осн.время, 1 — овертайм, 2 — буллиты),
  // плюс «форма» — последние 5 матчей команды (w/o/l), как в таблице КХЛ. w/otw/l/otl ниже — суммарные поля для старого кода (сохранены для совместимости).
  proto.vhlStandings = function () {
    const v = this.vhlState(); if (!v) return [];
    const day = this.state.dayIndex || 0;
    if (this._vhlStandingsCache && this._vhlStandingsCache.day === day) return this._vhlStandingsCache.rows;
    const rows = {}, form = {};
    this.vhlTeams().forEach(t => rows[t.id] = { id: t.id, name: t.name, gp: 0, regw: 0, otw: 0, sow: 0, l: 0, otl: 0, sol: 0, gf: 0, ga: 0, pts: 0 });
    for (const m of this.vhlSchedule()) {
      const r = v.r[m.i]; if (!r) continue;
      const [hs, as, ot] = r, H = rows[m.h], A = rows[m.a];
      if (!H || !A) continue;
      H.gp++; A.gp++; H.gf += hs; H.ga += as; A.gf += as; A.ga += hs;
      const hw = hs > as, W = hw ? H : A, L = hw ? A : H;
      W.pts += 2;
      (form[W.id] = form[W.id] || []).push('w');
      if (!ot) { W.regw++; L.l++; (form[L.id] = form[L.id] || []).push('l'); }
      else if (ot === 1) { W.otw++; L.otl++; L.pts += 1; (form[L.id] = form[L.id] || []).push('o'); }
      else { W.sow++; L.sol++; L.pts += 1; (form[L.id] = form[L.id] || []).push('o'); }
    }
    // w/otw/l/otl — суммарные поля для старого кода (w=regw, otw=otw+sow, otl=otl+sol); форма — последние 5 матчей.
    Object.values(rows).forEach(r => { r.w = r.regw; r.otwTotal = r.otw + r.sow; r.otlTotal = r.otl + r.sol; r.form = (form[r.id] || []).slice(-5); });
    Object.values(rows).forEach(r => { r.otwSplit = r.otw; r.otlSplit = r.otl; r.otw = r.otwTotal; r.otl = r.otlTotal; delete r.otwTotal; delete r.otlTotal; });
    const list = Object.values(rows).sort((a, b) => b.pts - a.pts || (b.w + b.otw) - (a.w + a.otw) || b.w - a.w || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || a.name.localeCompare(b.name, 'ru'));
    this._vhlStandingsCache = { day, rows: list };
    return list;
  };
  proto.vhlRegularComplete = function () { const v = this.vhlState(); return !!v && this.vhlSchedule().every(m => v.r[m.i]); };
  proto.vhlGamesOf = function (playerId) { const v = this.vhlState(); return v && v.ps[playerId] ? v.ps[playerId][0] : 0; };

  /* ---------- плей-офф: Кубок Петрова ---------- */
  const SERIES_OFFSETS = [0, 2, 4, 6, 8, 10, 12]; // игры серии через день; финал укладывается к 30 мая
  const PO_HOME_FIRST = [0, 1, 4, 6]; // Д-Д-Г-Г-Д-Г-Д для верхнего посева — используется и симуляцией, и матч-центром
  proto.VHL_SERIES_OFFSETS = SERIES_OFFSETS; // 15.14.2: даты игр серии нужны и другим модулям (vhl_ui.js — «ближайший матч»)
  proto.vhlEnsurePlayoff = function () {
    const v = this.vhlState();
    if (!v || v.po || !this.vhlRegularComplete()) return;
    const seeds = this.vhlStandings().slice(0, 16).map(t => t.id);
    v.po = { round: 0, rounds: [], champion: null };
    v.po.rounds.push({ start: SEASON.poStart, series: this.vhlPairSeries(seeds) });
  };
  // 15.14.2: один доигрываемый матч плей-офф ВХЛ по ссылке из таблицы серий/карточки клуба — тот же
  // вид, что и обычный матч-центр (vhlMcOpen/vhlSimFullMatch), просто источник счёта другой (не v.r[m.i],
  // а конкретная игра внутри s.games). Домашняя команда конкретной игры — по той же схеме Д/Г, что и
  // в vhlSimPlayoffGame; счёт в s.games всегда хранится с точки зрения верхнего посева (s.hi) — переводим
  // его в home/away этой игры здесь, один раз, а не в каждом месте, которое строит ссылку.
  proto.vhlPoGameMatch = function (ri, si, gi) {
    const v = this.vhlState(); if (!v || !v.po) return null;
    const round = v.po.rounds[ri]; if (!round) return null;
    const s = round.series[si]; if (!s) return null;
    const g = s.games[gi]; if (!g) return null;
    const home = PO_HOME_FIRST.includes(gi) ? s.hi : s.lo, away = home === s.hi ? s.lo : s.hi;
    const hs = home === s.hi ? g[0] : g[1], as = home === s.hi ? g[1] : g[0];
    return { h: home, a: away, i: `po_${ri}_${si}_${gi}`, hs, as, ot: g[2], po: true, stage: this.vhlStageName(round.series.length) };
  };
  // 15.14.2: показатели ближайшей/прошедших игр клуба в плей-офф — для карточки клуба (vClubFormHtml/
  // vClubNextHtml в vhl_ui.js), которая раньше знала только про vhlSchedule() (регулярку) и во время
  // плей-офф показывала «матчей больше нет» даже у ещё играющих команд.
  proto.vhlClubPlayoffPlayed = function (id) {
    const v = this.vhlState(); if (!v || !v.po) return [];
    const out = [];
    v.po.rounds.forEach((round, ri) => {
      round.series.forEach((s, si) => {
        if (s.hi !== id && s.lo !== id) return;
        s.games.forEach((g, gi) => {
          const oppId = s.hi === id ? s.lo : s.hi;
          const gf = s.hi === id ? g[0] : g[1], ga = s.hi === id ? g[1] : g[0];
          out.push({ d: g[3], oppId, gf, ga, ot: g[2], mcKey: `po_${ri}_${si}_${gi}` });
        });
      });
    });
    return out;
  };
  proto.vhlClubPlayoffNext = function (id) {
    const v = this.vhlState(); if (!v || !v.po || v.po.champion) return null;
    const round = v.po.rounds[v.po.rounds.length - 1];
    const s = round.series.find(x => (x.hi === id || x.lo === id) && !x.winner);
    if (!s || s.games.length >= 7) return null;
    return { d: round.start + SERIES_OFFSETS[s.games.length], oppId: s.hi === id ? s.lo : s.hi };
  };
  proto.vhlPairSeries = function (seeds) {
    const n = seeds.length, series = [];
    for (let i = 0; i < n / 2; i++) series.push({ hi: seeds[i], lo: seeds[n - 1 - i], games: [], winner: null, pstats: {} });
    return series;
  };
  // Статистика очков в серии плей-офф (16.0: показываем счёт + топ-бомбардиров своих игроков по серии).
  // Не влияет на исход игры — счёт (hs/as/ot) уже определён до вызова; просто распределяем голы/передачи.
  proto.vhlRecordPlayoffGoals = function (s, home, away, hs, as, rnd, H, A, hGoalie, aGoalie) {
    const v = this.vhlState(); if (!v) return;
    H = H || this.vhlClubStrength(home); A = A || this.vhlClubStrength(away);
    const homeGoals = home === s.hi ? hs : as, awayGoals = away === s.hi ? hs : as;
    const sides = [{ clubId: home, S: H, goals: homeGoals, ga: awayGoals, win: homeGoals > awayGoals, goalie: hGoalie }, { clubId: away, S: A, goals: awayGoals, ga: homeGoals, win: awayGoals > homeGoals, goalie: aGoalie }];
    for (const side of sides) {
      const skaters = this.vhlPickLineup(side.S, rnd);
      const goalie = side.goalie || side.S.G[0];
      for (const x of skaters) { const g1 = v.pops[x.p.id] || (v.pops[x.p.id] = [0, 0, 0]); g1[0]++; const g2 = s.pstats[x.p.id] || (s.pstats[x.p.id] = [0, 0, 0]); g2[0]++; }
      if (goalie) this.vhlGoalieAccum(v.pogs, goalie.p.id, side.ga, rnd, side.win);
      const playedIds = new Set(skaters.map(x => x.p.id)); if (goalie) playedIds.add(goalie.p.id);
      this.vhlFatigueTick(side.S, playedIds);
      const weights = skaters.map(x => this.vhlScorerWeight(x, side.clubId));
      const pick = exclude => {
        let tot = 0; for (let i = 0; i < skaters.length; i++) if (!exclude.has(i)) tot += weights[i];
        if (tot <= 0) return -1;
        let r = rnd() * tot;
        for (let i = 0; i < skaters.length; i++) { if (exclude.has(i)) continue; r -= weights[i]; if (r <= 0) return i; }
        return -1;
      };
      for (let gl = 0; gl < side.goals; gl++) {
        const si = pick(new Set()); if (si < 0) break;
        const sId = skaters[si].p.id;
        v.pops[sId][1]++; (s.pstats[sId] || (s.pstats[sId] = [0, 0, 0]))[1]++;
        const nA = rnd() < 0.82 ? (rnd() < 0.55 ? 2 : 1) : 0, ex = new Set([si]);
        for (let j = 0; j < nA; j++) { const ai = pick(ex); if (ai < 0) break; ex.add(ai); const aId = skaters[ai].p.id; v.pops[aId][2]++; (s.pstats[aId] || (s.pstats[aId] = [0, 0, 0]))[2]++; }
      }
    }
  };
  proto.vhlSimPlayoffGame = function (s, round, gameNo, date) {
    const v = this.vhlState();
    const home = PO_HOME_FIRST.includes(gameNo) ? s.hi : s.lo, away = home === s.hi ? s.lo : s.hi; // Д-Д-Г-Г-Д-Г-Д для верхнего посева
    const rnd = mulberry((v.seed ^ ((round * 100 + gameNo + 1) * 7919) ^ this.makeStableHash(s.hi + s.lo)) >>> 0);
    const H = this.vhlClubStrength(home), A = this.vhlClubStrength(away);
    const hGoalie = this.vhlPickGoalie(H, rnd), aGoalie = this.vhlPickGoalie(A, rnd);
    const hGk = hGoalie ? hGoalie.ovr : H.gk, aGk = aGoalie ? aGoalie.ovr : A.gk;
    let expH = Math.max(0.8, Math.min(4.0, 2.35 + (H.off - A.def) * 0.05 - (aGk - 62) * 0.05 + 0.22));
    let expA = Math.max(0.7, Math.min(3.8, 2.2 + (A.off - H.def) * 0.05 - (hGk - 62) * 0.05));
    const pois = exp => { let L = Math.exp(-exp), k = 0, p = 1; do { k++; p *= rnd(); } while (p > L && k < 10); return k - 1; };
    let hs = pois(expH), as = pois(expA), ot = 0;
    if (hs === as) { ot = 1; if (rnd() < 0.5 + (H.off + hGk - A.off - aGk) * 0.004) hs++; else as++; }
    s.games.push([home === s.hi ? hs : as, home === s.hi ? as : hs, ot, date]); // счёт всегда с позиции верхнего посева
    if (!s.pstats) s.pstats = {};
    try { this.vhlRecordPlayoffGoals(s, home, away, hs, as, rnd, H, A, hGoalie, aGoalie); } catch (e) { console.error('[vhl] po stats', e); }
    const wHi = s.games.filter(g => g[0] > g[1]).length, wLo = s.games.filter(g => g[1] > g[0]).length;
    if (wHi >= 4) s.winner = s.hi; else if (wLo >= 4) s.winner = s.lo;
  };
  proto.vhlCatchUpPlayoff = function (day) {
    const v = this.vhlState(); if (!v || !v.po || v.po.champion) return;
    let guard = 0;
    while (guard++ < 12) {
      const round = v.po.rounds[v.po.rounds.length - 1];
      let advanced = false;
      for (const s of round.series) {
        while (!s.winner) {
          const gameNo = s.games.length;
          if (gameNo >= 7) break;
          const date = round.start + SERIES_OFFSETS[gameNo];
          if (date > day) break;
          this.vhlSimPlayoffGame(s, v.po.rounds.length - 1, gameNo, date);
          advanced = true;
        }
      }
      if (!round.series.every(s => s.winner)) return; // раунд ещё идёт
      const winners = round.series.map(s => s.winner);
      if (winners.length === 1) {
        v.po.champion = winners[0];
        const champ = this.vhlTeamById(winners[0]);
        const mineFarm = this.vhlFarmsOf(this.state.teamId).some(t => t.id === winners[0]);
        if (this.publishNews) this.publishNews({ key: `vhl-cup:${winners[0]}`, category: 'league', icon: '🏆', dateOffset: Math.min(day, this.state.dayIndex || day), teamIds: mineFarm ? [this.state.teamId] : [], headline: `«${champ?.name}» — обладатель Кубка Петрова!`, body: `${champ?.name} (${champ?.city}) выиграл плей-офф ВХЛ сезона 2026/27${mineFarm ? '. Это ваш фарм-клуб — отличный сезон для всей системы!' : '.'}` });
        return;
      }
      const lastEnd = Math.max(...round.series.map(s => s.games.length ? s.games[s.games.length - 1][3] : round.start));
      const seedsOrder = this.vhlStandings().map(t => t.id).filter(id => winners.includes(id)); // пересев по месту в регулярке
      const next = { start: lastEnd + 7, series: this.vhlPairSeries(seedsOrder) }; // пауза между раундами: 7-12 дней для команд (кто закончил серию раньше — отдыхает дольше)
      v.po.rounds.push(next);
      if (next.start > day) return;
      advanced = true;
    }
  };
  proto.vhlStageName = function (nSeries) { return nSeries === 8 ? '1/8 финала' : nSeries === 4 ? 'Четвертьфинал' : nSeries === 2 ? 'Полуфинал' : 'Финал'; };

  /* ---------- дневной прогон ---------- */
  proto.vhlCatchUp = function () {
    if (!this.state || !this.vhlAvailable()) return;
    const v = this.vhlState(); if (!v) return;
    const day = this.state.dayIndex || 0;
    // 15.3.2: раньше ошибка в одном матче (this.vhlSimMatch) обрывала весь цикл — ни один клуб ВХЛ
    // в этот день не получал результат, и так повторялось на каждый вызов advanceDay (дата шла
    // вперёд, календарь ВХЛ оставался «0 из N» у всех клубов). Теперь один плохой матч не блокирует
    // остальные, а первая ошибка за вызов попадает в заметный баннер, а не только в консоль.
    let firstErr = null;
    for (const m of this.vhlSchedule()) {
      if (m.d > day) break;
      if (v.r[m.i]) continue;
      try { this.vhlSimMatch(m); } catch (e) { if (!firstErr) firstErr = e; console.error('[vhl] simMatch', m, e); }
    }
    if (firstErr) {
      this._vhlLastErr = String((firstErr && firstErr.message) || firstErr);
      if (this.setNotice) this.setNotice('Сбой симуляции ВХЛ (часть матчей дня не досчитана): ' + this._vhlLastErr);
    }
    if (day >= SEASON.poStart - 1) { this.vhlEnsurePlayoff(); this.vhlCatchUpPlayoff(day); }
    // 15.14.2: плей-офф ВХЛ рассчитан на собственное расписание (пауза 7–12 дней между раундами,
    // финал может лечь на день позже, чем закончился сезон КХЛ) — расписание КХЛ и ВХЛ совпадают
    // лишь приблизительно. Если регулярка+плей-офф КХЛ уже завершены (state.seasonFinished — после
    // этого игра больше не даёт способа продвинуть день: кнопки «Промотать день»/«Играть следующий
    // матч» сменяются на «Итоги сезона»), а Кубок Петрова ещё не доигран, обычный догон по реальным
    // дням никогда не получит эти дни и чемпион ВХЛ не определится вовсе («серия не началась» навсегда,
    // статистика плей-офф потеряется при переходе в новый сезон). ВХЛ не завязана на действия игрока
    // по дням (все матчи симулируются автоматически), поэтому в этом случае безопасно доиграть оставшиеся
    // раунды «вперёд» день разом — тем же самым детерминированным vhlCatchUpPlayoff, просто с датой
    // далеко за пределами уже пройденного календаря.
    if (this.state.seasonFinished && v.po && !v.po.champion) this.vhlCatchUpPlayoff(day + 400);
    // мораль ветеранов, засидевшихся в фарме
    if (this.state.farm) {
      for (const [pid, e] of Object.entries(this.state.farm)) {
        if (!e || !e.clubId) continue;
        const p = this.league('KHL').players().find(x => x.id === pid); if (!p) continue;
        if (this.vhlPlayerAge(p) >= 25 && day - (e.since || 0) > 14) {
          const d = this.playerDev(p); if (d) d.morale = this.clamp(d.morale - 0.12, 0, 100);
        }
      }
    }
    if (this.vhlAiDaily) this.vhlAiDaily(day);
  };
  proto.vhlResultsOn = function (day) {
    const v = this.vhlState(); if (!v) return [];
    const out = [];
    for (const m of this.vhlSchedule()) { if (m.d === day && v.r[m.i]) out.push({ m, r: v.r[m.i] }); }
    if (v.po) for (const [ri, round] of v.po.rounds.entries()) for (const s of round.series) for (const g of s.games) if (g[3] === day) out.push({ m: { h: s.hi, a: s.lo, po: true, stage: this.vhlStageName(round.series.length) }, r: g });
    return out;
  };
  proto.vhlSeasonDone = function () { const v = this.vhlState(); return !!(v && v.po && v.po.champion); };

  /* 15.13.1: общий «догон» после ЛЮБОГО способа продвинуть календарь — вынесен в отдельную функцию,
   * т.к. выяснилось, что не только advanceDay двигает this.state.dayIndex. playNextMatch (кнопка
   * «Играть следующую игру» — самый частый способ пролистать несколько дней разом, когда свой матч
   * не сегодня) у себя внутри (L09_723_playoff_scoring.js) несколькими циклами САМ пишет
   * this.state.dayIndex=d и зовёт simulateMatchesAt, МИНУЯ advanceDay целиком — раньше это означало,
   * что vhlCatchUp ни разу не вызывался на пройденные так дни, и ВХЛ «отставала» от КХЛ до перезагрузки
   * страницы (её вызывает repairSave). Теперь vhlCatchUp достаёт тот же общий помощник и отсюда.
   */
  proto.__vhlCatchUpAfterAdvance = function () {
    try {
      this.vhlCatchUp();
      if (this.renderDayDigest) this.renderDayDigest();
      if (this._stTab === 'vhl' && this.renderStandingsTabs) this.renderStandingsTabs();
      this.persistQuietly();
    } catch (e) {
      console.error('[vhl] catchUp', e);
      this._vhlLastErr = String((e && e.message) || e);
      if (this.setNotice) this.setNotice('Сбой симуляции ВХЛ: ' + this._vhlLastErr);
    }
  };
  /* подключение к ходу дня: симулируем после базового advanceDay (идемпотентный догон) */
  const baseAdvance = proto.advanceDay;
  proto.advanceDay = function () {
    baseAdvance.apply(this, arguments);
    this.__vhlCatchUpAfterAdvance();
  };
  /* 15.13.1: и после playNextMatch — см. комментарий выше, это отдельный путь продвижения дня. */
  const baseVhlPlayNext = proto.playNextMatch;
  proto.playNextMatch = function () {
    const r = baseVhlPlayNext.apply(this, arguments);
    this.__vhlCatchUpAfterAdvance();
    return r;
  };
  /* и при загрузке/ремонте сохранения — догнать текущий день */
  const baseRepairV = proto.repairSave;
  proto.repairSave = function () {
    baseRepairV.apply(this, arguments);
    try { if (this.state && this.vhlAvailable()) { this._vhlSched = null; this._vhlStandingsCache = null; this.vhlCatchUp(); } } catch (e) { console.error('[vhl] repair', e); }
  };
})();

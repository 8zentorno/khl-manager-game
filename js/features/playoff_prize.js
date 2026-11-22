/* KHL Manager — призовой фонд плей-офф (разовое распределение деньгами между игроками после финала Кубка).
 *
 * Идея (задана пользователем): после завершения Кубка Гагарина каждый клуб, дошедший хотя бы до 1/4 финала,
 * получает денежный фонд в зависимости от того, на какой стадии выбыл (или выиграл Кубок); тренер (для своего
 * клуба) или ИИ (для остальных) распределяет его между игроками «заявки» (здесь — весь действующий состав,
 * сознательное упрощение: отдельного экрана заявки на плей-офф в игре нет). Выплата идёт живыми деньгами,
 * полностью «вне потолка» зарплат (капа не касается вообще — ни teamPayroll, ни capOverhang).
 *
 * Стадии и фонд (POT, по стадии выбывания — см. playoffStageName в core/game.js: 1='1/8', 2='1/4', 3='Полуфинал',
 * 4='Финал'): проигравшие в 1/8 — ничего; проигравшие в 1/4 (r2) — 50 млн; проигравшие в полуфинале (sf) — 75 млн;
 * проигравшие в финале (fin) — 150 млн; чемпион (cup) — 150 млн + CUP_BONUS сверху, без верхней границы по смыслу,
 * но для реальных расчётов нужно конкретное число — CUP_BONUS ниже — placeholder, значение нужно обсудить с
 * пользователем и при необходимости подстроить.
 *
 * Распределение (слайдер «звёзды ↔ ровные доли», k от 0 до 1):
 *   - при k=0 фонд делится поровну между всеми игроками состава;
 *   - при k=1 в выплате участвуют только топ-60% состава по зарплате (минимум, допустимый ограничением
 *     «≥60% состава получают ненулевую долю»), доли пропорциональны зарплате;
 *   - между этими полюсами доля игрока — линейная смесь (1-k)/N и k·зарплата^k/Σзарплата^k по включённым
 *     игрокам, где множество «включённых» сжимается с N до ceil(0.6N) по мере роста k;
 *   - итоговые доли всегда ограничены сверху: max/min ≤ 4 (жёсткое ограничение из задания), реализовано
 *     итеративным «водоливным» ограничением (fairShareCap) — слайдер поэтому самокорректируется на любом
 *     значении k: оба ограничения («≥60% получают долю» и «max ≤ 4×min») выполняются структурно, без
 *     отдельной проверки диапазона на каждый тик.
 *   ИИ-клубы распределяют автоматически и без «раздумий»: всем игрокам состава, пропорционально зарплате,
 *   с тем же ограничением ×4 (playoffPrizeAiCalc) — здесь никого не исключают, в отличие от слайдера тренера.
 *
 * Эффект на лояльность (поле playerDev(p).morale, 0..100, то же поле, что у обещаний/требований/расторжения):
 *   позитив: +8 × min(доля/годовая_зарплата, 1.0); зависть: −4 × min(максДоля/моя_доля, 2), только если
 *   моя_доля < максДоля/2 (при этом условии отношение > 2, так что штраф в этом случае фактически постоянный,
 *   −8 — это задано пользователем именно так, не сглаженная кривая); множитель стадии: ×0.5 (1/4) / ×0.8
 *   (полуфинал) / ×1.0 (финал/Кубок) — применяется к сумме обоих слагаемых.
 *   Калибровочный ориентир (дан пользователем): полностью выплаченный бонус на стадии Кубка даёт +8 — это
 *   примерно половина эффекта выполненного крупного обещания (porядка 10 очков) — число совпадает без
 *   дополнительной подгонки констант.
 *
 * Триггер и состояние: po.prizeApplied = { [teamId]: true } — лежит внутри state.playoff, который создаётся
 * заново каждый сезон (не в KEEP), поэтому флаг сам обнуляется в начале следующего сезона без доп. кода. */
(function () {
  'use strict';
  if (typeof KHLManagerApp === 'undefined') return;
  const proto = KHLManagerApp.prototype;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const POT = { 2: 50e6, 3: 75e6, 4: 150e6 };
  const CUP_BONUS = 150e6; // плейсхолдер — конкретное число для «безлимитного» бонуса чемпиона, обсудить/подстроить
  const STAGE_MULT = { r2: 0.5, sf: 0.8, fin: 1.0, cup: 1.0 };
  const RATIO_MAX = 4;
  // 14.8.0: призовые теперь масштабируются по тиру клуба (finClubTier — по годовой выручке, см.
  // club_finance.js), а не единая таблица для всех — решение игрока при вводе реальных бюджетов клубов:
  // доходная часть плей-офф (билеты, club_finance.js) уже тировая сама по себе (считается от выручки
  // конкретного клуба), а эта, расходная для игроков таблица была единой для всех — привели к одному виду.
  const TIER_MULT = { top: 1.4, mid: 1.0, low: 0.65 };

  // водоливное ограничение долей: пропорционально weights, но так, чтобы max/min <= ratioMax
  function fairShareCap(weights, pot, ratioMax) {
    const ids = Object.keys(weights);
    const shares = {};
    if (!ids.length || !(pot > 0)) return shares;
    let free = new Set(ids), remaining = pot;
    for (let iter = 0; iter < ids.length + 5 && free.size; iter++) {
      const sumW = [...free].reduce((s, id) => s + weights[id], 0);
      if (!sumW) break;
      let base = Infinity;
      free.forEach(id => { base = Math.min(base, remaining * weights[id] / sumW); });
      const capIds = [...free].filter(id => remaining * weights[id] / sumW > base * ratioMax + 1e-6);
      if (!capIds.length) { free.forEach(id => { shares[id] = remaining * weights[id] / sumW; }); remaining = 0; free.clear(); break; }
      capIds.forEach(id => { shares[id] = base * ratioMax; remaining -= shares[id]; free.delete(id); });
    }
    if (free.size) { const sumW = [...free].reduce((s, id) => s + weights[id], 0); free.forEach(id => { shares[id] = sumW ? remaining * weights[id] / sumW : 0; }); }
    return shares;
  }

  // стадия, на которой клуб выбыл (или 4, если дошёл до финала/выиграл) — по сериям плей-офф, история+текущие
  proto.playoffTeamStage = function (teamId) {
    const po = this.state && this.state.playoff; if (!po) return { stage: 0, champion: false };
    const all = [...(po.history || []).flatMap(h => h.series || []), ...(po.series || [])];
    const mine = all.filter(s => s && (s.teamA === teamId || s.teamB === teamId));
    if (!mine.length) return { stage: 0, champion: false };
    const stage = Math.max(...mine.map(s => Number(s.stage) || 0));
    return { stage, champion: po.championId === teamId && stage >= 4 };
  };
  proto.playoffPrizeStageKey = function (teamId) {
    const { stage, champion } = this.playoffTeamStage(teamId);
    if (champion) return 'cup';
    return stage === 2 ? 'r2' : stage === 3 ? 'sf' : stage === 4 ? 'fin' : null;
  };
  proto.playoffPrizePotFor = function (teamId) {
    const { stage, champion } = this.playoffTeamStage(teamId);
    let pot = POT[stage] || 0;
    if (champion) pot += CUP_BONUS;
    const mult = TIER_MULT[this.finClubTier ? this.finClubTier(teamId) : 'mid'] || 1;
    return pot * mult;
  };
  // «заявка на плей-офф» как отдельного экрана в игре нет — берём весь действующий состав (упрощение, см. заголовок файла)
  proto.playoffPrizeRoster = function (teamId) { return this.teamPlayers(teamId); };

  const payOf = (app, p) => (app.payrollOf ? app.payrollOf(p) : p.salary) || 1e6;

  // расчёт для тренерского слайдера (k: 0 — ровные доли, 1 — максимум к звёздам в рамках ограничений)
  proto.playoffPrizeCalc = function (teamId, k) {
    k = clamp(Number(k) || 0, 0, 1);
    const pot = this.playoffPrizePotFor(teamId);
    const players = this.playoffPrizeRoster(teamId);
    const N = players.length;
    if (!pot || !N) return { pot, k, shares: {}, included: 0, total: N, maxShare: 0, minShare: 0, ratio: 1 };
    const sorted = players.slice().sort((a, b) => payOf(this, b) - payOf(this, a));
    const frac = 1 - 0.4 * k;                               // 1.0 .. 0.6 — доля состава, получающая выплату
    const M = Math.max(Math.ceil(N * 0.6), Math.round(N * frac));
    const chosen = sorted.slice(0, M);
    const weights = {}; chosen.forEach(p => { weights[p.id] = Math.pow(payOf(this, p), k); });
    const raw = fairShareCap(weights, pot, RATIO_MAX);
    const shares = {}; players.forEach(p => { shares[p.id] = Math.round((raw[p.id] || 0) / 1e5) * 1e5; });
    const vals = Object.values(shares).filter(v => v > 0);
    const maxShare = vals.length ? Math.max(...vals) : 0, minShare = vals.length ? Math.min(...vals) : 0;
    return { pot, k, shares, included: vals.length, total: N, maxShare, minShare, ratio: minShare ? maxShare / minShare : 1 };
  };
  // расчёт для ИИ: все игроки состава, пропорционально зарплате, тот же потолок ×4 — без исключений
  proto.playoffPrizeAiCalc = function (teamId) {
    const pot = this.playoffPrizePotFor(teamId);
    const players = this.playoffPrizeRoster(teamId);
    if (!pot || !players.length) return { pot, shares: {}, included: 0, total: players.length };
    const weights = {}; players.forEach(p => { weights[p.id] = payOf(this, p); });
    const raw = fairShareCap(weights, pot, RATIO_MAX);
    const shares = {}; players.forEach(p => { shares[p.id] = Math.round((raw[p.id] || 0) / 1e5) * 1e5; });
    const vals = Object.values(shares).filter(v => v > 0);
    return { pot, shares, included: vals.length, total: players.length, maxShare: vals.length ? Math.max(...vals) : 0, minShare: vals.length ? Math.min(...vals) : 0 };
  };

  // применить распределение: реальные деньги (вне потолка) + эффект на лояльность; один раз на клуб за Кубок
  proto.playoffPrizeApply = function (teamId, calc) {
    const po = this.state && this.state.playoff; if (!po || !po.completed) return null;
    po.prizeApplied = po.prizeApplied || {};
    if (po.prizeApplied[teamId]) return null;
    po.prizeApplied[teamId] = true;
    if (!calc || !calc.pot) return calc || null;
    const stageKey = this.playoffPrizeStageKey(teamId), mult = STAGE_MULT[stageKey] || 1;
    const players = this.playoffPrizeRoster(teamId);
    const total = Object.values(calc.shares).reduce((s, v) => s + v, 0);
    if (total > 0) { if (this.finEnsure) this.finEnsure(); this.finBook(teamId, 'exp', 'prize', total, 'Призовые плей-офф игрокам (вне потолка)'); }
    const maxShare = calc.maxShare || 0;
    players.forEach(p => {
      const share = calc.shares[p.id] || 0;
      const d = this.playerDev ? this.playerDev(p) : null; if (!d) return;
      const annual = payOf(this, p);
      let delta = 8 * Math.min(share / annual, 1.0);
      if (maxShare > 0 && share < maxShare / 2) { const ratio = share > 0 ? maxShare / share : Infinity; delta -= 4 * Math.min(ratio, 2); }
      delta *= mult;
      d.morale = clamp((d.morale == null ? 60 : d.morale) + delta, 0, 100);
    });
    const t = this.teamById(teamId), mine = teamId === this.state.teamId;
    if (this.marketLog) this.marketLog(`Призовой фонд плей-офф распределён${mine ? '' : ' (' + (t ? t.name : teamId) + ')'}: ${(total / 1e6).toFixed(1)} млн, вне потолка`, mine ? 'mine' : 'info');
    return calc;
  };
  // подтверждение тренером своего клуба — единственная точка, которая зовёт UI-слайдер
  proto.playoffPrizeConfirm = function (k) {
    const teamId = this.state && this.state.teamId; if (!teamId) return null;
    const calc = this.playoffPrizeCalc(teamId, k);
    return this.playoffPrizeApply(teamId, calc);
  };
  // автоматическое распределение для всех клубов ИИ (и для своего клуба, если он почему-то ничего не выиграл — pot=0)
  proto.playoffPrizeAiTick = function () {
    const po = this.state && this.state.playoff; if (!po || !po.completed) return;
    po.prizeApplied = po.prizeApplied || {};
    const my = this.state.teamId;
    this.league('KHL').teams().forEach(t => {
      if (po.prizeApplied[t.id]) return;
      if (t.id === my) { if (!this.playoffPrizePotFor(my)) this.playoffPrizeApply(my, this.playoffPrizeCalc(my, 0.5)); return; } // pot=0: закрыть без UI
      this.playoffPrizeApply(t.id, this.playoffPrizeAiCalc(t.id));
    });
  };
  // ждёт ли клуб игрока решения по призовым (для показа экрана подтверждения)
  proto.playoffPrizePending = function () {
    const po = this.state && this.state.playoff; if (!po || !po.completed) return false;
    const my = this.state.teamId;
    if (po.prizeApplied && po.prizeApplied[my]) return false;
    return this.playoffPrizePotFor(my) > 0;
  };
})();

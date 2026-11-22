/* KHL Manager — трансферная реформа, фаза 2 (итерация 1): обмены между клубами.
 *
 * Правила (согласованный концепт):
 *  - Обмен — игрок(и) на игрока(ов) и/или деньги; драфт-пиков в КХЛ нет, поэтому других активов не бывает.
 *  - Ценность игрока — функция ПАРЫ (игрок, клуб-оценщик), а не абсолютная величина: tradeCoreValue(p) даёт
 *    нейтральную «внутреннюю» ценность (рейтинг, возраст, срок контракта, тяжесть контракта для ведомости);
 *    tradeValue(p, team, incoming) добавляет премию/скидку за потребность КЛУБА-ПОЛУЧАТЕЛЯ на этой позиции —
 *    только когда клуб ПОЛУЧАЕТ игрока. Свои игроки, которые клуб отдаёт, не дешевеют от отсутствия у него
 *    потребности в них: это была бы ошибка (клуб не должен недооценивать то, что отдаёт, только из-за того,
 *    что ему это не нужно). Так рождается естественная асимметрия сделки — суть любого трейда.
 *  - Решение ИИ (tradeDecision) — вероятностное, с небольшим детерминированным шумом от (клуб, день, состав
 *    сделки): игрок не может «прощупать» точный порог подвинув ползунок на копейку — грань размыта, но для
 *    явно грабительских сделок вердикт стабильно отрицательный. С 14.7.37 вердикт — единственный путь к
 *    исполнению: tradeExecute проверяет его первой строкой, до tradeCheck и до любых мутаций. accept исполняет
 *    сделку сразу; counter возвращает конкретную корректировку (tradeBuildCounter — сперва деньгами, потом
 *    заменой самого слабого игрока в предложении на следующего по ценности из того же ростера, никогда не
 *    капитана), максимум TRADE.maxCounterRounds раундов, дальше — только финальное да/нет; reject ставит
 *    переговорный кулдаун НА КЛУБ (14 дней — обычный отказ, 45 — явный грабёж), отдельный от кулдауна на
 *    повторный обмен игрока ниже и от m.cooldown в market_model (переговоры по FA/офферам) — три разных поля,
 *    разные роли, не путать.
 *  - Доплата деньгами списывается с реального счёта клуба (state.finance.bal, тот же счёт, что и в разделе
 *    «Финансы») — повторного «эмитента денег» нет.
 *  - Кулдаун на повторный обмен ОДНОГО игрока — 30 игровых дней (это НЕ переговорный кулдаун market_model:
 *    тот блокирует переговоры после отказа, этот — повторный трейд конкретного игрока). Если игрок обменян
 *    близко к дедлайну, кулдаун естественно переносится через межсезонье — это осознанное антиспекулятивное
 *    поведение, а не случайность.
 *  - Первая итерация: конструктор на одного клуба-партнёра, атомарная валидация, вероятностный вердикт,
 *    исполнение, лента истории. Контрпредложения и автономные сделки ИИ⇄ИИ — следующая итерация; формула
 *    ценности рассчитана так, чтобы они легли на неё без правок.
 */
(function () {
  'use strict';
  if (typeof KHLManagerApp === 'undefined') return;
  const proto = KHLManagerApp.prototype;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const grp = pos => (pos === 'LW' || pos === 'RW') ? 'W' : pos;
  function hash(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return Math.abs(h); }
  const rand01 = s => (hash(String(s)) % 10000) / 10000;

  const TRADE = { minRoster: 20, cooldownDays: 30, cashSliderMax: 60e6, maxCounterRounds: 2, rejectCooldownDays: 14, rejectCooldownHarshDays: 45, rejectHarshGapFrac: 0.40, counterMoneyOnlyGapFrac: 0.15 };
  proto.TRADE = TRADE;

  // ---- калибруемые константы ценности (единая точка подстройки — см. tools/trade_sim.js) ----
  const CALIB = {
    valuePerMoney: 0.6,   // очков ценности на 1 млн ₽ — единственный курс «деньги ⇄ ценность» во всей сделке
    ovrBase: 10,          // ценность в очках при OVR = 60 (условный «средний игрок лиги»)
    ovrRate: 1.08,        // рост ценности на каждое очко рейтинга выше 60 (экспоненциальная кривая — звёзды дороже несоразмерно их OVR)
    capBurdenK: 0.25,      // жёсткость скидки за контракт дороже «заслуженной» ценности (мусорный контракт)
    needWeight: 0.25,     // максимальная премия/скидка от потребности клуба-получателя на позиции
  };
  proto.TRADE_CALIB = CALIB;

  proto.moneyToValue = function (m) { return (Number(m) || 0) / 1e6 * CALIB.valuePerMoney; };
  proto.valueToMoney = function (v) { return (Number(v) || 0) / CALIB.valuePerMoney * 1e6; };

  function ovrValue(ovr) { return CALIB.ovrBase * Math.pow(CALIB.ovrRate, (Number(ovr) || 60) - 60); }
  // плато в расцвете карьеры, мягкий рост к 23 годам, мягкий спад после 31 — без обрывов
  function ageCurve(a) {
    if (a <= 23) return 0.85 + 0.15 * clamp((a - 18) / 5, 0, 1);
    if (a <= 28) return 1.0;
    if (a <= 31) return 0.95 - 0.05 * (a - 28);
    return Math.max(0.4, 0.85 - 0.09 * (a - 31));
  }
  // рентал (контракт истекает после сезона) дешевле длинного контракта при равном OVR — как и должно быть
  function termMod(yearsLeft) {
    if (yearsLeft <= 0) return 0.55;
    if (yearsLeft === 1) return 0.8;
    if (yearsLeft <= 3) return 1.0;
    return Math.max(0.5, 1.0 - 0.05 * (yearsLeft - 3));
  }

  // нейтральная (ничья потребность не влияет) ценность игрока: рейтинг × возраст × срок × тяжесть контракта
  proto.tradeCoreValue = function (p) {
    if (!p) return 0;
    const ovr = this.permanentOVR ? this.permanentOVR(p) : (Number(p.ovr) || 60);
    const base = ovrValue(ovr);
    const afterAge = base * ageCurve(this.ageYears(p));
    const afterTerm = afterAge * termMod(this.yearsLeft(p));
    const salaryVal = this.moneyToValue(p.salary);
    let burden = 1;
    if (afterTerm > 0 && salaryVal > afterTerm) {
      const ratio = (afterTerm - salaryVal) / afterTerm;   // отрицательная доля «переплаты» относительно заслуженной ценности
      burden = Math.max(0.3, 1 + ratio * CALIB.capBurdenK);
    }
    return Math.max(0, afterTerm * burden);
  };
  proto.tradeNeedMult = function (p, teamId) {
    const needs = this.marketNeeds(teamId) || {}, n = needs[grp(p.pos)];
    if (!n) return 1;
    return 1 + clamp(n.score / 15, -1, 1) * CALIB.needWeight;
  };
  // incoming=true — teamId ПОЛУЧАЕТ игрока (считаем с премией/скидкой за нужду); false — teamId ОТДАЁТ (нейтрально)
  proto.tradeValue = function (p, teamId, incoming) {
    const core = this.tradeCoreValue(p);
    return incoming ? core * this.tradeNeedMult(p, teamId) : core;
  };

  const NOISE_AMPL = 0.08; // полный размах шума margin между двумя разными сидами (см. noiseFor) — держим как константу, пригодится для буфера corrections
  function noiseFor(seedStr) { return (rand01(seedStr) - 0.5) * NOISE_AMPL; }
  proto.tradeRivalFactor = function (teamId, otherTeamId) {
    const a = this.teamById(teamId), b = this.teamById(otherTeamId);
    if (!a || !b || a.conf !== b.conf) return 0;
    try { return Math.abs(this.conferenceRank(teamId) - this.conferenceRank(otherTeamId)) <= 4 ? 1 : 0; } catch (e) { return 0; }
  };

  // решение клуба teamId: принять ли входящее (incomingPlayers+incomingCash) взамен на исходящее (outgoingPlayers+outgoingCash).
  // 14.7.37: gap — на сколько очков ценности нужно подвинуть предложение, чтобы клуб перешёл в зону accept;
  // verdict теперь берёт на себя и то, что раньше было «плоским» reject: если gap укладывается в rejectHarshGapFrac
  // от общей ценности сделки — это ещё обсуждаемо (counter), и только явный грабёж (gap больше) — сразу reject.
  proto.tradeDecision = function (teamId, incomingPlayers, incomingCash, outgoingPlayers, outgoingCash, otherTeamId) {
    const receiveVal = incomingPlayers.reduce((s, p) => s + this.tradeValue(p, teamId, true), 0) + this.moneyToValue(incomingCash);
    const giveVal = outgoingPlayers.reduce((s, p) => s + this.tradeValue(p, teamId, false), 0) + this.moneyToValue(outgoingCash);
    const rival = otherTeamId ? this.tradeRivalFactor(teamId, otherTeamId) : 0;
    const seed = teamId + '|' + (Number(this.state && this.state.dayIndex) || 0) + '|' +
      incomingPlayers.map(p => p.id).sort().join(',') + '|' + outgoingPlayers.map(p => p.id).sort().join(',') + '|' + incomingCash + '|' + outgoingCash;
    const margin = 0.05 + 0.10 * rival + noiseFor(seed);
    const want = giveVal - receiveVal;
    const acceptThresh = -margin * Math.max(1, giveVal);
    const dealValue = Math.max(1, giveVal + receiveVal);
    let verdict, gap = 0;
    if (want < acceptThresh) {
      verdict = 'accept';
    } else {
      gap = want - acceptThresh; // сколько ценности не хватает, чтобы пересечь порог accept
      verdict = (gap / dealValue) <= TRADE.rejectHarshGapFrac ? 'counter' : 'reject';
    }
    return { verdict, receiveVal, giveVal, margin, want, rival, gap, dealValue };
  };

  // 14.7.37: конкретная корректировка, которую клуб-получатель teamId просит у клуба otherTeamId, чтобы закрыть gap —
  // сперва деньгами (их проще всего выразить числом и они не трогают составы), и только если денег не хватает —
  // заменой самого слабого для teamId игрока в предложении otherTeamId на следующего подходящего из его ростера
  // (никогда не капитана — такого игрока ИИ не попросит).
  proto.tradeBuildCounter = function (teamId, otherTeamId, incomingPlayers, incomingCash, outgoingPlayers, outgoingCash, dec) {
    const nameId = otherTeamId; // чей это ростер — у кого просим доплату/замену
    // Сид вердикта зависит от точного состава сделки (защита от «прощупывания» порога), поэтому смена
    // денег/состава при применении корректировки сама меняет шум margin — худший случай сдвигает порог на
    // NOISE_AMPL*giveVal (giveVal не меняется: исходящую от ИИ сторону корректировка не трогает). Берём это
    // в буфер плюс ещё 5% сверху, иначе собственная корректировка ИИ не всегда проходила бы саму себя.
    const neededValue = dec.gap + NOISE_AMPL * Math.max(1, dec.giveVal) * 1.05;
    const moneyLimit = Math.min(this.tradeCashLimit(nameId), TRADE.cashSliderMax);
    const moneyRoom = Math.max(0, moneyLimit - incomingCash);
    const moneyNeeded = this.valueToMoney(neededValue);
    const moneyAdd = Math.min(moneyNeeded, moneyRoom);
    const roundedAdd = Math.round(moneyAdd / 500000) * 500000;
    let money = incomingCash + roundedAdd;
    let remainingValue = neededValue - this.moneyToValue(roundedAdd);
    let players = incomingPlayers.slice();
    let swap = null;
    const gapFrac = dec.gap / dec.dealValue;
    if (remainingValue > 0 && incomingPlayers.length && gapFrac > TRADE.counterMoneyOnlyGapFrac) {
      const weakest = incomingPlayers.slice().sort((a, b) => this.tradeValue(a, teamId, true) - this.tradeValue(b, teamId, true))[0];
      if (weakest) {
        const weakestVal = this.tradeValue(weakest, teamId, true);
        const posGroup = grp(weakest.pos);
        const usedIds = new Set(incomingPlayers.map(p => p.id).concat(outgoingPlayers.map(p => p.id)));
        const candidates = this.teamPlayers(nameId)
          .filter(p => !usedIds.has(p.id) && !p.captain && grp(p.pos) === posGroup && !this.tradeBlockReason(p, nameId))
          .map(p => ({ p, v: this.tradeValue(p, teamId, true) }))
          .filter(x => x.v > weakestVal)
          .sort((a, b) => a.v - b.v); // дешевейшее для ИИ достаточное усиление
        const pick = candidates.find(x => (x.v - weakestVal) >= remainingValue) || candidates[candidates.length - 1];
        if (pick) {
          swap = { outId: weakest.id, inId: pick.p.id };
          players = incomingPlayers.filter(p => p.id !== weakest.id).concat([pick.p]);
        }
      }
    }
    const moneyDelta = money - incomingCash;
    const parts = [];
    if (moneyDelta > 0) parts.push(`доплату ≈ ${(moneyDelta / 1e6).toFixed(1).replace('.', ',')} млн ₽`);
    if (swap) parts.push(`замену «${(this.playerById(swap.outId) || {}).name || ''}» на «${(this.playerById(swap.inId) || {}).name || ''}»`);
    const text = parts.length ? `Добавьте ${parts.join(' и ')} — тогда сделка станет равноценной.` : 'Небольшая корректировка — попробуйте изменить состав сделки вручную.';
    return { money, players: players.map(p => p.id), swap, text };
  };

  // нейтральный баланс для шкалы в интерфейсе — без надбавки за чью-либо потребность (иначе игрок мог бы «прочитать» нужду ИИ по шкале)
  proto.tradeFairness = function (giveList, giveCash, getList, getCash) {
    const giveVal = giveList.reduce((s, p) => s + this.tradeCoreValue(p), 0) + this.moneyToValue(giveCash);
    const getVal = getList.reduce((s, p) => s + this.tradeCoreValue(p), 0) + this.moneyToValue(getCash);
    const total = giveVal + getVal;
    const frac = total > 0 ? clamp((getVal - giveVal) / total, -1, 1) : 0;
    return { giveVal, getVal, frac };
  };

  /* ------------------------------------------------------------------ доступность игрока и клуба для обмена */
  proto.tradeCooldownMap = function () { const m = this.mk(); return m ? (m.tradeCooldown || (m.tradeCooldown = {})) : null; };
  proto.tradeBlockReason = function (p, teamId) {
    if (!p || p.teamId !== teamId) return 'Игрок не в составе этого клуба.';
    if (this.rfaOf && this.rfaOf(p.id)) return `${p.name}: статус ОСА в процессе оформления, в обмен пока нельзя.`;
    if (this.offerSheetFor && this.offerSheetFor(p.id)) return `${p.name}: на игрока действует офер-шит, в обмен пока нельзя.`;
    const cd = this.tradeCooldownMap(), day = Number(this.state.dayIndex || 0);
    if (cd && (cd[p.id] || 0) > day) return `${p.name}: обменян недавно, вернётся в сделки через ${cd[p.id] - day} дн.`;
    return null;
  };
  // сколько денег клуб реально может доплатить (реальный счёт клуба, тот же, что и в «Финансах»)
  proto.tradeCashLimit = function (teamId) {
    const f = this.finEnsure ? this.finEnsure() : null;
    const bal = f ? (Number(f.bal[teamId]) || 0) : 0;
    return Math.max(0, Math.floor(bal / 500000) * 500000);
  };
  // 14.7.37: переговорный кулдаун НА КЛУБ-ПАРТНЁРА после отказа (не путать с tradeCooldownMap — тот про
  // повторный обмен КОНКРЕТНОГО ИГРОКА, и с market_model-овским m.cooldown — тот про переговоры по FA/офферам).
  proto.tradeClubCooldownMap = function () { const m = this.mk(); return m ? (m.tradeClubCd || (m.tradeClubCd = {})) : null; };

  /* ------------------------------------------------------------------ атомарная проверка сделки */
  proto.tradeCheck = function (teamA, teamB, playersA, playersB, cashAtoB, cashBtoA) {
    const w = this.marketWindow(); if (!w.open) return w.reason;
    if (!teamA || !teamB || teamA === teamB) return 'Нужны два разных клуба.';
    if (teamA === this.state.teamId || teamB === this.state.teamId) {
      const otherId = teamA === this.state.teamId ? teamB : teamA;
      const ccd = this.tradeClubCooldownMap(), until = ccd ? (ccd[otherId] || 0) : 0;
      if (until > (this.state.dayIndex || 0)) return `«${(this.teamById(otherId) || {}).name || ''}» пока не готов обсуждать с вами новые обмены — вернитесь после ${this.formatDate(until)}.`;
    }
    if (!playersA.length && !playersB.length) return 'В сделке нет ни одного игрока.';
    if (!playersA.length && !cashAtoB) return `${(this.teamById(teamA) || {}).name || 'Ваш клуб'} не отдаёт ничего.`;
    if (!playersB.length && !cashBtoA) return `${(this.teamById(teamB) || {}).name || 'Клуб-партнёр'} не отдаёт ничего.`;
    for (const p of playersA) { const r = this.tradeBlockReason(p, teamA); if (r) return r; }
    for (const p of playersB) { const r = this.tradeBlockReason(p, teamB); if (r) return r; }
    const rosterA = this.teamPlayers(teamA).length - playersA.length + playersB.length;
    const rosterB = this.teamPlayers(teamB).length - playersB.length + playersA.length;
    const nameA = (this.teamById(teamA) || {}).name || '', nameB = (this.teamById(teamB) || {}).name || '';
    if (rosterA < TRADE.minRoster) return `После обмена в составе «${nameA}» останется ${rosterA} игроков — меньше минимума (${TRADE.minRoster}).`;
    if (rosterB < TRADE.minRoster) return `После обмена в составе «${nameB}» останется ${rosterB} игроков — меньше минимума (${TRADE.minRoster}).`;
    if (rosterA > this.MARKET.maxRoster) return `В составе «${nameA}» после обмена будет больше ${this.MARKET.maxRoster} игроков.`;
    if (rosterB > this.MARKET.maxRoster) return `В составе «${nameB}» после обмена будет больше ${this.MARKET.maxRoster} игроков.`;
    const payA = playersA.reduce((s, p) => s + p.salary, 0), payB = playersB.reduce((s, p) => s + p.salary, 0);
    const blockA = this.capBlock(teamA, payB - payA);
    if (blockA) return `«${nameA}»: ${blockA}`;
    const blockB = this.capBlock(teamB, payA - payB);
    if (blockB) return `«${nameB}»: ${blockB}`;
    if (cashAtoB > this.tradeCashLimit(teamA)) return `У «${nameA}» не хватает свободных средств на такую доплату (доступно ${(this.tradeCashLimit(teamA) / 1e6).toFixed(1).replace('.', ',')} млн).`;
    if (cashBtoA > this.tradeCashLimit(teamB)) return `У «${nameB}» не хватает свободных средств на такую доплату (доступно ${(this.tradeCashLimit(teamB) / 1e6).toFixed(1).replace('.', ',')} млн).`;
    return null;
  };

  /* ------------------------------------------------------------------ исполнение сделки + лента истории */
  proto.tradesList = function () { const m = this.mk(); return m ? (m.trades || (m.trades = [])) : []; };
  // 14.7.36: при обмене статистика сезона «замораживается» за прежний клуб отдельным отрезком (seasonStints),
  // а счётчики игрока обнуляются и копятся заново за новый клуб — так карьера по сезонам не приписывает
  // задним числом уже сыгранные матчи новому клубу.
  proto.tradeSnapshotStint = function (p) {
    const st = this.state, s = st.playerStats && st.playerStats[p.id];
    if (!s) return;
    if (!Array.isArray(p.seasonStints)) p.seasonStints = [];
    p.seasonStints.push({ teamId: p.teamId, gp: s.gp || 0, g: s.g || 0, a: s.a || 0, pts: s.pts || 0, shots: s.shots || 0, plusMinus: s.plusMinus || 0, goalieGP: s.goalieGP || 0, goalieW: s.goalieW || 0, goalieShots: s.goalieShots || 0, goalieSaves: s.goalieSaves || 0, goalieGA: s.goalieGA || 0, shutouts: s.shutouts || 0 });
    st.playerStats[p.id] = { gp: 0, g: 0, a: 0, pts: 0, shots: 0, plusMinus: 0, goalieGP: 0, goalieW: 0, goalieShots: 0, goalieSaves: 0, goalieGA: 0, shutouts: 0 };
  };
  // 14.7.37: вердикт клуба-партнёра — ЕДИНСТВЕННЫЙ путь к исполнению сделки, проверяется здесь, а не в UI,
  // и до любой валидации/мутации: обойти его, вызвав tradeExecute напрямую (автообмены ИИ⇄ИИ, будущие фичи),
  // нельзя — вердикт считается первой строкой. priorCounters — сколько раз клуб уже просил скорректировать
  // ЭТО предложение в текущих переговорах (ведёт UI); после TRADE.maxCounterRounds раундов — финальное
  // решение (accept сразу по вердикту, иначе reject без дальнейшего торга).
  proto.tradeExecute = function (teamA, teamB, playersA, playersB, cashAtoB, cashBtoA, aiToAi, priorCounters) {
    priorCounters = Number(priorCounters) || 0;
    const nameB = (this.teamById(teamB) || {}).name || '';
    const dec = this.tradeDecision(teamB, playersA, cashAtoB, playersB, cashBtoA, teamA);
    if (dec.verdict !== 'accept') {
      const day = Number(this.state.dayIndex || 0);
      const gapFrac = dec.gap / dec.dealValue;
      const forceReject = dec.verdict === 'reject' || priorCounters >= TRADE.maxCounterRounds;
      if (forceReject) {
        const harsh = gapFrac > TRADE.rejectHarshGapFrac;
        const involvesHuman = teamA === this.state.teamId || teamB === this.state.teamId;
        const days = harsh ? TRADE.rejectCooldownHarshDays : TRADE.rejectCooldownDays;
        const until = day + days;
        if (involvesHuman) {
          const otherId = teamA === this.state.teamId ? teamB : teamA;
          const ccd = this.tradeClubCooldownMap(); if (ccd) ccd[otherId] = until;
        }
        const pct = Math.round(gapFrac * 100);
        const reasonText = harsh
          ? `«${nameB}» отклонил предложение: перекос сделки в вашу пользу (≈${pct}%) слишком велик — обсуждению не подлежит.`
          : (priorCounters > 0
            ? `«${nameB}» прекращает переговоры: предложенные корректировки так и не устроили клуб.`
            : `«${nameB}», скорее всего, откажет: получает заметно меньше ценности, чем отдаёт (перекос ≈${pct}% в вашу пользу).`);
        const text = involvesHuman ? `${reasonText} Новое предложение этому клубу — не раньше ${this.formatDate(until)}.` : reasonText;
        return { ok: false, verdict: 'reject', text, cooldownUntil: involvesHuman ? until : null, cooldownDays: involvesHuman ? days : null };
      }
      const counter = this.tradeBuildCounter(teamB, teamA, playersA, cashAtoB, playersB, cashBtoA, dec);
      return { ok: false, verdict: 'counter', text: counter.text, counter, round: priorCounters + 1, final: (priorCounters + 1) >= TRADE.maxCounterRounds };
    }
    const block = this.tradeCheck(teamA, teamB, playersA, playersB, cashAtoB, cashBtoA);
    if (block) return { ok: false, text: block };
    const m = this.mk(), day = Number(this.state.dayIndex || 0), cd = this.tradeCooldownMap();
    playersA.forEach(p => {
      this.marketOwn(p); this.tradeSnapshotStint(p);
      this.marketTransfer(p, 'trade', teamA, teamB, { partner: teamB, withIds: playersB.map(x => x.id), cashIn: cashBtoA, cashOut: cashAtoB });
      p.teamId = teamB; cd[p.id] = day + TRADE.cooldownDays;
    });
    playersB.forEach(p => {
      this.marketOwn(p); this.tradeSnapshotStint(p);
      this.marketTransfer(p, 'trade', teamB, teamA, { partner: teamA, withIds: playersA.map(x => x.id), cashIn: cashAtoB, cashOut: cashBtoA });
      p.teamId = teamA; cd[p.id] = day + TRADE.cooldownDays;
    });
    if (cashAtoB) { this.finBook(teamA, 'exp', 'trade', cashAtoB, 'Обмен: доплата'); this.finBook(teamB, 'inc', 'trade', cashAtoB, 'Обмен: доплата'); }
    if (cashBtoA) { this.finBook(teamB, 'exp', 'trade', cashBtoA, 'Обмен: доплата'); this.finBook(teamA, 'inc', 'trade', cashBtoA, 'Обмен: доплата'); }
    this._mkPow = null;
    const rec = { id: 'tr' + (m.seq++), day, teamA, teamB, playersA: playersA.map(p => p.id), playersB: playersB.map(p => p.id), cashAtoB, cashBtoA, ai: !!aiToAi };
    const L = this.tradesList(); L.unshift(rec); if (L.length > 200) L.length = 200;
    const money = v => v ? ` + ${(v / 1e6).toFixed(1).replace('.', ',')} млн` : '';
    const sideA = (playersA.map(p => `{p:${p.id}}`).join(', ') || '—') + money(cashAtoB);
    const sideB = (playersB.map(p => `{p:${p.id}}`).join(', ') || '—') + money(cashBtoA);
    this.marketLog(`${aiToAi ? 'ИИ ⇄ ИИ: ' : ''}{t:${teamA}} ⇄ {t:${teamB}}: ${sideA} за ${sideB}`, (teamA === this.state.teamId || teamB === this.state.teamId) ? 'mine' : 'ai', { trade: true });
    try {
      // 14.7.36: подробности сделки в новости — кто кого отдал и доплата, а не обезличенное «обменялись игроками»
      const teamAName = (this.teamById(teamA) || {}).name || '', teamBName = (this.teamById(teamB) || {}).name || '';
      const listNames = arr => arr.map(p => p.name).join(', ') || '—';
      const moneyTxt = v => v ? ` и ${(v / 1e6).toFixed(1).replace('.', ',')} млн` : '';
      const sideAText = listNames(playersA) + moneyTxt(cashAtoB);
      const sideBText = listNames(playersB) + moneyTxt(cashBtoA);
      const headline = `Обмен: «${teamAName}» — «${teamBName}»`;
      const body = `«${teamAName}» отдаёт ${sideAText}, «${teamBName}» отдаёт взамен ${sideBText}.`;
      this.marketNews(headline, body, [teamA, teamB].filter(t => t === this.state.teamId));
    } catch (e) { }
    this.persistQuietly && this.persistQuietly();
    return { ok: true, text: 'Обмен совершён.', rec };
  };
})();

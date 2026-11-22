/* KHL Manager — растянутый кэп-хит (capOverhang) при расторжении контрактов.
 *
 * Идея: вместо одноразового списания в потолок текущего/следующего сезона (старый marketChargeCap,
 * который остаётся в силе только для компенсации офер-шита — см. rfa_model.js), расторжение
 * «размазывает» штраф по всем оставшимся годам контракта, начиная с текущего сезона (наказание
 * ощущается сразу — решение явно подтверждено пользователем).
 *
 * Формула (задана пользователем, не менять без согласования):
 *   R = p.salary * yearsLeft(p) — полная оставшаяся сумма выплат по контракту;
 *   n = yearsLeft(p) — число оставшихся лет;
 *   для каждого i = 0..n-1: capOverhang[teamId][S+i] += 0.2 * R, где S — текущий seasonNumber.
 * R считается от полной зарплаты контракта, а не от фактически согласованной выплаты/компенсации —
 * это сделано намеренно, чтобы «уладить за рубль» по соглашению сторон не позволяло обойти механику:
 * оба пути расторжения (по инициативе клуба и по соглашению) считают кэп-хит одной и той же формулой.
 *
 * Хранение: state.market.capOverhang = { [teamId]: { [seasonNumber]: сумма } }. Поле лежит внутри
 * market, которое целиком переносится между сезонами через KEEP в trRollover — переживает межсезонье
 * без доп. кода. Garbage collection (удаление прошлых сезонов) — отдельная строка в season_rollover.js,
 * выполняется сразу после присвоения ns.seasonNumber, строгое неравенство (s < ns.seasonNumber), чтобы
 * не удалить только что начавшийся активный сезон.
 *
 * teamPayroll оборачивается здесь (а не редактируется в market_model.js), чтобы все существующие
 * проверки потолка (capBlock/capStatus, трейды, офер-шиты, подписания ИИ) автоматически учитывали
 * overhang без дополнительных правок — в том числе будущая логика ИИ, если ИИ когда-либо станет
 * расторгать контракты сам (сейчас этого не делает — проверено по коду). */
(function () {
  'use strict';
  if (typeof KHLManagerApp === 'undefined') return;
  const proto = KHLManagerApp.prototype;
  const OVERHANG_RATE = 0.2;

  // сумма overhang клуба за сезон (по умолчанию — текущий)
  proto.capOverhangFor = function (teamId, seasonNumber) {
    const m = this.mk(); if (!m || !m.capOverhang) return 0;
    const byTeam = m.capOverhang[teamId]; if (!byTeam) return 0;
    const s = seasonNumber != null ? seasonNumber : ((this.state && this.state.seasonNumber) || 1);
    return byTeam[s] || 0;
  };

  // полная оставшаяся сумма выплат по контракту — общая база для обоих путей расторжения
  proto.terminationRemainingValue = function (p) {
    return (Number(p.salary) || 0) * Math.max(1, this.yearsLeft(p));
  };

  // расчёт без побочных эффектов — для UI-предпросмотра перед решением
  proto.capOverhangCalc = function (p) {
    const R = this.terminationRemainingValue(p);
    const n = Math.max(1, this.yearsLeft(p));
    const S = (this.state && this.state.seasonNumber) || 1;
    const perYear = OVERHANG_RATE * R;
    return { years: n, perYear, total: perYear * n, from: S, to: S + n - 1 };
  };

  // единая точка создания overhang — обе ветки расторжения (terminateByClub/terminateMutual)
  // и UI-предпросмотр зовут только её: один источник правды для расчёта, UI и (в будущем) ИИ.
  proto.capOverhangCreate = function (teamId, p) {
    const m = this.mk(); if (!m) return null;
    m.capOverhang = m.capOverhang || {};
    const byTeam = m.capOverhang[teamId] = m.capOverhang[teamId] || {};
    const calc = this.capOverhangCalc(p);
    for (let i = 0; i < calc.years; i++) { const s = calc.from + i; byTeam[s] = (byTeam[s] || 0) + calc.perYear; }
    return calc;
  };

  // короткая текстовая метка для журнала/UI: «+12,0 млн на 3 сезона»
  proto.capOverhangText = function (calc) {
    if (!calc) return '';
    const per = (calc.perYear / 1e6).toFixed(1).replace('.', ',');
    const yrs = calc.years, word = yrs === 1 ? 'сезон' : (yrs >= 2 && yrs <= 4 ? 'сезона' : 'сезонов');
    return `+${per} млн на ${yrs} ${word}`;
  };

  const _teamPayroll = proto.teamPayroll;
  proto.teamPayroll = function (teamId) {
    return _teamPayroll.call(this, teamId) + this.capOverhangFor(teamId);
  };
})();

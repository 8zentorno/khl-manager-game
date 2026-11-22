/* KHL Manager — коммерческий лимит (доплата сверх зарплаты, вне потолка, ограничена по игроку и по клубу).
 *
 * commercial — доплата в предложении, не идёт в потолок зарплат (teamPayroll/capBlock её не видят вообще —
 * это отдельное поле, не часть deal.salary), но у неё свои лимиты: не больше 20 млн на игрока и не больше
 * 50 млн суммарно на клуб. Хранится на игроке так же, как зарплата: p.commercial — действующая сумма,
 * p.nextCommercial — вступит в силу с 1 июля (как p.nextSalary) при продлении — см. правки в
 * season_rollover.js (переход 1 июля) и market_model.js (marketComplete).
 *
 * Право на коммерческий контракт — не плоский порог по рейтингу (такой порог «хрупкий»: ломается при
 * перекалибровке OVR и не масштабируется при добавлении клубов), а топ-10% лиги по OVR, пересчитываемый
 * каждое межсезонье (снимок в state.market.commercialEligible — пересчёт вызывается из trRollover рядом
 * с GC capOverhang). Плюс карьерный фильтр (≥50 игр, тот же персистентный careerGP, что у статусов
 * ОСА/НСА в rfa_model.js) — отсекает молодых игроков с разовым высоким OVR, которые формально попали в
 * топ-10%, но «не доросли» до статуса; это нарочно оставлено как будущий игровой момент («дорос до права»
 * — новость, пока не реализована). Право проверяется только в момент подписания/продления, не живёт —
 * уже действующий коммерческий контракт не теряется, если игрок позже выпал из топ-10%.
 *
 * Никакого взаимодействия с правилом «продление на понижение — в потолок идёт старая сумма» не предусмотрено,
 * потому что такого правила в коде нет (искали: contracts.js — payrollOf возвращает текущую p.salary без
 * «старых сумм»; больше нигде подобной логики не нашлось). Если оно появится, коммерческую доплату нужно
 * явно вывести из-под него — иначе «старая зарплата + новая полная коммерческая доплата» станет
 * непробиваемым инструментом удержания игрока в клубе (ровно та дыра, которую просили не допустить). */
(function () {
  'use strict';
  if (typeof KHLManagerApp === 'undefined') return;
  const proto = KHLManagerApp.prototype;
  const PER_PLAYER = 20e6, PER_CLUB = 50e6;
  proto.COMMERCIAL = { perPlayer: PER_PLAYER, perClub: PER_CLUB };

  proto.commercialOf = function (p) { return Number(p && p.commercial) || 0; };
  // сумма действующих коммерческих доплат клуба (без учёта skipPid — при пересчёте его собственной сделки)
  proto.commercialTotal = function (teamId, skipPid) {
    return this.teamPlayers(teamId).reduce((s, p) => s + (p.id === skipPid ? 0 : this.commercialOf(p)), 0);
  };
  // снимок топ-10% лиги по OVR — пересчитывается раз в межсезонье (trRollover)
  proto.commercialRecalcEligible = function () {
    const m = this.mk(); if (!m) return;
    const all = this.league('KHL').players().slice().sort((a, b) => this.permanentOVR(b) - this.permanentOVR(a));
    const topN = Math.max(1, Math.ceil(all.length * 0.10));
    const elig = {}; all.slice(0, topN).forEach(p => { elig[p.id] = true; });
    m.commercialEligible = elig;
  };
  // право на коммерческий контракт на момент подписания/продления: топ-10% (снимок) + ≥50 карьерных игр
  proto.commercialEligible = function (p) {
    const m = this.mk(); if (!m || !p || !m.commercialEligible || !m.commercialEligible[p.id]) return false;
    if (this.seedCareerGpOnce) this.seedCareerGpOnce();
    const g = (this.careerGpMap && this.careerGpMap()) || {}, c = g[p.id] || { sk: 0, g: 0 };
    return (Number(c.sk) || 0) + (Number(c.g) || 0) >= 50;
  };
  // проверка сделки: лимиты по игроку/клубу и право — текст ошибки или null
  proto.commercialCheck = function (p, teamId, commercial) {
    const c = Number(commercial) || 0;
    if (!c) return null;
    if (!this.commercialEligible(p)) return `${p.name} не имеет права на коммерческую доплату: только топ-10% лиги по рейтингу с опытом от 50 матчей в карьере.`;
    if (c > PER_PLAYER) return `Коммерческая доплата не больше ${PER_PLAYER / 1e6} млн на игрока.`;
    const room = PER_CLUB - this.commercialTotal(teamId, p.id);
    if (c > room) return `Коммерческий лимит клуба — ${PER_CLUB / 1e6} млн суммарно; свободно ${(room / 1e6).toFixed(1)} млн.`;
    return null;
  };
})();

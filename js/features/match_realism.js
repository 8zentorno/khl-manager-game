/* KHL Manager 8.17 — реализм голов: защитники забивают, передач ~1,75 на гол. */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  proto.assistProb = function (n) { const a = this.MATCH_MODEL_PARAMS.assist; return n === 1 ? a.a1 : a.a2; };
  // Автор гола: чаще нападающий, но часть голов приходится на защитников (бросок от синей, добивание)
  proto.pickScorerFrom = function (forwards, pool, onPP) {
    const P = this.MATCH_MODEL_PARAMS.dShare;
    const defs = (pool || []).filter(p => p && p.pos === 'D');
    const fw = (forwards || []).filter(Boolean);
    if (defs.length && (!fw.length || Math.random() < (onPP ? P.pp : P.ev))) return this.weightedPick(defs, 'shooting');
    return this.weightedPick(fw, 'shooting') || this.weightedPick(pool, 'shooting');
  };
  proto.pickScorer = function (active) { return this.pickScorerFrom(active.forwards, active.skaters); };
  // Время гола в овертайме: 3 на 3 до 5 минут в регулярке, 5 на 5 до первой шайбы в плей-офф
  proto.randomOtClock = function (match) {
    const sec = match && match.playoff
      ? Math.min(1195, Math.max(8, Math.floor(-Math.log(1 - Math.random()) * 480)))
      : 8 + Math.floor(Math.random() * 285);
    return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
  };

  // 8.23.0 — овертайм, буллиты
  // Старый слой «позднего снятия вратаря» отключён: снятие учтено в shotModelGame.
  proto.applyLateGoaliePullCompleted = function () {};
  // Шанс гола в буллите: мастерство бросающего против вратаря (база 42%).
  proto.shootoutChance = function (shooter, goalie) {
    const sk = shooter ? this.playerSkill(shooter, 'shooting') : 65;
    const gk = goalie ? (this.playerSkill(goalie, 'goalkeeping') || goalie.ovr || 70) : 65;
    return Math.max(0.18, Math.min(0.65, 0.42 + (sk - 70) * 0.004 - (gk - 70) * 0.004));
  };
  proto.shootoutOutcome = function (shooter, goalie) {
    const c = this.shootoutChance(shooter, goalie), r = Math.random();
    if (r < c) return 'goal';
    return Math.random() < 0.58 ? 'save' : 'wide';
  };
  // Серия закончена досрочно, если отставший уже не может догнать.
  proto.shootoutDecided = function (ah, aa, gh, ga) {
    if (ah >= 3 && aa >= 3) return ah === aa && gh !== ga;
    const rh = Math.max(0, 3 - ah), ra = Math.max(0, 3 - aa);
    return gh > ga + ra || ga > gh + rh;
  };
  // Подпись времени в овертайме: в плей-офф «2-й ОТ 15:47».
  proto.otStampText = function (e) {
    if (!e || e.period !== 'ОТ') return e ? `${e.period} ${e.time}` : '';
    const [m = '0', s = '00'] = String(e.time || '00:00').split(':');
    const mm = Number(m), n = Math.floor(mm / 20);
    if (n >= 1) return `${n + 1}-й ОТ ${String(mm - n * 20).padStart(2, '0')}:${s}`;
    return `ОТ ${e.time}`;
  };
  proto.matchTime = function (e) {
    return e.period === 'Б' ? 'БУЛЛ.' : e.period === 'ОТ' ? this.otStampText(e) : `${e.period} ${e.time}`;
  };
  const _lc = proto.liveClock;
  proto.liveClock = function (minute, match) {
    if (minute > 80 && !(match && match.so)) {
      const n = Math.floor((minute - 60) / 20), r = minute - 60 - n * 20;
      return `${n + 1}-й ОТ ${String(r).padStart(2, '0')}:00`;
    }
    return _lc.call(this, minute, match);
  };
})();

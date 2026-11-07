/* KHL Manager 9.7.2 — защита календаря: нельзя «промотать» день, пока не сыгран матч вашей команды.
   Раньше повторное нажатие «Промотать 1 день» при открытой подготовке к матчу уводило дату вперёд,
   а матч оставался несыгранным в прошлом («через -2 дн.»). */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;

  // Несыгранный матч вашей команды, который уже наступил (дата матча не позже текущей).
  proto.duePendingUserMatch = function () {
    if (!this.state || !Array.isArray(this.state.matches)) return null;
    const id = this.state.teamId, today = Number(this.state.dayIndex || 0);
    return this.state.matches.filter(m => !m.played && !m.cancelled && (m.homeId === id || m.awayId === id) && Number(m.dateOffset) <= today)
      .sort((a, b) => a.dateOffset - b.dateOffset)[0] || null;
  };

  // Лечит уже испорченное сохранение: просроченный матч переносится на текущий день.
  proto.repairMissedUserMatch = function () {
    const m = this.duePendingUserMatch();
    if (m && Number(m.dateOffset) < Number(this.state.dayIndex || 0)) {
      m.rescheduledFrom = m.rescheduledFrom == null ? m.dateOffset : m.rescheduledFrom;
      m.dateOffset = Number(this.state.dayIndex || 0);
      return m;
    }
    return null;
  };

  const _adv = proto.advanceDay;
  proto.advanceDay = function () {
    if (this.state && !(this.state.objectiveModal && this.state.objectiveModal.kind === 'regular-choice')) {
      this.repairMissedUserMatch();
      const due = this.duePendingUserMatch();
      if (due) {
        const oppId = due.homeId === this.state.teamId ? due.awayId : due.homeId, opp = this.teamById(oppId);
        const live = this.liveMatch && this.liveMatch.matchId === due.id;
        this.setNotice && this.setNotice(live ? 'Матч вашей команды уже идёт. Доиграйте его, прежде чем листать дни.' : `Сегодня матч против ${opp ? opp.name : 'соперника'}. Сначала сыграйте его: проверьте состав и спецбригады.`);
        if (!live && typeof this.openPregame === 'function') { this.renderAll && this.renderAll(); this.openPregame(due.id); }
        else this.renderAll && this.renderAll();
        return;
      }
    }
    return _adv.apply(this, arguments);
  };

  const _next = proto.playNextMatch;
  proto.playNextMatch = function () {
    try { if (this.state) this.repairMissedUserMatch(); } catch (e) {}
    return _next.apply(this, arguments);
  };

  const _render = proto.renderAll;
  proto.renderAll = function () {
    try { if (this.state) this.repairMissedUserMatch(); } catch (e) {}
    return _render.apply(this, arguments);
  };
})();

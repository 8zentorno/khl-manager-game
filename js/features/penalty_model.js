/* KHL Manager 14.4 — контекст штрафов и драк: дерби, счёт, усталость.
   Общие правила для живого матча и быстрой симуляции (параметры в SPECIAL_MODEL_PARAMS). */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  // level 2 — принципиальные дерби, level 1 — обычные
  const D = [
    ['cska', 'spartak', 2, 'Московское дерби'], ['cska', 'ska', 2, 'Армейское дерби'], ['akbars', 'salavat', 2, 'Зелёное дерби'],
    ['avangard', 'sibir', 2, 'Сибирское дерби'], ['avtomobilist', 'traktor', 2, 'Уральское дерби'], ['metallurg', 'traktor', 2, 'Дерби Челябинской области'],
    ['amur', 'admiral', 2, 'Дальневосточное дерби'], ['dinamo_msk', 'spartak', 2, 'Классическое московское дерби'],
    ['akbars', 'neftekhimik', 1, 'Дерби Татарстана'], ['ska', 'shanghai', 1, 'Дерби Санкт-Петербурга'], ['cska', 'dinamo_msk', 1, 'Московское дерби'],
    ['dinamo_msk', 'dinamo_mn', 1, 'Динамовское дерби'], ['akbars', 'barys', 1, 'Кошачье дерби'], ['lokomotiv', 'salavat', 1, 'Медовое побоище'], ['torpedo', 'lada', 1, 'Автозаводское дерби']
  ];
  const MAP = new Map(D.map(([a, b, lv, name]) => [a < b ? a + '|' + b : b + '|' + a, { level: lv, name }]));
  proto.DERBIES = D;
  proto.derbyOf = function (a, b) { return MAP.get(a < b ? a + '|' + b : b + '|' + a) || null; };
  // множитель частоты штрафов в дерби (для быстрой симуляции целиком)
  proto.derbyHeat = function (a, b) { const d = this.derbyOf(a, b); return d ? (d.level === 2 ? 1.15 : 1.08) : 1; };
  proto.derbyFightMul = function (m) { const d = m && this.derbyOf(m.homeId, m.awayId); return d ? (d.level === 2 ? 3 : 1.8) : 1; };
  // драки: дерби и плей-офф
  proto.penaltyFightMul = function (m) { return this.derbyFightMul(m) * (m && m.playoff ? 1.25 : 1); };
  // живой матч: дерби, усталость к концу игры, острый счёт
  proto.penaltyHeat = function (m, minute) {
    let h = this.derbyHeat(m.homeId, m.awayId);
    h *= 1 + Math.max(0, Math.min(30, minute - 30)) * 0.002;
    if (Math.abs((m.homeScore || 0) - (m.awayScore || 0)) >= 2) h *= 1.06;
    return Math.min(1.35, h);
  };
  // проигрывающий нервничает: сдвиг вероятности, что нарушил хозяин
  proto.penaltyNerves = function (m) {
    const d = (m.homeScore || 0) - (m.awayScore || 0);
    return d <= -2 ? .06 : d >= 2 ? -.06 : 0;
  };
  proto.derbyBadgeHtml = function (m) {
    const d = m && this.derbyOf(m.homeId, m.awayId); if (!d) return '';
    return `<span class="derby-badge${d.level === 2 ? ' hot' : ''}" title="${d.level === 2 ? 'Принципиальное дерби' : 'Дерби'}">🔥 ${d.name}</span>`;
  };

  // Матч-центр: подпись дерби рядом с заголовком матча
  const baseMc = proto.renderMatchCenter;
  proto.renderMatchCenter = function () {
    const r = baseMc.apply(this, arguments);
    try {
      const sub = document.getElementById('match-center-subtitle'), m = this.state && this.state.matches.find(x => x.id === this.currentMatchId);
      if (sub && m) { const d = this.derbyOf(m.homeId, m.awayId); if (d && sub.textContent.indexOf('дерби') < 0 && sub.textContent.indexOf('Дерби') < 0) sub.textContent += ' · 🔥 ' + d.name; }
    } catch (e) { }
    return r;
  };
})();

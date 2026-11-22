/* KHL Manager 8.17 — ускорение симуляции.
 * effectiveOVR вызывался ~24 000 раз за один матч (разметка спецбригад, сборка составов ИИ, сила команд).
 * На время чисто читающих операций значение считается один раз на игрока. Кэш живёт только внутри
 * getStrength / activeSkaters / decorateQuickSpecialTeams, где состояние игроков не меняется.
 */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const baseEff = proto.effectiveOVR;
  let cache = null;
  proto.effectiveOVR = function (p) {
    if (!cache || !p) return baseEff.call(this, p);
    const key = p.id;
    let v = cache.get(key);
    if (v === undefined) { v = baseEff.call(this, p); cache.set(key, v); }
    return v;
  };
  const scoped = name => {
    const base = proto[name];
    if (typeof base !== 'function') return;
    proto[name] = function () {
      if (cache) return base.apply(this, arguments);
      cache = new Map();
      try { return base.apply(this, arguments); } finally { cache = null; }
    };
  };
  ['getStrength', 'activeSkaters', 'decorateQuickSpecialTeams'].forEach(scoped);
})();

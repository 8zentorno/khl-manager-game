/* 14.7.6: рост, вес, хват и номера у игроков, пришедших из рынка (свободные агенты не имели этих данных).
   Всё детерминировано по id игрока (без случайных чисел, чтобы не менять ход симуляции). */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const FA = 'FA', RET = 'RET';
  const PREF = {
    G: [1, 31, 30, 35, 29, 33, 20, 32, 40, 41, 60, 70, 80, 90],
    D: [2, 3, 4, 5, 6, 7, 8, 24, 25, 26, 27, 28, 44, 55, 77, 91, 51, 52, 53, 56, 57, 58, 59, 45, 46, 47],
    F: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 37, 38, 39, 42, 43, 48, 49, 50, 61, 63, 64, 71, 72, 73, 74, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 92, 93, 94, 95, 96, 97]
  };
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const unit = (id, salt) => (hash(id + '|' + salt) % 10000) / 10000;           // 0..1
  const gauss = (id, salt) => (unit(id, salt + 'a') + unit(id, salt + 'b') + unit(id, salt + 'c') - 1.5) * 2; // примерно −3..3, σ≈1.0
  const grp = p => (p.pos === 'G' ? 'G' : p.pos === 'D' ? 'D' : 'F');

  // Рост/вес/хват: те же распределения, что у основной базы (F 183±5, D 186±5, G 186±4; вес ≈ рост − 99 ± 5; левый хват ≈75%, у вратарей ≈97%).
  proto.playerBioFill = function (p) {
    if (!p || !p.id) return false;
    let ch = false;
    const g = grp(p);
    if (!p.height) { p.height = Math.max(170, Math.min(203, Math.round((g === 'F' ? 183 : 186) + gauss(p.id, 'h') * (g === 'G' ? 4 : 5)))); ch = true; }
    if (!p.weight) { p.weight = Math.max(66, Math.min(112, Math.round(p.height - 99 + gauss(p.id, 'w') * 5))); ch = true; }
    if (!p.grip) { p.grip = unit(p.id, 'g') < (g === 'G' ? 0.97 : 0.75) ? 'Л' : 'П'; ch = true; }
    return ch;
  };

  // Свободный номер в клубе: свой прежний, если не занят; иначе ближайший (7 занят — 17, 27…), иначе по позиции.
  proto.playerGiveNumber = function (p, teamId) {
    const tid = teamId || (p && p.teamId);
    if (!p || !tid || tid === FA || tid === RET) return null;
    const used = new Set();
    (this.db.players || []).forEach(x => { if (x !== p && x.id !== p.id && x.teamId === tid && x.number >= 1 && x.number <= 99) used.add(x.number); });
    if (p.number >= 1 && p.number <= 99 && !used.has(p.number)) return p.number;
    const want = p.number >= 1 && p.number <= 99 ? p.number : null;
    let n = null;
    if (want) for (let k = 1; k <= 9 && !n; k++) for (const c of [want + 10 * k, want - 10 * k]) if (c >= 1 && c <= 99 && !used.has(c)) { n = c; break; }
    if (!n) n = PREF[grp(p)].find(x => !used.has(x));
    if (!n) for (let i = 1; i <= 99; i++) if (!used.has(i)) { n = i; break; }
    p.number = n;
    return n;
  };

  // Проход по всем клубам: игрокам рынка без номера или с повтором выдаётся свободный номер (игроки базы не трогаются).
  proto.marketFixNumbers = function () {
    const m = this.mk && this.mk(); if (!m) return 0;
    let n = 0;
    const seen = {};
    (this.db.players || []).forEach(p => { if (m.players[p.id]) return; if (p.number >= 1) (seen[p.teamId] = seen[p.teamId] || new Set()).add(p.number); });
    Object.values(m.players).filter(p => p.teamId !== FA && p.teamId !== RET && this.db.players.includes(p))
      .sort((a, b) => String(a.id).localeCompare(String(b.id))).forEach(p => {
        const set = seen[p.teamId] = seen[p.teamId] || new Set();
        if (p.number >= 1 && p.number <= 99 && !set.has(p.number)) { set.add(p.number); return; }
        const old = p.number; const v = this.playerGiveNumber(p, p.teamId);
        if (v) { set.add(v); if (v !== old) n++; }
      });
    return n;
  };

  const _apply = proto.marketApplyToDb;
  proto.marketApplyToDb = function () {
    const r = _apply.apply(this, arguments);
    const m = this.mk && this.mk(); if (!m) return r;
    // 14.7.7: точные данные свободных агентов (для старых сохранений, один раз на игрока)
    if (typeof KHL_FREE_AGENTS !== 'undefined') {
      const src = this._faSrc || (this._faSrc = Object.fromEntries(KHL_FREE_AGENTS.map(f => [f.id, f])));
      Object.values(m.players).forEach(p => {
        const f = src[p.id]; if (!f || p.bioV >= 2) return;
        if (f.height) { p.height = f.height; p.weight = f.weight; p.grip = f.grip; }
        p.birthDate = f.birthDate;
        if (f.pos !== p.pos) { p.pos = f.pos; p.skills = Object.assign({}, f.skills); }
        p.bioV = 2;
      });
    }
    Object.values(m.players).forEach(p => this.playerBioFill(p));
    try { this.marketFixNumbers(); } catch (e) { console.warn('KHL 14.7.6 numbers:', e); }
    return r;
  };

  const _complete = proto.marketComplete;
  proto.marketComplete = function (p) {
    const r = _complete.apply(this, arguments);
    try { if (p && p.teamId !== FA && p.teamId !== RET) { this.playerBioFill(p); this.playerGiveNumber(p, p.teamId); } } catch (e) { }
    return r;
  };
})();

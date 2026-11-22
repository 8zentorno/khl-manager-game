/* Версия базы игроков (dbVersion). Сохранения, созданные на прежних составах, не открываются:
   вместо тихой поломки показываем понятное сообщение и предлагаем начать новую карьеру. */
(function () {
  const proto = KHLManagerApp.prototype;
  const $ = id => document.getElementById(id);
  const CUR = () => (typeof KHL_DATABASE !== 'undefined' && KHL_DATABASE.dbVersion) || 1;
  const MSG = 'Это сохранение создано на прежних составах (до обновления 12.0) и несовместимо с текущей базой игроков. Начните новую карьеру.';
  proto.isStaleSave = function (s) { return !!s && (Number(s.dbVersion) || 1) !== CUR(); };
  proto.isStaleMeta = function (m) { return !!m && (Number(m.dbv) || 1) !== CUR(); };

  const baseCreate = proto.createState;
  proto.createState = function () { const st = baseCreate.apply(this, arguments); if (st) st.dbVersion = CUR(); return st; };

  const baseMeta = proto.buildSlotMeta;
  if (baseMeta) proto.buildSlotMeta = function (state) { const m = baseMeta.apply(this, arguments); if (m && state) m.dbv = Number(state.dbVersion) || 1; return m; };

  const baseRead = proto.readSlotState;
  if (baseRead) proto.readSlotState = async function () {
    const r = await baseRead.apply(this, arguments);
    if (this.isStaleSave(r.st)) throw new Error(MSG);
    return r;
  };

  const baseEnter = proto.enterState;
  if (baseEnter) proto.enterState = function (st) {
    if (this.isStaleSave(st)) { alert(MSG); return; }
    return baseEnter.apply(this, arguments);
  };

  const baseRender = proto.renderMenuSlots;
  if (baseRender) proto.renderMenuSlots = function () {
    const r = baseRender.apply(this, arguments);
    try {
      const stale = Object.keys(this.slotMeta || {}).filter(k => this.isStaleMeta(this.slotMeta[k]));
      const box = $('saves-slots');
      if (box) {
        const old = box.querySelector('.dbv-note'); if (old) old.remove();
        if (stale.length) {
          const d = document.createElement('div');
          d.className = 'notice dbv-note';
          d.innerHTML = '<b>Составы обновлены до сезона 2026/27 (версия базы ' + CUR() + ').</b> Сохранения на прежних составах (' +
            stale.map(k => k === 'auto' ? 'автосохранение' : 'слот ' + k).join(', ') + ') открыть нельзя. ' +
            '<button class="btn primary" type="button" id="dbv-new">Начать новую карьеру</button>';
          box.prepend(d);
          const b = d.querySelector('#dbv-new'); if (b) b.onclick = () => this.startNewGameWizard();
        }
      }
      const lb = $('menu-last');
      if (lb && !lb.classList.contains('hidden')) {
        const last = this.lastSlotId && this.lastSlotId();
        if (last && this.isStaleMeta(this.slotMeta[last])) lb.insertAdjacentHTML('beforeend', '<span class="warn">Составы обновлены — это сохранение не открывается, начните новую карьеру.</span>');
      }
    } catch (e) { }
    return r;
  };
})();

/* KHL Manager 9.23.0 — слоты сохранений.
   Три ручных слота (1–3) + один общий слот автосохранения. Данные лежат в IndexedDB (сотни МБ вместо ~5 МБ localStorage);
   без IndexedDB — запасной вариант на localStorage. Автосохранение всегда пишет в слот «auto» и помнит, из какого слота карьера.
   Кнопка «Сохранить» пишет в слот текущей карьеры. Старое сохранение khl_manager_save_v2 переезжает в слот 1. */
(function () {
  'use strict';
  if (typeof KHLManagerApp === 'undefined') return;
  const proto = KHLManagerApp.prototype;
  const $ = id => document.getElementById(id);
  const IDS = ['1', '2', '3'], AUTO = 'auto', LEGACY = 'khl_manager_save_v2', LSP = 'khl_slot_', DB = 'khl_manager', STORE = 'saves';
  let dbp = null;
  const hasIDB = () => { try { return typeof indexedDB !== 'undefined' && !!indexedDB; } catch (e) { return false; } };

  function openDb() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      try {
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'id' }); };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error || new Error('IndexedDB error')); r.onblocked = () => rej(new Error('IndexedDB blocked'));
      } catch (e) { rej(e); }
    });
    dbp.catch(() => { dbp = null; });
    return dbp;
  }
  const tx = (mode, fn) => openDb().then(db => new Promise((res, rej) => {
    const t = db.transaction(STORE, mode); let out;
    try { out = fn(t.objectStore(STORE)); } catch (e) { rej(e); return; }
    t.oncomplete = () => res(out && out.result !== undefined ? out.result : undefined); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('abort'));
  }));
  // Хранилище: rec = {id, meta, json}
  const store = {
    async put(rec) {
      if (hasIDB()) { await tx('readwrite', s => s.put(rec)); return; }
      localStorage.setItem(LSP + rec.id, JSON.stringify(rec));
    },
    async get(id) {
      if (hasIDB()) { return await tx('readonly', s => s.get(id)) || null; }
      try { return JSON.parse(localStorage.getItem(LSP + id) || 'null'); } catch (e) { return null; }
    },
    async del(id) {
      if (hasIDB()) { await tx('readwrite', s => s.delete(id)); return; }
      localStorage.removeItem(LSP + id);
    },
    async metas() {
      const out = {};
      if (hasIDB()) {
        const recs = await openDb().then(db => new Promise((res, rej) => { const r = db.transaction(STORE, 'readonly').objectStore(STORE).getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); }));
        recs.forEach(r => { out[r.id] = r.meta; });
      } else {
        [...IDS, AUTO].forEach(id => { try { const r = JSON.parse(localStorage.getItem(LSP + id) || 'null'); if (r) out[id] = r.meta; } catch (e) { } });
      }
      return out;
    }
  };
  proto.slotStore = store;
  proto.slotMeta = {};            // кэш метаданных: {'1':meta,'2':meta,'3':meta,'auto':meta}
  proto.slotReady = false;

  const fmtWhen = t => t ? new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(',', '') : '';
  const fmtSize = b => b ? (b / 1048576).toFixed(1).replace('.', ',') + ' МБ' : '';

  proto.buildSlotMeta = function (state, json, kind) {
    let info = null;
    try { info = this.menuContinueInfo(state); } catch (e) { }
    let dateTxt = ''; try { dateTxt = this.formatDate(Number(state.dayIndex || 0)); } catch (e) { }
    return { kind, slot: state.slotId || null, teamId: state.teamId, team: info ? info.team : state.teamId, place: info ? info.place : null, conf: info ? info.conf : '', prog: info ? info.prog : '', po: info ? info.po : false, nextTxt: info ? info.nextTxt : '', dateTxt, savedAt: Date.now(), bytes: json.length };
  };

  /* ---------- запись ---------- */
  proto.setSaveStatus = function (ok, msg) {
    this.saveError = ok ? null : (msg || 'Сохранение не удалось');
    const b = $('save-banner');
    if (!b) return;
    if (ok) { b.classList.add('hidden'); b.innerHTML = ''; return; }
    b.innerHTML = `<span>⚠️ <b>Сохранение не удалось.</b> В браузере нет места или запись запрещена. Игра идёт, но прогресс может пропасть.</span><button class="btn btn-primary" type="button" onclick="app.exportSave()">Экспортировать в файл</button>`;
    b.classList.remove('hidden');
  };
  proto.toast = function (text) {
    let t = $('save-toast');
    if (!t) { t = document.createElement('div'); t.id = 'save-toast'; t.className = 'save-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = text; t.classList.add('show');
    clearTimeout(this._toastT); this._toastT = setTimeout(() => t.classList.remove('show'), 2600);
  };

  proto.writeSlot = async function (id, state, kind) {
    const json = JSON.stringify(state);
    const meta = this.buildSlotMeta(state, json, kind);
    await store.put({ id, meta, json });
    this.slotMeta[id] = meta;
    return meta;
  };

  // Автосохранение: слот auto; запись одна за раз, пока идёт запись, новые изменения копятся
  proto.writeAutosave = function () {
    if (!this.state) return;
    if (this._autoBusy) { this._autoDirty = true; return; }
    this._autoBusy = true;
    const run = async () => {
      try {
        if (!this.state) return;
        if (!this.state.slotId) this.state.slotId = this.firstFreeSlot() || '1';
        await this.writeSlot(AUTO, this.state, 'auto');
        this.setSaveStatus(true);
      } catch (e) { this.setSaveStatus(false, String(e && e.message || e)); }
      finally {
        this._autoBusy = false;
        if (this._autoDirty) { this._autoDirty = false; this.writeAutosave(); }
        else { try { this.renderMenuSlots(); } catch (e) { } }
      }
    };
    run();
  };

  proto.saveGame = function () {
    if (!this.state) { this.toast('Сначала начни карьеру.'); return Promise.resolve(false); }
    if (!this.state.slotId) this.state.slotId = this.firstFreeSlot() || '1';
    try { this.state.savedAt = Date.now(); } catch (e) { }
    const id = this.state.slotId;
    return this.writeSlot(id, this.state, 'slot').then(m => {
      this.setSaveStatus(true); this.setNotice && this.setNotice(`Карьера сохранена в слот ${id}.`);
      this.toast(`✅ Сохранено в слот ${id} · ${fmtSize(m.bytes)}`); this.renderMenuSlots(); return true;
    }).catch(e => { this.setSaveStatus(false, String(e && e.message || e)); this.toast('⚠️ Сохранение не удалось'); return false; });
  };

  /* ---------- слоты ---------- */
  proto.firstFreeSlot = function () { return IDS.find(id => !this.slotMeta[id]) || null; };
  proto.lastSlotId = function () {
    let best = null;
    [...IDS, AUTO].forEach(id => { const m = this.slotMeta[id]; if (m && (!best || m.savedAt > this.slotMeta[best].savedAt)) best = id; });
    return best;
  };

  proto.loadSlots = async function () {
    try {
      // миграция старого сохранения в слот 1
      let legacy = null; try { legacy = localStorage.getItem(LEGACY); } catch (e) { }
      this.slotMeta = await store.metas();
      if (legacy && !this.slotMeta['1']) {
        try {
          const st = JSON.parse(legacy);
          if (this.validateSave(st)) {
            st.slotId = '1'; if (!st.savedAt) st.savedAt = Date.now();
            const keep = this.state; this.state = st; let meta;
            try { const json = JSON.stringify(st); meta = this.buildSlotMeta(st, json, 'slot'); meta.savedAt = st.savedAt; await store.put({ id: '1', meta, json }); } finally { this.state = keep; }
            this.slotMeta['1'] = meta;
            try { localStorage.removeItem(LEGACY); } catch (e) { }
          }
        } catch (e) { console.warn('legacy migration', e); }
      }
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { }
    } catch (e) { console.warn('loadSlots', e); this.slotMeta = {}; }
    this.slotReady = true;
    this.renderMenuSlots(); this.updateContinueButton();
  };

  proto.readSlotState = async function (id) {
    const rec = await store.get(id);
    if (!rec) throw new Error('Слот пуст.');
    const st = JSON.parse(rec.json);
    if (!this.validateSave(st)) throw new Error('Структура сохранения не распознана.');
    return { st, meta: rec.meta };
  };

  proto.enterState = function (st, slotId) {
    this.state = st; st.slotId = slotId;
    this.repairSave(); this.currentMatchId = this.state.lastMatchId || null;
    this.showScreen('screen-game'); this.switchTab('dashboard'); this.renderAll();
  };

  proto.continueSlot = async function (id) {
    if (this._slotBusy) return; this._slotBusy = true;
    try {
      const m = this.slotMeta[id]; if (!m) { this.toast('Слот пуст.'); return; }
      const origin = id === AUTO ? (m.slot || '1') : id;
      // автосохранение другой карьеры будет перезаписано — предупреждаем, если там есть несохранённый прогресс
      const a = this.slotMeta[AUTO];
      if (a && id !== AUTO && a.slot && a.slot !== id) {
        const om = this.slotMeta[a.slot];
        if (!om || a.savedAt > om.savedAt + 1500) {
          if (!confirm(`Автосохранение сейчас хранит более свежую карьеру из слота ${a.slot} (${a.team}, ${fmtWhen(a.savedAt)}). Если войти в слот ${id}, оно будет заменено. Чтобы сохранить прогресс, сначала открой слот ${a.slot} и нажми «Сохранить». Всё равно продолжить?`)) return;
        }
      }
      const { st } = await this.readSlotState(id);
      this.enterState(st, origin);
      if (id !== AUTO) this.writeAutosave();
    } catch (e) { alert('Не удалось загрузить сохранение: ' + e.message); }
    finally { this._slotBusy = false; }
  };
  proto.continueGame = function () { const id = this.lastSlotId(); if (!id) { alert('Сохранение не найдено. Начни новую карьеру или загрузи файл сохранения.'); return; } return this.continueSlot(id); };

  proto.deleteSlot = async function (id) {
    const m = this.slotMeta[id]; if (!m) return;
    if (!confirm(`Точно удалить слот ${id}: ${m.team}? Это нельзя отменить.`)) return;
    try {
      await store.del(id); delete this.slotMeta[id];
      const a = this.slotMeta[AUTO]; if (a && a.slot === id && this.state?.slotId !== id) { /* автосохранение остаётся как самостоятельная копия */ }
      this.renderMenuSlots(); this.updateContinueButton();
    } catch (e) { alert('Не удалось удалить: ' + e.message); }
  };

  proto.exportSlot = async function (id) {
    try {
      const { st } = await this.readSlotState(id);
      const keep = this.state; this.state = st;
      try { this.exportSave(); } finally { this.state = keep; }
    } catch (e) { alert('Не удалось экспортировать: ' + e.message); }
  };

  /* ---------- новая карьера и импорт ---------- */
  proto.newInSlot = function (id) {
    const slot = id || this.firstFreeSlot();
    if (!slot) { alert('Все три слота заняты. Выбери слот и нажми «Заменить новой» или удали ненужный.'); return; }
    if (this.slotMeta[slot] && !confirm(`Точно заменить слот ${slot}: ${this.slotMeta[slot].team}? Старая карьера будет удалена, когда ты начнёшь новую.`)) return;
    this._newSlot = slot; return this._wizBase.call(this);
  };
  proto._wizBase = proto.startNewGameWizard;
  proto.startNewGameWizard = function () { return this.newInSlot(null); };

  const _init = proto.initNewCareer;
  proto.initNewCareer = function () {
    const r = _init.apply(this, arguments);
    if (this.state) {
      this.state.slotId = this._newSlot || this.firstFreeSlot() || '1'; this._newSlot = null;
      this.state.savedAt = Date.now();
      this.writeSlot(this.state.slotId, this.state, 'slot').then(() => { this.setSaveStatus(true); this.renderMenuSlots(); }).catch(e => this.setSaveStatus(false, String(e && e.message || e)));
      this.writeAutosave();
    }
    return r;
  };

  proto.importSlotPrompt = function (id) { this._importSlot = id || null; $('save-file-input').click(); };
  proto.importSavePrompt = function () { this.importSlotPrompt(null); };
  proto.importSaveFile = function (event) {
    const file = event.target.files && event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!this.validateSave(parsed)) throw new Error('Это не сохранение KHL Manager v2 или оно относится к неизвестной команде.');
        const id = this._importSlot || this.firstFreeSlot();
        if (!id) throw new Error('Все три слота заняты. Нажми «Из файла» на нужном слоте, чтобы заменить его.');
        if (this.slotMeta[id] && !confirm(`Точно заменить слот ${id}: ${this.slotMeta[id].team}, загружаемой карьерой?`)) { event.target.value = ''; return; }
        parsed.slotId = id; parsed.savedAt = Date.now();
        this.state = parsed; this.repairSave();
        await this.writeSlot(id, this.state, 'slot');
        this.currentMatchId = this.state.lastMatchId || null; this._importSlot = null;
        this.showScreen('screen-game'); this.switchTab('dashboard'); this.renderAll(); this.writeAutosave();
        this.toast(`Загружено в слот ${id}`);
      } catch (e) { alert('Не удалось загрузить файл: ' + e.message); }
      event.target.value = '';
    };
    reader.readAsText(file);
  };

  /* ---------- меню ---------- */
  proto.updateContinueButton = function () {
    const btn = $('continue-btn'); if (!btn) return;
    btn.disabled = !this.lastSlotId(); btn.style.opacity = btn.disabled ? '.5' : '1';
    this.renderMenuSlots();
  };
  proto.readStoredSave = function () { return null; };   // старое хранилище больше не используется

  proto.autoFresh = function () {
    const a = this.slotMeta[AUTO]; if (!a) return false;
    const om = a.slot ? this.slotMeta[a.slot] : null;
    return !om || a.savedAt > om.savedAt + 1500;
  };

  proto.renderMenuSlots = function () {
    const e = s => this.escape(String(s == null ? '' : s));
    const last = this.lastSlotId();
    const used = IDS.filter(id => this.slotMeta[id]).length;
    // меню: карточка «Последняя игра» и кнопка «Сохранения»
    const lb = $('menu-last');
    if (lb) {
      const m = last ? this.slotMeta[last] : null;
      if (!m) { lb.classList.add('hidden'); lb.innerHTML = ''; }
      else {
        const place = m.po ? 'плей-офф' : (m.place ? `${m.place}-е место ${m.conf} · ${m.prog}` : m.prog);
        lb.innerHTML = `<b>Последняя игра: ${e(m.team)}</b><span>${e(place)} · ${e(m.dateTxt)}</span><span>сохранено ${e(fmtWhen(m.savedAt))}${last === AUTO ? ' (автосохранение)' : ' · слот ' + e(last)}</span>`;
        lb.classList.remove('hidden');
      }
    }
    const sub = $('saves-sub');
    if (sub) sub.innerHTML = used || this.slotMeta[AUTO] ? `${used} из 3${this.autoFresh() ? ' · <span class="warn">есть несохранённое</span>' : ''}` : 'пусто';
    // экран «Сохранения»
    const box = $('saves-slots'); if (!box) return;
    const card = id => {
      const m = this.slotMeta[id];
      if (!m) return `<div class="slot-card empty"><div class="slot-num">${id}</div><div class="slot-body"><b>Пустой слот</b><span class="slot-meta">Здесь можно начать ещё одну карьеру</span><div class="slot-acts"><button class="btn btn-primary" type="button" onclick="app.newInSlot('${id}')">＋ Новая карьера</button><button class="btn btn-quiet" type="button" onclick="app.importSlotPrompt('${id}')">Из файла</button></div></div></div>`;
      const place = m.po ? 'плей-офф' : (m.place ? `${m.place}-е место ${m.conf} · ${m.prog}` : m.prog);
      const isLast = last === id || (last === AUTO && this.slotMeta[AUTO] && this.slotMeta[AUTO].slot === id);
      return `<div class="slot-card${isLast ? ' last' : ''}"><div class="slot-num">${id}</div><div class="slot-body"><div class="slot-head"><b>${e(m.team)}</b>${isLast ? '<span class="slot-pill">последний</span>' : ''}</div><span class="slot-meta">${e(place)}</span><span class="slot-meta">${e(m.dateTxt)} · сохранено ${e(fmtWhen(m.savedAt))} · ${e(fmtSize(m.bytes))}</span><div class="slot-acts"><button class="btn btn-primary" type="button" onclick="app.continueSlot('${id}')">▶ Продолжить</button><button class="btn btn-quiet" type="button" onclick="app.exportSlot('${id}')">Экспорт</button><button class="btn btn-quiet" type="button" onclick="app.importSlotPrompt('${id}')">Из файла</button><button class="btn btn-quiet" type="button" onclick="app.newInSlot('${id}')">Заменить новой</button><button class="btn btn-quiet slot-del" type="button" onclick="app.deleteSlot('${id}')">Удалить</button></div></div></div>`;
    };
    let auto = '';
    const a = this.slotMeta[AUTO];
    if (a) {
      auto = `<div class="slot-card auto${last === AUTO ? ' last' : ''}"><div class="slot-num">⟳</div><div class="slot-body"><div class="slot-head"><b>Автосохранение</b><span class="slot-pill">${a.slot ? 'карьера из слота ' + e(a.slot) : 'карьера'}</span></div><span class="slot-meta">${e(a.team)} · ${e(a.po ? 'плей-офф' : a.prog)}</span><span class="slot-meta">${e(a.dateTxt)} · сохранено ${e(fmtWhen(a.savedAt))} · ${e(fmtSize(a.bytes))}</span>${this.autoFresh() && a.slot ? `<span class="slot-meta warn">Свежее, чем слот ${e(a.slot)}. Нажми «Сохранить» в игре, чтобы записать прогресс в слот.</span>` : ''}<span class="slot-meta">Одно на все карьеры: вход в другой слот заменит его.</span><div class="slot-acts"><button class="btn btn-primary" type="button" onclick="app.continueSlot('auto')">▶ Продолжить</button><button class="btn btn-quiet" type="button" onclick="app.exportSlot('auto')">Экспорт</button></div></div></div>`;
    }
    box.innerHTML = IDS.map(card).join('') + auto;
  };

  const _show = proto.showScreen;
  proto.showScreen = function (id) { const r = _show.apply(this, arguments); const sv = $('screen-saves'); if (sv) sv.classList.toggle('hidden', id !== 'screen-saves'); if (id === 'screen-menu' || id === 'screen-saves') this.renderMenuSlots(); return r; };
  proto.renderMenuContinue = function () { };

  if (typeof app !== 'undefined' && app) app.loadSlots();
})();

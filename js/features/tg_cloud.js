/* KHL Manager 10.0 — запуск в Telegram: облачная копия сохранений, код сохранения, оболочка Mini App.
   Игра по-прежнему читает и пишет только рабочее хранилище (IndexedDB/localStorage). Облако Telegram (CloudStorage) — резервная копия:
   сжатое сохранение режется на куски по 4000 символов (лимит значения 4096), паспорт копии пишется последним.
   Журнал матчей других клубов при записи сокращается: подробно — свои матчи и последние 10 матчей лиги, у остальных голы и итог. */
(function () {
  'use strict';
  if (typeof KHLManagerApp === 'undefined') return;
  const proto = KHLManagerApp.prototype;
  if (!proto.slotStore) return;
  const store = proto.slotStore, $ = id => document.getElementById(id);
  const IDS = ['1', '2', '3', 'auto'], CH = 4000, MAXCH = 230, KEEP_LEAGUE = 10, PUSH_DELAY = 45000;
  const KEEP_KINDS = { goal: 1, final: 1, shootoutAttempt: 1 };

  /* ---------- сокращение журнала ---------- */
  proto.serializeState = function (state) {
    let trim = null;
    try {
      const own = state.teamId, ms = state.matches || [];
      const others = ms.filter(m => m && m.played && m.homeId !== own && m.awayId !== own && Array.isArray(m.events) && m.events.length && !m.trimmed);
      const all = ms.filter(m => m && m.played && m.homeId !== own && m.awayId !== own).sort((a, b) => (a.dateOffset - b.dateOffset) || String(a.id).localeCompare(String(b.id)));
      const recent = new Set(all.slice(-KEEP_LEAGUE));
      trim = new Set(others.filter(m => !recent.has(m)));
      (state.matches || []).forEach(m => { if (m && m.trimmed && !recent.has(m)) trim.add(m); });
    } catch (e) { trim = null; }
    if (!trim || !trim.size) return JSON.stringify(state);
    return JSON.stringify(state, (k, v) => {
      if (v && typeof v === 'object' && trim.has(v)) {
        const o = Object.assign({}, v); o.events = (v.events || []).filter(e => e && KEEP_KINDS[e.kind]); delete o.fatigueReport; o.trimmed = true; return o;
      }
      return v;
    });
  };
  proto.writeSlot = async function (id, state, kind) {
    const json = this.serializeState(state);
    const meta = this.buildSlotMeta(state, json, kind);
    await store.put({ id, meta, json });
    this.slotMeta[id] = meta;
    try { this.cloudQueue(id); } catch (e) { }
    return meta;
  };

  /* ---------- упаковка ---------- */
  const b64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  async function streamBytes(bytes, Ctor, kind) {
    const cs = new Ctor(kind), w = cs.writable.getWriter(); w.write(bytes); w.close();
    return new Uint8Array(await new Response(cs.readable).arrayBuffer());
  }
  proto.packText = async function (text) {
    const raw = new TextEncoder().encode(text);
    if (typeof CompressionStream !== 'undefined') { try { return { enc: 'g', data: b64(await streamBytes(raw, CompressionStream, 'gzip')) }; } catch (e) { } }
    return { enc: 'r', data: b64(raw) };
  };
  proto.unpackText = async function (enc, data) {
    let bytes = unb64(data);
    if (enc === 'g') { if (typeof DecompressionStream === 'undefined') throw new Error('Этот клиент не умеет распаковывать сохранение.'); bytes = await streamBytes(bytes, DecompressionStream, 'gzip'); }
    return new TextDecoder().decode(bytes);
  };

  /* ---------- Telegram ---------- */
  const tgApp = () => (window.Telegram && window.Telegram.WebApp) || null;
  const ver = v => { const t = tgApp(); try { return !!(t && t.isVersionAtLeast && t.isVersionAtLeast(v)); } catch (e) { return false; } };
  const inTelegram = () => { const t = tgApp(); return !!(t && t.initData !== undefined && t.platform && t.platform !== 'unknown'); };
  const cloud = () => { const t = tgApp(); return t && t.CloudStorage && ver('6.9') ? t.CloudStorage : null; };
  proto.hasCloud = function () { return !!cloud(); };
  const cs = {
    set: (k, v) => new Promise((res, rej) => cloud().setItem(k, v, (e, ok) => e || ok === false ? rej(new Error(e || 'setItem')) : res())),
    get: ks => new Promise((res, rej) => cloud().getItems(ks, (e, o) => e ? rej(new Error(e)) : res(o || {}))),
    keys: () => new Promise((res, rej) => cloud().getKeys((e, k) => e ? rej(new Error(e)) : res(k || []))),
    del: ks => ks.length ? new Promise((res, rej) => cloud().removeItems(ks, (e) => e ? rej(new Error(e)) : res())) : Promise.resolve()
  };
  proto._cloudCs = cs;
  const key = (id, n) => 'khl_' + id + '_' + n;
  proto.cloudInfo = {};

  proto.cloudQueue = function (id) {
    if (!this.hasCloud()) return;
    this._cloudDirty = this._cloudDirty || {}; this._cloudDirty[id] = 1;
    if (id !== 'auto') { clearTimeout(this._cloudT); this._cloudT = setTimeout(() => this.cloudFlush(), 3000); return; }
    if (this._cloudT) return; this._cloudT = setTimeout(() => this.cloudFlush(), PUSH_DELAY);
  };
  proto.cloudFlush = async function () {
    clearTimeout(this._cloudT); this._cloudT = null;
    if (this._cloudBusy) { this._cloudAgain = true; return; }
    this._cloudBusy = true;
    try {
      const ids = Object.keys(this._cloudDirty || {}); this._cloudDirty = {};
      for (const id of ids) { try { await this.cloudPush(id); } catch (e) { this.cloudInfo[id] = { state: 'err', msg: String(e && e.message || e) }; } }
    } finally { this._cloudBusy = false; try { this.renderMenuSlots(); } catch (e) { } if (this._cloudAgain) { this._cloudAgain = false; this.cloudFlush(); } }
  };
  proto.cloudPush = async function (id) {
    if (!this.hasCloud()) return false;
    const rec = await store.get(id);
    if (!rec) return false;
    const p = await this.packText(rec.json), n = Math.ceil(p.data.length / CH);
    if (n > MAXCH) { this.cloudInfo[id] = { state: 'big', kb: Math.round(p.data.length / 1024) }; return false; }
    let old = null; try { const o = await cs.get([key(id, 'm')]); old = o[key(id, 'm')] ? JSON.parse(o[key(id, 'm')]) : null; } catch (e) { }
    for (let i = 0; i < n; i++) await cs.set(key(id, i), p.data.slice(i * CH, (i + 1) * CH));
    const meta = { v: 1, n, enc: p.enc, sum: hash(p.data), len: p.data.length, savedAt: rec.meta.savedAt, meta: rec.meta };
    await cs.set(key(id, 'm'), JSON.stringify(meta));
    if (old && old.n > n) { const ks = []; for (let i = n; i < old.n; i++) ks.push(key(id, i)); await cs.del(ks); }
    this.cloudInfo[id] = { state: 'ok', at: Date.now(), n };
    return true;
  };
  proto.cloudRemove = async function (id) {
    if (!this.hasCloud()) return;
    try {
      const o = await cs.get([key(id, 'm')]), m = o[key(id, 'm')] ? JSON.parse(o[key(id, 'm')]) : null;
      const ks = [key(id, 'm')]; if (m) for (let i = 0; i < m.n; i++) ks.push(key(id, i));
      await cs.del(ks); delete this.cloudInfo[id];
    } catch (e) { }
  };
  const _del = store.del;
  store.del = async function (id) { await _del.apply(store, arguments); try { await proto.cloudRemove.call(typeof app !== 'undefined' && app ? app : proto, id); } catch (e) { } };

  proto.askYesNo = function (text) {
    const t = tgApp();
    if (t && t.showConfirm && ver('6.2')) return new Promise(res => { try { t.showConfirm(text, ok => res(!!ok)); } catch (e) { res(confirm(text)); } });
    return Promise.resolve(confirm(text));
  };
  proto.cloudRead = async function (id, m) {
    const ks = []; for (let i = 0; i < m.n; i++) ks.push(key(id, i));
    const o = {}; for (let i = 0; i < ks.length; i += 50) Object.assign(o, await cs.get(ks.slice(i, i + 50)));
    let data = ''; for (const k of ks) { if (typeof o[k] !== 'string' || !o[k]) throw new Error('В облаке не хватает части сохранения.'); data += o[k]; }
    if (hash(data) !== m.sum) throw new Error('Облачная копия повреждена.');
    return this.unpackText(m.enc, data);
  };
  // При запуске: сверяем облако и рабочее хранилище; ничего не заменяем без согласия.
  proto.cloudReconcile = async function () {
    if (!this.hasCloud() || this._cloudChecked) return; this._cloudChecked = true;
    try {
      const o = await cs.get(IDS.map(i => key(i, 'm')));
      const fmt = t => t ? new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(',', '') : '';
      let restored = 0;
      for (const id of IDS) {
        let m = null; try { m = o[key(id, 'm')] ? JSON.parse(o[key(id, 'm')]) : null; } catch (e) { }
        if (!m || !m.meta) continue;
        const local = this.slotMeta[id];
        if (local && m.savedAt <= local.savedAt + 2000) { this.cloudInfo[id] = { state: 'ok', at: m.savedAt, n: m.n }; continue; }
        const name = id === 'auto' ? 'автосохранение' : 'слот ' + id;
        const q = local ? `В облаке Telegram есть более новая копия (${name}: ${m.meta.team}, ${fmt(m.savedAt)}). Заменить ей сохранение на этом устройстве (${fmt(local.savedAt)})?`
          : `В облаке Telegram найдена копия: ${name}, ${m.meta.team}, ${fmt(m.savedAt)}. Восстановить её на этом устройстве?`;
        if (!(await this.askYesNo(q))) continue;
        try {
          const json = await this.cloudRead(id, m), st = JSON.parse(json);
          if (!this.validateSave(st)) throw new Error('Структура сохранения не распознана.');
          await store.put({ id, meta: m.meta, json }); this.slotMeta[id] = m.meta; this.cloudInfo[id] = { state: 'ok', at: m.savedAt, n: m.n }; restored++;
        } catch (e) { this.toast('⚠️ Не удалось восстановить: ' + e.message); }
      }
      if (restored) { this.renderMenuSlots(); this.updateContinueButton(); this.toast('☁ Восстановлено из облака: ' + restored); }
    } catch (e) { console.warn('cloudReconcile', e); }
  };

  /* ---------- код сохранения (для переноса и для Telegram вместо файла) ---------- */
  const codeOf = p => 'KHL1' + p.enc + ':' + p.data;
  proto.exportCodeOf = async function (id) {
    let st = this.state, json;
    if (id) { const rec = await store.get(id); if (!rec) throw new Error('Слот пуст.'); json = rec.json; } else { if (!st) throw new Error('Нет карьеры.'); json = this.serializeState(st); }
    return codeOf(await this.packText(json));
  };
  proto.openCodeModal = function (mode, text, target) {
    let m = $('code-modal');
    if (!m) { m = document.createElement('div'); m.id = 'code-modal'; m.className = 'code-modal'; document.body.appendChild(m); }
    const imp = mode === 'import';
    const slots = ['1', '2', '3'].map(i => `<option value="${i}"${i === target ? ' selected' : ''}>Слот ${i}${this.slotMeta[i] ? ' (' + this.escape(this.slotMeta[i].team) + ')' : ' (пусто)'}</option>`).join('');
    m.innerHTML = `<div class="code-box" role="dialog" aria-modal="true"><h3>${imp ? 'Загрузить код сохранения' : 'Код сохранения'}</h3><p class="small muted">${imp ? 'Вставь код, скопированный из игры на другом устройстве.' : 'Скопируй код и сохрани его в заметках или избранном Telegram. Он загружается через «Вставить код».'}</p><textarea id="code-text" rows="6" spellcheck="false" ${imp ? '' : 'readonly'}></textarea>${imp ? `<label class="small muted">Куда загрузить <select id="code-slot">${slots}</select></label>` : ''}<div class="slot-acts">${imp ? '<button class="btn btn-primary" type="button" id="code-go">Загрузить</button>' : '<button class="btn btn-primary" type="button" id="code-copy">Скопировать</button>'}<button class="btn btn-quiet" type="button" id="code-close">Закрыть</button></div><p class="small" id="code-msg"></p></div>`;
    const ta = $('code-text'); ta.value = text || '';
    $('code-close').onclick = () => { m.remove(); };
    const msg = t => { $('code-msg').textContent = t; };
    if (imp) $('code-go').onclick = async () => { try { await this.importCode(ta.value, $('code-slot').value); m.remove(); } catch (e) { msg('Не получилось: ' + e.message); } };
    else {
      $('code-copy').onclick = async () => {
        try { await navigator.clipboard.writeText(ta.value); msg('✅ Скопировано.'); } catch (e) { ta.focus(); ta.select(); try { document.execCommand('copy'); msg('✅ Скопировано.'); } catch (e2) { msg('Выдели текст и скопируй вручную.'); } }
      };
      ta.onfocus = () => ta.select();
    }
  };
  proto.exportCode = async function (id) {
    try { const code = await this.exportCodeOf(id); this.openCodeModal('export', code); }
    catch (e) { alert('Не удалось подготовить код: ' + e.message); }
  };
  proto.importCode = async function (text, id) {
    const t = String(text || '').trim(), mt = /^KHL1([gr]):([A-Za-z0-9+/=]+)$/.exec(t);
    if (!mt) throw new Error('Это не код сохранения KHL Manager.');
    const parsed = JSON.parse(await this.unpackText(mt[1], mt[2]));
    if (!this.validateSave(parsed)) throw new Error('Структура сохранения не распознана.');
    if (this.slotMeta[id] && !(await this.askYesNo(`Заменить слот ${id}: ${this.slotMeta[id].team}, загружаемой карьерой?`))) throw new Error('Отменено.');
    parsed.slotId = id; parsed.savedAt = Date.now();
    this.state = parsed; this.repairSave();
    await this.writeSlot(id, this.state, 'slot');
    this.currentMatchId = this.state.lastMatchId || null;
    this.showScreen('screen-game'); this.switchTab('dashboard'); this.renderAll(); this.writeAutosave();
    this.toast('Загружено в слот ' + id);
  };
  // В Telegram файлы не скачиваются надёжно: «Экспорт» отдаёт код
  const _expSave = proto.exportSave, _expSlot = proto.exportSlot;
  proto.exportSave = function () { if (inTelegram()) return this.exportCode(null); return _expSave.apply(this, arguments); };
  proto.exportSlot = function (id) { if (inTelegram()) return this.exportCode(id); return _expSlot.apply(this, arguments); };

  /* ---------- экран «Сохранения»: облако и код ---------- */
  const _render = proto.renderMenuSlots;
  proto.renderMenuSlots = function () {
    const r = _render.apply(this, arguments);
    const box = $('saves-slots'); if (!box) return r;
    let note = '';
    if (this.hasCloud()) {
      const a = this.cloudInfo.auto, bad = Object.values(this.cloudInfo).find(x => x.state === 'big' || x.state === 'err');
      note = `<div class="slot-meta">☁ Облако Telegram: ${bad ? (bad.state === 'big' ? 'часть сохранений слишком велика для облака (' + bad.kb + ' КБ в сжатом виде), они остаются только на устройстве' : 'не удалось записать копию, повторю при следующем сохранении') : a && a.state === 'ok' ? 'резервная копия обновлена' : 'копия появится после сохранения'}. Копия хранится в вашем аккаунте и доступна с других устройств.</div>`;
    }
    box.insertAdjacentHTML('beforeend', `<div class="slot-card code-card"><div class="slot-num">⌗</div><div class="slot-body"><div class="slot-head"><b>Код сохранения</b></div>${note}<span class="slot-meta">Перенос карьеры между телефоном и компьютером без файлов.</span><div class="slot-acts"><button class="btn btn-quiet" type="button" onclick="app.exportCode(app.lastSlotId())">Скопировать код последней игры</button><button class="btn btn-quiet" type="button" onclick="app.openCodeModal('import','',app.firstFreeSlot()||'1')">Вставить код</button></div></div></div>`);
    return r;
  };

  /* ---------- оболочка Mini App ---------- */
  function shell(app) {
    const t = tgApp(); if (!t || !inTelegram()) return;
    document.body.classList.add('tg-app');
    try { t.ready(); t.expand(); } catch (e) { }
    try { if (ver('7.7')) t.disableVerticalSwipes(); } catch (e) { }
    const inGame = () => { const g = $('screen-game'); return !!(g && !g.classList.contains('hidden')); };
    const sync = () => {
      try { if (t.enableClosingConfirmation && ver('6.2')) { inGame() ? t.enableClosingConfirmation() : t.disableClosingConfirmation(); } } catch (e) { }
      try { const menu = !$('screen-menu') || !$('screen-menu').classList.contains('hidden'); if (ver('6.1')) menu ? t.BackButton.hide() : t.BackButton.show(); } catch (e) { }
    };
    const _s = proto.showScreen;
    proto.showScreen = function (id) { const r = _s.apply(this, arguments); sync(); return r; };
    try {
      t.BackButton.onClick(async () => {
        const modal = $('code-modal'); if (modal) { modal.remove(); return; }
        const sv = $('screen-saves'); if (sv && !sv.classList.contains('hidden')) { app.showScreen('screen-menu'); return; }
        if (inGame()) { if (await app.askYesNo('Выйти в главное меню? Прогресс сохранится автоматически.')) { try { await app.writeAutosave(); } catch (e) { } app.showScreen('screen-menu'); } return; }
        app.showScreen('screen-menu');
      });
    } catch (e) { }
    const flush = () => { if (app.state) { try { app.writeAutosave(); } catch (e) { } } app.cloudFlush(); };
    document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
    try { t.onEvent('deactivated', flush); } catch (e) { }
    sync();
  }
  // SDK подгружается асинхронно (platform/telegram.js): ждём его до 5 секунд
  function getApp() { try { return app; } catch (e) { return null; } }
  function boot() {
    const app = (typeof globalThis.app !== 'undefined' ? globalThis.app : null) || getApp(); if (!app) return;
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      if (inTelegram() || tries > 50) {
        clearInterval(iv);
        if (inTelegram()) { shell(app); const go = () => app.cloudReconcile(); if (app.slotReady) go(); else { const l = app.loadSlots; app.loadSlots = async function () { const r = await l.apply(this, arguments); go(); return r; }; } }
      }
    }, 100);
  }
  boot();
})();

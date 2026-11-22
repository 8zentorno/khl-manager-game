/* KHL Manager 14.7.32 — трансферная реформа, фаза 1: статусы ОСА (RFA) / НСА (UFA), квалификационные
 * предложения, офер-шиты с компенсацией и 7-дневным мэтчем, ручной отказ от прав, ИИ-похищения.
 *
 * Правила (упрощённая ведомость, согласован концепт):
 *  - Статус считается по возрасту и «карьерным» матчам в лиге (новый персистентный счётчик careerGP,
 *    хранится в state.market, живёт с первого захода в сезон 26/27 — до этого статистика не вела учёт
 *    карьеры, поэтому прошлые сезоны засеваются один раз правдоподобной оценкой, детерминированной от id
 *    игрока, чтобы она не «плавала» между загрузками).
 *  - ОСА (RFA) — контракт истёк, клуб имеет право закрепить его квалификационным предложением
 *    (rfaQualify). До 21 года — особая квота 150–170% прежней зарплаты (rfaQualifyJunior), закрывает
 *    вопрос без выхода на рынок. НСА (UFA) — выходит на рынок свободно, как раньше.
 *  - Закреплённые права живут в state.market.rfaRights[pid] = {teamId, salary, day}. Игрок с правами
 *    всё равно выходит в общий пул (teamId:'FA'), но «подписание» другим клубом идёт не как обычная
 *    сделка, а как офер-шит: evaluateOffer решает, согласен ли игрок, после — 7 игровых дней у старого
 *    клуба на мэтч (offerSheetMatch) точь-в-точь или отказ (offerSheetDecline/таймаут), тогда «новый»
 *    клуб платит компенсацию offerSheetCompensation в потолок (marketChargeCap).
 *  - Ручной отказ от прав (rfaRelease) — чтобы «мёртвые» права не висели вечно, если клуб не планирует
 *    мэтчить: игрок освобождается без компенсации.
 */
(function () {
  'use strict';
  if (typeof KHLManagerApp === 'undefined') return;
  const proto = KHLManagerApp.prototype;
  const FA = 'FA';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const grp = pos => (pos === 'LW' || pos === 'RW') ? 'W' : pos;
  const CAREER = { sk: 44, g: 28 };                       // игр за сезон при полной роли — калибровка по составу 14.7.31
  const UFA_RULE = { skAge: 29, skAgeGp: 28, skGp: 250, gAge: 28, gGp: 200 };
  const JUNIOR_AGE = 21;
  const kAge = a => a < 24 ? 1.8 : a <= 27 ? 1.3 : 0.8;    // компенсация за офер-шит: младше — дороже
  function hash(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return Math.abs(h); }
  const rand01 = id => (hash(String(id) + 'x') % 10000) / 10000;

  proto.RFA_K_AGE = kAge;

  // 14.7.38: дедлайн квалификации ОСА — 15 мая. Чисто информационный ориентир для UI (счётчик дней до
  // окна), ничего не закрывает автоматически — единая точка правды по аналогии с marketDeadlineDay/Label.
  proto.rfaDeadlineDay = function () { return this.trDayOf(this.trStartYear(), 5, 15); };
  proto.rfaDeadlineLabel = function () { return '15 мая'; };

  /* ------------------------------------------------------------------ карьерные матчи (сид + инкремент) */
  proto.careerGpMap = function () { const m = this.mk(); return m ? (m.careerGP || (m.careerGP = {})) : null; };
  proto.seedCareerGpOnce = function () {
    const m = this.mk(); if (!m || m.careerGpSeeded) return;
    m.careerGP = m.careerGP || {};
    const all = [...this.league('KHL').players(), ...this.marketPool()];
    all.forEach(p => {
      if (m.careerGP[p.id]) return;
      const age = Math.floor(this.ageOn(p, this.seasonStartMs()));
      const debut = 19 + (hash(p.id) % 4);
      const seasons = clamp(age - debut, 0, 15);
      const per = p.pos === 'G' ? CAREER.g : CAREER.sk;
      const role = 0.4 + 0.6 * (Number(p.ovr) || 70) / 100;
      const noise = 0.85 + 0.3 * rand01(p.id);
      const gp = Math.round(seasons * per * role * noise);
      m.careerGP[p.id] = p.pos === 'G' ? { sk: 0, g: gp } : { sk: gp, g: 0 };
    });
    m.careerGpSeeded = true;
  };
  // раз в сыгранный матч регулярного чемпионата: засчитываем явку в карьерный счётчик
  const _amd = proto.applyMatchDevelopment;
  proto.applyMatchDevelopment = function (match, activeH, activeA) {
    const r = _amd.apply(this, arguments);
    try {
      if (!match || match.playoff || !activeH || !activeA || !this.mk()) return r;
      this.seedCareerGpOnce();
      const g = this.careerGpMap(); if (!g) return r;
      const bump = p => { if (!p) return; const c = g[p.id] || (g[p.id] = { sk: 0, g: 0 }); if (p.pos === 'G') c.g++; else c.sk++; };
      [...(activeH.skaters || []), activeH.goalie, ...(activeA.skaters || []), activeA.goalie].forEach(bump);
    } catch (e) { console.warn('KHL Manager 14.7.32 careerGP:', e); }
    return r;
  };

  /* ------------------------------------------------------------------ статус игрока */
  proto.faStatus = function (p) {
    if (!p) return null;
    const Y = this.seasonEndYear();
    // 14.7.38: контракт «до Y» покрывает ВЕСЬ сезон Y целиком (та же конвенция, что в yearsLeft/trExpiring —
    // contractUntil >= Y, не строгое >). Со строгим «>» любой игрок в последнем году контракта «до Y» считался
    // уже истёкшим с первого дня сезона Y, хотя сезон Y ещё даже не начинался — отсюда 18 ложных ОСА/НСА в
    // составе на 3 сентября. seasonEndYear() увеличивается только при переходе сезона (trRollover), так что
    // контракт «до Y» и дальше корректно считается подписанным весь сезон Y, и только после перехода в сезон
    // Y+1 (т.е. в межсезонье с уже увеличенным Y) он законно становится ОСА/НСА.
    if (Number(p.contractUntil) >= Y || p.nextSalary) return 'signed';
    this.seedCareerGpOnce();
    const g = this.careerGpMap() || {}, c = g[p.id] || { sk: 0, g: 0 };
    const age = Math.floor(this.ageOn(p, this.seasonStartMs()));
    if (age >= UFA_RULE.skAge) return 'UFA';
    if (p.pos === 'G') { if (age >= UFA_RULE.gAge && c.g >= UFA_RULE.gGp) return 'UFA'; }
    else if (age >= UFA_RULE.skAgeGp && c.sk >= UFA_RULE.skGp) return 'UFA';
    return age < JUNIOR_AGE ? 'RFA-junior' : 'RFA';
  };
  proto.FA_STATUS_LABEL = { RFA: 'ОСА', 'RFA-junior': 'ОСА (квота)', UFA: 'НСА', signed: '' };

  /* ------------------------------------------------------------------ права клуба на ОСА */
  proto.rfaRightsMap = function () { const m = this.mk(); return m ? (m.rfaRights || (m.rfaRights = {})) : null; };
  proto.rfaOf = function (pid) { const r = this.rfaRightsMap(); return r ? (r[pid] || null) : null; };

  // клуб (свой или ИИ) закрепляет права на истекающего ОСА — не продление, просто «бронь» на лето
  proto.rfaQualify = function (pid, teamId) {
    const p = this.marketPlayer(pid); if (!p || p.teamId !== teamId) return { ok: false, text: 'Игрок не в клубе.' };
    const st = this.faStatus(p);
    if (st !== 'RFA' && st !== 'RFA-junior') return { ok: false, text: 'Квалификация доступна только для ограниченно свободных агентов.' };
    const r = this.rfaRightsMap(); r[pid] = { teamId, salary: p.salary, day: Number(this.state.dayIndex || 0) };
    if (teamId === this.state.teamId) this.marketLog(`{t:${teamId}}: квалификационное предложение {p:${pid}} — права закреплены`, 'mine');
    this.persistQuietly && this.persistQuietly();
    return { ok: true, text: `${p.name}: права закреплены. Другие клубы могут присылать офер-шиты, у вас будет 7 дней на мэтч.` };
  };
  // до 21 года: квота 150–170% прежней зарплаты — закрывает вопрос сразу, на рынок игрок не выходит
  proto.rfaQualifyJunior = function (pid, pct) {
    const p = this.marketPlayer(pid); if (!p || p.teamId !== this.state.teamId) return { ok: false, text: 'Игрок не в клубе.' };
    if (this.faStatus(p) !== 'RFA-junior') return { ok: false, text: 'Квота доступна только игрокам до 21 года.' };
    pct = clamp(Number(pct) || 160, 150, 170);
    const Y = this.seasonEndYear(), salary = Math.max(this.MARKET.minWage, Math.round(p.salary * pct / 100 / 500000) * 500000);
    const delta = salary - (Number(p.nextSalary) || p.salary), block = this.capBlock(this.state.teamId, delta, p.id);
    if (block) return { ok: false, text: block };
    this.marketOwn(p);
    const expired = Number(p.contractUntil) < Y;
    p.nextSalary = salary; p.contract = this.ageYears(p) <= 20 ? '3-way' : '2-way';
    p.contractUntil = (expired ? Y : Math.max(Number(p.contractUntil) || Y, Y)) + Math.max(1, this.wantYears(p));
    this.marketTransfer(p, 'ext', this.state.teamId, this.state.teamId, { salary });
    this.marketLog(`Квота для молодого ОСА: {p:${pid}} продлён на ${pct}% от прежней зарплаты — ${(salary / 1e6).toFixed(1).replace('.', ',')} млн`, 'mine');
    this.persistQuietly && this.persistQuietly();
    return { ok: true, text: `${p.name}: продлён по квоте ${pct}%. На рынок не выйдет.` };
  };
  // 14.7.38: массовая квалификация — стандартное закрепление прав (без квоты) сразу по всем ОСА клуба,
  // чтобы не кликать по каждому игроку отдельно; после этого права на любого можно снять вручную (rfaRelease)
  // или — для молодых — заменить на квоту (rfaQualifyJunior) по отдельности.
  proto.rfaQualifyAll = function (teamId) {
    teamId = teamId || this.state.teamId;
    const Y = this.seasonEndYear();
    const list = this.teamPlayers(teamId).filter(p => !p.nextSalary && Number(p.contractUntil) < Y);
    let done = 0;
    list.forEach(p => {
      const st = this.faStatus(p);
      if ((st !== 'RFA' && st !== 'RFA-junior') || this.rfaOf(p.id)) return;
      if (this.rfaQualify(p.id, teamId).ok) done++;
    });
    this.persistQuietly && this.persistQuietly();
    const plural = (n, a, b, c) => { const m = Math.abs(n) % 100, d = m % 10; return m > 10 && m < 20 ? c : d === 1 ? a : d >= 2 && d <= 4 ? b : c; };
    return { ok: true, text: done ? `Права закреплены на ${done} ${plural(done, 'игрока', 'игроков', 'игроков')}.` : 'Квалифицировать уже некого.' };
  };
  // добровольный отказ от прав: игрок свободен без компенсации — чтобы права не висели вечным балластом
  proto.rfaRelease = function (pid) {
    const r = this.rfaRightsMap(), rec = r && r[pid]; if (!rec) return { ok: false, text: 'Прав на этого игрока нет.' };
    if (rec.teamId !== this.state.teamId) return { ok: false, text: 'Права принадлежат другому клубу.' };
    delete r[pid];
    const p = this.marketPlayer(pid);
    this.marketLog(`{t:${rec.teamId}}: отказ от прав ОСА на {p:${pid}} — свободен без компенсации`, rec.teamId === this.state.teamId ? 'mine' : 'ai');
    this.persistQuietly && this.persistQuietly();
    return { ok: true, text: p ? `${p.name} теперь свободен без компенсации.` : 'Права сняты.' };
  };
  // ИИ: вероятность квалифицировать вместо прямого увольнения (чем сильнее игрок, тем выше шанс)
  proto.rfaAiQualify = function (p, teamId) {
    const st = this.faStatus(p); if (st !== 'RFA' && st !== 'RFA-junior') return false;
    const chance = clamp((Number(p.ovr) || 70) - 55, 15, 90) / 100;
    if (Math.random() < chance) { this.rfaQualify(p.id, teamId); return true; }
    return false;
  };

  /* ------------------------------------------------------------------ компенсация за офер-шит */
  // младше — дороже: защищает клуб, вырастивший молодую звезду; «поздно созревших» ветеранов воровать дешевле
  proto.offerSheetCompensation = function (offer, p) {
    const age = Math.floor(this.ageYears(p)), k = kAge(age);
    return Math.round((offer.salary || 0) * (offer.years || 1) * k / 100000) * 100000;
  };

  /* ------------------------------------------------------------------ обычным предложением чужого ОСА не подписать */
  const _dc = proto.dealCheck;
  proto.dealCheck = function (p, teamId, deal, kind) {
    if (kind === 'fa') {
      const rec = this.rfaOf(p.id);
      if (rec && rec.teamId !== teamId) return `${p.name} — ОСА клуба «${(this.teamById(rec.teamId) || {}).name || ''}»: обычным предложением не подписать, нужен офер-шит.`;
    }
    return _dc.apply(this, arguments);
  };

  /* ------------------------------------------------------------------ офер-шиты: отправка, мэтч, исход */
  proto.offerSheetsList = function () { const m = this.mk(); return m ? (m.offerSheets || (m.offerSheets = [])) : []; };
  proto.offerSheetsOpen = function () { return this.offerSheetsList().filter(x => x.status === 'pending'); };
  proto.offerSheetFor = function (pid) { return this.offerSheetsOpen().find(x => x.pid === pid) || null; };

  // teamId присылает офер-шит игроку pid, чьи права закреплены за другим клубом
  proto.offerSheetSend = function (pid, teamId, offer) {
    const p = this.marketPlayer(pid), rec = this.rfaOf(pid);
    if (!p || !rec) return { ok: false, text: 'Для этого игрока офер-шит недоступен.' };
    if (rec.teamId === teamId) return { ok: false, text: 'Права на этого игрока уже у вас.' };
    if (this.offerSheetFor(pid)) return { ok: false, text: 'На этого игрока уже действует офер-шит.' };
    const w = this.marketWindow(); if (!w.open) return { ok: false, text: w.reason };
    const comp = this.offerSheetCompensation(offer, p);
    // платёжеспособность проверяем сразу: ведомость + зарплата + будущая компенсация должны укладываться в потолок
    const block = this.capBlock(teamId, (offer.salary || 0) + comp, pid);
    if (block) return { ok: false, text: `Не хватает места под потолком на зарплату и компенсацию (≈${(comp / 1e6).toFixed(1)} млн): ${block}` };
    const ev = this.evaluateOffer(p, teamId, { ...offer, kind: 'fa' });
    if (ev.verdict !== 'accept') return { ok: false, text: `${p.name} не заинтересован в этих условиях.` };
    const m = this.mk(), day = Number(this.state.dayIndex || 0);
    const os = {
      id: 'os' + (m.seq++), pid, fromTeam: teamId, oldTeam: rec.teamId,
      offer: { salary: offer.salary, years: offer.years || 1, type: offer.type || '2-way', promises: (offer.promises || []).filter(Boolean) },
      comp, day, matchUntil: day + 7, status: 'pending', seen: teamId === this.state.teamId
    };
    this.offerSheetsList().push(os);
    this.marketLog(`{t:${teamId}}: офер-шит {p:${pid}} — ${(offer.salary / 1e6).toFixed(1).replace('.', ',')} млн на ${offer.years || 1} г. У {t:${rec.teamId}} 7 дней на мэтч`, teamId === this.state.teamId || rec.teamId === this.state.teamId ? 'mine' : 'ai');
    if (rec.teamId === this.state.teamId) { try { this.marketNews('Офер-шит на вашего ОСА', `${p.name} получил офер-шит от другого клуба. 7 дней, чтобы повторить условия и сохранить игрока.`, [this.state.teamId], 'Трансфер'); } catch (e) { } }
    this.persistQuietly && this.persistQuietly();
    return { ok: true, text: `Офер-шит отправлен. Если клуб не отстоит игрока за 7 дней, контракт вступит в силу.` };
  };
  // старый клуб повторяет условия точь-в-точь — та же проверка потолка, что и при обычном подписании
  proto.offerSheetMatch = function (osId) {
    const os = this.offerSheetsList().find(x => x.id === osId && x.status === 'pending');
    if (!os) return { ok: false, text: 'Офер-шит не найден или уже закрыт.' };
    const p = this.marketPlayer(os.pid); if (!p) return { ok: false, text: 'Игрок не найден.' };
    const block = this.capBlock(os.oldTeam, os.offer.salary, os.pid);
    if (block) { this.offerSheetResolveLost(os); return { ok: false, text: `Не хватает места под потолком, чтобы отстоять игрока: ${block}` }; }
    this.marketComplete(p, os.oldTeam, { ...os.offer, kind: 'fa' }, 'fa');
    os.status = 'matched';
    delete this.rfaRightsMap()[os.pid];
    this.marketLog(`{t:${os.oldTeam}} отстоял права на {p:${os.pid}}, повторив условия офер-шита`, os.oldTeam === this.state.teamId ? 'mine' : 'ai');
    this.persistQuietly && this.persistQuietly();
    return { ok: true, text: `${p.name} остаётся: условия повторены.` };
  };
  // уход по офер-шиту: новый клуб подписывает, старый получает компенсацию (в потолок нового клуба)
  proto.offerSheetResolveLost = function (os) {
    const p = this.marketPlayer(os.pid);
    if (p) { this.marketComplete(p, os.fromTeam, { ...os.offer, kind: 'fa' }, 'fa'); this.marketChargeCap(os.fromTeam, os.comp); }
    delete this.rfaRightsMap()[os.pid];
    os.status = 'lost';
    this.marketLog(`{p:${os.pid}} уходит в {t:${os.fromTeam}} по офер-шиту: {t:${os.oldTeam}} получает компенсацию ${(os.comp / 1e6).toFixed(1).replace('.', ',')} млн`, os.fromTeam === this.state.teamId || os.oldTeam === this.state.teamId ? 'mine' : 'ai');
  };
  proto.offerSheetDecline = function (osId) {
    const os = this.offerSheetsList().find(x => x.id === osId && x.status === 'pending'); if (!os) return;
    this.offerSheetResolveLost(os);
    this.persistQuietly && this.persistQuietly();
  };
  // не ответили за 7 дней — по правилам тоже уход
  proto.offerSheetsDayTick = function () {
    const day = Number(this.state.dayIndex || 0);
    this.offerSheetsOpen().filter(os => day >= os.matchUntil).forEach(os => this.offerSheetResolveLost(os));
  };
  // ежедневный тик рынка: обработка офер-шитов + редкие попытки ИИ переманить чужого ОСА
  const _mt = proto.marketTick;
  proto.marketTick = function (days) {
    const r = _mt.apply(this, arguments);
    try { this.offerSheetsDayTick(); this.rfaAiOfferSheetDay(); } catch (e) { console.warn('KHL Manager 14.7.32 офер-шиты:', e); }
    return r;
  };

  /* ------------------------------------------------------------------ ИИ: охота на чужих ОСА (фильтр по ценности) */
  proto.rfaAiOfferSheetDay = function () {
    const m = this.mk(); if (!m || !this.marketWindow().open) return;
    const rights = this.rfaRightsMap(); const pids = Object.keys(rights);
    if (!pids.length || Math.random() > 0.08) return;     // редкая проверка — чтобы ИИ не стрелял в каждого ОСА подряд
    const pid = pids[Math.floor(Math.random() * pids.length)], rec = rights[pid];
    if (this.offerSheetFor(pid)) return;
    const p = this.marketPlayer(pid); if (!p || p.teamId !== FA) return;
    const g = grp(p.pos), teams = this.league('KHL').teams().filter(t => t.id !== rec.teamId).sort(() => Math.random() - 0.5);
    for (const t of teams) {
      const pw = this.marketPower().rows[t.id]; if (!pw) continue;
      if (this.permanentOVR(p) - (pw[g] || 60) < 4) continue;      // валуе-гэп: только реальное усиление позиции
      const years = Math.min(this.wantYears(p), 3), type = this.ageYears(p) <= 20 ? '3-way' : '2-way';
      const r = this.offerSheetSend(pid, t.id, { salary: this.askSalary(p), years, type, promises: [] });
      if (r.ok) return;
    }
  };

  /* ------------------------------------------------------------------ ИИ: квалификация вместо прямого увольнения */
  // перехватываем решение «не продлеваю» в trAiResign: шанс квалифицировать ОСА вместо чистого увольнения
  proto.rfaAiMaybeQualifyOnRelease = function (p, teamId) { return this.rfaAiQualify(p, teamId); };
})();

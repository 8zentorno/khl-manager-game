/* KHL Manager 15.0.0 — движение игроков КХЛ ↔ ВХЛ.
 * Правила (утверждены игроком):
 *  - лимит одновременных командировок: не больше 6 игроков 22+ в фарме; игроки 21 и младше
 *    с дву-/трёхсторонним контрактом лимит не занимают;
 *  - дедлайн по регламенту ВХЛ: до 21 года (2/3-сторонний) — свободно весь сезон; 22+ при >50%
 *    матчей сезона в ВХЛ — свободно; остальные — вниз только до старта плей-офф КХЛ;
 *  - легионеры: командировать можно, пока в фарм-клубе меньше 3 легионеров (вариант Б);
 *    в МХЛ легионеров нет вовсе;
 *  - «дорога»: игравший сегодня за фарм игрок при возврате получает усталость (директива
 *    «транспорт» смягчает штраф вдвое);
 *  - подтягивание воспитанников своего фарма: новый контракт (2/3-сторонний), игрок появляется
 *    в заявке КХЛ; хранится в state.vhl.callups и восстанавливается при загрузке сохранения.
 * ИИ-клубы держат молодёжь в своих фармах и реагируют на травмы (state.vhl.aiFarm).
 */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;
  const ADULT_LIMIT = 6, FOREIGN_QUOTA = 3;
  // 15.13.0: квота командированных взрослых (22+) зависит от отношения с основным фарм-клубом —
  // 'farm' (материнский клуб управляет составом фарма целиком) без квоты вообще, 'partner' (свой
  // менеджмент) — общая квота 10 (вместо прежних 6), null (нет фарма) — старое поведение ADULT_LIMIT.
  const PARTNER_ADULT_LIMIT = 10;
  proto.vhlAdultLoanLimit = function (teamId) {
    const target = this.vhlPrimaryFarm(teamId);
    if (!target) return ADULT_LIMIT;
    const rel = this.vhlRelationOf(target.id);
    if (rel === 'farm') return Infinity;
    return PARTNER_ADULT_LIMIT; // rel === 'partner' (сейчас всегда, пока список farm пуст)
  };

  proto.vhlPrimaryFarm = function (teamId) {
    const farms = this.vhlFarmsOf(teamId);
    if (!farms.length) return null;
    const v = this.vhlState();
    if (teamId === this.state.teamId && v && v.primaryFarm && farms.some(f => f.id === v.primaryFarm)) return this.vhlTeamById(v.primaryFarm);
    return farms[0];
  };
  proto.vhlSetPrimaryFarm = function (clubId) {
    const v = this.vhlState(); if (!v) return;
    if (this.vhlFarmsOf(this.state.teamId).some(f => f.id === clubId)) { v.primaryFarm = clubId; this.persistQuietly(); this.renderFinances && this.renderFinances(); }
  };
  proto.vhlForeignCount = function (clubId) {
    return this.vhlLoanEntries(clubId).filter(x => x.p.foreign).length; // воспитанники ВХЛ в базе без флага легионера
  };
  proto.vhlAdultLoanCount = function (teamId) {
    if (!this.state || !this.state.farm) return 0;
    let n = 0;
    for (const pid of Object.keys(this.state.farm)) {
      const p = this.league('KHL').players().find(x => x.id === pid);
      if (p && p.teamId === teamId && this.vhlPlayerAge(p) >= 22) n++;
    }
    return n;
  };
  // null = можно, строка = причина запрета
  proto.vhlSendCheck = function (p, teamId) {
    const farms = this.vhlFarmsOf(teamId);
    const league = this.farmLeague(p);
    if (league === 'МХЛ') {
      if (p.foreign) return 'В МХЛ легионеры не выступают — командировка невозможна.';
      return null; // МХЛ пока не симулируется, прежние правила
    }
    if (!farms.length) return null; // у клуба нет фарма в ВХЛ — прежнее абстрактное поведение
    const age = this.vhlPlayerAge(p);
    const youngFree = age <= 21 && p.contract !== '1-way';
    if (!youngFree) {
      const limit = this.vhlAdultLoanLimit(teamId);
      if (this.vhlAdultLoanCount(teamId) >= limit) return `Лимит командировок: в фарме уже ${limit} игроков 22 лет и старше. Игроки до 21 года с двусторонним контрактом лимит не занимают.`;
      const poStarted = !!(this.state.playoff && this.state.playoff.started);
      if (poStarted && age >= 22) {
        const games = this.vhlGamesOf(p.id);
        const target = this.vhlPrimaryFarm(teamId);
        const clubGp = target ? (this.vhlStandings().find(r => r.id === target.id) || {}).gp || 0 : 0;
        if (!(games > clubGp / 2)) return 'Дедлайн: после старта плей-офф КХЛ вниз могут уехать только игроки до 21 года и те, кто провёл больше половины матчей сезона в ВХЛ.';
      }
    }
    if (p.foreign) {
      const target = this.vhlPrimaryFarm(teamId);
      if (target && this.vhlForeignCount(target.id) >= FOREIGN_QUOTA) return `В «${target.name}» уже ${FOREIGN_QUOTA} легионера — квота ВХЛ исчерпана.`;
    }
    return null;
  };

  const baseSend = proto.sendToFarm;
  proto.sendToFarm = function (playerId) {
    if (!this.state) return;
    const p = this.league('KHL').players().find(x => x.id === playerId);
    if (p && p.teamId === this.state.teamId && !this.isInFarm(p)) {
      const block = this.vhlSendCheck(p, this.state.teamId);
      if (block) { this.setNotice(block); return; }
    }
    baseSend.apply(this, arguments);
    const entry = this.state.farm && this.state.farm[playerId];
    if (entry && entry.league === 'ВХЛ' && !entry.clubId) {
      const target = this.vhlPrimaryFarm(this.state.teamId);
      if (target) {
        entry.clubId = target.id; this.setNotice(`${p.name} командирован в «${target.name}» (ВХЛ).`); this.persistQuietly();
        // 15.14.1: фиксируем «точку отсчёта» — текущие суммарные показатели игрока в ВХЛ на момент
        // командировки, чтобы при возврате посчитать именно статистику ЭТОЙ командировки (а не всего сезона).
        const v = this.vhlState();
        if (v) {
          entry.vLoanBase = (v.ps[playerId] || [0, 0, 0]).slice(); entry.vLoanBaseG = (v.gs[playerId] || [0, 0]).slice();
          // 15.14.3: та же точка отсчёта, но для плей-офф фарм-клуба — иначе игры, сыгранные в ВХЛ
          // в плей-офф во время командировки, не отделяются от регулярки на карточке игрока.
          entry.vLoanBasePo = (v.pops[playerId] || [0, 0, 0]).slice(); entry.vLoanBaseGPo = (v.pogs[playerId] || [0, 0, 0, 0, 0]).slice();
        }
      }
    }
  };

  // 15.14.1: показатели текущей командировки в ВХЛ (пока игрок ещё не отозван) — разница между текущими
  // суммарными v.ps/v.gs и «точкой отсчёта», зафиксированной в момент отправки. Используется карточкой
  // игрока, чтобы показать строку по фарм-клубу отдельно от строки по основному клубу КХЛ.
  proto.vhlCurrentLoanStint = function (p) {
    if (!p || !this.state) return null;
    const v = this.vhlState(); if (!v) return null;
    // 15.14.6: раньше смотрели только в this.state.farm — туда попадают командировки игрока ОСНОВНОГО
    // клуба пользователя; командировки ИИ-клубов живут отдельно, в v.aiFarm (vhlAiDaily), и эта функция
    // их не видела вовсе — строка «‹фарм-клуб› · ВХЛ» никогда не появлялась на карточке такого игрока,
    // хотя он реально играл в ВХЛ и набирал статистику (v.ps/v.gs).
    const entry = (this.state.farm && this.state.farm[p.id]) || v.aiFarm[p.id];
    if (!entry || !entry.clubId) return null;
    const base = entry.vLoanBase || [0, 0, 0], cur = v.ps[p.id] || [0, 0, 0];
    const baseG = entry.vLoanBaseG || [0, 0], curG = v.gs[p.id] || [0, 0];
    const gp = Math.max(0, cur[0] - base[0]), g = Math.max(0, cur[1] - base[1]), a = Math.max(0, cur[2] - base[2]);
    const ggp = Math.max(0, curG[0] - baseG[0]), gw = Math.max(0, curG[1] - baseG[1]);
    // 15.14.3: отдельно считаем плей-офф фарм-клуба за время командировки (v.pops/v.pogs) — раньше
    // учитывалась только регулярка, и игры в плей-офф ВХЛ во время командировки никак не отражались.
    const basePo = entry.vLoanBasePo || [0, 0, 0], curPo = v.pops[p.id] || [0, 0, 0];
    const baseGPo = entry.vLoanBaseGPo || [0, 0, 0, 0, 0], curGPo = v.pogs[p.id] || [0, 0, 0, 0, 0];
    const poGp = Math.max(0, curPo[0] - basePo[0]), poG = Math.max(0, curPo[1] - basePo[1]), poA = Math.max(0, curPo[2] - basePo[2]);
    const poGgp = Math.max(0, curGPo[0] - baseGPo[0]), poGw = Math.max(0, curGPo[1] - baseGPo[1]);
    return { clubId: entry.clubId, gp: gp + ggp, g, a, pts: g + a, w: gw, poGp: poGp + poGgp, poG, poA, poPts: poG + poA, poW: poGw };
  };

  const baseRecall = proto.recallFromFarm;
  proto.recallFromFarm = function (playerId) {
    const v = this.vhlState();
    const today = this.state ? this.state.dayIndex || 0 : 0;
    const playedToday = v && v.lastGame[playerId] === today;
    // 15.14.1: перед тем как запись о командировке удалится (см. baseRecall), сохраняем сыгранный
    // отрезок статистики ВХЛ отдельной строкой в p.vhlSeasonStints — иначе матчи/очки за фарм-клуб
    // бесследно пропадают из карьеры игрока после возврата в основную команду.
    {
      const p = this.league('KHL').players().find(x => x.id === playerId);
      const stint = p ? this.vhlCurrentLoanStint(p) : null;
      if (p && stint) {
        if (!Array.isArray(p.vhlSeasonStints)) p.vhlSeasonStints = [];
        if (stint.gp > 0) p.vhlSeasonStints.push({ clubId: stint.clubId, gp: stint.gp, g: stint.g, a: stint.a, pts: stint.pts, w: stint.w });
        // 15.14.3: плей-офф фарм-клуба за ту же командировку архивируется отдельной строкой (po:true),
        // чтобы при возврате в КХЛ она не слилась с регуляркой и не потерялась.
        if (stint.poGp > 0) p.vhlSeasonStints.push({ clubId: stint.clubId, gp: stint.poGp, g: stint.poG, a: stint.poA, pts: stint.poPts, w: stint.poW, po: true });
      }
    }
    baseRecall.apply(this, arguments);
    if (playedToday) {
      const p = this.league('KHL').players().find(x => x.id === playerId);
      const d = p && this.playerDev ? this.playerDev(p) : null;
      if (d) {
        const soft = v.directive === 'transport' ? 0.5 : 1;
        d.fatigue = this.clamp(d.fatigue + 18 * soft, 0, 100);
        this.setNotice(`${p.name} возвращён в основу. Сегодня он уже играл за фарм — скажется дорога (усталость +${Math.round(18 * soft)}).`);
      }
    }
    if (v) delete v.lastGame[playerId];
  };

  /* ---------- подтягивание воспитанников ---------- */
  proto.vhlCallUpProspect = function (vhlId) {
    if (!this.state || !this.vhlAvailable()) return;
    const v = this.vhlState();
    const vp = VHL_DATABASE.players.find(x => x.id === vhlId);
    if (!vp || v.out.includes(vhlId)) return;
    const farms = this.vhlFarmsOf(this.state.teamId);
    const curClubId = this.vhlEffectiveClubId(vp);
    if (!farms.some(f => f.id === curClubId)) { this.setNotice('Подтянуть можно только воспитанника собственного фарм-клуба.'); return; }
    const age = this.vhlPlayerAge(vp);
    const contract = age <= 20 ? '3-way' : '2-way';
    const ovr = this.vhlPlayerOvr(vp);
    const salary = Math.max(this.CONTRACT_RULES.minWage, Math.round(Math.max(2, (ovr - 48) * 0.4)) * 1e6);
    const seasonYear = 2026 + Math.max(0, (this.state.seasonNumber || 1) - 1);
    const clubName = this.vhlTeamById(curClubId)?.name;
    const ok = confirm(`${vp.name} (${age} лет, рейтинг ~${ovr}) — воспитанник «${clubName}».\nПодписать ${contract === '3-way' ? 'трёхсторонний' : 'двусторонний'} контракт до ${seasonYear + 2} года, ${(salary / 1e6).toFixed(1)} млн ₽, и поднять в основу?`);
    if (!ok) return;
    const posMap = ['LW', 'C', 'RW'];
    const pos = vp.pos === 'F' ? posMap[this.makeStableHash(vp.id) % 3] : vp.pos;
    const np = { id: 'cu_' + vhlId, teamId: this.state.teamId, name: vp.name, pos, line: pos === 'G' ? 5 : 5, salary, contract, foreign: false, birthDate: vp.birthDate, number: vp.number || null, height: vp.height || null, weight: vp.weight || null, grip: vp.grip || null, contractUntil: seasonYear + 2, contractEstimated: true, salaryEstimated: true, ovr, fromVhl: curClubId };
    this.league('KHL').players().push(np);
    if (this.marketOwn) this.marketOwn(np); // рынок пересобирает db.players — регистрируем, чтобы игрок переживал пересборку и загрузку
    v.callups.push({ ...np });
    v.out.push(vhlId);
    if (!this.state.playerStats[np.id]) this.state.playerStats[np.id] = { gp: 0, g: 0, a: 0, pts: 0, shots: 0, plusMinus: 0, goalieGP: 0, goalieW: 0, goalieShots: 0, goalieSaves: 0, goalieGA: 0, shutouts: 0 };
    this.state.lineAssignments[np.id] = np.pos === 'G' ? 5 : 5;
    this.playerDev(np); // создаёт навыки и потенциал
    if (this.playerGiveNumber) { try { this.playerGiveNumber(np); } catch (e) { } }
    const today = this.state.dayIndex || 0;
    if (v.lastGame['v-own-' + vhlId] === today) { const d = this.playerDev(np); if (d) d.fatigue = this.clamp(d.fatigue + 12, 0, 100); }
    if (this.publishNews) this.publishNews({ key: `vhl-callup:${vhlId}`, category: 'club', icon: '⬆️', teamIds: [this.state.teamId], headline: `${np.name} подтянут из фарма`, body: `${np.name} (${age} лет) подписал ${contract === '3-way' ? 'трёхсторонний' : 'двусторонний'} контракт и переведён в основную команду из «${clubName}».` });
    this.setNotice(`${np.name} подтянут из «${clubName}». Поставь его в заявку во вкладке «Состав».`);
    this.persistQuietly(); this.renderAll();
  };
  // вернуть подтянутого воспитанника обратно в фарм можно обычной кнопкой «В ВХЛ» (контракт двусторонний)

  /* ---------- компенсационное подписание воспитанника самостоятельного клуба ВХЛ (15.8.0) ----------
   * В отличие от vhlCallUpProspect (бесплатно, только свой фарм), здесь: клуб без фарм-привязки
   * (parentId == null), любой момент сезона («signable year-round»), молодой воспитанник (<=23 лет),
   * разовая компенсация клубу, который его вырастил — через тот же механизм, что и компенсации при
   * расторжении контракта (marketChargeCap): в потолок текущего сезона, либо следующего, если фонд уже
   * выше потолка. Обмены между фарм-клубами разных КХЛ-организаций и трансферы внутри самой ВХЛ —
   * сюда не входят, это отдельная нереализованная задача (см. vClubTransfersHtml). */
  proto.vhlIndependentSignFee = function (vp) {
    const ovr = this.vhlPlayerOvr(vp), age = this.vhlPlayerAge(vp);
    const base = Math.max(3, (ovr - 50) * 0.6);
    const youthMult = age <= 19 ? 1.5 : age <= 21 ? 1.25 : age <= 23 ? 1 : 0.7;
    return Math.round(base * youthMult) * 1e6;
  };
  // 15.9.0: та же функция подписывает и свободных агентов ВХЛ (vhlIsFree) — без ограничения по клубу/возрасту
  // и без компенсации, никто не держит их прав; для контрактного игрока правила не изменились.
  proto.vhlSignIndependentProspect = function (vhlId) {
    if (!this.state || !this.vhlAvailable()) return;
    const v = this.vhlState();
    const vp = VHL_DATABASE.players.find(x => x.id === vhlId);
    if (!vp || v.out.includes(vhlId)) { this.setNotice('Этот игрок уже недоступен.'); return; }
    const isFree = this.vhlIsFree(vp);
    let club = null, fee = 0;
    if (isFree) {
      // свободный агент внутри ВХЛ — ни один клуб не держит его прав, компенсация не нужна
    } else {
      club = this.vhlTeamById(this.vhlEffectiveClubId(vp));
      if (!club || club.parentId) { this.setNotice('Подписать за компенсацию можно только воспитанника самостоятельного клуба ВХЛ (без фарм-привязки к клубу КХЛ) — воспитанников чужого фарма подтягивает только клуб-владелец.'); return; }
      if (this.vhlPlayerAge(vp) > 23) { this.setNotice('Компенсационное подписание действует только для молодых воспитанников (до 23 лет).'); return; }
      fee = this.vhlIndependentSignFee(vp);
    }
    const age = this.vhlPlayerAge(vp), ovr = this.vhlPlayerOvr(vp);
    const contract = age <= 20 ? '3-way' : '2-way';
    const salary = Math.max(this.CONTRACT_RULES.minWage, Math.round(Math.max(2, (ovr - 48) * 0.4)) * 1e6);
    if (this.state && !this.state.market && this.marketInit) { this.marketInit(); if (this.marketApplyToDb) this.marketApplyToDb(); }
    const block = this.capBlock ? this.capBlock(this.state.teamId, salary) : null;
    if (block) { this.setNotice(block); return; }
    const seasonYear = 2026 + Math.max(0, (this.state.seasonNumber || 1) - 1);
    const ok = isFree
      ? confirm(`${vp.name} (${age} лет, рейтинг ~${ovr}) — свободный агент ВХЛ, его права сейчас ни у кого.\nПодписать ${contract === '3-way' ? 'трёхсторонний' : 'двусторонний'} контракт до ${seasonYear + 2} года, ${(salary / 1e6).toFixed(1)} млн ₽/год?`)
      : confirm(`${vp.name} (${age} лет, рейтинг ~${ovr}) — воспитанник самостоятельного клуба «${club.name}», не связан с вашей фарм-системой.\nПодписать можно только за разовую компенсацию клубу, который его вырастил: ${(fee / 1e6).toFixed(1)} млн ₽ (войдёт в потолок текущего сезона) + контракт ${contract === '3-way' ? 'трёхсторонний' : 'двусторонний'} до ${seasonYear + 2} года, ${(salary / 1e6).toFixed(1)} млн ₽/год.\nПодписать?`);
    if (!ok) return;
    const posMap = ['LW', 'C', 'RW'];
    const pos = vp.pos === 'F' ? posMap[this.makeStableHash(vp.id) % 3] : vp.pos;
    const np = { id: 'cu_' + vhlId, teamId: this.state.teamId, name: vp.name, pos, line: 5, salary, contract, foreign: false, birthDate: vp.birthDate, number: vp.number || null, height: vp.height || null, weight: vp.weight || null, grip: vp.grip || null, contractUntil: seasonYear + 2, contractEstimated: true, salaryEstimated: true, ovr, fromVhl: isFree ? null : this.vhlEffectiveClubId(vp), signedIndependent: !isFree, signedAsFreeAgent: isFree };
    this.league('KHL').players().push(np);
    if (this.marketOwn) this.marketOwn(np);
    v.callups.push({ ...np });
    v.out.push(vhlId);
    const overToNext = (!isFree && this.marketChargeCap) ? this.marketChargeCap(this.state.teamId, fee) : false;
    if (!this.state.playerStats[np.id]) this.state.playerStats[np.id] = { gp: 0, g: 0, a: 0, pts: 0, shots: 0, plusMinus: 0, goalieGP: 0, goalieW: 0, goalieShots: 0, goalieSaves: 0, goalieGA: 0, shutouts: 0 };
    this.state.lineAssignments[np.id] = 5;
    this.playerDev(np);
    if (this.playerGiveNumber) { try { this.playerGiveNumber(np); } catch (e) { } }
    if (isFree) {
      if (this.publishNews) this.publishNews({ key: `vhl-fa-sign:${vhlId}`, category: 'club', icon: '✍️', teamIds: [this.state.teamId], headline: `${np.name} подписан как свободный агент ВХЛ`, body: `${np.name} (${age} лет) подписал контракт — до этого был свободным агентом ВХЛ, ни один клуб не держал его прав.` });
      this.setNotice(`${np.name} подписан как свободный агент ВХЛ, без компенсации. Поставь его в заявку во вкладке «Состав».`);
    } else {
      if (this.publishNews) this.publishNews({ key: `vhl-indep-sign:${vhlId}`, category: 'club', icon: '🤝', teamIds: [this.state.teamId], headline: `${np.name} подписан за компенсацию`, body: `${np.name} (${age} лет) подписал контракт с клубом; «${club.name}» получил компенсацию ${(fee / 1e6).toFixed(1)} млн ₽ за воспитанника.` });
      this.setNotice(`${np.name} подписан из «${club.name}» за компенсацию ${(fee / 1e6).toFixed(1)} млн ₽${overToNext ? ' (войдёт в потолок следующего сезона — фонд уже выше потолка)' : ''}. Поставь его в заявку во вкладке «Состав».`);
    }
    this.persistQuietly(); this.renderAll();
  };

  proto.vhlToggleProtected = function (pid) {
    const v = this.vhlState(); if (!v) return;
    const i = v.protectedIds.indexOf(pid);
    if (i >= 0) v.protectedIds.splice(i, 1);
    else {
      if (v.protectedIds.length >= 3) { this.setNotice('Защищённых проспектов может быть не больше трёх.'); return; }
      v.protectedIds.push(pid);
    }
    this.persistQuietly(); this.renderFinances && this.renderFinances();
  };
  proto.vhlSetDirective = function (val) {
    const v = this.vhlState(); if (!v) return;
    if (!['develop', 'result', 'transport'].includes(val)) return;
    v.directive = val;
    this.persistQuietly();
    this.setNotice(`Директива фарму: ${({ develop: 'развитие — проспекты получают максимум игрового времени', result: 'результат — фарм идёт за Кубком Петрова', transport: 'транспорт — максимальная ротация с основой' })[val]}.`);
    this.renderFinances && this.renderFinances();
  };

  /* ---------- ИИ-клубы ---------- */
  proto.vhlAiDaily = function (day) {
    const v = this.vhlState(); if (!v) return;
    if (day % 2) return;
    for (const t of this.league('KHL').teams()) {
      if (t.id === this.state.teamId) continue;
      const farms = this.vhlFarmsOf(t.id);
      if (!farms.length) continue;
      const farmId = farms[0].id;
      const loans = Object.entries(v.aiFarm).filter(([pid, e]) => e && e.teamId === t.id);
      // травмы в основе — вернуть лучшего командированного
      const unavailable = this.teamPlayers(t.id).filter(p => this.isPlayerUnavailable(p)).length;
      if (unavailable >= 5 && loans.length) {
        const best = loans.map(([pid]) => this.league('KHL').players().find(p => p.id === pid)).filter(Boolean).sort((a, b) => (b.ovr || 0) - (a.ovr || 0))[0];
        // 15.14.6: архивируем отрезок статистики ВХЛ за эту командировку в p.vhlSeasonStints перед
        // удалением записи из v.aiFarm — иначе игры/очки, набранные ИИ-командированным игроком за
        // фарм-клуб, бесследно пропадали при отзыве (см. vhlCurrentLoanStint/recallFromFarm — тот же
        // механизм уже был у командировок из клуба пользователя, но не у ИИ-клубов).
        if (best) {
          const stint = this.vhlCurrentLoanStint(best);
          if (stint && stint.gp > 0) {
            if (!Array.isArray(best.vhlSeasonStints)) best.vhlSeasonStints = [];
            best.vhlSeasonStints.push({ clubId: stint.clubId, gp: stint.gp, g: stint.g, a: stint.a, pts: stint.pts, w: stint.w });
            if (stint.poGp > 0) best.vhlSeasonStints.push({ clubId: stint.clubId, gp: stint.poGp, g: stint.poG, a: stint.poA, pts: stint.poPts, w: stint.poW, po: true });
          }
          delete v.aiFarm[best.id]; continue;
        }
      }
      // держать в фарме 2-3 молодых из глубины состава
      const target = 2 + this.makeStableHash(t.id) % 2;
      if (loans.length >= target) continue;
      const cands = this.teamPlayers(t.id).filter(p =>
        p.contract !== '1-way' && !p.foreign && this.vhlPlayerAge(p) <= 21 &&
        !v.aiFarm[p.id] && !(this.state.farm && this.state.farm[p.id]) &&
        (Number(p.line) || 4) >= 4 && !(this.hasActiveInjury && this.hasActiveInjury(p))
      ).sort((a, b) => (a.ovr || 0) - (b.ovr || 0));
      // 15.14.6: та же «точка отсчёта» (vLoanBase/vLoanBasePo), что и у командировки из клуба пользователя
      // (sendToFarm) — без неё vhlCurrentLoanStint не видит командировку ИИ-клуба вовсе (ищет только
      // this.state.farm) и строка «‹фарм-клуб› · ВХЛ» никогда не появляется на карточке игрока.
      for (const p of cands.slice(0, target - loans.length)) {
        v.aiFarm[p.id] = {
          teamId: t.id, clubId: farmId, since: day,
          vLoanBase: (v.ps[p.id] || [0, 0, 0]).slice(), vLoanBaseG: (v.gs[p.id] || [0, 0]).slice(),
          vLoanBasePo: (v.pops[p.id] || [0, 0, 0]).slice(), vLoanBaseGPo: (v.pogs[p.id] || [0, 0, 0, 0, 0]).slice()
        };
      }
    }
  };
  const baseUnavailable = proto.isPlayerUnavailable;
  proto.isPlayerUnavailable = function (player) {
    if (player && this.state && this.state.vhl && this.state.vhl.aiFarm && this.state.vhl.aiFarm[player.id]) return true;
    return baseUnavailable.call(this, player);
  };

  /* ---------- сохранения: восстановление подтянутых и миграция старых фармов ---------- */
  proto.vhlInjectCallups = function () {
    if (!this.state || !this.state.vhl || !Array.isArray(this.state.vhl.callups)) return;
    for (const cp of this.state.vhl.callups) {
      const m = this.mk && this.mk();
      if (m && !m.players[cp.id]) m.players[cp.id] = { ...cp }; // через рынок: переживает marketApplyToDb
      if (!this.league('KHL').players().some(p => p.id === cp.id)) this.league('KHL').players().push({ ...cp });
    }
  };
  const baseRepair = proto.repairSave;
  proto.repairSave = function () {
    this.vhlInjectCallups();
    baseRepair.apply(this, arguments);
    this.vhlInjectCallups(); // повторно: marketApplyToDb внутри базовой цепочки пересобирает db.players
    try {
      if (!this.state) return;
      const v = this.vhlState();
      // миграция сохранений 14.x: фарм без клуба -> основной фарм-клуб
      if (this.state.farm && v) {
        const target = this.vhlPrimaryFarm(this.state.teamId);
        Object.values(this.state.farm).forEach(e => { if (e && e.league === 'ВХЛ' && !e.clubId && target) e.clubId = target.id; });
      }
      // чистка: aiFarm от исчезнувших игроков
      if (v) Object.keys(v.aiFarm).forEach(pid => { if (!this.league('KHL').players().some(p => p.id === pid)) delete v.aiFarm[pid]; });
    } catch (e) { console.error('[vhl] migrate', e); }
  };
})();

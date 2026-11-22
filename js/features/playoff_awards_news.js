/* KHL Manager 14.7.21 — новости по итогам Кубка Гагарина (по аналогии с сезонными наградами
   14.7.19, но на данных плей-офф): публикуются один раз, сразу как только разыгран финал
   (state.playoff.completed впервые становится true — тот самый момент, когда это уже
   фиксирует proto.publishPlayoffNews/recordPlayoffResult). Три новости:
     1) итоги Кубка Гагарина — чемпион, финалист, счёт финальной серии, конференция чемпиона;
     2) лучший тренер плей-офф — тренер команды-чемпиона;
     3) лучшие игроки плей-офф — бомбардир/снайпер(по голам)/ассистент/защитник/вратарь,
        но по статистике именно Кубка Гагарина (state.playoff.playerStats — та же база,
        что уже питает вкладку «Статистика → Кубок Гагарина» в stats_ui.js).
   Ссылки на клубы/игроков/тренера в тексте — тем же авто-линковщиком (v143.js/v152.js),
   новый код для этого не нужен. */
(function () {
  const proto = KHLManagerApp.prototype;

  // мини-порог игр для вратаря плей-офф: goalieQualifyGames() собственного Кубка Гагарина
  // не существует и привязка к регулярке (~60 игр) отсеяла бы всех — считаем свой порог
  // от максимального числа игр вратаря именно в этом розыгрыше Кубка.
  function playoffGoalieQualify(app) {
    const vals = Object.values((app.state && app.state.playoff && app.state.playoff.playerStats) || {});
    const maxGP = vals.reduce((m, x) => Math.max(m, Number(x.goalieGP) || 0), 0);
    return Math.max(1, Math.ceil(maxGP * .3));
  }

  // лидеры именно плей-офф — те же сортировки, что и в сезонных наградах/вкладке «Статистика»,
  // но источник данных — state.playoff.playerStats, а не state.playerStats.
  function playoffLeaders(app) {
    const Q = (app.state && app.state.playoff && app.state.playoff.playerStats) || {};
    const byName = (x, y) => x.p.name.localeCompare(y.p.name, 'ru');
    const skaters = app.db.players.filter(p => p.pos !== 'G').map(p => {
      const r = Q[p.id] || {};
      return { p, g: Number(r.g) || 0, a: Number(r.a) || 0, pts: Number(r.pts) || 0, gp: Number(r.gp) || 0 };
    }).filter(x => x.gp > 0);
    const scorer = [...skaters].sort((x, y) => y.pts - x.pts || y.g - x.g || y.a - x.a || byName(x, y))[0];
    const sniper = [...skaters].sort((x, y) => y.g - x.g || y.pts - x.pts || byName(x, y))[0];
    const assist = [...skaters].sort((x, y) => y.a - x.a || y.pts - x.pts || byName(x, y))[0];
    const defender = skaters.filter(x => x.p.pos === 'D')
      .sort((x, y) => y.pts - x.pts || y.g - x.g || y.a - x.a || byName(x, y))[0];
    const minG = playoffGoalieQualify(app);
    const goalie = app.db.players.filter(p => p.pos === 'G').map(p => {
      const r = Q[p.id] || {};
      const gGP = Number(r.goalieGP) || 0, saves = Number(r.goalieSaves) || 0, shots = Number(r.goalieShots) || 0;
      return { p, gGP, sv: saves / Math.max(1, shots) };
    }).filter(x => x.gGP >= minG && x.gGP > 0).sort((x, y) => y.sv - x.sv || y.gGP - x.gGP || byName(x, y))[0];
    return { scorer, sniper, assist, defender, goalie };
  }

  const ptsWord = (app, n) => n + ' ' + app.plu(n, ['очко', 'очка', 'очков']);
  const goalsWord = (app, n) => n + ' ' + app.plu(n, ['гол', 'гола', 'голов']);
  const gamesWord = (app, n) => n + ' ' + app.plu(n, ['игра', 'игры', 'игр']);
  const assistsWord = (app, n) => n + ' ' + app.plu(n, ['передача', 'передачи', 'передач']);

  proto.publishPlayoffAwardsNews = function (date) {
    const st = this.state, po = st && st.playoff; if (!po || !po.completed || !po.championId) return;
    const champ = this.teamById(po.championId); if (!champ) return;
    const finalSeries = (this.__poAllSeries723 ? this.__poAllSeries723(4) : []).find(s => s.complete);
    const loserId = finalSeries ? (finalSeries.winnerId === finalSeries.teamA ? finalSeries.teamB : finalSeries.teamA) : null;
    const finalist = loserId ? this.teamById(loserId) : null;
    const wl = finalSeries ? Math.max(finalSeries.winsA || 0, finalSeries.winsB || 0) : null;
    const wt = finalSeries ? Math.min(finalSeries.winsA || 0, finalSeries.winsB || 0) : null;
    const confText = champ.conf === 'West' ? 'Западной конференции' : 'Восточной конференции';

    this.publishNews({
      key: `po-champion:${po.championId}:awards`, category: 'playoff', icon: '🏆', tag: 'Плей-офф', scope: 'league',
      headline: `${champ.name} — обладатель Кубка Гагарина`,
      body: [
        'Кубок Гагарина разыгран.',
        finalist && wl != null ? `${champ.name} ${this.tv(champ, 'обыграл')} в финале ${this.tn(finalist, 'acc')} со счётом ${wl}:${wt} и ${this.tv(champ, 'становится')} чемпионом сезона ${this.seasonLabel()}.`
          : `${champ.name} ${this.tv(champ, 'становится')} чемпионом сезона ${this.seasonLabel()}.`,
        `Чемпион вышел из ${confText}.`
      ].join('\n'),
      dateOffset: date, teamIds: [champ.id].concat(finalist ? [finalist.id] : [])
    });

    const coach = String(champ.coach || '').replace(/\s*\(и\.о\.\)/, '').trim();
    if (coach) {
      this.publishNews({
        key: `po-coach:${po.championId}`, category: 'award', icon: '🧑‍💼', tag: 'Награды', scope: 'league',
        headline: 'Лучший тренер плей-офф',
        body: `Лучший тренер плей-офф — ${coach}, ${champ.name}.`,
        dateOffset: date, teamIds: [champ.id]
      });
    }

    const L = playoffLeaders(this);
    const teamName = p => (this.teamById(p.teamId) || {}).name || '—';
    const lines = [];
    if (L.scorer) lines.push(`Лучший бомбардир плей-офф — ${L.scorer.p.name}, ${teamName(L.scorer.p)} (${ptsWord(this, L.scorer.pts)}: ${L.scorer.g}+${L.scorer.a}).`);
    if (L.sniper) lines.push(`Лучший снайпер плей-офф — ${L.sniper.p.name}, ${teamName(L.sniper.p)} (${goalsWord(this, L.sniper.g)}).`);
    if (L.assist) lines.push(`Лучший ассистент плей-офф — ${L.assist.p.name}, ${teamName(L.assist.p)} (${assistsWord(this, L.assist.a)}).`);
    if (L.defender) lines.push(`Лучший защитник плей-офф — ${L.defender.p.name}, ${teamName(L.defender.p)} (${ptsWord(this, L.defender.pts)}: ${L.defender.g}+${L.defender.a}).`);
    if (L.goalie) lines.push(`Лучший вратарь плей-офф — ${L.goalie.p.name}, ${teamName(L.goalie.p)} (${(L.goalie.sv * 100).toFixed(1).replace('.', ',')}% отраж. бросков, ${gamesWord(this, L.goalie.gGP)}).`);
    if (lines.length) {
      const teamIds = [...new Set([L.scorer, L.sniper, L.assist, L.defender, L.goalie].filter(Boolean).map(x => x.p.teamId))];
      this.publishNews({
        key: `po-players:${po.championId}`, category: 'award', icon: '📰', tag: 'Награды', scope: 'league',
        headline: 'Лучшие игроки плей-офф', body: lines.join('\n'), dateOffset: date, teamIds
      });
    }
  };

  const basePoNews = proto.publishPlayoffNews;
  if (typeof basePoNews === 'function') proto.publishPlayoffNews = function (match, date) {
    const r = basePoNews.apply(this, arguments);
    try { this.publishPlayoffAwardsNews(date); } catch (e) { console.error('KHL Manager playoff awards news:', e); }
    return r;
  };
})();

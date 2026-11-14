/* KHL Manager 14.7.19 — новости по итогам регулярного чемпионата.
   Как только регулярный чемпионат завершается (в тот самый момент, когда игра готовится
   запустить плей-офф — proto.ensurePlayoffsStarted), публикуются три новости:
     1) итоги таблицы (конференции, общий лидер, дивизионы);
     2) лучший тренер регулярного чемпионата;
     3) лучшие игроки турнира (бомбардир/снайпер/ассистент/защитник/вратарь).
   Эти новости публикуются ПЕРЕД тем, как сработает уже существующее объявление
   «Старт плей-офф Кубка Гагарина» (news_model.js → announcePlayoffStage), поэтому в
   ленте новостей (сортировка по dateOffset, затем по createdAt, оба — свежее сверху)
   новость о старте плей-офф естественно оказывается выше новостей по итогам регулярки.
   Ссылки на клубы/игроков/тренера в тексте этих новостей появляются автоматически —
   это делает уже существующий механизм авто-линковки (js/features/v143.js, v152.js),
   который разбирает текст уже отрендеренных новостей и оборачивает распознанные имена
   в <span class="nm" data-cl=…/data-pl=…/data-co=…>. Здесь это не требует доп. кода. */
(function () {
  'use strict';
  const proto = KHLManagerApp.prototype;

  // Общая турнирная таблица («Лига») — та же сортировка, что в L06_72_standings_playoffs.js
  // (renderOverallStandingsV71), чтобы лидер полностью совпадал с тем, что видно на вкладке «Лига».
  proto.overallStandingsRows = function () {
    return this.db.teams.map(team => ({ ...team, ...(this.state.standings?.[team.id] || {}) })).sort((a, b) =>
      (Number(b.pts) || 0) - (Number(a.pts) || 0) ||
      (Number(b.regw) || 0) - (Number(a.regw) || 0) ||
      (((Number(b.gf) || 0) - (Number(b.ga) || 0)) - ((Number(a.gf) || 0) - (Number(a.ga) || 0))) ||
      (Number(b.gf) || 0) - (Number(a.gf) || 0) || a.name.localeCompare(b.name, 'ru'));
  };

  // Лидеры турнира по пяти категориям — те же сортировки, что во вкладке «Статистика» (stats_ui.js).
  // «Снайпер» — строго по голам (решение пользователя), в отличие от «Бомбардира» (по очкам Г+П).
  function seasonLeaders(app) {
    const S = app.state;
    const byName = (x, y) => x.p.name.localeCompare(y.p.name, 'ru');
    const skaters = app.db.players.filter(p => p.pos !== 'G').map(p => {
      const r = S.playerStats?.[p.id] || {};
      return { p, g: Number(r.g) || 0, a: Number(r.a) || 0, pts: Number(r.pts) || 0, gp: Number(r.gp) || 0 };
    }).filter(x => x.gp > 0);
    const scorer = [...skaters].sort((x, y) => y.pts - x.pts || y.g - x.g || y.a - x.a || byName(x, y))[0];
    const sniper = [...skaters].sort((x, y) => y.g - x.g || y.pts - x.pts || byName(x, y))[0];
    const assist = [...skaters].sort((x, y) => y.a - x.a || y.pts - x.pts || byName(x, y))[0];
    const defender = skaters.filter(x => x.p.pos === 'D')
      .sort((x, y) => y.pts - x.pts || y.g - x.g || y.a - x.a || byName(x, y))[0];
    const minG = app.goalieQualifyGames();
    const goalie = app.db.players.filter(p => p.pos === 'G').map(p => {
      const r = S.playerStats?.[p.id] || {};
      const gGP = Number(r.goalieGP) || 0, saves = Number(r.goalieSaves) || 0, shots = Number(r.goalieShots) || 0;
      return { p, gGP, sv: saves / Math.max(1, shots) };
    }).filter(x => x.gGP >= minG && x.gGP > 0).sort((x, y) => y.sv - x.sv || y.gGP - x.gGP || byName(x, y))[0];
    return { scorer, sniper, assist, defender, goalie };
  }

  const ptsWord = (app, n) => n + ' ' + app.plu(n, ['очко', 'очка', 'очков']);
  const goalsWord = (app, n) => n + ' ' + app.plu(n, ['гол', 'гола', 'голов']);
  const gamesWord = (app, n) => n + ' ' + app.plu(n, ['игра', 'игры', 'игр']);
  const assistsWord = (app, n) => n + ' ' + app.plu(n, ['передача', 'передачи', 'передач']);

  // Публикует все три новости (идемпотентно — publishNews сама отбрасывает дубль по key).
  proto.publishSeasonAwardsNews = function (date) {
    if (!this.state) return;
    const west = this.standingsFor('west')[0], east = this.standingsFor('east')[0];
    const overall = this.overallStandingsRows(), top = overall[0];
    if (!west || !east || !top) return;
    const nameOf = t => (t && t.name) || '—';
    const divLine = div => `Дивизион ${this.divisionName(div)} возглавляет ${nameOf(this.divisionRows(div)[0])}.`;

    this.publishNews({
      key: `season-awards:table:${date}`, category: 'playoff', icon: '🏁', tag: 'Регулярка', scope: 'league',
      headline: 'Регулярный чемпионат завершился',
      body: [
        'Регулярный чемпионат завершился.',
        `Победитель Западной конференции — ${nameOf(west)}, победитель Восточной конференции — ${nameOf(east)}.`,
        `Общую турнирную таблицу чемпионата возглавляет ${nameOf(top)} — ${ptsWord(this, Number(top.pts) || 0)}.`,
        divLine('Kharlamov'), divLine('Tarasov'), divLine('Bobrov'), divLine('Chernyshev')
      ].join('\n'),
      dateOffset: date, teamIds: [top.id]
    });

    const coach = String(top.coach || '').replace(/\s*\(и\.о\.\)/, '').trim();
    if (coach) {
      this.publishNews({
        key: `season-awards:coach:${date}`, category: 'award', icon: '🧑‍💼', tag: 'Награды', scope: 'league',
        headline: 'Лучший тренер регулярного чемпионата',
        body: `Лучший тренер регулярного чемпионата — ${coach}, ${nameOf(top)}.`,
        dateOffset: date, teamIds: [top.id]
      });
    }

    const L = seasonLeaders(this);
    const teamName = p => (this.teamById(p.teamId) || {}).name || '—';
    const lines = [];
    if (L.scorer) lines.push(`Лучший бомбардир турнира — ${L.scorer.p.name}, ${teamName(L.scorer.p)} (${ptsWord(this, L.scorer.pts)}: ${L.scorer.g}+${L.scorer.a}).`);
    if (L.sniper) lines.push(`Лучший снайпер турнира — ${L.sniper.p.name}, ${teamName(L.sniper.p)} (${goalsWord(this, L.sniper.g)}).`);
    if (L.assist) lines.push(`Лучший ассистент турнира — ${L.assist.p.name}, ${teamName(L.assist.p)} (${assistsWord(this, L.assist.a)}).`);
    if (L.defender) lines.push(`Лучший защитник турнира — ${L.defender.p.name}, ${teamName(L.defender.p)} (${ptsWord(this, L.defender.pts)}: ${L.defender.g}+${L.defender.a}).`);
    if (L.goalie) lines.push(`Лучший вратарь турнира — ${L.goalie.p.name}, ${teamName(L.goalie.p)} (${(L.goalie.sv * 100).toFixed(1).replace('.', ',')}% отраж. бросков, ${gamesWord(this, L.goalie.gGP)}).`);
    if (lines.length) {
      const teamIds = [...new Set([L.scorer, L.sniper, L.assist, L.defender, L.goalie].filter(Boolean).map(x => x.p.teamId))];
      this.publishNews({
        key: `season-awards:players:${date}`, category: 'award', icon: '🏆', tag: 'Награды', scope: 'league',
        headline: 'Лучшие игроки регулярного чемпионата',
        body: lines.join('\n'), dateOffset: date, teamIds
      });
    }
  };

  const baseStartPo = proto.ensurePlayoffsStarted;
  if (typeof baseStartPo === 'function') proto.ensurePlayoffsStarted = function () {
    try {
      const po = this.state && this.state.playoff;
      if (this.state && (!po || !po.started) && !(po && po.completed) && this.regularSeasonComplete()) {
        const maxRegular = Math.max(...this.regularMatches().map(m => m.dateOffset), this.state.dayIndex || 0);
        this.publishSeasonAwardsNews(maxRegular);
      }
    } catch (e) { console.error('KHL Manager season awards news:', e); }
    return baseStartPo.apply(this, arguments);
  };
})();

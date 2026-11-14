const CACHE_NAME = 'khl-manager-mobile-14-7-30';
const APP_SHELL = [
  './index.html',
  './js/data/db.js',
  './js/data/free_agents.js',
  './js/data/coaches_1477.js',
  './js/core/game.js',
  './js/platform/telegram.js',
  './js/layers/L01_610_live_goalie_pull.js',
  './js/layers/L02_611_injuries.js',
  './js/layers/L03_613_objectives.js',
  './js/layers/L04_70_match_stats.js',
  './js/layers/L05_70_late_timeout.js',
  './js/layers/L06_72_standings_playoffs.js',
  './js/layers/L07_716_live_penalties.js',
  './js/layers/L08_78_special_teams.js',
  './js/layers/L09_723_playoff_scoring.js',
  './js/layers/L10_724_goalie_rotation.js',
  './js/layers/L11_726_scoring_calibration.js',
  './js/layers/L12_728_playoff_cards.js',
  './js/layers/L13_729_playoff_results.js',
  './js/layers/L14_728_playoff_audit.js',
  './js/layers/L15_731_ot_calendar.js',
  './js/features/age_model.js',
  './js/features/roster_ui.js',
  './js/features/match_model.js',
  './js/features/match_realism.js',
  './js/features/contracts.js',
  './js/features/development_model.js',
  './js/features/news_model.js',
  './js/features/special_model.js',
  './js/features/scheme_ui.js',
  './js/features/special_ui.js',
  './js/features/roster_table.js',
  './js/features/objectives_model.js',
  './js/features/playoff_goals.js',
  './js/features/lineup_snapshot.js',
  './js/features/match_center.js',
  './js/features/match_feed.js',
  './js/features/match_tempo.js',
  './js/features/live_ticker.js',
  './js/features/match_timeline.js',
  './js/features/live_rink.js',
  './js/features/attendance_model.js',
  './js/features/season_history.js',
  './js/features/match_odds.js',
  './js/features/trust_model.js',
  './js/features/top_panel.js',
  './js/features/overview.js',
  './js/features/polish.js',
  './js/features/dev_ui.js',
  './js/features/bench_boost.js',
  './js/features/day_guard.js',
  './js/features/pregame_modal.js',
  './js/features/start_screen.js',
  './js/features/standings_tabs.js',
  './js/features/dnd.js',
  './js/features/theme.js',
  './js/features/sim_perf.js',
  './js/features/perf.js',
  './js/features/shootout_modal.js',
  './js/features/market_model.js',
  './js/features/main_menu.js',
  './js/features/save_slots.js',
  './js/features/playoff_flow.js',
  './js/features/playoff_view.js',
  './js/features/rebalance.js',
  './js/features/stats_ui.js',
  './js/features/standings_ui.js',
  './js/features/finance_ui.js',
  './js/features/ui_fixes.js',
  './js/features/match_layout.js',
  './js/features/match_stats_tabs.js',
  './js/features/match_lineups_tab.js',
  './js/features/calendar_ui.js',
  './js/features/injury_clear.js',
  './js/features/rating_view.js',
  './js/features/injury_slots.js',
  './js/features/player_goals.js',
  './js/features/team_colors.js',
  './js/features/calendar_v2.js',
  './js/features/day_digest.js',
  './js/features/readiness_refresh.js',
  './js/features/db_version.js',
  './js/features/leadership.js',
  './js/features/tg_cloud.js',
  './js/features/player_log.js',
  './js/features/cards.js',
  './js/features/club_facts.js',
  './js/features/v143.js',
  './js/features/penalty_model.js',
  './js/features/coach_model.js',
  './js/features/club_emblems.js',
  './js/features/v152.js',
  './js/features/search.js',
  './js/features/tactics_model.js',
  './js/features/tactics_ui.js',
  './js/features/dropdown.js',
  './js/features/market_ui.js',
  './js/features/season_rollover.js',
  './js/features/season_rollover_ui.js',
  './js/features/player_bio.js',
  './js/features/card_safe.js',
  './js/features/club_finance.js',
  './js/features/state_repair.js',
  './js/features/special_sync.js',
  './js/features/season_awards_news.js',
  './js/features/playoff_awards_news.js',
  './js/features/build_info.js',
  './css/00_theme.css',
  './css/01_base.css',
  './css/02_special_teams.css',
  './css/04_playoff_banner.css',
  './css/05_roster_table.css',
  './css/06_objectives.css',
  './css/07_match_center.css',
  './css/08_match_tempo.css',
  './css/09_arenas.css',
  './css/10_history.css',
  './css/11_odds.css',
  './css/12_top_panel.css',
  './css/13_sorting.css',
  './css/14_overview.css',
  './css/15_polish.css',
  './css/16_cards.css',
  './css/17_mobile.css',
  './css/18_season.css',
  './manifest.webmanifest',
  './pwa.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('khl-manager-mobile-') && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const network = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put('./index.html', network.clone());
        return network;
      } catch (_) {
        return (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response && response.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      return Response.error();
    }
  })());
});

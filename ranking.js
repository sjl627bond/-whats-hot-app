(function initialiseRanking(windowObject) {
  'use strict';

  const CROWD_SIGNAL = Object.freeze({ 5: 3, 4: 2, 2: -1, 1: -3 });
  const TRUST_WEIGHT = Object.freeze({
    server_assessed_nearby: 1.35,
    accepted_unverified: 0.8,
    legacy: 0.65,
    suspicious: 0,
  });

  function recencyWeight(ageMinutes) {
    if (ageMinutes <= 15) return 1;
    if (ageMinutes <= 45) return 0.75;
    if (ageMinutes <= 90) return 0.45;
    if (ageMinutes <= 120) return 0.2;
    return 0;
  }

  function trustWeight(report) {
    if (report.trust_tier && TRUST_WEIGHT[report.trust_tier] !== undefined) return TRUST_WEIGHT[report.trust_tier];
    return report.user_id && report.proximity_status === 'client_nearby' ? 0.8 : TRUST_WEIGHT.legacy;
  }

  function deduplicateReports(reports) {
    const seenUsers = new Set(); let anonymousCount = 0;
    return reports.filter((report) => {
      if (!report.user_id) { anonymousCount += 1; return anonymousCount <= 5; }
      if (seenUsers.has(report.user_id)) return false;
      seenUsers.add(report.user_id);
      return true;
    });
  }

  function scoreVenue(venue, reports, now = Date.now()) {
    const ordered = reports.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const recent = deduplicateReports(ordered).slice(0, 20);
    let rawAdjustment = 0; let assessedCount = 0; let effectiveCount = 0;
    recent.forEach((report) => {
      const ageMinutes = Math.max(0, (now - new Date(report.created_at).getTime()) / 60000);
      const weight = recencyWeight(ageMinutes) * trustWeight(report);
      if (!weight) return;
      rawAdjustment += (CROWD_SIGNAL[report.crowd_level] || 0) * weight;
      effectiveCount += 1;
      if (report.trust_tier === 'server_assessed_nearby') assessedCount += 1;
    });
    const adjustment = Math.max(-15, Math.min(15, Math.round(rawAdjustment)));
    const liveScore = Math.max(0, Math.min(100, Number(venue.hot_score || 50) + adjustment));
    const latestUseful = ordered.find((report) => report.trust_tier !== 'suspicious');
    return {
      live_score: liveScore,
      live_status: latestUseful?.vibe || venue.status || 'CHILL',
      score_adjustment: adjustment,
      recent_report_count: effectiveCount,
      assessed_report_count: assessedCount,
      activity_label: effectiveCount ? `${effectiveCount} recent${assessedCount ? ` · ${assessedCount} assessed` : ''}` : 'Baseline score',
    };
  }

  function rankVenues(venues, checkIns, now = Date.now()) {
    return venues.map((venue) => {
      const reports = checkIns.filter((report) => String(report.venue_id) === String(venue.id));
      return { ...venue, ...scoreVenue(venue, reports, now) };
    }).sort((a, b) => b.live_score - a.live_score || String(a.name).localeCompare(String(b.name)));
  }

  windowObject.GoHottRanking = Object.freeze({ CROWD_SIGNAL, recencyWeight, trustWeight, deduplicateReports, scoreVenue, rankVenues });
}(window));

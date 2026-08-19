(function initialiseDataAccess(windowObject) {
  'use strict';
  const config = windowObject.GOHOTT_CONFIG;
  if (!config || !windowObject.supabase) throw new Error('GoHott could not initialise its Supabase client.');
  const client = windowObject.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);

  async function getVenuesWithRecentCheckIns() {
    const cutoff = new Date(Date.now() - config.liveWindowHours * 60 * 60 * 1000).toISOString();
    const [venuesResult, checkInsResult] = await Promise.all([
      client.from('venues').select('*'),
      client.from('check_ins').select('venue_id,crowd_level,vibe,created_at').gte('created_at', cutoff),
    ]);
    if (venuesResult.error) throw new Error(`Could not load venues: ${venuesResult.error.message}`);
    return { venues: venuesResult.data || [], checkIns: checkInsResult.data || [], checkInsError: checkInsResult.error };
  }

  async function createCheckIn(venueId, crowdLevel, vibe) {
    const { error } = await client.from('check_ins').insert({ venue_id: venueId, crowd_level: crowdLevel, vibe });
    if (error) throw new Error(error.message);
  }

  function subscribeToCheckIns(onInsert, onStatus) {
    return client.channel('gohott-live-check-ins')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'check_ins' }, onInsert)
      .subscribe(onStatus);
  }
  windowObject.GoHottData = Object.freeze({ getVenuesWithRecentCheckIns, createCheckIn, subscribeToCheckIns });
}(window));

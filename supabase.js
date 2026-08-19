(function initialiseDataAccess(windowObject) {
  'use strict';
  const config = windowObject.GOHOTT_CONFIG;
  if (!config || !windowObject.supabase) throw new Error('GoHott could not initialise its data connection.');
  const client = windowObject.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  async function getVenuesWithRecentCheckIns() {
    const cutoff = new Date(Date.now() - config.liveWindowHours * 3600000).toISOString();
    const [venuesResult, checkInsResult] = await Promise.all([
      client.from('venues').select('*'),
      client.from('check_ins').select('*').gte('created_at', cutoff).order('created_at', { ascending: false }),
    ]);
    if (venuesResult.error) throw new Error('Venue data is unavailable right now.');
    return { venues: venuesResult.data || [], checkIns: checkInsResult.data || [], checkInsError: checkInsResult.error };
  }

  async function createCheckIn(payload) {
    const report = { venue_id: payload.venue_id, crowd_level: payload.crowd_level, vibe: payload.vibe };
    if (payload.user_id) {
      report.user_id = payload.user_id;
      report.proximity_status = payload.proximity_status || 'unassessed';
      report.distance_meters = payload.distance_meters ?? null;
      const cutoff = new Date(Date.now() - config.repeatCheckInMinutes * 60000).toISOString();
      const recent = await client.from('check_ins').select('created_at').eq('user_id', payload.user_id).eq('venue_id', payload.venue_id).gte('created_at', cutoff).limit(1);
      if (!recent.error && recent.data?.length) throw new Error(`You reported this venue recently. Try again in ${config.repeatCheckInMinutes} minutes.`);
    }
    let result = await client.from('check_ins').insert(report);
    if (result.error && /user_id|proximity_status|distance_meters|schema cache/i.test(result.error.message)) {
      result = await client.from('check_ins').insert({ venue_id: report.venue_id, crowd_level: report.crowd_level, vibe: report.vibe });
    }
    if (result.error) throw new Error('Your report could not be sent. Please try again.');
  }

  async function getSavedVenueIds(userId) {
    const result = await client.from('saved_venues').select('venue_id').eq('user_id', userId);
    if (result.error) throw new Error('Saved venues need the Phase 2 database migration.');
    return (result.data || []).map((row) => row.venue_id);
  }
  async function saveVenue(userId, venueId) {
    const { error } = await client.from('saved_venues').insert({ user_id: userId, venue_id: venueId });
    if (error && error.code !== '23505') throw new Error('This venue could not be saved.');
  }
  async function unsaveVenue(userId, venueId) {
    const { error } = await client.from('saved_venues').delete().eq('user_id', userId).eq('venue_id', venueId);
    if (error) throw new Error('This venue could not be removed.');
  }
  async function getProfile(userId) {
    const result = await client.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (result.error) throw new Error('Profiles need the Phase 2 database migration.');
    return result.data;
  }
  async function saveProfile(profile) {
    const result = await client.from('profiles').upsert({ ...profile, updated_at: new Date().toISOString() }, { onConflict: 'id' }).select().single();
    if (result.error) throw new Error('Your profile could not be saved.');
    return result.data;
  }
  async function getUserCheckIns(userId) {
    const result = await client.from('check_ins').select('venue_id,crowd_level,vibe,created_at,proximity_status').eq('user_id', userId).order('created_at', { ascending: false }).limit(20);
    if (result.error) return [];
    return result.data || [];
  }
  function subscribeToCheckIns(onChange, onStatus) {
    return client.channel('gohott-live-check-ins').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'check_ins' }, onChange).subscribe(onStatus);
  }

  windowObject.GoHottData = Object.freeze({ client, getVenuesWithRecentCheckIns, createCheckIn, getSavedVenueIds, saveVenue, unsaveVenue, getProfile, saveProfile, getUserCheckIns, subscribeToCheckIns });
}(window));

(function initialiseDataAccess(windowObject) {
  'use strict';
  const config = windowObject.GOHOTT_CONFIG;
  if (!config || !windowObject.supabase) throw new Error('GoHott could not initialise its data connection.');
  const client = windowObject.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  async function getVenuesWithRecentCheckIns() {
    const cutoff = new Date(Date.now() - config.liveWindowHours * 3600000).toISOString();
    const [venuesResult, checkInsResult, profilesResult, marketsResult] = await Promise.all([
      client.from('venues').select('*'),
      client.from('check_ins').select('*').gte('created_at', cutoff).order('created_at', { ascending: false }),
      client.from('venue_profiles').select('venue_id,market_id,address,categories,hours,website_url,social_url,photo_urls,source_urls,latitude,longitude,verification_status,verified_at,updated_at').eq('verification_status', 'verified'),
      client.from('markets').select('*').eq('is_active', true).order('name'),
    ]);
    if (venuesResult.error) throw new Error('Venue data is unavailable right now.');
    const profiles = new Map((profilesResult.data || []).map((profile) => [String(profile.venue_id), profile]));
    const venues = (venuesResult.data || []).map((venue) => {
      const profile = profiles.get(String(venue.id));
      if (!profile) return { ...venue, coordinate_status: 'legacy', is_verified: false };
      return {
        ...venue,
        ...profile,
        id: venue.id,
        latitude: profile.latitude,
        longitude: profile.longitude,
        coordinate_status: 'verified',
        is_verified: true,
      };
    });
    return {
      venues,
      checkIns: checkInsResult.data || [],
      markets: marketsResult.data || [],
      checkInsError: checkInsResult.error,
      enhancementsAvailable: !profilesResult.error && !marketsResult.error,
    };
  }

  async function createCheckIn(payload) {
    const report = { venue_id: payload.venue_id, crowd_level: payload.crowd_level, vibe: payload.vibe };
    if (payload.user_id) {
      const rpcResult = await client.rpc('submit_check_in_v3', {
        p_venue_id: payload.venue_id,
        p_crowd_level: payload.crowd_level,
        p_vibe: payload.vibe,
        p_latitude: payload.latitude ?? null,
        p_longitude: payload.longitude ?? null,
        p_accuracy_meters: Number.isFinite(payload.accuracy_meters) ? Math.round(payload.accuracy_meters) : null,
      });
      if (!rpcResult.error) return rpcResult.data;
      const unavailable = /submit_check_in_v3|schema cache|PGRST202|Could not find the function/i.test(rpcResult.error.message || '');
      if (!unavailable) throw new Error(rpcResult.error.message || 'Your report could not be sent. Please try again.');
      report.user_id = payload.user_id;
      report.proximity_status = payload.proximity_status || 'unassessed';
      report.distance_meters = payload.distance_meters ?? null;
    }
    let result = await client.from('check_ins').insert(report);
    if (result.error && /user_id|proximity_status|distance_meters|permission|schema cache/i.test(result.error.message)) {
      result = await client.from('check_ins').insert({ venue_id: report.venue_id, crowd_level: report.crowd_level, vibe: report.vibe });
    }
    if (result.error) throw new Error('Your report could not be sent. Please try again.');
    return result.data;
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
    const result = await client.from('check_ins').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20);
    if (result.error) return [];
    return result.data || [];
  }
  async function getAccountDeletionRequest(userId) {
    const result = await client.from('account_deletion_requests').select('status,requested_at').eq('user_id', userId).maybeSingle();
    if (result.error) return null;
    return result.data;
  }
  async function requestAccountDeletion(reason = null) {
    const result = await client.from('account_deletion_requests').insert({ reason: reason || null }).select('status,requested_at').single();
    if (result.error) {
      if (result.error.code === '23505') throw new Error('An account deletion request is already pending.');
      throw new Error('Account deletion requests require the Phase 3 database migration.');
    }
    return result.data;
  }
  function subscribeToCheckIns(onChange, onStatus) {
    return client.channel('gohott-live-check-ins').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'check_ins' }, onChange).subscribe(onStatus);
  }

  windowObject.GoHottData = Object.freeze({ client, getVenuesWithRecentCheckIns, createCheckIn, getSavedVenueIds, saveVenue, unsaveVenue, getProfile, saveProfile, getUserCheckIns, getAccountDeletionRequest, requestAccountDeletion, subscribeToCheckIns });
}(window));

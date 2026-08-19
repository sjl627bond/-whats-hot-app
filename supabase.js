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
    const payload = { ...profile, updated_at: new Date().toISOString() };
    let result = await client.from('profiles').upsert(payload, { onConflict: 'id' }).select().single();
    if (result.error && /username|avatar_url|bio|favorite_categories|profile_visibility|message_permission|notification_preferences|schema cache/i.test(result.error.message || '')) {
      const core = { id: profile.id, display_name: profile.display_name, home_city: profile.home_city, updated_at: payload.updated_at };
      result = await client.from('profiles').upsert(core, { onConflict: 'id' }).select().single();
      if (!result.error) return { ...result.data, social_settings_pending: true };
    }
    if (result.error) throw new Error('Your profile could not be saved.'); return result.data;
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
  async function requestDataExport() {
    const result = await client.rpc('request_user_data_export');
    if (result.error) {
      if (/request_user_data_export|schema cache|PGRST202/i.test(result.error.message || '')) throw new Error('Data export will be available after the reviewed Phase 6 migration and export worker are configured.');
      throw new Error(result.error.message || 'Your export request could not be submitted.');
    }
    return result.data;
  }
  function subscribeToCheckIns(onChange, onStatus) {
    return client.channel('gohott-live-check-ins').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'check_ins' }, onChange).subscribe(onStatus);
  }

  function liveLooksUnavailable(error) { return /live_looks|get_active_live_looks|prepare_live_look|publish_live_look|schema cache|PGRST/i.test(error?.message || ''); }
  async function getActiveLiveLooks() {
    const result = await client.rpc('get_active_live_looks');
    if (result.error) { if (liveLooksUnavailable(result.error)) return { available: false, looks: [] }; throw result.error; }
    const looks = await Promise.all((result.data || []).map(async (look) => {
      let signed = await client.storage.from('live-looks').createSignedUrl(look.storage_path, 300, { transform: { width: 960, quality: 78, resize: 'contain' } });
      if (signed.error) signed = await client.storage.from('live-looks').createSignedUrl(look.storage_path, 300);
      return { ...look, image_url: signed.data?.signedUrl || '' };
    }));
    return { available: true, looks: looks.filter((look) => look.image_url) };
  }
  async function uploadLiveLook({ venueId, file, caption, durationChoice, position }) {
    const details = windowObject.GoHottLiveLook.validateFile(file); const contentHash = await windowObject.GoHottLiveLook.fingerprint(file);
    const prepared = await client.rpc('prepare_live_look_upload', { p_venue_id: venueId, p_content_type: details.contentType, p_byte_size: details.byteSize, p_extension: details.extension, p_content_hash: contentHash });
    if (prepared.error) throw new Error(liveLooksUnavailable(prepared.error) ? 'Live Look is awaiting its reviewed Phase 4 database rollout.' : prepared.error.message);
    const upload = await client.storage.from('live-looks').upload(prepared.data.path, file, { contentType: details.contentType, cacheControl: '300', upsert: false });
    if (upload.error) throw new Error('The photo could not be uploaded. Please try again.');
    const published = await client.rpc('publish_live_look', { p_live_look_id: prepared.data.id, p_caption: windowObject.GoHottLiveLook.validateCaption(caption) || null, p_duration_choice: durationChoice, p_latitude: position.latitude, p_longitude: position.longitude, p_accuracy_meters: Math.round(position.accuracy) });
    if (published.error) throw new Error(published.error.message || 'The Live Look could not be published.'); return published.data;
  }
  async function removeLiveLook(id) { const result = await client.rpc('remove_live_look', { p_live_look_id: id }); if (result.error) throw new Error(result.error.message); }
  async function reportLiveLook(id, reason, details = null) { const result = await client.rpc('report_live_look', { p_live_look_id: id, p_reason: reason, p_details: details }); if (result.error) throw new Error(result.error.code === '23505' ? 'You already reported this Live Look.' : result.error.message); }
  function subscribeToLiveLooks(onChange) { return client.channel('gohott-live-looks').on('postgres_changes', { event: '*', schema: 'public', table: 'live_looks' }, onChange).subscribe(); }

  function socialUnavailable(error) { return /search_social_profiles|social_notifications|conversation_participants|nightlife_plans|schema cache|PGRST/i.test(error?.message || ''); }
  async function searchPeople(query = '') {
    const result = await client.rpc('search_social_profiles', { p_query: String(query).trim(), p_limit: 30 });
    if (result.error) { if (socialUnavailable(result.error)) return { available: false, people: [] }; throw new Error(result.error.message); }
    return { available: true, people: result.data || [] };
  }
  async function listConnections(kind) { const result = await client.rpc('list_social_connections', { p_kind: kind }); if (result.error) { if (socialUnavailable(result.error)) return []; throw new Error(result.error.message); } return result.data || []; }
  async function setFollow(targetId, follow) { const result = await client.rpc('set_follow_state', { p_target: targetId, p_follow: follow }); if (result.error) throw new Error(result.error.message); return result.data; }
  async function setBlock(targetId, block) { const result = await client.rpc('set_user_block', { p_target: targetId, p_block: block }); if (result.error) throw new Error(result.error.message); }
  async function startConversation(targetId) { const result = await client.rpc('start_direct_conversation', { p_target: targetId }); if (result.error) throw new Error(result.error.message); return result.data; }
  async function getConversations() {
    const result = await client.from('conversations').select('id,updated_at,conversation_participants(user_id,last_read_at),messages(id,sender_id,body,created_at,removed_at)').order('updated_at', { ascending: false }).limit(30).limit(50, { foreignTable: 'messages' });
    if (result.error) { if (socialUnavailable(result.error)) return []; throw new Error(result.error.message); }
    const currentId = windowObject.GoHottAuth?.getUser()?.id;
    return (result.data || []).map((conversation) => { const mine = conversation.conversation_participants?.find((item) => item.user_id === currentId); const readAt = mine?.last_read_at ? new Date(mine.last_read_at).getTime() : 0; const unread_count = (conversation.messages || []).filter((message) => message.sender_id !== currentId && !message.removed_at && new Date(message.created_at).getTime() > readAt).length; return { ...conversation, unread_count }; });
  }
  async function getMessages(conversationId, before = null) {
    let query = client.from('messages').select('id,conversation_id,sender_id,body,created_at,message_references(reference_type,reference_id,label)').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(50);
    if (before) query = query.lt('created_at', before); const result = await query; if (result.error) throw new Error(result.error.message); return (result.data || []).reverse();
  }
  async function sendMessage(conversationId, body, reference = null) {
    const result = await client.rpc('send_social_message', { p_conversation: conversationId, p_body: windowObject.GoHottSocial.validateMessage(body), p_reference_type: reference?.type || null, p_reference_id: reference?.id || null, p_label: reference?.label || null });
    if (result.error) throw new Error(result.error.message); return result.data;
  }
  async function markConversationRead(conversationId) { const result = await client.rpc('mark_conversation_read', { p_conversation: conversationId }); if (result.error) throw new Error(result.error.message); }
  async function setNightlifePlan(venueId, status, visibility) { windowObject.GoHottSocial.validatePlan(status, visibility); const result = await client.rpc('set_nightlife_plan', { p_venue: venueId, p_status: status, p_visibility: visibility }); if (result.error) throw new Error(result.error.message); return result.data; }
  async function getVenuePlanSignal(venueId) { const result = await client.rpc('get_venue_plan_signal', { p_venue: venueId }); if (result.error) return null; return result.data; }
  async function reactToLiveLook(id, reaction) { const result = await client.rpc('set_live_look_reaction', { p_live_look: id, p_reaction: reaction }); if (result.error) throw new Error(result.error.message); return result.data; }
  async function getNotifications() { const result = await client.from('social_notifications').select('id,actor_id,notification_type,entity_type,entity_id,summary,created_at,read_at').order('created_at', { ascending: false }).limit(50); if (result.error) return []; return result.data || []; }
  async function markNotificationsRead() { const result = await client.from('social_notifications').update({ read_at: new Date().toISOString() }).is('read_at', null); if (result.error) throw new Error(result.error.message); }
  async function reportSocialContent(targetType, targetId, reason, details = null) { const result = await client.rpc('report_social_content', { p_target_type: targetType, p_target_id: targetId, p_reason: reason, p_details: details }); if (result.error) throw new Error(result.error.message); return result.data; }
  function subscribeToSocial(userId, conversationId, onChange) {
    const notifications = client.channel(`gohott-notifications-${userId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'social_notifications', filter: `recipient_id=eq.${userId}` }, onChange).subscribe();
    const messages = conversationId ? client.channel(`gohott-messages-${conversationId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, onChange).subscribe() : null;
    return () => { client.removeChannel(notifications); if (messages) client.removeChannel(messages); };
  }

  windowObject.GoHottData = Object.freeze({ client, getVenuesWithRecentCheckIns, createCheckIn, getSavedVenueIds, saveVenue, unsaveVenue, getProfile, saveProfile, getUserCheckIns, getAccountDeletionRequest, requestAccountDeletion, requestDataExport, subscribeToCheckIns, getActiveLiveLooks, uploadLiveLook, removeLiveLook, reportLiveLook, subscribeToLiveLooks, searchPeople, listConnections, setFollow, setBlock, startConversation, getConversations, getMessages, sendMessage, markConversationRead, setNightlifePlan, getVenuePlanSignal, reactToLiveLook, getNotifications, markNotificationsRead, reportSocialContent, subscribeToSocial });
}(window));

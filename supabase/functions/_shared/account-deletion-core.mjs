const BUCKET = 'live-looks';
const fail = (stage, cause) => Object.assign(new Error(`Account deletion failed at ${stage}.`, { cause }), { stage });

export async function performAccountDeletion({ admin, userId, operationId }) {
  if (!admin || !userId || !operationId) throw fail('validation');

  let authDeleted = false;
  const changedConversationKeys = [];
  try {
    const requestResult = await admin.from('account_deletion_requests').upsert({
      user_id: userId,
      status: 'processing',
      requested_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (requestResult.error) throw fail('request_state', requestResult.error);

    const looksResult = await admin.from('live_looks').select('storage_path').eq('user_id', userId);
    if (looksResult.error) throw fail('storage_inventory', looksResult.error);
    const prefix = `${userId}/`;
    const paths = [...new Set((looksResult.data || []).map((row) => row.storage_path).filter((path) => typeof path === 'string' && path.startsWith(prefix)))];
    if (paths.length !== (looksResult.data || []).length) throw fail('storage_scope');

    for (let offset = 0; offset < paths.length; offset += 1000) {
      const removal = await admin.storage.from(BUCKET).remove(paths.slice(offset, offset + 1000));
      if (removal.error) throw fail('storage_cleanup', removal.error);
    }

    const participants = await admin.from('conversation_participants').select('conversation_id').eq('user_id', userId);
    if (participants.error) throw fail('conversation_inventory', participants.error);
    const conversationIds = [...new Set((participants.data || []).map((row) => row.conversation_id).filter(Boolean))];
    if (conversationIds.length) {
      const conversations = await admin.from('conversations').select('id,direct_key').in('id', conversationIds);
      if (conversations.error) throw fail('conversation_inventory', conversations.error);
      for (const conversation of conversations.data || []) {
        const anonymized = await admin.from('conversations').update({ direct_key: `deleted:${operationId}:${conversation.id}` }).eq('id', conversation.id);
        if (anonymized.error) throw fail('conversation_anonymization', anonymized.error);
        changedConversationKeys.push(conversation);
      }
    }

    const deletion = await admin.auth.admin.deleteUser(userId, false);
    if (deletion.error) throw fail('auth_deletion', deletion.error);
    authDeleted = true;
    return { removedObjects: paths.length };
  } catch (error) {
    if (!authDeleted) {
      for (const conversation of changedConversationKeys) {
        try { await admin.from('conversations').update({ direct_key: conversation.direct_key }).eq('id', conversation.id); } catch { /* Best-effort compensation; preserve the original stage. */ }
      }
      try { await admin.from('account_deletion_requests').update({ status: 'pending' }).eq('user_id', userId); } catch { /* Preserve the original failure stage. */ }
    }
    throw error;
  }
}

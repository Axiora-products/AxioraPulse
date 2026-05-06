import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function getAdminClient() {
  if (!SUPABASE_URL) throw new Error('SUPABASE_URL not configured.');
  if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured.');
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { targetUserId, requesterId } = JSON.parse(event.body || '{}');
    if (!targetUserId || !requesterId) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'targetUserId and requesterId are required' }) };
    }

    const supabase = getAdminClient();

    // Verify requester is super_admin (req #14)
    const { data: requester } = await supabase
      .from('user_profiles')
      .select('role, tenant_id')
      .eq('id', requesterId)
      .maybeSingle();

    if (!requester || requester.role !== 'super_admin') {
      return { statusCode: 403, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Only Super Admins can delete users' }) };
    }

    // Verify target is in the same tenant
    const { data: target } = await supabase
      .from('user_profiles')
      .select('role, tenant_id')
      .eq('id', targetUserId)
      .maybeSingle();

    if (!target || target.tenant_id !== requester.tenant_id) {
      return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: 'User not found' }) };
    }

    // Cannot delete another super_admin
    if (target.role === 'super_admin') {
      return { statusCode: 403, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Super Admin cannot be deleted' }) };
    }

    // Delete from auth (cascades to user_profiles via FK)
    const { error } = await supabase.auth.admin.deleteUser(targetUserId);
    if (error) throw error;

    // Audit log
    const { error: auditErr } = await supabase.from('audit_log').insert({
      tenant_id: requester.tenant_id,
      user_id: requesterId,
      action: 'delete_user',
      resource_type: 'user',
      resource_id: targetUserId,
    });
    if (auditErr) console.warn('Audit log failed (non-critical):', auditErr.message);

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ message: 'User deleted' }) };
  } catch (err) {
    console.error('Delete user error:', err);
    return {
      statusCode: err.message?.includes('not configured') ? 503 : 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message || 'Failed to delete user' }),
    };
  }
}

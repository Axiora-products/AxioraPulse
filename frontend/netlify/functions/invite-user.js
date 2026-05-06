import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  '';

const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  '';

// req #19: correct site URL
const SITE_URL = 'https://Axiorapulse.netlify.app';

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
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { email, role, fullName, tenantId, invitedBy } = JSON.parse(event.body || '{}');

    if (!email || !tenantId) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Email and tenant ID are required' }) };
    }

    // req #4/#8: only super_admin and admin can invite
    if (!invitedBy) {
      return { statusCode: 403, headers: CORS_HEADERS, body: JSON.stringify({ error: 'invitedBy is required' }) };
    }

    const validRoles = ['viewer', 'creator', 'manager', 'admin'];
    if (role && !validRoles.includes(role)) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Invalid role' }) };
    }

    const supabase = getAdminClient();

    // Verify tenant and load approved_domains
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, name, approved_domains')
      .eq('id', tenantId)
      .maybeSingle();

    if (!tenant) {
      return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Organisation not found' }) };
    }

    // req #6: block invites until approved domains are configured
    const approvedDomains = tenant.approved_domains || [];
    if (approvedDomains.length === 0) {
      return {
        statusCode: 403,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'No approved email domains set. Configure them in Settings before sending invitations.' }),
      };
    }

    // req #9/#10: validate email domain against approved list
    const emailDomain = email.split('@')[1]?.toLowerCase();
    const isApproved = approvedDomains.some(d => d.toLowerCase() === emailDomain);
    if (!isApproved) {
      return {
        statusCode: 403,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: `Email domain "@${emailDomain}" is not in the approved domains list.` }),
      };
    }

    // Verify inviter permissions
    const { data: inviter } = await supabase
      .from('user_profiles')
      .select('role, tenant_id')
      .eq('id', invitedBy)
      .maybeSingle();

    if (!inviter || inviter.tenant_id !== tenantId || !['super_admin', 'admin'].includes(inviter.role)) {
      return { statusCode: 403, headers: CORS_HEADERS, body: JSON.stringify({ error: 'You do not have permission to invite users' }) };
    }

    // Check duplicate within tenant
    const { data: existingProfile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('email', email)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (existingProfile) {
      return { statusCode: 409, headers: CORS_HEADERS, body: JSON.stringify({ error: 'User already belongs to this organisation' }) };
    }

    // req #16/#18: redirect to /accept-invite with org info pre-filled, 24hr expiry
    const params = new URLSearchParams({
      tenant_id: tenantId,
      tenant_name: tenant.name,
      role: role || 'viewer',
      ...(fullName ? { full_name: fullName } : {}),
    });
    const redirectTo = `${SITE_URL}/accept-invite?${params.toString()}`;

    const { data: authUser, error: authErr } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { tenant_id: tenantId, tenant_name: tenant.name, full_name: fullName, role: role || 'viewer' },
    });

    if (authErr) {
      // Supabase returns this error when the email is already in the auth.users table.
      // In that case we add the existing user directly to the org without resending an invite email.
      if (authErr.message?.includes('already registered') || authErr.message?.includes('already been registered')) {
        // listUsers is paginated — iterate until we find the user or exhaust pages
        let existingUser = null;
        let page = 1;
        const perPage = 1000;
        while (!existingUser) {
          const { data: listData, error: listErr } = await supabase.auth.admin.listUsers({ page, perPage });
          if (listErr) { console.warn('listUsers error:', listErr.message); break; }
          const users = listData?.users || [];
          existingUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase()) || null;
          if (users.length < perPage) break; // no more pages
          page++;
        }
        if (existingUser) {
          const { error: profErr } = await supabase.from('user_profiles').insert({
            id: existingUser.id,
            tenant_id: tenantId,
            email,
            full_name: fullName || email.split('@')[0],
            role: role || 'viewer',
            invited_by: invitedBy,
            invite_accepted_at: new Date().toISOString(),
            account_status: 'active',
          });
          if (profErr) {
            console.error('Profile insert error (existing user):', profErr.message);
            throw new Error('Failed to add existing user to organisation');
          }
          return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ message: 'User added to organisation' }) };
        }
      }
      console.error('inviteUserByEmail error:', authErr.message);
      throw authErr;
    }

    // Placeholder profile — account_status = 'invited' until they complete registration
    await supabase.from('user_profiles').insert({
      id: authUser.user.id,
      tenant_id: tenantId,
      email,
      full_name: fullName || email.split('@')[0],
      role: role || 'viewer',
      invited_by: invitedBy,
      account_status: 'invited',
    });

    const { error: auditErr } = await supabase.from('audit_log').insert({
      tenant_id: tenantId,
      user_id: invitedBy,
      action: 'invite_user',
      resource_type: 'user',
      resource_id: authUser.user.id,
      details: { email, role },
    });
    if (auditErr) console.warn('Audit log failed (non-critical):', auditErr.message);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: `Invitation sent to ${email}` }),
    };
  } catch (err) {
    console.error('Invite user error:', err);
    return {
      statusCode: err.message?.includes('not configured') ? 503 : 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message || 'Failed to invite user' }),
    };
  }
}

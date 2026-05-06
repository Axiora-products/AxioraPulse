import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  '';

const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
  '';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function getAdminClient() {
  if (!SUPABASE_URL) {
    throw new Error('SUPABASE_URL not configured. Set VITE_SUPABASE_URL in Netlify env vars.');
  }
  if (!SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured. Set it in Netlify env vars.');
  }
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
    const { userId, email, fullName, tenantName, tenantSlug } = JSON.parse(event.body || '{}');

    if (!email || !tenantName || !tenantSlug) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing required fields: email, tenantName, tenantSlug' }),
      };
    }

    if (!/^[a-z0-9-]{3,50}$/.test(tenantSlug)) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Invalid organization URL. Use 3-50 lowercase letters, numbers, and hyphens.' }),
      };
    }

    const supabase = getAdminClient();

    // ----------------------------------------------------------------
    // STEP 1: Find the REAL user in auth.users by email (don't trust userId from frontend)
    // When Supabase has email confirmation on and user re-registers,
    // signUp() can return a fake/obfuscated userId that doesn't exist in auth.users.
    // ----------------------------------------------------------------
    let realUserId = null;

    // Try the provided userId first
    if (userId) {
      const { data: userById } = await supabase.auth.admin.getUserById(userId);
      if (userById?.user?.id) {
        realUserId = userById.user.id;
        console.log(`Found user by provided ID: ${realUserId}`);
      }
    }

    // If userId was fake/missing, look up by email
    if (!realUserId) {
      console.log(`userId ${userId} not found in auth.users, searching by email: ${email}`);
      // BUG FIX: listUsers() returns max 1000 users with no pagination.
      // On larger installs this would silently miss users beyond page 1.
      // Use perPage=1000 + page loop to be safe, but also Supabase recommends
      // using getUserByEmail when available (admin API v2+). We use pagination
      // as a safe fallback that works on all Supabase versions.
      let matchedUser = null;
      let page = 1;
      while (!matchedUser) {
        const { data: listData, error: listErr } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
        if (listErr) {
          console.error('listUsers error:', listErr);
          throw new Error('Failed to look up user account.');
        }
        matchedUser = listData?.users?.find(
          (u) => u.email?.toLowerCase() === email.toLowerCase()
        );
        if (!matchedUser && (listData?.users?.length ?? 0) < 1000) break; // last page
        if (!matchedUser) page++;
      }
      if (matchedUser) {
        realUserId = matchedUser.id;
        console.log(`Found user by email lookup: ${realUserId}`);
      }
    }

    // If still no user found, something went very wrong
    if (!realUserId) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: 'User account not found. Please go back to the registration page and try signing up again.',
          hint: 'Make sure you complete the sign-up step before this is called.',
        }),
      };
    }

    // ----------------------------------------------------------------
    // STEP 2: Check if this user already has a profile (previous partial registration)
    // ----------------------------------------------------------------
    const { data: existingProfile } = await supabase
      .from('user_profiles')
      .select('id, tenant_id')
      .eq('id', realUserId)
      .maybeSingle();

    if (existingProfile) {
      // User already has a profile — return their existing tenant
      const { data: existingTenant } = await supabase
        .from('tenants')
        .select('id, name, slug')
        .eq('id', existingProfile.tenant_id)
        .maybeSingle();

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          tenantId: existingProfile.tenant_id,
          message: existingTenant
            ? `You already have an organization: "${existingTenant.name}". Redirecting to dashboard.`
            : 'Organization already exists. Redirecting to dashboard.',
          existing: true,
        }),
      };
    }

    // ----------------------------------------------------------------
    // STEP 3: Check name and slug uniqueness (req #2)
    // ----------------------------------------------------------------
    const { data: nameTaken } = await supabase
      .from('tenants')
      .select('id')
      .ilike('name', tenantName)
      .maybeSingle();

    if (nameTaken) {
      return {
        statusCode: 409,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'An organisation with this name already exists. Please choose a different name.' }),
      };
    }

    const { data: slugTaken } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', tenantSlug)
      .maybeSingle();

    if (slugTaken) {
      return {
        statusCode: 409,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Organization URL already taken. Try a different one.' }),
      };
    }

    // ----------------------------------------------------------------
    // STEP 4: Create tenant + profile via DB function
    // ----------------------------------------------------------------
    const { data, error } = await supabase.rpc('register_tenant', {
      p_tenant_name: tenantName,
      p_tenant_slug: tenantSlug,
      p_user_id: realUserId,
      p_user_email: email,
      p_user_name: fullName || email.split('@')[0],
    });

    if (error) {
      console.error('register_tenant RPC error:', error);
      if (error.message?.includes('duplicate key') && error.message?.includes('tenants_name_unique')) {
        throw new Error('An organisation with this name already exists.');
      }
      if (error.message?.includes('duplicate key') && error.message?.includes('tenants_slug_key')) {
        throw new Error('Organization URL already taken.');
      }
      if (error.message?.includes('duplicate key') && error.message?.includes('user_profiles_pkey')) {
        throw new Error('Account already registered. Try logging in instead.');
      }
      throw error;
    }

    console.log(`Tenant created successfully: ${data} for user: ${realUserId}`);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        tenantId: data,
        message: 'Organization created successfully',
      }),
    };
  } catch (err) {
    console.error('Register tenant error:', err);
    const statusCode = err.message?.includes('not configured') ? 503 : 500;
    return {
      statusCode,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        error: err.message || 'Failed to create organization',
        hint: statusCode === 503
          ? 'Server environment variables are not configured.'
          : 'Please try again or contact support.',
      }),
    };
  }
}

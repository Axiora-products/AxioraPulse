// Health check endpoint to verify environment variables are configured
// Call: GET /.netlify/functions/health
// DELETE THIS FUNCTION after confirming everything works (it exposes config info)

export async function handler(event) {
  const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  const supabaseUrl =
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    '';

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
    '';

  const anonKey =
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '';

  const checks = {
    SUPABASE_URL: {
      found: !!supabaseUrl,
      // Show partial value for verification (first 30 chars)
      preview: supabaseUrl ? supabaseUrl.substring(0, 30) + '...' : 'NOT SET',
      searched: [
        'VITE_SUPABASE_URL',
        'SUPABASE_URL',
      ].map((name) => `${name}: ${process.env[name] ? 'SET' : 'not set'}`),
    },
    SUPABASE_SERVICE_ROLE_KEY: {
      found: !!serviceRoleKey,
      // Only show length for security
      preview: serviceRoleKey
        ? `SET (${serviceRoleKey.length} chars, starts with ${serviceRoleKey.substring(0, 5)}...)`
        : 'NOT SET',
      searched: [
        'SUPABASE_SERVICE_ROLE_KEY',
        'VITE_SUPABASE_SERVICE_ROLE_KEY',
      ].map((name) => `${name}: ${process.env[name] ? 'SET' : 'not set'}`),
    },
    SUPABASE_ANON_KEY: {
      found: !!anonKey,
      preview: anonKey
        ? `SET (${anonKey.length} chars, starts with ${anonKey.substring(0, 5)}...)`
        : 'NOT SET',
      searched: [
        'VITE_SUPABASE_ANON_KEY',
        'SUPABASE_ANON_KEY',
      ].map((name) => `${name}: ${process.env[name] ? 'SET' : 'not set'}`),
    },
  };

  const allGood = checks.SUPABASE_URL.found &&
    checks.SUPABASE_SERVICE_ROLE_KEY.found &&
    checks.SUPABASE_ANON_KEY.found;

  return {
    statusCode: allGood ? 200 : 500,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      status: allGood ? 'healthy' : 'misconfigured',
      message: allGood
        ? 'All environment variables are configured correctly.'
        : 'Some environment variables are missing. Check the details below.',
      checks,
      instructions: allGood ? null : {
        step1: 'Go to Netlify Dashboard → Your Site → Site Settings → Environment Variables',
        step2: 'Add the missing variables listed above',
        step3: 'IMPORTANT: After adding/changing env vars, trigger a new deploy (Deploys → Trigger Deploy → Deploy Site)',
        note: 'Env vars are baked into functions at build time. Changes require a redeploy.',
      },
    }, null, 2),
  };
}

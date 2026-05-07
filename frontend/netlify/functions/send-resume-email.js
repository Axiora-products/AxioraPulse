/**
 * send-resume-email
 * ─────────────────────────────────────────────────────────────────
 * Handles two email types:
 *
 *   type: 'share'   — "Someone shared a survey with you"
 *   type: 'resume'  — "Continue where you left off"
 *
 * Uses the Resend API (https://resend.com) — set RESEND_API_KEY
 * in Netlify environment variables.
 *
 * Also works with any SMTP-style provider: swap the fetch() call
 * for nodemailer if preferred.
 *
 * Required env vars
 * ─────────────────
 *   RESEND_API_KEY        — from resend.com (free tier: 3000/mo)
 *   EMAIL_FROM            — e.g. "Axiora Pulse <noreply@yourdomain.com>"
 *   VITE_SUPABASE_URL     — used to validate the request origin (optional)
 *
 * Request body
 * ────────────
 *   to           string   recipient email
 *   surveyTitle  string   survey name
 *   surveyUrl    string   full URL to the survey
 *   type         string   'share' | 'resume'
 *   respondentName? string  (optional, for resume emails)
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

export const handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const RESEND_KEY  = process.env.RESEND_API_KEY;
  const FROM        = process.env.EMAIL_FROM || 'Axiora Pulse <noreply@Axiorapulse.com>';

  if (!RESEND_KEY) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'RESEND_API_KEY not configured in Netlify environment variables' }),
    };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { to, surveyTitle, surveyUrl, type = 'share', respondentName } = body;

  if (!to || !surveyTitle || !surveyUrl) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Missing required fields: to, surveyTitle, surveyUrl' }) };
  }

  // ── Build email content ────────────────────────────────────────────────────
  const isResume = type === 'resume';
  const subject  = isResume
    ? `Continue your survey: ${surveyTitle}`
    : `You've been invited to complete: ${surveyTitle}`;

  const html = buildEmail({ to, surveyTitle, surveyUrl, isResume, respondentName, from: FROM });

  // ── Send via Resend ────────────────────────────────────────────────────────
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    FROM,
        to:      [to],
        subject,
        html,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('Resend error:', data);
      return { statusCode: res.status, headers: CORS_HEADERS, body: JSON.stringify({ error: data.message || 'Email send failed' }) };
    }

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ success: true, id: data.id }) };
  } catch (err) {
    console.error('send-resume-email error:', err);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};

// ── HTML email template ────────────────────────────────────────────────────
function buildEmail({ to, surveyTitle, surveyUrl, isResume, respondentName }) {
  const greeting  = respondentName ? `Hi ${respondentName},` : 'Hi there,';
  const headline  = isResume  ? 'Continue where you left off' : 'You have been invited';
  const bodyText  = isResume
    ? `You started <strong>${surveyTitle}</strong> but didn't quite finish. Your progress is saved — pick up exactly where you left off.`
    : `You've been invited to complete <strong>${surveyTitle}</strong>. It only takes a few minutes and every answer makes a difference.`;
  const ctaText   = isResume ? 'Resume Survey →' : 'Take the Survey →';
  const footerNote = isResume
    ? 'You received this because you started this survey. Your answers are saved.'
    : 'You received this because someone shared this survey with you.';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${headline}</title>
</head>
<body style="margin:0;padding:0;background:#F7F2EB;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F2EB;padding:40px 20px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFDF8;border-radius:20px;overflow:hidden;box-shadow:0 4px 32px rgba(22,15,8,0.08);">

      <!-- Header bar -->
      <tr>
        <td style="background:#160F08;padding:22px 36px;">
          <table cellpadding="0" cellspacing="0"><tr>
<<<<<<< HEAD
            <td style="font-family:Arial,sans-serif;font-size:8px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:rgba(253,245,232,0.4);padding-right:6px;vertical-align:middle;">NEXORA</td>
=======
            <td style="font-family:Arial,sans-serif;font-size:8px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:rgba(253,245,232,0.4);padding-right:6px;vertical-align:middle;">Axiora</td>
>>>>>>> fd890e68ca3c9bca4a377f929c0986334677b689
            <td style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#FDF5E8;letter-spacing:-0.5px;vertical-align:middle;">Pulse</td>
            <td style="width:8px;height:8px;background:#FF4500;border-radius:50%;vertical-align:top;padding-top:4px;padding-left:6px;"></td>
          </tr></table>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="padding:40px 36px 32px;">
          <p style="font-family:Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#FF4500;margin:0 0 14px;">${isResume ? 'Resume' : 'Invitation'}</p>
          <h1 style="font-family:Georgia,serif;font-size:28px;font-weight:700;letter-spacing:-1px;color:#160F08;margin:0 0 20px;line-height:1.15;">${headline}</h1>
          <p style="font-family:Arial,sans-serif;font-size:13px;font-weight:400;color:rgba(22,15,8,0.55);margin:0 0 6px;">${greeting}</p>
          <p style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:rgba(22,15,8,0.7);margin:0 0 32px;">${bodyText}</p>

          <!-- CTA button -->
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="background:#160F08;border-radius:999px;">
              <a href="${surveyUrl}" style="display:inline-block;padding:14px 36px;font-family:Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#FDF5E8;text-decoration:none;">${ctaText}</a>
            </td>
          </tr></table>

          <!-- Fallback link -->
          <p style="font-family:Arial,sans-serif;font-size:11px;color:rgba(22,15,8,0.3);margin:20px 0 0;line-height:1.6;">
            Or copy this link:<br/>
            <a href="${surveyUrl}" style="color:#FF4500;word-break:break-all;">${surveyUrl}</a>
          </p>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="padding:20px 36px 28px;border-top:1px solid rgba(22,15,8,0.07);">
          <p style="font-family:Arial,sans-serif;font-size:11px;color:rgba(22,15,8,0.3);margin:0;line-height:1.6;">${footerNote}</p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

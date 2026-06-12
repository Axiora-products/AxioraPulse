import API from '../api/axios';

/**
 * OTP API helpers for phone-based login and phone management.
 */

// ── Login flow (unauthenticated — use fetch with base URL) ───────────────────
const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export async function sendLoginOTP(phoneNumber) {
  const res = await fetch(`${BASE_URL}/auth/otp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone_number: phoneNumber }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || 'Failed to send OTP');
  }
  return res.json();
}

export async function verifyLoginOTP(phoneNumber, otpCode) {
  const res = await fetch(`${BASE_URL}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone_number: phoneNumber, otp_code: otpCode }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || 'OTP verification failed');
  }
  return res.json();
}

// ── Phone link flow (authenticated — use axios with token) ───────────────────

export async function sendPhoneLinkOTP(phoneNumber) {
  const res = await API.post('/auth/otp/phone/send', { phone_number: phoneNumber });
  return res.data;
}

export async function verifyPhoneLinkOTP(phoneNumber, otpCode) {
  const res = await API.post('/auth/otp/phone/verify', { phone_number: phoneNumber, otp_code: otpCode });
  return res.data;
}

export async function removePhone() {
  const res = await API.delete('/auth/otp/phone/remove');
  return res.data;
}

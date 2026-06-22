/**
 * lib/messages.js
 * ───────────────
 * Standardized, user-friendly notification copy used across the app so success
 * and error feedback stays consistent. Never put raw API/exception text here.
 */

export const SUCCESS = {
  LOGIN: 'Login successful.',
  LOGOUT: 'You have been signed out.',
  REGISTER: 'Account created successfully.',
  SURVEY_PUBLISHED: 'Survey published successfully.',
  SURVEY_CREATED: 'Survey created successfully.',
  SURVEY_UPDATED: 'Survey updated successfully.',
  SURVEY_DELETED: 'Survey deleted successfully.',
  SURVEY_DUPLICATED: 'Survey duplicated successfully.',
  PROFILE_UPDATED: 'Profile updated successfully.',
  PASSWORD_CHANGED: 'Password changed successfully.',
  SAVED: 'Changes saved successfully.',
  USER_CREATED: 'User created successfully.',
  USER_UPDATED: 'User updated successfully.',
  USER_DELETED: 'User deleted successfully.',
  INVITE_SENT: 'Invitation sent successfully.',
  EMAIL_SENT: 'Email sent successfully.',
  COPIED: 'Copied to clipboard.',
  UPLOADED: 'File uploaded successfully.',
  SENT: 'Sent successfully.',
};

export const ERROR = {
  GENERIC: 'Something went wrong. Please try again.',
  NETWORK: 'Connection lost. Please check your internet connection.',
  TIMEOUT: 'The request took too long. Please try again.',
  SERVER: 'Something went wrong on our end. Please try again shortly.',
  UNAUTHORIZED: 'Your session has expired. Please log in again.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  NOT_FOUND: 'We could not find what you were looking for.',
  VALIDATION: 'Please fill in all required fields correctly.',
  RATE_LIMITED: 'Too many requests. Please slow down and try again shortly.',
  FILE_TOO_LARGE: 'That file is too large. Please choose a smaller file.',
  CONFLICT: 'That action conflicts with existing data. Please refresh and try again.',
  LOGIN_FAILED: 'Login failed. Please check your email and password.',
  PAYMENT_FAILED: 'We could not process the payment. Please try again.',
};

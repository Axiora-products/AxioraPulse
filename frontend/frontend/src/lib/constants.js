export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  MANAGER: 'manager',
  CREATOR: 'creator',
  VIEWER: 'viewer',
};

export const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  manager: 'Manager',
  creator: 'Creator',
  viewer: 'Viewer',
};

export const ROLE_COLORS = {
  super_admin: 'bg-purple-50 text-purple-700 border-purple-200',
  admin: 'bg-red-50 text-red-700 border-red-200',
  manager: 'bg-pri-50 text-pri-700 border-pri-200',
  creator: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  viewer: 'bg-ink-100 text-ink-600 border-ink-200',
};

// Who can do what
export const PERMISSIONS = {
  create_survey: ['super_admin', 'admin', 'manager', 'creator'],
  edit_any_survey: ['super_admin', 'admin'],
  delete_survey: ['super_admin', 'admin'],
  view_analytics: ['super_admin', 'admin', 'manager', 'creator'],
  manage_team: ['super_admin', 'admin'],
  view_audit: ['super_admin', 'admin'],
  manage_tenant: ['super_admin'],
  resume_survey: ['super_admin', 'admin', 'manager'],
  share_survey: ['super_admin', 'admin', 'manager', 'creator'],
};

export function hasPermission(userRole, action) {
  return PERMISSIONS[action]?.includes(userRole) ?? false;
}

export const QUESTION_TYPES = [
  { value: 'short_text',      label: 'Short Text',      icon: 'Aa' },
  { value: 'long_text',       label: 'Long Text',        icon: '¶'  },
  { value: 'single_choice',   label: 'Single Choice',    icon: '◉'  },
  { value: 'multiple_choice', label: 'Multiple Choice',  icon: '◻'  },
  { value: 'rating',          label: 'Star Rating',      icon: '★'  },
  { value: 'scale',           label: 'Scale (1–10)',     icon: '1→'  },
  { value: 'yes_no',          label: 'Yes / No',         icon: '⊙'  },
  { value: 'dropdown',        label: 'Dropdown',         icon: '⌄'  },
  { value: 'number',          label: 'Number',           icon: '#'  },
  { value: 'email',           label: 'Email',            icon: '@'  },
  { value: 'date',            label: 'Date',             icon: '◷'  },
  { value: 'ranking',         label: 'Ranking',          icon: '↕'  },
  { value: 'slider',          label: 'Slider',           icon: '—'  },
  { value: 'matrix',          label: 'Matrix / Grid',    icon: '⊞'  },
];

// Question types that use options arrays
export const OPTION_TYPES = [
  'single_choice', 'multiple_choice', 'dropdown', 'ranking',
];

// Matrix needs a special options structure { rows, columns }
export const MATRIX_TYPE = 'matrix';

// Question types where options are NOT needed
export const TEXT_TYPES = [
  'short_text', 'long_text', 'email', 'number', 'date', 'slider',
];

export const SURVEY_STATUS = {
  draft: { label: 'Draft', class: 'badge-draft' },
  active: { label: 'Active', class: 'badge-active' },
  paused: { label: 'Paused', class: 'badge-paused' },
  expired: { label: 'Expired', class: 'badge-expired' },
  closed: { label: 'Closed', class: 'badge-closed' },
};

// Generate a unique slug for surveys
export function generateSlug(length = 10) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let slug = '';
  for (let i = 0; i < length; i++) {
    slug += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return slug;
}

// Generate slug with DB uniqueness check is handled server-side.
// This local version is kept only for local UI preview (no DB check).
export async function generateUniqueSlug(_unused, length = 10) {
  return generateSlug(length);
}


// Format date nicely
export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export function timeAgo(dateStr) {
  if (!dateStr) return '';
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return formatDate(dateStr);
}

export function isExpired(expiresAt) {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

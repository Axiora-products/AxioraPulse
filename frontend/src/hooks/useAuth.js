import { create } from 'zustand';
import API from '../api/axios';
import { cognitoGetCurrentSession, cognitoSignOut } from '../lib/cognito';

const useAuthStore = create((set, get) => ({
  user: null,
  profile: null,
  tenant: null,
  loading: true,
  initialized: false,

  // ── Initialize: called once on app load ───────────────────────────────────
  initialize: async (force = false) => {
    if (get().initialized && !force) return;
    set({ loading: true });
    try {
      const session = await cognitoGetCurrentSession();
      const idToken = session.getIdToken().getJwtToken();
      localStorage.setItem('token', idToken);

      // Link cognito_sub in DB for existing users whose sub isn't set yet
      await API.post('/auth/sync', { id_token: idToken });

      const res = await API.get('/auth/me');
      const { user, profile, tenant } = res.data;
      set({ user, profile, tenant, loading: false, initialized: true });
    } catch {
      cognitoSignOut();
      localStorage.removeItem('token');
      set({ user: null, profile: null, tenant: null, loading: false, initialized: true });
    }
  },

  // ── checkSession: validate stored session (called by ProtectedRoute) ──────
  checkSession: async () => {
    try {
      const session = await cognitoGetCurrentSession();
      const idToken = session.getIdToken().getJwtToken();
      localStorage.setItem('token', idToken);

      // Link cognito_sub in DB for existing users whose sub isn't set yet
      await API.post('/auth/sync', { id_token: idToken });

      const res = await API.get('/auth/me');
      const { user, profile, tenant } = res.data;
      set({ user, profile, tenant, loading: false, initialized: true });
      return true;
    } catch {
      cognitoSignOut();
      localStorage.removeItem('token');
      set({ user: null, profile: null, tenant: null, loading: false });
      return false;
    }
  },

  // ── loadProfile: reload user data ────────────────────────────────────────
  loadProfile: async () => {
    try {
      const res = await API.get('/auth/me');
      const { user, profile, tenant } = res.data;
      set({ user, profile, tenant, loading: false });
    } catch {
      set({ user: null, profile: null, tenant: null, loading: false });
    }
  },

  // ── signOut ───────────────────────────────────────────────────────────────
  signOut: async () => {
    cognitoSignOut();
    localStorage.removeItem('token');
    set({ user: null, profile: null, tenant: null, initialized: false });
    window.location.href = '/login';
  },

  // ── updateProfile ─────────────────────────────────────────────────────────
  updateProfile: async (updates) => {
    const res = await API.patch('/auth/me/profile', updates);
    set({ profile: res.data });
    return res.data;
  },

  // ── updateTenant ──────────────────────────────────────────────────────────
  updateTenant: async (updates) => {
    const res = await API.patch('/tenants/me', updates);
    set({ tenant: res.data });
    return res.data;
  },
}));

export default useAuthStore;

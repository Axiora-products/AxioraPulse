import { create } from 'zustand';
import API from '../api/axios';
import { cognitoGetCurrentSession, cognitoSignOut, setAuthConfig } from '../lib/cognito';

const useAuthStore = create((set, get) => ({
  user: null,
  profile: null,
  tenant: null,
  loading: true,
  initialized: false,

  // ── Initialize: called once on app load ───────────────────────────────────
  initialize: async (force = false, syncParams = {}) => {
    if (get().initialized && !force) return;
    set({ loading: true });

    const token = localStorage.getItem('token');
    if (token) {
      try {
        const res = await API.get('/auth/me');
        const { user, profile, tenant } = res.data;
        set({ user, profile, tenant, loading: false, initialized: true });
        return;
      } catch (meErr) {
        // Token is invalid/expired; fall back to Cognito session restoration
      }
    }

    try {
      // Fetch dynamic AWS Cognito credentials from backend before checking authentication session
      const configRes = await API.get('/auth/config');
      setAuthConfig(configRes.data);

      const session = await cognitoGetCurrentSession();
      const idToken = session.getIdToken().getJwtToken();
      localStorage.setItem('token', idToken);

      await API.post('/auth/sync', { id_token: idToken, ...syncParams });

      const res = await API.get('/auth/me');
      const { user, profile, tenant } = res.data;
      set({ user, profile, tenant, loading: false, initialized: true });
    } catch (err) {
      if (err?.message !== 'No authenticated user') {
        console.error("Auth session initialization failed:", err);
      }
      const status = err?.response?.status;
      const isAxiosError = !!err?.config;
      // Nuke session only for local Cognito failures or explicit 401/403 auth errors.
      // Do not nuke for aborted requests (like page navigation unloads), network drops, or 500s.
      if (!isAxiosError || status === 401 || status === 403) {
        cognitoSignOut();
        localStorage.removeItem('token');
      }
      set({ user: null, profile: null, tenant: null, loading: false, initialized: true });
    }
  },

  // ── checkSession: validate stored session (called by ProtectedRoute) ──────
  checkSession: async () => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const res = await API.get('/auth/me');
        const { user, profile, tenant } = res.data;
        set({ user, profile, tenant, loading: false, initialized: true });
        return true;
      } catch (meErr) {
        // Token is invalid/expired; fall back to Cognito session restoration
      }
    }

    try {
      const session = await cognitoGetCurrentSession();
      const idToken = session.getIdToken().getJwtToken();
      localStorage.setItem('token', idToken);

      const res = await API.get('/auth/me');
      const { user, profile, tenant } = res.data;
      set({ user, profile, tenant, loading: false, initialized: true });
      return true;
    } catch (err) {
      if (err?.message !== 'No authenticated user') {
        console.error("Session check failed:", err);
      }
      const status = err?.response?.status;
      const isAxiosError = !!err?.config;
      // Nuke session only for local Cognito failures or explicit 401/403 auth errors.
      // Do not nuke for aborted requests (like page navigation unloads), network drops, or 500s.
      if (!isAxiosError || status === 401 || status === 403) {
        cognitoSignOut();
        localStorage.removeItem('token');
        set({ user: null, profile: null, tenant: null, loading: false });
      }
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

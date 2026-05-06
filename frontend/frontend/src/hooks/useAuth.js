import { create } from 'zustand';
import API from '../api/axios';

/**
 * useAuth.js — FastAPI-backed Zustand auth store
 *
 * Replaces Supabase auth completely. Uses JWT stored in localStorage.
 * initialize()  → GET /auth/me (hydrates profile + tenant on app load)
 * updateProfile → PATCH /auth/me/profile
 * updateTenant  → PATCH /tenants/me
 * signOut       → clear token
 */

const useAuthStore = create((set, get) => ({
  user: null,
  profile: null,
  tenant: null,
  loading: true,
  initialized: false,

  // ── Initialize: called once on app load ───────────────────────────────────
  initialize: async (force = false) => {
    if (get().initialized && !force) return;
    set({ loading: true }); // Ensure loading state is set when re-initializing
    const token = localStorage.getItem('token');
    if (!token) {
      set({ loading: false, initialized: true });
      return;
    }
    try {
      const res = await API.get('/auth/me');
      const { user, profile, tenant } = res.data;
      set({ user, profile, tenant, loading: false, initialized: true });
    } catch {
      // Token invalid or expired → clear it
      localStorage.removeItem('token');
      set({ user: null, profile: null, tenant: null, loading: false, initialized: true });
    }
  },

  // ── checkSession: validate stored token (called by ProtectedRoute) ────────
  checkSession: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      set({ user: null, profile: null, tenant: null, loading: false });
      return false;
    }
    try {
      const res = await API.get('/auth/me');
      const { user, profile, tenant } = res.data;
      set({ user, profile, tenant, loading: false, initialized: true });
      return true;
    } catch {
      localStorage.removeItem('token');
      set({ user: null, profile: null, tenant: null, loading: false });
      return false;
    }
  },

  // ── loadProfile: reload user data from /auth/me ───────────────────────────
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
    localStorage.removeItem('token');
    set({ user: null, profile: null, tenant: null, initialized: false });
    window.location.href = '/login';
  },

  // ── updateProfile: PATCH /auth/me/profile ────────────────────────────────
  updateProfile: async (updates) => {
    const res = await API.patch('/auth/me/profile', updates);
    set({ profile: res.data });
    return res.data;
  },

  // ── updateTenant: PATCH /tenants/me ──────────────────────────────────────
  updateTenant: async (updates) => {
    const res = await API.patch('/tenants/me', updates);
    set({ tenant: res.data });
    return res.data;
  },
}));

export default useAuthStore;

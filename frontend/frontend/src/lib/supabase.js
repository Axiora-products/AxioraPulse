/**
 * supabase.js — STUB
 * Supabase has been fully replaced by the FastAPI backend.
 * This file exists only to prevent crashes from any stale imports
 * that may not have been updated yet. All methods are no-ops.
 */

export const supabase = {
  from: () => ({
    select: () => Promise.resolve({ data: null, error: new Error('Supabase removed') }),
    insert: () => Promise.resolve({ data: null, error: new Error('Supabase removed') }),
    update: () => Promise.resolve({ data: null, error: new Error('Supabase removed') }),
    delete: () => Promise.resolve({ data: null, error: new Error('Supabase removed') }),
    upsert: () => Promise.resolve({ data: null, error: new Error('Supabase removed') }),
    eq: function() { return this; },
    order: function() { return this; },
    limit: function() { return this; },
    single: function() { return this; },
    maybeSingle: function() { return this; },
  }),
  auth: {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signInWithPassword: () => Promise.resolve({ data: null, error: new Error('Supabase removed') }),
    signOut: () => Promise.resolve(),
    updateUser: () => Promise.resolve({ data: null, error: new Error('Supabase removed') }),
    refreshSession: () => Promise.resolve({ data: { session: null }, error: null }),
    startAutoRefresh: () => {},
    stopAutoRefresh: () => {},
  },
  channel: () => ({
    on: function() { return this; },
    subscribe: function() { return this; },
  }),
  removeChannel: () => {},
};

/** callFunction stub — Netlify functions no longer used. */
export async function callFunction(name, body = {}) {
  console.warn(`[stub] callFunction('${name}') called — Netlify functions are removed.`);
  return {};
}

import { create } from 'zustand';
import { getSubscription } from '../api/paymentApi';

const useSubscription = create((set, get) => ({
  subscription: null,
  loading: false,
  loaded: false,

  load: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const data = await getSubscription();
      set({ subscription: data, loading: false, loaded: true });
    } catch {
      // 404 = free plan, no subscription row yet
      set({ subscription: null, loading: false, loaded: true });
    }
  },

  clear: () => set({ subscription: null, loaded: false }),
}));

export default useSubscription;

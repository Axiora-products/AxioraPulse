import { create } from 'zustand';

const usePaymentWall = create((set) => ({
  open: false,
  message: '',
  show: (message) => set({ open: true, message }),
  hide: () => set({ open: false, message: '' }),
}));

export default usePaymentWall;

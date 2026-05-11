import API from './axios';

export async function getPlans() {
  const res = await API.get('/payments/plans');
  return res.data;
}

export async function createOrder(plan_code) {
  const res = await API.post('/payments/create-order', { plan_code });
  return res.data;
}

export async function verifyPayment(data) {
  const res = await API.post('/payments/verify', data);
  return res.data;
}

export async function getSubscription() {
  const res = await API.get('/payments/subscription');
  return res.data;
}

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return; }
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export async function openCheckout({ order, planCode, profile, onSuccess, onError }) {
  const loaded = await loadRazorpayScript();
  if (!loaded) { onError('Failed to load payment gateway. Please try again.'); return; }

  const rzp = new window.Razorpay({
    key: order.key_id,
    amount: order.amount,
    currency: order.currency,
    name: 'AxioraPulse',
    description: `${planCode.charAt(0).toUpperCase() + planCode.slice(1)} Plan`,
    order_id: order.order_id,
    prefill: {
      name: profile?.full_name || '',
      email: profile?.email || '',
    },
    theme: { color: '#FF4500' },
    handler: async (response) => {
      try {
        await verifyPayment({
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
          plan_code: planCode,
        });
        onSuccess();
      } catch (err) {
        onError(err?.response?.data?.detail || 'Payment verification failed. Contact support.');
      }
    },
  });
  rzp.open();
}

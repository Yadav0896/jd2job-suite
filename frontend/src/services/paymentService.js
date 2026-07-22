/**
 * paymentService — Razorpay integration for credit purchases.
 *
 * Flow:
 *  1. Client calls backend /api/payments/create-order with planId (price set server-side)
 *  2. Backend creates Razorpay order, returns order ID
 *  3. Client opens Razorpay checkout modal
 *  4. On success, backend /api/payments/verify verifies signature (replay-protected)
 *  5. Backend adds credits to user profile
 */

import { getSession } from './supabaseClient';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export async function createOrder(userId, planId) {
  const session = await getSession();
  const token = session?.access_token || '';
  const res = await fetch(`${API_BASE}/api/payments/create-order`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    },
    // Amount is derived server-side from planId — never sent by the client.
    body: JSON.stringify({ planId }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => 'Unknown error');
    throw new Error(`Failed to create order: ${err}`);
  }
  return res.json();
}

export async function verifyPayment(razorpayPaymentId, razorpayOrderId, razorpaySignature, userId) {
  const session = await getSession();
  const token = session?.access_token || '';
  const res = await fetch(`${API_BASE}/api/payments/verify`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    },
    body: JSON.stringify({
      razorpay_payment_id: razorpayPaymentId,
      razorpay_order_id: razorpayOrderId,
      razorpay_signature: razorpaySignature,
      userId,
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => 'Unknown error');
    throw new Error(`Payment verification failed: ${err}`);
  }
  return res.json();
}

/**
 * Open Razorpay checkout and return resolved promise with payment result.
 * Requires window.Razorpay (loaded via script tag).
 */
export function openRazorpayCheckout({ orderId, amountINR, userId, userName, userEmail }) {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.Razorpay) {
      reject(new Error('Razorpay SDK not loaded'));
      return;
    }

    const options = {
      key: import.meta.env.VITE_RAZORPAY_KEY_ID || '',
      amount: amountINR * 100, // Razorpay uses paise
      currency: 'INR',
      name: 'Jd2Job',
      description: 'Credit Purchase',
      order_id: orderId,
      prefill: {
        name: userName || '',
        email: userEmail || '',
      },
      theme: { color: '#912f56' },
      handler: async (response) => {
        try {
          const result = await verifyPayment(
            response.razorpay_payment_id,
            response.razorpay_order_id,
            response.razorpay_signature,
            userId
          );
          resolve(result);
        } catch (err) {
          reject(err);
        }
      },
      modal: {
        ondismiss: () => {
          resolve({ cancelled: true });
        },
      },
    };

    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', (response) => {
      reject(new Error(response.error?.description || 'Payment failed'));
    });
    rzp.open();
  });
}

const PRICING_PACKAGES = [
  { id: 'base', label: 'Base Plan', amountINR: 999, credits: 5, description: '5 session credits per month. (Max 40 mins/session)', type: 'subscription' },
  { id: 'topup', label: 'Credit Top-up', amountINR: 249, credits: 1, description: '1 extra session credit. (Requires active base plan)', type: 'topup' },
  { id: 'monthly_unlimited', label: 'Monthly Unlimited', amountINR: 3999, credits: 999999, description: 'Unlimited interview sessions for 1 month.', type: 'subscription' },
  { id: 'quarterly_unlimited', label: 'Quarterly Unlimited', amountINR: 9999, credits: 999999, description: 'Unlimited sessions for 3 months (Best Value).', type: 'subscription' },
];

export { PRICING_PACKAGES };

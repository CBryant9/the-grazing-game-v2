/**
 * The browser's side of billing: plain calls to the billing routes and the words they answer in.
 * Nothing here knows a price or a formula. A price shown is a price the server sent, and the
 * charge is made from the server's own table (the browser only names a product id).
 */

export interface StoreItem {
  id: string;
  name: string;
  priceText: string;
  gives: string[];
  confirm: string;
}

export interface StoreAnswer {
  selling: boolean;
  signedIn: boolean;
  cannotBuy: string | null;
  items: StoreItem[];
}

export interface MyPurchase {
  id: string;
  product: string;
  amountCents: number;
  status: 'pending' | 'paid' | 'refunded' | 'disputed';
  paidAt: string | null;
  canReceipt: boolean;
}

export interface MineAnswer {
  available: boolean;
  signedIn: boolean;
  purchases: MyPurchase[];
}

export interface OfferAnswer {
  offer: {
    productId: string;
    farmId: string;
    farmName: string;
    priceText: string;
    does: string[];
  } | null;
}

const GENERIC = 'Something went wrong. Nothing was charged. Try again in a moment.';

async function call<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('The game could not be reached. Check your connection and try again.');
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: unknown }) | null;
  if (!res.ok || data === null) {
    throw new Error(typeof data?.error === 'string' ? data.error : GENERIC);
  }
  return data;
}

export const billingApi = {
  store: () => call<StoreAnswer>('/api/billing/store'),
  mine: () => call<MineAnswer>('/api/billing/mine'),
  offer: (farm: string) => call<OfferAnswer>(`/api/billing/offer?farm=${encodeURIComponent(farm)}`),
  receipt: (id: string) =>
    call<{ url: string | null }>(`/api/billing/receipt?purchase=${encodeURIComponent(id)}`),
  status: (id: string) =>
    call<{ status: string; product: string }>(
      `/api/billing/status?purchase=${encodeURIComponent(id)}`,
    ),
  buy: (product: string, farm?: string) =>
    call<{ url: string }>('/api/billing/checkout', farm ? { product, farm } : { product }),
};

/** Go to Stripe's page. Only an address on https is followed. */
export function goToCheckout(url: string): void {
  if (/^https:\/\//.test(url) || /^\/purchase\//.test(url)) window.location.assign(url);
  else if (url.startsWith(window.location.origin + '/purchase/')) window.location.assign(url);
}

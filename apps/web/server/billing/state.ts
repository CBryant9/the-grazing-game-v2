import 'server-only';
import { featureSwitches, type AuthDeps } from '../auth/accounts';
import { authDeps } from '../auth/deps';
import { paymentsProvider, type PaymentsProvider } from './payments';

/**
 * Is anything for sale on this copy? Only when all three hold: accounts are on, Stripe keys are
 * set, and the `purchases` feature switch is on. Anything less and the store says nothing is for
 * sale, there is no buy button, and every billing route refuses with a plain 404 or an empty list,
 * never a 5xx.
 */
export interface BillingState {
  deps: AuthDeps | null;
  payments: PaymentsProvider | null;
  switchOn: boolean;
  /** Accounts, keys and the switch: the store is open. */
  selling: boolean;
}

export async function billingState(): Promise<BillingState> {
  const deps = authDeps();
  const payments = paymentsProvider();
  const switchOn = deps ? (await featureSwitches(deps.sql)).purchases : false;
  return { deps, payments, switchOn, selling: Boolean(deps && payments && switchOn) };
}

export const NOT_FOR_SALE = 'Nothing is for sale on this copy of the game yet.';

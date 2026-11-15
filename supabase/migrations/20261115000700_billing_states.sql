-- m5.2 Purchases: what the billing code needs on top of 3.1's money tables.
-- No table is new. Nothing here is readable by a browser role: the server (service_role)
-- keeps the purchase states, and a player reads their own rows through the existing
-- column grants (which do not include the new column).

-- A charge a bank has disputed takes the entitlement away until the dispute is won
-- (PRD 10.3 says nothing on disputes; this is a stated call, see the m5.2 log entry).
alter table public.purchases drop constraint purchases_status_check;
alter table public.purchases add constraint purchases_status_check
  check (status in ('pending', 'paid', 'refunded', 'disputed', 'failed'));

-- Paying to keep going: when the rescue was applied to the farm. Set once, by a guarded
-- update, so a replayed event or a second try can never rescue twice.
alter table public.purchases add column applied_at timestamptz;

-- One open checkout per account, product and farm. A double click or a retried request
-- finds the first one instead of making a second.
create unique index purchases_one_pending
  on public.purchases (user_id, product_id, coalesce(farm_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'pending';

-- Refund and dispute events name the payment, not the session.
create index purchases_payment_intent
  on public.purchases (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

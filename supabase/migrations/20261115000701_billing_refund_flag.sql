-- m5.2 second pass: a payment that came in for something the account already owned
-- (two pack checkouts both paid) is marked here so the admin purchases page can list it
-- for a refund. Server only: no browser role is granted this column.
alter table public.purchases add column needs_refund boolean not null default false;

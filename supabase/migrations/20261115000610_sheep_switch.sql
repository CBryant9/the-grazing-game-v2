-- The sheep feature switch (milestone 2.8), at its launch default in
-- FEATURE_SWITCHES (packages/shared): off. A test checks the seed matches
-- the shared defaults key for key.
insert into public.feature_switches (key, enabled) values
  ('sheep', false)
on conflict (key) do nothing;

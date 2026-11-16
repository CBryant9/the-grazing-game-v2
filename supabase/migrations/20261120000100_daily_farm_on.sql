-- Daily Farm is on (PRD 11.7 had it on; 20261115000400 set it off until Claudia turned it on).
-- Claudia asked for it on 15 November 2026: "I would also like you to turn on the daily farm ...
-- I want to be able to get on and try both rounds of gameplay." (docs/REQUIREMENTS.md)
-- packages/shared FEATURE_SWITCHES says the same, and a test checks they match.
--
-- `updated_by is null` only: a switch an admin has already set by hand is left as they set it.

update public.feature_switches set enabled = true where key = 'daily_farm' and updated_by is null;

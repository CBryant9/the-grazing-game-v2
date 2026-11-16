-- Day cards carry job and farm facts only (PRD 9.3, m7.1). The diary keeps every line in `lines`;
-- the lines a day card may carry are picked by the kind of line when the day is filed, never by
-- matching words, and kept here. Null on a day filed before this, which then makes no card.
-- `rain_mm` (already in the table) is now written when the day is kept.

alter table public.farm_days add column card_lines text[];

-- m3.2 second pass: a guest session that moved into an account is removed too.
--
-- `convert_guest` marks the session converted and moves the farm; the session row used to stay
-- for ever. Its only use after that is to refuse the old cookie (the farm no longer belongs to the
-- session), and that refusal does not need the row: a farm that is not owned by a guest session is
-- refused to every guest key. So converted sessions go with the other housekeeping, 30 days after
-- they moved. (Replaces the function from 20261115000100 with the same body plus one delete.)

create or replace function public.prune_housekeeping(p_now timestamptz default now())
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.rate_limit_hits where window_start < p_now - interval '2 days';
  delete from public.guest_sessions
    where converted_at is null and last_seen_at < p_now - interval '30 days';
  delete from public.guest_sessions
    where converted_at is not null and converted_at < p_now - interval '30 days';
  delete from public.farm_saves_aside where aside_at < p_now - interval '30 days';
end;
$$;

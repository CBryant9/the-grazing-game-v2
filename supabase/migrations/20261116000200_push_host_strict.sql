-- Milestone 5.5 security review: the push host guard reads a host the way a browser does.
--
-- The guard in 20261114000950_more_guards.sql took everything up to the first '/', ':', '?', '#'
-- or '@' as the host. A browser (and the sender, which uses the WHATWG URL parser) reads a
-- backslash as a slash, so 'https://evil.example\.push.apple.com/x' passed the guard as a
-- push.apple.com name while its real host is evil.example. The host part now allows only the
-- characters a host name can have (letters, digits, dots and hyphens), so anything a browser
-- could read another way is refused. The server checks the same allow-list first (store.ts).

create or replace function app.push_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host text := lower(substring(new.endpoint from '^https://([A-Za-z0-9.-]+)(:443)?/'));
begin
  if v_host is null or v_host like '.%' or v_host like '%.' or v_host like '%..%' or not exists (
    select 1 from public.push_service_hosts h
    where h.host = v_host or (h.include_subdomains and v_host like '%.' || h.host)
  ) then
    raise exception 'push_host_not_allowed: % is not a known web push service', coalesce(v_host, 'that address')
      using errcode = 'P0001', hint = 'push_host_not_allowed';
  end if;
  return new;
end;
$$;

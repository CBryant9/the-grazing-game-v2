-- m3.1 Database: foundation.
--
-- The rules for the whole database (docs/DATABASE.md):
--   * Every table has row level security switched on as it is made. With no
--     policy, nobody but the server (service_role) gets a row.
--   * Nothing in `public` is granted to the browser roles (anon, authenticated)
--     unless a later migration grants it on purpose, table by table.
--   * Helpers for the access rules live in the `app` schema, which is not
--     exposed by the Data API, so a browser can never call them directly.
--   * Security definer functions always set `search_path = ''` and name every
--     object with its schema.

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to anon, authenticated, service_role;

-- Supabase grants every new table, sequence and function in `public` to anon,
-- authenticated and service_role by default. Take that away for the browser
-- roles, so exposure is opt-in. (Supabase is moving to this as its own default.)
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;
-- Postgres also lets PUBLIC run every new function, and a per-schema default
-- can't take that away. Each migration that makes functions in `public`
-- revokes PUBLIC and grants each one on purpose (a test checks).

-- The server keeps full access to what it makes from here on.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to service_role;

-- Keeps updated_at right on every row change.
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Today's date in Sydney, from the server's clock. Ages (14 to join, 16 for
-- the community) are worked out on this date.
create or replace function app.sydney_date(p_at timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select (p_at at time zone 'Australia/Sydney')::date
$$;

create or replace function app.today_sydney()
returns date
language sql
stable
set search_path = ''
as $$
  select app.sydney_date(now())
$$;

-- Whole years old on a given date.
create or replace function app.age_on(p_dob date, p_on date)
returns integer
language sql
immutable
set search_path = ''
as $$
  select extract(year from age(p_on, p_dob))::integer
$$;

grant execute on function app.touch_updated_at() to service_role;

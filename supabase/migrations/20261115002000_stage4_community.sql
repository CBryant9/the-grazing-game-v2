-- Stage 4: boards and moderation.
--
-- 1. The word filter checks text only when the text changes. Before, it ran on every update, so a
--    post written before a word was added to the list could not even be removed by a moderator
--    (the removal is an update), and a group could not change hands.
-- 2. An index for the boards a player reads most: one board, one period, newest key, by score.

create or replace function app.words_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_text text;
begin
  if tg_table_name = 'profiles' then
    if (tg_op = 'INSERT' or new.username is distinct from old.username)
       and app.blocked_word_in(new.username, false) then
      raise exception 'word_filter: that username is not allowed' using errcode = 'P0001', hint = 'word_filter';
    end if;
    if tg_op = 'UPDATE'
       and new.display_name is not distinct from old.display_name
       and new.bio is not distinct from old.bio
       and new.town is not distinct from old.town
       and new.real_farm_name is not distinct from old.real_farm_name then
      return new;
    end if;
    v_text := concat_ws(' ', new.display_name, new.bio, new.town, new.real_farm_name);
  elsif tg_table_name = 'groups' then
    if tg_op = 'UPDATE' and new.name is not distinct from old.name
       and new.description is not distinct from old.description then
      return new;
    end if;
    v_text := concat_ws(' ', new.name, new.description);
  else
    if tg_op = 'UPDATE' and new.body is not distinct from old.body then
      return new;
    end if;
    v_text := new.body;
  end if;
  if app.blocked_word_in(v_text) then
    raise exception 'word_filter: that text is not allowed' using errcode = 'P0001', hint = 'word_filter';
  end if;
  return new;
end;
$$;

create index leaderboard_entries_read on public.leaderboard_entries
  (board, period, period_key, score desc, days desc)
  where challenge_id is null;
create index leaderboard_entries_challenge on public.leaderboard_entries (challenge_id, board, score desc)
  where challenge_id is not null;

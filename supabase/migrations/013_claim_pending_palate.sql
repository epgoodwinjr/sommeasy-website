-- 013 — claim_pending_palate(): the waiting palate is folded in exactly once.
--
-- An anonymous quiz rides the account as user_metadata.pending_palate
-- (attached at signup). The first signed-in load of "/" folds it into the
-- profile and must then remove it. Removing it through the auth API is a
-- read-modify-write, and it ran far too late: production wrote 23 restore
-- events for one account, Nov 12–17, 2026 (src/lib/pendingPalateRestore.js
-- tells the whole story).
--
-- This function removes the key, records the fold-in, and hands back what
-- the key held — in ONE transaction:
--   * exactly one caller wins. The row lock makes concurrent callers queue;
--     the second re-checks the WHERE clause after the first commits, finds
--     no key, and gets NULL (and records nothing);
--   * the claim and its quiz_completed row commit together, so no reload,
--     closed tab or dropped connection can leave a claim without its record
--     or a record without its claim;
--   * the event insert sits in its own sub-block: if it ever fails, the
--     claim still commits (an event failure must never break the user's
--     action — the ledger's one rule) and the warning lands in the log.
--
-- The client sends the event's payload (the same quizEventPayload shape
-- recordEvent writes) and when the quiz happened. The type is fixed here;
-- a client can't choose it. Users may already insert their own wine_events
-- rows with any payload under RLS, so this grants nothing new.
--
-- Security: SECURITY DEFINER so it may write auth.users, but it touches only
-- the CALLER's own row (auth.uid()) and only that one key. search_path is
-- pinned empty (every name is schema-qualified). Signed-in users only.
--
-- Production history: an earlier no-argument draft of this function was
-- applied on Nov 22, 2026 (migration "claim_pending_palate") and replaced
-- the same day; the drop below makes this file correct either way.

drop function if exists public.claim_pending_palate();

create or replace function public.claim_pending_palate(
  p_payload jsonb default '{}'::jsonb,
  p_occurred_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed jsonb;
begin
  if auth.uid() is null then
    return null;
  end if;

  with target as (
    select u.id, u.raw_user_meta_data -> 'pending_palate' as palate
      from auth.users u
     where u.id = auth.uid()
       and u.raw_user_meta_data ? 'pending_palate'
       for update
  )
  update auth.users u
     set raw_user_meta_data = u.raw_user_meta_data - 'pending_palate',
         updated_at = now()
    from target
   where u.id = target.id
  returning target.palate into claimed;

  if claimed is null then
    return null; -- nothing to claim, or another load claimed it first
  end if;

  begin
    insert into public.wine_events (user_id, event_type, payload, occurred_at)
    values (
      auth.uid(),
      'quiz_completed',
      coalesce(p_payload, '{}'::jsonb),
      coalesce(p_occurred_at, now())
    );
  exception when others then
    raise warning 'claim_pending_palate: quiz_completed insert failed: %', sqlerrm;
  end;

  return claimed;
end;
$$;

revoke all on function public.claim_pending_palate(jsonb, timestamptz) from public;
revoke all on function public.claim_pending_palate(jsonb, timestamptz) from anon;
grant execute on function public.claim_pending_palate(jsonb, timestamptz) to authenticated;

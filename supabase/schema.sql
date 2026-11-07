-- Gym app sync (src/lib/cloud.ts). Run once in Supabase → SQL Editor → New query → Run.
-- One table: every record the app saves (a set, a ticked meal, a shopping tick, a meta key) is one row per user.
-- The newest edit of a row wins (updated_at, the phone's clock in ms); deletes are kept as rows with deleted = true so
-- other phones learn about them. rev is a global counter: a phone asks for "everything after the last rev I saw".

create sequence if not exists public.rows_rev;

create table if not exists public.rows (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('set', 'meal', 'shop', 'meta')),
  key text not null,
  data jsonb,
  deleted boolean not null default false,
  updated_at bigint not null,
  rev bigint not null default nextval('public.rows_rev'),
  primary key (user_id, kind, key)
);
create index if not exists rows_user_rev on public.rows (user_id, rev);

alter table public.rows enable row level security;
drop policy if exists "read own rows" on public.rows;
create policy "read own rows" on public.rows for select to authenticated using ((select auth.uid()) = user_id);

-- Writes go through this function only: it upserts a batch and keeps the newer edit of each row.
create or replace function public.push_rows(items jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.rows (user_id, kind, key, data, deleted, updated_at, rev)
  select auth.uid(), x.kind, x.key, x.data, coalesce(x.deleted, false), x.updated_at, nextval('public.rows_rev')
  from jsonb_to_recordset(items) as x(kind text, key text, data jsonb, deleted boolean, updated_at bigint)
  on conflict (user_id, kind, key) do update
    set data = excluded.data, deleted = excluded.deleted, updated_at = excluded.updated_at, rev = excluded.rev
    where public.rows.updated_at <= excluded.updated_at;
end $$;

revoke all on function public.push_rows(jsonb) from public, anon;
grant execute on function public.push_rows(jsonb) to authenticated;

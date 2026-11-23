-- GymApp cloud: accounts (Supabase Auth), a copy of each phone's data, a weekly summary for the coach, and plans a coach sends.
-- Apply once to the GymApp project (Supabase dashboard → SQL, or `supabase db push`). Every table has row level security:
-- you see your own rows; a coach also sees the profile and summary of clients who joined with their code.

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  role text not null default 'client' check (role in ('client', 'coach')),
  name text not null default '' check (char_length(name) <= 60),
  coach_id uuid references public.profiles on delete set null,
  -- Coaches only: the code clients type to join.
  invite_code text unique,
  created_at timestamptz not null default now()
);

-- The phone's data as a backup file (src/lib/backup.ts format, without photos). Last write wins.
create table public.snapshots (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null,
  build text not null default '',
  updated_at timestamptz not null default now()
);

-- What the coach sees: src/lib/coach.ts clientStats.
create table public.stats (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- A program a coach sends one client (src/data/program.ts Template); the client takes it or not.
create table public.plans (
  id bigint generated always as identity primary key,
  coach_id uuid not null references public.profiles on delete cascade,
  client_id uuid not null references public.profiles on delete cascade,
  template jsonb not null,
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  applied_at timestamptz
);
create index plans_client on public.plans (client_id, created_at desc);
create index profiles_coach on public.profiles (coach_id);

alter table public.profiles enable row level security;
alter table public.snapshots enable row level security;
alter table public.stats enable row level security;
alter table public.plans enable row level security;

-- Is `client` one of the calling coach's clients?
create function public.is_my_client(client uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = client and p.coach_id = (select auth.uid()));
$$;

create policy "own profile" on public.profiles for select using (id = (select auth.uid()) or public.is_my_client(id));
create policy "create own profile" on public.profiles for insert with check (id = (select auth.uid()) and coach_id is null and invite_code is null);
-- Name only from the app; role, coach and code change through the functions below.
create policy "edit own profile" on public.profiles for update using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke update on public.profiles from authenticated;
grant update (name) on public.profiles to authenticated;

create policy "own snapshot" on public.snapshots for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own stats" on public.stats for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "coach reads client stats" on public.stats for select using (public.is_my_client(user_id));

create policy "client reads own plans" on public.plans for select using (client_id = (select auth.uid()) or coach_id = (select auth.uid()));
create policy "coach sends plans to own clients" on public.plans for insert with check (coach_id = (select auth.uid()) and public.is_my_client(client_id));
create policy "client marks a plan taken" on public.plans for update using (client_id = (select auth.uid())) with check (client_id = (select auth.uid()));
revoke update on public.plans from authenticated;
grant update (applied_at) on public.plans to authenticated;

-- Become a coach: gets an invite code (6 letters/digits, no look-alikes). Returns the code.
create function public.become_coach() returns text
language plpgsql security definer set search_path = '' as $$
declare code text;
begin
  select invite_code into code from public.profiles where id = (select auth.uid()) and role = 'coach';
  if code is not null then return code; end if;
  loop
    code := (select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '') from generate_series(1, 6));
    exit when not exists (select 1 from public.profiles where invite_code = code);
  end loop;
  update public.profiles set role = 'coach', invite_code = code where id = (select auth.uid());
  return code;
end $$;

-- Join a coach by their code (or leave, with null). Returns the coach's name, or null when the code is wrong.
create function public.join_coach(code text) returns text
language plpgsql security definer set search_path = '' as $$
declare coach public.profiles;
begin
  if code is null then
    update public.profiles set coach_id = null where id = (select auth.uid());
    return null;
  end if;
  select * into coach from public.profiles where invite_code = upper(trim(code)) and role = 'coach';
  if coach.id is null or coach.id = (select auth.uid()) then return null; end if;
  update public.profiles set coach_id = coach.id where id = (select auth.uid());
  return coach.name;
end $$;

revoke execute on function public.become_coach() from public, anon;
revoke execute on function public.join_coach(text) from public, anon;
revoke execute on function public.is_my_client(uuid) from public, anon;
grant execute on function public.become_coach() to authenticated;
grant execute on function public.join_coach(text) to authenticated;
grant execute on function public.is_my_client(uuid) to authenticated;

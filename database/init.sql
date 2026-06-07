-- =============================================================================
-- Guida Malaga — inizializzazione database Supabase
-- Eseguire una sola volta nel SQL Editor di un progetto vuoto (o dopo reset).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Estensioni
-- -----------------------------------------------------------------------------
create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- -----------------------------------------------------------------------------
-- Tabelle
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext not null unique,
  display_name text,
  role text not null default 'user' check (role in ('user', 'admin')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  role text not null default 'user' check (role in ('user', 'admin')),
  invited_by uuid references public.profiles(id) default auth.uid(),
  accepted_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.planning_proposals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  day_date date not null,
  location text not null default '',
  place_id text,
  created_by uuid not null references public.profiles(id) default auth.uid(),
  status text not null default 'open' check (status in ('open', 'closed', 'approved', 'archived')),
  current_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.proposal_versions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.planning_proposals(id) on delete cascade,
  version_number integer not null,
  title text not null,
  description text not null default '',
  day_date date not null,
  location text not null default '',
  place_id text,
  changed_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (proposal_id, version_number)
);

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.planning_proposals(id) on delete cascade,
  proposal_version integer not null,
  user_id uuid not null references public.profiles(id) default auth.uid(),
  vote text not null check (vote in ('yes', 'maybe', 'no')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (proposal_id, proposal_version, user_id)
);

create table if not exists public.approved_plannings (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.planning_proposals(id) on delete cascade,
  approved_by uuid not null references public.profiles(id) default auth.uid(),
  approved_at timestamptz not null default now(),
  notes text not null default ''
);

-- -----------------------------------------------------------------------------
-- Funzioni helper
-- -----------------------------------------------------------------------------
create or replace function public.is_active_member(user_id_input uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = user_id_input
      and status = 'active'
  );
$$;

create or replace function public.is_admin(user_id_input uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = user_id_input
      and role = 'admin'
      and status = 'active'
  );
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.enforce_admin_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'admin' and coalesce(new.status, 'active') = 'active' then
    if (
      select count(*)
      from public.profiles
      where role = 'admin'
        and status = 'active'
        and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) >= 3 then
      raise exception 'Sono consentiti al massimo 3 admin attivi.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_admin_invite_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'admin' and new.accepted_at is null then
    if (
      (select count(*) from public.profiles where role = 'admin' and status = 'active') +
      (select count(*) from public.invites where role = 'admin' and accepted_at is null and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid))
    ) >= 3 then
      raise exception 'Sono consentiti al massimo 3 admin tra attivi e invitati.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- SQL Editor / manutenzione backend: nessun auth.uid(), modifica consentita.
  if auth.uid() is null then
    return new;
  end if;

  if not public.is_admin(auth.uid()) and (new.role is distinct from old.role or new.status is distinct from old.status) then
    raise exception 'Solo un admin puo modificare ruolo o stato.';
  end if;

  return new;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matching_invite public.invites;
begin
  select *
  into matching_invite
  from public.invites
  where lower(email::text) = lower(new.email)
    and accepted_at is null
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1;

  if matching_invite.id is null then
    insert into public.profiles (id, email, display_name, role, status)
    values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'user', 'disabled')
    on conflict (id) do nothing;
    return new;
  end if;

  insert into public.profiles (id, email, display_name, role, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    matching_invite.role,
    'active'
  )
  on conflict (id) do update
    set email = excluded.email,
        role = excluded.role,
        status = 'active',
        updated_at = now();

  update public.invites
  set accepted_at = now()
  where id = matching_invite.id;

  return new;
end;
$$;

create or replace function public.version_planning_proposal()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and (
    new.title is distinct from old.title or
    new.description is distinct from old.description or
    new.day_date is distinct from old.day_date or
    new.location is distinct from old.location or
    new.place_id is distinct from old.place_id
  ) then
    new.current_version = old.current_version + 1;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.record_proposal_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.current_version is distinct from old.current_version then
    insert into public.proposal_versions (
      proposal_id,
      version_number,
      title,
      description,
      day_date,
      location,
      place_id,
      changed_by
    )
    values (
      new.id,
      new.current_version,
      new.title,
      new.description,
      new.day_date,
      new.location,
      new.place_id,
      auth.uid()
    )
    on conflict (proposal_id, version_number) do nothing;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Trigger
-- -----------------------------------------------------------------------------
drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists profiles_admin_limit on public.profiles;
create trigger profiles_admin_limit
before insert or update on public.profiles
for each row execute function public.enforce_admin_limit();

drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role
before update on public.profiles
for each row execute function public.protect_profile_role();

drop trigger if exists invites_admin_limit on public.invites;
create trigger invites_admin_limit
before insert or update on public.invites
for each row execute function public.enforce_admin_invite_limit();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

drop trigger if exists planning_proposals_version on public.planning_proposals;
create trigger planning_proposals_version
before update on public.planning_proposals
for each row execute function public.version_planning_proposal();

drop trigger if exists planning_proposals_record_version on public.planning_proposals;
create trigger planning_proposals_record_version
after insert or update on public.planning_proposals
for each row execute function public.record_proposal_version();

drop trigger if exists votes_touch_updated_at on public.votes;
create trigger votes_touch_updated_at
before update on public.votes
for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.invites enable row level security;
alter table public.planning_proposals enable row level security;
alter table public.proposal_versions enable row level security;
alter table public.votes enable row level security;
alter table public.approved_plannings enable row level security;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update"
on public.profiles for update
to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

drop policy if exists "invites_admin_all" on public.invites;
create policy "invites_admin_all"
on public.invites for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "planning_select_active" on public.planning_proposals;
create policy "planning_select_active"
on public.planning_proposals for select
to authenticated
using (public.is_active_member());

drop policy if exists "planning_insert_active" on public.planning_proposals;
create policy "planning_insert_active"
on public.planning_proposals for insert
to authenticated
with check (public.is_active_member() and created_by = auth.uid());

drop policy if exists "planning_update_owner_admin" on public.planning_proposals;
create policy "planning_update_owner_admin"
on public.planning_proposals for update
to authenticated
using (public.is_active_member() and (created_by = auth.uid() or public.is_admin()))
with check (public.is_active_member() and (created_by = auth.uid() or public.is_admin()));

drop policy if exists "proposal_versions_select_active" on public.proposal_versions;
create policy "proposal_versions_select_active"
on public.proposal_versions for select
to authenticated
using (public.is_active_member());

drop policy if exists "votes_select_own" on public.votes;
create policy "votes_select_own"
on public.votes for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "votes_insert_own" on public.votes;
create policy "votes_insert_own"
on public.votes for insert
to authenticated
with check (public.is_active_member() and user_id = auth.uid());

drop policy if exists "votes_update_own" on public.votes;
create policy "votes_update_own"
on public.votes for update
to authenticated
using (public.is_active_member() and user_id = auth.uid())
with check (public.is_active_member() and user_id = auth.uid());

drop policy if exists "approved_select_active" on public.approved_plannings;
create policy "approved_select_active"
on public.approved_plannings for select
to authenticated
using (public.is_active_member());

drop policy if exists "approved_admin_all" on public.approved_plannings;
create policy "approved_admin_all"
on public.approved_plannings for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- API RPC (chiamate dal sito)
-- -----------------------------------------------------------------------------
create or replace function public.list_planning_proposals()
returns table (
  id uuid,
  title text,
  description text,
  day_date date,
  location text,
  place_id text,
  status text,
  current_version integer,
  created_at timestamptz,
  updated_at timestamptz,
  created_by_name text,
  can_edit boolean,
  my_vote text,
  yes_count bigint,
  maybe_count bigint,
  no_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.title,
    p.description,
    p.day_date,
    p.location,
    p.place_id,
    p.status,
    p.current_version,
    p.created_at,
    p.updated_at,
    coalesce(pr.display_name, 'Gruppo') as created_by_name,
    (p.created_by = auth.uid() or public.is_admin()) as can_edit,
    (
      select v.vote
      from public.votes v
      where v.proposal_id = p.id
        and v.proposal_version = p.current_version
        and v.user_id = auth.uid()
      limit 1
    ) as my_vote,
    count(v.*) filter (where v.vote = 'yes') as yes_count,
    count(v.*) filter (where v.vote = 'maybe') as maybe_count,
    count(v.*) filter (where v.vote = 'no') as no_count
  from public.planning_proposals p
  left join public.profiles pr on pr.id = p.created_by
  left join public.votes v
    on v.proposal_id = p.id
   and v.proposal_version = p.current_version
  where public.is_active_member()
    and p.status <> 'archived'
  group by p.id, pr.display_name
  order by
    case p.status when 'approved' then 0 when 'open' then 1 when 'closed' then 2 else 3 end,
    p.day_date,
    p.created_at;
$$;

-- Programma pubblico: leggibile anche senza login (anon)
create or replace function public.list_approved_program()
returns table (
  id uuid,
  title text,
  description text,
  day_date date,
  location text,
  place_id text,
  status text,
  current_version integer,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.title,
    p.description,
    p.day_date,
    p.location,
    p.place_id,
    p.status,
    p.current_version,
    p.created_at,
    p.updated_at
  from public.planning_proposals p
  where p.status = 'approved'
  order by p.day_date, p.created_at;
$$;

create or replace function public.approve_planning(proposal_id_input uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_date date;
begin
  if not public.is_admin() then
    raise exception 'Solo gli admin possono approvare il planning finale.';
  end if;

  select day_date into target_date
  from public.planning_proposals
  where id = proposal_id_input;

  if target_date is null then
    raise exception 'Proposta non trovata.';
  end if;

  update public.planning_proposals
  set status = case when id = proposal_id_input then 'approved' else status end
  where id = proposal_id_input;

  insert into public.approved_plannings (proposal_id, approved_by)
  values (proposal_id_input, auth.uid());
end;
$$;

-- -----------------------------------------------------------------------------
-- Permessi
-- -----------------------------------------------------------------------------
grant execute on function public.list_planning_proposals() to authenticated;
grant execute on function public.list_approved_program() to anon, authenticated;
grant execute on function public.approve_planning(uuid) to authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert, update on public.invites to authenticated;
grant select, insert, update on public.planning_proposals to authenticated;
grant select on public.proposal_versions to authenticated;
grant select, insert, update on public.votes to authenticated;
grant select, insert, update on public.approved_plannings to authenticated;

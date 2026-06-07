-- =============================================================================
-- Guida Malaga — creazione account admin (massimo 3 attivi)
-- Eseguire DOPO database/init.sql
-- =============================================================================
--
-- PASSI:
-- 1. Supabase → Authentication → Users → Add user
--    - Email e password
--    - Attiva "Auto Confirm User"
-- 2. Sostituisci le email qui sotto con quelle reali
-- 3. Esegui questo file nel SQL Editor
--
-- =============================================================================

-- Funzione di supporto: promuove un utente già presente in Authentication
create or replace function public.ensure_admin_profile(
  target_email text,
  target_display_name text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  user_id uuid;
  user_email citext;
begin
  select u.id, u.email::citext
  into user_id, user_email
  from auth.users u
  where lower(u.email) = lower(trim(target_email))
  limit 1;

  if user_id is null then
    raise exception 'Utente non trovato in Authentication: %. Crealo prima da Authentication → Add user.', target_email;
  end if;

  insert into public.profiles (id, email, display_name, role, status)
  values (
    user_id,
    user_email,
    coalesce(nullif(trim(target_display_name), ''), split_part(user_email::text, '@', 1)),
    'admin',
    'active'
  )
  on conflict (id) do update
  set email = excluded.email,
      display_name = coalesce(excluded.display_name, public.profiles.display_name),
      role = 'admin',
      status = 'active',
      updated_at = now();
end;
$$;

revoke all on function public.ensure_admin_profile(text, text) from public;
revoke all on function public.ensure_admin_profile(text, text) from anon;
revoke all on function public.ensure_admin_profile(text, text) from authenticated;

-- -----------------------------------------------------------------------------
-- Modifica le righe seguenti (1–3 admin)
-- -----------------------------------------------------------------------------

select public.ensure_admin_profile('admin1@example.com', 'Admin Uno');
-- select public.ensure_admin_profile('admin2@example.com', 'Admin Due');
-- select public.ensure_admin_profile('admin3@example.com', 'Admin Tre');

-- -----------------------------------------------------------------------------
-- Verifica
-- -----------------------------------------------------------------------------
select id, email, display_name, role, status, created_at
from public.profiles
where role = 'admin'
order by created_at;

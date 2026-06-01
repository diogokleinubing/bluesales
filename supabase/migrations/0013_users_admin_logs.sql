-- ============================================================================
-- Perfis de usuário (papel Admin) + log de logins
-- ============================================================================

-- Perfil espelha auth.users com o papel admin.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Helper: o usuário atual é admin? (SECURITY DEFINER evita recursão de RLS)
create or replace function is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select p.is_admin from profiles p where p.id = auth.uid()),
    false
  );
$$;

-- Policies de profiles:
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select to authenticated
  using (id = auth.uid() or is_admin());

drop policy if exists profiles_update_admin on profiles;
create policy profiles_update_admin on profiles for update to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists profiles_insert_self on profiles;
create policy profiles_insert_self on profiles for insert to authenticated
  with check (id = auth.uid());

-- Cria o profile automaticamente quando um usuário é criado no Auth.
create or replace function handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Popula profiles para usuários já existentes.
insert into profiles (id, email)
select u.id, u.email from auth.users u
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- Log de logins
-- ----------------------------------------------------------------------------
create table if not exists login_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  email text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists login_events_created_idx on login_events (created_at desc);

alter table login_events enable row level security;

-- Cada usuário registra o próprio login; só admin lê.
drop policy if exists login_events_insert_self on login_events;
create policy login_events_insert_self on login_events for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists login_events_select_admin on login_events;
create policy login_events_select_admin on login_events for select to authenticated
  using (is_admin());

grant execute on function is_admin() to authenticated;
revoke execute on function is_admin() from anon;

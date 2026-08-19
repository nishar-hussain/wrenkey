-- Bullet schema — run in Supabase SQL editor for project zycgtxsxnxwkxookawkl

-- 1. profiles (auto-created on auth.users insert via trigger)
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select using (auth.uid() = id);
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles for insert with check (auth.uid() = id);

-- Auto-create a profile row when a new auth.user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. handles (OAuth/email identities linked to a user)
create table if not exists public.handles (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  provider          text not null,
  subject           text,
  handle            text not null,
  handle_normalized text not null,
  linked_at         timestamptz not null default now()
);
create index if not exists handles_user_idx on public.handles (user_id);
create index if not exists handles_normalized_idx on public.handles (handle_normalized);
alter table public.handles enable row level security;
drop policy if exists handles_select_own on public.handles;
create policy handles_select_own on public.handles for select using (auth.uid() = user_id);

-- Auto-create handle rows on signup
create or replace function public.handle_new_user_handle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_handle text;
  v_normalized text;
  v_provider text;
begin
  v_provider := coalesce(new.raw_app_meta_data->>'provider', 'email');
  v_handle := coalesce(new.email, v_provider || ':' || new.id);
  v_normalized := lower(v_handle);
  insert into public.handles (user_id, provider, handle, handle_normalized, subject)
  values (new.id, v_provider, v_handle, v_normalized, new.id)
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created_handle on auth.users;
create trigger on_auth_user_created_handle
  after insert on auth.users
  for each row execute function public.handle_new_user_handle();

-- 3. wallets (one per user — the linked Stellar address + Bullet pubkey)
create table if not exists public.wallets (
  user_id           uuid primary key references public.profiles(id) on delete cascade,
  stellar_address   text not null,
  bullet_pubkey     text not null,
  signature         text not null,
  attached_at       timestamptz not null default now()
);
alter table public.wallets enable row level security;
drop policy if exists wallets_select_own on public.wallets;
create policy wallets_select_own on public.wallets for select using (auth.uid() = user_id);

-- 4. notes (encrypted inbox — public ciphertext, service-role writes)
create table if not exists public.notes (
  id                uuid primary key default gen_random_uuid(),
  recipient_pubkey  text not null,
  ephemeral_pubkey  text not null,
  nonce             text not null,
  ciphertext        text not null,
  created_at        timestamptz not null default now(),
  claimed_at        timestamptz,
  invite_id         uuid,
  custody_secret    text
);
create index if not exists notes_recipient_idx on public.notes (recipient_pubkey, created_at desc);
alter table public.notes enable row level security;
drop policy if exists notes_select_public on public.notes;
create policy notes_select_public on public.notes for select using (true);
revoke insert, update, delete on public.notes from anon, authenticated;

-- 5. activity (user's own send/claim history)
create table if not exists public.activity (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        text not null check (type in ('send', 'claim')),
  amount      bigint not null,
  token_id    integer not null default 0,
  tx_hash     text,
  handle      text,
  created_at  timestamptz not null default now()
);
create index if not exists activity_user_created_idx on public.activity (user_id, created_at desc);
alter table public.activity enable row level security;
revoke all on public.activity from anon, authenticated;

-- 6. pending_invites (send-to-unregistered-user custody flow)
create table if not exists public.pending_invites (
  id                      uuid primary key default gen_random_uuid(),
  sender_user_id          uuid not null references public.profiles(id) on delete cascade,
  handle_normalized       text not null,
  denom                   bigint not null,
  claim_payload           jsonb,
  custody_stellar_address text not null,
  custody_secret          text not null,
  expires_at              timestamptz not null,
  delivered_at            timestamptz,
  claimed_at              timestamptz,
  refunded_at             timestamptz,
  created_at              timestamptz not null default now()
);
create index if not exists pending_invites_handle_idx on public.pending_invites (handle_normalized);
create index if not exists pending_invites_sender_idx on public.pending_invites (sender_user_id);
alter table public.pending_invites enable row level security;
drop policy if exists pending_invites_select_own on public.pending_invites;
create policy pending_invites_select_own on public.pending_invites for select using (auth.uid() = sender_user_id);

-- 7. merkle_leaves + merkle_state (deposit indexer tree)
create table if not exists public.merkle_leaves (
  leaf_index  integer primary key,
  commitment  text not null unique,
  created_at  timestamptz not null default now()
);
create table if not exists public.merkle_state (
  id             boolean primary key default true,
  cursor_ledger  bigint,
  updated_at     timestamptz not null default now(),
  constraint merkle_state_singleton check (id)
);
alter table public.merkle_leaves enable row level security;
alter table public.merkle_state enable row level security;
revoke all on public.merkle_leaves from anon, authenticated;
revoke all on public.merkle_state from anon, authenticated;

-- 8. merge_users RPC (wallet conflict resolution)
create or replace function public.merge_users(from_uid uuid, to_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.handles set user_id = to_uid where user_id = from_uid;
  update public.activity set user_id = to_uid where user_id = from_uid;
  delete from public.wallets where user_id = from_uid;
  delete from public.profiles where id = from_uid;
end;
$$;
revoke all on function public.merge_users(uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_users(uuid, uuid) to service_role;

-- 9. identity_providers_for_email (OAuth-only account detection)
create or replace function public.identity_providers_for_email(p_email text)
returns text[]
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    array_agg(distinct i.provider order by i.provider),
    array[]::text[]
  )
  from auth.identities i
  left join auth.users u on u.id = i.user_id
  where lower(coalesce(u.email, '')) = lower(p_email)
     or lower(coalesce(i.identity_data->>'email', '')) = lower(p_email);
$$;
revoke all on function public.identity_providers_for_email(text) from public;
revoke all on function public.identity_providers_for_email(text) from anon, authenticated;
grant execute on function public.identity_providers_for_email(text) to service_role;
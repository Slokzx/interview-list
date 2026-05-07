-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- ─────────────────────────────────────────
-- Profiles (one row per authenticated user)
-- ─────────────────────────────────────────
create table profiles (
  id          uuid primary key references auth.users on delete cascade,
  email       text,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

alter table profiles enable row level security;

-- Users can only read/write their own profile
create policy "profiles: own row" on profiles
  for all using (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user signs up
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ─────────────────────────────────────────
-- Applications
-- ─────────────────────────────────────────
create type application_stage as enum (
  'Applied',
  'Phone Screen',
  'Technical',
  'Onsite',
  'Offer',
  'Rejected'
);

create table applications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users on delete cascade,
  company          text not null,
  role             text not null,
  stage            application_stage not null default 'Applied',
  notes            text,
  source_email_id  text,
  last_email_date  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger applications_updated_at
  before update on applications
  for each row execute procedure set_updated_at();

alter table applications enable row level security;

-- Users can only see and modify their own applications
create policy "applications: own rows" on applications
  for all using (auth.uid() = user_id);

-- ============================================================================
-- OR Journey · PostgreSQL schema for Supabase
-- Privacy-first OR patient-journey tracking. NO patient identifiers stored.
-- Run order: 01_schema.sql → 02_rls.sql → 03_seed.sql
-- ============================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid(), digest()

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------
create type app_role as enum ('PORTER','OR','RR','WARD','PR','ADMIN');

create type journey_status as enum (
  'WAITING_PORTER',    -- ward created the journey; waiting for a porter to collect
  'PORTER_TO_OR',      -- porter has the patient, en route to OR
  'OR_VERIFY_1',       -- arrived at OR; first nurse confirmed identity vs wristband
  'IN_OR',             -- second nurse confirmed identity; surgery in progress
  'SURGERY_FINISHED',
  'IN_RR',             -- in recovery; RR sends patient back to ward directly
  'COMPLETED',
  'CANCELLED',
  'ON_HOLD'
);

create type transport_direction as enum ('WARD_TO_OR','RR_TO_WARD','RR_TO_ICU','RR_TO_HOME');
create type transport_status    as enum ('REQUESTED','ACCEPTED','PICKED_UP','DELIVERED','CONFIRMED','CANCELLED');
create type token_status        as enum ('ACTIVE','EXPIRED','REVOKED');

-- ---------------------------------------------------------------------------
-- CORE REFERENCE TABLES
-- ---------------------------------------------------------------------------
create table wards (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table or_rooms (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table stations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,          -- e.g. "OR front desk", "RR bay 2"
  kind       text not null,          -- WARD | OR | RR | HANDOFF
  created_at timestamptz not null default now()
);

create table avatars (
  id         text primary key,        -- 'cloud', 'star', ...
  name       text not null,           -- 'น้องเมฆ'
  is_active  boolean not null default true,
  sort_order int  not null default 0
);

-- profiles: 1:1 with auth.users. Holds role + ward assignment (NO patient data)
create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       app_role not null default 'WARD',
  ward_id    uuid references wards(id),      -- required for WARD role
  -- Emergency cases are opened by OR (not the ward) and jump the porter queue.
  -- They are excluded from average-duration stats so elective timings stay clean.
  is_emergency boolean not null default false,

  -- OR room is set by the PORTER when accepting the job (ward does not choose it);
  -- OR staff can still change it at the first identity check if rooms are swapped
  or_room_id uuid references or_rooms(id),
  full_name  text,                            -- STAFF name only, never patient
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- JOURNEYS  (the patient journey — identifiers are avatar + case_code only)
-- ---------------------------------------------------------------------------
create table journeys (
  id           uuid primary key default gen_random_uuid(),
  case_code    text not null,                 -- e.g. 'K7P4' (unique among active)
  ward_id      uuid not null references wards(id),
  avatar_id    text not null references avatars(id),
  status       journey_status not null default 'WAITING_PORTER',
  current_location text,
  destination      text,
  created_by   uuid references profiles(id),

  -- Wristband identity checks at every handoff. We store WHO confirmed and WHEN --
  -- never the patient's name/HN. The check itself happens against the physical band.
  -- *_name is a snapshot of the confirming STAFF member's name at the moment of
  -- the check (audit trails should not change when a profile is later renamed).
  verify_porter_by   uuid references profiles(id),   -- porter collecting from the ward
  verify_porter_name text,
  verify_porter_at   timestamptz,
  verify_rr_by       uuid references profiles(id),   -- RR receiving from OR
  verify_rr_name     text,
  verify_rr_at       timestamptz,

  -- two-nurse identity verification. We store WHICH staff confirmed the
  -- wristband matched and WHEN -- never the patient's name/HN.
  -- CHECK enforces the two confirmations were done by different staff.
  verify1_by   uuid references profiles(id),
  verify1_name text,
  verify1_at   timestamptz,
  verify1_solo boolean not null default false,   -- emergency single-nurse check
  verify2_by   uuid references profiles(id),
  verify2_name text,
  verify2_at   timestamptz,
  constraint verify_two_person check (verify2_by is null or verify2_by <> verify1_by),
  -- Elective cases require BOTH checks before surgery starts; emergency cases are
  -- allowed a single-nurse check, recorded honestly rather than faking a second one.
  -- transport may not start until the porter has confirmed the wristband
  -- Every patient is collected by a porter, emergencies included, so the
  -- wristband check is required before transport in all cases.
  constraint verify_porter_before_transport check (
    porter_received_at is null or verify_porter_by is not null
  ),
  -- RR may not take the patient without its own wristband check
  constraint verify_rr_on_receive check (
    received_rr_at is null or verify_rr_by is not null
  ),
  constraint verify_required_for_or check (
    entered_or_at is null or verify1_by is not null
    and (is_emergency or verify2_by is not null)
  ),

  -- stage timestamps (server time only)
  created_at_ward      timestamptz default now(),  -- ward created the journey
  porter_received_at   timestamptz,                -- porter collected the patient
  entered_or_at        timestamptz,   -- second check done, surgery started
  surgery_finished_at  timestamptz,
  received_rr_at       timestamptz,
  completed_at         timestamptz,   -- RR sent patient back to ward
  cancelled_at         timestamptz,

  -- Clients must never receive token values; they only need to know whether the
  -- avatar/code is still live. Actual tokens live in the hashed token tables.
  staff_token_active boolean not null default true,
  public_code_active boolean not null default true,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- one active case_code at a time (allows reuse after completion)
create unique index uq_journeys_active_code
  on journeys (case_code)
  where status not in ('COMPLETED','CANCELLED');

-- one active journey per avatar per ward
create unique index uq_journeys_active_avatar
  on journeys (ward_id, avatar_id)
  where status not in ('COMPLETED','CANCELLED');

create index ix_journeys_ward   on journeys (ward_id);
create index ix_journeys_status on journeys (status);

-- ---------------------------------------------------------------------------
-- JOURNEY EVENTS  (immutable append-only history / timeline)
-- ---------------------------------------------------------------------------
create table journey_events (
  id          uuid primary key default gen_random_uuid(),
  journey_id  uuid not null references journeys(id) on delete cascade,
  actor_id    uuid references profiles(id),
  event_type  text not null,          -- STATUS_CHANGED, JOURNEY_CREATED, ...
  from_status journey_status,
  to_status   journey_status,
  metadata    jsonb default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index ix_events_journey on journey_events (journey_id, created_at);

-- ---------------------------------------------------------------------------
-- TRANSPORT JOBS  (porter transfer legs)
-- ---------------------------------------------------------------------------
create table transport_jobs (
  id           uuid primary key default gen_random_uuid(),
  journey_id   uuid not null references journeys(id) on delete cascade,
  direction    transport_direction not null,
  pickup_location text,
  destination     text,
  status       transport_status not null default 'REQUESTED',
  requested_by uuid references profiles(id),
  accepted_by  uuid references profiles(id),
  requested_at timestamptz not null default now(),
  accepted_at  timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  receiving_confirmed_by uuid references profiles(id),
  receiving_confirmed_at timestamptz
);
create index ix_transport_journey on transport_jobs (journey_id);

-- ---------------------------------------------------------------------------
-- TOKENS  (store only the HASH, never the raw token)
-- ---------------------------------------------------------------------------
create table qr_tokens (
  id          uuid primary key default gen_random_uuid(),
  journey_id  uuid not null references journeys(id) on delete cascade,
  token_hash  text not null,          -- sha256 of raw token
  status      token_status not null default 'ACTIVE',
  expires_at  timestamptz,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);
create unique index uq_qr_active_journey on qr_tokens (journey_id) where status='ACTIVE';
create index ix_qr_hash on qr_tokens (token_hash);

create table public_tracking_tokens (
  id          uuid primary key default gen_random_uuid(),
  journey_id  uuid not null references journeys(id) on delete cascade,
  code_hash   text not null,          -- sha256 of public code (separate from staff QR)
  status      token_status not null default 'ACTIVE',
  expires_at  timestamptz,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);
create unique index uq_public_active_journey on public_tracking_tokens (journey_id) where status='ACTIVE';
create index ix_public_hash on public_tracking_tokens (code_hash);

-- ---------------------------------------------------------------------------
-- AUDIT LOG  (append-only)
-- ---------------------------------------------------------------------------
create table audit_logs (
  id            uuid primary key default gen_random_uuid(),
  actor_id      uuid references profiles(id),
  action        text not null,        -- LOGIN_SUCCESS, PUBLIC_STATUS_LOOKUP, ...
  resource_type text,
  resource_id   uuid,
  success       boolean not null default true,
  ip_address    inet,
  device_info   text,
  metadata      jsonb default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index ix_audit_actor on audit_logs (actor_id, created_at);
create index ix_audit_action on audit_logs (action, created_at);

-- ---------------------------------------------------------------------------
-- HELPERS / TRIGGERS
-- ---------------------------------------------------------------------------
-- current user's role
create or replace function auth_role() returns app_role
language sql stable security definer set search_path=public as $$
  select role from profiles where id = auth.uid()
$$;

-- current user's ward
create or replace function auth_ward() returns uuid
language sql stable security definer set search_path=public as $$
  select ward_id from profiles where id = auth.uid()
$$;

-- keep updated_at fresh
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger trg_journeys_touch before update on journeys
  for each row execute function touch_updated_at();
create trigger trg_profiles_touch before update on profiles
  for each row execute function touch_updated_at();

-- auto-create a profile when a new auth user signs up (default role WARD)
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into profiles (id, full_name) values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end $$;
create trigger trg_on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- append a journey_event automatically on status change
create or replace function log_status_change() returns trigger
language plpgsql as $$
begin
  if (tg_op='UPDATE' and new.status is distinct from old.status) then
    insert into journey_events (journey_id, actor_id, event_type, from_status, to_status)
    values (new.id, auth.uid(), 'STATUS_CHANGED', old.status, new.status);
  end if;
  return new;
end $$;
create trigger trg_journey_status_event after update on journeys
  for each row execute function log_status_change();

-- enable Realtime on the tables clients subscribe to
alter publication supabase_realtime add table journeys;
alter publication supabase_realtime add table journey_events;
alter publication supabase_realtime add table transport_jobs;

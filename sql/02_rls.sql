-- ============================================================================
-- OR Journey · Row Level Security
-- Principle: least privilege. Roles see and change only what their stage owns.
-- PR and public tracking never SELECT journeys directly — only via a SECURITY
-- DEFINER RPC that returns public-safe fields and writes an audit row.
-- ============================================================================

alter table profiles                enable row level security;
alter table wards                   enable row level security;
alter table or_rooms                enable row level security;
alter table stations                enable row level security;
alter table avatars                 enable row level security;
alter table journeys                enable row level security;
alter table journey_events          enable row level security;
alter table transport_jobs          enable row level security;
alter table qr_tokens               enable row level security;
alter table public_tracking_tokens  enable row level security;
alter table audit_logs              enable row level security;

-- ---------------------------------------------------------------------------
-- REFERENCE DATA: readable by any authenticated staff; writable by ADMIN
-- ---------------------------------------------------------------------------
create policy ref_read_wards    on wards    for select to authenticated using (true);
create policy ref_read_orrooms  on or_rooms for select to authenticated using (true);
create policy ref_read_stations on stations for select to authenticated using (true);
create policy ref_read_avatars  on avatars  for select to authenticated using (true);

create policy admin_write_wards    on wards    for all to authenticated using (auth_role()='ADMIN') with check (auth_role()='ADMIN');
create policy admin_write_orrooms  on or_rooms for all to authenticated using (auth_role()='ADMIN') with check (auth_role()='ADMIN');
create policy admin_write_stations on stations for all to authenticated using (auth_role()='ADMIN') with check (auth_role()='ADMIN');
create policy admin_write_avatars  on avatars  for all to authenticated using (auth_role()='ADMIN') with check (auth_role()='ADMIN');

-- ---------------------------------------------------------------------------
-- PROFILES: users read their own; ADMIN manages all
-- ---------------------------------------------------------------------------
-- Staff need each other's display names for the "who confirmed" pickers, so any
-- authenticated user may read name+role. No contact details live in profiles.
create policy profiles_directory_read on profiles for select to authenticated using (true);

create policy profiles_self_read  on profiles for select to authenticated using (id = auth.uid() or auth_role()='ADMIN');
create policy profiles_admin_all  on profiles for all    to authenticated using (auth_role()='ADMIN') with check (auth_role()='ADMIN');

-- ---------------------------------------------------------------------------
-- JOURNEYS
-- ---------------------------------------------------------------------------
-- READ visibility per role
create policy journeys_read on journeys for select to authenticated using (
  case auth_role()
    when 'WARD'  then ward_id = auth_ward()                                   -- only own ward
    when 'PORTER'then status in ('WAITING_PORTER','PORTER_TO_OR','COMPLETED') -- pickup queue + active transport + history
    when 'OR'    then status in ('PORTER_TO_OR','OR_VERIFY_1','IN_OR','SURGERY_FINISHED')
    when 'RR'    then status in ('SURGERY_FINISHED','IN_RR')
    when 'ADMIN' then true
    else false                                                               -- PR: no direct read
  end
);

-- INSERT: the WARD creates the journey (before the patient leaves the ward), so the
-- family can be handed the avatar + code on the spot. Ward may only create for its
-- own ward, in WAITING_PORTER, and may not pick the OR room (OR assigns it later).
-- Emergency: OR opens the case immediately (the ward has no time) and reserves a
-- room, but the patient is still collected by a porter — so the journey enters
-- the SAME pickup queue, just flagged is_emergency so it sorts to the top.
create policy journeys_insert_or_emergency on journeys for insert to authenticated
  with check (auth_role()='OR' and is_emergency
              and status='WAITING_PORTER' and or_room_id is not null
              and created_by = auth.uid());

create policy journeys_insert_ward on journeys for insert to authenticated
  with check (auth_role()='WARD' and status='WAITING_PORTER' and not is_emergency
              and ward_id = auth_ward() and or_room_id is null
              and created_by = auth.uid());

-- UPDATE: each role may move only the statuses it owns.
-- USING = the row's *current* status must be one this role controls.
-- WITH CHECK = the *new* status must be a legal next step for this role.
-- Porter no longer performs the return trip; RR closes the journey directly.
-- The OR identity-verification steps (PORTER_TO_OR -> OR_VERIFY_1 -> IN_OR) are
-- OR-owned; app/RPC layer also enforces two-different-nurse confirmation.
-- Porter accepts the ward's job AND sets the destination OR room in the same
-- update -- the porter is the one who needs to know where to take the patient.
create policy journeys_update_porter on journeys for update to authenticated
  using  (auth_role()='PORTER' and status='WAITING_PORTER')
  with check (status='PORTER_TO_OR' and or_room_id is not null);

create policy journeys_update_or on journeys for update to authenticated
  using  (auth_role()='OR' and status in ('PORTER_TO_OR','OR_VERIFY_1','IN_OR'))
  with check (status in ('OR_VERIFY_1','IN_OR','SURGERY_FINISHED'));

create policy journeys_update_rr on journeys for update to authenticated
  using  (auth_role()='RR' and status in ('SURGERY_FINISHED','IN_RR'))
  with check (status in ('IN_RR','COMPLETED'));

-- ADMIN may set ON_HOLD / CANCELLED (governance actions), not routine stages
create policy journeys_update_admin on journeys for update to authenticated
  using  (auth_role()='ADMIN')
  with check (status in ('ON_HOLD','CANCELLED'));

-- No DELETE for anyone (history is preserved; use CANCELLED instead)

-- ---------------------------------------------------------------------------
-- JOURNEY EVENTS: readable if you can read the parent journey; insert-only
-- ---------------------------------------------------------------------------
create policy events_read on journey_events for select to authenticated using (
  exists (select 1 from journeys j where j.id = journey_id)   -- journeys RLS already filters
);
create policy events_insert on journey_events for insert to authenticated with check (auth.uid() = actor_id);

-- ---------------------------------------------------------------------------
-- TRANSPORT JOBS: porter + admin manage; OR/RR/WARD read own-stage context
-- ---------------------------------------------------------------------------
create policy transport_read on transport_jobs for select to authenticated using (
  auth_role() in ('PORTER','OR','RR','ADMIN')
);
create policy transport_write_porter on transport_jobs for all to authenticated
  using (auth_role() in ('PORTER','RR','ADMIN')) with check (auth_role() in ('PORTER','RR','ADMIN'));

-- ---------------------------------------------------------------------------
-- TOKENS: never exposed to clients. Only service-role / SECURITY DEFINER RPCs.
-- (No policies => with RLS on, anon/authenticated get nothing.)
-- ---------------------------------------------------------------------------
-- qr_tokens, public_tracking_tokens: intentionally no SELECT/INSERT policies.

-- ---------------------------------------------------------------------------
-- AUDIT LOGS: ADMIN reads; inserts happen via SECURITY DEFINER functions only
-- ---------------------------------------------------------------------------
create policy audit_admin_read on audit_logs for select to authenticated using (auth_role()='ADMIN');

-- ============================================================================
-- PUBLIC LOOKUP RPC  (the only path PR / relatives use)
-- Returns public-safe fields, records an audit row, never leaks internal data.
-- ============================================================================
create or replace function public_status_lookup(p_avatar text, p_code text)
returns table (avatar_id text, case_code text, public_status text, updated_at timestamptz)
language plpgsql security definer set search_path=public as $$
declare v_journey journeys%rowtype; v_public text;
begin
  select j.* into v_journey
  from journeys j
  join public_tracking_tokens t on t.journey_id = j.id and t.status='ACTIVE'
  where j.avatar_id = p_avatar
    and t.code_hash = encode(digest(upper(p_code),'sha256'),'hex')
    and j.status not in ('COMPLETED','CANCELLED')
  limit 1;

  insert into audit_logs (actor_id, action, resource_type, resource_id, success, metadata)
  values (auth.uid(), 'PUBLIC_STATUS_LOOKUP', 'journey', v_journey.id, v_journey.id is not null,
          jsonb_build_object('avatar', p_avatar));

  if v_journey.id is null then return; end if;

  -- map internal status -> public-safe label (kept in DB so ADMIN can edit)
  v_public := case v_journey.status
    when 'WAITING_PORTER'    then 'เตรียมตัวที่หอผู้ป่วย'
    when 'PORTER_TO_OR'      then 'อยู่ระหว่างเดินทางมายังห้องผ่าตัด'
    when 'OR_VERIFY_1'       then 'รอเข้าห้องผ่าตัด'
    when 'IN_OR'             then 'อยู่ระหว่างกระบวนการผ่าตัด'
    when 'SURGERY_FINISHED'  then 'ผ่าตัดเสร็จแล้ว'
    when 'IN_RR'             then 'อยู่ระหว่างพักฟื้นหลังผ่าตัด'
    when 'COMPLETED'         then 'กลับถึงหอผู้ป่วยแล้ว'
    else 'อยู่ระหว่างดำเนินการ'
  end;

  return query select v_journey.avatar_id, v_journey.case_code, v_public, v_journey.updated_at;
end $$;

-- allow anon + authenticated to call the RPC (it self-limits output + audits)
grant execute on function public_status_lookup(text,text) to anon, authenticated;

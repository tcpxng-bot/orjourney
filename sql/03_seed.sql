-- ============================================================================
-- OR Journey · Seed data (fictional, no patient information)
-- ============================================================================

-- Emergency cases come from these same wards (commonly the labour room or a
-- ward patient who deteriorates) — there is no separate "emergency" ward.
insert into wards (name) values
  ('อายุรกรรมหญิง 1'),
  ('สูตินรีเวชกรรม'),
  ('ศัลยกรรมหญิง'),
  ('นรีเวชกรรม'),
  ('ห้องคลอด (LR)');

insert into or_rooms (name) values
  ('OR 1'),
  ('OR 2'),
  ('OR 3'),
  ('OR 4');

insert into stations (name, kind) values
  ('หน้าห้องผ่าตัด', 'HANDOFF'),
  ('ห้องพักฟื้น RR', 'RR');

insert into avatars (id, name, sort_order) values
  ('cloud','น้องเมฆ',1),
  ('star','น้องดาว',2),
  ('moon','น้องจันทร์',3),
  ('sun','น้องตะวัน',4),
  ('rain','น้องรุ้ง',5),
  ('leaf','น้องใบไม้',6),
  ('flower','น้องดอกไม้',7),
  ('drop','น้องหยดน้ำ',8),
  ('wind','น้องสายลม',9),
  ('mtn','น้องภูเขา',10),
  ('clover','น้องโคลเวอร์',11),
  ('mist','น้องสายหมอก',12);

-- NOTE: staff accounts are created through Supabase Auth (sign-up / invite).
-- After a user signs up, an ADMIN sets their role + ward, e.g.:
--   update profiles set role='PORTER'         where id='<uuid>';
--   update profiles set role='WARD', ward_id=(select id from wards where name='สูตินรีเวชกรรม') where id='<uuid>';

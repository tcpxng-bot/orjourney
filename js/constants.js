/* OR Journey — shared constants: icons, avatars, statuses, roles, transitions */

/* Reference data. Populated by Reference.load() at boot: from the database in
   live mode (real uuid ids), from DEMO_* fallbacks in demo mode. Declared with
   `let` because the live rows replace them entirely. */
let WARDS = [];
let OR_ROOMS = [];
let WARD_USERS = [];

/* ---------------------------- ICONS (Lucide, inline) ---------------------- */
const IC = {
  route:'<path d="M6 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M15 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/><path d="M12 21v-6a3 3 0 0 1 3-3h4"/><path d="M12 3v6a3 3 0 0 1-3 3H4"/>',
  home:'<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 22V12h6v10"/>',
  plus:'<path d="M5 12h14M12 5v14"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',
  checkCircle:'<circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/>',
  arrowRight:'<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowLeft:'<path d="M19 12H5M11 18l-6-6 6-6"/>',
  chevronDown:'<path d="m6 9 6 6 6-6"/>',
  bed:'<path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8V4h9"/>',
  activity:'<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  scissors:'<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12"/>',
  heart:'<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  building:'<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M9 6h.01M15 6h.01M9 10h.01M15 10h.01M9 14h.01M15 14h.01"/>',
  search:'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  qr:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.01M14 21h.01M17 21h4v-4M21 17v.01"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users:'<circle cx="9" cy="7" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 3.13A4 4 0 0 1 16 11M22 21a7 7 0 0 0-5-6.7"/>',
  stretcher:'<circle cx="7" cy="7" r="2"/><path d="M9 9h4.5a3.5 3.5 0 0 1 3.3 2.4L17 12H5.5A2.5 2.5 0 0 1 3 9.5V9"/><path d="M2 12h20M5 12l2 5M19 12l-2 5M7 17h10"/><circle cx="7" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
  wristband:'<path d="M8 4h8v3a4 4 0 0 1-4 4 4 4 0 0 1-4-4Z"/><path d="M8 20h8v-3a4 4 0 0 0-4-4 4 4 0 0 0-4 4Z"/><path d="M10 8h4"/>',
  shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>',
  printer:'<path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7" rx="1"/>',
  idCard:'<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.5-1.5 1.7-2 3-2s2.5.5 3 2"/><path d="M15 10h4M15 13h4"/>',
  userCheck:'<circle cx="9" cy="8" r="3.2"/><path d="M4 20c.6-3 2.7-4.5 5-4.5s4.4 1.5 5 4.5"/><path d="m16 12 2 2 3.5-3.5"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
  logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  bell:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  alert:'<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4M12 17h.01"/>',
  wifi:'<path d="M5 13a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0M2 8.82a15 15 0 0 1 20 0M12 20h.01"/>',
  wifiOff:'<path d="M12 20h.01M8.5 16.5a5 5 0 0 1 7 0M2 8.82a15 15 0 0 1 4.17-2.65M10.66 5c4.01-.36 8.14.9 11.34 3.76M16.85 11.25a10 10 0 0 1 2.22 1.68M5 13a10 10 0 0 1 5.24-2.76M1 1l22 22"/>',
  mapPin:'<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  hourglass:'<path d="M5 22h14M5 2h14M17 22v-4.17a2 2 0 0 0-.59-1.42L12 12l-4.41 4.41A2 2 0 0 0 7 17.83V22M7 2v4.17a2 2 0 0 0 .59 1.42L12 12l4.41-4.41A2 2 0 0 0 17 6.17V2"/>',
  refresh:'<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>',
  x:'<path d="M18 6 6 18M6 6l12 12"/>',
  history:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"/>',
  pause:'<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  door:'<path d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14"/><path d="M3 20h18"/><path d="M14 12v.01"/>',
};
function svg(name,cls=''){return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[name]||''}</svg>`}

/* ---------------------------- AVATARS (nature, pastel SVG) ---------------- */
const AVATARS = [
  {id:'cloud', name:'น้องเมฆ',    c:'#8FB4CC', c2:'#E4EEF3'},
  {id:'star',  name:'น้องดาว',    c:'#D9A45B', c2:'#F6EBD6'},
  {id:'moon',  name:'น้องจันทร์', c:'#A79FC7', c2:'#EBE7F2'},
  {id:'sun',   name:'น้องตะวัน',  c:'#E0A24E', c2:'#F8EDD6'},
  {id:'rain',  name:'น้องรุ้ง',   c:'#C58AA8', c2:'#F3E4EC'},
  {id:'leaf',  name:'น้องใบไม้',  c:'#8FB394', c2:'#E7EFE5'},
  {id:'flower',name:'น้องดอกไม้', c:'#E5A0A8', c2:'#F7E4E6'},
  {id:'drop',  name:'น้องหยดน้ำ', c:'#7FB0C7', c2:'#E2EEF3'},
  {id:'wind',  name:'น้องสายลม',  c:'#9DC3BE', c2:'#E5F0EE'},
  {id:'mtn',   name:'น้องภูเขา',  c:'#A79A8C', c2:'#EFEAE2'},
  {id:'clover',name:'น้องโคลเวอร์',c:'#6FAE7C', c2:'#E4F0E4'},
  {id:'mist',  name:'น้องสายหมอก',c:'#B7BEC6', c2:'#ECEFF2'},
];
const AV = Object.fromEntries(AVATARS.map(a=>[a.id,a]));
/* consistent style: soft circle bg + simple glyph + calm face (dots + smile) */
function avatarSVG(id){
  const a = AV[id]||AVATARS[0];
  const face = `<g stroke="${a.c}" stroke-width="2.4" stroke-linecap="round" fill="none" opacity=".85">
     <path d="M40 54q6 5 12 0"/></g>
     <circle cx="39" cy="47" r="2.2" fill="${a.c}"/><circle cx="53" cy="47" r="2.2" fill="${a.c}"/>`;
  const glyphs = {
    cloud:`<path d="M32 40a10 10 0 0 1 19-4 8 8 0 0 1 3 15H36a8 8 0 0 1-4-11Z" fill="${a.c}" opacity=".28"/>`,
    star:`<path d="M46 24l4.5 9.2 10.1 1.5-7.3 7.1 1.7 10-9-4.7-9 4.7 1.7-10-7.3-7.1 10.1-1.5Z" fill="${a.c}" opacity=".28"/>`,
    moon:`<path d="M54 30a15 15 0 1 0 4 20 12 12 0 0 1-4-20Z" fill="${a.c}" opacity=".28"/>`,
    sun:`<circle cx="46" cy="38" r="10" fill="${a.c}" opacity=".28"/><g stroke="${a.c}" stroke-width="2.4" stroke-linecap="round" opacity=".4"><path d="M46 22v-5M46 59v-5M62 38h5M25 38h5M57 27l3-3M32 52l3-3M57 49l3 3M32 24l3 3"/></g>`,
    rain:`<path d="M28 44a18 18 0 0 1 36 0" fill="none" stroke="${a.c}" stroke-width="5" opacity=".3" stroke-linecap="round"/><path d="M34 44a12 12 0 0 1 24 0" fill="none" stroke="${a.c}" stroke-width="4" opacity=".2" stroke-linecap="round"/>`,
    leaf:`<path d="M46 22c14 6 14 24 0 34-14-10-14-28 0-34Z" fill="${a.c}" opacity=".28"/><path d="M46 26v28" stroke="${a.c}" stroke-width="2" opacity=".35"/>`,
    flower:`<g fill="${a.c}" opacity=".28"><circle cx="46" cy="30" r="6"/><circle cx="55" cy="37" r="6"/><circle cx="51" cy="47" r="6"/><circle cx="41" cy="47" r="6"/><circle cx="37" cy="37" r="6"/></g><circle cx="46" cy="39" r="4" fill="${a.c}" opacity=".45"/>`,
    drop:`<path d="M46 24c8 10 12 16 12 22a12 12 0 0 1-24 0c0-6 4-12 12-22Z" fill="${a.c}" opacity=".28"/>`,
    wind:`<g stroke="${a.c}" stroke-width="4" fill="none" stroke-linecap="round" opacity=".32"><path d="M28 34h22a5 5 0 1 0-5-5"/><path d="M28 44h30a5 5 0 1 1-5 5"/><path d="M28 54h16a4 4 0 1 0-4-4"/></g>`,
    mtn:`<path d="M26 56l12-22 8 12 5-8 11 18Z" fill="${a.c}" opacity=".28"/><path d="M38 34l4 6-4 4-4-4Z" fill="${a.c}" opacity=".4"/>`,
    clover:`<g fill="${a.c}" opacity=".28"><circle cx="40" cy="34" r="7"/><circle cx="52" cy="34" r="7"/><circle cx="40" cy="46" r="7"/><circle cx="52" cy="46" r="7"/></g><path d="M46 46v12" stroke="${a.c}" stroke-width="2.5" opacity=".35"/>`,
    mist:`<g stroke="${a.c}" stroke-width="5" stroke-linecap="round" opacity=".3"><path d="M28 32h36M24 42h40M28 52h34"/></g>`,
  };
  return `<svg viewBox="0 0 92 92" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${a.name}">
    <circle cx="46" cy="46" r="46" fill="${a.c2}"/>
    ${glyphs[id]||glyphs.cloud}
    ${face}
  </svg>`;
}
function avatarEl(id,size='md'){return `<div class="avatar sz-${size}">${avatarSVG(id)}</div>`}

/* ---------------------------- STATUS CONFIG ------------------------------- */
/* internal status -> {label(staff), public(relative-safe), color, tint, icon, order, stage} */
const STATUS = {
  WAITING_PORTER:{label:'รอหน่วยเปลมารับ', pub:'เตรียมตัวที่หอผู้ป่วย', color:'var(--sage)', tint:'var(--sage-tint)', ink:'#2f5a3d', icon:'bed', order:0, stage:'ward'},
  PORTER_TO_OR:{label:'กำลังรอเข้าห้องผ่าตัด', pub:'อยู่ระหว่างเดินทางมายังห้องผ่าตัด', color:'var(--powder)', tint:'var(--powder-tint)', ink:'#345061', icon:'stretcher', order:1, stage:'porter'},
  OR_VERIFY_1:{label:'รอเข้าห้องผ่าตัด · ยืนยันตัว 1/2', pub:'รอเข้าห้องผ่าตัด', color:'var(--amber)', tint:'var(--amber-tint)', ink:'#7a5417', icon:'hourglass', order:2, stage:'or'},
  IN_OR:{label:'กำลังผ่าตัด', pub:'อยู่ระหว่างกระบวนการผ่าตัด', color:'var(--peach)', tint:'var(--peach-tint)', ink:'#8a4a2c', icon:'activity', order:3, stage:'or'},
  SURGERY_FINISHED:{label:'ผ่าตัดเสร็จ', pub:'ผ่าตัดเสร็จแล้ว', color:'var(--sage)', tint:'var(--sage-tint)', ink:'#2f5a3d', icon:'checkCircle', order:4, stage:'or'},
  IN_RR:{label:'อยู่ห้องพักฟื้น RR', pub:'อยู่ระหว่างพักฟื้นหลังผ่าตัด', color:'var(--lavender)', tint:'var(--lavender-tint)', ink:'#4c4470', icon:'heart', order:5, stage:'rr'},
  COMPLETED:{label:'ส่งกลับหอผู้ป่วยแล้ว', pub:'กลับถึงหอผู้ป่วยแล้ว', color:'var(--green)', tint:'var(--green-tint)', ink:'#2f5a3d', icon:'check', order:6, stage:'done'},
  CANCELLED:{label:'ยกเลิก Journey', pub:'ไม่พบข้อมูล กรุณาติดต่อทีมรักษา', color:'var(--clay)', tint:'var(--clay-tint)', ink:'#8a3b2c', icon:'x', order:99, stage:'done'},
  ON_HOLD:{label:'พักการดำเนินการชั่วคราว', pub:'อยู่ระหว่างดำเนินการ', color:'var(--ink-3)', tint:'var(--line)', ink:'#6c675f', icon:'pause', order:98, stage:'hold'},
};
/* main visible timeline sequence */
const FLOW = ['WAITING_PORTER','PORTER_TO_OR','OR_VERIFY_1','IN_OR','SURGERY_FINISHED','IN_RR','COMPLETED'];

/* transition rules keyed by current status.
   verify1/verify2 = two-nurse identity check (records nurse, never patient name). */
const TRANSITIONS = {
  WAITING_PORTER:[{to:'PORTER_TO_OR', role:'PORTER', label:'รับผู้ป่วย · เลือกห้อง', icon:'check', pickup:true}],
  PORTER_TO_OR:[{to:'OR_VERIFY_1', role:'OR', label:'ยืนยันตัวผู้ป่วย (ครั้งที่ 1)', icon:'idCard', verify:1}],
  OR_VERIFY_1:[{to:'IN_OR', role:'OR', label:'ยืนยันตัว (ครั้งที่ 2) · เริ่มผ่าตัด', icon:'idCard', verify:2}],
  IN_OR:[{to:'SURGERY_FINISHED', role:'OR', label:'ผ่าตัดเสร็จ', icon:'checkCircle', confirm:true}],
  SURGERY_FINISHED:[{to:'IN_RR', role:'RR', label:'รับเข้า RR · ยืนยันป้ายข้อมือ', icon:'wristband', rrReceive:true}],
  IN_RR:[{to:'COMPLETED', role:'RR', label:'ส่งกลับหอผู้ป่วย', icon:'checkCircle', confirm:true}],
};

/* mock OR nurses (real app: pulled from logged-in user's profile) */
const OR_STAFF = ['พว. สมหญิง','พว. วิภา','พว. อารีย์','พว. ณัฐพร','พว. กมล'];
const PORTER_STAFF = ['คุณสมชาย','คุณประเสริฐ','คุณวิชัย','คุณอนันต์'];
const RR_STAFF = ['พว. ปรียา','พว. สุดา','พว. มาลี','พว. จินตนา'];

/* ---------------------------- ROLES -------------------------------------- */
const ROLES = {
  PORTER:{name:'หน่วยเปล', desc:'รับผู้ป่วยจากหอและนำส่งห้องผ่าตัด', color:'var(--powder)', tint:'var(--powder-tint)', ink:'#345061', icon:'stretcher'},
  OR:{name:'ห้องผ่าตัด', desc:'รับผู้ป่วยและอัปเดตขั้นผ่าตัด', color:'var(--peach)', tint:'var(--peach-tint)', ink:'#8a4a2c', icon:'scissors'},
  RR:{name:'ห้องพักฟื้น', desc:'ดูแลระยะพักฟื้นและส่งกลับ', color:'var(--lavender)', tint:'var(--lavender-tint)', ink:'#4c4470', icon:'heart'},
  WARD:{name:'หอผู้ป่วย', desc:'ติดตามสถานะแบบเรียลไทม์', color:'var(--sage)', tint:'var(--sage-tint)', ink:'#2f5a3d', icon:'bed'},
  PR:{name:'ประชาสัมพันธ์', desc:'ตรวจสอบสถานะให้ญาติ', color:'var(--amber)', tint:'var(--amber-tint)', ink:'#7a5417', icon:'info'},
  ADMIN:{name:'ผู้ดูแลระบบ', desc:'จัดการผู้ใช้ วอร์ด และระบบ', color:'var(--ink-3)', tint:'var(--line)', ink:'#4a463f', icon:'shield'},
};

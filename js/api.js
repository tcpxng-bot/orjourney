/* ============================================================================
   OR Journey — data layer
   ----------------------------------------------------------------------------
   Picks one of two backends at boot and exposes ONE interface to the UI:

     Store.journeys            local cache (array, read synchronously by views)
     Store.sub(fn) / emit()    change notification
     await Store.createJourney(wardId, byRole, roomId, emergency)
     await Store.transition(journeyId, toStatus, byRole)
     await Store.verify(journeyId, step, nurseName, byRole)
     await Store.publicLookup(avatarId, code, byRole)

   Writes go to Postgres; the local cache is refreshed from Realtime, so the
   render functions can stay synchronous. Every write is additionally gated by
   Row Level Security server-side — the checks in this file are for UX only and
   are NOT the security boundary.
   ============================================================================ */

const CFG = window.OJ_CONFIG || {};
const DEMO_MODE = CFG.forceDemo || !CFG.supabaseUrl || !CFG.supabaseAnonKey;

let sb = null;              // supabase client (null in demo mode)
let Store = null;           // active store
const Session = { user:null, profile:null };   // profile: {id, full_name, role, ward_id}

/* ---------------------------------------------------------------- helpers */
function isoNow(){ return new Date().toISOString(); }
function tsToMs(t){ return t ? new Date(t).getTime() : null; }

/* Map a `journeys` row (snake_case, FK ids) to the shape the views expect. */
function fromRow(r){
  const ward = (WARDS.find(w=>w.id===r.ward_id) || {name:'—'});
  const room = r.or_room_id ? (OR_ROOMS.find(o=>o.id===r.or_room_id)||null) : null;
  return {
    id: r.id,
    case_code: r.case_code,
    ward_id: r.ward_id,
    ward_name: ward.name,
    avatar_id: r.avatar_id,
    status: r.status,
    is_emergency: !!r.is_emergency,
    or_room_id: r.or_room_id || null,
    or_room: room ? room.name : null,
    dest: room ? room.name : 'ห้องผ่าตัด',
    staff_token: r.staff_token_active ? 'active' : null,
    public_code: r.public_code_active ? r.case_code : null,
    verifyPorter: r.verify_porter_name ? {by:r.verify_porter_name, at:tsToMs(r.verify_porter_at)} : null,
    verify1: r.verify1_name ? {by:r.verify1_name, at:tsToMs(r.verify1_at), solo:!!r.verify1_solo} : null,
    verify2: r.verify2_name ? {by:r.verify2_name, at:tsToMs(r.verify2_at)} : null,
    verifyRR: r.verify_rr_name ? {by:r.verify_rr_name, at:tsToMs(r.verify_rr_at)} : null,
    created_at: tsToMs(r.created_at),
    updated_at: tsToMs(r.updated_at),
    timestamps: {
      created_at_ward:     tsToMs(r.created_at_ward),
      porter_received_at:  tsToMs(r.porter_received_at),
      verify1_at:          tsToMs(r.verify1_at),
      entered_or_at:       tsToMs(r.entered_or_at),
      surgery_finished_at: tsToMs(r.surgery_finished_at),
      received_rr_at:      tsToMs(r.received_rr_at),
      completed_at:        tsToMs(r.completed_at),
    },
  };
}

function genCodeReal(){                    // readable, avoids O/0 I/1 B/8
  const L='ACDEFGHJKMNPQRTUVWXY', N='234567';
  const p=s=>s[Math.floor(Math.random()*s.length)];
  return p(L)+p(N)+p(L)+p(N);
}

/* ============================================================ SUPABASE STORE */
const SupabaseStore = {
  journeys: [], events: [], audit: [], listeners: new Set(),
  online: true,
  _channel: null,

  emit(){ this.listeners.forEach(f=>f()); },
  sub(f){ this.listeners.add(f); return ()=>this.listeners.delete(f); },

  /* ---- initial load + realtime ---- */
  async init(){
    await this.refresh();
    this._channel = sb.channel('oj-journeys')
      .on('postgres_changes', {event:'*', schema:'public', table:'journeys'}, payload=>{
        this._apply(payload);
        this.emit();
      })
      .subscribe(status=>{
        // Realtime connection state drives the "online" pill in the top bar.
        const up = status === 'SUBSCRIBED';
        if(this.online !== up){ this.online = up; this.emit(); }
      });
  },

  _apply(payload){
    const { eventType, new:row, old } = payload;
    if(eventType === 'DELETE'){
      this.journeys = this.journeys.filter(j=>j.id !== (old && old.id));
      return;
    }
    const mapped = fromRow(row);
    const i = this.journeys.findIndex(j=>j.id === mapped.id);
    if(i >= 0) this.journeys[i] = mapped;
    else this.journeys.unshift(mapped);
  },

  /* Reload everything this role is allowed to see. RLS decides the rows. */
  async refresh(){
    const { data, error } = await sb.from('journeys')
      .select('*').order('created_at', {ascending:false}).limit(200);
    if(error){ console.error('[OR Journey] load journeys failed:', error); return; }
    this.journeys = (data||[]).map(fromRow);
  },

  async refreshAudit(){
    const { data, error } = await sb.from('audit_logs')
      .select('*').order('at', {ascending:false}).limit(60);
    if(error){ console.warn('[OR Journey] audit not readable (expected unless ADMIN):', error.message); return; }
    this.audit = (data||[]).map(a=>({
      actor:a.actor_role||a.actor||'—', action:a.action, resource_type:a.resource_type,
      resource_id:a.resource_id, success:a.success, at:tsToMs(a.at),
      device:a.device||'', meta:a.meta||{},
    }));
  },

  /* ---- unique, human-readable case code among ACTIVE journeys ---- */
  async uniqueCodeRemote(){
    for(let i=0;i<12;i++){
      const c = genCodeReal();
      const { data, error } = await sb.from('journeys')
        .select('id').eq('case_code', c)
        .not('status','in','("COMPLETED","CANCELLED")').limit(1);
      if(error) return c;                       // let the DB unique index decide
      if(!data || !data.length) return c;
    }
    return genCodeReal();
  },

  /* Avatar that is not already in use by an active journey on this ward. */
  pickAvatar(wardId){
    const used = this.journeys
      .filter(j=>j.ward_id===wardId && !['COMPLETED','CANCELLED'].includes(j.status))
      .map(j=>j.avatar_id);
    const free = AVATARS.filter(a=>!used.includes(a.id));
    const pool = free.length ? free : AVATARS;
    return pool[Math.floor(Math.random()*pool.length)].id;
  },

  /* ---- writes ---- */
  async createJourney(wardId, byRole, roomId, emergency=false){
    const payload = {
      case_code:  await this.uniqueCodeRemote(),
      ward_id:    wardId,
      avatar_id:  this.pickAvatar(wardId),
      // Emergencies still travel with a porter — they enter the SAME queue but
      // are flagged so they sort to the top and are visually unmistakable.
      status:     'WAITING_PORTER',
      is_emergency: !!emergency,
      or_room_id: emergency ? (roomId || null) : null,   // OR reserves the room up front
      created_by: Session.user ? Session.user.id : null,
      created_at_ward: isoNow(),
    };

    const { data, error } = await sb.from('journeys').insert(payload).select().single();
    if(error){ console.error('[OR Journey] create failed:', error); throw new Error(friendly(error)); }
    const j = fromRow(data);
    const i = this.journeys.findIndex(x=>x.id===j.id);
    if(i>=0) this.journeys[i]=j; else this.journeys.unshift(j);
    this.emit();
    return j;
  },

  async transition(journeyId, to, byRole){
    const j = this.journeys.find(x=>x.id===journeyId);
    if(!j) return {ok:false, msg:'ไม่พบ Journey นี้'};
    const allowed = (TRANSITIONS[j.status]||[]).find(t=>t.to===to && t.role===byRole);
    if(!allowed) return {ok:false, msg:'ไม่สามารถอัปเดตสถานะนี้ได้ในบทบาทปัจจุบัน'};

    const patch = { status: to, updated_at: isoNow() };
    const tsKey = {PORTER_TO_OR:'porter_received_at', OR_VERIFY_1:'verify1_at',
                   IN_OR:'entered_or_at', SURGERY_FINISHED:'surgery_finished_at',
                   IN_RR:'received_rr_at', COMPLETED:'completed_at'}[to];
    if(tsKey) patch[tsKey] = isoNow();
    if(to === 'COMPLETED'){ patch.staff_token_active = false; patch.public_code_active = false; }

    const { error } = await sb.from('journeys').update(patch).eq('id', journeyId);
    if(error){ console.error('[OR Journey] transition failed:', error); return {ok:false, msg:friendly(error)}; }
    await this.refreshOne(journeyId);
    return {ok:true};
  },

  /* Wristband checks. We record WHO confirmed (name snapshot + uuid) — never the
     patient's name. Emergency cases allow a single-nurse check, flagged as solo. */
  async verify(journeyId, step, nurse, byRole){
    const j = this.journeys.find(x=>x.id===journeyId);
    if(!j) return {ok:false, msg:'ไม่พบ Journey นี้'};
    if(byRole!=='OR') return {ok:false, msg:'เฉพาะห้องผ่าตัดยืนยันตัวผู้ป่วยได้'};
    const uid = Session.user ? Session.user.id : null;
    let patch;

    if(j.is_emergency){
      if(j.status!=='PORTER_TO_OR') return {ok:false, msg:'สถานะไม่ถูกต้องสำหรับการยืนยัน'};
      patch = { verify1_by:uid, verify1_name:nurse, verify1_at:isoNow(), verify1_solo:true,
                status:'IN_OR', entered_or_at:isoNow(), updated_at:isoNow() };
    } else if(step===1){
      if(j.status!=='PORTER_TO_OR') return {ok:false, msg:'สถานะไม่ถูกต้องสำหรับการยืนยันครั้งที่ 1'};
      patch = { verify1_by:uid, verify1_name:nurse, verify1_at:isoNow(),
                status:'OR_VERIFY_1', updated_at:isoNow() };
    } else {
      if(j.status!=='OR_VERIFY_1') return {ok:false, msg:'ต้องยืนยันครั้งที่ 1 ก่อน'};
      if(j.verify1 && j.verify1.by===nurse) return {ok:false, msg:'ครั้งที่ 2 ต้องเป็นพยาบาลคนละคนกับครั้งที่ 1'};
      patch = { verify2_by:uid, verify2_name:nurse, verify2_at:isoNow(),
                status:'IN_OR', entered_or_at:isoNow(), updated_at:isoNow() };
    }

    const { error } = await sb.from('journeys').update(patch).eq('id', journeyId);
    if(error){ console.error('[OR Journey] verify failed:', error); return {ok:false, msg:friendly(error)}; }
    await this.refreshOne(journeyId);
    return {ok:true};
  },

  /* Porter collecting from the ward: wristband check + destination room. */
  async porterPickup(journeyId, staffName, roomId){
    const patch = {
      status:'PORTER_TO_OR', or_room_id:roomId,
      verify_porter_by: Session.user ? Session.user.id : null,
      verify_porter_name: staffName, verify_porter_at: isoNow(),
      porter_received_at: isoNow(), updated_at: isoNow(),
    };
    const { error } = await sb.from('journeys').update(patch).eq('id', journeyId);
    if(error){ console.error('[OR Journey] pickup failed:', error); return {ok:false, msg:friendly(error)}; }
    await this.refreshOne(journeyId);
    return {ok:true};
  },

  /* RR receiving from OR: wristband check at the handoff. */
  async rrReceive(journeyId, staffName){
    const patch = {
      status:'IN_RR',
      verify_rr_by: Session.user ? Session.user.id : null,
      verify_rr_name: staffName, verify_rr_at: isoNow(),
      received_rr_at: isoNow(), updated_at: isoNow(),
    };
    const { error } = await sb.from('journeys').update(patch).eq('id', journeyId);
    if(error){ console.error('[OR Journey] RR receive failed:', error); return {ok:false, msg:friendly(error)}; }
    await this.refreshOne(journeyId);
    return {ok:true};
  },

  async refreshOne(id){
    const { data, error } = await sb.from('journeys').select('*').eq('id', id).single();
    if(error || !data) return;
    const j = fromRow(data);
    const i = this.journeys.findIndex(x=>x.id===id);
    if(i>=0) this.journeys[i]=j; else this.journeys.unshift(j);
    this.emit();
  },

  /* Relatives / PR: the ONLY public path. SECURITY DEFINER function returns a
     public-safe subset and writes its own audit row. Never reads `journeys`. */
  async publicLookup(avatarId, code, byRole){
    const { data, error } = await sb.rpc('public_status_lookup',
      { p_avatar: avatarId, p_code: code });
    if(error){ console.error('[OR Journey] lookup failed:', error); return null; }
    const row = Array.isArray(data) ? data[0] : data;
    if(!row) return null;
    return {
      avatar_id: row.avatar_id, case_code: row.case_code,
      status: row.status, updated_at: tsToMs(row.updated_at),
    };
  },
};

/* Turn Postgres/RLS errors into something a nurse can act on. */
function friendly(error){
  const m = (error && (error.message||'')) + ' ' + (error && (error.details||''));
  if(/row-level security|permission denied|violates row-level/i.test(m))
    return 'บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้';
  if(/duplicate key|unique constraint/i.test(m))
    return 'รหัสเคสซ้ำ กรุณาลองใหม่อีกครั้ง';
  if(/verify_two_person/i.test(m))
    return 'ครั้งที่ 2 ต้องเป็นพยาบาลคนละคนกับครั้งที่ 1';
  if(/verify_porter_before_transport/i.test(m))
    return 'ต้องยืนยันป้ายข้อมือก่อนเริ่มนำส่ง';
  if(/verify_rr_on_receive/i.test(m))
    return 'ต้องยืนยันป้ายข้อมือก่อนรับเข้าห้องพักฟื้น';
  if(/verify_required_for_or/i.test(m))
    return 'ต้องยืนยันตัวผู้ป่วยให้ครบก่อนเริ่มผ่าตัด';
  if(/Failed to fetch|NetworkError/i.test(m))
    return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจสอบอินเทอร์เน็ต';
  return 'ทำรายการไม่สำเร็จ กรุณาลองใหม่';
}

/* Reference data (wards, OR rooms). In live mode these come from the database so
   the ids are the real uuids the journeys table expects; in demo mode we fall
   back to the DEMO_* arrays. Everything downstream reads WARDS / OR_ROOMS. */
const Reference = {
  async load(){
    if(DEMO_MODE){
      WARDS = DEMO_WARDS.slice();
      OR_ROOMS = DEMO_OR_ROOMS.slice();
      WARD_USERS = WARDS.slice();
      return {ok:true};
    }
    const [w, r] = await Promise.all([
      sb.from('wards').select('id, name').eq('is_active', true).order('name'),
      sb.from('or_rooms').select('id, name').eq('is_active', true).order('name'),
    ]);
    if(w.error || r.error){
      console.error('[OR Journey] reference load failed:', w.error || r.error);
      return {ok:false, msg:'โหลดข้อมูลหอผู้ป่วยและห้องผ่าตัดไม่สำเร็จ'};
    }
    WARDS = w.data || [];
    OR_ROOMS = r.data || [];
    WARD_USERS = WARDS.slice();
    if(!WARDS.length || !OR_ROOMS.length){
      return {ok:false, msg:'ยังไม่มีข้อมูลหอผู้ป่วยหรือห้องผ่าตัด — กรุณารัน sql/03_seed.sql ก่อน'};
    }
    return {ok:true};
  },
};

/* ================================================================== AUTH */
const Auth = {
  async signIn(email, password){
    if(DEMO_MODE) return {ok:false, msg:'โหมดเดโม — ยังไม่ได้ตั้งค่า Supabase'};
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if(error){
      const m = /Invalid login/i.test(error.message||'')
        ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : 'เข้าสู่ระบบไม่สำเร็จ';
      return {ok:false, msg:m};
    }
    Session.user = data.user;
    const p = await this.loadProfile();
    if(!p.ok) return p;
    return {ok:true};
  },

  async loadProfile(){
    const { data, error } = await sb.from('profiles')
      .select('id, full_name, role, ward_id').eq('id', Session.user.id).single();
    if(error || !data){
      console.error('[OR Journey] profile load failed:', error);
      return {ok:false, msg:'ไม่พบโปรไฟล์ผู้ใช้ — กรุณาติดต่อผู้ดูแลระบบ'};
    }
    if(!data.role) return {ok:false, msg:'บัญชีนี้ยังไม่ได้กำหนดบทบาท — กรุณาติดต่อผู้ดูแลระบบ'};
    Session.profile = data;
    return {ok:true};
  },

  async restore(){
    if(DEMO_MODE) return false;
    const { data } = await sb.auth.getSession();
    if(!data || !data.session) return false;
    Session.user = data.session.user;
    const p = await this.loadProfile();
    return p.ok;
  },

  async signOut(){
    if(!DEMO_MODE && sb) await sb.auth.signOut();
    Session.user = null; Session.profile = null;
  },
};

/* Staff name lists for the "who confirmed" pickers. In demo mode these are the
   mock arrays from constants.js; with Supabase they come from `profiles`. */
const Staff = {
  OR: [], PORTER: [], RR: [],
  async load(){
    if(DEMO_MODE){ this.OR=OR_STAFF.slice(); this.PORTER=PORTER_STAFF.slice(); this.RR=RR_STAFF.slice(); return; }
    const { data, error } = await sb.from('profiles').select('full_name, role').eq('active', true);
    if(error){ console.warn('[OR Journey] staff list unavailable:', error.message);
               this.OR=OR_STAFF.slice(); this.PORTER=PORTER_STAFF.slice(); this.RR=RR_STAFF.slice(); return; }
    const by = r => (data||[]).filter(p=>p.role===r).map(p=>p.full_name).filter(Boolean);
    this.OR = by('OR'); this.PORTER = by('PORTER'); this.RR = by('RR');
    if(!this.OR.length) this.OR = OR_STAFF.slice();
    if(!this.PORTER.length) this.PORTER = PORTER_STAFF.slice();
    if(!this.RR.length) this.RR = RR_STAFF.slice();
  },
};

/* ================================================================== BOOT */
async function initBackend(){
  if(DEMO_MODE){
    Store = MockStore;
    await Reference.load();
    await seedMock();
    await Staff.load();
    return {mode:'demo'};
  }
  if(!window.supabase || !window.supabase.createClient){
    return {mode:'error', msg:'โหลดไลบรารี Supabase ไม่สำเร็จ — ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต'};
  }
  sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
    auth: { persistSession:true, autoRefreshToken:true },
  });
  Store = SupabaseStore;
  const ref = await Reference.load();
  if(!ref.ok) return {mode:'error', msg:ref.msg};
  await Staff.load();
  return {mode:'live'};
}

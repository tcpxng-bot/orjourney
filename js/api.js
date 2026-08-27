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
    verifyPorter: r.verify_porter_name ? {by:r.verify_porter_name, at:tsToMs(r.verify_porter_at),
                    enteredBy:r.verify_porter_entered_name||null} : null,
    verify1: r.verify1_name ? {by:r.verify1_name, at:tsToMs(r.verify1_at), solo:!!r.verify1_solo,
                    enteredBy:r.verify1_entered_name||null} : null,
    verify2: r.verify2_name ? {by:r.verify2_name, at:tsToMs(r.verify2_at),
                    enteredBy:r.verify2_entered_name||null, copresent:!!r.verify2_copresent} : null,
    verifyRR: r.verify_rr_name ? {by:r.verify_rr_name, at:tsToMs(r.verify_rr_at),
                    enteredBy:r.verify_rr_entered_name||null} : null,
    cancel_reason: r.cancel_reason || null,
    verify1_id: r.verify1_by || null,
    verify2_id: r.verify2_by || null,
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
      .select('*').order('created_at', {ascending:false}).limit(60);
    if(error){ console.warn('[OR Journey] audit not readable (expected unless ADMIN):', error.message); return; }

    // Resolve actor uuids to a readable "role · name" for the log view.
    const ids = [...new Set((data||[]).map(a=>a.actor_id).filter(Boolean))];
    let who = {};
    if(ids.length){
      const { data:profs } = await sb.from('profiles')
        .select('id, full_name, role').in('id', ids);
      (profs||[]).forEach(p=>{ who[p.id] = p.full_name ? `${p.role} · ${p.full_name}` : p.role; });
    }

    this.audit = (data||[]).map(a=>({
      actor: who[a.actor_id] || (a.actor_id ? 'ผู้ใช้ที่ถูกลบ' : 'ไม่ระบุตัวตน'),
      action: a.action, resource_type: a.resource_type,
      resource_id: a.resource_id, success: a.success,
      at: tsToMs(a.created_at),
      device: a.device_info || '', meta: a.metadata || {},
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
  /* nurse = {id, name} of the person who READ the wristband.
     opts.copresent = recorder attests the 2nd nurse was present (proxy entry). */
  async verify(journeyId, step, nurse, byRole, opts={}){
    const j = this.journeys.find(x=>x.id===journeyId);
    if(!j) return {ok:false, msg:'ไม่พบ Journey นี้'};
    if(byRole!=='OR') return {ok:false, msg:'เฉพาะห้องผ่าตัดยืนยันตัวผู้ป่วยได้'};
    const me = Session.profile || {};
    const rec = { entered_by: me.id || null, entered_name: me.full_name || null };
    let patch;

    if(j.is_emergency){
      if(j.status!=='PORTER_TO_OR') return {ok:false, msg:'สถานะไม่ถูกต้องสำหรับการยืนยัน'};
      patch = { verify1_by:nurse.id, verify1_name:nurse.name, verify1_at:isoNow(), verify1_solo:true,
                verify1_entered_by:rec.entered_by, verify1_entered_name:rec.entered_name,
                status:'IN_OR', entered_or_at:isoNow(), updated_at:isoNow() };
    } else if(step===1){
      if(j.status!=='PORTER_TO_OR') return {ok:false, msg:'สถานะไม่ถูกต้องสำหรับการยืนยันครั้งที่ 1'};
      patch = { verify1_by:nurse.id, verify1_name:nurse.name, verify1_at:isoNow(),
                verify1_entered_by:rec.entered_by, verify1_entered_name:rec.entered_name,
                status:'OR_VERIFY_1', updated_at:isoNow() };
    } else {
      if(j.status!=='OR_VERIFY_1') return {ok:false, msg:'ต้องยืนยันครั้งที่ 1 ก่อน'};
      if(j.verify1_id && j.verify1_id===nurse.id)
        return {ok:false, msg:'ครั้งที่ 2 ต้องเป็นพยาบาลคนละคนกับครั้งที่ 1'};
      const proxy = rec.entered_by !== nurse.id;
      if(proxy && !opts.copresent)
        return {ok:false, msg:'กรุณายืนยันว่าพยาบาลคนที่ 2 อยู่ด้วยและตรวจป้ายข้อมือแล้ว'};
      patch = { verify2_by:nurse.id, verify2_name:nurse.name, verify2_at:isoNow(),
                verify2_entered_by:rec.entered_by, verify2_entered_name:rec.entered_name,
                verify2_copresent: !!proxy,
                status:'IN_OR', entered_or_at:isoNow(), updated_at:isoNow() };
    }

    const { error } = await sb.from('journeys').update(patch).eq('id', journeyId);
    if(error){ console.error('[OR Journey] verify failed:', error); return {ok:false, msg:friendly(error)}; }
    await this.refreshOne(journeyId);
    return {ok:true};
  },

  /* Porter collecting from the ward: wristband check + destination room. */
  async porterPickup(journeyId, staff, roomId){
    const me = Session.profile || {};
    const patch = {
      status:'PORTER_TO_OR', or_room_id:roomId,
      verify_porter_by: staff.id, verify_porter_name: staff.name, verify_porter_at: isoNow(),
      verify_porter_entered_by: me.id||null, verify_porter_entered_name: me.full_name||null,
      porter_received_at: isoNow(), updated_at: isoNow(),
    };
    const { error } = await sb.from('journeys').update(patch).eq('id', journeyId);
    if(error){ console.error('[OR Journey] pickup failed:', error); return {ok:false, msg:friendly(error)}; }
    await this.refreshOne(journeyId);
    return {ok:true};
  },

  /* RR receiving from OR: wristband check at the handoff. */
  async rrReceive(journeyId, staff){
    const me = Session.profile || {};
    const patch = {
      status:'IN_RR',
      verify_rr_by: staff.id, verify_rr_name: staff.name, verify_rr_at: isoNow(),
      verify_rr_entered_by: me.id||null, verify_rr_entered_name: me.full_name||null,
      received_rr_at: isoNow(), updated_at: isoNow(),
    };
    const { error } = await sb.from('journeys').update(patch).eq('id', journeyId);
    if(error){ console.error('[OR Journey] RR receive failed:', error); return {ok:false, msg:friendly(error)}; }
    await this.refreshOne(journeyId);
    return {ok:true};
  },

  /* Cancel a journey. Reason comes from a fixed list — never free text. */
  async cancelJourney(journeyId, reason, byRole){
    const me = Session.profile || {};
    const patch = { status:'CANCELLED', cancelled_at:isoNow(), cancel_reason:reason,
                    cancelled_by: me.id||null,
                    staff_token_active:false, public_code_active:false, updated_at:isoNow() };
    const { error } = await sb.from('journeys').update(patch).eq('id', journeyId);
    if(error){ console.error('[OR Journey] cancel failed:', error); return {ok:false, msg:friendly(error)}; }
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
     public-safe subset and writes its own audit row. Never reads `journeys`.
     The RPC also returns a ready-made Thai label (`public_status`); we keep the
     internal key too so the UI renders the same pill as everywhere else. */
  async publicLookup(avatarId, code, byRole){
    const { data, error } = await sb.rpc('public_status_lookup',
      { p_avatar: avatarId, p_code: code });
    if(error){ console.error('[OR Journey] lookup failed:', error); return null; }
    const row = Array.isArray(data) ? data[0] : data;
    if(!row) return null;
    return {
      avatar_id: row.avatar_id,
      case_code: row.case_code,
      status: row.status_key || null,      // internal key, for the status pill
      public_text: row.public_status,      // server-rendered Thai label
      updated_at: tsToMs(row.updated_at),
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

/* Pending self-registrations, and the approval actions. Approving is deliberately
   more than a switch: the administrator must assign a role, which forces them to
   decide who this person actually is — the name they typed will end up signed
   against wristband checks. */
const Approvals = {
  async pending(){
    if(DEMO_MODE) return [];
    const { data, error } = await sb.from('profiles')
      .select('id, full_name, requested_unit, approval_status, reject_reason, created_at')
      .neq('approval_status','APPROVED').order('created_at', {ascending:false});
    if(error){ console.error('[OR Journey] pending list failed:', error); return []; }
    return data||[];
  },
  async approve(id, role, wardId, fullName){
    const me = Session.profile || {};
    const { error } = await sb.from('profiles').update({
      role, ward_id: wardId||null, full_name: fullName,
      is_provisioned:true, approval_status:'APPROVED',
      approved_by: me.id||null, approved_at: isoNow(), updated_at: isoNow(),
    }).eq('id', id);
    if(error){ console.error('[OR Journey] approve failed:', error); return {ok:false,msg:friendly(error)}; }
    return {ok:true};
  },
  async reject(id, reason){
    const me = Session.profile || {};
    const { error } = await sb.from('profiles').update({
      is_provisioned:false, approval_status:'REJECTED', reject_reason:reason,
      approved_by: me.id||null, approved_at: isoNow(), updated_at: isoNow(),
    }).eq('id', id);
    if(error){ console.error('[OR Journey] reject failed:', error); return {ok:false,msg:friendly(error)}; }
    return {ok:true};
  },
};

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
    const err = w.error || r.error;
    if(err){
      console.error('[OR Journey] reference load failed:', err);
      const m = (err.message||'') + ' ' + (err.details||'') + ' ' + (err.hint||'');
      let msg;
      if(/does not exist|relation .* does not exist|schema cache/i.test(m))
        msg = 'ยังไม่ได้สร้างตารางในฐานข้อมูล — กรุณารัน sql/01_schema.sql ใน Supabase ก่อน';
      else if(/permission denied|row-level security|JWT|not authenticated/i.test(m))
        msg = 'ไม่มีสิทธิ์อ่านข้อมูลหอผู้ป่วย — กรุณาเข้าสู่ระบบใหม่ หรือตรวจว่ารัน sql/02_rls.sql แล้ว';
      else if(/Failed to fetch|NetworkError|ERR_/i.test(m))
        msg = 'เชื่อมต่อ Supabase ไม่ได้ — ตรวจสอบ supabaseUrl ใน js/config.js และอินเทอร์เน็ต';
      else if(/Invalid API key|apikey/i.test(m))
        msg = 'anon key ไม่ถูกต้อง — ตรวจสอบ supabaseAnonKey ใน js/config.js';
      else
        msg = 'โหลดข้อมูลหอผู้ป่วยและห้องผ่าตัดไม่สำเร็จ';
      // Always attach the raw reason: this is an internal staff tool, and a
      // technician cannot fix what the app refuses to name.
      return {ok:false, msg, detail:(err.message||String(err))};
    }
    WARDS = w.data || [];
    OR_ROOMS = r.data || [];
    WARD_USERS = WARDS.slice();
    if(!WARDS.length || !OR_ROOMS.length){
      // Tables are readable but empty -> the seed really has not been run.
      return {ok:false, msg:'ยังไม่มีข้อมูลหอผู้ป่วยหรือห้องผ่าตัด — กรุณารัน sql/03_seed.sql ใน Supabase ก่อน'};
    }
    return {ok:true};
  },
};

/* ================================================================== AUTH */
const Auth = {
  /* Self-registration. The account is inert until an administrator approves it,
     so this creates a request, not access. */
  async signUp(email, password, fullName, unit){
    if(DEMO_MODE) return {ok:false, msg:'โหมดเดโม — ยังไม่ได้ตั้งค่า Supabase'};
    if(CFG.allowSignup === false) return {ok:false, msg:'ระบบปิดการสมัครด้วยตนเอง กรุณาติดต่อผู้ดูแลระบบ'};
    const dom = (CFG.allowedEmailDomains||[]);
    const e = email.trim().toLowerCase();
    // Match the domain itself or any sub-domain of it, so listing 'cmu.ac.th'
    // also accepts addresses like name@med.cmu.ac.th.
    const okDomain = d => { d = d.toLowerCase().replace(/^@/,'');
                            return e.endsWith('@'+d) || e.endsWith('.'+d); };
    if(dom.length && !dom.some(okDomain))
      return {ok:false, msg:'อนุญาตเฉพาะอีเมลของหน่วยงาน (' + dom.map(d=>'@'+d).join(' หรือ ') + ')'};

    const { error } = await sb.auth.signUp({
      email, password,
      options:{ data:{ full_name: fullName, requested_unit: unit } },
    });
    if(error){
      const m = error.message||'';
      if(/already registered|already exists/i.test(m))
        return {ok:false, msg:'อีเมลนี้มีบัญชีอยู่แล้ว — ลองเข้าสู่ระบบ หรือติดต่อผู้ดูแลระบบ'};
      if(/Password/i.test(m))
        return {ok:false, msg:'รหัสผ่านสั้นเกินไป ต้องมีอย่างน้อย 6 ตัวอักษร'};
      console.error('[OR Journey] signup failed:', error);
      return {ok:false, msg:'สมัครไม่สำเร็จ กรุณาลองใหม่'};
    }
    return {ok:true};
  },

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
      .select('id, full_name, role, ward_id, can_work_or, is_provisioned, approval_status, reject_reason')
      .eq('id', Session.user.id).single();
    if(error || !data){
      console.error('[OR Journey] profile load failed:', error);
      return {ok:false, msg:'ไม่พบโปรไฟล์ผู้ใช้ — กรุณาติดต่อผู้ดูแลระบบ'};
    }
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

/* Staff lists for the "who confirmed" pickers — entries are {id, name}.
   The id matters: it is what the two-different-nurses rule compares, so a name
   collision between two staff can never look like the same person.
   In LIVE mode we never substitute demo names — a wristband check signed by a
   fictional nurse would corrupt the audit trail. */
const Staff = {
  OR: [], PORTER: [], RR: [], error: null,
  async load(){
    this.error = null;
    if(DEMO_MODE){
      const mk = (arr,p) => arr.map((n,i)=>({id:`demo-${p}-${i}`, name:n}));
      this.OR=mk(OR_STAFF,'or'); this.PORTER=mk(PORTER_STAFF,'porter'); this.RR=mk(RR_STAFF,'rr');
      return {ok:true};
    }
    // is_provisioned matters here: a self-registered account can set its own
    // full_name during sign-up, so an unapproved name could otherwise appear in
    // the "who confirmed" picker and end up signed against a wristband check.
    const { data, error } = await sb.from('profiles')
      .select('id, full_name, role, can_work_or').eq('is_active', true).eq('is_provisioned', true);
    if(error){
      console.error('[OR Journey] staff list failed:', error);
      this.OR=[]; this.PORTER=[]; this.RR=[];
      this.error = error.message || 'อ่านรายชื่อเจ้าหน้าที่ไม่ได้';
      return {ok:false, msg:'โหลดรายชื่อเจ้าหน้าที่ไม่สำเร็จ', detail:this.error};
    }
    const by = r => (data||[])
      .filter(p=>(p.role===r || (r==='OR' && p.can_work_or===true)) && p.full_name && p.full_name.trim())
      .map(p=>({id:p.id, name:p.full_name.trim()}))
      .sort((a,b)=>a.name.localeCompare(b.name,'th'));
    this.OR = by('OR'); this.PORTER = by('PORTER'); this.RR = by('RR');

    // The two-nurse check needs two *different* OR staff to be selectable.
    if(this.OR.length < 2){
      return {ok:false,
        msg:'ต้องมีเจ้าหน้าที่ห้องผ่าตัดอย่างน้อย 2 คนที่ตั้งชื่อแล้ว จึงจะยืนยันตัวผู้ป่วย 2 ครั้งได้',
        detail:'พบบัญชี role=OR ที่มี full_name จำนวน ' + this.OR.length + ' คน'};
    }
    if(!this.PORTER.length || !this.RR.length){
      return {ok:false,
        msg:'ยังไม่มีเจ้าหน้าที่หน่วยเปลหรือห้องพักฟื้นที่ตั้งชื่อไว้',
        detail:'PORTER=' + this.PORTER.length + ', RR=' + this.RR.length +
               ' — ต้องตั้ง full_name ในตาราง profiles'};
    }
    return {ok:true};
  },

  /* The signed-in user as a picker entry, so their own name can be the default. */
  me(){
    const p = Session.profile;
    if(!p) return null;
    return {id:p.id, name:p.full_name || 'ฉัน'};
  },

  /* Picker options for a role, with the signed-in user first if they belong. */
  optionsFor(role){
    const list = (this[role]||[]).slice();
    const me = this.me();
    if(me && Session.profile.role===role && !list.some(s=>s.id===me.id)) list.unshift(me);
    return list;
  },

  find(role, id){ return (this[role]||[]).find(s=>s.id===id) || (this.me() && this.me().id===id ? this.me() : null); },
};

/* Runs the four things that must work, in order, and reports the first failure.
   Callable from the console at any time: await ojDiagnose() */
async function ojDiagnose(){
  const out = [];
  const push = (step, ok, note) => out.push({step, ok, note:note||''});

  push('config', !!(CFG.supabaseUrl && CFG.supabaseAnonKey),
       CFG.supabaseUrl ? CFG.supabaseUrl : 'ยังไม่ได้กรอก js/config.js');
  push('supabase-js', !!(window.supabase && window.supabase.createClient));
  if(DEMO_MODE){ push('mode', true, 'DEMO MODE — ยังไม่ได้ต่อฐานข้อมูล'); console.table(out); return out; }

  try {
    const { error } = await sb.from('wards').select('id').limit(1);
    push('read wards', !error, error ? error.message : 'ok');
  } catch(e){ push('read wards', false, String(e)); }

  try {
    const { data } = await sb.auth.getSession();
    push('session', true, data && data.session ? 'ล็อกอินอยู่' : 'ยังไม่ได้ล็อกอิน');
  } catch(e){ push('session', false, String(e)); }

  try {
    const { count, error } = await sb.from('wards').select('*', {count:'exact', head:true});
    push('wards rows', !error, error ? error.message : String(count) + ' แถว');
  } catch(e){ push('wards rows', false, String(e)); }

  console.table(out);
  return out;
}
window.ojDiagnose = ojDiagnose;

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
  // NOTE: wards / OR rooms / staff are readable only by authenticated users, so
  // they are loaded in loadWorkspace() AFTER sign-in — not here.
  return {mode:'live'};
}

/* Everything that requires a signed-in session. Called right after auth. */
async function loadWorkspace(){
  const ref = await Reference.load();
  if(!ref.ok) return ref;
  const st = await Staff.load();
  if(!st.ok) return st;
  return {ok:true};
}

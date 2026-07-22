/* ============================================================================
   OR Journey — DEMO data layer (mock, in-memory)
   Used only when Supabase credentials are absent or forceDemo is on.
   Exposes the same async interface as the real store in api.js.
   ============================================================================ */
/* ---------------------------- MOCK DATA / STORE -------------------------- */
/* Demo-only reference rows. In live mode Reference.load() replaces these with
   the real rows (and real uuid ids) from the database — see api.js. */
const DEMO_WARDS = [
  {id:'w1', name:'อายุรกรรมหญิง 1'},
  {id:'w2', name:'สูตินรีเวชกรรม'},
  {id:'w3', name:'ศัลยกรรมหญิง'},
  {id:'w4', name:'นรีเวชกรรม'},
  {id:'lr', name:'ห้องคลอด (LR)'},
];
const DEMO_OR_ROOMS = [{id:'or1',name:'OR 1'},{id:'or2',name:'OR 2'},{id:'or3',name:'OR 3'},{id:'or4',name:'OR 4'}];

let SEQ = 1;
function now(){return Date.now()}
function genCode(){ // readable, avoid confusables O0 I1 B8
  const L='ACDEFGHJKMNPQRTUVWXY', N='234567';
  const p=s=>s[Math.floor(Math.random()*s.length)];
  return p(L)+p(N)+p(L)+p(N);
}
function genToken(){return 'orj_'+Array.from({length:24},()=>Math.floor(Math.random()*16).toString(16)).join('')}

const MockStore = {
  journeys:[], events:[], audit:[], listeners:new Set(), usedAvatars:{}, // usedAvatars[wardId] = Set
  online:true,

  emit(){this.listeners.forEach(f=>f())},
  sub(f){this.listeners.add(f);return()=>this.listeners.delete(f)},

  pickAvatar(wardId){
    const used = this.journeys.filter(j=>j.ward_id===wardId && !['COMPLETED','CANCELLED'].includes(j.status)).map(j=>j.avatar_id);
    const free = AVATARS.filter(a=>!used.includes(a.id));
    const pool = free.length?free:AVATARS;
    return pool[Math.floor(Math.random()*pool.length)].id;
  },
  uniqueCode(){let c;do{c=genCode()}while(this.journeys.some(j=>j.case_code===c && !['COMPLETED','CANCELLED'].includes(j.status)));return c},

  async createJourney(wardId, byRole, roomId, emergency=false){
    const w = WARDS.find(x=>x.id===wardId);
    const room = OR_ROOMS.find(x=>x.id===roomId) || null;
    const j = {
      id:'j'+(SEQ++), case_code:this.uniqueCode(), ward_id:wardId, ward_name:w.name,
      avatar_id:this.pickAvatar(wardId), status:'WAITING_PORTER',
      is_emergency: !!emergency,
      current_location:w.name, or_room_id:room?room.id:null, or_room:room?room.name:null, dest:room?room.name:'ห้องผ่าตัด',
      staff_token:genToken(), public_code:null,
      verify1:null, verify2:null,
      created_at:now(), updated_at:now(),
      timestamps:{created_at_ward:now()},
    };
    j.public_code = j.case_code; // public tracking uses case code + avatar
    this.journeys.unshift(j);
    this.logEvent(j.id,'JOURNEY_CREATED',{ward:w.name});
    this.audit.unshift(auditRow(byRole,'JOURNEY_CREATED','journey',j.id,true,{ward:w.name}));
    this.audit.unshift(auditRow(byRole, emergency?'EMERGENCY_CREATED':'WAITING_PORTER','journey',j.id,true,emergency?{emergency:true}:{}));
    this.emit();
    return j;
  },

  async transition(journeyId, to, byRole){
    const j = this.journeys.find(x=>x.id===journeyId);
    if(!j) return {ok:false,msg:'ไม่พบ Journey นี้'};
    const allowed = (TRANSITIONS[j.status]||[]).find(t=>t.to===to && t.role===byRole);
    if(!allowed){
      this.audit.unshift(auditRow(byRole,'INVALID_TRANSITION','journey',j.id,false,{from:j.status,to}));
      return {ok:false,msg:'ไม่สามารถอัปเดตสถานะนี้ได้ในบทบาทปัจจุบัน'};
    }
    j.status = to; j.updated_at = now();
    const tsKey = {PORTER_TO_OR:'porter_received_at',OR_VERIFY_1:'verify1_at',IN_OR:'entered_or_at',SURGERY_FINISHED:'surgery_finished_at',IN_RR:'received_rr_at',COMPLETED:'completed_at'}[to];
    if(tsKey) j.timestamps[tsKey]=now();
    this.logEvent(j.id,'STATUS_CHANGED',{to});
    this.audit.unshift(auditRow(byRole,'STATUS_CHANGED','journey',j.id,true,{to}));
    if(to==='COMPLETED'){
      j.staff_token=null; j.public_code=null; // revoke
      this.logEvent(j.id,'QR_REVOKED',{});
      this.audit.unshift(auditRow(byRole,'JOURNEY_COMPLETED','journey',j.id,true));
      this.audit.unshift(auditRow('SYSTEM','QR_REVOKED','journey',j.id,true));
    }
    this.emit();
    return {ok:true};
  },

  /* two-nurse identity verification. Records WHICH nurse confirmed the wristband
     matched — never the patient's name. step 2 must be a different nurse. */
  async verify(journeyId, step, nurse, byRole){
    const j=this.journeys.find(x=>x.id===journeyId);
    if(!j) return {ok:false,msg:'ไม่พบ Journey นี้'};
    if(byRole!=='OR'){this.audit.unshift(auditRow(byRole,'INVALID_TRANSITION','journey',j.id,false,{verify:step}));return {ok:false,msg:'เฉพาะห้องผ่าตัดยืนยันตัวผู้ป่วยได้'}}
    // Emergency: identity is still verified, but one nurse is enough — recorded honestly as a single-nurse check.
    if(j.is_emergency){
      if(j.status!=='PORTER_TO_OR') return {ok:false,msg:'สถานะไม่ถูกต้องสำหรับการยืนยัน'};
      j.verify1={by:nurse, at:now(), solo:true};
      j.status='IN_OR'; j.updated_at=now(); j.timestamps.verify1_at=now(); j.timestamps.entered_or_at=now();
      this.logEvent(j.id,'IDENTITY_VERIFIED',{step:1, nurse, emergency:true, solo:true});
      this.audit.unshift(auditRow(byRole,'IDENTITY_VERIFIED','journey',j.id,true,{nurse, emergency:true, solo:true}));
      this.emit();
      return {ok:true};
    }
    if(step===1){
      if(j.status!=='PORTER_TO_OR') return {ok:false,msg:'สถานะไม่ถูกต้องสำหรับการยืนยันครั้งที่ 1'};
      j.verify1={by:nurse, at:now()}; j.status='OR_VERIFY_1'; j.updated_at=now(); j.timestamps.verify1_at=now();
    } else {
      if(j.status!=='OR_VERIFY_1') return {ok:false,msg:'ต้องยืนยันครั้งที่ 1 ก่อน'};
      if(j.verify1 && j.verify1.by===nurse) return {ok:false,msg:'ครั้งที่ 2 ต้องเป็นพยาบาลคนละคนกับครั้งที่ 1'};
      j.verify2={by:nurse, at:now()}; j.status='IN_OR'; j.updated_at=now(); j.timestamps.entered_or_at=now();
    }
    this.logEvent(j.id,'IDENTITY_VERIFIED',{step, nurse});
    this.audit.unshift(auditRow(byRole,'IDENTITY_VERIFIED','journey',j.id,true,{step, nurse}));
    this.emit();
    return {ok:true};
  },

  logEvent(jid,type,meta){this.events.unshift({id:'e'+now()+Math.random(),journey_id:jid,type,meta,at:now()})},

  async publicLookup(avatarId, code, byRole){
    const j = this.journeys.find(x=>x.avatar_id===avatarId && x.public_code===code && x.public_code!==null);
    this.audit.unshift(auditRow(byRole,'PUBLIC_STATUS_LOOKUP','journey', j?j.id:null, !!j, {avatar:avatarId, code}));
    this.emit();
    return j||null;
  },
};
function auditRow(actor,action,rtype,rid,success,meta={}){
  return {actor, action, resource_type:rtype, resource_id:rid, success, at:now(), device:'iPhone · Safari', meta};
}

/* seed a few in-flight journeys for realistic boards */
async function seedMock(){
  const M=60000;
  // in-flight: [ward, status, minsAgo(start), room]
  const specs=[['w2','IN_OR',-38,'or1'],['w2','SURGERY_FINISHED',-70,'or2'],['w1','OR_VERIFY_1',-48,'or3'],['w4','IN_RR',-95,'or1'],['w3','PORTER_TO_OR',-9,'or4'],['w1','WAITING_PORTER',-4,null]];
  for(const [wid,st,minsAgo,room] of specs){
    const j=await MockStore.createJourney(wid,'PORTER',room);
    j.status=st; j.created_at=now()+minsAgo*M; j.updated_at=now()+Math.floor(minsAgo/2)*M;
    const T=j.timestamps; T.created_at_ward=j.created_at;
    if(st!=='WAITING_PORTER') T.porter_received_at=j.created_at+3*M;
    // fill stage timestamps consistent with how far the case has progressed
    if(['OR_VERIFY_1','IN_OR','SURGERY_FINISHED','IN_RR'].includes(st)){
      T.verify1_at=j.created_at+12*M; j.verify1={by:OR_STAFF[0],at:T.verify1_at};
    }
    if(['IN_OR','SURGERY_FINISHED','IN_RR'].includes(st)){
      T.entered_or_at=j.created_at+20*M; j.verify2={by:OR_STAFF[1],at:T.entered_or_at};
    }
    if(['SURGERY_FINISHED','IN_RR'].includes(st)) T.surgery_finished_at=j.created_at+55*M;
    if(st==='IN_RR') T.received_rr_at=j.created_at+62*M;
    j.updated_at = T.received_rr_at||T.surgery_finished_at||T.entered_or_at||T.verify1_at||T.porter_received_at||j.created_at;
  }
  // finished earlier today -> gives the dashboard real averages to compute
  for(const [wid,startAgo,room,toOR,surg,rr] of [['w1',-260,'or1',18,52,48],['w3',-205,'or2',24,71,63],['w2',-150,'or4',15,44,55]]){
      const j=await MockStore.createJourney(wid,'PORTER',room);
      const t0=now()+startAgo*M, T=j.timestamps;
      j.status='COMPLETED'; j.created_at=t0;
      T.created_at_ward=t0; T.porter_received_at=t0+4*M;
      T.verify1_at=t0+Math.round(toOR*0.6)*M;
      T.entered_or_at=t0+toOR*M;
      T.surgery_finished_at=T.entered_or_at+surg*M;
      T.received_rr_at=T.surgery_finished_at+6*M;
      T.completed_at=T.received_rr_at+rr*M;
      j.updated_at=T.completed_at;
      j.verify1={by:OR_STAFF[0],at:T.verify1_at}; j.verify2={by:OR_STAFF[1],at:T.entered_or_at};
      j.staff_token=null; j.public_code=null; // revoked on completion
  }
  MockStore.audit=MockStore.audit.slice(0,4); // trim seed noise
}

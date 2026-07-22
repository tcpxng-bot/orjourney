/* ============================================================================
   OR Journey — screens, sheets and interactions
   Reads Store.journeys synchronously; all writes are awaited.
   ============================================================================ */
/* ---------------------------- APP STATE ---------------------------------- */
const State = {
  screen:'login', role:null, wardId:null, activeJourney:null, orRoom:'all',
};

/* ---------------------------- UTILITIES ---------------------------------- */
function fmtTime(ts){const d=new Date(ts);return d.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})+' น.'}
function ago(ts){const m=Math.max(0,Math.round((now()-ts)/60000));if(m<1)return'เมื่อสักครู่';if(m<60)return`${m} นาที`;const h=Math.floor(m/60);return`${h} ชม. ${m%60} น.`}
function statusPill(st){const s=STATUS[st];return `<span class="status" style="background:${s.tint};color:${s.ink};border-color:color-mix(in srgb,${s.color} 34%,transparent)">${svg(s.icon)}${s.label}</span>`}
function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}

/* ---------------------------- CUSTOM DROPDOWN --------------------------- */
/* dd(id, options[{v,label}], current, placeholder?) -> styled dropdown HTML.
   Selection routes through ddDispatch(id,val). Replaces native <select>. */
function dd(id, options, cur, placeholder){
  const curOpt = options.find(o=>o.v===cur);
  const shown = curOpt ? esc(curOpt.label) : (placeholder||'— เลือก —');
  return `<div class="dd" id="dd-${id}">
    <button type="button" class="dd-btn" onclick="ddToggle('${id}')" aria-haspopup="listbox">
      <span class="dd-val${curOpt?'':' ph'}">${shown}</span>${svg('chevronDown','dd-chev')}
    </button>
    <div class="dd-panel" role="listbox">
      ${options.map(o=>`<button type="button" class="dd-opt${o.v===cur?' sel':''}" data-val="${esc(o.v)}" onclick="ddPick(this,'${id}')">${svg('check','dd-tick')}<span>${esc(o.label)}</span></button>`).join('')}
    </div>
  </div>`;
}
function ddToggle(id){
  const root=document.getElementById('dd-'+id); if(!root) return;
  const willOpen=!root.classList.contains('open');
  document.querySelectorAll('.dd.open').forEach(d=>{d.classList.remove('open');d.classList.remove('up')});
  if(willOpen){
    const btn=root.querySelector('.dd-btn'), panel=root.querySelector('.dd-panel');
    const spaceBelow=window.innerHeight - btn.getBoundingClientRect().bottom;
    const need=Math.min(panel.scrollHeight+12, 276);
    if(spaceBelow < need + 16) root.classList.add('up');
    root.classList.add('open');
  }
}
function ddPick(el, id){
  const val=el.dataset.val, label=el.querySelector('span').textContent;
  const root=document.getElementById('dd-'+id);
  if(root){
    const v=root.querySelector('.dd-val'); v.textContent=label; v.classList.remove('ph');
    root.querySelectorAll('.dd-opt').forEach(o=>o.classList.remove('sel')); el.classList.add('sel');
    root.classList.remove('open');
  }
  ddDispatch(id, val);
}
function ddDispatch(id, val){
  if(id==='wardSel'){ State.wardId=val; render(); }
  else if(id==='srcWard'){ CForm.src=val; }
  else if(id==='destOR'){ CForm.dest=val; }
  else if(id==='vNurse'){ _vNurse=val; }
  else if(id==='vRoom'){ _vRoom=val; }
  else if(id==='pRoom'){ _pRoom=val; }
  else if(id==='pStaff'){ _pStaff=val; }
  else if(id==='rStaff'){ _rStaff=val; }
  else if(id==='eWard'){ _eWard=val; }
  else if(id==='eRoom'){ _eRoom=val; }
}
document.addEventListener('click', e=>{ if(!e.target.closest('.dd')) document.querySelectorAll('.dd.open').forEach(d=>d.classList.remove('open')); });
document.addEventListener('keydown', e=>{ if(e.key==='Escape') document.querySelectorAll('.dd.open').forEach(d=>d.classList.remove('open')); });
let CForm={src:null, dest:null};

/* ---------------------------- UI helpers --------------------------------- */
const UI = {
  toast(msg,kind=''){const t=document.createElement('div');t.className='toast '+kind;t.innerHTML=(kind==='ok'?svg('check'):kind==='err'?svg('alert'):'')+`<span>${esc(msg)}</span>`;document.getElementById('toasts').appendChild(t);setTimeout(()=>{t.style.opacity='0';t.style.transition='opacity .3s';setTimeout(()=>t.remove(),300)},2600)},
  openSheet(html){const s=document.getElementById('sheet');s.innerHTML=`<div class="sheet-grab"></div>`+html;document.getElementById('scrim').classList.add('open');s.classList.add('open')},
  closeSheet(){document.getElementById('scrim').classList.remove('open');document.getElementById('sheet').classList.remove('open')},
};

/* ============================================================ RENDER ====== */
function render(){
  const app=document.getElementById('app');
  if(State.screen==='login'){app.innerHTML=viewLogin();return}
  app.innerHTML = `<div class="shell">${sidebar()}<div class="main">${topbar()}<div class="viewport fade" id="vp">${screenBody()}</div></div></div>${bottomnav()}`;
}

function screenBody(){
  switch(State.screen){
    case 'home': return roleHome();
    case 'dashboard': return dashboardView();
    case 'or-board': return orBoard();
    case 'rr-board': return rrBoard();
    case 'ward-board': return wardBoard();
    case 'pr-lookup': return prLookup();
    case 'history': return historyView();
    case 'audit': return auditView();
    case 'admin': return adminView();
    default: return roleHome();
  }
}

/* ---------------------------- LOGIN -------------------------------------- */
function viewLogin(){
  const demo = (typeof DEMO_MODE!=='undefined') && DEMO_MODE;
  return `<div class="login-wrap fade">
    <div class="brandmark">${avatarSVG('cloud')}</div>
    <h1>OR Journey</h1>
    <p class="tag">ติดตามการเดินทางของผู้ป่วยในห้องผ่าตัด อย่างเป็นส่วนตัวและใจเย็น</p>

    ${demo ? demoRolePicker() : `
    <div class="tile">
      <div class="field">
        <label for="loginEmail">อีเมล</label>
        <input class="input" id="loginEmail" type="email" autocomplete="username"
               inputmode="email" placeholder="name@hospital.go.th" />
      </div>
      <div class="field">
        <label for="loginPass">รหัสผ่าน</label>
        <input class="input" id="loginPass" type="password" autocomplete="current-password"
               placeholder="••••••••" onkeydown="if(event.key==='Enter')submitLogin()" />
      </div>
      <div id="loginErr"></div>
      <button class="btn btn-accent" id="loginBtn" onclick="submitLogin()">${svg('logout')} เข้าสู่ระบบ</button>
      <p class="help" style="text-align:center;margin-top:12px">บทบาทและหอผู้ป่วยกำหนดจากบัญชีของคุณ<br>หากเข้าไม่ได้ กรุณาติดต่อผู้ดูแลระบบ</p>
    </div>`}

    <div class="notice" style="margin-top:26px">${svg('shield')}<span>ระบบนี้ไม่เก็บชื่อผู้ป่วย HN เลขบัตรประชาชน การวินิจฉัย หรือชื่อหัตถการ ข้อมูลทั้งหมดเป็นเพียงสถานะกระบวนการเท่านั้น</span></div>
    <p class="buildstamp">build ${typeof OJ_BUILD!=='undefined'?OJ_BUILD:'—'}${DEMO_MODE?' · demo':''}</p>
  </div>`;
}

/* Demo mode only: pick a role without credentials. */
function demoRolePicker(){
  return `<div class="notice emerg-notice" style="margin-bottom:16px">${svg('alert')}<span><b>โหมดเดโม</b> — ยังไม่ได้ตั้งค่า Supabase ข้อมูลเป็นของจำลองและไม่ถูกบันทึก แก้ไขได้ที่ <code>js/config.js</code></span></div>
    <div class="eyebrow" style="margin-bottom:12px">เลือกบทบาทเพื่อเข้าใช้งาน</div>
    <div class="role-list">
      ${Object.entries(ROLES).map(([k,r])=>`
        <button class="role-opt" onclick="demoLogin('${k}')">
          <span class="ro-ic" style="background:${r.tint};color:${r.ink}">${svg(r.icon)}</span>
          <span><span class="ro-name">${r.name}</span><span class="ro-desc">${r.desc}</span></span>
          <span class="ro-arrow">${svg('arrowRight')}</span>
        </button>`).join('')}
    </div>`;
}

async function submitLogin(){
  const btn=document.getElementById('loginBtn');
  const email=(document.getElementById('loginEmail').value||'').trim();
  const pass=document.getElementById('loginPass').value||'';
  const err=document.getElementById('loginErr');
  err.innerHTML='';
  if(!email||!pass){ err.innerHTML=`<div class="field-error">${svg('alert')} กรุณากรอกอีเมลและรหัสผ่าน</div>`; return; }
  btn.disabled=true; btn.innerHTML=`<span class="spin"></span> กำลังเข้าสู่ระบบ...`;
  const res=await Auth.signIn(email,pass);
  if(!res.ok){
    btn.disabled=false; btn.innerHTML=`${svg('logout')} เข้าสู่ระบบ`;
    err.innerHTML=`<div class="field-error">${svg('alert')} ${esc(res.msg)}</div>`;
    return;
  }
  // wards / rooms / staff are only readable once signed in
  const ws=await loadWorkspace();
  if(!ws.ok){
    await Auth.signOut();
    btn.disabled=false; btn.innerHTML=`${svg('logout')} เข้าสู่ระบบ`;
    err.innerHTML=`<div class="field-error">${svg('alert')} ${esc(ws.msg)}</div>`;
    return;
  }
  await startSession();
}

function demoLogin(role){
  State.role=role;
  State.wardId = role==='WARD' ? WARD_USERS[0].id : null;
  Store.audit.unshift(auditRow(role,'LOGIN_SUCCESS','session',null,true));
  State.screen=defaultScreen(role);
  render();
  UI.toast(`เข้าสู่ระบบในบทบาท ${ROLES[role].name}`,'ok');
}

/* Applies the signed-in profile to app state, then opens that role's home. */
async function startSession(){
  const p=Session.profile;
  State.role=p.role;
  State.wardId=p.ward_id||null;
  State.screen=defaultScreen(p.role);
  if(Store.init) await Store.init();
  if(p.role==='ADMIN' && Store.refreshAudit) await Store.refreshAudit();
  render();
  UI.toast(`เข้าสู่ระบบในบทบาท ${ROLES[p.role].name}`,'ok');
}

async function logout(){
  await Auth.signOut();
  State.role=null; State.wardId=null; State.screen='login';
  UI.closeSheet(); render();
}
function defaultScreen(role){return{PORTER:'home',OR:'or-board',RR:'rr-board',WARD:'ward-board',PR:'pr-lookup',ADMIN:'admin'}[role]}

/* ---------------------------- CHROME ------------------------------------- */
function topbar(){
  const titles={home:'หน้าหลัก',dashboard:'ภาพรวม OR',
    'or-board':'กระดานห้องผ่าตัด','rr-board':'ห้องพักฟื้น','ward-board':'สถานะหอผู้ป่วย','pr-lookup':'ตรวจสอบสถานะ',history:'ประวัติ',audit:'บันทึกการใช้งาน',admin:'ผู้ดูแลระบบ'};
  const r=ROLES[State.role];
  const showLive = ['ward-board','or-board','rr-board','home','dashboard'].includes(State.screen);
  return `<div class="topbar"><div class="topbar-in">
    <div style="flex:1"><h1>${titles[State.screen]||'OR Journey'}</h1>
      ${showLive?`<span class="live"><span class="pulse"></span>${Store.online?'อัปเดตเรียลไทม์':'ออฟไลน์'}</span>`:`<span class="sub">${r.name}</span>`}</div>
    <span class="role-chip"><span class="dot" style="background:${r.color}"></span>${r.name}</span>
    <button class="icon-btn" onclick="openAccountSheet()" aria-label="บัญชี">${svg('user')}</button>
  </div></div>`;
}
function openAccountSheet(){
  const r=ROLES[State.role];
  UI.openSheet(`<h3>บัญชีเดโม</h3><p class="sheet-sub">คุณกำลังใช้งานในบทบาท ${r.name}</p>
    <div class="tile" style="margin-bottom:14px;display:flex;gap:12px;align-items:center">
      <span class="ro-ic" style="width:44px;height:44px;border-radius:13px;display:grid;place-items:center;background:${r.tint};color:${r.ink}">${svg(r.icon)}</span>
      <div><div style="font-weight:600">${r.name}</div><div style="font-size:12.5px;color:var(--ink-2)">${r.desc}</div></div></div>
    <button class="btn btn-soft" style="margin-bottom:10px" onclick="toggleOnline()">${Store.online?svg('wifiOff'):svg('wifi')} จำลอง${Store.online?'ขาดการเชื่อมต่อ':'กลับมาออนไลน์'}</button>
    <button class="btn btn-danger" onclick="logout()">${svg('logout')} ออกจากระบบ</button>`);
}
function toggleOnline(){Store.online=!Store.online;UI.closeSheet();render();UI.toast(Store.online?'เชื่อมต่อเรียลไทม์แล้ว':'การเชื่อมต่อขาดหาย — จะซิงก์อัตโนมัติเมื่อกลับมาออนไลน์',Store.online?'ok':'err')}

function navFor(role){
  const N={
    PORTER:[['home','stretcher','งานรับ-ส่ง'],['history','history','ประวัติ']],
    OR:[['or-board','scissors','กระดาน'],['dashboard','activity','ภาพรวม'],['history','history','ประวัติ']],
    RR:[['rr-board','heart','พักฟื้น'],['dashboard','activity','ภาพรวม'],['history','history','ประวัติ']],
    WARD:[['ward-board','bed','สถานะ'],['history','history','ประวัติ']],
    PR:[['pr-lookup','search','ค้นหา']],
    ADMIN:[['admin','settings','ตั้งค่า'],['audit','shield','บันทึก'],['history','history','ประวัติ']],
  };
  return N[role]||[];
}
function bottomnav(){
  if(!State.role)return'';
  const items=navFor(State.role);
  if(items.length<=1 && State.role!=='WARD' && State.role!=='PR'){/* still show for consistency */}
  return `<nav class="bottomnav">${items.map(([sc,ic,lb])=>`<button class="navbtn ${State.screen===sc?'active':''}" onclick="go('${sc}')">${svg(ic)}<span>${lb}</span></button>`).join('')}</nav>`;
}
function sidebar(){
  if(!State.role)return'';
  const items=navFor(State.role);const r=ROLES[State.role];
  return `<aside class="sidebar">
    <div class="sb-brand"><span class="bm">${svg('route')}</span><span class="nm">OR Journey</span></div>
    ${items.map(([sc,ic,lb])=>`<button class="sb-item ${State.screen===sc?'active':''}" onclick="go('${sc}')">${svg(ic)}${lb}</button>`).join('')}
    <div class="sb-foot">
      <div class="sb-item" style="cursor:default"><span class="ro-ic" style="width:24px;height:24px;border-radius:8px;display:grid;place-items:center;background:${r.tint};color:${r.ink}">${svg(r.icon)}</span>${r.name}</div>
      <button class="sb-item" onclick="logout()">${svg('logout')}ออกจากระบบ</button>
    </div>
  </aside>`;
}
function go(sc){State.screen=sc;render();window.scrollTo(0,0)}

/* ---------------------------- ROLE HOME (PORTER) ------------------------- */
function roleHome(){
  if(State.role!=='PORTER') { State.screen=defaultScreen(State.role); return screenBody(); }
  const pendingAll = Store.journeys.filter(j=>j.status==='WAITING_PORTER');
  const urgent = pendingAll.filter(j=>j.is_emergency);
  const pending = pendingAll.filter(j=>!j.is_emergency);
  const toOR = Store.journeys.filter(j=>j.status==='PORTER_TO_OR');
  const doneToday = Store.journeys.filter(j=>j.status==='COMPLETED');
  return `
    <div class="stat-row" style="margin-top:6px">
      <div class="stat"><div class="n">${pendingAll.length}</div><div class="l">รอไปรับ</div></div>
      <div class="stat"><div class="n">${toOR.length}</div><div class="l">กำลังนำส่ง OR</div></div>
      <div class="stat"><div class="n">${doneToday.length}</div><div class="l">เสร็จวันนี้</div></div>
    </div>

    ${urgent.length?`<div class="section-title urgent-title">${svg('alert')} ด่วน · รับทันที <span class="count">${urgent.length} ราย</span></div>${urgent.map(j=>journeyCard(j,true)).join('')}`:''}

    <div class="section-title">${svg('bell')} รอไปรับที่หอผู้ป่วย <span class="count">${pending.length} ราย</span></div>
    ${pending.length? pending.map(j=>journeyCard(j,true)).join('') : emptyState('checkCircle','ยังไม่มีงานรอรับตามคิวปกติ','เมื่อหอผู้ป่วยสร้าง Journey รายการจะปรากฏที่นี่ทันที')}

    <div class="section-title">${svg('stretcher')} กำลังนำส่ง OR <span class="count">${toOR.length} ราย</span></div>
    ${toOR.length? toOR.map(j=>journeyCard(j,true)).join('') : emptyState('stretcher','ไม่มีเคสระหว่างนำส่ง','เคสที่รับแล้วจะแสดงที่นี่จนกว่าจะส่งถึง OR')}

    <p class="hint-foot">${svg('info')} เมื่อส่งถึง OR แล้ว เคสจะย้ายไปอยู่ในความดูแลของห้องผ่าตัด และดูย้อนหลังได้ที่แท็บประวัติ</p>
  `;
}

/* reusable journey card with primary action for current role */
function journeyCard(j, tappable){
  const s=STATUS[j.status];
  const action=(TRANSITIONS[j.status]||[]).find(t=>t.role===State.role);
  return `<div class="jcard ticket ${tappable?'tap':''}" ${tappable?`onclick="openJourney('${j.id}')"`:''}>
    <div class="jcard-top">
      ${avatarEl(j.avatar_id,'md')}
      <div class="jcard-body">
        <div class="jcard-name">${AV[j.avatar_id].name}<span class="jcard-code">· ${j.case_code}</span>${j.is_emergency?`<span class="em-chip">ฉุกเฉิน</span>`:''}${j.or_room?`<span class="room-chip">${esc(j.or_room)}</span>`:''}</div>
        <div class="jcard-route">${svg('mapPin')}${esc(j.ward_name)} ${svg('arrowRight')} ${esc(j.or_room||j.dest)}</div>
      </div>
    </div>
    <div style="padding:0 16px 14px">${statusPill(j.status)}</div>
    <div class="jcard-foot">
      ${action?`<button class="btn btn-primary btn-sm" onclick="event.stopPropagation();doAction('${j.id}','${action.to}')">${svg(action.icon)} ${action.label}</button>`:`<span style="font-size:12.5px;color:var(--ink-3)">${s.stage==='done'?'สิ้นสุด Journey':'รอหน่วยอื่นดำเนินการ'}</span>`}
      <span class="jcard-time">${svg('clock')} ${ago(j.updated_at)}</span>
    </div>
  </div>`;
}

function emptyState(ic,title,desc){return `<div class="empty"><div class="em-ic">${svg(ic)}</div><h4>${title}</h4><p>${desc}</p></div>`}

/* ---------------------------- PORTER CREATE ------------------------------ */
async function wardCreate(){
  const wardId = State.wardId || WARDS[0].id;
  if(!Store.online){UI.toast('ไม่มีการเชื่อมต่อ — ไม่สามารถสร้าง Journey ได้','err');return}
  let j; try{ j=await Store.createJourney(wardId,'WARD'); }
  catch(e){ UI.toast(e.message||'สร้าง Journey ไม่สำเร็จ','err'); return; }
  openFamilyCard(j.id, true);
  render();
}

/* Card handed to the family: avatar + code + how to check. Printable. */
function openFamilyCard(jid, isNew){
  const j=Store.journeys.find(x=>x.id===jid); if(!j)return;
  const a=AV[j.avatar_id];
  UI.openSheet(`
    <h3>${isNew?'สร้าง Journey สำเร็จ':'บัตรติดตามสำหรับญาติ'}</h3>
    <p class="sheet-sub">ยื่นหรือแสดงบัตรนี้ให้ญาติเพื่อใช้ติดตามสถานะ</p>
    <div class="fam-card" id="famCard">
      <div class="fam-top">${avatarEl(j.avatar_id,'lg')}
        <div><div class="fam-name">${a.name}</div><div class="fam-ward">${esc(j.ward_name)}</div></div></div>
      <div class="fam-code-wrap"><div class="fam-code-lb">รหัสติดตาม</div><div class="fam-code">${j.case_code}</div></div>
      <ol class="fam-how">
        <li>เปิดหน้าติดตามสถานะของโรงพยาบาล</li>
        <li>เลือกอวตาร์ <b>${a.name}</b></li>
        <li>กรอกรหัส <b>${j.case_code}</b></li>
      </ol>
      <p class="fam-note">หน้านี้แสดงเฉพาะสถานะกระบวนการ ไม่มีข้อมูลการรักษา · กรุณาเก็บรหัสไว้เฉพาะในครอบครัว</p>
    </div>
    <div class="fam-actions">
      <button class="btn btn-primary" onclick="printFamilyCard('${j.id}')">${svg('printer')} พิมพ์สลิป</button>
      <button class="btn btn-ghost" onclick="UI.closeSheet()">เสร็จสิ้น</button>
    </div>`);
}
function printFamilyCard(jid){
  const j=Store.journeys.find(x=>x.id===jid); if(!j)return;
  const a=AV[j.avatar_id];
  const host=document.getElementById('printArea');
  host.innerHTML=`<div class="slip">
    <div class="slip-h">บัตรติดตามสถานะผู้ป่วย</div>
    <div class="slip-av">${avatarSVG(j.avatar_id)}</div>
    <div class="slip-name">${a.name}</div>
    <div class="slip-code">${j.case_code}</div>
    <div class="slip-ward">${esc(j.ward_name)}</div>
    <ol class="slip-how"><li>เปิดหน้าติดตามสถานะของโรงพยาบาล</li><li>เลือกอวตาร์ ${a.name}</li><li>กรอกรหัส ${j.case_code}</li></ol>
    <div class="slip-note">แสดงเฉพาะสถานะกระบวนการ ไม่มีข้อมูลการรักษา<br>กรุณาเก็บรหัสไว้เฉพาะในครอบครัว</div>
  </div>`;
  window.print();
}

function qrBlock(j){
  return `<div class="qr-box"><div class="qr">${qrSVG(j.staff_token)}</div>
    <div style="font-size:12.5px;color:var(--ink-2);font-weight:500">QR สำหรับเจ้าหน้าที่ (ภายใน)</div>
    <div class="token">token hash · ${j.staff_token.slice(0,20)}…</div></div>`;
}
/* decorative deterministic QR-looking grid from token (mock only) */
function qrSVG(token){
  let seed=0;for(const c of token)seed=(seed*31+c.charCodeAt(0))>>>0;
  const n=13,cells=[];for(let i=0;i<n*n;i++){seed=(seed*1103515245+12345)&0x7fffffff;cells.push(seed%100<46)}
  let r='';for(let y=0;y<n;y++)for(let x=0;x<n;x++){if(cells[y*n+x])r+=`<rect x="${x}" y="${y}" width="1" height="1"/>`}
  return `<svg viewBox="0 0 ${n} ${n}" width="100%" height="100%" fill="#2B2A28">${r}</svg>`;
}

/* ---------------------------- OR BOARD ----------------------------------- */
function orBoard(){
  const rf = State.orRoom||'all';
  const inRoom = j => rf==='all' || j.or_room_id===rf;
  const arriving = Store.journeys.filter(j=>['PORTER_TO_OR','OR_VERIFY_1'].includes(j.status) && (rf==='all'||j.or_room_id===rf||!j.or_room_id));
  const inOr = Store.journeys.filter(j=>j.status==='IN_OR' && inRoom(j));
  const done = Store.journeys.filter(j=>j.status==='SURGERY_FINISHED' && inRoom(j));
  const chips = [{v:'all',label:'ทุกห้อง'}, ...OR_ROOMS.map(o=>({v:o.id,label:o.name}))];
  const roomCount = id => Store.journeys.filter(j=>j.or_room_id===id && ['OR_VERIFY_1','IN_OR','SURGERY_FINISHED'].includes(j.status)).length;
  return `
    <button class="btn btn-emerg" style="margin:6px 0 2px" onclick="openEmergencySheet()">${svg('alert')} เปิดเคสฉุกเฉิน</button>
    <div class="room-filter">
      ${chips.map(c=>{const n=c.v==='all'?0:roomCount(c.v);return `<button class="room-tab ${rf===c.v?'on':''}" onclick="State.orRoom='${c.v}';render()">${esc(c.label)}${c.v!=='all'&&n?`<span class="room-tab-n">${n}</span>`:''}</button>`}).join('')}
    </div>
    <div class="stat-row">
      <div class="stat"><div class="n">${arriving.length}</div><div class="l">รอยืนยันตัว</div></div>
      <div class="stat"><div class="n">${inOr.length}</div><div class="l">กำลังผ่าตัด</div></div>
      <div class="stat"><div class="n">${done.length}</div><div class="l">เสร็จแล้ว</div></div>
    </div>
    <div class="section-title">${svg('idCard')} รอรับเข้า · ยืนยันตัวผู้ป่วย <span class="count">${arriving.length}</span></div>
    ${arriving.length?arriving.map(j=>journeyCard(j,true)).join(''):emptyState('door','ยังไม่มีผู้ป่วยรอเข้า','เมื่อหน่วยเปลนำส่ง เคสจะปรากฏให้ยืนยันตัวและระบุห้อง')}
    ${inOr.length?`<div class="section-title">${svg('activity')} กำลังผ่าตัด <span class="count">${inOr.length}</span></div>${inOr.map(j=>journeyCard(j,true)).join('')}`:''}
    ${done.length?`<div class="section-title">${svg('checkCircle')} ผ่าตัดเสร็จ รอส่ง RR <span class="count">${done.length}</span></div>${done.map(j=>journeyCard(j,true)).join('')}`:''}
  `;
}

/* ---------------------------- DASHBOARD ---------------------------------- */
/* Shared operational overview for OR + RR staff.
   Aggregate numbers only — no patient data beyond the usual avatar + code. */
const WAIT_LIMIT = {WAITING_PORTER:30, PORTER_TO_OR:25, OR_VERIFY_1:20, IN_OR:180, IN_RR:120}; // minutes

function mins(a,b){return (a==null||b==null)?null:Math.round((b-a)/60000)}
function fmtDur(m){if(m==null)return'—';if(m<60)return`${m} นาที`;const h=Math.floor(m/60);return m%60?`${h} ชม. ${m%60} น.`:`${h} ชม.`}
function avgOf(list){const v=list.filter(x=>x!=null&&x>=0);return v.length?Math.round(v.reduce((a,b)=>a+b,0)/v.length):null}

function dashboardView(){
  const live = Store.journeys.filter(j=>!['COMPLETED','CANCELLED'].includes(j.status));
  const doneToday = Store.journeys.filter(j=>j.status==='COMPLETED');
  const doneElective = doneToday.filter(j=>!j.is_emergency);   // averages exclude emergencies
  const emergLive = live.filter(j=>j.is_emergency).length;
  const emergDone = doneToday.filter(j=>j.is_emergency).length;

  /* --- room occupancy --- */
  const roomCard = r => {
    const occ = live.find(j=>j.or_room_id===r.id && ['OR_VERIFY_1','IN_OR'].includes(j.status));
    const coming = live.filter(j=>j.or_room_id===r.id && j.status==='PORTER_TO_OR').length;
    if(!occ) return `<div class="room-card free">
      <div class="room-card-h"><span class="room-name">${esc(r.name)}</span><span class="room-state free">ว่าง</span></div>
      <div class="room-empty">${coming?`${svg('stretcher')} กำลังนำส่ง ${coming} ราย`:'พร้อมรับเคส'}</div></div>`;
    const s=STATUS[occ.status], m=mins(occ.updated_at, now());
    return `<div class="room-card tap" onclick="openJourney('${occ.id}')" style="--rc:${s.color}">
      <div class="room-card-h"><span class="room-name">${esc(r.name)}</span><span class="room-state" style="background:${s.tint};color:${s.ink}">${svg(s.icon)}${s.label.split(' · ')[0]}</span></div>
      <div class="room-occ">${avatarEl(occ.avatar_id,'sm')}<div><div class="room-occ-n">${AV[occ.avatar_id].name}<span class="jcard-code"> · ${occ.case_code}</span></div>
      <div class="room-occ-t">${svg('clock')} ${fmtDur(m)}${coming?` · กำลังมาอีก ${coming}`:''}</div></div></div></div>`;
  };

  /* --- bottlenecks: anything past its stage limit --- */
  const late = live.map(j=>({j, m:mins(j.updated_at, now()), lim:WAIT_LIMIT[j.status]}))
    .filter(x=>x.lim && x.m!=null && x.m>x.lim)
    .sort((a,b)=>(b.m-b.lim)-(a.m-a.lim));

  /* --- averages from completed cases --- */
  const T=j=>j.timestamps;
  const avgToOR = avgOf(doneElective.map(j=>mins(T(j).porter_received_at, T(j).entered_or_at)));
  const avgSurg = avgOf(doneElective.map(j=>mins(T(j).entered_or_at, T(j).surgery_finished_at)));
  const avgRR   = avgOf(doneElective.map(j=>mins(T(j).received_rr_at, T(j).completed_at)));
  const avgAll  = avgOf(doneElective.map(j=>mins(T(j).porter_received_at, T(j).completed_at)));
  const maxBar = Math.max(avgToOR||0, avgSurg||0, avgRR||0, 1);
  const bar = (label,val,color) => `<div class="bar-row"><div class="bar-lb">${label}</div>
    <div class="bar-track"><div class="bar-fill" style="width:${val?Math.max(6,Math.round(val/maxBar*100)):0}%;background:${color}"></div></div>
    <div class="bar-val">${fmtDur(val)}</div></div>`;

  const inRoom = live.filter(j=>['OR_VERIFY_1','IN_OR'].includes(j.status)).length;

  return `
    <div class="stat-row" style="margin-top:6px">
      <div class="stat"><div class="n">${live.length}</div><div class="l">กำลังดำเนินการ</div></div>
      <div class="stat"><div class="n">${inRoom}/${OR_ROOMS.length}</div><div class="l">ห้องที่ใช้อยู่</div></div>
      <div class="stat"><div class="n">${doneToday.length}</div><div class="l">เสร็จวันนี้</div></div>
    </div>
    ${(emergLive||emergDone)?`<div class="emerg-strip">${svg('alert')}<span>เคสฉุกเฉินวันนี้ · กำลังดำเนินการ <b>${emergLive}</b> · เสร็จแล้ว <b>${emergDone}</b></span></div>`:''}

    <div class="section-title">${svg('door')} ผังห้องผ่าตัด</div>
    <div class="room-grid">${OR_ROOMS.map(roomCard).join('')}</div>

    <div class="section-title">${svg('alert')} เคสที่ใช้เวลานานกว่าปกติ <span class="count">${late.length}</span></div>
    ${late.length? late.map(({j,m,lim})=>`<div class="late-row tap" onclick="openJourney('${j.id}')">
        <span class="late-dot"></span>${avatarEl(j.avatar_id,'sm')}
        <div class="late-main"><div class="late-n">${AV[j.avatar_id].name}<span class="jcard-code"> · ${j.case_code}</span>${j.is_emergency?`<span class="em-chip">ฉุกเฉิน</span>`:''}${j.or_room?`<span class="room-chip">${esc(j.or_room)}</span>`:''}</div>
          <div class="late-s">${STATUS[j.status].label}</div></div>
        <div class="late-t"><b>${fmtDur(m)}</b><span>ปกติ ≤ ${lim} น.</span></div>
      </div>`).join('')
      : `<div class="ok-note">${svg('checkCircle')} ทุกเคสอยู่ในเวลาปกติ</div>`}

    <div class="section-title">${svg('activity')} เวลาเฉลี่ยแต่ละขั้น <span class="count">${doneElective.length} เคสปกติที่เสร็จแล้ว</span></div>
    <div class="tile">
      ${bar('นำส่ง → เข้าห้อง', avgToOR, 'var(--powder)')}
      ${bar('อยู่ในห้องผ่าตัด', avgSurg, 'var(--peach)')}
      ${bar('พักฟื้น RR', avgRR, 'var(--lavender)')}
      <div class="total-row"><span>รวมทั้ง Journey (เฉลี่ย)</span><b>${fmtDur(avgAll)}</b></div>
    </div>
    <p class="hint-foot">${svg('info')} เวลาเฉลี่ยคำนวณจากเคสปกติเท่านั้น ไม่รวมเคสฉุกเฉิน เพื่อไม่ให้ค่าเฉลี่ยเพี้ยน — แต่เคสฉุกเฉินยังถูกเตือนเรื่องเวลาตามปกติ</p>
    <p class="hint-foot" style="margin-top:8px">${svg('shield')} ตัวเลขทั้งหมดเป็นค่ารวมของกระบวนการ ไม่มีข้อมูลผู้ป่วยหรือข้อมูลทางการแพทย์</p>
  `;
}

/* ---------------------------- RR BOARD ----------------------------------- */
function rrBoard(){
  const incoming = Store.journeys.filter(j=>j.status==='SURGERY_FINISHED');
  const recovering = Store.journeys.filter(j=>j.status==='IN_RR');
  return `
    <div class="stat-row" style="margin-top:6px">
      <div class="stat"><div class="n">${incoming.length}</div><div class="l">รอรับเข้า</div></div>
      <div class="stat"><div class="n">${recovering.length}</div><div class="l">กำลังพักฟื้น</div></div>
    </div>
    ${incoming.length?`<div class="section-title">${svg('arrowRight')} รับเข้า RR <span class="count">${incoming.length}</span></div>${incoming.map(j=>journeyCard(j,true)).join('')}`:''}
    <div class="section-title">${svg('heart')} กำลังพักฟื้น · พร้อมส่งกลับหอ <span class="count">${recovering.length}</span></div>
    ${recovering.length?recovering.map(j=>journeyCard(j,true)).join(''):emptyState('heart','ห้องพักฟื้นว่าง','เคสที่ผ่าตัดเสร็จจะปรากฏให้รับเข้า RR')}
  `;
}

/* ---------------------------- WARD BOARD (view-only, realtime) ----------- */
function wardBoard(){
  // ward sees only its own ward's active journeys
  const wid = State.wardId || (WARD_USERS[0] && WARD_USERS[0].id);
  if(!wid) return emptyState('bed','บัญชีนี้ยังไม่ได้ผูกกับหอผู้ป่วย','กรุณาติดต่อผู้ดูแลระบบเพื่อกำหนดหอผู้ป่วย');
  const mine = Store.journeys.filter(j=>j.ward_id===wid && j.status!=='CANCELLED');
  const active = mine.filter(j=>j.status!=='COMPLETED');
  const recent = mine.filter(j=>j.status==='COMPLETED').slice(0,3);
  return `
    ${DEMO_MODE ? `<div class="field" style="margin-top:6px">
      <label>${svg('mapPin','lbl-ic')} หอผู้ป่วยของคุณ <span class="demo-tag">เดโม</span></label>
      ${dd('wardSel', WARD_USERS.map(w=>({v:w.id,label:w.name})), wid)}
      <div class="help">โหมดเดโมเท่านั้น — ในระบบจริงหอผู้ป่วยถูกกำหนดจากบัญชีผู้ใช้</div>
    </div>` : `<div class="ward-badge">${svg('mapPin','lbl-ic')} ${esc((WARDS.find(w=>w.id===wid)||{name:'—'}).name)}</div>`}
    <button class="btn btn-accent" style="margin:4px 0 6px" onclick="wardCreate()">${svg('plus')} สร้าง Journey ผู้ป่วยไป OR</button>
    <p class="hint-foot" style="margin:0 2px 14px">${svg('info')} ระบบจะสุ่มอวตาร์และรหัสให้ทันที เพื่อส่งต่อให้ญาติไว้ติดตามสถานะ</p>
    <div class="section-title">${svg('activity')} กำลังดำเนินการ <span class="count">${active.length}</span></div>
    ${active.length?active.map(j=>wardCard(j)).join(''):emptyState('bed','ยังไม่มี Journey ที่กำลังดำเนินการ','แตะปุ่มด้านบนเมื่อเตรียมส่งผู้ป่วยไปห้องผ่าตัด')}
    ${recent.length?`<div class="section-title">${svg('check')} กลับถึงหอแล้ว (ล่าสุด)</div>${recent.map(j=>wardCard(j)).join('')}`:''}
  `;
}
function wardCard(j){
  return `<div class="jcard tap" onclick="openJourney('${j.id}')"><div class="jcard-top">
      ${avatarEl(j.avatar_id,'md')}
      <div class="jcard-body">
        <div class="jcard-name">${AV[j.avatar_id].name}<span class="jcard-code">· ${j.case_code}</span>${j.is_emergency?`<span class="em-chip">ฉุกเฉิน</span>`:''}</div>
        <div style="margin-top:8px">${statusPill(j.status)}</div>
      </div></div>
    <div class="jcard-foot"><span style="font-size:12.5px;color:var(--ink-2)">อัปเดตล่าสุด ${fmtTime(j.updated_at)}</span><span class="jcard-time">${svg('clock')} ${ago(j.updated_at)}</span></div>
  </div>`;
}

/* ---------------------------- PR LOOKUP ---------------------------------- */
let prSel=null, prResult=undefined;
function prLookup(){
  return `
    <div class="tile">
      <div class="field"><label>เลือกอวตาร์</label>
        <div class="avgrid">${AVATARS.map(a=>`<button class="avpick ${prSel===a.id?'sel':''}" onclick="prSel='${a.id}';render()">${avatarEl(a.id,'sm')}<span class="nm">${a.name}</span></button>`).join('')}</div>
      </div>
      <div class="field"><label for="prCode">รหัสติดตาม</label>
        <input class="input" id="prCode" placeholder="เช่น K7P4" maxlength="4" style="text-transform:uppercase;letter-spacing:.12em;font-family:var(--mono)" value="${prCodeVal||''}" oninput="prCodeVal=this.value.toUpperCase()"/>
        <div class="help">ญาติจะได้รับอวตาร์และรหัสนี้จากเจ้าหน้าที่</div>
      </div>
      <button class="btn btn-accent" onclick="doPRlookup()">${svg('search')} ตรวจสอบสถานะ</button>
    </div>
    ${prResultBlock()}
    <div class="notice" style="margin-top:18px">${svg('info')}<span>ข้อมูลนี้เป็นเพียงสถานะของกระบวนการ กรุณาติดต่อทีมรักษาสำหรับข้อมูลทางการแพทย์</span></div>
  `;
}
let prCodeVal='';
async function doPRlookup(){
  const code=(document.getElementById('prCode').value||'').toUpperCase().trim();
  prCodeVal=code;
  if(!prSel){UI.toast('กรุณาเลือกอวตาร์','err');return}
  if(code.length<4){UI.toast('กรุณากรอกรหัสติดตามให้ครบ','err');return}
  prResult = await Store.publicLookup(prSel, code, 'PR');
  render();
}
function prResultBlock(){
  if(prResult===undefined)return'';
  if(!prResult){
    return `<div class="tile" style="margin-top:16px;text-align:center;border-color:var(--clay-tint)">
      <div class="em-ic" style="margin:0 auto 12px;color:var(--clay)">${svg('search')}</div>
      <div style="font-weight:600">ไม่พบข้อมูลที่ตรงกัน</div>
      <p style="font-size:13px;color:var(--ink-2);margin-top:6px">ตรวจสอบอวตาร์และรหัสอีกครั้ง หรือสอบถามเจ้าหน้าที่</p></div>`;
  }
  const j=prResult, s=STATUS[j.status] || {label:j.public_text||'อยู่ระหว่างดำเนินการ', pub:j.public_text||'อยู่ระหว่างดำเนินการ', color:'var(--sage)', tint:'var(--sage-tint)', ink:'#2f5a3d', icon:'info'};
  return `<div class="jcard" style="margin-top:16px">
    <div class="jcard-top">${avatarEl(j.avatar_id,'lg')}
      <div class="jcard-body"><div class="jcard-name" style="font-size:19px">${AV[j.avatar_id].name}<span class="jcard-code">· ${j.case_code}</span></div></div></div>
    <div style="padding:0 16px 16px">
      <div class="eyebrow" style="margin-bottom:8px">สถานะปัจจุบัน</div>
      <div style="font-size:19px;font-weight:600;color:${s.ink};display:flex;gap:9px;align-items:center">${svg(s.icon)} ${s.pub}</div>
      <div style="font-size:12.5px;color:var(--ink-2);margin-top:10px;display:flex;gap:5px;align-items:center">${svg('clock')} อัปเดตล่าสุด ${fmtTime(j.updated_at)}</div>
    </div></div>`;
}

/* ---------------------------- JOURNEY DETAIL / TIMELINE ------------------ */
function openJourney(id){
  const j=Store.journeys.find(x=>x.id===id);if(!j)return;
  const action=(TRANSITIONS[j.status]||[]).find(t=>t.role===State.role);
  const canSeeQR = ['PORTER','OR','RR'].includes(State.role);
  UI.openSheet(`
    <div class="jcard-top" style="padding:0 0 4px">${avatarEl(j.avatar_id,'lg')}
      <div class="jcard-body"><div class="jcard-name" style="font-size:20px">${AV[j.avatar_id].name}<span class="jcard-code">· ${j.case_code}</span>${j.is_emergency?`<span class="em-chip">ฉุกเฉิน</span>`:''}${j.or_room?`<span class="room-chip">${esc(j.or_room)}</span>`:''}</div>
      <div class="jcard-route">${svg('mapPin')}${esc(j.ward_name)} ${svg('arrowRight')} ${esc(j.or_room||j.dest)}</div></div></div>
    <div style="margin:14px 0">${statusPill(j.status)}</div>
    ${(j.verifyPorter||j.verify1||j.verify2||j.verifyRR)?`<div class="verify-box">
      <div class="eyebrow" style="margin-bottom:8px">${svg('wristband')} การยืนยันป้ายข้อมือผู้ป่วย</div>
      ${j.verifyPorter?`<div class="verify-row"><span class="chk-box on">${svg('check')}</span><span>รับจากหอผู้ป่วย · ${esc(j.verifyPorter.by)} · ${fmtTime(j.verifyPorter.at)}</span></div>`:''}
      ${j.is_emergency
        ? `<div class="verify-row"><span class="chk-box ${j.verify1?'on':''}">${j.verify1?svg('check'):''}</span><span>เข้าห้องผ่าตัด (ฉุกเฉิน · ยืนยันคนเดียว) · ${j.verify1?esc(j.verify1.by)+' · '+fmtTime(j.verify1.at):'รอยืนยัน'}</span></div>`
        : `<div class="verify-row"><span class="chk-box ${j.verify1?'on':''}">${j.verify1?svg('check'):''}</span><span>ห้องผ่าตัด ครั้งที่ 1 · ${j.verify1?esc(j.verify1.by)+' · '+fmtTime(j.verify1.at):'รอยืนยัน'}</span></div>
           <div class="verify-row"><span class="chk-box ${j.verify2?'on':''}">${j.verify2?svg('check'):''}</span><span>ห้องผ่าตัด ครั้งที่ 2 · ${j.verify2?esc(j.verify2.by)+' · '+fmtTime(j.verify2.at):'รอยืนยัน'}</span></div>`}
      ${j.verifyRR?`<div class="verify-row"><span class="chk-box on">${svg('check')}</span><span>รับเข้าห้องพักฟื้น · ${esc(j.verifyRR.by)} · ${fmtTime(j.verifyRR.at)}</span></div>`:''}
    </div>`:''}
    <div class="eyebrow" style="margin:18px 0 12px">เส้นทางการเดินทาง</div>
    ${timeline(j)}
    ${action?`<button class="btn btn-primary" onclick="doAction('${j.id}','${action.to}')" style="margin-top:8px">${svg(action.icon)} ${action.label}</button>`:''}
    ${canSeeQR && j.staff_token?`<details style="margin-top:16px"><summary style="cursor:pointer;font-size:13.5px;color:var(--ink-2);font-weight:600;padding:8px 0">${svg('qr')} QR / โทเคนเจ้าหน้าที่</summary>${qrBlock(j)}</details>`:''}
    <button class="btn btn-ghost" style="margin:14px auto 0;width:auto" onclick="UI.closeSheet()">ปิด</button>
  `);
}
function timeline(j){
  const cur = STATUS[j.status].order;
  const tsMap={PORTER_TO_OR:'porter_received_at',OR_VERIFY_1:'verify1_at',IN_OR:'entered_or_at',SURGERY_FINISHED:'surgery_finished_at',IN_RR:'received_rr_at',COMPLETED:'completed_at'};
  return `<div class="timeline">${FLOW.map((st,i)=>{
    const o=STATUS[st].order;const done=o<cur;const isCur=st===j.status;
    const t=j.timestamps[tsMap[st]];
    const cls=done?'done':isCur?'current':'';
    const dot = done?svg('check'):isCur?svg(STATUS[st].icon):'';
    return `<div class="tl-item ${cls}"><div class="tl-rail"><div class="tl-dot">${dot}</div>${i<FLOW.length-1?'<div class="tl-line"></div>':''}</div>
      <div class="tl-content"><div class="tl-label">${STATUS[st].label}</div>${t?`<div class="tl-meta">${fmtTime(t)}</div>`:isCur?`<div class="tl-meta">กำลังดำเนินการ</div>`:''}</div></div>`;
  }).join('')}</div>`;
}

/* ---------------------------- IDENTITY VERIFY (two-nurse) ---------------- */
let _vChecked=false, _vNurse='', _vRoom='';
function openVerifySheet(j, step){
  _vChecked=false; _vNurse=''; _vRoom=j.or_room_id||'';
  const other = step===2 && j.verify1 ? j.verify1.by : null;
  const pool = Staff.OR.filter(n=>n!==other); // step 2 must be a different nurse
  UI.openSheet(`
    <h3>${j.is_emergency?'ยืนยันตัวผู้ป่วย · เคสฉุกเฉิน':`ยืนยันตัวผู้ป่วย · ครั้งที่ ${step}/2`}</h3>
    <p class="sheet-sub">${AV[j.avatar_id].name} · ${j.case_code}</p>
    ${j.is_emergency?`<div class="notice emerg-notice" style="margin:2px 0 14px">${svg('alert')}<span>เคสฉุกเฉิน — ใช้พยาบาลยืนยันคนเดียวได้ ระบบจะบันทึกตามจริงว่าเป็นการยืนยันโดยคนเดียว</span></div>`:''}
    ${step===2 && j.verify1?`<div class="notice" style="margin:2px 0 14px">${svg('userCheck')}<span>ครั้งที่ 1 ยืนยันโดย ${esc(j.verify1.by)} — ครั้งที่ 2 ต้องเป็นพยาบาลคนละคน</span></div>`:''}
    <div class="tile" style="margin-bottom:14px">
      <div style="font-size:14.5px;font-weight:600;margin-bottom:4px">ตรวจสอบป้ายข้อมือผู้ป่วย</div>
      <p style="font-size:13px;color:var(--ink-2);line-height:1.5;margin-bottom:12px">อ่านชื่อ-นามสกุลจากป้ายข้อมือ และตรวจสอบว่าตรงกับผู้ป่วยรายนี้ ระบบจะบันทึกเพียงว่า “ยืนยันแล้ว” และผู้ยืนยัน โดย<b>ไม่เก็บชื่อผู้ป่วย</b></p>
      <label class="chk" onclick="_vChecked=!_vChecked;this.classList.toggle('on',_vChecked)">
        <span class="chk-box">${svg('check')}</span>
        <span>ชื่อ-นามสกุลตรงกับป้ายข้อมือ</span>
      </label>
      <div class="field" style="margin-top:14px">
        <label>ผู้ยืนยัน (พยาบาลครั้งที่ ${step})</label>
        ${dd('vNurse', pool.map(n=>({v:n,label:n})), '', '— เลือกพยาบาล —')}
      </div>
      ${step===1&&!j.is_emergency?`<div class="field" style="margin-top:12px">
        <label>ห้องผ่าตัด</label>
        ${dd('vRoom', OR_ROOMS.map(o=>({v:o.id,label:o.name})), j.or_room_id||'', '— เลือกห้อง —')}
        <div class="help">หน่วยเปลระบุมาแล้ว แก้ไขได้หากมีการสลับห้อง</div>
      </div>`:''}
    </div>
    <button class="btn btn-primary" onclick="commitVerify('${j.id}',${step})">${svg('userCheck')} ${(step===2||j.is_emergency)?'ยืนยันและเริ่มผ่าตัด':'ยืนยันตัวผู้ป่วย'}</button>
    <button class="btn btn-ghost" style="margin:10px auto 0;width:auto" onclick="UI.closeSheet()">ยกเลิก</button>
  `);
}
async function commitVerify(jid, step){
  if(!_vChecked){UI.toast('กรุณาติ๊กยืนยันว่าตรงกับป้ายข้อมือ','err');return}
  if(!_vNurse){UI.toast('กรุณาเลือกพยาบาลผู้ยืนยัน','err');return}
  const _j=Store.journeys.find(x=>x.id===jid);
  if(step===1 && !_j?.is_emergency && !_vRoom){UI.toast('กรุณาเลือกห้องผ่าตัด','err');return}
  if(step===1 && !_j?.is_emergency){
    const j=Store.journeys.find(x=>x.id===jid), r=OR_ROOMS.find(o=>o.id===_vRoom);
    if(j&&r){j.or_room_id=r.id; j.or_room=r.name; j.dest=r.name;}
  }
  const res=await Store.verify(jid, step, _vNurse, State.role);
  UI.closeSheet();
  if(res.ok){UI.toast(_j?.is_emergency?'ยืนยันแล้ว · เริ่มผ่าตัด':(step===2?'ยืนยันครบ 2 คน · เริ่มผ่าตัด':'ยืนยันตัวครั้งที่ 1 แล้ว'),'ok');render()}
  else UI.toast(res.msg,'err');
}

/* Porter accepts a ward-created job and picks the destination OR room,
   because the porter is the one who needs to know where to take the patient. */
let _pRoom='', _pChecked=false, _pStaff='';
function openPickupSheet(j){
  _pRoom = j.or_room_id||''; _pChecked=false; _pStaff='';
  UI.openSheet(`
    <h3>รับผู้ป่วยจากหอผู้ป่วย</h3>
    <p class="sheet-sub">${AV[j.avatar_id].name} · ${j.case_code}</p>
    <div class="tile" style="margin-bottom:14px">
      <div style="font-size:14.5px;font-weight:600;margin-bottom:4px">${svg('wristband','lbl-ic')} ตรวจสอบป้ายข้อมือผู้ป่วย</div>
      <p style="font-size:13px;color:var(--ink-2);line-height:1.5;margin-bottom:12px">อ่านชื่อ-นามสกุลจากป้ายข้อมือ และตรวจสอบกับเจ้าหน้าที่หอผู้ป่วยว่าตรงกับผู้ป่วยรายนี้ ระบบบันทึกเพียงว่ายืนยันแล้วและผู้ยืนยัน โดย<b>ไม่เก็บชื่อผู้ป่วย</b></p>
      <label class="chk" onclick="_pChecked=!_pChecked;this.classList.toggle('on',_pChecked)">
        <span class="chk-box">${svg('check')}</span><span>ชื่อ-นามสกุลตรงกับป้ายข้อมือ</span>
      </label>
      <div class="field" style="margin-top:14px">
        <label>ผู้รับผู้ป่วย (หน่วยเปล)</label>
        ${dd('pStaff', Staff.PORTER.map(n=>({v:n,label:n})), '', '— เลือกเจ้าหน้าที่ —')}
      </div>
      <div class="field" style="margin-bottom:0">
        <label>นำส่งไปห้องผ่าตัด</label>
        ${dd('pRoom', OR_ROOMS.map(o=>({v:o.id,label:o.name})), _pRoom, '— เลือกห้อง —')}
        <div class="help">ห้องผ่าตัดเปลี่ยนแปลงได้ภายหลังหากมีการสลับห้อง</div>
      </div>
    </div>
    <button class="btn btn-primary" onclick="commitPickup('${j.id}')">${svg('check')} รับผู้ป่วยแล้ว · เริ่มนำส่ง</button>
    <button class="btn btn-ghost" style="margin:10px auto 0;width:auto" onclick="UI.closeSheet()">ยกเลิก</button>
  `);
}
async function commitPickup(jid){
  if(!_pChecked){UI.toast('กรุณาติ๊กยืนยันว่าตรงกับป้ายข้อมือ','err');return}
  if(!_pStaff){UI.toast('กรุณาเลือกเจ้าหน้าที่ผู้รับ','err');return}
  if(!_pRoom){UI.toast('กรุณาเลือกห้องผ่าตัดปลายทาง','err');return}
  const r=OR_ROOMS.find(o=>o.id===_pRoom);
  const res = Store.porterPickup
    ? await Store.porterPickup(jid, _pStaff, _pRoom)
    : await mockPickup(jid, _pStaff, r);
  UI.closeSheet();
  if(res.ok){UI.toast(`ยืนยันป้ายข้อมือแล้ว · นำส่ง ${r.name}`,'ok');render()}
  else UI.toast(res.msg,'err');
}

/* RR receives the patient from OR — same wristband check at the handoff. */
let _rChecked=false, _rStaff='';
function openRRReceiveSheet(j){
  _rChecked=false; _rStaff='';
  UI.openSheet(`
    <h3>รับผู้ป่วยเข้าห้องพักฟื้น</h3>
    <p class="sheet-sub">${AV[j.avatar_id].name} · ${j.case_code}${j.or_room?' · '+esc(j.or_room):''}</p>
    <div class="tile" style="margin-bottom:14px">
      <div style="font-size:14.5px;font-weight:600;margin-bottom:4px">${svg('wristband','lbl-ic')} ตรวจสอบป้ายข้อมือผู้ป่วย</div>
      <p style="font-size:13px;color:var(--ink-2);line-height:1.5;margin-bottom:12px">ตรวจสอบป้ายข้อมือกับเจ้าหน้าที่ห้องผ่าตัดขณะรับมอบ ระบบบันทึกเพียงว่ายืนยันแล้วและผู้ยืนยัน โดย<b>ไม่เก็บชื่อผู้ป่วย</b></p>
      <label class="chk" onclick="_rChecked=!_rChecked;this.classList.toggle('on',_rChecked)">
        <span class="chk-box">${svg('check')}</span><span>ชื่อ-นามสกุลตรงกับป้ายข้อมือ</span>
      </label>
      <div class="field" style="margin:14px 0 0">
        <label>ผู้รับผู้ป่วย (ห้องพักฟื้น)</label>
        ${dd('rStaff', Staff.RR.map(n=>({v:n,label:n})), '', '— เลือกพยาบาล —')}
      </div>
    </div>
    <button class="btn btn-primary" onclick="commitRRReceive('${j.id}')">${svg('heart')} รับเข้าห้องพักฟื้น</button>
    <button class="btn btn-ghost" style="margin:10px auto 0;width:auto" onclick="UI.closeSheet()">ยกเลิก</button>
  `);
}
async function commitRRReceive(jid){
  if(!_rChecked){UI.toast('กรุณาติ๊กยืนยันว่าตรงกับป้ายข้อมือ','err');return}
  if(!_rStaff){UI.toast('กรุณาเลือกพยาบาลผู้รับ','err');return}
  const res = Store.rrReceive
    ? await Store.rrReceive(jid, _rStaff)
    : await mockRRReceive(jid, _rStaff);
  UI.closeSheet();
  if(res.ok){UI.toast('ยืนยันป้ายข้อมือแล้ว · รับเข้า RR','ok');render()}
  else UI.toast(res.msg,'err');
}

/* ---------------------------- EMERGENCY (OR-initiated) ------------------- */
/* An emergency case never waits on the ward or a porter. OR opens the case on the
   spot. If there is no time even for this, do the case and log it afterwards —
   this app is not a medical record and must never sit on the critical path. */
let _eWard='', _eRoom='';
function openEmergencySheet(){
  _eWard=''; _eRoom='';
  UI.openSheet(`
    <h3>เปิดเคสฉุกเฉิน</h3>
    <p class="sheet-sub">แจ้งหน่วยเปลให้ไปรับทันที และจองห้องผ่าตัดไว้ล่วงหน้า</p>
    <div class="notice emerg-notice" style="margin-bottom:14px">${svg('alert')}<span>เคสนี้จะขึ้นบนสุดของคิวหน่วยเปลทันที · หากไม่มีเวลาแม้แต่จะกดปุ่มนี้ <b>ให้ดูแลผู้ป่วยก่อน</b> แล้วค่อยบันทึกย้อนหลัง ระบบต้องไม่ทำให้การรักษาช้าลง</span></div>
    <div class="tile" style="margin-bottom:14px">
      <div class="field">
        <label>ผู้ป่วยอยู่ที่</label>
        ${dd('eWard', WARDS.map(w=>({v:w.id,label:w.name})), _eWard, '— เลือกต้นทาง —')}
        <div class="help">หน่วยเปลจะไปรับผู้ป่วยจากจุดนี้</div>
      </div>
      <div class="field" style="margin-bottom:0">
        <label>ห้องผ่าตัด</label>
        ${dd('eRoom', OR_ROOMS.map(o=>({v:o.id,label:o.name})), '', '— เลือกห้อง —')}
      </div>
    </div>
    <button class="btn btn-emerg" onclick="commitEmergency()">${svg('alert')} เปิดเคสฉุกเฉิน</button>
    <button class="btn btn-ghost" style="margin:10px auto 0;width:auto" onclick="UI.closeSheet()">ยกเลิก</button>
  `);
}
async function commitEmergency(){
  if(!_eWard){UI.toast('กรุณาเลือกจุดที่ผู้ป่วยอยู่','err');return}
  if(!_eRoom){UI.toast('กรุณาเลือกห้องผ่าตัด','err');return}
  let j; try{ j=await Store.createJourney(_eWard,'OR',_eRoom,true); }
  catch(e){ UI.toast(e.message||'เปิดเคสไม่สำเร็จ','err'); return; }
  UI.closeSheet();
  UI.toast('เปิดเคสฉุกเฉินแล้ว · แจ้งหน่วยเปลไปรับทันที','ok');
  openFamilyCard(j.id, true);
  render();
}

/* ---------------------------- ACTIONS (transitions) --------------------- */
async function doAction(jid, to){
  const j=Store.journeys.find(x=>x.id===jid);if(!j)return;
  const t=(TRANSITIONS[j.status]||[]).find(x=>x.to===to && x.role===State.role);
  if(!t){UI.toast('ไม่สามารถดำเนินการนี้ได้','err');return}
  if(!Store.online){UI.toast('ไม่มีการเชื่อมต่อ — โปรดลองใหม่','err');return}
  if(t.verify){openVerifySheet(j, t.verify);return}
  if(t.pickup){openPickupSheet(j);return}
  if(t.rrReceive){openRRReceiveSheet(j);return}
  const commit=async ()=>{
    const res=await Store.transition(jid,to,State.role);
    UI.closeSheet();
    if(res.ok){UI.toast(t.handoff?'ยืนยันรับมอบผู้ป่วยแล้ว':'อัปเดตสถานะแล้ว','ok');render();}
    else UI.toast(res.msg,'err');
  };
  if(t.confirm){
    UI.openSheet(`<h3>ยืนยันการดำเนินการ</h3><p class="sheet-sub">${AV[j.avatar_id].name} · ${j.case_code}</p>
      <div class="tile" style="margin-bottom:18px;text-align:center">
        <div style="font-size:15px;margin-bottom:4px">เปลี่ยนสถานะเป็น</div>
        <div style="font-weight:600;font-size:17px;color:${STATUS[to].ink}">${STATUS[to].label}</div></div>
      <button class="btn btn-primary" onclick="_commitAction('${jid}','${to}')">${svg('check')} ยืนยัน</button>
      <button class="btn btn-ghost" style="margin:10px auto 0;width:auto" onclick="UI.closeSheet()">ยกเลิก</button>`);
    window._commitAction=async (a,b)=>{const r=await Store.transition(a,b,State.role);UI.closeSheet();if(r.ok){UI.toast('อัปเดตสถานะแล้ว','ok');render()}else UI.toast(r.msg,'err')};
  } else commit();
}

/* ---------------------------- HISTORY ------------------------------------ */
function historyView(){
  const done = Store.journeys.filter(j=>['COMPLETED','CANCELLED'].includes(j.status));
  return `<div class="notice">${svg('history')}<span>Journey ที่สิ้นสุดแล้ว อวตาร์และรหัสถูกยกเลิกการใช้งาน แต่ยังเก็บ timeline และบันทึกไว้เพื่อการตรวจสอบ</span></div>
    <div class="section-title">${svg('check')} เสร็จสิ้น <span class="count">${done.length}</span></div>
    ${done.length?done.map(j=>`<div class="jcard tap" onclick="openJourney('${j.id}')"><div class="jcard-top" style="opacity:.85">${avatarEl(j.avatar_id,'sm')}
      <div class="jcard-body"><div class="jcard-name" style="font-size:15px">${AV[j.avatar_id].name}<span class="jcard-code">· ${j.case_code}</span></div>
      <div style="margin-top:6px">${statusPill(j.status)}</div></div>
      <span class="jcard-time" style="align-self:center">${fmtTime(j.updated_at)}</span></div></div>`).join(''):emptyState('history','ยังไม่มีประวัติ','Journey ที่เสร็จสิ้นจะแสดงที่นี่')}`;
}

/* ---------------------------- AUDIT LOG (admin) -------------------------- */
const AUDIT_IC={LOGIN_SUCCESS:'user',JOURNEY_CREATED:'plus',EMERGENCY_CREATED:'alert',WAITING_PORTER:'bed',PORTER_TO_OR:'stretcher',IDENTITY_VERIFIED:'idCard',STATUS_CHANGED:'refresh',PUBLIC_STATUS_LOOKUP:'search',QR_REVOKED:'shield',JOURNEY_COMPLETED:'check',INVALID_TRANSITION:'alert',JOURNEY_CANCELLED:'x'};
function auditView(){
  if(!DEMO_MODE && Store.refreshAudit && !Store.audit.length) Store.refreshAudit().then(()=>render());
  return `<div class="notice">${svg('shield')}<span>บันทึกการใช้งานทั้งหมด บันทึกด้วยเวลาจากเซิร์ฟเวอร์ ผู้ดูแลระบบไม่สามารถแก้ไขได้</span></div>
    <div class="section-title">${svg('list')} เหตุการณ์ล่าสุด <span class="count">${Store.audit.length}</span></div>
    <div class="tile" style="padding:6px 16px">
    ${Store.audit.slice(0,40).map(a=>`<div class="log-row">
      <div class="log-ic" style="${a.success?'':'color:var(--clay);background:var(--clay-tint);border-color:transparent'}">${svg(AUDIT_IC[a.action]||'info')}</div>
      <div class="log-main"><div class="log-act">${a.action}${a.success?'':' · ล้มเหลว'}</div>
      <div class="log-meta">${a.actor} · ${a.resource_type}${a.resource_id?' · '+a.resource_id:''}${a.meta&&Object.keys(a.meta).length?' · '+esc(JSON.stringify(a.meta)):''}</div></div>
      <div class="log-time">${fmtTime(a.at)}</div></div>`).join('')}
    </div>`;
}

/* ---------------------------- ADMIN -------------------------------------- */
function adminView(){
  const sections=[
    ['users','จัดการผู้ใช้','เพิ่ม ปิด/เปิดใช้งานบัญชี และกำหนดบทบาท','users'],
    ['roles','บทบาทและสิทธิ์','ควบคุมสิ่งที่แต่ละบทบาทเข้าถึงได้','shield'],
    ['wards','วอร์ด','จัดการหอผู้ป่วยและปลายทาง','bed'],
    ['rooms','ห้องผ่าตัด','จัดการห้อง OR และสถานี','door'],
    ['avatars','อวตาร์','ชุดอวตาร์ธรรมชาติ 12 แบบ','heart'],
    ['status','ป้ายสถานะ','ปรับข้อความสถานะภายในและสาธารณะ','list'],
  ];
  return `
    <div class="stat-row" style="margin-top:6px">
      <div class="stat"><div class="n">${Store.journeys.filter(j=>!['COMPLETED','CANCELLED'].includes(j.status)).length}</div><div class="l">Journey ที่ทำงานอยู่</div></div>
      <div class="stat"><div class="n">${WARDS.length}</div><div class="l">วอร์ด</div></div>
      <div class="stat"><div class="n">${AVATARS.length}</div><div class="l">อวตาร์</div></div>
    </div>
    <div class="section-title">${svg('settings')} การจัดการระบบ</div>
    ${sections.map(([k,t,d,ic])=>`<div class="jcard tap" onclick="adminOpen('${k}')"><div class="jcard-top">
      <span class="ro-ic" style="width:46px;height:46px;border-radius:13px;display:grid;place-items:center;background:var(--paper);border:1px solid var(--line);color:var(--ink-2)">${svg(ic)}</span>
      <div class="jcard-body"><div style="font-weight:600;font-size:15.5px">${t}</div><div style="font-size:12.5px;color:var(--ink-2);margin-top:2px">${d}</div></div>
      <span style="color:var(--ink-3)">${svg('arrowRight')}</span></div></div>`).join('')}
    <div class="notice" style="margin-top:14px">${svg('shield')}<span>ผู้ดูแลระบบจัดการการตั้งค่าและบัญชีได้ แต่การเข้าถึงข้อมูล Journey ที่ละเอียดยังถูกควบคุมแยกตามนโยบาย</span></div>
  `;
}
function adminOpen(k){
  const map={
    wards:`<h3>วอร์ด</h3><p class="sheet-sub">${WARDS.length} หอผู้ป่วย</p>${WARDS.map(w=>`<div class="log-row"><div class="log-ic">${svg('bed')}</div><div class="log-main"><div class="log-act">${w.name}</div><div class="log-meta">${w.id}</div></div></div>`).join('')}`,
    avatars:`<h3>อวตาร์</h3><p class="sheet-sub">ชุดอวตาร์ธรรมชาติ นุ่มนวล เป็นกลาง</p><div class="avgrid">${AVATARS.map(a=>`<div class="avpick">${avatarEl(a.id,'sm')}<span class="nm">${a.name}</span></div>`).join('')}</div>`,
    status:`<h3>ป้ายสถานะ</h3><p class="sheet-sub">ภายใน → สาธารณะ</p>${FLOW.map(st=>`<div class="log-row"><div class="log-ic" style="color:${STATUS[st].ink}">${svg(STATUS[st].icon)}</div><div class="log-main"><div class="log-act">${STATUS[st].label}</div><div class="log-meta">${st} · ${STATUS[st].pub}</div></div></div>`).join('')}`,
  };
  UI.openSheet((map[k]||`<h3>${k}</h3><p class="sheet-sub">ส่วนนี้เป็นตัวอย่างในเดโม</p>`)+`<button class="btn btn-ghost" style="margin:14px auto 0;width:auto" onclick="UI.closeSheet()">ปิด</button>`);
}


/* ---- demo-only helpers (the Supabase store has real methods for these) ---- */
async function mockPickup(jid, staff, room){
  const j=Store.journeys.find(x=>x.id===jid); if(!j) return {ok:false,msg:'ไม่พบ Journey นี้'};
  if(room){ j.or_room_id=room.id; j.or_room=room.name; j.dest=room.name; }
  j.verifyPorter={by:staff, at:now()};
  Store.logEvent(j.id,'IDENTITY_VERIFIED',{stage:'PORTER',staff});
  Store.audit.unshift(auditRow(State.role,'IDENTITY_VERIFIED','journey',j.id,true,{stage:'PORTER',staff}));
  return Store.transition(jid,'PORTER_TO_OR',State.role);
}
async function mockRRReceive(jid, staff){
  const j=Store.journeys.find(x=>x.id===jid); if(!j) return {ok:false,msg:'ไม่พบ Journey นี้'};
  j.verifyRR={by:staff, at:now()};
  Store.logEvent(j.id,'IDENTITY_VERIFIED',{stage:'RR',staff});
  Store.audit.unshift(auditRow(State.role,'IDENTITY_VERIFIED','journey',j.id,true,{stage:'RR',staff}));
  return Store.transition(jid,'IN_RR',State.role);
}

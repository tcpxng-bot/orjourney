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

/* Plain elapsed-time chip — how long the case has been in its current stage.
   No fixed SLA / "overdue" labelling: the workflow has no hard time targets,
   so the raw minutes are shown without judging them late. */
function timeChip(j){
  return `<span class="jcard-time">${svg('clock')} ${ago(j.updated_at)}</span>`;
}
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
  else if(id==='vNurse'){ _vNurse=val; _vPickOpen=true; refreshVerifier(); }
  else if(id==='vRoom'){ _vRoom=val; }
  else if(id==='pRoom'){ _pRoom=val; }
  else if(id==='pStaff'){ _pStaff=val; }
  else if(id==='rStaff'){ _rStaff=val; }
  else if(id==='cReason'){ _cReason=val; }
  else if(id==='suUnit'){ _suUnit=val; }
  else if(id==='apvRole'){ _apvRole=val; }
  else if(id==='apvWard'){ _apvWard=val; }
  else if(id==='apvReject'){ _apvReject=val; }
  else if(id==='eWard'){ _eWard=val; }
  else if(id==='eRoom'){ _eRoom=val; }
  else if(id==='sdWard'){ _sdWard=val; }
  else if(id==='rdWard'){ _rdWard=val; }
}
document.addEventListener('click', e=>{ if(!e.target.closest('.dd')) document.querySelectorAll('.dd.open').forEach(d=>d.classList.remove('open')); });
document.addEventListener('keydown', e=>{ if(e.key==='Escape') document.querySelectorAll('.dd.open').forEach(d=>d.classList.remove('open')); });
let CForm={src:null, dest:null};

/* ---------------------------- UI helpers --------------------------------- */
const UI = {
  toast(msg,kind=''){const t=document.createElement('div');t.className='toast '+kind;t.innerHTML=(kind==='ok'?svg('check'):kind==='err'?svg('alert'):'')+`<span>${esc(msg)}</span>`;document.getElementById('toasts').appendChild(t);setTimeout(()=>{t.style.opacity='0';t.style.transition='opacity .3s';setTimeout(()=>t.remove(),300)},2600)},
  openSheet(html){const s=document.getElementById('sheet');s.innerHTML=`<div class="sheet-head"><span class="sheet-grab"></span><button class="sheet-x" onclick="UI.closeSheet()" aria-label="ปิด">${svg('x')}</button></div>`+html;document.getElementById('scrim').classList.add('open');s.classList.add('open')},
  closeSheet(){document.getElementById('scrim').classList.remove('open');document.getElementById('sheet').classList.remove('open')},
};

const BARE_SCREENS = ['login','signup','signup-done','pending','role-choice'];

/* ============================================================ RENDER ====== */
let _lastScreen=null;
function render(){
  const app=document.getElementById('app');
  // Animate only when the SCREEN changes — realtime/30s refreshes keep the
  // same screen, so the board no longer re-animates (and no longer flickers).
  const changed = State.screen !== _lastScreen; _lastScreen = State.screen;
  // Login / signup / pending render on their own, with no app chrome around them.
  if(BARE_SCREENS.includes(State.screen)){
    app.innerHTML = State.screen==='login'       ? viewLogin()
                  : State.screen==='signup'      ? viewSignup()
                  : State.screen==='signup-done' ? viewSignupDone()
                  : State.screen==='role-choice' ? viewRoleChoice()
                  :                                viewPending();
    return;
  }
  app.innerHTML = `<div class="shell">${sidebar()}<div class="main">${topbar()}<div class="viewport${changed?' screen-in':''}" id="vp">${screenBody()}</div></div></div>${bottomnav()}`;
}

function screenBody(){
  switch(State.screen){
    case 'home': return roleHome();
    case 'signup': return viewSignup();
    case 'signup-done': return viewSignupDone();
    case 'pending': return viewPending();
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
  return `<div class="auth stagger">
    <aside class="auth-brand">
      <div class="aurora"><span class="a1"></span><span class="a2"></span><span class="a3"></span></div>
      <div class="mark-lg">${brandMark()}</div>
      <h1 class="wordmark"><span>OR</span> <span class="jr">Journey</span></h1>
      <p class="wordmark-sub">ทุกการส่งต่อ เชื่อมถึงกันอย่างราบรื่น</p>
      <p class="wordmark-blurb">ติดตามสถานะการเดินทางของผู้ป่วยระหว่างหอผู้ป่วย ห้องผ่าตัด
        และห้องพักฟื้นแบบเรียลไทม์ โดยไม่เก็บข้อมูลที่ระบุตัวผู้ป่วย</p>
      ${flowStrip(true)}
    </aside>

    <main class="auth-main">
      <div class="auth-card">
        <div class="mark-sm">${brandMark()}</div>
        <h1 class="wordmark-m"><span>OR</span> <span class="jr">Journey</span></h1>
        <p class="wordmark-m-sub">ทุกการส่งต่อ เชื่อมถึงกันอย่างราบรื่น</p>
        <h2>เข้าสู่ระบบ</h2>
        <p class="auth-sub">สำหรับเจ้าหน้าที่ของโรงพยาบาล</p>

        ${demo ? demoRolePicker() : `
        <div class="field">
          <label for="loginEmail">อีเมล</label>
          <div class="inp">${svg('mail','inp-ic')}
            <input class="input" id="loginEmail" type="text" autocomplete="username"
                   inputmode="email" autocapitalize="none" placeholder="ชื่ออีเมล" />
            <span class="email-suffix">@cmu.ac.th</span></div>
        </div>
        <div class="field">
          <label for="loginPass">รหัสผ่าน</label>
          <div class="inp">${svg('lock','inp-ic')}
            <input class="input" id="loginPass" type="password" autocomplete="current-password"
                   placeholder="••••••••" onkeydown="if(event.key==='Enter')submitLogin()" /></div>
        </div>
        <div id="loginErr"></div>
        <button class="btn btn-accent" id="loginBtn" onclick="submitLogin()">${svg('logout')} เข้าสู่ระบบ</button>

        ${CFG.allowSignup!==false?`
          <div class="or-sep"><i></i>หรือ<i></i></div>
          <button class="btn btn-soft" onclick="go('signup')">${svg('plus')} สมัครใช้งาน (สำหรับเจ้าหน้าที่ใหม่)</button>`:''}

        ${helpLine('ลืมรหัสผ่าน หรือเข้าใช้งานไม่ได้')}
        `}

        <p class="buildstamp">build ${typeof OJ_BUILD!=='undefined'?OJ_BUILD:'—'}${DEMO_MODE?' · demo':''}</p>
      </div>
    </main>
  </div>`;
}

/* Password resets need SMTP, which most sites will not have on day one. A named
   human on LINE beats a reset link that silently fails. */
function helpLine(label){
  const url=CFG.supportLineUrl, tag=CFG.supportLineLabel||'LINE';
  if(!url) return '';
  return `<a class="help-line" href="${esc(url)}" target="_blank" rel="noopener">
    <span class="hl-ic">${svg('message')}</span>
    <span class="hl-tx"><b>${esc(label)}</b><span>ติดต่อผู้ดูแลระบบทาง LINE · ${esc(tag)}</span></span>
    ${svg('arrowRight','hl-go')}</a>`;
}

/* The four stages, shown before sign-in so a first-time user understands the
   product without being told. */
function flowStrip(withTraveler){
  const steps=[['home','หอผู้ป่วย','สร้าง Journey'],['stretcher','หน่วยเปล','นำส่ง'],
               ['scissors','ห้องผ่าตัด','ยืนยัน 2 ชั้น'],['bed','ส่งกลับ','ถึงหอผู้ป่วย']];
  return `<div class="flow"><div class="flow-line"></div>${withTraveler?'<div class="traveler"></div>':''}
    ${steps.map(([ic,lb,sub],i)=>`<div class="flow-step" style="--p:${i}">
      <span class="pin">${svg(ic)}</span>
      <span class="lb">${lb}</span><span class="sub">${sub}</span></div>`).join('')}</div>`;
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

/* Units the applicant can claim. Chosen from a list rather than typed so the
   approval screen can compare like with like. */
function signupUnits(){
  // Configured list first: the ward table is not readable before login, so
  // WARDS is empty on this screen in production and cannot be relied on.
  if(Array.isArray(CFG.signupUnits) && CFG.signupUnits.length) return CFG.signupUnits;
  const wards = WARD_USERS.map(w=>w.name);
  return [...wards, 'ทีม OR–RR', 'หน่วยเปล', 'ประชาสัมพันธ์', 'อื่น ๆ'];
}
let _suUnit='';

function viewSignup(){
  const dom=(CFG.allowedEmailDomains||[]);
  return `<div class="login-wrap fade">
    <button class="btn-ghost" onclick="go('login')" style="align-self:flex-start;margin-bottom:6px">${svg('arrowLeft')} กลับ</button>
    <div class="mark-sm" style="display:grid;margin-bottom:10px">${brandMark()}</div>
    <h1 style="font-size:26px">สมัครใช้งาน</h1>
    <p class="tag">สำหรับเจ้าหน้าที่ของโรงพยาบาลเท่านั้น</p>
    <div class="notice" style="margin-bottom:16px">${svg('info')}<span>เมื่อสมัครแล้ว บัญชีจะยัง<b>ใช้งานไม่ได้</b>จนกว่าผู้ดูแลระบบจะตรวจสอบและอนุมัติ พร้อมกำหนดบทบาทให้</span></div>
    <div class="tile">
      <div class="field">
        <label for="suName">ชื่อ-นามสกุล</label>
        <input class="input" id="suName" type="text" placeholder="เช่น พว. สมหญิง ใจดี"
               autocomplete="off" autocorrect="off" spellcheck="false" data-lpignore="true" data-1p-ignore />
        <div class="help">ชื่อนี้จะถูกบันทึกในประวัติการยืนยันป้ายข้อมือผู้ป่วย กรุณาใช้ชื่อจริง</div>
      </div>
      <div class="field">
        <label>หน่วยงานที่สังกัด</label>
        ${dd('suUnit', signupUnits().map(u=>({v:u,label:u})), '', '— เลือกหน่วยงาน —')}
      </div>
      <div class="field">
        <label for="suEmail">อีเมล</label>
        <input class="input" id="suEmail" type="email" inputmode="email" autocomplete="username"
               placeholder="${dom.length?'name@'+dom[0]:'name@hospital.go.th'}" />
        ${dom.length?`<div class="help">ใช้ได้เฉพาะอีเมล ${dom.map(d=>'@'+d).join(' หรือ ')}</div>`:''}
      </div>
      <div class="field">
        <label for="suPass">ตั้งรหัสผ่าน</label>
        <input class="input" id="suPass" type="password" autocomplete="new-password" placeholder="อย่างน้อย 6 ตัวอักษร"
               onkeydown="if(event.key==='Enter')submitSignup()" />
      </div>
      <div id="suErr"></div>
      <button class="btn btn-accent" id="suBtn" onclick="submitSignup()">${svg('check')} ส่งคำขอสมัคร</button>
    </div>
  </div>`;
}

async function submitSignup(){
  const btn=document.getElementById('suBtn'), err=document.getElementById('suErr');
  const name=(document.getElementById('suName').value||'').trim();
  const email=(document.getElementById('suEmail').value||'').trim();
  const pass=document.getElementById('suPass').value||'';
  err.innerHTML='';
  const fail=m=>{err.innerHTML=`<div class="field-error">${svg('alert')} ${esc(m)}</div>`;};
  if(name.length<3) return fail('กรุณากรอกชื่อ-นามสกุลให้ครบ');
  if(!_suUnit)      return fail('กรุณาเลือกหน่วยงานที่สังกัด');
  if(!email||!pass) return fail('กรุณากรอกอีเมลและรหัสผ่าน');
  btn.disabled=true; btn.innerHTML=`<span class="spin"></span> กำลังส่งคำขอ...`;
  const res=await Auth.signUp(email, pass, name, _suUnit);
  btn.disabled=false; btn.innerHTML=`${svg('check')} ส่งคำขอสมัคร`;
  if(!res.ok) return fail(res.msg);
  State.screen='signup-done'; render();
}

function viewSignupDone(){
  return `<div class="login-wrap fade">
    <div class="brandmark ok">${svg('checkCircle')}</div>
    <h1>ส่งคำขอแล้ว</h1>
    <p class="tag">ผู้ดูแลระบบจะตรวจสอบและอนุมัติบัญชีของคุณ</p>
    <div class="tile"><p class="help" style="margin:0">เมื่อได้รับอนุมัติแล้ว คุณจะเข้าสู่ระบบด้วยอีเมลและรหัสผ่านที่ตั้งไว้ได้ทันที<br><br>
    หากรอนานผิดปกติ กรุณาติดต่อผู้ดูแลระบบของหน่วยงาน</p></div>
    <button class="btn btn-soft" style="margin-top:16px" onclick="go('login')">${svg('arrowLeft')} กลับหน้าเข้าสู่ระบบ</button>
  </div>`;
}

/* Signed in, but not yet approved: everything is withheld until an admin acts. */
function viewPending(){
  const p=Session.profile||{};
  const rejected = p.approval_status==='REJECTED';
  return `<div class="login-wrap fade">
    <div class="brandmark">${svg(rejected?'x':'hourglass')}</div>
    <h1>${rejected?'คำขอไม่ได้รับอนุมัติ':'รอการอนุมัติ'}</h1>
    <p class="tag">${rejected?'กรุณาติดต่อผู้ดูแลระบบของหน่วยงาน':'ผู้ดูแลระบบยังไม่ได้อนุมัติบัญชีนี้'}</p>
    <div class="tile" style="text-align:left">
      <div class="log-row"><div class="log-ic">${svg('user')}</div><div class="log-main">
        <div class="log-act">${esc(p.full_name||'(ยังไม่ได้ตั้งชื่อ)')}</div>
        <div class="log-meta">${esc((Session.user&&Session.user.email)||'')}</div></div></div>
      ${rejected&&p.reject_reason?`<div class="notice emerg-notice" style="margin-top:10px">${svg('info')}<span>เหตุผล: ${esc(p.reject_reason)}</span></div>`:''}
    </div>
    ${helpLine('สอบถามความคืบหน้าการอนุมัติ')}
    <button class="btn btn-soft" style="margin-top:16px" onclick="logout()">${svg('logout')} ออกจากระบบ</button>
  </div>`;
}

function cmuEmail(value){
  const raw=(value||'').trim().toLowerCase();
  if(!raw) return '';
  return raw.includes('@') ? raw : raw+'@cmu.ac.th';
}

async function submitLogin(){
  const btn=document.getElementById('loginBtn');
  const email=cmuEmail(document.getElementById('loginEmail').value);
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
  // An unapproved account can read nothing, so stop before loading the workspace.
  if(!Session.profile || !Session.profile.is_provisioned){
    State.screen='pending'; render(); return;
  }
  // wards / rooms / staff are only readable once signed in
  const ws=await loadWorkspace();
  if(!ws.ok){
    await Auth.signOut();
    btn.disabled=false; btn.innerHTML=`${svg('logout')} เข้าสู่ระบบ`;
    err.innerHTML=`<div class="field-error">${svg('alert')} ${esc(ws.msg)}</div>`
      + (ws.detail?`<p class="errdetail" style="margin-top:8px">${esc(ws.detail)}</p>`:'');
    return;
  }
  if(availableRoles().length > 1){ State.screen='role-choice'; render(); return; }
  await startSession();
}

function availableRoles(){
  const p=Session.profile||{};
  const roles=[p.role].filter(Boolean);
  if(p.can_work_or && !roles.includes('OR')) roles.push('OR');
  if(p.can_work_rr && !roles.includes('RR')) roles.push('RR');
  if(p.can_work_porter && !roles.includes('PORTER')) roles.push('PORTER');
  return roles;
}

function viewRoleChoice(){
  const name=(Session.profile&&Session.profile.full_name)||'';
  return `<div class="login-wrap fade">
    <div class="brandmark">${brandMark()}</div>
    <h1>เลือกโหมดการทำงาน</h1>
    <p class="tag">${name?esc(name)+' · ':''}เลือกตามงานที่กำลังปฏิบัติ</p>
    <div class="role-list">
      ${availableRoles().map(role=>{const r=ROLES[role];return `<button class="role-opt" onclick="chooseRole('${role}')">
        <span class="ro-ic" style="background:${r.tint};color:${r.ink}">${svg(r.icon)}</span>
        <span><span class="ro-name">${r.name}</span><span class="ro-desc">${r.desc}</span></span>
        <span class="ro-arrow">${svg('arrowRight')}</span>
      </button>`}).join('')}
    </div>
    <button class="btn btn-soft" style="margin-top:16px" onclick="logout()">${svg('logout')} ออกจากระบบ</button>
  </div>`;
}

async function chooseRole(role){
  if(!availableRoles().includes(role)) return;
  await startSession(role);
}

function demoLogin(role){
  State.role=role;
  State.wardId = role==='WARD' ? WARD_USERS[0].id : null;
  // Give demo mode a signed-in identity too, so "default to me" behaves the
  // same way it will in production.
  const first = (Staff[role]||[])[0];
  Session.profile = { id: first ? first.id : 'demo-'+role,
                      full_name: first ? first.name : ROLES[role].name,
                      role, ward_id: State.wardId };
  Store.audit.unshift(auditRow(role,'LOGIN_SUCCESS','session',null,true));
  State.screen=defaultScreen(role);
  render();
  UI.toast(`เข้าสู่ระบบในบทบาท ${ROLES[role].name}`,'ok');
}

/* Applies the signed-in profile to app state, then opens that role's home. */
async function startSession(roleOverride){
  const p=Session.profile;
  const activeRole=roleOverride||availableRoles()[0]||p.role;
  Session.activeRole=activeRole;
  State.role=activeRole;
  State.wardId=p.ward_id||null;
  State.screen=defaultScreen(activeRole);
  if(Store.init) await Store.init();
  if(activeRole==='ADMIN' && Store.refreshAudit) await Store.refreshAudit();
  render();
  UI.toast(`เข้าสู่ระบบในบทบาท ${ROLES[activeRole].name}`,'ok');
}

async function logout(){
  await Auth.signOut();
  Session.profile=null;
  Session.activeRole=null;
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
  // Always show WHO is signed in. On a shared device a stale session would
  // otherwise silently sign the next person's wristband checks with the
  // previous user's name — the header is the cheapest place to notice that.
  const me = (Session.profile && Session.profile.full_name) || '';
  return `<div class="topbar"><div class="topbar-in">
    <div style="flex:1;min-width:0"><h1>${titles[State.screen]||'OR Journey'}</h1>
      <span class="sub-line">
        ${showLive?`<span class="live"><span class="pulse"></span>${Store.online?'อัปเดตเรียลไทม์':'ออฟไลน์'}</span>`:''}
        ${me?`<span class="who">${svg('user','who-ic')}${esc(me)}</span>`:`<span class="sub">${r.name}</span>`}
      </span></div>
    <span class="role-chip"><span class="dot" style="background:${r.color}"></span>${r.name}</span>
    <button class="icon-btn" onclick="openAccountSheet()" aria-label="บัญชี">${svg('user')}</button>
  </div></div>`;
}
function openAccountSheet(){
  const r=ROLES[State.role];
  const demo=(typeof DEMO_MODE!=='undefined') && DEMO_MODE;
  const profile=Session.profile||{};
  const identity=profile.full_name || (Session.user&&Session.user.email) || r.name;
  UI.openSheet(`<h3>${demo?'บัญชีเดโม':'บัญชีผู้ใช้'}</h3><p class="sheet-sub">${demo?'โหมดข้อมูลจำลอง':esc(identity)} · กำลังใช้งานในบทบาท ${r.name}</p>
    <div class="tile" style="margin-bottom:14px;display:flex;gap:12px;align-items:center">
      <span class="ro-ic" style="width:44px;height:44px;border-radius:13px;display:grid;place-items:center;background:${r.tint};color:${r.ink}">${svg(r.icon)}</span>
      <div><div style="font-weight:600">${r.name}</div><div style="font-size:12.5px;color:var(--ink-2)">${r.desc}</div></div></div>
    ${availableRoles().length>1?`<button class="btn btn-soft" style="margin-bottom:10px" onclick="UI.closeSheet();State.screen='role-choice';render()">${svg('refresh')} สลับโหมดการทำงาน</button>`:''}
    ${demo?`<button class="btn btn-soft" style="margin-bottom:10px" onclick="toggleOnline()">${Store.online?svg('wifiOff'):svg('wifi')} จำลอง${Store.online?'ขาดการเชื่อมต่อ':'กลับมาออนไลน์'}</button>`:''}
    <button class="btn btn-danger" onclick="logout()">${svg('logout')} ออกจากระบบ</button>`);
}
function toggleOnline(){Store.online=!Store.online;UI.closeSheet();render();UI.toast(Store.online?'เชื่อมต่อเรียลไทม์แล้ว':'การเชื่อมต่อขาดหาย — จะซิงก์อัตโนมัติเมื่อกลับมาออนไลน์',Store.online?'ok':'err')}

function navFor(role){
  const N={
    PORTER:[['home','home','งานรับ-ส่ง'],['history','history','ประวัติ']],
    OR:[['or-board','scissors','ห้องผ่าตัด'],['rr-board','heart','พักฟื้น'],['dashboard','activity','ภาพรวม'],['history','history','ประวัติ']],
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
    <div class="sb-brand"><span class="bm">${brandMark()}</span><span class="nm">OR Journey</span></div>
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
    ${pending.length? pending.map(j=>journeyCard(j,true)).join('') : emptyRow('ยังไม่มีงานรอรับตามคิวปกติ')}

    <div class="section-title">${svg('stretcher')} กำลังนำส่ง OR <span class="count">${toOR.length} ราย</span></div>
    ${toOR.length? toOR.map(j=>journeyCard(j,true)).join('') : emptyRow('ไม่มีเคสระหว่างนำส่ง')}

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
      ${timeChip(j)}
    </div>
  </div>`;
}

function emptyState(ic,title,desc){return `<div class="empty"><div class="em-ic">${svg(ic)}</div><h4>${title}</h4><p>${desc}</p></div>`}
/* Slim empty line for board stage sections — keeps each stage visible (stable
   layout, "genuinely empty, not broken") without a big block that adds scroll. */
function emptyRow(text){return `<div class="empty-row"><span class="er-dash"></span>${text}</div>`}

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
      <div class="fam-how">
        <div class="fam-how-h">วิธีสอบถามสถานะ</div>
        <p>แจ้ง <b>${a.name}</b> และรหัส <b>${j.case_code}</b> กับเจ้าหน้าที่ประชาสัมพันธ์
        เพื่อสอบถามว่าผู้ป่วยอยู่ในขั้นตอนใด</p>
      </div>
      <p class="fam-note">ระบบแจ้งเฉพาะขั้นตอนการเดินทางของผู้ป่วย ไม่มีข้อมูลการรักษาหรือผลการผ่าตัด<br>
      กรุณาเก็บรหัสนี้ไว้เฉพาะในครอบครัว · หากต้องการทราบข้อมูลทางการแพทย์ กรุณาติดต่อทีมผู้รักษา</p>
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
    <div class="slip-how"><b>วิธีสอบถามสถานะ</b><br>
      แจ้งชื่ออวตาร์ “${a.name}” และรหัส ${j.case_code}<br>กับเจ้าหน้าที่ประชาสัมพันธ์</div>
    <div class="slip-note">ระบบแจ้งเฉพาะขั้นตอนการเดินทางของผู้ป่วย ไม่มีข้อมูลการรักษา<br>กรุณาเก็บรหัสนี้ไว้เฉพาะในครอบครัว</div>
  </div>`;
  window.print();
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
  return `<div class="or-board-view">
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
    ${arriving.length?arriving.map(j=>journeyCard(j,true)).join(''):`<div class="or-empty"><div class="empty"><div class="em-ic">${svg('idCard')}</div><h4>ยังไม่มีผู้ป่วยรอเข้าห้องผ่าตัด</h4><p>เมื่อมีรายการใหม่ ระบบจะแสดงที่นี่แบบเรียลไทม์</p></div></div>`}
    ${inOr.length?`<div class="section-title">${svg('activity')} กำลังผ่าตัด <span class="count">${inOr.length}</span></div>${inOr.map(j=>journeyCard(j,true)).join('')}`:''}
    ${done.length?`<div class="section-title">${svg('checkCircle')} ผ่าตัดเสร็จ รอส่ง RR <span class="count">${done.length}</span></div>${done.map(j=>journeyCard(j,true)).join('')}`:''}
  </div>`;
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
    ${recovering.length?recovering.map(j=>journeyCard(j,true)).join(''):emptyRow('ห้องพักฟื้นว่าง')}
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
    <div class="jcard-foot"><span style="font-size:12.5px;color:var(--ink-2)">อัปเดตล่าสุด ${fmtTime(j.updated_at)}</span>${timeChip(j)}</div>
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
  UI.openSheet(`
    <div class="jcard-top" style="padding:0 0 4px">${avatarEl(j.avatar_id,'lg')}
      <div class="jcard-body"><div class="jcard-name" style="font-size:20px">${AV[j.avatar_id].name}<span class="jcard-code">· ${j.case_code}</span>${j.is_emergency?`<span class="em-chip">ฉุกเฉิน</span>`:''}${j.or_room?`<span class="room-chip">${esc(j.or_room)}</span>`:''}</div>
      <div class="jcard-route">${svg('mapPin')}${esc(j.ward_name)} ${svg('arrowRight')} ${esc(j.or_room||j.dest)}</div></div></div>
    <div style="margin:14px 0">${statusPill(j.status)}${j.status==='COMPLETED'?`<span class="room-chip" style="margin-left:8px;vertical-align:middle">${svg('mapPin')} ${esc(destText(j))}</span>`:''}</div>
    ${(j.verifyPorter||j.verify1||j.verify2||j.verifyRR)?`<div class="verify-box">
      <div class="eyebrow" style="margin-bottom:8px">${svg('wristband')} การยืนยันป้ายข้อมือผู้ป่วย</div>
      ${verifyLine('รับจากหอผู้ป่วย', j.verifyPorter)}
      ${j.is_emergency
        ? verifyLine('เข้าห้องผ่าตัด (ฉุกเฉิน · ยืนยันคนเดียว)', j.verify1)
        : verifyLine('ห้องผ่าตัด ครั้งที่ 1', j.verify1) + verifyLine('ห้องผ่าตัด ครั้งที่ 2', j.verify2)}
      ${verifyLine('รับเข้าห้องพักฟื้น', j.verifyRR)}
    </div>`:''}
    <div class="eyebrow" style="margin:18px 0 12px">เส้นทางการเดินทาง</div>
    ${timeline(j)}
    ${action?`<button class="btn btn-primary" onclick="doAction('${j.id}','${action.to}')" style="margin-top:8px">${svg(action.icon)} ${action.label}</button>`:''}
    ${canCancel(j)?`<button class="btn btn-soft danger-soft" style="margin-top:10px" onclick="openCancelSheet('${j.id}')">${svg('x')} ยกเลิก Journey นี้</button>`:''}
    ${j.status==='CANCELLED'&&j.cancel_reason?`<div class="notice emerg-notice" style="margin-top:14px">${svg('info')}<span>ยกเลิกแล้ว · เหตุผล: ${esc(j.cancel_reason)}</span></div>`:''}
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

/* One row of the chain of custody. Names the nurse who attested, and — when
   somebody else typed it in — says so plainly rather than crediting the typist. */
function verifyLine(label, v){
  if(!v) return `<div class="verify-row"><span class="chk-box"></span><span>${label} · รอยืนยัน</span></div>`;
  const proxy = v.enteredBy && v.enteredBy !== v.by;
  return `<div class="verify-row"><span class="chk-box on">${svg('check')}</span>
    <span>${label} · <b>${esc(v.by)}</b> · ${fmtTime(v.at)}
      ${proxy?`<span class="proxy-note">บันทึกโดย ${esc(v.enteredBy)}${v.copresent?' · ยืนยันว่าอยู่ด้วย':''}</span>`
             :`<span class="self-note">ยืนยันด้วยตนเอง</span>`}</span></div>`;
}

/* ---------------------------- APPROVALS ---------------------------------- */
let _apvRole='', _apvWard='', _apvName='', _apvReject='';

async function loadApprovals(){
  const box=document.getElementById('apvBox'); if(!box) return;
  if(DEMO_MODE){
    box.innerHTML = `<div class="notice">${svg('info')}<span>โหมดเดโมไม่มีคำขอจริง — ในระบบจริงคำขอที่เจ้าหน้าที่สมัครเข้ามาจะแสดงที่นี่</span></div>`;
    return;
  }
  const list = await Approvals.pending();
  const waiting = list.filter(p=>p.approval_status==='PENDING');
  const rejected = list.filter(p=>p.approval_status==='REJECTED');
  box.innerHTML = `
    <p class="sheet-sub">รอตรวจสอบ ${waiting.length} คำขอ</p>
    <div class="notice" style="margin-bottom:10px">${svg('shield')}<span>ชื่อที่ผู้สมัครกรอกจะถูกบันทึกในประวัติการยืนยันป้ายข้อมือผู้ป่วย <b>กรุณาตรวจสอบว่าเป็นเจ้าหน้าที่จริงก่อนอนุมัติ</b></span></div>
    ${waiting.length ? waiting.map(apvRow).join('')
      : `<div class="ok-note">${svg('checkCircle')} ไม่มีคำขอค้างอยู่</div>`}
    ${rejected.length?`<div class="eyebrow" style="margin:16px 0 6px">ไม่อนุมัติ · ${rejected.length}</div>`+
      rejected.map(p=>`<div class="log-row"><div class="log-ic">${svg('x')}</div><div class="log-main">
        <div class="log-act">${esc(p.full_name||'(ไม่ระบุชื่อ)')}</div>
        <div class="log-meta">${esc(p.requested_unit||'—')}${p.reject_reason?' · '+esc(p.reject_reason):''}</div></div></div>`).join(''):''}`;
}

function apvRow(p){
  return `<div class="apv-card">
    <div class="apv-h"><b>${esc(p.full_name||'(ไม่ระบุชื่อ)')}</b>
      <span class="apv-when">${p.created_at?fmtTime(new Date(p.created_at).getTime()):''}</span></div>
    <div class="apv-unit">${svg('bed','rc-ic')} แจ้งว่าสังกัด: ${esc(p.requested_unit||'—')}</div>
    <div class="apv-actions">
      <button class="btn btn-primary" onclick="openApprove('${p.id}','${esc(p.full_name||'')}')">${svg('userCheck')} ตรวจสอบและอนุมัติ</button>
      <button class="btn btn-soft danger-soft" onclick="openReject('${p.id}')">${svg('x')} ไม่อนุมัติ</button>
    </div>
  </div>`;
}

function openApprove(id, name){
  _apvRole=''; _apvWard=''; _apvName=name;
  UI.openSheet(`
    <h3>อนุมัติเจ้าหน้าที่</h3>
    <p class="sheet-sub">กำหนดบทบาทและหน่วยงานให้ถูกต้อง</p>
    <div class="tile" style="margin-bottom:14px">
      <div class="field">
        <label for="apvName">ชื่อที่จะใช้ในระบบ</label>
        <input class="input" id="apvName" type="text" value="${esc(name)}" oninput="_apvName=this.value" />
        <div class="help">แก้ให้ตรงกับชื่อจริงได้ ชื่อนี้จะปรากฏในประวัติการยืนยันป้ายข้อมือ</div>
      </div>
      <div class="field">
        <label>บทบาท</label>
        ${dd('apvRole', ['WARD','PORTER','OR','PR','ADMIN'].map(r=>({v:r,label:ROLES[r].name+' ('+r+')'})), '', '— เลือกบทบาท —')}
      </div>
      <div class="field" style="margin-bottom:0">
        <label>หอผู้ป่วย <span class="help" style="display:inline">(เฉพาะบทบาทหอผู้ป่วย)</span></label>
        ${dd('apvWard', WARD_USERS.map(w=>({v:w.id,label:w.name})), '', '— เลือกหอผู้ป่วย —')}
      </div>
    </div>
    <button class="btn btn-primary" onclick="commitApprove('${id}')">${svg('check')} อนุมัติ</button>
    <button class="btn btn-ghost" style="margin:10px auto 0;width:auto" onclick="UI.closeSheet();adminOpen('approvals')">ยกเลิก</button>
  `);
}
async function commitApprove(id){
  if(!_apvName || _apvName.trim().length<3){UI.toast('กรุณากรอกชื่อ-นามสกุลให้ครบ','err');return}
  if(!_apvRole){UI.toast('กรุณาเลือกบทบาท','err');return}
  if(_apvRole==='WARD' && !_apvWard){UI.toast('บทบาทหอผู้ป่วยต้องระบุหอผู้ป่วย','err');return}
  const res=await Approvals.approve(id,_apvRole,_apvRole==='WARD'?_apvWard:null,_apvName.trim());
  if(!res.ok){UI.toast(res.msg,'err');return}
  await Staff.load();
  UI.closeSheet(); UI.toast('อนุมัติแล้ว','ok'); adminOpen('approvals');
}

function openReject(id){
  _apvReject='';
  UI.openSheet(`
    <h3>ไม่อนุมัติคำขอ</h3>
    <p class="sheet-sub">บัญชีจะยังเข้าใช้งานไม่ได้ และเก็บไว้ดูย้อนหลัง</p>
    <div class="tile" style="margin-bottom:14px">
      <div class="field" style="margin-bottom:0">
        <label>เหตุผล</label>
        ${dd('apvReject', ['ไม่ใช่เจ้าหน้าที่ของหน่วยงาน','ข้อมูลไม่ครบหรือไม่ถูกต้อง','ซ้ำกับบัญชีเดิม','เหตุผลอื่น'].map(r=>({v:r,label:r})), '', '— เลือกเหตุผล —')}
      </div>
    </div>
    <button class="btn btn-emerg" onclick="commitReject('${id}')">${svg('x')} ยืนยันไม่อนุมัติ</button>
    <button class="btn btn-ghost" style="margin:10px auto 0;width:auto" onclick="UI.closeSheet();adminOpen('approvals')">ยกเลิก</button>
  `);
}
async function commitReject(id){
  if(!_apvReject){UI.toast('กรุณาเลือกเหตุผล','err');return}
  const res=await Approvals.reject(id,_apvReject);
  if(!res.ok){UI.toast(res.msg,'err');return}
  UI.closeSheet(); UI.toast('บันทึกแล้ว','ok'); adminOpen('approvals');
}

/* ---------------------------- CANCEL ------------------------------------- */
/* A ward may cancel only before a porter has collected the patient; after that
   the patient is physically moving and an admin has to do it, so a ward can't
   make a patient in transit disappear from everyone's board. */
const CANCEL_REASONS = ['เลื่อนผ่าตัด','ยกเลิกผ่าตัด','สร้างรายการผิด','ผู้ป่วยปฏิเสธการผ่าตัด','เหตุผลอื่น'];
let _cReason='';

function canCancel(j){
  if(['COMPLETED','CANCELLED'].includes(j.status)) return false;
  if(State.role==='ADMIN') return true;
  if(State.role==='WARD') return j.status==='WAITING_PORTER' && j.ward_id===State.wardId;
  return false;
}
function openCancelSheet(jid){
  const j=Store.journeys.find(x=>x.id===jid); if(!j)return;
  _cReason='';
  UI.openSheet(`
    <h3>ยกเลิก Journey</h3>
    <p class="sheet-sub">${AV[j.avatar_id].name} · ${j.case_code}</p>
    <div class="notice emerg-notice" style="margin-bottom:14px">${svg('alert')}<span>เมื่อยกเลิกแล้ว รหัสติดตามของญาติจะใช้ไม่ได้ทันที และรายการจะหายจากกระดานของทุกหน่วย · ย้อนกลับไม่ได้</span></div>
    <div class="tile" style="margin-bottom:14px">
      <div class="field" style="margin-bottom:0">
        <label>เหตุผลที่ยกเลิก</label>
        ${dd('cReason', CANCEL_REASONS.map(r=>({v:r,label:r})), '', '— เลือกเหตุผล —')}
        <div class="help">เลือกจากรายการเท่านั้น เพื่อไม่ให้มีการพิมพ์ข้อมูลผู้ป่วยลงระบบ</div>
      </div>
    </div>
    <button class="btn btn-emerg" onclick="commitCancel('${j.id}')">${svg('x')} ยืนยันการยกเลิก</button>
    <button class="btn btn-ghost" style="margin:10px auto 0;width:auto" onclick="UI.closeSheet()">ไม่ยกเลิก</button>
  `);
}
async function commitCancel(jid){
  if(!_cReason){UI.toast('กรุณาเลือกเหตุผลที่ยกเลิก','err');return}
  if(!Store.online){UI.toast('ไม่มีการเชื่อมต่อ — โปรดลองใหม่','err');return}
  const res=await Store.cancelJourney(jid,_cReason,State.role);
  if(!res.ok){UI.toast(res.msg,'err');return}
  UI.closeSheet(); UI.toast('ยกเลิก Journey แล้ว','ok'); render();
}

/* ---------------------------- IDENTITY VERIFY (two-nurse) ---------------- */
let _vChecked=false, _vNurse='', _vRoom='', _vCoPresent=false, _vPickOpen=false, _vStep=1, _vExclude=null;
function openVerifySheet(j, step){
  const me = Staff.me();
  // Default the attester to the signed-in user — the common case is that the
  // person holding the device is the one who just read the wristband.
  const mine = me && Staff.optionsFor('OR').some(s=>s.id===me.id) ? me.id : '';
  _vChecked=false; _vRoom=j.or_room_id||''; _vCoPresent=false;
  _vNurse = step===2 ? '' : mine;      // step 2 must be someone else, so start empty
  _vStep = step; _vExclude = (step===2 && j.verify1) ? j.verify1.id : null;
  _vPickOpen = step===2;               // ...and open the picker straight away

  const pool = Staff.optionsFor('OR').filter(n=>!(step===2 && j.verify1 && j.verify1.id===n.id));
  UI.openSheet(`
    <h3>${j.is_emergency?'ยืนยันตัวผู้ป่วย · เคสฉุกเฉิน':`ยืนยันตัวผู้ป่วย · ครั้งที่ ${step}/2`}</h3>
    <p class="sheet-sub">${AV[j.avatar_id].name} · ${j.case_code}</p>
    ${j.is_emergency?`<div class="notice emerg-notice" style="margin:2px 0 14px">${svg('alert')}<span>เคสฉุกเฉิน — ใช้พยาบาลยืนยันคนเดียวได้ ระบบจะบันทึกตามจริงว่าเป็นการยืนยันโดยคนเดียว</span></div>`:''}
    ${step===2 && j.verify1?`<div class="notice" style="margin:2px 0 14px">${svg('userCheck')}<span>ครั้งที่ 1 ยืนยันโดย <b>${esc(j.verify1.by)}</b> — ครั้งที่ 2 ต้องเป็นพยาบาลคนละคน</span></div>`:''}
    <div class="tile" style="margin-bottom:14px">
      <div style="font-size:14.5px;font-weight:600;margin-bottom:4px">ตรวจสอบป้ายข้อมือผู้ป่วย</div>
      <p style="font-size:13px;color:var(--ink-2);line-height:1.5;margin-bottom:12px">อ่านชื่อ-นามสกุลจากป้ายข้อมือ และตรวจสอบว่าตรงกับผู้ป่วยรายนี้ ระบบจะบันทึกเพียงว่า “ยืนยันแล้ว” และผู้ยืนยัน โดย<b>ไม่เก็บชื่อผู้ป่วย</b></p>
      <label class="chk" onclick="_vChecked=!_vChecked;this.classList.toggle('on',_vChecked)">
        <span class="chk-box">${svg('check')}</span>
        <span>ชื่อ-นามสกุลตรงกับป้ายข้อมือ</span>
      </label>

      <div class="field" style="margin-top:14px">
        <label>ผู้ยืนยัน (พยาบาลครั้งที่ ${step})</label>
        <div id="vNurseBox">${verifierField(pool, _vNurse, _vPickOpen, me)}</div>
      </div>
      <div id="vCoBox">${coPresentField(step, _vNurse, me)}</div>

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

/* Either "it's me" (one tap, with a link to change) or the full picker. */
function verifierField(pool, curId, pickOpen, me){
  if(!pickOpen && me && curId===me.id){
    return `<div class="self-row">
      <span class="self-ic">${svg('userCheck')}</span>
      <span class="self-name">${esc(me.name)}<span class="self-tag">ฉัน</span></span>
      <button type="button" class="linkbtn" onclick="verifierPick()">เปลี่ยนผู้ยืนยัน</button>
    </div>`;
  }
  return dd('vNurse', pool.map(n=>({v:n.id,label:n.name})), curId, '— เลือกพยาบาล —')
       + (me && pool.some(n=>n.id===me.id) && curId!==me.id
          ? `<button type="button" class="linkbtn" style="margin-top:8px" onclick="verifierSelf()">ใช้ชื่อฉัน (${esc(me.name)})</button>` : '');
}
function verifierPick(){ _vPickOpen=true; refreshVerifier(); }
function verifierSelf(){ const me=Staff.me(); if(me){_vNurse=me.id;} _vPickOpen=false; refreshVerifier(); }
function refreshVerifier(){
  const me=Staff.me();
  const pool=Staff.optionsFor('OR').filter(n=>!(_vExclude && n.id===_vExclude));
  const box=document.getElementById('vNurseBox');
  if(box) box.innerHTML=verifierField(pool,_vNurse,_vPickOpen,me);
  const co=document.getElementById('vCoBox');
  if(co) co.innerHTML=coPresentField(_vStep,_vNurse,me);
}

/* Shown only when the 2nd check is being typed in by someone else. */
function coPresentField(step, nurseId, me){
  if(step!==2 || !nurseId) return '';
  if(me && nurseId===me.id) return '';
  const n = Staff.find('OR', nurseId);
  return `<div class="notice" style="margin-top:14px">${svg('info')}<span>คุณกำลังบันทึกแทน <b>${esc(n?n.name:'พยาบาลคนที่ 2')}</b> ระบบจะบันทึกว่าคุณเป็นผู้กด</span></div>
    <label class="chk ${_vCoPresent?'on':''}" style="margin-top:6px" onclick="_vCoPresent=!_vCoPresent;this.classList.toggle('on',_vCoPresent)">
      <span class="chk-box">${svg('check')}</span>
      <span>ยืนยันว่า${esc(n?n.name:'พยาบาลคนที่ 2')}อยู่ด้วยและตรวจป้ายข้อมือแล้ว</span>
    </label>`;
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
  const nurse = Staff.find('OR', _vNurse);
  if(!nurse){UI.toast('ไม่พบข้อมูลพยาบาลที่เลือก','err');return}
  const res=await Store.verify(jid, step, nurse, State.role, {copresent:_vCoPresent});
  if(!res.ok){UI.toast(res.msg,'err');return}   // keep the sheet open so it can be corrected
  UI.closeSheet();
  UI.toast(_j?.is_emergency?'ยืนยันแล้ว · เริ่มผ่าตัด':(step===2?'ยืนยันครบ 2 คน · เริ่มผ่าตัด':'ยืนยันตัวครั้งที่ 1 แล้ว'),'ok');
  render();
}

/* Porter accepts a ward-created job and picks the destination OR room,
   because the porter is the one who needs to know where to take the patient. */
let _pRoom='', _pChecked=false, _pStaff='';
function openPickupSheet(j){
  _pRoom = j.or_room_id||''; _pChecked=false;
  { const me=Staff.me(); _pStaff = (me && Staff.optionsFor('PORTER').some(x=>x.id===me.id)) ? me.id : ''; }
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
        ${dd('pStaff', Staff.optionsFor('PORTER').map(n=>({v:n.id,label:n.name})), _pStaff, '— เลือกเจ้าหน้าที่ —')}
        <div class="help">เติมชื่อผู้ที่ล็อกอินไว้ให้แล้ว เปลี่ยนได้หากบันทึกแทนคนอื่น</div>
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
  const staff = Staff.find('PORTER', _pStaff);
  if(!staff){UI.toast('ไม่พบข้อมูลเจ้าหน้าที่ที่เลือก','err');return}
  const res = Store.porterPickup
    ? await Store.porterPickup(jid, staff, _pRoom)
    : await mockPickup(jid, staff, r);
  UI.closeSheet();
  if(res.ok){UI.toast(`ยืนยันป้ายข้อมือแล้ว · นำส่ง ${r.name}`,'ok');render()}
  else UI.toast(res.msg,'err');
}

/* RR receives the patient from OR — same wristband check at the handoff. */
let _rChecked=false, _rStaff='';
function openRRReceiveSheet(j){
  _rChecked=false;
  { const me=Staff.me(); _rStaff = (me && Staff.optionsFor('RR').some(x=>x.id===me.id)) ? me.id : ''; }
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
        ${dd('rStaff', Staff.optionsFor('RR').map(n=>({v:n.id,label:n.name})), _rStaff, '— เลือกพยาบาล —')}
        <div class="help">เติมชื่อผู้ที่ล็อกอินไว้ให้แล้ว เปลี่ยนได้หากบันทึกแทนคนอื่น</div>
      </div>
    </div>
    <button class="btn btn-primary" onclick="commitRRReceive('${j.id}')">${svg('heart')} รับเข้าห้องพักฟื้น</button>
    <button class="btn btn-ghost" style="margin:10px auto 0;width:auto" onclick="UI.closeSheet()">ยกเลิก</button>
  `);
}
async function commitRRReceive(jid){
  if(!_rChecked){UI.toast('กรุณาติ๊กยืนยันว่าตรงกับป้ายข้อมือ','err');return}
  if(!_rStaff){UI.toast('กรุณาเลือกพยาบาลผู้รับ','err');return}
  const staff = Staff.find('RR', _rStaff);
  if(!staff){UI.toast('ไม่พบข้อมูลพยาบาลที่เลือก','err');return}
  const res = Store.rrReceive
    ? await Store.rrReceive(jid, staff)
    : await mockRRReceive(jid, staff);
  UI.closeSheet();
  if(res.ok){UI.toast('ยืนยันป้ายข้อมือแล้ว · รับเข้า RR','ok');render()}
  else UI.toast(res.msg,'err');
}

/* ---------------------------- DESTINATION CHOICES ----------------------- */
/* OR at end of surgery: RR (queue for recovery) / ICU / straight back to ward. */
let _sdDest='', _sdWard='';
function openSurgeryDoneSheet(j){ _sdDest=''; _sdWard=j.ward_id||''; renderSurgeryDoneSheet(j); }
function sdPick(d, jid){ _sdDest=d; renderSurgeryDoneSheet(Store.journeys.find(x=>x.id===jid)); }
function destOpt(cur, d, ic, label, sub, pick, jid){
  return `<button class="btn ${cur===d?'btn-primary':'btn-soft'}" style="justify-content:flex-start;gap:11px;text-align:left;min-height:56px;margin-bottom:10px" onclick="${pick}('${d}','${jid}')">
    ${svg(ic)}<span><b>${label}</b><br><span style="font-size:12px;opacity:.75">${sub}</span></span></button>`;
}
function renderSurgeryDoneSheet(j){
  UI.openSheet(`<h3>ผ่าตัดเสร็จ · ส่งต่อ</h3><p class="sheet-sub">${AV[j.avatar_id].name} · ${j.case_code}</p>
    ${destOpt(_sdDest,'RR','heart','ห้องพักฟื้น (RR)','ส่งเข้าคิวให้ห้องพักฟื้นรับต่อ','sdPick',j.id)}
    ${destOpt(_sdDest,'ICU','activity','ICU','บันทึกว่าส่ง ICU แล้วปิดเคส','sdPick',j.id)}
    ${destOpt(_sdDest,'WARD','bed','กลับหอผู้ป่วยเลย','ไม่ผ่านห้องพักฟื้น','sdPick',j.id)}
    ${_sdDest==='WARD'?`<div class="field" style="margin:4px 0 14px"><label>หอปลายทาง</label>${dd('sdWard', WARDS.map(w=>({v:w.id,label:w.name})), _sdWard||j.ward_id, '— เลือกหอ —')}<div class="help">ค่าเริ่มต้นคือหอเดิม เปลี่ยนได้</div></div>`:''}
    <button class="btn btn-primary" ${_sdDest?'':'disabled style="opacity:.45"'} onclick="commitSurgeryDone('${j.id}')">${svg('check')} ยืนยัน</button>`);
}
async function commitSurgeryDone(jid){
  const j=Store.journeys.find(x=>x.id===jid); if(!j)return;
  if(!_sdDest){UI.toast('กรุณาเลือกปลายทาง','err');return}
  if(!Store.online){UI.toast('ไม่มีการเชื่อมต่อ — โปรดลองใหม่','err');return}
  let res;
  if(_sdDest==='RR')       res=await Store.route(jid,'SURGERY_FINISHED',{});
  else if(_sdDest==='ICU') res=await Store.route(jid,'COMPLETED',{discharge_type:'ICU'});
  else                     res=await Store.route(jid,'COMPLETED',{discharge_type:'WARD',discharge_ward_id:_sdWard||j.ward_id});
  UI.closeSheet();
  if(res.ok){UI.toast(_sdDest==='RR'?'ส่งเข้าห้องพักฟื้นแล้ว':_sdDest==='ICU'?'บันทึกส่ง ICU แล้ว':'บันทึกกลับหอผู้ป่วยแล้ว','ok');_sdDest='';render();}
  else UI.toast(res.msg,'err');
}

/* RR discharge: ward (choose, default original) / ICU / home. */
let _rdDest='', _rdWard='';
function openRRDischargeSheet(j){ _rdDest=''; _rdWard=j.ward_id||''; renderRRDischargeSheet(j); }
function rdPick(d, jid){ _rdDest=d; renderRRDischargeSheet(Store.journeys.find(x=>x.id===jid)); }
function renderRRDischargeSheet(j){
  UI.openSheet(`<h3>ส่งออกจากห้องพักฟื้น</h3><p class="sheet-sub">${AV[j.avatar_id].name} · ${j.case_code}</p>
    ${destOpt(_rdDest,'WARD','bed','กลับหอผู้ป่วย','เลือกหอปลายทางได้','rdPick',j.id)}
    ${destOpt(_rdDest,'ICU','activity','ICU','ส่งต่อห้องผู้ป่วยวิกฤต','rdPick',j.id)}
    ${destOpt(_rdDest,'HOME','home','กลับบ้าน','จำหน่ายกลับบ้าน','rdPick',j.id)}
    ${_rdDest==='WARD'?`<div class="field" style="margin:4px 0 14px"><label>หอปลายทาง</label>${dd('rdWard', WARDS.map(w=>({v:w.id,label:w.name})), _rdWard||j.ward_id, '— เลือกหอ —')}<div class="help">ค่าเริ่มต้นคือหอเดิม เปลี่ยนได้</div></div>`:''}
    <button class="btn btn-primary" ${_rdDest?'':'disabled style="opacity:.45"'} onclick="commitRRDischarge('${j.id}')">${svg('check')} ยืนยันส่งออก</button>`);
}
async function commitRRDischarge(jid){
  const j=Store.journeys.find(x=>x.id===jid); if(!j)return;
  if(!_rdDest){UI.toast('กรุณาเลือกปลายทาง','err');return}
  if(!Store.online){UI.toast('ไม่มีการเชื่อมต่อ — โปรดลองใหม่','err');return}
  let res;
  if(_rdDest==='WARD')     res=await Store.route(jid,'COMPLETED',{discharge_type:'WARD',discharge_ward_id:_rdWard||j.ward_id});
  else if(_rdDest==='ICU') res=await Store.route(jid,'COMPLETED',{discharge_type:'ICU'});
  else                     res=await Store.route(jid,'COMPLETED',{discharge_type:'HOME'});
  UI.closeSheet();
  if(res.ok){UI.toast(_rdDest==='WARD'?'ส่งกลับหอผู้ป่วยแล้ว':_rdDest==='ICU'?'บันทึกส่ง ICU แล้ว':'จำหน่ายกลับบ้านแล้ว','ok');_rdDest='';render();}
  else UI.toast(res.msg,'err');
}

/* Where a finished case ended up — shown on completed cases. */
function destText(j){
  if(j.status!=='COMPLETED') return '';
  const dt=j.discharge_type;
  if(dt==='ICU')  return 'ส่ง ICU แล้ว';
  if(dt==='HOME') return 'จำหน่ายกลับบ้านแล้ว';
  const w=j.discharge_ward_name||(WARDS.find(x=>x.id===j.discharge_ward_id)||{}).name||j.ward_name;
  return 'กลับหอผู้ป่วย · '+w;
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
  if(t.surgeryDone){openSurgeryDoneSheet(j);return}
  if(t.rrDischarge){openRRDischargeSheet(j);return}
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
  return `<div class="notice">${svg('shield')}<span>บันทึกการใช้งานทั้งหมด บันทึกด้วยเวลาจากเซิร์ฟเวอร์ ผู้ดูแลระบบไม่สามารถแก้ไขได้</span></div>
    <div class="section-title">${svg('list')} เหตุการณ์ล่าสุด <span class="count">${Store.audit.length}</span>
      ${!DEMO_MODE?`<button class="btn btn-soft btn-sm" id="auditRefreshBtn" style="margin-left:auto" onclick="refreshAuditView()">${svg('refresh')} รีเฟรช</button>`:''}
    </div>
    <div class="tile" style="padding:6px 16px">
    ${Store.audit.length?Store.audit.slice(0,40).map(a=>`<div class="log-row">
      <div class="log-ic" style="${a.success?'':'color:var(--clay);background:var(--clay-tint);border-color:transparent'}">${svg(AUDIT_IC[a.action]||'info')}</div>
      <div class="log-main"><div class="log-act">${a.action}${a.success?'':' · ล้มเหลว'}</div>
      <div class="log-meta">${a.actor} · ${a.resource_type}${a.resource_id?' · '+a.resource_id:''}${a.meta&&Object.keys(a.meta).length?' · '+esc(JSON.stringify(a.meta)):''}</div></div>
      <div class="log-time">${fmtTime(a.at)}</div></div>`).join(''):`<div class="empty" style="padding:24px 8px"><p>ยังไม่มีบันทึกการใช้งาน</p></div>`}
    </div>`;
}

async function refreshAuditView(){
  const btn=document.getElementById('auditRefreshBtn');
  if(btn){btn.disabled=true;btn.innerHTML=`<span class="spin"></span> กำลังโหลด...`;}
  await Store.refreshAudit();
  if(State.screen==='audit') render();
}

/* ---------------------------- ADMIN -------------------------------------- */
function adminView(){
  const sections=[
    ['approvals','คำขอสมัครใช้งาน','ตรวจสอบและอนุมัติเจ้าหน้าที่ที่สมัครเข้ามา','userCheck'],
    ['users','จัดการผู้ใช้','รายชื่อเจ้าหน้าที่และบทบาท','users'],
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
    approvals: '<h3>คำขอสมัครใช้งาน</h3><div id="apvBox"><p class="help">กำลังโหลด...</p></div>',
    users: adminUsers(),
    roles: adminRoles(),
    wards: refAdminShell('wards','วอร์ด','หอผู้ป่วย'),
    rooms: refAdminShell('rooms','ห้องผ่าตัด','ห้อง'),
    avatars:`<h3>อวตาร์</h3><p class="sheet-sub">ชุดอวตาร์ธรรมชาติ นุ่มนวล เป็นกลาง</p><div class="avgrid">${AVATARS.map(a=>`<div class="avpick">${avatarEl(a.id,'sm')}<span class="nm">${a.name}</span></div>`).join('')}</div>`,
    status:`<h3>ป้ายสถานะ</h3><p class="sheet-sub">ภายใน → สาธารณะ</p>${FLOW.map(st=>`<div class="log-row"><div class="log-ic" style="color:${STATUS[st].ink}">${svg(STATUS[st].icon)}</div><div class="log-main"><div class="log-act">${STATUS[st].label}</div><div class="log-meta">${st} · ${STATUS[st].pub}</div></div></div>`).join('')}`,
  };
  UI.openSheet(map[k]||`<h3>${k}</h3><p class="sheet-sub">ยังไม่พร้อมใช้งาน</p>`);
  if(k==='approvals') loadApprovals();
  if(k==='wards' || k==='rooms') loadRefAdmin(k);
}

/* ---------------------------- REFERENCE DATA EDITOR (wards / OR rooms) --- */
/* Placeholder shell shown immediately; loadRefAdmin() fills #refBox once the
   rows are fetched (mirrors the approvals loading pattern). */
function refAdminShell(kind, title, noun){
  return `<h3>${title}</h3><p class="sheet-sub" id="refSub">กำลังโหลด...</p>
    <div id="refBox"><p class="help">กำลังโหลด...</p></div>
    <div class="field" style="margin-top:16px">
      <label>เพิ่ม${noun}ใหม่</label>
      <div style="display:flex;gap:8px">
        <input class="input" id="refAddName" type="text" placeholder="ชื่อ${noun}" style="flex:1" oninput="_refAddName=this.value" onkeydown="if(event.key==='Enter')commitRefAdd('${kind}')">
        <button class="btn btn-primary" style="width:auto;padding:0 18px" onclick="commitRefAdd('${kind}')">${svg('plus')}</button>
      </div>
    </div>`;
}
let _refAddName='', _refEditId=null, _refEditName='';
async function loadRefAdmin(kind){
  _refAddName=''; _refEditId=null;
  const res = await AdminRef.listAll(kind);
  const box=document.getElementById('refBox'); const sub=document.getElementById('refSub');
  if(!box) return; // sheet closed before load finished
  if(!res.ok){ box.innerHTML=`<p class="help" style="color:var(--clay)">${esc(res.msg)}</p>`; if(sub) sub.textContent='โหลดไม่สำเร็จ'; return; }
  window._refRows = window._refRows||{}; window._refRows[kind]=res.rows;
  renderRefRows(kind);
}
function renderRefRows(kind){
  const rows=(window._refRows&&window._refRows[kind])||[];
  const box=document.getElementById('refBox'); const sub=document.getElementById('refSub');
  if(!box) return;
  const activeN=rows.filter(r=>r.is_active).length;
  if(sub) sub.textContent=`${rows.length} รายการ · ใช้งานอยู่ ${activeN}`;
  const ic = kind==='wards' ? 'bed' : 'door';
  box.innerHTML = rows.length ? rows.map(r=>{
    if(_refEditId===r.id){
      return `<div class="log-row" style="align-items:center">
        <div class="log-ic">${svg(ic)}</div>
        <div class="log-main">
          <input class="input" type="text" value="${esc(r.name)}" style="margin-bottom:8px" oninput="_refEditName=this.value" onkeydown="if(event.key==='Enter')commitRefRename('${kind}','${r.id}')">
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary" style="width:auto;padding:0 14px;min-height:38px" onclick="commitRefRename('${kind}','${r.id}')">${svg('check')} บันทึก</button>
            <button class="btn btn-soft" style="width:auto;padding:0 14px;min-height:38px" onclick="_refEditId=null;renderRefRows('${kind}')">ยกเลิก</button>
          </div>
        </div>
      </div>`;
    }
    return `<div class="log-row" style="align-items:center;${r.is_active?'':'opacity:.55'}">
      <div class="log-ic">${svg(ic)}</div>
      <div class="log-main">
        <div class="log-act">${esc(r.name)}${r.is_active?'':' · ปิดใช้งาน'}</div>
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0">
        <button class="icon-btn" style="width:38px;height:38px" onclick="_refEditId='${r.id}';_refEditName='${esc(r.name).replace(/'/g,"&#39;")}';renderRefRows('${kind}')" aria-label="แก้ไขชื่อ">${svg('edit')}</button>
        <button class="icon-btn" style="width:38px;height:38px" onclick="toggleRefActive('${kind}','${r.id}',${!r.is_active})" aria-label="${r.is_active?'ปิดใช้งาน':'เปิดใช้งาน'}">${svg(r.is_active?'eyeOff':'eye')}</button>
      </div>
    </div>`;
  }).join('') : `<p class="help">ยังไม่มีรายการ</p>`;
}
async function commitRefAdd(kind){
  if(!_refAddName || !_refAddName.trim()){ UI.toast('กรุณากรอกชื่อ','err'); return; }
  const res = await AdminRef.add(kind, _refAddName);
  if(!res.ok){ UI.toast(res.msg,'err'); return; }
  const nm=document.getElementById('refAddName'); if(nm) nm.value='';
  _refAddName='';
  UI.toast('เพิ่มแล้ว','ok');
  loadRefAdmin(kind);
}
async function commitRefRename(kind, id){
  if(!_refEditName || !_refEditName.trim()){ UI.toast('กรุณากรอกชื่อ','err'); return; }
  const res = await AdminRef.rename(kind, id, _refEditName);
  if(!res.ok){ UI.toast(res.msg,'err'); return; }
  _refEditId=null;
  UI.toast('บันทึกแล้ว','ok');
  loadRefAdmin(kind);
}
async function toggleRefActive(kind, id, active){
  const res = await AdminRef.setActive(kind, id, active);
  if(!res.ok){ UI.toast(res.msg,'err'); return; }
  UI.toast(active?'เปิดใช้งานแล้ว':'ปิดใช้งานแล้ว — จะไม่ขึ้นให้เลือกในหน้าใหม่ ๆ (เคสเก่ายังอ้างอิงได้)','ok');
  loadRefAdmin(kind);
}

/* Read-only directory. Accounts cannot be created from the browser: that needs
   the service_role key, which must never reach a client. */
function adminUsers(){
  const groups=['ADMIN','OR','RR','PORTER','WARD','PR'];
  const all=[...(Staff.OR||[]),...(Staff.RR||[]),...(Staff.PORTER||[])];
  const rows=groups.map(r=>{
    const list=(Staff[r]||[]);
    if(!list.length) return '';
    return `<div class="eyebrow" style="margin:14px 0 6px">${ROLES[r]?ROLES[r].name:r} · ${list.length} คน</div>` +
      list.map(u=>`<div class="log-row"><div class="log-ic" style="background:${ROLES[r]?ROLES[r].tint:'var(--line)'};color:${ROLES[r]?ROLES[r].ink:'var(--ink-2)'}">${svg(ROLES[r]?ROLES[r].icon:'user')}</div>
        <div class="log-main"><div class="log-act">${esc(u.name)}</div><div class="log-meta">${r}</div></div></div>`).join('');
  }).join('');
  return `<h3>จัดการผู้ใช้</h3><p class="sheet-sub">${all.length} บัญชีที่ตั้งชื่อแล้ว</p>
    <div class="notice" style="margin-bottom:6px">${svg('shield')}<span>การสร้างบัญชีและกำหนดบทบาททำที่ Supabase เท่านั้น — หน้าเว็บทำไม่ได้เพราะต้องใช้กุญแจระดับสูงซึ่งห้ามอยู่ในเบราว์เซอร์</span></div>
    ${rows || '<p class="help">ยังไม่มีบัญชีที่ตั้ง full_name</p>'}
    <p class="help" style="margin-top:14px">เพิ่มหรือแก้ไข: Supabase → Authentication → Add user แล้วรัน <code>sql/05_bulk_staff.sql</code></p>`;
}

/* The permission matrix is documentation, not a control panel: the real rules
   live in Row Level Security and cannot be edited from here by design. */
function adminRoles(){
  const rows=[
    ['WARD','สร้าง Journey · ยกเลิกก่อนหน่วยเปลมารับ','เห็นเฉพาะหอผู้ป่วยของตนเอง'],
    ['PORTER','รับผู้ป่วย · ยืนยันป้ายข้อมือ · เลือกห้อง OR','เห็นคิวรอรับและเคสที่กำลังนำส่ง'],
    ['OR','ยืนยันตัวผู้ป่วย 2 ครั้ง · เปิดเคสฉุกเฉิน · ผ่าตัดเสร็จ','เห็นเคสช่วงที่อยู่ในความดูแล'],
    ['RR','รับเข้าห้องพักฟื้น · ส่งกลับหอผู้ป่วย','เห็นเคสที่ผ่าตัดเสร็จและกำลังพักฟื้น'],
    ['PR','ค้นหาสถานะให้ญาติด้วยอวตาร์ + รหัส','ไม่เห็นรายการเคส เห็นเฉพาะผลค้นหา'],
    ['ADMIN','ยกเลิก/พักเคส · ดูบันทึกตรวจสอบ','เห็นทั้งหมด'],
  ];
  return `<h3>บทบาทและสิทธิ์</h3><p class="sheet-sub">บังคับใช้จริงที่ระดับฐานข้อมูล</p>
    <div class="notice" style="margin-bottom:10px">${svg('shield')}<span>ตารางนี้แสดงเพื่อดูเท่านั้น แก้จากหน้าเว็บไม่ได้ — สิทธิ์จริงบังคับด้วย Row Level Security ใน Postgres จึงข้ามผ่านหน้าเว็บไม่ได้</span></div>
    ${rows.map(([r,can,see])=>`<div class="role-card">
      <div class="role-card-h"><span class="ro-ic" style="background:${ROLES[r].tint};color:${ROLES[r].ink}">${svg(ROLES[r].icon)}</span><b>${ROLES[r].name}</b></div>
      <div class="role-card-b"><div>${svg('check','rc-ic')} ${can}</div><div>${svg('user','rc-ic')} ${see}</div></div>
    </div>`).join('')}`;
}



/* ---- demo-only helpers (the Supabase store has real methods for these) ---- */
async function mockPickup(jid, staff, room){
  const j=Store.journeys.find(x=>x.id===jid); if(!j) return {ok:false,msg:'ไม่พบ Journey นี้'};
  if(room){ j.or_room_id=room.id; j.or_room=room.name; j.dest=room.name; }
  const me=Staff.me();
  j.verifyPorter={by:staff.name, id:staff.id, at:now(), enteredBy:me?me.name:null};
  Store.logEvent(j.id,'IDENTITY_VERIFIED',{stage:'PORTER',staff:staff.name});
  Store.audit.unshift(auditRow(State.role,'IDENTITY_VERIFIED','journey',j.id,true,{stage:'PORTER',staff:staff.name}));
  return Store.transition(jid,'PORTER_TO_OR',State.role);
}
async function mockRRReceive(jid, staff){
  const j=Store.journeys.find(x=>x.id===jid); if(!j) return {ok:false,msg:'ไม่พบ Journey นี้'};
  const me=Staff.me();
  j.verifyRR={by:staff.name, id:staff.id, at:now(), enteredBy:me?me.name:null};
  Store.logEvent(j.id,'IDENTITY_VERIFIED',{stage:'RR',staff:staff.name});
  Store.audit.unshift(auditRow(State.role,'IDENTITY_VERIFIED','journey',j.id,true,{stage:'RR',staff:staff.name}));
  return Store.transition(jid,'IN_RR',State.role);
}

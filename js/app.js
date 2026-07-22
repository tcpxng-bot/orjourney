/* ============================================================================
   OR Journey — boot
   Order matters: config → constants → mock → api → views → app
   ============================================================================ */

const OJ_BUILD = '2026-07-22c';
let pendingBootMsg = null;

function fatal(msg, detail){
  document.getElementById('app').innerHTML = `
    <div class="login-wrap fade">
      <div class="brandmark">${svg('alert')}</div>
      <h1>เปิดระบบไม่สำเร็จ</h1>
      <p class="tag">${esc(msg)}</p>
      ${detail?`<div class="tile" style="text-align:left">
        <div class="eyebrow" style="margin-bottom:6px">รายละเอียดทางเทคนิค</div>
        <p class="errdetail">${esc(detail)}</p></div>`:''}
      <div class="tile" style="text-align:left">
        <div class="eyebrow" style="margin-bottom:8px">ตรวจสอบตามลำดับนี้</div>
        <ol class="fam-how" style="margin:0">
          <li>รัน <code>sql/01_schema.sql</code> → <code>02_rls.sql</code> → <code>03_seed.sql</code> ครบแล้วหรือยัง</li>
          <li>รัน <code>sql/00_verify.sql</code> ต้องขึ้น OK ทุกบรรทัด</li>
          <li>ตรวจ <code>js/config.js</code> ว่าใส่ URL และ anon key ถูกต้อง</li>
        </ol>
      </div>
      <button class="btn btn-soft" style="margin-top:18px" onclick="location.reload()">${svg('refresh')} ลองใหม่</button>
      <p class="help" style="margin-top:14px">พิมพ์ <code>await ojDiagnose()</code> ใน Console (F12) เพื่อดูว่าติดขั้นไหน · build ${OJ_BUILD}</p>
    </div>`;
}

async function boot(){
  let mode;
  try {
    const r = await initBackend();
    if(r.mode === 'error'){ fatal(r.msg, r.detail); return; }
    mode = r.mode;
  } catch(e){
    console.error('[OR Journey] boot failed:', e);
    fatal('เชื่อมต่อฐานข้อมูลไม่สำเร็จ', 'ตรวจสอบค่า supabaseUrl และ supabaseAnonKey ใน js/config.js แล้วลองใหม่อีกครั้ง');
    return;
  }

  // Re-render whenever the data layer changes (Realtime in live mode).
  Store.sub(()=>{ if(State.screen !== 'login') render(); });

  // Keep relative times ("18 นาที") honest on the live boards.
  setInterval(()=>{
    if(['ward-board','or-board','rr-board','home','dashboard'].includes(State.screen)) render();
  }, 30000);

  // An existing Supabase session skips the login screen.
  if(mode === 'live'){
    try {
      if(await Auth.restore()){
        const ws = await loadWorkspace();
        if(ws.ok){ await startSession(); return; }
        // Session is valid but the workspace can't load — show why, on the
        // login screen, rather than dropping the user into a broken board.
        console.error('[OR Journey] workspace load failed:', ws.msg);
        await Auth.signOut();
        pendingBootMsg = ws.msg;
      }
    } catch(e){ console.warn('[OR Journey] session restore failed:', e); }
  }

  render();
  if(pendingBootMsg){ UI.toast(pendingBootMsg,'err'); pendingBootMsg=null; }
}

document.addEventListener('DOMContentLoaded', boot);

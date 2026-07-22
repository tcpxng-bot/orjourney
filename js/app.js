/* ============================================================================
   OR Journey — boot
   Order matters: config → constants → mock → api → views → app
   ============================================================================ */

function fatal(msg, detail){
  document.getElementById('app').innerHTML = `
    <div class="login-wrap fade">
      <div class="brandmark">${svg('alert')}</div>
      <h1>เปิดระบบไม่สำเร็จ</h1>
      <p class="tag">${esc(msg)}</p>
      ${detail?`<div class="tile"><p class="help" style="margin:0">${esc(detail)}</p></div>`:''}
      <button class="btn btn-soft" style="margin-top:18px" onclick="location.reload()">${svg('refresh')} ลองใหม่</button>
    </div>`;
}

async function boot(){
  let mode;
  try {
    const r = await initBackend();
    if(r.mode === 'error'){ fatal(r.msg); return; }
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
      if(await Auth.restore()){ await startSession(); return; }
    } catch(e){ console.warn('[OR Journey] session restore failed:', e); }
  }

  render();
}

document.addEventListener('DOMContentLoaded', boot);

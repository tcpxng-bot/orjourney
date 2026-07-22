/* ============================================================================
   OR Journey — configuration
   ----------------------------------------------------------------------------
   1. Open your Supabase project → Settings → API
   2. Copy "Project URL" into supabaseUrl
   3. Copy the "anon / public" key into supabaseAnonKey
   4. Save and reload the page

   NEVER put the service_role key here. This file is downloaded by every browser
   that opens the app; the anon key is the only key that is safe to expose. All
   real protection comes from Row Level Security in the database.

   If the two values below are left empty the app runs in DEMO MODE with mock
   data, so you can click through the screens before wiring the database.
   ============================================================================ */
window.OJ_CONFIG = {
  supabaseUrl:     'https://sgviqseqwneowjtqskmy.supabase.co',   // e.g. 'https://abcdefghijkl.supabase.co'
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNndmlxc2Vxd25lb3dqdHFza215Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3MjUzNTEsImV4cCI6MjEwMDMwMTM1MX0.O8XvXl0Ydgw98fpCi-0omYapnBxiHSiDU9roA3xJo74',   // e.g. 'eyJhbGciOi...'

  // Force demo mode even when credentials are present (useful for training).
  forceDemo: false,
};

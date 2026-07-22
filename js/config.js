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
  supabaseUrl:     '',   // e.g. 'https://abcdefghijkl.supabase.co'
  supabaseAnonKey: '',   // e.g. 'eyJhbGciOi...'

  // Force demo mode even when credentials are present (useful for training).
  forceDemo: false,
};

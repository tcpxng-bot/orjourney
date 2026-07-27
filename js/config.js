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

  // ---- Support contact -----------------------------------------------------
  // Shown where a password reset would normally go. Sending reset mail needs a
  // configured SMTP server; until then a real person on LINE is more reliable
  // than a link that quietly fails.
  supportLineUrl: 'https://line.me/R/ti/p/@yourhospital',
  supportLineLabel: '@yourhospital',

  // ---- Self-registration --------------------------------------------------
  // Staff may create their own account, but it does nothing until an
  // administrator approves it and assigns a role.
  allowSignup: true,

  // Units offered on the sign-up form. Edit this list to match your hospital.
  //
  // It is kept here rather than read from the `wards` table because sign-up
  // happens before login, and the ward list is deliberately not readable by
  // anonymous visitors. This is only a hint for whoever approves the request —
  // the real role and ward are assigned by an administrator at approval time,
  // so an imperfect match here is harmless.
  signupUnits: [
    'สูตินรีเวชกรรม',
    'นรีเวชกรรม',
    'ห้องคลอด (LR)',
    'อายุรกรรมหญิง 1',
    'ศัลยกรรมหญิง',
    'ห้องผ่าตัด (OR)',
    'ห้องพักฟื้น (RR)',
    'หน่วยเปล',
    'ประชาสัมพันธ์',
    'อื่น ๆ',
  ],

  // Only addresses on these domains may register. Sub-domains are accepted too,
  // so 'cmu.ac.th' also allows name@med.cmu.ac.th. This is a convenience filter
  // checked in the browser, NOT a security control — the real gate is admin
  // approval. Leave the list empty to accept any address.
  //
  // Note: this applies to SELF-REGISTRATION only. Accounts an administrator
  // creates in Supabase (such as shared ward logins) are not affected.
  allowedEmailDomains: ['cmu.ac.th'],
};

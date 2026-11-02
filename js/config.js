/* Therapeia Zoi OS · config
   The publishable (anon) key is safe in the browser: every table is protected by row-level security,
   and all writes go through the os_* database functions, which check membership. */
window.OS_CONFIG = {
  // 'demo' = sample data in memory, nothing saved or published. 'live' = Supabase.
  // Live when a key is pasted below; demo when it isn't (or when window.OS_FORCE_DEMO is set).
  mode: window.OS_FORCE_DEMO ? 'demo' : 'live',
  supabaseUrl: 'https://weshvnbovvzucjxymllc.supabase.co',
  supabaseKey: 'sb_publishable_LanJWQb6UUfBApA_3sURaQ_NgsbXzM9',
  clientId: '3034c840-dfc2-4c85-b949-bc8d4fd69208',
  brand: { name: 'Therapeia Zoi', handle: 'therapeiazoi', logo: 'demo/logo.png', timezone: 'America/New_York', tzLabel: 'Eastern Time' },
  credit: true,   // "Built by Saltpilot" in the sidebar; set false for a white-label client
  goal: { revenue: 1000000, label: '$1M revenue' }
};

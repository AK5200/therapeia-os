/* Data layer. Same API in demo and live mode, so views never care where data comes from.
   Live: reads v_os_posts / os_settings / competitor_posts through RLS, writes through os_* RPCs. */
(function () {
  const C = window.OS_CONFIG;
  const DEFAULT_SETTINGS = { auto_mode: 'manual', trust_hours: 12, post_times: ['09:00'], platforms: { instagram: true, tiktok: true, youtube: true }, provider: 'blotato', publish_mode: 'manual' };

  // ---------- demo ----------
  function demoStore() {
    const now = Date.now(), day = 864e5;
    const at = (d, h) => { const x = new Date(now + d * day); x.setHours(h, 0, 0, 0); return x.toISOString(); };
    let n = 0;
    const posts = (window.OS_DEMO_POSTS || []).map((p, i) => ({
      ...p,
      created_at: new Date(now - (i + 1) * 36e5).toISOString(),
      scheduled_for: p.status === 'scheduled' ? at(++n, 9) : null,
      approved_at: p.status === 'scheduled' ? new Date(now - 2 * 36e5).toISOString() : null,
      approved_by: p.status === 'scheduled' ? 'demo@therapeiazoi.com' : null,
      review_note: p.status === 'changes_requested' ? 'Make the headline bigger and warmer light on her face.' : null,
      critic_verdict: 'pass', compliance_verdict: 'pass', compliance_flagged: false,
      critic_summary: 'Text matches the copy, product label readable, person natural and adult.',
      publish_results: null, metrics: null, revision: p.status === 'changes_requested' ? 1 : 0,
      revisions: p.status === 'changes_requested' ? [{ revision: 1, note: 'Make the headline bigger and warmer light on her face.', status: 'running', scope: 'full', at: new Date(now - 36e5).toISOString() }] : null
    }));
    const learning = {
      proposals: [{ id: 'demo-prop', title: 'New rule for image lighting', summary: 'Asked 3 times in the last 30 days', created_at: new Date(now - 2 * 36e5).toISOString(),
        payload: { category: 'image_lighting', agent: 'art_director', rule_text: 'Light faces with warm, soft key light from the side; avoid flat or cold light on skin, especially on deeper skin tones.', times: 3,
          notes: ['warmer light on her face', 'the lighting looks cold', 'more glow on the skin'] } }],
      rules: [],
      stats: [{ category: 'image_lighting', times: 3 }, { category: 'headline_copy', times: 2 }, { category: 'text_size_position', times: 1 }]
    };
    let settings = { ...DEFAULT_SETTINGS };
    const nextSlot = () => {
      const taken = new Set(posts.filter(p => p.scheduled_for).map(p => p.scheduled_for.slice(0, 10)));
      for (let d = 1; d < 90; d++) { const s = at(d, 9); if (!taken.has(s.slice(0, 10))) return s; }
      return at(1, 9);
    };
    const find = id => { const p = posts.find(x => x.id === id); if (!p) throw new Error('Post not found'); return p; };
    return {
      mode: 'demo',
      async session() { return { email: 'demo@therapeiazoi.com' }; },
      async signIn() {}, async signOut() {},
      async posts() { return posts.map(p => ({ ...p })); },
      async decide(id, decision, note, when) {
        const p = find(id);
        if (decision === 'approve') Object.assign(p, { status: 'scheduled', scheduled_for: when || p.scheduled_for || nextSlot(), approved_at: new Date().toISOString(), approved_by: 'demo@therapeiazoi.com', review_note: note || p.review_note });
        else if (decision === 'changes') { if (!note) throw new Error('Tell the AI what to change'); Object.assign(p, { status: 'changes_requested', review_note: note, scheduled_for: null }); }
        else if (decision === 'unschedule') Object.assign(p, { status: 'in_review', scheduled_for: null, approved_at: null, approved_by: null });
        else if (decision === 'reject') Object.assign(p, { status: 'rejected', review_note: note, scheduled_for: null });
        return { ...p };
      },
      async updatePost(id, { ig, tt, when }) {
        const p = find(id);
        if (ig != null) p.caption_instagram = ig;
        if (tt != null) p.caption_tiktok = tt;
        if (when && p.status === 'scheduled') p.scheduled_for = when;
        return { ...p };
      },
      async retry(id) { const p = find(id); p.status = 'scheduled'; p.scheduled_for = new Date().toISOString(); return { ...p }; },
      async settings() { return { ...settings }; },
      async saveSettings(s) { settings = { ...settings, ...s }; return { ...settings }; },
      async competitors() { return []; },
      async markPosted(id, platform, posted, url) {
        const p = find(id); const r = { ...(p.publish_results || {}) };
        if (posted) r[platform] = { status: 'published', url: url || null, at: new Date().toISOString(), via: 'manual' }; else delete r[platform];
        p.publish_results = r;
        const all = Object.entries(settings.platforms).filter(([, on]) => on).every(([k]) => r[k] && r[k].status === 'published');
        p.status = all ? 'published' : 'scheduled'; p.published_at = all ? new Date().toISOString() : null;
        return { ...p };
      },
      async learning() { return JSON.parse(JSON.stringify(learning)); },
      async decideApproval(id, decision, text) {
        const i = learning.proposals.findIndex(x => x.id === id); if (i < 0) throw new Error('Not found');
        const a = learning.proposals.splice(i, 1)[0];
        if (decision === 'approve') { learning.rules = learning.rules.filter(r => r.category !== a.payload.category); learning.rules.push({ id: 'r' + Date.now(), category: a.payload.category, agent: a.payload.agent, rule_text: text || a.payload.rule_text, created_at: new Date().toISOString() }); }
      },
      async retireRule(id) { learning.rules = learning.rules.filter(r => r.id !== id); }
    };
  }

  // ---------- live (Supabase) ----------
  function liveStore() {
    const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey, { auth: { persistSession: true, detectSessionInUrl: true } });
    const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
    return {
      mode: 'live',
      async session() { if (C.requireLogin === false) return { email: 'No login (temporary)', open: true }; const { data } = await sb.auth.getSession(); return data.session ? { email: data.session.user.email } : null; },
      async signIn(email) { ok(await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true } })); },
      async signOut() { await sb.auth.signOut(); },
      async posts() {
        const rows = ok(await sb.from('v_os_posts').select('*').eq('client_id', C.clientId)
          .or('status.not.in.(planned,drafted),revision.gt.0').order('created_at', { ascending: false }).limit(300));
        return rows.map(r => ({ ...r, db_status: r.status, status: r.ui_status || r.status }));
      },
      async decide(id, decision, note, when) { return ok(await sb.rpc('os_decide_post', { p_post: id, p_decision: decision, p_note: note || null, p_when: when || null })); },
      async updatePost(id, { ig, tt, when }) { return ok(await sb.rpc('os_update_post', { p_post: id, p_caption_ig: ig ?? null, p_caption_tt: tt ?? null, p_when: when || null })); },
      async retry(id) { return ok(await sb.rpc('os_retry_publish', { p_post: id })); },
      async settings() { const r = ok(await sb.from('os_settings').select('*').eq('client_id', C.clientId).maybeSingle()); return { ...DEFAULT_SETTINGS, ...(r || {}) }; },
      async saveSettings(s) { return ok(await sb.rpc('os_save_settings', { p_client: C.clientId, p: s })); },
      async markPosted(id, platform, posted, url) { return ok(await sb.rpc('os_mark_posted', { p_post: id, p_platform: platform, p_posted: posted, p_url: url || null })); },
      async learning() {
        const [proposals, rules, stats] = await Promise.all([
          sb.from('approvals').select('*').eq('client_id', C.clientId).eq('kind', 'prompt_update').eq('status', 'pending').order('created_at', { ascending: false }).then(ok),
          sb.from('learned_rules').select('*').eq('client_id', C.clientId).eq('status', 'active').order('created_at', { ascending: false }).then(ok),
          sb.from('v_os_learning').select('*').eq('client_id', C.clientId).order('times', { ascending: false }).then(ok)
        ]);
        return { proposals, rules, stats };
      },
      async decideApproval(id, decision, text) { return ok(await sb.rpc('os_decide_approval', { p_approval: id, p_decision: decision, p_text: text || null })); },
      async retireRule(id) { return ok(await sb.rpc('os_retire_rule', { p_rule: id })); },
      async competitors() { return ok(await sb.from('competitor_posts').select('*').eq('client_id', C.clientId).order('momentum_score', { ascending: false, nullsFirst: false }).limit(60)); }
    };
  }

  function loadSupabase() {
    return new Promise((res, rej) => {
      if (window.supabase) return res();
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/dist/umd/supabase.js';
      s.onload = res; s.onerror = () => rej(new Error('Could not load the Supabase library. Check your connection and reload.'));
      document.head.appendChild(s);
    });
  }

  window.OS_DATA = {
    async init() {
      if (C.mode === 'live' && C.supabaseKey && !/PASTE_/.test(C.supabaseKey)) { await loadSupabase(); return liveStore(); }
      return demoStore();
    }
  };
})();

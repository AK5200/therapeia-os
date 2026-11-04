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
    const ago = h => new Date(now - h * 36e5).toISOString();
    const demoIns = [
      { id: 'i1', post: { platform: 'instagram', handle: 'cymbiotika', url: 'https://www.instagram.com/p/DAmple1/', format: 'Sidecar', likes: 8400, comments: 1900, outlier_x: 5.3, is_giveaway: true }, origin: 'competitor', type: 'post_idea', title: 'Partner giveaway with a sleep brand', why: 'A two-brand giveaway asked people to tag friends, so comments jumped to 5x the usual.', idea: 'Team up with a US sleep or tea brand for a "wind-down kit" giveaway with KSM-66.', source_label: '@cymbiotika · instagram · 5.3x usual · giveaway', source_url: 'https://www.instagram.com/cymbiotika/', source_country: 'US', gate: 'ok', status: 'new', score: 62, score_parts: { relevance: 48, performance: 70, format: 100 }, created_at: ago(5) },
      { id: 'i2', post: { platform: 'instagram', handle: 'seed', url: 'https://www.instagram.com/p/DAmple2/', format: 'Sidecar', likes: 14200, comments: 310, outlier_x: 19 }, origin: 'competitor', type: 'post_idea', title: 'Science story carousel', why: 'A calm, curious carousel about invisible soil microbes made people save and share it.', idea: 'A 6-slide "where shilajit comes from" story: rock, altitude, centuries, lab testing.', source_label: '@seed · instagram · 19x usual · science_story', source_url: 'https://www.instagram.com/seed/', source_country: 'US', gate: 'ok', status: 'new', score: 84, score_parts: { relevance: 78, performance: 95, format: 100 }, created_at: ago(9) },
      { id: 'i3', post: { platform: 'youtube', handle: 'therapeiazoi', url: 'https://www.youtube.com/shorts/abcdefghijk', format: 'Shorts', views: 1246, outlier_x: 10 }, origin: 'own', type: 'own_win', title: 'Our 7-Day Reset Short beat our usual', why: 'A clear challenge with a start date gave people a reason to watch to the end.', idea: 'Repeat as a 7-day carousel series, one tip per day.', source_label: '@therapeiazoi · youtube · 10x usual', source_url: 'https://www.youtube.com/@therapeiazoi', source_country: 'US', gate: 'ok', status: 'new', score: 71, score_parts: { relevance: 66, performance: 66, format: 45 }, created_at: ago(20) },
      { id: 'i4', post: { platform: 'instagram', handle: 'kapiva_official', url: 'https://www.instagram.com/reel/DAmple4/', format: 'Video', likes: 9100, comments: 220, outlier_x: 8 }, origin: 'competitor', type: 'post_idea', title: 'Dhanteras gold offer', why: 'Festival offer tied to buying gold for luck.', idea: 'Festival bundle.', source_label: '@kapiva_official · instagram · 8x usual · offer_sale', source_url: 'https://www.instagram.com/kapiva_official/', source_country: 'IN', occasion: 'Dhanteras', gate: 'blocked_occasion', gate_reason: '"Dhanteras" is not a US occasion', status: 'new', score: 41, created_at: ago(30) },
      { id: 'n1', origin: 'news', type: 'risk_alert', title: 'Shilajit brand recalled for high lead', why: 'Buyers will ask if our shilajit is tested.', idea: 'Post our third-party lab results and how to read them.', source_label: 'FDA recalls', source_url: 'https://www.fda.gov/safety/recalls-market-withdrawals-safety-alerts', source_country: 'US', gate: 'ok', status: 'new', score: 9, created_at: ago(3) },
      { id: 'n2', origin: 'news', type: 'post_idea', title: 'New sleep study on ashwagandha', why: 'Fresh, neutral science people are searching for.', idea: '"What the new study says" carousel, education only, no claims.', source_label: 'PubMed', source_url: 'https://pubmed.ncbi.nlm.nih.gov/', gate: 'ok', status: 'new', score: 8, created_at: ago(6) },
      { id: 'n3', origin: 'news', type: 'heads_up', title: 'Competitor launches in a big retailer', why: 'Retail launches raise the whole category in shoppers\' minds.', idea: '', source_label: 'Google News · competitors', source_url: 'https://news.google.com/', source_country: 'US', gate: 'ok', status: 'new', score: 7, created_at: ago(12) }];
    demoIns.push({ id: 'i5', post: { platform: 'tiktok', handle: 'ritual', url: 'https://www.tiktok.com/@ritual/video/7300000000000000001', format: 'Video', views: 412000, outlier_x: 39.4, likes: 38000 }, origin: 'competitor', type: 'post_idea', title: 'Iron absorption explained by a dietitian', why: 'A calm expert answered one question people actually ask, so it was shared and saved.', idea: 'A 5-slide carousel: the question, 3 plain-English points, one source. No claims.', source_label: '@ritual · tiktok · 9.4x usual · education', source_url: 'https://www.tiktok.com/@ritual', source_country: 'US', gate: 'ok', status: 'new', score: 76, score_parts: { relevance: 85, performance: 72, format: 45 }, created_at: ago(14) });
    // v2 fields for the demo: 1-10 score, lane, visual read, stored slides
    const imgs = (window.OS_DEMO_POSTS || []).flatMap(p => p.ig_slides || []);
    const V = (sl, v, vf) => ({ V: v, Vf: vf, palette: ['#F2E6D0', '#1F3A2E', '#C8A86B'], type: 'bold condensed sans headline, light body', layout: 'big headline top, product bottom-right', text_density: 'medium', hook: 'a 6-word myth in huge type', adapt: 'Same big-type myth hook in deep teal on cream, gold accent line, Instrument Sans.', slides: sl });
    Object.assign(demoIns.find(x => x.id === 'i1'), { lane: 'headsup', type: 'heads_up', score10: 3, idea: 'A two-brand wind-down kit giveaway worked; worth doing once we have a partner brand.', deps: ['partner_giveaway'], visual: V(imgs.slice(0, 2), 7, 5), visual_score: 6.2 });
    Object.assign(demoIns.find(x => x.id === 'i2'), { score10: 9.1, status: 'accepted', auto_approved: true, mechanic: '6-slide story carousel; slide 1 = 7-word curiosity statement; one fact per slide; last slide = save CTA', score_parts: { R: 9, F: 9, P: 10, S: 8, C: 9, N: 8, T: 5, caps: [] }, visual: V(imgs.slice(2, 5), 8, 8), visual_score: 8 });
    Object.assign(demoIns.find(x => x.id === 'i3'), { score10: 7.2, score_parts: { R: 8, F: 6, P: 7, S: 7, C: 9, N: 6, T: 5, caps: [] } });
    Object.assign(demoIns.find(x => x.id === 'i5'), { score10: 7.8, mechanic: 'Expert answers one common question in 3 points', score_parts: { R: 7, F: 8, P: 10, S: 8, C: 8, N: 7, T: 5, caps: [] }, visual: V(imgs.slice(5, 6), 6, 4), visual_score: 5.2 });
    demoIns.push({ id: 'i6', post: { platform: 'instagram', handle: 'ashwa.daily', url: 'https://www.instagram.com/p/DAmple6/', format: 'Sidecar', likes: 2300, comments: 140, outlier_x: 2.6, tier: 'winner', source: 'hashtag', slide_count: 8 }, origin: 'competitor', type: 'post_idea', title: 'How to read an ashwagandha label', why: 'A save-worthy checklist people bookmark before buying.', idea: '8-slide reference carousel: root vs leaf, % withanolides, KSM-66, third-party testing.', mechanic: '8-slide reference checklist; one check per slide; save CTA', source_label: '@ashwa.daily · instagram · 2.6x usual · winner · niche', source_url: 'https://www.instagram.com/', source_country: 'XX', gate: 'ok', status: 'new', score10: 8.6, score_parts: { R: 10, F: 9, P: 8, S: 9, C: 8, N: 9, T: 5, caps: [] }, visual: V(imgs.slice(6, 9), 7, 6), visual_score: 6.6, created_at: ago(8) });
    const demoAcc = [['cymbiotika', 'instagram', 'US', 'direct', 566626], ['healf', 'instagram', 'GB', 'direct', 416907], ['kapiva_official', 'instagram', 'IN', 'direct', 815000], ['bloomsupps', 'instagram', 'US', 'adjacent', 800322], ['ritual', 'tiktok', 'US', 'adjacent', 167700], ['thenue_co', 'instagram', 'GB', 'inspiration', 100000], ['therapeiazoi', 'youtube', 'US', 'own', 20]].map(([handle, platform, country, tier, followers], i) => ({ id: 'a' + i, handle, platform, country, tier, followers, active: true }));
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
      async insights(origins) { return demoIns.filter(x => origins.includes(x.origin)).map(x => ({ ...x })); },
      async setInsight(id, st) { const x = demoIns.find(i => i.id === id); if (x) x.status = st; },
      async watchAccounts() { return demoAcc.map(a => ({ ...a })); },
      async toggleAccount(id, on) { const a = demoAcc.find(x => x.id === id); if (a) a.active = on; },
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
      async insights(origins) {
        const since = d => new Date(Date.now() - d * 864e5).toISOString();
        const rows = ok(await sb.from('insights').select('*').eq('client_id', C.clientId).in('origin', origins).order('created_at', { ascending: false }).limit(200))
          .filter(r => ['accepted', 'used'].includes(r.status) || r.created_at > since(r.origin === 'news' ? 20 : 10));
        const ids = [...new Set(rows.map(r => r.ref_post).filter(Boolean))];
        if (!ids.length) return rows;
        const posts = ok(await sb.from('watch_posts').select('id,platform,handle,url,format,likes,comments,views,shares,outlier_x,is_giveaway,posted_at,tier,slide_count,source,niche').in('id', ids));
        const by = Object.fromEntries(posts.map(p => [p.id, p]));
        return rows.map(r => ({ ...r, post: by[r.ref_post] || null }));
      },
      async setInsight(id, st) { return ok(await sb.rpc('os_set_insight', { p_id: id, p_status: st })); },
      async watchAccounts() { return ok(await sb.from('watch_accounts').select('*').eq('client_id', C.clientId).order('platform').order('tier').order('handle')); },
      async toggleAccount(id, on) { return ok(await sb.rpc('os_toggle_account', { p_id: id, p_active: on })); },
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

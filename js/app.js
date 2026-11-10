/* Therapeia Zoi OS — app shell, router and screens (plain JS, no build step).
   Six tabs: Today · Approve · Plan (upcoming + posted) · News · Rivals · More. Every post opens in the same sheet. */
(function () {
  const C = window.OS_CONFIG, MODS = window.OS_MODULES || [];
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const S = { db: null, user: null, posts: [], settings: null, i: 0, pf: 'ig', sheet: null, sheetPf: 'ig', postedFilter: 'upcoming', fmt: 'all', busy: false };

  const STAGE = { awareness: 'Awareness', trust: 'Trust', conversion: 'Conversion', retention: 'Retention' };
  const STATUS = { in_review: ['Needs review', 'warn'], changes_requested: ['AI is revising', 'info'], scheduled: ['Scheduled', 'ok'],
    publishing: ['Posting', 'info'], published: ['Posted', 'ok'], rejected: ['Rejected', ''], failed: ['Failed', 'bad'] };
  const PLATS = [['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['youtube', 'YouTube Shorts']];
  const ICON = {
    today: '<path d="M4 11.5 12 5l8 6.5V20H4z"/><path d="M10 20v-5h4v5"/>',
    review: '<rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="m9 12 2 2 4-4"/>',
    plan: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    posted: '<path d="M5 12.5 10 17l9-10"/>',
    news: '<path d="M5 5h11v14H7a2 2 0 0 1-2-2z"/><path d="M16 9h3v8a2 2 0 0 1-2 2M8.5 9h4M8.5 12.5h4M8.5 16h2"/>',
    competitors: '<path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="2.6"/>',
    more: '<circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/>',
    prev: '<path d="M15 5l-7 7 7 7"/>', next: '<path d="M9 5l7 7-7 7"/>', chev: '<path d="M9 6l6 6-6 6"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>'
  };
  const ic = (n, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[n] || ''}</svg>`;

  // ---------- time ----------
  const fmt = (iso, o) => iso ? new Date(iso).toLocaleString('en-US', o) : '';
  const when = iso => fmt(iso, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const timeOnly = iso => fmt(iso, { hour: 'numeric', minute: '2-digit' });
  const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
  const toLocalInput = iso => { if (!iso) return ''; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const fromLocalInput = v => v ? new Date(v).toISOString() : null;

  // ---------- data helpers ----------
  const byStatus = s => S.posts.filter(p => p.status === s);
  const queue = () => byStatus('in_review').sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const scheduled = () => byStatus('scheduled').sort((a, b) => new Date(a.scheduled_for) - new Date(b.scheduled_for));
  const enabledPlats = () => PLATS.filter(([k]) => S.settings.platforms && S.settings.platforms[k]);
  const manual = () => S.settings.publish_mode !== 'auto';
  const titleOf = p => { const c = String(p.caption_instagram || '').split('\n').find(l => l.trim()) || p.angle || 'Untitled post'; return c.length > 80 ? c.slice(0, 78) + '…' : c; };
  const ytTitle = p => { const l = titleOf(p); return l.length > 95 ? l.slice(0, 94) + '…' : l; };
  const kind = p => p.format === 'carousel' ? `${(p.ig_slides || []).length}-slide carousel` : 'Single image';
  const thumb = p => p.images_removed ? '<span class="thumb gone" aria-label="Image removed"></span>' : `<img class="thumb" src="${esc((p.ig_slides || [])[0] || '')}" alt="" loading="lazy">`;
  const pill = s => { const [t, k] = STATUS[s] || [s, '']; return `<span class="pill ${k}">${esc(t)}</span>`; };

  // ---------- toast + actions ----------
  function toast(msg, kindc = '') {
    const t = document.createElement('div'); t.className = `toast ${kindc}`; t.setAttribute('role', 'status'); t.textContent = msg;
    $('#toasts').appendChild(t); setTimeout(() => t.classList.add('out'), 2600); setTimeout(() => t.remove(), 3000);
  }
  async function act(fn, okMsg, after) {
    if (S.busy) return; S.busy = true; document.body.classList.add('busy');
    try { await fn(); if (okMsg) toast(okMsg); S.posts = await S.db.posts(); if (after) after(); render(); }
    catch (e) { toast(e.message || String(e), 'bad'); }
    finally { S.busy = false; document.body.classList.remove('busy'); }
  }

  // ---------- routes ----------
  // tabs + sub pages (sub pages live under More and show a back arrow)
  const TABS = [['today', 'Today'], ['review', 'Approve'], ['plan', 'Plan'], ['news', 'News'], ['competitors', 'Rivals'], ['more', 'More']];
  const SUB = { credits: 'Accounts & credits', learning: 'AI learning', setup: 'Posting settings', analytics: 'Analytics', creators: 'Creator outreach', store: 'Store & funnel', customers: 'Customer success' };
  const route = () => { let h = (location.hash || '#today').slice(1); if (h === 'research') h = 'news'; if (h === 'posted') { S.postedFilter = 'posted'; h = 'plan'; } return TABS.some(t => t[0] === h) || SUB[h] ? h : 'today'; };
  const tabOf = r => SUB[r] ? 'more' : r;

  function renderChrome(r) {
    const waiting = queue().length;
    const learnBadge = S.learnPending || 0;
    $('#tabs').innerHTML = `<div class="rail-brand"><span class="brandmark"><img src="${esc(C.brand.logo)}" alt=""></span><span>${esc(C.brand.name)}<small>Growth OS</small></span></div>`
      + TABS.map(([k, l]) => {
        const n = k === 'review' ? waiting : k === 'more' ? learnBadge : 0;
        return `<a class="tab" href="#${k}" ${tabOf(r) === k ? 'aria-current="page"' : ''}>${ic(k)}<span>${l}</span>${n ? `<span class="dot">${n}</span>` : ''}</a>`;
      }).join('')
      + (C.credit === false ? '' : `<a class="credit" href="https://saltpilot.com" target="_blank" rel="noopener">Powered by <b>Saltpilot</b></a>`);
    $('#title').textContent = SUB[r] || ({ today: C.brand.name, review: 'Approve', plan: 'Plan', news: 'News', competitors: 'Competitors', more: 'More' })[r];
    $('#back').hidden = !SUB[r]; $('#brandmark').hidden = !!SUB[r] || r !== 'today';
    document.title = `${SUB[r] || TABS.find(t => t[0] === r)[1]} · ${C.brand.name}`;
    $('#view').classList.toggle('wide', r === 'plan' || r === 'competitors' || r === 'news');
  }

  function render() {
    const r = route();
    renderChrome(r);
    const v = $('#view');
    const out = ({ today: todayPlus, review, plan, more, credits, learning, setup, analytics, competitors, news: research, creators: soon, store: soon, customers: soon })[r](r);
    const done = h => { v.innerHTML = h; wire(v); renderSheet(); };
    if (out && out.then) out.then(done); else done(out);
  }

  // ---------- post preview ----------
  function preview(p, pf) {
    const slides = p.images_removed ? [] : pf === 'ig' ? (p.ig_slides || []) : (p.tt_slides || []);
    const n = slides.length;
    if (p.images_removed) return `<p class="note">The images of this post were removed ${'60 days after it finished'} to keep storage free. The caption and results are kept.</p>`;
    const imgs = slides.map((u, i) => `<img src="${esc(u)}" alt="${esc(i === 0 ? p.alt_text || '' : 'Slide ' + (i + 1))}" draggable="false">`).join('');
    const nav = n > 1 ? `<button class="cnav prev" type="button" aria-label="Previous slide" hidden>${ic('prev')}</button><button class="cnav next" type="button" aria-label="Next slide">${ic('next')}</button><span class="cbadge">1/${n}</span>` : '';
    const media = `<div class="media" data-n="${n}" data-i="0" tabindex="0" aria-label="${n} slide${n > 1 ? 's' : ''}"><div class="track">${imgs}</div>${nav}</div>`;
    const cap = s => esc(s).replace(/(#[\w]+)/g, '<span class="tag">$1</span>');
    if (pf === 'yt') return `<div class="tt">${media}<span class="yt-badge">Shorts</span><div class="tt-foot"><b>${esc(ytTitle(p))}</b><div class="cap">@${esc(C.brand.handle)}</div></div></div>`;
    if (pf === 'tt') return `<div class="tt">${media}<div class="tt-foot"><b>@${esc(C.brand.handle)}</b><div class="cap">${cap(p.caption_tiktok)}</div></div></div>`;
    return `<div class="ig"><div class="ig-head"><span class="av"><img src="${esc(C.brand.logo)}" alt=""></span><b>${esc(C.brand.handle)}</b></div>${media}<div class="ig-cap"><b>${esc(C.brand.handle)}</b> ${cap(p.caption_instagram)}</div></div>`;
  }
  const pfSwitch = (cur, attr) => `<div class="seg" role="group" aria-label="Preview">${[['ig', 'Instagram'], ['tt', 'TikTok'], ['yt', 'YouTube']].filter(([k]) => k !== 'yt' || (S.settings.platforms || {}).youtube).map(([k, l]) => `<button type="button" ${attr}="${k}" aria-pressed="${cur === k}">${l}</button>`).join('')}</div>`;
  function checks(p) {
    const c = p.critic_verdict === 'pass', k = p.compliance_verdict === 'pass' && !p.compliance_flagged;
    return `<div class="checks"><span class="pill ${c ? 'ok' : 'warn'}">${c ? 'Design checked' : 'Design: ' + esc(p.critic_verdict || 'not checked')}</span><span class="pill ${k ? 'ok' : 'warn'}">${k ? 'Claims checked' : 'Claims: ' + esc(p.compliance_verdict || 'not checked')}</span><span class="pill">${STAGE[p.funnel_stage] || ''}</span><span class="pill">${kind(p)}</span></div>`;
  }
  function noteBox(p) {
    if (!p.review_note) return '';
    const ai = /^AI: /.test(p.review_note);
    return `<p class="note ${ai ? 'ai' : ''}"><b>${ai ? 'Reply from the AI:' : 'Your note:'}</b> ${esc(p.review_note.replace(/^AI: /, ''))}</p>`;
  }

  // ---------- TODAY ----------
  function today(x = {}) {
    const q = queue(), sch = scheduled(), now = Date.now();
    const due = sch.filter(p => new Date(p.scheduled_for) <= now + 864e5 && sameDay(p.scheduled_for, now) || new Date(p.scheduled_for) <= now);
    const revising = byStatus('changes_requested');
    const failed = byStatus('failed').filter(p => p.approved_at);
    const next = sch.filter(p => !due.includes(p)).slice(0, 3);
    const hero = q.length
      ? `<section class="hero-decide"><div class="stack">${q.slice(0, 4).map(p => `<img src="${esc((p.ig_slides || [])[0] || '')}" alt="">`).join('')}</div>
          <h2>${q.length} post${q.length > 1 ? 's' : ''} need${q.length > 1 ? '' : 's'} your decision</h2>
          <p>Approve, ask for changes or reject. It takes a few seconds each.</p>
          <a class="btn primary block" href="#review">Start approving</a></section>`
      : `<section class="hero-calm"><h2>You're all caught up</h2><p>New posts appear here as soon as the AI finishes them.${sch.length ? ` Next one goes out ${when(sch[0].scheduled_for)}.` : ''}</p></section>`;
    const row = (p, sub) => `<li><button class="rowlink" type="button" data-open="${p.id}">${thumb(p)}<span class="rt"><b>${esc(titleOf(p))}</b><small>${sub}</small></span>${ic('chev', 'ic chev')}</button></li>`;
    return `${svcBanner()}${hero}
      ${x.risks || ''}
      ${due.length && manual() ? `<section class="sec"><h2>Post today</h2><p class="lead small">Auto-posting is off. Open a post to copy the caption, save the images and tick each platform when it's up.</p>
        <ul class="list">${due.map(p => { const r = p.publish_results || {}; const left = enabledPlats().filter(([k]) => !(r[k] && r[k].status === 'published')).map(x => x[1]); return row(p, `${timeOnly(p.scheduled_for)} · ${left.length ? 'Still to post: ' + left.join(', ') : 'All posted'}`); }).join('')}</ul></section>` : ''}
      ${failed.length ? `<section class="sec"><h2>Didn't post</h2><ul class="list">${failed.map(p => row(p, 'Tap to retry')).join('')}</ul></section>` : ''}
      ${revising.length ? `<section class="sec"><h2>With the AI</h2><p class="lead small">These come back to Review when the changes are done.</p><ul class="list">${revising.map(p => row(p, 'Applying your note')).join('')}</ul></section>` : ''}
      ${x.ideas || ''}${x.news || ''}
      <section class="sec"><h2>Coming up</h2>${next.length ? `<ul class="list">${next.map(p => row(p, when(p.scheduled_for))).join('')}</ul>` : `<p class="lead small">Nothing scheduled yet. Approved posts take the next free slot.</p>`}</section>`;
  }

  // ---------- REVIEW (one post at a time) ----------
  function review() {
    const q = queue();
    if (!q.length) return `<div class="empty"><h3>Nothing to review</h3><p>Every post has a decision. New ones appear here after the AI and the design check finish them.</p><a class="btn" href="#plan">See the plan</a></div>`;
    S.i = Math.min(Math.max(0, S.i), q.length - 1);
    const p = q[S.i];
    return `<div class="review-head"><span class="counter">Post ${S.i + 1} of ${q.length}</span>
        <span class="stepper"><button type="button" data-step="-1" aria-label="Previous post" ${S.i === 0 ? 'disabled' : ''}>${ic('prev')}</button><button type="button" data-step="1" aria-label="Next post" ${S.i >= q.length - 1 ? 'disabled' : ''}>${ic('next')}</button></span></div>
      <article class="post ${S.entered === p.id ? '' : 'enter'}" data-id="${p.id}">
        ${pfSwitch(S.pf, 'data-pf')}
        ${preview(p, S.pf)}
        ${checks(p)}
        ${noteBox(p)}
        ${p.auto_approve_at ? `<p class="note">Trust mode approves this ${when(p.auto_approve_at)} unless you decide first.</p>` : ''}
        <details class="more"><summary>Captions and posting time</summary>
          <div class="field"><label for="f-when">Post on <small>(leave empty for the next free slot)</small></label><input id="f-when" type="datetime-local"></div>
          <div class="field"><label for="f-ig">Instagram caption</label><textarea id="f-ig" rows="7">${esc(p.caption_instagram)}</textarea></div>
          <div class="field"><label for="f-tt">TikTok caption</label><textarea id="f-tt" rows="4">${esc(p.caption_tiktok)}</textarea></div>
          <button class="btn sm" type="button" data-do="captions" data-id="${p.id}">Save captions</button>
        </details>
        <div class="decide" role="group" aria-label="Decision">
          <button class="btn danger" type="button" data-do="reject" data-id="${p.id}">Reject</button>
          <button class="btn" type="button" data-do="changes" data-id="${p.id}">Changes</button>
          <button class="btn primary" type="button" data-do="approve" data-id="${p.id}">Approve</button>
        </div>
      </article>`;
  }

  // ---------- PLAN (upcoming agenda + posted history, one tab) ----------
  function plan() {
    const F = { upcoming: ['Upcoming', p => ['scheduled', 'publishing'].includes(p.status)], calendar: ['Calendar', null], posted: ['Posted', p => p.status === 'published'], failed: ['Didn\'t post', p => p.status === 'failed'], rejected: ['Rejected', p => p.status === 'rejected'] };
    if (!F[S.postedFilter]) S.postedFilter = 'upcoming';
    const chips = `<div class="chips" role="group" aria-label="Show">${Object.entries(F).map(([k, [l, f]]) => `<button type="button" data-filter="${k}" aria-pressed="${S.postedFilter === k}">${l}${f ? ` (${S.posts.filter(f).length})` : ''}</button>`).join('')}</div>`;
    return chips + (S.postedFilter === 'upcoming' ? agenda() : S.postedFilter === 'calendar' ? calendar() : history(F[S.postedFilter][1]));
  }
  // Month calendar: everything posted, scheduled or failed, by day
  function calendar() {
    const base = S.calMonth ? new Date(S.calMonth) : new Date(); base.setDate(1); base.setHours(0, 0, 0, 0);
    const dayOf = p => p.status === 'published' ? (p.published_at || p.scheduled_for) : p.scheduled_for;
    const items = S.posts.filter(p => ['scheduled', 'publishing', 'published', 'failed'].includes(p.status) && dayOf(p));
    const key = d => { const x = new Date(d); return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`; };
    const by = {}; items.forEach(p => (by[key(dayOf(p))] ||= []).push(p));
    const start = new Date(base); start.setDate(1 - ((base.getDay() + 6) % 7));
    const todayK = key(new Date()), sel = S.calDay || todayK;
    const cells = [...Array(42)].map((_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
    const last = cells.slice(35).every(d => d.getMonth() !== base.getMonth()) ? 35 : 42;
    const cell = d => { const k = key(d), ps = by[k] || [];
      return `<button type="button" class="cal-d ${d.getMonth() !== base.getMonth() ? 'out' : ''} ${k === todayK ? 'now' : ''} ${k === sel ? 'sel' : ''}" data-cday="${k}" data-cone="${ps.length === 1 ? ps[0].id : ''}" aria-label="${d.toDateString()}, ${ps.length} posts">
        <span class="n">${d.getDate()}</span><span class="cal-th">${ps.slice(0, 2).map(p => `<img src="${esc((p.ig_slides || [])[0] || '')}" alt="" loading="lazy" class="${p.status}">`).join('')}${ps.length > 2 ? `<i>+${ps.length - 2}</i>` : ''}</span></button>`; };
    const list = by[sel] || [];
    const lab = { published: ['Posted', 'ok'], scheduled: ['Scheduled', 'info'], publishing: ['Posting', 'info'], failed: ['Didn\'t post', 'bad'] };
    return `<div class="cal"><div class="cal-head"><button class="stepbtn" type="button" data-cmon="-1" aria-label="Previous month">${ic('prev')}</button><b>${base.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</b><button class="stepbtn" type="button" data-cmon="1" aria-label="Next month">${ic('next')}</button></div>
      <div class="cal-grid">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(w => `<span class="cal-w">${w}</span>`).join('')}${cells.slice(0, last).map(cell).join('')}</div>
      <p class="cal-key"><span class="k published"></span>Posted <span class="k scheduled"></span>Scheduled <span class="k failed"></span>Didn't post</p></div>
      <section class="sec"><h2>${new Date(+sel.split('-')[0], +sel.split('-')[1], +sel.split('-')[2]).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
      ${list.length ? `<ul class="list">${list.map(p => `<li><button class="rowlink" type="button" data-open="${p.id}">${thumb(p)}<span class="rt"><b>${esc(titleOf(p))}</b><small>${timeOnly(dayOf(p))} · ${kind(p)}</small></span><span class="pill ${lab[p.status][1]}">${lab[p.status][0]}</span>${ic('chev', 'ic chev')}</button></li>`).join('')}</ul>` : '<p class="lead small">Nothing on this day.</p>'}</section>`;
  }
  function agenda() {
    const sch = S.posts.filter(p => ['scheduled', 'publishing', 'published'].includes(p.status) && p.scheduled_for);
    const days = [...Array(14)].map((_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i); return d; });
    const label = (d, i) => i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    return `<p class="lead">Approved posts fill the next free slot (${esc((S.settings.post_times || ['09:00']).join(', '))} ${esc(C.brand.tzLabel)}). Tap a post to move it or change it.</p>
      ${(() => { const out = []; let free = [];
        const flush = () => { if (!free.length) return; const a = free[0], b = free[free.length - 1];
          const f = d => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          out.push(`<div class="freeslot">${free.length === 1 ? 'Nothing on ' + f(a.d) : `Nothing from ${f(a.d)} to ${f(b.d)}`}</div>`); free = []; };
        days.forEach((d, i) => { const items = sch.filter(p => sameDay(p.scheduled_for, d)).sort((a, b) => new Date(a.scheduled_for) - new Date(b.scheduled_for));
          if (!items.length && i > 0) { free.push({ d }); return; }
          flush();
          out.push(`<section class="day ${i === 0 ? 'today' : ''}"><h3>${label(d, i)}</h3>${items.length ? `<ul class="list">${items.map(p => `<li><button class="rowlink" type="button" data-open="${p.id}">${thumb(p)}<span class="rt"><b>${esc(titleOf(p))}</b><small>${timeOnly(p.scheduled_for)} · ${kind(p)}</small></span>${p.status === 'published' ? pill('published') : ''}${ic('chev', 'ic chev')}</button></li>`).join('')}</ul>` : `<div class="freeslot">Nothing today</div>`}</section>`); });
        flush(); return out.join(''); })()}`;
  }
  function history(test) {
    const list = S.posts.filter(test).sort((a, b) => new Date(b.published_at || b.updated_at || b.created_at) - new Date(a.published_at || a.updated_at || a.created_at));
    const plats = p => enabledPlats().map(([k, l]) => { const r = (p.publish_results || {})[k]; return r && r.status === 'published' ? l : null; }).filter(Boolean).join(', ');
    return list.length ? `<ul class="list">${list.map(p => `<li><button class="rowlink" type="button" data-open="${p.id}">${thumb(p)}<span class="rt"><b>${esc(titleOf(p))}</b><small>${p.status === 'published' ? `${fmt(p.published_at, { month: 'short', day: 'numeric' })} · ${plats(p) || 'Posted'}` : p.status === 'failed' ? 'Tap to retry' : esc(p.review_note || 'No reason given')}</small></span>${ic('chev', 'ic chev')}</button></li>`).join('')}</ul>`
      : `<div class="empty"><h3>${{ posted: 'Nothing posted yet', failed: 'Nothing failed', rejected: 'No rejected posts' }[S.postedFilter]}</h3><p>${S.postedFilter === 'posted' ? 'Posts show here once every platform is marked as posted.' : 'All good here.'}</p></div>`;
  }

  // ---------- MORE ----------
  function more() {
    const item = (href, t, sub, tag) => `<li><a class="rowlink" href="#${href}"><span class="rt"><b>${esc(t)}</b><small>${esc(sub)}</small></span>${tag || ''}${ic('chev', 'ic chev')}</a></li>`;
    const soonMods = MODS.filter(m => m.status === 'soon');
    const bad = svcAlerts();
    return `<section class="sec"><h2>Content</h2><ul class="list">
        ${item('credits', 'Accounts & credits', 'kie.ai credits, Anthropic balance, Supabase space', bad.length ? `<span class="pill ${bad.some(a => a.level === 'out') ? 'bad' : 'warn'}">${bad.length} need${bad.length > 1 ? '' : 's'} attention</span>` : '<span class="pill ok">OK</span>')}
        ${item('learning', 'AI learning', 'Rules the AI learned from your notes', S.learnPending ? `<span class="pill warn">${S.learnPending} to review</span>` : '')}
        ${item('setup', 'Posting settings', 'Auto-posting, times and platforms')}
        ${item('analytics', 'Analytics', 'How posts perform')}
      </ul></section>
      <section class="sec"><h2>Coming next</h2><ul class="list">${soonMods.map(m => item(m.id, m.label, m.kpi, '<span class="soon-tag">Soon</span>')).join('')}</ul></section>
      ${C.credit === false ? '' : '<a class="credit-m" href="https://saltpilot.com" target="_blank" rel="noopener">Powered by <b>Saltpilot</b></a>'}
      ${S.user && !S.user.open ? `<button class="btn quiet" type="button" id="signout">Sign out (${esc(S.user.email)})</button>` : ''}`;
  }

  // ---------- ACCOUNTS & CREDITS (kie.ai, Anthropic, Supabase) ----------
  const SVC = {
    kie: { name: 'kie.ai image credits', link: 'https://kie.ai', linkText: 'Top up on kie.ai', why: 'Makes every image. Checked live before each daily run.' },
    anthropic: { name: 'Anthropic (Claude) balance', link: 'https://console.anthropic.com/settings/billing', linkText: 'Top up in the Anthropic console', why: 'Writes, checks and plans every post. Estimated: the balance you enter below minus what each run spends (about $0.35 a post).' },
    supabase: { name: 'Supabase storage', link: 'https://supabase.com/dashboard/project/weshvnbovvzucjxymllc', linkText: 'Open Supabase', why: 'Stores posts and images. Images are removed 60 days after a post finishes, so the free plan should be enough.' }
  };
  // a service needs attention when it is low or out, or when it stopped a run in the last 2 days
  function svcAlerts() {
    const x = S.svc; if (!x) return [];
    const out = (x.status || []).filter(s => s.level === 'low' || s.level === 'out').map(s => ({ service: s.service, level: s.level, text: s.message }));
    (x.stops || []).forEach(st => { if (!out.some(a => a.service === st.service && a.level === 'out')) out.unshift({ service: st.service, level: 'out', text: String(st.note || 'A run was stopped').replace(/^Run stopped( before spending)?: /, 'A run was stopped: ') }); });
    return out;
  }
  function svcBanner() {
    const a = svcAlerts(); if (!a.length) return '';
    const out = a.some(x => x.level === 'out');
    return `<a class="svc-banner ${out ? 'out' : 'low'}" href="#credits"><b>${out ? 'Posting is stopped or about to stop' : 'Top up soon'}</b>${a.slice(0, 3).map(x => `<span>${esc(x.text)}</span>`).join('')}<small>Open Accounts & credits</small></a>`;
  }
  function credits() {
    const x = S.svc;
    if (!x) return `<div class="empty"><h3>No check yet</h3><p>The numbers appear after the next daily run checks kie.ai, Anthropic and Supabase.</p></div>`;
    const by = Object.fromEntries((x.status || []).map(s => [s.service, s]));
    const lvl = { ok: ['OK', 'ok'], low: ['Low', 'warn'], out: ['Out', 'bad'], unknown: ['Not tracked yet', ''] };
    const val = s => !s || s.balance == null ? '—' : s.unit === 'usd' ? `$${Number(s.balance).toFixed(2)}` : s.unit === 'pct_full' ? `${Math.round(s.balance)}% full` : `${Number(s.balance).toLocaleString('en-US')} credits`;
    const panel = k => { const s = by[k], m = SVC[k], d = (s && s.detail) || {}, [t, c] = lvl[(s && s.level) || 'unknown'];
      const extra = k === 'supabase' && d.plan ? `<p class="small muted">Database ${esc(d.db_used)} of ${esc(d.db_limit)} · Images ${esc(d.files_used)} of ${esc(d.files_limit)} · ${d.plan === 'pro' ? 'Pro' : 'Free'} plan</p>
          <div class="row-btns"><label class="small" for="sb-plan">Plan</label><select id="sb-plan" data-svcplan><option value="free" ${d.plan !== 'pro' ? 'selected' : ''}>Free (500 MB database, 1 GB images)</option><option value="pro" ${d.plan === 'pro' ? 'selected' : ''}>Pro, $25/month (8 GB, 100 GB)</option></select></div>`
        : k === 'anthropic' ? `<form class="row-btns" data-svcbal><div class="field" style="flex:1;min-width:0"><label for="anth-bal">Current balance in US$ <small>(from the Anthropic console, Billing)</small></label><input id="anth-bal" type="number" min="0" step="0.01" inputmode="decimal" placeholder="50.00"></div><button class="btn sm primary" type="submit">Save balance</button></form>
          ${d.entered != null ? `<p class="small muted">You entered $${Number(d.entered).toFixed(2)}${d.entered_at ? ' on ' + esc(fmt(d.entered_at, { month: 'short', day: 'numeric' })) : ''}; runs since then used about $${Number(d.spent_since || 0).toFixed(2)}.</p>` : ''}` : '';
      return `<section class="panel"><h3>${esc(m.name)} <span class="pill ${c}">${t}</span></h3>
        <p class="svc-num">${val(s)}${s && s.days_left != null ? `<small>about ${Math.max(0, Math.round(s.days_left))} days left</small>` : ''}</p>
        <p class="small">${esc((s && s.message) || '')}</p><p class="small muted">${esc(m.why)}${s ? ` Checked ${esc(when(s.checked_at))}.` : ''}</p>
        ${extra}<a class="btn sm" href="${m.link}" target="_blank" rel="noopener">${m.linkText}</a></section>`; };
    return `<p class="lead">If kie.ai or Anthropic runs out, or storage is full, the daily run stops before it spends anything and a banner appears on Today.</p>
      ${(x.stops || []).length ? `<p class="note ai">${esc(x.stops[0].note)} (${esc(when(x.stops[0].created_at))})</p>` : ''}
      ${['kie', 'anthropic', 'supabase'].map(panel).join('')}`;
  }

  // ---------- AI LEARNING ----------
  async function learning() {
    let L; try { L = await S.db.learning(); } catch (e) { return `<div class="empty"><h3>Could not load</h3><p>${esc(e.message)}</p></div>`; }
    S.learnPending = L.proposals.length;
    const label = c => String(c).replace(/_/g, ' ').replace(/^./, m => m.toUpperCase());
    const max = Math.max(1, ...L.stats.map(x => +x.times));
    return `<p class="lead">Every "Changes" note is read by a small AI model, logged, and sent back through the full pipeline with all compliance rules. When you ask for the same thing 3 times in 30 days, the AI suggests a rule. Nothing changes until you save it.</p>
      ${L.proposals.map(a => `<section class="panel"><h3>${esc(a.title)}</h3><p class="small muted">${esc(a.summary || '')}. You wrote: ${(a.payload.notes || []).slice(0, 3).map(n => `“${esc(n)}”`).join(', ')}</p>
        <div class="field"><label for="rt-${a.id}">Rule for the ${a.payload.agent === 'art_director' ? 'images' : 'words'}</label><textarea id="rt-${a.id}" rows="3">${esc(a.payload.rule_text)}</textarea></div>
        <div class="row-btns"><button class="btn primary" type="button" data-rule="${a.id}" data-d="approve">Save rule</button><button class="btn quiet" type="button" data-rule="${a.id}" data-d="reject">Dismiss</button></div></section>`).join('')}
      <section class="sec"><h2>Rules the AI follows</h2>${L.rules.length ? `<ul class="list">${L.rules.map(r => `<li class="rowlink"><span class="rt"><b style="white-space:normal">${esc(r.rule_text)}</b><small>${label(r.category)} · since ${fmt(r.created_at, { month: 'short', day: 'numeric' })}</small></span><button class="btn sm quiet danger" type="button" data-retire="${r.id}">Turn off</button></li>`).join('')}</ul>` : '<p class="lead small">No rules yet.</p>'}</section>
      <section class="sec"><h2>What you ask for most</h2>${L.stats.length ? `<ul class="bars">${L.stats.map(x => `<li><span>${esc(label(x.category))}</span><i style="--w:${Math.round(100 * x.times / max)}%"></i><b>${x.times}</b></li>`).join('')}</ul>` : '<p class="lead small">Nothing yet. Every change request is counted here.</p>'}</section>`;
  }

  // ---------- SETTINGS ----------
  function setup() {
    const s = S.settings;
    const radio = (name, v, l, d) => `<label class="radio"><input type="radio" name="${name}" value="${v}" ${s[name] === v || (name === 'publish_mode' && v === 'manual' && s.publish_mode !== 'auto') ? 'checked' : ''}><span><b>${l}</b><small>${d}</small></span></label>`;
    return `<form id="setform" class="sec">
      <fieldset><legend>How posts go out</legend>
        ${radio('publish_mode', 'manual', 'I post them myself', 'Approved posts wait for you. Post them, then tick each platform as posted.')}
        ${radio('publish_mode', 'auto', 'Post automatically with Blotato', 'Approved posts go out on their own at their time. Turn on only after Blotato is connected.')}</fieldset>
      <fieldset><legend>Approvals</legend>
        ${radio('auto_mode', 'manual', 'I approve every post', 'Nothing is scheduled without your OK.')}
        ${radio('auto_mode', 'trust', 'Approve passed posts automatically', `Posts that passed the design and claims checks are approved after ${s.trust_hours} hours unless you act first.`)}
        ${radio('auto_mode', 'paused', 'Pause everything', 'Nothing is scheduled or posted.')}</fieldset>
      <fieldset><legend>Daily posting times</legend>
        <div class="field"><label for="f-times">Times in ${esc(C.brand.tzLabel)} <small>(24h, comma separated)</small></label><input id="f-times" name="post_times" value="${esc((s.post_times || []).join(', '))}" inputmode="numeric" placeholder="09:00, 18:30"></div></fieldset>
      <fieldset><legend>Platforms</legend>
        ${PLATS.map(([k, l]) => `<label class="check"><input type="checkbox" name="pf_${k}" ${s.platforms && s.platforms[k] ? 'checked' : ''}> ${l}</label>`).join('')}</fieldset>
      <input type="hidden" name="trust_hours" value="${s.trust_hours}"><input type="hidden" name="provider" value="${esc(s.provider || 'blotato')}">
      <button class="btn primary block" type="submit">Save settings</button></form>`;
  }

  // ---------- ANALYTICS / COMPETITORS / SOON ----------
  function analytics() {
    const withM = S.posts.filter(p => p.metrics && Object.keys(p.metrics).length);
    if (!withM.length) return `<div class="empty"><h3>Numbers start after the first posts go live</h3><p>Reach, saves, shares and comments for every post, plus which hooks, looks and posting times work best.</p></div>`;
    return `<ul class="list">${withM.map(p => `<li class="rowlink">${thumb(p)}<span class="rt"><b>${esc(titleOf(p))}</b><small>${['reach', 'saves', 'shares', 'comments'].map(k => `${k} ${esc(p.metrics[k] ?? '–')}`).join(' · ')}</small></span></li>`).join('')}</ul>`;
  }
  // ---------- insights: competitor watch + news radar ----------
  const TYPE = { post_idea: ['Post idea', 'info'], heads_up: ['Heads-up', ''], risk_alert: ['Risk alert', 'bad'], own_win: ['Our post worked', 'ok'] };
  const GATE = { blocked_region: 'Not for the US', blocked_occasion: 'Not a US occasion', blocked_claim: 'Claim risk', blocked_season: 'Wrong season or too early' };
  const PNAME = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube' };
  const KI = {
    heart: '<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54z"/>',
    chat: '<path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/>',
    eye: '<path d="M12 4.5C7 4.5 2.7 7.6 1 12c1.7 4.4 6 7.5 11 7.5s9.3-3.1 11-7.5c-1.7-4.4-6-7.5-11-7.5zm0 12.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/>',
    check: '<path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/>',
    flame: '<path d="M12 2c1 4-3 5.5-3 9.5a3 3 0 0 0 6 0c0-1-.5-2-1-2.8 3 1.3 5 3.8 5 6.8a7 7 0 0 1-14 0c0-5 4-7.5 7-13.5z"/>',
    img: '<path d="M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4" fill="none" stroke="currentColor" stroke-width="2"/>',
    play: '<path d="M8 5v14l11-7z"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
  };
  const ki = n => `<svg class="ki" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">${KI[n]}</svg>`;
  const nx = n => { n = Number(n) || 0; return n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K' : String(n); };
  const isStill = f => /sidecar|image|slideshow|carousel|photo/i.test(f || '');
  const fmtName = (pl, f) => /sidecar|carousel/i.test(f || '') ? 'Carousel' : /slideshow/i.test(f || '') ? 'Slideshow' : /image|photo/i.test(f || '') ? 'Image' : pl === 'youtube' ? 'Short' : pl === 'instagram' ? 'Reel' : 'Video';
  const flag = c => c && c !== 'US' && c !== 'XX' ? c : '';
  const s10 = x => { const v = x.score10 != null ? Number(x.score10) : x.origin === 'news' ? Number(x.score) : Number(x.score) / 10; return Math.max(1, Math.min(10, Math.round((v || 1) * 10) / 10)); };
  const pct = x => s10(x) * 10;
  const tier = n => n >= 9 ? 'top' : n >= 8 ? 'hi' : n >= 6 ? 'mid' : 'lo';
  const ring = x => { const n = s10(x); return `<span class="ring ${tier(n)}" style="--p:${n * 10}" title="How good this is for Therapeia Zoi (1-10). 9+ = adapt almost directly."><b>${n.toFixed(1)}</b><small>/10</small></span>`; };
  const heat = m => `<span class="heat ${m >= 5 ? 't3' : m >= 2 ? 't2' : 't1'}">${ki('flame')}<b>${m.toFixed(m >= 10 ? 0 : 1)}x</b><small>usual</small></span>`;
  const stat = (cls, icon, n, label) => `<span class="stat ${cls}" title="${label}">${ki(icon)}<b>${nx(n)}</b></span>`;
  function embedUrl(post, full) {
    if (!post || !post.url) return null; const u = post.url; let m;
    if (post.platform === 'instagram' && (m = u.match(/instagram\.com\/(?:p|reel|reels|tv)\/([^/?#]+)/))) return { src: `https://www.instagram.com/p/${m[1]}/embed/`, h: full ? 640 : 520 };
    if (post.platform === 'tiktok' && (m = u.match(/\/video\/(\d+)/))) return { src: `https://www.tiktok.com/embed/v2/${m[1]}`, h: full ? 620 : 540 };
    if (post.platform === 'youtube' && (m = u.match(/(?:v=|\/shorts\/|youtu\.be\/)([\w-]{6,})/))) return { src: `https://www.youtube.com/embed/${m[1]}`, h: full ? 560 : 480 };
    return null;
  }
  const frame = (post, full) => { const em = embedUrl(post, full); return em ? `<div class="frame"><iframe src="${esc(em.src)}" style="height:${em.h}px" loading="lazy" allowfullscreen scrolling="no" title="Post preview"></iframe></div>` : ''; };
  // Slides saved to our storage by the workflow (fast, never expire). Falls back to the platform embed for older ideas.
  const slidesOf = x => ((x.visual && x.visual.slides) || []).filter(Boolean);
  function postMedia(x, full) {
    const sl = slidesOf(x), n = sl.length;
    if (!n) return frame(x.post, full);
    const nav = n > 1 ? `<button class="cnav prev" type="button" aria-label="Previous slide" hidden>${ic('prev')}</button><button class="cnav next" type="button" aria-label="Next slide">${ic('next')}</button><span class="cbadge">1/${x.post && x.post.slide_count > n ? x.post.slide_count : n}</span>` : '';
    return `<div class="media pm ${full ? 'full' : ''}" data-n="${n}" data-i="0" tabindex="0"><div class="track">${sl.map(u => `<img src="${esc(u)}" alt="" loading="lazy" draggable="false">`).join('')}</div>${nav}</div>`;
  }
  function meta(x) {
    const po = x.post, news = x.origin === 'news', sl = String(x.source_label || '').split(' · ');
    const handle = po ? po.handle : (!news && /^@/.test(sl[0]) ? sl[0].slice(1) : null);
    const plat = po ? po.platform : (sl[1] && PNAME[sl[1]] ? sl[1] : null);
    const mult = po ? Number(po.outlier_x) : ((/([\d.]+)x usual/.exec(x.source_label || '') || [])[1] * 1 || 0);
    return { po, news, handle, plat, mult,
      who: news ? esc(x.source_label || 'News') : '@' + esc(handle || ''),
      sub: [plat ? PNAME[plat] : (news ? 'News' : null), flag(x.source_country), fmt(x.created_at, { month: 'short', day: 'numeric' })].filter(Boolean).map(esc).join(' · ') };
  }
  function stats(x, m) {
    const b = [];
    if (!m.news && m.mult) b.push(heat(m.mult));
    if (m.po) {
      b.push(m.po.platform === 'instagram' ? stat('like', 'heart', m.po.likes, 'Likes') : stat('view', 'eye', m.po.views, 'Views'));
      if (m.po.platform === 'instagram' && m.po.comments) b.push(stat('chat', 'chat', m.po.comments, 'Comments'));
      if (m.po.platform === 'tiktok' && m.po.likes) b.push(stat('like', 'heart', m.po.likes, 'Likes'));
      b.push(isStill(m.po.format) ? `<span class="fmt still">${ki('img')}${fmtName(m.po.platform, m.po.format)}</span>` : `<span class="fmt video">${ki('play')}${fmtName(m.po.platform, m.po.format)} · adapt</span>`);
      if (m.po.is_giveaway) b.push(`<span class="fmt warn">Giveaway</span>`);
    }
    return b.length ? `<div class="stats">${b.join('')}</div>` : '';
  }
  const STATE = { accepted: ['In the queue', 'ok'], used: ['Made into a post', 'ok'], dismissed: ['Dismissed', ''] };
  const stateTag = x => x.auto_approved && x.status === 'accepted' ? `<span class="autotick">${ki('check')} Auto-approved · in the next content run</span>` : STATE[x.status] ? `<span class="pill ${STATE[x.status][1]}">${STATE[x.status][0]}</span>` : '';
  function insActs(x) {
    if (x.gate !== 'ok') return '';
    const headsup = x.lane === 'headsup' || x.type === 'risk_alert' || x.type === 'heads_up';
    if (x.status === 'new') return `<div class="row-acts"><button class="btn small primary" type="button" data-ins="${x.id}" data-st="accepted">${headsup ? 'Got it' : 'Add to queue'}</button><button class="btn small quiet" type="button" data-ins="${x.id}" data-st="dismissed">Dismiss</button></div>`;
    if (x.status === 'accepted' && !headsup) return `<div class="row-acts">${stateTag(x)}<button class="btn small quiet" type="button" data-ins="${x.id}" data-st="dismissed">${x.auto_approved ? 'Reject' : 'Remove'}</button></div>`;
    return stateTag(x);
  }
  function card(x, opts = {}) {
    const m = meta(x), [t, k] = TYPE[x.type] || [x.type, ''];
    const heads = x.lane === 'headsup';
    return `<article class="idea">
      <header class="idea-head"><span class="who"><b>${m.who}</b><small>${m.sub}${m.po && m.po.source && m.po.source !== 'account' ? ' · found by niche search' : ''}</small></span>${x.gate !== 'ok' || heads ? '' : ring(x)}</header>
      ${opts.media ? postMedia(x) : ''}
      ${stats(x, m)}
      ${x.gate !== 'ok' ? `<p class="note warn-note"><b>${esc(GATE[x.gate] || x.gate)}.</b> ${esc(x.gate_reason || '')}</p>` : ''}
      <button class="idea-body" type="button" data-iopen="${x.id}"><span class="tags"><span class="pill ${k}">${heads ? 'Move in your space' : t}</span>${x.visual_score ? `<span class="pill vis">Visual ${Number(x.visual_score).toFixed(1)}</span>` : ''}</span><h3>${esc(x.title)}</h3>
        ${x.why ? `<p class="one"><b>${m.news ? 'Why it matters' : 'Why it worked'}</b> ${esc(x.why)}</p>` : ''}${x.idea ? `<p class="one"><b>${heads ? 'For Deep' : 'For us'}</b> ${esc(x.idea)}</p>` : ''}<span class="more">Read the full breakdown</span></button>
      <div class="idea-foot">${opts.media && x.source_url ? `<a class="ext" href="${esc(x.source_url)}" target="_blank" rel="noopener">${ki('ext')} Open on ${esc(PNAME[m.plat] || 'the site')}</a>` : ''}${insActs(x)}</div></article>`;
  }
  // Short line for Home: "@brand did X and got 2.5x their usual"
  function moveRow(x) {
    const m = meta(x);
    return `<li><button class="rowlink move" type="button" data-iopen="${x.id}">${m.mult ? heat(m.mult) : ''}<span class="rt"><b style="white-space:normal">${m.who}: ${esc(x.title)}</b><small style="white-space:normal">${esc(x.idea || x.why || '')}</small></span>${ic('chev', 'ic chev')}</button></li>`;
  }
  // Full breakdown sheet for one idea
  function insSheet() {
    const x = (S.insCache || []).find(i => i.id === S.insSheet); if (!x) return null;
    const m = meta(x), [t, k] = TYPE[x.type] || [x.type, ''], sp = x.score_parts || {}, v = x.visual || {};
    const bar = (l, val, w) => `<li><span>${l} <small>${w}</small></span><i style="--w:${val * 10}%"></i><b>${Number(val).toFixed(val % 1 ? 1 : 0)}</b></li>`;
    const crit = sp.R != null ? `<section class="para"><h4>Why ${s10(x).toFixed(1)} / 10</h4><ul class="bars">${bar('Fits our products', sp.R, '25%')}${bar('Easy as image/carousel', sp.F, '20%')}${bar('Proven performance', sp.P, '15%')}${bar('Save/share potential', sp.S, '15%')}${bar('Compliance safe', sp.C, '10%')}${bar('New for us', sp.N, '10%')}${bar('Timely', sp.T, '5%')}</ul>
      ${(sp.caps || []).length ? `<p class="note warn-note"><b>Score capped:</b> ${esc(sp.caps.join('; '))}</p>` : ''}<p class="small muted">9+ means we can adapt it almost directly. 8+ with safe compliance is auto-approved into the next content run.</p></section>` : '';
    const vis = v.V != null ? `<section class="para"><h4>Visual ${Number(x.visual_score || 0).toFixed(1)} / 10 <small>craft ${v.V} · freshness ${v.Vf}</small></h4>
      ${(v.palette || []).length ? `<div class="swatches">${v.palette.map(c => `<span style="--c:${esc(c)}" title="${esc(c)}"></span>`).join('')}</div>` : ''}
      <dl class="vis-dl">${v.type ? `<dt>Type</dt><dd>${esc(v.type)}</dd>` : ''}${v.layout ? `<dt>Layout</dt><dd>${esc(v.layout)}${v.text_density ? ' · ' + esc(v.text_density) + ' text' : ''}</dd>` : ''}${v.hook ? `<dt>Scroll-stopper</dt><dd>${esc(v.hook)}</dd>` : ''}${v.adapt ? `<dt>For our designer</dt><dd>${esc(v.adapt)}</dd>` : ''}</dl></section>` : '';
    return `<div class="scrim" data-close></div><div class="sheet" role="dialog" aria-modal="true" aria-label="Idea">
      <div class="sheet-head"><h2><span class="pill ${k}">${x.lane === 'headsup' ? 'Move in your space' : t}</span></h2><button class="x" type="button" data-close aria-label="Close">${ic('x')}</button></div>
      <div class="sheet-body">
        <div class="idea-head"><span class="who"><b>${m.who}</b><small>${m.sub}</small></span>${x.gate !== 'ok' || x.lane === 'headsup' ? '' : ring(x)}</div>
        ${postMedia(x, true)}
        ${stats(x, m)}
        <h3 class="big">${esc(x.title)}</h3>
        ${x.gate !== 'ok' ? `<p class="note warn-note"><b>${esc(GATE[x.gate] || x.gate)}.</b> ${esc(x.gate_reason || '')}</p>` : ''}
        ${x.why ? `<section class="para"><h4>${m.news ? 'Why it matters' : 'Why it worked'}</h4><p>${esc(x.why)}</p></section>` : ''}
        ${x.mechanic ? `<section class="para"><h4>The template behind it</h4><p>${esc(x.mechanic)}</p></section>` : ''}
        ${x.idea ? `<section class="para us"><h4>${x.lane === 'headsup' ? 'For Deep' : 'Our version'}</h4><p>${esc(x.idea)}</p></section>` : ''}
        ${crit}${vis}
        ${x.source_url ? `<a class="btn block" href="${esc(x.source_url)}" target="_blank" rel="noopener">${ki('ext')} ${m.po ? 'Open on ' + esc(PNAME[m.po.platform] || 'the site') : 'Read the source'}</a>` : ''}
        ${insActs(x)}
        ${x.lane !== 'headsup' && x.status === 'new' && x.gate === 'ok' ? '<p class="small muted">Add to queue sends this to the next daily content run. The AI rewrites it in Therapeia Zoi\'s voice and rules, designs it, and it comes to Approve like any other post. Nothing is posted without you.</p>' : ''}
      </div></div>`;
  }
  const chips = (cur, opts, attr = 'data-tab') => `<div class="chips" role="group">${opts.map(([k, l]) => `<button type="button" ${attr}="${k}" aria-pressed="${cur === k}">${l}</button>`).join('')}</div>`;
  const remember = list => { const seen = new Map((S.insCache || []).map(i => [i.id, i])); list.forEach(i => seen.set(i.id, i)); S.insCache = [...seen.values()]; };
  async function competitors() {
    const tab = S.compTab || 'ideas';
    let all = [], acc = [];
    try { [all, acc] = await Promise.all([S.db.insights(['competitor', 'own']), tab === 'watch' ? S.db.watchAccounts() : []]); } catch (e) { return `<div class="empty"><h3>Could not load</h3><p>${esc(e.message)}</p></div>`; }
    remember(all);
    const live = all.filter(x => x.gate === 'ok' && x.status !== 'dismissed');
    const ideas = live.filter(x => x.lane !== 'headsup'), moves = live.filter(x => x.lane === 'headsup'), blocked = all.filter(x => x.gate !== 'ok');
    const stills = ideas.filter(x => x.post && isStill(x.post.format)).length, vids = ideas.filter(x => x.post && !isStill(x.post.format)).length;
    const queued = ideas.filter(x => x.status === 'accepted').length;
    const shown = ideas.filter(x => S.fmt === 'all' || !x.post || (S.fmt === 'still') === isStill(x.post.format)).sort((a, b) => s10(b) - s10(a));
    const empty = (h, p) => `<div class="empty"><h3>${h}</h3><p>${p}</p></div>`;
    let body;
    if (tab === 'watch') body = `<ul class="list">${acc.map(a => `<li><div class="rowlink"><span class="rt"><b>@${esc(a.handle)}</b><small>${esc(a.platform)} · ${esc(a.country)} · ${esc(a.tier)}${a.followers ? ' · ' + Number(a.followers).toLocaleString() + ' followers' : ''}${a.note ? ' · ' + esc(a.note) : ''}</small></span><button class="btn small quiet" data-acc="${a.id}" data-on="${!a.active}">${a.active ? 'Pause' : 'Resume'}</button></div></li>`).join('')}</ul><p class="note">Scanned every Monday, plus weekly searches for ashwagandha, shilajit, KSM-66, adaptogens and cortisol posts from anyone. Ideas older than 10 days drop off unless you queued them.</p>`;
    else if (tab === 'moves') body = moves.length ? `<div class="idea-grid">${moves.sort((a, b) => (b.post ? b.post.outlier_x : 0) - (a.post ? a.post.outlier_x : 0)).map(x => card(x, { media: true })).join('')}</div>` : empty('No big moves this week', 'Collabs, retail launches, sales and partner giveaways that worked for others show here. Good to know, but not something we post right away.');
    else if (tab === 'blocked') body = blocked.length ? `<div class="idea-grid">${blocked.map(x => card(x, { media: true })).join('')}</div>` : empty('Nothing filtered out', 'Posts tied to non-US festivals or needing health claims land here.');
    else body = shown.length ? `<div class="idea-grid">${shown.map(x => card(x, { media: true })).join('')}</div>` : empty('No ideas yet', 'Every Monday we scan the watch list and niche searches, find posts that beat their usual for their format, and score how well each fits us.');
    const best = ideas.length ? Math.max(...ideas.map(s10)) : 0;
    return (tab === 'ideas' && ideas.length ? `<div class="summary"><div><b>${ideas.length}</b><small>ideas</small></div><div><b>${queued}</b><small>in the queue</small></div><div><b>${best.toFixed(1)}</b><small>best score</small></div></div>` : '')
      + chips(tab, [['ideas', `Ideas (${ideas.length})`], ['moves', `Moves in your space (${moves.length})`], ['blocked', `Filtered (${blocked.length})`], ['watch', 'Watch list']])
      + (tab === 'ideas' ? chips(S.fmt, [['all', 'All formats'], ['still', `Images & carousels (${stills})`], ['video', `Videos (${vids})`]], 'data-fmt') + `<p class="lead small">Best score first. 9+ = adapt almost directly. 8+ goes into the next content run automatically, and you can still remove it.</p>` : '') + body;
  }
  async function research() {
    const tab = S.newsTab || 'all';
    let all = []; try { all = await S.db.insights(['news']); } catch (e) { return `<div class="empty"><h3>Could not load</h3><p>${esc(e.message)}</p></div>`; }
    remember(all);
    all = all.filter(x => x.status !== 'dismissed');
    const list = (tab === 'all' ? all : all.filter(x => x.type === tab)).sort((a, b) => s10(b) - s10(a));
    return chips(tab, [['all', 'All'], ['risk_alert', 'Risk alerts'], ['post_idea', 'Post ideas'], ['heads_up', 'Heads-up']]) +
      (list.length ? `<div class="idea-grid">${list.map(x => card(x)).join('')}</div>` : `<div class="empty"><h3>Nothing new</h3><p>Each morning we check Google News, PubMed, FDA, FTC, UK FSA, Reddit and clinical trials. News stays here for 20 days.</p></div>`);
  }
  async function todayPlus(r) {
    let top = []; try { top = (await S.db.insights(['competitor', 'own', 'news'])).filter(x => x.gate === 'ok' && ['new', 'accepted'].includes(x.status)); } catch (e) { return today(); }
    remember(top);
    const risks = top.filter(x => x.type === 'risk_alert' && x.status === 'new').slice(0, 2);
    const auto = top.filter(x => x.auto_approved && x.status === 'accepted');
    const ideas = top.filter(x => x.origin !== 'news' && x.lane !== 'headsup' && x.status === 'new').sort((a, b) => s10(b) - s10(a)).slice(0, 3);
    const moves = top.filter(x => x.lane === 'headsup' && x.status === 'new').sort((a, b) => (b.post ? b.post.outlier_x : 0) - (a.post ? a.post.outlier_x : 0)).slice(0, 3);
    const news = top.filter(x => x.origin === 'news' && x.type !== 'risk_alert' && x.status === 'new').sort((a, b) => s10(b) - s10(a)).slice(0, 2);
    const sec = (h, sub, list, more, href) => list.length ? `<section class="sec"><h2>${h}</h2><p class="lead small">${sub}</p><div class="idea-grid">${list.map(x => card(x)).join('')}</div><a class="btn quiet" href="${href}">${more}</a></section>` : '';
    return today({
      risks: risks.length ? `<section class="sec"><h2>Risk alerts</h2><div class="idea-grid">${risks.map(x => card(x)).join('')}</div></section>` : '',
      ideas: (auto.length ? `<section class="sec"><h2>Auto-approved ideas</h2><p class="lead small">Scored 8 or more, so they go into the next content run. Remove any you don't want.</p><ul class="list">${auto.map(x => `<li><button class="rowlink" type="button" data-iopen="${x.id}"><span class="autoic">${ki('check')}</span><span class="rt"><b>${esc(x.title)}</b><small>${s10(x).toFixed(1)}/10 · from ${meta(x).who}</small></span>${ic('chev', 'ic chev')}</button></li>`).join('')}</ul></section>` : '')
        + sec('Best ideas for you', 'Posts that beat their usual, scored 1-10 on how well they fit Therapeia Zoi.', ideas, 'See all ideas', '#competitors')
        + (moves.length ? `<section class="sec"><h2>Moves in your space</h2><p class="lead small">Collabs, launches and sales that worked for others. Ideas for Deep, not posts.</p><ul class="list">${moves.map(moveRow).join('')}</ul></section>` : ''),
      news: sec('In the news', 'From Google News, PubMed, FDA and others.', news, 'See all news', '#news')
    });
  }
  const soonBody = m => `<p class="lead">${esc(m.pitch)}</p><span class="pill">Coming in phase ${m.phase}</span>
    ${m.features.map(([t, d]) => `<article class="feat"><h3>${esc(t)}</h3><p>${esc(d)}</p></article>`).join('')}
    ${m.note ? `<p class="note">${esc(m.note)}</p>` : ''}`;
  const soon = r => soonBody(MODS.find(m => m.id === r));

  const insMsg = st => st === 'dismissed' ? 'Removed' : 'Added to the queue. The next content run turns it into a post for Approve.';
  // ---------- SHEET (post detail from anywhere) ----------
  function renderSheet() {
    const root = $('#sheet-root');
    if (S.insSheet) { const h = insSheet(); if (h) { root.innerHTML = h; document.body.style.overflow = 'hidden'; root.querySelectorAll('[data-close]').forEach(b => b.onclick = closeSheet);
      carousels(root); root.querySelectorAll('[data-ins]').forEach(b => b.onclick = () => act(() => S.db.setInsight(b.dataset.ins, b.dataset.st), insMsg(b.dataset.st), () => { S.insSheet = null; })); return; } S.insSheet = null; }
    const p = S.sheet && S.posts.find(x => x.id === S.sheet);
    if (!p) { root.innerHTML = ''; document.body.style.overflow = ''; return; }
    document.body.style.overflow = 'hidden';
    const res = p.publish_results || {};
    const isSched = p.status === 'scheduled', approved = !!p.approved_at;
    const platRows = enabledPlats().map(([k, l]) => { const r = res[k]; const done = r && r.status === 'published';
      return done ? `<div class="plat done"><span class="plat-h"><b>${l}</b><span class="pill ok">Posted</span>${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">View</a>` : ''}</span><button class="btn sm quiet" type="button" data-unpost="${k}">Undo</button></div>`
        : `<div class="plat"><span class="plat-h"><b>${l}</b>${r && r.status ? `<span class="pill ${r.status === 'failed' ? 'bad' : 'info'}">${esc(r.status.replace('_', ' '))}</span>` : ''}</span><div class="plat-act"><input type="url" id="url-${k}" placeholder="Link to the live post (optional)" aria-label="${l} link"><button class="btn sm primary" type="button" data-post="${k}">Mark as posted</button></div></div>`; }).join('');
    root.innerHTML = `<div class="scrim" data-close></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-label="Post">
        <div class="sheet-head"><h2>${pill(p.status)}</h2><button class="x" type="button" data-close aria-label="Close">${ic('x')}</button></div>
        <div class="sheet-body">
          ${pfSwitch(S.sheetPf, 'data-spf')}
          ${preview(p, S.sheetPf)}
          ${isSched || p.status === 'published' ? `<p class="lead">${p.status === 'published' ? 'Posted ' + when(p.published_at) : 'Goes out <b>' + when(p.scheduled_for) + '</b>'}</p>` : ''}
          ${checks(p)}
          ${noteBox(p)}
          ${p.status === 'in_review' ? `<a class="btn primary block" href="#review" data-close data-goto="${p.id}">Review this post</a>` : ''}
          ${approved && ['scheduled', 'published', 'failed'].includes(p.status) ? `<section class="panel"><h3>${manual() ? 'Post it' : 'Posting'}</h3>
              <p class="small muted">${manual() ? 'Save the images, copy the caption, post, then tick each platform.' : 'Blotato posts Instagram and TikTok at the scheduled time. YouTube is still posted by hand.'}</p>
              <div class="row-btns">${(p.ig_slides || []).map((u, i) => `<a class="btn sm" href="${esc(u)}" target="_blank" rel="noopener">${(p.ig_slides || []).length > 1 ? 'Image ' + (i + 1) : 'Image'}</a>`).join('')}${(p.tt_slides || []).length ? `<a class="btn sm" href="${esc(p.tt_slides[0])}" target="_blank" rel="noopener">Tall version</a>` : ''}</div>
              <div class="row-btns"><button class="btn sm" type="button" data-copy="ig">Copy Instagram caption</button><button class="btn sm" type="button" data-copy="tt">Copy TikTok caption</button>${(S.settings.platforms || {}).youtube ? '<button class="btn sm" type="button" data-copy="yt">Copy YouTube title</button>' : ''}</div>
              ${platRows}</section>` : ''}
          ${isSched ? `<section class="panel"><h3>Time</h3><div class="field"><label for="s-when">Post on <small>(your time)</small></label><input id="s-when" type="datetime-local" value="${toLocalInput(p.scheduled_for)}"></div>
              <div class="row-btns"><button class="btn sm" type="button" data-sdo="reschedule">Save new time</button><button class="btn sm quiet" type="button" data-sdo="unschedule">Move back to Review</button><button class="btn sm quiet danger" type="button" data-sdo="reject">Reject</button></div></section>` : ''}
          ${p.status === 'failed' && approved ? `<button class="btn primary block" type="button" data-sdo="retry">Try posting again</button>` : ''}
          ${p.status === 'failed' ? `<button class="btn quiet danger block" type="button" data-sdo="reject">Reject this post</button>` : ''}
          ${(p.revisions || []).length ? `<details class="more"><summary>Change requests (${p.revisions.length})</summary><ul class="list">${p.revisions.map(x => `<li class="rowlink"><span class="rt"><b style="white-space:normal">${esc(x.note)}</b><small>#${x.revision} · ${({ queued: 'waiting', running: 'AI working', done: 'done', failed: 'not applied' })[x.status] || x.status}</small></span></li>`).join('')}</ul></details>` : ''}
          ${['scheduled', 'failed'].includes(p.status) ? `<details class="more"><summary>Edit captions</summary>
              <div class="field"><label for="s-ig">Instagram caption</label><textarea id="s-ig" rows="7">${esc(p.caption_instagram)}</textarea></div>
              <div class="field"><label for="s-tt">TikTok caption</label><textarea id="s-tt" rows="4">${esc(p.caption_tiktok)}</textarea></div>
              <button class="btn sm" type="button" data-sdo="captions">Save captions</button></details>` : ''}
        </div></div>`;
    wireSheet(root, p);
  }
  function openSheet(id) { S.sheet = id; S.sheetPf = 'ig'; renderSheet(); }
  function closeSheet() { S.sheet = null; S.insSheet = null; renderSheet(); }

  // ---------- prompts built into the page (no browser dialogs) ----------
  function askNote(title, placeholder, required, cb) {
    const root = $('#sheet-root');
    root.innerHTML = `<div class="scrim" data-close></div><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-head"><h2>${esc(title)}</h2><button class="x" type="button" data-close aria-label="Close">${ic('x')}</button></div>
      <form class="sheet-body" id="noteform"><div class="field"><label for="n-text">${required ? 'What should the AI change?' : 'Reason (optional, helps the AI learn)'}</label>
        <textarea id="n-text" rows="4" placeholder="${esc(placeholder)}" ${required ? 'required' : ''}></textarea></div>
        <button class="btn primary block" type="submit">${required ? 'Send to the AI' : 'Reject post'}</button></form></div>`;
    document.body.style.overflow = 'hidden';
    root.querySelectorAll('[data-close]').forEach(b => b.onclick = closeSheet);
    $('#n-text', root).focus();
    $('#noteform', root).onsubmit = e => { e.preventDefault(); const t = $('#n-text', root).value.trim(); if (required && !t) return; closeSheet(); cb(t); };
  }

  // ---------- wiring ----------
  function carousels(root) {
    root.querySelectorAll('.media').forEach(m => {
      const n = +m.dataset.n; if (n < 2) return;
      const track = $('.track', m), prev = $('.prev', m), next = $('.next', m), badge = $('.cbadge', m);
      const goI = i => { i = Math.max(0, Math.min(n - 1, i)); m.dataset.i = i; track.style.transform = `translateX(${-100 * i}%)`; prev.hidden = i === 0; next.hidden = i === n - 1; badge.textContent = `${i + 1}/${n}`; };
      prev.onclick = () => goI(+m.dataset.i - 1); next.onclick = () => goI(+m.dataset.i + 1);
      m.onkeydown = e => { if (e.key === 'ArrowRight') goI(+m.dataset.i + 1); if (e.key === 'ArrowLeft') goI(+m.dataset.i - 1); };
      let x0 = null; m.onpointerdown = e => { x0 = e.clientX; }; m.onpointerup = e => { if (x0 == null) return; const d = e.clientX - x0; x0 = null; if (Math.abs(d) > 40) goI(+m.dataset.i + (d < 0 ? 1 : -1)); };
    });
  }
  const copy = async (text, field) => { try { await navigator.clipboard.writeText(text || ''); toast('Copied'); } catch (e) { if (field) { field.closest('details') && (field.closest('details').open = true); field.select(); } toast('Select the text and copy it', 'bad'); } };

  function wire(v) {
    const bal = $('[data-svcbal]', v);
    if (bal) bal.onsubmit = e => { e.preventDefault(); const n = Number(($('#anth-bal', v) || {}).value); if (!(n >= 0) || ($('#anth-bal', v).value || '') === '') return toast('Enter the balance in US dollars', 'bad');
      act(async () => { await S.db.setAnthropicBalance(n); S.svc = await S.db.services(); }, 'Balance saved. Tracking starts now'); };
    const plan = $('[data-svcplan]', v);
    if (plan) plan.onchange = () => act(async () => { await S.db.setSupabasePlan(plan.value); }, 'Plan saved. The next run uses the new limits');
    carousels(v);
    v.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { if (route() === 'news') S.newsTab = b.dataset.tab; else S.compTab = b.dataset.tab; render(); });
    v.querySelectorAll('[data-fmt]').forEach(b => b.onclick = () => { S.fmt = b.dataset.fmt; render(); });
    v.querySelectorAll('[data-iopen]').forEach(b => b.onclick = () => { S.insSheet = b.dataset.iopen; renderSheet(); });
    v.querySelectorAll('[data-ins]').forEach(b => b.onclick = () => act(() => S.db.setInsight(b.dataset.ins, b.dataset.st), insMsg(b.dataset.st)));
    v.querySelectorAll('[data-acc]').forEach(b => b.onclick = () => act(() => S.db.toggleAccount(b.dataset.acc, b.dataset.on === 'true'), b.dataset.on === 'true' ? 'Resumed' : 'Paused'));
    v.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openSheet(b.dataset.open));
    v.querySelectorAll('[data-pf]').forEach(b => b.onclick = () => { S.pf = b.dataset.pf; S.entered = (queue()[S.i] || {}).id; render(); });
    v.querySelectorAll('[data-step]').forEach(b => b.onclick = () => { S.i += +b.dataset.step; S.entered = null; render(); window.scrollTo({ top: 0 }); });
    v.querySelectorAll('[data-filter]').forEach(b => b.onclick = () => { S.postedFilter = b.dataset.filter; render(); });
    v.querySelectorAll('[data-cday]').forEach(b => b.onclick = () => { S.calDay = b.dataset.cday; render(); if (b.dataset.cone) openSheet(b.dataset.cone); });
    v.querySelectorAll('[data-cmon]').forEach(b => b.onclick = () => { const d = S.calMonth ? new Date(S.calMonth) : new Date(); d.setDate(1); d.setMonth(d.getMonth() + +b.dataset.cmon); S.calMonth = d.toISOString(); S.calDay = null; render(); });
    v.querySelectorAll('[data-do]').forEach(b => b.onclick = () => {
      const id = b.dataset.id, d = b.dataset.do;
      const whenV = fromLocalInput(($('#f-when', v) || {}).value);
      const advance = () => { S.entered = null; };
      if (d === 'approve') return act(() => S.db.decide(id, 'approve', null, whenV), 'Approved and scheduled', advance);
      if (d === 'changes') return askNote('Ask for changes', 'For example: warmer light on her face, bigger headline, show the capsules instead', true, t => act(() => S.db.decide(id, 'changes', t), 'Sent to the AI', advance));
      if (d === 'reject') return askNote('Reject this post', 'For example: off-brand, too salesy, wrong product', false, t => act(() => S.db.decide(id, 'reject', t || null), 'Post rejected', advance));
      if (d === 'captions') return act(() => S.db.updatePost(id, { ig: $('#f-ig', v).value, tt: $('#f-tt', v).value }), 'Captions saved', () => { S.entered = id; });
    });
    v.querySelectorAll('[data-rule]').forEach(b => b.onclick = () => { const id = b.dataset.rule, d = b.dataset.d; const t = (($('#rt-' + id, v) || {}).value || '').trim(); act(() => S.db.decideApproval(id, d, t), d === 'approve' ? 'Rule saved. The AI follows it from the next post.' : 'Suggestion dismissed'); });
    v.querySelectorAll('[data-retire]').forEach(b => b.onclick = () => act(() => S.db.retireRule(b.dataset.retire), 'Rule turned off'));
    const so = $('#signout', v); if (so) so.onclick = async () => { await S.db.signOut(); location.reload(); };
    const f = $('#setform', v);
    if (f) f.onsubmit = e => {
      e.preventDefault(); const fd = new FormData(f);
      const times = String(fd.get('post_times') || '').split(',').map(x => x.trim()).filter(Boolean);
      if (!times.length || times.some(t => !/^([01]?\d|2[0-3]):[0-5]\d$/.test(t))) return toast('Use 24-hour times like 09:00, 18:30', 'bad');
      const s = { publish_mode: fd.get('publish_mode') || 'manual', auto_mode: fd.get('auto_mode') || 'manual', trust_hours: +fd.get('trust_hours') || 12, provider: fd.get('provider') || 'blotato',
        post_times: times.map(t => t.padStart(5, '0')), platforms: { instagram: !!fd.get('pf_instagram'), tiktok: !!fd.get('pf_tiktok'), youtube: !!fd.get('pf_youtube') } };
      act(async () => { S.settings = { ...S.settings, ...(await S.db.saveSettings(s)) }; }, 'Settings saved');
    };
  }
  function wireSheet(root, p) {
    carousels(root);
    root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', e => { if (b.dataset.goto) { const q = queue(); S.i = Math.max(0, q.findIndex(x => x.id === b.dataset.goto)); } closeSheet(); }));
    root.querySelectorAll('[data-spf]').forEach(b => b.onclick = () => { S.sheetPf = b.dataset.spf; renderSheet(); });
    root.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => copy(b.dataset.copy === 'ig' ? p.caption_instagram : b.dataset.copy === 'tt' ? p.caption_tiktok : ytTitle(p), $(b.dataset.copy === 'tt' ? '#s-tt' : '#s-ig', root)));
    root.querySelectorAll('[data-post]').forEach(b => b.onclick = () => { const k = b.dataset.post; const url = (($('#url-' + k, root) || {}).value || '').trim(); act(() => S.db.markPosted(p.id, k, true, url), 'Marked as posted'); });
    root.querySelectorAll('[data-unpost]').forEach(b => b.onclick = () => act(() => S.db.markPosted(p.id, b.dataset.unpost, false), 'Marked as not posted'));
    root.querySelectorAll('[data-sdo]').forEach(b => b.onclick = () => {
      const d = b.dataset.sdo;
      if (d === 'reschedule') { const w = fromLocalInput(($('#s-when', root) || {}).value); if (!w) return toast('Pick a date and time', 'bad'); return act(() => S.db.updatePost(p.id, { when: w }), 'New time saved'); }
      if (d === 'unschedule') return act(() => S.db.decide(p.id, 'unschedule'), 'Moved back to Review', () => { S.sheet = null; });
      if (d === 'retry') return act(() => S.db.retry(p.id), 'Sent back to be posted');
      if (d === 'reject') return askNote('Reject this post', 'For example: off-brand, too salesy, wrong product', false, t => act(() => S.db.decide(p.id, 'reject', t || null), 'Post rejected', () => { S.sheet = null; }));
      if (d === 'captions') return act(() => S.db.updatePost(p.id, { ig: $('#s-ig', root).value, tt: $('#s-tt', root).value }), 'Captions saved');
    });
  }

  // ---------- boot ----------
  async function boot() {
    try {
      S.db = await window.OS_DATA.init();
      $('#modebadge').hidden = S.db.mode !== 'demo';
      S.user = await S.db.session();
      if (!S.user) return showLogin();
      $('#app').hidden = false; $('#login').hidden = true;
      [S.posts, S.settings] = await Promise.all([S.db.posts(), S.db.settings()]);
      S.db.learning().then(L => { S.learnPending = L.proposals.length; renderChrome(route()); }).catch(() => {});
      S.db.services().then(x => { S.svc = x; if (['today', 'more', 'credits'].includes(route())) render(); }).catch(() => {});
      render();
    } catch (e) { $('#app').hidden = false; $('#view').innerHTML = `<div class="empty"><h3>Something went wrong</h3><p>${esc(e.message)}</p><button class="btn" onclick="location.reload()">Reload</button></div>`; }
  }
  function showLogin() {
    $('#login').hidden = false; $('#app').hidden = true;
    $('#loginform').onsubmit = async e => {
      e.preventDefault(); const email = $('#l-email').value.trim(); const msg = $('#l-msg');
      try { await S.db.signIn(email); msg.textContent = `Check ${email} for a sign-in link.`; msg.className = 'ok'; }
      catch (err) { msg.textContent = /signups not allowed/i.test(err.message) ? 'New sign-ups are turned off. Ask the account owner to add you.' : err.message; msg.className = 'bad'; }
    };
  }
  const MOON = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
  const SUN = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/></svg>';
  function paintTheme() {
    const dark = document.documentElement.dataset.theme === 'dark', b = $('#theme');
    b.innerHTML = dark ? SUN : MOON; b.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = dark ? '#0D1310' : '#F3F1EA';
  }
  $('#theme').onclick = () => {
    const dark = document.documentElement.dataset.theme !== 'dark';
    if (dark) document.documentElement.dataset.theme = 'dark'; else delete document.documentElement.dataset.theme;
    try { localStorage.setItem('tz-theme', dark ? 'dark' : 'light'); } catch (e) {}
    paintTheme();
  };
  paintTheme();
  $('#back').onclick = () => { location.hash = '#more'; };
  addEventListener('hashchange', () => { if (S.settings) { S.sheet = null; S.insSheet = null; render(); window.scrollTo({ top: 0 }); } });
  addEventListener('keydown', e => { if (e.key === 'Escape' && (S.sheet || S.insSheet)) closeSheet(); });
  addEventListener('scroll', () => $('#top').classList.toggle('scrolled', scrollY > 4), { passive: true });
  boot();
})();

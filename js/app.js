/* Therapeia Zoi OS — app shell, router and screens (plain JS, no build step).
   Five flat tabs: Today · Review · Plan · Posted · More. Every post opens in the same sheet. */
(function () {
  const C = window.OS_CONFIG, MODS = window.OS_MODULES || [];
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const S = { db: null, user: null, posts: [], settings: null, i: 0, pf: 'ig', sheet: null, sheetPf: 'ig', postedFilter: 'posted', busy: false };

  const STAGE = { awareness: 'Awareness', trust: 'Trust', conversion: 'Conversion', retention: 'Retention' };
  const STATUS = { in_review: ['Needs review', 'warn'], changes_requested: ['AI is revising', 'info'], scheduled: ['Scheduled', 'ok'],
    publishing: ['Posting', 'info'], published: ['Posted', 'ok'], rejected: ['Rejected', ''], failed: ['Failed', 'bad'] };
  const PLATS = [['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['youtube', 'YouTube Shorts']];
  const ICON = {
    today: '<path d="M4 11.5 12 5l8 6.5V20H4z"/><path d="M10 20v-5h4v5"/>',
    review: '<rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="m9 12 2 2 4-4"/>',
    plan: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    posted: '<path d="M5 12.5 10 17l9-10"/>',
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
  const thumb = p => `<img class="thumb" src="${esc((p.ig_slides || [])[0] || '')}" alt="" loading="lazy">`;
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
  const TABS = [['today', 'Today'], ['review', 'Review'], ['plan', 'Plan'], ['posted', 'Posted'], ['more', 'More']];
  const SUB = { learning: 'AI learning', setup: 'Posting settings', analytics: 'Analytics', competitors: 'Competitors', research: 'News & research', creators: 'Creator outreach', store: 'Store & funnel', customers: 'Customer success' };
  const route = () => { const h = (location.hash || '#today').slice(1); return TABS.some(t => t[0] === h) || SUB[h] ? h : 'today'; };
  const tabOf = r => SUB[r] ? 'more' : r;

  function renderChrome(r) {
    const waiting = queue().length;
    const learnBadge = S.learnPending || 0;
    $('#tabs').innerHTML = `<div class="rail-brand"><span class="brandmark"><img src="${esc(C.brand.logo)}" alt=""></span><span>${esc(C.brand.name)}<small>Growth OS</small></span></div>`
      + TABS.map(([k, l]) => {
        const n = k === 'review' ? waiting : k === 'more' ? learnBadge : 0;
        return `<a class="tab" href="#${k}" ${tabOf(r) === k ? 'aria-current="page"' : ''}>${ic(k)}<span>${l}</span>${n ? `<span class="dot">${n}</span>` : ''}</a>`;
      }).join('')
      + (C.credit === false ? '' : `<a class="credit" href="https://saltpilot.com" target="_blank" rel="noopener">Built by <b>Saltpilot</b></a>`);
    $('#title').textContent = SUB[r] || ({ today: C.brand.name, review: 'Review', plan: 'Plan', posted: 'Posted', more: 'More' })[r];
    $('#back').hidden = !SUB[r]; $('#brandmark').hidden = !!SUB[r] || r !== 'today';
    document.title = `${SUB[r] || TABS.find(t => t[0] === r)[1]} · ${C.brand.name}`;
    $('#view').classList.toggle('wide', r === 'plan' || r === 'posted');
  }

  function render() {
    const r = route();
    renderChrome(r);
    const v = $('#view');
    const out = ({ today: todayPlus, review, plan, posted, more, learning, setup, analytics, competitors, research, creators: soon, store: soon, customers: soon })[r](r);
    const done = h => { v.innerHTML = h; wire(v); renderSheet(); };
    if (out && out.then) out.then(done); else done(out);
  }

  // ---------- post preview ----------
  function preview(p, pf) {
    const slides = pf === 'ig' ? (p.ig_slides || []) : (p.tt_slides || []);
    const n = slides.length;
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
  function today() {
    const q = queue(), sch = scheduled(), now = Date.now();
    const due = sch.filter(p => new Date(p.scheduled_for) <= now + 864e5 && sameDay(p.scheduled_for, now) || new Date(p.scheduled_for) <= now);
    const revising = byStatus('changes_requested');
    const failed = byStatus('failed').filter(p => p.approved_at);
    const next = sch.filter(p => !due.includes(p)).slice(0, 3);
    const hero = q.length
      ? `<section class="hero-decide"><div class="stack">${q.slice(0, 4).map(p => `<img src="${esc((p.ig_slides || [])[0] || '')}" alt="">`).join('')}</div>
          <h2>${q.length} post${q.length > 1 ? 's' : ''} need${q.length > 1 ? '' : 's'} your decision</h2>
          <p>Approve, ask for changes or reject. It takes a few seconds each.</p>
          <a class="btn primary block" href="#review">Start review</a></section>`
      : `<section class="hero-calm"><h2>You're all caught up</h2><p>New posts appear here as soon as the AI finishes them.${sch.length ? ` Next one goes out ${when(sch[0].scheduled_for)}.` : ''}</p></section>`;
    const row = (p, sub) => `<li><button class="rowlink" type="button" data-open="${p.id}">${thumb(p)}<span class="rt"><b>${esc(titleOf(p))}</b><small>${sub}</small></span>${ic('chev', 'ic chev')}</button></li>`;
    return `${hero}
      ${due.length && manual() ? `<section class="sec"><h2>Post today</h2><p class="lead small">Auto-posting is off. Open a post to copy the caption, save the images and tick each platform when it's up.</p>
        <ul class="list">${due.map(p => { const r = p.publish_results || {}; const left = enabledPlats().filter(([k]) => !(r[k] && r[k].status === 'published')).map(x => x[1]); return row(p, `${timeOnly(p.scheduled_for)} · ${left.length ? 'Still to post: ' + left.join(', ') : 'All posted'}`); }).join('')}</ul></section>` : ''}
      ${failed.length ? `<section class="sec"><h2>Didn't post</h2><ul class="list">${failed.map(p => row(p, 'Tap to retry')).join('')}</ul></section>` : ''}
      ${revising.length ? `<section class="sec"><h2>With the AI</h2><p class="lead small">These come back to Review when the changes are done.</p><ul class="list">${revising.map(p => row(p, 'Applying your note')).join('')}</ul></section>` : ''}
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

  // ---------- PLAN (agenda, next 14 days) ----------
  function plan() {
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

  // ---------- POSTED ----------
  function posted() {
    const F = { posted: ['Posted', p => p.status === 'published'], failed: ['Didn\'t post', p => p.status === 'failed'], rejected: ['Rejected', p => p.status === 'rejected'] };
    const list = S.posts.filter(F[S.postedFilter][1]).sort((a, b) => new Date(b.published_at || b.updated_at || b.created_at) - new Date(a.published_at || a.updated_at || a.created_at));
    const chips = `<div class="chips" role="group" aria-label="Filter">${Object.entries(F).map(([k, [l, f]]) => `<button type="button" data-filter="${k}" aria-pressed="${S.postedFilter === k}">${l} (${S.posts.filter(f).length})</button>`).join('')}</div>`;
    const plats = p => enabledPlats().map(([k, l]) => { const r = (p.publish_results || {})[k]; return r && r.status === 'published' ? l : null; }).filter(Boolean).join(', ');
    return chips + (list.length ? `<ul class="list">${list.map(p => `<li><button class="rowlink" type="button" data-open="${p.id}">${thumb(p)}<span class="rt"><b>${esc(titleOf(p))}</b><small>${p.status === 'published' ? `${fmt(p.published_at, { month: 'short', day: 'numeric' })} · ${plats(p) || 'Posted'}` : p.status === 'failed' ? 'Tap to retry' : esc(p.review_note || 'No reason given')}</small></span>${ic('chev', 'ic chev')}</button></li>`).join('')}</ul>`
      : `<div class="empty"><h3>${{ posted: 'Nothing posted yet', failed: 'Nothing failed', rejected: 'No rejected posts' }[S.postedFilter]}</h3><p>${S.postedFilter === 'posted' ? 'Posts show here once every platform is marked as posted.' : 'All good here.'}</p></div>`);
  }

  // ---------- MORE ----------
  function more() {
    const item = (href, t, sub, tag) => `<li><a class="rowlink" href="#${href}"><span class="rt"><b>${esc(t)}</b><small>${esc(sub)}</small></span>${tag || ''}${ic('chev', 'ic chev')}</a></li>`;
    const soonMods = MODS.filter(m => m.status === 'soon');
    return `<section class="sec"><h2>Content</h2><ul class="list">
        ${item('learning', 'AI learning', 'Rules the AI learned from your notes', S.learnPending ? `<span class="pill warn">${S.learnPending} to review</span>` : '')}
        ${item('setup', 'Posting settings', 'Auto-posting, times and platforms')}
        ${item('analytics', 'Analytics', 'How posts perform')}
        ${item('competitors', 'Competitors', 'Posts that took off and why, plus the watch list')}
        ${item('research', 'News & research', 'Studies, recalls, competitor moves and trends')}
      </ul></section>
      <section class="sec"><h2>Coming next</h2><ul class="list">${soonMods.map(m => item(m.id, m.label, m.kpi, '<span class="soon-tag">Soon</span>')).join('')}</ul></section>
      ${S.user && !S.user.open ? `<button class="btn quiet" type="button" id="signout">Sign out (${esc(S.user.email)})</button>` : ''}`;
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
  const flag = c => c && c !== 'US' && c !== 'XX' ? ` · ${esc(c)}` : '';
  function card(x) {
    const [t, k] = TYPE[x.type] || [x.type, ''];
    const acts = x.gate === 'ok' && x.status === 'new' ? `<div class="row-acts"><button class="btn small" data-ins="${x.id}" data-st="accepted">${x.type === 'risk_alert' || x.type === 'heads_up' ? 'Got it' : 'Use this idea'}</button><button class="btn small quiet" data-ins="${x.id}" data-st="dismissed">Dismiss</button></div>` : x.status !== 'new' ? `<span class="pill">${x.status === 'accepted' ? 'Saved' : x.status === 'used' ? 'Used' : 'Dismissed'}</span>` : '';
    return `<article class="feat ins"><div class="ins-top"><span class="pill ${k}">${t}</span>${x.gate !== 'ok' ? `<span class="pill warn">${esc(GATE[x.gate] || x.gate)}</span>` : ''}</div>
      <h3>${esc(x.title)}</h3>${x.why ? `<p><b>Why:</b> ${esc(x.why)}</p>` : ''}${x.idea ? `<p><b>For us:</b> ${esc(x.idea)}</p>` : ''}${x.gate_reason ? `<p class="note">${esc(x.gate_reason)}</p>` : ''}
      <p class="note">${x.source_url ? `<a href="${esc(x.source_url)}" target="_blank" rel="noopener">${esc(x.source_label || 'Source')}</a>` : esc(x.source_label || '')}${flag(x.source_country)} · ${fmt(x.created_at, { month: 'short', day: 'numeric' })}</p>${acts}</article>`;
  }
  const chips = (cur, opts) => `<div class="chips" role="group">${opts.map(([k, l]) => `<button type="button" data-tab="${k}" aria-pressed="${cur === k}">${l}</button>`).join('')}</div>`;
  async function competitors() {
    const tab = S.compTab || 'ideas';
    let all = [], acc = [];
    try { [all, acc] = await Promise.all([S.db.insights(['competitor', 'own']), tab === 'watch' ? S.db.watchAccounts() : []]); } catch (e) { return `<div class="empty"><h3>Could not load</h3><p>${esc(e.message)}</p></div>`; }
    const ok = all.filter(x => x.gate === 'ok' && x.status !== 'dismissed'), blocked = all.filter(x => x.gate !== 'ok');
    let body;
    if (tab === 'watch') body = `<ul class="list">${acc.map(a => `<li><div class="rowlink"><span class="rt"><b>@${esc(a.handle)}</b><small>${esc(a.platform)} · ${esc(a.country)} · ${esc(a.tier)}${a.followers ? ' · ' + Number(a.followers).toLocaleString() + ' followers' : ''}${a.note ? ' · ' + esc(a.note) : ''}</small></span><button class="btn small quiet" data-acc="${a.id}" data-on="${!a.active}">${a.active ? 'Pause' : 'Resume'}</button></div></li>`).join('')}</ul><p class="note">Scanned every Monday. Inspiration accounts count half when ranking ideas.</p>`;
    else { const list = tab === 'ideas' ? ok : blocked;
      body = list.length ? list.map(card).join('') : `<div class="empty"><h3>${tab === 'ideas' ? 'No ideas yet' : 'Nothing filtered out'}</h3><p>${tab === 'ideas' ? 'Every Monday we scan the watch list, find posts that did far better than usual and explain why they worked.' : 'Posts tied to non-US festivals, the wrong season or risky claims land here instead of in your ideas.'}</p></div>`; }
    return chips(tab, [['ideas', `Ideas (${ok.length})`], ['blocked', `Filtered out (${blocked.length})`], ['watch', 'Watch list']]) + body;
  }
  async function research() {
    const tab = S.newsTab || 'all';
    let all = []; try { all = await S.db.insights(['news']); } catch (e) { return `<div class="empty"><h3>Could not load</h3><p>${esc(e.message)}</p></div>`; }
    all = all.filter(x => x.status !== 'dismissed');
    const list = tab === 'all' ? all : all.filter(x => x.type === tab);
    return chips(tab, [['all', 'All'], ['risk_alert', 'Risk alerts'], ['post_idea', 'Post ideas'], ['heads_up', 'Heads-up']]) +
      (list.length ? list.map(card).join('') : `<div class="empty"><h3>Nothing new</h3><p>Each morning we check Google News, PubMed, FDA, FTC, UK FSA, Reddit and clinical trials, and keep only what matters to Therapeia Zoi.</p></div>`);
  }
  async function todayPlus(r) {
    const base = await today(r);
    let top = []; try { top = (await S.db.insights(['competitor', 'own', 'news'])).filter(x => x.gate === 'ok' && x.status === 'new'); } catch (e) { return base; }
    if (!top.length) return base;
    const risks = top.filter(x => x.type === 'risk_alert'), ideas = top.filter(x => x.type !== 'risk_alert').sort((a, b) => b.score - a.score).slice(0, 3);
    return `${risks.length ? `<section class="sec"><h2>Risk alerts</h2>${risks.slice(0, 3).map(card).join('')}</section>` : ''}${base}<section class="sec"><h2>Ideas for you</h2>${ideas.map(card).join('')}<a class="btn quiet" href="#competitors">See all ideas</a></section>`;
  }
  const soonBody = m => `<p class="lead">${esc(m.pitch)}</p><span class="pill">Coming in phase ${m.phase}</span>
    ${m.features.map(([t, d]) => `<article class="feat"><h3>${esc(t)}</h3><p>${esc(d)}</p></article>`).join('')}
    ${m.note ? `<p class="note">${esc(m.note)}</p>` : ''}`;
  const soon = r => soonBody(MODS.find(m => m.id === r));

  // ---------- SHEET (post detail from anywhere) ----------
  function renderSheet() {
    const root = $('#sheet-root');
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
              <div class="row-btns"><button class="btn sm" type="button" data-sdo="reschedule">Save new time</button><button class="btn sm quiet danger" type="button" data-sdo="unschedule">Move back to Review</button></div></section>` : ''}
          ${p.status === 'failed' && approved ? `<button class="btn primary block" type="button" data-sdo="retry">Try posting again</button>` : ''}
          ${(p.revisions || []).length ? `<details class="more"><summary>Change requests (${p.revisions.length})</summary><ul class="list">${p.revisions.map(x => `<li class="rowlink"><span class="rt"><b style="white-space:normal">${esc(x.note)}</b><small>#${x.revision} · ${({ queued: 'waiting', running: 'AI working', done: 'done', failed: 'not applied' })[x.status] || x.status}</small></span></li>`).join('')}</ul></details>` : ''}
          ${['scheduled', 'failed'].includes(p.status) ? `<details class="more"><summary>Edit captions</summary>
              <div class="field"><label for="s-ig">Instagram caption</label><textarea id="s-ig" rows="7">${esc(p.caption_instagram)}</textarea></div>
              <div class="field"><label for="s-tt">TikTok caption</label><textarea id="s-tt" rows="4">${esc(p.caption_tiktok)}</textarea></div>
              <button class="btn sm" type="button" data-sdo="captions">Save captions</button></details>` : ''}
        </div></div>`;
    wireSheet(root, p);
  }
  function openSheet(id) { S.sheet = id; S.sheetPf = 'ig'; renderSheet(); }
  function closeSheet() { S.sheet = null; renderSheet(); }

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
    carousels(v);
    v.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { if (route() === 'research') S.newsTab = b.dataset.tab; else S.compTab = b.dataset.tab; render(); });
    v.querySelectorAll('[data-ins]').forEach(b => b.onclick = () => act(() => S.db.setInsight(b.dataset.ins, b.dataset.st), b.dataset.st === 'dismissed' ? 'Dismissed' : 'Saved'));
    v.querySelectorAll('[data-acc]').forEach(b => b.onclick = () => act(() => S.db.toggleAccount(b.dataset.acc, b.dataset.on === 'true'), b.dataset.on === 'true' ? 'Resumed' : 'Paused'));
    v.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openSheet(b.dataset.open));
    v.querySelectorAll('[data-pf]').forEach(b => b.onclick = () => { S.pf = b.dataset.pf; S.entered = (queue()[S.i] || {}).id; render(); });
    v.querySelectorAll('[data-step]').forEach(b => b.onclick = () => { S.i += +b.dataset.step; S.entered = null; render(); window.scrollTo({ top: 0 }); });
    v.querySelectorAll('[data-filter]').forEach(b => b.onclick = () => { S.postedFilter = b.dataset.filter; render(); });
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
  $('#back').onclick = () => { location.hash = '#more'; };
  addEventListener('hashchange', () => { if (S.settings) { S.sheet = null; render(); window.scrollTo({ top: 0 }); } });
  addEventListener('keydown', e => { if (e.key === 'Escape' && S.sheet) closeSheet(); });
  addEventListener('scroll', () => $('#top').classList.toggle('scrolled', scrollY > 4), { passive: true });
  boot();
})();

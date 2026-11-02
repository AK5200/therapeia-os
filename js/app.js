/* Therapeia Zoi OS · shell, router and views (vanilla JS, no build step) */
(function () {
  const C = window.OS_CONFIG, MODS = window.OS_MODULES;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const S = { db: null, user: null, posts: [], settings: null, tab: 'in_review', sel: null, platform: 'ig', busy: false };

  const STAGE = { awareness: 'Awareness', trust: 'Trust', conversion: 'Conversion', retention: 'Retention' };
  const STATUS = {
    in_review: ['Waiting for you', 'warn'], changes_requested: ['AI is revising', 'info'], scheduled: ['Scheduled', 'ok'],
    approved: ['Approved', 'ok'], publishing: ['Publishing', 'info'], published: ['Published', 'ok'], rejected: ['Rejected', 'mute'], failed: ['Failed', 'bad']
  };
  const ICONS = {
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
    people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.6c2.8-.3 5 1.3 5.5 4.4"/>',
    bag: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
    heart: '<path d="M12 20s-7.5-4.5-9-9.2C1.9 7.3 4 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3 0 5.1 2.8 4 6.3-1.5 4.7-9 9.2-9 9.2z"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    store: '<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9h16v2a3 3 0 0 1-5.3 2 3 3 0 0 1-5.4 0A3 3 0 0 1 4 11z"/><path d="M5 13v7h14v-7"/>',
    brain: '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3h1V4z"/><path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3h-1V4z"/>',
    prev: '<path d="M15 5l-7 7 7 7"/>', next: '<path d="M9 5l7 7-7 7"/>', menu: '<path d="M4 7h16M4 12h16M4 17h16"/>'
  };
  const ic = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;

  // ---------- time ----------
  const fmt = (iso, o) => iso ? new Date(iso).toLocaleString('en-US', o) : '';
  const when = iso => fmt(iso, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const ago = iso => { const m = Math.round((Date.now() - new Date(iso)) / 6e4); return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
  const toLocalInput = iso => { if (!iso) return ''; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const fromLocalInput = v => v ? new Date(v).toISOString() : null;

  // ---------- toast ----------
  function toast(msg, kind = 'ok') {
    const t = document.createElement('div'); t.className = `toast ${kind}`; t.setAttribute('role', 'status'); t.textContent = msg;
    $('#toasts').appendChild(t); setTimeout(() => t.classList.add('out'), 3200); setTimeout(() => t.remove(), 3700);
  }
  async function act(fn, okMsg) {
    if (S.busy) return; S.busy = true; document.body.classList.add('busy');
    try { const r = await fn(); if (okMsg) toast(okMsg); await refresh(); return r; }
    catch (e) { toast(e.message || String(e), 'bad'); }
    finally { S.busy = false; document.body.classList.remove('busy'); }
  }
  async function refresh() { S.posts = await S.db.posts(); render(); }

  // ---------- routing ----------
  function parse() {
    const h = (location.hash || '#home').slice(1);
    const [mod, page] = h.split('-');
    const m = MODS.find(x => x.id === mod) || MODS[0];
    const p = m.pages ? (m.pages.find(x => x.id === page) || m.pages[0]) : null;
    return { m, p };
  }
  const go = h => { if (location.hash === '#' + h) render(); else location.hash = h; };

  // ---------- shell ----------
  function sidebar(cur) {
    const waiting = S.posts.filter(p => p.status === 'in_review').length;
    return MODS.map(m => {
      const on = cur.m.id === m.id;
      const href = m.pages ? `#${m.id}-${m.pages[0].id}` : `#${m.id}`;
      const badge = m.id === 'content' && waiting ? `<span class="count">${waiting}</span>` : m.status === 'soon' ? '<span class="soon">Soon</span>' : '';
      const sub = m.pages && on ? `<div class="sub">${m.pages.map(p => `<a href="#${m.id}-${p.id}" class="${cur.p && cur.p.id === p.id ? 'on' : ''}" ${cur.p && cur.p.id === p.id ? 'aria-current="page"' : ''}>${esc(p.label)}${p.id === 'approvals' && waiting ? `<span class="count">${waiting}</span>` : ''}${p.status === 'soon' ? '<span class="soon">Soon</span>' : ''}</a>`).join('')}</div>` : '';
      return `<div class="navgrp ${on ? 'open' : ''}"><a class="nav ${on ? 'on' : ''} ${m.status === 'soon' ? 'dim' : ''}" href="${href}" ${on && !m.pages ? 'aria-current="page"' : ''}>${ic(m.icon)}<span>${esc(m.label)}</span>${badge}</a>${sub}</div>`;
    }).join('');
  }

  function render() {
    const cur = parse();
    $('#side-nav').innerHTML = sidebar(cur);
    const title = cur.p ? cur.p.label : cur.m.label;
    $('#crumb').innerHTML = cur.p ? `<span>${esc(cur.m.label)}</span><b>${esc(title)}</b>` : `<b>${esc(title)}</b>`;
    document.title = `${title} · ${C.brand.name} OS`;
    const v = $('#view');
    let html;
    if (cur.m.status === 'soon') html = soonModule(cur.m);
    else if (cur.m.id === 'home') html = home();
    else html = ({ approvals, calendar, published, analytics, competitors, research, learning, setup })[cur.p.id]();
    if (typeof html === 'string') v.innerHTML = html; else html.then(h => { v.innerHTML = h; wire(cur); });
    if (typeof html === 'string') wire(cur);
    document.body.classList.remove('menu-open');
  }

  // ---------- shared bits ----------
  const pill = s => { const [t, k] = STATUS[s] || [s, 'mute']; return `<span class="st ${k}">${esc(t)}</span>`; };
  const thumb = p => `<img class="thumb" src="${esc((p.ig_slides || [])[0] || '')}" alt="" loading="lazy">`;
  const titleOf = p => {
    const c = String(p.caption_instagram || '').split('\n').find(l => l.trim()) || p.angle || 'Untitled post';
    return c.length > 70 ? c.slice(0, 68) + '…' : c;
  };
  const fmtLabel = p => p.format === 'carousel' ? `${(p.ig_slides || []).length}-slide carousel` : 'Single image';
  function empty(title, body, extra = '') { return `<div class="empty"><h3>${esc(title)}</h3><p>${body}</p>${extra}</div>`; }

  const ytTitle = p => { const l = String(p.caption_instagram || '').split('\n').find(x => x.trim()) || 'Therapeia Zoi'; return l.length > 95 ? l.slice(0, 94) + '…' : l; };
  const PLATS = [['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['youtube', 'YouTube Shorts']];
  const enabledPlats = () => PLATS.filter(([k]) => S.settings.platforms && S.settings.platforms[k]);
  function postKit(p) {
    const res = p.publish_results || {};
    const rows = enabledPlats().map(([k, l]) => {
      const r = res[k]; const done = r && r.status === 'published';
      return `<li class="kit-row ${done ? 'done' : ''}"><div class="kit-h"><b>${l}</b>${done ? `<span class="st ok">Posted</span>${r.url ? ` <a href="${esc(r.url)}" target="_blank" rel="noopener">View</a>` : ''}` : r && r.status ? `<span class="st ${r.status === 'failed' ? 'bad' : 'info'}">${esc(r.status.replace('_', ' '))}</span>` : '<span class="st mute">Not posted</span>'}</div>
        ${done ? `<button class="btn sm ghost" type="button" data-unpost="${k}">Undo</button>` : `<div class="kit-act"><input type="url" id="url-${k}" placeholder="Link to the live post (optional)" aria-label="${l} post link"><button class="btn sm primary" type="button" data-post="${k}">Mark as posted</button></div>`}</li>`;
    }).join('');
    const auto = S.settings.publish_mode === 'auto';
    return `<section class="kit"><h3>${auto ? 'Publishing' : 'Post it yourself'}</h3>
      <p class="muted small">${auto ? 'Blotato posts Instagram and TikTok automatically at the scheduled time. YouTube still needs to be posted by hand.' : 'Auto-posting is off. Download the images, copy the caption, post, then mark each platform as posted.'}</p>
      <div class="kit-tools"><span class="muted small">Images:</span> ${(p.ig_slides || []).map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener">IG ${i + 1}</a>`).join(' ')} ${(p.tt_slides || []).map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener">TikTok/YT ${i + 1}</a>`).join(' ')}</div>
      <div class="btns"><button class="btn sm" type="button" data-copy="ig">Copy Instagram caption</button><button class="btn sm" type="button" data-copy="tt">Copy TikTok caption</button>${S.settings.platforms && S.settings.platforms.youtube ? '<button class="btn sm" type="button" data-copy="yt">Copy YouTube title</button>' : ''}</div>
      <ul class="kit-list">${rows}</ul></section>`;
  }
  function revHistory(p) {
    const r = p.revisions || [];
    if (!r.length) return '';
    const word = { queued: 'waiting', running: 'AI working', done: 'done', failed: 'failed' };
    return `<details class="revs"><summary>Change requests (${r.length})</summary><ol>${r.map(x => `<li><b>#${x.revision}</b> ${esc(x.note)} <span class="muted small">· ${word[x.status] || x.status}${x.at ? ' · ' + when(x.at) : ''}</span></li>`).join('')}</ol></details>`;
  }
  function preview(p, platform) {
    const slides = platform === 'ig' ? (p.ig_slides || []) : (p.tt_slides || []);
    const n = slides.length;
    const imgs = slides.map((u, i) => `<img src="${esc(u)}" alt="${esc(i === 0 ? p.alt_text || '' : 'Slide ' + (i + 1))}" draggable="false">`).join('');
    const nav = n > 1 ? `<button class="cnav prev" type="button" aria-label="Previous slide" hidden>${ic('prev')}</button><button class="cnav next" type="button" aria-label="Next slide">${ic('next')}</button><span class="cbadge">1/${n}</span>` : '';
    const cap = esc(platform === 'tt' ? p.caption_tiktok : p.caption_instagram).replace(/(#[\w]+)/g, '<span class="tag">$1</span>');
    if (platform === 'yt') return `<div class="tt yt"><div class="media" data-n="${n}" data-i="0" tabindex="0" aria-label="${n} slide${n > 1 ? 's' : ''}"><div class="track">${imgs}</div>${nav}</div>
      <span class="yt-badge">Shorts</span><div class="tt-foot"><b>${esc(ytTitle(p))}</b><div class="cap">@${esc(C.brand.handle)}</div></div></div>`;
    if (platform === 'tt') return `<div class="tt"><div class="media" data-n="${n}" data-i="0" tabindex="0" aria-label="${n} slide${n > 1 ? 's' : ''}"><div class="track">${imgs}</div>${nav}</div>
      <div class="tt-foot"><b>@${esc(C.brand.handle)}</b><div class="cap">${cap}</div></div></div>`;
    return `<div class="ig"><div class="ig-head"><span class="av"><img src="${esc(C.brand.logo)}" alt=""></span><b>${esc(C.brand.handle)}</b></div>
      <div class="media" data-n="${n}" data-i="0" tabindex="0" aria-label="${n} slide${n > 1 ? 's' : ''}"><div class="track">${imgs}</div>${nav}</div>
      <div class="ig-cap"><b>${esc(C.brand.handle)}</b> <span class="cap">${cap}</span></div></div>`;
  }
  function initCarousels(root) {
    root.querySelectorAll('.media').forEach(m => {
      const n = +m.dataset.n; if (n < 2) return;
      const track = $('.track', m), prev = $('.prev', m), next = $('.next', m), badge = $('.cbadge', m);
      const goI = i => { i = Math.max(0, Math.min(n - 1, i)); m.dataset.i = i; track.style.transform = `translateX(${-100 * i}%)`; prev.hidden = i === 0; next.hidden = i === n - 1; badge.textContent = `${i + 1}/${n}`; };
      prev.onclick = () => goI(+m.dataset.i - 1); next.onclick = () => goI(+m.dataset.i + 1);
      m.onkeydown = e => { if (e.key === 'ArrowRight') goI(+m.dataset.i + 1); if (e.key === 'ArrowLeft') goI(+m.dataset.i - 1); };
      let x0 = null; m.onpointerdown = e => { x0 = e.clientX; }; m.onpointerup = e => { if (x0 == null) return; const d = e.clientX - x0; x0 = null; if (Math.abs(d) > 40) goI(+m.dataset.i + (d < 0 ? 1 : -1)); };
    });
  }

  // ---------- HOME ----------
  function home() {
    const P = S.posts, wk = Date.now() + 7 * 864e5;
    const waiting = P.filter(p => p.status === 'in_review');
    const sched = P.filter(p => p.status === 'scheduled').sort((a, b) => new Date(a.scheduled_for) - new Date(b.scheduled_for));
    const month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0);
    const pub = P.filter(p => p.status === 'published' && new Date(p.published_at) >= month).length;
    const failed = P.filter(p => p.status === 'failed').length;
    const due = P.filter(p => p.status === 'scheduled' && new Date(p.scheduled_for) <= new Date()).length;
    const mode = { manual: 'Manual approval', trust: 'Trust mode', paused: 'Paused' }[S.settings.auto_mode];
    const live = MODS.filter(m => m.status === 'soon');
    return `<section class="hello"><h1>Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}.</h1>
      <p>${waiting.length ? `${waiting.length} post${waiting.length > 1 ? 's are' : ' is'} waiting for your approval.` : 'Nothing is waiting for you right now.'} ${sched.length ? `Next post goes out ${when(sched[0].scheduled_for)}.` : 'No posts are scheduled yet.'}</p>
      ${waiting.length ? `<a class="btn primary" href="#content-approvals">Review ${waiting.length} post${waiting.length > 1 ? 's' : ''}</a>` : ''}</section>
    <section class="stats">
      <a class="stat ${waiting.length ? 'warn' : ''}" href="#content-approvals"><span>Waiting for approval</span><b>${waiting.length}</b></a>
      <a class="stat" href="#content-calendar"><span>Scheduled, next 7 days</span><b>${sched.filter(p => new Date(p.scheduled_for) < wk).length}</b></a>
      ${S.settings.publish_mode !== 'auto' ? `<a class="stat ${due ? 'warn' : ''}" href="#content-calendar"><span>Ready to post by hand</span><b>${due}</b></a>` : ''}
      <a class="stat" href="#content-published"><span>Published this month</span><b>${pub}</b>${failed ? `<em class="bad">${failed} failed</em>` : ''}</a>
      <a class="stat" href="#content-setup"><span>Auto-send</span><b class="sm">${mode}</b></a>
    </section>
    <div class="cols">
      <section class="card"><header><h2>Coming up</h2><a href="#content-calendar">Calendar</a></header>
        ${sched.length ? `<ul class="rows">${sched.slice(0, 4).map(p => `<li><button type="button" class="rowbtn" data-open="${p.id}">${thumb(p)}<span class="rt"><b>${esc(titleOf(p))}</b><small>${when(p.scheduled_for)} · ${fmtLabel(p)}</small></span></button></li>`).join('')}</ul>`
        : empty('Nothing scheduled', 'Approve a post and it gets the next free slot automatically.')}
      </section>
      <section class="card goal"><header><h2>Road to ${esc(C.goal.label)}</h2><span class="st mute">Needs Shopify</span></header>
        <p class="big">$1,000,000</p>
        <p>At a $40 average order that is about <b>25,000 orders</b>. Three levers move it: more first orders (content and creators), bigger orders (bundles and add-ons) and more reorders (customer success).</p>
        <p class="muted">Revenue, orders and repeat rate appear here once the Store & funnel module connects to Shopify.</p>
      </section>
    </div>
    <section class="card"><header><h2>Modules on the way</h2></header>
      <div class="roadmap">${live.map(m => `<a class="rm" href="#${m.id}">${ic(m.icon)}<span><b>${esc(m.label)}</b><small>Phase ${m.phase} · ${esc(m.kpi)}</small></span></a>`).join('')}</div>
    </section>`;
  }

  // ---------- APPROVALS ----------
  const TABS = [['in_review', 'Waiting'], ['scheduled', 'Scheduled'], ['changes_requested', 'Revising'], ['rejected', 'Rejected']];
  function approvals() {
    const list = S.posts.filter(p => p.status === S.tab).sort((a, b) => S.tab === 'scheduled' ? new Date(a.scheduled_for) - new Date(b.scheduled_for) : new Date(b.created_at) - new Date(a.created_at));
    if (!list.find(p => p.id === S.sel)) S.sel = list[0] ? list[0].id : null;
    const p = list.find(x => x.id === S.sel);
    const tabs = `<div class="tabs" role="tablist">${TABS.map(([k, l]) => { const n = S.posts.filter(x => x.status === k).length; return `<button role="tab" type="button" data-tab="${k}" aria-selected="${S.tab === k}">${l}<span>${n}</span></button>`; }).join('')}</div>`;
    const items = list.length ? `<ul class="queue">${list.map(x => `<li><button type="button" data-sel="${x.id}" class="${x.id === S.sel ? 'on' : ''}">${thumb(x)}<span class="rt"><b>${esc(titleOf(x))}</b><small>${STAGE[x.funnel_stage] || ''} · ${fmtLabel(x)}</small><small>${x.status === 'scheduled' ? when(x.scheduled_for) : 'Made ' + ago(x.created_at)}</small></span></button></li>`).join('')}</ul>`
      : empty({ in_review: 'All caught up', scheduled: 'Nothing scheduled', changes_requested: 'Nothing being revised', rejected: 'No rejected posts' }[S.tab], S.tab === 'in_review' ? 'New posts arrive here after the AI and the design critic finish them.' : 'Posts will show up here when they reach this stage.');
    return `${tabs}<div class="review">${`<aside class="qcol">${items}</aside>`}${p ? detail(p) : '<div class="dcol"></div>'}</div>`;
  }
  function detail(p) {
    const editable = ['in_review', 'changes_requested', 'scheduled', 'failed'].includes(p.status);
    const checks = `<ul class="checks">
      <li class="${p.critic_verdict === 'pass' ? 'ok' : 'warn'}">Design critic: ${esc(p.critic_verdict || 'not run')}</li>
      <li class="${p.compliance_verdict === 'pass' && !p.compliance_flagged ? 'ok' : 'warn'}">Claims check: ${esc(p.compliance_verdict || 'not run')}${p.compliance_flagged ? ' (flagged)' : ''}</li></ul>`;
    const actions = p.status === 'changes_requested' ? `<p class="note">The AI is revising this post with your note. It comes back to <b>Waiting</b> when it is ready, after the same compliance and design checks.</p>`
      : p.status === 'in_review' ? `
      <div class="field"><label for="f-when">Post on <small>(your time; leave empty for the next free slot)</small></label><input id="f-when" type="datetime-local" value=""></div>
      <div class="btns"><button class="btn primary" type="button" data-do="approve">Approve and schedule</button>
        <button class="btn" type="button" data-do="changes-open">Request changes</button>
        <button class="btn ghost danger" type="button" data-do="reject">Reject</button></div>
      <div class="changes" hidden><div class="field"><label for="f-note">What should the AI change?</label><textarea id="f-note" rows="3" placeholder="For example: warmer light, make the headline bigger, use the capsules instead of gummies"></textarea></div>
        <div class="btns"><button class="btn primary" type="button" data-do="changes">Send to AI</button><button class="btn ghost" type="button" data-do="changes-close">Cancel</button></div></div>`
      : p.status === 'scheduled' ? `
      <div class="field"><label for="f-when">Scheduled for <small>(your time)</small></label><input id="f-when" type="datetime-local" value="${toLocalInput(p.scheduled_for)}"></div>
      <div class="btns"><button class="btn" type="button" data-do="reschedule">Save new time</button><button class="btn ghost danger" type="button" data-do="unschedule">Pull back to review</button></div>`
      : p.status === 'failed' && p.approved_at ? `<div class="btns"><button class="btn primary" type="button" data-do="retry">Retry publishing now</button></div>` : '';
    return `<div class="dcol">
      <div class="pv"><div class="seg" role="group" aria-label="Preview platform"><button type="button" data-pf="ig" aria-pressed="${S.platform === 'ig'}">Instagram</button><button type="button" data-pf="tt" aria-pressed="${S.platform === 'tt'}">TikTok</button><button type="button" data-pf="yt" aria-pressed="${S.platform === 'yt'}">YouTube</button></div>
        ${preview(p, S.platform)}</div>
      <div class="side">
        <div class="meta">${pill(p.status)}<span class="chip">${STAGE[p.funnel_stage] || '—'}</span><span class="chip">${esc(String(p.pillar || '').replace(/_/g, ' '))}</span><span class="chip">${fmtLabel(p)}</span></div>
        ${p.status === 'scheduled' ? `<p class="lead">Goes out <b>${when(p.scheduled_for)}</b>${p.approved_by ? `, approved by ${esc(p.approved_by)}` : ''}.</p>` : ''}
        ${p.review_note ? `<p class="note"><b>Your note:</b> ${esc(p.review_note)}</p>` : ''}
        ${p.auto_approve_at ? `<p class="note">Trust mode will approve this ${when(p.auto_approve_at)} unless you decide first.</p>` : ''}
        ${checks}${p.critic_summary ? `<p class="muted small">${esc(p.critic_summary)}</p>` : ''}
        ${actions}
        ${['scheduled', 'published', 'failed'].includes(p.status) && p.approved_at ? postKit(p) : ''}
        ${revHistory(p)}
        <details class="capedit" ${editable ? '' : 'hidden'}><summary>Edit captions</summary>
          <div class="field"><label for="f-ig">Instagram caption</label><textarea id="f-ig" rows="8">${esc(p.caption_instagram)}</textarea></div>
          <div class="field"><label for="f-tt">TikTok caption</label><textarea id="f-tt" rows="5">${esc(p.caption_tiktok)}</textarea></div>
          <button class="btn" type="button" data-do="captions">Save captions</button></details>
      </div></div>`;
  }

  // ---------- CALENDAR ----------
  function calendar() {
    const days = [...Array(14)].map((_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i); return d; });
    const sched = S.posts.filter(p => ['scheduled', 'publishing', 'published'].includes(p.status) && p.scheduled_for);
    const times = (S.settings.post_times || ['09:00']).join(', ');
    return `<p class="intro">Next 14 days. Approved posts take the next free slot (${esc(times)} ${esc(C.brand.tzLabel)}). Click a post to move it.</p>
    <div class="cal">${days.map(d => {
      const items = sched.filter(p => new Date(p.scheduled_for).toDateString() === d.toDateString());
      const isToday = d.toDateString() === new Date().toDateString();
      return `<div class="day ${isToday ? 'today' : ''} ${items.length ? '' : 'free'}"><h3><span>${d.toLocaleDateString('en-US', { weekday: 'short' })}</span> ${d.getDate()}</h3>
        ${items.map(p => `<button type="button" class="slot" data-open="${p.id}">${thumb(p)}<small>${fmt(p.scheduled_for, { hour: 'numeric', minute: '2-digit' })}</small>${p.status === 'published' ? '<i class="st ok">Live</i>' : ''}</button>`).join('') || '<p class="freeslot">Open</p>'}</div>`;
    }).join('')}</div>`;
  }

  // ---------- PUBLISHED ----------
  function published() {
    const list = S.posts.filter(p => ['published', 'publishing', 'failed'].includes(p.status)).sort((a, b) => new Date(b.published_at || b.scheduled_for || b.created_at) - new Date(a.published_at || a.scheduled_for || a.created_at));
    if (!list.length) return empty('Nothing published yet', 'Posts appear here once the publisher sends them to Instagram and TikTok, with a link to each live post and any error.');
    const plat = (p, k) => { const r = (p.publish_results || {})[k]; if (!r) return '<span class="muted">—</span>'; return r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${r.status === 'published' ? 'Live' : esc(r.status)}</a>` : `<span class="${r.status === 'failed' ? 'bad' : ''}" title="${esc(r.error || '')}">${esc(r.status || '—')}</span>`; };
    return `<div class="tablewrap"><table class="tbl"><thead><tr><th>Post</th><th>Status</th><th>When</th><th>Instagram</th><th>TikTok</th><th>YouTube</th><th></th></tr></thead><tbody>
      ${list.map(p => `<tr><td><span class="tp">${thumb(p)}<span>${esc(titleOf(p))}</span></span></td><td>${pill(p.status)}</td><td class="num">${when(p.published_at || p.scheduled_for)}</td><td>${plat(p, 'instagram')}</td><td>${plat(p, 'tiktok')}</td><td>${plat(p, 'youtube')}</td>
      <td>${p.status === 'failed' && p.approved_at ? `<button class="btn sm" type="button" data-retry="${p.id}">Retry</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
  }

  // ---------- ANALYTICS ----------
  function analytics() {
    const withM = S.posts.filter(p => p.metrics && Object.keys(p.metrics).length);
    if (!withM.length) return empty('Analytics start after the first posts go live',
      'For every post we will track reach, saves, shares, comments and follows, then explain why the winners worked (hook, look, topic, time) and feed that back into what the AI makes next.',
      `<ul class="plan"><li>Post scores and the reason behind each one</li><li>Best posting times for this audience</li><li>Which looks, hooks and products perform best</li><li>Weekly summary with what to do more and less of</li></ul>`);
    const keys = ['reach', 'likes', 'saves', 'shares', 'comments'];
    return `<div class="tablewrap"><table class="tbl"><thead><tr><th>Post</th>${keys.map(k => `<th class="num">${k}</th>`).join('')}</tr></thead><tbody>
      ${withM.map(p => `<tr><td><span class="tp">${thumb(p)}<span>${esc(titleOf(p))}</span></span></td>${keys.map(k => `<td class="num">${esc(p.metrics[k] ?? '—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  // ---------- COMPETITORS ----------
  async function competitors() {
    let rows = [];
    try { rows = await S.db.competitors(); } catch (e) { return empty('Could not load competitors', esc(e.message)); }
    if (!rows.length) return empty('Competitor tracking is being set up',
      'We will watch the brands Deep picks on Instagram and TikTok, flag posts that take off faster than usual, and show the pattern behind them (hook, format, topic) so the AI can borrow the idea, never the content.',
      `<ul class="plan"><li>Unlimited competitor accounts</li><li>Rising posts ranked by momentum</li><li>Pattern breakdown and a "make our version" button</li></ul>`);
    return `<div class="tablewrap"><table class="tbl"><thead><tr><th>Account</th><th>Platform</th><th>Posted</th><th class="num">Momentum</th><th>Pattern</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td><a href="${esc(r.post_url)}" target="_blank" rel="noopener">${esc(r.account)}</a></td><td>${esc(r.platform)}</td><td class="num">${fmt(r.posted_at, { month: 'short', day: 'numeric' })}</td><td class="num">${r.momentum_score != null ? Number(r.momentum_score).toFixed(1) : '—'}</td><td>${esc((r.pattern && (r.pattern.hook || r.pattern.summary)) || '')}</td></tr>`).join('')}</tbody></table></div>`;
  }

  // ---------- RESEARCH (soon, inside content) ----------
  function research() {
    return soonBlock({ label: 'Trends & research', kpi: 'Fresh, timely post ideas', phase: 2,
      pitch: 'What is going viral in our niche and what new research says, brought in as ideas for the content engine.',
      features: [['Viral in our niche', 'Fast-rising wellness posts on Instagram and TikTok, collected with Apify scrapers.'],
        ['New studies', 'Recent ashwagandha and shilajit studies from PubMed, checked before any claim is used in a post.']], tools: ['Apify', 'PubMed'] });
  }

  // ---------- AI LEARNING ----------
  async function learning() {
    let L; try { L = await S.db.learning(); } catch (e) { return empty('Could not load', esc(e.message)); }
    const label = c => String(c).replace(/_/g, ' ');
    const props = L.proposals.length ? L.proposals.map(a => `<article class="card prop"><header><h2>${esc(a.title)}</h2><span class="st warn">Needs your OK</span></header>
        <p class="muted small">${esc(a.summary || '')}. Your notes: ${(a.payload.notes || []).slice(0, 3).map(n => `“${esc(n)}”`).join(', ')}</p>
        <div class="field"><label for="rt-${a.id}">Rule the AI will follow (${a.payload.agent === 'art_director' ? 'images' : 'words'})</label><textarea id="rt-${a.id}" rows="3">${esc(a.payload.rule_text)}</textarea></div>
        <div class="btns"><button class="btn primary" type="button" data-rule="${a.id}" data-d="approve">Save rule</button><button class="btn ghost" type="button" data-rule="${a.id}" data-d="reject">Dismiss</button></div></article>`).join('')
      : empty('No new rules to review', 'When you ask for the same kind of change 3 times in 30 days, the AI writes a standing rule for it and asks you here before using it.');
    const rules = L.rules.length ? `<ul class="rows">${L.rules.map(r => `<li class="rule"><span class="rt"><b>${esc(r.rule_text)}</b><small>${label(r.category)} · ${r.agent === 'art_director' ? 'images' : 'words'} · since ${fmt(r.created_at, { month: 'short', day: 'numeric' })}</small></span><button class="btn sm ghost danger" type="button" data-retire="${r.id}">Turn off</button></li>`).join('')}</ul>` : '<p class="muted">No rules yet.</p>';
    const max = Math.max(1, ...L.stats.map(x => +x.times));
    const stats = L.stats.length ? `<ul class="bars">${L.stats.map(x => `<li><span>${esc(label(x.category))}</span><i style="--w:${Math.round(100 * x.times / max)}%"></i><b>${x.times}</b></li>`).join('')}</ul>` : '<p class="muted">Nothing yet. Every change request is counted here.</p>';
    return `<p class="intro">Every "Request changes" note is read by a small AI model, logged, and sent back through the full pipeline with all compliance rules. Repeated requests become rules, after you approve them.</p>
      ${props}
      <div class="cols"><section class="card"><header><h2>Rules the AI follows</h2></header>${rules}</section>
      <section class="card"><header><h2>What you ask for most</h2><span class="muted small">last 30 days</span></header>${stats}</section></div>`;
  }

  // ---------- SETTINGS ----------
  function setup() {
    const s = S.settings, isOwner = true;
    const modes = [['manual', 'Manual', 'Only posts you approve go out. If a post isn\'t approved by its slot, it waits.'],
      ['trust', 'Trust mode', `Posts that passed the design critic and claims check are approved automatically after ${s.trust_hours} hours, unless you act first.`],
      ['paused', 'Paused', 'Nothing is published, even approved posts.']];
    return `<form id="setform" class="settings">
      <fieldset class="card"><legend>Auto-send</legend>${modes.map(([v, l, d]) => `<label class="radio"><input type="radio" name="auto_mode" value="${v}" ${s.auto_mode === v ? 'checked' : ''}><span><b>${l}</b><small>${d}</small></span></label>`).join('')}
        <div class="field inline"><label for="f-th">Trust window (hours)</label><input id="f-th" name="trust_hours" type="number" min="1" max="72" value="${s.trust_hours}"></div></fieldset>
      <fieldset class="card"><legend>Posting times <small>(${esc(C.brand.tzLabel)})</small></legend>
        <div class="field"><label for="f-times">Daily slots, comma separated (24h)</label><input id="f-times" name="post_times" value="${esc((s.post_times || []).join(', '))}" inputmode="numeric" placeholder="09:00, 18:30"></div>
        <p class="muted small">One slot a day matches the current plan of one post a day. Add a second time to post twice.</p></fieldset>
      <fieldset class="card"><legend>Publishing</legend>
        <label class="radio"><input type="radio" name="publish_mode" value="manual" ${s.publish_mode !== 'auto' ? 'checked' : ''}><span><b>Manual posting</b><small>Approved posts wait for you. Post them yourself and tick each platform as posted.</small></span></label>
        <label class="radio"><input type="radio" name="publish_mode" value="auto" ${s.publish_mode === 'auto' ? 'checked' : ''}><span><b>Auto-post with Blotato</b><small>The production switch. Approved posts go out on their own at the scheduled time. Turn on only after the Blotato account is connected in n8n.</small></span></label>
      </fieldset>
      <fieldset class="card"><legend>Platforms</legend>
        ${[['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['youtube', 'YouTube Shorts']].map(([k, l]) => `<label class="check"><input type="checkbox" name="pf_${k}" ${s.platforms && s.platforms[k] ? 'checked' : ''}> ${l}</label>`).join('')}
        <div class="field"><label for="f-prov">Publishing service</label><select id="f-prov" name="provider"><option value="blotato" ${s.provider === 'blotato' ? 'selected' : ''}>Blotato</option><option value="postiz" ${s.provider === 'postiz' ? 'selected' : ''}>Postiz</option><option value="none" ${s.provider === 'none' ? 'selected' : ''}>Not connected</option></select></div>
        <p class="muted small">The publishing account is connected in n8n, never in this dashboard.</p></fieldset>
      <div class="btns"><button class="btn primary" type="submit" ${isOwner ? '' : 'disabled'}>Save settings</button></div></form>`;
  }

  // ---------- SOON ----------
  function soonBlock(m) {
    return `<section class="soonhero"><span class="st info">Coming in phase ${m.phase}</span><h1>${esc(m.label)}</h1><p>${esc(m.pitch)}</p><p class="kpi">Moves: <b>${esc(m.kpi)}</b></p></section>
      <div class="feats">${m.features.map(([t, d]) => `<article class="feat"><h3>${esc(t)}</h3><p>${esc(d)}</p></article>`).join('')}</div>
      ${m.note ? `<p class="note">${esc(m.note)}</p>` : ''}
      <p class="tools"><span class="muted">Works with</span> ${m.tools.map(t => `<span class="chip">${esc(t)}</span>`).join('')}</p>`;
  }
  const soonModule = m => soonBlock(m);

  // ---------- wiring ----------
  function wire(cur) {
    const v = $('#view');
    initCarousels(v);
    v.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { const p = S.posts.find(x => x.id === b.dataset.open); if (!p) return; S.tab = TABS.some(t => t[0] === p.status) ? p.status : 'scheduled'; S.sel = p.id; go('content-approvals'); });
    v.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; S.sel = null; render(); });
    v.querySelectorAll('[data-sel]').forEach(b => b.onclick = () => { S.sel = b.dataset.sel; render(); if (innerWidth < 900) $('.dcol', v) && $('.dcol', v).scrollIntoView({ behavior: 'smooth' }); });
    v.querySelectorAll('[data-pf]').forEach(b => b.onclick = () => { S.platform = b.dataset.pf; render(); });
    v.querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => {
      const p = S.posts.find(x => x.id === S.sel); if (!p) return;
      const t = b.dataset.copy === 'ig' ? p.caption_instagram : b.dataset.copy === 'tt' ? p.caption_tiktok : ytTitle(p);
      try { await navigator.clipboard.writeText(t || ''); toast('Copied'); } catch (e) { const ta = $(b.dataset.copy === 'tt' ? '#f-tt' : '#f-ig', v); if (ta) { ta.closest('details').open = true; ta.select(); } toast('Select the caption and copy it', 'bad'); }
    });
    v.querySelectorAll('[data-post]').forEach(b => b.onclick = () => { const k = b.dataset.post; const url = (($('#url-' + k, v) || {}).value || '').trim(); act(() => S.db.markPosted(S.sel, k, true, url), 'Marked as posted'); });
    v.querySelectorAll('[data-unpost]').forEach(b => b.onclick = () => act(() => S.db.markPosted(S.sel, b.dataset.unpost, false), 'Marked as not posted'));
    v.querySelectorAll('[data-rule]').forEach(b => b.onclick = () => { const id = b.dataset.rule, d = b.dataset.d; const t = (($('#rt-' + id, v) || {}).value || '').trim(); act(() => S.db.decideApproval(id, d, t), d === 'approve' ? 'Rule saved. The AI follows it from the next post.' : 'Proposal dismissed'); });
    v.querySelectorAll('[data-retire]').forEach(b => b.onclick = () => act(() => S.db.retireRule(b.dataset.retire), 'Rule turned off'));
    v.querySelectorAll('[data-retry]').forEach(b => b.onclick = () => act(() => S.db.retry(b.dataset.retry), 'Sent back to the publisher'));
    v.querySelectorAll('[data-do]').forEach(b => b.onclick = () => {
      const id = S.sel, d = b.dataset.do, whenV = fromLocalInput(($('#f-when', v) || {}).value);
      if (d === 'approve') return act(() => S.db.decide(id, 'approve', null, whenV), 'Approved and scheduled');
      if (d === 'changes-open') { $('.changes', v).hidden = false; $('#f-note', v).focus(); return; }
      if (d === 'changes-close') { $('.changes', v).hidden = true; return; }
      if (d === 'changes') return act(() => S.db.decide(id, 'changes', $('#f-note', v).value.trim()), 'Sent to the AI for changes');
      if (d === 'reject') return act(() => S.db.decide(id, 'reject', null), 'Post rejected');
      if (d === 'unschedule') return act(() => S.db.decide(id, 'unschedule'), 'Moved back to Waiting');
      if (d === 'reschedule') { if (!whenV) return toast('Pick a date and time', 'bad'); return act(() => S.db.updatePost(id, { when: whenV }), 'New time saved'); }
      if (d === 'captions') return act(() => S.db.updatePost(id, { ig: $('#f-ig', v).value, tt: $('#f-tt', v).value }), 'Captions saved');
      if (d === 'retry') return act(() => S.db.retry(id), 'Sent back to the publisher');
    });
    const f = $('#setform', v);
    if (f) f.onsubmit = e => {
      e.preventDefault();
      const fd = new FormData(f);
      const times = String(fd.get('post_times') || '').split(',').map(x => x.trim()).filter(Boolean);
      if (!times.length || times.some(t => !/^([01]?\d|2[0-3]):[0-5]\d$/.test(t))) return toast('Use 24-hour times like 09:00, 18:30', 'bad');
      const s = { auto_mode: fd.get('auto_mode'), publish_mode: fd.get('publish_mode') || 'manual', trust_hours: +fd.get('trust_hours'), post_times: times.map(t => t.padStart(5, '0')), provider: fd.get('provider'),
        platforms: { instagram: !!fd.get('pf_instagram'), tiktok: !!fd.get('pf_tiktok'), youtube: !!fd.get('pf_youtube') } };
      act(async () => { S.settings = { ...S.settings, ...(await S.db.saveSettings(s)) }; }, 'Settings saved');
    };
  }

  // ---------- boot ----------
  async function boot() {
    try {
      S.db = await window.OS_DATA.init();
      $('#modebadge').hidden = S.db.mode !== 'demo';
      S.user = await S.db.session();
      if (!S.user) return showLogin();
      $('#who').textContent = S.user.email;
      $('#app').hidden = false; $('#login').hidden = true;
      [S.posts, S.settings] = await Promise.all([S.db.posts(), S.db.settings()]);
      render();
    } catch (e) { $('#app').hidden = false; $('#view').innerHTML = empty('Something went wrong', esc(e.message)); }
  }
  function showLogin() {
    $('#login').hidden = false; $('#app').hidden = true;
    $('#loginform').onsubmit = async e => {
      e.preventDefault(); const email = $('#l-email').value.trim(); const msg = $('#l-msg');
      try { await S.db.signIn(email); msg.textContent = `Check ${email} for a sign-in link.`; msg.className = 'ok'; }
      catch (err) { msg.textContent = /not allowed|signups|not found/i.test(err.message) ? 'This email does not have access yet. Ask the account owner to add you.' : err.message; msg.className = 'bad'; }
    };
  }
  if (C.credit === false) $('#poweredby').hidden = true;
  $('#signout').onclick = async () => { await S.db.signOut(); location.reload(); };
  $('#menubtn').onclick = () => document.body.classList.toggle('menu-open');
  addEventListener('hashchange', () => S.settings && render());
  boot();
})();

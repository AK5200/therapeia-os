// KB sync: GitHub kb/*.md -> kb_sections (n8n Code node; output goes to a Postgres node that runs {{ $json.sql }}).
// Rules: a section is written only when its file text changed since the last sync (file_md5), so edits approved
// inside the OS survive a re-sync until the file itself changes. Sections removed from the files are retired.
const CLIENT = '3034c840-dfc2-4c85-b949-bc8d4fd69208';
const REPO = 'AK5200/therapeia-os';
const get = (url, json = true) => this.helpers.httpRequest({ url, json, headers: { 'User-Agent': 'therapeia-os-kb-sync' } });

const commit = await get(`https://api.github.com/repos/${REPO}/commits/main`);
const sha = commit.sha;
const tree = await get(`https://api.github.com/repos/${REPO}/git/trees/${sha}?recursive=1`);
const files = tree.tree.filter(t => t.type === 'blob' && /^kb\/.+\.md$/.test(t.path) && t.path !== 'kb/00-index.md');

const q = s => "'" + String(s).replace(/'/g, "''") + "'";
const rows = [], problems = [];
for (const f of files) {
  const text = await get(`https://raw.githubusercontent.com/${REPO}/${sha}/${f.path}`, false);
  const file = f.path.replace(/^kb\//, '');
  const parts = String(text).split(/^## /m).slice(1);
  for (const p of parts) {
    const nl = p.indexOf('\n');
    const head = p.slice(0, nl).trim();
    const m = head.match(/^([a-z0-9_.\-]+):\s*(.+)$/);
    const rest = p.slice(nl + 1);
    const meta = rest.match(/^for:\s*([a-z_, ]+?)\s*\|\s*edit:\s*(locked|learn|owner|retired)\s*$/m);
    if (!m || !meta) { problems.push(`${file}: bad section "${head.slice(0, 60)}"`); continue; }
    const body = rest.replace(meta[0], '').trim();
    rows.push({ id: m[1], title: m[2].trim(), file, agents: meta[1].split(',').map(s => s.trim()).filter(Boolean), edit: meta[2], body });
  }
}
const seen = new Set();
for (const r of rows) { if (seen.has(r.id)) problems.push(`duplicate id ${r.id}`); seen.add(r.id); }
if (problems.length) throw new Error('KB sync stopped, fix the files first:\n' + problems.join('\n'));

const values = rows.map(r => `(${q(CLIENT)}::uuid, ${q(r.id)}, ${q(r.file)}, ${q(r.title)}, ${q('{' + r.agents.join(',') + '}')}::text[], ${q(r.edit)}, ${q(r.body)}, md5(${q(r.title + '|' + r.agents.join(',') + '|' + r.edit + '|' + r.body)}))`).join(',\n');
const ids = '{' + rows.map(r => r.id).join(',') + '}';
const sql = `with up as (
  insert into kb_sections (client_id, id, file, title, agents, edit, body, file_md5)
  values ${values}
  on conflict (client_id, id) do update set file = excluded.file, title = excluded.title, agents = excluded.agents,
    edit = excluded.edit, body = excluded.body, file_md5 = excluded.file_md5, updated_by = 'sync:${sha.slice(0, 7)}'
  where kb_sections.file_md5 is distinct from excluded.file_md5
  returning (xmax = 0) as inserted
), gone as (
  update kb_sections set edit = 'retired', updated_by = 'sync:${sha.slice(0, 7)}'
  where client_id = ${q(CLIENT)}::uuid and edit <> 'retired' and not (id = any(${q(ids)}::text[]))
  returning id
)
select '${sha.slice(0, 7)}' as commit, ${rows.length} as sections_in_files,
  (select count(*) from up where inserted) as added, (select count(*) from up where not inserted) as updated,
  (select count(*) from gone) as retired;`;
return [{ json: { sql } }];

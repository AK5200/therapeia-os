-- Test seed: one verified KSM-66 study (checked against the full paper, PMC6979308), approved into caption-only facts.
with s as (
insert into research_studies (client_id, tier, ingredient, pmid, doi, url, title, authors, journal, year, design, participants, population, extract, dose, duration, outcomes, results, limitations, funding, citation, findings, lead_source, verify_notes)
values ('3034c840-dfc2-4c85-b949-bc8d4fd69208', 'ingredient', 'ashwagandha', '32021735', '10.7759/cureus.6466', 'https://pubmed.ncbi.nlm.nih.gov/32021735/',
 'Adaptogenic and Anxiolytic Effects of Ashwagandha Root Extract in Healthy Adults: A Double-blind, Randomized, Placebo-controlled Clinical Study',
 'Salve J, Pate S, Debnath K, Langade D', 'Cureus', 2019, 'randomized, double-blind, placebo-controlled, 8 weeks', 58,
 'adults 18-55 with high everyday stress (PSS 20 or more), no psychiatric conditions', 'KSM-66 ashwagandha root extract', '250 mg or 600 mg a day', '8 weeks',
 'Perceived Stress Scale, serum cortisol, HAM-A, sleep quality', 'PSS and serum cortisol fell more than placebo at both doses; sleep quality ratings improved',
 'small, single-site, short, per-protocol analysis', 'not stated; extract supplied by Ixoreal Biomed (KSM-66 maker)',
 'Salve et al., 2019, Cureus',
 '[{"finding":"stress scores and cortisol","safe_wording":"In an 8-week placebo-controlled study of 58 adults with high everyday stress, those taking 600 mg a day of KSM-66 ashwagandha root extract reported lower perceived stress scores and had lower serum cortisol than the placebo group."},{"finding":"sleep quality ratings","safe_wording":"In the same study, participants taking KSM-66 ashwagandha root extract rated their sleep quality better after 8 weeks than the placebo group."}]'::jsonb,
 'manual', 'Checked against the full paper (PMC6979308): KSM-66, 58 analysed, PSS 20 or more, 250/600 mg, 8 weeks.')
on conflict do nothing returning id)
select os_approve_study((select id from s), 'claude-test-seed', 'test seed for research posts') as result,
       (select count(*) from approved_facts where placement = 'caption') as caption_facts;

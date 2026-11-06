# Therapeia Zoi knowledge base

This is the single source of truth for every content agent. If a rule is not here, the agents do not know it.
Workflow nodes hold only plumbing (inputs, JSON shape); all knowledge lives in these files.

## How a section is written

Every section starts with a heading that carries a stable id, then one meta line:

    ## <id>: <title>
    for: <agents that read it> | edit: <locked | learn | owner>

- `for`: brain, copy, critic, compliance, art, image, design_critic, watcher. Agents load ONLY sections tagged for them (plus what the Brain picks for the post: one archetype, one hook, one funnel stage, one visual recipe).
- `edit`:
  - `locked`: only Anupam changes it (compliance, people rules, product facts).
  - `learn`: the learning loop may PROPOSE a change (from repeated feedback from Deep or from our own post data). A human approves it before it goes live.
  - `owner`: Deep's preferences; changes come from his approved feedback.

Ids never change once used. To retire a section, mark it `edit: retired`, do not delete it.

## File map

| File | Holds | Read by |
|---|---|---|
| brand/voice.md | Who we are, tone, words we use and avoid | brain, copy, critic |
| brand/products.md | Product facts, how each product looks, reference photos | brain, art, image, design_critic |
| compliance/rules.md | Claims law, banned words, disclaimer, testimonials, enforcement traps | copy, critic, compliance, art |
| strategy/funnel.md | Funnel stages and the CTA each allows | brain, copy, critic |
| strategy/planning.md | How the Brain picks format, archetype, hook, topic, source | brain |
| carousel/anatomy.md | Slide jobs, slide 2 re-hook, counts, text limits, captions | brain, copy, critic, art |
| carousel/archetypes.md | 15 slide-by-slide templates (one section each) | brain (list), copy + critic (the chosen one) |
| carousel/hooks.md | Hook formulas (one section each) | brain (list), copy (the chosen one) |
| carousel/rubric.md | 20-point pre-publish score | critic, watcher |
| copy/critic.md | Self-Critique agent: checks and rubric output | critic |
| copy/copywriter.md | The Copy agent's job, text limits, captions, punctuation | copy |
| visual/style.md | Brand look, palette, light, surfaces, photo realism rules | art, image |
| visual/people.md | Who may appear and how (single master copy) | art, image, design_critic |
| visual/art-director.md | Looks, cover type, type family, per-slide brief | art |
| visual/image-prompts.md | Fixed Seedream prompt blocks (looks, cameras, skin, product, safe zones) | image |
| visual/layouts.md | The layout library: one section per slide layout (composition, text position, text style, reference image in refs/) | image (the table of layouts lives in art.looks) |
| visual/recipes.md | Visual recipes (one section each) | brain (list), art (the chosen one) |
| visual/design-critic.md | How finished slides are checked | design_critic |
| platform/facts.md | Dated platform facts (limits, sizes, algorithm signals) | brain, copy, art |
| learnings/performance.md | What worked and failed for OUR posts | brain, copy |

## Where to look (for agents)

- Planning a post: strategy/planning.md, strategy/funnel.md, the lists in carousel/archetypes.md, carousel/hooks.md, visual/recipes.md, learnings/performance.md.
- Writing slides: copy/copywriter.md, carousel/anatomy.md, the chosen archetype + hook, brand/voice.md, compliance/rules.md.
- Checking a draft: carousel/rubric.md, compliance/rules.md, the chosen archetype.
- Briefing images: visual/art-director.md, visual/style.md, visual/people.md, the chosen recipe, brand/products.md.

## Where to edit (for the learning loop)

- Deep keeps asking for a tone change: brand/voice.md, section `voice.tone`.
- A hook or archetype keeps winning or losing: learnings/performance.md, then propose a change to carousel/hooks.md or carousel/archetypes.md.
- Deep rejects a visual pattern twice: learnings/performance.md `learn.visual`, then propose to visual/art-director.md.
- Never propose edits to `locked` sections. Flag them to Anupam instead.

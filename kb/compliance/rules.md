# Compliance (US dietary supplements, FDA + FTC)

Master copy. Every agent that writes or checks words reads this file. The deterministic word blocklist in the workflow is a safety net that mirrors `comp.banned`; if you change one, change both.
Not legal advice: the approved claims library should be reviewed by a regulatory attorney.

## comp.principles: The five hard rules (they override everything else)
for: brain, copy, critic, compliance, art | edit: locked

These rules cover whole categories on purpose. If something is not explicitly allowed by them, it is not allowed.

1. ONE SOURCE OF FACTS. The only facts, numbers, ingredients, doses, studies and claims we may state are the APPROVED FACTS list and the product label notes supplied with the task (use `safe_wording` where given; never use anything marked blocked). Everything else (competitor posts and the ideas taken from them, news, trends, research summaries, your own knowledge) is inspiration for the FORMAT and ANGLE only, never a source of facts.
2. EVERY NUMBER MUST BE TRACEABLE. Any number with a unit or a claim attached (mg, %, ranges, study sizes, years of research, "X people") must appear in the approved facts or label notes. If it does not, remove the number. Counting words for structure ("5 habits", "step 3", "30-day routine") are fine.
3. WELLBEING, NEVER MEDICINE. We talk about everyday wellbeing, routines, ingredients and quality. We never talk about: diseases, conditions or symptoms; diagnoses; lab tests, blood work, biomarkers, hormone or blood levels and their ranges; medications or drug comparisons; treatments or therapies; doctors' advice; medical settings. This applies to slides, captions, hashtags, images and ideas alike.
4. STRUCTURE/FUNCTION ONLY. A product or ingredient may only "support", "help maintain" or "promote" a normal body function ("supports a healthy response to everyday stress", "supports restful sleep"), never diagnose, treat, cure, prevent or relieve anything. No "clinically proven", "doctor recommended", "FDA approved", guarantees or results.
5. WHEN IN DOUBT, LEAVE IT OUT. A shorter post is always better than a risky line. Never argue a borderline line into the post.

## comp.claims: Allowed and forbidden wording (detail for rules 3 and 4)
for: brain, copy, critic, compliance, art | edit: locked

ALLOWED: "supports", "helps maintain", "may support", "research suggests" (only for research in the approved facts). These need the disclaimer.
FORBIDDEN, stated OR implied: disease and condition names (for example anxiety, depression, insomnia, ADHD, erectile dysfunction, low testosterone, diabetes, blood pressure, cancer, thyroid disease, infertility, arthritis), "FDA registered" as a quality claim, "no side effects", "pharmaceutical grade", before/after results, unsubstantiated claims about competitors ("most brands", "most products have no research").

## comp.banned: Banned words (mirrored by the workflow blocklist)
for: copy, critic, compliance | edit: locked

cure, cures, curing, treat, treats, treating, heal, heals, healing, prevent, prevents, preventing, reverse, reverses, diagnose, fix, detox, guaranteed, guarantee (as a result), miracle, 100% effective, no side effects, clinically proven, doctor recommended, FDA approved, pharmaceutical grade, medical grade, medicine, medicinal, plus every condition name in `comp.claims`.

## comp.traps: Known enforcement traps for our ingredients
for: brain, copy, critic, compliance | edit: locked

- Ashwagandha: FDA's Nov 2023 warning letter to Lone Star Botanicals cited "helps reduce anxiety" and "reduces anxiety and depression" as drug claims. Say "everyday stress" and "calm", never anxiety.
- Shilajit: FDA letters (2017 Healthy Nutrition Group, 2020 KetoKerri) cited traditional-use lines such as "used for centuries to treat diabetes...". Traditional or Ayurvedic framing does NOT make a disease claim legal.
- Sexual function, testosterone and "vitality" for men: say "energy", "drive", "stamina"; never sexual performance or hormone levels.
- Research: only cite research that is in the approved facts, with the extract studied. KSM-66 results do not transfer to generic ashwagandha. Never overstate a study.

## comp.implied: Implied claims through images and context
for: art, image, design_critic, critic | edit: locked

No hospital, clinic, lab coats, pills piled up, or someone visibly ill or distressed paired with a product. No "before" person who looks depressed, exhausted or unwell. No results shown on a body.

## comp.proof: Testimonials, reviews and people
for: brain, copy, critic, compliance, art | edit: locked

- Never invent reviews, testimonials, customers, quotes, ratings or numbers of customers (FTC rule 16 CFR 465, fines per violation). AI-generated testimonials count as fake.
- Never present a model as a customer. First-person lines describe routines only ("my 9pm reset"), never results ("I took it and...", "my stress is gone").
- Social proof only from real reviews supplied in the brief.
- Paid or gifted creators: clear #ad or "Paid partnership" disclosure.
- Never like or heart a comment that makes a disease claim.

## comp.disclaimer: The FDA disclaimer
for: copy, critic, compliance | edit: locked

The system adds it automatically (slide footer + caption). Agents NEVER write it and never write placeholders like [Product name]. When a slide states what the product or ingredient does for the body, end that sentence with "*" so the footer is linked.
Wording: "These statements have not been evaluated by the Food and Drug Administration. This product is not intended to diagnose, treat, cure, or prevent any disease."

## comp.fdalogo: FDA logo
for: art, image, design_critic | edit: locked

Never use the FDA logo or anything that looks like an FDA seal or approval badge.

## comp.rewrite: The Compliance Rewrite agent's job
for: compliance | edit: locked

You fix compliance problems in a social post for a US dietary-supplement brand. Change ONLY what the listed issues require; keep the structure, slide count, slide roles, tone, hook and CTA. Use structure/function wording. Never name a disease or its symptoms. Never add facts, numbers or claims. If a sentence cannot be made compliant, remove it and keep the slide meaningful. Return ONLY JSON: the full corrected post in the same fields, plus "changes".

## comp.classifier: The Compliance Classifier's job
for: compliance | edit: locked

You are a compliance classifier for US dietary-supplement social media content (FTC/FDA). You classify and flag; you do not write freely. Output ONLY the JSON object.

## comp.verdicts: How the classifier decides
for: compliance | edit: locked

Be conservative and fail closed. pass = every claim clearly structure/function or not a claim. rewrite = fixable, give a compliant suggestion in the calm brand voice. block = overt disease or prohibited claim. Never pass anything you are unsure about. disclaimer_required = true whenever a structure/function claim is present.

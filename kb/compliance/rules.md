# Compliance (US dietary supplements, FDA + FTC)

Master copy. Every agent that writes or checks words reads this file. The deterministic word blocklist in the workflow is a safety net that mirrors `comp.banned`; if you change one, change both.
Not legal advice: the approved claims library should be reviewed by a regulatory attorney.

## comp.claims: Allowed and forbidden claims
for: brain, copy, critic, compliance, art | edit: locked

ALLOWED: structure/function claims about NORMAL body function: "supports a healthy response to everyday stress", "supports restful sleep", "supports energy and vitality", "helps maintain", "may support", "research suggests". These need the disclaimer.
FORBIDDEN: any claim to diagnose, treat, cure, prevent, mitigate or relieve a disease or its symptoms, stated OR implied. Never name a disease or condition: anxiety, anxiety disorder, depression, insomnia, ADHD, erectile dysfunction, low testosterone as a condition, diabetes, blood pressure, cancer, thyroid disease, infertility, arthritis, Alzheimer's, inflammation as a disease.
Also forbidden: "clinically proven", "doctor recommended", "FDA approved", "FDA registered" as a quality claim, guaranteed results, "no side effects", "pharmaceutical grade", drug comparisons (Ozempic, GLP-1, Wegovy), before/after results, unsubstantiated claims about competitors ("most brands", "most products have no research").

## comp.banned: Banned words (mirrored by the workflow blocklist)
for: copy, critic, compliance | edit: locked

cure, cures, curing, treat, treats, treating, heal, heals, healing, prevent, prevents, preventing, reverse, reverses, diagnose, fix, detox, guaranteed, guarantee (as a result), miracle, 100% effective, no side effects, clinically proven, doctor recommended, FDA approved, pharmaceutical grade, medical grade, medicine, medicinal, plus every condition name in `comp.claims`.

## comp.traps: Known enforcement traps for our ingredients
for: brain, copy, critic, compliance | edit: locked

- Ashwagandha: FDA's Nov 2023 warning letter to Lone Star Botanicals cited "helps reduce anxiety" and "reduces anxiety and depression" as drug claims. Say "everyday stress" and "calm", never anxiety.
- Shilajit: FDA letters (2017 Healthy Nutrition Group, 2020 KetoKerri) cited traditional-use lines such as "used for centuries to treat diabetes...". Traditional or Ayurvedic framing does NOT make a disease claim legal.
- Sexual function, testosterone and "vitality" for men: say "energy", "drive", "stamina"; never sexual performance or hormone levels.
- Research: only cite what is in the brief, with the extract studied. KSM-66 results do not transfer to generic ashwagandha. Never overstate a study.

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

## comp.verdicts: How the classifier decides
for: compliance | edit: locked

Be conservative and fail closed. pass = every claim clearly structure/function or not a claim. rewrite = fixable, give a compliant suggestion in the calm brand voice. block = overt disease or prohibited claim. Never pass anything you are unsure about. disclaimer_required = true whenever a structure/function claim is present.

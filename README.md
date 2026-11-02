# Therapeia Zoi OS

Growth OS dashboard for Therapeia Zoi, built by Saltpilot.

- Plain HTML, CSS and JavaScript. No build step.
- Data: Supabase (row-level security; writes only through `os_*` database functions).
- Workflows: n8n (Daily Pipeline, OS · Revisions worker, OS · Publisher).

## Setup
1. Put the Supabase **publishable** key in `js/config.js` (never the service_role key).
2. Deploy the repo root as a static site (Vercel: no framework, no build command).
3. Supabase → Auth → URL Configuration: add the site URL to Site URL and Redirect URLs. Turn off new sign-ups.

Without a key the app runs in demo mode with sample posts.

`db/25-os-v1.sql` is the schema already applied to the database (kept for reference; not deployed).

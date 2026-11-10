-- Service health: kie.ai credits, Anthropic balance, Supabase usage (2026-11-10)
-- service_status : latest check per service (one row each), shown in the OS (More → Accounts & credits, Home banner)
-- service_ledger : history — daily snapshots (kie credits, Supabase bytes), Anthropic balance entries from the OS,
--                  Anthropic spend per run (logged by the pipeline), and every run stopped for low credits.

create table if not exists public.service_status (
  client_id  uuid not null references public.clients(id) on delete cascade,
  service    text not null check (service in ('kie','anthropic','supabase')),
  level      text not null default 'unknown' check (level in ('ok','low','out','unknown')),
  balance    numeric,
  unit       text,
  days_left  numeric,
  message    text,
  detail     jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  primary key (client_id, service)
);

create table if not exists public.service_ledger (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients(id) on delete cascade,
  service    text not null check (service in ('kie','anthropic','supabase')),
  kind       text not null check (kind in ('balance','spend','snapshot','stop')),
  amount     numeric,
  note       text,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists service_ledger_lookup on public.service_ledger (client_id, service, kind, created_at desc);

-- Supabase plan (limits used for the % full): 'free' = 500 MB database / 1 GB files, 'pro' = 8 GB / 100 GB
alter table public.os_settings add column if not exists supabase_plan text not null default 'free';

alter table public.service_status enable row level security;
alter table public.service_ledger enable row level security;
drop policy if exists service_status_read on public.service_status;
create policy service_status_read on public.service_status for select using (os_role(client_id) is not null);
drop policy if exists service_ledger_read on public.service_ledger;
create policy service_ledger_read on public.service_ledger for select using (os_role(client_id) is not null);
grant select on public.service_status, public.service_ledger to authenticated, anon;

-- OS: "my Anthropic balance is $X right now" (read from console.anthropic.com → Billing)
create or replace function public.os_set_anthropic_balance(p_client uuid, p_amount numeric, p_note text default null)
returns numeric language plpgsql security definer set search_path = public as $$
begin
  if not public.os_can_edit(p_client) then raise exception 'You do not have permission to change this'; end if;
  if p_amount is null or p_amount < 0 or p_amount > 100000 then raise exception 'Enter the balance in US dollars, for example 50'; end if;
  insert into service_ledger (client_id, service, kind, amount, note, created_by)
  values (p_client, 'anthropic', 'balance', p_amount, p_note, coalesce(auth.email(), 'os'));
  update service_status set balance = p_amount, level = case when p_amount <= 0 then 'out' else level end,
         message = 'Balance updated from the OS', checked_at = now()
   where client_id = p_client and service = 'anthropic';
  return p_amount;
end $$;

-- OS: Supabase plan switch ('free' | 'pro')
create or replace function public.os_set_supabase_plan(p_client uuid, p_plan text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not public.os_can_edit(p_client) then raise exception 'You do not have permission to change this'; end if;
  if p_plan not in ('free','pro') then raise exception 'Plan must be free or pro'; end if;
  update os_settings set supabase_plan = p_plan where client_id = p_client;
  return p_plan;
end $$;
grant execute on function public.os_set_anthropic_balance(uuid, numeric, text), public.os_set_supabase_plan(uuid, text) to authenticated, anon;

select 'service health ready' as status;

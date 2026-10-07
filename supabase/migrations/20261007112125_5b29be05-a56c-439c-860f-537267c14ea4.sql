create extension if not exists pg_cron;
create extension if not exists pg_net;

create table public.cron_settings (
  key text primary key,
  value text not null,
  updated_at timestamp with time zone not null default now()
);

-- Only the backend service (and the scheduled job) may read this table.
grant all on public.cron_settings to service_role;

alter table public.cron_settings enable row level security;
-- No policies: anon/authenticated get no access; service_role bypasses RLS.
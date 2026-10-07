drop extension pg_net;
create extension pg_net with schema extensions;

create policy "Service role only can manage cron settings"
  on public.cron_settings
  for all
  to service_role
  using (true)
  with check (true);
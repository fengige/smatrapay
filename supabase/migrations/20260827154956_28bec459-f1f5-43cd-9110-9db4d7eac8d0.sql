alter table public.properties
  add column if not exists property_type text not null default 'building'
  check (property_type in ('building', 'zone'));
-- Mock exercise catalogue. Re-runnable: safe to apply to an existing database.
create table if not exists exercises (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  body_region text        not null,
  description text        not null,
  created_at  timestamptz not null default now()
);

create index if not exists exercises_body_region_idx on exercises (body_region);

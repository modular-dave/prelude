-- Conversations table for server-side chat storage
create table conversations (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'New conversation',
  summary text,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_conversations_updated_at on conversations (updated_at desc);

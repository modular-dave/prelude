-- RPC: batch increment access_count, refresh last_accessed, boost decay for recalled memories
create or replace function batch_boost_memory_access(memory_ids bigint[])
returns void
language plpgsql
as $$
begin
  update memories
  set
    access_count = access_count + 1,
    last_accessed = now(),
    decay_factor = least(1.0, decay_factor + 0.05)
  where id = any(memory_ids);
end;
$$;

-- RPC: small importance boost per retrieval (rehearsal effect), capped at max
create or replace function boost_memory_importance(
  memory_id bigint,
  boost_amount double precision default 0.02,
  max_importance double precision default 1.0
)
returns void
language plpgsql
as $$
begin
  update memories
  set importance = least(max_importance, importance + boost_amount)
  where id = memory_id;
end;
$$;

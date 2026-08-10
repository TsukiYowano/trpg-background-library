create or replace function public.get_image_storage_usage()
returns bigint
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  return (
    select coalesce(sum(coalesce(file_size, 0)), 0)::bigint
    from public.images
  );
end;
$$;

create or replace function public.register_image_with_storage_limit(
  p_file_name text,
  p_storage_path text,
  p_width integer,
  p_height integer,
  p_file_size bigint
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  current_usage bigint;
  inserted_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  if p_file_size is null or p_file_size <= 0 then
    raise exception using errcode = '22023', message = 'INVALID_FILE_SIZE';
  end if;

  -- Serialize completion transactions that participate in the application limit.
  perform pg_advisory_xact_lock(hashtextextended('public.images.storage_limit', 0));

  select coalesce(sum(coalesce(file_size, 0)), 0)::bigint
    into current_usage
    from public.images;

  if current_usage + p_file_size > 9000000000 then
    raise exception using errcode = 'P0001', message = 'STORAGE_LIMIT_EXCEEDED';
  end if;

  insert into public.images (
    file_name,
    storage_path,
    uploaded_by,
    width,
    height,
    file_size
  ) values (
    p_file_name,
    p_storage_path,
    auth.uid(),
    p_width,
    p_height,
    p_file_size
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

revoke all on function public.get_image_storage_usage() from public, anon;
revoke all on function public.register_image_with_storage_limit(text, text, integer, integer, bigint) from public, anon;

grant execute on function public.get_image_storage_usage() to authenticated;
grant execute on function public.register_image_with_storage_limit(text, text, integer, integer, bigint) to authenticated;

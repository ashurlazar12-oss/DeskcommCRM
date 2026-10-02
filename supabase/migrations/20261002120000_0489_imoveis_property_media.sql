-- Imóveis property media intake: evolve the existing property gallery to support
-- tenant-scoped private image/video uploads without creating a parallel asset system.

do $rename$
begin
  if to_regprocedure('public.fn_imoveis_provisionar_phase6()') is null
     and to_regprocedure('public.fn_imoveis_provisionar()') is not null then
    alter function public.fn_imoveis_provisionar() rename to fn_imoveis_provisionar_phase6;
  end if;
end;
$rename$;

create or replace function public.fn_imoveis_provisionar()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $f$
begin
  perform public.fn_imoveis_provisionar_phase6();

  alter table public.imoveis_property_images
    add column if not exists media_type text not null default 'image',
    add column if not exists storage_path text,
    add column if not exists mime_type text,
    add column if not exists file_size_bytes bigint;

  alter table public.imoveis_property_images
    alter column image_url drop not null;

  alter table public.imoveis_property_images
    drop constraint if exists imoveis_property_images_url_check;
  alter table public.imoveis_property_images
    drop constraint if exists imoveis_property_images_media_type_check;
  alter table public.imoveis_property_images
    drop constraint if exists imoveis_property_images_source_check;
  alter table public.imoveis_property_images
    drop constraint if exists imoveis_property_images_file_size_check;

  alter table public.imoveis_property_images
    add constraint imoveis_property_images_media_type_check
      check (media_type in ('image','video')),
    add constraint imoveis_property_images_source_check
      check (
        (storage_path is not null and length(storage_path) > 0 and image_url is null)
        or
        (storage_path is null and image_url ~* '^https?://')
      ),
    add constraint imoveis_property_images_file_size_check
      check (file_size_bytes is null or (file_size_bytes > 0 and file_size_bytes <= 104857600));

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'imoveis-media',
    'imoveis-media',
    false,
    104857600,
    array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime']::text[]
  )
  on conflict (id) do update set
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists imoveis_media_select on storage.objects;
  create policy imoveis_media_select on storage.objects for select to authenticated using (
    bucket_id = 'imoveis-media'
    and cardinality(storage.foldername(name)) >= 3
    and ((storage.foldername(name))[1])::uuid in (select public.fn_user_org_ids())
  );

  drop policy if exists imoveis_media_insert on storage.objects;
  create policy imoveis_media_insert on storage.objects for insert to authenticated with check (
    bucket_id = 'imoveis-media'
    and cardinality(storage.foldername(name)) >= 3
    and ((storage.foldername(name))[1])::uuid in (select public.fn_user_org_ids())
    and public.fn_role_at_least(((storage.foldername(name))[1])::uuid, 'agent')
  );

  drop policy if exists imoveis_media_delete on storage.objects;
  create policy imoveis_media_delete on storage.objects for delete to authenticated using (
    bucket_id = 'imoveis-media'
    and cardinality(storage.foldername(name)) >= 3
    and ((storage.foldername(name))[1])::uuid in (select public.fn_user_org_ids())
    and public.fn_role_at_least(((storage.foldername(name))[1])::uuid, 'agent')
  );

  perform public.fn_proteger_modulo_provisionado();
end;
$f$;

revoke execute on function public.fn_imoveis_provisionar() from public, anon, authenticated;
grant execute on function public.fn_imoveis_provisionar() to service_role;

do $do$
begin
  if to_regclass('public.imoveis_properties') is not null then
    perform public.fn_imoveis_provisionar();
  end if;
end;
$do$;

do $f$ begin perform public.fn_reaplicar_modulos_instalados(); end $f$;
do $f$ begin perform public.fn_conferir_modulos_instalados(); end $f$;
notify pgrst, 'reload schema';

-- Phase 4 — richer property records, location and image gallery.
create or replace function public.fn_imoveis_provisionar()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $f$
begin
  create table if not exists public.imoveis_properties (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    property_code text not null default ('PROP-' || upper(substr(gen_random_uuid()::text, 1, 8))),
    status text not null default 'draft' check (status in ('draft','available','reserved','sold','rented','archived')),
    price_cents bigint not null check (price_cents >= 0),
    currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
    title text not null default '',
    property_type text not null default 'other',
    listing_type text not null default 'sale',
    description text not null default '',
    address text not null default '',
    city text not null default '',
    latitude numeric(9,6),
    longitude numeric(9,6),
    bedrooms integer not null default 0 check (bedrooms >= 0),
    bathrooms numeric(4,1) not null default 0 check (bathrooms >= 0),
    area_m2 numeric(12,2) not null default 0 check (area_m2 >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint imoveis_properties_org_code_uid unique (organization_id, property_code)
  );

  alter table public.imoveis_properties add column if not exists title text not null default '';
  alter table public.imoveis_properties add column if not exists property_type text not null default 'other';
  alter table public.imoveis_properties add column if not exists listing_type text not null default 'sale';
  alter table public.imoveis_properties add column if not exists description text not null default '';
  alter table public.imoveis_properties add column if not exists address text not null default '';
  alter table public.imoveis_properties add column if not exists city text not null default '';
  alter table public.imoveis_properties add column if not exists latitude numeric(9,6);
  alter table public.imoveis_properties add column if not exists longitude numeric(9,6);
  alter table public.imoveis_properties add column if not exists bedrooms integer not null default 0;
  alter table public.imoveis_properties add column if not exists bathrooms numeric(4,1) not null default 0;
  alter table public.imoveis_properties add column if not exists area_m2 numeric(12,2) not null default 0;

  create index if not exists imoveis_properties_org_idx on public.imoveis_properties (organization_id);
  create index if not exists imoveis_properties_status_idx on public.imoveis_properties (organization_id, status);
  create index if not exists imoveis_properties_price_idx on public.imoveis_properties (organization_id, currency, price_cents);

  create table if not exists public.imoveis_property_images (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    property_id uuid not null references public.imoveis_properties(id) on delete cascade,
    image_url text not null,
    alt_text text not null default '',
    sort_order integer not null default 0 check (sort_order >= 0),
    created_at timestamptz not null default now()
  );

  create index if not exists imoveis_property_images_property_idx
    on public.imoveis_property_images (organization_id, property_id, sort_order);

  -- Keep property/image tenancy coupled at the database boundary as well as in the server action.
  create unique index if not exists imoveis_properties_org_id_uid
    on public.imoveis_properties (organization_id, id);

  do $constraints$
  begin
    if not exists (
      select 1 from pg_constraint
       where conrelid = 'public.imoveis_properties'::regclass
         and conname = 'imoveis_properties_property_type_check'
    ) then
      alter table public.imoveis_properties
        add constraint imoveis_properties_property_type_check
        check (property_type in ('house','apartment','land','commercial','commercial_room','warehouse','other'));
    end if;

    if not exists (
      select 1 from pg_constraint
       where conrelid = 'public.imoveis_properties'::regclass
         and conname = 'imoveis_properties_listing_type_check'
    ) then
      alter table public.imoveis_properties
        add constraint imoveis_properties_listing_type_check
        check (listing_type in ('sale','rent'));
    end if;

    if not exists (
      select 1 from pg_constraint
       where conrelid = 'public.imoveis_properties'::regclass
         and conname = 'imoveis_properties_bedrooms_check'
    ) then
      alter table public.imoveis_properties
        add constraint imoveis_properties_bedrooms_check
        check (bedrooms >= 0);
    end if;

    if not exists (
      select 1 from pg_constraint
       where conrelid = 'public.imoveis_properties'::regclass
         and conname = 'imoveis_properties_latitude_check'
    ) then
      alter table public.imoveis_properties
        add constraint imoveis_properties_latitude_check
        check (latitude is null or latitude between -90 and 90);
    end if;

    if not exists (
      select 1 from pg_constraint
       where conrelid = 'public.imoveis_properties'::regclass
         and conname = 'imoveis_properties_longitude_check'
    ) then
      alter table public.imoveis_properties
        add constraint imoveis_properties_longitude_check
        check (longitude is null or longitude between -180 and 180);
    end if;

    if not exists (
      select 1 from pg_constraint
       where conrelid = 'public.imoveis_property_images'::regclass
         and conname = 'imoveis_property_images_org_property_fk'
    ) then
      alter table public.imoveis_property_images
        add constraint imoveis_property_images_org_property_fk
        foreign key (organization_id, property_id)
        references public.imoveis_properties (organization_id, id)
        on delete cascade;
    end if;

    if not exists (
      select 1 from pg_constraint
       where conrelid = 'public.imoveis_property_images'::regclass
         and conname = 'imoveis_property_images_url_check'
    ) then
      alter table public.imoveis_property_images
        add constraint imoveis_property_images_url_check
        check (image_url ~* '^https?://');
    end if;
  end $constraints$;

  alter table public.imoveis_properties enable row level security;
  alter table public.imoveis_property_images enable row level security;

  drop policy if exists imoveis_properties_select on public.imoveis_properties;
  create policy imoveis_properties_select on public.imoveis_properties for select using (
    organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin()
  );
  drop policy if exists imoveis_properties_insert on public.imoveis_properties;
  create policy imoveis_properties_insert on public.imoveis_properties for insert with check (
    public.fn_is_platform_admin() or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'agent'))
  );
  drop policy if exists imoveis_properties_update on public.imoveis_properties;
  create policy imoveis_properties_update on public.imoveis_properties for update using (
    public.fn_is_platform_admin() or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'agent'))
  ) with check (
    public.fn_is_platform_admin() or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'agent'))
  );
  drop policy if exists imoveis_properties_delete on public.imoveis_properties;
  create policy imoveis_properties_delete on public.imoveis_properties for delete using (
    public.fn_is_platform_admin() or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'manager'))
  );

  drop policy if exists imoveis_property_images_select on public.imoveis_property_images;
  create policy imoveis_property_images_select on public.imoveis_property_images for select using (
    organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin()
  );
  drop policy if exists imoveis_property_images_insert on public.imoveis_property_images;
  create policy imoveis_property_images_insert on public.imoveis_property_images for insert with check (
    public.fn_is_platform_admin() or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'agent'))
  );
  drop policy if exists imoveis_property_images_update on public.imoveis_property_images;
  create policy imoveis_property_images_update on public.imoveis_property_images for update using (
    public.fn_is_platform_admin() or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'agent'))
  ) with check (
    public.fn_is_platform_admin() or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'agent'))
  );
  drop policy if exists imoveis_property_images_delete on public.imoveis_property_images;
  create policy imoveis_property_images_delete on public.imoveis_property_images for delete using (
    public.fn_is_platform_admin() or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'agent'))
  );

  revoke all on public.imoveis_properties from anon;
  revoke all on public.imoveis_property_images from anon;
  perform public.fn_proteger_modulo_provisionado();
end;
$f$;

-- Existing installations are upgraded only when the optional module table already exists.
do $do$
begin
  if to_regclass('public.imoveis_properties') is not null then
    perform public.fn_imoveis_provisionar();
  end if;
end;
$do$;

revoke execute on function public.fn_imoveis_provisionar() from public, anon, authenticated;
grant execute on function public.fn_imoveis_provisionar() to service_role;


-- Existing installed modules must receive the Phase 4 columns/table during migration.
do $f$ begin perform public.fn_reaplicar_modulos_instalados(); end $f$;
do $f$ begin perform public.fn_conferir_modulos_instalados(); end $f$;

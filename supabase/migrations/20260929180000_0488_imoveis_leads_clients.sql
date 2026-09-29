-- Phase 6 — Imóveis integrated with CRM leads/clients.
-- No matching algorithm is introduced here. This phase creates the durable relationship
-- between the existing CRM commercial records and the Imóveis property records.

do $rename$
begin
  if to_regprocedure('public.fn_imoveis_provisionar_phase5()') is null
     and to_regprocedure('public.fn_imoveis_provisionar()') is not null then
    alter function public.fn_imoveis_provisionar() rename to fn_imoveis_provisionar_phase5;
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
  perform public.fn_imoveis_provisionar_phase5();

  create table if not exists public.imoveis_lead_properties (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    lead_id uuid not null references public.crm_leads(id) on delete cascade,
    property_id uuid not null references public.imoveis_properties(id) on delete cascade,
    relationship text not null default 'interested'
      check (relationship in ('interested', 'presented', 'rejected')),
    notes text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint imoveis_lead_properties_org_lead_property_uid
      unique (organization_id, lead_id, property_id)
  );

  create unique index if not exists imoveis_lead_properties_org_id_uid
    on public.imoveis_lead_properties (organization_id, id);

  create index if not exists imoveis_lead_properties_lead_idx
    on public.imoveis_lead_properties (organization_id, lead_id, updated_at desc);

  create index if not exists imoveis_lead_properties_property_idx
    on public.imoveis_lead_properties (organization_id, property_id, updated_at desc);

  -- Tenant-safe composite foreign keys prevent a relationship from crossing
  -- organizations even when an application writer supplies a valid UUID from elsewhere.
  do $constraints$
  begin
    alter table public.imoveis_lead_properties
      drop constraint if exists imoveis_lead_properties_lead_id_fkey;
    alter table public.imoveis_lead_properties
      drop constraint if exists imoveis_lead_properties_property_id_fkey;

    if not exists (
      select 1 from pg_constraint
       where conrelid = 'public.imoveis_lead_properties'::regclass
         and conname = 'imoveis_lead_properties_org_lead_fk'
    ) then
      alter table public.imoveis_lead_properties
        add constraint imoveis_lead_properties_org_lead_fk
        foreign key (organization_id, lead_id)
        references public.crm_leads (organization_id, id)
        on delete cascade;
    end if;

    if not exists (
      select 1 from pg_constraint
       where conrelid = 'public.imoveis_lead_properties'::regclass
         and conname = 'imoveis_lead_properties_org_property_fk'
    ) then
      alter table public.imoveis_lead_properties
        add constraint imoveis_lead_properties_org_property_fk
        foreign key (organization_id, property_id)
        references public.imoveis_properties (organization_id, id)
        on delete cascade;
    end if;
  end $constraints$;

  alter table public.imoveis_lead_properties enable row level security;

  drop policy if exists imoveis_lead_properties_select on public.imoveis_lead_properties;
  create policy imoveis_lead_properties_select
    on public.imoveis_lead_properties for select using (
      organization_id in (select public.fn_user_org_ids())
      or public.fn_is_platform_admin()
    );

  drop policy if exists imoveis_lead_properties_insert on public.imoveis_lead_properties;
  create policy imoveis_lead_properties_insert
    on public.imoveis_lead_properties for insert with check (
      public.fn_is_platform_admin()
      or (
        organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(organization_id, 'agent')
      )
    );

  drop policy if exists imoveis_lead_properties_update on public.imoveis_lead_properties;
  create policy imoveis_lead_properties_update
    on public.imoveis_lead_properties for update using (
      public.fn_is_platform_admin()
      or (
        organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(organization_id, 'agent')
      )
    ) with check (
      public.fn_is_platform_admin()
      or (
        organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(organization_id, 'agent')
      )
    );

  drop policy if exists imoveis_lead_properties_delete on public.imoveis_lead_properties;
  create policy imoveis_lead_properties_delete
    on public.imoveis_lead_properties for delete using (
      public.fn_is_platform_admin()
      or (
        organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(organization_id, 'agent')
      )
    );

  revoke all on public.imoveis_lead_properties from anon;

  drop trigger if exists trg_imoveis_lead_properties_updated_at on public.imoveis_lead_properties;
  create trigger trg_imoveis_lead_properties_updated_at
    before update on public.imoveis_lead_properties
    for each row execute function public.fn_set_updated_at();

  drop trigger if exists trg_imoveis_lead_properties_audit on public.imoveis_lead_properties;
  create trigger trg_imoveis_lead_properties_audit
    after insert or update or delete on public.imoveis_lead_properties
    for each row execute function public.fn_audit_log_row();

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

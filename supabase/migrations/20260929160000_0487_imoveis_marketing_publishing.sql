-- Phase 5 — AI marketing + Meta social publishing for the optional Imóveis module.

-- Preserve the Phase 4 provisioner and wrap it so installs/re-applies also provision Phase 5.
do $rename$
begin
  if to_regprocedure('public.fn_imoveis_provisionar_phase4()') is null
     and to_regprocedure('public.fn_imoveis_provisionar()') is not null then
    alter function public.fn_imoveis_provisionar() rename to fn_imoveis_provisionar_phase4;
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
  perform public.fn_imoveis_provisionar_phase4();

  create table if not exists public.imoveis_social_accounts (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    platform text not null check (platform in ('instagram','facebook')),
    account_name text not null,
    external_account_id text not null,
    access_token_ciphertext bytea not null,
    access_token_iv bytea not null,
    access_token_tag bytea not null,
    access_token_last4 text not null check (length(access_token_last4) between 1 and 4),
    status text not null default 'connected' check (status in ('connected','disabled')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint imoveis_social_accounts_org_external_uid unique (organization_id, platform, external_account_id)
  );
  create unique index if not exists imoveis_social_accounts_org_id_uid
    on public.imoveis_social_accounts (organization_id, id);
  create index if not exists imoveis_social_accounts_org_idx
    on public.imoveis_social_accounts (organization_id, platform, status);

  create table if not exists public.imoveis_marketing_assets (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    property_id uuid not null,
    platform text not null check (platform in ('instagram','facebook')),
    language text not null check (language in ('pt-BR','es')),
    revision integer not null default 1 check (revision > 0),
    headline text not null default '',
    caption text not null default '',
    hashtags text[] not null default '{}',
    cta text not null default '',
    alt_text text not null default '',
    status text not null default 'draft' check (status in ('draft','approved','published','failed')),
    generated_by_ai boolean not null default true,
    approved_at timestamptz,
    published_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint imoveis_marketing_assets_revision_uid
      unique (organization_id, property_id, platform, language, revision)
  );
  create unique index if not exists imoveis_marketing_assets_org_id_uid
    on public.imoveis_marketing_assets (organization_id, id);
  create index if not exists imoveis_marketing_assets_property_idx
    on public.imoveis_marketing_assets (organization_id, property_id, platform, language, revision desc);

  create table if not exists public.imoveis_publication_jobs (
    id uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    property_id uuid not null,
    marketing_asset_id uuid not null,
    social_account_id uuid not null,
    status text not null default 'pending' check (status in ('pending','publishing','published','failed','cancelled')),
    scheduled_at timestamptz not null default now(),
    provider_media_container_id text,
    external_publication_id text,
    permalink text,
    attempts integer not null default 0 check (attempts >= 0),
    next_attempt_at timestamptz,
    last_error text,
    last_enqueued_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint imoveis_publication_jobs_asset_uid unique (organization_id, social_account_id, marketing_asset_id)
  );
  create index if not exists imoveis_publication_jobs_due_idx
    on public.imoveis_publication_jobs (organization_id, status, scheduled_at, next_attempt_at, last_enqueued_at);

  do $constraints$
  begin
    if not exists (select 1 from pg_constraint where conrelid='public.imoveis_marketing_assets'::regclass and conname='imoveis_marketing_assets_org_property_fk') then
      alter table public.imoveis_marketing_assets
        add constraint imoveis_marketing_assets_org_property_fk
        foreign key (organization_id, property_id)
        references public.imoveis_properties (organization_id, id) on delete cascade;
    end if;
    if not exists (select 1 from pg_constraint where conrelid='public.imoveis_publication_jobs'::regclass and conname='imoveis_publication_jobs_org_property_fk') then
      alter table public.imoveis_publication_jobs
        add constraint imoveis_publication_jobs_org_property_fk
        foreign key (organization_id, property_id)
        references public.imoveis_properties (organization_id, id) on delete cascade;
    end if;
    if not exists (select 1 from pg_constraint where conrelid='public.imoveis_publication_jobs'::regclass and conname='imoveis_publication_jobs_org_asset_fk') then
      alter table public.imoveis_publication_jobs
        add constraint imoveis_publication_jobs_org_asset_fk
        foreign key (organization_id, marketing_asset_id)
        references public.imoveis_marketing_assets (organization_id, id) on delete cascade;
    end if;
    if not exists (select 1 from pg_constraint where conrelid='public.imoveis_publication_jobs'::regclass and conname='imoveis_publication_jobs_org_social_fk') then
      alter table public.imoveis_publication_jobs
        add constraint imoveis_publication_jobs_org_social_fk
        foreign key (organization_id, social_account_id)
        references public.imoveis_social_accounts (organization_id, id) on delete cascade;
    end if;
  end $constraints$;

  alter table public.imoveis_social_accounts enable row level security;
  alter table public.imoveis_marketing_assets enable row level security;
  alter table public.imoveis_publication_jobs enable row level security;

  drop policy if exists imoveis_social_accounts_select on public.imoveis_social_accounts;
  create policy imoveis_social_accounts_select on public.imoveis_social_accounts for select using (
    public.fn_is_platform_admin() or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id,'manager'))
  );
  drop policy if exists imoveis_social_accounts_write on public.imoveis_social_accounts;
  create policy imoveis_social_accounts_write on public.imoveis_social_accounts for all using (
    public.fn_is_platform_admin() or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id,'manager'))
  ) with check (
    public.fn_is_platform_admin() or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id,'manager'))
  );

  drop policy if exists imoveis_marketing_assets_select on public.imoveis_marketing_assets;
  create policy imoveis_marketing_assets_select on public.imoveis_marketing_assets for select using (
    public.fn_is_platform_admin() or organization_id in (select public.fn_user_org_ids())
  );
  drop policy if exists imoveis_marketing_assets_write on public.imoveis_marketing_assets;
  create policy imoveis_marketing_assets_write on public.imoveis_marketing_assets for insert with check (
    public.fn_is_platform_admin() or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id,'agent'))
  );
  drop policy if exists imoveis_marketing_assets_update on public.imoveis_marketing_assets;
  create policy imoveis_marketing_assets_update on public.imoveis_marketing_assets for update using (
    public.fn_is_platform_admin() or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id,'agent'))
  ) with check (
    public.fn_is_platform_admin() or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id,'agent'))
  );
  drop policy if exists imoveis_marketing_assets_delete on public.imoveis_marketing_assets;
  create policy imoveis_marketing_assets_delete on public.imoveis_marketing_assets for delete using (
    public.fn_is_platform_admin() or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id,'manager'))
  );

  drop policy if exists imoveis_publication_jobs_select on public.imoveis_publication_jobs;
  create policy imoveis_publication_jobs_select on public.imoveis_publication_jobs for select using (
    public.fn_is_platform_admin() or organization_id in (select public.fn_user_org_ids())
  );
  drop policy if exists imoveis_publication_jobs_write on public.imoveis_publication_jobs;
  create policy imoveis_publication_jobs_write on public.imoveis_publication_jobs for all using (
    public.fn_is_platform_admin() or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id,'manager'))
  ) with check (
    public.fn_is_platform_admin() or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id,'manager'))
  );

  revoke all on public.imoveis_social_accounts from anon, authenticated;
  revoke all on public.imoveis_marketing_assets from anon;
  revoke all on public.imoveis_publication_jobs from anon;

  drop trigger if exists trg_imoveis_social_accounts_updated_at on public.imoveis_social_accounts;
  create trigger trg_imoveis_social_accounts_updated_at before update on public.imoveis_social_accounts for each row execute function public.fn_set_updated_at();
  drop trigger if exists trg_imoveis_marketing_assets_updated_at on public.imoveis_marketing_assets;
  create trigger trg_imoveis_marketing_assets_updated_at before update on public.imoveis_marketing_assets for each row execute function public.fn_set_updated_at();
  drop trigger if exists trg_imoveis_publication_jobs_updated_at on public.imoveis_publication_jobs;
  create trigger trg_imoveis_publication_jobs_updated_at before update on public.imoveis_publication_jobs for each row execute function public.fn_set_updated_at();

  drop trigger if exists trg_imoveis_social_accounts_audit on public.imoveis_social_accounts;
  create trigger trg_imoveis_social_accounts_audit after insert or update or delete on public.imoveis_social_accounts for each row execute function public.fn_audit_log_row();
  drop trigger if exists trg_imoveis_marketing_assets_audit on public.imoveis_marketing_assets;
  create trigger trg_imoveis_marketing_assets_audit after insert or update or delete on public.imoveis_marketing_assets for each row execute function public.fn_audit_log_row();
  drop trigger if exists trg_imoveis_publication_jobs_audit on public.imoveis_publication_jobs;
  create trigger trg_imoveis_publication_jobs_audit after insert or update or delete on public.imoveis_publication_jobs for each row execute function public.fn_audit_log_row();

  perform public.fn_proteger_modulo_provisionado();
end;
$f$;

revoke execute on function public.fn_imoveis_provisionar() from public, anon, authenticated;
grant execute on function public.fn_imoveis_provisionar() to service_role;

-- Existing installations receive the same Phase 5 schema during migration.
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
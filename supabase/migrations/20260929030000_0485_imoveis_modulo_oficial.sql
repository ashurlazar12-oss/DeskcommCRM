-- 0485 — Imóveis: primeiro corte do módulo imobiliário via ADR-0002.
--
-- O módulo é de INSTALAÇÃO: esta migration cria somente a provisionadora.
-- As tabelas só nascem quando um administrador instala "imoveis" por
-- fn_modulo_instalar(). Quem não instala o módulo não recebe o schema.
--
-- Primeira superfície deliberadamente pequena:
--   - uma tabela de propriedades;
--   - isolamento por organização;
--   - escrita por agent+ e exclusão por manager+;
--   - preço e moeda genéricos (a camada de moedas/UX será tratada depois).
--
-- Não há UI, mídia, IA, leads, matching, publicação ou analytics nesta etapa.

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

    property_code text not null
      default ('PROP-' || upper(substr(gen_random_uuid()::text, 1, 8))),

    status text not null default 'draft'
      check (status in ('draft', 'available', 'reserved', 'sold', 'rented', 'archived')),

    price_cents bigint not null check (price_cents >= 0),
    currency text not null default 'USD'
      check (currency ~ '^[A-Z]{3}$'),

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint imoveis_properties_org_code_uid
      unique (organization_id, property_code)
  );

  create index if not exists imoveis_properties_org_idx
    on public.imoveis_properties (organization_id);

  create index if not exists imoveis_properties_status_idx
    on public.imoveis_properties (organization_id, status);

  create index if not exists imoveis_properties_price_idx
    on public.imoveis_properties (organization_id, currency, price_cents);

  alter table public.imoveis_properties enable row level security;

  drop policy if exists imoveis_properties_select on public.imoveis_properties;
  create policy imoveis_properties_select on public.imoveis_properties
    for select using (
      organization_id in (select public.fn_user_org_ids())
      or public.fn_is_platform_admin()
    );

  drop policy if exists imoveis_properties_insert on public.imoveis_properties;
  create policy imoveis_properties_insert on public.imoveis_properties
    for insert
    with check (
      public.fn_is_platform_admin()
      or (
        organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(organization_id, 'agent')
      )
    );

  drop policy if exists imoveis_properties_update on public.imoveis_properties;
  create policy imoveis_properties_update on public.imoveis_properties
    for update
    using (
      public.fn_is_platform_admin()
      or (
        organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(organization_id, 'agent')
      )
    )
    with check (
      public.fn_is_platform_admin()
      or (
        organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(organization_id, 'agent')
      )
    );

  drop policy if exists imoveis_properties_delete on public.imoveis_properties;
  create policy imoveis_properties_delete on public.imoveis_properties
    for delete
    using (
      public.fn_is_platform_admin()
      or (
        organization_id in (select public.fn_user_org_ids())
        and public.fn_role_at_least(organization_id, 'manager')
      )
    );

  -- O baseline dá GRANT ALL em TABLES a anon; revogar aqui é obrigatório porque
  -- esta tabela nasce dinamicamente na instalação do módulo.
  revoke all on public.imoveis_properties from anon;

  -- RLS já está ligada por nós, então esta rotina não mexe na policy ampla;
  -- ela continua aplicando as travas de suporte da ADR-0002.
  perform public.fn_proteger_modulo_provisionado();

  comment on table public.imoveis_properties is
    'Propriedades imobiliárias do módulo opcional Imóveis (ADR-0002).';

  comment on column public.imoveis_properties.price_cents is
    'Preço inteiro em centavos da moeda ISO armazenada em currency.';

  comment on column public.imoveis_properties.currency is
    'Moeda ISO 4217 em três letras; a lista de moedas servidas pela UX pode ser ampliada separadamente.';
end;
$f$;

revoke execute on function public.fn_imoveis_provisionar() from public, anon, authenticated;
grant execute on function public.fn_imoveis_provisionar() to service_role;

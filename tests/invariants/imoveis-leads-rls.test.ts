import { beforeAll, describe, expect, it } from "vitest";

import {
  GOV_AGENT_A,
  GOV_LEAD,
  GOV_ORG,
  GOV_VIEWER,
  countAs,
  seedGov,
  sql,
  writeCountAs,
} from "./gov-helpers";

const ORG_B = "e4860000-0000-4000-8000-00000000000b";
const USER_B = "e4860000-1111-4000-8000-00000000000b";
const LEAD_B = "e4860000-6666-4000-8000-00000000000b";
const PROPERTY_A = "e4860000-2222-4000-8000-000000000001";
const PROPERTY_B = "e4860000-2222-4000-8000-00000000000b";
const PROPERTY_A2 = "e4860000-2222-4000-8000-000000000002";
const LINK_A = "e4860000-7777-4000-8000-000000000001";

beforeAll(() => {
  seedGov();

  sql(`
    select public.fn_imoveis_provisionar();

    insert into auth.users (id, email)
      values ('${USER_B}', 'imoveis-leads-b@invariant.test')
      on conflict (id) do nothing;

    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${ORG_B}', 'imoveis-leads-b', 'Imoveis Leads B', 'Imoveis Leads B')
      on conflict (id) do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at)
      values ('${USER_B}', '${ORG_B}', 'manager', now())
      on conflict do nothing;

    insert into public.crm_pipelines (id, organization_id, name, slug)
      values ('e4860000-5555-4000-8000-00000000000b', '${ORG_B}', 'Imoveis B', 'imoveis-b')
      on conflict do nothing;

    insert into public.crm_stages (id, organization_id, pipeline_id, name, slug, position)
      values ('e4860000-5555-4000-8000-00000000000c', '${ORG_B}', 'e4860000-5555-4000-8000-00000000000b', 'Novo', 'novo', 1000)
      on conflict do nothing;

    insert into public.crm_leads (id, organization_id, pipeline_id, stage_id, title)
      values ('${LEAD_B}', '${ORG_B}', 'e4860000-5555-4000-8000-00000000000b', 'e4860000-5555-4000-8000-00000000000c', 'Lead B')
      on conflict do nothing;

    insert into public.imoveis_properties
      (id, organization_id, property_code, status, price_cents, currency)
      values
        ('${PROPERTY_A}', '${GOV_ORG}', 'REL-A', 'available', 25000000, 'USD'),
        ('${PROPERTY_A2}', '${GOV_ORG}', 'REL-A2', 'available', 26000000, 'USD'),
        ('${PROPERTY_B}', '${ORG_B}', 'REL-B', 'available', 30000000, 'USD')
      on conflict (id) do nothing;

    insert into public.imoveis_lead_properties
      (id, organization_id, lead_id, property_id, relationship, notes)
      values ('${LINK_A}', '${GOV_ORG}', '${GOV_LEAD}', '${PROPERTY_A}', 'interested', 'seed')
      on conflict (id) do nothing;
  `);
});

describe("Imóveis Phase 6 — leads e clientes", () => {
  it("a tabela tem RLS e anon não recebe SELECT", () => {
    expect(
      sql(`
        select relrowsecurity::text || '|' ||
               has_table_privilege('anon', 'public.imoveis_lead_properties', 'select')::text
          from pg_class
         where oid = 'public.imoveis_lead_properties'::regclass;
      `),
    ).toBe("true|false");
  });

  it("viewer lê o vínculo da própria organização", () => {
    expect(
      countAs(
        GOV_VIEWER,
        `select count(*) from public.imoveis_lead_properties where id = '${LINK_A}'`,
      ),
    ).toBe(1);
  });

  it("usuário de outra organização não lê o vínculo", () => {
    expect(
      countAs(
        USER_B,
        `select count(*) from public.imoveis_lead_properties where id = '${LINK_A}'`,
      ),
    ).toBe(0);
  });

  it("agent cria vínculo na própria organização", () => {
    const dml = `
      insert into public.imoveis_lead_properties
        (organization_id, lead_id, property_id, relationship)
      values ('${GOV_ORG}', '${GOV_LEAD}', '${PROPERTY_A2}', 'presented')
    `;
    expect(writeCountAs(GOV_AGENT_A, dml)).toBe(1);
  });

  it("usuário de outra organização não cria vínculo apontando para A", () => {
    const dml = `
      insert into public.imoveis_lead_properties
        (organization_id, lead_id, property_id, relationship)
      values ('${GOV_ORG}', '${GOV_LEAD}', '${PROPERTY_A}', 'interested')
    `;
    expect(writeCountAs(USER_B, dml)).toBe(0);
  });

  it("o vínculo é único por organização + lead + propriedade", () => {
    expect(() =>
      sql(`
        insert into public.imoveis_lead_properties
          (organization_id, lead_id, property_id, relationship)
        values ('${GOV_ORG}', '${GOV_LEAD}', '${PROPERTY_A}', 'interested');
      `),
    ).toThrow(/imoveis_lead_properties_org_lead_property_uid/);
  });

  it("a relação aceita somente o vocabulário da fase", () => {
    expect(() =>
      sql(`
        insert into public.imoveis_lead_properties
          (organization_id, lead_id, property_id, relationship)
        values ('${GOV_ORG}', '${GOV_LEAD}', '${PROPERTY_A2}', 'matched');
      `),
    ).toThrow(/imoveis_lead_properties_relationship_check|violates check constraint/);
  });

  it("remover o vínculo é permitido para agent na própria organização", () => {
    expect(
      writeCountAs(
        GOV_AGENT_A,
        `delete from public.imoveis_lead_properties where id = '${LINK_A}'`,
      ),
    ).toBe(1);
  });
});

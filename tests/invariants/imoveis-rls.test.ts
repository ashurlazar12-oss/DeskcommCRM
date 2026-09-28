import { beforeAll, describe, expect, it } from "vitest";

import {
  GOV_AGENT_A,
  GOV_MANAGER,
  GOV_ORG,
  GOV_VIEWER,
  countAs,
  seedGov,
  sql,
  writeCountAs,
} from "./gov-helpers";

const ORG_B = "e4850000-0000-4000-8000-00000000000b";
const USER_B = "e4850000-1111-4000-8000-00000000000b";
const PROPERTY_A = "e4850000-2222-4000-8000-000000000001";
const PROPERTY_B = "e4850000-2222-4000-8000-00000000000b";

beforeAll(() => {
  seedGov();

  sql(`
    select public.fn_imoveis_provisionar();

    insert into auth.users (id, email)
      values ('${USER_B}', 'imoveis-b@invariant.test')
      on conflict (id) do nothing;

    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${ORG_B}', 'imoveis-inv-b', 'Imoveis B', 'Imoveis B')
      on conflict (id) do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at)
      values ('${USER_B}', '${ORG_B}', 'manager', now())
      on conflict do nothing;

    insert into public.imoveis_properties
      (id, organization_id, property_code, status, price_cents, currency)
      values
        ('${PROPERTY_A}', '${GOV_ORG}', 'ERB-0001', 'available', 25000000, 'USD'),
        ('${PROPERTY_B}', '${ORG_B}', 'ERB-0002', 'draft', 30000000, 'USD');
  `);
});

describe("Imóveis — isolamento entre organizações", () => {
  it("a tabela nasce com RLS e sem SELECT para anon", () => {
    expect(
      sql(`
        select c.relrowsecurity::text || '|' ||
               has_table_privilege('anon', c.oid, 'select')::text
          from pg_class c
         where c.oid = 'public.imoveis_properties'::regclass;
      `),
    ).toBe("true|false");
  });

  it("usuário de B não lê a propriedade de A; usuário de A lê a sua", () => {
    expect(countAs(USER_B, `select count(*) from public.imoveis_properties where id = '${PROPERTY_A}';`)).toBe(0);
    expect(countAs(GOV_VIEWER, `select count(*) from public.imoveis_properties where id = '${PROPERTY_A}';`)).toBe(1);
  });

  it("cada organização lê apenas suas próprias linhas", () => {
    expect(countAs(USER_B, `select count(*) from public.imoveis_properties where organization_id = '${ORG_B}';`)).toBe(1);
    expect(countAs(GOV_VIEWER, `select count(*) from public.imoveis_properties where organization_id = '${ORG_B}';`)).toBe(0);
  });

  it("viewer não cria; agent cria; manager de B não escreve em A", () => {
    const insert = (code: string) =>
      `insert into public.imoveis_properties (organization_id, property_code, price_cents, currency)
        values ('${GOV_ORG}', '${code}', 10000000, 'USD')`;

    expect(writeCountAs(GOV_VIEWER, insert("ERB-VIEWER"))).toBe(0);
    expect(writeCountAs(GOV_AGENT_A, insert("ERB-AGENT"))).toBe(1);
    expect(
      writeCountAs(USER_B,
        `insert into public.imoveis_properties (organization_id, property_code, price_cents, currency)
         values ('${GOV_ORG}', 'ERB-B-ORG-A', 10000000, 'USD')`,
      ),
    ).toBe(0);
  });

  it("agent edita; manager pode apagar; agent não pode apagar", () => {
    const edit = `update public.imoveis_properties
                      set status = 'reserved'
                    where id = '${PROPERTY_A}'`;
    expect(writeCountAs(GOV_AGENT_A, edit)).toBe(1);
    expect(
      writeCountAs(GOV_AGENT_A, `delete from public.imoveis_properties where id = '${PROPERTY_A}'`),
    ).toBe(0);
    expect(
      writeCountAs(GOV_MANAGER, `delete from public.imoveis_properties where id = '${PROPERTY_A}'`),
    ).toBe(1);
  });
});

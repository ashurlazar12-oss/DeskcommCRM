import { beforeAll, describe, expect, it } from "vitest";

import {
  GOV_MANAGER,
  GOV_VIEWER,
  countAs,
  seedGov,
  sql,
  writeCountAs,
} from "./gov-helpers";

const ORG_A = "cccccccc-0000-4000-8000-000000000001";
const ORG_B = "f5850000-0000-4000-8000-00000000000b";
const USER_B = "f5850000-1111-4000-8000-00000000000b";
const PROPERTY_A = "f5850000-2222-4000-8000-000000000001";
const PROPERTY_B = "f5850000-2222-4000-8000-00000000000b";
const ACCOUNT_A = "f5850000-3333-4000-8000-000000000001";
const ACCOUNT_B = "f5850000-3333-4000-8000-00000000000b";
const ASSET_A = "f5850000-4444-4000-8000-000000000001";
const ASSET_B = "f5850000-4444-4000-8000-00000000000b";
const JOB_A = "f5850000-5555-4000-8000-000000000001";

beforeAll(() => {
  seedGov();

  sql(`
    select public.fn_imoveis_provisionar();

    insert into auth.users (id, email)
      values ('${USER_B}', 'imoveis-marketing-b@invariant.test')
      on conflict (id) do nothing;

    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${ORG_B}', 'imoveis-marketing-inv-b', 'Imoveis Marketing B', 'Imoveis Marketing B')
      on conflict (id) do nothing;

    insert into public.user_organizations (user_id, organization_id, role, accepted_at)
      values ('${USER_B}', '${ORG_B}', 'manager', now())
      on conflict do nothing;

    insert into public.imoveis_properties
      (id, organization_id, property_code, status, price_cents, currency)
      values
        ('${PROPERTY_A}', '${ORG_A}', 'MKT-0001', 'available', 25000000, 'USD'),
        ('${PROPERTY_B}', '${ORG_B}', 'MKT-0002', 'draft', 30000000, 'USD')
      on conflict (id) do nothing;

    insert into public.imoveis_social_accounts
      (id, organization_id, platform, account_name, external_account_id,
       access_token_ciphertext, access_token_iv, access_token_tag, access_token_last4)
      values
        ('${ACCOUNT_A}', '${ORG_A}', 'instagram', 'A Instagram', '1784A',
         decode('00','hex'), decode('00','hex'), decode('00','hex'), '1234'),
        ('${ACCOUNT_B}', '${ORG_B}', 'instagram', 'B Instagram', '1784B',
         decode('00','hex'), decode('00','hex'), decode('00','hex'), '1234')
      on conflict (id) do nothing;

    insert into public.imoveis_marketing_assets
      (id, organization_id, property_id, platform, language, revision,
       headline, caption, hashtags, cta, alt_text)
      values
        ('${ASSET_A}', '${ORG_A}', '${PROPERTY_A}', 'instagram', 'pt-BR', 1,
         'Casa A', 'Legenda A', array['#a'], 'Fale conosco', 'Casa A'),
        ('${ASSET_B}', '${ORG_B}', '${PROPERTY_B}', 'instagram', 'pt-BR', 1,
         'Casa B', 'Legenda B', array['#b'], 'Fale conosco', 'Casa B')
      on conflict (id) do nothing;

    insert into public.imoveis_publication_jobs
      (id, organization_id, property_id, marketing_asset_id, social_account_id)
      values ('${JOB_A}', '${ORG_A}', '${PROPERTY_A}', '${ASSET_A}', '${ACCOUNT_A}')
      on conflict (id) do nothing;
  `);
});

describe("Imóveis marketing — isolamento", () => {
  it("RLS liga nas três tabelas e anon não recebe SELECT", () => {
    expect(sql(`
      select
        (select relrowsecurity from pg_class where oid = 'public.imoveis_social_accounts'::regclass)
        and not has_table_privilege('anon', 'public.imoveis_social_accounts', 'select')
        and (select relrowsecurity from pg_class where oid = 'public.imoveis_marketing_assets'::regclass)
        and not has_table_privilege('anon', 'public.imoveis_marketing_assets', 'select')
        and (select relrowsecurity from pg_class where oid = 'public.imoveis_publication_jobs'::regclass)
        and not has_table_privilege('anon', 'public.imoveis_publication_jobs', 'select');
    `)).toBe(true);
  });

  it("viewer vê assets da própria organização, mas não contas sociais", () => {
    expect(countAs(GOV_VIEWER, `select count(*) from public.imoveis_marketing_assets where id = '${ASSET_A}'`)).toBe(1);
    expect(countAs(GOV_VIEWER, `select count(*) from public.imoveis_social_accounts where id = '${ACCOUNT_A}'`)).toBe(0);
  });

  it("manager de B não lê nem altera ativos de A", () => {
    expect(countAs(USER_B, `select count(*) from public.imoveis_marketing_assets where id = '${ASSET_A}'`)).toBe(0);
    expect(writeCountAs(USER_B, `update public.imoveis_marketing_assets set caption = 'cross' where id = '${ASSET_A}'`)).toBe(0);
  });

  it("manager de B não cria job usando conta de A", () => {
    expect(writeCountAs(USER_B, `
      insert into public.imoveis_publication_jobs
        (organization_id, property_id, marketing_asset_id, social_account_id)
      values ('${ORG_B}', '${PROPERTY_B}', '${ASSET_B}', '${ACCOUNT_A}')
    `)).toBe(0);
  });

  it("viewer não altera conta social; manager pode", () => {
    expect(writeCountAs(GOV_VIEWER, `update public.imoveis_social_accounts set status='disabled' where id='${ACCOUNT_A}'`)).toBe(0);
    expect(writeCountAs(GOV_MANAGER, `update public.imoveis_social_accounts set status='disabled' where id='${ACCOUNT_A}'`)).toBe(1);
  });

  it("job de A fica invisível para B", () => {
    expect(countAs(USER_B, `select count(*) from public.imoveis_publication_jobs where id = '${JOB_A}'`)).toBe(0);
  });
});

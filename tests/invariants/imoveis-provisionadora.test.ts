import { moldeDeProvisionadora } from "./molde-de-provisionadora";

moldeDeProvisionadora({
  modulo: "imoveis",
  tabelas: [
    "imoveis_properties",
    "imoveis_property_images",
    "imoveis_social_accounts",
    "imoveis_marketing_assets",
    "imoveis_publication_jobs",
  ],
  protecaoPropria: [
    "imoveis_properties",
    "imoveis_property_images",
    "imoveis_social_accounts",
    "imoveis_marketing_assets",
    "imoveis_publication_jobs",
  ],
});

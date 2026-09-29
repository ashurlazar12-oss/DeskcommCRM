import { moldeDeProvisionadora } from "./molde-de-provisionadora";

moldeDeProvisionadora({
  modulo: "imoveis",
  tabelas: ["imoveis_properties", "imoveis_property_images"],
  protecaoPropria: ["imoveis_properties", "imoveis_property_images"],
});

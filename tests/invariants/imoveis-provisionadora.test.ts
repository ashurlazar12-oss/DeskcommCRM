import { moldeDeProvisionadora } from "./molde-de-provisionadora";

moldeDeProvisionadora({
  modulo: "imoveis",
  tabelas: ["imoveis_properties"],
  protecaoPropria: ["imoveis_properties"],
});

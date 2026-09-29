import type { ImovelRow, ImovelStatus } from "./server";

export type ImovelFiltro = {
  busca: string;
  status: ImovelStatus | "all";
};

export function filtrarImoveis(properties: ImovelRow[], filtro: ImovelFiltro): ImovelRow[] {
  const busca = filtro.busca.trim().toLocaleLowerCase();

  return properties.filter((property) => {
    const correspondeBusca =
      !busca || property.property_code.toLocaleLowerCase().includes(busca);
    const correspondeStatus =
      filtro.status === "all" || property.status === filtro.status;

    return correspondeBusca && correspondeStatus;
  });
}

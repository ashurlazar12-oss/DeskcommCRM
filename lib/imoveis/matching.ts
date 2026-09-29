export type ImoveisMatchingProperty = {
  id: string;
  title: string;
  status: "draft" | "available" | "reserved" | "sold" | "rented" | "archived";
  price_cents: number;
  currency: string;
  property_type: string;
  listing_type: "sale" | "rent";
  city: string;
  bedrooms: number;
  bathrooms: number;
  area_m2: number;
};

export type ImoveisMatchingLead = {
  id: string;
  title: string;
  custom_fields: Record<string, unknown>;
};

export type ImoveisMatchResult = {
  lead_id: string;
  lead_title: string;
  score: number;
  reasons: string[];
  excluded: boolean;
  exclusion_reasons: string[];
};

type Criteria = {
  listingType?: string;
  propertyType?: string;
  minPriceCents?: number;
  maxPriceCents?: number;
  minBedrooms?: number;
  maxBedrooms?: number;
  minBathrooms?: number;
  minAreaM2?: number;
  city?: string;
  cities?: string[];
};

const FIELD_KEYS = {
  listingType: ["imoveis_listing_type", "listing_type"],
  propertyType: ["imoveis_property_type", "property_type"],
  minPriceCents: ["imoveis_min_price_cents", "min_price_cents"],
  maxPriceCents: ["imoveis_max_price_cents", "max_price_cents"],
  minBedrooms: ["imoveis_min_bedrooms", "min_bedrooms"],
  maxBedrooms: ["imoveis_max_bedrooms", "max_bedrooms"],
  minBathrooms: ["imoveis_min_bathrooms", "min_bathrooms"],
  minAreaM2: ["imoveis_min_area_m2", "min_area_m2"],
  city: ["imoveis_city", "city"],
  cities: ["imoveis_cities", "cities"],
} as const;

function firstValue(fields: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const value = fields[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function criteriaFrom(fields: Record<string, unknown>): Criteria {
  const citiesValue = firstValue(fields, FIELD_KEYS.cities);
  const cities = Array.isArray(citiesValue)
    ? citiesValue.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean)
    : undefined;

  return {
    listingType: stringValue(firstValue(fields, FIELD_KEYS.listingType)),
    propertyType: stringValue(firstValue(fields, FIELD_KEYS.propertyType)),
    minPriceCents: numberValue(firstValue(fields, FIELD_KEYS.minPriceCents)),
    maxPriceCents: numberValue(firstValue(fields, FIELD_KEYS.maxPriceCents)),
    minBedrooms: numberValue(firstValue(fields, FIELD_KEYS.minBedrooms)),
    maxBedrooms: numberValue(firstValue(fields, FIELD_KEYS.maxBedrooms)),
    minBathrooms: numberValue(firstValue(fields, FIELD_KEYS.minBathrooms)),
    minAreaM2: numberValue(firstValue(fields, FIELD_KEYS.minAreaM2)),
    city: stringValue(firstValue(fields, FIELD_KEYS.city)),
    cities,
  };
}

function hasCriteria(criteria: Criteria): boolean {
  return Object.values(criteria).some((value) => value !== undefined);
}

function sameText(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}

export function matchLeadToProperty(
  lead: ImoveisMatchingLead,
  property: ImoveisMatchingProperty,
): ImoveisMatchResult {
  const criteria = criteriaFrom(lead.custom_fields);
  const exclusion_reasons: string[] = [];
  const reasons: string[] = [];

  if (criteria.listingType && criteria.listingType !== property.listing_type) {
    exclusion_reasons.push(
      `Tipo de negócio incompatível: lead ${criteria.listingType}, imóvel ${property.listing_type}.`,
    );
  }
  if (criteria.propertyType && criteria.propertyType !== property.property_type) {
    exclusion_reasons.push(
      `Tipo de imóvel incompatível: lead ${criteria.propertyType}, imóvel ${property.property_type}.`,
    );
  }
  if (criteria.maxPriceCents !== undefined && property.price_cents > criteria.maxPriceCents) {
    exclusion_reasons.push("Preço acima do orçamento máximo informado.");
  }
  if (criteria.minPriceCents !== undefined && property.price_cents < criteria.minPriceCents) {
    exclusion_reasons.push("Preço abaixo do orçamento mínimo informado.");
  }
  if (criteria.minBedrooms !== undefined && property.bedrooms < criteria.minBedrooms) {
    exclusion_reasons.push("Quantidade de quartos abaixo do mínimo informado.");
  }
  if (criteria.maxBedrooms !== undefined && property.bedrooms > criteria.maxBedrooms) {
    exclusion_reasons.push("Quantidade de quartos acima do máximo informado.");
  }
  if (criteria.minBathrooms !== undefined && property.bathrooms < criteria.minBathrooms) {
    exclusion_reasons.push("Quantidade de banheiros abaixo do mínimo informado.");
  }
  if (criteria.minAreaM2 !== undefined && property.area_m2 < criteria.minAreaM2) {
    exclusion_reasons.push("Área abaixo do mínimo informado.");
  }

  const preferredCities = [
    ...(criteria.city ? [criteria.city] : []),
    ...(criteria.cities ?? []),
  ];
  if (preferredCities.length > 0) {
    if (preferredCities.some((city) => sameText(city, property.city))) {
      reasons.push("Cidade corresponde à preferência informada.");
    } else {
      exclusion_reasons.push("Cidade não está entre as preferências informadas.");
    }
  }

  if (exclusion_reasons.length > 0) {
    return {
      lead_id: lead.id,
      lead_title: lead.title,
      score: 0,
      reasons,
      excluded: true,
      exclusion_reasons,
    };
  }

  if (!hasCriteria(criteria)) {
    return {
      lead_id: lead.id,
      lead_title: lead.title,
      score: 0,
      reasons: [],
      excluded: false,
      exclusion_reasons: [],
    };
  }

  let score = 0;
  if (criteria.listingType) {
    score += 20;
    reasons.push("Finalidade do imóvel corresponde à preferência.");
  }
  if (criteria.propertyType) {
    score += 20;
    reasons.push("Tipo de imóvel corresponde à preferência.");
  }
  if (criteria.maxPriceCents !== undefined || criteria.minPriceCents !== undefined) {
    score += 20;
    reasons.push("Preço está dentro da faixa informada.");
  }
  if (criteria.minBedrooms !== undefined || criteria.maxBedrooms !== undefined) {
    score += 15;
    reasons.push("Quartos estão dentro da faixa informada.");
  }
  if (criteria.minBathrooms !== undefined) {
    score += 10;
    reasons.push("Banheiros atendem ao mínimo informado.");
  }
  if (criteria.minAreaM2 !== undefined) {
    score += 10;
    reasons.push("Área atende ao mínimo informado.");
  }
  if (preferredCities.length > 0) score += 5;

  return {
    lead_id: lead.id,
    lead_title: lead.title,
    score: Math.min(score, 100),
    reasons,
    excluded: false,
    exclusion_reasons: [],
  };
}

export function rankLeadsForProperty(
  leads: ImoveisMatchingLead[],
  property: ImoveisMatchingProperty,
): ImoveisMatchResult[] {
  return leads
    .map((lead) => matchLeadToProperty(lead, property))
    .filter((result) => !result.excluded && result.score > 0)
    .sort((a, b) => b.score - a.score || a.lead_title.localeCompare(b.lead_title))
    .slice(0, 20);
}

export function hasImoveisMatchingCriteria(fields: Record<string, unknown>): boolean {
  return Object.keys(FIELD_KEYS).some((key) =>
    FIELD_KEYS[key as keyof typeof FIELD_KEYS].some(
      (field) => fields[field] !== undefined && fields[field] !== null && fields[field] !== "",
    ),
  );
}

export const IMOVEIS_LEAD_RELATIONSHIPS = ["interested", "presented", "rejected"] as const;
export type ImoveisLeadRelationship = (typeof IMOVEIS_LEAD_RELATIONSHIPS)[number];

export type ImoveisLeadPropertyRow = {
  id: string;
  organization_id: string;
  lead_id: string;
  property_id: string;
  relationship: ImoveisLeadRelationship;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type ImoveisLeadOption = {
  id: string;
  title: string;
  status: "open" | "won" | "lost";
  contact_id: string | null;
  contact_name: string | null;
};

export type ImoveisLeadsDatabase = {
  public: {
    Tables: {
      imoveis_lead_properties: {
        Row: ImoveisLeadPropertyRow;
        Insert: Partial<ImoveisLeadPropertyRow> & {
          organization_id: string;
          lead_id: string;
          property_id: string;
        };
        Update: Partial<ImoveisLeadPropertyRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export function relationshipLabel(
  relationship: ImoveisLeadRelationship,
): string {
  switch (relationship) {
    case "interested":
      return "Interessado";
    case "presented":
      return "Apresentado";
    case "rejected":
      return "Recusado";
  }
}

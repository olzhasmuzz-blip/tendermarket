export type SubcontractBidRecord = {
  id: string;
  price: string | number;
  proposedDate: string | null;
  note: string | null;
  status: string;
  createdAt: string;
  contractor: {
    id: string;
    name: string;
    region: string | null;
    supplierProfile?: { publicName: string; averageRating: number; reviewCount: number } | null;
  };
};

export type SubcontractRecord = {
  id: string;
  number: number;
  dealId: string;
  title: string;
  targetRegion: string;
  description: string | null;
  agreedAmount: string | number;
  currency: string;
  deadline: string | null;
  status: "SEARCHING" | "AGREED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  contractTerms: string | null;
  createdAt: string;
  completedAt: string | null;
  generalSupplier: { id: string; name: string; region: string | null };
  subcontractor?: {
    id: string;
    name: string;
    region: string | null;
    supplierProfile?: { publicName: string; averageRating: number; reviewCount: number } | null;
  } | null;
  bids?: SubcontractBidRecord[];
};

export type LocalContractor = {
  id: string;
  name: string;
  region: string | null;
  supplierProfile?: {
    publicName: string;
    about: string | null;
    averageRating: number;
    reviewCount: number;
    deliveryRegions: string[];
    categories: Array<{ category: { id: string; name: string; slug: string } }>;
  } | null;
};

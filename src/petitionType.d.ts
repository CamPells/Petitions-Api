type SupportTier = {
    title: string;
    description: string;
    cost: number;
    supportTierId: number;
}

type Petition = {
    id: number;
    title: string;
    description: string;
    creation_date: Date;
    image_filename: string | null;
    owner_id: number;
    category_id: number;
}

type Supporter = {
    supportId: number;
    supportTierId: number;
    message: string;
    supporterId: number;
    supporterFirstName: string;
    supporterLastName: string;
    timestamp: string;
}
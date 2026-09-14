export interface ProductCardData {
  product_ref: string;
  title: string;
  price_cents: number;
  unit_price_cents?: number;
  unit_label?: string;
  currency: string;
  category?: string;
  subcategory?: string;
  image_url?: string;
  source?: string;
  marketplace_url?: string;
  in_stock?: boolean;
  compliance?: string[];
  price_cents_display?: string;
  unit_price_cents_display?: string;
}


/** Response model for a FeaturedPromoItem (mirrors CMS.API, camelCased by System.Text.Json). */
export interface FeaturedPromoItem {
  /** int IDENTITY PK. */
  pkid: number;
  /** DateOnly, serialised as 'YYYY-MM-DD'. */
  scheduleOn: string;
  trainingCenterPkid: number;
  /** Board slot, 1–3. */
  slot: number;
  promotionPkid: number;
  topic: string;
  description: string;
  /** Joined in from Promotion2 for display. */
  promoCode: string;
}

/** Write DTO for create/update. pkid is IDENTITY — server-assigned on create, immutable on edit. */
export interface FeaturedPromoItemRequest {
  pkid: number;
  scheduleOn: string;
  trainingCenterPkid: number;
  slot: number;
  promotionPkid: number;
  topic: string;
  description: string;
}

/** Filter DTO for POST /featured-promo-items/query — one Monday–Sunday week, one centre. */
export interface FeaturedPromoItemQuery {
  /** Any date in the wanted week; the API snaps it to that week's Monday. */
  weekStart: string;
  /** null = every training centre. */
  trainingCenterPkid?: number | null;
}

/** Body for POST /featured-promo-items/move-slot — the board's + / − links. */
export interface SlotMoveRequest {
  pkid: number;
  targetSlot: number;
}

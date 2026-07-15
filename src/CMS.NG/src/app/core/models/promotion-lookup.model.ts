/**
 * Slim Promotion2 row for the PromoCode autocomplete. Topic/Description ride along so
 * picking a code can prefill the form without a second round trip.
 */
export interface PromotionLookup {
  pkid: number;
  promoCode: string;
  topic: string;
  description: string;
}

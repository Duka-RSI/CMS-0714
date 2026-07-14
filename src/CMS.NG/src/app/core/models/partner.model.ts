/** Response model for a Partner (mirrors CMS.API Partner, camelCased by System.Text.Json). */
export interface Partner {
  /** smallint IDENTITY PK (主代碼). */
  pkid: number;
  name: string;
  appKey: string;
  nameOnPartnerMenu: string;
  nameOnCourseDetailPage: string;
  displayOrder: number;
  imageFilename: string | null;
}

/** Write DTO for create/update. pkid is IDENTITY — server-assigned on create, immutable on edit. */
export interface PartnerRequest {
  pkid: number;
  name: string;
  appKey: string;
  nameOnPartnerMenu: string;
  nameOnCourseDetailPage: string;
  displayOrder: number;
  imageFilename: string | null;
}

/** Filter DTO for POST /partners/query. */
export interface PartnerQuery {
  keyword?: string | null;
}

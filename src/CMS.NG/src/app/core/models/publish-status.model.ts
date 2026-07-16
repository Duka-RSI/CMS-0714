/** Response model for a PublishStatus (mirrors CMS.API PublishStatus, camelCased by System.Text.Json). */
export interface PublishStatus {
  /** User-assigned tinyint PK (主代碼). */
  pkid: number;
  description: string;
  isDraft: boolean;
  isPublished: boolean;
  isDiscontinued: boolean;
}

/** Write DTO for create/update. pkid is the user-assigned PK (immutable on edit). */
export interface PublishStatusRequest {
  pkid: number;
  description: string;
  isDraft: boolean;
  isPublished: boolean;
  isDiscontinued: boolean;
}

/** Filter DTO for POST /publish-statuses/query. */
export interface PublishStatusQuery {
  keyword?: string | null;
  isDraft?: boolean | null;
  isPublished?: boolean | null;
  isDiscontinued?: boolean | null;
}

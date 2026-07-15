/** Response model for a CourseGroup (mirrors CMS.API CourseGroup, camelCased by System.Text.Json). */
export interface CourseGroup {
  /** smallint IDENTITY PK (主代碼). */
  pkid: number;
  description: string;
}

/** Write DTO for create/update. pkid is IDENTITY — server-assigned on create, immutable on edit. */
export interface CourseGroupRequest {
  pkid: number;
  description: string;
}

/** Filter DTO for POST /course-groups/query. */
export interface CourseGroupQuery {
  keyword?: string | null;
}

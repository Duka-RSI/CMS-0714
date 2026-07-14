/** Response model for a CourseGroup (mirrors CMS.API CourseGroup, camelCased by System.Text.Json). */
export interface CourseGroup {
  pkid: number;
  description: string;
  /** Count of courses in this group (課程數). */
  courseCount: number;
  /** Count of PartnerCourseGroup rows referencing this group (廠商群組數). */
  partnerCourseGroupCount: number;
}

/** Write DTO for create/update. pkid is ignored on create (IDENTITY). */
export interface CourseGroupRequest {
  pkid: number;
  description: string;
}

/** Filter DTO for POST /course-groups/query. */
export interface CourseGroupQuery {
  keyword?: string | null;
}

/**
 * Response model for a Course (mirrors CMS.API Course, camelCased by System.Text.Json).
 *
 * FK labels (partnerName / courseGroupDescription / publishStatusDescription) are joined
 * in by the API — the list shows those, never the raw pkids.
 *
 * scheduleOn / scheduleOff are SQL `date` columns and arrive as 'YYYY-MM-DD'. Convert with
 * fromIsoDate/toIsoDate from core/utils/week.util — NOT via Date#toISOString, which would
 * shift the day for UTC+8. The 'Z'-suffix trick is for `datetime` columns and does not
 * apply here.
 */
export interface Course {
  pkid: number;
  title: string;
  officialTitle: string | null;
  courseId: string;
  prodCourseId: string;
  friendlyUrl: string;
  displayOrder: number;

  partnerPkid: number;
  /** Nullable FK — a course need not belong to a group. */
  courseGroupPkid: number | null;
  publishStatusPkid: number;

  scheduleOn: string;
  scheduleOff: string;
  hour: number;
  listPrice: number;
  learningCredit: number;

  material: string | null;
  objective: string | null;
  target: string | null;
  prerequisites: string | null;
  outline: string | null;
  towardCertOrExam: string | null;
  note: string | null;
  otherInfo: string | null;
  canRepeat: boolean;

  /** Joined from Partner (原廠). */
  partnerName: string;
  /** Joined from CourseGroup (課程群組). null when courseGroupPkid is null. */
  courseGroupDescription: string | null;
  /** Joined from PublishStatus (上架狀態). */
  publishStatusDescription: string;

  certificationCount: number;
  jobCategoryCount: number;

  /** N-N — populated on GET-by-id only. */
  certificationPkids: number[];
  jobCategoryPkids: number[];
}

/** Write DTO for create/update. pkid is IDENTITY — server-assigned on create, immutable on edit. */
export interface CourseRequest {
  pkid: number;
  title: string;
  officialTitle: string | null;
  courseId: string;
  prodCourseId: string;
  friendlyUrl: string;
  displayOrder: number;
  partnerPkid: number;
  courseGroupPkid: number | null;
  publishStatusPkid: number;
  scheduleOn: string;
  scheduleOff: string;
  hour: number;
  listPrice: number;
  learningCredit: number;
  material: string | null;
  objective: string | null;
  target: string | null;
  prerequisites: string | null;
  outline: string | null;
  towardCertOrExam: string | null;
  note: string | null;
  otherInfo: string | null;
  canRepeat: boolean;
  certificationPkids: number[];
  jobCategoryPkids: number[];
}

/** Filter DTO for POST /courses/query. Dates are 'YYYY-MM-DD'. */
export interface CourseQuery {
  keyword?: string | null;
  partnerPkid?: number | null;
  courseGroupPkid?: number | null;
  publishStatusPkid?: number | null;
  /** Tri-state: null = 全部, true = 允許重聽, false = 不允許. */
  canRepeat?: boolean | null;
  scheduleOnFrom?: string | null;
  scheduleOnTo?: string | null;
  scheduleOffFrom?: string | null;
  scheduleOffTo?: string | null;
}

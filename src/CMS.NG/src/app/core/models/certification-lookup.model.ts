/**
 * Slim Certification lookup row for the Course "認證" multiselect.
 *
 * title is nullable (Certification.Title is nchar(100) NULL) — the API RTRIMs it; render
 * a pkid fallback when it is null.
 */
export interface CertificationLookup {
  pkid: number;
  title: string | null;
}

/**
 * One row of a record's audit history, from GET /api/row-audits.
 *
 * `dateTime` is a SQL `datetime` stored in UTC and serialised without a zone suffix, so it
 * must be rendered with the `+ 'Z'` trick (see frontend-conventions.md) to show in local time.
 */
export interface RowAuditHistoryItem {
  dateTime: string;
  userName: string;
  actionType: string;
  actionDesc: string | null;
}

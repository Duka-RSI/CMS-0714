import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';
import { RowAuditHistoryItem } from '@app/core/models/row-audit.model';

/** Read-only access to a record's Row Audit history (GET /api/row-audits). */
@Injectable({ providedIn: 'root' })
export class RowAuditService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/row-audits`;

  /**
   * The audit trail of one record, newest first.
   * @param pkid the record's primary key; stringified because RowAudit stores it as text,
   *   so string PKs (e.g. AppRole.RoleId) pass through unchanged.
   */
  getHistory(tableName: string, pkid: string | number): Observable<RowAuditHistoryItem[]> {
    const params = new HttpParams().set('tableName', tableName).set('pkid', String(pkid));
    return this.http.get<RowAuditHistoryItem[]>(this.baseUrl, { params });
  }
}

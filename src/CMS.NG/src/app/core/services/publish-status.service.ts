import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';
import {
  PublishStatus,
  PublishStatusQuery,
  PublishStatusRequest,
} from '@app/core/models/publish-status.model';

/** Data access for the PublishStatus API. pkid is a user-assigned numeric PK. */
@Injectable({ providedIn: 'root' })
export class PublishStatusService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/publish-statuses`;

  getAll(): Observable<PublishStatus[]> {
    return this.http.get<PublishStatus[]>(this.baseUrl);
  }

  query(query: PublishStatusQuery): Observable<PublishStatus[]> {
    return this.http.post<PublishStatus[]>(`${this.baseUrl}/query`, query);
  }

  getById(pkid: number): Observable<PublishStatus> {
    return this.http.get<PublishStatus>(`${this.baseUrl}/${pkid}`);
  }

  create(request: PublishStatusRequest): Observable<PublishStatus> {
    return this.http.post<PublishStatus>(this.baseUrl, request);
  }

  update(request: PublishStatusRequest): Observable<void> {
    return this.http.put<void>(this.baseUrl, request);
  }

  delete(pkid: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${pkid}`);
  }
}

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';
import { Course, CourseQuery, CourseRequest } from '@app/core/models/course.model';

/** Data access for the Course API. pkid is an int IDENTITY numeric PK. */
@Injectable({ providedIn: 'root' })
export class CourseService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/courses`;

  getAll(): Observable<Course[]> {
    return this.http.get<Course[]>(this.baseUrl);
  }

  query(query: CourseQuery): Observable<Course[]> {
    return this.http.post<Course[]>(`${this.baseUrl}/query`, query);
  }

  getById(pkid: number): Observable<Course> {
    return this.http.get<Course>(`${this.baseUrl}/${pkid}`);
  }

  create(request: CourseRequest): Observable<Course> {
    return this.http.post<Course>(this.baseUrl, request);
  }

  update(request: CourseRequest): Observable<void> {
    return this.http.put<void>(this.baseUrl, request);
  }

  /** Rejects with 409 when CourseFAQ / CourseRelatedLink / HotCourse rows still reference it. */
  delete(pkid: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${pkid}`);
  }

  /**
   * The selected courses merged into one PDF, one course per page.
   *
   * Returns the whole `HttpResponse` rather than the blob alone: the filename the API chose
   * lives in `Content-Disposition`, and dropping it would mean inventing one on this side.
   * A POST because a 50-row selection is more ids than a URL should carry — the call is
   * read-only regardless.
   */
  exportPdf(pkids: number[]): Observable<HttpResponse<Blob>> {
    return this.http.post(`${this.baseUrl}/pdf`, { pkids }, {
      responseType: 'blob',
      observe: 'response',
    });
  }
}

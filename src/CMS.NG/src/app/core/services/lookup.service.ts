import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';
import { AppUserLookup } from '@app/core/models/app-user-lookup.model';
import { AppRoleLookup } from '@app/core/models/app-role-lookup.model';
import { PublishStatusLookup } from '@app/core/models/publish-status-lookup.model';
import { PartnerLookup } from '@app/core/models/partner-lookup.model';
import { CourseGroupLookup } from '@app/core/models/course-group-lookup.model';
import { CertificationLookup } from '@app/core/models/certification-lookup.model';
import { JobCategoryLookup } from '@app/core/models/job-category-lookup.model';
import { TrainingCenterLookup } from '@app/core/models/training-center-lookup.model';
import { PromotionLookup } from '@app/core/models/promotion-lookup.model';

/** Data access for slim lookup lists used to populate dropdowns/multiselects. */
@Injectable({ providedIn: 'root' })
export class LookupService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/lookups`;

  getAppUsers(): Observable<AppUserLookup[]> {
    return this.http.get<AppUserLookup[]>(`${this.baseUrl}/app-users`);
  }

  getAppRoles(): Observable<AppRoleLookup[]> {
    return this.http.get<AppRoleLookup[]>(`${this.baseUrl}/app-roles`);
  }

  getPublishStatuses(): Observable<PublishStatusLookup[]> {
    return this.http.get<PublishStatusLookup[]>(`${this.baseUrl}/publish-statuses`);
  }

  getPartners(): Observable<PartnerLookup[]> {
    return this.http.get<PartnerLookup[]>(`${this.baseUrl}/partners`);
  }

  getCourseGroups(): Observable<CourseGroupLookup[]> {
    return this.http.get<CourseGroupLookup[]>(`${this.baseUrl}/course-groups`);
  }

  getCertifications(): Observable<CertificationLookup[]> {
    return this.http.get<CertificationLookup[]>(`${this.baseUrl}/certifications`);
  }

  getJobCategories(): Observable<JobCategoryLookup[]> {
    return this.http.get<JobCategoryLookup[]>(`${this.baseUrl}/job-categories`);
  }

  getTrainingCenters(): Observable<TrainingCenterLookup[]> {
    return this.http.get<TrainingCenterLookup[]>(`${this.baseUrl}/training-centers`);
  }

  /** PromoCode autocomplete for the FeaturedPromoItem form; server caps the result set. */
  getPromotions(keyword?: string | null): Observable<PromotionLookup[]> {
    const params = keyword?.trim() ? { keyword: keyword.trim() } : undefined;
    return this.http.get<PromotionLookup[]>(`${this.baseUrl}/promotions`, { params });
  }
}

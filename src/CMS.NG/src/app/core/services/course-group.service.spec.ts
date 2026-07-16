import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '@env/environment';
import { CourseGroupService } from './course-group.service';
import { CourseGroup, CourseGroupRequest } from '@app/core/models/course-group.model';

describe('CourseGroupService', () => {
  let service: CourseGroupService;
  let httpMock: HttpTestingController;
  const base = `${environment.apiUrl}/course-groups`;

  const sampleGroup: CourseGroup = {
    pkid: 1,
    description: '微軟課程',
    courseCount: 12,
    partnerCourseGroupCount: 2,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CourseGroupService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CourseGroupService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getAll() issues GET /course-groups', () => {
    service.getAll().subscribe((res) => expect(res).toEqual([sampleGroup]));
    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('GET');
    req.flush([sampleGroup]);
  });

  it('query() POSTs the filter to /course-groups/query', () => {
    service.query({ keyword: '微軟' }).subscribe((res) => expect(res.length).toBe(1));
    const req = httpMock.expectOne(`${base}/query`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ keyword: '微軟' });
    req.flush([sampleGroup]);
  });

  it('getById() issues GET with the numeric pkid', () => {
    service.getById(1).subscribe((res) => expect(res).toEqual(sampleGroup));
    const req = httpMock.expectOne(`${base}/1`);
    expect(req.request.method).toBe('GET');
    req.flush(sampleGroup);
  });

  it('create() POSTs the request to /course-groups', () => {
    const request: CourseGroupRequest = { pkid: 0, description: '思科課程' };
    service.create(request).subscribe();
    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush({ ...sampleGroup, pkid: 3, description: '思科課程' });
  });

  it('update() PUTs the request to /course-groups', () => {
    const request: CourseGroupRequest = { pkid: 1, description: '微軟課程（更新）' };
    service.update(request).subscribe();
    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(request);
    req.flush(null);
  });

  it('delete() issues DELETE with the numeric pkid', () => {
    service.delete(1).subscribe();
    const req = httpMock.expectOne(`${base}/1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});

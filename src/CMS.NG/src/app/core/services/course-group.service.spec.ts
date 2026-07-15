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

  const sample: CourseGroup = {
    pkid: 1,
    description: '資訊類',
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
    service.getAll().subscribe((res) => expect(res).toEqual([sample]));
    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('GET');
    req.flush([sample]);
  });

  it('query() POSTs the filter to /course-groups/query', () => {
    service.query({ keyword: '資訊' }).subscribe((res) => expect(res.length).toBe(1));
    const req = httpMock.expectOne(`${base}/query`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ keyword: '資訊' });
    req.flush([sample]);
  });

  it('getById() issues GET /course-groups/{id}', () => {
    service.getById(1).subscribe();
    const req = httpMock.expectOne(`${base}/1`);
    expect(req.request.method).toBe('GET');
    req.flush(sample);
  });

  it('create() POSTs the request to /course-groups', () => {
    const request: CourseGroupRequest = {
      pkid: 0,
      description: '管理類',
    };
    service.create(request).subscribe();
    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush({ ...sample, pkid: 5, description: '管理類' });
  });

  it('update() PUTs the request to /course-groups', () => {
    const request: CourseGroupRequest = { ...sample };
    service.update(request).subscribe();
    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(request);
    req.flush(null);
  });

  it('delete() issues DELETE /course-groups/{id}', () => {
    service.delete(1).subscribe();
    const req = httpMock.expectOne(`${base}/1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});

import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '@env/environment';
import { CourseService } from './course.service';
import { Course, CourseRequest } from '@app/core/models/course.model';

describe('CourseService', () => {
  let service: CourseService;
  let httpMock: HttpTestingController;
  const base = `${environment.apiUrl}/courses`;

  const sample: Course = {
    pkid: 1,
    title: 'Azure 系統管理',
    officialTitle: null,
    courseId: 'AZ-104',
    prodCourseId: 'P-AZ-104',
    friendlyUrl: 'az-104',
    displayOrder: 1,
    partnerPkid: 5,
    courseGroupPkid: 3,
    publishStatusPkid: 1,
    scheduleOn: '2026-01-01',
    scheduleOff: '2036-01-01',
    hour: 35,
    listPrice: 24000,
    learningCredit: 3.5,
    material: null,
    objective: null,
    target: null,
    prerequisites: null,
    outline: null,
    towardCertOrExam: null,
    note: null,
    otherInfo: null,
    canRepeat: true,
    partnerName: '微軟',
    courseGroupDescription: '雲端系列',
    publishStatusDescription: '已上架',
    certificationCount: 2,
    jobCategoryCount: 1,
    certificationPkids: [10, 11],
    jobCategoryPkids: [7],
  };

  const request: CourseRequest = {
    pkid: 0,
    title: 'Azure 系統管理',
    officialTitle: null,
    courseId: 'AZ-104',
    prodCourseId: 'P-AZ-104',
    friendlyUrl: 'az-104',
    displayOrder: 1,
    partnerPkid: 5,
    courseGroupPkid: null,
    publishStatusPkid: 1,
    scheduleOn: '2026-01-01',
    scheduleOff: '2036-01-01',
    hour: 35,
    listPrice: 24000,
    learningCredit: 3.5,
    material: null,
    objective: null,
    target: null,
    prerequisites: null,
    outline: null,
    towardCertOrExam: null,
    note: null,
    otherInfo: null,
    canRepeat: true,
    certificationPkids: [10],
    jobCategoryPkids: [7],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CourseService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CourseService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getAll() issues GET /courses', () => {
    service.getAll().subscribe((res) => expect(res).toEqual([sample]));
    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('GET');
    req.flush([sample]);
  });

  it('query() POSTs every filter to /courses/query', () => {
    service
      .query({
        keyword: 'azure',
        partnerPkid: 5,
        courseGroupPkid: 3,
        publishStatusPkid: 1,
        canRepeat: true,
        scheduleOnFrom: '2026-01-01',
        scheduleOnTo: '2026-12-31',
        scheduleOffFrom: '2030-01-01',
        scheduleOffTo: '2040-12-31',
      })
      .subscribe((res) => expect(res.length).toBe(1));

    const req = httpMock.expectOne(`${base}/query`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.keyword).toBe('azure');
    expect(req.request.body.canRepeat).toBeTrue();
    expect(req.request.body.scheduleOnFrom).toBe('2026-01-01');
    req.flush([sample]);
  });

  it('getById() issues GET /courses/{id}', () => {
    service.getById(1).subscribe();
    const req = httpMock.expectOne(`${base}/1`);
    expect(req.request.method).toBe('GET');
    req.flush(sample);
  });

  it('create() POSTs the request, carrying a null courseGroupPkid through', () => {
    service.create(request).subscribe();
    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('POST');
    // The nullable FK must go over the wire as null, not 0 or undefined.
    expect(req.request.body.courseGroupPkid).toBeNull();
    expect(req.request.body).toEqual(request);
    req.flush(sample);
  });

  it('update() PUTs the request to /courses', () => {
    const update: CourseRequest = { ...request, pkid: 1 };
    service.update(update).subscribe();
    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(update);
    req.flush(null);
  });

  it('delete() issues DELETE /courses/{id}', () => {
    service.delete(1).subscribe();
    const req = httpMock.expectOne(`${base}/1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('delete() surfaces a 409 when child rows block it', () => {
    let status = 0;
    service.delete(1).subscribe({ error: (e) => (status = e.status) });
    httpMock
      .expectOne(`${base}/1`)
      .flush({ message: '該課程仍被 3 筆常見問題 引用，無法刪除。' }, { status: 409, statusText: 'Conflict' });
    expect(status).toBe(409);
  });
});

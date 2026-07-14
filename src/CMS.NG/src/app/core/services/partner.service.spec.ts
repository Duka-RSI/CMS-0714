import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '@env/environment';
import { PartnerService } from './partner.service';
import { Partner, PartnerRequest } from '@app/core/models/partner.model';

describe('PartnerService', () => {
  let service: PartnerService;
  let httpMock: HttpTestingController;
  const base = `${environment.apiUrl}/partners`;

  const sample: Partner = {
    pkid: 1,
    name: '微軟',
    appKey: 'MS',
    nameOnPartnerMenu: '微軟認證課程',
    nameOnCourseDetailPage: '微軟',
    displayOrder: 1,
    imageFilename: 'ms.png',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PartnerService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PartnerService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getAll() issues GET /partners', () => {
    service.getAll().subscribe((res) => expect(res).toEqual([sample]));
    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('GET');
    req.flush([sample]);
  });

  it('query() POSTs the filter to /partners/query', () => {
    service.query({ keyword: '微軟' }).subscribe((res) => expect(res.length).toBe(1));
    const req = httpMock.expectOne(`${base}/query`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ keyword: '微軟' });
    req.flush([sample]);
  });

  it('getById() issues GET /partners/{id}', () => {
    service.getById(1).subscribe();
    const req = httpMock.expectOne(`${base}/1`);
    expect(req.request.method).toBe('GET');
    req.flush(sample);
  });

  it('create() POSTs the request to /partners', () => {
    const request: PartnerRequest = {
      pkid: 0,
      name: 'Oracle',
      appKey: 'ORA',
      nameOnPartnerMenu: 'Oracle 課程',
      nameOnCourseDetailPage: 'Oracle',
      displayOrder: 2,
      imageFilename: null,
    };
    service.create(request).subscribe();
    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush({ ...sample, pkid: 5, name: 'Oracle' });
  });

  it('update() PUTs the request to /partners', () => {
    const request: PartnerRequest = { ...sample };
    service.update(request).subscribe();
    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(request);
    req.flush(null);
  });

  it('delete() issues DELETE /partners/{id}', () => {
    service.delete(1).subscribe();
    const req = httpMock.expectOne(`${base}/1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});

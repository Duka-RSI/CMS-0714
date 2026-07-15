import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '@env/environment';
import { AppUserService } from './app-user.service';
import { AppUser, AppUserRequest } from '@app/core/models/app-user.model';

describe('AppUserService', () => {
  let service: AppUserService;
  let httpMock: HttpTestingController;
  const base = `${environment.apiUrl}/app-users`;

  // UserIds are e-mail addresses — the '@' must be percent-encoded in the URL.
  const rawId = 'miles@uuu.com.tw';
  const encodedId = 'miles%40uuu.com.tw';

  const sample: AppUser = {
    pkid: 1,
    userId: rawId,
    userName: 'Miles',
    isActive: true,
    passwordUpdatedTime: null,
    roleCount: 2,
    roleIds: ['admin', 'editor'],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AppUserService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AppUserService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getAll() issues GET /app-users', () => {
    service.getAll().subscribe((res) => expect(res).toEqual([sample]));
    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('GET');
    req.flush([sample]);
  });

  it('query() POSTs the filter to /app-users/query', () => {
    service.query({ keyword: 'miles', isActive: true }).subscribe((res) => expect(res.length).toBe(1));
    const req = httpMock.expectOne(`${base}/query`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ keyword: 'miles', isActive: true });
    req.flush([sample]);
  });

  it('getById() URL-encodes the string PK', () => {
    service.getById(rawId).subscribe();
    const req = httpMock.expectOne(`${base}/${encodedId}`);
    expect(req.request.method).toBe('GET');
    req.flush(sample);
  });

  it('create() POSTs the request to /app-users and sends no password field', () => {
    const request: AppUserRequest = {
      userId: 'new@x.com',
      userName: 'New User',
      isActive: true,
      roleIds: ['editor'],
    };
    service.create(request).subscribe();
    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    // The password is server-assigned — it must never appear in the payload.
    expect(Object.keys(req.request.body as object)).not.toContain('passwordHash');
    expect(Object.keys(req.request.body as object)).not.toContain('password');
    req.flush({ ...sample, userId: 'new@x.com' });
  });

  it('update() PUTs the request to /app-users', () => {
    const request: AppUserRequest = {
      userId: rawId,
      userName: 'Miles',
      isActive: false,
      roleIds: [],
    };
    service.update(request).subscribe();
    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(request);
    req.flush(null);
  });

  it('delete() URL-encodes the string PK', () => {
    service.delete(rawId).subscribe();
    const req = httpMock.expectOne(`${base}/${encodedId}`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('resetPassword() POSTs to /app-users/{encodedId}/reset-password with no password in the body', () => {
    service.resetPassword(rawId).subscribe();
    const req = httpMock.expectOne(`${base}/${encodedId}/reset-password`);
    expect(req.request.method).toBe('POST');
    // The server owns the default password value; the client never sends one.
    expect(req.request.body).toEqual({});
    req.flush(null);
  });
});

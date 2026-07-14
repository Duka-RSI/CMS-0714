import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '@env/environment';
import { AppRoleService } from './app-role.service';
import { AppRole, AppRoleRequest } from '@app/core/models/app-role.model';

describe('AppRoleService', () => {
  let service: AppRoleService;
  let httpMock: HttpTestingController;
  const base = `${environment.apiUrl}/app-roles`;

  const sampleRole: AppRole = {
    pkid: 1,
    roleId: 'Admin',
    roleName: 'Administrator',
    permissionLevel: 1,
    description: '系統管理員',
    userCount: 3,
    userIds: ['helen', 'miles@uuu.com.tw'],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AppRoleService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AppRoleService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getAll() issues GET /app-roles', () => {
    service.getAll().subscribe((res) => expect(res).toEqual([sampleRole]));
    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('GET');
    req.flush([sampleRole]);
  });

  it('query() POSTs the filter to /app-roles/query', () => {
    service.query({ keyword: 'adm', permissionLevel: 1 }).subscribe((res) =>
      expect(res.length).toBe(1),
    );
    const req = httpMock.expectOne(`${base}/query`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ keyword: 'adm', permissionLevel: 1 });
    req.flush([sampleRole]);
  });

  it('getById() URL-encodes the string PK', () => {
    service.getById('miles@uuu.com.tw').subscribe();
    const req = httpMock.expectOne(`${base}/${encodeURIComponent('miles@uuu.com.tw')}`);
    expect(req.request.method).toBe('GET');
    req.flush(sampleRole);
  });

  it('create() POSTs the request to /app-roles', () => {
    const request: AppRoleRequest = {
      roleId: 'Editor',
      roleName: 'Editor',
      permissionLevel: 50,
      description: null,
      userIds: ['helen'],
    };
    service.create(request).subscribe();
    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush({ ...sampleRole, roleId: 'Editor' });
  });

  it('update() PUTs the request to /app-roles', () => {
    const request: AppRoleRequest = {
      roleId: 'Admin',
      roleName: 'Administrator',
      permissionLevel: 1,
      description: '系統管理員',
      userIds: [],
    };
    service.update(request).subscribe();
    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(request);
    req.flush(null);
  });

  it('delete() issues DELETE with encoded id', () => {
    service.delete('Admin').subscribe();
    const req = httpMock.expectOne(`${base}/Admin`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});

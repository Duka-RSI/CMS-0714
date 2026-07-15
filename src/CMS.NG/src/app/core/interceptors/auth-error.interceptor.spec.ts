import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { environment } from '@env/environment';
import { authErrorInterceptor } from './auth-error.interceptor';
import { AuthService } from '@app/core/services/auth.service';
import { tokenWithRoles } from '@app/testing/jwt.fixture';

describe('authErrorInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem(
      'auth-profile',
      JSON.stringify({
        userId: 'miles@uuu.com.tw',
        userName: 'Miles',
        accessToken: tokenWithRoles(['Admin']),
      }),
    );

    router = jasmine.createSpyObj<Router>('Router', ['navigate']);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authErrorInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: router },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    sessionStorage.clear();
  });

  it('clears session storage and redirects to the login page on a 401', () => {
    http.get(`${environment.apiUrl}/courses`).subscribe({ error: () => {} });

    httpMock
      .expectOne(`${environment.apiUrl}/courses`)
      .flush({ message: 'nope' }, { status: 401, statusText: 'Unauthorized' });

    expect(sessionStorage.getItem('auth-profile')).toBeNull();
    expect(TestBed.inject(AuthService).isAuthenticated()).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('re-throws the 401 so the caller still sees the failure', (done) => {
    http.get(`${environment.apiUrl}/courses`).subscribe({
      error: (err) => {
        expect(err.status).toBe(401);
        done();
      },
    });

    httpMock.expectOne(`${environment.apiUrl}/courses`).flush(null, { status: 401, statusText: 'Unauthorized' });
  });

  it('leaves the session alone when the login endpoint itself returns 401', () => {
    http.post(`${environment.apiUrl}/Auth/login`, {}).subscribe({ error: () => {} });

    httpMock
      .expectOne(`${environment.apiUrl}/Auth/login`)
      .flush({ message: '使用者代碼或密碼錯誤。' }, { status: 401, statusText: 'Unauthorized' });

    // A wrong password is not a session expiry: the login page must keep its error message
    // and must not be bounced to itself.
    expect(sessionStorage.getItem('auth-profile')).not.toBeNull();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('ignores non-401 failures', () => {
    http.get(`${environment.apiUrl}/courses`).subscribe({ error: () => {} });

    httpMock.expectOne(`${environment.apiUrl}/courses`).flush(null, { status: 500, statusText: 'Server Error' });

    expect(sessionStorage.getItem('auth-profile')).not.toBeNull();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('does not sign the user out on a 403', () => {
    http.get(`${environment.apiUrl}/app-roles`).subscribe({ error: () => {} });

    httpMock.expectOne(`${environment.apiUrl}/app-roles`).flush(null, { status: 403, statusText: 'Forbidden' });

    // 403 means "logged in but not allowed" — signing them out would be wrong.
    expect(sessionStorage.getItem('auth-profile')).not.toBeNull();
    expect(router.navigate).not.toHaveBeenCalled();
  });
});

import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '@env/environment';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '@app/core/services/auth.service';
import { tokenWithRoles } from '@app/testing/jwt.fixture';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  const token = tokenWithRoles(['Admin']);

  function setup(): void {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  }

  function signIn(): void {
    sessionStorage.setItem(
      'auth-profile',
      JSON.stringify({ userId: 'miles@uuu.com.tw', userName: 'Miles', accessToken: token }),
    );
  }

  beforeEach(() => sessionStorage.clear());
  afterEach(() => {
    httpMock.verify();
    sessionStorage.clear();
  });

  it('attaches the session token as an Authorization: Bearer header', () => {
    signIn();
    setup();

    http.get(`${environment.apiUrl}/courses`).subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/courses`);
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${token}`);
    req.flush([]);
  });

  it('sends no Authorization header when signed out', () => {
    setup();

    http.get(`${environment.apiUrl}/courses`).subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/courses`);
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush([]);
  });

  it('does not leak the token to non-API hosts', () => {
    signIn();
    setup();

    http.get('https://example.com/thing').subscribe();

    const req = httpMock.expectOne('https://example.com/thing');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({});
  });

  it('picks up a token that arrives after the interceptor was registered', () => {
    setup();
    const auth = TestBed.inject(AuthService);
    auth.login({ userId: 'miles@uuu.com.tw', password: 'CMS4fun#' }).subscribe();
    httpMock
      .expectOne(`${environment.apiUrl}/Auth/login`)
      .flush({ userId: 'miles@uuu.com.tw', userName: 'Miles', accessToken: token });

    http.get(`${environment.apiUrl}/courses`).subscribe();

    // Reads the token per request, so the first call after login is already authorized.
    const req = httpMock.expectOne(`${environment.apiUrl}/courses`);
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${token}`);
    req.flush([]);
  });
});

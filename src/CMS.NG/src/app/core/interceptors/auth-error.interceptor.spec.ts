import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { environment } from '@env/environment';
import { authErrorInterceptor, SERVER_ERROR_FALLBACK_MESSAGE } from './auth-error.interceptor';
import { AuthService } from '@app/core/services/auth.service';
import { tokenWithRoles } from '@app/testing/jwt.fixture';

describe('authErrorInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let router: jasmine.SpyObj<Router>;
  let messageService: jasmine.SpyObj<MessageService>;

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
    messageService = jasmine.createSpyObj<MessageService>('MessageService', ['add']);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authErrorInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: router },
        { provide: MessageService, useValue: messageService },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    sessionStorage.clear();
  });

  // ----- 401 → session expiry -----

  it('clears session storage and redirects to the login page on a 401', () => {
    http.get(`${environment.apiUrl}/courses`).subscribe({ error: () => {} });

    httpMock
      .expectOne(`${environment.apiUrl}/courses`)
      .flush({ message: 'nope' }, { status: 401, statusText: 'Unauthorized' });

    expect(sessionStorage.getItem('auth-profile')).toBeNull();
    expect(TestBed.inject(AuthService).isAuthenticated()).toBeFalse();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
    // A 401 is a sign-out, not a server fault — no error toast on top of the redirect.
    expect(messageService.add).not.toHaveBeenCalled();
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

  // ----- 5xx → friendly error toast -----

  it("toasts the server's safe message on a 500 without touching the session", () => {
    http.get(`${environment.apiUrl}/courses`).subscribe({ error: () => {} });

    // Deliberately NOT the fallback text, so this proves the body's message is used.
    httpMock
      .expectOne(`${environment.apiUrl}/courses`)
      .flush(
        { message: '資料庫暫時無法使用。' },
        { status: 500, statusText: 'Server Error' },
      );

    expect(messageService.add).toHaveBeenCalledWith(
      jasmine.objectContaining({
        severity: 'error',
        detail: '資料庫暫時無法使用。',
      }),
    );
    // A server fault is not a session expiry.
    expect(sessionStorage.getItem('auth-profile')).not.toBeNull();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('falls back to the generic toast when the 5xx body carries no message', () => {
    http.get(`${environment.apiUrl}/courses`).subscribe({ error: () => {} });

    // A proxy or gateway answers with an empty or non-JSON body — no { message } to show.
    httpMock
      .expectOne(`${environment.apiUrl}/courses`)
      .flush(null, { status: 503, statusText: 'Service Unavailable' });

    expect(messageService.add).toHaveBeenCalledWith(
      jasmine.objectContaining({
        severity: 'error',
        detail: SERVER_ERROR_FALLBACK_MESSAGE,
      }),
    );
  });

  it('re-throws the 500 so the caller still sees the failure', (done) => {
    http.get(`${environment.apiUrl}/courses`).subscribe({
      error: (err) => {
        expect(err.status).toBe(500);
        done();
      },
    });

    httpMock.expectOne(`${environment.apiUrl}/courses`).flush(null, { status: 500, statusText: 'Server Error' });
  });

  it('does not toast when the API is unreachable, since that is not a 5xx', () => {
    http.get(`${environment.apiUrl}/courses`).subscribe({ error: () => {} });

    // A connection failure has no HTTP status at all — Angular reports 0, which is
    // deliberately outside the >= 500 branch. Pinning it so a change here is a decision,
    // not an accident: today the caller owns this case.
    httpMock.expectOne(`${environment.apiUrl}/courses`).error(new ProgressEvent('error'));

    expect(messageService.add).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  // ----- 4xx business failures stay with the caller -----

  it('does not toast or sign the user out on a validation 400', () => {
    http.post(`${environment.apiUrl}/app-roles`, {}).subscribe({ error: () => {} });

    httpMock
      .expectOne(`${environment.apiUrl}/app-roles`)
      .flush({ errors: { roleId: ['required'] } }, { status: 400, statusText: 'Bad Request' });

    // Validation feedback belongs to the form that sent the request.
    expect(messageService.add).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('auth-profile')).not.toBeNull();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('does not sign the user out on a 403', () => {
    http.get(`${environment.apiUrl}/app-roles`).subscribe({ error: () => {} });

    httpMock.expectOne(`${environment.apiUrl}/app-roles`).flush(null, { status: 403, statusText: 'Forbidden' });

    // 403 means "logged in but not allowed" — signing them out would be wrong.
    expect(sessionStorage.getItem('auth-profile')).not.toBeNull();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(messageService.add).not.toHaveBeenCalled();
  });
});

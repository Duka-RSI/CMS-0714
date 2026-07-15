import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { environment } from '@env/environment';
import { Login } from './login';
import { AuthService } from '@app/core/services/auth.service';
import { tokenWithRoles } from '@app/testing/jwt.fixture';

describe('Login', () => {
  let fixture: ComponentFixture<Login>;
  let httpMock: HttpTestingController;
  let navigate: jasmine.Spy;
  const loginUrl = `${environment.apiUrl}/Auth/login`;

  const profile = {
    userId: 'miles@uuu.com.tw',
    userName: 'Miles',
    accessToken: tokenWithRoles(['Admin']),
  };

  beforeEach(async () => {
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Login);
    httpMock = TestBed.inject(HttpTestingController);
    navigate = spyOn(TestBed.inject(Router), 'navigateByUrl');
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
    sessionStorage.clear();
  });

  function fillIn(userId: string, password: string): void {
    fixture.componentInstance['form'].setValue({ userId, password });
  }

  const errorText = () => fixture.componentInstance['errorMessage']();

  it('does not call the API when the form is empty', () => {
    fixture.componentInstance['submit']();

    httpMock.expectNone(loginUrl);
    expect(fixture.componentInstance['form'].touched).toBeTrue();
  });

  it('posts the credentials and stores the session on success', () => {
    fillIn('miles@uuu.com.tw', 'CMS4fun#');

    fixture.componentInstance['submit']();

    const req = httpMock.expectOne(loginUrl);
    expect(req.request.body).toEqual({ userId: 'miles@uuu.com.tw', password: 'CMS4fun#' });
    req.flush(profile);

    expect(TestBed.inject(AuthService).isAuthenticated()).toBeTrue();
    expect(sessionStorage.getItem('auth-profile')).not.toBeNull();
  });

  it('navigates to a route every role can reach after signing in', () => {
    fillIn('miles@uuu.com.tw', 'CMS4fun#');

    fixture.componentInstance['submit']();
    httpMock.expectOne(loginUrl).flush(profile);

    // Not /app-roles: that is Admin-only and would 403 for most users on first paint.
    expect(navigate).toHaveBeenCalledWith('/courses');
  });

  it('shows the API message on a 401 and stays put', () => {
    fillIn('miles@uuu.com.tw', 'wrong');

    fixture.componentInstance['submit']();
    httpMock
      .expectOne(loginUrl)
      .flush({ message: '使用者代碼或密碼錯誤。' }, { status: 401, statusText: 'Unauthorized' });

    expect(errorText()).toBe('使用者代碼或密碼錯誤。');
    expect(navigate).not.toHaveBeenCalled();
    expect(TestBed.inject(AuthService).isAuthenticated()).toBeFalse();
  });

  it('falls back to a generic message when a 401 carries no body', () => {
    fillIn('miles@uuu.com.tw', 'wrong');

    fixture.componentInstance['submit']();
    httpMock.expectOne(loginUrl).flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(errorText()).toBe('使用者代碼或密碼錯誤。');
  });

  it('distinguishes a server failure from bad credentials', () => {
    fillIn('miles@uuu.com.tw', 'CMS4fun#');

    fixture.componentInstance['submit']();
    httpMock.expectOne(loginUrl).flush(null, { status: 500, statusText: 'Server Error' });

    expect(errorText()).toContain('無法連線至伺服器');
  });

  it('stops the loading state after a failure so the form can be retried', () => {
    fillIn('miles@uuu.com.tw', 'wrong');

    fixture.componentInstance['submit']();
    httpMock.expectOne(loginUrl).flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(fixture.componentInstance['submitting']()).toBeFalse();
  });
});

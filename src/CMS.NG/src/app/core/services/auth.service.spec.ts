import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '@env/environment';
import { AuthService } from './auth.service';
import { AuthProfile } from '@app/core/models/auth.model';
import { tokenWithRoles } from '@app/testing/jwt.fixture';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  const loginUrl = `${environment.apiUrl}/Auth/login`;

  const profile: AuthProfile = {
    userId: 'miles@uuu.com.tw',
    userName: 'Miles',
    accessToken: tokenWithRoles(['Admin', 'User']),
  };

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [AuthService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    sessionStorage.clear();
  });

  it('login() posts the credentials to /Auth/login', () => {
    service.login({ userId: 'miles@uuu.com.tw', password: 'CMS4fun#' }).subscribe();

    const req = httpMock.expectOne(loginUrl);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ userId: 'miles@uuu.com.tw', password: 'CMS4fun#' });
    req.flush(profile);
  });

  it('login() stores the profile in SESSION storage, not local storage', () => {
    service.login({ userId: 'miles@uuu.com.tw', password: 'CMS4fun#' }).subscribe();
    httpMock.expectOne(loginUrl).flush(profile);

    expect(JSON.parse(sessionStorage.getItem('auth-profile')!)).toEqual(profile);
    // A token left in local storage would outlive the tab — the whole point of the choice.
    expect(localStorage.getItem('auth-profile')).toBeNull();
  });

  it('exposes the token and the signed-in name after login', () => {
    service.login({ userId: 'miles@uuu.com.tw', password: 'CMS4fun#' }).subscribe();
    httpMock.expectOne(loginUrl).flush(profile);

    expect(service.token).toBe(profile.accessToken);
    expect(service.userName()).toBe('Miles');
    expect(service.isAuthenticated()).toBeTrue();
  });

  it('reads roles out of the token claims', () => {
    service.login({ userId: 'miles@uuu.com.tw', password: 'CMS4fun#' }).subscribe();
    httpMock.expectOne(loginUrl).flush(profile);

    expect(service.roles()).toEqual(['Admin', 'User']);
    expect(service.isAdmin()).toBeTrue();
  });

  it('treats a single role claim (emitted as a string, not an array) as one role', () => {
    service.login({ userId: 'u', password: 'p' }).subscribe();
    httpMock.expectOne(loginUrl).flush({ ...profile, accessToken: tokenWithRoles('User') });

    expect(service.roles()).toEqual(['User']);
    expect(service.isAdmin()).toBeFalse();
  });

  it('reports no roles for a token without a role claim', () => {
    service.login({ userId: 'u', password: 'p' }).subscribe();
    httpMock.expectOne(loginUrl).flush({ ...profile, accessToken: tokenWithRoles(undefined) });

    expect(service.roles()).toEqual([]);
    expect(service.isAdmin()).toBeFalse();
  });

  it('reports no roles for a malformed token instead of throwing', () => {
    service.login({ userId: 'u', password: 'p' }).subscribe();
    httpMock.expectOne(loginUrl).flush({ ...profile, accessToken: 'not-a-jwt' });

    expect(service.roles()).toEqual([]);
    expect(service.isAuthenticated()).toBeTrue();
  });

  it('decodes a non-ASCII UserName claim correctly', () => {
    const token = tokenWithRoles(['User'], { name: '孫小明' });
    service.login({ userId: 'u', password: 'p' }).subscribe();
    httpMock.expectOne(loginUrl).flush({ ...profile, accessToken: token });

    // Guards the UTF-8 decode — plain atob() would mangle this.
    expect(service.roles()).toEqual(['User']);
  });

  it('updateUserName() puts only the userName to /Auth/profile', () => {
    service.login({ userId: 'u', password: 'p' }).subscribe();
    httpMock.expectOne(loginUrl).flush(profile);

    service.updateUserName('Miles Sun').subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/Auth/profile`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ userName: 'Miles Sun' });
    req.flush({ userId: 'miles@uuu.com.tw', userName: 'Miles Sun' });
  });

  it('updateUserName() folds the stored name into the session', () => {
    service.login({ userId: 'u', password: 'p' }).subscribe();
    httpMock.expectOne(loginUrl).flush(profile);

    service.updateUserName('  Miles Sun  ').subscribe();
    httpMock
      .expectOne(`${environment.apiUrl}/Auth/profile`)
      .flush({ userId: 'miles@uuu.com.tw', userName: 'Miles Sun' });

    // The server's trimmed value wins over what was typed.
    expect(service.userName()).toBe('Miles Sun');
    expect(JSON.parse(sessionStorage.getItem('auth-profile')!).userName).toBe('Miles Sun');
  });

  it('updateUserName() leaves the token, and therefore the roles, alone', () => {
    service.login({ userId: 'u', password: 'p' }).subscribe();
    httpMock.expectOne(loginUrl).flush(profile);

    service.updateUserName('Miles Sun').subscribe();
    httpMock
      .expectOne(`${environment.apiUrl}/Auth/profile`)
      .flush({ userId: 'miles@uuu.com.tw', userName: 'Miles Sun' });

    expect(service.token).toBe(profile.accessToken);
    expect(service.roles()).toEqual(['Admin', 'User']);
    expect(JSON.parse(sessionStorage.getItem('auth-profile')!).userId).toBe('miles@uuu.com.tw');
  });

  it('updateUserName() does not resurrect a session after logout', () => {
    service.updateUserName('Ghost').subscribe();
    httpMock
      .expectOne(`${environment.apiUrl}/Auth/profile`)
      .flush({ userId: 'ghost', userName: 'Ghost' });

    // Signed out: nothing to fold the name into, and no session invented.
    expect(service.isAuthenticated()).toBeFalse();
    expect(sessionStorage.getItem('auth-profile')).toBeNull();
  });

  it('logout() clears session storage and the profile', () => {
    service.login({ userId: 'u', password: 'p' }).subscribe();
    httpMock.expectOne(loginUrl).flush(profile);

    service.logout();

    expect(sessionStorage.getItem('auth-profile')).toBeNull();
    expect(service.isAuthenticated()).toBeFalse();
    expect(service.token).toBeNull();
  });

  it('restores an existing session from session storage on construction', () => {
    sessionStorage.setItem('auth-profile', JSON.stringify(profile));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [AuthService, provideHttpClient(), provideHttpClientTesting()],
    });

    // A page reload must not sign the user out.
    const restored = TestBed.inject(AuthService);
    expect(restored.isAuthenticated()).toBeTrue();
    expect(restored.userName()).toBe('Miles');
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('ignores junk in session storage', () => {
    sessionStorage.setItem('auth-profile', '{not json');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [AuthService, provideHttpClient(), provideHttpClientTesting()],
    });

    expect(TestBed.inject(AuthService).isAuthenticated()).toBeFalse();
    httpMock = TestBed.inject(HttpTestingController);
  });
});

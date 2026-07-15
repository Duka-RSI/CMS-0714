import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { authGuard } from './auth.guard';
import { tokenWithRoles } from '@app/testing/jwt.fixture';

describe('authGuard', () => {
  let router: Router;

  /** The guard takes no arguments, but CanActivateFn's signature demands these. */
  const run = () =>
    TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    router = TestBed.inject(Router);
  });

  afterEach(() => sessionStorage.clear());

  it('redirects to the login page when there is no token', () => {
    const result = run();

    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe(router.createUrlTree(['/login']).toString());
  });

  it('allows the route when a token is in session storage', () => {
    sessionStorage.setItem(
      'auth-profile',
      JSON.stringify({
        userId: 'miles@uuu.com.tw',
        userName: 'Miles',
        accessToken: tokenWithRoles(['User']),
      }),
    );

    expect(run()).toBeTrue();
  });

  it('redirects when the stored profile has no token', () => {
    sessionStorage.setItem(
      'auth-profile',
      JSON.stringify({ userId: 'miles@uuu.com.tw', userName: 'Miles', accessToken: '' }),
    );

    expect(run()).toBeInstanceOf(UrlTree);
  });
});

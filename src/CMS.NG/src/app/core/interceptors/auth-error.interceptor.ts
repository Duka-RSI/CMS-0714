import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { environment } from '@env/environment';
import { AuthService } from '@app/core/services/auth.service';

const LOGIN_URL = `${environment.apiUrl}/Auth/login`;

/**
 * Turns a rejected token into a sign-out: clears the session and returns to the login page.
 * Covers the expired-token case, which the client cannot detect on its own.
 *
 * The login endpoint is exempt — its 401 means "wrong password", which the login page
 * needs to report. Treating it as a session expiry would clear a session that never
 * existed and swallow the message.
 */
export const authErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !req.url.startsWith(LOGIN_URL)) {
        auth.logout();
        router.navigate(['/login']);
      }
      // Re-thrown either way: the caller still needs to know its request failed.
      return throwError(() => error);
    }),
  );
};

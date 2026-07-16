import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { MessageService } from 'primeng/api';
import { environment } from '@env/environment';
import { AuthService } from '@app/core/services/auth.service';

const LOGIN_URL = `${environment.apiUrl}/Auth/login`;

/**
 * Shown when a 5xx response carries no usable body (proxy errors, HTML error pages).
 * Kept in sync with ExceptionHandlingMiddleware.GenericMessage on the API side.
 */
export const SERVER_ERROR_FALLBACK_MESSAGE = '系統發生未預期的錯誤,請稍後再試。';

/**
 * Centralised handling for the two failures no caller can deal with locally:
 *
 * - 401 → the token was rejected: clears the session and returns to the login page.
 *   Covers the expired-token case, which the client cannot detect on its own.
 *   The login endpoint is exempt — its 401 means "wrong password", which the login page
 *   needs to report. Treating it as a session expiry would clear a session that never
 *   existed and swallow the message.
 * - 5xx → the server failed unexpectedly: raises an error toast with the generic, safe
 *   message the API's exception middleware puts in the body ({ message }). The body never
 *   carries details, so there is nothing feature-specific for a caller to add.
 *
 * Everything else (validation 400s, 403, 404, 409) is business feedback and stays with
 * the component that made the call.
 */
export const authErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const messageService = inject(MessageService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !req.url.startsWith(LOGIN_URL)) {
        auth.logout();
        router.navigate(['/login']);
      } else if (error.status >= 500) {
        // error.error is the parsed JSON body when there is one, but can be a string or
        // null (proxy errors, HTML error pages) — only trust an actual message property.
        const message = error.error?.message;
        messageService.add({
          severity: 'error',
          summary: '系統錯誤',
          detail: typeof message === 'string' ? message : SERVER_ERROR_FALLBACK_MESSAGE,
        });
      }
      // Re-thrown either way: the caller still needs to know its request failed.
      return throwError(() => error);
    }),
  );
};

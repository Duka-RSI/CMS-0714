import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from '@env/environment';
import { AuthService } from '@app/core/services/auth.service';

/**
 * Attaches the session's access token to outgoing API calls.
 *
 * Scoped to `environment.apiUrl` on purpose: a bearer token must not be sprayed at every
 * host the app might fetch from (assets, third parties), only at the API that issued it.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).token;

  if (!token || !req.url.startsWith(environment.apiUrl)) {
    return next(req);
  }

  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};

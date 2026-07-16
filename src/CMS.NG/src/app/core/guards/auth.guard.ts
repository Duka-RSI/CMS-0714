import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '@app/core/services/auth.service';

/**
 * Blocks app routes when there is no session, sending the visitor to the login page.
 *
 * This only stops navigation — it does not validate the token. An expired or forged token
 * still gets past here and is rejected by the API, which the 401 interceptor turns into a
 * sign-out.
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.isAuthenticated() ? true : router.createUrlTree(['/login']);
};

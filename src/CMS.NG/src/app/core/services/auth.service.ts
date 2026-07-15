import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '@env/environment';
import { ADMIN_ROLE, AuthProfile, LoginRequest, UserProfile } from '@app/core/models/auth.model';

/** Session-storage key holding the signed-in profile. */
const STORAGE_KEY = 'auth-profile';

/**
 * Decodes a JWT payload segment. Base64url differs from base64 (`-_` for `+/`, no
 * padding), and the payload is UTF-8 — `atob` alone would mangle a non-ASCII UserName.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const segments = token.split('.');
  if (segments.length !== 3) {
    return null;
  }
  try {
    const base64 = segments[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    // A malformed token is treated as carrying no claims rather than crashing the app.
    return null;
  }
}

/** Reads the `role` claim, which the API emits as a string for one role and an array for many. */
function rolesFromToken(token: string | undefined): string[] {
  if (!token) {
    return [];
  }
  const role = decodeJwtPayload(token)?.['role'];
  if (typeof role === 'string') {
    return [role];
  }
  if (Array.isArray(role)) {
    return role.filter((r): r is string => typeof r === 'string');
  }
  return [];
}

function readStoredProfile(): AuthProfile | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as AuthProfile;
    return parsed?.accessToken ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Holds the signed-in session.
 *
 * Session storage (not local storage) is deliberate: the session dies with the tab, so a
 * shared machine does not leave a usable token behind.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/Auth`;

  // Seeded from session storage so a page reload keeps the user signed in.
  private readonly _profile = signal<AuthProfile | null>(readStoredProfile());

  readonly profile = this._profile.asReadonly();
  readonly isAuthenticated = computed(() => !!this._profile()?.accessToken);
  readonly userName = computed(() => this._profile()?.userName ?? '');

  /**
   * Roles from the token's claims — no extra API call.
   *
   * These drive UI affordances only. Anyone can edit their own session storage, so the
   * API re-checks the signed token on every request; hiding a menu is convenience, not
   * a security boundary.
   */
  readonly roles = computed(() => rolesFromToken(this._profile()?.accessToken));
  readonly isAdmin = computed(() => this.roles().includes(ADMIN_ROLE));

  /** Token for the Authorization header, or null when signed out. */
  get token(): string | null {
    return this._profile()?.accessToken ?? null;
  }

  login(request: LoginRequest): Observable<AuthProfile> {
    return this.http
      .post<AuthProfile>(`${this.baseUrl}/login`, request)
      .pipe(tap((profile) => this.store(profile)));
  }

  /**
   * Renames the signed-in user, then folds the stored name into the session so the shell
   * updates. Only the display name changes — the API takes the user from the token, and
   * the token itself is untouched, so roles and identity cannot move.
   */
  updateUserName(userName: string): Observable<UserProfile> {
    return this.http.put<UserProfile>(`${this.baseUrl}/profile`, { userName }).pipe(
      tap((updated) => {
        const current = this._profile();
        if (current) {
          // Take the server's value, not the input: it is the trimmed one.
          this.store({ ...current, userName: updated.userName });
        }
      }),
    );
  }

  /** Drops the session. Callers decide where to navigate. */
  logout(): void {
    sessionStorage.removeItem(STORAGE_KEY);
    this._profile.set(null);
  }

  private store(profile: AuthProfile): void {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    this._profile.set(profile);
  }
}

/** Credentials posted to POST /api/Auth/login. */
export interface LoginRequest {
  userId: string;
  password: string;
}

/**
 * The signed-in user, as returned by POST /api/Auth/login and held in session storage.
 * The API deliberately never returns a password hash, and nothing here should ever be
 * treated as authoritative — the roles inside `accessToken` are a UI hint; the API is
 * what actually enforces them.
 */
export interface AuthProfile {
  userId: string;
  userName: string;
  accessToken: string;
}

/** AppRole.RoleId that unlocks the 系統管理 section. Mirrors RoleNames.Admin on the API. */
export const ADMIN_ROLE = 'Admin';

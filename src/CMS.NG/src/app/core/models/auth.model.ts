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

/** Body of PUT /api/Auth/profile. No userId: the API takes it from the token. */
export interface UpdateProfileRequest {
  userName: string;
}

/** What PUT /api/Auth/profile returns — the stored, trimmed profile. */
export interface UserProfile {
  userId: string;
  userName: string;
}

/**
 * Body of POST /api/Auth/change-password. Plaintext only — the client never sees, sends or
 * computes a hash, and the account comes from the token.
 */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/** AppRole.RoleId that unlocks the 系統管理 section. Mirrors RoleNames.Admin on the API. */
export const ADMIN_ROLE = 'Admin';

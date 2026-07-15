/**
 * Response model for an AppUser (mirrors CMS.API AppUser, camelCased by System.Text.Json).
 *
 * There is deliberately no password field: PasswordHash never leaves the backend.
 */
export interface AppUser {
  pkid: number;
  userId: string;
  userName: string;
  isActive: boolean;
  /** When the password was last set. null = still on the system default password. */
  passwordUpdatedTime: string | null;
  /** Count of assigned roles (角色數). */
  roleCount: number;
  /** Assigned role ids — populated on GET-by-id only. */
  roleIds: string[];
}

/**
 * Write DTO for create/update. userId is the PK (immutable on edit).
 *
 * No password field — on create the backend assigns the hashed SysConfig default
 * password; an update never touches it. Use AppUserService.resetPassword instead.
 */
export interface AppUserRequest {
  userId: string;
  userName: string;
  isActive: boolean;
  roleIds: string[];
}

/** Filter DTO for POST /app-users/query. */
export interface AppUserQuery {
  keyword?: string | null;
  /** Tri-state: null = 全部, true = 啟用, false = 停用. */
  isActive?: boolean | null;
}

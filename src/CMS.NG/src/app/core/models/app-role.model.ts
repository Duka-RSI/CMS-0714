/** Response model for an AppRole (mirrors CMS.API AppRole, camelCased by System.Text.Json). */
export interface AppRole {
  pkid: number;
  roleId: string;
  roleName: string;
  permissionLevel: number;
  description: string | null;
  /** Count of assigned users (使用者數). */
  userCount: number;
  /** Assigned user ids — populated on GET-by-id only. */
  userIds: string[];
}

/** Write DTO for create/update. roleId is the PK (immutable on edit). */
export interface AppRoleRequest {
  roleId: string;
  roleName: string;
  permissionLevel: number;
  description: string | null;
  userIds: string[];
}

/** Filter DTO for POST /app-roles/query. */
export interface AppRoleQuery {
  keyword?: string | null;
  permissionLevel?: number | null;
}

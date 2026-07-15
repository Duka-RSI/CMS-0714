namespace CMS.API.Security;

/// <summary>
/// Role ids that carry meaning in code. These are AppRole.RoleId values — the DB is the
/// source of truth, so a rename there must be mirrored here.
/// </summary>
public static class RoleNames
{
    /// <summary>Full access to the 系統管理 (Admin) features.</summary>
    public const string Admin = "Admin";
}

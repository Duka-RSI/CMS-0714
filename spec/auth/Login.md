# Build Spec for Login (AuthController)

- database schema: `.\database\auth.sql` (`AppUser`, `AppUserRole`, `SysConfig`)
- related: `spec/auth/AppUser.md` (password storage, SysConfig access)

## Summary

`POST /api/Auth/login` authenticates an `AppUser` against the `PasswordHash` column and
issues a 24-hour JWT access token. It is the **only** read path allowed to touch
`PasswordHash`.

The tokens are now validated and enforced — see **`spec/auth/Authorization.md`** for the
JwtBearer pipeline, the global "must be logged in" policy, the Admin-only controllers, and
the Angular login/guard/interceptor side. This doc covers issuing only.

| Item | Detail |
|------|--------|
| Route | `POST /api/Auth/login` (PascalCase segment, as specified — note it differs from the `/api/{kebab-plural}` convention the CRUD features use) |
| Request | `LoginRequest { UserId, Password }` — both `[Required]` |
| Response | `LoginResponse { userId, userName, accessToken }` — **never** PasswordHash |
| Success | `200` |
| Failure | `401` with a generic message for every failed check |
| Server fault | `500` when SysConfig `appConfig` is missing/malformed or has no usable signing secret |

---

## Credential check

All three checks must pass, in this order:

1. `AppUser` row exists with `UserId` = the supplied value (exact match — SQL Server's
   default collation makes this case-insensitive; not tightened here).
2. `IsActive = 1`.
3. `PasswordHash` equals SHA-256 of the supplied password (unsalted, lower-case hex —
   see `PasswordHasher`, and the security note in `AppUser.md` that applies here too).

**Any failure returns the same 401 and the same message** (`使用者代碼或密碼錯誤。`).
Distinguishing "unknown user" from "disabled account" would hand a caller a
user-enumeration oracle, so the controller deliberately collapses them.
`AuthControllerTests.Login_FailureMessageIsIdenticalForEveryFailedCheck` locks this down.

`PasswordHasher.Verify` compares with `CryptographicOperations.FixedTimeEquals` so the
endpoint cannot be used as a timing oracle.

---

## Access token

Issued by `Security/JwtTokenService` (`IJwtTokenService`).

| Item | Value |
|------|-------|
| Algorithm | HS256 (HMAC-SHA256) |
| Signing secret | the `symmetricSecurityKey` property of the SysConfig `appConfig` JSON, via `ISigningKeyProvider` |
| Lifetime | **24 hours** (`JwtTokenService.TokenLifetime`), `nbf` = now, `exp` = now + 24h |
| `sub` | `AppUser.UserId` |
| `name` | `AppUser.UserName` |
| `role` | one claim per `AppUserRole.RoleId` (blank/duplicate ids dropped) |
| `jti` | fresh GUID per token |
| `iss` / `aud` | **not set** — this API is the only issuer and the only consumer, and validation is configured to match |

- **The secret is never hard-coded.** `ISigningKeyProvider` owns reading it (and caches it
  for 5 minutes, because validation runs per request); rotating the SysConfig row takes
  effect within that TTL, without a redeploy. See `Authorization.md`.
- Claims use short literal names (`sub` / `name` / `role`), not the `ClaimTypes.*` URIs —
  `handler.OutboundClaimTypeMap.Clear()` stops IdentityModel remapping them on the way out,
  and `MapInboundClaims = false` stops it on the way back in.
- **Key length**: HS256 needs ≥ 256 bits. The stored key is exactly 32 bytes, i.e. right
  at the floor — the provider throws `InvalidOperationException` (→ 500) if the row is ever
  edited to something shorter, rather than surfacing IdentityModel's error.

---

## Backend Notes

### Models

```csharp
// LoginRequest.cs   — [Required] UserId, [Required] Password (plaintext, never stored/logged)
// LoginResponse.cs  — UserId, UserName, AccessToken
// AppUserCredential.cs — BACKEND ONLY: UserId, UserName, IsActive, PasswordHash, RoleIds
// AppConfig.cs      — DefaultPassword + SymmetricSecurityKey (see below)
```

`AppUserCredential` is the **only** model carrying `PasswordHash`. It must never be
returned from a controller — that is exactly what the `AppUser` response model is for.

### Why a separate `AuthRepository`

`AppUserRepository`'s projection deliberately never selects `PasswordHash` ("it must not
leave the DB"), and that guarantee is worth keeping. Rather than punch a hole in it,
login gets its own slim read-only repo:

```csharp
// IAuthRepository.GetCredentialAsync(userId) → AppUserCredential?
SELECT u.UserId, u.UserName, u.IsActive, u.PasswordHash FROM AppUser u WHERE u.UserId = @UserId
SELECT RoleId FROM AppUserRole WHERE UserId = @UserId ORDER BY RoleId
```

Inactive users **are** returned; the controller — not the SQL — decides, so that all
three failures stay indistinguishable.

### `AppConfig.SymmetricSecurityKey` (a reversed decision)

`AppConfig` previously bound `defaultPassword` only, and its remark said the signing key
was deliberately unmapped "so it can never leak through this model". Login needs it, so
the property now exists. The protection it was reaching for still holds by a different
route: `AppConfig` is backend-only and is not returned by any endpoint.
`AppUser.md`'s SysConfig note is updated to match.

Note the coupling: `GetAppConfigAsync` validates `defaultPassword` for every caller, so a
blank `defaultPassword` would 500 the login path for an unrelated reason. Left as-is —
splitting the validation per-caller is a bigger change to working code than it is worth.

### Registration

`Program.cs`: `AddScoped<IAuthRepository, AuthRepository>()` and
`AddScoped<IJwtTokenService, JwtTokenService>()`.

### Package

`System.IdentityModel.Tokens.Jwt` 8.3.0 (issuing only). **Gotcha**: with both
`System.IdentityModel.Tokens.Jwt` and `Microsoft.IdentityModel.JsonWebTokens` imported,
`JwtRegisteredClaimNames` is an ambiguous reference (CS0104) — import only the former.

---

## Tests

`CMS.API.Tests/AuthControllerTests.cs` — repository mocked, but the **real**
`JwtTokenService` over a mocked `ISysConfigRepository`: the point is what the endpoint
actually signs, which a mocked token service would assert nothing about. Covers: valid
active user → profile + token; token carries sub/name/role claims and a ~24h expiry;
wrong password / unknown UserId / `IsActive = 0` → 401; all three failure messages
identical; PasswordHash absent from both the response JSON and the token payload;
missing signing key and broken SysConfig → 500.

`CMS.API.Tests/JwtTokenServiceTests.cs` — HS256 header; secret re-read per issue; claim
shape; blank/duplicate roles dropped; distinct jti; 24h expiry; missing or <32-byte
secret throws.

`CMS.API.Tests/PasswordHasherTests.cs` — `Verify` accepts the right password, rejects a
wrong one, matches a literal stored lower-case-hex hash, and rejects a blank or
wrong-length stored hash.

### Verified against the live DB

Controller tests mock the DB, so the real path was exercised once end to end: a temp user
created via `POST /api/app-users` (default password), logged in, the returned JWT decoded
— `role: ["Admin","User"]` from `AppUserRole`, `exp - nbf` = 86400s, signature verified
against the real SysConfig key and rejected under a wrong key — wrong password / unknown
user / `IsActive = 0` each returning 401, then the temp user deleted.

---

## Files to create / modify

**Create:** `Models/LoginRequest.cs`, `Models/LoginResponse.cs`, `Models/AppUserCredential.cs`,
`Repositories/IAuthRepository.cs`, `Repositories/AuthRepository.cs`,
`Security/IJwtTokenService.cs`, `Security/JwtTokenService.cs`, `Controllers/AuthController.cs`,
`CMS.API.Tests/AuthControllerTests.cs`, `CMS.API.Tests/JwtTokenServiceTests.cs`.
**Modify:** `Models/AppConfig.cs` (+`SymmetricSecurityKey`), `Security/PasswordHasher.cs`
(+`Verify`), `Program.cs` (DI ×2), `CMS.API.csproj` (JWT package),
`CMS.API.Tests/PasswordHasherTests.cs` (Verify tests).

**Frontend:** none — no login UI was requested.

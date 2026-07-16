# Build Spec for JWT Authorization (end-to-end)

- related: `spec/auth/Login.md` (issuing the token), `spec/auth/AppUser.md` (users/roles)
- database schema: `.\database\auth.sql`

## Summary

Bearer-token authorization across both apps. The API validates the token that
`AuthController` issues; the Angular app stores it, attaches it, and routes around it.

**Default is closed**: a global fallback policy requires an authenticated user on every
endpoint. `AuthController` is the single opt-out.

| Layer | Rule |
|-------|------|
| API — all controllers | require a logged-in caller (`FallbackPolicy`) → **401** without a valid token |
| API — `AuthController` | `[AllowAnonymous]` — otherwise logging in would require being logged in. **Its `PUT /profile` action opts back in with its own `[Authorize]`** |
| API — AppRoles / AppUsers / PublishStatuses | `[Authorize(Roles = "Admin")]` → **403** for a logged-in non-Admin |
| API — Lookups, Courses, Partners, CourseGroups, FeaturedPromoItems | any logged-in user |
| NG | login page (public), route guard, bearer interceptor, 401 → sign out, Admin-only menu |

## Traps that fail silently

These are the ones that compile, pass a casual smoke test, and are wrong. CLAUDE.md points
here rather than carrying them, so read this table before touching auth.

| Trap | What happens if you get it wrong | Detail |
|------|----------------------------------|--------|
| `MapInboundClaims = false` on JwtBearer | At the default, IdentityModel rewrites `role` to a URI; `RoleClaimType = "role"` then matches nothing and **every `[Authorize(Roles=...)]` rejects every Admin** | [JwtBearer configuration](#jwtbearer-configuration-programcs) |
| `[AllowAnonymous]` on `AuthController` is **inherited by its actions** | A new action there is **public** unless it carries its own `[Authorize]`; the global fallback will not save it | [Global policy + opt-outs](#global-policy--opt-outs) |
| 401 vs 400 for an authenticated caller | A 401 to someone who merely mistyped (e.g. a wrong current password) trips `authErrorInterceptor`, clears the session and **signs them out over a typo**. Use 400 | [Change password](#change-password--post-apiauthchange-password) |
| The password policy exists **twice** | `Security/PasswordPolicy.cs` and `core/utils/password-policy.ts`, message included. Let them drift and the form accepts what the server rejects | [Change password](#change-password--post-apiauthchange-password) |
| The client's symbol class must be `[^\p{L}\p{Nd}]` | `\p{N}` swallows `½` (category `No`), which .NET calls a symbol — the two checks then disagree | [Change password](#change-password--post-apiauthchange-password) |
| `PasswordHash` may only be read via `AuthRepository` | `AppUserRepository`'s projection never selects it, and that guarantee is what keeps it out of every response model | [Why a separate AuthRepository](Login.md) |

---

## Backend

### Signing key: one source, cached

`Security/SigningKeyProvider` (singleton) reads `symmetricSecurityKey` from SysConfig
'appConfig' and caches it for `CacheTtl` (5 min). Both issuing (`JwtTokenService`) and
validating (JwtBearer) go through it.

- **Why cached**: validation runs on *every* authenticated request. Reading the row per
  request would put a database round-trip in front of every API call.
- **Why a TTL rather than read-once-at-startup**: the secret stays rotatable without a
  redeploy, and a database that is down at boot does not stop the app from starting.
- **Sync-over-async**: `Get()` blocks, because JwtBearer's `IssuerSigningKeyResolver` has
  no async seam. It only blocks on a cold/stale cache — once per TTL, not per request —
  and there is no synchronization context here to deadlock against.
- A failed load is **not** cached, so a database blip cannot poison the provider for the
  rest of the TTL.

### JwtBearer configuration (`Program.cs`)

Configured through `AddOptions<JwtBearerOptions>().Configure<ISigningKeyProvider>(...)` so
the key provider arrives by DI rather than a captured local.

```csharp
options.MapInboundClaims = false;                       // see the gotcha below
ValidateIssuer = false, ValidateAudience = false        // this API is the only issuer/consumer
ValidateLifetime = true, ValidateIssuerSigningKey = true
NameClaimType = "name", RoleClaimType = "role"
IssuerSigningKeyResolver = (...) => [signingKeys.Get()]
ClockSkew = TimeSpan.FromMinutes(1)                     // default is 5
```

> ⚠️ **`MapInboundClaims = false` is load-bearing.** Left at its default, IdentityModel
> rewrites the `role` claim to the `ClaimTypes.Role` URI. A `RoleClaimType` of `"role"`
> would then match nothing and `[Authorize(Roles = "Admin")]` would silently reject every
> Admin. `JwtTokenServiceTests.CreateAccessToken_IsVerifiableWithTheSigningKey` and the
> pipeline tests both pin this.

### Global policy + opt-outs

```csharp
options.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build();
```

`FallbackPolicy` applies only to endpoints carrying **no** authorization metadata, so
`[AllowAnonymous]` and `[Authorize(Roles=...)]` both win over it. Swagger is middleware,
not an endpoint, so `/swagger` stays reachable.

> ⚠️ **`[AllowAnonymous]` on `AuthController` is inherited by its actions.** A new action
> there that is not meant to be public must carry its own `[Authorize]` — the fallback
> policy will not save it. `PUT /profile` does exactly this, and
> `AuthorizationPipelineTests.UpdateProfile_WithoutAToken_Returns401` is the test that
> catches the attribute going missing.

**Pipeline order**: `UseAuthentication()` *before* `UseAuthorization()` — authentication
establishes who the caller is; authorization then judges them.

`RoleNames.Admin` ("Admin") mirrors the `AppRole.RoleId` in the database.

### Self-service profile — `PUT /api/Auth/profile`

The signed-in user's own account page ("我的帳號", `/profile` in the NG app). Shows UserId
and roles read-only; only UserName is editable.

- **The user comes from the token's `sub` claim, never the body.** `UpdateProfileRequest`
  has a `UserName` property and *nothing else* — no UserId to rename someone else with, no
  RoleIds to self-promote with. Unknown JSON properties are dropped by the deserializer, so
  sending them is inert rather than rejected. `UpdateProfileRequest_HasNoUserIdOrRoleProperties`
  pins the shape.
- **`AuthRepository.UpdateUserNameAsync` is deliberately narrow**: `SET UserName` only.
  `IsActive`, `PasswordHash` and the AppUserRole rows are unreachable from this path.
  Admins editing *other* users still go through `/api/app-users`.
- **UserName is trimmed and must be non-blank.** Note `[Required]` already rejects
  whitespace-only strings (`RequiredAttribute` trims before testing length), so
  `"   "` → 400 from ModelState; the controller's own trim check is a second line that also
  guards the value actually stored.
- **The response carries the stored (trimmed) name** — the client takes that rather than
  echoing what it typed.
- **The token is not re-issued**, so its `name` claim goes stale until the next login.
  Nothing reads it: `AuthService.userName` comes from the session profile, and the API only
  ever uses `sub` and `role`. Left as-is rather than minting a new token for a display-name
  edit.
- **No `GET /api/Auth/profile`**: UserId and roles are already in the token and UserName in
  the session, so the page needs no fetch. The trade-off is that a name changed by an admin
  elsewhere will not show until the user logs in again.

### Change password — `POST /api/Auth/change-password`

Self-service, on the same 我的帳號 page. `[Authorize]` for the same reason as the profile
endpoint. Account from the token's `sub`; plaintext in, **204 and an empty body out** — no
hash crosses the wire in either direction.

Checks run in this order, and any failure writes nothing:

1. `PasswordHasher.Verify(current, storedHash)` — the current password must be right.
2. `PasswordPolicy.IsCompliant(new)` — length ≥ 8 **and** ≥ 3 of the 4 character classes.
3. `new == confirm`, compared `Ordinal` (a password comparison must never apply culture rules).
4. `UpdatePasswordAsync` stores SHA-256 of the new password and stamps `PasswordUpdatedTime`
   via `GETUTCDATE()`, matching `AppUserRepository.ResetPasswordAsync` — one clock stamps
   that column however the password changed.

> ⚠️ **A wrong current password returns 400, never 401.** The caller *is* authenticated;
> they mistyped. A 401 would trip `authErrorInterceptor`, clear the session and bounce them
> to the login page for a typo. `ChangePassword_WithAWrongCurrentPassword_Returns400Not401`
> and its pipeline counterpart pin this.

**The policy** (`Security/PasswordPolicy.cs`) applies to passwords a user picks for
themselves. It deliberately does *not* gate the SysConfig default that AppUser create/reset
assigns — that value is the admin's choice, and validating it there would turn a bad config
into a failure to create users. "Symbol" is anything that is not a letter or a digit;
caseless letters (CJK) count towards no class, so an all-Chinese password is rejected however
long. Nothing is trimmed — spaces are part of the secret.

`RequirementMessage` is bilingual and shown verbatim in the UI. It is duplicated in
`core/utils/password-policy.ts`, and both suites assert the exact string: if they drift, the
form starts accepting passwords the server rejects.

> **Unicode gotcha in the client mirror**: the symbol class must be `[^\p{L}\p{Nd}]`, not
> `[^\p{L}\p{N}]`. .NET's `char.IsDigit` is `Nd` only, so `½` (category `No`) is a *symbol*
> server-side; `\p{N}` would swallow it and the two checks would disagree.

Complexity limits guessing; it does not redeem unsalted SHA-256 as a KDF (see `AppUser.md`).

> `SysConfig.appConfig` carries an `enforcePasswordPolicy: true` flag that **nothing reads**.
> The policy is currently unconditional. Wiring the flag was not asked for and would let a
> config edit silently disable complexity — raise it before binding it.

### Resetting another user's password to the default

`POST /api/app-users/{id}/reset-password` — Admin only, by virtue of `AppUsersController`'s
`[Authorize(Roles="Admin")]`. It predates this work (see `AppUser.md`); the only thing added
here was the button on the **edit form**, alongside the one the list already had. Both call
the same endpoint, so there is no second route to keep in step.

The client sends **only the UserId** and receives 204: the default password is read at
runtime from SysConfig `appConfig` inside `AppUserRepository.ResetPasswordAsync`, hashed
there, and never travels in either direction.

**Test coverage note.** `ResetPassword_WithANonAdminToken_Returns403AndResetsNothing` and
`ResetPassword_WithAnAdminToken_Returns204AndLeaksNoHash` drive the real pipeline with a
mocked `IAppUserRepository`, so they prove the authorization and the empty body but *not*
that the stored hash is SHA-256 of the SysConfig default — that happens inside the
repository's SQL. This repo has no database test harness, so that assertion is made against
the live database instead (below).

### PublishStatuses is Admin-only, its lookup is not

`/api/publish-statuses` (the maintenance CRUD) requires Admin; the non-admin Course and
FeaturedPromoItem forms read statuses via `/api/lookups/publish-statuses`, which stays open
to any logged-in user. The same split applies to `/api/lookups/app-roles`.

---

## Frontend

| File | Role |
|------|------|
| `core/models/auth.model.ts` | `LoginRequest`, `AuthProfile`, `ADMIN_ROLE` |
| `core/services/auth.service.ts` | session storage, profile/roles signals, login/logout |
| `core/interceptors/auth.interceptor.ts` | attaches `Authorization: Bearer` |
| `core/interceptors/auth-error.interceptor.ts` | 401 → clear session → `/login`; 5xx → generic error toast |
| `core/guards/auth.guard.ts` | blocks routes without a token |
| `features/auth/login/` | the public login page |
| `features/profile/my-profile/` | 我的帳號 — `/profile`, reachable by every role; rename + change password |
| `core/utils/password-policy.ts` | client mirror of the API's complexity rule |
| `testing/jwt.fixture.ts` | `tokenWithRoles()` for specs |

- **Session storage, not local storage** (`auth-profile`): the session dies with the tab,
  so a shared machine keeps no usable token. `AuthService` seeds its signal from storage on
  construction, so a reload keeps the user signed in.
- **Roles come from the token**, decoded client-side — no extra API call. The API emits a
  bare string for one role and an array for several; both shapes are handled. Decoding is
  base64url + UTF-8 (`atob` alone mangles a non-ASCII UserName), and a malformed token
  yields no roles rather than throwing.
- **The interceptor is scoped to `environment.apiUrl`** — a bearer token must not be
  sprayed at every host the app fetches from.
- **The 401 interceptor exempts `/Auth/login`**: that 401 means "wrong password", which the
  login page needs to display. Treating it as a session expiry would clear a session that
  never existed and swallow the message. It also ignores **403** — "logged in but not
  entitled" is not a reason to sign someone out.
- **Routing**: `protectedRoutes` sit under one pathless route with `canActivateChild:
  [authGuard]`, so a feature route added later is guarded without anyone remembering to.
  `login` is the only public route.
- **The default route landed on `app-roles`, which is now Admin-only** — a non-Admin would
  have met a 403 on first paint. Both the `''` redirect and the `**` wildcard now point at
  `courses`, and so does the post-login landing (`Login.LANDING_ROUTE`).
- **The app shell hides itself on `/login`** (`showShell`, driven by `NavigationEnd`) —
  there is nothing to navigate to before signing in.
- **The Admin section is filtered by an `adminOnly` flag on the menu section**, not by
  matching the Chinese title — a retitle must not silently expose it. Hiding it is a UI
  affordance; `[Authorize(Roles="Admin")]` is the actual enforcement.
- **The sidebar user block is the link to 我的帳號** (`.user-link` → `/profile`), with
  logout beside it. The avatar stays visible in slim mode, so the link survives there.
  `AuthService.updateUserName()` folds the new name back into the session, so the shell
  updates without a reload.
- **`anyComponentStyle` budget raised 4kB → 6kB** (`angular.json`): `app.scss` owns the
  whole sidebar layout and already sat at ~3.98kB, so the user block tipped it over. The
  error ceiling stays at 8kB.

---

## Tests

**Backend** — `PasswordPolicyTests` covers the complexity rule exhaustively (length
boundary, every 3-of-4 combination, every ≤2-class rejection, what counts as a symbol,
caseless letters, no trimming). `AuthChangePasswordControllerTests` covers the endpoint:
wrong current password writes nothing and returns 400 (not 401), each check runs in order,
complexity and confirmation rejections write nothing, and a valid change stores exactly
`PasswordHasher.Hash(new)` as 64-char lower-case hex. `PasswordUpdatedTime` is stamped by
`GETUTCDATE()` inside the SQL, so a mocked repository cannot observe it — that assertion is
made against the live database instead (below).

`AuthProfileControllerTests` covers the profile endpoint: renames the token's
user, ignores a UserId in the body, rejects blank/whitespace names without writing, trims,
and 401/404 on the token edge cases. (It supplies a `ProblemDetailsFactory` on the test
HttpContext: `ValidationProblem()` resolves one off request services, and a bare
`DefaultHttpContext` has none, so the result comes back with no status code — behaviour
that only happens in tests. The real 400 is asserted in the pipeline tests.)

`CMS.API.Tests/AuthorizationPipelineTests.cs` boots the real pipeline through
`WebApplicationFactory<Program>` with every repository (and the key provider) mocked, so no
database is touched. Controller unit tests call actions directly and therefore cannot tell
whether authentication is wired up at all; these can. Covers: login reachable anonymously;
bad credentials still 401 *from the controller*; protected endpoints 401 without a token,
with garbage, and with a token signed by the wrong key; 200 with a valid token; Admin
endpoint 403 for a non-Admin and 200 for an Admin; ordinary features unaffected.

`SigningKeyProviderTests` covers reading, the TTL cache (via an injected `TimeProvider`),
rotation, validation failures, and that failures are not cached.

**Frontend** — `auth.service.spec.ts` (session-storage not local-storage, role decoding
incl. single-string/absent/malformed/non-ASCII, restore-on-reload, `updateUserName` sends
only the name and leaves the token/roles alone), `auth.interceptor.spec.ts`
(header attached, absent when signed out, never sent off-origin), `auth-error.interceptor.spec.ts`
(401 clears + redirects, re-throws, login-401 and 403 exempt), `auth.guard.spec.ts`
(redirect vs allow), `login.spec.ts`, `my-profile.spec.ts` (UserId disabled, roles rendered
with no editable control and no API call, save updates session + shell, blank name never
posted), and `app.spec.ts` (Admin section shown/hidden, profile link, logout, rename
reflected in the shell).

### Verified against the live app

Both servers running, driven in a browser: unauthenticated `/` → `/login`; non-Admin
(`test`) → lands on `/courses`, 系統管理 section absent, token in sessionStorage only;
Admin → section present with all three links; logout clears and returns to `/login`; a
tampered token in storage → API 401 → session cleared → `/login`. By curl: no token → 401
on `/api/courses`, `/api/app-roles`, `/api/lookups/app-roles`; non-Admin token → 200 on
courses, 403 on app-roles/app-users; Admin token → 200 on all three.

Change password, against the real database: no token → 401; wrong current password → 400
with the session intact (and in the browser, still on `/profile`, still signed in); a
lowercase-only or too-short new password → 400 with the bilingual message; a mismatched
confirmation → 400 — and after all four, `PasswordHash` and `PasswordUpdatedTime` were
**unchanged**. A valid change → 204 with a zero-byte body; `PasswordHash` then equalled
`SHA256('Str0ng!pass')`, `PasswordUpdatedTime` was stamped, the old password no longer
logged in (401) and the new one did (200). In the browser, a non-compliant or mismatched
entry was refused client-side with no request sent, and a successful change cleared all
three fields and kept the session.

Reset-to-default, against the real database, on a throwaway user whose hash had been set to
junk: no token → 401; a non-Admin token → **403 with the hash unchanged**; an Admin token →
204 with a zero-byte body, after which `PasswordHash` equalled
`SHA256(JSON_VALUE(SysConfig.configValue, '$.defaultPassword'))`, `PasswordUpdatedTime` was
stamped, and the user could log in with the default password.

> Not verified: that the reset *re-reads* SysConfig rather than caching. Proving it would
> mean temporarily rewriting the `appConfig` row, which also holds the JWT signing secret —
> not worth touching a live config row for. The code path (`SysConfigRepository` SELECTs on
> every `GetAppConfigAsync`, which `ResetPasswordAsync` calls per reset) is plain enough to
> read.

Profile, against the real database: `PUT /api/Auth/profile` with no token → 401; as `test`
with a body of `{"userId":"miles@uuu.com.tw","roleIds":["Admin"],"userName":"  孫小明  "}`
→ 200 `{"userId":"test","userName":"孫小明"}` — the body's userId ignored, the name
trimmed, `test` still holding only the `User` role, and `miles` untouched. In the browser:
`/profile` shows UserId disabled and roles as read-only tags, a rename updates the sidebar
and sessionStorage immediately, and a whitespace-only name is refused client-side.

---

## Known gaps (deliberate, not oversights)

- **No refresh tokens / no silent renewal.** A 24h token simply expires and the next API
  call bounces the user to the login page.
- **Changing a password does not invalidate existing tokens**, including the caller's own —
  it stays signed in, and a token issued to a session elsewhere keeps working until it
  expires. Same root cause as the revocation gap below.
- **No "new password must differ from the current one" rule**, and no history: re-submitting
  the current password succeeds. Not asked for; `ChangePassword_AllowsReusingTheCurrentPassword`
  documents it so the behaviour is a decision rather than an accident.
- **No server-side revocation.** The `jti` claim exists to make it possible; nothing
  consumes it yet. Deactivating a user (`IsActive = 0`) blocks *new* logins but does not
  invalidate a token already issued — it stays valid until it expires.
- **`/api/lookups/*` is open to any logged-in user**, including `app-roles`. It is slim
  reference data and the non-admin forms need it.

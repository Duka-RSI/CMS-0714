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
| `core/interceptors/auth-error.interceptor.ts` | 401 → clear session → `/login` |
| `core/guards/auth.guard.ts` | blocks routes without a token |
| `features/auth/login/` | the public login page |
| `features/profile/my-profile/` | 我的帳號 — `/profile`, reachable by every role |
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

**Backend** — `AuthProfileControllerTests` covers the profile endpoint: renames the token's
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
- **No server-side revocation.** The `jti` claim exists to make it possible; nothing
  consumes it yet. Deactivating a user (`IsActive = 0`) blocks *new* logins but does not
  invalidate a token already issued — it stays valid until it expires.
- **`/api/lookups/*` is open to any logged-in user**, including `app-roles`. It is slim
  reference data and the non-admin forms need it.

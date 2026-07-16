# CLAUDE.md

Always-loaded orientation. Detail lives in `spec/` — read the relevant doc before feature
work, skip it otherwise. Keep this file short: every line here costs context on every task.

## Working agreements

- **Reply to the user in Traditional Chinese (繁體中文).** Code, identifiers, commit
  messages and docs stay in English.
- **Never switch ports.** API 5000, frontend 4200 — always. If one is occupied (usually a
  stale dev server), find the process (`netstat -ano`), confirm it is `node` / `CMS.API`,
  kill it, and reuse the port. No alternate-port launch configs, no letting tooling auto-pick.
- **Commit straight to `develop`** — it is the main branch and the intended target. Do not
  open a feature branch first, and do not ask whether to. Only commit/push when asked.
- **Record new conventions and decisions as they are made** — the detail goes in the
  matching `spec/*.md`; keep only a pointer or a one-line gotcha here.

## Stack & layout

.NET 9 Web API (Dapper, no EF) over SQL Server, plus an Angular 20 standalone app (PrimeNG,
Aura theme). Features are generated one table at a time from the SQL schema; **AppRole** is
the canonical end-to-end example. No proxy — the frontend reaches the API via
`@env/environment` `apiUrl`, so **both servers must be running** to use the app.

```
database/           SQL schema — source of truth (auth/admin/course/promotion.sql)
spec/               Conventions, per-feature build specs, reference docs
src/CMS.API/        .NET 9 Web API (Dapper); solution file: src/CMS.sln
src/CMS.API.Tests/  xUnit + Moq; repositories are mocked — never hits the DB
src/CMS.NG/         Angular 20 standalone + PrimeNG
```

## Commands

Backend (from `src/`) — **stop the running API first**: a live `dotnet run` locks
`CMS.API.exe` and the build fails with MSB3027.

```powershell
dotnet build CMS.sln
dotnet run --project CMS.API --urls http://localhost:5000   # Swagger at /swagger
dotnet test CMS.API.Tests
```

Frontend (from `src/CMS.NG/`):

```powershell
ng serve                                           # dev server → :4200
ng build
ng test --watch=false --browsers=ChromeHeadless    # needs $env:CHROME_BIN → chrome.exe
```

## Reference docs (read the relevant one before feature work)

| Doc | Covers |
|-----|--------|
| `spec/backend-conventions.md` | Dapper repo/model/controller patterns; the three PK types; lookup endpoints; nchar/date; N-N; row auditing; global exception middleware |
| `spec/frontend-conventions.md` | standalone component + service + list/detail/form; form PK handling; bit columns; in-place list editing; routing; sidebar; HTTP error handling; bundle budgets |
| `spec/reference-features.md` | worked features and their quirks; deferred FK-link buttons; the "adding a feature" workflow |
| `spec/auth/Authorization.md` | **read before any auth work** — the JWT pipeline, role policies, NG login/guard/interceptors, the password policy, and the traps that fail *silently* |
| `spec/auth/Login.md` | the login endpoint: credential check, JWT claims/lifetime, the SysConfig signing secret |
| `spec/auth/AppUser.md` | the AppUser feature: password storage, reset-to-default, the N-N with AppRole |
| `spec/admin/RowAudit.md` | **read before adding a feature or touching a repository write** — the RowAudit writer, `[NotAudited]`, the before/after snapshot rule, the varchar byte budget, the badge |
| `spec/code-gen.convention.md` | terse code-gen checklist |
| `spec/feature-spec.template.md` | spec sections to fill when analysing a table |

## Cross-cutting (checklist for every new feature)

- **Row audit** (`spec/admin/RowAudit.md`): every repository write calls `IRowAuditWriter`
  (`LogInsertAsync` / `LogUpdateAsync` / `LogDeleteAsync`) — snapshots read **inside** the
  transaction, audit row written **after** `Commit()` (deliberate — the spec records why;
  don't re-litigate). Mark JOINed labels / subquery counts `[NotAudited]` or audits go noisy
  *silently*. `ActionDesc` is a **1000-byte** budget ≈ 500 中文 characters. Every detail/form
  page hosts `<app-row-audit-badge tableName [pkid]>` (`[compact]` on repeated hosts) keyed
  on the **surrogate `pkid`**, never a string PK. History: `GET /api/row-audits?tableName=&pkid=`.
- **Exceptions** (`spec/backend-conventions.md` / `spec/frontend-conventions.md`): the global
  `ExceptionHandlingMiddleware` logs full detail server-side and returns a generic
  `{ message }` 500 — **no per-controller try/catch**, never leak stack traces or SQL.
  Deliberate 400/401/403/404/409 are returned, not thrown. The NG interceptor toasts 5xx and
  signs out on 401 — **no per-component generic 5xx toasts**; components keep only their
  business feedback.

## Gotchas

- **.NET SDK pinned to 9** via `global.json` (SDK 10 is installed) — target `net9.0`.
- **DB**: `.\SQLEXPRESS`, database `CMS`, Trusted Connection (`CMS.API/appsettings.json`).
- **The API is closed by default.** A global `FallbackPolicy` requires a logged-in caller on
  every endpoint, so a new controller is protected automatically, and any test that calls one
  over HTTP needs a bearer token. Corollary: **never return 401 to an authenticated caller
  who merely got a value wrong** — use 400; the frontend treats every 401 as a session expiry
  and signs the user out.
- **Update endpoints sync N-N sets from the request** — never build a PUT from a list row
  (its N-N pkid arrays are empty; they load on GET-by-id only). Fetch the full record, merge,
  then PUT, or the links are silently wiped.
- **`.claude/` is untracked local tooling** — keep it out of commits; never `git add -A`
  blindly.

## gstack

Use gstack's `/browse` skill (installed at `~/.claude/skills/gstack`) for **all** web
browsing; never the `mcp__claude-in-chrome__*` tools. The other gstack skills appear in the
session's skill listing — no need to enumerate them here.

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
the canonical end-to-end example (PublishStatus, Partner and CourseGroup are further worked
patterns). No proxy — the frontend reaches the API via `@env/environment` `apiUrl`, so
**both servers must be running** to use the app.

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
| `spec/backend-conventions.md` | Dapper repo/model/controller patterns; the three PK types; lookup endpoints; nchar/date; N-N; no-RowAudit |
| `spec/frontend-conventions.md` | standalone component + service + list/detail/form; form PK handling; bit columns; in-place list editing; routing; sidebar; bundle budgets |
| `spec/reference-features.md` | worked features and their quirks; deferred FK-link buttons; the "adding a feature" workflow |
| `spec/auth/Authorization.md` | **read before any auth work** — the JWT pipeline, role policies, NG login/guard/interceptors, the password policy, and the traps that fail *silently* |
| `spec/auth/Login.md` | the login endpoint: credential check, JWT claims/lifetime, the SysConfig signing secret |
| `spec/auth/AppUser.md` | the AppUser feature: password storage, reset-to-default, the N-N with AppRole |
| `spec/code-gen.convention.md` | terse code-gen checklist |
| `spec/feature-spec.template.md` | spec sections to fill when analysing a table |

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
- **No RowAudit infrastructure exists** despite the `/crud` skill mentioning it — don't add
  audit logging.
- **`.claude/` is untracked local tooling** — keep it out of commits; never `git add -A`
  blindly.

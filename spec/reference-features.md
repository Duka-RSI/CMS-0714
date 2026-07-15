# Reference features & feature-specific facts

The worked examples to mirror when generating a new feature, plus the per-feature facts
that aren't derivable from the schema alone. Pair with `backend-conventions.md` and
`frontend-conventions.md`.

## Worked examples (mirror whichever is closest)

- **AppRole** — IDENTITY surrogate + **string PK** (`RoleId`), **N-N** with AppUser.
  The canonical end-to-end example; when in doubt, follow it.
- **PublishStatus** — lookup table, **user-assigned non-IDENTITY PK** (`tinyint`), bool
  columns, no FK/N-N (409-on-duplicate create).
- **Partner** — plain **`smallint IDENTITY` PK**, no FK/N-N, but **is an FK target**
  (Course/Certification/PartnerCourseGroup) so it ships a lookup endpoint.
- **CourseGroup** — small lookup table, also an FK target (has `/api/lookups/course-groups`).

## Per-feature facts

- **`AppRole`'s primary key is `RoleId` (nvarchar), not `pkid`.** `pkid` is an IDENTITY
  surrogate shown as `主代碼`; the FK from `AppUserRole` references `RoleId`, so
  routes/updates/deletes key on `RoleId`. It's read-only in the edit form.
- **`AppRole ↔ AppUser` is N-N** via `AppUserRole` (junction on the string keys
  `RoleId`/`UserId`). The request carries `UserIds: string[]`; `使用者數` (UserCount)
  is a correlated subquery.
- **Partner / PublishStatus / CourseGroup** carry no audit logging and no
  primary-foreign nav buttons (see below).

## Primary-Foreign link buttons are deferred

When a table is an FK target but the referencing feature has no list route yet, document
the intended links in the spec but do **not** wire dead nav buttons in the list/detail
pages (follows PublishStatus and Partner). Add them when the child feature is built.

## Spec interpretation

**UI sample PNGs in `spec/` are style references only** — validation follows the DB
schema (e.g. `Description` is nullable/optional even though a mockup marks it `*`).

## Adding a feature

Mirror the closest worked example end to end:
1. Read the table in `database/*.sql` and any `spec/{sub-system}/{feature}.md`.
2. Backend: models → repository → controller, register in `Program.cs`
   (see `backend-conventions.md`).
3. Frontend: model → service → list/detail/form, add route + sidebar entry
   (see `frontend-conventions.md`).
4. Tests both sides: xUnit controller tests with a mocked repo; Karma specs for the
   service + components.
5. If the table is an FK target, add its `/api/lookups/{plural}` endpoint + client method.

Use `spec/feature-spec.template.md` to drive the analysis and `spec/code-gen.convention.md`
as the terse checklist. The `/crud` skill automates spec-then-build.

## Housekeeping

Generated features live on the **`develop`** branch. AppRole shipped in the initial
commit; PublishStatus and Partner were added later (each its own `feat(...)` commit,
pushed to `origin/develop`).

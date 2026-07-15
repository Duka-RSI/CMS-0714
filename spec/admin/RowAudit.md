# Build Spec for Row Audit

- database schema: `.\database\admin.sql` (the `RowAudit` table)
- related: `spec/auth/Authorization.md` (the token the caller is read from)

## Summary

A cross-cutting writer that records **one RowAudit row per change to one business row**.
It is not a CRUD feature: there is no controller, no route and no Angular side — nothing
reads the table back yet.

`RowAuditWriter` is generic over the entity type and reads everything it needs by
reflection, so a new feature is audited by calling it, without registering the model
anywhere.

| Item | Detail |
|------|--------|
| Primary Key | `pkid` **int IDENTITY** — never written |
| Written by | `Auditing/RowAuditWriter.cs` → `Repositories/RowAuditRepository.cs` |
| Registration | `AddHttpContextAccessor()`, `AddScoped<IRowAuditRepository, …>`, `AddScoped<IRowAuditWriter, …>` |
| Called by | every repository write — see [What is audited](#what-is-audited) |

## What is audited

Every repository takes `IRowAuditWriter` and names its table in a private
`AuditTableName` const.

| Repository | Audited |
|------------|---------|
| AppRole, AppUser, PublishStatus, Partner, CourseGroup, Course, FeaturedPromoItem | Create → Insert, Update → Update, Delete → Delete |
| `AppUserRepository.ResetPasswordAsync` | Update on **AppUser** |
| `AuthRepository.UpdateUserNameAsync` / `UpdatePasswordAsync` | Update on **AppUser** |
| `FeaturedPromoItemRepository.MoveSlotAsync` | Update on **FeaturedPromoItem** — **two rows** when it swaps |

Reads (`GetAll`/`Query`/`GetById`/`Exists`/`SlotTaken`) and `AuthRepository.GetCredentialAsync`
(the login path) write nothing: RowAudit records *changes*.

**No password hash can reach an audit row.** The `AppUser` projection has never selected
`PasswordHash`, and `AuthRepository` — the one place allowed to read it — audits through a
snapshot that deliberately omits it. A password change therefore records
`ActionDesc = "PasswordUpdatedTime"`: the fact, not the secret.

### The shape of a wired call

```csharp
var before = await GetByIdAsync(connection, transaction, id, ct);   // inside the transaction
if (before is null) { transaction.Rollback(); return false; }
// … the UPDATE + any N-N sync …
var after = await GetByIdAsync(connection, transaction, id, ct);    // inside the transaction
transaction.Commit();
await _rowAudit.LogUpdateAsync(AuditTableName, before, after!, ct); // after the commit
```

Two rules hold everywhere:

- **Snapshots are read inside the transaction**, so a diff cannot straddle a concurrent edit.
- **The audit row is written after `Commit()`**, on its own connection. It is deliberately
  *not* in the transaction: the writer swallows its own failures, and a row that rolled back
  must never be audited as though it happened.

> **Putting the audit INSERT inside the business transaction was considered and declined —
> twice. Don't re-litigate it without reading this.** It sounds stricter, but it buys nothing
> and costs plenty:
>
> - The goal it is usually proposed for — *"a rolled-back or failed change leaves no audit
>   row"* — **already holds**. The audit call sits after a successful `Commit()`; every
>   failure and rollback path returns before reaching it.
> - It contradicts the decision that a failed audit must not fail the caller. Inside the
>   transaction, a failed audit INSERT rolls back a save the user already completed.
> - "Catch it and commit anyway" does not work: a SQL error dooms the transaction, so the
>   commit fails too.
> - `IRowAuditWriter` would have to take `(IDbConnection, IDbTransaction)`, so it could no
>   longer open its own connection, and the non-transactional repositories (Partner,
>   PublishStatus, CourseGroup, FeaturedPromoItem) would each need a transaction invented for
>   them.
>
> The accepted trade is the reverse failure: a committed change whose audit write fails leaves
> no audit row. That gap is logged as a warning and listed under Known gaps.

A `Delete` reads the row first — it needs the entity for ActionDesc, and that read doubles as
the existence check (`CourseRepository.DeleteAsync` dropped its `SELECT COUNT(1)` for it).
`Course` deletes are audited only when one actually happened; not-found and child-row-blocked
attempts return earlier.

Cost: an Update now costs two extra `GetById`s. Accepted deliberately — a back-office CMS has
the headroom, and without both snapshots there is no diff to record.

## The three calls

```csharp
Task LogInsertAsync<T>(string tableName, T entity, CancellationToken ct = default) where T : class;
Task LogUpdateAsync<T>(string tableName, T before, T after, CancellationToken ct = default) where T : class;
Task LogDeleteAsync<T>(string tableName, T entity, CancellationToken ct = default) where T : class;
```

Async with a `CancellationToken`, matching every repository. Call them **after** the
business row is committed.

## What lands in each column

| Column | Value |
|--------|-------|
| `TableName` | passed in by the caller, e.g. `"Course"` |
| `UserName` | the current request's token `name` claim; **`"system"`** when there is no authenticated caller |
| `PrimaryKeyValues` | the entity's `pkid` property (matched **case-insensitively**), `ToString()`d; `""` if the type has no such property |
| `ActionType` | `"Insert"` / `"Update"` / `"Delete"` |
| `ActionDesc` | Insert & Delete: the **first string property in declaration order**. Update: the **changed property names**, `", "`-separated |
| `DateTime` | `TimeProvider.GetUtcNow()` — **UTC**, matching how `GETUTCDATE()` stamps `PasswordUpdatedTime` |

Declaration order is pinned by ordering on `PropertyInfo.MetadataToken` — `GetProperties()`
guarantees no order of its own, and "the FIRST string property" depends on one. The
per-type reflection is cached in a static `ConcurrentDictionary`.

## Decisions worth knowing

### A failed audit write never fails the caller

`WriteAsync` catches everything and logs a warning. The writer runs *after* the business
row is already committed, so throwing would report a failure for work that actually
succeeded — the caller would get a 500 for a save that is sitting in the database. The
audit trail is the thing allowed to have a gap, not the data.

### An update that changed nothing writes no row

`LogUpdateAsync` compares property by property and returns early when the list is empty.
"Someone opened the form and saved it" is noise, and an empty `ActionDesc` would not be
distinguishable from one we failed to build. The spec permitted either this or an empty
string.

### ⚠️ Derived properties must carry `[NotAudited]`

A response model holds more than its own columns: labels flattened in by a JOIN
(`Course.PartnerName`, `FeaturedPromoItem.PromoCode`) and subquery counts
(`AppRole.UserCount`, `CourseGroup.CourseCount`). `Auditing/NotAuditedAttribute` marks them
and `AuditableProperties` drops them, for the diff, the first-string-property rule and the
pkid lookup alike.

Without it, one edit reports twice — changing `Course.PartnerPkid` would log
`"PartnerPkid, PartnerName"` — and worse, `CourseGroup.CourseCount` moves when *another*
table changes, so a row nobody touched would appear to have been edited.

Currently marked: `AppRole.UserCount`; `AppUser.RoleCount`; `CourseGroup.CourseCount` and
`PartnerCourseGroupCount`; `Course.PartnerName`, `CourseGroupDescription`,
`PublishStatusDescription`, `CertificationCount`, `JobCategoryCount`;
`FeaturedPromoItem.PromoCode`. `Partner` and `PublishStatus` have none — every property is a
column.

> **Mark the derived properties on any new model.** Forgetting fails *silently*: the audit
> rows are merely noisier and nothing breaks, so nothing tells you.

### Collections compare element-wise, not by reference

The N-N link properties (`AppRole.UserIds`, `AppUser.RoleIds`, …) are `List<string>`,
which does not override `Equals`. A plain `Equals` would report **every N-N property as
changed on every update**, because `before` and `after` are always different instances.
`ValuesMatch` walks any non-string `IEnumerable` element-wise instead. (`string` is
`IEnumerable<char>` and is deliberately excluded — it is compared as a value.)

> Note this interacts with the CLAUDE.md gotcha that a list row's N-N arrays are empty:
> auditing an update built from a list row would report the links as cleared, because as
> far as the writer can see, they were.

### ⚠️ `ActionDesc` is `varchar(1000)` — that is a **byte** budget, not 1000 characters

The database collation is `Chinese_Taiwan_Stroke_CI_AS`, so a `varchar` column is measured
in cp950 bytes and a Chinese character costs two. **500 characters is the real ceiling**;
truncating at 1000 characters would let a 501-character 中文 title through and SQL Server
would reject the insert outright with *"String or binary data would be truncated."*
`TruncateToAnsiBytes` costs every non-ASCII character at two bytes — cp950 never emits
more than two per character (an unmappable one collapses to a single `?`), so the bound
never under-counts, which is the direction that matters.

The lossiness is **accepted, not fixed**: a character outside Big5 (emoji, kana, Cyrillic)
is stored as `?` by the column's own type, whatever the writer does. Widening it to
`nvarchar(1000)` would be a schema change and was declined. `UserName` and
`PrimaryKeyValues` are `nvarchar`, so those truncate by character count.

### UserName goes stale after a rename

The token is not re-issued on a self-service rename (see `Authorization.md`), so the audit
row records the name as it stood when the token was minted. Accepted: it costs no database
round-trip, and an audit trail wants the name the actor was using at the time anyway.

### Why the repository is a separate seam

Dapper's async extensions require a real `DbConnection`, so a mocked `IDbConnectionFactory`
cannot stand in for one and `RowAuditWriter` could not be unit-tested if it held the SQL
itself. `IRowAuditRepository` is that seam; repositories call the **writer**, never it.
Parameters are typed `DbType.AnsiString` for the `varchar` columns so SqlClient sends
`varchar` rather than making SQL Server convert down from `nvarchar` on every insert.

## Tests

`RowAuditWriterTests` (32) mocks `IRowAuditRepository`, so no database is touched. Covers:
Insert/Delete take the first string property (not the first property, not any string
property, null when it is null or absent); Update lists exactly the changed names in
declaration order, and writes **nothing** when nothing changed; collections compare
element-wise (5 ways of differing, incl. order); `pkid` read case-insensitively and `""`
when absent; UserName from the `name` claim, `"system"` for no HttpContext / an
unauthenticated identity / an absent, empty or whitespace claim; ActionDesc truncated at
1000 ASCII characters but **500 Chinese**; UserName at 100 characters; the UTC stamp; and
that a repository failure and an HttpContext failure are both swallowed.

### Verified against the live database

**The repository wiring is not covered by any test** — the suite mocks repositories at the
controller level, so nothing in it executes a `LogInsertAsync` call site. A green suite says
nothing about the wiring.

It cannot be unit-tested as things stand: repositories run Dapper, whose async extensions
require a real `DbConnection`, so a mocked `IDbConnectionFactory` cannot stand in for one.
(That limitation is exactly why `IRowAuditRepository` exists as a seam — it is what makes the
*writer* testable.) Adding a database-backed integration project was considered and declined:
it would break the `never hits the DB` rule in CLAUDE.md and buy an automated regression net
in exchange for state-dependent tests and a database to provision. Revisit if the wiring
starts breaking in practice.

So it was verified by driving the real API instead (as a throwaway Admin user, artifacts
cleaned up afterwards):

| Exercised | Resulting row |
|-----------|---------------|
| CourseGroup create → update → delete | `Insert/稽核測試群組`, `Update/Description`, `Delete/稽核測試群組-改名` |
| CourseGroup PUT twice with an identical body | the second wrote **no row** |
| AppRole update changing **only** `UserIds` | `Update/UserIds` — not `UserCount, UserIds` |
| Course update changing **only** `PartnerPkid` | `Update/PartnerPkid` — not `PartnerPkid, PartnerName` |
| Admin reset-password | `AppUser Update/PasswordUpdatedTime` |
| Self-service rename | `AppUser Update/UserName` |

Also confirmed on the stored rows: Chinese ActionDesc round-trips exactly (a console showing
mojibake is cp950 *display*, not storage); `UserName` came from the token's `name` claim on
every row; `DateTime` was stamped UTC; and no row contained any `PasswordHash` or anything
resembling a 64-hex blob.

> The rename row recorded the caller as `Audit Probe`, the *pre-rename* name — the token is
> not re-issued, exactly as the staleness note above predicts. Working as designed.

The SQL itself was driven directly too (in a rolled-back transaction): the exact INSERT lands
a row with `pkid` assigned by IDENTITY; 500 `課` occupies exactly 1000 bytes and fits; **501
fails with "String or binary data would be truncated"** — confirming the byte-budget premise
the truncation rests on; 1000 ASCII characters fit. `UserName` (nvarchar) round-trips `孫小明`
exactly; `ActionDesc` (varchar) preserves Big5-representable Chinese (`報表模組`) but stores
`カナ` as `??`.

## Known gaps (deliberate, not oversights)

- **Cascade deletes are invisible.** `FK_Course_CourseGroup` is `ON DELETE CASCADE`, so
  deleting a CourseGroup destroys its Courses inside SQL Server. No repository sees those
  rows, so they get no audit row — only the `CourseGroup` delete is recorded.
- **A double password reset inside one `datetime` tick writes one row.** `PasswordUpdatedTime`
  is stamped by `GETUTCDATE()` and `datetime` resolves to ~3.33ms; two resets landing in the
  same tick produce an identical snapshot and the second is treated as "nothing changed".
  Harmless — the stored hash is the same either way.
- **Nothing reads RowAudit back.** No controller, no route, no Angular page, and no audit
  badge component. Writing it is the whole feature so far.

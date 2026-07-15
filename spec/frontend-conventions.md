# Frontend conventions (CMS.NG)

Read this when adding or modifying an Angular feature. See `reference-features.md` for
worked examples and `backend-conventions.md` for the API side.

- **Standalone components**, signals for state, `inject()` for DI. PrimeNG (Aura
  theme) for all UI controls; `provideAnimationsAsync`, `MessageService` +
  `ConfirmationService` are global in `app.config.ts`.
- **Path aliases** (`tsconfig.json`): `@env/environment`, `@app/*`. API base URL
  comes from `@env/environment` (`apiUrl`) — never hardcode; no dev proxy.
- **Feature folders**: `features/{table-plural}/{table}-list|-detail|-form/`.
  Data access in `core/services/`, models in `core/models/`.
- **List page**: sortable/paginated `p-table` + `p-drawer` filter. Persist state in
  sessionStorage under `{entity}-list-filters`, `{entity}-list-sort`,
  `{entity}-list-page`. `p-select` in the drawer uses `appendTo="body"`.
- **Form page**: Reactive Forms; `forkJoin` for parallel lookup + record load on init.
  PK handling depends on the PK type:
  - String OR **user-assigned** numeric PK: editable required control in add mode;
    `disable()`d in edit mode.
  - **IDENTITY** numeric PK (server-assigned, e.g. Partner): **hidden entirely in add
    mode**; shown `disable()`d in edit mode.
  Either way the PK is read back with `getRawValue()` for the update payload. IDENTITY
  create needs no 409 handling.
  N-N uses `p-multiselect` (`appendTo="body"`, `[maxSelectedLabels]="9999"`).
- **`bit` columns**: form control is `p-toggleswitch`; list/detail display uses `p-tag`
  (是/否, severity varies); filter drawer uses a tri-state `p-select` (options 是/否,
  `[showClear]="true"`, `appendTo="body"`) bound to a `bool | null` — null = no filter.
- **`date` columns**: control is `p-datepicker` (PrimeNG 20 — **not** the pre-v18
  `p-calendar`); multiline text is `pTextarea` on a `<textarea>` (**not** `pInputTextarea`).
  Convert with `toIsoDate()` / `fromIsoDate()` from **`core/utils/week.util.ts`** — they
  use local date components, so a SQL `date` never shifts a day for UTC+8.
  ⚠️ `feature-spec.template.md` and `sample1.spec.md` cite `core/utils/date.util.ts` /
  `toIso()` — **that file does not exist here**; they are generic course material for a
  different app. Use `week.util.ts`.
  (The `'Z'`-suffix trick is for `datetime` columns only — Dapper returns those with
  `Kind = Unspecified`. It does **not** apply to `date`.)
- **In-place list editing** (worked example: Course list, `features/courses/course-list`):
  editing state lives in the component (an `editingCell` signal + one `editValue` ngModel
  target), **not** PrimeNG's `pEditableColumn` — that directive is click-to-edit only and
  has no blur-save or validation hooks. Double-click opens the editor (single click never
  does); blur commits; Enter commits and Escape cancels on text/number inputs.
  - **Overlay editors** (`p-select`, `p-datepicker`): picking a value blurs the input
    *before* the value lands (mousedown precedes click), so a plain blur-commit closes
    the editor with the old value and drops the selection. Guard blur with the editor's
    `overlayVisible` (skip commit while open) and commit on `onSelect`/`onChange` plus
    `onClose`/`onHide` instead.
  - **Save = `getById` → merge the one edited field → PUT.** List rows lack the N-N
    pkids (populated on GET-by-id only) and the update endpoints *sync* those sets — a
    PUT built from the list row alone silently wipes the links.
  - Validate before persisting: an inline error (`.cell-error`) keeps the cell in edit
    mode; an unchanged value closes silently with no API call; a failed PUT reverts the
    cell (the row is only mutated on success) and raises an error toast.
  - FK columns edit the pkid via a lookup dropdown (`[filter]="true"` for long lists;
    `[showClear]="true"` on nullable FKs) and refresh the row's joined label after save.
  - Editable cells must not contain click-to-navigate links — the first click of the
    double-click would navigate. Keep row navigation on the 操作-column buttons.
- **Routing**: lazy `loadComponent`. Order `.../new` **before** `.../:id`. All app routes
  live in `protectedRoutes` under one pathless `canActivateChild: [authGuard]` parent;
  `login` is the only public route.
- **Auth** (see `spec/auth/Authorization.md`): the session lives in **sessionStorage**
  (`auth-profile`); `AuthService` exposes `isAuthenticated`/`userName`/`roles`/`isAdmin`
  signals, with roles decoded from the JWT — never a separate API call. A bearer
  interceptor, a 401→sign-out interceptor and `authGuard` are wired globally, so a new
  feature route needs no auth work: add it to `protectedRoutes` and it is guarded.
  Admin-only menu sections carry `adminOnly: true` — never match on the Chinese title.
- **Sidebar**: data-driven nav in `app.ts`; add each feature under its group
  (e.g. AppRole lives under `系統管理 Admin`, Partner under `課程管理 Course`).
- **Row-audit badge**: `<app-row-audit-badge tableName="X" [pkid]="record.pkid" />`
  (`core/components/row-audit-badge`) goes in the `.actions` of every detail/form page —
  forms only in edit mode. In **repeated hosts** (list 操作 columns, board cells) use
  `[compact]="true"`: icon-only, fetches on click instead of on load, so N rows add zero
  requests. Pass the **surrogate `pkid`**, never a string PK, since that is what
  `RowAudit.PrimaryKeyValues` holds. It injects an HTTP service either way, so any spec that
  renders a page hosting it needs `provideHttpClient()` + `provideHttpClientTesting()`. Full
  detail in `spec/admin/RowAudit.md`.
- **Bundle budget** was raised to 1MB/2MB because PrimeNG's Aura theme pushes the
  initial bundle to ~650kB. `anyComponentStyle` was raised 4kB → 6kB (warning; the 8kB
  error ceiling stands): `app.scss` owns the entire sidebar layout and already sat at
  ~3.98kB, so the signed-in user block tipped it over.

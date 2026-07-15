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
- **Routing**: lazy `loadComponent`. Order `.../new` **before** `.../:id`.
- **Sidebar**: data-driven nav in `app.ts`; add each feature under its group
  (e.g. AppRole lives under `系統管理 Admin`, Partner under `課程管理 Course`).
- **Bundle budget** was raised to 1MB/2MB because PrimeNG's Aura theme pushes the
  initial bundle to ~650kB.

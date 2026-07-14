import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'app-roles', pathMatch: 'full' },
  {
    path: 'app-roles',
    loadComponent: () =>
      import('@app/features/app-roles/app-role-list/app-role-list').then((m) => m.AppRoleList),
  },
  {
    // Must precede ':id' so "new" is not captured as a role id.
    path: 'app-roles/new',
    loadComponent: () =>
      import('@app/features/app-roles/app-role-form/app-role-form').then((m) => m.AppRoleForm),
  },
  {
    path: 'app-roles/:id/edit',
    loadComponent: () =>
      import('@app/features/app-roles/app-role-form/app-role-form').then((m) => m.AppRoleForm),
  },
  {
    path: 'app-roles/:id',
    loadComponent: () =>
      import('@app/features/app-roles/app-role-detail/app-role-detail').then((m) => m.AppRoleDetail),
  },
  {
    path: 'partners',
    loadComponent: () =>
      import('@app/features/partners/partner-list/partner-list').then((m) => m.PartnerList),
  },
  {
    // Must precede ':id' so "new" is not captured as a pkid.
    path: 'partners/new',
    loadComponent: () =>
      import('@app/features/partners/partner-form/partner-form').then((m) => m.PartnerForm),
  },
  {
    path: 'partners/:id/edit',
    loadComponent: () =>
      import('@app/features/partners/partner-form/partner-form').then((m) => m.PartnerForm),
  },
  {
    path: 'partners/:id',
    loadComponent: () =>
      import('@app/features/partners/partner-detail/partner-detail').then((m) => m.PartnerDetail),
  },
  { path: '**', redirectTo: 'app-roles' },
];

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
  { path: '**', redirectTo: 'app-roles' },
];

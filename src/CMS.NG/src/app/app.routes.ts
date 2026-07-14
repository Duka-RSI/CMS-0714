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
    path: 'course-groups',
    loadComponent: () =>
      import('@app/features/course-groups/course-group-list/course-group-list').then(
        (m) => m.CourseGroupList,
      ),
  },
  {
    // Must precede ':id' so "new" is not captured as a group id.
    path: 'course-groups/new',
    loadComponent: () =>
      import('@app/features/course-groups/course-group-form/course-group-form').then(
        (m) => m.CourseGroupForm,
      ),
  },
  {
    path: 'course-groups/:id/edit',
    loadComponent: () =>
      import('@app/features/course-groups/course-group-form/course-group-form').then(
        (m) => m.CourseGroupForm,
      ),
  },
  {
    path: 'course-groups/:id',
    loadComponent: () =>
      import('@app/features/course-groups/course-group-detail/course-group-detail').then(
        (m) => m.CourseGroupDetail,
      ),
  },
  { path: '**', redirectTo: 'app-roles' },
];

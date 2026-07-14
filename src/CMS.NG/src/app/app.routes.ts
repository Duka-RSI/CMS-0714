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
  {
    path: 'publish-statuses',
    loadComponent: () =>
      import('@app/features/publish-statuses/publish-status-list/publish-status-list').then(
        (m) => m.PublishStatusList,
      ),
  },
  {
    // Must precede ':id' so "new" is not captured as a pkid.
    path: 'publish-statuses/new',
    loadComponent: () =>
      import('@app/features/publish-statuses/publish-status-form/publish-status-form').then(
        (m) => m.PublishStatusForm,
      ),
  },
  {
    path: 'publish-statuses/:id/edit',
    loadComponent: () =>
      import('@app/features/publish-statuses/publish-status-form/publish-status-form').then(
        (m) => m.PublishStatusForm,
      ),
  },
  {
    path: 'publish-statuses/:id',
    loadComponent: () =>
      import('@app/features/publish-statuses/publish-status-detail/publish-status-detail').then(
        (m) => m.PublishStatusDetail,
      ),
  },
  { path: '**', redirectTo: 'app-roles' },
];

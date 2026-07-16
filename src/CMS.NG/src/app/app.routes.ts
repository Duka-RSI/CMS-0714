import { Routes } from '@angular/router';
import { authGuard } from '@app/core/guards/auth.guard';

/**
 * Routes that require a session. Landing on 'courses' rather than 'app-roles': app-roles
 * is an Admin-only API, so a non-Admin landing there would meet a 403 on first paint.
 */
const protectedRoutes: Routes = [
  { path: '', redirectTo: 'courses', pathMatch: 'full' },
  {
    // The signed-in user's own account. Every role has one, so no Admin gate.
    path: 'profile',
    loadComponent: () =>
      import('@app/features/profile/my-profile/my-profile').then((m) => m.MyProfile),
  },
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
    path: 'app-users',
    loadComponent: () =>
      import('@app/features/app-users/app-user-list/app-user-list').then((m) => m.AppUserList),
  },
  {
    // Must precede ':id' so "new" is not captured as a user id.
    path: 'app-users/new',
    loadComponent: () =>
      import('@app/features/app-users/app-user-form/app-user-form').then((m) => m.AppUserForm),
  },
  {
    path: 'app-users/:id/edit',
    loadComponent: () =>
      import('@app/features/app-users/app-user-form/app-user-form').then((m) => m.AppUserForm),
  },
  {
    path: 'app-users/:id',
    loadComponent: () =>
      import('@app/features/app-users/app-user-detail/app-user-detail').then((m) => m.AppUserDetail),
  },
  {
    // Custom board (tabs + week navigator + inline forms) — no detail/form routes.
    path: 'featured-promo-items',
    loadComponent: () =>
      import(
        '@app/features/featured-promo-items/featured-promo-item-board/featured-promo-item-board'
      ).then((m) => m.FeaturedPromoItemBoard),
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
    path: 'courses',
    loadComponent: () =>
      import('@app/features/courses/course-list/course-list').then((m) => m.CourseList),
  },
  {
    // Must precede ':id' so "new" is not captured as a pkid.
    path: 'courses/new',
    loadComponent: () =>
      import('@app/features/courses/course-form/course-form').then((m) => m.CourseForm),
  },
  {
    path: 'courses/:id/edit',
    loadComponent: () =>
      import('@app/features/courses/course-form/course-form').then((m) => m.CourseForm),
  },
  {
    path: 'courses/:id',
    loadComponent: () =>
      import('@app/features/courses/course-detail/course-detail').then((m) => m.CourseDetail),
  },
  {
    path: 'course-groups',
    loadComponent: () =>
      import('@app/features/course-groups/course-group-list/course-group-list').then(
        (m) => m.CourseGroupList,
      ),
  },
  {
    // Must precede ':id' so "new" is not captured as a pkid.
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
  { path: '**', redirectTo: 'courses' },
];

export const routes: Routes = [
  {
    // The only public route.
    path: 'login',
    loadComponent: () => import('@app/features/auth/login/login').then((m) => m.Login),
  },
  {
    // canActivateChild rather than canActivate: it re-runs on every child navigation, and
    // any route added to protectedRoutes later is guarded without anyone remembering to.
    path: '',
    canActivateChild: [authGuard],
    children: protectedRoutes,
  },
];

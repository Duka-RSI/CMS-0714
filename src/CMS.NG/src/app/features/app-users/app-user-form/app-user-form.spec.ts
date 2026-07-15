import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ConfirmationService, MessageService } from 'primeng/api';

import { AppUserForm } from './app-user-form';
import { AppUserService } from '@app/core/services/app-user.service';
import { LookupService } from '@app/core/services/lookup.service';
import { AppUser } from '@app/core/models/app-user.model';
import { AppRoleLookup } from '@app/core/models/app-role-lookup.model';
import { tokenWithRoles } from '@app/testing/jwt.fixture';

const roles: AppRoleLookup[] = [
  { roleId: 'admin', roleName: 'Administrator' },
  { roleId: 'editor', roleName: 'Content Editor' },
];

const user: AppUser = {
  pkid: 1,
  userId: 'miles@uuu.com.tw',
  userName: 'Miles',
  isActive: true,
  passwordUpdatedTime: null,
  roleCount: 2,
  roleIds: ['admin', 'editor'],
};

/**
 * Seeds a session before the component is built — AuthService reads session storage once,
 * on construction. Defaults to an Admin so the existing cases see the full toolbar.
 */
function signIn(signedInRoles: string | string[] = ['Admin']): void {
  sessionStorage.setItem(
    'auth-profile',
    JSON.stringify({
      userId: 'admin@uuu.com.tw',
      userName: 'Admin',
      accessToken: tokenWithRoles(signedInRoles),
    }),
  );
}

function setup(routeId: string | null, signedInRoles: string | string[] = ['Admin']) {
  signIn(signedInRoles);

  const service = jasmine.createSpyObj<AppUserService>('AppUserService', [
    'getById',
    'create',
    'update',
    'resetPassword',
  ]);
  const lookupService = jasmine.createSpyObj<LookupService>('LookupService', ['getAppRoles']);
  lookupService.getAppRoles.and.returnValue(of(roles));
  service.getById.and.returnValue(of(user));
  service.create.and.returnValue(of(user));
  service.update.and.returnValue(of(void 0));
  service.resetPassword.and.returnValue(of(void 0));

  const confirmationService = jasmine.createSpyObj<ConfirmationService>('ConfirmationService', [
    'confirm',
  ]);

  TestBed.configureTestingModule({
    imports: [AppUserForm],
    providers: [
      { provide: AppUserService, useValue: service },
      { provide: LookupService, useValue: lookupService },
      { provide: ConfirmationService, useValue: confirmationService },
      MessageService,
      provideRouter([]),
      // AuthService (injected for the Admin-only reset button) needs HttpClient.
      provideHttpClient(),
      provideHttpClientTesting(),
      provideNoopAnimations(),
      // Must come after provideRouter() so this mock wins over the router's ActivatedRoute.
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap(routeId ? { id: routeId } : {}) } },
      },
    ],
  });

  const fixture: ComponentFixture<AppUserForm> = TestBed.createComponent(AppUserForm);
  const component = fixture.componentInstance;
  fixture.detectChanges(); // ngOnInit
  return { fixture, component, service, lookupService, confirmationService };
}

/** The reset button, or null when it is not rendered. */
function resetButton(fixture: ComponentFixture<AppUserForm>): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector('[data-testid="reset-password"]');
}

// The toolbar must stay pinned (position: sticky) so 儲存/取消 remain reachable on long forms.
function expectStickyToolbar(fixture: ComponentFixture<AppUserForm>): void {
  const header = (fixture.nativeElement as HTMLElement).querySelector('.page-header')!;
  const style = getComputedStyle(header);
  expect(style.position).toBe('sticky');
  expect(style.top).toBe('-20px');
  const labels = Array.from(header.querySelectorAll('.actions button')).map(
    (b) => b.textContent?.trim() ?? '',
  );
  expect(labels).toContain('取消');
  expect(labels).toContain('儲存');
}

describe('AppUserForm (reset password to default)', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    sessionStorage.clear();
  });

  it('shows the button for an Admin editing a user', () => {
    const { fixture, component } = setup('miles@uuu.com.tw', ['Admin', 'User']);

    expect(component['canResetPassword']()).toBeTrue();
    expect(resetButton(fixture)?.textContent).toContain('重設密碼');
  });

  it('hides the button from a non-Admin', () => {
    const { fixture, component } = setup('miles@uuu.com.tw', ['User']);

    // The endpoint is [Authorize(Roles="Admin")] regardless — this only hides the affordance.
    expect(component['canResetPassword']()).toBeFalse();
    expect(resetButton(fixture)).toBeNull();
  });

  it('hides the button when the signed-in user has no roles', () => {
    const { fixture } = setup('miles@uuu.com.tw', []);

    expect(resetButton(fixture)).toBeNull();
  });

  it('does not treat a similarly-named role as Admin', () => {
    const { fixture } = setup('miles@uuu.com.tw', ['Administrator']);

    expect(resetButton(fixture)).toBeNull();
  });

  it('hides the button in add mode even for an Admin', () => {
    const { fixture, component } = setup(null, ['Admin']);

    // Nothing to reset: the user does not exist yet.
    expect(component['canResetPassword']()).toBeFalse();
    expect(resetButton(fixture)).toBeNull();
  });

  it('confirms before resetting', () => {
    const { component, confirmationService, service } = setup('miles@uuu.com.tw');

    component.confirmResetPassword();

    expect(confirmationService.confirm).toHaveBeenCalled();
    // Nothing happens until the confirmation is accepted.
    expect(service.resetPassword).not.toHaveBeenCalled();
    const args = confirmationService.confirm.calls.mostRecent().args[0];
    expect(args.message).toContain('miles@uuu.com.tw');
    expect(args.message).toContain('系統預設密碼');
  });

  it('sends only the UserId when the confirmation is accepted', () => {
    const { component, confirmationService, service } = setup('miles@uuu.com.tw');

    component.confirmResetPassword();
    confirmationService.confirm.calls.mostRecent().args[0].accept!();

    // No password and no hash leave the client — the server owns the default.
    expect(service.resetPassword).toHaveBeenCalledOnceWith('miles@uuu.com.tw');
  });

  it('reads the UserId through getRawValue, since the control is disabled in edit mode', () => {
    const { component, confirmationService, service } = setup('miles@uuu.com.tw');
    expect(component['form'].controls.userId.disabled).toBeTrue();

    component.confirmResetPassword();
    confirmationService.confirm.calls.mostRecent().args[0].accept!();

    // .value would be undefined for a disabled control — this would send undefined.
    expect(service.resetPassword).toHaveBeenCalledOnceWith('miles@uuu.com.tw');
  });

  it('reports a 403 as a permissions problem', () => {
    const { component, confirmationService, service } = setup('miles@uuu.com.tw');
    service.resetPassword.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 403 })),
    );
    const messageService = TestBed.inject(MessageService);
    const add = spyOn(messageService, 'add');

    component.confirmResetPassword();
    confirmationService.confirm.calls.mostRecent().args[0].accept!();

    expect(add).toHaveBeenCalledWith(
      jasmine.objectContaining({ severity: 'error', detail: '您沒有重設密碼的權限。' }),
    );
    expect(component['resettingPassword']()).toBeFalse();
  });

  it('reports success and stops the loading state', () => {
    const { component, confirmationService } = setup('miles@uuu.com.tw');
    const add = spyOn(TestBed.inject(MessageService), 'add');

    component.confirmResetPassword();
    confirmationService.confirm.calls.mostRecent().args[0].accept!();

    expect(add).toHaveBeenCalledWith(jasmine.objectContaining({ severity: 'success' }));
    expect(component['resettingPassword']()).toBeFalse();
  });
});

describe('AppUserForm (add mode)', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    sessionStorage.clear();
  });

  it('loads role options and starts in add mode with userId editable', () => {
    const { component } = setup(null);
    expect(component['isEdit']()).toBeFalse();
    expect(component['roleOptions']().length).toBe(2);
    expect(component['form'].controls.userId.enabled).toBeTrue();
    expect(component['form'].controls.isActive.value).toBeTrue();
  });

  it('has no password control at all', () => {
    const { component, fixture } = setup(null);
    // The form must not carry a password: the server assigns the default hash.
    expect(component['form'].get('password')).toBeNull();
    expect(component['form'].get('passwordHash')).toBeNull();
    const inputs = (fixture.nativeElement as HTMLElement).querySelectorAll('input[type=password]');
    expect(inputs.length).toBe(0);
  });

  it('does not submit an invalid form', () => {
    const { component, service } = setup(null);
    component['save']();
    expect(service.create).not.toHaveBeenCalled();
    expect(component['form'].controls.userId.touched).toBeTrue();
  });

  it('creates the user when the form is valid', () => {
    const { component, service } = setup(null);
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');

    component['form'].patchValue({
      userId: 'new@x.com',
      userName: 'New User',
      isActive: true,
      roleIds: ['editor'],
    });
    component['save']();

    expect(service.create).toHaveBeenCalledTimes(1);
    const arg = service.create.calls.mostRecent().args[0];
    expect(arg.userId).toBe('new@x.com');
    expect(arg.roleIds).toEqual(['editor']);
    expect(Object.keys(arg)).not.toContain('password');
    expect(navSpy).toHaveBeenCalledWith(['/app-users']);
  });

  it('shows a conflict message when the UserId already exists', () => {
    const { component, service } = setup(null);
    service.create.and.returnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    const messageService = TestBed.inject(MessageService);
    const addSpy = spyOn(messageService, 'add');

    component['form'].patchValue({ userId: 'miles@uuu.com.tw', userName: 'Dup' });
    component['save']();

    expect(addSpy).toHaveBeenCalled();
    expect(addSpy.calls.mostRecent().args[0].detail).toContain('已存在');
  });

  it('renders a sticky action toolbar with 儲存 and 取消', () => {
    const { fixture } = setup(null);
    expectStickyToolbar(fixture);
  });
});

describe('AppUserForm (edit mode)', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    sessionStorage.clear();
  });

  it('loads the user, patches the form and disables userId', () => {
    const { component, service } = setup('miles@uuu.com.tw');
    expect(service.getById).toHaveBeenCalledWith('miles@uuu.com.tw');
    expect(component['isEdit']()).toBeTrue();
    expect(component['form'].controls.userName.value).toBe('Miles');
    expect(component['form'].controls.userId.disabled).toBeTrue();
    expect(component['form'].controls.roleIds.value).toEqual(['admin', 'editor']);
  });

  it('updates the user on save, keeping the disabled userId in the payload', () => {
    const { component, service } = setup('miles@uuu.com.tw');
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');

    component['form'].patchValue({ userName: 'Miles (edited)', isActive: false });
    component['save']();

    expect(service.update).toHaveBeenCalledTimes(1);
    const arg = service.update.calls.mostRecent().args[0];
    expect(arg.userId).toBe('miles@uuu.com.tw');
    expect(arg.userName).toBe('Miles (edited)');
    expect(arg.isActive).toBeFalse();
    expect(navSpy).toHaveBeenCalledWith(['/app-users']);
  });

  it('renders a sticky action toolbar with 儲存 and 取消', () => {
    const { fixture } = setup('miles@uuu.com.tw');
    expectStickyToolbar(fixture);
  });
});

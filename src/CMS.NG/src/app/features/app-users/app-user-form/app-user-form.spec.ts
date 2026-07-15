import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { MessageService } from 'primeng/api';

import { AppUserForm } from './app-user-form';
import { AppUserService } from '@app/core/services/app-user.service';
import { LookupService } from '@app/core/services/lookup.service';
import { AppUser } from '@app/core/models/app-user.model';
import { AppRoleLookup } from '@app/core/models/app-role-lookup.model';

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

function setup(routeId: string | null) {
  const service = jasmine.createSpyObj<AppUserService>('AppUserService', [
    'getById',
    'create',
    'update',
  ]);
  const lookupService = jasmine.createSpyObj<LookupService>('LookupService', ['getAppRoles']);
  lookupService.getAppRoles.and.returnValue(of(roles));
  service.getById.and.returnValue(of(user));
  service.create.and.returnValue(of(user));
  service.update.and.returnValue(of(void 0));

  TestBed.configureTestingModule({
    imports: [AppUserForm],
    providers: [
      { provide: AppUserService, useValue: service },
      { provide: LookupService, useValue: lookupService },
      MessageService,
      provideRouter([]),
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
  return { fixture, component, service, lookupService };
}

describe('AppUserForm (add mode)', () => {
  afterEach(() => TestBed.resetTestingModule());

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
});

describe('AppUserForm (edit mode)', () => {
  afterEach(() => TestBed.resetTestingModule());

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
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { MessageService } from 'primeng/api';

import { AppRoleForm } from './app-role-form';
import { AppRoleService } from '@app/core/services/app-role.service';
import { LookupService } from '@app/core/services/lookup.service';
import { AppRole } from '@app/core/models/app-role.model';
import { AppUserLookup } from '@app/core/models/app-user-lookup.model';

const users: AppUserLookup[] = [
  { userId: 'helen', userName: 'helen' },
  { userId: 'miles@uuu.com.tw', userName: 'Miles Sun' },
];

const adminRole: AppRole = {
  pkid: 1,
  roleId: 'Admin',
  roleName: 'Administrator',
  permissionLevel: 1,
  description: '系統管理員',
  userCount: 2,
  userIds: ['helen', 'miles@uuu.com.tw'],
};

function setup(routeId: string | null) {
  const roleService = jasmine.createSpyObj<AppRoleService>('AppRoleService', [
    'getById',
    'create',
    'update',
  ]);
  const lookupService = jasmine.createSpyObj<LookupService>('LookupService', ['getAppUsers']);
  lookupService.getAppUsers.and.returnValue(of(users));
  roleService.getById.and.returnValue(of(adminRole));
  roleService.create.and.returnValue(of(adminRole));
  roleService.update.and.returnValue(of(void 0));

  TestBed.configureTestingModule({
    imports: [AppRoleForm],
    providers: [
      { provide: AppRoleService, useValue: roleService },
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

  const fixture: ComponentFixture<AppRoleForm> = TestBed.createComponent(AppRoleForm);
  const component = fixture.componentInstance;
  fixture.detectChanges(); // ngOnInit
  return { fixture, component, roleService, lookupService };
}

describe('AppRoleForm (add mode)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('loads user options and starts in add mode with defaults', () => {
    const { component } = setup(null);
    expect(component['isEdit']()).toBeFalse();
    expect(component['userOptions']().length).toBe(2);
    expect(component['form'].controls.permissionLevel.value).toBe(100);
    expect(component['form'].controls.roleId.enabled).toBeTrue();
  });

  it('does not submit an invalid form', () => {
    const { component, roleService } = setup(null);
    component['save']();
    expect(roleService.create).not.toHaveBeenCalled();
    expect(component['form'].controls.roleId.touched).toBeTrue();
  });

  it('creates the role when the form is valid', () => {
    const { component, roleService } = setup(null);
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');

    component['form'].patchValue({
      roleId: 'Editor',
      roleName: 'Content Editor',
      permissionLevel: 50,
      description: '編輯',
      userIds: ['helen'],
    });
    component['save']();

    expect(roleService.create).toHaveBeenCalledTimes(1);
    const arg = roleService.create.calls.mostRecent().args[0];
    expect(arg.roleId).toBe('Editor');
    expect(arg.userIds).toEqual(['helen']);
    expect(navSpy).toHaveBeenCalledWith(['/app-roles']);
  });

  it('shows a conflict message when the RoleId already exists', () => {
    const { component, roleService } = setup(null);
    roleService.create.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 409 })),
    );
    const messageService = TestBed.inject(MessageService);
    const addSpy = spyOn(messageService, 'add');

    component['form'].patchValue({ roleId: 'Admin', roleName: 'Dup', permissionLevel: 1 });
    component['save']();

    expect(addSpy).toHaveBeenCalled();
    const msg = addSpy.calls.mostRecent().args[0];
    expect(msg.detail).toContain('已存在');
  });
});

describe('AppRoleForm (edit mode)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('loads the role, patches the form and disables RoleId', () => {
    const { component, roleService } = setup('Admin');
    expect(roleService.getById).toHaveBeenCalledWith('Admin');
    expect(component['isEdit']()).toBeTrue();
    expect(component['form'].controls.roleName.value).toBe('Administrator');
    expect(component['form'].controls.roleId.disabled).toBeTrue();
    expect(component['form'].controls.userIds.value).toEqual(['helen', 'miles@uuu.com.tw']);
  });

  it('updates the role on save, keeping the disabled RoleId in the payload', () => {
    const { component, roleService } = setup('Admin');
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');

    component['form'].patchValue({ roleName: 'Administrator (edited)' });
    component['save']();

    expect(roleService.update).toHaveBeenCalledTimes(1);
    const arg = roleService.update.calls.mostRecent().args[0];
    expect(arg.roleId).toBe('Admin');
    expect(arg.roleName).toBe('Administrator (edited)');
    expect(navSpy).toHaveBeenCalledWith(['/app-roles']);
  });
});

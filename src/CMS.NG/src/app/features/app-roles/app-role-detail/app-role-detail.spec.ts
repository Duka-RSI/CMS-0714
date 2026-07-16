import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { MessageService } from 'primeng/api';

import { AppRoleDetail } from './app-role-detail';
import { AppRoleService } from '@app/core/services/app-role.service';
import { LookupService } from '@app/core/services/lookup.service';
import { AppRole } from '@app/core/models/app-role.model';

const role: AppRole = {
  pkid: 1,
  roleId: 'Admin',
  roleName: 'Administrator',
  permissionLevel: 1,
  description: '系統管理員',
  userCount: 2,
  userIds: ['helen', 'miles@uuu.com.tw'],
};

describe('AppRoleDetail', () => {
  let fixture: ComponentFixture<AppRoleDetail>;
  let component: AppRoleDetail;
  let roleService: jasmine.SpyObj<AppRoleService>;

  beforeEach(async () => {
    roleService = jasmine.createSpyObj<AppRoleService>('AppRoleService', ['getById']);
    const lookupService = jasmine.createSpyObj<LookupService>('LookupService', ['getAppUsers']);
    roleService.getById.and.returnValue(of(role));
    lookupService.getAppUsers.and.returnValue(
      of([
        { userId: 'helen', userName: 'helen' },
        { userId: 'miles@uuu.com.tw', userName: 'Miles Sun' },
      ]),
    );

    await TestBed.configureTestingModule({
      imports: [AppRoleDetail],
      providers: [
        { provide: AppRoleService, useValue: roleService },
        { provide: LookupService, useValue: lookupService },
        MessageService,
        provideRouter([]),
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        // Must come after provideRouter() so this mock wins over the router's ActivatedRoute.
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'Admin' }) } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppRoleDetail);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads the role by id from the route', () => {
    expect(roleService.getById).toHaveBeenCalledWith('Admin');
    expect(component['role']()?.roleName).toBe('Administrator');
  });

  it('builds user labels as "UserName (UserId)"', () => {
    expect(component['userLabels']()).toEqual(['helen (helen)', 'Miles Sun (miles@uuu.com.tw)']);
  });

  it('renders role fields', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Administrator');
    expect(text).toContain('系統管理員');
  });

  it('goEdit navigates to the edit route', () => {
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');
    component['goEdit']();
    expect(navSpy).toHaveBeenCalledWith(['/app-roles', 'Admin', 'edit']);
  });
});

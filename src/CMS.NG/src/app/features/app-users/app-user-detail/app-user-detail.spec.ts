import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { MessageService } from 'primeng/api';

import { AppUserDetail } from './app-user-detail';
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

describe('AppUserDetail', () => {
  let fixture: ComponentFixture<AppUserDetail>;
  let component: AppUserDetail;
  let serviceSpy: jasmine.SpyObj<AppUserService>;

  beforeEach(async () => {
    serviceSpy = jasmine.createSpyObj<AppUserService>('AppUserService', ['getById']);
    serviceSpy.getById.and.returnValue(of(user));
    const lookupService = jasmine.createSpyObj<LookupService>('LookupService', ['getAppRoles']);
    lookupService.getAppRoles.and.returnValue(of(roles));

    await TestBed.configureTestingModule({
      imports: [AppUserDetail],
      providers: [
        { provide: AppUserService, useValue: serviceSpy },
        { provide: LookupService, useValue: lookupService },
        MessageService,
        provideRouter([]),
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        // Must come after provideRouter() so this mock wins over the router's ActivatedRoute.
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'miles@uuu.com.tw' }) } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppUserDetail);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads the user by id from the route', () => {
    expect(serviceSpy.getById).toHaveBeenCalledWith('miles@uuu.com.tw');
    expect(component['user']()?.userName).toBe('Miles');
  });

  it('resolves role ids to readable labels', () => {
    expect(component['roleLabels']()).toEqual([
      'Administrator (admin)',
      'Content Editor (editor)',
    ]);
  });

  it('renders user fields but never a password', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Miles');
    expect(text).toContain('Administrator (admin)');
    expect(text).not.toContain('密碼雜湊');
    expect(text).not.toContain('PasswordHash');
  });

  it('goEdit navigates to the edit route', () => {
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');
    component['goEdit']();
    expect(navSpy).toHaveBeenCalledWith(['/app-users', 'miles@uuu.com.tw', 'edit']);
  });
});

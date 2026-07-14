import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { MessageService, ConfirmationService, Confirmation } from 'primeng/api';

import { AppRoleList } from './app-role-list';
import { AppRoleService } from '@app/core/services/app-role.service';
import { AppRole } from '@app/core/models/app-role.model';

describe('AppRoleList', () => {
  let fixture: ComponentFixture<AppRoleList>;
  let component: AppRoleList;
  let serviceSpy: jasmine.SpyObj<AppRoleService>;

  const roles: AppRole[] = [
    { pkid: 1, roleId: 'Admin', roleName: 'Administrator', permissionLevel: 1, description: '系統管理員', userCount: 3, userIds: [] },
    { pkid: 2, roleId: 'User', roleName: 'User', permissionLevel: 100, description: '一般使用者', userCount: 9, userIds: [] },
  ];

  beforeEach(async () => {
    serviceSpy = jasmine.createSpyObj<AppRoleService>('AppRoleService', ['query', 'delete']);
    serviceSpy.query.and.returnValue(of(roles));
    serviceSpy.delete.and.returnValue(of(void 0));

    await TestBed.configureTestingModule({
      imports: [AppRoleList],
      providers: [
        { provide: AppRoleService, useValue: serviceSpy },
        MessageService,
        ConfirmationService,
        provideRouter([]),
        provideNoopAnimations(),
      ],
    }).compileComponents();

    sessionStorage.clear();
    fixture = TestBed.createComponent(AppRoleList);
    component = fixture.componentInstance;
    fixture.detectChanges(); // runs ngOnInit -> load()
  });

  it('creates and loads roles on init', () => {
    expect(component).toBeTruthy();
    expect(serviceSpy.query).toHaveBeenCalledTimes(1);
    expect(component['roles']().length).toBe(2);
  });

  it('renders one row per role', () => {
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Administrator');
  });

  it('applyFilter persists filters to sessionStorage and reloads', () => {
    component['filters'] = { keyword: 'adm', permissionLevel: null };
    component['applyFilter']();
    expect(sessionStorage.getItem('app-role-list-filters')).toContain('adm');
    expect(serviceSpy.query).toHaveBeenCalledTimes(2);
  });

  it('clearFilter resets filters and removes saved state', () => {
    component['filters'] = { keyword: 'adm', permissionLevel: 1 };
    sessionStorage.setItem('app-role-list-filters', JSON.stringify(component['filters']));
    component['clearFilter']();
    expect(sessionStorage.getItem('app-role-list-filters')).toBeNull();
    expect(component['filters'].keyword).toBeNull();
  });

  it('is not marked as filtered before any filter is applied', () => {
    expect(component['isFiltered']()).toBeFalse();
    expect(component['activeFilterCount']()).toBe(0);
  });

  it('highlights as filtered and lists applied chips after applyFilter', () => {
    component['filters'] = { keyword: 'adm', permissionLevel: 1 };
    component['applyFilter']();
    expect(component['isFiltered']()).toBeTrue();
    expect(component['activeFilterCount']()).toBe(2);
    expect(component['appliedFilters']()).toEqual([
      { label: '關鍵字', value: 'adm' },
      { label: '權限等級', value: '1' },
    ]);
  });

  it('removes the filtered highlight on clearFilter', () => {
    component['filters'] = { keyword: 'adm', permissionLevel: null };
    component['applyFilter']();
    expect(component['isFiltered']()).toBeTrue();
    component['clearFilter']();
    expect(component['isFiltered']()).toBeFalse();
    expect(component['appliedFilters']().length).toBe(0);
  });

  it('restores the filtered highlight from saved session filters on init', async () => {
    sessionStorage.setItem('app-role-list-filters', JSON.stringify({ keyword: 'x', permissionLevel: null }));
    const f2 = TestBed.createComponent(AppRoleList);
    f2.detectChanges();
    expect(f2.componentInstance['isFiltered']()).toBeTrue();
    expect(f2.componentInstance['activeFilterCount']()).toBe(1);
  });

  it('confirmDelete deletes the role when the dialog is accepted', () => {
    const confirmationService = TestBed.inject(ConfirmationService);
    spyOn(confirmationService, 'confirm').and.callFake((c: Confirmation) => {
      c.accept?.();
      return confirmationService;
    });

    component['confirmDelete'](roles[0]);

    expect(serviceSpy.delete).toHaveBeenCalledWith('Admin');
    expect(serviceSpy.query).toHaveBeenCalledTimes(2); // reload after delete
  });

  it('goEdit navigates to the edit route', () => {
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');
    component['goEdit'](roles[1]);
    expect(navSpy).toHaveBeenCalledWith(['/app-roles', 'User', 'edit']);
  });
});

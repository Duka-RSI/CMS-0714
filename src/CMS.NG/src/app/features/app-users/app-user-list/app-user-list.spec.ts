import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { MessageService, ConfirmationService, Confirmation } from 'primeng/api';

import { AppUserList } from './app-user-list';
import { AppUserService } from '@app/core/services/app-user.service';
import { AppUser } from '@app/core/models/app-user.model';

describe('AppUserList', () => {
  let fixture: ComponentFixture<AppUserList>;
  let component: AppUserList;
  let serviceSpy: jasmine.SpyObj<AppUserService>;

  const users: AppUser[] = [
    {
      pkid: 1,
      userId: 'miles@uuu.com.tw',
      userName: 'Miles',
      isActive: true,
      passwordUpdatedTime: null,
      roleCount: 2,
      roleIds: [],
    },
    {
      pkid: 2,
      userId: 'helen',
      userName: 'Helen',
      isActive: false,
      passwordUpdatedTime: '2026-01-15T08:30:00',
      roleCount: 0,
      roleIds: [],
    },
  ];

  beforeEach(async () => {
    serviceSpy = jasmine.createSpyObj<AppUserService>('AppUserService', [
      'query',
      'delete',
      'resetPassword',
    ]);
    // Return a fresh array copy each call so in-place table sorting can't mutate the fixture.
    serviceSpy.query.and.returnValue(of([...users]));
    serviceSpy.delete.and.returnValue(of(void 0));
    serviceSpy.resetPassword.and.returnValue(of(void 0));

    await TestBed.configureTestingModule({
      imports: [AppUserList],
      providers: [
        { provide: AppUserService, useValue: serviceSpy },
        MessageService,
        ConfirmationService,
        provideRouter([]),
        provideNoopAnimations(),
      ],
    }).compileComponents();

    sessionStorage.clear();
    fixture = TestBed.createComponent(AppUserList);
    component = fixture.componentInstance;
    fixture.detectChanges(); // runs ngOnInit -> load()
  });

  it('creates and loads users on init', () => {
    expect(component).toBeTruthy();
    expect(serviceSpy.query).toHaveBeenCalledTimes(1);
    expect(component['users']().length).toBe(2);
  });

  it('renders one row per user', () => {
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Miles');
  });

  it('shows an em-dash for a user still on the default password', () => {
    // users[0].passwordUpdatedTime is null → "—" placeholder.
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('—');
  });

  it('applyFilter persists filters to sessionStorage and reloads', () => {
    component['filters'] = { keyword: 'miles', isActive: null };
    component['applyFilter']();
    expect(sessionStorage.getItem('app-user-list-filters')).toContain('miles');
    expect(serviceSpy.query).toHaveBeenCalledTimes(2);
  });

  it('clearFilter resets filters and removes saved state', () => {
    component['filters'] = { keyword: 'miles', isActive: true };
    sessionStorage.setItem('app-user-list-filters', JSON.stringify(component['filters']));
    component['clearFilter']();
    expect(sessionStorage.getItem('app-user-list-filters')).toBeNull();
    expect(component['filters'].keyword).toBeNull();
    expect(component['filters'].isActive).toBeNull();
  });

  it('is not marked as filtered before any filter is applied', () => {
    expect(component['isFiltered']()).toBeFalse();
    expect(component['activeFilterCount']()).toBe(0);
  });

  it('tracks the tri-state isActive filter as an applied chip', () => {
    component['filters'] = { keyword: null, isActive: false };
    component['applyFilter']();
    expect(component['isFiltered']()).toBeTrue();
    expect(component['appliedFilters']()).toEqual([{ label: '啟用', value: '停用' }]);
  });

  it('treats isActive=null as no filter', () => {
    component['filters'] = { keyword: null, isActive: null };
    component['applyFilter']();
    expect(component['activeFilterCount']()).toBe(0);
  });

  it('confirmDelete deletes the user when the dialog is accepted', () => {
    const confirmationService = TestBed.inject(ConfirmationService);
    spyOn(confirmationService, 'confirm').and.callFake((c: Confirmation) => {
      c.accept?.();
      return confirmationService;
    });

    component['confirmDelete'](users[0]);

    expect(serviceSpy.delete).toHaveBeenCalledWith('miles@uuu.com.tw');
    expect(serviceSpy.query).toHaveBeenCalledTimes(2); // reload after delete
  });

  it('confirmResetPassword resets the password when the dialog is accepted', () => {
    const confirmationService = TestBed.inject(ConfirmationService);
    spyOn(confirmationService, 'confirm').and.callFake((c: Confirmation) => {
      c.accept?.();
      return confirmationService;
    });

    component['confirmResetPassword'](users[0]);

    expect(serviceSpy.resetPassword).toHaveBeenCalledWith('miles@uuu.com.tw');
    expect(serviceSpy.query).toHaveBeenCalledTimes(2); // reload after reset
  });

  it('does not reset the password when the dialog is rejected', () => {
    const confirmationService = TestBed.inject(ConfirmationService);
    spyOn(confirmationService, 'confirm').and.callFake(() => confirmationService); // never accepts

    component['confirmResetPassword'](users[0]);

    expect(serviceSpy.resetPassword).not.toHaveBeenCalled();
  });

  it('goEdit navigates to the edit route', () => {
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');
    component['goEdit'](users[1]);
    expect(navSpy).toHaveBeenCalledWith(['/app-users', 'helen', 'edit']);
  });
});

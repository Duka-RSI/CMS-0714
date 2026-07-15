import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MessageService, ConfirmationService } from 'primeng/api';
import { App } from './app';
import { AuthService } from '@app/core/services/auth.service';
import { tokenWithRoles } from '@app/testing/jwt.fixture';

describe('App', () => {
  /**
   * Seeds a session before the component (and therefore AuthService) is created —
   * AuthService reads session storage once, on construction.
   */
  function signIn(roles: string | string[]): void {
    sessionStorage.setItem(
      'auth-profile',
      JSON.stringify({
        userId: 'miles@uuu.com.tw',
        userName: 'Miles',
        accessToken: tokenWithRoles(roles),
      }),
    );
  }

  function render(): ComponentFixture<App> {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    return fixture;
  }

  const textOf = (fixture: ComponentFixture<App>) =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  const sectionTitles = (fixture: ComponentFixture<App>) =>
    Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.menu-section-title'),
    ).map((el) => el.textContent?.trim());

  beforeEach(async () => {
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        MessageService,
        ConfirmationService,
      ],
    }).compileComponents();
  });

  afterEach(() => sessionStorage.clear());

  it('should create the app', () => {
    signIn(['Admin']);
    expect(render().componentInstance).toBeTruthy();
  });

  it('should render the UWA brand', () => {
    signIn(['Admin']);
    const compiled = render().nativeElement as HTMLElement;
    expect(compiled.querySelector('.logo-text')?.textContent).toContain('UWA');
  });

  // ----- Admin-only section -----

  it('shows the 系統管理 Admin section when the roles include Admin', () => {
    signIn(['Admin', 'User']);
    const fixture = render();

    expect(sectionTitles(fixture)).toContain('系統管理 Admin');
    expect(textOf(fixture)).toContain('角色 AppRole');

    const appRoleLink = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('a.menu-item'),
    ).find((a) => a.textContent?.includes('角色 AppRole'));
    expect(appRoleLink?.getAttribute('href')).toContain('/app-roles');
  });

  it('hides the 系統管理 Admin section for a non-Admin', () => {
    signIn(['User']);
    const fixture = render();

    expect(sectionTitles(fixture)).not.toContain('系統管理 Admin');
    // The whole section goes, children included.
    expect(textOf(fixture)).not.toContain('角色 AppRole');
    expect(textOf(fixture)).not.toContain('使用者 AppUser');
    expect(textOf(fixture)).not.toContain('發布狀態 PublishStatus');
  });

  it('keeps the ordinary 功能選單 section visible for a non-Admin', () => {
    signIn(['User']);
    const fixture = render();

    expect(sectionTitles(fixture)).toContain('功能選單');
    expect(textOf(fixture)).toContain('課程 Course');
  });

  it('hides the Admin section when the token carries no roles at all', () => {
    signIn([]);
    const fixture = render();

    expect(sectionTitles(fixture)).not.toContain('系統管理 Admin');
  });

  it('does not treat a similarly-named role as Admin', () => {
    signIn(['Administrator']);
    const fixture = render();

    // Exact match only — 'Administrator' is a different AppRole.RoleId.
    expect(sectionTitles(fixture)).not.toContain('系統管理 Admin');
  });

  // ----- Signed-in user / logout -----

  it('shows the signed-in UserName and a logout button', () => {
    signIn(['User']);
    const compiled = render().nativeElement as HTMLElement;

    expect(compiled.querySelector('.sidebar-user .user-name')?.textContent).toContain('Miles');
    expect(compiled.querySelector('.sidebar-user .logout-btn')).toBeTruthy();
  });

  it('logout() clears the session and returns to the login page', () => {
    signIn(['Admin']);
    const fixture = render();
    const auth = TestBed.inject(AuthService);
    const navigate = spyOn(fixture.componentInstance['router'], 'navigateByUrl');

    fixture.componentInstance.logout();

    expect(auth.isAuthenticated()).toBeFalse();
    expect(sessionStorage.getItem('auth-profile')).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/login');
  });

  it('clicking the logout button signs the user out', () => {
    signIn(['User']);
    const fixture = render();
    spyOn(fixture.componentInstance['router'], 'navigateByUrl');

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.sidebar-user .logout-btn')!
      .click();

    expect(TestBed.inject(AuthService).isAuthenticated()).toBeFalse();
  });

  // ----- Menu structure (unchanged behaviour) -----

  it('renders a third level: a collapsible group whose submenu holds 角色 AppRole', () => {
    signIn(['Admin']);
    const compiled = render().nativeElement as HTMLElement;

    const groupToggle = Array.from(compiled.querySelectorAll('button.menu-toggle')).find((b) =>
      b.textContent?.includes('使用者與角色'),
    );
    expect(groupToggle).withContext('expandable group toggle').toBeTruthy();

    const nestedAppRole = Array.from(compiled.querySelectorAll('.submenu a.menu-item')).find((a) =>
      a.textContent?.includes('角色 AppRole'),
    );
    expect(nestedAppRole).withContext('AppRole nested in submenu').toBeTruthy();
    expect(nestedAppRole?.getAttribute('href')).toContain('/app-roles');
  });

  it('toggleItem expands and collapses a group', () => {
    signIn(['Admin']);
    const app = render().componentInstance;

    const group = app['menu']()
      .flatMap((s) => s.items)
      .find((i) => i.children?.length);
    expect(group).toBeTruthy();

    const initial = !!group!.expanded;
    app['toggleItem'](group!);
    expect(!!group!.expanded).toBe(!initial);
    app['toggleItem'](group!);
    expect(!!group!.expanded).toBe(initial);
  });
});

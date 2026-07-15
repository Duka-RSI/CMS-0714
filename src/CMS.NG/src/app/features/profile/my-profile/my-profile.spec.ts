import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MessageService } from 'primeng/api';
import { environment } from '@env/environment';
import { MyProfile } from './my-profile';
import { AuthService } from '@app/core/services/auth.service';
import { tokenWithRoles } from '@app/testing/jwt.fixture';

describe('MyProfile', () => {
  let fixture: ComponentFixture<MyProfile>;
  let httpMock: HttpTestingController;
  const profileUrl = `${environment.apiUrl}/Auth/profile`;

  function signIn(roles: string | string[] = ['Admin', 'User'], userName = 'Miles'): void {
    sessionStorage.setItem(
      'auth-profile',
      JSON.stringify({
        userId: 'miles@uuu.com.tw',
        userName,
        accessToken: tokenWithRoles(roles),
      }),
    );
  }

  function render(): void {
    fixture = TestBed.createComponent(MyProfile);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  }

  const el = () => fixture.nativeElement as HTMLElement;
  const input = (id: string) => el().querySelector<HTMLInputElement>(`#${id}`)!;

  beforeEach(async () => {
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [MyProfile],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        MessageService,
      ],
    }).compileComponents();
  });

  afterEach(() => {
    httpMock.verify();
    sessionStorage.clear();
  });

  // ----- Read-only fields -----

  it('shows the UserId as a disabled field', () => {
    signIn();
    render();

    expect(input('userId').value).toBe('miles@uuu.com.tw');
    // UserId is the primary key — the endpoint cannot change it, so neither can the form.
    expect(input('userId').disabled).toBeTrue();
  });

  it('shows the roles read-only, with no control to edit them', () => {
    signIn(['Admin', 'User']);
    render();

    const roles = el().querySelector('[data-testid="roles"]')!;
    expect(roles.textContent).toContain('Admin');
    expect(roles.textContent).toContain('User');
    // Display only: no input, select or multiselect anywhere in the roles block.
    expect(roles.querySelector('input, select, .p-multiselect, .p-select')).toBeNull();
  });

  it('renders roles from the token, not from an API call', () => {
    signIn(['User']);
    render();

    // Nothing is fetched to draw this page.
    httpMock.expectNone(() => true);
    expect(el().querySelector('[data-testid="roles"]')!.textContent).toContain('User');
  });

  it('says so when the user has no roles', () => {
    signIn([]);
    render();

    expect(el().querySelector('[data-testid="roles"]')!.textContent).toContain('未指派任何角色');
  });

  it('seeds the UserName field from the session', () => {
    signIn(['User'], 'Miles Sun');
    render();

    expect(input('userName').value).toBe('Miles Sun');
    expect(input('userName').disabled).toBeFalse();
  });

  // ----- Saving -----

  it('sends only the userName — never the userId', () => {
    signIn();
    render();
    fixture.componentInstance['form'].setValue({ userName: 'Miles Sun' });

    fixture.componentInstance['save']();

    const req = httpMock.expectOne(profileUrl);
    expect(req.request.method).toBe('PUT');
    // The API takes the user from the token; sending an id would be meaningless at best.
    expect(req.request.body).toEqual({ userName: 'Miles Sun' });
    req.flush({ userId: 'miles@uuu.com.tw', userName: 'Miles Sun' });
  });

  it('updates the session and the shell name on success', () => {
    signIn(['User'], 'Miles');
    render();
    fixture.componentInstance['form'].setValue({ userName: 'Miles Sun' });

    fixture.componentInstance['save']();
    httpMock.expectOne(profileUrl).flush({ userId: 'miles@uuu.com.tw', userName: 'Miles Sun' });

    const auth = TestBed.inject(AuthService);
    expect(auth.userName()).toBe('Miles Sun');
    expect(JSON.parse(sessionStorage.getItem('auth-profile')!).userName).toBe('Miles Sun');
  });

  it('takes the server-trimmed name rather than the typed one', () => {
    signIn(['User'], 'Miles');
    render();
    fixture.componentInstance['form'].setValue({ userName: '  Miles Sun  ' });

    fixture.componentInstance['save']();
    // The server trims and returns the stored value.
    httpMock.expectOne(profileUrl).flush({ userId: 'miles@uuu.com.tw', userName: 'Miles Sun' });

    expect(TestBed.inject(AuthService).userName()).toBe('Miles Sun');
    expect(input('userName').value).toBe('Miles Sun');
  });

  it('leaves the roles untouched after a rename', () => {
    signIn(['Admin', 'User'], 'Miles');
    render();
    fixture.componentInstance['form'].setValue({ userName: 'Miles Sun' });

    fixture.componentInstance['save']();
    httpMock.expectOne(profileUrl).flush({ userId: 'miles@uuu.com.tw', userName: 'Miles Sun' });

    // The token is not re-issued, so the roles in it survive the rename.
    expect(TestBed.inject(AuthService).roles()).toEqual(['Admin', 'User']);
    expect(TestBed.inject(AuthService).isAdmin()).toBeTrue();
  });

  // ----- Validation -----

  it('does not call the API for a blank userName', () => {
    signIn();
    render();
    fixture.componentInstance['form'].setValue({ userName: '   ' });

    fixture.componentInstance['save']();

    // Validators.required accepts whitespace; the notBlank validator is what stops this.
    httpMock.expectNone(profileUrl);
    expect(fixture.componentInstance['form'].invalid).toBeTrue();
  });

  it('does not call the API for an empty userName', () => {
    signIn();
    render();
    fixture.componentInstance['form'].setValue({ userName: '' });

    fixture.componentInstance['save']();

    httpMock.expectNone(profileUrl);
  });

  it('keeps the old name in the session when saving fails', () => {
    signIn(['User'], 'Miles');
    render();
    fixture.componentInstance['form'].setValue({ userName: 'Miles Sun' });

    fixture.componentInstance['save']();
    httpMock.expectOne(profileUrl).flush(null, { status: 500, statusText: 'Server Error' });

    expect(TestBed.inject(AuthService).userName()).toBe('Miles');
    expect(fixture.componentInstance['saving']()).toBeFalse();
  });
});

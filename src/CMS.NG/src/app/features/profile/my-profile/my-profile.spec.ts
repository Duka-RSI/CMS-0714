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

  // ----- Change password: client-side validation -----

  describe('change password', () => {
    const changeUrl = `${environment.apiUrl}/Auth/change-password`;
    const valid = { currentPassword: 'CMS4fun#', newPassword: 'Str0ng!pass', confirmPassword: 'Str0ng!pass' };

    const passwordForm = () => fixture.componentInstance['passwordForm'];
    const submit = () => fixture.componentInstance['changePassword']();
    const errorText = () => fixture.componentInstance['passwordError']();

    beforeEach(() => {
      signIn();
      render();
    });

    it('posts the three plaintext fields and nothing else', () => {
      passwordForm().setValue(valid);

      submit();

      const req = httpMock.expectOne(changeUrl);
      expect(req.request.method).toBe('POST');
      // No userId (the token says who) and no hash — the client never computes one.
      expect(req.request.body).toEqual(valid);
      req.flush(null, { status: 204, statusText: 'No Content' });
    });

    it('rejects a new password shorter than 8 without calling the API', () => {
      passwordForm().setValue({ ...valid, newPassword: 'Aa1!', confirmPassword: 'Aa1!' });

      submit();

      httpMock.expectNone(changeUrl);
      expect(passwordForm().controls.newPassword.hasError('policy')).toBeTrue();
    });

    it('rejects a new password using fewer than 3 character classes', () => {
      passwordForm().setValue({ ...valid, newPassword: 'abcdefghij', confirmPassword: 'abcdefghij' });

      submit();

      httpMock.expectNone(changeUrl);
      expect(passwordForm().controls.newPassword.hasError('policy')).toBeTrue();
    });

    it('accepts a compliant new password', () => {
      passwordForm().setValue({ ...valid, newPassword: 'Abcdefg1', confirmPassword: 'Abcdefg1' });

      expect(passwordForm().controls.newPassword.hasError('policy')).toBeFalse();
      expect(passwordForm().valid).toBeTrue();
    });

    it('rejects a mismatched confirmation without calling the API', () => {
      passwordForm().setValue({ ...valid, confirmPassword: 'Str0ng!passX' });

      submit();

      httpMock.expectNone(changeUrl);
      expect(passwordForm().hasError('mismatch')).toBeTrue();
    });

    it('treats the confirmation as case-sensitive', () => {
      passwordForm().setValue({ ...valid, confirmPassword: 'STR0NG!PASS' });

      expect(passwordForm().hasError('mismatch')).toBeTrue();
    });

    it('requires all three fields', () => {
      passwordForm().setValue({ currentPassword: '', newPassword: '', confirmPassword: '' });

      submit();

      httpMock.expectNone(changeUrl);
      expect(passwordForm().controls.currentPassword.hasError('required')).toBeTrue();
      expect(passwordForm().controls.newPassword.hasError('required')).toBeTrue();
      expect(passwordForm().controls.confirmPassword.hasError('required')).toBeTrue();
    });

    it('reports only "required" for an empty new password, not a policy failure', () => {
      passwordForm().setValue({ ...valid, newPassword: '', confirmPassword: '' });

      // One message per problem: "" is empty, not non-compliant.
      expect(passwordForm().controls.newPassword.hasError('required')).toBeTrue();
      expect(passwordForm().controls.newPassword.hasError('policy')).toBeFalse();
    });

    it('shows the bilingual requirement message when the policy fails', () => {
      passwordForm().setValue({ ...valid, newPassword: 'abcdefghij', confirmPassword: 'abcdefghij' });
      passwordForm().controls.newPassword.markAsTouched();
      fixture.detectChanges();

      const text = el().querySelector('[data-testid="policy-error"]')?.textContent ?? '';
      expect(text).toContain('密碼長度至少需 8 碼');
      expect(text).toContain('大寫英文／小寫英文／數字／符號');
      expect(text).toContain('at least 3 of the 4 classes');
    });

    it('clears the fields after a successful change', () => {
      passwordForm().setValue(valid);

      submit();
      httpMock.expectOne(changeUrl).flush(null, { status: 204, statusText: 'No Content' });

      // No password left sitting in the DOM.
      expect(passwordForm().value.currentPassword).toBeFalsy();
      expect(passwordForm().value.newPassword).toBeFalsy();
      expect(fixture.componentInstance['changingPassword']()).toBeFalse();
    });

    it('keeps the session after a successful change', () => {
      passwordForm().setValue(valid);

      submit();
      httpMock.expectOne(changeUrl).flush(null, { status: 204, statusText: 'No Content' });

      // The token is untouched, so the user stays signed in.
      expect(TestBed.inject(AuthService).isAuthenticated()).toBeTrue();
    });

    it("shows the server's reason when it rejects the change", () => {
      passwordForm().setValue(valid);

      submit();
      httpMock
        .expectOne(changeUrl)
        .flush({ message: '目前密碼不正確。' }, { status: 400, statusText: 'Bad Request' });

      expect(errorText()).toBe('目前密碼不正確。');
      fixture.detectChanges();
      expect(el().querySelector('[data-testid="password-error"]')?.textContent).toContain(
        '目前密碼不正確。',
      );
    });

    it('keeps the user signed in when the current password is wrong', () => {
      passwordForm().setValue(valid);

      submit();
      httpMock
        .expectOne(changeUrl)
        .flush({ message: '目前密碼不正確。' }, { status: 400, statusText: 'Bad Request' });

      // The API returns 400 rather than 401 precisely so a typo does not sign anyone out.
      expect(TestBed.inject(AuthService).isAuthenticated()).toBeTrue();
    });

    it('falls back to a generic message on a server error', () => {
      passwordForm().setValue(valid);

      submit();
      httpMock.expectOne(changeUrl).flush(null, { status: 500, statusText: 'Server Error' });

      expect(errorText()).toContain('請稍後再試');
      expect(fixture.componentInstance['changingPassword']()).toBeFalse();
    });
  });
});

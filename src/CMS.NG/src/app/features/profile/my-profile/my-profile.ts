import { Component, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';

import { AuthService } from '@app/core/services/auth.service';
import {
  PASSWORD_REQUIREMENT_MESSAGE,
  isPasswordCompliant,
} from '@app/core/utils/password-policy';

/** Rejects a name that is only whitespace — Validators.required accepts "   ". */
function notBlank(control: { value: string | null }): { blank: true } | null {
  return (control.value ?? '').trim().length === 0 ? { blank: true } : null;
}

/** Mirrors the API's complexity rule so the form can complain without a round-trip. */
function passwordPolicy(control: AbstractControl): ValidationErrors | null {
  const value = control.value as string | null;
  // Leave "is it filled in?" to Validators.required — one error per problem.
  if (!value) {
    return null;
  }
  return isPasswordCompliant(value) ? null : { policy: true };
}

/** Group-level: the confirmation must equal the new password exactly. */
function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const newPassword = group.get('newPassword')?.value;
  const confirmPassword = group.get('confirmPassword')?.value;
  if (!newPassword || !confirmPassword) {
    return null;
  }
  return newPassword === confirmPassword ? null : { mismatch: true };
}

@Component({
  selector: 'app-my-profile',
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule, PasswordModule, TagModule],
  templateUrl: './my-profile.html',
  styleUrl: './my-profile.scss',
})
export class MyProfile {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly messageService = inject(MessageService);

  protected readonly saving = signal(false);

  /** Shown as the field hint and as the rejection message — identical to the API's. */
  protected readonly passwordRequirement = PASSWORD_REQUIREMENT_MESSAGE;

  protected readonly changingPassword = signal(false);
  protected readonly passwordError = signal('');

  /**
   * Read-only fields come from the session and the token — no API call. UserId and roles
   * are not editable here by design: the endpoint takes the user from the token and has no
   * way to accept either.
   */
  protected readonly userId = computed(() => this.auth.profile()?.userId ?? '');
  protected readonly roles = computed(() => this.auth.roles());

  protected readonly form = this.fb.group({
    userName: this.fb.control(this.auth.userName(), {
      validators: [Validators.required, Validators.maxLength(200), notBlank],
    }),
  });

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.auth.updateUserName(this.form.getRawValue().userName!).subscribe({
      next: (updated) => {
        this.saving.set(false);
        // Reflect the server's trimmed value back into the field.
        this.form.controls.userName.setValue(updated.userName);
        this.form.markAsPristine();
        this.messageService.add({
          severity: 'success',
          summary: '已儲存',
          detail: '使用者名稱已更新。',
        });
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.messageService.add({
          severity: 'error',
          summary: '儲存失敗',
          detail:
            error.status === 400 ? '使用者名稱不可為空白。' : '無法儲存，請稍後再試。',
        });
      },
    });
  }

  protected reset(): void {
    this.form.reset({ userName: this.auth.userName() });
  }

  // ----- Change password -----

  protected readonly passwordForm = this.fb.group(
    {
      currentPassword: this.fb.control('', { validators: [Validators.required] }),
      newPassword: this.fb.control('', { validators: [Validators.required, passwordPolicy] }),
      confirmPassword: this.fb.control('', { validators: [Validators.required] }),
    },
    { validators: [passwordsMatch] },
  );

  protected changePassword(): void {
    this.passwordError.set('');

    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    this.changingPassword.set(true);
    const { currentPassword, newPassword, confirmPassword } = this.passwordForm.getRawValue();

    this.auth
      .changePassword({
        currentPassword: currentPassword!,
        newPassword: newPassword!,
        confirmPassword: confirmPassword!,
      })
      .subscribe({
        next: () => {
          this.changingPassword.set(false);
          // Never leave a password sitting in the DOM once it has served its purpose.
          this.passwordForm.reset();
          this.messageService.add({
            severity: 'success',
            summary: '已變更',
            detail: '密碼已更新。',
          });
        },
        error: (error: HttpErrorResponse) => {
          this.changingPassword.set(false);
          // A 400 carries the server's reason (wrong current password / policy / mismatch);
          // show it rather than guess. A 401 never reaches here — the interceptor handles it.
          this.passwordError.set(
            error.status === 400
              ? (error.error?.message ?? '無法變更密碼，請檢查輸入內容。')
              : '無法變更密碼，請稍後再試。',
          );
        },
      });
  }
}

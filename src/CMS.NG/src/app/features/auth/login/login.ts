import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { MessageModule } from 'primeng/message';

import { AuthService } from '@app/core/services/auth.service';

/** Where a freshly signed-in user lands. Reachable by every role, unlike the 系統管理 pages. */
const LANDING_ROUTE = '/courses';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule, PasswordModule, MessageModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  protected readonly submitting = signal(false);
  /** Shown inline rather than as a toast — a login error belongs next to the form. */
  protected readonly errorMessage = signal('');

  protected readonly form = this.fb.group({
    userId: this.fb.control('', { validators: [Validators.required] }),
    password: this.fb.control('', { validators: [Validators.required] }),
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set('');

    const { userId, password } = this.form.getRawValue();
    this.auth.login({ userId: userId!, password: password! }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.router.navigateByUrl(LANDING_ROUTE);
      },
      error: (error: HttpErrorResponse) => {
        this.submitting.set(false);
        this.errorMessage.set(
          error.status === 401
            ? // The API will not say which check failed, and neither do we.
              (error.error?.message ?? '使用者代碼或密碼錯誤。')
            : '無法連線至伺服器，請稍後再試。',
        );
      },
    });
  }
}

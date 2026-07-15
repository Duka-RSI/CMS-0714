import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';

import { AuthService } from '@app/core/services/auth.service';

/** Rejects a name that is only whitespace — Validators.required accepts "   ". */
function notBlank(control: { value: string | null }): { blank: true } | null {
  return (control.value ?? '').trim().length === 0 ? { blank: true } : null;
}

@Component({
  selector: 'app-my-profile',
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule, TagModule],
  templateUrl: './my-profile.html',
  styleUrl: './my-profile.scss',
})
export class MyProfile {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly messageService = inject(MessageService);

  protected readonly saving = signal(false);

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
}

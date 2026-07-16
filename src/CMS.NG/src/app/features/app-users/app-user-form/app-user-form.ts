import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of, Observable } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { MessageModule } from 'primeng/message';
import { ConfirmationService, MessageService } from 'primeng/api';

import { AppUserRequest } from '@app/core/models/app-user.model';
import { AppRoleLookup } from '@app/core/models/app-role-lookup.model';
import { AppUserService } from '@app/core/services/app-user.service';
import { AuthService } from '@app/core/services/auth.service';
import { LookupService } from '@app/core/services/lookup.service';
import { RowAuditBadge } from '@app/core/components/row-audit-badge/row-audit-badge';

interface RoleOption {
  roleId: string;
  label: string;
}

@Component({
  selector: 'app-app-user-form',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    MultiSelectModule,
    ToggleSwitchModule,
    MessageModule,
    RowAuditBadge,
  ],
  templateUrl: './app-user-form.html',
  styleUrl: './app-user-form.scss',
})
export class AppUserForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(AppUserService);
  private readonly lookupService = inject(LookupService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly auth = inject(AuthService);

  protected readonly isEdit = signal(false);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly resettingPassword = signal(false);
  protected readonly roleOptions = signal<RoleOption[]>([]);
  // The IDENTITY surrogate the audit rows key on (UserId is the business PK, but RowAudit
  // stores pkid). The form does not carry it, so it is kept here for the history badge.
  protected readonly recordPkid = signal<number>(0);

  /**
   * Reset-to-default is Admin-only and needs an existing user, so it is hidden in add mode.
   *
   * Hiding it is an affordance: /api/app-users is [Authorize(Roles="Admin")], so a non-Admin
   * gets a 403 from the endpoint regardless of what the form renders.
   */
  protected readonly canResetPassword = computed(() => this.isEdit() && this.auth.isAdmin());

  // No password control: the backend owns PasswordHash entirely.
  protected readonly form = this.fb.group({
    userId: this.fb.control('', { validators: [Validators.required, Validators.maxLength(200)] }),
    userName: this.fb.control('', { validators: [Validators.required, Validators.maxLength(200)] }),
    isActive: this.fb.control<boolean>(true),
    roleIds: this.fb.control<string[]>([]),
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.isEdit.set(!!id);

    // Parallel lookup + (edit) record load.
    forkJoin({
      roles: this.lookupService.getAppRoles(),
      user: id ? this.service.getById(id) : of(null),
    }).subscribe({
      next: ({ roles, user }) => {
        this.roleOptions.set(this.toOptions(roles));
        if (user) {
          this.recordPkid.set(user.pkid);
          this.form.patchValue({
            userId: user.userId,
            userName: user.userName,
            isActive: user.isActive,
            roleIds: user.roleIds,
          });
          // UserId is the primary key — immutable in edit mode.
          this.form.controls.userId.disable();
        }
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: '載入失敗',
          detail: '無法載入表單資料。',
        });
        this.router.navigate(['/app-users']);
      },
    });
  }

  private toOptions(roles: AppRoleLookup[]): RoleOption[] {
    return roles.map((r) => ({ roleId: r.roleId, label: `${r.roleName} (${r.roleId})` }));
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    // getRawValue() includes the disabled userId control (needed for update).
    const raw = this.form.getRawValue();
    const request: AppUserRequest = {
      userId: raw.userId!,
      userName: raw.userName!,
      isActive: raw.isActive ?? true,
      roleIds: raw.roleIds ?? [],
    };

    this.saving.set(true);
    const op$: Observable<unknown> = this.isEdit()
      ? this.service.update(request)
      : this.service.create(request);

    op$.subscribe({
      next: () => {
        this.saving.set(false);
        this.messageService.add({
          severity: 'success',
          summary: this.isEdit() ? '更新成功' : '新增成功',
          detail: `使用者「${request.userName}」已儲存。`,
        });
        this.router.navigate(['/app-users']);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        const detail =
          err.status === 409
            ? `使用者代碼「${request.userId}」已存在。`
            : '儲存使用者時發生錯誤。';
        this.messageService.add({ severity: 'error', summary: '儲存失敗', detail });
      },
    });
  }

  cancel(): void {
    this.router.navigate(['/app-users']);
  }

  /**
   * Resets the edited user's password to the SysConfig default. Same wording as the list
   * page's per-row action, and the same endpoint.
   */
  confirmResetPassword(): void {
    // getRawValue(): userId is disabled in edit mode, so .value would not carry it.
    const raw = this.form.getRawValue();
    const userId = raw.userId!;
    const userName = raw.userName ?? '';

    this.confirmationService.confirm({
      header: '重設密碼確認',
      message: `確定要將使用者 <b>${userId}</b>「${userName}」的密碼重設為系統預設密碼？`,
      icon: 'pi pi-key',
      acceptLabel: '重設',
      rejectLabel: '取消',
      acceptButtonStyleClass: 'p-button-warn',
      accept: () => this.resetPassword(userId, userName),
    });
  }

  private resetPassword(userId: string, userName: string): void {
    this.resettingPassword.set(true);

    // Only the UserId goes out; the server owns the default password and returns 204.
    this.service.resetPassword(userId).subscribe({
      next: () => {
        this.resettingPassword.set(false);
        this.messageService.add({
          severity: 'success',
          summary: '重設成功',
          detail: `使用者「${userName}」的密碼已重設為系統預設密碼。`,
        });
      },
      error: (err: HttpErrorResponse) => {
        this.resettingPassword.set(false);
        this.messageService.add({
          severity: 'error',
          summary: '重設失敗',
          detail: err.status === 403 ? '您沒有重設密碼的權限。' : '重設密碼時發生錯誤。',
        });
      },
    });
  }
}

import { Component, OnInit, inject, signal } from '@angular/core';
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
import { MessageService } from 'primeng/api';

import { AppUserRequest } from '@app/core/models/app-user.model';
import { AppRoleLookup } from '@app/core/models/app-role-lookup.model';
import { AppUserService } from '@app/core/services/app-user.service';
import { LookupService } from '@app/core/services/lookup.service';

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

  protected readonly isEdit = signal(false);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly roleOptions = signal<RoleOption[]>([]);

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
}

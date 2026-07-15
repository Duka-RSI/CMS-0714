import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of, Observable } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { MultiSelectModule } from 'primeng/multiselect';
import { MessageModule } from 'primeng/message';
import { MessageService } from 'primeng/api';

import { AppRoleRequest } from '@app/core/models/app-role.model';
import { AppUserLookup } from '@app/core/models/app-user-lookup.model';
import { AppRoleService } from '@app/core/services/app-role.service';
import { LookupService } from '@app/core/services/lookup.service';
import { RowAuditBadge } from '@app/core/components/row-audit-badge/row-audit-badge';

interface UserOption {
  userId: string;
  label: string;
}

@Component({
  selector: 'app-app-role-form',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    MultiSelectModule,
    MessageModule,
    RowAuditBadge,
  ],
  templateUrl: './app-role-form.html',
  styleUrl: './app-role-form.scss',
})
export class AppRoleForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(AppRoleService);
  private readonly lookupService = inject(LookupService);
  private readonly messageService = inject(MessageService);

  protected readonly isEdit = signal(false);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly userOptions = signal<UserOption[]>([]);
  // The IDENTITY surrogate the audit rows key on (RoleId is the business PK, but RowAudit
  // stores pkid). The form does not carry it, so it is kept here for the history badge.
  protected readonly recordPkid = signal<number>(0);

  protected readonly form = this.fb.group({
    roleId: this.fb.control('', { validators: [Validators.required, Validators.maxLength(200)] }),
    roleName: this.fb.control('', { validators: [Validators.required, Validators.maxLength(200)] }),
    permissionLevel: this.fb.control<number>(100, { validators: [Validators.required] }),
    description: this.fb.control<string | null>(null, { validators: [Validators.maxLength(400)] }),
    userIds: this.fb.control<string[]>([]),
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.isEdit.set(!!id);

    // Parallel lookup + (edit) record load.
    forkJoin({
      users: this.lookupService.getAppUsers(),
      role: id ? this.service.getById(id) : of(null),
    }).subscribe({
      next: ({ users, role }) => {
        this.userOptions.set(this.toOptions(users));
        if (role) {
          this.recordPkid.set(role.pkid);
          this.form.patchValue({
            roleId: role.roleId,
            roleName: role.roleName,
            permissionLevel: role.permissionLevel,
            description: role.description,
            userIds: role.userIds,
          });
          // RoleId is the primary key — immutable in edit mode.
          this.form.controls.roleId.disable();
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
        this.router.navigate(['/app-roles']);
      },
    });
  }

  private toOptions(users: AppUserLookup[]): UserOption[] {
    return users.map((u) => ({ userId: u.userId, label: `${u.userName} (${u.userId})` }));
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    // getRawValue() includes the disabled roleId control (needed for update).
    const raw = this.form.getRawValue();
    const request: AppRoleRequest = {
      roleId: raw.roleId!,
      roleName: raw.roleName!,
      permissionLevel: raw.permissionLevel!,
      description: raw.description ?? null,
      userIds: raw.userIds ?? [],
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
          detail: `角色「${request.roleName}」已儲存。`,
        });
        this.router.navigate(['/app-roles']);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        const detail =
          err.status === 409
            ? `角色代碼「${request.roleId}」已存在。`
            : '儲存角色時發生錯誤。';
        this.messageService.add({ severity: 'error', summary: '儲存失敗', detail });
      },
    });
  }

  cancel(): void {
    this.router.navigate(['/app-roles']);
  }
}

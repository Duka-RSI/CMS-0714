import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { MessageModule } from 'primeng/message';
import { MessageService } from 'primeng/api';

import { PublishStatusRequest } from '@app/core/models/publish-status.model';
import { PublishStatusService } from '@app/core/services/publish-status.service';
import { RowAuditBadge } from '@app/core/components/row-audit-badge/row-audit-badge';

@Component({
  selector: 'app-publish-status-form',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    ToggleSwitchModule,
    MessageModule,
    RowAuditBadge,
  ],
  templateUrl: './publish-status-form.html',
  styleUrl: './publish-status-form.scss',
})
export class PublishStatusForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(PublishStatusService);
  private readonly messageService = inject(MessageService);

  protected readonly isEdit = signal(false);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  // pkid the audit rows key on; captured for the history badge as a plain signal read.
  protected readonly recordPkid = signal<number>(0);

  protected readonly form = this.fb.group({
    pkid: this.fb.control<number | null>(null, {
      validators: [Validators.required, Validators.min(0), Validators.max(255)],
    }),
    description: this.fb.control('', { validators: [Validators.required, Validators.maxLength(50)] }),
    isDraft: this.fb.control<boolean>(false),
    isPublished: this.fb.control<boolean>(false),
    isDiscontinued: this.fb.control<boolean>(false),
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.isEdit.set(!!id);

    if (id) {
      this.service.getById(Number(id)).subscribe({
        next: (status) => {
          this.recordPkid.set(status.pkid);
          this.form.patchValue({
            pkid: status.pkid,
            description: status.description,
            isDraft: status.isDraft,
            isPublished: status.isPublished,
            isDiscontinued: status.isDiscontinued,
          });
          // pkid is the user-assigned primary key — immutable in edit mode.
          this.form.controls.pkid.disable();
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.messageService.add({
            severity: 'error',
            summary: '載入失敗',
            detail: '無法載入表單資料。',
          });
          this.router.navigate(['/publish-statuses']);
        },
      });
    } else {
      this.loading.set(false);
    }
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    // getRawValue() includes the disabled pkid control (needed for update).
    const raw = this.form.getRawValue();
    const request: PublishStatusRequest = {
      pkid: raw.pkid!,
      description: raw.description!,
      isDraft: raw.isDraft ?? false,
      isPublished: raw.isPublished ?? false,
      isDiscontinued: raw.isDiscontinued ?? false,
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
          detail: `發布狀態「${request.description}」已儲存。`,
        });
        this.router.navigate(['/publish-statuses']);
      },
      error: (err: HttpErrorResponse) => {
        this.saving.set(false);
        const detail =
          err.status === 409
            ? `主代碼「${request.pkid}」已存在。`
            : '儲存發布狀態時發生錯誤。';
        this.messageService.add({ severity: 'error', summary: '儲存失敗', detail });
      },
    });
  }

  cancel(): void {
    this.router.navigate(['/publish-statuses']);
  }
}

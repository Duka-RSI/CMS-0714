import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { MessageModule } from 'primeng/message';
import { MessageService } from 'primeng/api';

import { PartnerRequest } from '@app/core/models/partner.model';
import { PartnerService } from '@app/core/services/partner.service';

@Component({
  selector: 'app-partner-form',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    MessageModule,
  ],
  templateUrl: './partner-form.html',
  styleUrl: './partner-form.scss',
})
export class PartnerForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(PartnerService);
  private readonly messageService = inject(MessageService);

  protected readonly isEdit = signal(false);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);

  // pkid is IDENTITY: hidden in add mode, shown disabled in edit mode.
  protected readonly form = this.fb.group({
    pkid: this.fb.control<number | null>(null),
    name: this.fb.control('', { validators: [Validators.required, Validators.maxLength(50)] }),
    appKey: this.fb.control('', { validators: [Validators.required, Validators.maxLength(10)] }),
    nameOnPartnerMenu: this.fb.control('', {
      validators: [Validators.required, Validators.maxLength(200)],
    }),
    nameOnCourseDetailPage: this.fb.control('', {
      validators: [Validators.required, Validators.maxLength(50)],
    }),
    displayOrder: this.fb.control<number | null>(0, { validators: [Validators.required] }),
    imageFilename: this.fb.control<string | null>(null, { validators: [Validators.maxLength(50)] }),
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.isEdit.set(!!id);

    if (id) {
      this.service.getById(Number(id)).subscribe({
        next: (partner) => {
          this.form.patchValue({
            pkid: partner.pkid,
            name: partner.name,
            appKey: partner.appKey,
            nameOnPartnerMenu: partner.nameOnPartnerMenu,
            nameOnCourseDetailPage: partner.nameOnCourseDetailPage,
            displayOrder: partner.displayOrder,
            imageFilename: partner.imageFilename,
          });
          // pkid is the IDENTITY primary key — immutable in edit mode.
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
          this.router.navigate(['/partners']);
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
    const request: PartnerRequest = {
      pkid: raw.pkid ?? 0,
      name: raw.name!,
      appKey: raw.appKey!,
      nameOnPartnerMenu: raw.nameOnPartnerMenu!,
      nameOnCourseDetailPage: raw.nameOnCourseDetailPage!,
      displayOrder: raw.displayOrder ?? 0,
      imageFilename: raw.imageFilename?.trim() ? raw.imageFilename.trim() : null,
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
          detail: `合作廠商「${request.name}」已儲存。`,
        });
        this.router.navigate(['/partners']);
      },
      error: () => {
        this.saving.set(false);
        this.messageService.add({
          severity: 'error',
          summary: '儲存失敗',
          detail: '儲存合作廠商時發生錯誤。',
        });
      },
    });
  }

  cancel(): void {
    this.router.navigate(['/partners']);
  }
}

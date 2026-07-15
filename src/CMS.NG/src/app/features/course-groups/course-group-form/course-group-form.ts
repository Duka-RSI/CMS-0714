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

import { CourseGroupRequest } from '@app/core/models/course-group.model';
import { CourseGroupService } from '@app/core/services/course-group.service';

@Component({
  selector: 'app-course-group-form',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    MessageModule,
  ],
  templateUrl: './course-group-form.html',
  styleUrl: './course-group-form.scss',
})
export class CourseGroupForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(CourseGroupService);
  private readonly messageService = inject(MessageService);

  protected readonly isEdit = signal(false);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);

  // pkid is IDENTITY: hidden in add mode, shown disabled in edit mode.
  protected readonly form = this.fb.group({
    pkid: this.fb.control<number | null>(null),
    description: this.fb.control('', {
      validators: [Validators.required, Validators.maxLength(100)],
    }),
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.isEdit.set(!!id);

    if (id) {
      this.service.getById(Number(id)).subscribe({
        next: (courseGroup) => {
          this.form.patchValue({
            pkid: courseGroup.pkid,
            description: courseGroup.description,
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
          this.router.navigate(['/course-groups']);
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
    const request: CourseGroupRequest = {
      pkid: raw.pkid ?? 0,
      description: raw.description!,
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
          detail: `課程群組「${request.description}」已儲存。`,
        });
        this.router.navigate(['/course-groups']);
      },
      error: () => {
        this.saving.set(false);
        this.messageService.add({
          severity: 'error',
          summary: '儲存失敗',
          detail: '儲存課程群組時發生錯誤。',
        });
      },
    });
  }

  cancel(): void {
    this.router.navigate(['/course-groups']);
  }
}

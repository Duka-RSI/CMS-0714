import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, of, Observable } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { DatePickerModule } from 'primeng/datepicker';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { MessageModule } from 'primeng/message';
import { MessageService } from 'primeng/api';

import { CourseRequest } from '@app/core/models/course.model';
import { CourseService } from '@app/core/services/course.service';
import { LookupService } from '@app/core/services/lookup.service';
import { RowAuditBadge } from '@app/core/components/row-audit-badge/row-audit-badge';
import { toIsoDate, fromIsoDate } from '@app/core/utils/week.util';

interface Option {
  value: number;
  label: string;
}

@Component({
  selector: 'app-course-form',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    TextareaModule,
    SelectModule,
    MultiSelectModule,
    DatePickerModule,
    ToggleSwitchModule,
    MessageModule,
    RowAuditBadge,
  ],
  templateUrl: './course-form.html',
  styleUrl: './course-form.scss',
})
export class CourseForm implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(CourseService);
  private readonly lookupService = inject(LookupService);
  private readonly messageService = inject(MessageService);

  protected readonly isEdit = signal(false);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  // pkid the audit rows key on; captured for the history badge (the form's own pkid control
  // is disabled in edit mode, but this keeps the badge binding a plain signal read).
  protected readonly recordPkid = signal<number>(0);

  protected readonly partnerOptions = signal<Option[]>([]);
  protected readonly courseGroupOptions = signal<Option[]>([]);
  protected readonly publishStatusOptions = signal<Option[]>([]);
  protected readonly certificationOptions = signal<Option[]>([]);
  protected readonly jobCategoryOptions = signal<Option[]>([]);

  // pkid is IDENTITY: hidden in add mode, shown disabled in edit mode.
  protected readonly form = this.fb.group({
    pkid: this.fb.control<number | null>(null),
    title: this.fb.control('', { validators: [Validators.required, Validators.maxLength(200)] }),
    officialTitle: this.fb.control<string | null>(null, { validators: [Validators.maxLength(300)] }),
    courseId: this.fb.control('', { validators: [Validators.required, Validators.maxLength(50)] }),
    prodCourseId: this.fb.control('', { validators: [Validators.required, Validators.maxLength(50)] }),
    friendlyUrl: this.fb.control('', { validators: [Validators.required, Validators.maxLength(100)] }),
    displayOrder: this.fb.control<number | null>(0, { validators: [Validators.required] }),

    partnerPkid: this.fb.control<number | null>(null, { validators: [Validators.required] }),
    // Nullable FK — no required validator; null means "no group".
    courseGroupPkid: this.fb.control<number | null>(null),
    publishStatusPkid: this.fb.control<number | null>(null, { validators: [Validators.required] }),

    scheduleOn: this.fb.control<Date | null>(null, { validators: [Validators.required] }),
    scheduleOff: this.fb.control<Date | null>(null, { validators: [Validators.required] }),
    hour: this.fb.control<number | null>(0, { validators: [Validators.required] }),
    listPrice: this.fb.control<number | null>(0, { validators: [Validators.required] }),
    learningCredit: this.fb.control<number | null>(0, { validators: [Validators.required] }),

    material: this.fb.control<string | null>(null, { validators: [Validators.maxLength(500)] }),
    objective: this.fb.control<string | null>(null, { validators: [Validators.maxLength(4000)] }),
    target: this.fb.control<string | null>(null, { validators: [Validators.maxLength(500)] }),
    prerequisites: this.fb.control<string | null>(null, { validators: [Validators.maxLength(4000)] }),
    // nvarchar(max) — no maxLength.
    outline: this.fb.control<string | null>(null),
    towardCertOrExam: this.fb.control<string | null>(null),
    note: this.fb.control<string | null>(null, { validators: [Validators.maxLength(4000)] }),
    otherInfo: this.fb.control<string | null>(null, { validators: [Validators.maxLength(4000)] }),
    canRepeat: this.fb.control<boolean>(false),

    certificationPkids: this.fb.control<number[]>([]),
    jobCategoryPkids: this.fb.control<number[]>([]),
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.isEdit.set(!!id);

    forkJoin({
      partners: this.lookupService.getPartners(),
      courseGroups: this.lookupService.getCourseGroups(),
      publishStatuses: this.lookupService.getPublishStatuses(),
      certifications: this.lookupService.getCertifications(),
      jobCategories: this.lookupService.getJobCategories(),
      course: id ? this.service.getById(Number(id)) : of(null),
    }).subscribe({
      next: ({ partners, courseGroups, publishStatuses, certifications, jobCategories, course }) => {
        this.partnerOptions.set(partners.map((p) => ({ value: p.pkid, label: p.name })));
        this.courseGroupOptions.set(courseGroups.map((g) => ({ value: g.pkid, label: g.description })));
        this.publishStatusOptions.set(
          publishStatuses.map((s) => ({ value: s.pkid, label: s.description })),
        );
        // Certification.Title is nullable — fall back to the pkid so no option is blank.
        this.certificationOptions.set(
          certifications.map((c) => ({ value: c.pkid, label: c.title?.trim() || `#${c.pkid}` })),
        );
        this.jobCategoryOptions.set(
          jobCategories.map((j) => ({ value: j.pkid, label: j.description })),
        );

        if (course) {
          this.recordPkid.set(course.pkid);
          this.form.patchValue({
            pkid: course.pkid,
            title: course.title,
            officialTitle: course.officialTitle,
            courseId: course.courseId,
            prodCourseId: course.prodCourseId,
            friendlyUrl: course.friendlyUrl,
            displayOrder: course.displayOrder,
            partnerPkid: course.partnerPkid,
            courseGroupPkid: course.courseGroupPkid,
            publishStatusPkid: course.publishStatusPkid,
            scheduleOn: fromIsoDate(course.scheduleOn),
            scheduleOff: fromIsoDate(course.scheduleOff),
            hour: course.hour,
            listPrice: course.listPrice,
            learningCredit: course.learningCredit,
            material: course.material,
            objective: course.objective,
            target: course.target,
            prerequisites: course.prerequisites,
            outline: course.outline,
            towardCertOrExam: course.towardCertOrExam,
            note: course.note,
            otherInfo: course.otherInfo,
            canRepeat: course.canRepeat,
            certificationPkids: course.certificationPkids,
            jobCategoryPkids: course.jobCategoryPkids,
          });
          // pkid is the IDENTITY primary key — immutable in edit mode.
          this.form.controls.pkid.disable();
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
        this.router.navigate(['/courses']);
      },
    });
  }

  private trimmedOrNull(value: string | null | undefined): string | null {
    return value?.trim() ? value.trim() : null;
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    // getRawValue() includes the disabled pkid control (needed for update).
    const raw = this.form.getRawValue();
    const request: CourseRequest = {
      pkid: raw.pkid ?? 0,
      title: raw.title!,
      officialTitle: this.trimmedOrNull(raw.officialTitle),
      courseId: raw.courseId!,
      prodCourseId: raw.prodCourseId!,
      friendlyUrl: raw.friendlyUrl!,
      displayOrder: raw.displayOrder ?? 0,
      partnerPkid: raw.partnerPkid!,
      // Nullable FK — submit null rather than 0 when no group is chosen.
      courseGroupPkid: raw.courseGroupPkid ?? null,
      publishStatusPkid: raw.publishStatusPkid!,
      // SQL `date` — local components, never toISOString (would shift a day for UTC+8).
      scheduleOn: toIsoDate(raw.scheduleOn!),
      scheduleOff: toIsoDate(raw.scheduleOff!),
      hour: raw.hour ?? 0,
      listPrice: raw.listPrice ?? 0,
      learningCredit: raw.learningCredit ?? 0,
      material: this.trimmedOrNull(raw.material),
      objective: this.trimmedOrNull(raw.objective),
      target: this.trimmedOrNull(raw.target),
      prerequisites: this.trimmedOrNull(raw.prerequisites),
      outline: this.trimmedOrNull(raw.outline),
      towardCertOrExam: this.trimmedOrNull(raw.towardCertOrExam),
      note: this.trimmedOrNull(raw.note),
      otherInfo: this.trimmedOrNull(raw.otherInfo),
      canRepeat: raw.canRepeat ?? false,
      certificationPkids: raw.certificationPkids ?? [],
      jobCategoryPkids: raw.jobCategoryPkids ?? [],
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
          detail: `課程「${request.title}」已儲存。`,
        });
        this.router.navigate(['/courses']);
      },
      error: () => {
        this.saving.set(false);
        this.messageService.add({
          severity: 'error',
          summary: '儲存失敗',
          detail: '儲存課程時發生錯誤。',
        });
      },
    });
  }

  cancel(): void {
    this.router.navigate(['/courses']);
  }
}

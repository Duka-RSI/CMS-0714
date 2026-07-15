import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';

import { Course } from '@app/core/models/course.model';
import { CourseService } from '@app/core/services/course.service';
import { LookupService } from '@app/core/services/lookup.service';
import { CourseQrCode } from '../course-qr-code/course-qr-code';

@Component({
  selector: 'app-course-detail',
  imports: [CommonModule, ButtonModule, TagModule, CourseQrCode],
  templateUrl: './course-detail.html',
  styleUrl: './course-detail.scss',
})
export class CourseDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(CourseService);
  private readonly lookupService = inject(LookupService);
  private readonly messageService = inject(MessageService);

  protected readonly course = signal<Course | null>(null);
  protected readonly certificationLabels = signal<string[]>([]);
  protected readonly jobCategoryLabels = signal<string[]>([]);
  protected readonly loading = signal(true);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/courses']);
      return;
    }

    forkJoin({
      course: this.service.getById(Number(id)),
      certifications: this.lookupService.getCertifications(),
      jobCategories: this.lookupService.getJobCategories(),
    }).subscribe({
      next: ({ course, certifications, jobCategories }) => {
        this.course.set(course);

        // Certification.Title is nullable — fall back to the pkid so a row is never blank.
        const certById = new Map(certifications.map((c) => [c.pkid, c.title?.trim() || `#${c.pkid}`]));
        this.certificationLabels.set(course.certificationPkids.map((p) => certById.get(p) ?? `#${p}`));

        const jobById = new Map(jobCategories.map((j) => [j.pkid, j.description]));
        this.jobCategoryLabels.set(course.jobCategoryPkids.map((p) => jobById.get(p) ?? `#${p}`));

        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: '載入失敗',
          detail: '找不到課程資料。',
        });
        this.router.navigate(['/courses']);
      },
    });
  }

  goBack(): void {
    this.router.navigate(['/courses']);
  }

  goEdit(): void {
    const current = this.course();
    if (current) {
      this.router.navigate(['/courses', current.pkid, 'edit']);
    }
  }

  // Foreign-primary navigation — all three parents have detail routes.
  goPartner(): void {
    const c = this.course();
    if (c) {
      this.router.navigate(['/partners', c.partnerPkid]);
    }
  }

  goCourseGroup(): void {
    const c = this.course();
    if (c?.courseGroupPkid != null) {
      this.router.navigate(['/course-groups', c.courseGroupPkid]);
    }
  }

  goPublishStatus(): void {
    const c = this.course();
    if (c) {
      this.router.navigate(['/publish-statuses', c.publishStatusPkid]);
    }
  }
}

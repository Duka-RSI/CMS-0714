import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';

import { CourseGroup } from '@app/core/models/course-group.model';
import { CourseGroupService } from '@app/core/services/course-group.service';

@Component({
  selector: 'app-course-group-detail',
  imports: [CommonModule, ButtonModule],
  templateUrl: './course-group-detail.html',
  styleUrl: './course-group-detail.scss',
})
export class CourseGroupDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(CourseGroupService);
  private readonly messageService = inject(MessageService);

  protected readonly courseGroup = signal<CourseGroup | null>(null);
  protected readonly loading = signal(true);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/course-groups']);
      return;
    }

    this.service.getById(Number(id)).subscribe({
      next: (courseGroup) => {
        this.courseGroup.set(courseGroup);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: '載入失敗',
          detail: '找不到課程群組資料。',
        });
        this.router.navigate(['/course-groups']);
      },
    });
  }

  goBack(): void {
    this.router.navigate(['/course-groups']);
  }

  goEdit(): void {
    const current = this.courseGroup();
    if (current) {
      this.router.navigate(['/course-groups', current.pkid, 'edit']);
    }
  }
}

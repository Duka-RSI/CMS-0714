import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';

import { PublishStatus } from '@app/core/models/publish-status.model';
import { PublishStatusService } from '@app/core/services/publish-status.service';
import { RowAuditBadge } from '@app/core/components/row-audit-badge/row-audit-badge';

@Component({
  selector: 'app-publish-status-detail',
  imports: [CommonModule, ButtonModule, TagModule, RowAuditBadge],
  templateUrl: './publish-status-detail.html',
  styleUrl: './publish-status-detail.scss',
})
export class PublishStatusDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(PublishStatusService);
  private readonly messageService = inject(MessageService);

  protected readonly status = signal<PublishStatus | null>(null);
  protected readonly loading = signal(true);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/publish-statuses']);
      return;
    }

    this.service.getById(Number(id)).subscribe({
      next: (status) => {
        this.status.set(status);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: '載入失敗',
          detail: '找不到發布狀態資料。',
        });
        this.router.navigate(['/publish-statuses']);
      },
    });
  }

  goBack(): void {
    this.router.navigate(['/publish-statuses']);
  }

  goEdit(): void {
    const current = this.status();
    if (current) {
      this.router.navigate(['/publish-statuses', current.pkid, 'edit']);
    }
  }
}

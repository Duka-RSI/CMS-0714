import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';

import { AppUser } from '@app/core/models/app-user.model';
import { AppUserService } from '@app/core/services/app-user.service';
import { LookupService } from '@app/core/services/lookup.service';
import { RowAuditBadge } from '@app/core/components/row-audit-badge/row-audit-badge';

@Component({
  selector: 'app-app-user-detail',
  imports: [CommonModule, ButtonModule, TagModule, RowAuditBadge],
  templateUrl: './app-user-detail.html',
  styleUrl: './app-user-detail.scss',
})
export class AppUserDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(AppUserService);
  private readonly lookupService = inject(LookupService);
  private readonly messageService = inject(MessageService);

  protected readonly user = signal<AppUser | null>(null);
  protected readonly roleLabels = signal<string[]>([]);
  protected readonly loading = signal(true);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/app-users']);
      return;
    }

    forkJoin({
      user: this.service.getById(id),
      roles: this.lookupService.getAppRoles(),
    }).subscribe({
      next: ({ user, roles }) => {
        this.user.set(user);
        const byId = new Map(roles.map((r) => [r.roleId, `${r.roleName} (${r.roleId})`]));
        this.roleLabels.set(user.roleIds.map((rid) => byId.get(rid) ?? rid));
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: '載入失敗',
          detail: '找不到使用者資料。',
        });
        this.router.navigate(['/app-users']);
      },
    });
  }

  goBack(): void {
    this.router.navigate(['/app-users']);
  }

  goEdit(): void {
    const current = this.user();
    if (current) {
      this.router.navigate(['/app-users', current.userId, 'edit']);
    }
  }
}

import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';

import { AppRole } from '@app/core/models/app-role.model';
import { AppRoleService } from '@app/core/services/app-role.service';
import { LookupService } from '@app/core/services/lookup.service';

@Component({
  selector: 'app-app-role-detail',
  imports: [CommonModule, ButtonModule, TagModule],
  templateUrl: './app-role-detail.html',
  styleUrl: './app-role-detail.scss',
})
export class AppRoleDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(AppRoleService);
  private readonly lookupService = inject(LookupService);
  private readonly messageService = inject(MessageService);

  protected readonly role = signal<AppRole | null>(null);
  protected readonly userLabels = signal<string[]>([]);
  protected readonly loading = signal(true);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/app-roles']);
      return;
    }

    forkJoin({
      role: this.service.getById(id),
      users: this.lookupService.getAppUsers(),
    }).subscribe({
      next: ({ role, users }) => {
        this.role.set(role);
        const byId = new Map(users.map((u) => [u.userId, `${u.userName} (${u.userId})`]));
        this.userLabels.set(role.userIds.map((uid) => byId.get(uid) ?? uid));
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: '載入失敗',
          detail: '找不到角色資料。',
        });
        this.router.navigate(['/app-roles']);
      },
    });
  }

  goBack(): void {
    this.router.navigate(['/app-roles']);
  }

  goEdit(): void {
    const current = this.role();
    if (current) {
      this.router.navigate(['/app-roles', current.roleId, 'edit']);
    }
  }
}

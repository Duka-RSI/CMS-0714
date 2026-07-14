import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { MessageService } from 'primeng/api';

import { Partner } from '@app/core/models/partner.model';
import { PartnerService } from '@app/core/services/partner.service';

@Component({
  selector: 'app-partner-detail',
  imports: [CommonModule, ButtonModule],
  templateUrl: './partner-detail.html',
  styleUrl: './partner-detail.scss',
})
export class PartnerDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(PartnerService);
  private readonly messageService = inject(MessageService);

  protected readonly partner = signal<Partner | null>(null);
  protected readonly loading = signal(true);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/partners']);
      return;
    }

    this.service.getById(Number(id)).subscribe({
      next: (partner) => {
        this.partner.set(partner);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: '載入失敗',
          detail: '找不到合作廠商資料。',
        });
        this.router.navigate(['/partners']);
      },
    });
  }

  goBack(): void {
    this.router.navigate(['/partners']);
  }

  goEdit(): void {
    const current = this.partner();
    if (current) {
      this.router.navigate(['/partners', current.pkid, 'edit']);
    }
  }
}

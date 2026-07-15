import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TableModule, TablePageEvent } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService, SortMeta } from 'primeng/api';

import { AppUser, AppUserQuery } from '@app/core/models/app-user.model';
import { AppUserService } from '@app/core/services/app-user.service';

const FILTERS_KEY = 'app-user-list-filters';
const SORT_KEY = 'app-user-list-sort';
const PAGE_KEY = 'app-user-list-page';

@Component({
  selector: 'app-app-user-list',
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    ButtonModule,
    DrawerModule,
    InputTextModule,
    SelectModule,
    TagModule,
    TooltipModule,
  ],
  templateUrl: './app-user-list.html',
  styleUrl: './app-user-list.scss',
})
export class AppUserList implements OnInit {
  private readonly service = inject(AppUserService);
  private readonly router = inject(Router);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);

  protected readonly users = signal<AppUser[]>([]);
  protected readonly loading = signal(false);
  protected readonly filterVisible = signal(false);

  // Tri-state 啟用 filter options (null = no filter).
  protected readonly isActiveOptions = [
    { label: '全部', value: null },
    { label: '啟用', value: true },
    { label: '停用', value: false },
  ];

  // Filter model (bound in the drawer).
  protected filters: AppUserQuery = {
    keyword: null,
    isActive: null,
  };

  // The filters currently applied to the list (drives the "filtered" highlight).
  protected readonly appliedFilters = signal<{ label: string; value: string }[]>([]);
  protected readonly activeFilterCount = computed(() => this.appliedFilters().length);
  protected readonly isFiltered = computed(() => this.activeFilterCount() > 0);

  // Persisted table state.
  protected sortField = 'userId';
  protected sortOrder = 1;
  protected first = 0;
  protected rows = 20;

  ngOnInit(): void {
    this.restoreState();
    this.syncAppliedFilters();
    this.load();
  }

  // Rebuild the applied-filter chip list from the currently applied `filters`.
  private syncAppliedFilters(): void {
    const chips: { label: string; value: string }[] = [];
    if (this.filters.keyword && this.filters.keyword.trim() !== '') {
      chips.push({ label: '關鍵字', value: this.filters.keyword.trim() });
    }
    if (this.filters.isActive !== null && this.filters.isActive !== undefined) {
      chips.push({ label: '啟用', value: this.filters.isActive ? '啟用' : '停用' });
    }
    this.appliedFilters.set(chips);
  }

  private restoreState(): void {
    const savedFilters = sessionStorage.getItem(FILTERS_KEY);
    if (savedFilters) {
      this.filters = { ...this.filters, ...JSON.parse(savedFilters) };
    }
    const savedSort = sessionStorage.getItem(SORT_KEY);
    if (savedSort) {
      const { sortField, sortOrder } = JSON.parse(savedSort);
      this.sortField = sortField ?? this.sortField;
      this.sortOrder = sortOrder ?? this.sortOrder;
    }
    const savedPage = sessionStorage.getItem(PAGE_KEY);
    if (savedPage) {
      const { first, rows } = JSON.parse(savedPage);
      this.first = first ?? this.first;
      this.rows = rows ?? this.rows;
    }
  }

  load(): void {
    this.loading.set(true);
    this.service.query(this.filters).subscribe({
      next: (data) => {
        this.users.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: '載入失敗',
          detail: '無法取得使用者清單。',
        });
      },
    });
  }

  // ----- filter drawer -----
  openFilter(): void {
    this.filterVisible.set(true);
  }

  applyFilter(): void {
    sessionStorage.setItem(FILTERS_KEY, JSON.stringify(this.filters));
    this.syncAppliedFilters();
    this.first = 0;
    this.persistPage();
    this.filterVisible.set(false);
    this.load();
  }

  clearFilter(): void {
    this.filters = { keyword: null, isActive: null };
    sessionStorage.removeItem(FILTERS_KEY);
    this.syncAppliedFilters();
    this.first = 0;
    this.persistPage();
    this.load();
  }

  // ----- table state persistence -----
  onSort(event: { field?: string; order?: number; multisortmeta?: SortMeta[] }): void {
    if (event.field) {
      this.sortField = event.field;
      this.sortOrder = event.order ?? 1;
      sessionStorage.setItem(
        SORT_KEY,
        JSON.stringify({ sortField: this.sortField, sortOrder: this.sortOrder }),
      );
    }
  }

  onPage(event: TablePageEvent): void {
    this.first = event.first;
    this.rows = event.rows;
    this.persistPage();
  }

  private persistPage(): void {
    sessionStorage.setItem(PAGE_KEY, JSON.stringify({ first: this.first, rows: this.rows }));
  }

  // ----- row actions -----
  goAdd(): void {
    this.router.navigate(['/app-users/new']);
  }

  goView(user: AppUser): void {
    this.router.navigate(['/app-users', user.userId]);
  }

  goEdit(user: AppUser): void {
    this.router.navigate(['/app-users', user.userId, 'edit']);
  }

  confirmDelete(user: AppUser): void {
    this.confirmationService.confirm({
      header: '刪除確認',
      message: `確定要刪除使用者代碼 <b>${user.userId}</b>「${user.userName}」？`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: '刪除',
      rejectLabel: '取消',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.delete(user),
    });
  }

  private delete(user: AppUser): void {
    this.service.delete(user.userId).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: '刪除成功',
          detail: `使用者「${user.userName}」已刪除。`,
        });
        this.load();
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: '刪除失敗',
          detail: '刪除使用者時發生錯誤。',
        });
      },
    });
  }

  confirmResetPassword(user: AppUser): void {
    this.confirmationService.confirm({
      header: '重設密碼確認',
      message: `確定要將使用者 <b>${user.userId}</b>「${user.userName}」的密碼重設為系統預設密碼？`,
      icon: 'pi pi-key',
      acceptLabel: '重設',
      rejectLabel: '取消',
      acceptButtonStyleClass: 'p-button-warn',
      accept: () => this.resetPassword(user),
    });
  }

  private resetPassword(user: AppUser): void {
    this.service.resetPassword(user.userId).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: '重設成功',
          detail: `使用者「${user.userName}」的密碼已重設為系統預設密碼。`,
        });
        this.load(); // 密碼更新時間 changes
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: '重設失敗',
          detail: '重設密碼時發生錯誤。',
        });
      },
    });
  }
}

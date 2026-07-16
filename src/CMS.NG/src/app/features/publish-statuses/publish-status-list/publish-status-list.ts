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

import { PublishStatus, PublishStatusQuery } from '@app/core/models/publish-status.model';
import { PublishStatusService } from '@app/core/services/publish-status.service';

const FILTERS_KEY = 'publish-status-list-filters';
const SORT_KEY = 'publish-status-list-sort';
const PAGE_KEY = 'publish-status-list-page';

// Tri-state bool dropdown options for the filter drawer.
const BOOL_OPTIONS = [
  { label: '是', value: true },
  { label: '否', value: false },
];

@Component({
  selector: 'app-publish-status-list',
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
  templateUrl: './publish-status-list.html',
  styleUrl: './publish-status-list.scss',
})
export class PublishStatusList implements OnInit {
  private readonly service = inject(PublishStatusService);
  private readonly router = inject(Router);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);

  protected readonly statuses = signal<PublishStatus[]>([]);
  protected readonly loading = signal(false);
  protected readonly filterVisible = signal(false);

  protected readonly boolOptions = BOOL_OPTIONS;

  // Filter model (bound in the drawer).
  protected filters: PublishStatusQuery = {
    keyword: null,
    isDraft: null,
    isPublished: null,
    isDiscontinued: null,
  };

  // The filters currently applied to the list (drives the "filtered" highlight).
  protected readonly appliedFilters = signal<{ label: string; value: string }[]>([]);
  protected readonly activeFilterCount = computed(() => this.appliedFilters().length);
  protected readonly isFiltered = computed(() => this.activeFilterCount() > 0);

  // Persisted table state.
  protected sortField = 'pkid';
  protected sortOrder = 1;
  protected first = 0;
  protected rows = 20;

  ngOnInit(): void {
    this.restoreState();
    this.syncAppliedFilters();
    this.load();
  }

  private boolLabel(value: boolean | null | undefined): string {
    return value ? '是' : '否';
  }

  // Rebuild the applied-filter chip list from the currently applied `filters`.
  private syncAppliedFilters(): void {
    const chips: { label: string; value: string }[] = [];
    if (this.filters.keyword && this.filters.keyword.trim() !== '') {
      chips.push({ label: '關鍵字', value: this.filters.keyword.trim() });
    }
    if (this.filters.isDraft !== null && this.filters.isDraft !== undefined) {
      chips.push({ label: '草稿', value: this.boolLabel(this.filters.isDraft) });
    }
    if (this.filters.isPublished !== null && this.filters.isPublished !== undefined) {
      chips.push({ label: '已發布', value: this.boolLabel(this.filters.isPublished) });
    }
    if (this.filters.isDiscontinued !== null && this.filters.isDiscontinued !== undefined) {
      chips.push({ label: '已停用', value: this.boolLabel(this.filters.isDiscontinued) });
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
        this.statuses.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: '載入失敗',
          detail: '無法取得發布狀態清單。',
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
    this.filters = { keyword: null, isDraft: null, isPublished: null, isDiscontinued: null };
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
    this.router.navigate(['/publish-statuses/new']);
  }

  goView(status: PublishStatus): void {
    this.router.navigate(['/publish-statuses', status.pkid]);
  }

  goEdit(status: PublishStatus): void {
    this.router.navigate(['/publish-statuses', status.pkid, 'edit']);
  }

  confirmDelete(status: PublishStatus): void {
    this.confirmationService.confirm({
      header: '刪除確認',
      message: `確定要刪除主代碼 <b>${status.pkid}</b>「${status.description}」？`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: '刪除',
      rejectLabel: '取消',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.delete(status),
    });
  }

  private delete(status: PublishStatus): void {
    this.service.delete(status.pkid).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: '刪除成功',
          detail: `發布狀態「${status.description}」已刪除。`,
        });
        this.load();
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: '刪除失敗',
          detail: '刪除發布狀態時發生錯誤。',
        });
      },
    });
  }
}

import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TableModule, TablePageEvent } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { InputTextModule } from 'primeng/inputtext';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService, SortMeta } from 'primeng/api';

import { CourseGroup, CourseGroupQuery } from '@app/core/models/course-group.model';
import { CourseGroupService } from '@app/core/services/course-group.service';

const FILTERS_KEY = 'course-group-list-filters';
const SORT_KEY = 'course-group-list-sort';
const PAGE_KEY = 'course-group-list-page';

@Component({
  selector: 'app-course-group-list',
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    ButtonModule,
    DrawerModule,
    InputTextModule,
    TooltipModule,
  ],
  templateUrl: './course-group-list.html',
  styleUrl: './course-group-list.scss',
})
export class CourseGroupList implements OnInit {
  private readonly service = inject(CourseGroupService);
  private readonly router = inject(Router);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);

  protected readonly courseGroups = signal<CourseGroup[]>([]);
  protected readonly loading = signal(false);
  protected readonly filterVisible = signal(false);

  // Filter model (bound in the drawer).
  protected filters: CourseGroupQuery = {
    keyword: null,
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

  // Rebuild the applied-filter chip list from the currently applied `filters`.
  private syncAppliedFilters(): void {
    const chips: { label: string; value: string }[] = [];
    if (this.filters.keyword && this.filters.keyword.trim() !== '') {
      chips.push({ label: '關鍵字', value: this.filters.keyword.trim() });
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
        this.courseGroups.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: '載入失敗',
          detail: '無法取得課程群組清單。',
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
    this.filters = { keyword: null };
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
    this.router.navigate(['/course-groups/new']);
  }

  goView(courseGroup: CourseGroup): void {
    this.router.navigate(['/course-groups', courseGroup.pkid]);
  }

  goEdit(courseGroup: CourseGroup): void {
    this.router.navigate(['/course-groups', courseGroup.pkid, 'edit']);
  }

  confirmDelete(courseGroup: CourseGroup): void {
    this.confirmationService.confirm({
      header: '刪除確認',
      message: `確定要刪除主代碼 <b>${courseGroup.pkid}</b>「${courseGroup.description}」？`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: '刪除',
      rejectLabel: '取消',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.delete(courseGroup),
    });
  }

  private delete(courseGroup: CourseGroup): void {
    this.service.delete(courseGroup.pkid).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: '刪除成功',
          detail: `課程群組「${courseGroup.description}」已刪除。`,
        });
        this.load();
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: '刪除失敗',
          detail: '刪除課程群組時發生錯誤。',
        });
      },
    });
  }
}

import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TableModule, TablePageEvent } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService, SortMeta } from 'primeng/api';

import { AppRole, AppRoleQuery } from '@app/core/models/app-role.model';
import { AppRoleService } from '@app/core/services/app-role.service';

const FILTERS_KEY = 'app-role-list-filters';
const SORT_KEY = 'app-role-list-sort';
const PAGE_KEY = 'app-role-list-page';

@Component({
  selector: 'app-app-role-list',
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    ButtonModule,
    DrawerModule,
    InputTextModule,
    InputNumberModule,
    TooltipModule,
  ],
  templateUrl: './app-role-list.html',
  styleUrl: './app-role-list.scss',
})
export class AppRoleList implements OnInit {
  private readonly service = inject(AppRoleService);
  private readonly router = inject(Router);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);

  protected readonly roles = signal<AppRole[]>([]);
  protected readonly loading = signal(false);
  protected readonly filterVisible = signal(false);

  // Filter model (bound in the drawer).
  protected filters: AppRoleQuery = { keyword: null, permissionLevel: null };

  // The filters currently applied to the list (drives the "filtered" highlight).
  // Kept separate from `filters` so the drawer draft doesn't light up the UI
  // until the user actually applies it.
  protected readonly appliedFilters = signal<{ label: string; value: string }[]>([]);
  protected readonly activeFilterCount = computed(() => this.appliedFilters().length);
  protected readonly isFiltered = computed(() => this.activeFilterCount() > 0);

  // Persisted table state.
  protected sortField = 'roleId';
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
    if (this.filters.permissionLevel !== null && this.filters.permissionLevel !== undefined) {
      chips.push({ label: '權限等級', value: String(this.filters.permissionLevel) });
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
        this.roles.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: '載入失敗',
          detail: '無法取得角色清單。',
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
    this.filters = { keyword: null, permissionLevel: null };
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
    this.router.navigate(['/app-roles/new']);
  }

  goView(role: AppRole): void {
    this.router.navigate(['/app-roles', role.roleId]);
  }

  goEdit(role: AppRole): void {
    this.router.navigate(['/app-roles', role.roleId, 'edit']);
  }

  confirmDelete(role: AppRole): void {
    this.confirmationService.confirm({
      header: '刪除確認',
      message: `確定要刪除主代碼 <b>${role.pkid}</b>「${role.roleName}」？`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: '刪除',
      rejectLabel: '取消',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.delete(role),
    });
  }

  private delete(role: AppRole): void {
    this.service.delete(role.roleId).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: '刪除成功',
          detail: `角色「${role.roleName}」已刪除。`,
        });
        this.load();
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: '刪除失敗',
          detail: '刪除角色時發生錯誤。',
        });
      },
    });
  }
}

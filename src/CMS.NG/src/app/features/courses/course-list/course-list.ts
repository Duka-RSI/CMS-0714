import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { TableModule, TablePageEvent } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService, SortMeta } from 'primeng/api';

import { Course, CourseQuery } from '@app/core/models/course.model';
import { CourseService } from '@app/core/services/course.service';
import { LookupService } from '@app/core/services/lookup.service';
import { toIsoDate, fromIsoDate } from '@app/core/utils/week.util';

const FILTERS_KEY = 'course-list-filters';
const SORT_KEY = 'course-list-sort';
const PAGE_KEY = 'course-list-page';

interface Option {
  value: number;
  label: string;
}

/** Filter drawer binds Dates; the wire format is 'YYYY-MM-DD'. */
interface FilterForm {
  keyword: string | null;
  partnerPkid: number | null;
  courseGroupPkid: number | null;
  publishStatusPkid: number | null;
  canRepeat: boolean | null;
  scheduleOnFrom: Date | null;
  scheduleOnTo: Date | null;
  scheduleOffFrom: Date | null;
  scheduleOffTo: Date | null;
}

@Component({
  selector: 'app-course-list',
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    ButtonModule,
    DrawerModule,
    InputTextModule,
    SelectModule,
    DatePickerModule,
    TagModule,
    TooltipModule,
  ],
  templateUrl: './course-list.html',
  styleUrl: './course-list.scss',
})
export class CourseList implements OnInit {
  private readonly service = inject(CourseService);
  private readonly lookupService = inject(LookupService);
  private readonly router = inject(Router);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);

  protected readonly courses = signal<Course[]>([]);
  protected readonly loading = signal(false);
  protected readonly filterVisible = signal(false);

  protected readonly partnerOptions = signal<Option[]>([]);
  protected readonly courseGroupOptions = signal<Option[]>([]);
  protected readonly publishStatusOptions = signal<Option[]>([]);

  protected readonly canRepeatOptions = [
    { label: '全部', value: null },
    { label: '允許', value: true },
    { label: '不允許', value: false },
  ];

  protected filters: FilterForm = this.emptyFilters();

  protected readonly appliedFilters = signal<{ label: string; value: string }[]>([]);
  protected readonly activeFilterCount = computed(() => this.appliedFilters().length);
  protected readonly isFiltered = computed(() => this.activeFilterCount() > 0);

  protected sortField = 'displayOrder';
  protected sortOrder = 1;
  protected first = 0;
  protected rows = 20;

  private emptyFilters(): FilterForm {
    return {
      keyword: null,
      partnerPkid: null,
      courseGroupPkid: null,
      publishStatusPkid: null,
      canRepeat: null,
      scheduleOnFrom: null,
      scheduleOnTo: null,
      scheduleOffFrom: null,
      scheduleOffTo: null,
    };
  }

  ngOnInit(): void {
    // Lookups first: the applied-filter chips render FK labels, so restoring saved filters
    // before the options land would show raw pkids.
    forkJoin({
      partners: this.lookupService.getPartners(),
      courseGroups: this.lookupService.getCourseGroups(),
      publishStatuses: this.lookupService.getPublishStatuses(),
    }).subscribe({
      next: ({ partners, courseGroups, publishStatuses }) => {
        this.partnerOptions.set(partners.map((p) => ({ value: p.pkid, label: p.name })));
        this.courseGroupOptions.set(
          courseGroups.map((g) => ({ value: g.pkid, label: g.description })),
        );
        this.publishStatusOptions.set(
          publishStatuses.map((s) => ({ value: s.pkid, label: s.description })),
        );
        this.restoreState();
        this.syncAppliedFilters();
        this.load();
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: '載入失敗',
          detail: '無法取得篩選選項。',
        });
        this.restoreState();
        this.syncAppliedFilters();
        this.load();
      },
    });
  }

  private labelOf(options: Option[], value: number | null): string {
    return options.find((o) => o.value === value)?.label ?? `#${value}`;
  }

  private syncAppliedFilters(): void {
    const chips: { label: string; value: string }[] = [];
    const f = this.filters;

    if (f.keyword?.trim()) {
      chips.push({ label: '關鍵字', value: f.keyword.trim() });
    }
    if (f.partnerPkid != null) {
      chips.push({ label: '原廠', value: this.labelOf(this.partnerOptions(), f.partnerPkid) });
    }
    if (f.courseGroupPkid != null) {
      chips.push({
        label: '課程群組',
        value: this.labelOf(this.courseGroupOptions(), f.courseGroupPkid),
      });
    }
    if (f.publishStatusPkid != null) {
      chips.push({
        label: '上架狀態',
        value: this.labelOf(this.publishStatusOptions(), f.publishStatusPkid),
      });
    }
    if (f.canRepeat != null) {
      chips.push({ label: '允許重聽', value: f.canRepeat ? '允許' : '不允許' });
    }
    if (f.scheduleOnFrom || f.scheduleOnTo) {
      chips.push({
        label: '上架日期',
        value: `${f.scheduleOnFrom ? toIsoDate(f.scheduleOnFrom) : ''} ~ ${f.scheduleOnTo ? toIsoDate(f.scheduleOnTo) : ''}`,
      });
    }
    if (f.scheduleOffFrom || f.scheduleOffTo) {
      chips.push({
        label: '下架日期',
        value: `${f.scheduleOffFrom ? toIsoDate(f.scheduleOffFrom) : ''} ~ ${f.scheduleOffTo ? toIsoDate(f.scheduleOffTo) : ''}`,
      });
    }
    this.appliedFilters.set(chips);
  }

  private restoreState(): void {
    const savedFilters = sessionStorage.getItem(FILTERS_KEY);
    if (savedFilters) {
      const raw = JSON.parse(savedFilters) as Record<string, unknown>;
      this.filters = {
        ...this.emptyFilters(),
        ...raw,
        // Dates round-trip through sessionStorage as 'YYYY-MM-DD' strings.
        scheduleOnFrom: raw['scheduleOnFrom'] ? fromIsoDate(raw['scheduleOnFrom'] as string) : null,
        scheduleOnTo: raw['scheduleOnTo'] ? fromIsoDate(raw['scheduleOnTo'] as string) : null,
        scheduleOffFrom: raw['scheduleOffFrom'] ? fromIsoDate(raw['scheduleOffFrom'] as string) : null,
        scheduleOffTo: raw['scheduleOffTo'] ? fromIsoDate(raw['scheduleOffTo'] as string) : null,
      } as FilterForm;
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

  /** Filter form (Dates) → query DTO ('YYYY-MM-DD'). */
  private toQuery(): CourseQuery {
    const f = this.filters;
    return {
      keyword: f.keyword,
      partnerPkid: f.partnerPkid,
      courseGroupPkid: f.courseGroupPkid,
      publishStatusPkid: f.publishStatusPkid,
      canRepeat: f.canRepeat,
      scheduleOnFrom: f.scheduleOnFrom ? toIsoDate(f.scheduleOnFrom) : null,
      scheduleOnTo: f.scheduleOnTo ? toIsoDate(f.scheduleOnTo) : null,
      scheduleOffFrom: f.scheduleOffFrom ? toIsoDate(f.scheduleOffFrom) : null,
      scheduleOffTo: f.scheduleOffTo ? toIsoDate(f.scheduleOffTo) : null,
    };
  }

  load(): void {
    this.loading.set(true);
    this.service.query(this.toQuery()).subscribe({
      next: (data) => {
        this.courses.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: '載入失敗',
          detail: '無法取得課程清單。',
        });
      },
    });
  }

  // ----- filter drawer -----
  openFilter(): void {
    this.filterVisible.set(true);
  }

  applyFilter(): void {
    // Persist the wire form so restore does not depend on Date's serialization.
    sessionStorage.setItem(FILTERS_KEY, JSON.stringify(this.toQuery()));
    this.syncAppliedFilters();
    this.first = 0;
    this.persistPage();
    this.filterVisible.set(false);
    this.load();
  }

  clearFilter(): void {
    this.filters = this.emptyFilters();
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
    this.router.navigate(['/courses/new']);
  }

  goView(course: Course): void {
    this.router.navigate(['/courses', course.pkid]);
  }

  goEdit(course: Course): void {
    this.router.navigate(['/courses', course.pkid, 'edit']);
  }

  confirmDelete(course: Course): void {
    this.confirmationService.confirm({
      header: '刪除確認',
      message: `確定要刪除主代碼 <b>${course.pkid}</b>「${course.title}」？`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: '刪除',
      rejectLabel: '取消',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.delete(course),
    });
  }

  private delete(course: Course): void {
    this.service.delete(course.pkid).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: '刪除成功',
          detail: `課程「${course.title}」已刪除。`,
        });
        this.load();
      },
      error: (err: HttpErrorResponse) => {
        // 409 = child rows (FAQ / related links / hot course) still reference it. The API
        // names them; surface that rather than a generic failure.
        const detail =
          err.status === 409
            ? (err.error?.message ?? '該課程仍被其他資料引用，無法刪除。')
            : '刪除課程時發生錯誤。';
        this.messageService.add({ severity: 'error', summary: '刪除失敗', detail });
      },
    });
  }
}

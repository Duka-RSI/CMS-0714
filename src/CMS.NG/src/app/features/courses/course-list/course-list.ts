import { Component, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, forkJoin, switchMap } from 'rxjs';
import { TableModule, TablePageEvent } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { CheckboxModule } from 'primeng/checkbox';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService, SortMeta } from 'primeng/api';

import { Course, CourseQuery, CourseRequest } from '@app/core/models/course.model';
import { CourseService } from '@app/core/services/course.service';
import { LookupService } from '@app/core/services/lookup.service';
import { RowAuditBadge } from '@app/core/components/row-audit-badge/row-audit-badge';
import { toIsoDate, fromIsoDate } from '@app/core/utils/week.util';
import { filenameFromResponse, readErrorMessage } from '@app/core/utils/download.util';
import { FileDownloadService } from '@app/core/services/file-download.service';

const FILTERS_KEY = 'course-list-filters';
const SORT_KEY = 'course-list-sort';
const PAGE_KEY = 'course-list-page';

/** Mirrors CoursePdfRequest.MaxCourses on the API. Kept here to disable the button early. */
export const MAX_EXPORT_COURSES = 100;

/** Shown when the export fails without a message we can read. */
export const EXPORT_FAILED_MESSAGE = '匯出 PDF 時發生錯誤。';

interface Option {
  value: number;
  label: string;
}

/** Columns editable in place on the list. Only pkid (主代碼) stays read-only. */
type EditableField =
  | 'title'
  | 'courseId'
  | 'prodCourseId'
  | 'displayOrder'
  | 'partnerPkid'
  | 'courseGroupPkid'
  | 'publishStatusPkid'
  | 'scheduleOn'
  | 'scheduleOff'
  | 'hour'
  | 'listPrice'
  | 'learningCredit'
  | 'canRepeat';

/** What the open editor binds via ngModel (dates are Date objects while editing). */
type EditorValue = string | number | boolean | Date | null;

/** Wire value an inline edit persists (dates already converted to 'YYYY-MM-DD'). */
type EditValue = string | number | boolean | null;

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
    CheckboxModule,
    TagModule,
    TooltipModule,
    RowAuditBadge,
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
  private readonly downloads = inject(FileDownloadService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly courses = signal<Course[]>([]);
  protected readonly loading = signal(false);
  protected readonly filterVisible = signal(false);

  // ----- PDF export -----
  /**
   * Rows ticked for export. p-table keeps this in sync across paging and sorting because the
   * table has a dataKey, so a selection survives flipping to page 2 and back.
   */
  protected readonly selectedCourses = signal<Course[]>([]);
  protected readonly exporting = signal(false);
  protected readonly selectedCount = computed(() => this.selectedCourses().length);
  protected readonly hasSelection = computed(() => this.selectedCount() > 0);
  /** Mirrors CoursePdfRequest.MaxCourses on the API — the guard there is the real one. */
  protected readonly maxExport = MAX_EXPORT_COURSES;
  protected readonly exportOverLimit = computed(() => this.selectedCount() > this.maxExport);

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

  // ----- in-place cell editing state -----
  /** The single cell currently in edit mode (dblclick to open), or null. */
  protected readonly editingCell = signal<{ pkid: number; field: EditableField } | null>(null);
  /** Inline validation message for the open editor; keeps the cell in edit mode. */
  protected readonly editError = signal<string | null>(null);
  /** True while a blur-save round-trip (getById → update) is in flight. */
  protected readonly editSaving = signal(false);
  /** ngModel target for whichever editor is open (string / number / boolean / Date). */
  protected editValue: EditorValue = null;

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

  // ----- PDF export -----

  /**
   * Download the ticked courses as one PDF.
   *
   * The document is built server-side: the Chinese needs a font the browser bundle has no
   * business carrying, and the API already holds every field the detail page shows.
   */
  async exportSelectedPdf(): Promise<void> {
    const pkids = this.selectedCourses().map((c) => c.pkid);
    if (pkids.length === 0 || this.exporting()) {
      return;
    }

    this.exporting.set(true);
    try {
      const response = await firstValueFrom(this.service.exportPdf(pkids));
      const blob = response.body;
      if (!blob) {
        this.toastExportError(EXPORT_FAILED_MESSAGE);
        return;
      }
      this.downloads.save(blob, filenameFromResponse(response, `courses-${pkids.length}.pdf`));
    } catch (error) {
      // responseType 'blob' applies to the error body too, so the API's { message } arrives
      // as a Blob rather than parsed JSON — including the 400 for "these rows are gone".
      // The 5xx interceptor hits the same wall and falls back to its generic toast, which is
      // why a 5xx is left to it and only the 4xx is reported here.
      const failure = error as HttpErrorResponse;
      if (failure.status < 500) {
        this.toastExportError((await readErrorMessage(failure)) ?? EXPORT_FAILED_MESSAGE);
      }
    } finally {
      this.exporting.set(false);
    }
  }

  private toastExportError(detail: string): void {
    this.messageService.add({ severity: 'error', summary: '匯出失敗', detail });
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

  // ----- in-place cell editing -----
  isEditing(course: Course, field: EditableField): boolean {
    const cell = this.editingCell();
    return cell !== null && cell.pkid === course.pkid && cell.field === field;
  }

  /** Opens the editor for a cell — bound to (dblclick) only; single click never edits. */
  beginEdit(course: Course, field: EditableField): void {
    if (this.editSaving()) {
      return;
    }
    this.editError.set(null);
    this.editValue =
      field === 'scheduleOn' || field === 'scheduleOff'
        ? course[field]
          ? fromIsoDate(course[field])
          : null
        : course[field];
    this.editingCell.set({ pkid: course.pkid, field });
    this.focusEditor();
  }

  cancelEdit(): void {
    this.editingCell.set(null);
    this.editError.set(null);
  }

  /**
   * Blur handler for overlay editors (p-select / p-datepicker). Picking an option or a
   * date blurs the input BEFORE the value lands (mousedown precedes click), so a plain
   * blur-commit would close the editor with the old value and drop the selection. Skip
   * the commit while the overlay is open — onSelect/onChange (value picked) and
   * onClose/onHide (overlay dismissed) commit instead.
   */
  onOverlayEditorBlur(course: Course, editor: { overlayVisible?: boolean | null }): void {
    if (!editor.overlayVisible) {
      this.commitEdit(course);
    }
  }

  /**
   * Persists the open editor's value — bound to blur (and change/select for overlay
   * editors, which is when they effectively lose focus). Validation failure keeps the
   * cell in edit mode with an inline error; an unchanged value just closes the editor.
   */
  commitEdit(course: Course): void {
    const cell = this.editingCell();
    if (!cell || cell.pkid !== course.pkid || this.editSaving()) {
      return;
    }

    const error = this.validateEdit(cell.field, this.editValue, course);
    if (error) {
      this.editError.set(error);
      return;
    }

    const value = this.normalizeEdit(this.editValue);
    if (value === course[cell.field]) {
      this.cancelEdit();
      return;
    }
    this.saveEdit(course, cell.field, value);
  }

  private validateEdit(field: EditableField, value: EditorValue, course: Course): string | null {
    switch (field) {
      case 'title':
      case 'courseId':
      case 'prodCourseId': {
        const text = typeof value === 'string' ? value.trim() : '';
        if (!text) {
          return '此欄位為必填，不可清空。';
        }
        const max = field === 'title' ? 200 : 50;
        return text.length > max ? `長度不可超過 ${max} 個字元。` : null;
      }
      case 'displayOrder':
      case 'hour':
      case 'listPrice':
      case 'learningCredit': {
        if (typeof value !== 'number' || Number.isNaN(value)) {
          return '請輸入有效的數字。';
        }
        // 顯示順序 may be any integer; 時數 / 定價 / 點數 must be non-negative.
        return field !== 'displayOrder' && value < 0 ? '不可為負數。' : null;
      }
      case 'partnerPkid':
      case 'publishStatusPkid':
        return value == null ? '此欄位為必填，不可清空。' : null;
      case 'courseGroupPkid':
        // Nullable FK — clearing means「no group」.
        return null;
      case 'scheduleOn':
      case 'scheduleOff': {
        if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
          return '請輸入有效的日期。';
        }
        // ISO strings compare chronologically; the other bound comes from the row.
        const iso = toIsoDate(value);
        if (field === 'scheduleOn' && course.scheduleOff && iso > course.scheduleOff) {
          return '上架日期不可晚於下架日期。';
        }
        if (field === 'scheduleOff' && course.scheduleOn && iso < course.scheduleOn) {
          return '上架日期不可晚於下架日期。';
        }
        return null;
      }
      case 'canRepeat':
        return null;
    }
  }

  /** Editor value → wire value (trimmed text, Date → 'YYYY-MM-DD'). */
  private normalizeEdit(value: EditorValue): EditValue {
    if (value instanceof Date) {
      return toIsoDate(value);
    }
    return typeof value === 'string' ? value.trim() : value;
  }

  /**
   * The list row lacks the N-N pkids (populated on GET-by-id only) and the update
   * endpoint syncs those sets — so fetch the full record first, merge the single
   * edited field, and PUT the result. On failure the row is untouched (= revert).
   */
  private saveEdit(course: Course, field: EditableField, value: EditValue): void {
    this.editSaving.set(true);
    this.service
      .getById(course.pkid)
      .pipe(
        switchMap((full) => {
          const request: CourseRequest = {
            pkid: full.pkid,
            title: full.title,
            officialTitle: full.officialTitle,
            courseId: full.courseId,
            prodCourseId: full.prodCourseId,
            friendlyUrl: full.friendlyUrl,
            displayOrder: full.displayOrder,
            partnerPkid: full.partnerPkid,
            courseGroupPkid: full.courseGroupPkid,
            publishStatusPkid: full.publishStatusPkid,
            scheduleOn: full.scheduleOn,
            scheduleOff: full.scheduleOff,
            hour: full.hour,
            listPrice: full.listPrice,
            learningCredit: full.learningCredit,
            material: full.material,
            objective: full.objective,
            target: full.target,
            prerequisites: full.prerequisites,
            outline: full.outline,
            towardCertOrExam: full.towardCertOrExam,
            note: full.note,
            otherInfo: full.otherInfo,
            canRepeat: full.canRepeat,
            certificationPkids: full.certificationPkids,
            jobCategoryPkids: full.jobCategoryPkids,
          };
          (request as Record<EditableField, EditValue>)[field] = value;
          return this.service.update(request);
        }),
      )
      .subscribe({
        next: () => {
          (course as unknown as Record<EditableField, EditValue>)[field] = value;
          // FK edits carry a pkid — refresh the joined label the cell displays.
          if (field === 'publishStatusPkid') {
            course.publishStatusDescription = this.labelOf(
              this.publishStatusOptions(),
              value as number,
            );
          }
          if (field === 'partnerPkid') {
            course.partnerName = this.labelOf(this.partnerOptions(), value as number);
          }
          if (field === 'courseGroupPkid') {
            course.courseGroupDescription =
              value == null ? null : this.labelOf(this.courseGroupOptions(), value as number);
          }
          this.courses.update((list) => [...list]);
          this.editSaving.set(false);
          this.cancelEdit();
          this.messageService.add({
            severity: 'success',
            summary: '更新成功',
            detail: `課程「${course.title}」已更新。`,
          });
        },
        error: () => {
          // Row was never mutated, so closing the editor reverts the cell.
          this.editSaving.set(false);
          this.cancelEdit();
          this.messageService.add({
            severity: 'error',
            summary: '儲存失敗',
            detail: '更新課程時發生錯誤，已還原修改。',
          });
        },
      });
  }

  /** dblclick opens the editor under the pointer, so hand it focus for blur-to-save. */
  private focusEditor(): void {
    setTimeout(() => {
      const editor = (this.host.nativeElement as HTMLElement).querySelector<HTMLElement>(
        '.cell-editor',
      );
      if (!editor) {
        return;
      }
      if (editor instanceof HTMLInputElement) {
        editor.focus();
        editor.select();
        return;
      }
      editor.querySelector<HTMLElement>('input, [tabindex]')?.focus();
    });
  }
}

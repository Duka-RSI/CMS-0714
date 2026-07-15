import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { MessageService, ConfirmationService, Confirmation } from 'primeng/api';

import { CourseList } from './course-list';
import { CourseService } from '@app/core/services/course.service';
import { LookupService } from '@app/core/services/lookup.service';
import { Course } from '@app/core/models/course.model';

function makeCourse(over: Partial<Course> = {}): Course {
  return {
    pkid: 1,
    title: 'Azure 系統管理',
    officialTitle: null,
    courseId: 'AZ-104',
    prodCourseId: 'P-AZ-104',
    friendlyUrl: 'az-104',
    displayOrder: 1,
    partnerPkid: 5,
    courseGroupPkid: 3,
    publishStatusPkid: 1,
    scheduleOn: '2026-01-01',
    scheduleOff: '2036-01-01',
    hour: 35,
    listPrice: 24000,
    learningCredit: 3.5,
    material: null,
    objective: null,
    target: null,
    prerequisites: null,
    outline: null,
    towardCertOrExam: null,
    note: null,
    otherInfo: null,
    canRepeat: true,
    partnerName: '微軟',
    courseGroupDescription: '雲端系列',
    publishStatusDescription: '已上架',
    certificationCount: 0,
    jobCategoryCount: 0,
    certificationPkids: [],
    jobCategoryPkids: [],
    ...over,
  };
}

describe('CourseList', () => {
  let fixture: ComponentFixture<CourseList>;
  let component: CourseList;
  let serviceSpy: jasmine.SpyObj<CourseService>;

  // Recreated per test — inline-edit saves mutate the row objects.
  let courses: Course[];

  beforeEach(async () => {
    courses = [
      makeCourse(),
      makeCourse({
        pkid: 2,
        title: 'Cisco 網路',
        partnerName: '思科',
        courseGroupPkid: null,
        courseGroupDescription: null,
        canRepeat: false,
        displayOrder: 2,
      }),
    ];

    serviceSpy = jasmine.createSpyObj<CourseService>('CourseService', [
      'query',
      'delete',
      'getById',
      'update',
    ]);
    // p-table sorts the bound array in place — hand out a copy per call.
    serviceSpy.query.and.callFake(() => of([...courses]));
    serviceSpy.delete.and.returnValue(of(void 0));
    // Inline-edit saves re-fetch the full record (N-N pkids) before the PUT.
    serviceSpy.getById.and.callFake((pkid: number) =>
      of(makeCourse({ pkid, certificationPkids: [7], jobCategoryPkids: [2] })),
    );
    serviceSpy.update.and.returnValue(of(void 0));

    const lookupService = jasmine.createSpyObj<LookupService>('LookupService', [
      'getPartners',
      'getCourseGroups',
      'getPublishStatuses',
    ]);
    lookupService.getPartners.and.returnValue(
      of([
        { pkid: 5, name: '微軟' },
        { pkid: 6, name: '思科' },
      ]),
    );
    lookupService.getCourseGroups.and.returnValue(
      of([
        { pkid: 3, description: '雲端系列' },
        { pkid: 4, description: '資安系列' },
      ]),
    );
    lookupService.getPublishStatuses.and.returnValue(of([{ pkid: 1, description: '已上架' }]));

    await TestBed.configureTestingModule({
      imports: [CourseList],
      providers: [
        { provide: CourseService, useValue: serviceSpy },
        { provide: LookupService, useValue: lookupService },
        MessageService,
        ConfirmationService,
        provideRouter([]),
        provideNoopAnimations(),
      ],
    }).compileComponents();

    sessionStorage.clear();
    fixture = TestBed.createComponent(CourseList);
    component = fixture.componentInstance;
    fixture.detectChanges(); // ngOnInit -> lookups -> load()
  });

  it('creates and loads courses after the lookups resolve', () => {
    expect(component).toBeTruthy();
    expect(serviceSpy.query).toHaveBeenCalledTimes(1);
    expect(component['courses']().length).toBe(2);
    expect(component['partnerOptions']().length).toBe(2);
  });

  it('renders FK labels, not raw pkids', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('微軟');
    expect(text).toContain('雲端系列');
    expect(text).toContain('已上架');
  });

  it('renders an em-dash for a course with no course group', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('思科');
    expect(text).toContain('—'); // courses[1].courseGroupDescription is null
  });

  it('serializes date-range filters as YYYY-MM-DD in local time', () => {
    // 2026-03-01 local. toISOString() would yield 2026-02-28 for UTC+8 — the bug this guards.
    component['filters'].scheduleOnFrom = new Date(2026, 2, 1);
    component['applyFilter']();

    const sent = serviceSpy.query.calls.mostRecent().args[0];
    expect(sent.scheduleOnFrom).toBe('2026-03-01');
  });

  it('applyFilter persists the wire form and reloads', () => {
    component['filters'].keyword = 'azure';
    component['applyFilter']();
    expect(sessionStorage.getItem('course-list-filters')).toContain('azure');
    expect(serviceSpy.query).toHaveBeenCalledTimes(2);
  });

  it('restores saved date filters back into Date objects', () => {
    sessionStorage.setItem(
      'course-list-filters',
      JSON.stringify({ scheduleOnFrom: '2026-03-01', keyword: null }),
    );
    const f2 = TestBed.createComponent(CourseList);
    f2.detectChanges();
    const restored = f2.componentInstance['filters'].scheduleOnFrom;
    expect(restored instanceof Date).toBeTrue();
    expect(restored!.getFullYear()).toBe(2026);
    expect(restored!.getMonth()).toBe(2); // March
    expect(restored!.getDate()).toBe(1);
  });

  it('chips show FK labels rather than pkids', () => {
    component['filters'].partnerPkid = 5;
    component['applyFilter']();
    expect(component['appliedFilters']()).toContain({ label: '原廠', value: '微軟' });
  });

  it('tracks the tri-state canRepeat filter', () => {
    component['filters'].canRepeat = false;
    component['applyFilter']();
    expect(component['appliedFilters']()).toContain({ label: '允許重聽', value: '不允許' });
  });

  it('is not marked as filtered before any filter is applied', () => {
    expect(component['isFiltered']()).toBeFalse();
    expect(component['activeFilterCount']()).toBe(0);
  });

  it('clearFilter resets every field and removes saved state', () => {
    component['filters'].keyword = 'azure';
    component['filters'].partnerPkid = 5;
    component['filters'].scheduleOnFrom = new Date(2026, 2, 1);
    component['applyFilter']();
    component['clearFilter']();

    expect(sessionStorage.getItem('course-list-filters')).toBeNull();
    expect(component['filters'].keyword).toBeNull();
    expect(component['filters'].partnerPkid).toBeNull();
    expect(component['filters'].scheduleOnFrom).toBeNull();
    expect(component['isFiltered']()).toBeFalse();
  });

  it('confirmDelete deletes the course when the dialog is accepted', () => {
    const confirmationService = TestBed.inject(ConfirmationService);
    spyOn(confirmationService, 'confirm').and.callFake((c: Confirmation) => {
      c.accept?.();
      return confirmationService;
    });

    component['confirmDelete'](courses[0]);

    expect(serviceSpy.delete).toHaveBeenCalledWith(1);
    expect(serviceSpy.query).toHaveBeenCalledTimes(2); // reload after delete
  });

  it('surfaces the API message when a 409 blocks the delete', () => {
    serviceSpy.delete.and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { message: '該課程仍被 3 筆常見問題 引用，無法刪除。' },
          }),
      ),
    );
    const confirmationService = TestBed.inject(ConfirmationService);
    spyOn(confirmationService, 'confirm').and.callFake((c: Confirmation) => {
      c.accept?.();
      return confirmationService;
    });
    const addSpy = spyOn(TestBed.inject(MessageService), 'add');

    component['confirmDelete'](courses[0]);

    expect(addSpy).toHaveBeenCalled();
    expect(addSpy.calls.mostRecent().args[0].detail).toContain('3 筆常見問題');
  });

  it('goEdit navigates to the edit route', () => {
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');
    component['goEdit'](courses[1]);
    expect(navSpy).toHaveBeenCalledWith(['/courses', 2, 'edit']);
  });

  // ----- in-place cell editing -----
  describe('inline editing', () => {
    // Rows sort by displayOrder asc, so row 0 is pkid 1 ('Azure 系統管理').
    function cell(selector: string): HTMLElement {
      return (fixture.nativeElement as HTMLElement).querySelector(selector)!;
    }

    function editor(selector: string): HTMLInputElement | null {
      return cell(selector).querySelector<HTMLInputElement>('.cell-editor');
    }

    function dblclick(selector: string): void {
      cell(selector).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      fixture.detectChanges();
    }

    function typeAndBlur(input: HTMLInputElement, value: string): void {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new Event('blur'));
      fixture.detectChanges();
    }

    it('double-click enters edit mode; single click does not', async () => {
      cell('td.cell-title').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      fixture.detectChanges();
      expect(component['editingCell']()).toBeNull();
      expect(editor('td.cell-title')).toBeNull();

      dblclick('td.cell-title');
      expect(component['editingCell']()).toEqual({ pkid: 1, field: 'title' });
      expect(editor('td.cell-title')).not.toBeNull();
      await fixture.whenStable(); // ngModel writes the initial value in a microtask
      expect(editor('td.cell-title')!.value).toBe('Azure 系統管理');
    });

    it('the read-only 主代碼 column cannot be edited', () => {
      cell('td.cell-pkid').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      fixture.detectChanges();
      expect(component['editingCell']()).toBeNull();
      expect(cell('td.cell-pkid').querySelector('.cell-editor')).toBeNull();
    });

    it('原廠 / 課程群組 open lookup dropdown editors on double-click', () => {
      dblclick('td.cell-partner');
      expect(component['editingCell']()).toEqual({ pkid: 1, field: 'partnerPkid' });
      expect(cell('td.cell-partner').querySelector('p-select.cell-editor')).not.toBeNull();

      dblclick('td.cell-course-group');
      expect(component['editingCell']()).toEqual({ pkid: 1, field: 'courseGroupPkid' });
      expect(cell('td.cell-course-group').querySelector('p-select.cell-editor')).not.toBeNull();
    });

    it('committing a new 原廠 persists the pkid and refreshes the joined label', () => {
      const row = component['courses']()[0]; // partnerPkid 5 (微軟)
      component['beginEdit'](row, 'partnerPkid');
      component['editValue'] = 6;
      component['commitEdit'](row);

      expect(serviceSpy.update.calls.mostRecent().args[0].partnerPkid).toBe(6);
      expect(row.partnerPkid).toBe(6);
      expect(row.partnerName).toBe('思科');
    });

    it('課程群組 can be cleared to null (nullable FK)', () => {
      const row = component['courses']()[0]; // courseGroupPkid 3 (雲端系列)
      component['beginEdit'](row, 'courseGroupPkid');
      component['editValue'] = null;
      component['commitEdit'](row);

      expect(serviceSpy.update.calls.mostRecent().args[0].courseGroupPkid).toBeNull();
      expect(row.courseGroupPkid).toBeNull();
      expect(row.courseGroupDescription).toBeNull();
      fixture.detectChanges();
      expect(cell('td.cell-course-group').textContent).toContain('—');
    });

    it('原廠 is required — clearing it blocks the save', () => {
      const row = component['courses']()[0];
      component['beginEdit'](row, 'partnerPkid');
      component['editValue'] = null;
      component['commitEdit'](row);

      expect(serviceSpy.update).not.toHaveBeenCalled();
      expect(component['editError']()).toBe('此欄位為必填，不可清空。');
    });

    it('overlay editor blur is ignored while the overlay is open (date picking survives)', () => {
      const row = component['courses']()[0];
      component['beginEdit'](row, 'scheduleOn');
      component['editValue'] = new Date(2026, 2, 1);

      // Picking a date blurs the input first, with the overlay still open — must not commit.
      component['onOverlayEditorBlur'](row, { overlayVisible: true });
      expect(serviceSpy.update).not.toHaveBeenCalled();
      expect(component['editingCell']()).toEqual({ pkid: 1, field: 'scheduleOn' });

      // Once the overlay is closed, blur commits normally.
      component['onOverlayEditorBlur'](row, { overlayVisible: false });
      expect(serviceSpy.update).toHaveBeenCalledTimes(1);
      expect(serviceSpy.update.calls.mostRecent().args[0].scheduleOn).toBe('2026-03-01');
    });

    it('blur persists the edit through getById + update, preserving N-N pkids', () => {
      dblclick('td.cell-title');
      typeAndBlur(editor('td.cell-title')!, '新課程名稱');

      expect(serviceSpy.getById).toHaveBeenCalledWith(1);
      expect(serviceSpy.update).toHaveBeenCalledTimes(1);
      const sent = serviceSpy.update.calls.mostRecent().args[0];
      expect(sent.pkid).toBe(1);
      expect(sent.title).toBe('新課程名稱');
      // Merged from the getById re-fetch — a list-row save must not wipe these.
      expect(sent.certificationPkids).toEqual([7]);
      expect(sent.jobCategoryPkids).toEqual([2]);

      expect(component['editingCell']()).toBeNull();
      expect(cell('td.cell-title').textContent).toContain('新課程名稱');
    });

    it('an unchanged value closes the editor without calling the API', () => {
      dblclick('td.cell-title');
      typeAndBlur(editor('td.cell-title')!, 'Azure 系統管理');

      expect(serviceSpy.getById).not.toHaveBeenCalled();
      expect(serviceSpy.update).not.toHaveBeenCalled();
      expect(component['editingCell']()).toBeNull();
    });

    it('blocks clearing a required field and stays in edit mode with an inline error', () => {
      dblclick('td.cell-title');
      typeAndBlur(editor('td.cell-title')!, '   ');

      expect(serviceSpy.update).not.toHaveBeenCalled();
      expect(component['editingCell']()).toEqual({ pkid: 1, field: 'title' });
      expect(component['editError']()).toBe('此欄位為必填，不可清空。');
      expect(cell('td.cell-title').querySelector('.cell-error')?.textContent).toContain('必填');
      expect(editor('td.cell-title')).not.toBeNull();
    });

    it('blocks a negative number (時數) via the DOM editor', () => {
      dblclick('td.cell-hour');
      typeAndBlur(editor('td.cell-hour')!, '-3');

      expect(serviceSpy.update).not.toHaveBeenCalled();
      expect(component['editError']()).toBe('不可為負數。');
      expect(editor('td.cell-hour')).not.toBeNull();
    });

    it('blocks non-numeric input on numeric fields (定價 / 點數)', () => {
      const row = component['courses']()[0];
      for (const field of ['listPrice', 'learningCredit'] as const) {
        component['beginEdit'](row, field);
        component['editValue'] = null; // what type=number yields for garbage input
        component['commitEdit'](row);
        expect(component['editError']()).withContext(field).toBe('請輸入有效的數字。');
      }
      expect(serviceSpy.update).not.toHaveBeenCalled();
    });

    it('blocks an invalid date', () => {
      const row = component['courses']()[0];
      component['beginEdit'](row, 'scheduleOn');
      component['editValue'] = new Date('invalid');
      component['commitEdit'](row);

      expect(serviceSpy.update).not.toHaveBeenCalled();
      expect(component['editError']()).toBe('請輸入有效的日期。');
      expect(component['editingCell']()).toEqual({ pkid: 1, field: 'scheduleOn' });
    });

    it('blocks 上架日期 later than 下架日期 (and the reverse)', () => {
      const row = component['courses']()[0]; // scheduleOff = 2036-01-01
      component['beginEdit'](row, 'scheduleOn');
      component['editValue'] = new Date(2037, 0, 1);
      component['commitEdit'](row);
      expect(component['editError']()).toBe('上架日期不可晚於下架日期。');

      component['beginEdit'](row, 'scheduleOff'); // scheduleOn = 2026-01-01
      component['editValue'] = new Date(2025, 11, 31);
      component['commitEdit'](row);
      expect(component['editError']()).toBe('上架日期不可晚於下架日期。');

      expect(serviceSpy.update).not.toHaveBeenCalled();
    });

    it('a valid date edit persists as local YYYY-MM-DD', () => {
      const row = component['courses']()[0];
      component['beginEdit'](row, 'scheduleOn');
      // 2026-03-01 local; toISOString() would yield 2026-02-28 for UTC+8.
      component['editValue'] = new Date(2026, 2, 1);
      component['commitEdit'](row);

      expect(serviceSpy.update.calls.mostRecent().args[0].scheduleOn).toBe('2026-03-01');
      expect(row.scheduleOn).toBe('2026-03-01');
    });

    it('reverts the cell and surfaces the error when the save fails', () => {
      serviceSpy.update.and.returnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      const addSpy = spyOn(TestBed.inject(MessageService), 'add');

      dblclick('td.cell-title');
      typeAndBlur(editor('td.cell-title')!, '新課程名稱');

      expect(component['editingCell']()).toBeNull();
      expect(component['courses']()[0].title).toBe('Azure 系統管理');
      expect(cell('td.cell-title').textContent).toContain('Azure 系統管理');
      expect(addSpy.calls.mostRecent().args[0].severity).toBe('error');
      expect(addSpy.calls.mostRecent().args[0].summary).toBe('儲存失敗');
    });
  });
});

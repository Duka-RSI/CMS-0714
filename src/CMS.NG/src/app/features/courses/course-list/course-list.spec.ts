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

  const courses: Course[] = [
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

  beforeEach(async () => {
    serviceSpy = jasmine.createSpyObj<CourseService>('CourseService', ['query', 'delete']);
    // p-table sorts the bound array in place — hand out a copy per call.
    serviceSpy.query.and.callFake(() => of([...courses]));
    serviceSpy.delete.and.returnValue(of(void 0));

    const lookupService = jasmine.createSpyObj<LookupService>('LookupService', [
      'getPartners',
      'getCourseGroups',
      'getPublishStatuses',
    ]);
    lookupService.getPartners.and.returnValue(of([{ pkid: 5, name: '微軟' }]));
    lookupService.getCourseGroups.and.returnValue(of([{ pkid: 3, description: '雲端系列' }]));
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
    expect(component['partnerOptions']().length).toBe(1);
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
});

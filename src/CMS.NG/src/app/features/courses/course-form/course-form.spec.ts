import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { MessageService } from 'primeng/api';

import { CourseForm } from './course-form';
import { CourseService } from '@app/core/services/course.service';
import { LookupService } from '@app/core/services/lookup.service';
import { Course } from '@app/core/models/course.model';

const course: Course = {
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
  certificationCount: 2,
  jobCategoryCount: 1,
  certificationPkids: [10, 11],
  jobCategoryPkids: [7],
};

function setup(routeId: string | null) {
  const service = jasmine.createSpyObj<CourseService>('CourseService', ['getById', 'create', 'update']);
  service.getById.and.returnValue(of(course));
  service.create.and.returnValue(of(course));
  service.update.and.returnValue(of(void 0));

  const lookupService = jasmine.createSpyObj<LookupService>('LookupService', [
    'getPartners',
    'getCourseGroups',
    'getPublishStatuses',
    'getCertifications',
    'getJobCategories',
  ]);
  lookupService.getPartners.and.returnValue(of([{ pkid: 5, name: '微軟' }]));
  lookupService.getCourseGroups.and.returnValue(of([{ pkid: 3, description: '雲端系列' }]));
  lookupService.getPublishStatuses.and.returnValue(of([{ pkid: 1, description: '已上架' }]));
  lookupService.getCertifications.and.returnValue(
    of([
      { pkid: 10, title: 'AZ-104 認證' },
      { pkid: 11, title: null },
    ]),
  );
  lookupService.getJobCategories.and.returnValue(of([{ pkid: 7, description: '系統管理員' }]));

  TestBed.configureTestingModule({
    imports: [CourseForm],
    providers: [
      { provide: CourseService, useValue: service },
      { provide: LookupService, useValue: lookupService },
      MessageService,
      provideRouter([]),
      provideNoopAnimations(),
      // Must come after provideRouter() so this mock wins over the router's ActivatedRoute.
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap(routeId ? { id: routeId } : {}) } },
      },
    ],
  });

  const fixture: ComponentFixture<CourseForm> = TestBed.createComponent(CourseForm);
  const component = fixture.componentInstance;
  fixture.detectChanges(); // ngOnInit
  return { fixture, component, service };
}

function fillRequired(component: CourseForm): void {
  component['form'].patchValue({
    title: '新課程',
    courseId: 'NEW-1',
    prodCourseId: 'P-NEW-1',
    friendlyUrl: 'new-1',
    displayOrder: 9,
    partnerPkid: 5,
    publishStatusPkid: 1,
    scheduleOn: new Date(2026, 2, 1),
    scheduleOff: new Date(2036, 2, 1),
    hour: 21,
    listPrice: 18000,
    learningCredit: 2.5,
  });
}

describe('CourseForm (add mode)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('loads all five lookups and starts in add mode', () => {
    const { component } = setup(null);
    expect(component['isEdit']()).toBeFalse();
    expect(component['partnerOptions']().length).toBe(1);
    expect(component['courseGroupOptions']().length).toBe(1);
    expect(component['publishStatusOptions']().length).toBe(1);
    expect(component['certificationOptions']().length).toBe(2);
    expect(component['jobCategoryOptions']().length).toBe(1);
  });

  it('falls back to the pkid for a certification with a null title', () => {
    const { component } = setup(null);
    expect(component['certificationOptions']()).toEqual([
      { value: 10, label: 'AZ-104 認證' },
      { value: 11, label: '#11' },
    ]);
  });

  it('does not submit an invalid form', () => {
    const { component, service } = setup(null);
    component['save']();
    expect(service.create).not.toHaveBeenCalled();
    expect(component['form'].controls.title.touched).toBeTrue();
  });

  it('does not require courseGroupPkid — the FK is nullable', () => {
    const { component } = setup(null);
    fillRequired(component);
    expect(component['form'].controls.courseGroupPkid.value).toBeNull();
    expect(component['form'].valid).toBeTrue();
  });

  it('submits a null courseGroupPkid rather than 0 when no group is chosen', () => {
    const { component, service } = setup(null);
    fillRequired(component);
    component['save']();

    const arg = service.create.calls.mostRecent().args[0];
    expect(arg.courseGroupPkid).toBeNull();
  });

  it('serializes dates in local time', () => {
    const { component, service } = setup(null);
    fillRequired(component);
    component['save']();

    // 2026-03-01 local; toISOString() would emit 2026-02-28 for UTC+8.
    const arg = service.create.calls.mostRecent().args[0];
    expect(arg.scheduleOn).toBe('2026-03-01');
    expect(arg.scheduleOff).toBe('2036-03-01');
  });

  it('creates the course with pkid 0 as the IDENTITY placeholder', () => {
    const { component, service } = setup(null);
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');

    fillRequired(component);
    component['form'].patchValue({ certificationPkids: [10], jobCategoryPkids: [7] });
    component['save']();

    expect(service.create).toHaveBeenCalledTimes(1);
    const arg = service.create.calls.mostRecent().args[0];
    expect(arg.pkid).toBe(0);
    expect(arg.title).toBe('新課程');
    expect(arg.certificationPkids).toEqual([10]);
    expect(arg.jobCategoryPkids).toEqual([7]);
    expect(navSpy).toHaveBeenCalledWith(['/courses']);
  });
});

describe('CourseForm (edit mode)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('loads the course, patches the form and disables pkid', () => {
    const { component, service } = setup('1');
    expect(service.getById).toHaveBeenCalledWith(1);
    expect(component['isEdit']()).toBeTrue();
    expect(component['form'].controls.title.value).toBe('Azure 系統管理');
    expect(component['form'].controls.pkid.disabled).toBeTrue();
  });

  it('parses the wire dates back into local Date objects', () => {
    const { component } = setup('1');
    const scheduleOn = component['form'].controls.scheduleOn.value!;
    expect(scheduleOn.getFullYear()).toBe(2026);
    expect(scheduleOn.getMonth()).toBe(0); // January
    expect(scheduleOn.getDate()).toBe(1);
  });

  it('round-trips the N-N pkid arrays', () => {
    const { component } = setup('1');
    expect(component['form'].controls.certificationPkids.value).toEqual([10, 11]);
    expect(component['form'].controls.jobCategoryPkids.value).toEqual([7]);
  });

  it('updates the course on save, keeping the disabled pkid in the payload', () => {
    const { component, service } = setup('1');
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');

    component['form'].patchValue({ title: 'Azure 系統管理 (更新)' });
    component['save']();

    expect(service.update).toHaveBeenCalledTimes(1);
    const arg = service.update.calls.mostRecent().args[0];
    expect(arg.pkid).toBe(1);
    expect(arg.title).toBe('Azure 系統管理 (更新)');
    expect(navSpy).toHaveBeenCalledWith(['/courses']);
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { MessageService } from 'primeng/api';

import { CourseDetail } from './course-detail';
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
    objective: '學會 Azure 管理',
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
    ...over,
  };
}

function setup(course: Course) {
  const service = jasmine.createSpyObj<CourseService>('CourseService', ['getById']);
  service.getById.and.returnValue(of(course));

  const lookupService = jasmine.createSpyObj<LookupService>('LookupService', [
    'getCertifications',
    'getJobCategories',
  ]);
  lookupService.getCertifications.and.returnValue(
    of([
      { pkid: 10, title: 'AZ-104 認證' },
      // Certification.Title is nullable — this row exercises the pkid fallback.
      { pkid: 11, title: null },
    ]),
  );
  lookupService.getJobCategories.and.returnValue(of([{ pkid: 7, description: '系統管理員' }]));

  TestBed.configureTestingModule({
    imports: [CourseDetail],
    providers: [
      { provide: CourseService, useValue: service },
      { provide: LookupService, useValue: lookupService },
      MessageService,
      provideRouter([]),
      provideNoopAnimations(),
      // Must come after provideRouter() so this mock wins over the router's ActivatedRoute.
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '1' }) } } },
    ],
  });

  const fixture: ComponentFixture<CourseDetail> = TestBed.createComponent(CourseDetail);
  const component = fixture.componentInstance;
  fixture.detectChanges();
  return { fixture, component, service };
}

describe('CourseDetail', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('loads the course by id from the route', () => {
    const { component, service } = setup(makeCourse());
    expect(service.getById).toHaveBeenCalledWith(1);
    expect(component['course']()?.title).toBe('Azure 系統管理');
  });

  it('renders FK labels', () => {
    const { fixture } = setup(makeCourse());
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('微軟');
    expect(text).toContain('雲端系列');
    expect(text).toContain('已上架');
  });

  it('resolves N-N pkids to labels, falling back to the pkid for a null certification title', () => {
    const { component } = setup(makeCourse());
    expect(component['certificationLabels']()).toEqual(['AZ-104 認證', '#11']);
    expect(component['jobCategoryLabels']()).toEqual(['系統管理員']);
  });

  it('shows an em-dash and no link when the course has no group', () => {
    const { fixture, component } = setup(
      makeCourse({ courseGroupPkid: null, courseGroupDescription: null }),
    );
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('—');
    // goCourseGroup must be inert when there is no group to navigate to.
    component['goCourseGroup']();
    expect(navSpy).not.toHaveBeenCalled();
  });

  it('navigates to each parent detail page', () => {
    const { component } = setup(makeCourse());
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');

    component['goPartner']();
    expect(navSpy).toHaveBeenCalledWith(['/partners', 5]);

    component['goCourseGroup']();
    expect(navSpy).toHaveBeenCalledWith(['/course-groups', 3]);

    component['goPublishStatus']();
    expect(navSpy).toHaveBeenCalledWith(['/publish-statuses', 1]);
  });

  it('mounts the QR code inside the 課程資料 card, wired to this record', () => {
    const { fixture } = setup(makeCourse({ pkid: 42, courseId: 'AZ-104' }));

    const card = (fixture.nativeElement as HTMLElement).querySelector('.card')!;
    expect(card.textContent).toContain('課程資料');

    const qr = card.querySelector('app-course-qr-code');
    expect(qr).withContext('QR must live in the first (課程資料) card').toBeTruthy();
    expect(card.textContent).toContain('QR Code');
  });

  it('goEdit navigates to the edit route', () => {
    const { component } = setup(makeCourse());
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');
    component['goEdit']();
    expect(navSpy).toHaveBeenCalledWith(['/courses', 1, 'edit']);
  });
});

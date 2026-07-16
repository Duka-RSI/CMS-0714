import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { MessageService } from 'primeng/api';

import { CourseGroupForm } from './course-group-form';
import { CourseGroupService } from '@app/core/services/course-group.service';
import { CourseGroup } from '@app/core/models/course-group.model';

const group: CourseGroup = {
  pkid: 1,
  description: '微軟課程',
  courseCount: 12,
  partnerCourseGroupCount: 2,
};

function setup(routeId: string | null) {
  const service = jasmine.createSpyObj<CourseGroupService>('CourseGroupService', [
    'getById',
    'create',
    'update',
  ]);
  service.getById.and.returnValue(of(group));
  service.create.and.returnValue(of(group));
  service.update.and.returnValue(of(void 0));

  TestBed.configureTestingModule({
    imports: [CourseGroupForm],
    providers: [
      { provide: CourseGroupService, useValue: service },
      MessageService,
      provideRouter([]),
      provideNoopAnimations(),
      provideHttpClient(),
      provideHttpClientTesting(),
      // Must come after provideRouter() so this mock wins over the router's ActivatedRoute.
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap(routeId ? { id: routeId } : {}) } },
      },
    ],
  });

  const fixture: ComponentFixture<CourseGroupForm> = TestBed.createComponent(CourseGroupForm);
  const component = fixture.componentInstance;
  fixture.detectChanges(); // ngOnInit
  return { fixture, component, service };
}

// The toolbar must stay pinned (position: sticky) so 儲存/取消 remain reachable on long forms.
function expectStickyToolbar(fixture: ComponentFixture<CourseGroupForm>): void {
  const header = (fixture.nativeElement as HTMLElement).querySelector('.page-header')!;
  const style = getComputedStyle(header);
  expect(style.position).toBe('sticky');
  expect(style.top).toBe('-20px');
  const labels = Array.from(header.querySelectorAll('.actions button')).map(
    (b) => b.textContent?.trim() ?? '',
  );
  expect(labels).toContain('取消');
  expect(labels).toContain('儲存');
}

describe('CourseGroupForm (add mode)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('starts in add mode without loading a record', () => {
    const { component, service } = setup(null);
    expect(component['isEdit']()).toBeFalse();
    expect(service.getById).not.toHaveBeenCalled();
    expect(component['form'].controls.description.value).toBe('');
  });

  it('does not submit an invalid form (description required)', () => {
    const { component, service } = setup(null);
    component['save']();
    expect(service.create).not.toHaveBeenCalled();
    expect(component['form'].controls.description.touched).toBeTrue();
  });

  it('creates the group when the form is valid', () => {
    const { component, service } = setup(null);
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');

    component['form'].patchValue({ description: '思科課程' });
    component['save']();

    expect(service.create).toHaveBeenCalledTimes(1);
    const arg = service.create.calls.mostRecent().args[0];
    expect(arg.description).toBe('思科課程');
    expect(navSpy).toHaveBeenCalledWith(['/course-groups']);
  });

  it('renders a sticky action toolbar with 儲存 and 取消', () => {
    const { fixture } = setup(null);
    expectStickyToolbar(fixture);
  });
});

describe('CourseGroupForm (edit mode)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('loads the group and patches the form', () => {
    const { component, service } = setup('1');
    expect(service.getById).toHaveBeenCalledWith(1);
    expect(component['isEdit']()).toBeTrue();
    expect(component['pkid']()).toBe(1);
    expect(component['form'].controls.description.value).toBe('微軟課程');
  });

  it('updates the group on save, carrying the pkid in the payload', () => {
    const { component, service } = setup('1');
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');

    component['form'].patchValue({ description: '微軟課程（更新）' });
    component['save']();

    expect(service.update).toHaveBeenCalledTimes(1);
    const arg = service.update.calls.mostRecent().args[0];
    expect(arg.pkid).toBe(1);
    expect(arg.description).toBe('微軟課程（更新）');
    expect(navSpy).toHaveBeenCalledWith(['/course-groups']);
  });

  it('renders a sticky action toolbar with 儲存 and 取消', () => {
    const { fixture } = setup('1');
    expectStickyToolbar(fixture);
  });
});

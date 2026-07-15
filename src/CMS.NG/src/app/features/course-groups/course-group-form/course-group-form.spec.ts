import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { MessageService } from 'primeng/api';

import { CourseGroupForm } from './course-group-form';
import { CourseGroupService } from '@app/core/services/course-group.service';
import { CourseGroup } from '@app/core/models/course-group.model';

const courseGroup: CourseGroup = {
  pkid: 2,
  description: '管理類',
};

function setup(routeId: string | null) {
  const service = jasmine.createSpyObj<CourseGroupService>('CourseGroupService', [
    'getById',
    'create',
    'update',
  ]);
  service.getById.and.returnValue(of(courseGroup));
  service.create.and.returnValue(of(courseGroup));
  service.update.and.returnValue(of(void 0));

  TestBed.configureTestingModule({
    imports: [CourseGroupForm],
    providers: [
      { provide: CourseGroupService, useValue: service },
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

  const fixture: ComponentFixture<CourseGroupForm> = TestBed.createComponent(CourseGroupForm);
  const component = fixture.componentInstance;
  fixture.detectChanges(); // ngOnInit
  return { fixture, component, service };
}

describe('CourseGroupForm (add mode)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('starts in add mode', () => {
    const { component } = setup(null);
    expect(component['isEdit']()).toBeFalse();
  });

  it('does not submit an invalid form', () => {
    const { component, service } = setup(null);
    component['save']();
    expect(service.create).not.toHaveBeenCalled();
    expect(component['form'].controls.description.touched).toBeTrue();
  });

  it('creates the course group when the form is valid', () => {
    const { component, service } = setup(null);
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');

    component['form'].patchValue({ description: '設計類' });
    component['save']();

    expect(service.create).toHaveBeenCalledTimes(1);
    const arg = service.create.calls.mostRecent().args[0];
    expect(arg.description).toBe('設計類');
    expect(arg.pkid).toBe(0); // IDENTITY placeholder in add mode
    expect(navSpy).toHaveBeenCalledWith(['/course-groups']);
  });
});

describe('CourseGroupForm (edit mode)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('loads the course group, patches the form and disables pkid', () => {
    const { component, service } = setup('2');
    expect(service.getById).toHaveBeenCalledWith(2);
    expect(component['isEdit']()).toBeTrue();
    expect(component['form'].controls.description.value).toBe('管理類');
    expect(component['form'].controls.pkid.disabled).toBeTrue();
  });

  it('updates the course group on save, keeping the disabled pkid in the payload', () => {
    const { component, service } = setup('2');
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');

    component['form'].patchValue({ description: '管理類 (edited)' });
    component['save']();

    expect(service.update).toHaveBeenCalledTimes(1);
    const arg = service.update.calls.mostRecent().args[0];
    expect(arg.pkid).toBe(2);
    expect(arg.description).toBe('管理類 (edited)');
    expect(navSpy).toHaveBeenCalledWith(['/course-groups']);
  });
});

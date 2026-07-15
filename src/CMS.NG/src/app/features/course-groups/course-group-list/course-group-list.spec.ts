import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';
import { MessageService, ConfirmationService, Confirmation } from 'primeng/api';

import { CourseGroupList } from './course-group-list';
import { CourseGroupService } from '@app/core/services/course-group.service';
import { CourseGroup } from '@app/core/models/course-group.model';

describe('CourseGroupList', () => {
  let fixture: ComponentFixture<CourseGroupList>;
  let component: CourseGroupList;
  let serviceSpy: jasmine.SpyObj<CourseGroupService>;

  const courseGroups: CourseGroup[] = [
    { pkid: 1, description: '資訊類' },
    { pkid: 2, description: '管理類' },
  ];

  beforeEach(async () => {
    serviceSpy = jasmine.createSpyObj<CourseGroupService>('CourseGroupService', ['query', 'delete']);
    // Return a fresh array copy each call so in-place table sorting can't mutate the fixture.
    serviceSpy.query.and.returnValue(of([...courseGroups]));
    serviceSpy.delete.and.returnValue(of(void 0));

    await TestBed.configureTestingModule({
      imports: [CourseGroupList],
      providers: [
        { provide: CourseGroupService, useValue: serviceSpy },
        MessageService,
        ConfirmationService,
        provideRouter([]),
        provideNoopAnimations(),
      ],
    }).compileComponents();

    sessionStorage.clear();
    fixture = TestBed.createComponent(CourseGroupList);
    component = fixture.componentInstance;
    fixture.detectChanges(); // runs ngOnInit -> load()
  });

  it('creates and loads course groups on init', () => {
    expect(component).toBeTruthy();
    expect(serviceSpy.query).toHaveBeenCalledTimes(1);
    expect(component['courseGroups']().length).toBe(2);
  });

  it('renders one row per course group', () => {
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('管理類');
  });

  it('applyFilter persists filters to sessionStorage and reloads', () => {
    component['filters'] = { keyword: '資訊' };
    component['applyFilter']();
    expect(sessionStorage.getItem('course-group-list-filters')).toContain('資訊');
    expect(serviceSpy.query).toHaveBeenCalledTimes(2);
  });

  it('clearFilter resets filters and removes saved state', () => {
    component['filters'] = { keyword: '資訊' };
    sessionStorage.setItem('course-group-list-filters', JSON.stringify(component['filters']));
    component['clearFilter']();
    expect(sessionStorage.getItem('course-group-list-filters')).toBeNull();
    expect(component['filters'].keyword).toBeNull();
  });

  it('is not marked as filtered before any filter is applied', () => {
    expect(component['isFiltered']()).toBeFalse();
    expect(component['activeFilterCount']()).toBe(0);
  });

  it('highlights as filtered and lists the applied chip after applyFilter', () => {
    component['filters'] = { keyword: '資訊' };
    component['applyFilter']();
    expect(component['isFiltered']()).toBeTrue();
    expect(component['activeFilterCount']()).toBe(1);
    expect(component['appliedFilters']()).toEqual([{ label: '關鍵字', value: '資訊' }]);
  });

  it('confirmDelete deletes the course group when the dialog is accepted', () => {
    const confirmationService = TestBed.inject(ConfirmationService);
    spyOn(confirmationService, 'confirm').and.callFake((c: Confirmation) => {
      c.accept?.();
      return confirmationService;
    });

    component['confirmDelete'](courseGroups[0]);

    expect(serviceSpy.delete).toHaveBeenCalledWith(1);
    expect(serviceSpy.query).toHaveBeenCalledTimes(2); // reload after delete
  });

  it('goEdit navigates to the edit route', () => {
    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');
    component['goEdit'](courseGroups[1]);
    expect(navSpy).toHaveBeenCalledWith(['/course-groups', 2, 'edit']);
  });
});
